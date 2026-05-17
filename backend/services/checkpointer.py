"""Persistent checkpointer — wraps MemorySaver with sqlite3 persistence.

Uses Python stdlib sqlite3 (no external dependencies). On each checkpoint write,
data is saved to both MemorySaver (in-memory) and a local sqlite DB. On startup,
checkpoints are restored from the DB into memory.
"""

from __future__ import annotations

import json
import sqlite3
import time
from pathlib import Path

from langgraph.checkpoint.memory import MemorySaver

_DB_DIR = Path(__file__).resolve().parent.parent / ".config"
_DB_PATH = _DB_DIR / "checkpoints.db"
_DB_DIR.mkdir(parents=True, exist_ok=True)

_CHECKPOINTER: MemorySaver | None = None


def _get_db() -> sqlite3.Connection:
    """Return a thread-safe sqlite connection with WAL mode."""
    conn = sqlite3.connect(str(_DB_PATH), check_same_thread=False)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA synchronous=NORMAL")
    conn.row_factory = sqlite3.Row
    return conn


def _init_db(conn: sqlite3.Connection) -> None:
    # Check if table exists with old schema → recreate
    cur = conn.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='checkpoints'")
    exists = cur.fetchone()
    if exists:
        # Verify schema has the columns we need
        cols = [r[1] for r in conn.execute("PRAGMA table_info(checkpoints)").fetchall()]
        if "checkpoint_type" not in cols:
            conn.execute("DROP TABLE checkpoints")
            exists = False
    if not exists:
        conn.executescript("""
            CREATE TABLE checkpoints (
                thread_id TEXT NOT NULL,
                checkpoint_ns TEXT NOT NULL DEFAULT '',
                checkpoint_id TEXT NOT NULL,
                parent_id TEXT,
                checkpoint_type TEXT NOT NULL DEFAULT '',
                checkpoint_data BLOB NOT NULL DEFAULT x'',
                metadata_type TEXT NOT NULL DEFAULT '',
                metadata_data BLOB NOT NULL DEFAULT x'',
                created_at REAL NOT NULL,
                PRIMARY KEY (thread_id, checkpoint_ns, checkpoint_id)
            );
            CREATE INDEX idx_checkpoints_thread
                ON checkpoints(thread_id, created_at);

            CREATE TABLE blobs (
                thread_id TEXT NOT NULL,
                checkpoint_ns TEXT NOT NULL DEFAULT '',
                channel TEXT NOT NULL,
                version TEXT NOT NULL,
                blob_type TEXT NOT NULL DEFAULT '',
                blob_data BLOB NOT NULL DEFAULT x'',
                PRIMARY KEY (thread_id, checkpoint_ns, channel, version)
            );
        """)


def _serialize_typed(serde, obj: dict) -> tuple[str, bytes]:
    """Serialize an object to (type_name, bytes) using the serde."""
    type_name, data = serde.dumps_typed(obj)
    return type_name, data if isinstance(data, bytes) else data.encode()


def _deserialize_typed(serde, type_name: str, data: bytes | str) -> dict:
    """Deserialize a (type_name, bytes) pair back to an object."""
    d = data if isinstance(data, bytes) else data.encode()
    return serde.loads_typed((type_name, d))


def get_checkpointer() -> MemorySaver:
    """Return the shared persistent checkpointer singleton."""
    global _CHECKPOINTER
    if _CHECKPOINTER is None:
        _CHECKPOINTER = PersistentMemorySaver()
    return _CHECKPOINTER


class PersistentMemorySaver(MemorySaver):
    """MemorySaver that also persists checkpoints to sqlite3."""

    def __init__(self) -> None:
        super().__init__()
        self._conn = _get_db()
        _init_db(self._conn)
        self._restore()

    def _restore(self) -> None:
        """Load all checkpoints and blobs from sqlite back into memory."""
        # Restore checkpoints
        try:
            rows = self._conn.execute(
                "SELECT thread_id, checkpoint_ns, checkpoint_id, parent_id, "
                "       checkpoint_type, checkpoint_data, "
                "       metadata_type, metadata_data "
                "FROM checkpoints ORDER BY created_at ASC"
            ).fetchall()
        except sqlite3.OperationalError:
            return

        for row in rows:
            self.storage[row["thread_id"]][row["checkpoint_ns"]][row["checkpoint_id"]] = (
                (row["checkpoint_type"], row["checkpoint_data"]),
                (row["metadata_type"], row["metadata_data"]),
                row["parent_id"],
            )

        # Restore blobs (channel values)
        try:
            blob_rows = self._conn.execute(
                "SELECT thread_id, checkpoint_ns, channel, version, blob_type, blob_data "
                "FROM blobs"
            ).fetchall()
        except sqlite3.OperationalError:
            return

        for row in blob_rows:
            key = (row["thread_id"], row["checkpoint_ns"], row["channel"], row["version"])
            self.blobs[key] = (row["blob_type"], row["blob_data"])

    def put(self, config, checkpoint, metadata, new_versions):
        """Save checkpoint to memory AND sqlite."""
        result = super().put(config, checkpoint, metadata, new_versions)

        thread_id = config["configurable"]["thread_id"]
        checkpoint_ns = config["configurable"].get("checkpoint_ns", "")
        cp_id = checkpoint["id"]
        parent_id = config["configurable"].get("checkpoint_id")

        try:
            # Persist checkpoint data
            c_copy = checkpoint.copy()
            cp_type, cp_data = self.serde.dumps_typed(c_copy)
            meta_type, meta_data = self.serde.dumps_typed(metadata)
            cp_data = cp_data if isinstance(cp_data, bytes) else cp_data.encode()
            meta_data = meta_data if isinstance(meta_data, bytes) else meta_data.encode()

            self._conn.execute(
                "INSERT OR REPLACE INTO checkpoints "
                "(thread_id, checkpoint_ns, checkpoint_id, parent_id, "
                " checkpoint_type, checkpoint_data, metadata_type, metadata_data, created_at) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (thread_id, checkpoint_ns, cp_id, parent_id,
                 cp_type, cp_data, meta_type, meta_data, time.time()),
            )

            # Persist blobs (channel values stored separately by MemorySaver)
            for (t_id, ns, channel, version), blob in self.blobs.items():
                if t_id == thread_id and ns == checkpoint_ns:
                    b_type, b_data = blob
                    b_data = b_data if isinstance(b_data, bytes) else b_data.encode()
                    self._conn.execute(
                        "INSERT OR REPLACE INTO blobs "
                        "(thread_id, checkpoint_ns, channel, version, blob_type, blob_data) "
                        "VALUES (?, ?, ?, ?, ?, ?)",
                        (t_id, ns, channel, version, b_type, b_data),
                    )

            self._conn.commit()
        except sqlite3.OperationalError as e:
            print(f"[PersistentMemorySaver] DB write error: {e}")

        return result

"""Migrate old JSON thread data into the checkpointer (sqlite).

Run once after enabling the persistent checkpointer to ensure existing
threads also have checkpoint entries.  Old JSON files are preserved as
a fallback.

Usage:
    python3 scripts/migrate.py
"""

from __future__ import annotations

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from services.threads import list_threads, get_history
from core.agent import get_agent


def migrate():
    agent = get_agent()
    threads = list_threads()
    migrated = 0
    skipped = 0

    print(f"Found {len(threads)} threads in JSON storage.")

    for t in threads:
        tid = t["thread_id"]
        config = {"configurable": {"thread_id": tid}}

        # Check if already in checkpointer
        existing = list(agent.get_state_history(config))
        if existing:
            skipped += 1
            continue

        # Load messages from JSON
        messages = get_history(tid)
        if not messages:
            skipped += 1
            continue

        # Create checkpoint entry via update_state
        try:
            agent.update_state(config, {"messages": messages})
            print(f"  ✓ {tid[:12]} ({len(messages)} messages)")
            migrated += 1
        except Exception as e:
            print(f"  ✗ {tid[:12]}: {e}")

    print(f"\nDone: {migrated} migrated, {skipped} skipped (already in checkpointer).")


if __name__ == "__main__":
    migrate()

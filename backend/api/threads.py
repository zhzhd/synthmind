"""Thread / conversation history endpoints."""

import subprocess
import sys
import uuid

from fastapi import APIRouter, HTTPException

from pydantic import BaseModel

from services.threads import get_history, list_threads, get_workdir, set_workdir, add_messages
from core.agent import get_agent


class WorkdirRequest(BaseModel):
    workdir: str

router = APIRouter()


def _messages_from_checkpointer(thread_id: str) -> list[dict] | None:
    """Try to extract message history from the checkpointer.

    Returns None if the thread has no checkpoints (JSON fallback).
    """
    try:
        agent = get_agent()
        config = {"configurable": {"thread_id": thread_id}}
        history = list(agent.get_state_history(config))
        if not history:
            return None
        # Get the most recent checkpoint (full state)
        latest = history[-1]  # oldest = most complete
        # Try the newest first that has parent
        for h in reversed(history):
            msgs = h.values.get("messages", [])
            if msgs:
                return msgs
        return None
    except Exception:
        return None


@router.post("/api/threads")
async def create_empty_thread():
    """Create a new empty thread and return its ID."""
    thread_id = uuid.uuid4().hex[:12]
    add_messages(thread_id, [])
    return {"thread_id": thread_id, "message_count": 0, "preview": "New conversation"}


@router.post("/api/pick-folder")
async def pick_folder():
    """Open a native folder picker dialog and return the selected path.

    Uses platform-specific commands to show the OS folder picker.
    """
    try:
        if sys.platform == "darwin":
            # macOS — AppleScript choose folder
            result = subprocess.run(
                ["osascript", "-e", 'POSIX path of (choose folder)'],
                capture_output=True, text=True, timeout=30,
            )
            if result.returncode == 0:
                path = result.stdout.strip()
                if path:
                    return {"path": path.rstrip("/")}
        elif sys.platform == "win32":
            # Windows — PowerShell folder browser
            ps_script = """
Add-Type -AssemblyName System.Windows.Forms
$browser = New-Object System.Windows.Forms.FolderBrowserDialog
$browser.Description = "Select working directory"
$result = $browser.ShowDialog()
if ($result -eq [System.Windows.Forms.DialogResult]::OK) {
    Write-Output $browser.SelectedPath
}
"""
            result = subprocess.run(
                ["powershell", "-NoProfile", "-Command", ps_script],
                capture_output=True, text=True, timeout=30,
            )
            if result.returncode == 0:
                path = result.stdout.strip()
                if path:
                    return {"path": path}
        else:
            # Linux — try zenity or kdialog
            for cmd in [["zenity", "--file-selection", "--directory"], ["kdialog", "--getexistingdirectory"]]:
                try:
                    result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
                    if result.returncode == 0:
                        path = result.stdout.strip()
                        if path:
                            return {"path": path}
                except FileNotFoundError:
                    continue
    except (subprocess.TimeoutExpired, FileNotFoundError, OSError):
        pass
    raise HTTPException(500, "Folder picker not available on this platform")


@router.get("/api/threads")
async def list_all_threads():
    """Return all available threads with metadata (newest first)."""
    threads = list_threads()
    return {"threads": threads}


@router.get("/api/threads/{thread_id}/workdir")
async def get_thread_workdir(thread_id: str):
    """Return the thread's working directory (or null)."""
    wd = get_workdir(thread_id)
    return {"thread_id": thread_id, "workdir": wd}


@router.put("/api/threads/{thread_id}/workdir")
async def update_thread_workdir(thread_id: str, req: WorkdirRequest):
    """Set the thread's working directory."""
    set_workdir(thread_id, req.workdir)
    return {"thread_id": thread_id, "workdir": req.workdir}


@router.get("/api/threads/{thread_id}")
async def get_thread(thread_id: str):
    """Return the message history for a thread.

    Reads from checkpointer first (full message data), falls back to JSON
    for threads created before checkpointer was enabled.
    """
    msgs = _messages_from_checkpointer(thread_id)
    if msgs is not None:
        return {"thread_id": thread_id, "messages": msgs, "source": "checkpointer"}

    # Fall back to JSON and migrate to checkpointer (lazy migration)
    history = get_history(thread_id)
    if history:
        try:
            agent = get_agent()
            agent.update_state(
                {"configurable": {"thread_id": thread_id}},
                {"messages": history},
            )
        except Exception:
            pass  # Migration failure is non-critical
    return {"thread_id": thread_id, "messages": history, "source": "json"}

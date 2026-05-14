"""Thread / conversation history endpoints."""

import subprocess
import sys

from fastapi import APIRouter, HTTPException

from pydantic import BaseModel

from services.threads import get_history, list_threads, get_workdir, set_workdir


class WorkdirRequest(BaseModel):
    workdir: str

router = APIRouter()


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
    """Return the message history for a thread."""
    history = get_history(thread_id)
    return {"thread_id": thread_id, "messages": history}

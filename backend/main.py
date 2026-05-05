"""SynthMind Backend — entry point."""

from __future__ import annotations

import os
import sys
from pathlib import Path

from dotenv import load_dotenv

# Load .env before anything else
for p in [Path(__file__).parent / ".env", Path.cwd() / ".env"]:
    if p.exists():
        load_dotenv(p)
        break
else:
    load_dotenv()

from api.server import app

HOST = os.getenv("HOST", "127.0.0.1")
PORT = int(os.getenv("PORT", "8000"))


def main():
    import uvicorn
    if getattr(sys, "frozen", False):
        uvicorn.run(app, host=HOST, port=PORT, reload=False, log_level="info")
    else:
        uvicorn.run("main:app", host=HOST, port=PORT, reload=True, log_level="info")


if __name__ == "__main__":
    main()

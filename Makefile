.PHONY: backend frontend tauri-dev tauri-build build-all install clean

SHELL := /bin/bash

# ── Backend ────────────────────────────────────────────

backend:
	cd backend && python3 -m uvicorn main:app --reload --host 127.0.0.1 --port 8000

# If you installed Python via Homebrew, use python3.XX instead:
# backend:
# 	cd backend && python3.12 -m uvicorn main:app --reload --host 127.0.0.1 --port 8000

# Auto-kill lingering dev servers before starting new ones
kill-ports:
	@lsof -ti:8000 2>/dev/null | xargs kill -9 2>/dev/null; echo "  Port 8000 cleared"
	@lsof -ti:5173 2>/dev/null | xargs kill -9 2>/dev/null; echo "  Port 5173 cleared"

backend-install:
	cd backend && pip install -r requirements.txt --break-system-packages

backend-build:
	cd backend && python build_backend.py

# ── Frontend ────────────────────────────────────────────

frontend: kill-ports
	cd frontend && npm run dev

frontend-install:
	cd frontend && npm install

dev-sidecar:
	bash frontend/scripts/create-dev-sidecar.sh

# ── Development (separate terminals) ────────────────────

dev: backend-install frontend-install dev-sidecar
	@echo ""
	@echo "  Run in separate terminals:"
	@echo "    make backend    # Terminal 1 — FastAPI"
	@echo "    make frontend   # Terminal 2 — Vite dev server"
	@echo ""
	@echo "  Or with Tauri desktop window:"
	@echo "    make tauri-dev  # Terminal 1 still needs 'make backend'"
	@echo ""

# ── Tauri desktop (backend runs separately) ─────────────

tauri-dev: kill-ports dev-sidecar
	cd frontend && npm run tauri dev

tauri-build:
	cd frontend && npm run tauri build

# ── Full build (single distributable) ───────────────────

# 1. Compile backend into a standalone binary
# 2. Copy it into src-tauri/binaries/ with the correct name
# 3. Build the Tauri desktop app (which bundles both)
build-all: backend-build
	cd frontend && npm run tauri build
	@echo ""
	@echo "🎉 SynthMind single-package build complete!"
	@echo "   Find the installer in: frontend/src-tauri/target/release/bundle/"

# ── Utility ─────────────────────────────────────────────

clean:
	rm -rf backend/__pycache__ backend/**/__pycache__
	rm -rf backend/dist backend/build backend/*.spec
	rm -rf frontend/dist frontend/src-tauri/target
	rm -rf frontend/src-tauri/binaries
	rm -rf .venv node_modules

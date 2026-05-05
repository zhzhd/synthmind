"""Build the SynthMind backend as a standalone executable with PyInstaller,
then place it in the Tauri sidecar directory.

Usage:
    python build_backend.py                    # auto-detect target triple
    python build_backend.py --target x86_64-unknown-linux-gnu  # force target
    python build_backend.py --clean            # clean build artifacts

Requires: pip install pyinstaller
"""

from __future__ import annotations

import argparse
import os
import platform
import shutil
import subprocess
import sys
from pathlib import Path

# ── Paths ──────────────────────────────────────────────────────────
REPO_ROOT = Path(__file__).resolve().parent
BACKEND_DIR = REPO_ROOT
SIDECAR_DIR = (
    REPO_ROOT.parent / "frontend" / "src-tauri" / "binaries"
)

# Maps sys.platform + machine → Tauri target triple
# https://doc.rust-lang.org/nightly/rustc/platform-support.html
TARGET_TRIPLES: dict[str, str] = {
    ("linux", "x86_64"): "x86_64-unknown-linux-gnu",
    ("linux", "aarch64"): "aarch64-unknown-linux-gnu",
    ("darwin", "x86_64"): "x86_64-apple-darwin",
    ("darwin", "arm64"): "aarch64-apple-darwin",
    ("win32", "AMD64"): "x86_64-pc-windows-msvc",
    ("win32", "ARM64"): "aarch64-pc-windows-msvc",
}


def detect_target() -> str:
    key = (sys.platform, platform.machine())
    triple = TARGET_TRIPLES.get(key)
    if not triple:
        raise RuntimeError(
            f"Unsupported platform: {sys.platform}/{platform.machine()}. "
            f"Supported: {list(TARGET_TRIPLES.values())}"
        )
    return triple


# ── Hidden imports detected by PyInstaller ──────────────────────────
# These are dynamically imported by langchain/langgraph so PyInstaller
# doesn't pick them up automatically. List them explicitly.
HIDDEN_IMPORTS = [
    "langchain_anthropic",
    "langchain_openai",
    "langchain_ollama",
    "langchain_community.tools.ddg_search",
    "langgraph",
    "dotenv",
    "uvicorn",
    "uvicorn.logging",
    "uvicorn.loops",
    "uvicorn.lifespan",
    "uvicorn.protocols",
    "websockets",
    "httpx",
]

# Large modules we know we don't need — speeds up build & shrinks binary
EXCLUDES = [
    "tkinter",
    "matplotlib",
    "numpy",
    "pandas",
    "PIL",
    "Crypto",
    "cryptography",
    "scipy",
    "torch",
    "tensorflow",
]


def build_backend(target: str | None = None, clean: bool = False) -> Path:
    """Run PyInstaller and return the path to the compiled binary."""
    if target is None:
        target = detect_target()

    ext = ".exe" if "windows" in target else ""
    binary_name = f"synthmind-backend{ext}"
    sidecar_name = f"synthmind-backend-{target}{ext}"
    dist_dir = BACKEND_DIR / "dist"
    spec_path = BACKEND_DIR / "synthmind-backend.spec"

    # ── Clean ──
    if clean and dist_dir.exists():
        shutil.rmtree(dist_dir)
    if clean and spec_path.exists():
        spec_path.unlink()

    # ── Build with PyInstaller ──
    cmd = [
        sys.executable, "-m", "PyInstaller",
        "--onefile",
        "--name", "synthmind-backend",
        "--distpath", str(dist_dir),
        "--add-data", f"agent{os.pathsep}agent",
    ]
    for mod in HIDDEN_IMPORTS:
        cmd += ["--hidden-import", mod]
    for mod in EXCLUDES:
        cmd += ["--exclude-module", mod]

    cmd.append(str(BACKEND_DIR / "main.py"))

    print(f"🚀 Building backend for target: {target}")
    print(f"   Command: {' '.join(cmd)}")
    subprocess.check_call(cmd)

    # ── Verify binary exists ──
    binary_path = dist_dir / binary_name
    if not binary_path.exists():
        raise RuntimeError(f"Expected binary not found: {binary_path}")

    # ── Copy to Tauri sidecar directory ──
    SIDECAR_DIR.mkdir(parents=True, exist_ok=True)
    dest = SIDECAR_DIR / sidecar_name
    shutil.copy2(binary_path, dest)

    # Make executable (especially important on Linux/macOS)
    if os.name != "nt":
        dest.chmod(0o755)

    # ── Report ──
    size_mb = dest.stat().st_size / (1024 * 1024)
    print(f"✅ Sidecar binary created: {dest}")
    print(f"   Size: {size_mb:.1f} MB")

    return dest


def main():
    parser = argparse.ArgumentParser(description="Build SynthMind backend sidecar")
    parser.add_argument("--target", help="Force a specific target triple")
    parser.add_argument("--clean", action="store_true", help="Clean build artifacts")
    args = parser.parse_args()

    build_backend(target=args.target, clean=args.clean)


if __name__ == "__main__":
    main()

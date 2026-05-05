#!/bin/bash
# Create a dev-mode placeholder for the backend sidecar binary.
#
# Tauri's build script checks that every binary in `externalBin` exists
# at build time.  In development we don't have the PyInstaller-compiled
# binary yet, so we create a tiny shell script as a stand-in.
#
# The real backend runs separately via `make backend`.  The placeholder
# just sleeps — Tauri spawns it, it does nothing, and the frontend
# connects to the actual backend at 127.0.0.1:8000.
#
# For production, run `make backend-build` which overwrites this
# placeholder with the real PyInstaller binary.

set -euo pipefail

# Resolve paths relative to this script's location
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SIDECAR_DIR="$SCRIPT_DIR/../src-tauri/binaries"
mkdir -p "$SIDECAR_DIR"
SIDECAR_DIR="$(cd "$SIDECAR_DIR" && pwd)"

detect_target() {
    local os arch
    os="$(uname -s)"
    arch="$(uname -m)"

    case "$os" in
        Linux)
            case "$arch" in
                x86_64)  echo "x86_64-unknown-linux-gnu" ;;
                aarch64) echo "aarch64-unknown-linux-gnu" ;;
                *)       echo "unknown-unknown-linux-gnu" ;;
            esac
            ;;
        Darwin)
            case "$arch" in
                x86_64)  echo "x86_64-apple-darwin" ;;
                arm64)   echo "aarch64-apple-darwin" ;;
                *)       echo "unknown-apple-darwin" ;;
            esac
            ;;
        MINGW*|MSYS*|CYGWIN*)
            case "$arch" in
                x86_64)  echo "x86_64-pc-windows-msvc" ;;
                arm64)   echo "aarch64-pc-windows-msvc" ;;
                *)       echo "unknown-pc-windows-msvc" ;;
            esac
            ;;
        *)
            echo "unknown-unknown"
            ;;
    esac
}

TARGET=$(detect_target)
PLACEHOLDER="$SIDECAR_DIR/synthmind-backend-$TARGET"

# If a real binary already exists (not a shell script), don't overwrite
if [ -f "$PLACEHOLDER" ]; then
    file_type=$(file "$PLACEHOLDER" 2>/dev/null || echo "unknown")
    if ! echo "$file_type" | grep -q "shell script"; then
        echo "✅ Real sidecar binary exists — not overwriting"
        exit 0
    fi
fi

cat > "$PLACEHOLDER" << 'SCRIPT'
#!/bin/bash
# Dev placeholder for SynthMind backend.
# The actual backend runs separately via `make backend`.
# This script keeps the sidecar alive until the Tauri app exits.
while true; do
    sleep 1
done
SCRIPT

chmod +x "$PLACEHOLDER"
echo "✅ Dev placeholder created: synthmind-backend-$TARGET"

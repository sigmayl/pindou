#!/usr/bin/env bash
# Download the two Pixelization weights required by the backend.
# The optional 533 MB VGG checkpoint is not needed by this project.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEST="${MODEL_WEIGHTS_DIR:-$ROOT/backend/weights}"
ENDPOINT="${HF_ENDPOINT:-https://huggingface.co}"
REPO="ashleykleynhans/pixelization"
mkdir -p "$DEST"

fetch() {
  local name="$1" expected="$2"
  local target="$DEST/$name"
  if [[ -f "$target" ]]; then
    local actual
    if command -v sha256sum >/dev/null 2>&1; then
      actual="$(sha256sum "$target" | awk '{print $1}')"
    else
      actual="$(shasum -a 256 "$target" | awk '{print $1}')"
    fi
    if [[ "$actual" == "$expected" ]]; then
      echo "✓ $name already present"
      return
    fi
    echo "Checksum mismatch for $name; re-downloading."
  fi
  echo "Downloading $name ..."
  curl -fL --retry 3 --retry-delay 2 \
    -o "$target.part" \
    "$ENDPOINT/$REPO/resolve/main/$name"
  mv "$target.part" "$target"
  local actual
  if command -v sha256sum >/dev/null 2>&1; then
    actual="$(sha256sum "$target" | awk '{print $1}')"
  else
    actual="$(shasum -a 256 "$target" | awk '{print $1}')"
  fi
  if [[ "$actual" != "$expected" ]]; then
    echo "Checksum verification failed for $name" >&2
    echo "expected: $expected" >&2
    echo "actual:   $actual" >&2
    exit 1
  fi
  echo "✓ $name"
}

fetch "160_net_G_A.pth" "0856b831c7eca0e594ca4c037e01497d453b795dfdab040e2a9ed2bcea1168d3"
fetch "alias_net.pth" "3d273c7cc02ce2e14f8840ad3375942bffe942ac7a92f68dddabe523fbd7ee81"

echo "Weights ready in $DEST"

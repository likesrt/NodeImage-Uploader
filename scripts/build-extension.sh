#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR=$(cd "$(dirname "$0")/.." && pwd)
OUT_DIR="$ROOT_DIR/dist/extension"

rm -rf "$ROOT_DIR/dist"
mkdir -p "$OUT_DIR"

# 拷贝扩展源文件
rsync -a --exclude modules "$ROOT_DIR/chrome-extension/" "$OUT_DIR/"

# 拷贝根模块与静态资源
mkdir -p "$OUT_DIR/modules" "$OUT_DIR/static"
rsync -a "$ROOT_DIR/modules/" "$OUT_DIR/modules/"
rsync -a "$ROOT_DIR/static/" "$OUT_DIR/static/"

echo "Pack extension to zip"
(cd "$OUT_DIR" && zip -qr ../nodeimage-extension.zip .)

echo "Try pack CRX (using ephemeral key if EXTENSION_PEM not provided)"
KEY_DIR="$ROOT_DIR/dist/certs"
mkdir -p "$KEY_DIR"
if [ -n "${EXTENSION_PEM:-}" ]; then
  echo "$EXTENSION_PEM" | sed 's/\r$//' > "$KEY_DIR/key.pem"
else
  openssl genrsa -out "$KEY_DIR/key.pem" 2048 >/dev/null 2>&1
fi

if command -v npx >/dev/null 2>&1; then
  npx --yes crx3 --key "$KEY_DIR/key.pem" --crx "$ROOT_DIR/dist/nodeimage-extension.crx" "$OUT_DIR" || echo "crx3 pack skipped"
else
  echo "npx not found, skip crx"
fi

echo "Done. Output in dist/"

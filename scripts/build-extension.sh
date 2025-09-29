#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR=$(cd "$(dirname "$0")/.." && pwd)
SRC_DIR="$ROOT_DIR/chrome-extension"
DIST_DIR="$ROOT_DIR/dist"
OUT_DIR="$DIST_DIR/extension"

# 仅构建 ZIP 包（已移除 CRX 打包逻辑）
ZIP_NAME=${ZIP_NAME:-chrome-nodeimage-extension.zip}

copy_dir() {
  local src="$1" dst="$2"
  mkdir -p "$dst"
  if command -v rsync >/dev/null 2>&1; then
    rsync -a "$src" "$dst/"
  else
    cp -R "$src" "$dst/"
  fi
}

###
# 清理 dist 输出目录
###
rm -rf "$DIST_DIR"
mkdir -p "$OUT_DIR"

# 复制扩展源（排除 modules，使用根 modules 作为单一来源）
if command -v rsync >/dev/null 2>&1; then
  rsync -a --exclude modules "$SRC_DIR/" "$OUT_DIR/"
else
  # 简易降级替代
  cp -R "$SRC_DIR"/* "$OUT_DIR"/
  rm -rf "$OUT_DIR/modules" || true
fi

# 复制根 modules 与 static 资源
mkdir -p "$OUT_DIR/modules" "$OUT_DIR/static"
copy_dir "$ROOT_DIR/modules/" "$OUT_DIR/modules"
[ -d "$ROOT_DIR/static" ] && copy_dir "$ROOT_DIR/static/" "$OUT_DIR/static" || true

# 规范化目录结构：防止出现 dist/extension/modules/modules/* 的双层目录
if [ -d "$OUT_DIR/modules/modules" ]; then
  echo "Normalize nested modules directory"
  if command -v rsync >/dev/null 2>&1; then
    rsync -a "$OUT_DIR/modules/modules/" "$OUT_DIR/modules/"
  else
    cp -R "$OUT_DIR/modules/modules/"* "$OUT_DIR/modules/" 2>/dev/null || true
  fi
  rm -rf "$OUT_DIR/modules/modules"
fi

# 注入构建元信息（可选）
if [ "${GITHUB_ACTIONS:-false}" = "true" ]; then
  cat > "$OUT_DIR/build.txt" <<EOF
repo: ${GITHUB_REPOSITORY:-local}
ref:  ${GITHUB_REF_NAME:-$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo local)}
sha:  ${GITHUB_SHA:-$(git rev-parse --short HEAD 2>/dev/null || echo local)}
date: $(date -u +"%Y-%m-%dT%H:%M:%SZ")
EOF
fi

echo "[1/1] Packing ZIP -> $ZIP_NAME"
(cd "$OUT_DIR" && zip -qr "../$ZIP_NAME" .)

echo "Done. Output: $DIST_DIR/$ZIP_NAME"

#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR=$(cd "$(dirname "$0")/.." && pwd)
SRC_DIR="$ROOT_DIR/chrome-extension"
DIST_DIR="$ROOT_DIR/dist"
OUT_DIR="$DIST_DIR/extension"

# 证书目录与密钥路径（需在清理前定义，便于本地保留 key.pem）
KEY_DIR="$DIST_DIR/certs"
KEY_FILE="$KEY_DIR/key.pem"

ZIP_NAME=${ZIP_NAME:-nodeimage-extension.zip}
CRX_NAME=${CRX_NAME:-nodeimage-extension.crx}

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
# 本地构建：清理 dist 目录但保留 key.pem
# - 目的：避免重复生成 CRX 密钥，减少干扰（KISS/YAGNI）
# - 说明：
#   - 若存在 $DIST_DIR/certs/key.pem，则暂存后清理 dist，再还原
#   - 在 GitHub Actions 环境下通常通过环境变量注入密钥，无需保留
###
TMP_KEY=""
if [ -f "$KEY_FILE" ]; then
  # 使用 mktemp 临时保存本地 key.pem（若存在）
  TMP_KEY=$(mktemp 2>/dev/null || printf '%s' "$DIST_DIR/.tmp_key.pem")
  cp "$KEY_FILE" "$TMP_KEY" || true
fi

rm -rf "$DIST_DIR"
mkdir -p "$OUT_DIR"

# 若存在临时密钥文件，则还原回 $DIST_DIR/certs/key.pem
if [ -n "$TMP_KEY" ] && [ -f "$TMP_KEY" ]; then
  mkdir -p "$KEY_DIR"
  mv "$TMP_KEY" "$KEY_FILE" || true
fi

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

echo "[1/2] Packing ZIP -> $ZIP_NAME"
(cd "$OUT_DIR" && zip -qr "../$ZIP_NAME" .)

echo "[2/2] Packing CRX (optional) -> $CRX_NAME"
mkdir -p "$KEY_DIR"

# 读取密钥：
# 1) 优先从环境变量 EXTENSION_PEM 注入（CI 场景推荐，避免落盘到仓库）
# 2) 若已存在本地 $KEY_FILE（上方清理过程中已尝试保留），则复用
# 3) 若均无，则临时生成（仅用于本地测试）
if [ -n "${EXTENSION_PEM:-}" ]; then
  printf '%s' "$EXTENSION_PEM" | tr -d '\r' > "$KEY_FILE"
elif [ -f "$KEY_FILE" ]; then
  echo "Using existing key: $KEY_FILE"
else
  if command -v openssl >/dev/null 2>&1; then
    openssl genrsa -out "$KEY_FILE" 2048 >/dev/null 2>&1 || true
  else
    echo "openssl not found; skip CRX (zip already built)"; exit 0
  fi
fi

# 查找 crx3 CLI
if command -v crx3 >/dev/null 2>&1; then
  CRX3_BIN="crx3"
elif command -v npx >/dev/null 2>&1; then
  CRX3_BIN="npx -y crx3"
else
  echo "crx3 cli not found; skip CRX (zip already built)"; exit 0
fi

if ! eval $CRX3_BIN --key "$KEY_FILE" --crx "$DIST_DIR/$CRX_NAME" "$OUT_DIR"; then
  echo "CRX pack failed; continue with ZIP only"
fi

echo "Done. Outputs: $DIST_DIR/$ZIP_NAME and (optional) $DIST_DIR/$CRX_NAME"

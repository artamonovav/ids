#!/usr/bin/env bash
# Turnkey-сборка IDS desktop (Tauri). Запускать ВНУТРИ контейнера tauri:
#   docker compose --profile tauri run --rm tauri
#   cd ids-desktop && bash build.sh
# Фронтенд уже внутри ids-desktop/src/ (self-contained) — копировать не нужно.
set -euo pipefail
cd "$(dirname "$0")"

# 1. Зависимости фронтенда (Vite+React+@resvg+@tauri-apps/cli)
bun install

# 2. Иконки из public/logo.svg (resvg-js → tauri icon)
bash build-icons.sh

# 3. Сборка Tauri (Rust + webview)
bun x tauri build

echo ""
echo "=== Готово ==="
echo "Артефакты: src-tauri/target/release/bundle/"
echo "  - debian/*.deb   - appimage/*.AppImage"
echo "Запустить: ./src-tauri/target/release/ids-desktop  (или установить .deb/.AppImage)"

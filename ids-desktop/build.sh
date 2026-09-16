#!/usr/bin/env bash
# Turnkey-сборка IDS desktop (Tauri). Запускать ВНУТРИ контейнера tauri:
#   docker compose --profile tauri run --rm tauri
#   cd ids-desktop && bash build.sh
# Фронтенд уже внутри ids-desktop/src/ (self-contained).
set -euo pipefail
cd "$(dirname "$0")"

# 1. Зависимости фронтенда (Vite+React+@resvg+@tauri-apps/cli)
bun install

# 2. Иконки из public/logo.svg (resvg-js → tauri icon)
bash build-icons.sh

# 3. Сборка Tauri (Rust + webview)
bun x tauri build

# 4. Копируем артефакты в примонтированную папку (доступна на хосте)
mkdir -p artifacts
cp -r src-tauri/target/release/bundle/. artifacts/ 2>/dev/null || true

echo ""
echo "=== Готово ==="
echo "Артефакты на хосте: $(pwd)/artifacts/"
echo "  artifacts/debian/*.deb"
echo "  artifacts/appimage/*.AppImage"
echo "(внутри контейнера: src-tauri/target/release/bundle/)"
echo "Запустить бинарник: ./src-tauri/target/release/ids-desktop"

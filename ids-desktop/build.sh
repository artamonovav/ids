#!/usr/bin/env bash
# Turnkey-сборка IDS desktop (Tauri). Запускать ВНУТРИ контейнера tauri:
#   docker compose --profile tauri run --rm tauri
#   cd ids-desktop && bash build.sh
set -euo pipefail
cd "$(dirname "$0")"

# 1. Перенос фронта IDS из корня репозитория (../src) в src/
mkdir -p src/components src/hooks src/lib public
cp -r ../src/components/. src/components/ 2>/dev/null || true
cp -r ../src/hooks/. src/hooks/ 2>/dev/null || true
cp ../src/lib/types.ts ../src/lib/frontmatter.ts ../src/lib/repo.ts \
   ../src/lib/template.ts ../src/lib/utils.ts src/lib/ 2>/dev/null || true
# Tauri-стор вместо веб-версии (localStorage):
cp src/lib/store.tauri.ts src/lib/store.ts
cp ../src/app/globals.css src/globals.css 2>/dev/null || true
cp ../public/logo.svg public/logo.svg 2>/dev/null || true

# 2. Иконки из logo.svg
bash build-icons.sh

# 3. Зависимости фронтенда
bun install

# 4. Сборка Tauri (Rust + webview)
bun x tauri build

echo ""
echo "=== Готово ==="
echo "Артефакты: src-tauri/target/release/bundle/"
echo "  - debian/*.deb"
echo "  - appimage/*.AppImage"
echo "Запустить: ./src-tauri/target/release/ids-desktop  (или установить .deb/.AppImage)"

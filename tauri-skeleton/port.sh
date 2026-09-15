#!/usr/bin/env bash
# Перенос исходников IDS в проект ids-desktop (Tauri+Vite).
# Запускать ВНУТРИ контейнера tauri (Rust + webkit + node + bun уже стоят):
#   docker compose --profile tauri run --rm tauri
#   bash tauri-skeleton/port.sh
# Или вручную по шагам — см. README 3.1.
set -euo pipefail

IDS_SRC=/app/src            # исходники IDS (примонтированы из ./src проекта)
SKEL=/app/tauri-skeleton    # каркас Tauri+Vite (этот каталог)
OUT=ids-desktop

# 1. Скелет Tauri+Vite (один раз)
if [ ! -d "$OUT" ]; then
  npm create tauri-app@latest "$OUT" -- --template react-ts
fi
cd "$OUT"
npm install   # можно: bun install

# 2. Перенос фронта IDS
mkdir -p src/components src/hooks src/lib
cp -r "$IDS_SRC/components/." src/components/
cp -r "$IDS_SRC/hooks/." src/hooks/
cp "$IDS_SRC/lib/types.ts" "$IDS_SRC/lib/frontmatter.ts" "$IDS_SRC/lib/repo.ts" \
   "$IDS_SRC/lib/template.ts" "$IDS_SRC/lib/utils.ts" src/lib/
# store.ts заменяем на Tauri-версию (invoke):
cp "$SKEL/store.tauri.ts" src/lib/store.ts
cp "$IDS_SRC/app/globals.css" src/globals.css

# 3. Точка входа Vite + конфиги
cp "$SKEL/main.tsx" src/main.tsx
cp "$SKEL/index.html" index.html
cp "$SKEL/vite.config.ts" vite.config.ts

# 4. Rust-бэкенд (src-tauri/)
rm -rf src-tauri
cp -r "$SKEL/src-tauri" src-tauri
mkdir -p src-tauri/icons     # иконки (32x32.png, 128x128.png, icon.icns, icon.ico) положите вручную

echo ""
echo "Готово. Дальше:"
echo "  bun x tauri dev    # отладка — откроется окно приложения"
echo "  bun x tauri build  # релиз -> src-tauri/target/release/bundle/{debian,appimage}"

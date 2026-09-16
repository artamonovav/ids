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
BUNDLE="src-tauri/target/release/bundle"
if [ -d "$BUNDLE" ]; then
  cp -r "$BUNDLE/." artifacts/
  echo "✓ Артефакты скопированы: $(pwd)/artifacts/"
  ls -R artifacts/ 2>/dev/null | head -20
else
  echo "⚠ bundle не найден в $BUNDLE — ищу артефакты:" >&2
  find src-tauri/target -name '*.deb' -o -name '*.AppImage' 2>/dev/null | head -10
  echo "" >&2
  echo "Если artifacts/ пусто — артефакты в Docker-томе. Заберите вручную:" >&2
  echo "  docker volume ls | grep tauri_target" >&2
  echo '  docker run --rm -v <имя-тома>:/data -v "$PWD:/out" busybox cp -r /data/release/bundle /out/' >&2
fi

echo ""
echo "=== Готово ==="
echo "Артефакты на хосте: $(pwd)/artifacts/"
echo "  artifacts/debian/*.deb"
echo "  artifacts/appimage/*.AppImage"
echo "(внутри контейнера: src-tauri/target/release/bundle/)"
echo "Запустить бинарник: ./src-tauri/target/release/ids-desktop"

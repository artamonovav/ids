#!/usr/bin/env bash
# Иконки приложения из public/logo.svg.
# Запускать ВНУТРИ контейнера tauri (там есть rsvg-convert / ImageMagick).
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p src-tauri/icons

if command -v rsvg-convert >/dev/null 2>&1; then
  rsvg-convert -w 1024 -h 1024 public/logo.svg -o src-tauri/icons/source.png
elif command -v convert >/dev/null 2>&1; then
  convert -background none -resize 1024x1024 public/logo.svg src-tauri/icons/source.png
else
  echo "Нужен rsvg-convert (librsvg2-bin) или ImageMagick для конвертации SVG->PNG." >&2
  exit 1
fi

# tauri icon генерирует все размеры (32/128/ico/icns) из одного PNG
bun x tauri icon src-tauri/icons/source.png
echo "Иконки готовы: src-tauri/icons/"

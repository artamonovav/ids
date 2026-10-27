#!/usr/bin/env bash
# Иконки приложения из public/logo.svg (без rsvg-convert/ImageMagick — через @resvg/resvg-js).
set -euo pipefail
cd "$(dirname "$0")"
bun run build-icons.mjs
bun x tauri icon src-tauri/icons/source.png
echo "Иконки готовы: src-tauri/icons/"

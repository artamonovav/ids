#!/usr/bin/env bash
# clean.sh — очистка build-артефактов из репозитория IDS.
# Запуск: bash clean.sh [опции]
# Опции:
#   --dry-run   только показать что будет удалено, не удалять
#   --deep      включает ids-desktop/src-tauri/target/ (Rust, ~ГБ — долго пересобирать)
#   --help      эта справка
#
# Безопасно: удаляет ТОЛЬКО известные build-артефакты и кэш. НЕ трогает:
#   .git/, src/, *.ts/tsx, package.json, tsconfig.json, .github/, docker/, configs.
set -euo pipefail
cd "$(dirname "$0")"

DRY_RUN=0
DEEP=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run) DRY_RUN=1; shift ;;
    --deep) DEEP=1; shift ;;
    --help) head -8 "$0" | tail -6; exit 0 ;;
    *) echo "Неизвестная опция: $1 (используй --help)"; exit 1 ;;
  esac
done

# Список путей для очистки (относительно корня репо).
# Формат: "путь|описание|требует_--deep"
TARGETS=(
  ".next|Next.js build output (веб-версия)|0"
  "out|Next.js static export|0"
  "dist|Vite build output (ids-desktop)|0"
  "ids-desktop/dist|Vite build output (Tauri)|0"
  "node_modules|deps веб-версии (ставятся bun install)|0"
  "ids-desktop/node_modules|deps Tauri-фронта (bun install)|0"
  "ids-desktop/artifacts|копии артефактов сборки|0"
  "ids-desktop/src-tauri/gen|сгенерённые Tauri-файлы|0"
  "ids-desktop/.vite|Vite кэш deps|0"
  "*.log|лог-файлы|0"
  "ids-desktop/src-tauri/target|Rust build output (~ГБ, долго пересобирать)|1"
)

echo "=== IDS repo cleaner ==="
echo "Режим: $([ $DRY_RUN -eq 1 ] && echo 'DRY-RUN (показать, не удалять)' || echo 'УДАЛЕНИЕ')"
echo "Deep (Rust target/): $([ $DEEP -eq 1 ] && echo 'ВКЛ' || echo 'выкл (используй --deep)')"
echo ""

TOTAL_SIZE=0
REMOVED=0
SKIPPED=0

for entry in "${TARGETS[@]}"; do
  IFS='|' read -r path desc needs_deep <<< "$entry"
  # Пропустить deep-цели если не --deep
  if [[ "$needs_deep" == "1" && "$DEEP" -ne 1 ]]; then
    if [ -e "$path" ]; then
      SIZE=$(du -sh "$path" 2>/dev/null | cut -f1)
      echo "  ⏭  $path ($SIZE) — $desc [пропущено, --deep]"
      SKIPPED=$((SKIPPED + 1))
    fi
    continue
  fi
  # Вычислить размер (если существует)
  if [ -e "$path" ]; then
    SIZE=$(du -sh "$path" 2>/dev/null | cut -f1)
    if [ "$path" == "*.log" ]; then
      COUNT=$(find . -maxdepth 3 -name "*.log" -type f 2>/dev/null | wc -l)
      DESC="$COUNT файл(ов)"
    else
      DESC="$SIZE"
    fi
    if [ $DRY_RUN -eq 1 ]; then
      echo "  🔍 $path ($DESC) — $desc [dry-run, не удалено]"
    else
      if [ "$path" == "*.log" ]; then
        find . -maxdepth 3 -name "*.log" -type f -delete 2>/dev/null
      else
        rm -rf "$path"
      fi
      echo "  ✓ $path ($DESC) удалено — $desc"
    fi
    REMOVED=$((REMOVED + 1))
  fi
done

echo ""
echo "=== Итог ==="
echo "  Удалено/найдено: $REMOVED"
echo "  Пропущено (deep): $SKIPPED"
if [ $DRY_RUN -eq 1 ]; then
  echo "  (dry-run — ничего не удалено. Запусти без --dry-run для удаления.)"
fi
echo ""
echo "Для пересборки после очистки:"
echo "  cd ids-desktop && bun install && bash build.sh   # Tauri desktop"
echo "  bun install && bun run build                     # веб-версия"

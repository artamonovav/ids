# Tauri-скелет IDS

Каркас для порта веб-версии IDS в десктоп (Tauri 2 + Vite+React). Положить поверх
созданного `npm create tauri-app` проекта `ids-desktop`.

```
tauri-skeleton/
├── main.tsx               точка входа Vite (вместо Next app/page+layout)
├── index.html
├── vite.config.ts         алиас @/ → ./src, порт 1420 для tauri dev
├── store.tauri.ts         ТЕМПЛЕЙТ lib/store.ts на invoke() (ФС + git)
├── port.sh                скрипт переноса исходников IDS в ids-desktop
└── src-tauri/
    ├── Cargo.toml         tauri 2 + serde (git2 НЕ нужен — git через CLI)
    ├── tauri.conf.json    frontendDist=../dist, devUrl=1420
    ├── build.rs
    ├── capabilities/default.json
    └── src/
        ├── main.rs        точка входа desktop
        ├── lib.rs         регистрация команд
        └── commands.rs    read_localizations / read_repo_files / write_file /
                           delete_file / rename_file / git_clone / git_pull /
                           git_sync / git_branches (std::fs + системный git)
```

## Быстрый старт (в Docker, без Rust на хосте)
```bash
# из корня репозитория:
docker compose --profile tauri run --rm tauri      # интерактивная оболочка
bash tauri-skeleton/port.sh                         # скелет + перенос src + установка
cd ids-desktop
bun x tauri build                                   # -> .deb / .AppImage
```

## Что доработать вручную
- **Иконки** — источник `public/logo.svg` (логотип IDS). Конвертируйте в PNG 1024×1024
  (`rsvg-convert -w 1024 -h 1024 public/logo.svg > icon.png` — пакет `librsvg2-bin`,
  или Inkscape/ImageMagick), затем `bun x tauri icon icon.png` — сгенерирует все
  размеры (`32x32.png`, `128x128.png`, `icon.icns`, `icon.ico`) в `src-tauri/icons/`.
- **`store.tauri.ts`** — допилите `upsertFile`/`clarify`/`removeFile`/`writeDictionary`/
  `writeTemplateFile`/`completeSetup` по аналогии с `init`/`createDraft`/`patchFile`/`sync`
  (тела есть в веб-`lib/store.ts` — замените `set(...)` на `invoke + локальный set`).
- **HTTPS-аутентификация** — `git` CLI берёт токен из URL (`https://user:token@host/...`)
  или из системного credential helper; SSH — через `GIT_SSH_COMMAND` (уже в `commands.rs`).
- **Иконки приложения / подпись** — см. `tauri.conf.json` → `bundle`.

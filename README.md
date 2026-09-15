# IDS — Issue Documentation System

Графическое редактирование локализаций проблем по единому шаблону
(Markdown + YAML frontmatter). Рабочее приложение — Next.js 16 + TypeScript +
shadcn/ui; данные хранятся в `localStorage` (в десктоп-цели Tauri — в Git).

- Форма frontmatter (13 полей, настраиваемые справочники из `.dictionary/*.yaml`).
- Редактор тела Markdown: 3 режима (совмещённо / источник / просмотр).
- Точная YAML-сериализация: порядок полей и комментарии из эталонного шаблона,
  `symptom`/`root_cause`/`resolution` — block scalar `|-`, массивы — flow.
- Шаблон нового документа читается из `_template/localization.md`.
- Недооформленные черновики — в `.tmp` (в `.gitignore`); при заполнении всех полей
  переносятся в базу знаний и помечаются к синхронизации.
- Тема (light/dark), sticky-футер со статусом синхронизации, русский UI.

---

## 1. Быстрый старт через Docker (без установки Node/Bun/Rust)

Самый простой путь — всё внутри контейнеров.

### 1.1 Разработка с hot-reload
```bash
docker compose up dev
```
Откройте `http://localhost:3000`. Исходники примонтированы — изменения
пересобираются на лету.

### 1.2 Production-сборка и запуск
```bash
docker compose up app --build
```
Откройте `http://localhost:3000`. Это та же сборка, что пойдёт в прод.

> `dev` и `app` оба слушают порт 3000 — запускайте что-то одно.

---

## 2. Локально без Docker (нужен Node 20 и/или Bun)

### 2.1 Установка Node.js 20 + Bun

**Linux (Ubuntu 22.04 / Debian):**
```bash
sudo apt update && sudo apt install -y curl git ca-certificates
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
curl -fsSL https://bun.sh/install | bash
source ~/.bashrc
node -v && bun -v
```

**macOS:**
```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
brew install node@20 bun
```

**Windows (PowerShell):**
```powershell
# Установить Node 20 LTS: https://nodejs.org (или winget install OpenJS.NodeJS.LTS)
npm install -g bun
node -v; bun -v
```

### 2.2 Установка зависимостей и запуск
```bash
bun install
```

Разработка:
```bash
bun run dev          # http://localhost:3000, лог в dev.log
```

Production-сборка и запуск:
```bash
bun run lint         # проверка кода (0 ошибок)
bun run build        # standalone-сборка в .next/standalone
bun run start        # запуск собранного сервера
```

Слушать на всех интерфейсах/другом порту:
```bash
PORT=3000 HOSTNAME=0.0.0.0 bun run start
```

> База данных не требуется: локализации хранятся в `localStorage`.
> Prisma/SQLite из шаблона этим приложением не используются.

---

## 3. Десктоп-приложение (Tauri, опционально)

Десктоп-обёртка (один исполняемый файл) собирается через **Tauri 2** и требует
**Rust**. Если на хосте Rust поставить нельзя (корпоративные политики) —
используйте готовый Docker-образ `docker/tauri.Dockerfile`: **Rust уже внутри**.

### 3.1 Сборка десктопа в Docker (без Rust на хосте)

Tauri-приложение = фронтенд (Vite+React, статический бандл) + Rust-бэкенд
(команды для Git и ФС). IDS — клиентское приложение, поэтому порт сводится к
двум вещам: вынести UI в Vite-оболочку и заменить localStorage-слой (`lib/store.ts`)
на вызовы Tauri-команд. Серверной логики у IDS нет — ничего, кроме UI, не нужно.

#### A. Скелет Tauri + Vite (в контейнере с Rust)
```bash
docker compose --profile tauri run --rm tauri   # интерактивная оболочка, Rust внутри
npm create tauri-app@latest ids-desktop -- --template react-ts
cd ids-desktop
```

#### B. Перенос фронтенда (UI из Next.js → Vite)
Скопируйте из этого проекта в `ids-desktop/src/`:
- `src/components/` (включая `ui/`) — целиком;
- `src/lib/` — `types.ts`, `frontmatter.ts`, `repo.ts`, `template.ts`, `utils.ts`
  (БЕЗ `db.ts`); `store.ts` перепишем на шаге C;
- `src/hooks/` — `use-toast.ts`, `use-mobile.ts`;
- `src/app/globals.css` → `ids-desktop/src/globals.css`.

Точка входа (вместо Next `app/page.tsx`+`layout.tsx`). `ids-desktop/src/main.tsx`:
```tsx
import React from "react"
import { createRoot } from "react-dom/client"
import { ThemeProvider } from "@/components/theme-provider"
import { Toaster } from "@/components/ui/toaster"
import { AppShell } from "@/components/app-shell"
import "./globals.css"

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <AppShell />
      <Toaster />
    </ThemeProvider>
  </React.StrictMode>
)
```
`ids-desktop/index.html`:
```html
<!doctype html>
<html lang="ru" suppressHydrationWarning>
  <head><meta charset="utf-8" /><title>IDS</title></head>
  <body><div id="root"></div></body>
</html>
```
`ids-desktop/vite.config.ts` (алиас `@/` + порт для `tauri dev`):
```ts
import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import path from "node:path"
export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
  clearScreen: false,
  server: { port: 1420, strictPort: true },
})
```
Зависимости: возьмите `dependencies` из `package.json` этого проекта (без `next`).
Tailwind: `tailwind.config.ts`, `postcss.config.mjs`, `components.json` — как есть.
Уберите Next-специфику: `next/font` (замените на системный шрифт или
`@fontsource-variable/geist`), `metadata`, `app/`-роутинг, `api/route.ts`.

#### C. Замена lib/store.ts на Tauri-команды
Структуру стора оставьте, но действия замените на `invoke()` из
`@tauri-apps/api/core`. Данные читаются из реального репозитория при старте,
запись идёт в файлы, синхронизация — в настоящий git:
```ts
import { invoke } from "@tauri-apps/api/core"
// при старте (загрузка из ФС):
files: await invoke<Localization[]>("read_localizations"),
repoFiles: await invoke<Record<string, string>>("read_repo_files"),
// sync (commit message считается в TS):
await invoke("git_sync", { commitMessage: dirtyKb.map(commitMessageFor).join("; "),
                           authorName, authorEmail })
// createDraft / patchFile:
await invoke("write_file", { path: ".tmp/tmp-xxx.md", content: serializeDocument(fm, body) })
// writeDictionary:
await invoke("write_file", { path: ".dictionary/type.yaml", content: serializeDictYaml(values) })
```
Логика `commitMessageFor`, `serializeFrontmatter`, `readTemplate`, `readConfig`
остаётся в TS — Rust только читает/пишет файлы и гоняет git.

#### D. Rust-бэкенд (`src-tauri/`)
`ids-desktop/src-tauri/Cargo.toml`:
```toml
[package]
name = "ids-desktop"
version = "0.1.0"
edition = "2021"
[build-dependencies]
tauri-build = { version = "2", features = [] }
[dependencies]
tauri = { version = "2", features = [] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
git2 = "0.19"
```
`ids-desktop/src-tauri/tauri.conf.json` (фрагмент):
```json
{
  "build": {
    "frontendDist": "../dist",
    "devUrl": "http://localhost:1420",
    "beforeBuildCommand": "bun run build",
    "beforeDevCommand": "bun run dev"
  },
  "app": { "windows": [{ "title": "IDS", "width": 1280, "height": 800 }] }
}
```
`ids-desktop/src-tauri/src/commands.rs` (каркас команд):
```rust
use std::fs;
use std::path::Path;
use serde::Serialize;

#[derive(Serialize)]
pub struct FileEntry { pub path: String, pub content: String }

#[tauri::command]
pub fn read_localizations(base: String) -> Vec<FileEntry> {
    // скан <base>/SPAS-*/*.md — вернуть пути + содержимое; фронтенд парсит frontmatter сам
    scan_md(&base).unwrap_or_default()
}

#[tauri::command]
pub fn read_repo_files(base: String) -> std::collections::HashMap<String, String> {
    // .dictionary/*.yaml + _template/localization.md + .gitignore + .tmp/config.yaml
    read_repo(&base).unwrap_or_default()
}

#[tauri::command]
pub fn write_file(base: String, path: String, content: String) -> Result<(), String> {
    let p = Path::new(&base).join(&path);
    if let Some(parent) = p.parent() { fs::create_dir_all(parent).map_err(|e| e.to_string())?; }
    fs::write(p, content).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_file(base: String, path: String) -> Result<(), String> {
    fs::remove_file(Path::new(&base).join(&path)).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn git_sync(base: String, commit_message: String, author_name: String, author_email: String) -> Result<(), String> {
    let repo = git2::Repository::open(&base).map_err(|e| e.to_string())?;
    let mut index = repo.index().map_err(|e| e.to_string())?;
    index.add_all(["*"].iter(), git2::IndexAddOption::DEFAULT, None).map_err(|e| e.to_string())?;
    index.write().map_err(|e| e.to_string())?;
    let sig = git2::Signature::now(&author_name, &author_email).map_err(|e| e.to_string())?;
    let head = repo.head().map_err(|e| e.to_string())?;
    let parent = repo.find_commit(head.target().unwrap()).map_err(|e| e.to_string())?;
    let tree = repo.find_tree(index.write_tree().unwrap()).map_err(|e| e.to_string())?;
    repo.commit(Some("HEAD"), &sig, &sig, &commit_message, &tree, &[&parent]).map_err(|e| e.to_string())?;
    let mut remote = repo.find_remote("origin").map_err(|e| e.to_string())?;
    remote.push(&["refs/heads/main"], None).map_err(|e| e.to_string())?;
    Ok(())
}
// + git_clone / git_pull / git_branches — по аналогии (см. lib/git2 docs)
```
`ids-desktop/src-tauri/src/lib.rs`:
```rust
mod commands;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            commands::read_localizations,
            commands::read_repo_files,
            commands::write_file,
            commands::delete_file,
            commands::git_sync,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri");
}
```

#### E. Сборка
```bash
bun install
bun x tauri build      # или: cargo tauri build
# Артефакты: src-tauri/target/release/bundle/debian/*.deb,
#            src-tauri/target/release/bundle/appimage/*.AppImage
exit
```

### 3.2 Системные зависимости Tauri (если собирать на хосте, а не в Docker)
```bash
sudo apt install -y libwebkit2gtk-4.1-dev build-essential curl wget file \
  libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

### 3.3 Ограничения кросс-компиляции
Tauri **нельзя** кросскомпилировать между ОС из Linux-контейнера:
- **Linux** `.deb`/`.AppImage` — собирается в Docker (раздел 3.1).
- **Windows** `.msi`/`.exe` — собирайте на Windows (Node + Rust + WebView2)
  или через GitHub Actions на `windows-latest`.
- **macOS** `.app`/`.dmg` — собирайте на macOS (Xcode CLT + Rust)
  или через GitHub Actions на `macos-latest`.

Для кроссплатформенной сборки бинарников рекомендован CI (GitHub Actions matrix:
`ubuntu-latest`, `windows-latest`, `macos-latest`) — там Rust предустановлен.

---

## 4. Сборка под все платформы (шпаргалка)

| Цель | Платформа | Способ |
|---|---|---|
| Веб (prod) | любая | `docker compose up app --build` или `bun run build && bun run start` |
| Веб (dev) | любая | `docker compose up dev` или `bun run dev` |
| Desktop Linux | Linux | `docker compose --profile tauri run --rm tauri` → `tauri build` |
| Desktop Windows | Windows | на Windows: `npm create tauri-app` + `tauri build` |
| Desktop macOS | macOS | на macOS: `npm create tauri-app` + `tauri build` |

---

## 5. Структура проекта

```
src/
  lib/
    types.ts          доменные типы
    frontmatter.ts    YAML-сериализатор (порядок полей + комментарии)
    template.ts       эталонный шаблон (fallback)
    repo.ts           виртуальная ФС репозитория (.dictionary, _template, .tmp, .gitignore)
    store.ts          zustand+persist: файлы, папки, синхронизация, настройки
  components/
    app-shell.tsx          навигация, sticky-футер, тема
    workspace-view.tsx     список, поиск, режимы (Последние/Черновики/Все)
    editor-view.tsx        интегратор: форма + редактор + исходник
    frontmatter-form.tsx   13 полей, теги, переключатели
    markdown-editor.tsx    3 режима, тулбар, вставка изображений
    settings-view.tsx      профиль, репозиторий, справочники, шаблон
    setup-wizard.tsx       мастер первого запуска
  app/
    page.tsx, layout.tsx
docker/
  tauri.Dockerfile    образ с Rust + webkit2gtk для десктоп-сборки
Dockerfile            Next.js standalone (мультистадийный)
docker-compose.yml    dev + app + tauri
```

## 6. Команды (package.json)
- `bun run dev` — разработка (порт 3000).
- `bun run build` — standalone-сборка.
- `bun run start` — запуск собранного.
- `bun run lint` — ESLint.

## 7. Troubleshooting
- **Docker dev: не работает hot-reload** — на macOS/Windows добавьте в `docker-compose.yml`
  среды `WATCHPACK_POLLING=true` (уже включено) или перезапустите `docker compose up dev`.
- **Порт 3000 занят** — смените маппинг: `ports: ["3001:3000"]`.
- **`bun install` медленный в Docker** — кэш `bun_cache` уже примонтирован; повторные запуски быстрее.
- **Tauri: ошибка webkit2gtk** — используйте именно `docker/tauri.Dockerfile` (там deps готовы);
  на хосте нужен пакет `libwebkit2gtk-4.1-dev`.
- **Корпоративный прокси** — `docker build --build-arg HTTP_PROXY=...` и
  `bun config` / `npm config` для реестров.

## 8. CI / Автоматизация (GitHub Actions)

В `.github/workflows/` два сценария:

### 8.1 `ci.yml` — проверка веб-приложения (lint + build)
Запускается на каждый push в `main`/`master` и на PR. Ставит Bun, делает
`bun install --frozen-lockfile`, `bun run lint`, `bun run build`. Rust не нужен.
Зелёная галка = приложение собирается и проходит линт.

### 8.2 `release.yml` — сборка десктоп-бинарников Tauri (Windows / macOS / Linux)
Запускается при создании git-тега вида `v*`. На каждой ОС ставится Rust (на
Linux — +webkit2gtk-4.1), собирается Tauri через `tauri-apps/tauri-action`, и
артефакты (`.msi`/`.exe`, `.app`/`.dmg`, `.deb`/`.AppImage`) прикладываются к
GitHub Release как черновик.

**Важно:** сборка запускается только при наличии `src-tauri/tauri.conf.json`
(проверка отдельным шагом после checkout — `hashFiles()` не работает на уровне
`if:` у job). Пока Tauri-проект не создан — шаги сборки пропускаются
(уведомление в логе), CI остаётся зелёным. Как создать `src-tauri` — см. раздел 3.1.

### 8.3 Как пользоваться
```bash
# 1. Запушить репозиторий на GitHub:
git remote add origin git@github.com:<org>/ids.git
git push -u origin main        # запустится ci.yml (lint + build)

# 2. (опционально) Создать src-tauri для десктопа — см. раздел 3.1, закоммитить.

# 3. Выпустить релиз десктоп-бинарников:
git tag v0.1.0
git push origin v0.1.0         # запустится release.yml → Release с артефактами
```

Если `bun.lock` меняется — коммитьте его, иначе `--frozen-lockfile` в CI упадёт
(так и задумано — воспроизводимость сборок).


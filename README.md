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

### 3.1 Сборка десктопа под ключ (в Docker, без Rust на хосте)

Полный проект Tauri лежит в [`ids-desktop/`](ids-desktop) — **ничего допиливать не нужно**:
- фронтенд (Vite+React, `main.tsx`) + `store.tauri.ts` (полный, все действия через `invoke`);
- Rust-бэкенд `src-tauri/` (`commands.rs`: `get_base`, `read_localizations`, `read_repo_files`,
  `write_file`, `delete_file`, `git_clone`/`git_pull`/`git_sync`/`git_branches` на `std::fs` + системный `git`, без `git2`);
- `build.sh` — **turnkey**: переносит `./src` IDS в `ids-desktop/src/`, генерирует иконки из `logo.svg`, ставит deps, собирает `tauri build`.

Команды бэкенда используют `std::fs` (файлы) и системный `git` (CLI); SSH-ключ — через `GIT_SSH_COMMAND`.

#### Запуск (одна команда в Docker)
```bash
# 1. Запускаем оболочку с Rust+webkit+node+bun (Rust уже ВНУТРИ — на хост не нужен):
docker compose --profile tauri run --rm tauri

# 2. Внутри контейнера — turnkey-сборка (перенос ./src + иконки + deps + tauri build):
cd ids-desktop && bash build.sh
```
Артефакты: `ids-desktop/src-tauri/target/release/bundle/{debian/*.deb, appimage/*.AppImage}`.
Установите `.deb`/`.AppImage` или запустите `./ids-desktop/src-tauri/target/release/ids-desktop`.

> `build.sh` копирует фронтенд из `../src` (проброшен в контейнер), генерирует иконки
> из `../public/logo.svg` (`rsvg-convert` → `tauri icon`), и собирает релиз. Кэш Rust
> (`tauri_target`, `cargo_cache`) — в отдельных томах, повторная сборка быстрее.

#### Отладка (с окном)
```bash
docker compose --profile tauri run --rm tauri
cd ids-desktop && bash build.sh   # один раз — поставит deps + иконки
bun x tauri dev                   # hot-reload, откроется окно приложения
```

> **Важно:** проект собирался в среде без Rust (песочница), поэтому компиляция Rust
> здесь не проверена. Если `tauri build` упадёт с ошибкой — пришлите вывод, поправлю.

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


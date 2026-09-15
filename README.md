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

### 3.1 Сборка Linux-бинарника в Docker (без Rust на хосте)
```bash
# Запускаем интерактивную оболочку с Rust + зависимостями Tauri:
docker compose --profile tauri run --rm tauri
# Внутри контейнера (один раз):
npm create tauri-app@latest ids-desktop -- --template react-ts
#  …перенести src/ из этого проекта в фронты Tauri, заменить lib/store.ts на Tauri-команды…
cd ids-desktop
npm install
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

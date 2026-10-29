# IDS — Issue Documentation System

Графическое редактирование локализаций проблем по единому шаблону
(Markdown + YAML frontmatter). Десктоп-приложение на **Tauri 2**
(React + TypeScript + shadcn/ui во фронтенде, Rust-бэкенд). Данные хранятся
в папке проекта, синхронизация — через Git.

- Форма frontmatter (13 полей, настраиваемые справочники из `.dictionary/*.yaml`).
- Редактор тела Markdown: 3 режима (совмещённо / источник / просмотр).
- Точная YAML-сериализация: порядок полей и комментарии из эталонного шаблона,
  `symptom`/`root_cause`/`resolution` — block scalar `|-`, массивы — flow.
- Шаблон нового документа читается из `_template/localization.md`.
- Недооформленные черновики — в `.tmp` (в `.gitignore`); при заполнении всех полей
  переносятся в базу знаний и помечаются к синхронизации.
- Тема (light/dark), sticky-футер со статусом синхронизации, русский UI.

Поддерживаемые платформы: **Linux**, **Windows**, **macOS**.

---

## 1. Сборка и запуск

Все команды ниже выполняются из корня репозитория.

### 1.1 Требования

| Что | Зачем |
|---|---|
| Node.js 20+ или Bun 1.x | фронтенд, `bun install` |
| Rust (stable, через rustup) | бэкенд Tauri |
| Системные библиотеки Tauri (см. ниже) | WebView и системные зависимости |
| Git (в `PATH`) | синхронизация репозитория |

**Linux (Ubuntu 22.04 / 24.04, Mint):**
```bash
sudo apt install -y libwebkit2gtk-4.1-dev libjavascriptcoregtk-4.1-dev libsoup-3.0-dev \
  libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev libxdo-dev \
  build-essential curl wget file pkg-config
curl -fsSL https://bun.sh/install | bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

**macOS:** Xcode Command Line Tools (`xcode-select --install`), затем
`brew install bun` и rustup (`curl ... sh.rustup.rs | sh`).

**Windows:** Visual Studio Build Tools (C++), WebView2 (есть в Windows 11),
Git for Windows, затем `npm install -g bun` и rustup
(`winget install Rustlang.Rustup`).

### 1.2 Разработка

```bash
bun install
bun x tauri dev        # откроется окно приложения, hot-reload фронтенда
```

### 1.3 Сборка установщиков

```bash
bash build.sh         # bun install + иконки + tauri build
```

Артефакты:

| ОС | Файлы |
|---|---|
| Linux | `src-tauri/target/release/bundle/{deb,appimage}/` |
| Windows | `src-tauri/target/release/bundle/{msi,nsis}/` |
| macOS | `src-tauri/target/release/bundle/{macos,dmg}/` |

Кросс-компиляция между ОС не поддерживается: Tauri требует нативный Rust и
системный WebView для каждой платформы. Для всех трёх платформ используйте CI
(см. раздел 5).

### 1.4 Сборка в Docker (Linux, без Rust на хосте)

```bash
docker compose --profile tauri run --rm tauri
# внутри контейнера:
bash build.sh
```

Образ `docker/tauri.Dockerfile` содержит Rust, Bun и библиотеки WebKitGTK.
Кэш Rust хранится в томах `tauri_target` и `cargo_cache`.

### 1.5 Очистка после сборки

```bash
bash clean.sh --dry-run      # показать что найдёт, не удалять
bash clean.sh                # удалить артефакты кроме Rust target/
bash clean.sh --deep         # включая Rust target/ (~ГБ, долго пересобирать)
bash clean.sh --help         # справка
```

---

## 2. Структура проекта

```
src/                             React-фронтенд (Vite)
  main.tsx                      точка входа, ErrorBoundary, загрузка через init()
  components/                   экраны и UI (app-shell, workspace-view, editor-view, ...)
    ui/                         shadcn/ui компоненты
  lib/
    store.ts                    Zustand store (invoke → Rust)
    frontmatter.ts              YAML-сериализатор (порядок полей + комментарии)
    repo.ts                     шаблон, справочники, конфиг репозитория
    types.ts                    доменные типы
    template.ts                 эталонный шаблон (fallback)
src-tauri/
  src/
    main.rs                     entry
    lib.rs                      регистрация команд и плагинов
    commands.rs                 Rust-команды: ФС, git, clipboard
  tauri.conf.json               имя продукта, bundle targets
  capabilities/default.json     права Tauri
public/logo.svg                 исходная иконка приложения
build.sh                        сборка под ключ (install + icons + tauri build)
build-icons.sh                  logo.svg → иконки приложения
vite.config.ts, package.json, tsconfig.json, tailwind.config.ts, index.html
docker/
  tauri.Dockerfile              образ для Linux-сборки (Rust + WebKitGTK)
docker-compose.yml              сервис tauri
.github/workflows/
  ci.yml                        сборка фронтенда на push/PR
  release.yml                   сборка всех платформ по тегу v*
```

---

## 3. Команды (`package.json`)

- `bun run dev` — Vite dev-сервер (только фронтенд, без Tauri; команды `invoke` не работают).
- `bun run build` — сборка фронтенда в `dist/`.
- `bun x tauri dev` / `bun x tauri build` — полное приложение.

### Горячие клавиши редактора тела

Работают в поле ввода Markdown, применяются к выделенному тексту (без выделения — к плейсхолдеру):

| Сочетание | Действие |
|---|---|
| `Ctrl+B` (`⌘B`) | жирный |
| `Ctrl+I` (`⌘I`) | курсив |
| `Ctrl+Shift+X` (`⌘⇧X`) | зачёркнутый |
| `Ctrl+E` (`⌘E`) | инлайн-код |
| `Ctrl+K` (`⌘K`) | ссылка |

Повторное нажатие на уже отформатированный текст снимает разметку.

---

## 4. Troubleshooting

### macOS: «приложение повреждено и его не удалось открыть»

Gatekeeper блокирует **unsigned**-сборки (без Apple Developer-подписи). Браузер
ставит quarantine-флаг при скачивании, macOS пишет «повреждено» вместо
«неизвестный разработчик».

**Workaround без пересборки** (выполнить в Terminal):
```bash
xattr -cr /Applications/IDS.app
open /Applications/IDS.app
```
Альтернатива: System Settings → Privacy & Security → «Open Anyway».

**Полный фикс — нотаризация** (нужен Apple Developer Account, $99/год). CI уже
поддерживает — задайте GitHub Secrets в репозитории (Settings → Secrets and
variables → Actions → New repository secret):

| Secret | Значение | Где взять |
|---|---|---|
| `APPLE_SIGNING_IDENTITY` | `Developer ID Application: Your Name (TEAMID)` | Keychain Access → сертификат |
| `APPLE_ID` | Apple ID (email) | ваш Apple ID |
| `APPLE_PASSWORD` | app-specific password | appleid.apple.com → Sign-In and Security → App-Specific Passwords |
| `APPLE_TEAM_ID` | Team ID (10 символов) | developer.apple.com → Membership Details |

При следующем пуше тега `v*` CI подпишет (Developer ID Application) и нотаризует
`.app`/`.dmg`. См. `release.yml` — блок `APPLE_*` env в шаге `tauri-action`
(пустые секреты = unsigned, текущее поведение).

### Windows: portable exe — иконка не соответствует logo.svg

Иконки генерируются из `public/logo.svg` → `source.png` → `tauri icon`
(все размеры + `.ico`) шагом `build-icons.sh`. Иконка встраивается в `.exe`
через `tauri_build::build()` в `build.rs`.

Если Explorer показывает **стандартную** иконку — это **Windows icon cache**.
Очистка (в cmd от имени администратора):
```cmd
ie4uinit.exe -show
```
Альтернатива: перезапустить Explorer или скопировать `IDS.exe` под другим именем.

### CI: «Resource not accessible by integration» при создании релиза

`tauri-action` не может создать GitHub Release — у `GITHUB_TOKEN` нет прав на запись.
**Фикс** (один раз, в настройках репо): Settings → Actions → General →
Workflow permissions → **Read and write permissions** → Save. Затем перепушить тег
или перезапустить workflow.

В `release.yml` есть шаг **«Ensure draft release exists»** — он падает с понятной
ошибкой **до** долгой сборки Rust. Если видите его ошибку — это та же проблема.

**Альтернатива** (если org-политика запрещает): PAT (classic, scope `repo`) как
secret `RELEASE_TOKEN` и замена `GITHUB_TOKEN` → `RELEASE_TOKEN` в `release.yml`.

---

## 5. CI / Автоматизация (GitHub Actions)

### 5.1 `ci.yml` — проверка фронтенда
Запускается на push в `main`/`master` и на PR. Ставит Bun, делает
`bun install --frozen-lockfile` и `bun run build`. Rust не нужен.

### 5.2 `release.yml` — сборка бинарников (Windows / macOS / Linux)
Запускается при создании git-тега вида `v*`. На каждой ОС ставится Rust (на
Linux — +WebKitGTK), собирается Tauri через `tauri-apps/tauri-action`, и
артефакты (`.msi`/`.exe`, `.app`/`.dmg`, `.deb`/`.AppImage`, portable `.zip` для
Windows) прикладываются к GitHub Release как черновик.

### 5.3 Как выпустить релиз
```bash
git tag v0.2.0
git push origin v0.2.0         # запустится release.yml → Release с артефактами
```

Если `bun.lock` меняется — коммитьте его, иначе `--frozen-lockfile` в CI упадёт
(так и задумано — воспроизводимость сборок).

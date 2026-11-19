# IDS — Архитектура

> Архитектурный документ проекта IDS (Issue Documentation System).
> Диаграммы — Mermaid (GitHub рендерит автоматически).

---

# Обзор

IDS — графическое приложение для заполнения локализаций проблем по единому
шаблону (Markdown + YAML frontmatter). Единственный delivery-таргет — десктоп
на Tauri 2 (Linux, Windows, macOS), код в корне репозитория:

| Слой | Технология | Где |
|---|---|---|
| Фронтенд | Vite + React 19 + Zustand | `src/` |
| Бэкенд | Rust (Tauri 2): реальная ФС + системный Git | `src-tauri/` |

Фронтенд (React-компоненты) и бэкенд разделены IPC-мостом `invoke`:
Rust-команды (`std::fs` + системный `git`) вызываются из Zustand store.

> Веб-версия (Next.js + localStorage) удалена: она не использовалась,
> дублировала фронтенд и не поддерживала синхронизацию через Git.

---

# Системная архитектура

```mermaid
graph TB
    subgraph "Десктоп-приложение (Tauri 2)"
        D_WEBVIEW[WebView<br/>WebKit2GTK / WebView2 / WKWebView]
        D_FRONT[Vite + React<br/>src/]
        D_STORE[store.ts<br/>Zustand]
        D_RUST[Rust backend<br/>commands.rs]
        D_FS[(ФС + Git)]
        D_WEBVIEW --> D_FRONT
        D_FRONT --> D_STORE
        D_STORE <-->|invoke| D_RUST
        D_RUST --> D_FS
    end
```

**Ключевое:** компоненты (`src/components/`) не знают о хранении —
они вызывают действия store, а store обращается к Rust через `invoke()`.

---

# Фронтенд: дерево компонентов

```mermaid
graph TD
    MAIN[main.tsx<br/>ErrorBoundary + Root + ThemeProvider]
    APP[AppShell<br/>навигация, sticky-футер, sync-статус]

    MAIN --> APP

    subgraph "Views (switch by view state)"
        SETUP[SetupWizard<br/>первый запуск: папка→ветки→профиль]
        WORK[WorkspaceView / TuiView<br/>список локализаций: обычный или TUI]
        EDITOR[EditorView<br/>форма + редактор + исходник]
        SETTINGS[SettingsView<br/>профиль, папка проекта, справочники, шаблон]
        LOGS[LogsView<br/>журнал: работа + git, выгрузка]
    end

    APP --> SETUP
    APP --> WORK
    APP --> EDITOR
    APP --> SETTINGS
    APP --> LOGS

    subgraph "EditorView internals"
        FM[FrontmatterForm<br/>13 полей, теги, селекты]
        MD[MarkdownEditor<br/>4 режима: live/source/split/preview]
        LIVE[markdown-live-preview.ts<br/>декорации CodeMirror]
        SRC[SourcePreview<br/>готовый Markdown]
    end

    EDITOR --> FM
    EDITOR --> MD
    EDITOR --> SRC
    MD --> LIVE

    subgraph "UI library (shadcn/ui)"
        UI[Button, Input, Dialog,<br/>Select, Tabs, Toast,<br/>Collapsible, etc.]
    end

    FM --> UI
    MD --> UI
    SETTINGS --> UI
```

### Темы и палитры

Две независимые оси:

- **Режим** (`system`/`light`/`dark`) — `next-themes`, ставит класс `dark`
  на `<html>`.
- **Палитра** (`default`/`github`/`nord`/`catppuccin`/`solarized`) —
  `PaletteProvider` из `src/components/theme-provider.tsx` ставит
  `data-palette` на `<html>` и хранит выбор в `localStorage` (`ids-palette`).

CSS-переменные палитр заданы в `src/globals.css` парами
`[data-palette="…"]:not(.dark)` и `.dark[data-palette="…"]`. Только hex-цвета:
oklch() не поддерживается WebKit2GTK. Inline-скрипт в `index.html` выставляет
`data-palette` до первой отрисовки, чтобы не мигала стандартная палитра.

### Routing (без react-router)

Маршрутизация — через Zustand state `view`:
```
view: "setup" | "workspace" | "editor" | "settings" | "logs"
```

**TUI-режим** — не отдельный view, а переключатель в настройках
(`config.tuiMode`, `data-tui` на `<html>`): рабочая область рендерит
`TuiView` вместо `WorkspaceView`, всё приложение получает терминальный
стиль (моноширинный шрифт, без скруглений/теней, плотнее). Для мигания
без стилей при запуске режим зеркалируется в localStorage (`ids-tui`)
и применяется до первой отрисовки (index.html).

`AppShell` рендерит компонент по `view`. Переходы:
- `setView("settings")` — кнопка шестерёнки в шапке
- `openFolder(number)` → `view = "editor"`
- `closeEditor()` → `view = "workspace"`
- `createDraft()` → `view = "editor"` (новый черновик)

---

# State management (Zustand)

```mermaid
graph LR
    subgraph "Store State"
        FILES[files: Localization[]]
        REPO[repoFiles: Record&lt;string,string&gt;]
        BASE[base: string]
        VIEW[view: View]
        EDIT[editing: &#123;number, fileId&#125;]
        SYNC[syncStatus: green/yellow/red]
        SETTINGS_STATE[settings: &#123;setupComplete, offline&#125;]
        CFG[config: UserConfig<br/>профиль + recentLimit]
    end

    subgraph "Actions"
        INIT[init&#40;&#41;]
        SETUP_ACT[completeSetup&#40;&#41;]
        CREATE[createDraft&#40;&#41;]
        UPSERT[upsertFile&#40;&#41;]
        PATCH[patchFile&#40;&#41;]
        OPEN[openFolder/openFile&#40;&#41;]
        SYNC_ACT[sync&#40;&#41;]
        PREP[prepareRepo&#40;&#41;]
        APPLY[applyProject&#40;&#41;]
    end

    subgraph "Selectors"
        SEL_FOLDERS[selectFolders&#40;&#41;]
    end

    ACTIONS -.->|mutate| FILES
    ACTIONS -.->|mutate| REPO
    ACTIONS -.->|mutate| VIEW
    ACTIONS -.->|mutate| EDIT
    SEL_FOLDERS -->|read| FILES
```

### Store contract (types)

```ts
interface State {
  // Данные
  files: Localization[]              // все локализации (KB + .tmp)
  repoFiles: Record<string, string>  // справочники + шаблон
  base: string                       // путь к папке проекта
  config: UserConfig                 // профиль + recentLimit (папка конфигурации ОС)
  gitIdentityMissing: boolean        // в git не задано имя/email

  // UI
  view: View                         // текущая страница
  editing: { number: string | null; fileId: string | null }
  syncStatus: "green" | "yellow" | "red"

  // Actions
  init: () => Promise<void>
  prepareRepo: (url, folder) => Promise<{ isRepo, branches, folder }>          // clone или проверка папки
  applyProject: (folder, branch | null) => Promise<void>       // checkout + загрузка проекта
  completeSetup: (folder, name, email, branch) => Promise<void>
  createDraft: () => Promise<string>
  upsertFile: (file: Localization) => Promise<void>
  patchFile: (id, patch) => Promise<void>
  openFolder: (number) => void
  openFile: (fileId) => void
  sync: () => Promise<void>
}
```

### Store: действия и их реализация

| Аспект | Реализация (store.ts) |
|---|---|
| Хранилище | invoke() → Rust → ФС |
| `init()` | `invoke("read_localizations")`, `invoke("read_repo_files")` |
| `upsertFile()` | `invoke("write_file")` + state |
| `sync()` | `invoke("git_sync")` (pull+add+commit+push) |
| UUID | polyfill (WebKitGTK) |
| Attachments | на диске + lazy load |

---

# Data model

```mermaid
classDiagram
    class Localization {
        +id: string
        +number: string
        +fileName: string
        +frontmatter: Frontmatter
        +body: string
        +attachments: Attachment[]
        +parentId: string
        +createdAt: number
        +updatedAt: number
        +dirty: boolean
        +synced: boolean
    }

    class Frontmatter {
        +number: string
        +client: string
        +type: string
        +environment: string
        +symptom: string
        +product: string[]
        +version: string
        +flaky: "Да" | "Нет"
        +scope: string
        +root_cause: string
        +resolution: string
        +related: string[]
        +author: string
    }

    class Attachment {
        +path: string
        +name: string
        +dataUrl: string
    }

    class FileEntry {
        +path: string
        +content: string
        +modified: number
    }

    class AttachmentEntry {
        +path: string
        +name: string
        +data_url: string
    }

    Localization --> Frontmatter
    Localization --> Attachment
    FileEntry ..> Localization : parseFileEntries()
    AttachmentEntry ..> Attachment : loadAttachmentsFor()
```

### Файл на диске (Markdown + YAML frontmatter)

```markdown
---
number: SPAS-0001
client: Холдинг Т1
type: Дефект
environment: Прод
# symptom — симптомы, часто название из дефекта
symptom: |-
  При нажатии на кнопку «Сохранить» форма зависает на 3+ секунды.
product: [SPAS-Web, SPAS-API]
# version — версия LTS-релиза и версия проблемного микросервиса, если известна
version: "1.2.3"
# flaky — плавающая ошибка?
flaky: Нет
# scope — массовость проблемы
scope: Единичное
root_cause: Несинхронная валидация блокирует UI-поток.
resolution: Перенесена в Web Worker.
# related — массив связанных задач
related: [SPAS-0005, SPAS-0012]
# author — автор локализации: "ФИО <email>"
author: "Ivan Ivanov iivanov@nota.tech"
---

# Тело документа

Подробное описание проблемы, шаги воспроизведения, логи, скриншоты.

![скриншот](attachments/screenshot-001.png)
```

---

# Файловая система (виртуальный репозиторий)

```mermaid
graph TB
    subgraph "Папка проекта (base)"
        GITIGNORE[.gitignore<br/>.tmp/]
        DICT[.dictionary/]
        TEMPL[_template/]
        TMP[.tmp/]
        KB[База знаний<br/>SPAS-0001/, SPAS-0002/, ...]
    end

    subgraph ".dictionary/"
        D_TYPE[type.yaml]
        D_CLIENT[client.yaml]
        D_ENV[environment.yaml]
        D_PROD[product.yaml]
        D_SCOPE[scope.yaml]
    end

    subgraph "_template/"
        T_LOC[localization.md<br/>эталон]
    end

    subgraph ".tmp/ gitignored"
        TMP_DRAFT[tmp-xxx.md<br/>черновики]
        TMP_CLAR[SPAS-0001.md<br/>черновик с номером]
    end

    subgraph "SPAS-0001/ база знаний"
        LOC[localization.md<br/>главный файл]
        LOC2[localization-2.md<br/>уточнение]
        ATT[attachments/<br/>image.png]
    end

    DICT --> D_TYPE
    DICT --> D_CLIENT
    DICT --> D_ENV
    DICT --> D_PROD
    DICT --> D_SCOPE
    TMP --> TMP_DRAFT
    TMP --> TMP_CLAR
    TMP --> CONFIG2
    KB --> LOC
    KB --> ATT
```

### Что где живёт

| Путь | Содержимое | Синхронизируется? |
|---|---|---|
| `.dictionary/*.yaml` | Справочники (type, client, env, product, scope) | ✓ Git |
| `_template/localization.md` | Эталонный шаблон | ✓ Git |
| `SPAS-XXXX/localization.md` | Главная локализация | ✓ Git |
| `SPAS-XXXX/localization-N.md` | Уточнения | ✓ Git |
| `SPAS-XXXX/attachments/` | Картинки/файлы | ✓ Git |
| `.tmp/tmp-xxx.md` | Недооформленные черновики | ✗ gitignored |
| `.tmp/SPAS-XXXX.md` | Черновик с номером | ✗ gitignored |

**Инвариант:** `.tmp/` — личное (gitignored), всё остальное — база знаний (синхронизируется).

### Настройки пользователя

Профиль (ФИО, email), `recentLimit`, `spaceCode`, путь к текущей папке проекта
и фичи вида (`tuiMode`, `tableView`, `fontScale`) хранятся
**вне папки проекта**, в папке конфигурации ОС (`config_dir` Tauri + `ids/config.yaml`):

| ОС | Путь |
|---|---|
| Linux | `~/.config/ids/config.yaml` |
| macOS | `~/Library/Application Support/ids/config.yaml` |
| Windows | `%APPDATA%\ids\config.yaml` |

При первом запуске новой версии настройки переносятся из старых мест (миграция в `loadConfig`,
старые файлы не удаляются):

- профиль и `recentLimit` — из `.tmp/config.yaml` внутри папки проекта;
- путь к папке — из `app_data_dir/paths.json` (версия 0.2.9).

Если путь в конфиге пуст, приложение показывает мастер настройки. Кнопка «Сброс»
в настройках очищает путь и снова открывает мастер, сохраняя профиль.

Имя и email для git — отдельно: это `user.name`/`user.email` репозитория или глобального
конфига. Если они не заданы, приложение спрашивает их и сохраняет либо в `.git/config`
проекта, либо глобально (выбирает пользователь).

### Редактор Markdown (CodeMirror)

В режиме Live используется CodeMirror 6 (`@codemirror/lang-markdown`) с плагином
декораций `src/lib/markdown-live-preview.ts`. Исходник остаётся настоящим Markdown:
декорации только скрывают/оформляют разметку, но не переписывают документ.

| Что | Вне строки с курсором | В строке с курсором |
|---|---|---|
| Заголовки `#` | маркеры скрыты, крупный шрифт | маркеры видны |
| `**жирный**`, `*курсив*`, `~~зачёркнутый~~` | маркеры скрыты, текст оформлен | разметка видна |
| `` `код` `` | обратные кавычки скрыты | разметка видна |
| `[текст](url)` | скобки и URL скрыты, текст — ссылкой | разметка видна |
| `![alt](attachments/...)` | картинка из вложений (клик → предпросмотр) | Markdown-исходник |
| `- [ ]` / `- [x]` | чекбокс, клик переключает | скобки видны |
| GFM-таблицы | отрисованы виджетом (курсор внутри → исходник) | видны |
| блоки ``` | фон и моноширинный шрифт | маркеры видны |
| ```diff | строки `+`/`-`/`@@` подсвечены зелёным/красным/синим | маркеры видны |

Режимы: **Live** (по умолчанию при редактировании), **Исходник** (тот же CodeMirror
без декораций), **Совмещённо** (исходник + `react-markdown`) и **Просмотр**.
Экземпляр CodeMirror создаётся один раз, а его DOM переносится между вкладками,
поэтому undo/redo и позиция курсора сохраняются при переключении режимов.

Производительность Live: инлайн-декорации строятся только для видимой области
(`view.visibleRanges`, пересчёт при скролле через `viewportChanged`), состояние
code-fence трекается по всему документу — см. нюанс ниже. Произвольный HTML
в Live показывается как исходный текст — это осознанное ограничение.

---

# Tauri IPC (десктоп-версия)

```mermaid
sequenceDiagram
    participant F as Frontend (React)
    participant S as Store (Zustand)
    participant R as Rust (commands.rs)
    participant FS as ФС / Git

    Note over F,FS: init() при запуске
    F->>S: useStore.getState().init()
    S->>R: invoke("read_app_config")
    R->>FS: read <config>/ids/config.yaml
    FS-->>R: folder path + профиль
    R-->>S: config
    Note over S,R: если folder пуст — invoke("read_legacy_folder")<br/>из app_data_dir/paths.json (0.2.9)
    S->>R: invoke("init_project", {folder})
    R->>FS: git pull --ff-only (if .git)
    R->>FS: mkdir .dictionary, _template, .tmp
    R->>FS: write default dicts if missing
    R-->>S: Ok
    S->>R: invoke("read_repo_files", {base})
    R->>FS: read .dictionary/*.yaml, _template, .tmp/config.yaml
    FS-->>R: file contents
    R-->>S: HashMap<path, content>
    S->>R: invoke("read_localizations", {base})
    R->>FS: scan */localization*.md + .tmp/*.md
    FS-->>R: FileEntry[] (path, content, modified)
    R-->>S: entries
    S->>S: parseFileEntries → Localization[]
    S->>S: set({files, view: "workspace"})
```

### Команды Rust ↔ Frontend

| Rust-команда | Аргументы | Возвращает | Фронтенд-вызов |
|---|---|---|---|
| `read_legacy_folder` | — | `String` (путь) | `init()` (миграция 0.2.9) |
| `git_pull_only` | `folder` | `()` | фоновый pull при открытии проекта |
| `init_project` | `folder: String` | `()` | `init()`, `completeSetup()` |
| `read_repo_files` | `base: String` | `HashMap<String, String>` | `init()` |
| `read_localizations` | `base: String` | `Vec<FileEntry>` | `init()` |
| `read_attachments` | `base, number` | `Vec<AttachmentEntry>` | `loadAttachmentsFor()` |
| `write_file` | `base, path, content` | `()` | `writeLoc()`, `upsertFile()` |
| `write_attachment` | `base, path, data_url` | `()` | `writeLoc()` (binary) |
| `delete_file` | `base, path` | `()` | `patchFile()` (old .tmp) |
| `git_sync` | `base, commit_message, author...` | `()` | `sync()` |
| `git_clone` | `url, folder` | `Option<String>` — фактическая папка | `prepareRepo()` (непустая папка → подпапка `<папка>/<имя-репо>`) |
| `git_branches` | `folder` | `Vec<String>` | `prepareRepo()` |
| `git_checkout_pull` | `folder, branch` | `()` | `applyProject()` |
| `git_identity` | `folder` | `{name, email}` | `loadProject()` |
| `git_set_identity` | `folder, name, email, global` | `()` | `saveGitIdentity()` |
| `read_app_config` | — | `Option<String>` | `init()`, `loadConfig()` |
| `write_app_config` | `content` | `()` | `writeConfig()` |
| `read_logs` | — | `String` | `LogsView` (журнал) |
| `export_logs` | `path` | `()` | `LogsView` (выгрузка) |
| `log_event` | `kind, message` | `()` | `logWork()` (store) |

Команды, которые ходят в сеть (`init_project`, `git_sync`, `git_branches`, `git_clone`,
`git_checkout_pull`), — `async` и выполняются в фоновом потоке (`blocking()`): синхронная
команда Tauri выполняется на главном потоке и замораживает окно.

### CREATE_NO_WINDOW (Windows)

Все `git`-вызовы — через `git_command()` хелпер:
```rust
fn git_command(args: &[&str]) -> Command {
    let mut cmd = Command::new("git");
    cmd.args(args);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }
    cmd
}
```
Без этого на Windows GUI-приложение создаёт видимое консольное окно при каждом `git pull/sync`.

---

# Ключевые сценарии (sequence diagrams)

## 1. Создание локализации (createDraft → save → sync)

```mermaid
sequenceDiagram
    participant U as Пользователь
    participant W as WorkspaceView
    participant S as Store
    participant R as Rust
    participant G as Git

    U->>W: «+ Новая локализация»
    W->>S: createDraft()
    S->>S: uuid() (polyfill для WebKitGTK)
    S->>S: readTemplate() → frontmatter + body
    S->>S: file = {id, number:"", fileName:".tmp/tmp-xxx.md", dirty:true}
    S->>S: files.push(file), view="editor"
    S->>R: write_file(".tmp/tmp-xxx.md", serializeDocument(fm, body))
    R-->>S: Ok
    S-->>W: editor open

    Note over U,S: Пользователь заполняет frontmatter + тело

    U->>S: «Сохранить» (Ctrl+S)
    S->>S: validate() — все поля заполнены?
    alt Не заполнено
        S-->>U: AlertDialog «Нельзя сохранить...»
    else Заполнено
        S->>S: fileToFolder() — .tmp → SPAS-XXXX/localization.md
        S->>R: delete_file(".tmp/tmp-xxx.md")  (старый путь)
        S->>R: write_file("SPAS-XXXX/localization.md", serializeDocument)
        S->>R: write_attachment("SPAS-XXXX/attachments/img.png", dataUrl)
        S->>S: files.update(file), syncStatus="yellow"
    end

    U->>S: «Синхронизировать»
    S->>R: git_sync(base, "[SPAS-0001] Создана локализация", author)
    R->>G: git pull --rebase
    R->>G: git add -A
    R->>G: git commit -m "[SPAS-0001] Создана локализация" --author="..."
    R->>G: git push
    G-->>R: Ok
    R-->>S: Ok
    S->>S: files.map(f => f.dirty=false), syncStatus="green"
```

## 2. Открытие локализации на просмотр (с attachments)

```mermaid
sequenceDiagram
    participant U as Пользователь
    participant W as WorkspaceView
    participant S as Store
    participant R as Rust
    participant FS as ФС

    U->>W: клик на SPAS-0001
    W->>S: openFolder("SPAS-0001")
    S->>S: main = files.find(f => f.number === "SPAS-0001" && f.fileName === "localization.md")
    S->>R: invoke("read_attachments", {base, number:"SPAS-0001"})
    R->>FS: read_dir("SPAS-0001/attachments/")
    loop для каждого файла
        R->>FS: read bytes
        FS-->>R: bytes
        R->>R: base64 encode + guess_mime
        R->>S: AttachmentEntry{path, name, data_url}
    end
    S->>S: files[main.id].attachments = loaded
    S->>S: set({view:"editor", editing:{number, fileId}})
    Note over S: EditorView рендерится с заполненными attachments
    S-->>W: editor open
    W->>U: EditorView (frontmatter свёрнут, body виден)
```

**Важно:** `loadAttachmentsFor()` вызывается ДО `set({editing})` — к моменту рендера
EditorView `activeFile.attachments` уже заполнен, useEffect инициализирует локальный state.

## 3. Уточнение локализации (clarify)

```mermaid
sequenceDiagram
    participant U as Пользователь
    participant E as EditorView
    participant S as Store
    participant R as Rust

    U->>E: «Уточнить локализацию»
    E->>S: clarify()
    S->>S: parent = editing.file (localization.md)
    S->>S: siblings = files.filter(f => f.number === parent.number)
    S->>S: idx = max(localization-N.md) + 1
    S->>S: file = {number:parent.number, fileName:"localization-{idx}.md", parentId:parent.id}
    S->>S: frontmatter = {...parent.frontmatter} (копия)
    S->>S: body = template.body (пустой шаблон)
    S->>R: write_file("SPAS-XXXX/localization-{idx}.md", serializeDocument)
    S->>S: files.push(file), editing.fileId = new id
    S-->>E: editor открыт на уточнении
```

---

# Frontmatter сериализация (кастомный YAML)

```mermaid
graph LR
    subgraph "Frontmatter (TS object)"
        FM[Frontmatter<br/>13 полей]
    end

    subgraph "serializeFrontmatter()"
        ORDER[Фиксированный порядок полей<br/>number → client → type → env →<br/>symptom → product → version → ...]
        COMMENT[Комментарии из эталона<br/># symptom — симптомы...]
        BLOCK[block scalar |-<br/>symptom, root_cause, resolution]
        FLOW[flow массивы<br/>product: [a, b, c]]
        QUOTE[doubleQuote для опасных<br/>version: "1.2"]
    end

    subgraph "YAML output"
        YAML[---<br/>number: SPAS-0001<br/>...<br/>---]
    end

    FM --> ORDER
    ORDER --> COMMENT
    ORDER --> BLOCK
    ORDER --> FLOW
    ORDER --> QUOTE
    COMMENT --> YAML
    BLOCK --> YAML
    FLOW --> YAML
    QUOTE --> YAML
```

**Почему не `js-yaml`?**
- `js-yaml` не сохраняет порядок полей (сортирует по алфавиту)
- `js-yaml` не сохраняет комментарии
- Эталонный шаблон требует точного воспроизведения (порядок + комментарии + block scalar `|-`)

Кастомный сериализатор (~110 строк) гарантирует:
1. Порядок полей — как в эталоне
2. Комментарии перед `symptom`, `product`, `version`, `flaky`, `scope`, `related`, `author`
3. `symptom` — block scalar `|-` (многострочный)
4. `root_cause`/`resolution` — block scalar если есть переносы
5. `product`/`related` — flow массивы `[a, b]`
6. Строки с опасными символами — double-quoted

---

# CI/CD pipeline

```mermaid
flowchart TB
    DEV[Разработчик<br/>git tag v0.2.0<br/>git push origin v0.2.0]

    subgraph "release.yml (trigger: tag v*)"
        CHECK[1. Проверка<br/>src-tauri/ существует?]
        REL[2. Ensure draft release<br/>gh release create --draft<br/>fail-fast on permission]
        SETUP[3. setup-bun + setup-node + rust-toolchain]
        VARS[4. Set version from tag<br/>v0.2.0 → 0.2.0<br/>tauri.conf + Cargo.toml + package.json]
        SIGN[5. macOS signing env<br/>conditional APPLE_* secrets]
        BUILD[6. tauri-action<br/>build per platform]
        PORT[7. Package portable Windows zip<br/>7z + README]
        UP[8. Upload portable to release<br/>gh release upload --clobber]
    end

    subgraph "Matrix (параллельно)"
        LIN[ubuntu-22.04<br/>.deb + .AppImage]
        WIN[windows-latest<br/>.msi + .exe + portable.zip]
        MAC[macos-latest<br/>.app + .dmg]
    end

    DEV --> CHECK
    CHECK --> REL
    REL --> SETUP
    SETUP --> VARS
    VARS --> SIGN
    SIGN --> BUILD
    BUILD --> LIN
    BUILD --> WIN
    BUILD --> MAC
    LIN --> UP
    WIN --> PORT
    PORT --> UP
    MAC --> UP

    UP --> REL_GH[GitHub Draft Release<br/>v0.2.0]
```

### Артефакты по платформам

| Платформа | Артефакты | Зависимости |
|---|---|---|
| **Linux** | `.deb`, `.AppImage` | libwebkit2gtk-4.1 (системная) |
| **Windows** | `.msi` (инсталлер), `.exe` NSIS (инсталлер), `.zip` (portable) | WebView2 runtime (Win11 предустановлен, Win10 — bootstrapper) |
| **macOS** | `.app`, `.dmg` | WKWebView (системный). Unsigned → `xattr -cr`. Notarized → если APPLE_* secrets заданы |

### Шаги release.yml (14 шагов)

```
1.  actions/checkout
2.  Проверка src-tauri
3.  Ensure draft release (fail-fast on permission)
4.  oven-sh/setup-bun
5.  actions/setup-node (v22)
6.  dtolnay/rust-toolchain
7.  Linux system deps (webkit2gtk-4.1) [ubuntu only]
8.  Install frontend deps (bun install)
9.  Generate icons (logo.svg → tauri icon)
10. Set version from git tag (v0.2.0 → 0.2.0)
11. Prepare macOS signing env (conditional APPLE_*)
12. tauri-apps/tauri-action (build + upload to release)
13. Package portable Windows zip [windows only]
14. Upload portable zip to GitHub Release [windows only]
```

---

# Deployment

## Десктоп-версия (Tauri)

```mermaid
graph LR
    IDS_SRC[repo/<br/>src/ + src-tauri/]
    BUILD_SH[build.sh<br/>bun install + build-icons + tauri build]
    TARG[src-tauri/target/release/bundle/]
    ART[artifacts/<br/>копия для хоста]

    IDS_SRC --> BUILD_SH
    BUILD_SH --> TARG
    TARG --> ART
```

### Cross-platform сборка

| Где | Как | Артефакт |
|---|---|---|
| Linux (Docker) | `docker compose --profile tauri run --rm tauri` → `bash build.sh` | `.deb`, `.AppImage` |
| Windows | на Windows: `bash build.sh` | `.msi`, `.exe`, `.zip` |
| macOS | на macOS: `bash build.sh` | `.app`, `.dmg` |
| **CI (matrix)** | `git tag v* && git push origin v*` → release.yml | все 3 платформы |

**Кросс-компиляция невозможна** — Tauri требует нативный Rust + системный WebView для каждой платформы.

---

# Безопасность

```mermaid
graph TB
    subgraph "Tauri capabilities"
        CORE[core:default<br/>базовые пермиссии]
        CLIP[clipboard-manager:<br/>allow-read-image]
    end

    subgraph "Файловая изоляция"
        BASE[base = папка проекта<br/>выбранная пользователем]
        NO_HOME[настройки в config_dir/ids<br/>не в папке проекта]
        GITIGNORE[.tmp/ gitignored<br/>черновики + конфиг не синхронятся]
    end

    subgraph "Git auth"
        HOST[системный git<br/>credential helper / SSH agent хоста]
        NO_APP[приложение НЕ хранит<br/>токены/пароли]
    end

    subgraph "macOS signing"
        UNSIGNED[unsigned<br/>xattr -cr пользователем]
        SIGNED[notarized<br/>если APPLE_* secrets заданы]
    end

    CORE --> BASE
    CLIP --> BASE
    BASE --> GITIGNORE
    HOST --> NO_APP
```

### Threat model

| Угроза | Защита |
|---|---|
| Arbitrary file read/write | Все пути — относительно `base` (папка проекта). Rust `join(base, rel)` — не выходит за base. |
| Credential leak | Git auth — через системный git (credential helper/SSH). Приложение не трогает. |
| Local drafts sync | `.tmp/` в `.gitignore` — черновики + config никогда не уходят в remote. |
| Clipboard access | `clipboard-manager:allow-read-image` — только чтение, не запись. |
| Unsigned macOS app | `xattr -cr` workaround (README §7) или notarization (APPLE_* secrets). |

---

# Известные нюансы (и почему так)

## 1. UUID polyfill (WebKit2GTK)

```mermaid
graph LR
    CALL[createDraft / clarify]
    UUID[uuid&#40;&#41;]
    CHECK{crypto.randomUUID<br/>exists?}
    NATIVE[crypto.randomUUID&#40;&#41;<br/>Windows/macOS/modern WebKit]
    FALLBACK[Math.random pattern<br/>xxxxxxxx-4xxx-yxxx-...]
    CRASH[TypeError → белый экран]

    CALL --> UUID
    UUID --> CHECK
    CHECK -->|yes| NATIVE
    CHECK -->|no| FALLBACK
    NATIVE -.->|WebKitGTK &lt; 2.40| CRASH
    FALLBACK -.->|работает везде| OK[ok]
```

WebKit2GTK на Ubuntu 22.04 (~2.38) не имеет `crypto.randomUUID()` → crash → белый экран.
Polyfill: проверка `typeof crypto.randomUUID === 'function'`, fallback на `Math.random`.

## 2. oklch() → hex (WebKit2GTK CSS)

shadcn/ui тема использует `oklch()` (CSS Color Level 4). WebKit2GTK ~2.38 не поддерживает → все 62 color variables invalid → transparent → белый экран. Фикс: oklch → hex/rgba конверсия.

## 3. CRLF → LF (Windows frontmatter)

```mermaid
graph LR
    WIN[Windows git checkout<br/>core.autocrlf=true]
    CRLF[файлы с \r\n]
    REGEX[regex /^---\n.../]
    NOMATCH[не матчит ---\r\n]
    BUG[m=null → body = весь файл<br/>frontmatter в теле]

    WIN --> CRLF
    CRLF --> REGEX
    REGEX --> NOMATCH
    NOMATCH --> BUG

    FIX[normalize: content.replace&#40;\r\n, \n&#41;<br/>перед regex]
    CRLF -.->|fix r42| FIX
```

Windows git конвертирует LF → CRLF при checkout. Regex на `\n` не матчит `---\r\n` → парсинг ломается. Фикс: нормализация перед regex + `serializeDocument` нормализует body + `.gitattributes` (`eol=lf`).

## 4. Ctrl+V картинок на Linux (WebKit2GTK)

```mermaid
graph TB
    PASTE[Ctrl+V в textarea]
    ITEMS[clipboardData.items]
    CHECK{image File item?}
    WIN_PATH[Windows/macOS<br/>getAsFile → handleImageFile]
    LIN_EMPTY[Linux WebKitGTK<br/>items не экспонирует image]
    FALLBACK[readImage&#40;&#41; plugin<br/>arboard: X11 clipboard]
    CANVAS[canvas RGBA → PNG<br/>toDataURL]
    INSERT[insertImageAttachment]

    PASTE --> ITEMS
    ITEMS --> CHECK
    CHECK -->|yes| WIN_PATH
    CHECK -->|no text| FALLBACK
    WIN_PATH --> INSERT
    FALLBACK --> CANVAS
    CANVAS --> INSERT
```

WebKit2GTK на Linux не экспонирует image как `File` item в `clipboardData`. Tauri clipboard-manager плагин (arboard под капотом) читает системный буфер напрямую. RGBA → PNG через canvas.

## 5. Сглаживание шрифта (Linux WebKit2GTK)

```mermaid
graph LR
    TYPE[Ввод текста в редакторе]
    SUBPIX[subpixel antialiasing]
    FLICKER[текст мерцает: жирный ↔ нормальный]
    FIX[grayscale: -webkit-font-smoothing:antialiased<br/>+ text-rendering:optimizeSpeed]

    TYPE --> SUBPIX --> FLICKER
    FIX -.->|textarea и CodeMirror| OK2[ok]
```

Subpixel antialiasing в WebKit2GTK вызывает мерцание веса текста при наборе.
Фикс (grayscale AA + `optimizeSpeed`) применён **глобально** в `globals.css`
(`html { -webkit-font-smoothing: antialiased; text-rendering: optimizeSpeed }`)
и покрывает всё приложение; точечные применения (TEXTAREA_CLASS в
`markdown-editor.tsx`, тема `markdownEditorTheme` в `markdown-live-preview.ts`)
сохранены для явности.

## 6. Журнал работы и git

```mermaid
graph LR
    GIT[git-команды<br/>run_git в commands.rs]
    APP[события store<br/>invoke log_event]
    FILE[(config_dir/ids/app.log<br/>ротация 4МБ → app.log.1)]
    VIEW[LogsView<br/>вкладки Работа/Git]

    GIT -->|kind git| FILE
    APP -->|kind app| FILE
    FILE -->|read_logs| VIEW
    VIEW -->|export_logs + save-диалог| OUT[txt-файл у пользователя]
```

Единый журнал в `<config_dir>/ids/app.log`, строки `YYYY-MM-DD HH:MM:SS.mmm [kind] message`
(kind = `app` | `git`). Git-команды журналируются автоматически хелпером
`run_git` (строка запуска + код выхода + stderr при ошибке; одиночные
`git config user.name/email` в `git_identity` не логируются — exit 1 при
незаданном значении создавал бы шум). События уровня пользователя (черновики,
сохранение, синхронизация) присылает store через `log_event`. Раздел «Журнал»
в шапке — только просмотр с фильтром по вкладкам и кнопкой выгрузки в txt.

## 7. TUI-режим (TuiView + data-tui)

**Опция в настройках** («Режим работы» → TUI-режим), а не вкладка: включается
на всё приложение. Рабочая область рендерит TuiView, весь UI получает
терминальную эстетику через `html[data-tui]` CSS (моноширинный шрифт,
`border-radius: 0`, без теней/блюра, базовый шрифт 14px — плотнее).
Хранится в config.yaml (`tuiMode: true`), зеркалируется в localStorage
для применения до первой отрисовки.

```mermaid
graph LR
    KEY[клавиатура<br/>j/k/g/G/Enter/n/s/d//q/Esc]
    LIST[список локализаций<br/>моно-шрифт, панели с бордерами]
    GAUGE[ASCII-gauges<br/>СИНХР [████░░] 80%]
    ACT[действия store<br/>openFolder/createDraft/sync/removeFile]

    KEY --> ACT
    ACT --> LIST
    FILES[store files] --> LIST
    FILES --> GAUGE
```

- Шапка: путь проекта (~-сокращение) + статус синхронизации.
- Панель индикаторов: локализаций / черновиков / ASCII-gauge
  синхронизации / продуктов в справочнике.
- Вкладки «Локализации» / «Черновики», фильтр по `/`, сортировка как в «Все».
- Клавиатура: `j/k` (стрелки тоже), `g/G` — начало/конец, `Enter` — открыть
  (карточку или черновик), `n` — новый черновик, `s` — синхронизация,
  `d` — удалить черновик (только вкладка «Черновики», с подтверждением),
  `v` — шторка предпросмотра, `/` — фильтр, `Esc`/`q` — выход в рабочую
  область. `Tab` обходит элементы управления (вкладки, фильтр, строки —
  фокус строки синхронизирует выбор). Мышь: клик — выбор, клик по выбранной
  или двойной — открыть; выбранная строка автоскроллится.
- **Шторка предпросмотра** (`v` или кнопка): справа рендерится Markdown
  активной записи (те же плагины, что в Просмотре редактора; вложения
  резолвятся), ширина ~1/3, перетаскивается, следует за выбором в списке.

## 8. Состояние синхронизации (syncStatus)

Точность «жёлтого» индикатора — два слоя: мгновенная эвристика и реальный git.

```mermaid
graph LR
    MUT[мутации store<br/>patch/upsert/remove/clarify]
    KB{затрагивает<br/>базу знаний?}
    YEL[syncStatus = yellow<br/>мгновенно]
    TMP[.tmp-черновики —<br/>статус НЕ трогаем]
    GIT[git_sync_state<br/>status --porcelain без .tmp<br/>+ rev-list @{u}..HEAD]
    REF[refreshSyncState после<br/>loadProject / pull / sync]
    RES[green / yellow<br/>по факту]

    MUT --> KB
    KB -->|да| YEL
    KB -->|нет| TMP
    REF --> GIT --> RES
```

- **Мгновенная эвристика:** любое изменение базы знаний (запись, удаление,
  уточнение, справочники) ставит `yellow` сразу — без похода в git.
  `.tmp`-черновики не трогают статус (они gitignored, синхронизировать
  нечего) — раньше автосохранение черновика держало индикатор жёлтым вечно.
- **Сверка с реальностью** (`git_sync_state`): uncommitted = строки
  `git status --porcelain` с pathspec `:(exclude).tmp` (staged + unstaged +
  untracked), unpushed = `git rev-list --count @{upstream}..HEAD` (нет
  upstream → 0). `refreshSyncState()` вызывается после открытия проекта,
  фонового pull и успешной синхронизации; красный (ошибка) и offline не
  перетирает. Команда `sync()` коммитит всё, что dirty в базе знаний, делает
  `pull --rebase` + `push`; `.tmp` исключён и из статуса, и из commit-сообщения.

---

# Файлы проекта (карта)

```
ids/
├── src/                          # Десктоп-фронтенд (Vite + React) — единственный таргет
│   ├── main.tsx                  #   ErrorBoundary + Root
│   ├── components/               #   app-shell, workspace-view, editor-view,
│   │   └── ui/                   #   frontmatter-form, markdown-editor, settings-view,
│   │                             #   setup-wizard; ui/ — shadcn/ui
│   └── lib/
│       ├── store.ts              #   Zustand store (invoke → Rust)
│       ├── theme.ts              #   список палитр, хранение и применение data-palette
│       ├── markdown-live-preview.ts  #   live-декорации CodeMirror (Obsidian-like)
│       └── ...                   #   frontmatter, repo, types, template
├── src-tauri/                    # Rust-бэкенд (Tauri 2)
│   ├── src/
│   │   ├── main.rs               #   entry
│   │   ├── lib.rs                #   register commands + plugins
│   │   └── commands.rs           #   Rust-команды (ФС, git, clipboard)
│   ├── Cargo.toml                #   deps: tauri, serde, base64, clipboard
│   ├── tauri.conf.json           #   productName, bundle targets
│   └── capabilities/
│       └── default.json          #   permissions
├── public/logo.svg               # Исходная иконка приложения
├── build.sh                      # turnkey: install + icons + tauri build
├── build-icons.sh                # logo.svg → tauri icons
├── vite.config.ts                # Vite + @tailwindcss/vite
├── package.json, bun.lock
│
├── .github/workflows/
│   ├── ci.yml                    #   frontend: bun run build (push/PR)
│   └── release.yml               #   Tauri matrix: ubuntu/windows/macos (tag v*)
│
├── docker/
│   └── tauri.Dockerfile          #   Rust + webkit2gtk + bun
├── docker-compose.yml            #   сервис tauri
├── clean.sh                      #   очистка build-артефактов
├── .gitattributes                #   eol=lf (превент CRLF на Windows)
└── README.md
```

---

# Сводка технических решений

| Решение | Почему | Альтернатива | Почему нет |
|---|---|---|---|
| Кастомный YAML-сериализатор | Порядок полей + комментарии + block scalar | js-yaml | Не сохраняет порядок и комментарии |
| Zustand (не Redux) | Простой, без boilerplate, hooks-native | Redux Toolkit | Слишком много кода для малого проекта |
| Tauri 2 (не Electron) | Меньший размер (~10МБ vs ~100МБ), Rust backend, системный WebView | Electron | Тяжёлый (Chromium в каждом app) |
| shadcn/ui (не MUI) | Копирование исходников (контроль), Tailwind-native | MUI / Ant Design | emotion/JSS, не Tailwind, тяжелее |
| Rust на host git (не git2 crate) | Системный credential helper/SSH работает | git2 crate | Нужен SSH-ключ в приложении |
| .tmp/ gitignored | Локальные черновики + конфиг не синхронятся | Синхронить .tmp | Конфликт засекреченных данных |
| Путь проекта в config.yaml | Все настройки в одном месте; при пустом пути — мастер | paths.json в app_data_dir | Два файла, папки с identifier |
| CRLF normalize в JS | Работает даже если .gitattributes не применился | Только .gitattributes | Git на Windows может override |
| oklch → hex | WebKit2GTK Ubuntu 22.04 не поддерживает oklch | oklch + @supports | @supports для oklch ненадёжный |
| UUID polyfill | WebKit2GTK < 2.40 нет crypto.randomUUID | Только crypto.randomUUID | Crash на Ubuntu 22.04 |
| CREATE_NO_WINDOW | Windows GUI spawn-ит видимое консольное окно | Показывать консоль | UX: мигает при каждом git call |

---

*Архитектурный документ проекта IDS (Issue Documentation System).*
*Диаграммы: Mermaid (рендерится на GitHub).*

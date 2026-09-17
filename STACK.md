# IDS — стек технологий и роадмап изучения

> Документ для Java-разработчика: перечень технологий проекта IDS и план изучения с нуля.

---

# Архитектура проекта

```
IDS
├── Веб-версия (Next.js 16)     ← браузер, данные в localStorage
├── Десктоп-версия (Tauri 2)    ← нативное окно, данные в реальной ФС + Git
│   ├── Фронтенд: Vite + React  (тот же код, что и веб)
│   └── Бэкенд:   Rust          (файловая система, git CLI)
├── CI/CD: GitHub Actions        ← сборка под Linux/Windows/macOS
└── Docker                       ← изолированная среда сборки
```

---

# Полный перечень технологий

| Слой | Технология | Версия | Где используется | Java-аналог |
|---|---|---|---|---|
| **Язык (фронт)** | TypeScript | 5 | Везде | Java (но структурная типизация) |
| **Язык (бэк)** | Rust | 2021 ed. | Tauri-бэкенд | Java/C++ (но ownership model) |
| **UI-библиотека** | React | 19 | Везде | Swing/JavaFX (декларативный) |
| **Фреймворк (веб)** | Next.js | 16 | Веб-версия | Spring Boot |
| **Сборщик (десктоп)** | Vite | 6 | Tauri-фронтенд | Maven/Gradle (для фронта) |
| **Десктоп-фреймворк** | Tauri | 2 | ids-desktop | Electron (но на Rust) |
| **CSS-фреймворк** | Tailwind CSS | 4 | Везде | — (нет аналога в Java) |
| **UI-компоненты** | shadcn/ui | New York | Везде | — (готовые виджеты) |
| **State management** | Zustand | 5 | Везде | Singleton pattern |
| **Маршрутизация** | App Router | — | Веб-версия | Spring MVC routes |
| **Темы** | next-themes | 0.4 | Везде | — |
| **Markdown** | react-markdown | 10 | Редактор тела | — |
| **Иконки** | lucide-react | — | Везде | — |
| **Сериализация** | serde / serde_json | 1 | Rust↔JSON | Jackson |
| **Base64** | base64 crate | 0.22 | Вложения | java.util.Base64 |
| **Package manager** | Bun | 1.x | Фронтенд | Maven (но быстрее) |
| **CI/CD** | GitHub Actions | — | release.yml, ci.yml | Jenkins/GitLab CI |
| **Контейнеризация** | Docker | — | docker-compose, Dockerfile | — |
| **VCS** | Git | — | Везде | Git |

### Дополнительные библиотеки (из package.json)

| Библиотека | Назначение | Java-аналог |
|---|---|---|
| class-variance-authority | Варианты стилей (cva) | — |
| clsx | Условные классы | — |
| tailwind-merge | Слияние Tailwind-классов | — |
| cmdk | Command palette | — |
| embla-carousel-react | Карусель | — |
| input-otp | OTP-инпут | — |
| react-day-picker | Календарь | JCalendar |
| react-hook-form | Формы (есть в deps, не используется) | — |
| react-resizable-panels | Сплит-панели | JSplitPane |
| recharts | Графики | JFreeChart |
| sonner / toaster | Уведомления | JOptionPane |
| vaul | Drawer (выдвижная панель) | — |
| @resvg/resvg-js | SVG → PNG (иконки) | Apache Batik |

---

# Роадмап изучения с нуля

## Фаза 1: JavaScript → TypeScript (основа)

**Зачем:** весь фронтенд на TS. Это база, без которой дальше нельзя.

**Java-аналогия:** TypeScript = JavaScript + статическая типизация (как Java поверх JS). Но типизация **структурная** (duck typing), а не номинальная (как Java).

### Что учить (по порядку):

#### 1. JavaScript основы (ES6+)
- `let`/`const`/`var`, типы (string/number/boolean/null/undefined/symbol/bigint)
- Функции: стрелочные `() => {}`, default params, rest/spread
- Массивы: `map`/`filter`/`reduce`/`find`/`some`/`every` (как Java Streams, но встроенные)
- Объекты: деструктуризация `const {a, b} = obj`, shorthand
- Промиссы: `Promise`, `async`/`await` (как `CompletableFuture` в Java)
- Модули: `import`/`export` (ESM, не CommonJS `require`)

#### 2. TypeScript
- Типы: `string`, `number`, `boolean`, `string[]`, `[string, number]` (tuple)
- Интерфейсы `interface` и `type` — структурная типизация
- `Optional chaining` `obj?.field`, `nullish coalescing` `x ?? default`
- `Generics` `<T>` — как Java дженерики, но мощнее (constraints, conditional types)
- `Union types` `string | number`, `intersection` `A & B`
- `Type narrowing` (instanceof, typeof, in)
- `as` assertions (необычно для Java — ручной каст)

### Пример (из проекта IDS):

```ts
// types.ts — доменные типы (как Java record/POJO)
export interface Frontmatter {
  number: string        // "SPAS-0001"
  client: string
  type: string          // "Дефект" | "Консультация" | "Задача"
  environment: string   // "Препрод" | "Прод"
  symptom: string
  product: string[]
  version: string
  flaky: "Да" | "Нет"   // union type — literal types
  scope: string
  root_cause: string
  resolution: string
  related: string[]
  author: string
}

// frontmatter.ts — функция с дженериками
export function nextNumber(numbers: string[]): string {
  let max = 0
  for (const n of numbers) {
    const m = NUMBER_RE.exec(n.trim())
    if (m) max = Math.max(max, parseInt(m[1], 10))
  }
  return `SPAS-${String(max + 1).padStart(4, "0")}`
}
```

### Ресурсы:
- **[TypeScript Handbook](https://www.typescriptlang.org/docs/handbook/)** — официальный, лучший старт
- **[JavaScript.info](https://javascript.info/)** — полный курс JS
- **[Total TypeScript](https://www.totaltypescript.com/)** — продвинутый TS
- Книга: *"Effective TypeScript"* by Dan Vanderkam

### Время: ~2-3 недели (Java-разработчику легче — типизация знакома)

---

## Фаза 2: React (UI-библиотека)

**Зачем:** весь UI построен на React-компонентах.

**Java-аналогия:** React-компонент = Java-класс расширяющий `JComponent`, но **декларативный** (описываешь ЧТО должно быть, а не КАК рисовать). Состояние — как поля класса, но через хуки.

### Ключевые концепции:

#### 1. JSX — HTML-подобный синтаксис в JS
```tsx
const Button = ({ label }: { label: string }) => (
  <button className="px-4 py-2 rounded">{label}</button>
)
```
Java-аналог: нет прямого, ближе к JSX в библиотеках типа Wicket.

#### 2. Компоненты — функции, возвращающие JSX
- Props (входные данные, как параметры конструктора)
- Children (вложенный контент)
```tsx
const Card = ({ children }: { children: React.ReactNode }) => (
  <div className="border rounded-lg p-4">{children}</div>
)
```

#### 3. Хуки (React 19)
- `useState(initValue)` — состояние компонента (как mutable поле)
- `useEffect(() => {}, [deps])` — побочные эффекты (как `@PostConstruct` + listener)
- `useMemo(() => fn, [deps])` — мемоизация (как кэш)
- `useCallback(fn, [deps])` — стабильная ссылка на функцию
- `useRef(initial)` — изменяемая ссылка (как `AtomicReference`, но без rerender)

```tsx
// Пример из editor-view.tsx
function EditorView() {
  const [fmOpen, setFmOpen] = React.useState(true)  // состояние
  const activeFile = useStore((s) => s.files.find(f => f.id === editing.fileId))

  React.useEffect(() => {
    if (!activeFile) return
    setFm(activeFile.frontmatter)
  }, [editing.fileId])  // зависит от fileId

  return <Collapsible open={fmOpen}>{...}</Collapsible>
}
```

#### 4. Ререндеринг — когда state меняется, компонент перерисовывается
- Важно: иммутабельность (`setState({...prev, field: val})`, не mutate)

#### 5. Context API — dependency injection
- `createContext` → `Provider` → `useContext`
- Как Spring `@Autowired`, но для UI

#### 6. React 19 особенности:
- `use()` — новый хук для промиссов/context
- Server Components (в Next.js)
- `ref` как обычный prop (без `forwardRef`)

### Ресурсы:
- **[React.dev](https://react.dev/)** — лучший Tutorial (переписан в 2023)
- **[Epic React](https://epicreact.dev/)** by Kent C. Dodds — продвинутый курс
- Книга: *"React in Action"* by Mark Tello

### Время: ~3-4 недели

---

## Фаза 3: CSS + Tailwind CSS 4

**Зачем:** стилизация. Tailwind = utility-first CSS фреймворк.

**Java-аналогия:** нет прямого. CSS — это язык описания визуала. Tailwind = "inline-стили через классы".

### Что учить:

#### 1. CSS основы
- Селекторы (`.class`, `#id`, `tag`, `>` child, `+` sibling)
- Box model (margin/border/padding/content)
- Flexbox (`display: flex`, `flex-direction`, `justify-content`, `align-items`)
- Grid (`display: grid`, `grid-template-columns`, `gap`)
- Responsive: `@media (min-width: 768px)`
- CSS Variables (`--color: #fff`, `var(--color)`)

#### 2. Tailwind CSS 4
- Utility classes: `bg-white text-black p-4 flex gap-2`
- Responsive prefixes: `sm:bg-red md:bg-blue lg:bg-green`
- Dark mode: `dark:bg-black`
- Arbitrary values: `bg-[#ff0000] w-[200px]`
- Конфиг через CSS (новое в v4): `@theme { --color-primary: ... }`
- `@apply` — композиция утилит в кастомный класс

```tsx
// Пример из проекта — кнопка с вариантами
<Button variant="destructive" size="sm" className="w-full">
  <RotateCcw className="size-4" /> Сменить папку
</Button>
// Tailwind генерирует: bg-red-600 text-white px-3 py-1.5 rounded w-full
```

#### 3. shadcn/ui
- Не библиотека, а **генератор компонентов** (копирует исходники в твой проект)
- На базе Radix UI (headless компоненты) + Tailwind
- `npx shadcn@latest add button dialog`
- Компоненты: Button, Input, Dialog, Select, Tabs, Toast, etc.

### Ресурсы:
- **[Tailwind CSS docs](https://tailwindcss.com/docs)** — официальный
- **[shadcn/ui docs](https://ui.shadcn.com/)** — с примерами
- **[CSS Tricks: Complete Guide to Flexbox](https://css-tricks.com/snippets/css/a-guide-to-flexbox/)**
- **[Josh Comeau CSS](https://www.joshwcomeau.com/css/interactive-guide-to-flexbox/)** — интерактивно

### Время: ~2 недели

---

## Фаза 4: Сборщики и фреймворки

### Вариант A: Next.js 16 (веб-версия)

**Зачем:** full-stack React-фреймворк (SSR, routing, API routes).

**Java-аналогия:** Next.js = Spring Boot для React. Даёт структуру, маршрутизацию, server-side.

#### Концепции:
- **App Router** (`src/app/`) — файловая маршрутизация
  - `page.tsx` = страница, `layout.tsx` = обёртка, `loading.tsx` = Suspense
- **Server Components** (по умолчанию) — рендерятся на сервере
- **Client Components** (`'use client'`) — интерактивные, на клиенте
- **API Routes** (`src/app/api/route.ts`) — бэкенд-эндпоинты
- **Metadata** — SEO через экспорт `metadata` из page
- **Turbopack** — новый бандлер (замена Webpack)

### Вариант B: Vite 6 (Tauri-фронтенд)

**Зачем:** быстрый dev-сервер и сборщик для SPA.

**Java-аналогия:** Vite = dev-сервер + бандлер, похож на Spring Boot DevTools.

#### Концепты:
- `vite.config.ts` — конфигурация (плагины, alias, build)
- **HMR** (Hot Module Replacement) — мгновенное обновление без перезагрузки
- **Plugins**: `@vitejs/plugin-react`, `@tailwindcss/vite`
- **Build**: `vite build` → `dist/` (оптимизированный бандл)
- **Alias**: `resolve: { alias: { "@": "./src" } }`

```ts
// vite.config.ts (из проекта)
import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"
import path from "node:path"

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
  css: { postcss: { plugins: [] } },  // изоляция от родительского Next.js postcss
  server: { port: 1420, strictPort: true },
  build: { outDir: "dist", emptyOutDir: true },
})
```

### Ресурсы:
- **[Next.js docs](https://nextjs.org/docs)** — официальный, отличный
- **[Vite guide](https://vitejs.dev/guide/)** — короткий и понятный
- **[Lee Robinson YouTube](https://www.youtube.com/@leerob)** — Next.js контент

### Время: ~2-3 недели

---

## Фаза 5: State Management — Zustand

**Зачем:** глобальное состояние приложения (файлы, настройки, sync-статус).

**Java-аналогия:** Zustand = Singleton-бин в Spring, но **reactive** (UI обновляется автоматически при изменении).

### Концепты:

```ts
// Создание store (как @Component в Spring)
const useStore = create<State>()((set, get) => ({
  files: [],
  base: "",
  // setter (как @Autowired setter)
  setFiles: (files) => set({ files }),
  // async action (как @Async метод)
  init: async () => {
    const folder = await invoke("get_folder")
    set({ base: folder })
  },
}))

// Использование в компоненте (как @Autowired)
function MyComponent() {
  const files = useStore((s) => s.files)  // селектор
  const init = useStore((s) => s.init)
  // при изменении files — компонент перерисуется
}
```

- **`create<T>()(...)`** — создание store
- **Selectors** `useStore((s) => s.field)` — подписка на конкретное поле (оптимизация)
- **`set(partial)`** — обновление (иммутабельное, как `setState`)
- **`get()`** — чтение без подписки
- **`persist`** middleware — сохранение в localStorage (как сериализация в Java)

### Ресурсы:
- **[Zustand GitHub](https://github.com/pmndrs/zustand)** — короткий README с примерами
- **[Zustand docs](https://docs.pmnd.rs/zustand)**

### Время: ~3-5 дней (простая библиотека)

---

## Фаза 6: Rust (бэкенд-язык)

**Зачем:** Tauri-бэкенд на Rust (файловая система, git, команды).

**Java-аналогия:** Rust = C++ + безопасность памяти. Статически типизированный, компилируемый. Но **ownership model** — главное отличие от Java (нет GC, вместо него — ownership/borrowing).

### Что учить (по порядку):

#### 1. Основы синтаксиса
- `let x = 5;` (immutable by default), `let mut x = 5;` (mutable)
- `fn add(a: i32, b: i32) -> i32 { a + b }` (функции)
- `struct Point { x: f64, y: f64 }` (как Java record/class)
- `enum Option<T> { Some(T), None }` (как Java Optional, но встроенный)
- `enum Result<T, E> { Ok(T), Err(E) }` (вместо exceptions!)
- `match` (pattern matching, как switch но мощнее)
- `Vec<T>` (динамический массив, как ArrayList)
- `String` vs `&str` (владеющая vs ссылка)
- `HashMap<K, V>` (как HashMap)

#### 2. Ownership & Borrowing (ГЛАВНОЕ)
- Каждое значение имеет **одного владельца**
- При присваивании — **move** (владение переносится, оригинал недоступен)
- `&T` — immutable borrow (ссылка, как `final` параметр)
- `&mut T` — mutable borrow (как non-final параметр)
- Один mutable XOR много immutable borrows одновременно
- **Lifetimes** `'a` — аннотации времени жизни ссылок

```rust
fn longest<'a>(x: &'a str, y: &'a str) -> &'a str {
    if x.len() > y.len() { x } else { y }
}
```

#### 3. Traits (как Java interfaces)
```rust
trait Display { fn fmt(&self, f: &mut Formatter) -> Result; }
impl Display for Point { ... }
```

#### 4. Generics `<T>` (похожи на Java)
```rust
fn first<T>(v: &Vec<T>) -> Option<&T> { v.first() }
```

#### 5. Error handling (без exceptions)
- `Result<T, E>` + `?` operator (early return on error)
- `Option<T>` для null-safe
- `unwrap()` / `expect()` (panic если None/Err)

```rust
// Из commands.rs — Tauri-команда
#[tauri::command]
pub fn read_attachments(base: String, number: String) -> Vec<AttachmentEntry> {
    let mut out = Vec::new();
    let dir = Path::new(&base).join(&number).join("attachments");
    if let Ok(entries) = fs::read_dir(&dir) {
        for e in entries.flatten() {
            let p = e.path();
            if !p.is_file() { continue; }
            if let Ok(bytes) = fs::read(&p) {
                let b64 = BASE64_STANDARD.encode(&bytes);
                out.push(AttachmentEntry { path: ..., data_url: ... });
            }
        }
    }
    out
}
```

#### 6. Macros (метапрограммирование)
- `println!`, `vec!`, `format!` (с `!` — макросы)
- `#[derive(Debug, Clone, Serialize)]` — автогенерация trait impls

#### 7. Crates (как Maven artifacts)
- `Cargo.toml` = `pom.xml`
- `cargo build` / `cargo run` / `cargo test`
- `[dependencies]` = `<dependencies>`

```toml
# Cargo.toml (из проекта)
[package]
name = "ids-desktop"
version = "0.1.0"
edition = "2021"

[dependencies]
tauri = { version = "2", features = [] }
tauri-plugin-clipboard-manager = "2"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
base64 = "0.22"
```

### Ресурсы:
- **[The Rust Book](https://doc.rust-lang.org/book/)** — БИБЛИЯ, бесплатный, официальный
- **[Rustlings](https://github.com/rust-lang/rustlings)** — интерактивные упражнения
- **[Rust by Example](https://doc.rust-lang.org/rust-by-example/)** — примеры по темам
- **[Learn Rust the Dangerous Way](https://cliffle.com/p/dangerust/)** — для C/Java разработчиков
- Книга: *"Programming Rust"* by Jim Blandy (O'Reilly)

### Время: ~4-6 недель (ownership — главная сложность для Java-разработчика)

---

## Фаза 7: Tauri 2 (десктоп-фреймворк)

**Зачем:** оборачивает веб-фронтенд в нативное десктоп-приложение.

**Java-аналогия:** Tauri = JavaFX с веб-вью вместо нативных компонентов. Но бэкенд на Rust, не на Java.

### Архитектура:
```
┌─────────────────────────────────┐
│  Frontend (Vite + React)         │  ← веб, рисуется в WebView
│  ↕ invoke() / listen()            │  ← IPC (мост)
├─────────────────────────────────┤
│  Backend (Rust)                  │  ← нативный, полный доступ к ОС
│  - std::fs (файлы)               │
│  - std::process::Command (git)   │
│  - tauri::command (экспорт API)  │
└─────────────────────────────────┘
```

### Концепты:

#### 1. `tauri.conf.json` — конфиг
- `productName`, `version`, `identifier`
- `bundle.targets` (msi, nsis, app, deb, appimage)
- `beforeBuildCommand` (запускает Vite build)

#### 2. Команды (Rust → фронтенд)
```rust
// Rust — объявление команды
#[tauri::command]
fn read_file(path: String) -> Result<String, String> {
    fs::read_to_string(path).map_err(|e| e.to_string())
}
```
```ts
// TypeScript — вызов с фронта
const content = await invoke<string>("read_file", { path: "/etc/hosts" })
```

#### 3. События (двусторонняя коммуникация)
- `app.emit("event-name", payload)` (Rust → фронт)
- `listen("event-name", callback)` (фронт → фронт)

#### 4. Плагины
- `tauri-plugin-clipboard-manager` (буфер обмена)
- `tauri-plugin-fs` (файловая система)
- `tauri-plugin-dialog` (диалоги)

#### 5. Capabilities (`src-tauri/capabilities/default.json`)
- Permission model (как SecurityManager в Java, но декларативный)

```json
{
  "permissions": [
    "core:default",
    "clipboard-manager:allow-read-image"
  ]
}
```

#### 6. Cross-platform сборка
- Linux: `.deb`, `.AppImage` (webkit2gtk)
- Windows: `.msi`, `.exe` NSIS (WebView2)
- macOS: `.app`, `.dmg` (WKWebView)

#### 7. CREATE_NO_WINDOW (Windows)
```rust
fn git_command(args: &[&str]) -> Command {
    let mut cmd = Command::new("git");
    cmd.args(args);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000);  // CREATE_NO_WINDOW
    }
    cmd
}
```

### Ресурсы:
- **[Tauri 2 docs](https://v2.tauri.app/)** — официальный, отличный
- **[Tauri examples](https://github.com/tauri-apps/tauri/tree/dev/examples)**
- **[Awesome Tauri](https://github.com/tauri-apps/awesome-tauri)**

### Время: ~2 недели (после Rust)

---

## Фаза 8: Git, GitHub Actions, Docker

### Git
- **Что:** распределённая VCS
- **Java-аналог:** нет, но Git — стандарт везде
- **Концепты:** commit, branch, merge, rebase, tag, remote, push/pull
- **Ресурс:** [Pro Git book](https://git-scm.com/book/) — бесплатный

### GitHub Actions (CI/CD)
- **Что:** CI/CD встроенный в GitHub
- **Java-аналог:** Jenkins, GitLab CI
- **Концепты:**
  - Workflows (`.github/workflows/*.yml`)
  - Jobs, steps, matrix (параллельные сборки)
  - Secrets (зашифрованные переменные)
  - `actions/checkout`, `actions/setup-node`, `dtolnay/rust-toolchain`
  - Triggers: `push`, `pull_request`, `tags: ["v*"]`

```yaml
# Пример из release.yml — matrix-сборка 3 платформ
jobs:
  build:
    strategy:
      fail-fast: false
      matrix:
        include:
          - platform: ubuntu-22.04
          - platform: windows-latest
          - platform: macos-latest
    runs-on: ${{ matrix.platform }}
```

- **Ресурс:** [GitHub Actions docs](https://docs.github.com/en/actions)

### Docker
- **Что:** контейнеризация
- **Java-аналог:** нет (JAR — это не контейнер)
- **Концепты:**
  - `Dockerfile` (сборка образа)
  - `docker-compose.yml` (мульти-контейнер)
  - Volumes (персистентные данные)
  - `docker build`, `docker run`, `docker compose up`
- **Ресурс:** [Docker docs](https://docs.docker.com/), [Play with Docker](https://training.play-with-docker.com/)

### Время: ~1-2 недели

---

# Сводный план (минимум → максимум)

| Неделя | Что учить | Результат |
|---|---|---|
| 1-2 | JavaScript + TypeScript | Понимаешь TS-код проекта |
| 3-5 | React + хуки | Можешь писать UI-компоненты |
| 6 | Tailwind + CSS | Стилизуешь компоненты |
| 7-8 | Next.js или Vite | Запускаешь веб-приложение |
| 9 | Zustand | Управляешь состоянием |
| 10-13 | Rust (Book + Rustlings) | Пишешь простые Rust-программы |
| 14-15 | Tauri 2 | Собираешь десктоп-приложение |
| 16 | Git/GitHub Actions/Docker | Настраиваешь CI/CD |

**Итого: ~3-4 месяца** (Java-разработчику легче — типизация, ООП, сборщики, пакеты — всё знакомо по аналогии).

---

# Что важно понять Java-разработчику

## 1. Иммутабельность (главное отличие)

```java
// Java — mutate
list.add(item);
```
```ts
// React/TS — новый массив, не mutate
setList([...list, item]);
```

## 2. Нет наследования в UI (композиция вместо наследования)

```java
// Java Swing — наследование
class MyButton extends JButton {
    public MyButton() {
        setText("Save");
        setForeground(Color.RED);
    }
}
```
```tsx
// React — композиция
const MyButton = (props) => <Button {...props} variant="destructive">Save</Button>
// не наследуем Button, а вкладываем его
```

## 3. Async = Promises, не Threads

```java
// Java
CompletableFuture<String> future = CompletableFuture.supplyAsync(() -> fetch());
future.thenAccept(result -> System.out.println(result));
```
```ts
// TS — тот же CompletableFuture, но синтаксис чище
const result = await fetch();  // await = future.get(), но без блокировки
```

## 4. Rust: нет GC, нет null, нет exceptions

- Вместо GC — **ownership** (значение удаляется когда владелец выходит из scope)
- Вместо null — `Option<T>` (как Java Optional, но встроенный и обязательный)
- Вместо exceptions — `Result<T, E>` (ошибки — это значения, не потоки)

```rust
// Rust — нет null, нет try/catch
fn read_file(path: &str) -> Result<String, io::Error> {
    fs::read_to_string(path)?  // ? = return Err on failure (как early-return)
}

// Вызов:
match read_file("config.yaml") {
    Ok(content) => println!("{}", content),
    Err(e) => eprintln!("Error: {}", e),
}
```

## 5. Декларативный UI (не императивный)

```java
// Java Swing (императивный) — КАК рисовать
button.setText("Save");
button.setForeground(Color.RED);
button.setBorder(BorderFactory.createLineBorder(Color.GRAY));
panel.add(button);
panel.setLayout(new FlowLayout());
```
```tsx
// React (декларативный) — ЧТО рисовать
<Button variant="destructive">Save</Button>
// variant="destructive" = red bg + white text + rounded
// React сам применяет стили
```

## 6. Структурная vs номинальная типизация

```java
// Java — номинальная (имя типа важно)
interface Runnable { void run(); }
class Task implements Runnable { ... }  // должен явно implement
```
```ts
// TypeScript — структурная (форма важна, не имя)
interface Runnable { run(): void }
const task = { run: () => console.log("run") }  // подходит, даже без implements
```

## 7. Frontend ≠ Backend

| Концепт | Backend (Java/Rust) | Frontend (React) |
|---|---|---|
| Состояние | mutable, threads | immutable, single-thread |
| Парадигма | OOP, inheritance | functional, composition |
| Сборка | compile → JAR/binary | bundle → JS+CSS+HTML |
| Рантайм | JVM / native | browser webview |
| Асинхронность | threads, CompletableFuture | event loop, Promises |
| Ошибки | exceptions | values (try/catch редко) |

---

# Рекомендуемый порядок изучения

1. **Сначала**: TypeScript → React (без этого никак)
   - [React.dev Tutorial](https://react.dev/learn) — за 1 день соберёшь первое приложение
2. **Потом**: CSS/Tailwind (чтобы UI выглядел)
3. **Затем**: Vite/Next.js (чтобы запустить)
4. **Параллельно**: Zustand (простая, 1 день)
5. **Потом**: Rust (отдельно, 4-6 недель)
   - [The Rust Book](https://doc.rust-lang.org/book/) + [Rustlings](https://github.com/rust-lang/rustlings)
6. **В конце**: Tauri (соединить React + Rust)

**Главный совет:** не пытайся учить всё сразу. Начни с React.dev — за выходные соберёшь
первое React-приложение. Потом итеративно углубляй.

---

# Проект IDS как учебный полигон

IDS — хороший пример для изучения, потому что:
- **Маленький, но полный**: покрывает весь стек (React + Rust + Tauri + CI/CD + Docker)
- **Реальная задача**: документирование проблем (не toy example)
- **Кастомный код**: YAML-сериализатор без библиотек, regex-парсер frontmatter
- **Cross-platform**: 3 ОС (Linux/Windows/macOS), нюансы каждой
- **CI/CD matrix**: параллельные сборки, secrets, conditional steps
- **Реальные баги и фиксы**: каждый фикс — урок (UUID polyfill, CRLF, oklch, PostCSS isolation)

### Файлы для разбора:
- `src/lib/frontmatter.ts` — кастомный YAML-сериализатор (без js-yaml)
- `src/lib/store.ts` — Zustand store с async actions
- `src/components/markdown-editor.tsx` — редактор с 3 режимами, paste/drop
- `src/components/editor-view.tsx` — интегратор формы + редактора
- `ids-desktop/src-tauri/src/commands.rs` — Rust-команды (ФС, git, clipboard)
- `.github/workflows/release.yml` — CI matrix, signing, version, portable

---

*Документ сгенерирован для проекта IDS (Issue Documentation System).*

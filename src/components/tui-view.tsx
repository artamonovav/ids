// TUI-подобный раздел: вид рабочей области в стиле opencode/btop —
// моноширинный шрифт, панели с бордерами, ASCII-индикаторы, клавиатурная
// навигация (j/k/g/G/Enter/n/s//q). Не терминал: тот же store и действия,
// что у обычных вью. Мышь тоже работает (клик — выбор, двойной — открыть).

import * as React from "react"
import { useStore, selectFolders } from "@/lib/store"
import { useToast } from "@/hooks/use-toast"
import type { Localization } from "@/lib/types"

type Tab = "kb" | "tmp"

const STATUS_MAP = {
  green: { text: "СИНХРОНИЗИРОВАНО", cls: "text-emerald-600 dark:text-emerald-400" },
  yellow: { text: "ЕСТЬ ИЗМЕНЕНИЯ", cls: "text-amber-600 dark:text-amber-400" },
  red: { text: "ОШИБКА СИНХРОНИЗАЦИИ", cls: "text-red-600 dark:text-red-400" },
} as const

/** ASCII-индикатор в духе btop: [██████░░░░] */
function Gauge({
  value,
  total,
  cls = "",
}: {
  value: number
  total: number
  cls?: string
}) {
  const width = 10
  const filled =
    total > 0 ? Math.min(width, Math.round((value / total) * width)) : 0
  const bar = "█".repeat(filled) + "░".repeat(width - filled)
  const pct = total > 0 ? Math.round((value / total) * 100) : 0
  return (
    <span className={cls}>
      [{bar}] {pct}%
    </span>
  )
}

/** Сократить путь: /home/user → ~ */
function shortenPath(p: string): string {
  const home = p.match(/^\/home\/[^/]+/)
  return home ? p.replace(home[0], "~") : p
}

function fmtDate(ts: number): string {
  return new Date(ts).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Moscow",
  })
}

function rowText(f: Localization): string {
  const fm = f.frontmatter
  return [
    f.number,
    fm.type,
    fm.environment,
    fm.author,
    fm.symptom,
    fm.product.join(" "),
    f.fileName,
  ]
    .join(" ")
    .toLowerCase()
}

export function TuiView() {
  const files = useStore((s) => s.files)
  const base = useStore((s) => s.base)
  const syncStatus = useStore((s) => s.syncStatus)
  const syncing = useStore((s) => s.syncing)
  const sync = useStore((s) => s.sync)
  const createDraft = useStore((s) => s.createDraft)
  const openFolder = useStore((s) => s.openFolder)
  const openFile = useStore((s) => s.openFile)
  const setView = useStore((s) => s.setView)
  const { toast } = useToast()

  const [tab, setTab] = React.useState<Tab>("kb")
  const [q, setQ] = React.useState("")
  const [searchMode, setSearchMode] = React.useState(false)
  const [sel, setSel] = React.useState(0)
  const searchRef = React.useRef<HTMLInputElement | null>(null)
  const listRef = React.useRef<HTMLDivElement | null>(null)

  // «Все» — от больших SPAS к меньшим (как в обычной рабочей области).
  const folders = React.useMemo(() => {
    const num = (s: string) => parseInt(s.replace(/\D/g, ""), 10) || 0
    return [...selectFolders(files)].sort(
      (a, b) => num(b.number) - num(a.number) || b.updatedAt - a.updatedAt
    )
  }, [files])
  const drafts = React.useMemo(
    () => files.filter((f) => f.number === ""),
    [files]
  )

  const term = q.trim().toLowerCase()
  const items: { id: string; open: () => void; render: () => React.ReactNode }[] =
    React.useMemo(() => {
      if (tab === "kb") {
        return folders
          .filter((f) => !term || rowText(f.main).includes(term))
          .map((f) => {
            const fm = f.main.frontmatter
            const dirty = f.files.some((x) => x.dirty)
            return {
              id: f.number,
              open: () => openFolder(f.number),
              render: () => (
                <>
                  <span className="w-32 shrink-0 font-semibold">{f.number}</span>
                  <span className="w-28 shrink-0 truncate text-muted-foreground">
                    {fm.type || "—"}
                  </span>
                  <span className="w-20 shrink-0 truncate text-muted-foreground">
                    {fm.environment || "—"}
                  </span>
                  <span className="w-40 shrink-0 truncate" title={fm.product.join(", ")}>
                    {fm.product.join(" ") || "—"}
                  </span>
                  <span className={`w-16 shrink-0 ${dirty ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"}`}>
                    {dirty ? "● изм." : f.files.length > 1 ? `+${f.files.length - 1} ф.` : ""}
                  </span>
                  <span className="flex-1 truncate">{fm.symptom || "— без симптома —"}</span>
                </>
              ),
            }
          })
      }
      return drafts
        .filter(
          (f) =>
            !term ||
            rowText(f).includes(term) ||
            f.fileName.toLowerCase().includes(term)
        )
        .map((f) => ({
          id: f.id,
          open: () => openFile(f.id),
          render: () => (
            <>
              <span className="w-32 shrink-0 font-semibold">
                {f.frontmatter.number || "без номера"}
              </span>
              <span className="w-28 shrink-0 text-muted-foreground">.tmp</span>
              <span className="w-20 shrink-0 truncate text-muted-foreground">
                {f.frontmatter.type || "—"}
              </span>
              <span className="w-40 shrink-0 truncate text-muted-foreground" title={f.fileName}>
                {f.fileName}
              </span>
              <span className={`w-16 shrink-0 ${f.dirty ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"}`}>
                {f.dirty ? "● изм." : ""}
              </span>
              <span className="flex-1 truncate">{f.frontmatter.symptom || "— без симптома —"}</span>
            </>
          ),
        }))
    }, [tab, folders, drafts, term, openFolder, openFile])

  // Фильтр/вкладка изменились → курсор в начало.
  React.useEffect(() => {
    setSel(0)
  }, [tab, term])

  // Выбранная строка всегда в зоне видимости.
  React.useEffect(() => {
    const el = listRef.current?.querySelector(`[data-idx="${sel}"]`)
    el?.scrollIntoView({ block: "nearest" })
  }, [sel, items.length])

  const totalKb = files.filter((f) => f.number).length
  const dirtyCount = files.filter((f) => f.dirty).length
  const products = useStore((s) => s.repoFiles[".dictionary/product.yaml"])
  // считаем элементы YAML-списка: строки "  - значение"
  const productCount = (products?.match(/^\s+-/gm) || []).length
  const status = syncing ? { text: "СИНХРОНИЗАЦИЯ…", cls: "text-amber-600 dark:text-amber-400" } : STATUS_MAP[syncStatus]

  async function handleSync() {
    await sync()
    const msg = useStore.getState().lastCommitMessage
    toast({ title: "Синхронизировано", description: msg ?? "Нет изменений для отправки" })
  }

  function openSelected() {
    const item = items[sel]
    if (item) item.open()
  }

  // Клавиатура: j/k/g/G/Enter/n/s//q/Esc — как в opencode. Пока фокус в
  // поиске — буквы идут в поле, работают только Esc/Enter.
  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const inInput = e.target instanceof HTMLInputElement
      if (inInput) return
      const move = (delta: number) => {
        e.preventDefault()
        setSel((s) => Math.min(items.length - 1, Math.max(0, s + delta)))
      }
      switch (e.key) {
        case "j":
        case "ArrowDown":
          return move(1)
        case "k":
        case "ArrowUp":
          return move(-1)
        case "g":
          e.preventDefault()
          return setSel(0)
        case "G":
          e.preventDefault()
          return setSel(Math.max(0, items.length - 1))
        case "Enter":
          e.preventDefault()
          return openSelected()
        case "n":
          e.preventDefault()
          void createDraft()
          return
        case "s":
          e.preventDefault()
          void handleSync()
          return
        case "/":
          e.preventDefault()
          setSearchMode(true)
          requestAnimationFrame(() => searchRef.current?.focus())
          return
        case "Escape":
          if (searchMode) {
            setSearchMode(false)
            setQ("")
          } else {
            setView("workspace")
          }
          return
        case "q":
          e.preventDefault()
          return setView("workspace")
        default:
          return
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  })

  return (
    <div className="flex h-[calc(100vh-10rem)] flex-col gap-1.5 font-mono text-[13px] leading-relaxed">
      {/* Шапка */}
      <div className="border border-border px-2 py-1">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <span className="font-bold">IDS · TUI</span>
            <span className="truncate text-muted-foreground" title={base}>
              {shortenPath(base) || "— папка не открыта —"}
            </span>
          </div>
          <span className={status.cls}>{status.text}</span>
        </div>
      </div>

      {/* Индикаторы */}
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
        <div className="border border-border px-2 py-1">
          <span className="text-muted-foreground">ЛОКАЛИЗАЦИЙ </span>
          {totalKb}
        </div>
        <div className="border border-border px-2 py-1">
          <span className="text-muted-foreground">ЧЕРНОВИКИ </span>
          {drafts.length}
        </div>
        <div className="border border-border px-2 py-1">
          <span className="text-muted-foreground">СИНХР </span>
          <Gauge
            value={totalKb + drafts.length - dirtyCount}
            total={totalKb + drafts.length}
            cls={
              syncStatus === "red"
                ? "text-red-600 dark:text-red-400"
                : dirtyCount > 0
                  ? "text-amber-600 dark:text-amber-400"
                  : "text-emerald-600 dark:text-emerald-400"
            }
          />
        </div>
        <div className="border border-border px-2 py-1">
          <span className="text-muted-foreground">ПРОДУКТЫ </span>
          {productCount}
        </div>
      </div>

      {/* Вкладки + поиск */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setTab("kb")}
            className={`px-2 ${tab === "kb" ? "bg-accent font-bold text-accent-foreground" : "text-muted-foreground"}`}
          >
            [ ЛОКАЛИЗАЦИИ {folders.length} ]
          </button>
          <button
            type="button"
            onClick={() => setTab("tmp")}
            className={`px-2 ${tab === "tmp" ? "bg-accent font-bold text-accent-foreground" : "text-muted-foreground"}`}
          >
            [ ЧЕРНОВИКИ {drafts.length} ]
          </button>
        </div>
        {searchMode ? (
          <div className="flex items-center gap-1">
            <span className="text-muted-foreground">&gt;</span>
            <input
              ref={searchRef}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  e.preventDefault()
                  setSearchMode(false)
                  setQ("")
                } else if (e.key === "Enter") {
                  e.preventDefault()
                  openSelected()
                }
              }}
              placeholder="фильтр… (Esc — выход)"
              className="h-6 w-56 bg-transparent text-[13px] outline-none placeholder:text-muted-foreground"
            />
          </div>
        ) : (
          <span className="text-muted-foreground">
            / — поиск
          </span>
        )}
      </div>

      {/* Список */}
      <div
        ref={listRef}
        className="min-h-0 flex-1 overflow-y-auto border border-border"
        role="listbox"
        aria-label="Список локализаций"
      >
        {items.length === 0 ? (
          <p className="px-2 py-4 text-muted-foreground">
            {term ? "Ничего не найдено. Esc — сбросить фильтр." : "Пусто. n — новый черновик."}
          </p>
        ) : (
          items.map((item, i) => (
            <div
              key={item.id}
              data-idx={i}
              role="option"
              aria-selected={i === sel}
              tabIndex={-1}
              onClick={() => setSel(i)}
              onDoubleClick={item.open}
              className={`flex cursor-pointer items-center gap-2 px-2 py-0.5 ${
                i === sel ? "bg-accent text-accent-foreground" : "hover:bg-accent/50"
              }`}
            >
              {item.render()}
            </div>
          ))
        )}
      </div>

      {/* Футер: подсказки клавиш */}
      <div className="flex flex-wrap items-center justify-between gap-x-3 border border-border px-2 py-1 text-[12px] text-muted-foreground">
        <div className="flex flex-wrap gap-x-3">
          <span><b className="text-foreground">j/k</b> вниз/вверх</span>
          <span><b className="text-foreground">g/G</b> начало/конец</span>
          <span><b className="text-foreground">Enter</b> открыть</span>
          <span><b className="text-foreground">n</b> новый</span>
          <span><b className="text-foreground">s</b> синк</span>
          <span><b className="text-foreground">/</b> поиск</span>
          <span><b className="text-foreground">q</b> выход</span>
        </div>
        <span>обновлено {fmtDate(Date.now())}</span>
      </div>
    </div>
  )
}

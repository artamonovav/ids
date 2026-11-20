// TUI-подобный раздел: вид рабочей области в стиле opencode/btop —
// моноширинный шрифт, панели с бордерами, ASCII-индикаторы, клавиатурная
// навигация (j/k/g/G/Enter/n/s/d//q). Не терминал: тот же store и действия,
// что у обычных вью. Включается опцией «TUI-режим» в настройках.
//
// Мышь: клик — выбор, повторный клик по выбранной строке или двойной —
// открыть. Tab обходит элементы управления (вкладки, фильтр, строки списка).
// Шторка предпросмотра справа рендерит Markdown активной записи
// (кнопка или клавиша v), следует за выбором.

import * as React from "react"
import { useStore, selectFolders, loadAttachments } from "@/lib/store"
import { useToast } from "@/hooks/use-toast"
import { MarkdownView } from "@/components/markdown-preview"
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels"
import { Eye, EyeOff, X } from "lucide-react"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import type { Localization } from "@/lib/types"

type Tab = "kb" | "tmp"

/** Колонки TUI-списка — тот же состав, что в GUI-таблице. */
type SortKey =
  | "number"
  | "type"
  | "environment"
  | "product"
  | "symptom"
  | "author"
  | "updatedAt"

const STATUS_MAP = {
  green: { text: "СИНХРОНИЗИРОВАНО", cls: "text-emerald-600 dark:text-emerald-400" },
  yellow: { text: "ЕСТЬ ИЗМЕНЕНИЯ", cls: "text-amber-600 dark:text-amber-400" },
  red: { text: "ОШИБКА СИНХРОНИЗАЦИИ", cls: "text-red-600 dark:text-red-400" },
} as const

/** Сократить путь: /home/user → ~ */
function shortenPath(p: string): string {
  const home = p.match(/^\/home\/[^/]+/)
  return home ? p.replace(home[0], "~") : p
}

function fmtShort(ts: number): string {
  return new Date(ts).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Moscow",
  })
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
  const removeFile = useStore((s) => s.removeFile)
  const setView = useStore((s) => s.setView)
  const { toast } = useToast()

  const [tab, setTab] = React.useState<Tab>("kb")
  const [q, setQ] = React.useState("")
  const [searchMode, setSearchMode] = React.useState(false)
  const [sel, setSel] = React.useState(0)
  const [previewOpen, setPreviewOpen] = React.useState(false)
  const [deleteTarget, setDeleteTarget] = React.useState<{ id: string; name: string } | null>(null)
  // Сортировка списка по колонкам (как в GUI-таблице). По умолчанию —
  // номер по убыванию (большие SPAS сверху).
  const [sortKey, setSortKey] = React.useState<SortKey>("number")
  const [sortDir, setSortDir] = React.useState<1 | -1>(-1)
  // Фильтр «только не синхронизированные» (u / кнопка [ НЕ СИНХР ]).
  const [onlyUnsynced, setOnlyUnsynced] = React.useState(false)
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

  /** Компаратор колонок: строки — по-русски, номер — по числу, статус —
   *  несинхронизированные выше при убывании. */
  const cmp = React.useCallback(
    (a: Localization, b: Localization): number => {
      let r = 0
      switch (sortKey) {
        case "number":
          r =
            (parseInt(a.number.replace(/\D/g, ""), 10) || 0) -
            (parseInt(b.number.replace(/\D/g, ""), 10) || 0)
          break
        case "updatedAt":
          r = a.updatedAt - b.updatedAt
          break
        case "author":
          r = (a.frontmatter.author || "").localeCompare(
            b.frontmatter.author || "",
            "ru"
          )
          break
        case "type":
          r = (a.frontmatter.type || "").localeCompare(b.frontmatter.type || "", "ru")
          break
        case "environment":
          r = (a.frontmatter.environment || "").localeCompare(
            b.frontmatter.environment || "",
            "ru"
          )
          break
        case "product":
          r = a.frontmatter.product
            .join(", ")
            .localeCompare(b.frontmatter.product.join(", "), "ru")
          break
        case "symptom":
          r = (a.frontmatter.symptom || "").localeCompare(
            b.frontmatter.symptom || "",
            "ru"
          )
          break
      }
      return r * sortDir
    },
    [sortKey, sortDir]
  )

  /** Компаратор папок (вкладка «Локализации») — статусы берутся из файлов. */
  const cmpFolder = React.useCallback(
    (
      a: { number: string; files: Localization[]; main: Localization; updatedAt: number },
      b: { number: string; files: Localization[]; main: Localization; updatedAt: number },
    ): number => {
      let r = 0
      const num = (s: string) => parseInt(s.replace(/\D/g, ""), 10) || 0
      switch (sortKey) {
        case "number":
          r = num(a.number) - num(b.number)
          break
        case "type":
          r = (a.main.frontmatter.type || "").localeCompare(
            b.main.frontmatter.type || "",
            "ru"
          )
          break
        case "environment":
          r = (a.main.frontmatter.environment || "").localeCompare(
            b.main.frontmatter.environment || "",
            "ru"
          )
          break
        case "product":
          r = a.main.frontmatter.product
            .join(", ")
            .localeCompare(b.main.frontmatter.product.join(", "), "ru")
          break
        case "updatedAt":
          r = a.updatedAt - b.updatedAt
          break
        case "author":
          r = (a.main.frontmatter.author || "").localeCompare(
            b.main.frontmatter.author || "",
            "ru"
          )
          break
        case "symptom":
          r = (a.main.frontmatter.symptom || "").localeCompare(
            b.main.frontmatter.symptom || "",
            "ru"
          )
          break
      }
      return r * sortDir
    },
    [sortKey, sortDir]
  )

  /** Клик по заголовку: та же колонка — сменить направление; новая —
   *  естественное направление (строки — А→Я, номер/статус — по убыванию). */
  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === 1 ? -1 : 1))
    } else {
      setSortKey(key)
      setSortDir(key === "number" || key === "updatedAt" ? -1 : 1)
    }
    setSel(0)
  }

  const unsyncedKbCount = React.useMemo(
    () => folders.filter((f) => f.files.some((x) => x.dirty)).length,
    [folders]
  )

  interface Row {
    id: string
    open: () => void
    file: Localization
    render: () => React.ReactNode
  }
  const items: Row[] = React.useMemo(() => {
    if (tab === "kb") {
      return folders
        .filter((f) => !onlyUnsynced || f.files.some((x) => x.dirty))
        .filter((f) => !term || rowText(f.main).includes(term))
        .sort(cmpFolder)
        .map((f) => {
          const fm = f.main.frontmatter
          const dirty = f.files.some((x) => x.dirty)
          const open = () => openFolder(f.number)
          return {
            id: f.number,
            open,
            file: f.main,
            render: () => (
              <>
                <span
                  className="w-24 lg:w-32 shrink-0 cursor-pointer truncate font-semibold hover:underline"
                  title={`${f.number} — открыть`}
                  onClick={(e) => {
                    e.stopPropagation()
                    open()
                  }}
                >
                  {f.number}
                </span>
                <span className="w-16 sm:w-24 shrink-0 truncate text-muted-foreground" title={fm.type}>
                  {fm.type || "—"}
                </span>
                <span className="w-12 md:w-20 shrink-0 truncate text-muted-foreground" title={fm.environment}>
                  {fm.environment || "—"}
                </span>
                <span className="w-0 lg:w-40 lg:shrink-0 lg:truncate" title={fm.product.join(", ")}>
                  {fm.product.join(" ") || "—"}
                </span>
                <span className={`w-14 shrink-0 ${dirty ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"}`}>
                  {dirty ? "● изм." : f.files.length > 1 ? `+${f.files.length - 1} ф.` : ""}
                </span>
                <span className="flex-1 min-w-0 truncate">{fm.symptom || "— без симптома —"}</span>
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
      .sort(cmp)
      .map((f) => {
        const open = () => openFile(f.id)
        return {
          id: f.id,
          open,
          file: f,
        render: () => (
          <>
            <span
              className="w-24 lg:w-32 shrink-0 cursor-pointer truncate font-semibold hover:underline"
              title={`${f.fileName} — открыть`}
              onClick={(e) => {
                e.stopPropagation()
                open()
              }}
            >
              {f.frontmatter.number || f.fileName}
            </span>
            <span className="w-16 sm:w-24 shrink-0 truncate text-muted-foreground">.tmp</span>
            <span className="w-12 md:w-20 shrink-0 truncate text-muted-foreground">
              {f.frontmatter.type || "—"}
            </span>
            <span className="hidden w-28 lg:w-40 shrink-0 truncate lg:block" title={f.frontmatter.product.join(", ")}>
              {f.frontmatter.product.join(" ") || "—"}
            </span>
            <span className="flex-1 min-w-0 truncate">{f.frontmatter.symptom || "— без симптома —"}</span>
            <span className="hidden w-36 shrink-0 truncate text-muted-foreground lg:block" title={f.frontmatter.author}>
              {f.frontmatter.author || "—"}
            </span>
            <span
              className="hidden w-24 shrink-0 text-right text-[11px] text-muted-foreground sm:block"
              title={`Обновлено ${fmtDate(f.updatedAt)}`}
            >
              {fmtShort(f.updatedAt)}
            </span>
          </>
        ),
        }
      })
  }, [tab, folders, drafts, term, openFolder, openFile, cmp, cmpFolder, onlyUnsynced])

  // Фильтр/вкладка/сортировка изменились → курсор в начало (сортировка
  // тоже сбрасывает: строки меняются местами).
  React.useEffect(() => {
    setSel(0)
  }, [tab, term, sortKey, sortDir, onlyUnsynced])

  // Виртуализация списка: рендерятся только видимые строки (+запас).
  // Высота строки фиксированная — позиция считается по scrollTop.
  const ROW_H = 28 // h-7
  const OVERSCAN = 10
  const [scroll, setScroll] = React.useState({ top: 0, h: 400 })
  const onListScroll = React.useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget
    setScroll((prev) =>
      prev.top === el.scrollTop && prev.h === el.clientHeight
        ? prev
        : { top: el.scrollTop, h: el.clientHeight }
    )
  }, [])
  // Пересчитать окно при смене контента/размера контейнера.
  React.useEffect(() => {
    const el = listRef.current
    if (!el) return
    setScroll((prev) =>
      prev.top === el.scrollTop && prev.h === el.clientHeight
        ? prev
        : { top: el.scrollTop, h: el.clientHeight }
    )
  }, [items.length, tab])
  const winStart = Math.max(0, Math.floor(scroll.top / ROW_H) - OVERSCAN)
  const winEnd = Math.min(
    items.length,
    Math.ceil((scroll.top + scroll.h) / ROW_H) + OVERSCAN
  )

  // Выбранная строка всегда в зоне видимости (прямая прокрутка — надёжнее
  // scrollIntoView при виртуализации: строка может быть ещё не отрендерена).
  React.useEffect(() => {
    const el = listRef.current
    if (!el || items.length === 0) return
    const target = sel * ROW_H
    if (target < el.scrollTop) {
      el.scrollTop = target
    } else if (target + ROW_H > el.scrollTop + el.clientHeight) {
      el.scrollTop = target + ROW_H - el.clientHeight
    }
  }, [sel, items.length])

  const totalKb = files.filter((f) => f.number).length
  const dirtyCount = files.filter((f) => f.dirty).length
  const products = useStore((s) => s.repoFiles[".dictionary/product.yaml"])
  const productCount = (products?.match(/^\s+-/gm) || []).length
  const status = syncing ? { text: "СИНХРОНИЗАЦИЯ…", cls: "text-amber-600 dark:text-amber-400" } : STATUS_MAP[syncStatus]

  // Активная запись для шторки предпросмотра.
  const activeItem = items[sel] ?? null
  const activeFile = activeItem ? activeItem.file : null

  // Предпросмотр открыт → грузим вложения активной записи (картинки в теле).
  React.useEffect(() => {
    if (!previewOpen || !activeFile) return
    void loadAttachments(activeFile.number, activeFile.id)
  }, [previewOpen, activeFile?.id, activeFile?.number])

  // Файл перезаписан на диске/в store — перечитываем актуальную версию.
  const activeActual =
    activeFile ? files.find((f) => f.id === activeFile.id) ?? activeFile : null

  async function handleSync() {
    await sync()
    const msg = useStore.getState().lastCommitMessage
    toast({ title: "Синхронизировано", description: msg ?? "Нет изменений для отправки" })
  }

  function openSelected() {
    const item = items[sel]
    if (item) item.open()
  }

  /** Удаление черновика (клавиша d) — только вкладка «Черновики»,
   *  только несинхронизированные .tmp; с подтверждением. */
  function askDelete() {
    if (tab !== "tmp") {
      toast({
        title: "Удаление доступно только для черновиков",
        description: "Сохранённые локализации удаляются из редактора.",
      })
      return
    }
    const item = items[sel]
    if (!item) return
    const f = drafts.find((x) => x.id === item.id)
    if (f) setDeleteTarget({ id: f.id, name: f.fileName })
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    await removeFile(deleteTarget.id)
    toast({ title: "Черновик удалён", description: deleteTarget.name })
    setDeleteTarget(null)
    setSel((s) => Math.max(0, Math.min(s, items.length - 2)))
  }

  // Клавиатура: j/k/g/G/Enter/n/s/d/v//q/Esc — как в opencode. Пока фокус в
  // поиске — буквы идут в поле, работают только Esc/Enter. Tab — обычная
  // навигация по элементам управления (не перехватываем).
  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = e.target as HTMLElement | null
      const inInput = el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement
      if (inInput) return
      // Диалог удаления открыт — клавиши списка не работают, Esc закрывает диалог сам.
      if (deleteTarget) return
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
        case "d":
          e.preventDefault()
          return askDelete()
        case "v":
          e.preventDefault()
          return setPreviewOpen((p) => !p)
        case "u":
          e.preventDefault()
          return setOnlyUnsynced((p) => !p)
        case "/":
          e.preventDefault()
          setSearchMode(true)
          requestAnimationFrame(() => searchRef.current?.focus())
          return
        case "Escape":
          if (searchMode) {
            setSearchMode(false)
            setQ("")
          } else if (previewOpen) {
            // Esc сначала закрывает шторку, повторный — выход из TUI.
            setPreviewOpen(false)
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

  /** Заголовок колонок списка — кликабельный (сортировка), залипает при
   *  прокрутке. Общий для вкладок. */
  const columnHeader = (
    <div
      className="flex h-6 items-center gap-2 border-b border-border bg-background px-2 text-[11px] text-muted-foreground"
    >
      {(
        [
          ["number", "Номер", "w-24 lg:w-32 shrink-0"],
          ["type", "Тип", "w-16 sm:w-24 shrink-0"],
          ["environment", "Окр.", "w-12 md:w-20 shrink-0"],
          ["product", "Продукты", "hidden w-40 shrink-0 lg:block"],
          ["symptom", "Симптом", "flex-1"],
          ["author", "Автор", "hidden w-36 shrink-0 lg:block"],
          ["updatedAt", "Обновлено", "hidden w-24 shrink-0 text-right sm:block"],
        ] as const
      ).map(([key, label, cls]) => (
        <button
          key={key}
          type="button"
          onClick={() => toggleSort(key)}
          title="Сортировать"
          className={`shrink-0 text-left hover:text-foreground ${cls} ${key === "symptom" ? "flex-1" : ""}`}
        >
          {label}
          {sortKey === key && (sortDir === 1 ? " ▲" : " ▼")}
        </button>
      ))}
    </div>
  )

  const list = (
    <div className="relative min-h-0 flex-1 border border-border">
      {columnHeader}
      <div
        ref={listRef}
        onScroll={onListScroll}
        className="absolute inset-x-0 bottom-0 top-6 overflow-y-auto"
        role="listbox"
        aria-label="Список локализаций"
      >
        {items.length === 0 ? (
          <p className="px-2 py-4 text-muted-foreground">
            {term ? "Ничего не найдено. Esc — сбросить фильтр." : "Пусто. n — новый черновик."}
          </p>
        ) : (
          <>
            <div style={{ height: winStart * ROW_H }} aria-hidden />
            {items.slice(winStart, winEnd).map((item, i) => (
              <div
                key={item.id}
                data-idx={winStart + i}
                role="option"
                aria-selected={winStart + i === sel}
                tabIndex={0}
                onClick={() => {
                  // Клик по любому полю (кроме номера) — выбор + предпросмотр.
                  setSel(winStart + i)
                  setPreviewOpen(true)
                }}
                onFocus={() => setSel(winStart + i)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault()
                    item.open()
                  }
                }}
                className={`flex h-7 cursor-pointer items-center gap-2 px-2 ${
                  winStart + i === sel
                    ? "bg-accent text-accent-foreground outline-none"
                    : "hover:bg-accent/50 outline-none focus-visible:ring-1 focus-visible:ring-ring"
                }`}
              >
                {item.render()}
              </div>
            ))}
            <div style={{ height: (items.length - winEnd) * ROW_H }} aria-hidden />
          </>
        )}
      </div>
    </div>
  )

  const preview = activeActual ? (
    <div className="flex h-full flex-col overflow-hidden border border-border bg-background">
      <div className="flex items-start justify-between gap-2 border-b border-border px-2 py-1">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold">{activeActual.number || "черновик"}</span>
            {activeActual.frontmatter.type && (
              <span className="text-muted-foreground">[{activeActual.frontmatter.type}]</span>
            )}
            {activeActual.frontmatter.environment && (
              <span className="text-muted-foreground">[{activeActual.frontmatter.environment}]</span>
            )}
            {activeActual.dirty && (
              <span className="text-amber-600 dark:text-amber-400">● не синхронизировано</span>
            )}
          </div>
          <div className="text-[11px] text-muted-foreground">
            {activeActual.frontmatter.author || "— без автора —"} · обновлено {fmtDate(activeActual.updatedAt)}
          </div>
          {activeActual.frontmatter.product.length > 0 && (
            <div className="text-[11px]">продукты: {activeActual.frontmatter.product.join(", ")}</div>
          )}
        </div>
        <button
          type="button"
          onClick={() => setPreviewOpen(false)}
          title="Закрыть предпросмотр (v, Esc)"
          className="shrink-0 px-1 text-muted-foreground hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        <MarkdownView
          body={activeActual.body}
          attachments={activeActual.attachments}
        />
      </div>
    </div>
  ) : (
    <div className="flex h-full items-center justify-center border border-border p-4 text-muted-foreground">
      Выберите запись в списке.
    </div>
  )

  return (
    <div className="flex h-[calc(100vh-7.5rem)] flex-col gap-1.5 overflow-hidden font-mono text-[13px] leading-relaxed">
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
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
        <div className="border border-border px-2 py-1">
          <span className="text-muted-foreground">ЛОКАЛИЗАЦИЙ </span>
          {totalKb}
        </div>
        <div className="border border-border px-2 py-1">
          <span className="text-muted-foreground">ЧЕРНОВИКИ </span>
          {drafts.length}
        </div>
        <div className="border border-border px-2 py-1">
          <span className="text-muted-foreground">ПРОДУКТЫ </span>
          {productCount}
        </div>
      </div>

      {/* Вкладки + поиск + предпросмотр */}
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
          <button
            type="button"
            onClick={() => setOnlyUnsynced((p) => !p)}
            title="Показать только не синхронизированные (u)"
            className={`px-2 ${
              onlyUnsynced
                ? "bg-amber-500/20 font-bold text-amber-600 dark:text-amber-400"
                : unsyncedKbCount > 0
                  ? "text-amber-600/80 dark:text-amber-400/80"
                  : "text-muted-foreground"
            }`}
          >
            [ НЕ СИНХР {unsyncedKbCount} ]
          </button>
        </div>
        <div className="flex items-center gap-2">
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
            <span className="text-muted-foreground">/ — поиск</span>
          )}
          <button
            type="button"
            onClick={() => setPreviewOpen((p) => !p)}
            className={`flex items-center gap-1 px-2 ${
              previewOpen ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
            title={previewOpen ? "Скрыть предпросмотр (v)" : "Предпросмотр Markdown (v)"}
          >
            {previewOpen ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
            предпросмотр
          </button>
        </div>
      </div>

      {/* Список + шторка предпросмотра (1/3 ширины, перетаскивается) */}
      <div className="flex min-h-0 flex-1 flex-col">
        {previewOpen ? (
          <PanelGroup direction="horizontal" className="h-full">
            <Panel defaultSize={33} minSize={15} className="flex min-w-0 flex-col overflow-hidden">
              {list}
            </Panel>
            <PanelResizeHandle className="w-1 bg-border hover:bg-primary/50 transition-colors rounded-none mx-0.5" />
            <Panel defaultSize={67} minSize={30} className="flex min-w-0 flex-col overflow-hidden">
              {preview}
            </Panel>
          </PanelGroup>
        ) : (
          list
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
          <span><b className="text-foreground">d</b> удалить (черновики)</span>
          <span><b className="text-foreground">v</b> предпросмотр</span>
          <span><b className="text-foreground">u</b> не синхр.</span>
          <span><b className="text-foreground">/</b> поиск</span>
          <span><b className="text-foreground">Tab</b> обход элементов</span>
          <span><b className="text-foreground">q</b> выход</span>
        </div>
        <span>обновлено {fmtDate(Date.now())}</span>
      </div>

      {/* Диалог удаления черновика */}
      <AlertDialog open={deleteTarget !== null} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить черновик?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.name} будет удалён без возможности восстановления.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={confirmDelete}
            >
              Удалить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

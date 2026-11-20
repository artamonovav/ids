import * as React from "react"
import { useStore, selectFolders, loadAttachments } from "@/lib/store"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { MarkdownView } from "@/components/markdown-preview"
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels"
import { Eye, EyeOff, X } from "lucide-react"
import {
  Search,
  Plus,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  CloudOff,
  PencilLine,
  Trash2,
} from "lucide-react"
import { useToast } from "@/hooks/use-toast"
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
import type { Type } from "@/lib/types"


const TYPE_BADGE: Record<string, "destructive" | "secondary" | "outline"> = {
  Дефект: "destructive",
  Консультация: "secondary",
  Задача: "outline",
}

type Mode = "drafts" | "all"

/** Колонки таблицы, доступные для сортировки. */
type SortKey =
  | "number"
  | "type"
  | "environment"
  | "product"
  | "symptom"
  | "author"
  | "updatedAt"

interface DeleteTarget {
  description: string
  run: () => void
}

function matchText(s: string, term: string): boolean {
  return !term || s.toLowerCase().includes(term)
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

function StatusPill() {
  const status = useStore((s) => s.syncStatus)
  const syncing = useStore((s) => s.syncing)
  const offline = useStore((s) => s.settings.offline)
  const error = useStore((s) => s.syncError)
  const map = {
    green: { icon: CheckCircle2, cls: "text-emerald-600 dark:text-emerald-400", label: "Синхронизировано" },
    yellow: { icon: AlertTriangle, cls: "text-amber-600 dark:text-amber-400", label: "Есть несинхронизированные изменения" },
    red: { icon: AlertTriangle, cls: "text-red-600 dark:text-red-400", label: "Ошибка синхронизации" },
  } as const
  const cur = offline
    ? { icon: CloudOff, cls: "text-amber-600 dark:text-amber-400", label: "Автономный режим" }
    : map[status]
  const Icon = cur.icon
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className={`inline-flex items-center gap-1.5 ${cur.cls}`}>
        <Icon className="size-4" />
        <span className="hidden sm:inline">{syncing ? "Синхронизация…" : cur.label}</span>
      </span>
      {error && (
        <span className="hidden max-w-[20rem] truncate text-xs text-muted-foreground md:inline">
          {error}
        </span>
      )}
    </div>
  )
}

export function WorkspaceView() {
  const files = useStore((s) => s.files)
  const sync = useStore((s) => s.sync)
  const syncing = useStore((s) => s.syncing)
  const createDraft = useStore((s) => s.createDraft)
  const openFolder = useStore((s) => s.openFolder)
  const openFile = useStore((s) => s.openFile)
  const clarify = useStore((s) => s.clarify)
  const removeFolderDrafts = useStore((s) => s.removeFolderDrafts)
  const removeFile = useStore((s) => s.removeFile)
  const tableView = useStore((s) => s.config.tableView)
  const { toast } = useToast()

  const [deleteTarget, setDeleteTarget] = React.useState<DeleteTarget | null>(null)
  const [q, setQ] = React.useState("")
  const [type, setType] = React.useState<"all" | Type>("all")
  const [mode, setMode] = React.useState<Mode>("all")
  // Шторка предпросмотра в табличном режиме (клик по полям, кроме номера).
  const [activeNumber, setActiveNumber] = React.useState<string | null>(null)
  const [previewOpen, setPreviewOpen] = React.useState(false)
  // Сортировка таблицы по колонкам. По умолчанию — номер по убыванию
  // (от больших SPAS к меньшим).
  const [sortKey, setSortKey] = React.useState<SortKey>("number")
  const [sortDir, setSortDir] = React.useState<1 | -1>(-1)

  const folders = React.useMemo(() => selectFolders(files), [files])
  const tempDrafts = React.useMemo(
    () => files.filter((f) => f.number === ""),
    [files]
  )
  // Черновики = только несохранённые .tmp-темпы (number === "").
  // Сохранённые локализации (даже несинхронизированные, dirty) — это уже локализации,
  // они в «Последние/Все» с точкой синхронизации, а НЕ в «Черновиках».
  const draftsCount = tempDrafts.length

  const term = q.trim().toLowerCase()

  const baseFolders = React.useMemo(() => {
    if (mode === "drafts") return []
    // «Все»: от самых новых к самым старым — по номеру дефекта по убыванию
    // (большие SPAS выше; при равенстве — по времени обновления).
    const num = (s: string) => parseInt(s.replace(/\D/g, ""), 10) || 0
    return [...folders].sort(
      (a, b) => num(b.number) - num(a.number) || b.updatedAt - a.updatedAt
    )
  }, [folders, mode])

  const filteredFolders = React.useMemo(
    () =>
      baseFolders.filter((f) => {
        if (type !== "all" && f.main.frontmatter.type !== type) return false
        return (
          matchText(f.number, term) ||
          matchText(f.main.frontmatter.symptom, term) ||
          matchText(f.main.frontmatter.author, term)
        )
      }),
    [baseFolders, term, type]
  )

  // Сортировка таблицы по выбранной колонке (применяется к отфильтрованным).
  const sortedFolders = React.useMemo(() => {
    const arr = [...filteredFolders]
    const num = (s: string) => parseInt(s.replace(/\D/g, ""), 10) || 0
    arr.sort((a, b) => {
      let r = 0
      switch (sortKey) {
        case "number":
          r = num(a.number) - num(b.number)
          break
        case "updatedAt":
          r = a.updatedAt - b.updatedAt
          break
        case "product":
          r = a.main.frontmatter.product
            .join(", ")
            .localeCompare(b.main.frontmatter.product.join(", "), "ru")
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
        case "symptom":
          r = (a.main.frontmatter.symptom || "").localeCompare(
            b.main.frontmatter.symptom || "",
            "ru"
          )
          break
        case "author":
          r = (a.main.frontmatter.author || "").localeCompare(
            b.main.frontmatter.author || "",
            "ru"
          )
          break
      }
      return r * sortDir
    })
    return arr
  }, [filteredFolders, sortKey, sortDir])

  /** Клик по заголовку: та же колонка — сменить направление; новая —
   *  естественное направление (строки — А→Я, номер/дата — по убыванию). */
  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === 1 ? -1 : 1))
    } else {
      setSortKey(key)
      setSortDir(key === "number" || key === "updatedAt" ? -1 : 1)
    }
  }

  const filteredTemps = React.useMemo(
    () =>
      tempDrafts.filter(
        (f) =>
          matchText(f.frontmatter.symptom, term) ||
          matchText(f.frontmatter.author, term) ||
          matchText(f.fileName, term)
      ),
    [tempDrafts, term]
  )


  const showTemps = mode === "drafts"
  // «Все» — полный список; скролл внутри таблицы (как в TUI), без пагинации.
  const visibleFolders = mode === "drafts" ? [] : sortedFolders
  const hasAny =
    visibleFolders.length > 0 || (showTemps && filteredTemps.length > 0)

  // Шторка предпросмотра — только в табличном режиме и не на «Черновиках».
  const showPreview = tableView && previewOpen && mode !== "drafts"
  // Табличный режим (вне черновиков) — flex-колонка под окно: таблица
  // скроллится внутри своей области на весь отфильтрованный список.
  const fixedLayout = tableView && mode !== "drafts"

  const activeFolder = React.useMemo(
    () =>
      activeNumber
        ? folders.find((f) => f.number === activeNumber) ?? null
        : null,
    [activeNumber, folders]
  )
  const activeMain = activeFolder?.main ?? null

  // Предпросмотр открыт → грузим вложения активной записи (картинки в теле).
  React.useEffect(() => {
    if (!showPreview || !activeMain) return
    void loadAttachments(activeMain.number, activeMain.id)
  }, [showPreview, activeMain?.id, activeMain?.number])

  // Файл перезаписан в store (автосохранение/синк) — актуальная версия.
  const activeActual = activeMain
    ? files.find((f) => f.id === activeMain.id) ?? activeMain
    : null

  function handleClarify(number: string) {
    const main = useStore.getState().files.find((f) => f.number === number && f.fileName === "localization.md")
      ?? useStore.getState().files.find((f) => f.number === number)
    if (main) clarify(main.id)
  }

  async function handleSync() {
    await sync()
    const msg = useStore.getState().lastCommitMessage
    toast({ title: "Синхронизировано", description: msg ?? "Нет изменений для отправки" })
  }

  function confirmDelete() {
    if (!deleteTarget) return
    deleteTarget.run()
    setDeleteTarget(null)
  }

  function askDeleteFolder(number: string) {
    setDeleteTarget({
      description: `Несинхронизированные файлы папки ${number} будут удалены локально. Синхронизированные файлы останутся.`,
      run: () => {
        removeFolderDrafts(number)
        toast({ title: "Черновик удалён", description: number })
      },
    })
  }

  function askDeleteTemp(id: string, name: string) {
    setDeleteTarget({
      description: `Временный черновик ${name} будет удалён без возможности восстановления.`,
      run: () => {
        removeFile(id)
        toast({ title: "Временный черновик удалён", description: name })
      },
    })
  }

  /** Таблица локализаций (табличный режим). */
  const tableEl = (
    <div>
      <table className="w-full text-sm">
<thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    {(
                      [
                        ["number", "Номер", "px-3 py-2"],
                        ["type", "Тип", "px-2 py-2"],
                        ["environment", "Окр.", "px-2 py-2"],
                        ["product", "Продукты", "px-2 py-2"],
                        ["symptom", "Симптом", "px-2 py-2"],
                        ["author", "Автор", "hidden px-2 py-2 lg:table-cell"],
                        ["updatedAt", "Обновлено", "px-2 py-2 text-right"],
                      ] as const
                    ).map(([key, label, cls]) => (
                      <th
                        key={key}
                        scope="col"
                        className={`sticky top-0 z-10 cursor-pointer select-none whitespace-nowrap border-b bg-muted font-medium hover:bg-muted hover:text-foreground ${cls}`}
                        onClick={() => toggleSort(key)}
                        title="Сортировать"
                      >
                        {label}
                        {sortKey === key && (sortDir === 1 ? " ▲" : " ▼")}
                      </th>
                    ))}
                    <th scope="col" className="px-2 py-2 text-right font-medium" title="Файлов в папке">
                      Файлы
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {visibleFolders.map((f) => {
                    const fm = f.main.frontmatter
                    const dirty = f.files.some((x) => x.dirty)
                    return (
                      <tr
                        key={f.number}
                        className={`cursor-pointer border-b transition-colors last:border-0 hover:bg-accent/50 ${
                          activeNumber === f.number ? "bg-accent/40" : ""
                        }`}
                        onClick={() => {
                          // Клик по строке — выбор + предпросмотр; номер — открыть.
                          setActiveNumber(f.number)
                          setPreviewOpen(true)
                        }}
                        onDoubleClick={() => openFolder(f.number)}
                      >
                        <td
                          className="whitespace-nowrap px-3 py-1.5 font-mono font-semibold hover:underline"
                          title={`Открыть ${f.number}`}
                          onClick={(e) => {
                            e.stopPropagation()
                            openFolder(f.number)
                          }}
                        >
                          {f.number}
                          {dirty && (
                            <span
                              className="ml-1.5 inline-block size-2 rounded-full bg-amber-500 align-middle"
                              title="Несинхронизировано"
                            />
                          )}
                        </td>
                        <td className="whitespace-nowrap px-2 py-1.5">{fm.type}</td>
                        <td className="whitespace-nowrap px-2 py-1.5 text-muted-foreground">{fm.environment}</td>
                        <td className="max-w-40 truncate px-2 py-1.5 font-mono text-xs text-muted-foreground" title={fm.product.join(", ")}>
                          {fm.product.join(", ")}
                        </td>
                        <td className="max-w-md truncate px-2 py-1.5">{fm.symptom || "— без описания симптома —"}</td>
                        <td className="hidden max-w-44 truncate px-2 py-1.5 text-xs text-muted-foreground lg:table-cell">
                          {fm.author || "— без автора —"}
                        </td>
                        <td className="whitespace-nowrap px-2 py-1.5 text-right text-xs text-muted-foreground">
                          {fmtDate(f.updatedAt)}
                        </td>
                        <td className="whitespace-nowrap px-2 py-1.5 text-right text-xs text-muted-foreground" title="Файлов в папке">
                          {f.files.length}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
  )

  /** Шторка предпросмотра активной записи (табличный режим). */
  const previewPanel = activeActual ? (
    <div className="flex h-full min-h-0 flex-col overflow-hidden border border-border bg-background">
      <div className="flex items-start justify-between gap-2 border-b px-3 py-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm font-semibold">{activeActual.number}</span>
            {activeActual.frontmatter.type && (
              <Badge variant="outline">{activeActual.frontmatter.type}</Badge>
            )}
            <Badge variant="outline">{activeActual.frontmatter.environment}</Badge>
            {activeActual.dirty && (
              <span className="size-2 rounded-full bg-amber-500" title="Несинхронизировано" />
            )}
          </div>
          <p className="text-[11px] text-muted-foreground">
            {activeActual.frontmatter.author || "— без автора —"} · обновлено{" "}
            {fmtDate(activeActual.updatedAt)}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="size-6 shrink-0"
          onClick={() => setPreviewOpen(false)}
          aria-label="Закрыть предпросмотр"
        >
          <X className="size-4" />
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        <MarkdownView body={activeActual.body} attachments={activeActual.attachments} />
      </div>
    </div>
  ) : (
    <div className="flex h-full items-center justify-center border border-border p-4 text-muted-foreground">
      Кликните по строке таблицы.
    </div>
  )

  // С открытой шторкой предпросмотра — flex-колонка под высоту окна:
  // панели занимают остаток, элементы управления и пагинация всегда видны
  // (страница не скроллится). Без шторки — обычный поток.
  return (
    <div className={fixedLayout ? "flex h-[calc(100vh-7.5rem)] flex-col gap-3" : "space-y-4"}>
      <div className={`flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between ${fixedLayout ? "shrink-0" : ""}`}>
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Локализации проблем</h1>
          <p className="text-xs text-muted-foreground">
            Всего в базе: {folders.length}
            {draftsCount > 0 && <> · черновиков: {draftsCount}</>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <StatusPill />
          <Button variant="outline" size="sm" onClick={handleSync} disabled={syncing}>
            <RefreshCw className={`size-4 ${syncing ? "animate-spin" : ""}`} />
            Синхронизировать
          </Button>
          <Button size="sm" onClick={() => createDraft()}>
            <Plus className="size-4" />
            Создать
          </Button>
        </div>
      </div>

      <div className={`flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between ${fixedLayout ? "shrink-0" : ""}`}>
        <Tabs value={mode} onValueChange={(v) => setMode(v as Mode)}>
          <TabsList className="h-8">
            <TabsTrigger value="all" className="text-xs">Все</TabsTrigger>
            <TabsTrigger value="drafts" className="text-xs">
              Черновики{draftsCount > 0 && ` (${draftsCount})`}
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="flex flex-1 flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Поиск по номеру, симптому, автору…"
              className="h-8 pl-9 text-sm"
            />
          </div>
          <Select value={type} onValueChange={(v) => setType(v as "all" | Type)}>
            <SelectTrigger className="h-8 w-full text-sm sm:w-44">
              <SelectValue placeholder="Тип" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все типы</SelectItem>
              <SelectItem value="Дефект">Дефект</SelectItem>
              <SelectItem value="Консультация">Консультация</SelectItem>
              <SelectItem value="Задача">Задача</SelectItem>
            </SelectContent>
          </Select>
          {tableView && mode !== "drafts" && (
            <Button
              variant="outline"
              size="sm"
              className="h-8"
              onClick={() => setPreviewOpen((p) => !p)}
              title={previewOpen ? "Скрыть предпросмотр" : "Предпросмотр Markdown"}
            >
              {previewOpen ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              <span className="hidden sm:inline">Предпросмотр</span>
            </Button>
          )}
        </div>
      </div>

      {!hasAny ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-2 py-12 text-center">
            <p className="text-sm text-muted-foreground">
              {mode === "drafts"
                ? "Нет черновиков во временной папке (.tmp)."
                : term || type !== "all"
                  ? "Локализации не найдены. Измените запрос."
                  : "Локализации отсутствуют."}
            </p>
            {mode !== "drafts" && !term && type === "all" && (
              <Button size="sm" onClick={() => createDraft()}>
                <Plus className="size-4" />
                Создать первую
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <>
          {showTemps && filteredTemps.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">
                Временные (.tmp) — без номера дефекта
              </p>
              <div className="grid gap-2">
                {filteredTemps.map((t) => {
                  const dirty = t.dirty
                  return (
                    <Card
                      key={t.id}
                      className="cursor-pointer transition-colors hover:bg-accent/50"
                      onClick={() => openFile(t.id)}
                    >
                      <CardContent className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-mono text-sm font-semibold">
                              {t.frontmatter.number || "Без номера"}
                            </span>
                            <Badge variant="outline">.tmp</Badge>
                            {t.frontmatter.type && TYPE_BADGE[t.frontmatter.type] && (
                              <Badge variant={TYPE_BADGE[t.frontmatter.type]}>{t.frontmatter.type}</Badge>
                            )}
                            {t.frontmatter.product.map((p) => (
                              <Badge key={p} variant="secondary" className="font-mono text-[11px]">
                                {p}
                              </Badge>
                            ))}
                            {dirty && (
                              <span
                                className="size-2 rounded-full bg-amber-500"
                                title="Несинхронизировано"
                              />
                            )}
                          </div>
                          <p className="truncate text-sm">
                            {t.frontmatter.symptom || "— без описания симптома —"}
                          </p>
                          <p className="font-mono text-[11px] text-muted-foreground">
                            {t.fileName} · обновлено {fmtDate(t.updatedAt)}
                          </p>
                        </div>
                        <div
                          className="flex shrink-0 items-center gap-2"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Button size="sm" variant="outline" onClick={() => openFile(t.id)}>
                            Открыть
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-destructive hover:text-destructive"
                            onClick={() => askDeleteTemp(t.id, t.fileName)}
                          >
                            <Trash2 className="size-4" />
                            Удалить
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  )
                })}
              </div>
            </div>
          )}

          {/* Панельная область: занимает остаток высоты (flex-1 min-h-0),
              как в TUI — элементы управления и пагинация не скроллятся. */}
          {visibleFolders.length > 0 && (tableView ? (
            showPreview ? (
              <div className="min-h-0 flex-1">
                <PanelGroup direction="horizontal" className="h-full">
                  <Panel defaultSize={33} minSize={15} className="flex min-w-0 flex-col overflow-hidden">
                    <div className="min-h-0 flex-1 overflow-y-auto rounded-md border">
                      {tableEl}
                    </div>
                  </Panel>
                  <PanelResizeHandle className="w-1 bg-border hover:bg-primary/50 transition-colors rounded-none mx-0.5" />
                  <Panel defaultSize={67} minSize={30} className="flex min-w-0 flex-col overflow-hidden">
                    {previewPanel}
                  </Panel>
                </PanelGroup>
              </div>
            ) : (
              <div className="relative min-h-0 flex-1 rounded-md border overflow-hidden">
                <div className="absolute inset-0 overflow-y-auto">{tableEl}</div>
              </div>
            )
          ) : (
            <div className="grid gap-2">
              {visibleFolders.map((f) => {
                const fm = f.main.frontmatter
                const dirty = f.files.some((x) => x.dirty)
                return (
                  <Card
                    key={f.number}
                    className="cursor-pointer transition-colors hover:bg-accent/50"
                    onClick={() => openFolder(f.number)}
                  >
                    <CardContent className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-sm font-semibold">{f.number}</span>
                          {TYPE_BADGE[fm.type] ? (
                            <Badge variant={TYPE_BADGE[fm.type]}>{fm.type}</Badge>
                          ) : (
                            <Badge variant="outline">{fm.type}</Badge>
                          )}
                          <Badge variant="outline">{fm.environment}</Badge>
                          {fm.product.map((p) => (
                            <Badge key={p} variant="secondary" className="font-mono text-[11px]">
                              {p}
                            </Badge>
                          ))}
                          {fm.flaky === "Да" && (
                            <Badge variant="outline" className="text-amber-600 dark:text-amber-400">
                              Плавающая
                            </Badge>
                          )}
                          {f.files.length > 1 && (
                            <Badge variant="secondary">{f.files.length} файла</Badge>
                          )}
                          {dirty && (
                            <span
                              className="size-2 rounded-full bg-amber-500"
                              title="Несинхронизировано"
                            />
                          )}
                        </div>
                        <p className="truncate text-sm">{fm.symptom || "— без описания симптома —"}</p>
                        <p className="text-xs text-muted-foreground">
                          {fm.author || "— без автора —"} · обновлено {fmtDate(f.updatedAt)}
                        </p>
                      </div>
                      <div
                        className="flex shrink-0 items-center gap-2"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Button size="sm" variant="outline" onClick={() => openFolder(f.number)}>
                          Открыть
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => handleClarify(f.number)}>
                          <PencilLine className="size-4" />
                          Уточнить
                        </Button>
                        {dirty && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-destructive hover:text-destructive"
                            onClick={() => askDeleteFolder(f.number)}
                          >
                            <Trash2 className="size-4" />
                            Удалить
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          ))}

        </>
      )}

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="size-5 text-amber-600 dark:text-amber-400" />
              Удалить черновик?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.description} Действие нельзя отменить.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>Удалить</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

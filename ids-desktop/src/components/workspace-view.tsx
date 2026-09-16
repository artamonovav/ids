"use client"

import * as React from "react"
import { useStore, selectFolders } from "@/lib/store"
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

const PAGE = 50

const TYPE_BADGE: Record<string, "destructive" | "secondary" | "outline"> = {
  Дефект: "destructive",
  Консультация: "secondary",
  Задача: "outline",
}

type Mode = "recent" | "drafts" | "all"

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
  const recentLimit = useStore((s) => s.recentLimit)
  const { toast } = useToast()

  const [deleteTarget, setDeleteTarget] = React.useState<DeleteTarget | null>(null)
  const [q, setQ] = React.useState("")
  const [type, setType] = React.useState<"all" | Type>("all")
  const [mode, setMode] = React.useState<Mode>("recent")
  const [limit, setLimit] = React.useState(PAGE)

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
    if (mode === "recent") {
      return [...folders].sort((a, b) => b.updatedAt - a.updatedAt)
    }
    return folders
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

  React.useEffect(() => {
    setLimit(PAGE)
  }, [mode, q, type])

  const showTemps = mode === "drafts"
  const visibleFolders = mode === "recent"
    ? filteredFolders.slice(0, recentLimit)
    : filteredFolders.slice(0, limit)
  const hasAny =
    visibleFolders.length > 0 || (showTemps && filteredTemps.length > 0)

  function handleClarify(number: string) {
    openFolder(number)
    clarify()
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

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
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

      <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
        <Tabs value={mode} onValueChange={(v) => setMode(v as Mode)}>
          <TabsList className="h-8">
            <TabsTrigger value="recent" className="text-xs">Последние</TabsTrigger>
            <TabsTrigger value="drafts" className="text-xs">
              Черновики{draftsCount > 0 && ` (${draftsCount})`}
            </TabsTrigger>
            <TabsTrigger value="all" className="text-xs">Все</TabsTrigger>
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

          {visibleFolders.length > 0 && (
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
          )}

          {mode === "all" && filteredFolders.length > limit && (
            <div className="flex flex-col items-center gap-1 py-2 text-center">
              <Button variant="outline" size="sm" onClick={() => setLimit((l) => l + PAGE)}>
                Показать ещё (ещё {filteredFolders.length - limit})
              </Button>
              <p className="text-[11px] text-muted-foreground">
                Показано {visibleFolders.length} из {filteredFolders.length}
              </p>
            </div>
          )}
          {mode === "recent" && filteredFolders.length > recentLimit && (
            <p className="text-center text-[11px] text-muted-foreground">
              Показано {visibleFolders.length} из {folders.length} в базе
            </p>
          )}
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

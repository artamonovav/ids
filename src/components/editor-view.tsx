"use client"

import * as React from "react"
import { useStore } from "@/lib/store"
import { useToast } from "@/hooks/use-toast"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
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
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  ArrowLeft,
  Save,
  PencilLine,
  Copy,
  FileText,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
} from "lucide-react"
import { FrontmatterForm } from "@/components/frontmatter-form"
import { MarkdownEditor } from "@/components/markdown-editor"
import {
  serializeDocument,
  formatAuthor,
} from "@/lib/frontmatter"
import { readDictionaries, readConfig } from "@/lib/repo"
import type { Attachment, Frontmatter, Localization } from "@/lib/types"

function fmtTime(ts: number): string {
  return new Date(ts).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Moscow",
  })
}

export function EditorView() {
  const editing = useStore((s) => s.editing)
  const files = useStore((s) => s.files)
  const patchFile = useStore((s) => s.patchFile)
  const upsertFile = useStore((s) => s.upsertFile)
  const clarify = useStore((s) => s.clarify)
  const closeEditor = useStore((s) => s.closeEditor)
  const openFile = useStore((s) => s.openFile)
  const repoFiles = useStore((s) => s.repoFiles)
  const writeDictionary = useStore((s) => s.writeDictionary)
  const dictionaries = React.useMemo(
    () => readDictionaries(repoFiles),
    [repoFiles]
  )
  const config = React.useMemo(() => readConfig(repoFiles), [repoFiles])
  const { toast } = useToast()

  const activeFile: Localization | undefined = React.useMemo(
    () => files.find((f) => f.id === editing.fileId),
    [files, editing.fileId]
  )

  const folderFiles = React.useMemo(
    () => (editing.number ? files.filter((f) => f.number === editing.number) : []),
    [files, editing.number]
  )

  const existingNumbers = React.useMemo(() => {
    const set = new Set<string>()
    for (const f of files) {
      if (f.id !== editing.fileId && f.number && !f.fileName.startsWith(".tmp/")) {
        set.add(f.number)
      }
    }
    return [...set]
  }, [files, editing.fileId])

  const profileAuthor = formatAuthor(config.profile.name, config.profile.email)

  const [fm, setFm] = React.useState<Frontmatter>(activeFile?.frontmatter ?? ({} as Frontmatter))
  const [body, setBody] = React.useState<string>(activeFile?.body ?? "")
  const [attachments, setAttachments] = React.useState<Attachment[]>(activeFile?.attachments ?? [])
  const [showSource, setShowSource] = React.useState(false)
  const [fmOpen, setFmOpen] = React.useState(true)
  const [alertOpen, setAlertOpen] = React.useState(false)
  const [missing, setMissing] = React.useState<string[]>([])

  // (Ре)загрузка локального состояния при смене файла.
  React.useEffect(() => {
    if (!activeFile) return
    setFm(activeFile.frontmatter)
    setBody(activeFile.body)
    setAttachments(activeFile.attachments)
  }, [editing.fileId])

  // Автосохранение недооформленных черновиков прямо в .tmp-запись
  // (персистится, переживает перезагрузку; для базы знаний — только явное Сохранить).
  const saveTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  React.useEffect(() => {
    if (!activeFile) return
    const isTmp = activeFile.fileName.startsWith(".tmp/") || !activeFile.number
    if (!isTmp) return
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      const spaceCode = readConfig(useStore.getState().repoFiles).profile.spaceCode || "SPAS"
      const defaultPrefix = `${spaceCode}-`
      const num = fm.number.trim()
      const fileName = num && num !== defaultPrefix ? `.tmp/${num}.md` : activeFile.fileName
      patchFile(activeFile.id, { frontmatter: fm, body, attachments, fileName })
    }, 2000)
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
    }
  }, [fm, body, attachments, editing.fileId])

  // Режим тела: просмотр для чистой сохранённой локализации, редактор — для черновика/.tmp.
  const initialEditorMode: "split" | "preview" = activeFile?.dirty ? "split" : "preview"

  function onFmChange(patch: Partial<Frontmatter>) {
    setFm((prev) => ({ ...prev, ...patch }))
  }

  function validate(): string[] {
    const m: string[] = []
    if (!fm.number.trim()) {
      m.push("Номер дефекта")
    } else if (existingNumbers.includes(fm.number)) {
      m.push("Номер уже существует — используйте «Уточнить локализацию»")
    }
    if (!fm.client.trim()) m.push("Клиент")
    if (!fm.type) m.push("Тип")
    if (!fm.environment) m.push("Окружение")
    if (!fm.symptom.trim()) m.push("Симптом")
    if (!fm.scope) m.push("Массовость (scope)")
    if (!fm.author.trim()) m.push("Автор")
    return m
  }

  /** Файлирует локализацию: .tmp → папка базы знаний (или обновление существующей). */
  function fileToFolder() {
    if (!activeFile) return
    const wasTemp = activeFile.fileName.startsWith(".tmp/")
    const fileName = wasTemp ? "localization.md" : activeFile.fileName
    const next: Localization = {
      ...activeFile,
      number: fm.number,
      fileName,
      frontmatter: fm,
      body,
      attachments,
      updatedAt: Date.now(),
      dirty: true,
    }
    upsertFile(next)
    openFile(activeFile.id) // синхронизировать editing.number с новым номером
  }

  function doSave() {
    if (!activeFile) return
    const wasTemp = activeFile.fileName.startsWith(".tmp/")
    fileToFolder()
    toast({
      title: wasTemp ? "Сохранено в базу знаний" : "Локализация сохранена",
      description: `${fm.number}/localization.md`,
    })
  }

  function handleSaveClick() {
    const m = validate()
    if (m.length === 0) {
      doSave()
      return
    }
    setMissing(m)
    setAlertOpen(true)
  }

  /** Сохранить как черновик — остаётся в .tmp (только для недооформленных). */
  function saveAsDraft() {
    if (!activeFile) return
    const spaceCode = config.profile.spaceCode || "SPAS"
    const defaultPrefix = `${spaceCode}-`
    const num = fm.number.trim()
    const fileName = num && num !== defaultPrefix ? `.tmp/${num}.md` : activeFile.fileName
    patchFile(activeFile.id, { frontmatter: fm, body, attachments, fileName })
    setAlertOpen(false)
    toast({
      title: "Сохранено как черновик (.tmp)",
      description: "Заполните все поля, чтобы перенести локализацию в базу знаний.",
    })
  }

  // Ctrl/Cmd+S и кнопка «Сохранить» в футере (событие spas:save)
  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault()
        handleSaveClick()
      }
    }
    function onSave() {
      handleSaveClick()
    }
    window.addEventListener("keydown", onKey)
    window.addEventListener("spas:save", onSave)
    return () => {
      window.removeEventListener("keydown", onKey)
      window.removeEventListener("spas:save", onSave)
    }
  }, [fm, body, attachments])

  function handleAddProduct(p: string) {
    const cur = readDictionaries(useStore.getState().repoFiles).product
    if (!cur.includes(p)) writeDictionary("product", [...cur, p])
  }
  function handleAddAttachment(a: Attachment) {
    setAttachments((prev) => [...prev, a])
  }

  function handleClarify() {
    if (!activeFile?.number) {
      toast({
        title: "Сначала укажите номер дефекта",
        description: "Уточнение создаётся в папке существующей локализации.",
        variant: "destructive",
      })
      return
    }
    clarify()
    toast({ title: "Создано уточнение локализации", description: "Шаблон заполнен из исходного файла." })
  }

  function copySource() {
    navigator.clipboard
      .writeText(serializeDocument(fm, body))
      .then(() => toast({ title: "Исходник скопирован" }))
      .catch(() => toast({ title: "Не удалось скопировать", variant: "destructive" }))
  }

  if (!activeFile) {
    return (
      <div className="flex flex-1 items-center justify-center p-10 text-muted-foreground">
        Выберите локализацию в рабочей области.
      </div>
    )
  }

  const serialized = serializeDocument(fm, body)
  const isTmp = activeFile.fileName.startsWith(".tmp/") || !activeFile.number

  return (
    <div className="space-y-3 pb-2">
      {/* Шапка */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={closeEditor}>
            <ArrowLeft className="size-5" />
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-base font-semibold">
                {activeFile.number || "Новый черновик"}
              </span>
              {isTmp && <Badge variant="outline">.tmp</Badge>}
              {activeFile.parentId && <Badge variant="secondary">Уточнение</Badge>}
              {activeFile.dirty && (
                <span
                  className="size-2 rounded-full bg-amber-500"
                  title="Несинхронизировано"
                />
              )}
            </div>
            <p className="font-mono text-[11px] text-muted-foreground">
              {activeFile.fileName} · обновлено {fmtTime(activeFile.updatedAt)}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {activeFile.number && (
            <Button variant="outline" size="sm" onClick={handleClarify}>
              <PencilLine className="size-4" />
              Уточнить локализацию
            </Button>
          )}
          <Button size="sm" onClick={handleSaveClick}>
            <Save className="size-4" />
            Сохранить
            <span className="ml-1 hidden text-xs opacity-70 sm:inline">Ctrl+S</span>
          </Button>
        </div>
      </div>

      {/* Вкладки файлов в папке */}
      {folderFiles.length > 1 && (
        <Tabs value={activeFile.id} onValueChange={(v) => openFile(v)}>
          <TabsList className="flex h-auto flex-wrap gap-1">
            {folderFiles.map((f) => (
              <TabsTrigger key={f.id} value={f.id} className="gap-1.5">
                <FileText className="size-3.5" />
                <span className="font-mono text-xs">{f.fileName}</span>
                {f.dirty && <span className="size-1.5 rounded-full bg-amber-500" />}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      )}

      {/* Форма frontmatter (сворачиваемая) */}
      <Card>
        <Collapsible open={fmOpen} onOpenChange={setFmOpen}>
          <CardHeader className="px-4 py-3">
            <CardTitle className="text-sm">Поля локализации (frontmatter)</CardTitle>
            <CardAction>
              <CollapsibleTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  className="size-7 rounded-full"
                  aria-label={fmOpen ? "Свернуть" : "Развернуть"}
                >
                  {fmOpen ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
                </Button>
              </CollapsibleTrigger>
            </CardAction>
          </CardHeader>
          <CollapsibleContent>
            <CardContent className="px-4 pb-4">
              <FrontmatterForm
                value={fm}
                onChange={onFmChange}
                dictionaries={dictionaries}
                existingNumbers={existingNumbers}
                profileAuthor={profileAuthor}
                onAddProduct={handleAddProduct}
              />
            </CardContent>
          </CollapsibleContent>
        </Collapsible>
      </Card>

      {/* Редактор тела */}
      <Card>
        <CardHeader className="px-4 py-3">
          <CardTitle className="text-sm">Тело документа (Markdown)</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <MarkdownEditor
            key={activeFile.id}
            value={body}
            onChange={setBody}
            attachments={attachments}
            onAddAttachment={handleAddAttachment}
            initialMode={initialEditorMode}
          />
        </CardContent>
      </Card>

      {/* Превью исходника */}
      <Collapsible open={showSource} onOpenChange={setShowSource}>
        <Card>
          <CardHeader className="px-4 py-3">
            <CardTitle className="text-sm">Исходник документа</CardTitle>
            <CardAction>
              <CollapsibleTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  className="size-7 rounded-full"
                  aria-label={showSource ? "Скрыть" : "Показать"}
                >
                  {showSource ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
                </Button>
              </CollapsibleTrigger>
            </CardAction>
          </CardHeader>
          <CollapsibleContent>
            <CardContent className="space-y-2 px-4 pb-4">
              <div className="flex justify-end">
                <Button variant="outline" size="sm" onClick={copySource}>
                  <Copy className="size-4" />
                  Копировать
                </Button>
              </div>
              <pre className="max-h-96 overflow-auto rounded-md border bg-muted/50 p-4 text-xs font-mono leading-relaxed">
                {serialized}
              </pre>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* Диалог валидации */}
      <AlertDialog open={alertOpen} onOpenChange={setAlertOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="size-5 text-amber-600 dark:text-amber-400" />
              {isTmp ? "Сохранить как черновик?" : "Нельзя сохранить в базу знаний"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {isTmp
                ? `Черновик останется во временной папке .tmp. Не заполнено: ${missing.join(", ")}.`
                : `Локализация в базе знаний должна быть заполнена полностью. Не заполнено: ${missing.join(", ")}.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Продолжить редактирование</AlertDialogCancel>
            {isTmp && (
              <AlertDialogAction onClick={saveAsDraft}>
                Сохранить как черновик
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

// Журнал работы приложения: лог работы (события store + файловые операции
// Rust) и лог выполнения команд git. Только просмотр + выгрузка в файл.
// Данные — invoke("read_logs"): <config_dir>/ids/app.log, строка вида
// `YYYY-MM-DD HH:MM:SS.mmm [kind] message`, kind = app | git.

import * as React from "react"
import { invoke } from "@tauri-apps/api/core"
import { save as saveDialog } from "@tauri-apps/plugin-dialog"
import { useToast } from "@/hooks/use-toast"
import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent } from "@/components/ui/card"
import { Download, GitBranch, Loader2, NotebookText, RefreshCw } from "lucide-react"

type LogTab = "app" | "git"

const TAB_TITLE: Record<LogTab, string> = {
  app: "Лог работы",
  git: "Лог git",
}

export function LogsView() {
  const [raw, setRaw] = React.useState("")
  const [tab, setTab] = React.useState<LogTab>("app")
  const [loading, setLoading] = React.useState(false)
  const [exporting, setExporting] = React.useState(false)
  const { toast } = useToast()
  const boxRef = React.useRef<HTMLPreElement | null>(null)

  const refresh = React.useCallback(async () => {
    setLoading(true)
    try {
      setRaw(await invoke<string>("read_logs"))
    } catch (e) {
      toast({
        title: "Не удалось прочитать журнал",
        description: String(e),
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }, [toast])

  React.useEffect(() => {
    void refresh()
  }, [refresh])

  const counts = React.useMemo(
    () => ({
      app: raw.split("\n").filter((l) => l.includes("[app]")).length,
      git: raw.split("\n").filter((l) => l.includes("[git]")).length,
    }),
    [raw]
  )
  const lines = React.useMemo(
    () => raw.split("\n").filter((l) => l.includes(`[${tab}]`)),
    [raw, tab]
  )

  // Свежие события внизу — автоскролл при обновлении.
  React.useEffect(() => {
    const el = boxRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [lines])

  async function handleExport() {
    const d = new Date()
    const pad = (n: number) => String(n).padStart(2, "0")
    const name = `ids-log-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}.txt`
    setExporting(true)
    try {
      const path = await saveDialog({
        title: "Выгрузить журнал",
        defaultPath: name,
        filters: [{ name: "Текстовый файл", extensions: ["txt"] }],
      })
      if (!path) return
      await invoke("export_logs", { path })
      toast({ title: "Журнал выгружен", description: String(path) })
    } catch (e) {
      toast({
        title: "Не удалось выгрузить журнал",
        description: String(e),
        variant: "destructive",
      })
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="flex h-[calc(100vh-10rem)] flex-col gap-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Журнал</h1>
          <p className="text-xs text-muted-foreground">
            Лог работы и выполнения команд git. Только просмотр; выгрузка — в файл.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={refresh} disabled={loading}>
            {loading ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <RefreshCw className="size-4" />
            )}
            Обновить
          </Button>
          <Button size="sm" onClick={handleExport} disabled={exporting}>
            {exporting ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Download className="size-4" />
            )}
            Выгрузить
          </Button>
        </div>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as LogTab)}>
        <TabsList className="h-8">
          <TabsTrigger value="app" className="gap-1.5 text-xs">
            <NotebookText className="size-3.5" />
            Работа
            {counts.app > 0 && ` (${counts.app})`}
          </TabsTrigger>
          <TabsTrigger value="git" className="gap-1.5 text-xs">
            <GitBranch className="size-3.5" />
            Git
            {counts.git > 0 && ` (${counts.git})`}
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <Card className="min-h-0 flex-1">
        <CardContent className="h-full p-0">
          <pre
            ref={boxRef}
            className="h-full overflow-y-auto rounded-md p-3 font-mono text-[11px] leading-relaxed"
          >
            {lines.length > 0 ? (
              lines.join("\n")
            ) : (
              <span className="text-muted-foreground">
                Записей нет. {TAB_TITLE[tab]} пополняется при работе приложения.
              </span>
            )}
          </pre>
        </CardContent>
      </Card>
    </div>
  )
}

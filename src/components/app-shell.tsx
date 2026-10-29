import * as React from "react"
import { useTheme } from "next-themes"
import { useStore, isEditable } from "@/lib/store"
import { usePalette } from "@/components/theme-provider"
import { PALETTES } from "@/lib/theme"
import { useToast } from "@/hooks/use-toast"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  LayoutGrid,
  Settings as SettingsIcon,
  Sun,
  Moon,
  Monitor,
  ChevronDown,
  Save,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  CloudOff,
} from "lucide-react"
import { WorkspaceView } from "@/components/workspace-view"
import { EditorView } from "@/components/editor-view"
import { SettingsView } from "@/components/settings-view"
import { SetupWizard } from "@/components/setup-wizard"
import { GitIdentityDialog } from "@/components/git-identity-dialog"
import { cn } from "@/lib/utils"
import { getVersion } from "@tauri-apps/api/app"

function ThemeMenu() {
  const { theme, resolvedTheme, setTheme } = useTheme()
  const { palette, setPalette } = usePalette()
  const [mounted, setMounted] = React.useState(false)
  React.useEffect(() => setMounted(true), [])

  const mode = mounted ? (theme ?? "system") : "system"
  const dark = resolvedTheme === "dark"
  const ModeIcon = mode === "system" ? Monitor : dark ? Moon : Sun
  const paletteName =
    PALETTES.find((p) => p.id === palette)?.name ?? "Стандартная"

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          aria-label="Тема оформления"
          title="Тема оформления"
          className="gap-1.5 px-2"
        >
          <ModeIcon className="size-5" />
          <span className="hidden md:inline">{paletteName}</span>
          <ChevronDown className="size-3.5 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="text-xs text-muted-foreground">
          Режим
        </DropdownMenuLabel>
        <DropdownMenuRadioGroup value={mode} onValueChange={setTheme}>
          <DropdownMenuRadioItem value="system">
            Системная
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="light">Светлая</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark">Тёмная</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-xs text-muted-foreground">
          Палитра
        </DropdownMenuLabel>
        <DropdownMenuRadioGroup value={palette} onValueChange={setPalette}>
          {PALETTES.map((p) => (
            <DropdownMenuRadioItem key={p.id} value={p.id}>
              {p.name}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
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
    <span className={cn("inline-flex items-center gap-1.5 text-xs", cur.cls)}>
      <Icon className="size-3.5" />
      <span className="hidden sm:inline">{syncing ? "Синхронизация…" : cur.label}</span>
      {error && (
        <span className="ml-2 hidden truncate text-muted-foreground md:inline max-w-[24rem]">
          {error}
        </span>
      )}
    </span>
  )
}

export function AppShell() {
  const setupComplete = useStore((s) => s.settings.setupComplete)
  const view = useStore((s) => s.view)
  const setView = useStore((s) => s.setView)
  const sync = useStore((s) => s.sync)
  const syncing = useStore((s) => s.syncing)
  const editingActive = useStore((s) => {
    if (s.view !== "editor" || !s.editing.fileId) return false
    const f = s.files.find((x) => x.id === s.editing.fileId)
    return !!f && isEditable(f, s.editing.mode)
  })
  const { toast } = useToast()
  const [version, setVersion] = React.useState("")
  React.useEffect(() => { getVersion().then(setVersion).catch(() => {}) }, [])

  async function handleSync() {
    await sync()
    const msg = useStore.getState().lastCommitMessage
    toast({ title: "Синхронизировано", description: msg ?? "Нет изменений для отправки" })
  }

  if (!setupComplete) return <SetupWizard />

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <GitIdentityDialog />
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/75">
        <div className="mx-auto flex h-12 w-full max-w-7xl items-center justify-between gap-2 px-4 sm:px-6">
          <div className="flex items-center gap-2">
            <img src="/logo.svg" alt="IDS" className="size-8" />
            <div className="leading-tight">
              <p className="text-sm font-semibold">IDS</p>
              <p className="hidden text-[11px] text-muted-foreground sm:block">
                Issue Documentation System
              </p>
            </div>
          </div>
          <nav className="flex items-center gap-1">
            <Button
              variant={view === "workspace" || view === "editor" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setView("workspace")}
            >
              <LayoutGrid className="size-4" />
              <span className="hidden sm:inline">Рабочая область</span>
            </Button>
            <Button
              variant={view === "settings" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setView("settings")}
            >
              <SettingsIcon className="size-4" />
              <span className="hidden sm:inline">Настройки</span>
            </Button>
            <ThemeMenu />
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-4 sm:px-6">
        {view === "workspace" && <WorkspaceView />}
        {view === "editor" && <EditorView />}
        {view === "settings" && <SettingsView />}
      </main>

      <footer className="sticky bottom-0 z-40 border-t bg-background">
        <div className="mx-auto flex h-10 w-full max-w-7xl items-center justify-between gap-2 px-4 sm:px-6">
          <StatusPill />
          {version && <span className="text-xs text-muted-foreground">v{version}</span>}
          <div className="flex items-center gap-3">
            {editingActive && (
              <Button
                size="sm"
                onClick={() => window.dispatchEvent(new CustomEvent("spas:save"))}
              >
                <Save className="size-3.5" />
                <span className="hidden sm:inline">Сохранить</span>
                <span className="ml-1 hidden text-xs opacity-70 sm:inline">Ctrl+S</span>
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={handleSync}
              disabled={syncing}
            >
              <RefreshCw className={cn("size-3.5", syncing && "animate-spin")} />
              <span className="hidden sm:inline">Синхронизировать</span>
            </Button>
          </div>
        </div>
      </footer>
    </div>
  )
}

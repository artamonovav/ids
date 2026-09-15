"use client"

import * as React from "react"
import { useTheme } from "next-themes"
import { useStore } from "@/lib/store"
import { Button } from "@/components/ui/button"
import {
  BookText,
  LayoutGrid,
  Settings as SettingsIcon,
  Sun,
  Moon,
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
import { cn } from "@/lib/utils"

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme()
  const [mounted, setMounted] = React.useState(false)
  React.useEffect(() => setMounted(true), [])
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label="Сменить тему"
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
    >
      {mounted && resolvedTheme === "dark" ? (
        <Sun className="size-5" />
      ) : (
        <Moon className="size-5" />
      )}
    </Button>
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
  const editingActive = useStore((s) => s.view === "editor" && !!s.editing.fileId)

  if (!setupComplete) return <SetupWizard />

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/75">
        <div className="mx-auto flex h-12 w-full max-w-7xl items-center justify-between gap-2 px-4 sm:px-6">
          <div className="flex items-center gap-2">
            <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <BookText className="size-4.5" />
            </div>
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
            <ThemeToggle />
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-4 sm:px-6">
        {view === "workspace" && <WorkspaceView />}
        {view === "editor" && <EditorView />}
        {view === "settings" && <SettingsView />}
      </main>

      <footer className="mt-auto border-t bg-background">
        <div className="mx-auto flex h-10 w-full max-w-7xl items-center justify-between gap-2 px-4 sm:px-6">
          <StatusPill />
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
              onClick={() => sync()}
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

import React from "react"
import { createRoot } from "react-dom/client"
import { ThemeProvider } from "@/components/theme-provider"
import { Toaster } from "@/components/ui/toaster"
import { AppShell } from "@/components/app-shell"
import { useStore } from "@/lib/store"
import "./globals.css"

// Tauri: данные в реальной ФС — грузим через init() перед первым рендером,
// чтобы мастер настройки не мигал до загрузки конфига.
function Root() {
  const [ready, setReady] = React.useState(false)
  React.useEffect(() => {
    useStore.getState().init().finally(() => setReady(true))
  }, [])
  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        Загрузка…
      </div>
    )
  }
  return <AppShell />
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <Root />
      <Toaster />
    </ThemeProvider>
  </React.StrictMode>
)

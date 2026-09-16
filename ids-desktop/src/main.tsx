import React from "react"
import { createRoot } from "react-dom/client"
import { ThemeProvider } from "@/components/theme-provider"
import { Toaster } from "@/components/ui/toaster"
import { AppShell } from "@/components/app-shell"
import { useStore } from "@/lib/store"
import "./globals.css"

// ErrorBoundary — показывает ошибку вместо белого экрана
class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: string | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props)
    this.state = { error: null }
  }
  static getDerivedStateFromError(error: Error) {
    return { error: String(error) }
  }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("IDS ErrorBoundary:", error, info)
  }
  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
          <h1 className="text-xl font-semibold text-red-600">Ошибка приложения</h1>
          <pre className="max-w-2xl overflow-auto rounded-md bg-muted p-4 text-xs">
            {this.state.error}
          </pre>
          <p className="text-sm text-muted-foreground">
            Перезапустите приложение. Если ошибка повторяется — сообщите текст выше.
          </p>
        </div>
      )
    }
    return this.props.children
  }
}

// Tauri: данные в реальной ФС — грузим через init() перед первым рендером
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
      <ErrorBoundary>
        <Root />
      </ErrorBoundary>
      <Toaster />
    </ThemeProvider>
  </React.StrictMode>
)

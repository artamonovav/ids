import * as React from "react"
import { ThemeProvider as NextThemesProvider } from "next-themes"
import {
  PALETTE_STORAGE_KEY,
  applyPalette,
  readStoredPalette,
} from "@/lib/theme"

interface PaletteContextValue {
  palette: string
  setPalette: (id: string) => void
}

const PaletteContext = React.createContext<PaletteContextValue | null>(null)

function PaletteProvider({ children }: { children: React.ReactNode }) {
  const [palette, setPaletteState] = React.useState<string>(() =>
    readStoredPalette(),
  )

  React.useEffect(() => {
    applyPalette(palette)
  }, [palette])

  const setPalette = React.useCallback((id: string) => {
    setPaletteState(id)
    applyPalette(id)
    try {
      localStorage.setItem(PALETTE_STORAGE_KEY, id)
    } catch {
      /* приватный режим / нет localStorage — палитра живёт до перезапуска */
    }
  }, [])

  const value = React.useMemo(
    () => ({ palette, setPalette }),
    [palette, setPalette],
  )

  return (
    <PaletteContext.Provider value={value}>{children}</PaletteContext.Provider>
  )
}

export function usePalette(): PaletteContextValue {
  const ctx = React.useContext(PaletteContext)
  if (!ctx) throw new Error("usePalette должен вызываться внутри ThemeProvider")
  return ctx
}

export function ThemeProvider({
  children,
  ...props
}: React.ComponentProps<typeof NextThemesProvider>) {
  return (
    <NextThemesProvider {...props}>
      <PaletteProvider>{children}</PaletteProvider>
    </NextThemesProvider>
  )
}

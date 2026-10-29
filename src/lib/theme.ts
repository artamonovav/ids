/**
 * Палитры оформления. Режим (светлый/тёмный/системный) остаётся за
 * next-themes (класс `dark`), а палитра — это `data-palette` на <html>.
 * CSS-переменные палитры заданы в globals.css; hex, не oklch (WebKit2GTK).
 */

export interface Palette {
  id: string
  name: string
}

export const PALETTES: Palette[] = [
  { id: 'default', name: 'Стандартная' },
  { id: 'github', name: 'GitHub' },
  { id: 'nord', name: 'Nord' },
  { id: 'catppuccin', name: 'Catppuccin' },
  { id: 'solarized', name: 'Solarized' },
]

export const PALETTE_STORAGE_KEY = 'ids-palette'

export function isPaletteId(id: string | null | undefined): boolean {
  return !!id && PALETTES.some((p) => p.id === id)
}

export function readStoredPalette(): string {
  try {
    const stored = localStorage.getItem(PALETTE_STORAGE_KEY)
    return isPaletteId(stored) ? (stored as string) : 'default'
  } catch {
    return 'default'
  }
}

/** Применить палитру к документу (default — без атрибута). */
export function applyPalette(id: string): void {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  if (!id || id === 'default') root.removeAttribute('data-palette')
  else root.dataset.palette = id
}

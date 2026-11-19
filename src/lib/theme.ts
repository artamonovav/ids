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
  { id: 'dracula', name: 'Dracula' },
  { id: 'tokyo-night', name: 'Tokyo Night' },
  { id: 'rose-pine', name: 'Rosé Pine' },
  { id: 'gruvbox', name: 'Gruvbox' },
]

export const PALETTE_STORAGE_KEY = 'ids-palette'

/** TUI-режим применяется до первой отрисовки из localStorage (config.yaml
 *  грузится асинхронно и для этого поздно). Значение — зеркало config.tuiMode. */
export const TUI_STORAGE_KEY = 'ids-tui'

/** Масштаб текста (проценты) — тоже зеркало config.fontScale для pre-paint. */
export const FONT_SCALE_STORAGE_KEY = 'ids-fontscale'

/** Базовый размер корневого шрифта: TUI плотнее (14px), обычный — 16px. */
export function effectiveFontSize(scalePct: number, tuiMode: boolean): number {
  const base = tuiMode ? 14 : 16
  return Math.round((base * Math.max(50, Math.min(200, scalePct))) / 100)
}

/** Применить масштаб текста (размер корневого шрифта). */
export function applyFontScale(scalePct: number, tuiMode: boolean): void {
  if (typeof document === 'undefined') return
  document.documentElement.style.fontSize = `${effectiveFontSize(scalePct, tuiMode)}px`
  try {
    localStorage.setItem(FONT_SCALE_STORAGE_KEY, String(scalePct))
  } catch {
    /* нет localStorage — масштаб живёт до перезапуска */
  }
}

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

/** Применить/снять TUI-режим (data-tui на <html>). */
export function applyTuiMode(on: boolean): void {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  if (on) root.setAttribute('data-tui', '1')
  else root.removeAttribute('data-tui')
  try {
    localStorage.setItem(TUI_STORAGE_KEY, on ? '1' : '0')
  } catch {
    /* нет localStorage — режим живёт до перезапуска */
  }
}

// Общий виртуализированный список для TUI-режима и GUI-таблицы.
// Одинаковая логика по построению: виртуализация (рендер только видимых
// строк, позиция скролла читается из DOM при рендере), шапка-сортировка,
// выделение с автоскроллом, клики (номер — открыть, поля — выбрать/просмотр).
// Отличается только подача: variant "gui" (sans, h-8, скругления) /
// "tui" (mono, h-7, плоско). Клавиатурные хоткеи — снаружи (TuiView).

import * as React from "react"

export type ListSortKey =
  | "number"
  | "type"
  | "environment"
  | "product"
  | "symptom"
  | "author"
  | "updatedAt"

export interface ListColumnDef<T> {
  key: ListSortKey
  label: string
  /** Классы ширины/скрытия колонки (одинаковые в обоих вариантах). */
  cls: string
  /** Содержимое ячейки. */
  render: (item: T) => React.ReactNode
  /** title ячейки (опционально). */
  title?: (item: T) => string
}

export interface VirtualListProps<T> {
  items: T[]
  columns: ListColumnDef<T>[]
  rowKey: (item: T) => string
  /** Индекс выбранной строки (-1 — нет выбора). */
  selectedIdx: number
  onSelect: (idx: number) => void
  /** Клик по полю номера — открыть. */
  onNumberClick: (item: T) => void
  /** Клик по любому другому полю строки. */
  onRowClick: (item: T, idx: number) => void
  /** Содержимое кликабельной ячейки номера (индикаторы и т.п.). */
  numberCell: (item: T) => React.ReactNode
  numberTitle?: (item: T) => string
  variant: "gui" | "tui"
  sortKey?: ListSortKey
  sortDir?: 1 | -1
  onSort?: (key: ListSortKey) => void
  emptyText?: string
  headTestId?: string
}

const ROW_H_PX = { gui: 32, tui: 28 } // h-8 / h-7
const HEAD_H_PX = { gui: 28, tui: 24 } // h-7 / h-6

export function VirtualList<T>({
  items,
  columns,
  rowKey,
  selectedIdx,
  onSelect,
  onNumberClick,
  onRowClick,
  numberCell,
  numberTitle,
  variant,
  sortKey,
  sortDir,
  onSort,
  emptyText = "Пусто.",
  headTestId,
}: VirtualListProps<T>) {
  const ROW_H = ROW_H_PX[variant]
  const HEAD_H = HEAD_H_PX[variant]
  const scrollRef = React.useRef<HTMLDivElement | null>(null)
  // Позиция скролла читается ПРЯМО из DOM во время рендера; onScroll/ресайз
  // лишь дёргают перерисовку — в этом WebKitGTK обновление через setState
  // отставало: окно виртуализации "залипало", строки пропадали.
  const [, bumpScroll] = React.useReducer((x: number) => x + 1, 0)
  const onScroll = React.useCallback(() => bumpScroll(), [])
  React.useEffect(() => {
    const onResize = () => bumpScroll()
    window.addEventListener("resize", onResize)
    return () => window.removeEventListener("resize", onResize)
  }, [])

  // Выбранная строка всегда в зоне видимости (прямая прокрутка — надёжнее
  // scrollIntoView при виртуализации: строка может быть ещё не отрендерена).
  React.useEffect(() => {
    const el = scrollRef.current
    if (!el || items.length === 0 || selectedIdx < 0) return
    const target = selectedIdx * ROW_H
    if (target < el.scrollTop) {
      el.scrollTop = target
    } else if (target + ROW_H > el.scrollTop + el.clientHeight) {
      el.scrollTop = target + ROW_H - el.clientHeight
    }
  }, [selectedIdx, items.length, ROW_H])

  const OVERSCAN = 10
  const scrollEl = scrollRef.current
  const scrollTop = scrollEl ? scrollEl.scrollTop : 0
  const viewH = scrollEl ? scrollEl.clientHeight : 400
  const winStart = Math.max(0, Math.floor(scrollTop / ROW_H) - OVERSCAN)
  const winEnd = Math.min(items.length, Math.ceil((scrollTop + viewH) / ROW_H) + OVERSCAN)
  const topPad = winStart * ROW_H
  const bottomPad = Math.max(0, items.length - winEnd) * ROW_H

  const tui = variant === "tui"
  const containerCls = tui
    ? "relative min-h-0 flex-1 border"
    : "relative min-h-0 flex-1 overflow-hidden rounded-md border"
  const headCls = tui
    ? "flex shrink-0 items-center gap-2 border-b bg-background px-2 text-[11px] text-muted-foreground"
    : "flex shrink-0 items-center gap-2 border-b bg-muted px-3 text-xs text-muted-foreground"
  const rowCls = tui
    ? "flex h-7 shrink-0 cursor-pointer items-center gap-2 px-2 hover:bg-accent/50 focus-visible:ring-1 focus-visible:ring-ring outline-none"
    : "flex h-8 shrink-0 cursor-pointer items-center gap-2 px-3 text-sm hover:bg-accent/50 outline-none"
  const numberCls = tui
    ? "shrink-0 cursor-pointer truncate font-semibold hover:underline"
    : "shrink-0 cursor-pointer truncate font-mono font-semibold hover:underline"

  return (
    <div className={containerCls}>
      <div className={headCls} data-testid={headTestId} style={{ height: HEAD_H }}>
        {columns.map((c) =>
          onSort ? (
            <button
              key={c.key}
              type="button"
              role="columnheader"
              onClick={() => onSort(c.key)}
              title="Сортировать"
              className={`shrink-0 text-left hover:text-foreground ${c.cls} ${c.key === "symptom" ? "min-w-0 flex-1" : ""}`}
            >
              {c.label}
              {sortKey === c.key && (sortDir === 1 ? " ▲" : " ▼")}
            </button>
          ) : (
            <span
              key={c.key}
              role="columnheader"
              className={`shrink-0 text-left ${c.cls} ${c.key === "symptom" ? "min-w-0 flex-1" : ""}`}
            >
              {c.label}
            </span>
          )
        )}
      </div>
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="absolute inset-x-0 overflow-y-auto"
        style={{ top: HEAD_H, bottom: 0 }}
        role="listbox"
        aria-label="Список локализаций"
      >
        {items.length === 0 ? (
          <p className={`text-muted-foreground ${tui ? "px-2 py-4" : "p-4"}`}>
            {emptyText}
          </p>
        ) : (
          <>
            <div style={{ height: topPad }} aria-hidden />
            {items.slice(winStart, winEnd).map((item, i) => {
              const idx = winStart + i
              const selected = idx === selectedIdx
              return (
                <div
                  key={rowKey(item)}
                  data-idx={idx}
                  role="option"
                  aria-selected={selected}
                  tabIndex={0}
                  onClick={() => onRowClick(item, idx)}
                  onDoubleClick={() => onNumberClick(item)}
                  onFocus={() => onSelect(idx)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault()
                      onNumberClick(item)
                    }
                  }}
                  className={`${rowCls} ${selected ? (tui ? "bg-accent text-accent-foreground" : "bg-accent/40") : ""}`}
                >
                  <span
                    className={numberCls}
                    title={numberTitle?.(item)}
                    onClick={(e) => {
                      e.stopPropagation()
                      onNumberClick(item)
                    }}
                  >
                    {numberCell(item)}
                  </span>
                  {columns.slice(1).map((c) => (
                    <span
                      key={c.key}
                      className={c.cls}
                      title={c.title?.(item)}
                    >
                      {c.render(item)}
                    </span>
                  ))}
                </div>
              )
            })}
            <div style={{ height: bottomPad }} aria-hidden />
          </>
        )}
      </div>
    </div>
  )
}

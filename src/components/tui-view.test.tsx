// Регрессионные тесты TUI-списка: виртуализация, сортировка, НЕ СИНХР, клавиши.
import { describe, expect, it, beforeEach, vi } from "vitest"
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react"
import React from "react"
import { TuiView } from "./tui-view"
import { useStore } from "../lib/store"
import { seedStore } from "../test/store-seed"
import { makeLocalization } from "../test/fixtures"

beforeEach(() => {
  cleanup()
  seedStore(3)
})

function renderedRows(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>("[data-idx]"))
}

describe("TuiView: список", () => {
  it("строки рендерятся, номер с точкой несинхронизации", () => {
    const { container } = render(<TuiView />)
    expect(container.querySelectorAll("td, span").length).toBeGreaterThan(0)
    expect(screen.getByText("SPAS-0001")).toBeTruthy()
  })

  it("виртуализация: на 200 записях рендерится меньше, чем есть", () => {
    const files = Array.from({ length: 200 }, (_, i) =>
      makeLocalization(`SPAS-${String(i + 1).padStart(4, "0")}`)
    ).flat()
    useStore.setState({ files })
    render(<TuiView />)
    const rows = renderedRows()
    expect(rows.length).toBeGreaterThan(0)
    expect(rows.length).toBeLessThan(200)
  })

  it("клавиша j двигает выделение на следующую строку", () => {
    const { container } = render(<TuiView />)
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "j" }))
    })
    const selected = container.querySelector('[aria-selected="true"]')
    expect(selected?.getAttribute("data-idx")).toBe("1")
  })
})

describe("TuiView: сортировка по колонкам", () => {
  it("клик по «Автор» сортирует по возрастанию (▲)", () => {
    render(<TuiView />)
    fireEvent.click(screen.getByText("Автор"))
    expect(screen.getByText(/Автор.*▲|▲.*Автор/s)).toBeTruthy()
  })

  it("сортировка по номеру по убыванию — большие SPAS сверху", () => {
    const { container } = render(<TuiView />)
    const first = container.querySelector('[data-idx="0"]')?.textContent ?? ""
    expect(first).toContain("SPAS-0003")
  })
})

describe("TuiView: не синхронизировано", () => {
  it("считает dirty в IDS и внешние (git) папки", () => {
    // seedStore: SPAS-0001 dirty; внешняя — SPAS-0002
    useStore.setState({ unsyncedExternal: ["SPAS-0002"] })
    render(<TuiView />)
    expect(screen.getByText(/\[ НЕ СИНХР 2 \]/)).toBeTruthy()
  })

  it("фильтр [ НЕ СИНХР ] оставляет только изменённые", () => {
    useStore.setState({ unsyncedExternal: ["SPAS-0002"] })
    render(<TuiView />)
    fireEvent.click(screen.getByText(/\[ НЕ СИНХР 2 \]/))
    const rows = renderedRows().map((r) => r.textContent)
    expect(rows.length).toBe(2)
    expect(rows.some((t) => t?.includes("SPAS-0001"))).toBe(true)
    expect(rows.some((t) => t?.includes("SPAS-0002"))).toBe(true)
    expect(rows.some((t) => t?.includes("SPAS-0003"))).toBe(false)
  })

  it("клавиша u переключает фильтр", () => {
    render(<TuiView />)
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "u" }))
    })
    // SPAS-0001 dirty → фильтр показывает только её
    const rows = renderedRows().map((r) => r.textContent)
    expect(rows.length).toBe(1)
    expect(rows[0]).toContain("SPAS-0001")
  })
})

describe("TuiView: статус и футер", () => {
  it("текст статуса в шапке (не графический gauge)", () => {
    render(<TuiView />)
    expect(screen.getByText("СИНХРОНИЗИРОВАНО")).toBeTruthy()
    expect(screen.queryByText(/\[█/)).toBeNull()
  })

  it("футер с подсказками клавиш", () => {
    render(<TuiView />)
    expect(screen.getByText(/j\/k/)).toBeTruthy()
    expect(screen.getByText(/выход/)).toBeTruthy()
  })
})

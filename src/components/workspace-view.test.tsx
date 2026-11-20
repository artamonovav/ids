// Регрессионные тесты рабочей области (табличный режим — как в TUI).
import { describe, expect, it, beforeEach } from "vitest"
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react"
import React from "react"
import { WorkspaceView } from "./workspace-view"
import { useStore } from "../lib/store"
import { seedStore } from "../test/store-seed"
import { invokeMock } from "../test/setup"
import { makeLocalization } from "../test/fixtures"

beforeEach(() => {
  cleanup()
  seedStore(3)
})

describe("WorkspaceView: табличный режим", () => {
  it("шапка таблицы содержит все колонки (состав как в TUI)", () => {
    render(<WorkspaceView />)
    const headers = screen
      .getAllByRole("columnheader")
      .map((h) => (h.textContent ?? "").replace(/[▲▼]/g, "").trim())
    expect(headers).toEqual([
      "Номер",
      "Тип",
      "Окр.",
      "Продукты",
      "Симптом",
      "Автор",
      "Обновлено",
    ])
  })

  it("строки рендерятся, у строки столько ячеек, сколько колонок", () => {
    const { container } = render(<WorkspaceView />)
    const firstRow = container.querySelector('[data-idx="0"]')!
    expect(firstRow.children.length).toBe(
      screen.getAllByRole("columnheader").length
    )
    expect(screen.getByText("SPAS-0003")).toBeTruthy()
  })

  it("колонки «Файлы» нет в таблице (убрана)", () => {
    render(<WorkspaceView />)
    expect(screen.queryByTitle("Файлов в папке")).toBeNull()
  })

  it("в таблице пагинации нет — весь список в скролле", () => {
    render(<WorkspaceView />)
    expect(screen.queryByText(/Стр\. /)).toBeNull()
    expect(screen.queryByText("Вперёд")).toBeNull()
  })

  it("в карточках пагинация есть", () => {
    useStore.setState({
      config: { ...useStore.getState().config, tableView: false },
    })
    render(<WorkspaceView />)
    expect(
      screen.getByText((_, el) => el?.textContent === "Стр. 1 из 1 (3)")
    ).toBeTruthy()
    expect(screen.getByText(/Вперёд/)).toBeTruthy()
  })

  it("клик по полю номера открывает локализацию (view = editor)", async () => {
    render(<WorkspaceView />)
    fireEvent.click(screen.getByText("SPAS-0002"))
    await act(async () => {})
    expect(useStore.getState().view).toBe("editor")
  })

  it("клик по другому полю — шторка предпросмотра с телом записи", () => {
    const { container } = render(<WorkspaceView />)
    const firstRow = container.querySelector('[data-idx="0"]')!
    fireEvent.click(firstRow.children[1]!) // Тип
    expect(screen.getByText(/Шаги воспроизведения/)).toBeTruthy()
  })


})

describe("WorkspaceView:(cards)", () => {
  it("при выключенной таблице — карточки с кнопкой «Открыть»", () => {
    useStore.setState({
      config: { ...useStore.getState().config, tableView: false },
    })
    render(<WorkspaceView />)
    expect(screen.getAllByText("Открыть").length).toBe(3)
  })
})

describe("WorkspaceView: статус синхронизации", () => {
  it("статус «жёлтый» отображается как «Есть несинхронизированные изменения»", () => {
    // refreshSyncState ставит yellow, когда git насчитал изменения
    useStore.setState({ syncStatus: "yellow", unsyncedExternal: ["SPAS-0002"] })
    render(<WorkspaceView />)
    expect(
      screen.getByText(/несинхронизированные изменения/i)
    ).toBeTruthy()
  })
})

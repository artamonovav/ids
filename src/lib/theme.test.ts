import { describe, expect, it } from "vitest"
import { effectiveFontSize } from "./theme"

describe("theme: масштаб текста", () => {
  it("обычный 100% → 16px", () => {
    expect(effectiveFontSize(100, false)).toBe(16)
  })
  it("TUI плотнее: база 14px", () => {
    expect(effectiveFontSize(100, true)).toBe(14)
  })
  it("масштаб применяется к базе", () => {
    expect(effectiveFontSize(130, false)).toBe(21)
    expect(effectiveFontSize(85, true)).toBe(12)
  })
})

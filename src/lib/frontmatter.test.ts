import { describe, expect, it } from "vitest"
import { serializeDocument, parseFrontmatter } from "./frontmatter"
import { EMPTY_FRONTMATTER } from "./template"
import type { Frontmatter } from "../lib/types"

const fm: Frontmatter = {
  number: "SPAS-0001",
  client: "Холдинг Т1",
  type: "Дефект",
  environment: "Прод",
  symptom: "Строка 1\nСтрока 2",
  product: ["SPAS-Web"],
  version: "1.0",
  flaky: "Нет",
  scope: "Единичное",
  root_cause: "причина",
  resolution: "решение",
  related: ["SPAS-0002"],
  author: "Иван <i@x.ru>",
}

describe("frontmatter: сериализация/парсинг", () => {
  it("roundtrip всех полей", () => {
    const doc = serializeDocument(fm, "тело")
    const m = /^---\n([\s\S]*?)\n---\n/.exec(doc)
    expect(m).not.toBeNull()
    const back = parseFrontmatter(m![1])
    expect(back.number).toBe("SPAS-0001")
    expect(back.symptom).toBe("Строка 1\nСтрока 2")
    expect(back.product).toEqual(["SPAS-Web"])
    expect(back.related).toEqual(["SPAS-0002"])
    expect(back.author).toBe("Иван <i@x.ru>")
  })

  it("saved_at записывается и читается", () => {
    const withSaved: Frontmatter = { ...fm, saved_at: "2026-11-20T10:00:00.000Z" }
    const doc = serializeDocument(withSaved, "тело")
    expect(doc).toContain('saved_at: "2026-11-20T10:00:00.000Z"')
    const back = parseFrontmatter(/^---\n([\s\S]*?)\n---\n/.exec(doc)![1])
    expect(back.saved_at).toBe("2026-11-20T10:00:00.000Z")
  })

  it("без saved_at строка не пишется (эталон не засоряется)", () => {
    const doc = serializeDocument(EMPTY_FRONTMATTER, "тело")
    expect(doc).not.toContain("saved_at")
  })
})

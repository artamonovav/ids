import { describe, expect, it } from "vitest"
import { parseConfig, serializeConfig, DEFAULT_USER_CONFIG } from "./repo"

describe("repo: config.yaml", () => {
  it("старый конфиг без новых ключей → дефолты (tableView включён)", () => {
    const cfg = parseConfig('folder: /tmp/kb\nprofile:\n  name: "Иван"\n  email: "i@x.ru"\nrecentLimit: 3\n')
    expect(cfg.tuiMode).toBe(false)
    expect(cfg.tableView).toBe(true) // дефолт 0.3.5
    expect(cfg.fontScale).toBe(100)
  })

  it("roundtrip новых ключей", () => {
    const cfg = {
      ...DEFAULT_USER_CONFIG,
      tuiMode: true,
      tableView: false,
      fontScale: 115,
    }
    const back = parseConfig(serializeConfig(cfg))
    expect(back.tuiMode).toBe(true)
    expect(back.tableView).toBe(false)
    expect(back.fontScale).toBe(115)
  })
})

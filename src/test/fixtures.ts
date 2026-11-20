// Фабрика тестовых локализаций (структура — как у реальных файлов).
import type { Frontmatter, Localization } from "../lib/types"

export function makeFrontmatter(patch: Partial<Frontmatter> = {}): Frontmatter {
  return {
    number: "SPAS-0001",
    client: "Холдинг Т1",
    type: "Дефект",
    environment: "Прод",
    symptom: "Симптом",
    product: ["SPAS-Web"],
    version: "1.0",
    flaky: "Нет",
    scope: "Единичное",
    root_cause: "",
    resolution: "",
    related: [],
    author: "Иван <i@x.ru>",
    ...patch,
  }
}

/** Папка локализации: main + дополнительные файлы (localization-N.md). */
export function makeLocalization(
  number: string,
  opts: {
    dirty?: boolean
    author?: string
    symptom?: string
    body?: string
    extraFiles?: number
  } = {},
): Localization[] {
  const main: Localization = {
    id: `${number}/localization.md`,
    number,
    fileName: "localization.md",
    frontmatter: makeFrontmatter({
      number,
      author: opts.author ?? "Иван <i@x.ru>",
      symptom: opts.symptom ?? "Симптом",
    }),
    body: opts.body ?? `# ${number}\n\nШаги воспроизведения\n`,
    attachments: [],
    createdAt: 1700000000000,
    updatedAt: 1700000000000,
    dirty: opts.dirty ?? false,
    synced: !opts.dirty,
  }
  const out = [main]
  for (let i = 2; i <= (opts.extraFiles ?? 1); i++) {
    out.push({ ...main, id: `${number}/localization-${i}.md`, fileName: `localization-${i}.md`, dirty: opts.dirty ?? false })
  }
  return out
}

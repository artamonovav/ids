// Кастомный YAML-сериализатор/парсер frontmatter.
// Гарантирует порядок полей и комментарии из эталонного шаблона
// (js-yaml и gray-matter не сохраняют комментарии и порядок в общем виде).

import type { Frontmatter, Localization } from "./types"

// Комментарии точно из эталонного шаблона.
const COMMENT = {
  symptom:
    "# symptom — симптомы, часто название из дефекта",
  product:
    "# product — массив продуктов. Пустой, один или несколько продуктов через запятую с пробелом.",
  version:
    "# version — версия LTS-релиза и версия проблемного микросервиса, если известна",
  flaky: "# flaky — плавающая ошибка?",
  scope: "# scope — массовость проблемы",
  related:
    "# related — массив связанных задач, если известны/повторения/заведённый дефект. Пустой, один или несколько номеров через запятую с пробелом.",
  author:
    '# author — автор локализации: "ФИО <email>". Пример: "Anatoly Artamonov aartamonov@nota.tech"',
}

// --- Скаляры -------------------------------------------------------------

function doubleQuote(s: string): string {
  const escaped = s
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/\t/g, "\\t")
  return `"${escaped}"`
}

function needsQuotingPlain(s: string): boolean {
  if (s === "") return true
  if (s !== s.trim()) return true
  if (/^[-?:,[\]{}#&*!|>'"%@`]/.test(s)) return true
  if (/^(?:true|false|null|yes|no|on|off|~)$/i.test(s)) return true
  if (/^-?\d/.test(s)) return true
  if (/:\s/.test(s)) return true
  if (/:$/.test(s)) return true
  if (/#/.test(s)) return true
  if (/[^\x09\x0A\x0D\x20-\x7EА-Яа-яЁё…—–\-+/.@<>(),.=\s]/.test(s)) return true
  return false
}

function scalar(s: string): string {
  if (s === "") return '""'
  return needsQuotingPlain(s) ? doubleQuote(s) : s
}

function flowItem(s: string): string {
  if (s === "") return '""'
  if (/[\s,:[\]{}#"'\\]/.test(s)) return doubleQuote(s)
  return s
}

function flowArray(arr: string[]): string {
  if (!arr || arr.length === 0) return "[]"
  return "[" + arr.map(flowItem).join(", ") + "]"
}

/** symptom — всегда block scalar |- (как в эталоне). */
function blockSymptom(s: string): string {
  if (s === "") return 'symptom: ""'
  const lines = s.replace(/\r\n/g, "\n").split("\n")
  const body = lines.map((l) => "  " + l).join("\n")
  return `symptom: |-\n${body}`
}

/**
 * Поле, которое однострочно — сериализуется plain-скаляром,
 * а при наличии переносов строк — block scalar |- (для root_cause/resolution).
 */
function fieldBlock(key: string, value: string): string {
  if (value === "") return `${key}: ""`
  if (value.includes("\n")) {
    const lines = value.replace(/\r\n/g, "\n").split("\n")
    return `${key}: |-\n` + lines.map((l) => "  " + l).join("\n")
  }
  return `${key}: ${scalar(value)}`
}

// --- Сериализация --------------------------------------------------------

export function serializeFrontmatter(fm: Frontmatter): string {
  const lines: string[] = []
  lines.push(`number: ${scalar(fm.number)}`)
  lines.push(`client: ${scalar(fm.client)}`)
  lines.push(`type: ${scalar(fm.type)}`)
  lines.push(`environment: ${scalar(fm.environment)}`)
  lines.push(COMMENT.symptom)
  lines.push(blockSymptom(fm.symptom))
  lines.push(COMMENT.product)
  lines.push(`product: ${flowArray(fm.product)}`)
  lines.push(COMMENT.version)
  lines.push(`version: ${scalar(fm.version)}`)
  lines.push(COMMENT.flaky)
  lines.push(`flaky: ${scalar(fm.flaky)}`)
  lines.push(COMMENT.scope)
  lines.push(`scope: ${scalar(fm.scope)}`)
  lines.push(fieldBlock("root_cause", fm.root_cause))
  lines.push(fieldBlock("resolution", fm.resolution))
  lines.push(COMMENT.related)
  lines.push(`related: ${flowArray(fm.related)}`)
  lines.push(COMMENT.author)
  lines.push(`author: ${scalar(fm.author)}`)
  return lines.join("\n")
}

export function serializeDocument(fm: Frontmatter, body: string): string {
  // Нормализуем CRLF → LF в body: гарантия LF-окончаний в файле независимо
  // от платформы (на Windows textarea/редактор может давать \r\n).
  const normBody = body.replace(/\r\n/g, "\n").replace(/\n*$/, "")
  return `---\n${serializeFrontmatter(fm)}\n---\n\n${normBody}\n`
}

// --- Парсер (упрощённый, под наш фиксированный schema) -------------------

function unquote(s: string): string {
  const t = s.trim()
  if (t.startsWith('"') && t.endsWith('"')) {
    return t
      .slice(1, -1)
      .replace(/\\n/g, "\n")
      .replace(/\\r/g, "\r")
      .replace(/\\t/g, "\t")
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, "\\")
  }
  return t
}

function parseFlowArray(s: string): string[] {
  const t = s.trim()
  const inner = t.startsWith("[") && t.endsWith("]") ? t.slice(1, -1) : t
  if (inner.trim() === "") return []
  return inner.split(",").map((p) => unquote(p.trim()))
}

/** Разбор frontmatter из текста документа (между --- ... ---). */
export function parseFrontmatter(raw: string): Frontmatter {
  const result: Frontmatter = {
    number: "SPAS-0001",
    client: "Холдинг Т1",
    type: "Дефект",
    environment: "Препрод",
    symptom: "",
    product: [],
    version: "",
    flaky: "Нет",
    scope: "Единичное",
    root_cause: "",
    resolution: "",
    related: [],
    author: "",
  }
  const lines = raw.replace(/\r\n/g, "\n").split("\n")
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    const m = /^([a-zA-Z_]+):\s?(.*)$/.exec(line)
    if (m) {
      const key = m[1]
      const val = m[2].trim()
      if (val === "|-" || val === "|" || val === "|+") {
        const buf: string[] = []
        i++
        while (i < lines.length && /^\s/.test(lines[i])) {
          buf.push(lines[i].replace(/^ {2}/, ""))
          i++
        }
        ;(result as unknown as Record<string, unknown>)[key] = buf.join("\n")
        continue
      } else if (val.startsWith("[")) {
        ;(result as unknown as Record<string, unknown>)[key] = parseFlowArray(val)
      } else {
        ;(result as unknown as Record<string, unknown>)[key] = unquote(val)
      }
    }
    i++
  }
  // flaky — единственное поле с фиксированным набором; при пустом/невалидном — «Нет»
  if (result.flaky !== "Да" && result.flaky !== "Нет") result.flaky = "Нет"
  return result
}

// --- Вспомогательные функции --------------------------------------------

const NUMBER_RE = /^SPAS-(\d+)$/

export function isValidNumber(v: string): boolean {
  return NUMBER_RE.test(v.trim())
}

export function formatAuthor(name: string, email: string): string {
  const n = name.trim()
  const e = email.trim()
  if (!n && !e) return ""
  if (n && e) return `${n} <${e}>`
  return n || e
}

export function nextNumber(numbers: string[]): string {
  let max = 0
  for (const n of numbers) {
    const m = NUMBER_RE.exec(n.trim())
    if (m) max = Math.max(max, parseInt(m[1], 10))
  }
  return `SPAS-${String(max + 1).padStart(4, "0")}`
}

export function clarifyIndex(fileName: string): number | null {
  const m = /^localization-(\d+)\.md$/.exec(fileName)
  return m ? parseInt(m[1], 10) : null
}

/**
 * Commit-сообщение для синхронизации файла локализации с Git.
 *  - уточнение (localization-N.md): [<номер>] Уточнение локализации (N)
 *  - новая (первая отправка):       [<номер>] Создана локализация
 *  - правка существующей:           [<номер>] Обновлена локализация
 */
export function commitMessageFor(file: Localization): string {
  const num = file.number || "Без-номера"
  const idx = clarifyIndex(file.fileName)
  if (file.parentId && idx) return `[${num}] Уточнение локализации (${idx})`
  if (!file.synced) return `[${num}] Создана локализация`
  return `[${num}] Обновлена локализация`
}

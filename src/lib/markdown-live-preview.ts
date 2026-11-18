/**
 * Live-preview для Markdown в CodeMirror 6 — режим, близкий к Obsidian:
 * разметка (`**`, `#`, `` ` ``, ссылки, картинки, чекбоксы, таблицы) скрыта
 * или отрисована, пока курсор не находится в соответствующем фрагменте.
 *
 * Исходник остаётся настоящим Markdown: декорации только меняют отображение,
 * ни один символ не переписывается. Поэтому файлы в базе знаний не меняются
 * от простого открытия и переключения режимов.
 *
 * Производительность: инлайн-декорации строятся только для строк видимой
 * области (view.visibleRanges; скролл → viewportChanged → пересчёт).
 * Состояние code-fence при этом трекается по всему документу — оно нужно
 * для корректной видимости ` ``` ` у границ вьюпорта.
 */
import type { EditorState, Extension } from '@codemirror/state'
import { StateField } from '@codemirror/state'
import {
  Decoration,
  EditorView,
  ViewPlugin,
  WidgetType,
  type DecorationSet,
  type ViewUpdate,
} from '@codemirror/view'
import type { Range } from '@codemirror/state'

type ResolveImageSrc = (src?: string) => string | undefined

/** Хендлеры live-preview: резолв картинок + опциональный клик по картинке. */
export interface LivePreviewHandlers {
  resolveImageSrc: () => ResolveImageSrc
  /** Клик по картинке в Live → полноразмерный предпросмотр (диалог в UI). */
  onImageClick?: (src: string, alt: string) => void
}

const HIDE = Decoration.replace({})

// --- diff-блоки (```diff): подсветка добавленного/удалённого ---

/** Класс строки diff-блока: +/+++/@@/-/---. */
function diffLineClass(text: string): string {
  if (text.startsWith('@@')) return 'cm-md-diff-hunk'
  if (text.startsWith('+') && !text.startsWith('+++')) return 'cm-md-diff-add'
  if (text.startsWith('-') && !text.startsWith('---')) return 'cm-md-diff-del'
  return ''
}

/** Строка внутри code-fence: моно-класс, для diff — цветовая индикация строк. */
function codeLineDeco(lang: string, text: string): Decoration {
  if (lang === 'diff' || lang === 'patch') {
    const diffCls = diffLineClass(text)
    if (diffCls) return lineDeco(`cm-md-codeblock ${diffCls}`)
  }
  return CODE_LINE
}

const MARK_EM = Decoration.mark({ class: 'cm-md-em' })
const MARK_STRONG_EM = Decoration.mark({ class: 'cm-md-strong cm-md-em' })
const MARK_STRONG = Decoration.mark({ class: 'cm-md-strong' })
const MARK_STRIKE = Decoration.mark({ class: 'cm-md-strike' })
const MARK_CODE = Decoration.mark({ class: 'cm-md-code' })
const MARK_LIST = Decoration.mark({ class: 'cm-md-listmark' })
const MARK_TASK_DONE = Decoration.mark({ class: 'cm-md-task-done' })

/** Ссылка с URL в title — при наведении видно, куда ведёт ссылка, не выходя
 *  из курсорного фрагмента. Кэш по URL: декорации неизменяемы. */
const LINK_MARKS = new Map<string, Decoration>()
function linkMark(url: string): Decoration {
  let d = LINK_MARKS.get(url)
  if (!d) {
    d = Decoration.mark({ class: 'cm-md-link', attributes: { title: url } })
    if (LINK_MARKS.size > 500) LINK_MARKS.clear()
    LINK_MARKS.set(url, d)
  }
  return d
}

const LINE_CLASSES = new Map<string, Decoration>()

function lineDeco(cls: string): Decoration {
  let d = LINE_CLASSES.get(cls)
  if (!d) {
    d = Decoration.line({ class: cls })
    LINE_CLASSES.set(cls, d)
  }
  return d
}

const HEADING_LINE = [1, 2, 3, 4, 5, 6].map((n) => lineDeco(`cm-md-h${n}`))
const QUOTE_LINE = lineDeco('cm-md-quote')
const CODE_LINE = lineDeco('cm-md-codeblock')
const TASK_LINE = lineDeco('cm-md-task-line')

/** Вложенные цитаты: сдвиг на каждый уровень `>` (глубина ограничена 4). */
function quoteLineDeco(depth: number): Decoration {
  const capped = Math.min(depth, 4)
  return capped > 1
    ? lineDeco(`cm-md-quote cm-md-quote-${capped}`)
    : QUOTE_LINE
}

class CheckboxWidget extends WidgetType {
  constructor(
    readonly checked: boolean,
    readonly pos: number,
  ) {
    super()
  }

  eq(other: CheckboxWidget): boolean {
    return other.checked === this.checked && other.pos === this.pos
  }

  toDOM(): HTMLElement {
    const box = document.createElement('span')
    box.className = this.checked
      ? 'cm-md-checkbox cm-md-checkbox-checked'
      : 'cm-md-checkbox'
    box.dataset.pos = String(this.pos)
    box.setAttribute('role', 'checkbox')
    box.setAttribute('aria-checked', String(this.checked))
    return box
  }
}

class ImageWidget extends WidgetType {
  constructor(
    readonly src: string,
    readonly alt: string,
  ) {
    super()
  }

  eq(other: ImageWidget): boolean {
    return other.src === this.src && other.alt === this.alt
  }

  toDOM(): HTMLElement {
    const img = document.createElement('img')
    img.className = 'cm-md-image'
    img.src = this.src
    img.alt = this.alt
    img.title = this.alt || this.src
    img.draggable = false
    // Данные для обработчика клика (открытие предпросмотра).
    img.dataset.mdSrc = this.src
    img.dataset.mdAlt = this.alt
    img.loading = 'lazy'
    return img
  }
}

// --- GFM-таблицы ---

export interface TableData {
  header: string[]
  aligns: Array<'' | 'left' | 'center' | 'right'>
  rows: string[][]
}

class TableWidget extends WidgetType {
  constructor(readonly data: TableData) {
    super()
  }

  eq(other: TableWidget): boolean {
    if (this.data === other.data) return true
    return (
      this.data.header.join('\u0001') === other.data.header.join('\u0001') &&
      this.data.aligns.join() === other.data.aligns.join() &&
      this.data.rows.length === other.data.rows.length &&
      this.data.rows.every(
        (r, i) => r.join('\u0001') === other.data.rows[i].join('\u0001'),
      )
    )
  }

  toDOM(): HTMLElement {
    const table = document.createElement('table')
    table.className = 'cm-md-table'
    const thead = document.createElement('thead')
    const headRow = document.createElement('tr')
    this.data.header.forEach((cell, i) => {
      const th = document.createElement('th')
      th.textContent = cell
      const align = this.data.aligns[i]
      if (align) th.style.textAlign = align
      headRow.appendChild(th)
    })
    thead.appendChild(headRow)
    const tbody = document.createElement('tbody')
    for (const row of this.data.rows) {
      const tr = document.createElement('tr')
      for (let i = 0; i < this.data.header.length; i++) {
        const td = document.createElement('td')
        td.textContent = row[i] ?? ''
        const align = this.data.aligns[i]
        if (align) td.style.textAlign = align
        tr.appendChild(td)
      }
      tbody.appendChild(tr)
    }
    table.appendChild(thead)
    table.appendChild(tbody)
    return table
  }

  ignoreEvent(): boolean {
    // Клик по таблице должен позиционировать курсор — таблица покажется
    // как исходник для правки (поведение Obsidian).
    return false
  }
}

function splitTableRow(text: string): string[] {
  let t = text.trim()
  if (t.startsWith('|')) t = t.slice(1)
  if (t.endsWith('|')) t = t.slice(0, -1)
  return t.split('|').map((c) => c.trim())
}

function parseAlign(cell: string): '' | 'left' | 'center' | 'right' {
  const left = cell.startsWith(':')
  const right = cell.endsWith(':')
  return left && right ? 'center' : right ? 'right' : left ? 'left' : ''
}

/** Таблица GFM, начинающаяся со строки n: header + delimiter `---` + body.
 *  Возвращает последнюю строку таблицы и данные для виджета. */
function parseTable(
  doc: EditorState['doc'],
  n: number,
): { endLine: number; data: TableData } | null {
  if (n + 1 > doc.lines) return null
  const header = splitTableRow(doc.line(n).text)
  if (header.length === 0 || !header.some((c) => c.length > 0)) return null
  const delim = splitTableRow(doc.line(n + 1).text)
  if (delim.length !== header.length) return null
  if (!delim.every((c) => /^:?-+:?$/.test(c))) return null
  const aligns = delim.map(parseAlign) as TableData['aligns']
  const rows: string[][] = []
  let end = n + 1
  for (let i = n + 2; i <= doc.lines; i++) {
    const t = doc.line(i).text.trim()
    if (!t || !t.includes('|')) break
    rows.push(splitTableRow(doc.line(i).text))
    end = i
    if (rows.length >= 200) break // защита от патологических таблиц
  }
  return { endLine: end, data: { header, aligns, rows } }
}

interface DecorationItem {
  from: number
  to: number
  deco: Decoration
}

/** Перекрываются ли диапазоны (границы не считаются пересечением). */
function overlaps(aFrom: number, aTo: number, bFrom: number, bTo: number) {
  return aFrom < bTo && bFrom < aTo
}

/** Все совпадения регулярного выражения (регэксп должен быть с флагом g). */
function scan(
  text: string,
  re: RegExp,
  fn: (m: RegExpExecArray) => void,
) {
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    fn(m)
    if (m[0].length === 0) re.lastIndex++
  }
}

// --- Экранирование (\*, \` и т.д.) ---

const ESCAPABLE = /[!"#$%&'()*+,\-./:;<=>?@[\]^_`{|}~]/

/**
 * Markdown-экранирование: заменяет экранированный ASCII-символ на \u0000
 * (строка той же длины — позиции 1:1), чтобы regex-сканы не видели в них
 * маркеры разметки (`\*текст\*` — не курсив). Экранирует только последняя
 * `\` серии. Возвращает почищенную строку и позиции `\`, экранирующих символ
 * (их можно скрыть вне курсорного фрагмента).
 */
function mapEscapes(inline: string): { clean: string; escapes: number[] } {
  let clean = ''
  const escapes: number[] = []
  let backslashes = 0
  let lastRunStart = -1
  for (let i = 0; i < inline.length; i++) {
    const ch = inline[i]
    if (ch === '\\') {
      if (backslashes === 0) lastRunStart = i
      backslashes++
      clean += ch
      continue
    }
    if (backslashes > 0 && ESCAPABLE.test(ch)) {
      // экранирует только последний `\` серии
      escapes.push(lastRunStart + backslashes - 1)
      clean += '\u0000'
    } else {
      clean += ch
    }
    backslashes = 0
  }
  return { clean, escapes }
}

/** Состояние code-fence: символ/длина маркера + язык из info-строки. */
interface FenceState {
  ch: '`' | '~'
  len: number
  lang: string
}

/** Обновить состояние code-fence по строке (нужно для всех строк документа). */
function updateFence(text: string, fence: FenceState | null): FenceState | null {
  const m = /^(\s*)(`{3,}|~{3,})(.*)$/.exec(text)
  if (fence !== null) {
    if (m && m[2][0] === fence.ch && m[2].length >= fence.len) return null
    return fence
  }
  if (m) {
    const lang = m[3].trim().split(/\s+/)[0]?.toLowerCase() ?? ''
    return { ch: m[2][0] as '`' | '~', len: m[2].length, lang }
  }
  return null
}

export function buildLiveDecorations(
  state: EditorState,
  resolveImageSrc: ResolveImageSrc,
  visible?: readonly { from: number; to: number }[],
): DecorationSet {
  const doc = state.doc
  const items: DecorationItem[] = []

  // Строки с курсором/выделением: в них разметку не скрываем, чтобы её
  // можно было править руками (поведение Obsidian).
  const cursorLines = new Set<number>()
  const ranges = state.selection.ranges.map((r) => {
    const startLine = doc.lineAt(r.from).number
    const endLine = doc.lineAt(r.to).number
    for (let n = startLine; n <= endLine; n++) cursorLines.add(n)
    return { from: r.from, to: r.to }
  })
  const touched = (from: number, to: number) =>
    ranges.some((r) => r.from <= to && r.to >= from)

  // Видимые строки: декорации строим только для них. visibleRanges → пары
  // номеров строк (границы вьюпорта включительно).
  let visRanges: Array<[number, number]> | null = null
  if (visible && visible.length > 0) {
    visRanges = visible.map((r) => [
      doc.lineAt(r.from).number,
      doc.lineAt(r.to).number,
    ])
  }
  const isVisible = (n: number) =>
    !visRanges || visRanges.some(([a, b]) => n >= a && n <= b)

  const push = (from: number, to: number, deco: Decoration) => {
    items.push({ from, to, deco })
  }

  let fence: FenceState | null = null
  // Строки, занятые уже отрисованной таблицей (их не сканируем заново).
  let tableUntil = 0
  // GitHub-алерт: действует на все строки цитаты, пока цитата не кончилась.
  let alertKind: string | null = null

  for (let n = 1; n <= doc.lines; n++) {
    const line = doc.line(n)
    const text = line.text
    const base = line.from

    // Невидимые строки: только bookkeeping fence-состояния.
    if (!isVisible(n)) {
      fence = updateFence(text, fence)
      continue
    }

    const lineTouched = cursorLines.has(n)

    // --- блоки кода ---
    if (fence !== null) {
      push(base, base, codeLineDeco(fence.lang, text))
      const closing = /^(\s*)(`{3,}|~{3,})/.exec(text)
      if (
        closing &&
        closing[2][0] === fence.ch &&
        closing[2].length >= fence.len
      ) {
        if (!lineTouched) {
          push(base, base + closing[0].length, HIDE)
        }
        fence = null
      }
      continue
    }
    const fenceMatch = /^(\s*)(`{3,}|~{3,})(.*)$/.exec(text)
    if (fenceMatch) {
      const lang = fenceMatch[3].trim().split(/\s+/)[0]?.toLowerCase() ?? ''
      fence = { ch: fenceMatch[2][0] as '`' | '~', len: fenceMatch[2].length, lang }
      push(base, base, CODE_LINE)
      if (!lineTouched) {
        push(base, base + fenceMatch[0].length, HIDE)
      }
      continue
    }

    let rest = 0

    // --- заголовки ---
    const heading = /^(#{1,6})([ \t]+)/.exec(text)
    if (heading) {
      push(base, base, HEADING_LINE[heading[1].length - 1])
      if (!lineTouched) push(base, base + heading[0].length, HIDE)
      rest = heading[0].length
      // закрывающие ### в ATX-заголовке (`## Заголовок ##`)
      const closing = /[ \t]+#+[ \t]*$/.exec(text)
      const hasContent =
        !!closing &&
        closing.index - (heading[1].length + heading[2].length) > 0
      if (closing && hasContent && !lineTouched) {
        push(base + closing.index, base + text.length, HIDE)
      }
    } else {
      // --- цитаты ---
      const quote = /^(\s*)((?:>[ \t]?)+)/.exec(text)
      if (quote) {
        const depth = (quote[2].match(/>/g) || []).length
        // GitHub-алерт: `> [!NOTE]` и т.п. — маркер скрываем, строки цитаты
        // раскрашиваем, пока цитата не кончилась.
        const alert = /\[!(note|tip|important|warning|caution)\]/i.exec(text)
        if (alert) alertKind = alert[1].toLowerCase()
        push(
          base,
          base,
          alertKind
            ? lineDeco(`cm-md-quote cm-md-alert-${alertKind}`)
            : quoteLineDeco(depth),
        )
        if (!lineTouched) push(base, base + quote[0].length, HIDE)
        if (alert && !lineTouched) {
          push(base + alert.index, base + alert.index + alert[0].length, HIDE)
        }
        rest = quote[0].length
      } else {
        alertKind = null
      }

      // --- чек-лист ---
      const task = /^(\s*)([-*+]|\d+[.)])([ \t]+)\[([ xX])\]([ \t]+)/.exec(text)
      if (task) {
        push(base, base, TASK_LINE)
        push(base + task[1].length, base + task[1].length + task[2].length, MARK_LIST)
        const boxFrom = base + task[1].length + task[2].length + task[3].length
        const checked = task[4].toLowerCase() === 'x'
        if (lineTouched) {
          // показываем исходные скобки — их можно править
        } else {
          push(
            boxFrom,
            boxFrom + 3,
            Decoration.replace({
              widget: new CheckboxWidget(checked, boxFrom + 1),
            }),
          )
        }
        if (checked) {
          const textFrom = base + task[0].length
          if (textFrom < base + text.length) {
            push(textFrom, base + text.length, MARK_TASK_DONE)
          }
        }
        rest = task[0].length
      } else {
        // --- маркеры списка ---
        const list = /^(\s*)([-*+]|\d+[.)])([ \t]+)/.exec(text)
        if (list) {
          push(
            base + list[1].length,
            base + list[1].length + list[2].length,
            MARK_LIST,
          )
          rest = list[0].length
        }
      }

      // --- GFM-таблица ---
      // ВАЖНО: сам блок-виджет таблицы выдаётся StateField'ом (buildTableDecorations,
      // прямое значение фасета EditorView.decorations). Через декорации ViewPlugin
      // block-декорации запрещены CodeMirror — RangeError
      // "Block decorations may not be specified via plugins".
      // Здесь только помечаем строки таблицы занятыми, чтобы инлайн-скан
      // не пытался раскрасить их как список/курсив.
      if (n >= tableUntil) {
        const table = parseTable(doc, n)
        if (table) {
          tableUntil = table.endLine + 1
          continue
        }
      } else {
        // строка внутри уже распознанной таблицы — инлайн-декорации не нужны
        continue
      }
    }

    // --- инлайн-разметка ---
    const occupied: Array<[number, number]> = []
    const free = (from: number, to: number) =>
      !occupied.some(([a, b]) => overlaps(from, to, a, b))
    const take = (from: number, to: number) => {
      occupied.push([from, to])
    }

    const inline = text.slice(rest)
    const start = base + rest
    // Экранированные символы не должны матчиться как маркеры — сканируем
    // почищенную строку (длина та же, позиции 1:1).
    const { clean, escapes } = mapEscapes(inline)

    // инлайн-код
    scan(clean, /`([^`\n]+)`/g, (m) => {
      const from = start + m.index
      const to = from + m[0].length
      if (!free(from, to)) return
      take(from, to)
      const innerFrom = from + 1
      const innerTo = from + 1 + m[1].length
      push(innerFrom, innerTo, MARK_CODE)
      if (!touched(from, to)) {
        push(from, innerFrom, HIDE)
        push(innerTo, to, HIDE)
      }
    })

    // картинки и ссылки
    scan(clean, /(!?)\[([^\]\n]*)\]\(([^)\n]*)\)/g, (m) => {
      const from = start + m.index
      const to = from + m[0].length
      if (!free(from, to)) return
      const isImage = m[1] === '!'
      const textFrom = from + (isImage ? 2 : 1)
      const textTo = textFrom + m[2].length
      take(from, to)

      if (isImage) {
        if (!lineTouched) {
          // отбрасываем необязательный title: ![alt](path "title")
          const raw = m[3].trim().split(/\s+/)[0] ?? ''
          const src = resolveImageSrc(raw) || raw
          push(
            from,
            to,
            Decoration.replace({ widget: new ImageWidget(src, m[2]) }),
          )
        }
        return
      }

      push(textFrom, textTo, linkMark(m[3].trim() || 'ссылка'))
      if (!touched(from, to)) {
        push(from, textFrom, HIDE)
        push(textTo, to, HIDE)
      }
    })

    // автолинки <https://…>, <mailto:…> — показываются как ссылка (с URL
    // в тултипе), скрывать нечего: текст и есть адрес
    scan(clean, /<((?:https?:\/\/|mailto:)[^<>\s]+)>/g, (m) => {
      const from = start + m.index
      const to = from + m[0].length
      if (!free(from, to)) return
      take(from, to)
      push(from, to, linkMark(m[1]))
    })

    // жирный+курсив: ***текст*** / ___текст___
    scan(clean, /\*\*\*([^*\n]+?)\*\*\*/g, (m) => {
      const from = start + m.index
      const to = from + m[0].length
      if (!free(from, to)) return
      take(from, to)
      const innerFrom = from + 3
      const innerTo = to - 3
      push(innerFrom, innerTo, MARK_STRONG_EM)
      if (!touched(from, to)) {
        push(from, innerFrom, HIDE)
        push(innerTo, to, HIDE)
      }
    })
    scan(clean, /(^|[^\w_])___([^_\n]+?)___(?!\w)/g, (m) => {
      const lead = m[1].length
      const from = start + m.index + lead
      const to = from + m[0].length - lead
      if (!free(from, to)) return
      take(from, to)
      const innerFrom = from + 3
      const innerTo = to - 3
      push(innerFrom, innerTo, MARK_STRONG_EM)
      if (!touched(from, to)) {
        push(from, innerFrom, HIDE)
        push(innerTo, to, HIDE)
      }
    })

    // жирный
    scan(clean, /\*\*([^*\n]+?)\*\*/g, (m) => {
      const from = start + m.index
      const to = from + m[0].length
      if (!free(from, to)) return
      take(from, to)
      const innerFrom = from + 2
      const innerTo = to - 2
      push(innerFrom, innerTo, MARK_STRONG)
      if (!touched(from, to)) {
        push(from, innerFrom, HIDE)
        push(innerTo, to, HIDE)
      }
    })
    scan(clean, /(^|[^\w_])__([^_\n]+?)__(?!\w)/g, (m) => {
      const lead = m[1].length
      const from = start + m.index + lead
      const to = from + m[0].length - lead
      if (!free(from, to)) return
      take(from, to)
      const innerFrom = from + 2
      const innerTo = to - 2
      push(innerFrom, innerTo, MARK_STRONG)
      if (!touched(from, to)) {
        push(from, innerFrom, HIDE)
        push(innerTo, to, HIDE)
      }
    })

    // зачёркнутый
    scan(clean, /~~([^~\n]+?)~~/g, (m) => {
      const from = start + m.index
      const to = from + m[0].length
      if (!free(from, to)) return
      take(from, to)
      const innerFrom = from + 2
      const innerTo = to - 2
      push(innerFrom, innerTo, MARK_STRIKE)
      if (!touched(from, to)) {
        push(from, innerFrom, HIDE)
        push(innerTo, to, HIDE)
      }
    })

    // курсив
    scan(clean, /(^|[^*\w])\*([^*\n]+?)\*(?!\*)/g, (m) => {
      const lead = m[1].length
      const from = start + m.index + lead
      const to = from + m[0].length - lead
      if (!free(from, to)) return
      take(from, to)
      const innerFrom = from + 1
      const innerTo = to - 1
      push(innerFrom, innerTo, MARK_EM)
      if (!touched(from, to)) {
        push(from, innerFrom, HIDE)
        push(innerTo, to, HIDE)
      }
    })
    scan(clean, /(^|[^\w_])_([^_\n]+?)_(?!\w)/g, (m) => {
      const lead = m[1].length
      const from = start + m.index + lead
      const to = from + m[0].length - lead
      if (!free(from, to)) return
      take(from, to)
      const innerFrom = from + 1
      const innerTo = to - 1
      push(innerFrom, innerTo, MARK_EM)
      if (!touched(from, to)) {
        push(from, innerFrom, HIDE)
        push(innerTo, to, HIDE)
      }
    })

    // Экранированные `\` вне курсорного фрагмента и вне кода можно скрыть:
    // отображается сам символ, как в отрендеренном Markdown.
    for (const esc of escapes) {
      const from = start + esc
      if (touched(from, from + 1) || !free(from, from + 1)) continue
      push(from, from + 1, HIDE)
    }
  }

  const rangesOut: Range<Decoration>[] = items.map(({ from, to, deco }) =>
    deco.range(from, to),
  )
  return Decoration.set(rangesOut, true)
}

/** Клик по чекбоксу переключает `[ ]` ↔ `[x]` прямо в исходнике. */
const checkboxClick = EditorView.domEventHandlers({
  mousedown: (event, view) => {
    const target = event.target
    if (!(target instanceof HTMLElement)) return false
    const box = target.closest<HTMLElement>('.cm-md-checkbox')
    if (!box) return false
    event.preventDefault()
    const pos = Number(box.dataset.pos)
    if (!Number.isInteger(pos)) return true
    const ch = view.state.doc.sliceString(pos, pos + 1)
    const next = ch.toLowerCase() === 'x' ? ' ' : 'x'
    view.dispatch({ changes: { from: pos, to: pos + 1, insert: next } })
    return true
  },
})

/** Клик по картинке в Live → колбэк onImageClick (диалог предпросмотра). */
function imageClick(
  onImageClick?: (src: string, alt: string) => void,
): Extension {
  if (!onImageClick) return []
  return EditorView.domEventHandlers({
    mousedown: (event) => {
      const target = event.target
      if (
        !(target instanceof HTMLImageElement) ||
        !target.classList.contains('cm-md-image')
      ) {
        return false
      }
      event.preventDefault()
      onImageClick(
        target.dataset.mdSrc ?? target.getAttribute('src') ?? '',
        target.dataset.mdAlt ?? '',
      )
      return true
    },
  })
}

/**
 * Блок-декорации таблиц: выдаются через StateField (прямое значение фасета
 * EditorView.decorations) — CodeMirror запрещает block-декорации через
 * декорации ViewPlugin. Курсор/выделение внутри таблицы → исходник.
 */
export function buildTableDecorations(state: EditorState): DecorationSet {
  const doc = state.doc
  const items: DecorationItem[] = []
  const ranges = state.selection.ranges
  const touched = (from: number, to: number) =>
    ranges.some((r) => r.from <= to && r.to >= from)
  let fence: FenceState | null = null
  for (let n = 1; n <= doc.lines; n++) {
    const line = doc.line(n)
    fence = updateFence(line.text, fence)
    if (fence !== null) continue
    const table = parseTable(doc, n)
    if (!table) continue
    const from = line.from
    const to = doc.line(table.endLine).to
    if (!touched(from, to)) {
      items.push({
        from,
        to,
        deco: Decoration.replace({
          widget: new TableWidget(table.data),
          block: true,
        }),
      })
    }
    n = table.endLine
  }
  const rangesOut: Range<Decoration>[] = items.map(({ from, to, deco }) =>
    deco.range(from, to),
  )
  return Decoration.set(rangesOut, true)
}

/**
 * Плагин live-preview. `resolveImageSrc` вызывается при каждой перерисовке,
 * поэтому вложения можно подгружать асинхронно после открытия документа.
 * Инлайн-декорации считаются только для видимой области — скролл
 * триггерит viewportChanged и пересчёт. Блок-декорации таблиц живут
 * в отдельном StateField (требование CodeMirror).
 */
export function livePreview(handlers: LivePreviewHandlers): Extension {
  const tables = StateField.define<DecorationSet>({
    create: (state) => buildTableDecorations(state),
    update: (value, tr) =>
      tr.docChanged || tr.selection ? buildTableDecorations(tr.state) : value,
    provide: (f) => EditorView.decorations.from(f),
  })
  return [
    tables,
    ViewPlugin.fromClass(
      class {
        decorations: DecorationSet

        constructor(view: EditorView) {
          this.decorations = buildLiveDecorations(
            view.state,
            handlers.resolveImageSrc(),
            view.visibleRanges,
          )
        }

        update(update: ViewUpdate) {
          if (
            update.docChanged ||
            update.selectionSet ||
            update.viewportChanged
          ) {
            this.decorations = buildLiveDecorations(
              update.view.state,
              handlers.resolveImageSrc(),
              update.view.visibleRanges,
            )
          }
        }
      },
      {
        decorations: (v) => v.decorations,
      },
    ),
    checkboxClick,
    imageClick(handlers.onImageClick),
  ]
}

/** Базовое оформление редактора; цвета — из CSS-переменных приложения. */
export const markdownEditorTheme = EditorView.theme({
  '&': {
    height: '100%',
    color: 'var(--foreground)',
    backgroundColor: 'transparent',
    // Фикс мерцания текста на Linux/WebKit2GTK: subpixel antialiasing
    // переключает текст между жирным и нормальным весом при наборе
    // (см. TEXTAREA_CLASS в markdown-editor.tsx — тот же фикс для textarea).
    // CodeMirror — основная поверхность ввода, поэтому свойства заданы здесь:
    // они наследуются всеми внутренними элементами редактора.
    '-webkit-font-smoothing': 'antialiased',
    'text-rendering': 'optimizeSpeed',
  },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': {
    fontFamily: 'var(--font-sans)',
    fontSize: '0.9375rem',
    lineHeight: '1.7',
    padding: '0.75rem',
    overflow: 'auto',
    height: '100%',
  },
  '.cm-content': {
    padding: '0',
    caretColor: 'var(--foreground)',
    fontFamily: 'inherit',
  },
  '.cm-line': { padding: '0' },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--foreground)' },
  '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection':
    {
      backgroundColor: 'var(--accent)',
    },
  '.cm-placeholder': { color: 'var(--muted-foreground)' },
  '.cm-activeLine': { backgroundColor: 'transparent' },

  '.cm-md-h1': { fontSize: '1.6em', fontWeight: '700', lineHeight: '1.35' },
  '.cm-md-h2': { fontSize: '1.35em', fontWeight: '700', lineHeight: '1.4' },
  '.cm-md-h3': { fontSize: '1.15em', fontWeight: '600', lineHeight: '1.45' },
  '.cm-md-h4': { fontWeight: '600' },
  '.cm-md-h5': { fontWeight: '600' },
  '.cm-md-h6': { fontWeight: '600', color: 'var(--muted-foreground)' },

  '.cm-md-strong': { fontWeight: '700' },
  '.cm-md-em': { fontStyle: 'italic' },
  '.cm-md-strike': { textDecoration: 'line-through', opacity: '0.7' },
  '.cm-md-code': {
    fontFamily: 'var(--font-mono)',
    fontSize: '0.9em',
    backgroundColor: 'var(--muted)',
    borderRadius: '3px',
    padding: '0.1em 0.3em',
  },
  '.cm-md-link': { color: 'var(--primary)', textDecoration: 'underline' },
  '.cm-md-listmark': { color: 'var(--muted-foreground)' },
  '.cm-md-quote': {
    borderLeft: '3px solid var(--border)',
    paddingLeft: '0.75em',
    color: 'var(--muted-foreground)',
  },
  // Вложенные цитаты: дополнительный сдвиг на уровень
  '.cm-md-quote-2': { paddingLeft: '1.5em' },
  '.cm-md-quote-3': { paddingLeft: '2.25em' },
  '.cm-md-quote-4': { paddingLeft: '3em' },
  // GitHub-алерты (цвета — через переменные globals.css)
  '.cm-md-alert-note': { borderLeftColor: 'var(--alert-note-fg)', backgroundColor: 'var(--alert-note-bg)' },
  '.cm-md-alert-tip': { borderLeftColor: 'var(--alert-tip-fg)', backgroundColor: 'var(--alert-tip-bg)' },
  '.cm-md-alert-important': { borderLeftColor: 'var(--alert-important-fg)', backgroundColor: 'var(--alert-important-bg)' },
  '.cm-md-alert-warning': { borderLeftColor: 'var(--alert-warning-fg)', backgroundColor: 'var(--alert-warning-bg)' },
  '.cm-md-alert-caution': { borderLeftColor: 'var(--alert-caution-fg)', backgroundColor: 'var(--alert-caution-bg)' },
  '.cm-md-codeblock': {
    fontFamily: 'var(--font-mono)',
    fontSize: '0.9em',
    backgroundColor: 'var(--muted)',
  },
  // diff-блоки (```diff): цвет строки задаётся через CSS-переменные,
  // значения — в globals.css (GitHub-подобные, светлые/тёмные)
  '.cm-md-diff-add': {
    color: 'var(--diff-add-fg)',
    backgroundColor: 'var(--diff-add-bg)',
  },
  '.cm-md-diff-del': {
    color: 'var(--diff-del-fg)',
    backgroundColor: 'var(--diff-del-bg)',
  },
  '.cm-md-diff-hunk': {
    color: 'var(--diff-hunk-fg)',
  },
  '.cm-md-task-line': { listStyle: 'none' },
  '.cm-md-task-done': {
    color: 'var(--muted-foreground)',
    textDecoration: 'line-through',
  },
  '.cm-md-checkbox': {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '0.95em',
    height: '0.95em',
    border: '1px solid var(--muted-foreground)',
    borderRadius: '3px',
    verticalAlign: '-0.1em',
    marginRight: '0.2em',
    cursor: 'pointer',
    fontSize: '0.8em',
    lineHeight: '1',
  },
  '.cm-md-checkbox-checked': {
    backgroundColor: 'var(--primary)',
    borderColor: 'var(--primary)',
    color: 'var(--primary-foreground)',
  },
  '.cm-md-checkbox-checked::after': { content: '"✓"' },
  '.cm-md-image': {
    display: 'block',
    maxWidth: '100%',
    maxHeight: '22rem',
    borderRadius: '6px',
    border: '1px solid var(--border)',
    margin: '0.25em 0',
    cursor: 'zoom-in',
  },
  // GFM-таблицы (виджет)
  '.cm-md-table': {
    borderCollapse: 'collapse',
    margin: '0.25em 0',
    fontSize: '0.95em',
  },
  '.cm-md-table th': {
    border: '1px solid var(--border)',
    padding: '0.2em 0.6em',
    background: 'var(--muted)',
  },
  '.cm-md-table td': {
    border: '1px solid var(--border)',
    padding: '0.2em 0.6em',
  },
})

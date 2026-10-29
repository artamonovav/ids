/**
 * Live-preview для Markdown в CodeMirror 6 — режим, близкий к Obsidian:
 * разметка (`**`, `#`, `` ` ``, ссылки, картинки, чекбоксы) скрыта или
 * отрисована, пока курсор не находится в соответствующем фрагменте.
 *
 * Исходник остаётся настоящим Markdown: декорации только меняют отображение,
 * ни один символ не переписывается. Поэтому файлы в базе знаний не меняются
 * от простого открытия и переключения режимов.
 */
import type { EditorState, Extension } from '@codemirror/state'
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

const HIDE = Decoration.replace({})

const MARK_STRONG = Decoration.mark({ class: 'cm-md-strong' })
const MARK_EM = Decoration.mark({ class: 'cm-md-em' })
const MARK_STRIKE = Decoration.mark({ class: 'cm-md-strike' })
const MARK_CODE = Decoration.mark({ class: 'cm-md-code' })
const MARK_LINK = Decoration.mark({ class: 'cm-md-link' })
const MARK_LIST = Decoration.mark({ class: 'cm-md-listmark' })
const MARK_TASK_DONE = Decoration.mark({ class: 'cm-md-task-done' })

const LINE_CLASSES = new Map<string, Decoration>()

function lineDeco(cls: string): Decoration {
  let d = LINE_CLASSES.get(cls)
  if (!d) {
    d = Decoration.line({ class: cls })
    LINE_CLASSES.set(cls, d)
  }
  return d
}

const HEADING_LINE = [1, 2, 3, 4, 5, 6].map((n) =>
  lineDeco(`cm-md-h${n}`),
)
const QUOTE_LINE = lineDeco('cm-md-quote')
const CODE_LINE = lineDeco('cm-md-codeblock')
const TASK_LINE = lineDeco('cm-md-task-line')

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
    img.loading = 'lazy'
    img.draggable = false
    return img
  }
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

export function buildLiveDecorations(
  state: EditorState,
  resolveImageSrc: ResolveImageSrc,
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

  const push = (from: number, to: number, deco: Decoration) => {
    items.push({ from, to, deco })
  }

  let fence: { ch: '`' | '~'; len: number } | null = null

  for (let n = 1; n <= doc.lines; n++) {
    const line = doc.line(n)
    const text = line.text
    const base = line.from
    const lineTouched = cursorLines.has(n)

    // --- блоки кода ---
    const fenceMatch = /^(\s*)(`{3,}|~{3,})/.exec(text)
    if (fence !== null) {
      push(base, base, CODE_LINE)
      if (
        fenceMatch &&
        fenceMatch[2][0] === fence.ch &&
        fenceMatch[2].length >= fence.len
      ) {
        if (!lineTouched) {
          push(base, base + fenceMatch[0].length, HIDE)
        }
        fence = null
      }
      continue
    }
    if (fenceMatch) {
      fence = {
        ch: fenceMatch[2][0] as '`' | '~',
        len: fenceMatch[2].length,
      }
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
    } else {
      // --- цитаты ---
      const quote = /^(\s*)((?:>[ \t]?)+)/.exec(text)
      if (quote) {
        push(base, base, QUOTE_LINE)
        if (!lineTouched) push(base, base + quote[0].length, HIDE)
        rest = quote[0].length
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

    // инлайн-код
    scan(inline, /`([^`\n]+)`/g, (m) => {
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
    scan(inline, /(!?)\[([^\]\n]*)\]\(([^)\n]*)\)/g, (m) => {
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

      push(textFrom, textTo, MARK_LINK)
      if (!touched(from, to)) {
        push(from, textFrom, HIDE)
        push(textTo, to, HIDE)
      }
    })

    // жирный
    scan(inline, /\*\*([^*\n]+?)\*\*/g, (m) => {
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
    scan(inline, /(^|[^\w_])__([^_\n]+?)__(?!\w)/g, (m) => {
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
    scan(inline, /~~([^~\n]+?)~~/g, (m) => {
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
    scan(inline, /(^|[^*\w])\*([^*\n]+?)\*(?!\*)/g, (m) => {
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
    scan(inline, /(^|[^\w_])_([^_\n]+?)_(?!\w)/g, (m) => {
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

/**
 * Плагин live-preview. `resolveImageSrc` вызывается при каждой перерисовке,
 * поэтому вложения можно подгружать асинхронно после открытия документа.
 */
export function livePreview(
  resolveImageSrc: () => ResolveImageSrc,
): Extension {
  return [
    ViewPlugin.fromClass(
      class {
        decorations: DecorationSet

        constructor(view: EditorView) {
          this.decorations = buildLiveDecorations(view.state, resolveImageSrc())
        }

        update(update: ViewUpdate) {
          if (
            update.docChanged ||
            update.selectionSet ||
            update.viewportChanged
          ) {
            this.decorations = buildLiveDecorations(update.view.state, resolveImageSrc())
          }
        }
      },
      {
        decorations: (v) => v.decorations,
      },
    ),
    checkboxClick,
  ]
}

/** Базовое оформление редактора; цвета — из CSS-переменных приложения. */
export const markdownEditorTheme = EditorView.theme({
  '&': {
    height: '100%',
    color: 'var(--foreground)',
    backgroundColor: 'transparent',
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
  '.cm-md-codeblock': {
    fontFamily: 'var(--font-mono)',
    fontSize: '0.9em',
    backgroundColor: 'var(--muted)',
  },
  '.cm-md-task-line': { listStyle: 'none' },
  '.cm-md-task-done': { color: 'var(--muted-foreground)' },
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
  },
})

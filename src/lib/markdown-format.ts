export type FormatAction = 'bold' | 'italic' | 'strike' | 'code' | 'link'

export interface EditResult {
  value: string
  start: number
  end: number
}

export interface WrapSpec {
  before: string
  after: string
  placeholder: string
}

export const FORMAT_SPECS: Record<Exclude<FormatAction, 'link'>, WrapSpec> = {
  bold: { before: '**', after: '**', placeholder: 'жирный' },
  italic: { before: '*', after: '*', placeholder: 'курсив' },
  strike: { before: '~~', after: '~~', placeholder: 'зачёркнутый' },
  code: { before: '`', after: '`', placeholder: 'код' },
}

/**
 * Обёртка выделения маркерами с переключением: если выделение уже обёрнуто
 * (внутри или сразу снаружи) — маркеры снимаются, иначе — добавляются.
 * Пустое выделение заменяется плейсхолдером, который остаётся выделенным.
 */
export function toggleWrap(
  value: string,
  start: number,
  end: number,
  { before, after, placeholder }: WrapSpec,
): EditResult {
  const selected = value.slice(start, end)
  const ch = before[0]

  if (
    selected.length >= before.length + after.length &&
    selected.startsWith(before) &&
    selected.endsWith(after)
  ) {
    const inner = selected.slice(before.length, selected.length - after.length)
    // маркер не должен быть частью более длинной последовательности (** для курсива)
    if (!inner.startsWith(ch) && !inner.endsWith(ch)) {
      return {
        value: value.slice(0, start) + inner + value.slice(end),
        start,
        end: start + inner.length,
      }
    }
  }

  if (
    start >= before.length &&
    value.slice(start - before.length, start) === before &&
    value.slice(end, end + after.length) === after &&
    value[start - before.length - 1] !== ch &&
    value[end + after.length] !== ch
  ) {
    return {
      value:
        value.slice(0, start - before.length) +
        selected +
        value.slice(end + after.length),
      start: start - before.length,
      end: end - before.length,
    }
  }

  const text = selected || placeholder
  return {
    value: value.slice(0, start) + before + text + after + value.slice(end),
    start: start + before.length,
    end: start + before.length + text.length,
  }
}

/**
 * Заголовок текущей строки: ставит `#` нужного уровня, заменяет другой уровень
 * или снимает разметку, если уровень уже совпадает. Курсор не прыгает в конец.
 */
export function toggleHeading(
  value: string,
  start: number,
  level: 1 | 2 | 3,
): EditResult {
  const lineStart = value.lastIndexOf('\n', start - 1) + 1
  const lineEnd = value.indexOf('\n', start)
  const end = lineEnd === -1 ? value.length : lineEnd
  const line = value.slice(lineStart, end)
  const prefix = '#'.repeat(level) + ' '
  const nextLine = line.startsWith(prefix)
    ? line.slice(prefix.length)
    : prefix + line.replace(/^#{1,6}\s+/, '')
  const delta = nextLine.length - line.length
  const cursor = Math.max(
    lineStart,
    Math.min(start + delta, lineStart + nextLine.length),
  )
  return {
    value: value.slice(0, lineStart) + nextLine + value.slice(end),
    start: cursor,
    end: cursor,
  }
}

/** Латинский эквивалент кириллической клавиши в раскладке ЙЦУКЕН. */
const CYRILLIC_TO_LATIN: Record<string, string> = {
  и: 'b',
  ш: 'i',
  у: 'e',
  л: 'k',
  ч: 'x',
}

/** Действия по физической клавише (e.code): не зависят от раскладки. */
const ACTION_BY_CODE: Record<string, FormatAction> = {
  KeyB: 'bold',
  KeyI: 'italic',
  KeyE: 'code',
  KeyK: 'link',
  KeyX: 'strike',
}

/**
 * Соответствие клавиши действию форматирования.
 *
 * e.code передаётся, чтобы горячие клавиши работали в русской раскладке:
 * при Ctrl+И (физическая B) e.key === 'и', а e.code === 'KeyB'.
 * Без code остаётся запасной путь по e.key, включая кириллические буквы.
 */
export function formatActionForKey(
  key: string,
  shift: boolean,
  code = '',
): FormatAction | null {
  const fromCode = ACTION_BY_CODE[code]
  if (fromCode) {
    if (fromCode === 'strike') return shift ? 'strike' : null
    return shift ? null : fromCode
  }

  const raw = key.toLowerCase()
  const k = CYRILLIC_TO_LATIN[raw] ?? raw
  if (shift) return k === 'x' ? 'strike' : null
  switch (k) {
    case 'b':
      return 'bold'
    case 'i':
      return 'italic'
    case 'e':
      return 'code'
    case 'k':
      return 'link'
    default:
      return null
  }
}

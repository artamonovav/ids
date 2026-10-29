import * as React from 'react'
import type { ReactNode } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import {
  Bold,
  Italic,
  Strikethrough,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  ListChecks,
  TextQuote,
  Table as TableIcon,
  Code as CodeIcon,
  SquareCode,
  Link as LinkIcon,
  Image as ImageIcon,
  Paperclip,
  Minus,
} from 'lucide-react'

import { EditorState, Compartment } from '@codemirror/state'
import type { Extension } from '@codemirror/state'
import { EditorView, keymap, placeholder as cmPlaceholder } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { markdown } from '@codemirror/lang-markdown'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { tags } from '@lezer/highlight'

import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { Separator } from '@/components/ui/separator'

import type { Attachment } from '@/lib/types'
import {
  FORMAT_SPECS,
  formatActionForKey,
  toggleHeading,
  toggleWrap,
  type EditResult,
  type FormatAction,
} from '@/lib/markdown-format'
import {
  livePreview,
  markdownEditorTheme,
} from '@/lib/markdown-live-preview'
import { readImage } from '@tauri-apps/plugin-clipboard-manager'
import type { Image } from '@tauri-apps/api/image'

interface MarkdownEditorProps {
  value: string
  onChange: (v: string) => void
  attachments: Attachment[]
  onAddAttachment?: (a: Attachment) => void
  initialMode?: Mode
  readOnly?: boolean
}

export type Mode = 'live' | 'split' | 'source' | 'preview'

// Фиксированная высота редактора: и поле ввода, и просмотр скроллятся внутри себя.
const EDITOR_HEIGHT = 'h-[70vh]'

// min-h-[70vh] дублирует высоту панели: в WebKitGTK height:100% у textarea
// иногда схлопывается до высоты содержимого (несколько строк).
const TEXTAREA_CLASS =
  'font-mono text-sm w-full h-full min-h-[70vh] resize-none overflow-y-auto field-sizing-fixed rounded-md border bg-transparent p-3 outline-none focus-visible:ring-[3px] [-webkit-font-smoothing:antialiased] [text-rendering:optimizeSpeed]'

const REMARK_PLUGINS = [remarkGfm]

/** Подсветка синтаксиса Markdown в режиме «Исходник». */
const MD_HIGHLIGHT = HighlightStyle.define([
  { tag: tags.strong, fontWeight: '700' },
  { tag: tags.emphasis, fontStyle: 'italic' },
  { tag: tags.strikethrough, textDecoration: 'line-through' },
  { tag: tags.link, color: 'var(--primary)', textDecoration: 'underline' },
  { tag: tags.monospace, fontFamily: 'var(--font-mono)' },
  { tag: tags.quote, color: 'var(--muted-foreground)' },
  { tag: tags.list, color: 'var(--muted-foreground)' },
])

const IS_MAC =
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad/i.test(navigator.platform)

function shortcutLabel(key: string, shift = false): string {
  return IS_MAC
    ? `⌘${shift ? '⇧' : ''}${key}`
    : `Ctrl+${shift ? 'Shift+' : ''}${key}`
}

interface HastPoint {
  line: number
  column: number
  offset?: number
}

interface HastPosition {
  start: HastPoint
  end: HastPoint
}

interface HastNodeLike {
  position?: HastPosition
}

interface MdComponentProps {
  node?: HastNodeLike
  children?: ReactNode
  className?: string
  src?: string
  alt?: string
  href?: string
}

/** Имя для нового файла-изображения: image-YYYY-MM-DD-HH-MM-<rand>.png */
function genImageName(): string {
  const d = new Date()
  const pad = (n: number) => n.toString().padStart(2, '0')
  const rand = Math.random().toString(36).slice(2, 6)
  return `image-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(
    d.getDate(),
  )}-${pad(d.getHours())}-${pad(d.getMinutes())}-${rand}.png`
}

/**
 * Минимальная правка между старой и новой версией документа: CodeMirror
 * получает точечное изменение, поэтому undo/redo остаётся пошаговым.
 */
function diffChange(oldText: string, newText: string) {
  let from = 0
  const max = Math.min(oldText.length, newText.length)
  while (from < max && oldText[from] === newText[from]) from++
  let oldTo = oldText.length
  let newTo = newText.length
  while (
    oldTo > from &&
    newTo > from &&
    oldText[oldTo - 1] === newText[newTo - 1]
  ) {
    oldTo--
    newTo--
  }
  return { from, to: oldTo, insert: newText.slice(from, newTo) }
}

/**
 * Конвертация Tauri Image (raw RGBA) → PNG data URL через canvas.
 *
 * readImage() плагина clipboard-manager возвращает @tauri-apps/api Image с
 * RGBA-байтами; canvas.toDataURL кодирует в PNG для записи на диск и превью.
 *
 * Контекст: на Linux/WebKit2GTK (Ubuntu 22.04) clipboardData.items НЕ экспонирует
 * image-айтем при Ctrl+V картинки — этот fallback читает системный буфер обмена
 * через Tauri (под капотом arboard: X11 на Ubuntu 22.04 по умолчанию).
 */
async function tauriImageToDataUrl(img: Image): Promise<string | null> {
  try {
    const [{ width, height }, rgba] = await Promise.all([img.size(), img.rgba()])
    if (!width || !height || rgba.length === 0) return null
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    const imageData = new ImageData(new Uint8ClampedArray(rgba), width, height)
    ctx.putImageData(imageData, 0, 0)
    return canvas.toDataURL('image/png')
  } catch {
    return null
  } finally {
    try {
      await img.close()
    } catch {
      /* best-effort cleanup native resource */
    }
  }
}

function ToolbarButton({
  label,
  icon: Icon,
  onClick,
}: {
  label: string
  icon: React.ComponentType<{ className?: string }>
  onClick: () => void
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          onClick={onClick}
          aria-label={label}
          type="button"
        >
          <Icon className="size-4" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

export function MarkdownEditor({
  value,
  onChange,
  attachments,
  onAddAttachment,
  initialMode = 'live',
  readOnly = false,
}: MarkdownEditorProps) {
  const imageInputRef = React.useRef<HTMLInputElement>(null)
  const fileInputRef = React.useRef<HTMLInputElement>(null)
  const [mode, setMode] = React.useState<Mode>(initialMode)
  const live = mode === 'live'

  // CodeMirror создаётся один раз, а его DOM переносится между вкладками —
  // так сохраняются undo/redo и позиция курсора при переключении режимов.
  const viewRef = React.useRef<EditorView | null>(null)
  const hostRef = React.useRef<HTMLDivElement | null>(null)
  const containerRef = React.useRef<HTMLDivElement | null>(null)
  const [editorContainer, setEditorContainer] =
    React.useState<HTMLDivElement | null>(null)
  const liveCompartment = React.useRef(new Compartment()).current
  const valueRef = React.useRef(value)
  valueRef.current = value
  const liveRef = React.useRef(live)
  liveRef.current = live

  const setEditorContainerNode = React.useCallback(
    (el: HTMLDivElement | null) => {
      containerRef.current = el
      setEditorContainer(el)
    },
    [],
  )

  /** Применить результат строковой правки к CodeMirror (или к value без него). */
  const applyEdit = React.useCallback(
    (make: (text: string, start: number, end: number) => EditResult) => {
      const view = viewRef.current
      if (!view) {
        const text = valueRef.current
        const result = make(text, text.length, text.length)
        onChange(result.value)
        return
      }
      const text = view.state.doc.toString()
      const { from, to } = view.state.selection.main
      const result = make(text, from, to)
      const change = diffChange(text, result.value)
      if (change.from === change.to && change.insert === '') return
      view.dispatch({
        changes: change,
        selection: { anchor: result.start, head: result.end },
        scrollIntoView: true,
      })
      view.focus()
    },
    [onChange],
  )

  const insertAtCursor = React.useCallback(
    (before: string, after: string, placeholder: string) => {
      applyEdit((text, start, end) => {
        const selected = text.slice(start, end) || placeholder
        const next =
          text.slice(0, start) + before + selected + after + text.slice(end)
        const newStart = start + before.length
        return {
          value: next,
          start: newStart,
          end: newStart + selected.length,
        }
      })
    },
    [applyEdit],
  )

  const applyFormat = React.useCallback(
    (action: FormatAction) => {
      if (action === 'link') {
        applyEdit((text, start, end) => {
          const selected = text.slice(start, end) || 'текст'
          const next =
            text.slice(0, start) + '[' + selected + '](url)' + text.slice(end)
          return {
            value: next,
            start: start + 1,
            end: start + 1 + selected.length,
          }
        })
        return
      }
      applyEdit((text, start, end) =>
        toggleWrap(text, start, end, FORMAT_SPECS[action]),
      )
    },
    [applyEdit],
  )

  const insertAtLineStart = React.useCallback(
    (prefix: string) => {
      applyEdit((text, start) => {
        const lineStart = text.lastIndexOf('\n', start - 1) + 1
        return {
          value: text.slice(0, lineStart) + prefix + text.slice(lineStart),
          start: lineStart + prefix.length,
          end: lineStart + prefix.length,
        }
      })
    },
    [applyEdit],
  )

  const applyHeading = React.useCallback(
    (level: 1 | 2 | 3) => {
      applyEdit((text, start) => toggleHeading(text, start, level))
    },
    [applyEdit],
  )

  const insertBlock = React.useCallback(
    (block: string) => {
      applyEdit((text, start, end) => ({
        value: text.slice(0, start) + block + text.slice(end),
        start: start + block.length,
        end: start + block.length,
      }))
    },
    [applyEdit],
  )

  const insertImageAttachment = React.useCallback(
    (name: string, dataUrl: string) => {
      const path = `attachments/${name}`
      onAddAttachment?.({ path, name, dataUrl })
      const insert = `![${name}](${path})`
      applyEdit((text, start, end) => ({
        value: text.slice(0, start) + insert + text.slice(end),
        start: start + insert.length,
        end: start + insert.length,
      }))
    },
    [applyEdit, onAddAttachment],
  )

  const handleImageFile = React.useCallback(
    (file: File) => {
      const reader = new FileReader()
      reader.onload = () => {
        const dataUrl = typeof reader.result === 'string' ? reader.result : ''
        if (dataUrl) insertImageAttachment(genImageName(), dataUrl)
      }
      reader.readAsDataURL(file)
    },
    [insertImageAttachment],
  )

  const handleFileAttachment = React.useCallback(
    (file: File) => {
      const reader = new FileReader()
      reader.onload = () => {
        const dataUrl = typeof reader.result === 'string' ? reader.result : ''
        const rand = Math.random().toString(36).slice(2, 6)
        const name = `${rand}-${file.name}`
        const path = `attachments/${name}`
        onAddAttachment?.({ path, name, dataUrl })
        const insert = `[${name}](${path})`
        applyEdit((text, start, end) => ({
          value: text.slice(0, start) + insert + text.slice(end),
          start: start + insert.length,
          end: start + insert.length,
        }))
      }
      reader.readAsDataURL(file)
    },
    [applyEdit, onAddAttachment],
  )

  const handlePaste = React.useCallback(
    (e: ClipboardEvent) => {
      const items = e.clipboardData?.items
      // 1. Ищем image-файл в clipboardData (Windows WebView2 / macOS — современный WebKit
      //    экспонирует картинку как File item). Нашли → вставляем, preventDefault.
      if (items) {
        for (let i = 0; i < items.length; i++) {
          const item = items[i]
          if (item.type.startsWith('image/')) {
            const file = item.getAsFile()
            if (file) {
              e.preventDefault()
              handleImageFile(file)
              return true
            }
          }
        }
        // 2. Если в буфере есть текст — отдаём браузеру (обычная вставка текста).
        //    На Linux при Ctrl+V текста мы НЕ должны пытаться читать картинку.
        let hasText = false
        for (let i = 0; i < items.length; i++) {
          if (items[i].kind === 'string') {
            hasText = true
            break
          }
        }
        if (hasText) return false // пусть CodeMirror вставит текст
      }
      // 3. Нет image-файла и нет текста в clipboardData → возможно, в буфере картинка,
      //    но WebKit2GTK (Ubuntu 22.04) не экспонирует её как File item. preventDefault
      //    СИНХРОННО (иначе текст вставится), затем асинхронно читаем буфер через Tauri.
      e.preventDefault()
      void (async () => {
        try {
          const img = await readImage()
          const dataUrl = await tauriImageToDataUrl(img)
          if (dataUrl) {
            insertImageAttachment(genImageName(), dataUrl)
          }
        } catch {
          // Нет картинки в буфере или Tauri-плагин недоступен — вставка предотвращена,
          // ничего не добавлено. Пользователь может вставить через кнопку «Изображение».
        }
      })()
      return true
    },
    [handleImageFile, insertImageAttachment],
  )

  const handleDrop = React.useCallback(
    (e: DragEvent, view: EditorView) => {
      const files = e.dataTransfer?.files
      e.preventDefault()
      if (!files || files.length === 0) return true
      const pos = view.posAtCoords({ x: e.clientX, y: e.clientY })
      if (pos !== null) view.dispatch({ selection: { anchor: pos } })
      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        if (file.type.startsWith('image/')) handleImageFile(file)
      }
      return true
    },
    [handleImageFile],
  )

  const handleKeyDown = React.useCallback(
    (e: KeyboardEvent) => {
      if (e.isComposing) return false
      const mod = IS_MAC ? e.metaKey : e.ctrlKey
      if (!mod || e.altKey) return false
      const action = formatActionForKey(e.key, e.shiftKey, e.code)
      if (!action) return false
      e.preventDefault()
      applyFormat(action)
      return true
    },
    [applyFormat],
  )

  const resolveImageSrc = React.useCallback(
    (src?: string): string | undefined => {
      if (typeof src !== 'string') return src
      // Внешние URL и data: — не трогаем.
      if (/^(https?:|data:)/.test(src)) return src
      // Нормализовать: убрать leading './' — старые/внешние локализации
      // используют ./attachments/xxx.png, а приложение пишет attachments/xxx.png.
      // Без этого startsWith('attachments/') не матчится → картинка не резолвится.
      let norm = src.replace(/^\.\//, '')
      while (norm.startsWith('./')) norm = norm.slice(2)
      if (norm.startsWith('attachments/')) {
        const byPath = attachments.find((a) => a.path === norm)
        if (byPath) return byPath.dataUrl
        const name = norm.replace('attachments/', '')
        const byName = attachments.find((a) => a.name === name)
        if (byName) return byName.dataUrl
      }
      // Fallback: сопоставление по basename (имени файла без пути) — для случаев,
      // когда путь в markdown отличается от attachments/xxx.png, но файл тот же.
      const basename = norm.split('/').pop() || norm
      if (basename) {
        const byBasename = attachments.find((a) => a.name === basename)
        if (byBasename) return byBasename.dataUrl
      }
      return src
    },
    [attachments],
  )

  // Актуальные обработчики для расширений CodeMirror: сам редактор создаётся
  // один раз, а ссылки на колбэки берутся из ref при каждом вызове.
  const handlersRef = React.useRef({
    change: onChange,
    keydown: handleKeyDown,
    paste: handlePaste,
    drop: handleDrop,
    dragover: (e: DragEvent) => {
      e.preventDefault()
      return true
    },
    resolveImageSrc,
  })
  handlersRef.current = {
    change: onChange,
    keydown: handleKeyDown,
    paste: handlePaste,
    drop: handleDrop,
    dragover: (e: DragEvent) => {
      e.preventDefault()
      return true
    },
    resolveImageSrc,
  }

  // Создание CodeMirror. StrictMode в dev монтирует/размонтирует дважды —
  // cleanup корректно уничтожает view и удаляет DOM.
  React.useEffect(() => {
    if (readOnly) return
    const host = document.createElement('div')
    host.className = 'h-full min-h-[70vh]'
    hostRef.current = host

    const extensions: Extension[] = [
      history(),
      keymap.of([...defaultKeymap, ...historyKeymap]),
      EditorView.lineWrapping,
      markdown(),
      syntaxHighlighting(MD_HIGHLIGHT),
      markdownEditorTheme,
      cmPlaceholder('Введите Markdown…'),
      EditorView.contentAttributes.of({
        'aria-label': 'Markdown',
        spellcheck: 'false',
      }),
      liveCompartment.of(
        liveRef.current
          ? livePreview(() => handlersRef.current.resolveImageSrc)
          : [],
      ),
      EditorView.domEventHandlers({
        keydown: (e) => handlersRef.current.keydown(e),
        paste: (e) => handlersRef.current.paste(e),
        drop: (e, view) => handlersRef.current.drop(e, view),
        dragover: (e) => handlersRef.current.dragover(e),
      }),
      EditorView.updateListener.of((u) => {
        if (u.docChanged) handlersRef.current.change(u.view.state.doc.toString())
      }),
    ]

    const view = new EditorView({
      state: EditorState.create({
        doc: valueRef.current,
        extensions,
      }),
      parent: host,
    })
    viewRef.current = view
    if (containerRef.current) containerRef.current.appendChild(host)

    return () => {
      view.destroy()
      host.remove()
      viewRef.current = null
      hostRef.current = null
    }
  }, [readOnly, liveCompartment])

  // Перенос DOM редактора в активную вкладку без пересоздания view.
  React.useEffect(() => {
    const host = hostRef.current
    if (!editorContainer || !host) return
    if (host.parentElement !== editorContainer) {
      editorContainer.appendChild(host)
    }
    viewRef.current?.requestMeasure()
  }, [editorContainer])

  // Внешнее изменение value (загрузка файла, сброс) — синхронизируем документ.
  React.useEffect(() => {
    const view = viewRef.current
    if (!view) return
    const current = view.state.doc.toString()
    if (current === value) return
    view.dispatch({
      changes: { from: 0, to: current.length, insert: value },
    })
  }, [value])

  // Включение/выключение live-декораций и обновление картинок во вложениях.
  React.useEffect(() => {
    const view = viewRef.current
    if (!view) return
    view.dispatch({
      effects: liveCompartment.reconfigure(
        live ? livePreview(() => handlersRef.current.resolveImageSrc) : [],
      ),
    })
    // Смена шрифта Live ↔ Исходник меняет метрики — пересчитываем раскладку.
    view.requestMeasure()
  }, [live, attachments, liveCompartment])

  const components = React.useMemo(
    () => ({
      h1: ({ children }: MdComponentProps) => (
        <h1 className="font-semibold mt-4 mb-2 text-2xl">{children}</h1>
      ),
      h2: ({ children }: MdComponentProps) => (
        <h2 className="font-semibold mt-4 mb-2 text-xl">{children}</h2>
      ),
      h3: ({ children }: MdComponentProps) => (
        <h3 className="font-semibold mt-4 mb-2 text-lg">{children}</h3>
      ),
      p: ({ children }: MdComponentProps) => (
        <p className="my-2 leading-7">{children}</p>
      ),
      ul: ({ children }: MdComponentProps) => (
        <ul className="list-disc pl-6 my-2">{children}</ul>
      ),
      ol: ({ children }: MdComponentProps) => (
        <ol className="list-decimal pl-6 my-2">{children}</ol>
      ),
      li: ({ children }: MdComponentProps) => (
        <li className="ml-2">{children}</li>
      ),
      blockquote: ({ children }: MdComponentProps) => (
        <blockquote className="border-l-4 pl-3 italic text-muted-foreground my-2">
          {children}
        </blockquote>
      ),
      a: ({ children, href }: MdComponentProps) => (
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className="text-primary underline"
        >
          {children}
        </a>
      ),
      table: ({ children }: MdComponentProps) => (
        <div className="my-2 overflow-x-auto">
          <table className="border-collapse">{children}</table>
        </div>
      ),
      th: ({ children }: MdComponentProps) => (
        <th className="bg-muted border px-2 py-1 text-left">{children}</th>
      ),
      td: ({ children }: MdComponentProps) => (
        <td className="border px-2 py-1">{children}</td>
      ),
      img: ({ src, alt }: MdComponentProps) => (
        <img
          src={resolveImageSrc(src)}
          alt={alt ?? ''}
          className="max-w-full rounded-md my-2 border"
        />
      ),
      pre: ({ children }: MdComponentProps) => (
        <pre className="bg-muted rounded-md p-3 overflow-x-auto my-2">
          {children}
        </pre>
      ),
      code: ({ children, className, node }: MdComponentProps) => {
        const isBlock =
          (typeof className === 'string' && className.includes('language-')) ||
          (!!node?.position &&
            node.position.start.line !== node.position.end.line)
        if (isBlock) {
          return <code className="font-mono text-sm">{children}</code>
        }
        return (
          <code className="bg-muted px-1 py-0.5 rounded text-sm font-mono">
            {children}
          </code>
        )
      },
    }),
    [resolveImageSrc],
  )

  const renderSourceEditor = () => (
    <div
      ref={setEditorContainerNode}
      className={`h-full min-h-[70vh] ${live ? '' : 'ids-md-source'}`}
    />
  )

  const renderTextarea = () => (
    <Textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      readOnly={readOnly}
      placeholder="Введите Markdown…"
      className={TEXTAREA_CLASS}
    />
  )

  const renderPreview = () => (
    <div className="h-full overflow-y-auto rounded-md border bg-background p-4">
      <ReactMarkdown remarkPlugins={REMARK_PLUGINS} components={components}>
        {value}
      </ReactMarkdown>
    </div>
  )

  if (readOnly) {
    return (
      <ReadOnlyPanel
        mode={mode}
        setMode={setMode}
        renderPreview={renderPreview}
        renderTextarea={renderTextarea}
      />
    )
  }

  return (
    <Tabs
      value={mode}
      onValueChange={(v) => setMode(v as Mode)}
      className="w-full"
    >
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) handleImageFile(f)
          e.target.value = ''
        }}
      />
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) handleFileAttachment(f)
          e.target.value = ''
        }}
      />
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <TabsList>
          <TabsTrigger value="live">Live</TabsTrigger>
          <TabsTrigger value="source">Исходник</TabsTrigger>
          <TabsTrigger value="split">Совмещённо</TabsTrigger>
          <TabsTrigger value="preview">Просмотр</TabsTrigger>
        </TabsList>
      </div>

      {mode !== 'preview' && (
        <div className="flex flex-wrap items-center gap-1 mb-2">
          <ToolbarButton
            label={`Жирный (${shortcutLabel('B')})`}
            icon={Bold}
            onClick={() => applyFormat('bold')}
          />
          <ToolbarButton
            label={`Курсив (${shortcutLabel('I')})`}
            icon={Italic}
            onClick={() => applyFormat('italic')}
          />
          <ToolbarButton
            label={`Зачёркнутый (${shortcutLabel('X', true)})`}
            icon={Strikethrough}
            onClick={() => applyFormat('strike')}
          />
          <ToolbarButton
            label={`Инлайн-код (${shortcutLabel('E')})`}
            icon={SquareCode}
            onClick={() => applyFormat('code')}
          />
          <Separator orientation="vertical" className="mx-1 h-6" />
          <ToolbarButton
            label="Заголовок 1"
            icon={Heading1}
            onClick={() => applyHeading(1)}
          />
          <ToolbarButton
            label="Заголовок 2"
            icon={Heading2}
            onClick={() => applyHeading(2)}
          />
          <ToolbarButton
            label="Заголовок 3"
            icon={Heading3}
            onClick={() => applyHeading(3)}
          />
          <Separator orientation="vertical" className="mx-1 h-6" />
          <ToolbarButton
            label="Маркированный список"
            icon={List}
            onClick={() => insertAtLineStart('- ')}
          />
          <ToolbarButton
            label="Нумерованный список"
            icon={ListOrdered}
            onClick={() => insertAtLineStart('1. ')}
          />
          <ToolbarButton
            label="Чек-лист"
            icon={ListChecks}
            onClick={() => insertAtLineStart('- [ ] ')}
          />
          <ToolbarButton
            label="Цитата"
            icon={TextQuote}
            onClick={() => insertAtLineStart('> ')}
          />
          <Separator orientation="vertical" className="mx-1 h-6" />
          <ToolbarButton
            label="Таблица"
            icon={TableIcon}
            onClick={() =>
              insertBlock(
                '| Заголовок 1 | Заголовок 2 |\n| --- | --- |\n| Ячейка 1 | Ячейка 2 |\n',
              )
            }
          />
          <ToolbarButton
            label="Блок кода"
            icon={CodeIcon}
            onClick={() => insertAtCursor('```\n', '\n```', 'код')}
          />
          <ToolbarButton
            label={`Ссылка (${shortcutLabel('K')})`}
            icon={LinkIcon}
            onClick={() => applyFormat('link')}
          />
          <ToolbarButton
            label="Изображение (из файла)"
            icon={ImageIcon}
            onClick={() => imageInputRef.current?.click()}
          />
          <ToolbarButton
            label="Файл в attachments"
            icon={Paperclip}
            onClick={() => fileInputRef.current?.click()}
          />
          <ToolbarButton
            label="Разделитель"
            icon={Minus}
            onClick={() => insertBlock('\n---\n')}
          />
        </div>
      )}

      {mode === 'preview' ? (
        <div className={EDITOR_HEIGHT}>{renderPreview()}</div>
      ) : mode === 'split' ? (
        <PanelGroup direction="horizontal" className={EDITOR_HEIGHT}>
          <Panel defaultSize={50} className="min-w-0 h-full">
            {renderSourceEditor()}
          </Panel>
          <PanelResizeHandle className="w-1.5 bg-border hover:bg-primary/50 transition-colors rounded-full mx-0.5" />
          <Panel defaultSize={50} className="min-w-0 h-full">
            {renderPreview()}
          </Panel>
        </PanelGroup>
      ) : (
        <div className={EDITOR_HEIGHT}>{renderSourceEditor()}</div>
      )}
    </Tabs>
  )
}

/** Панель режима просмотра/исходника для readOnly-документов. */
function ReadOnlyPanel({
  mode,
  setMode,
  renderPreview,
  renderTextarea,
}: {
  mode: Mode
  setMode: (m: Mode) => void
  renderPreview: () => ReactNode
  renderTextarea: () => ReactNode
}) {
  // В readOnly нет live-редактора: только просмотр и исходник.
  const effective: 'preview' | 'source' = mode === 'source' ? 'source' : 'preview'
  return (
    <>
      <div className="mb-2 inline-flex rounded-md bg-muted p-0.5">
        <button
          type="button"
          className={`rounded px-3 py-1 text-sm ${
            effective === 'preview' ? 'bg-background shadow-sm' : ''
          }`}
          onClick={() => setMode('preview')}
        >
          Просмотр
        </button>
        <button
          type="button"
          className={`rounded px-3 py-1 text-sm ${
            effective === 'source' ? 'bg-background shadow-sm' : ''
          }`}
          onClick={() => setMode('source')}
        >
          Исходник
        </button>
      </div>
      <div className={EDITOR_HEIGHT}>
        {effective === 'preview' ? renderPreview() : renderTextarea()}
      </div>
    </>
  )
}

'use client'

import * as React from 'react'
import type { ReactNode } from 'react'
import ReactMarkdown from 'react-markdown'
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import {
  Bold,
  Italic,
  Heading2,
  List,
  ListOrdered,
  Table as TableIcon,
  Code as CodeIcon,
  Link as LinkIcon,
  Image as ImageIcon,
  Paperclip,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { Separator } from '@/components/ui/separator'

import type { Attachment } from '@/lib/types'

interface MarkdownEditorProps {
  value: string
  onChange: (v: string) => void
  attachments: Attachment[]
  onAddAttachment?: (a: Attachment) => void
  initialMode?: Mode
}

type Mode = 'split' | 'source' | 'preview'

const TEXTAREA_CLASS =
  'font-mono text-sm w-full min-h-[55vh] resize-y rounded-md border bg-transparent p-3 outline-none focus-visible:ring-[3px]'

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
  initialMode = 'split',
}: MarkdownEditorProps) {
  const textareaRef = React.useRef<HTMLTextAreaElement>(null)
  const imageInputRef = React.useRef<HTMLInputElement>(null)
  const fileInputRef = React.useRef<HTMLInputElement>(null)
  const [mode, setMode] = React.useState<Mode>(initialMode)

  const restoreSelection = React.useCallback(
    (newStart: number, newEnd: number) => {
      requestAnimationFrame(() => {
        const t = textareaRef.current
        if (!t) return
        t.focus()
        t.setSelectionRange(newStart, newEnd)
      })
    },
    [],
  )

  const insertAtCursor = React.useCallback(
    (before: string, after: string, placeholder: string) => {
      const ta = textareaRef.current
      if (!ta) {
        onChange(value + before + placeholder + after)
        return
      }
      const start = ta.selectionStart
      const end = ta.selectionEnd
      const selected = value.slice(start, end) || placeholder
      const newValue =
        value.slice(0, start) + before + selected + after + value.slice(end)
      onChange(newValue)
      const newStart = start + before.length
      const newEnd = newStart + selected.length
      restoreSelection(newStart, newEnd)
    },
    [value, onChange, restoreSelection],
  )

  const insertAtLineStart = React.useCallback(
    (prefix: string) => {
      const ta = textareaRef.current
      if (!ta) {
        onChange(prefix + value)
        return
      }
      const start = ta.selectionStart
      const lineStart = value.lastIndexOf('\n', start - 1) + 1
      const newValue =
        value.slice(0, lineStart) + prefix + value.slice(lineStart)
      onChange(newValue)
      const newCursor = lineStart + prefix.length
      restoreSelection(newCursor, newCursor)
    },
    [value, onChange, restoreSelection],
  )

  const insertBlock = React.useCallback(
    (block: string) => {
      const ta = textareaRef.current
      if (!ta) {
        onChange(value + block)
        return
      }
      const start = ta.selectionStart
      const end = ta.selectionEnd
      const newValue = value.slice(0, start) + block + value.slice(end)
      onChange(newValue)
      const newCursor = start + block.length
      restoreSelection(newCursor, newCursor)
    },
    [value, onChange, restoreSelection],
  )

  const handleImageFile = React.useCallback(
    (file: File) => {
      const reader = new FileReader()
      reader.onload = () => {
        const dataUrl = typeof reader.result === 'string' ? reader.result : ''
        const d = new Date()
        const pad = (n: number) => n.toString().padStart(2, '0')
        const rand = Math.random().toString(36).slice(2, 6)
        const name = `image-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(
          d.getDate(),
        )}-${pad(d.getHours())}-${pad(d.getMinutes())}-${rand}.png`
        const path = `attachments/${name}`
        onAddAttachment?.({ path, name, dataUrl })
        const insert = `![${name}](${path})`
        const ta = textareaRef.current
        if (!ta) {
          onChange(value + insert)
          return
        }
        const start = ta.selectionStart
        const end = ta.selectionEnd
        const newValue = value.slice(0, start) + insert + value.slice(end)
        onChange(newValue)
        const newCursor = start + insert.length
        restoreSelection(newCursor, newCursor)
      }
      reader.readAsDataURL(file)
    },
    [value, onChange, onAddAttachment, restoreSelection],
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
        const ta = textareaRef.current
        if (!ta) { onChange(value + insert); return }
        const start = ta.selectionStart
        const end = ta.selectionEnd
        const newValue = value.slice(0, start) + insert + value.slice(end)
        onChange(newValue)
        const newCursor = start + insert.length
        restoreSelection(newCursor, newCursor)
      }
      reader.readAsDataURL(file)
    },
    [value, onChange, onAddAttachment, restoreSelection],
  )

  const onPaste = React.useCallback(
    (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
      const items = e.clipboardData?.items
      if (!items) return
      let handled = false
      for (let i = 0; i < items.length; i++) {
        const item = items[i]
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile()
          if (file) {
            handleImageFile(file)
            handled = true
          }
        }
      }
      if (handled) e.preventDefault()
    },
    [handleImageFile],
  )

  const onDrop = React.useCallback(
    (e: React.DragEvent<HTMLTextAreaElement>) => {
      e.preventDefault()
      const files = e.dataTransfer?.files
      if (!files) return
      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        if (file.type.startsWith('image/')) {
          handleImageFile(file)
        }
      }
    },
    [handleImageFile],
  )

  const onDragOver = React.useCallback(
    (e: React.DragEvent<HTMLTextAreaElement>) => {
      e.preventDefault()
    },
    [],
  )

  const resolveImageSrc = React.useCallback(
    (src?: string): string | undefined => {
      if (typeof src !== 'string') return src
      // Внешние URL и data: — не трогаем.
      if (/^(https?:|data:)/.test(src)) return src
      // Нормализовать: убрать leading './' — старые/внешние локализации
      // используют ./attachments/xxx.png, а приложение пишет attachments/xxx.png.
      let norm = src.replace(/^\.\//, '')
      while (norm.startsWith('./')) norm = norm.slice(2)
      if (norm.startsWith('attachments/')) {
        const byPath = attachments.find((a) => a.path === norm)
        if (byPath) return byPath.dataUrl
        const name = norm.replace('attachments/', '')
        const byName = attachments.find((a) => a.name === name)
        if (byName) return byName.dataUrl
      }
      // Fallback: сопоставление по basename (имени файла без пути).
      const basename = norm.split('/').pop() || norm
      if (basename) {
        const byBasename = attachments.find((a) => a.name === basename)
        if (byBasename) return byBasename.dataUrl
      }
      return src
    },
    [attachments],
  )

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
        <table className="border-collapse my-2">{children}</table>
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

  const renderTextarea = () => (
    <Textarea
      ref={textareaRef}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onPaste={onPaste}
      onDrop={onDrop}
      onDragOver={onDragOver}
      placeholder="Введите Markdown…"
      className={TEXTAREA_CLASS}
    />
  )

  const renderPreview = () => (
    <div className="min-h-[55vh] max-h-[75vh] overflow-y-auto rounded-md border bg-background p-4">
      <ReactMarkdown components={components}>{value}</ReactMarkdown>
    </div>
  )

  return (
    <Tabs
      defaultValue={initialMode}
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
          <TabsTrigger value="split">Совмещённо</TabsTrigger>
          <TabsTrigger value="source">Источник</TabsTrigger>
          <TabsTrigger value="preview">Просмотр</TabsTrigger>
        </TabsList>
      </div>

      {(mode === 'source' || mode === 'split') && (
        <div className="flex flex-wrap items-center gap-1 mb-2">
          <ToolbarButton
            label="Жирный"
            icon={Bold}
            onClick={() => insertAtCursor('**', '**', 'жирный')}
          />
          <ToolbarButton
            label="Курсив"
            icon={Italic}
            onClick={() => insertAtCursor('*', '*', 'курсив')}
          />
          <Separator orientation="vertical" className="mx-1 h-6" />
          <ToolbarButton
            label="Заголовок 2"
            icon={Heading2}
            onClick={() => insertAtLineStart('## ')}
          />
          <ToolbarButton
            label="Список"
            icon={List}
            onClick={() => insertAtLineStart('- ')}
          />
          <ToolbarButton
            label="Нумерованный список"
            icon={ListOrdered}
            onClick={() => insertAtLineStart('1. ')}
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
            label="Код"
            icon={CodeIcon}
            onClick={() => insertAtCursor('```\n', '\n```', 'код')}
          />
          <ToolbarButton
            label="Ссылка"
            icon={LinkIcon}
            onClick={() => insertAtCursor('[', '](url)', 'текст')}
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
        </div>
      )}

      <TabsContent value="split">
        <PanelGroup direction="horizontal" className="min-h-[55vh]">
          <Panel defaultSize={50} className="min-w-0">
            {renderTextarea()}
          </Panel>
          <PanelResizeHandle className="w-1.5 bg-border hover:bg-primary/50 transition-colors rounded-full mx-0.5" />
          <Panel defaultSize={50} className="min-w-0">
            {renderPreview()}
          </Panel>
        </PanelGroup>
      </TabsContent>

      <TabsContent value="source">{renderTextarea()}</TabsContent>

      <TabsContent value="preview">{renderPreview()}</TabsContent>
    </Tabs>
  )
}

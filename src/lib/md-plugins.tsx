// Общий Markdown-рендер (react-markdown) для редактора (Просмотр/Совмещённо)
// и предпросмотра в списках: единые плагины и компоненты.
// diff-блоки (```diff) — построчная подсветка DiffCode; алерты — blockquote
// с data-alert от remark-alerts; подсветка кода — rehype-highlight (ограниченный
// набор языков ради размера бандла); переносы строк — remark-breaks.

import * as React from 'react'
import type { ReactNode } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkBreaks from 'remark-breaks'
import rehypeHighlight from 'rehype-highlight'
import type { PluggableList } from 'unified'
import { remarkAlerts } from '@/lib/remark-alerts'

export const REMARK_PLUGINS = [remarkGfm, remarkAlerts, remarkBreaks]

// Подсветка синтаксиса кода в Просмотре/Совмещённо — ограниченный набор
// языков (полный common из highlight.js слишком раздувает бандл).
// diff не подключаем: такие блоки красит собственный DiffCode.
import yaml from 'highlight.js/lib/languages/yaml'
import bash from 'highlight.js/lib/languages/bash'
import shell from 'highlight.js/lib/languages/shell'
import json from 'highlight.js/lib/languages/json'
import javascript from 'highlight.js/lib/languages/javascript'
import typescript from 'highlight.js/lib/languages/typescript'
import python from 'highlight.js/lib/languages/python'
import sql from 'highlight.js/lib/languages/sql'
import xml from 'highlight.js/lib/languages/xml'
import java from 'highlight.js/lib/languages/java'

const REHYPE_PLUGINS: PluggableList = [
  [
    rehypeHighlight,
    {
      detect: false,
      languages: { yaml, bash, shell, json, javascript, typescript, python, sql, xml, java },
    },
  ],
]

export { REHYPE_PLUGINS }

interface MdComponentProps {
  node?: {
    properties?: Record<string, unknown>
    position?: { start: { line: number }; end: { line: number } }
  }
  children?: ReactNode
  className?: string
  src?: string
  alt?: string
  href?: string
}

export type ResolveImageSrc = (src?: string) => string | undefined

/** Вытащить текст из дерева react-markdown (строки/элементы/массивы). */
function reactNodeText(node: ReactNode): string {
  if (typeof node === 'string') return node
  if (typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(reactNodeText).join('')
  if (React.isValidElement(node)) {
    return reactNodeText((node.props as { children?: ReactNode }).children)
  }
  return ''
}

function diffLineClass(line: string): string {
  if (line.startsWith('@@')) return 'md-diff-hunk'
  if (line.startsWith('+') && !line.startsWith('+++')) return 'md-diff-add'
  if (line.startsWith('-') && !line.startsWith('---')) return 'md-diff-del'
  return ''
}

/** Код-блок с языком diff/patch: каждая строка — цветная (как в VSCode/GitHub). */
function DiffCode({ text }: { text: string }) {
  const lines = text.replace(/\n$/, '').split('\n')
  return (
    <code className="font-mono text-sm">
      {lines.map((line, i) => {
        const cls = diffLineClass(line)
        return (
          <span key={i} className={`block${cls ? ` ${cls}` : ''}`}>
            {line.length > 0 ? line : ' '}
          </span>
        )
      })}
    </code>
  )
}

/** Компоненты react-markdown; resolveImageSrc подставляет вложения (data URL). */
export function markdownComponents(resolveImageSrc: ResolveImageSrc) {
  return {
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
    blockquote: ({ children, node }: MdComponentProps) => {
      // GitHub-алерты: `> [!NOTE]` и т.п. → data-alert ставит remark-плагин
      // remark-alerts (маркер [!X] уже вырезан).
      const alert = node?.properties?.dataAlert as string | undefined
      if (alert) {
        return <blockquote className={`md-alert md-alert-${alert}`}>{children}</blockquote>
      }
      return (
        <blockquote className="border-l-4 pl-3 italic text-muted-foreground my-2">
          {children}
        </blockquote>
      )
    },
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
    pre: ({ children }: MdComponentProps) => {
      // Блок diff (```diff) — построчная цветовая индикация.
      const child = Array.isArray(children) ? children[0] : children
      if (React.isValidElement(child)) {
        const props = child.props as { className?: string; children?: ReactNode }
        if (/language-(diff|patch)/.test(props.className ?? '')) {
          return (
            <pre className="bg-muted rounded-md p-3 overflow-x-auto my-2">
              <DiffCode text={reactNodeText(props.children)} />
            </pre>
          )
        }
      }
      return (
        <pre className="bg-muted rounded-md p-3 overflow-x-auto my-2">
          {children}
        </pre>
      )
    },
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
  }
}

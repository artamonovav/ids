// Рендер Markdown с резолвом вложений — для предпросмотра в списках
// (шторка в TUI) и любых других мест вне редактора. Плагины и компоненты —
// те же, что в Просмотре редактора (см. lib/md-plugins.tsx).

import * as React from 'react'
import ReactMarkdown from 'react-markdown'
import {
  REMARK_PLUGINS,
  REHYPE_PLUGINS,
  markdownComponents,
  type ResolveImageSrc,
} from '@/lib/md-plugins'
import type { Attachment } from '@/lib/types'

export function MarkdownView({
  body,
  attachments,
}: {
  body: string
  attachments: Attachment[]
}) {
  const resolveImageSrc: ResolveImageSrc = React.useCallback(
    (src?: string): string | undefined => {
      if (typeof src !== 'string') return src
      // Внешние URL и data: — не трогаем.
      if (/^(https?:|data:)/.test(src)) return src
      let norm = src.replace(/^\.\//, '')
      while (norm.startsWith('./')) norm = norm.slice(2)
      if (norm.startsWith('attachments/')) {
        const byPath = attachments.find((a) => a.path === norm)
        if (byPath) return byPath.dataUrl
        const name = norm.replace('attachments/', '')
        const byName = attachments.find((a) => a.name === name)
        if (byName) return byName.dataUrl
      }
      // Fallback по имени файла без пути.
      const basename = norm.split('/').pop() || norm
      if (basename) {
        const byBase = attachments.find((a) => a.name === basename)
        if (byBase) return byBase.dataUrl
      }
      return src
    },
    [attachments],
  )

  return (
    <ReactMarkdown
      remarkPlugins={REMARK_PLUGINS}
      rehypePlugins={REHYPE_PLUGINS}
      components={markdownComponents(resolveImageSrc)}
    >
      {body}
    </ReactMarkdown>
  )
}

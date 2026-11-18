// remark-плагин: GitHub-алерты в цитатах (`> [!NOTE]`, [!TIP], [!IMPORTANT],
// [!WARNING], [!CAUTION]) → блокquote получает data-alert="<kind>", маркер
// [!X] вырезается из текста. react-markdown рендерит такой blockquote
// стилизованной плашкой (см. md-alert-* в globals.css и blockquote-компонент
// в markdown-editor.tsx). В Live аналогичные классы добавляет
// markdown-live-preview.ts.

const ALERT_RE = /^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\][ \t]*(?:\r?\n|$)/i

interface MdNode {
  type: string
  children?: MdNode[]
  value?: string
  data?: { hName?: string; hProperties?: Record<string, unknown> }
}

export function remarkAlerts() {
  return (tree: MdNode) => {
    if (!tree.children) return
    for (const node of tree.children) {
      if (node.type !== "blockquote") continue
      const first = node.children?.[0]
      if (!first || first.type !== "paragraph") continue
      const textNode = first.children?.[0]
      if (!textNode || textNode.type !== "text") continue
      const m = ALERT_RE.exec(textNode.value ?? "")
      if (!m) continue
      node.data = {
        ...node.data,
        hName: "blockquote",
        hProperties: { "data-alert": m[1].toLowerCase() },
      }
      // Остаток первой строки — «заголовок» алерта, дальше продолжаем текст
      textNode.value = (textNode.value ?? "").slice(m[0].length)
      // Маркер занял всю строку → пустой paragraph не нужен
      if (!textNode.value.trim() && (first.children?.length ?? 0) === 1) {
        node.children = node.children?.slice(1)
      }
    }
  }
}

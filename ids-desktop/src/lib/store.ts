// Tauri-версия lib/store.ts — folder-based, без git-настроек.
// base = папка проекта (выбранная пользователем). Git — через host-бинарник.
// Компоненты (editor-view/workspace-view/...) не меняются — зовут те же действия.

"use client"

import { create } from "zustand"
import { invoke } from "@tauri-apps/api/core"
import type { Localization, Settings, SyncStatus, View, DictName } from "./types"
import { formatAuthor, commitMessageFor, serializeDocument, parseFrontmatter } from "./frontmatter"
import {
  tempFileName,
  readTemplate,
  readConfig,
  serializeDictYaml,
  serializeConfig,
  CONFIG_PATH,
  DICT_FILES,
  TEMPLATE_PATH,
  type UserConfig,
} from "./repo"
import { EMPTY_FRONTMATTER, TEMPLATE_BODY } from "./template"

// UUID polyfill — crypto.randomUUID() может отсутствовать в старом WebKitGTK (Ubuntu 22.04)
function uuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16)
  })
}

/** Rust возвращает { path, content, modified } — парсим в Localization. */
interface FileEntry { path: string; content: string; modified: number }

interface AttachmentEntry { path: string; name: string; data_url: string }

/** Ленивая загрузка вложений локализации с диска (для отображения картинок
 *  при просмотре). read_localizations читает только .md-текст; бинарные
 *  вложения (attachments/xxx.png) — отдельным командом read_attachments.
 *  Вызывается из openFolder/openFile ДО set({editing}) — к моменту рендера
 *  EditorView activeFile.attachments уже заполнен, useEffect
 *  инициализирует локальный state правильно. */
async function loadAttachmentsFor(number: string, fileId: string) {
  if (!number) return
  const { base } = useStore.getState()
  try {
    const atts = await invoke<AttachmentEntry[]>("read_attachments", { base, number })
    useStore.setState((s) => ({
      files: s.files.map((f) =>
        f.id === fileId
          ? { ...f, attachments: atts.map((a) => ({ path: a.path, name: a.name, dataUrl: a.data_url })) }
          : f
      ),
    }))
  } catch { /* папки attachments/ нет или ошибка — оставляем [] */ }
}

function parseFileEntries(entries: FileEntry[]): Localization[] {
  const result: Localization[] = []
  for (const e of entries) {
    let number = ""
    let fileName = e.path
    if (e.path.includes("/")) {
      const idx = e.path.indexOf("/")
      number = e.path.slice(0, idx)
      fileName = e.path.slice(idx + 1)
    }
    if (number === ".tmp") {
      number = ""
      fileName = e.path  // .tmp/xxx.md
    }
    // Нормализуем CRLF → LF: на Windows git checkout с core.autocrlf=true
    // (или редактор типа Notepad) делает файлы с \r\n — без нормализации
    // regex ниже не матчит `---\r\n`, m=null, и весь файл (включая frontmatter)
    // уходит в body. Это и есть баг "frontmatter попадает в тело" на Windows.
    const content = e.content.replace(/\r\n/g, "\n")
    const m = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(content)
    const frontmatter = m ? parseFrontmatter(m[1]) : { ...EMPTY_FRONTMATTER }
    const body = m ? m[2].replace(/^\n+/, "") : content
    result.push({
      id: e.path,
      number,
      fileName,
      frontmatter,
      body,
      attachments: [],
      createdAt: e.modified,
      updatedAt: e.modified,
      dirty: false,
      synced: true,
    })
  }
  // parentId для уточнений (localization-N.md)
  for (const f of result) {
    if (/^localization-\d+\.md$/.test(f.fileName)) {
      const main = result.find((r) => r.number === f.number && r.fileName === "localization.md")
      if (main) f.parentId = main.id
    }
  }
  return result
}

function pathFor(f: Localization): string {
  if (f.fileName.startsWith(".tmp/")) return f.fileName
  return f.number ? `${f.number}/${f.fileName}` : ""
}

async function writeLoc(base: string, f: Localization) {
  const path = pathFor(f)
  if (!path) return
  await invoke("write_file", { base, path, content: serializeDocument(f.frontmatter, f.body) })
  // Записать вложения на диск (только для KB-файлов, не .tmp-черновиков)
  if (f.number && f.attachments.length > 0) {
    for (const att of f.attachments) {
      if (att.dataUrl) {
        try {
          await invoke("write_attachment", { base, path: `${f.number}/${att.path}`, dataUrl: att.dataUrl })
        } catch { /* вложение уже есть или ошибка — не критично */ }
      }
    }
  }
}

interface State {
  files: Localization[]
  repoFiles: Record<string, string>
  settings: Settings
  base: string
  view: View
  editing: { number: string | null; fileId: string | null }
  syncStatus: SyncStatus
  syncError: string | null
  syncing: boolean
  lastCommitMessage: string | null
  recentLimit: number

  init: () => Promise<void>
  completeSetup: (folder: string, name: string, email: string, branch: string) => Promise<void>
  resetProject: () => Promise<void>
  setView: (v: View) => void
  openFolder: (number: string) => void
  openFile: (fileId: string) => void
  closeEditor: () => void
  createDraft: () => Promise<string>
  upsertFile: (file: Localization) => Promise<void>
  patchFile: (id: string, patch: Partial<Localization>) => Promise<void>
  removeFile: (id: string) => Promise<void>
  removeFolderDrafts: (number: string) => Promise<void>
  clarify: () => Promise<string | null>
  writeDictionary: (name: DictName, values: string[]) => Promise<void>
  writeTemplateFile: (content: string) => Promise<void>
  writeConfig: (config: UserConfig) => Promise<void>
  sync: () => Promise<void>
  setOffline: (b: boolean) => void
}

export const useStore = create<State>()((set, get) => ({
  files: [],
  repoFiles: {},
  settings: { setupComplete: false, offline: false },
  base: "",
  view: "setup",
  editing: { number: null, fileId: null },
  syncStatus: "green",
  syncError: null,
  syncing: false,
  lastCommitMessage: null,
  recentLimit: 5,

  init: async () => {
    try {
      const folder = await invoke<string>("get_folder")
      if (!folder) {
        set({ view: "setup" })
        return
      }
      await invoke("init_project", { folder })
      let repoFiles = await invoke<Record<string, string>>("read_repo_files", { base: folder })
      // создать недостающие справочники + шаблон на диске (если папка была пуста)
      for (const name of ["type", "client", "environment", "product", "scope"] as DictName[]) {
        if (!repoFiles[DICT_FILES[name]]) {
          const content = serializeDictYaml([])
          await invoke("write_file", { base: folder, path: DICT_FILES[name], content })
          repoFiles[DICT_FILES[name]] = content
        }
      }
      if (!repoFiles[TEMPLATE_PATH]) {
        const content = serializeDocument(EMPTY_FRONTMATTER, TEMPLATE_BODY)
        await invoke("write_file", { base: folder, path: TEMPLATE_PATH, content })
        repoFiles[TEMPLATE_PATH] = content
      }
      const entries = await invoke<FileEntry[]>("read_localizations", { base: folder })
      const files = parseFileEntries(entries)
      const cfg = readConfig(repoFiles)
      set({
        base: folder,
        repoFiles,
        files,
        settings: { setupComplete: true, offline: false },
        recentLimit: cfg.recentLimit,
        view: "workspace",
      })
    } catch (e) {
      set({ syncStatus: "red", syncError: String(e), view: "setup" })
    }
  },

  completeSetup: async (folder, name, email, branch) => {
    await invoke("set_folder", { folder })
    await invoke("init_project", { folder })
    // записать автора в .tmp/config.yaml
    const config = { profile: { name, email } }
    await invoke("write_file", { base: folder, path: CONFIG_PATH, content: serializeConfig(config) })
    // checkout выбранной ветки + pull
    await invoke("git_checkout_pull", { folder, branch })
    // перезагрузить данные
    await get().init()
  },

  resetProject: async () => {
    // Очистить paths.json (забыть текущую папку) и сбросить store к мастеру
    // настройки. Файлы на диске НЕ удаляются — пользователь выберет новую
    // папку (или ту же) и пройдёт инициализацию заново.
    await invoke("set_folder", { folder: "" })
    set({
      base: "",
      files: [],
      repoFiles: {},
      view: "setup",
      editing: { number: null, fileId: null },
      syncStatus: "green",
      syncError: null,
      syncing: false,
      lastCommitMessage: null,
    })
  },

  setView: (v) => set({ view: v }),
  openFolder: async (number) => {
    const main =
      get().files.find((f) => f.number === number && f.fileName === "localization.md") ??
      get().files.find((f) => f.number === number)
    if (main) {
      // Загрузить вложения с диска ДО set({editing}) — чтобы к моменту
      // рендера EditorView activeFile.attachments был заполнен.
      await loadAttachmentsFor(number, main.id)
      set({ view: "editor", editing: { number, fileId: main.id } })
    }
  },
  openFile: async (fileId) => {
    const f = get().files.find((x) => x.id === fileId)
    if (f) {
      if (f.number) await loadAttachmentsFor(f.number, f.id)
      set({ view: "editor", editing: { number: f.number, fileId: f.id } })
    }
  },
  closeEditor: () => set({ view: "workspace", editing: { number: null, fileId: null } }),

  createDraft: async () => {
    const { base, repoFiles } = get()
    const tpl = readTemplate(repoFiles)
    const cfg = readConfig(repoFiles)
    const author = formatAuthor(cfg.profile.name, cfg.profile.email) || ""
    const fm = { ...tpl.frontmatter, number: "", author }
    const id = uuid()
    const fileName = tempFileName()
    const file: Localization = {
      id, number: "", fileName, frontmatter: fm, body: tpl.body, attachments: [],
      createdAt: Date.now(), updatedAt: Date.now(), dirty: true, synced: false,
    }
    set((s) => ({
      files: [...s.files, file],
      view: "editor",
      editing: { number: "", fileId: id },
      syncStatus: "yellow",
    }))
    await writeLoc(base, file)
    return id
  },

  upsertFile: async (file) => {
    const { base } = get()
    set((s) => ({
      files: s.files.some((f) => f.id === file.id)
        ? s.files.map((f) => (f.id === file.id ? file : f))
        : [...s.files, file],
      syncStatus: "yellow",
    }))
    await writeLoc(base, file)
  },

  patchFile: async (id, patch) => {
    const { base } = get()
    const before = get().files.find((f) => f.id === id)
    set((s) => ({
      files: s.files.map((f) =>
        f.id === id ? { ...f, ...patch, updatedAt: Date.now(), dirty: true } : f
      ),
      syncStatus: "yellow",
    }))
    const f = get().files.find((x) => x.id === id)
    if (!f) return
    const oldPath = before ? pathFor(before) : ""
    const newPath = pathFor(f)
    if (oldPath && newPath && oldPath !== newPath) {
      try { await invoke("delete_file", { base, path: oldPath }) } catch { /* old gone */ }
    }
    if (newPath) {
      await invoke("write_file", { base, path: newPath, content: serializeDocument(f.frontmatter, f.body) })
    }
  },

  removeFile: async (id) => {
    const { base } = get()
    const f = get().files.find((x) => x.id === id)
    if (f) {
      const path = pathFor(f)
      if (path) { try { await invoke("delete_file", { base, path }) } catch {} }
    }
    set((s) => ({ files: s.files.filter((x) => x.id !== id), syncStatus: "yellow" }))
  },

  removeFolderDrafts: async (number) => {
    const { base } = get()
    const dirty = get().files.filter((f) => f.number === number && f.dirty)
    for (const f of dirty) {
      const path = pathFor(f)
      if (path) { try { await invoke("delete_file", { base, path }) } catch {} }
    }
    set((s) => {
      const files = s.files.filter((f) => !(f.number === number && f.dirty))
      const hasDirty = files.some((f) => f.dirty)
      return { files, syncStatus: hasDirty ? "yellow" : "green", syncError: null }
    })
  },

  clarify: async () => {
    const { base, editing, repoFiles } = get()
    if (!editing.number || !editing.fileId) return null
    const parent = get().files.find((f) => f.id === editing.fileId)
    if (!parent) return null
    const siblings = get().files.filter((f) => f.number === parent.number)
    let max = 1
    for (const f of siblings) {
      const m = /^localization-(\d+)\.md$/.exec(f.fileName)
      if (m) max = Math.max(max, parseInt(m[1], 10))
    }
    const idx = max + 1
    const id = uuid()
    const tpl = readTemplate(repoFiles)
    const file: Localization = {
      id, number: parent.number, fileName: `localization-${idx}.md`, parentId: parent.id,
      frontmatter: { ...parent.frontmatter }, body: tpl.body, attachments: [],
      createdAt: Date.now(), updatedAt: Date.now(), dirty: true, synced: false,
    }
    set((s) => ({
      files: [...s.files, file],
      editing: { number: parent.number, fileId: id },
      syncStatus: "yellow",
    }))
    await writeLoc(base, file)
    return id
  },

  writeDictionary: async (name, values) => {
    const { base } = get()
    const content = serializeDictYaml(values)
    set((s) => ({ repoFiles: { ...s.repoFiles, [DICT_FILES[name]]: content }, syncStatus: "yellow" }))
    await invoke("write_file", { base, path: DICT_FILES[name], content })
  },

  writeTemplateFile: async (content) => {
    const { base } = get()
    set((s) => ({ repoFiles: { ...s.repoFiles, [TEMPLATE_PATH]: content }, syncStatus: "yellow" }))
    await invoke("write_file", { base, path: TEMPLATE_PATH, content })
  },

  writeConfig: async (config) => {
    const { base } = get()
    const content = serializeConfig(config)
    set((s) => ({ repoFiles: { ...s.repoFiles, [CONFIG_PATH]: content }, syncStatus: "yellow" }))
    await invoke("write_file", { base, path: CONFIG_PATH, content })
  },

  sync: async () => {
    const { base, settings } = get()
    if (settings.offline) {
      set({ syncStatus: "yellow", syncError: "Автономный режим: отправка отложена." })
      return
    }
    set({ syncing: true, syncError: null })
    const dirtyKb = get().files.filter(
      (f) => f.dirty && f.number && !f.fileName.startsWith(".tmp/")
    )
    const commitMessage = dirtyKb.map(commitMessageFor).join("; ") || "IDS sync"
    const cfg = readConfig(get().repoFiles)
    try {
      await invoke("git_sync", {
        base,
        commitMessage,
        authorName: cfg.profile.name || "IDS",
        authorEmail: cfg.profile.email || "ids@local",
      })
      set((s) => ({
        syncing: false,
        syncStatus: "green",
        syncError: null,
        files: s.files.map((f) =>
          f.dirty && f.number && !f.fileName.startsWith(".tmp/")
            ? { ...f, dirty: false, synced: true } : f
        ),
        lastCommitMessage: commitMessage,
      }))
    } catch (e) {
      set({ syncing: false, syncStatus: "red", syncError: String(e) })
    }
  },

  setOffline: (b) =>
    set((s) => ({ settings: { ...s.settings, offline: b }, syncStatus: b ? "yellow" : s.syncStatus })),
}))

export function selectFolders(files: Localization[]) {
  const map = new Map<string, Localization[]>()
  for (const f of files) {
    if (f.number === "") continue
    const arr = map.get(f.number) ?? []
    arr.push(f)
    map.set(f.number, arr)
  }
  return [...map.entries()]
    .map(([number, list]) => {
      const sorted = list.sort((a, b) =>
        a.fileName === "localization.md" ? -1 : b.fileName === "localization.md" ? 1 : a.fileName.localeCompare(b.fileName)
      )
      const main = sorted.find((f) => f.fileName === "localization.md") ?? sorted[0]
      return { number, files: sorted, main, updatedAt: Math.max(...sorted.map((f) => f.updatedAt)) }
    })
    .sort((a, b) => {
      const na = parseInt(a.number.replace(/\D/g, ""), 10) || 0
      const nb = parseInt(b.number.replace(/\D/g, ""), 10) || 0
      return na - nb
    })
}

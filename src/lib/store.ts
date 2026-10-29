// Tauri-версия lib/store.ts — folder-based, без git-настроек.
// base = папка проекта (выбранная пользователем). Git — через host-бинарник.
// Компоненты (editor-view/workspace-view/...) не меняются — зовут те же действия.

import { create } from "zustand"
import { invoke } from "@tauri-apps/api/core"
import type { Localization, Settings, SyncStatus, View, DictName } from "./types"
import { formatAuthor, commitMessageFor, serializeDocument, parseFrontmatter } from "./frontmatter"
import {
  tempFileName,
  readTemplate,
  parseConfig,
  readLegacyConfig,
  serializeDictYaml,
  serializeConfig,
  DEFAULT_USER_CONFIG,
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
  // number пустой → .tmp-черновик → read_attachments читает .tmp/attachments/
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

/** Записать вложения на диск.
 *  KB-файлы (number=SPAS-XXXX) → <number>/attachments/<name>
 *  .tmp-черновики (number пустой) → .tmp/attachments/<name>
 *  Без этого вложения теряются при перезапуске (в памяти, но не на диске). */
async function writeAttachments(base: string, f: Localization) {
  if (f.attachments.length === 0) return
  const dir = f.number ? f.number : ".tmp"
  for (const att of f.attachments) {
    if (att.dataUrl) {
      try {
        await invoke("write_attachment", { base, path: `${dir}/${att.path}`, dataUrl: att.dataUrl })
      } catch { /* вложение уже есть или ошибка — не критично */ }
    }
  }
}

async function writeLoc(base: string, f: Localization) {
  const path = pathFor(f)
  if (!path) return
  await invoke("write_file", { base, path, content: serializeDocument(f.frontmatter, f.body) })
  await writeAttachments(base, f)
}

/** Настройки пользователя — в папке конфигурации ОС (вне папки проекта).
 *  Первый запуск новой версии переносит их из .tmp/config.yaml проекта.
 *  Без папки проекта (repoFiles = null) ничего не сохраняем. */
async function loadConfig(repoFiles: Record<string, string> | null): Promise<UserConfig> {
  const text = await invoke<string | null>("read_app_config")
  if (text !== null) return parseConfig(text)
  if (!repoFiles) return DEFAULT_USER_CONFIG
  const legacy = readLegacyConfig(repoFiles)
  await invoke("write_app_config", { content: serializeConfig(legacy) })
  return legacy
}

/** Загрузить проект из папки: служебные файлы, справочники, локализации.
 *  Бросает ошибку, если что-то не удалось. */
async function loadProject(folder: string): Promise<void> {
  await invoke("init_project", { folder })
  const repoFiles = await invoke<Record<string, string>>("read_repo_files", { base: folder })
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
  const config = await loadConfig(repoFiles)
  const entries = await invoke<FileEntry[]>("read_localizations", { base: folder })
  const files = parseFileEntries(entries)
  let gitIdentityMissing = false
  if (await invoke<boolean>("is_git_repo", { folder })) {
    const id = await invoke<{ name: string; email: string }>("git_identity", { folder })
    gitIdentityMissing = !id.name || !id.email
  }
  useStore.setState({
    base: folder,
    repoFiles,
    files,
    config,
    settings: { setupComplete: true, offline: false },
    view: "workspace",
    editing: { number: null, fileId: null, mode: "view" },
    syncStatus: "green",
    syncError: null,
    gitIdentityMissing,
  })
}

export type EditMode = "view" | "edit"

/** Черновики (.tmp и без номера) редактируются всегда, сохранённые — только в режиме edit. */
export function isTmpFile(f: Localization): boolean {
  return f.fileName.startsWith(".tmp/") || !f.number
}

export function isEditable(f: Localization, mode: EditMode): boolean {
  return isTmpFile(f) || mode === "edit"
}

interface State {
  files: Localization[]
  repoFiles: Record<string, string>
  settings: Settings
  base: string
  view: View
  editing: { number: string | null; fileId: string | null; mode: EditMode }
  syncStatus: SyncStatus
  syncError: string | null
  syncing: boolean
  lastCommitMessage: string | null
  config: UserConfig
  /** В git папки проекта не задано имя или email — нужно запросить. */
  gitIdentityMissing: boolean

  init: () => Promise<void>
  prepareRepo: (url: string, folder: string) => Promise<{ isRepo: boolean; branches: string[] }>
  applyProject: (folder: string, branch: string | null) => Promise<void>
  completeSetup: (folder: string, name: string, email: string, branch: string | null) => Promise<void>
  saveGitIdentity: (name: string, email: string, global: boolean) => Promise<void>
  dismissGitIdentity: () => void
  setView: (v: View) => void
  openFolder: (number: string) => void
  openFile: (fileId: string) => void
  closeEditor: () => void
  setEditMode: (mode: EditMode) => void
  createDraft: () => Promise<string>
  upsertFile: (file: Localization) => Promise<void>
  patchFile: (id: string, patch: Partial<Localization>) => Promise<void>
  removeFile: (id: string) => Promise<void>
  removeFolderDrafts: (number: string) => Promise<void>
  clarify: (parentId?: string) => Promise<string | null>
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
  editing: { number: null, fileId: null, mode: "view" },
  syncStatus: "green",
  syncError: null,
  syncing: false,
  lastCommitMessage: null,
  config: DEFAULT_USER_CONFIG,
  gitIdentityMissing: false,

  init: async () => {
    try {
      const folder = await invoke<string>("get_folder")
      if (!folder) {
        const config = await loadConfig(null)
        set({ config, view: "setup" })
        return
      }
      await loadProject(folder)
    } catch (e) {
      set({ syncStatus: "red", syncError: String(e), view: "setup" })
    }
  },

  prepareRepo: async (url, folder) => {
    if (url.trim()) await invoke("git_clone", { url: url.trim(), folder })
    const isRepo = await invoke<boolean>("is_git_repo", { folder })
    const branches = isRepo ? await invoke<string[]>("git_branches", { folder }) : []
    return { isRepo, branches }
  },

  applyProject: async (folder, branch) => {
    if (branch) await invoke("git_checkout_pull", { folder, branch })
    // loadProject бросает ошибку — тогда папка в paths.json не меняется
    await loadProject(folder)
    await invoke("set_folder", { folder })
  },

  completeSetup: async (folder, name, email, branch) => {
    const { config } = get()
    await get().writeConfig({ ...config, profile: { ...config.profile, name, email } })
    await get().applyProject(folder, branch)
  },

  saveGitIdentity: async (name, email, global) => {
    const { base } = get()
    await invoke("git_set_identity", { folder: base, name, email, global })
    set({ gitIdentityMissing: false })
  },

  dismissGitIdentity: () => set({ gitIdentityMissing: false }),

  setView: (v) => set({ view: v }),
  openFolder: async (number) => {
    const main =
      get().files.find((f) => f.number === number && f.fileName === "localization.md") ??
      get().files.find((f) => f.number === number)
    if (main) {
      // Загрузить вложения с диска ДО set({editing}) — чтобы к моменту
      // рендера EditorView activeFile.attachments был заполнен.
      await loadAttachmentsFor(number, main.id)
      set({ view: "editor", editing: { number, fileId: main.id, mode: "view" } })
    }
  },
  openFile: async (fileId) => {
    const f = get().files.find((x) => x.id === fileId)
    if (f) {
      // Загрузить вложения ВСЕГДА — даже для .tmp-черновиков (number=""),
      // иначе картинки в черновиках теряются после перезапуска.
      await loadAttachmentsFor(f.number, f.id)
      set({ view: "editor", editing: { number: f.number, fileId: f.id, mode: "view" } })
    }
  },
  closeEditor: () => set({ view: "workspace", editing: { number: null, fileId: null, mode: "view" } }),
  setEditMode: (mode) => set((s) => ({ editing: { ...s.editing, mode } })),

  createDraft: async () => {
    const { base, repoFiles } = get()
    const tpl = readTemplate(repoFiles)
    const { profile } = get().config
    const author = formatAuthor(profile.name, profile.email) || ""
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
      editing: { number: "", fileId: id, mode: "edit" },
      syncStatus: "yellow",
    }))
    await writeLoc(base, file)
    return id
  },

  upsertFile: async (file) => {
    const { base } = get()
    const before = get().files.find((f) => f.id === file.id)
    set((s) => ({
      files: s.files.some((f) => f.id === file.id)
        ? s.files.map((f) => (f.id === file.id ? file : f))
        : [...s.files, file],
      syncStatus: "yellow",
    }))
    await writeLoc(base, file)
    // Промоушен .tmp → KB: удалить старый .tmp-черновик + его вложения.
    // writeLoc уже записал KB-файл + вложения в <number>/attachments/.
    // Старый .tmp/<draft>.md и .tmp/attachments/<name> — orphaned, удаляем.
    if (before && before.fileName.startsWith(".tmp/") && !file.fileName.startsWith(".tmp/") && file.number) {
      try { await invoke("delete_file", { base, path: before.fileName }) } catch { /* old gone */ }
      for (const att of file.attachments) {
        try { await invoke("delete_file", { base, path: `.tmp/${att.path}` }) } catch { /* gone */ }
      }
    }
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
      await writeAttachments(base, f)
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

  clarify: async (parentId?: string) => {
    const { base, editing, repoFiles } = get()
    const pid = parentId || editing.fileId
    if (!pid) return null
    const parent = get().files.find((f) => f.id === pid)
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
    const { profile } = get().config
    const author = formatAuthor(profile.name, profile.email) || ""
    const file: Localization = {
      id, number: parent.number, fileName: `localization-${idx}.md`, parentId: parent.id,
      frontmatter: { ...parent.frontmatter, author }, body: tpl.body, attachments: [],
      createdAt: Date.now(), updatedAt: Date.now(), dirty: true, synced: false,
    }
    set((s) => ({
      files: [...s.files, file],
      editing: { number: parent.number, fileId: id, mode: "edit" },
      view: "editor",
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
    await invoke("write_app_config", { content: serializeConfig(config) })
    set({ config })
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
    const dirtyKbIds = new Set(dirtyKb.map((f) => f.id))
    const commitMessage = dirtyKb.map(commitMessageFor).join("; ") || "IDS sync"
    const { profile } = get().config
    try {
      await invoke("git_sync", {
        base,
        commitMessage,
        authorName: profile.name || "IDS",
        authorEmail: profile.email || "ids@local",
      })
      // RE-READ from disk: git_sync делает pull --rebase → на диске изменения
      // от других пользователей (multi-user). Без re-read store остался бы
      // stale — показывал бы старую версию без remote-изменений.
      const entries = await invoke<FileEntry[]>("read_localizations", { base })
      const diskFiles = parseFileEntries(entries)
      const repoFiles = await invoke<Record<string, string>>("read_repo_files", { base })
      set((s) => ({
        syncing: false,
        syncStatus: "green",
        syncError: null,
        repoFiles,
        // Merge: dirty .tmp-черновики (не synced, пользователь редактирует) →
        // оставляем локальную версию. Всё остальное (synced KB + clean) →
        // диск-версия (с remote-изменениями после pull --rebase).
        files: diskFiles.map((df) => {
          const localDirtyDraft = s.files.find(
            (f) => f.id === df.id && f.dirty && !dirtyKbIds.has(f.id)
          )
          return localDirtyDraft ?? df
        }),
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

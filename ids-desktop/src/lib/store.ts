// Tauri-версия lib/store.ts — ПОЛНАЯ.
// Те же данные в памяти, но чтение/запись через invoke (настоящая ФС + git CLI).
// Компоненты (editor-view/workspace-view/...) не меняются — зовут те же действия;
// мутации здесь пишут в файлы и гоняют git.
//
// base = путь к локальному репозиторию (Tauri app_data_dir, команда get_base).
// Конфиг (профиль + git-аутентификация) лежит в base/.tmp/config.yaml (gitignored).

"use client"

import { create } from "zustand"
import { invoke } from "@tauri-apps/api/core"
import type { Localization, Settings, SyncStatus, View, DictName } from "./types"
import { formatAuthor, commitMessageFor, serializeDocument } from "./frontmatter"
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

/** Путь к файлу локализации на диске (относительно base). */
function pathFor(f: Localization): string {
  if (f.fileName.startsWith(".tmp/")) return f.fileName
  return f.number ? `${f.number}/${f.fileName}` : ""
}

/** Записать файл локализации на диск. */
async function writeLoc(base: string, f: Localization) {
  const path = pathFor(f)
  if (!path) return
  await invoke("write_file", { base, path, content: serializeDocument(f.frontmatter, f.body) })
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

  init: () => Promise<void>
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
  completeSetup: (config: UserConfig) => Promise<void>
}

export const useStore = create<State>()((set, get) => ({
  files: [],
  repoFiles: {},
  settings: { setupComplete: false, offline: false },
  base: "",
  view: "workspace",
  editing: { number: null, fileId: null },
  syncStatus: "green",
  syncError: null,
  syncing: false,
  lastCommitMessage: null,

  init: async () => {
    try {
      const base = await invoke<string>("get_base")
      set({ base })
      const repoFiles = await invoke<Record<string, string>>("read_repo_files", { base })
      const files = await invoke<Localization[]>("read_localizations", { base })
      const cfg = readConfig(repoFiles)
      set({
        repoFiles,
        files,
        settings: { setupComplete: !!cfg.repo.connected, offline: false },
        view: cfg.repo.connected ? "workspace" : "setup",
      })
    } catch (e) {
      set({ syncStatus: "red", syncError: String(e), view: "setup" })
    }
  },

  setView: (v) => set({ view: v }),
  openFolder: (number) => {
    const main =
      get().files.find((f) => f.number === number && f.fileName === "localization.md") ??
      get().files.find((f) => f.number === number)
    if (main) set({ view: "editor", editing: { number, fileId: main.id } })
  },
  openFile: (fileId) => {
    const f = get().files.find((x) => x.id === fileId)
    if (f) set({ view: "editor", editing: { number: f.number, fileId: f.id } })
  },
  closeEditor: () => set({ view: "workspace", editing: { number: null, fileId: null } }),

  createDraft: async () => {
    const { base, repoFiles } = get()
    const tpl = readTemplate(repoFiles)
    const cfg = readConfig(repoFiles)
    const author = formatAuthor(cfg.profile.name, cfg.profile.email) || tpl.frontmatter.author
    const spaceCode = cfg.profile.spaceCode || "SPAS"
    const fm = { ...tpl.frontmatter, number: `${spaceCode}-`, author }
    const id = crypto.randomUUID()
    const fileName = tempFileName()
    const file: Localization = {
      id,
      number: "",
      fileName,
      frontmatter: fm,
      body: tpl.body,
      attachments: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      dirty: true,
      synced: false,
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
    // если файл переименован (.tmp → номер) — удалить старый путь
    if (oldPath && newPath && oldPath !== newPath) {
      try { await invoke("delete_file", { base, path: oldPath }) } catch { /* старого уже нет */ }
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
    const id = crypto.randomUUID()
    const tpl = readTemplate(repoFiles)
    const file: Localization = {
      id,
      number: parent.number,
      fileName: `localization-${idx}.md`,
      parentId: parent.id,
      frontmatter: { ...parent.frontmatter },
      body: tpl.body,
      attachments: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      dirty: true,
      synced: false,
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
    set((s) => ({
      repoFiles: { ...s.repoFiles, [DICT_FILES[name]]: content },
      syncStatus: "yellow",
    }))
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
        authorName: cfg.profile.name,
        authorEmail: cfg.profile.email,
        authMethod: cfg.repo.authMethod,
        sshKey: cfg.repo.sshKeyPath,
      })
      set((s) => ({
        syncing: false,
        syncStatus: "green",
        syncError: null,
        files: s.files.map((f) =>
          f.dirty && f.number && !f.fileName.startsWith(".tmp/")
            ? { ...f, dirty: false, synced: true }
            : f
        ),
        lastCommitMessage: commitMessage,
      }))
    } catch (e) {
      set({ syncing: false, syncStatus: "red", syncError: String(e) })
    }
  },

  setOffline: (b) =>
    set((s) => ({ settings: { ...s.settings, offline: b }, syncStatus: b ? "yellow" : s.syncStatus })),

  completeSetup: async (config) => {
    const { base } = get()
    const content = serializeConfig(config)
    // клонируем репозиторий в base (если ещё не клонирован)
    try {
      await invoke("git_clone", {
        url: config.repo.url,
        base,
        authMethod: config.repo.authMethod,
        sshKey: config.repo.sshKeyPath,
      })
    } catch (e) {
      // возможно уже клонирован — не критично
      console.warn("git_clone:", String(e))
    }
    await invoke("write_file", { base, path: CONFIG_PATH, content })
    set((s) => ({
      repoFiles: { ...s.repoFiles, [CONFIG_PATH]: content },
      settings: { ...s.settings, setupComplete: true },
      view: "workspace",
    }))
  },
}))

// --- селектор (как в веб-версии) ---
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
        a.fileName === "localization.md"
          ? -1
          : b.fileName === "localization.md"
            ? 1
            : a.fileName.localeCompare(b.fileName)
      )
      const main = sorted.find((f) => f.fileName === "localization.md") ?? sorted[0]
      return {
        number,
        files: sorted,
        main,
        updatedAt: Math.max(...sorted.map((f) => f.updatedAt)),
      }
    })
    .sort((a, b) => {
      const na = parseInt(a.number.replace(/\D/g, ""), 10) || 0
      const nb = parseInt(b.number.replace(/\D/g, ""), 10) || 0
      return na - nb
    })
}

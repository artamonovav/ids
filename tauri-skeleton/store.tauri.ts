// Tauri-версия lib/store.ts — ТЕМПЛЕЙТ.
// Те же данные в памяти, но чтение/запись через invoke (настоящая ФС + git CLI),
// а не localStorage. Серверной логики нет. Допилите действия «по аналогии» под себя.
//
// Что меняется vs веб-версии (lib/store.ts):
//  - нет persist (данные в реальных файлах, грузятся через init());
//  - мутации (createDraft/patchFile/upsertFile/clarify/removeFile/writeDictionary/
//    writeTemplateFile) вызывают invoke("write_file"/"delete_file"/"rename_file");
//  - sync() -> invoke("git_sync", { commitMessage, author* }) — настоящий git;
//  - base = repo.localPath из .tmp/config.yaml (путь к локальному репозиторию).
//
// Логика commitMessageFor / serializeFrontmatter / readTemplate / readConfig
// остаётся в TS (lib/frontmatter.ts, lib/repo.ts) — Rust только читает/пишет файлы.

"use client"

import { create } from "zustand"
import { invoke } from "@tauri-apps/api/core"
import type { Localization, Settings, SyncStatus, View, DictName } from "./types"
import { formatAuthor, commitMessageFor, serializeDocument } from "./frontmatter"
import {
  tempFileName, readTemplate, readConfig, serializeDictYaml, serializeConfig,
  CONFIG_PATH, DICT_FILES, TEMPLATE_PATH,
} from "./repo"

interface State {
  files: Localization[]
  repoFiles: Record<string, string>
  settings: Settings
  view: View
  editing: { number: string | null; fileId: string | null }
  syncStatus: SyncStatus
  syncError: string | null
  syncing: boolean
  lastCommitMessage: string | null
  base: string

  init: () => Promise<void>
  setView: (v: View) => void
  openFolder: (number: string) => void
  openFile: (fileId: string) => void
  closeEditor: () => void
  createDraft: () => Promise<string>
  patchFile: (id: string, patch: Partial<Localization>) => Promise<void>
  // upsertFile / clarify / removeFile / removeFolderDrafts / writeDictionary /
  // writeTemplateFile / sync / setOffline / completeSetup — по аналогии (см. ниже)
  sync: () => Promise<void>
}

export const useStore = create<State>()((set, get) => ({
  files: [],
  repoFiles: {},
  settings: { setupComplete: false, offline: false },
  view: "workspace",
  editing: { number: null, fileId: null },
  syncStatus: "green",
  syncError: null,
  syncing: false,
  lastCommitMessage: null,
  base: "",

  init: async () => {
    // 1. конфиг (путь к репо + профиль/аутентификация) — из .tmp/config.yaml
    const repoFiles0 = await invoke<Record<string, string>>("read_repo_files", { base: "" })
    const cfg = readConfig(repoFiles0)
    const base = cfg.repo.localPath
    set({ base })
    // 2. локализации (база знаний + .tmp-черновики) из ФС
    const files = await invoke<Localization[]>("read_localizations", { base })
    // 3. репо-файлы (справочники, шаблон, конфиг) из ФС
    const repoFiles = await invoke<Record<string, string>>("read_repo_files", { base })
    set({
      files,
      repoFiles,
      settings: { setupComplete: !!cfg.repo.connected, offline: false },
    })
  },

  setView: (v) => set({ view: v }),
  openFolder: (number) => {
    const main = get().files.find((f) => f.number === number && f.fileName === "localization.md")
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
      id, number: "", fileName, frontmatter: fm, body: tpl.body, attachments: [],
      createdAt: Date.now(), updatedAt: Date.now(), dirty: true, synced: false,
    }
    await invoke("write_file", { base, path: fileName, content: serializeDocument(fm, tpl.body) })
    set((s) => ({ files: [...s.files, file], view: "editor", editing: { number: "", fileId: id }, syncStatus: "yellow" }))
    return id
  },

  patchFile: async (id, patch) => {
    const { base } = get()
    set((s) => ({
      files: s.files.map((f) => (f.id === id ? { ...f, ...patch, updatedAt: Date.now(), dirty: true } : f)),
      syncStatus: "yellow",
    }))
    // записать обновлённый файл на диск
    const f = get().files.find((x) => x.id === id)
    if (f && f.number) {
      await invoke("write_file", {
        base,
        path: `${f.number}/${f.fileName}`,
        content: serializeDocument(f.frontmatter, f.body),
      })
    }
  },

  // upsertFile / clarify / removeFile / removeFolderDrafts / writeDictionary /
  // writeTemplateFile / setOffline / completeSetup — реализуются по аналогии:
  //   writeDictionary(name, values) -> invoke("write_file", { base, path: DICT_FILES[name], content: serializeDictYaml(values) })
  //   writeTemplateFile(content)   -> invoke("write_file", { base, path: TEMPLATE_PATH, content })
  //   removeFile(id)               -> invoke("delete_file", { base, path: `${f.number}/${f.fileName}` })
  //   rename .tmp на номер         -> invoke("rename_file", { base, from, to })
  //   completeSetup(config)        -> invoke("write_file", { base, path: CONFIG_PATH, content: serializeConfig(config) }) + git_clone
  // (скопируйте тела из lib/store.ts и замените set(...) на invoke + локальный set)

  sync: async () => {
    const { base, settings } = get()
    if (settings.offline) { set({ syncStatus: "yellow", syncError: "Автономный режим: отправка отложена." }); return }
    set({ syncing: true, syncError: null })
    const dirtyKb = get().files.filter((f) => f.dirty && f.number && !f.fileName.startsWith(".tmp/"))
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
            ? { ...f, dirty: false, synced: true } : f
        ),
        lastCommitMessage: commitMessage,
      }))
    } catch (e) {
      set({ syncing: false, syncStatus: "red", syncError: String(e) })
    }
  },
}))

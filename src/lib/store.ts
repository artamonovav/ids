// Tauri-версия lib/store.ts — folder-based, без git-настроек.
// base = папка проекта (выбранная пользователем). Git — через host-бинарник.
// Компоненты (editor-view/workspace-view/...) не меняются — зовут те же действия.

import { create } from "zustand"
import { invoke } from "@tauri-apps/api/core"
import { getVersion } from "@tauri-apps/api/app"
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
import { fetchLatestRelease, type UpdateInfo } from "./update"
import { applyTuiMode, applyFontScale } from "./theme"

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

/** Событие работы приложения в журнал (раздел «Журнал», вкладка «Работа»).
 *  Файловые операции и git-команды журналируются в Rust автоматически;
 *  здесь — события уровня пользователя. Ошибки invoke глушим: журнал
 *  не должен ломать основной сценарий. */
function logWork(message: string) {
  void invoke("log_event", { kind: "app", message }).catch(() => {})
}

/** Загрузка вложений для предпросмотра (шторка в списках) — публичный алиас. */
export const loadAttachments = loadAttachmentsFor

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
    // «Обновлено»: из скрытого поля saved_at (дата сохранения), при
    // отсутствии — по текущей логике (mtime файла).
    const savedAtMs = Date.parse(frontmatter.saved_at ?? "")
    const updatedAt = Number.isFinite(savedAtMs) ? savedAtMs : e.modified
    result.push({
      id: e.path,
      number,
      fileName,
      frontmatter,
      body,
      attachments: [],
      createdAt: e.modified,
      updatedAt,
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

/** Настройки пользователя — в папке конфигурации ОС (вне папки проекта):
 *  профиль, recentLimit и путь к текущему проекту.
 *  При первом запуске новой версии профиль переносится из .tmp/config.yaml
 *  проекта, путь — из старого app_data_dir/paths.json (0.2.9). */
async function loadConfig(
  folder: string | null,
  repoFiles: Record<string, string> | null
): Promise<UserConfig> {
  const text = await invoke<string | null>("read_app_config")
  let config: UserConfig
  let changed = false

  if (text !== null) {
    config = parseConfig(text)
  } else if (repoFiles) {
    config = readLegacyConfig(repoFiles)
    changed = true
  } else {
    config = { ...DEFAULT_USER_CONFIG }
  }

  if (folder && config.folder !== folder) {
    config = { ...config, folder }
    changed = true
  }
  if (changed) {
    await invoke("write_app_config", { content: serializeConfig(config) })
  }
  return config
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
  const config = await loadConfig(folder, repoFiles)
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
  logWork(`открыт проект ${folder}`)
  applyTuiMode(config.tuiMode)
  applyFontScale(config.fontScale, config.tuiMode)

  // Статус синхронизации — по реальному git (могли остаться незакоммиченные
  // с прошлого раза / неотправленные коммиты).
  void useStore.getState().refreshSyncState()

  // Фоновый pull: рабочая область уже открыта, сеть не задерживает старт.
  // После pull перечитываем диск — пришли ли изменения от других (multi-user).
  void (async () => {
    try {
      await invoke("git_pull_only", { folder })
      const entries = await invoke<FileEntry[]>("read_localizations", { base: folder })
      const freshRepoFiles = await invoke<Record<string, string>>("read_repo_files", { base: folder })
      useStore.setState((s) => {
        // Пользователь уже успел сменить проект — не трогаем состояние.
        if (s.base !== folder) return s
        const diskFiles = parseFileEntries(entries)
        return {
          repoFiles: freshRepoFiles,
          // Локальные dirty-версии (несинхронизированные правки) не затираем.
          files: diskFiles.map((df) => {
            const local = s.files.find((f) => f.id === df.id && f.dirty)
            return local ?? df
          }),
        }
      })
      logWork("фоновый pull завершён, файлы перечитаны")
      void useStore.getState().refreshSyncState()
    } catch (e) {
      logWork(`фоновый pull: ошибка: ${String(e)}`)
    }
  })()
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
  /** Доступна новая версия (GitHub Releases); null — актуальная/не проверяли. */
  update: UpdateInfo | null

  init: () => Promise<void>
  /** Проверить обновления (GitHub Releases). silent=true — автопроверка
   *  при запуске: ошибки глушатся. silent=false — ручная: ошибки пробрасываются. */
  checkUpdate: (silent?: boolean) => Promise<UpdateInfo | null>
  prepareRepo: (url: string, folder: string) => Promise<{ isRepo: boolean; branches: string[]; folder: string }>
  applyProject: (folder: string, branch: string | null) => Promise<void>
  completeSetup: (folder: string, name: string, email: string, branch: string | null) => Promise<void>
  /** Сбросить папку проекта и вернуть мастер; профиль остаётся в конфиге. */
  resetSetup: () => Promise<void>
  saveGitIdentity: (name: string, email: string, global: boolean) => Promise<void>
  dismissGitIdentity: () => void
  /** TUI-режим: терминальная эстетика на всё приложение (config.yaml). */
  setTuiMode: (on: boolean) => Promise<void>
  /** Табличное отображение списка (графический режим). */
  setTableView: (on: boolean) => Promise<void>
  /** Масштаб текста, проценты (применяется сразу). */
  setFontScale: (pct: number) => Promise<void>
  /** Пересчитать статус синхронизации по реальному состоянию git. */
  refreshSyncState: () => Promise<void>
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
  update: null,

  init: async () => {
    try {
      const text = await invoke<string | null>("read_app_config")
      const saved = text !== null ? parseConfig(text) : null
      let folder = saved?.folder ?? ""
      // миграция 0.2.9: путь лежал в app_data_dir/paths.json
      if (!folder) folder = await invoke<string>("read_legacy_folder")
      if (!folder) {
        set({ config: saved ?? DEFAULT_USER_CONFIG, view: "setup" })
        return
      }
      await loadProject(folder)
    } catch (e) {
      set({ syncStatus: "red", syncError: String(e), view: "setup" })
    }
  },

  prepareRepo: async (url, folder) => {
    let target = folder
    if (url.trim()) {
      // git_clone при непустой папке клонирует в подпапку <папка>/<имя-репо>
      // и возвращает её — проверка веток и открытие проекта идут по ней.
      const actual = await invoke<string | null>("git_clone", { url: url.trim(), folder })
      if (actual) target = actual
    }
    const isRepo = await invoke<boolean>("is_git_repo", { folder: target })
    const branches = isRepo ? await invoke<string[]>("git_branches", { folder: target }) : []
    return { isRepo, branches, folder: target }
  },

  applyProject: async (folder, branch) => {
    if (branch) await invoke("git_checkout_pull", { folder, branch })
    // loadProject бросает ошибку — тогда папка в config.yaml не меняется
    await loadProject(folder)
  },

  completeSetup: async (folder, name, email, branch) => {
    const { config } = get()
    await get().writeConfig({ ...config, profile: { ...config.profile, name, email } })
    await get().applyProject(folder, branch)
  },

  resetSetup: async () => {
    const { config } = get()
    const next = { ...config, folder: "" }
    await get().writeConfig(next)
    set({
      base: "",
      files: [],
      repoFiles: {},
      settings: { setupComplete: false, offline: false },
      view: "setup",
      editing: { number: null, fileId: null, mode: "view" },
      syncStatus: "green",
      syncError: null,
      syncing: false,
      gitIdentityMissing: false,
      lastCommitMessage: null,
    })
  },

  saveGitIdentity: async (name, email, global) => {
    const { base } = get()
    await invoke("git_set_identity", { folder: base, name, email, global })
    set({ gitIdentityMissing: false })
  },

  dismissGitIdentity: () => set({ gitIdentityMissing: false }),

  setTuiMode: async (on) => {
    const { config } = get()
    await get().writeConfig({ ...config, tuiMode: on })
    applyTuiMode(on)
    // размер корневого шрифта зависит от режима (TUI плотнее)
    applyFontScale(config.fontScale, on)
    logWork(`TUI-режим ${on ? "включён" : "выключен"}`)
  },

  setTableView: async (on) => {
    const { config } = get()
    await get().writeConfig({ ...config, tableView: on })
    logWork(`табличный список ${on ? "включён" : "выключен"}`)
  },

  setFontScale: async (pct) => {
    const { config } = get()
    await get().writeConfig({ ...config, fontScale: pct })
    applyFontScale(pct, config.tuiMode)
    logWork(`масштаб текста ${pct}%`)
  },

  /** Статус по реальному git (uncommitted без .tmp + unpushed), а не по
   *  флажку dirty. Красный/оффлайн не перетираем. */
  refreshSyncState: async () => {
    const { base, settings } = get()
    if (!base || settings.offline) return
    try {
      const st = await invoke<{ uncommitted: number; unpushed: number }>(
        "git_sync_state",
        { folder: base },
      )
      if (get().syncStatus === "red") return
      const needs = st.uncommitted > 0 || st.unpushed > 0
      set({ syncStatus: needs ? "yellow" : "green" })
    } catch { /* git недоступен — статус не трогаем */ }
  },

  checkUpdate: async (silent = true) => {
    const version = await getVersion().catch(() => "")
    if (!version) return null
    try {
      const info = await fetchLatestRelease(version)
      set({ update: info })
      return info
    } catch (e) {
      if (silent) return null
      throw e
    }
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
      // .tmp-черновик не синхронизируется — статус не трогаем
    }))
    await writeLoc(base, file)
    logWork(`создан черновик ${fileName}`)
    return id
  },

  upsertFile: async (file) => {
    const { base } = get()
    const before = get().files.find((f) => f.id === file.id)
    // В базу знаний (не .tmp) — есть что синхронизировать; черновик — нет.
    const touchesKb = !!file.number && !file.fileName.startsWith(".tmp/")
    // Скрытое поле saved_at — дата сохранения в базу знаний.
    const saved: Localization = touchesKb
      ? {
          ...file,
          frontmatter: { ...file.frontmatter, saved_at: new Date().toISOString() },
          updatedAt: Date.now(),
        }
      : file
    set((s) => ({
      files: s.files.some((f) => f.id === saved.id)
        ? s.files.map((f) => (f.id === saved.id ? saved : f))
        : [...s.files, saved],
      syncStatus: touchesKb ? "yellow" : s.syncStatus,
    }))
    await writeLoc(base, saved)
    // Промоушен .tmp → KB: удалить старый .tmp-черновик + его вложения.
    // writeLoc уже записал KB-файл + вложения в <number>/attachments/.
    // Старый .tmp/<draft>.md и .tmp/attachments/<name> — orphaned, удаляем.
    if (before && before.fileName.startsWith(".tmp/") && !file.fileName.startsWith(".tmp/") && file.number) {
      try { await invoke("delete_file", { base, path: before.fileName }) } catch { /* old gone */ }
      for (const att of file.attachments) {
        try { await invoke("delete_file", { base, path: `.tmp/${att.path}` }) } catch { /* gone */ }
      }
      logWork(`сохранена локализация ${file.number}/${file.fileName}`)
    } else {
      logWork(`сохранена локализация ${file.number || "черновик"}/${file.fileName}`)
    }
  },

  patchFile: async (id, patch) => {
    const { base } = get()
    const before = get().files.find((f) => f.id === id)
    set((s) => ({
      files: s.files.map((f) =>
        f.id === id ? { ...f, ...patch, updatedAt: Date.now(), dirty: true } : f
      ),
    }))
    const f = get().files.find((x) => x.id === id)
    if (!f) return
    // .tmp-автосохранение/переименование черновика — статус не трогаем
    const touchesKb = !!f.number && !f.fileName.startsWith(".tmp/")
    if (touchesKb) set({ syncStatus: "yellow" })
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
    // Удалённая KB-запись — есть что синхронизировать; .tmp-черновик — нет.
    if (f?.number) set({ syncStatus: "yellow" })
    set((s) => ({ files: s.files.filter((x) => x.id !== id) }))
    if (f) logWork(`удалён черновик ${f.number || ""}${f.number ? "/" : ""}${f.fileName}`)
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
    logWork(`создано уточнение ${file.number}/${file.fileName}`)
    return id
  },

  writeDictionary: async (name, values) => {
    const { base } = get()
    const content = serializeDictYaml(values)
    set((s) => ({ repoFiles: { ...s.repoFiles, [DICT_FILES[name]]: content }, syncStatus: "yellow" }))
    await invoke("write_file", { base, path: DICT_FILES[name], content })
    logWork(`справочник ${name} обновлён`)
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
      logWork(`синхронизация выполнена (${commitMessage})`)
      void get().refreshSyncState()
    } catch (e) {
      set({ syncing: false, syncStatus: "red", syncError: String(e) })
      logWork(`ошибка синхронизации: ${String(e)}`)
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

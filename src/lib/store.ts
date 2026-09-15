// Локальное хранилище приложения (zustand + persist в localStorage).
// В десктоп-версии (Tauri) файлы лежат в реальном репозитории;
// здесь эмулируются через виртуальную ФС repoFiles + localStorage.

"use client"

import { create } from "zustand"
import { persist } from "zustand/middleware"
import type {
  Frontmatter,
  Localization,
  RepoConfig,
  Settings,
  SyncStatus,
  View,
  DictName,
} from "./types"
import { TEMPLATE_BODY } from "./template"
import { formatAuthor } from "./frontmatter"
import {
  buildSeedRepoFiles,
  readTemplate,
  readConfig,
  serializeDictYaml,
  serializeConfig,
  tempFileName,
  CONFIG_PATH,
  DEFAULT_USER_CONFIG,
  DICT_FILES,
  TEMPLATE_PATH,
  type UserConfig,
} from "./repo"

function uid(prefix = "id"): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function now(): number {
  return Date.now()
}

// Фиксированные метки времени для seed-данных, чтобы рендер на сервере
// и на клиенте совпадал (иначе hydration-mismatch из-за Date.now()).
const DAY = 86400000
const HOUR = 3600000
const SEED_T = 1720000000000

const SEED_REPO_FILES = buildSeedRepoFiles()

// --- Seed-данные (две локализации по эталонному шаблону) -------------------

const SEED_FILES: Localization[] = [
  {
    id: "seed-1",
    number: "SPAS-0001",
    fileName: "localization.md",
    frontmatter: {
      number: "SPAS-0001",
      client: "Холдинг Т1",
      type: "Дефект",
      environment: "Прод",
      symptom:
        "При авторизации в веб-клиенте SPA возвращается ошибка 500, вход в систему невозможен.",
      product: ["SPAS-Web", "SPAS-Auth"],
      version: "LTS 2024.1 / auth:1.3.2",
      flaky: "Нет",
      scope: "Группа",
      root_cause: "Истечение срока действия ключа подписи JWT-токенов.",
      resolution: "Перевыпущены ключи подписи, сервис авторизации перезапущен.",
      related: ["SPAS-0099"],
      author: "Anatoly Artamonov <aartamonov@nota.tech>",
    },
    body: `## Шаги воспроизведения

1. Пользователь открывает веб-клиент SPA.
2. Вводит корпоративные логин и пароль.
3. Нажимает «Войти» — получаем HTTP 500.

## Документация

Согласно **Руководству администратора SPAS, раздел 4.2 «Аутентификация»**, срок действия ключа подписи JWT составляет **12 месяцев** с автоматическим перевыпуском за 7 дней до истечения. Описание процедуры ротации отсутствует — заведён дефект документации DOC-120.

## Локализация

В логах auth-сервиса зафиксирована ошибка \`signature is invalid\`. Проверка ключей показала, что текущий ключ истёк.

\`\`\`
ERROR  jwt.verify: signature is invalid
\`\`\`

Причина — истёкший ключ подписи.

## Варианты исправлений

1. Перевыпустить ключи подписи через конфигурационный скрипт.
2. Перезапустить auth-сервис.
3. Добавить мониторинг срока действия ключа (отдельная задача).
`,
    attachments: [],
    createdAt: SEED_T - DAY * 3,
    updatedAt: SEED_T - HOUR * 5,
    dirty: false,
  },
  {
    id: "seed-2",
    number: "SPAS-0002",
    fileName: "localization.md",
    frontmatter: {
      number: "SPAS-0002",
      client: "Холдинг Т1",
      type: "Консультация",
      environment: "Препрод",
      symptom: "Запрос: как настроить SSO через внешний IdP для prepod-контура.",
      product: ["SPAS-Auth"],
      version: "LTS 2024.1",
      flaky: "Нет",
      scope: "Единичное",
      root_cause: "",
      resolution: "Переданы параметры интеграции и ссылка на инструкцию.",
      related: [],
      author: "Anatoly Artamonov <aartamonov@nota.tech>",
    },
    body: `## Шаги воспроизведения

1. Заказчик запрашивает инструкцию по SSO.

## Документация

Раздел **SSO-интеграция** описывает поддерживаемые провайдеры (SAML 2.0, OIDC).

## Локализация

Переданы: client_id, redirect_uri, метаданные IdP.

## Варианты исправлений

Настроить OIDC-подключение на стороне IdP и завести заявку в команду развития для привязки.
`,
    attachments: [],
    createdAt: SEED_T - DAY * 2,
    updatedAt: SEED_T - HOUR * 2,
    dirty: false,
  },
]

const DEFAULT_SETTINGS: Settings = {
  setupComplete: true,
  offline: false,
}

// --- Store ---------------------------------------------------------------

interface State {
  files: Localization[]
  repoFiles: Record<string, string>
  settings: Settings
  view: View
  editing: { number: string | null; fileId: string | null }
  syncStatus: SyncStatus
  syncError: string | null
  syncing: boolean

  // навигация
  setView: (v: View) => void
  openFolder: (number: string) => void
  openFile: (fileId: string) => void
  closeEditor: () => void

  // файлы
  createDraft: () => string
  upsertFile: (file: Localization) => void
  patchFile: (id: string, patch: Partial<Localization>) => void
  removeFile: (id: string) => void
  removeFolderDrafts: (number: string) => void
  clarify: () => string | null

  // репозиторий (виртуальная ФС): справочники и шаблон
  writeDictionary: (name: DictName, values: string[]) => void
  writeTemplateFile: (content: string) => void

  // синхронизация
  sync: () => Promise<void>
  setOffline: (b: boolean) => void

  // настройки (UI-состояние — НЕ в репозитории)
  saveSettings: (patch: Partial<Settings>) => void
  // локальный конфиг .tmp/config.yaml (профиль + git-аутентификация) — НЕ в репозитории
  writeConfig: (config: UserConfig) => void
  completeSetup: (config: UserConfig) => void
}

export const useStore = create<State>()(
  persist(
    (set, get) => ({
      files: SEED_FILES,
      repoFiles: SEED_REPO_FILES,
      settings: DEFAULT_SETTINGS,
      view: "workspace",
      editing: { number: null, fileId: null },
      syncStatus: "green",
      syncError: null,
      syncing: false,

      setView: (v) => set({ view: v }),
      openFolder: (number) => {
        const files = get().files.filter((f) => f.number === number)
        const main = files.find((f) => f.fileName === "localization.md") ?? files[0]
        if (main) set({ view: "editor", editing: { number, fileId: main.id } })
      },
      openFile: (fileId) => {
        const f = get().files.find((x) => x.id === fileId)
        if (f) set({ view: "editor", editing: { number: f.number, fileId: f.id } })
      },
      closeEditor: () => set({ view: "workspace", editing: { number: null, fileId: null } }),

      createDraft: () => {
        const tpl = readTemplate(get().repoFiles)
        const cfg = readConfig(get().repoFiles)
        const author =
          formatAuthor(cfg.profile.name, cfg.profile.email) || tpl.frontmatter.author
        // Временный файл в .tmp: номер ещё не указан, счётчиков нет.
        const spaceCode = cfg.profile.spaceCode || "SPAS"
        const fm: Frontmatter = { ...tpl.frontmatter, number: `${spaceCode}-`, author }
        const id = uid("loc")
        const file: Localization = {
          id,
          number: "",
          fileName: tempFileName(),
          frontmatter: fm,
          body: tpl.body,
          attachments: [],
          createdAt: now(),
          updatedAt: now(),
          dirty: true,
        }
        set((s) => ({
          files: [...s.files, file],
          view: "editor",
          editing: { number: "", fileId: id },
          syncStatus: "yellow",
        }))
        return id
      },

      upsertFile: (file) =>
        set((s) => {
          const exists = s.files.some((f) => f.id === file.id)
          return {
            files: exists
              ? s.files.map((f) => (f.id === file.id ? file : f))
              : [...s.files, file],
            syncStatus: "yellow",
          }
        }),

      patchFile: (id, patch) =>
        set((s) => ({
          files: s.files.map((f) =>
            f.id === id ? { ...f, ...patch, updatedAt: now(), dirty: true } : f
          ),
          syncStatus: "yellow",
        })),

      removeFile: (id) =>
        set((s) => ({
          files: s.files.filter((f) => f.id !== id),
          syncStatus: "yellow",
        })),

      removeFolderDrafts: (number) =>
        set((s) => {
          const files = s.files.filter((f) => !(f.number === number && f.dirty))
          const hasDirty = files.some((f) => f.dirty)
          return {
            files,
            syncStatus: hasDirty ? "yellow" : "green",
            syncError: null,
          }
        }),

      clarify: () => {
        const { editing } = get()
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
        const id = uid("loc")
        const tpl = readTemplate(get().repoFiles)
        const file: Localization = {
          id,
          number: parent.number,
          fileName: `localization-${idx}.md`,
          parentId: parent.id,
          frontmatter: { ...parent.frontmatter },
          body: tpl.body,
          attachments: [],
          createdAt: now(),
          updatedAt: now(),
          dirty: true,
        }
        set((s) => ({
          files: [...s.files, file],
          editing: { number: parent.number, fileId: id },
          syncStatus: "yellow",
        }))
        return id
      },

      writeDictionary: (name, values) =>
        set((s) => ({
          repoFiles: {
            ...s.repoFiles,
            [DICT_FILES[name]]: serializeDictYaml(values),
          },
          syncStatus: "yellow",
        })),

      writeTemplateFile: (content) =>
        set((s) => ({
          repoFiles: { ...s.repoFiles, [TEMPLATE_PATH]: content },
          syncStatus: "yellow",
        })),

      sync: async () => {
        const { settings } = get()
        if (settings.offline) {
          set({ syncStatus: "yellow", syncError: "Автономный режим: отправка отложена." })
          return
        }
        set({ syncing: true, syncError: null })
        await new Promise((r) => setTimeout(r, 1100))
        set((s) => ({
          syncing: false,
          syncStatus: "green",
          syncError: null,
          files: s.files.map((f) => ({ ...f, dirty: false })),
        }))
      },

      setOffline: (b) =>
        set((s) => ({
          settings: { ...s.settings, offline: b },
          syncStatus: b ? "yellow" : s.syncStatus,
        })),

      saveSettings: (patch) =>
        set((s) => ({ settings: { ...s.settings, ...patch } })),

      writeConfig: (config) =>
        set((s) => ({
          repoFiles: { ...s.repoFiles, [CONFIG_PATH]: serializeConfig(config) },
          syncStatus: "yellow",
        })),

      completeSetup: (config) =>
        set((s) => ({
          repoFiles: { ...s.repoFiles, [CONFIG_PATH]: serializeConfig(config) },
          settings: { ...s.settings, setupComplete: true },
          view: "workspace",
        })),
    }),
    {
      name: "spas-kb-store",
      version: 4,
      migrate: (persisted, version) => {
        const s = (persisted as Record<string, unknown>) ?? {}
        if (version < 2 || !s.repoFiles) {
          s.repoFiles = buildSeedRepoFiles()
        }
        if (version < 3) {
          delete s.drafts
        }
        if (version < 4) {
          // профиль + git-аутентификацию переносим из settings в .tmp/config.yaml
          const settings = (s.settings as Record<string, unknown>) | undefined
          if (settings) {
            const profile = settings.profile as
              | { name?: string; email?: string; spaceCode?: string }
              | undefined
            const repo = settings.repo as RepoConfig | undefined
            if (profile || repo) {
              const cfg: UserConfig = {
                profile: {
                  name: profile?.name ?? "",
                  email: profile?.email ?? "",
                  spaceCode: profile?.spaceCode ?? "SPAS",
                },
                repo: repo ?? {
                  ...DEFAULT_USER_CONFIG.repo,
                  branches: [...DEFAULT_USER_CONFIG.repo.branches],
                },
              }
              const rf = (s.repoFiles as Record<string, string>) ?? {}
              rf[CONFIG_PATH] = serializeConfig(cfg)
              s.repoFiles = rf
            }
            s.settings = {
              setupComplete: settings.setupComplete === true,
              offline: settings.offline === true,
            }
          }
        }
        return s as unknown as State
      },
    }
  )
)

// --- Селекторы / хелперы --------------------------------------------------

export function selectFolders(files: Localization[]) {
  const map = new Map<string, Localization[]>()
  for (const f of files) {
    if (f.number === "") continue // временные черновики (.tmp) — отдельно
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

export { uid }

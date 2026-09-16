// Доменные типы приложения локализаций проблем SPAS.
// Справочники Type/Environment/Scope — настраиваемые строки (значения
// хранятся в .dictionary/*.yaml репозитория), поэтому это строки, а не объединения.

export type Type = string
export type Environment = string
export type Scope = string
export type Flaky = "Да" | "Нет"
export type AuthMethod = "https" | "ssh"

// Значения по умолчанию (используются для первичного наполнения .dictionary/*.yaml).
export const DEFAULT_TYPES: Type[] = ["Дефект", "Консультация", "Задача"]
export const DEFAULT_ENVIRONMENTS: Environment[] = ["Препрод", "Прод"]
export const DEFAULT_SCOPES: Scope[] = ["Единичное", "Группа", "Все"]
export const FLAKY_VALUES: Flaky[] = ["Да", "Нет"]

/**
 * Frontmatter точно по эталонному шаблону.
 * Порядок полей фиксируется сериализатором (lib/frontmatter.ts).
 */
export interface Frontmatter {
  number: string // SPAS-\d+
  client: string
  type: Type
  environment: Environment
  symptom: string // сериализуется как YAML block scalar |-
  product: string[] // YAML-массив
  version: string
  flaky: Flaky
  scope: Scope
  root_cause: string // допускается многострочность (block scalar при переносах)
  resolution: string // допускается многострочность
  related: string[] // YAML-массив номеров задач
  author: string // "ФИО <email>"
}

export interface Attachment {
  path: string
  name: string
  dataUrl: string
}

export interface Localization {
  id: string
  number: string
  fileName: string
  parentId?: string
  frontmatter: Frontmatter
  body: string
  attachments: Attachment[]
  createdAt: number
  updatedAt: number
  dirty: boolean
  /** Была ли локализация уже отправлена в Git (для commit-сообщения: Создана/Обновлена). */
  synced: boolean
}

export interface Profile {
  name: string
  email: string
}

export interface RepoConfig {
  url: string
  authMethod: AuthMethod
  httpsUser: string
  httpsToken: string
  sshKeyPath: string
  sshPassphrase: string
  branch: string
  branches: string[]
  localPath: string
  connected: boolean
}

/** Настраиваемые справочники (читаются из .dictionary/*.yaml). */
export interface Dictionaries {
  type: string[]
  client: string[]
  environment: string[]
  product: string[]
  scope: string[]
}

export type DictName = "type" | "client" | "environment" | "product" | "scope"

/**
 * Локальные настройки приложения (UI-состояние). НЕ в репозитории базы знаний.
 * Профиль и git-аутентификация хранятся отдельно — в .tmp/config.yaml (см. lib/repo.ts).
 */
export interface Settings {
  setupComplete: boolean
  offline: boolean
}

export type SyncStatus = "green" | "yellow" | "red"

export interface Draft {
  frontmatter: Frontmatter
  body: string
  attachments: Attachment[]
  savedAt: number
}

export type View = "workspace" | "editor" | "settings" | "setup"

// Виртуальная файловая система репозитория:
//  - .dictionary/<name>.yaml — настраиваемые справочники (база знаний, синхронизируются)
//  - _template/localization.md — эталонный шаблон (база знаний, синхронизируется)
//  - .tmp/ — gitignored: недооформленные черновики + ЛОКАЛЬНЫЙ конфиг (профиль, git-аутентификация)
// В десктоп-версии (Tauri) эти файлы лежат в реальном репозитории на диске;
// здесь эмулируются записями в persisted-сторе.

import { serializeDocument, parseFrontmatter } from "./frontmatter"
import { EMPTY_FRONTMATTER, TEMPLATE_BODY } from "./template"
import type { Dictionaries, DictName, Frontmatter, RepoConfig } from "./types"

export const DICT_FILES: Record<DictName, string> = {
  type: ".dictionary/type.yaml",
  client: ".dictionary/client.yaml",
  environment: ".dictionary/environment.yaml",
  product: ".dictionary/product.yaml",
  scope: ".dictionary/scope.yaml",
}

export const TEMPLATE_PATH = "_template/localization.md"
export const TMP_DIR = ".tmp"
export const GITIGNORE_PATH = ".gitignore"

/** Имя временного файла в .tmp (новая локализация до указания номера дефекта). */
export function tempFileName(): string {
  const rand = Math.random().toString(36).slice(2, 10)
  return `${TMP_DIR}/tmp-${rand}.md`
}

// --- Локальный конфиг (.tmp/config.yaml): профиль + git-аутентификация ----
// Не синхронизируется (.tmp в .gitignore) — личные данные пользователя.

export const CONFIG_PATH = `${TMP_DIR}/config.yaml`

export interface UserConfig {
  profile: { name: string; email: string; spaceCode: string }
  repo: RepoConfig
}

export const DEFAULT_USER_CONFIG: UserConfig = {
  profile: { name: "Anatoly Artamonov", email: "aartamonov@nota.tech", spaceCode: "SPAS" },
  repo: {
    url: "git@kb.example.ru:spas/knowledge-base.git",
    authMethod: "ssh",
    httpsUser: "",
    httpsToken: "",
    sshKeyPath: "~/.ssh/id_ed25519",
    sshPassphrase: "",
    branch: "main",
    branches: ["main", "develop"],
    localPath: "~/ids",
    connected: true,
  },
}

function cfgQuote(s: string): string {
  return '"' + s.replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"'
}

/** Значение для YAML-вывода: квотируем пустые и «опасные» строки, иначе plain. */
function cfgVal(s: string): string {
  if (s === "") return '""'
  if (/[:\s#"'{}\[\],&*!|>'"%@`]/.test(s) || /^[-?:]/.test(s)) return cfgQuote(s)
  return s
}

function cfgUnquote(s: string): string {
  const t = s.trim()
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    return t.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, "\\")
  }
  return t
}

export function serializeConfig(c: UserConfig): string {
  const L: string[] = []
  L.push("profile:")
  L.push(`  name: ${cfgVal(c.profile.name)}`)
  L.push(`  email: ${cfgVal(c.profile.email)}`)
  L.push(`  spaceCode: ${cfgVal(c.profile.spaceCode)}`)
  L.push("repo:")
  L.push(`  url: ${cfgVal(c.repo.url)}`)
  L.push(`  authMethod: ${c.repo.authMethod}`)
  L.push(`  httpsUser: ${cfgVal(c.repo.httpsUser)}`)
  L.push(`  httpsToken: ${cfgVal(c.repo.httpsToken)}`)
  L.push(`  sshKeyPath: ${cfgVal(c.repo.sshKeyPath)}`)
  L.push(`  sshPassphrase: ${cfgVal(c.repo.sshPassphrase)}`)
  L.push(`  branch: ${cfgVal(c.repo.branch)}`)
  L.push(`  branches: [${c.repo.branches.map(cfgVal).join(", ")}]`)
  L.push(`  localPath: ${cfgVal(c.repo.localPath)}`)
  L.push(`  connected: ${c.repo.connected ? "true" : "false"}`)
  return L.join("\n") + "\n"
}

export function readConfig(repoFiles: Record<string, string> | undefined): UserConfig {
  const cfg: UserConfig = {
    profile: { ...DEFAULT_USER_CONFIG.profile },
    repo: { ...DEFAULT_USER_CONFIG.repo, branches: [...DEFAULT_USER_CONFIG.repo.branches] },
  }
  const content = repoFiles?.[CONFIG_PATH]
  if (!content) return cfg
  let section: "profile" | "repo" | null = null
  for (const line of content.replace(/\r\n/g, "\n").split("\n")) {
    if (/^profile:\s*$/.test(line)) {
      section = "profile"
      continue
    }
    if (/^repo:\s*$/.test(line)) {
      section = "repo"
      continue
    }
    const m = /^\s{2}([a-zA-Z_]+):\s?(.*)$/.exec(line)
    if (!m || !section) continue
    const key = m[1]
    const val = m[2]
    if (section === "profile") {
      ;(cfg.profile as Record<string, string>)[key] = cfgUnquote(val)
    } else {
      if (key === "branches") {
        const t = val.trim()
        const inner = t.startsWith("[") && t.endsWith("]") ? t.slice(1, -1) : t
        cfg.repo.branches =
          inner.trim() === "" ? [] : inner.split(",").map((s) => cfgUnquote(s))
      } else if (key === "connected") {
        ;(cfg.repo as Record<string, unknown>)[key] = val.trim() === "true"
      } else {
        ;(cfg.repo as Record<string, unknown>)[key] = cfgUnquote(val)
      }
    }
  }
  if (cfg.repo.authMethod !== "https" && cfg.repo.authMethod !== "ssh") {
    cfg.repo.authMethod = "ssh"
  }
  return cfg
}

// --- Справочники (.dictionary/*.yaml) — база знаний, синхронизируются --------

export const DEFAULT_DICTIONARIES: Dictionaries = {
  type: ["Дефект", "Консультация", "Задача"],
  client: ["Холдинг Т1"],
  environment: ["Препрод", "Прод"],
  product: ["SPAS-Web", "SPAS-Auth", "SPAS-API", "SPAS-Reports"],
  scope: ["Единичное", "Группа", "Все"],
}

function unquote(s: string): string {
  const t = s.trim()
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    return t.slice(1, -1)
  }
  return t
}

export function parseDictYaml(content: string): string[] {
  const lines = content.replace(/\r\n/g, "\n").split("\n")
  const res: string[] = []
  for (const line of lines) {
    const m = /^\s*-\s?(.*)$/.exec(line)
    if (m) res.push(unquote(m[1]))
  }
  return res
}

function dictItem(v: string): string {
  if (v === "" || /[\s,:[\]{}#"'\\]/.test(v)) {
    return `"${v.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`
  }
  return v
}

export function serializeDictYaml(values: string[]): string {
  return "values:\n" + values.map((v) => `  - ${dictItem(v)}`).join("\n") + "\n"
}

export function readDictionary(
  repoFiles: Record<string, string> | undefined,
  name: DictName
): string[] {
  const content = repoFiles?.[DICT_FILES[name]]
  if (!content) return DEFAULT_DICTIONARIES[name]
  const parsed = parseDictYaml(content)
  return parsed.length > 0 ? parsed : DEFAULT_DICTIONARIES[name]
}

export function readDictionaries(
  repoFiles: Record<string, string> | undefined
): Dictionaries {
  if (!repoFiles) return { ...DEFAULT_DICTIONARIES }
  return {
    type: readDictionary(repoFiles, "type"),
    client: readDictionary(repoFiles, "client"),
    environment: readDictionary(repoFiles, "environment"),
    product: readDictionary(repoFiles, "product"),
    scope: readDictionary(repoFiles, "scope"),
  }
}

// --- Шаблон (_template/localization.md) — база знаний, синхронизируется ---------

export function readTemplate(
  repoFiles: Record<string, string> | undefined
): { frontmatter: Frontmatter; body: string } {
  const content = repoFiles?.[TEMPLATE_PATH]
  if (!content) {
    return { frontmatter: { ...EMPTY_FRONTMATTER }, body: TEMPLATE_BODY }
  }
  // Нормализуем CRLF → LF (Windows: git autocrlf / текстовые редакторы).
  const normalized = content.replace(/\r\n/g, "\n")
  const m = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(normalized)
  if (!m) {
    return { frontmatter: { ...EMPTY_FRONTMATTER }, body: normalized }
  }
  return {
    frontmatter: parseFrontmatter(m[1]),
    body: m[2].replace(/^\n+/, ""),
  }
}

// --- Первичное наполнение виртуального репозитория ----------------------

export function buildSeedRepoFiles(): Record<string, string> {
  const files: Record<string, string> = {}
  ;(Object.keys(DICT_FILES) as DictName[]).forEach((name) => {
    files[DICT_FILES[name]] = serializeDictYaml(DEFAULT_DICTIONARIES[name])
  })
  files[TEMPLATE_PATH] = serializeDocument(EMPTY_FRONTMATTER, TEMPLATE_BODY)
  files[GITIGNORE_PATH] = `${TMP_DIR}/\n`
  files[CONFIG_PATH] = serializeConfig(DEFAULT_USER_CONFIG)
  return files
}

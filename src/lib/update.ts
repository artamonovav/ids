// Проверка новой версии IDS: GitHub Releases API (CORS разрешён — fetch идёт
// прямо из WebView) + сравнение semver с версией приложения (getVersion()).
// Никаких токенов: публичный API, лимит 60 req/ч с IP — для периодической
// проверки достаточно. Автопроверка — один раз при запуске (store.init/AppShell).

export const REPO_SLUG = "artamonovav/ids"
export const RELEASES_PAGE = `https://github.com/${REPO_SLUG}/releases`
const LATEST_API = `https://api.github.com/repos/${REPO_SLUG}/releases/latest`

export interface UpdateInfo {
  /** Версия без «v», напр. "0.3.3". */
  latest: string
  /** Страница релиза (открывается через opener-плагин). */
  url: string
}

/** "v1.2.3" → [1, 2, 3]; некорректная строка → null. */
function semver(s: string): number[] | null {
  const m = /^v?(\d+)\.(\d+)\.(\d+)/.exec(s.trim())
  if (!m) return null
  return [parseInt(m[1], 10), parseInt(m[2], 10), parseInt(m[3], 10)]
}

export function isNewer(current: string, candidate: string): boolean {
  const a = semver(current)
  const b = semver(candidate)
  if (!a || !b) return false
  for (let i = 0; i < 3; i++) {
    if (b[i] !== a[i]) return b[i] > a[i]
  }
  return false
}

/** Последний релиз. null — обновление не требуется. Бросает при сетевой
 *  ошибке или не-200 (вызывающий решает: silent-автопроверка глушит). */
export async function fetchLatestRelease(
  currentVersion: string,
): Promise<UpdateInfo | null> {
  const res = await fetch(LATEST_API, {
    headers: { Accept: "application/vnd.github+json" },
  })
  if (!res.ok) throw new Error(`GitHub API: HTTP ${res.status}`)
  const data = (await res.json()) as { tag_name?: string; html_url?: string }
  const tag = data.tag_name ?? ""
  if (!tag || !isNewer(currentVersion, tag)) return null
  return { latest: tag.replace(/^v/, ""), url: data.html_url ?? RELEASES_PAGE }
}

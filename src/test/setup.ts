// Моки Tauri IPC и плагинов: компоненты не должны реально ходить в ФС/git.
// Конкретные команды мокаются в тестах через invokeMock.mockImplementation.
import { vi } from "vitest"
import type { ReactNode } from "react"

export const invokeMock = vi.fn(async (cmd: string, _args?: unknown) => {
  // Разумные значения по умолчанию, чтобы компоненты рендерились без крашей
  switch (cmd) {
    case "read_repo_files":
      return {}
    case "git_sync_state":
      return { uncommitted: 0, unpushed: 0, changedDirs: [] }
    case "read_localizations":
      return []
    case "read_app_config":
      return null
    case "is_git_repo":
      return false
    case "git_identity":
      return { name: "", email: "" }
    case "read_logs":
      return ""
    case "read_attachments":
      return []
    default:
      return null
  }
})

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (cmd: string, args?: unknown) => invokeMock(cmd, args),
}))

vi.mock("@tauri-apps/api/app", () => ({
  getVersion: vi.fn(async () => "0.3.5"),
}))

vi.mock("@tauri-apps/plugin-opener", () => ({
  openUrl: vi.fn(async () => undefined),
  openPath: vi.fn(async () => undefined),
}))

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn(async () => null),
  save: vi.fn(async () => null),
}))

vi.mock("@tauri-apps/plugin-clipboard-manager", () => ({
  readImage: vi.fn(),
}))

vi.mock("next-themes", () => ({
  useTheme: () => ({
    theme: "system",
    resolvedTheme: "light",
    setTheme: vi.fn(),
  }),
  ThemeProvider: ({ children }: { children: ReactNode }) => children,
}))

// Полифиллы jsdom
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
;(globalThis as unknown as Record<string, unknown>).ResizeObserver = ResizeObserverStub
;(globalThis as unknown as Record<string, unknown>).matchMedia = (query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addListener: vi.fn(),
  removeListener: vi.fn(),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  dispatchEvent: vi.fn(),
})

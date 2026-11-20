import { makeLocalization } from "./fixtures"
import { useStore, selectFolders } from "../lib/store"

// Наполнить store тестовыми данными (плоский список файлов).
export function seedStore(count = 3) {
  const files = Array.from({ length: count }, (_, i) =>
    makeLocalization(`SPAS-${String(i + 1).padStart(4, "0")}`, {
      dirty: i === 0,
      author: `Автор ${i}`,
      symptom: `Симптом номер ${i}`,
    })
  ).flat()
  useStore.setState({
    files,
    config: {
      ...useStore.getState().config,
      tableView: true,
      tuiMode: false,
      fontScale: 100,
      recentLimit: 3,
    },
    settings: { setupComplete: true, offline: false },
    base: "/tmp/kb",
    unsyncedExternal: [],
    syncStatus: "green",
    syncing: false,
  })
  return files
}

export function foldersOf() {
  return selectFolders(useStore.getState().files)
}

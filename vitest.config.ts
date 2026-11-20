import { defineConfig } from "vitest/config"
import react from "@vitejs/plugin-react"
import path from "path"

// Тесты регрессий UI: компоненты рендерим в jsdom с замоканным Tauri IPC.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    // CodeMirror/MarkdownEditor в jsdom нестабильны — карточку проверяем
    // структурными тестами logic-слоя, а не рендером.
    exclude: ["node_modules/**", "src-tauri/**"],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
})

import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import path from "node:path"

// Vite-конфиг для Tauri. Алиас @/ -> ./src (как в Next). Порт 1420 — для `tauri dev`.
export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
  clearScreen: false,
  server: { port: 1420, strictPort: true },
  build: { outDir: "dist", emptyOutDir: true },
})

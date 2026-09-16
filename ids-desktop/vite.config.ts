import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"
import path from "node:path"

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
  // Inline empty PostCSS config — tells Vite NOT to search the filesystem
  // for a postcss.config.* file. Without this, postcss-load-config walks up
  // from ids-desktop/src/ and finds the parent repo/postcss.config.mjs
  // (Next.js web app), whose `plugins: ["@tailwindcss/postcss"]` string
  // format is invalid for Vite's loader and breaks the Tauri build on
  // Windows CI. Tailwind v4 is handled by the @tailwindcss/vite plugin,
  // so no PostCSS plugins are needed here.
  css: { postcss: { plugins: [] } },
  clearScreen: false,
  server: { port: 1420, strictPort: true },
  build: { outDir: "dist", emptyOutDir: true },
})

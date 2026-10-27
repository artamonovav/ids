// SVG → PNG 1024 через @resvg/resvg-js (чистый Rust/WASM, без системных пакетов).
import { Resvg } from "@resvg/resvg-js"
import { readFileSync, writeFileSync, mkdirSync } from "node:fs"

mkdirSync("src-tauri/icons", { recursive: true })
const svg = readFileSync("public/logo.svg")
const r = new Resvg(svg, { fitTo: { mode: "width", value: 1024 } })
const png = r.render().asPng()
writeFileSync("src-tauri/icons/source.png", png)
console.log("source.png 1024 готов")

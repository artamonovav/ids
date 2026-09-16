// Local PostCSS config — prevents Vite/postcss-load-config from walking up
// to the parent repo/postcss.config.mjs (Next.js web app), whose
// `plugins: ["@tailwindcss/postcss"]` string format is invalid for Vite's
// loader and breaks the Tauri/Vite build on Windows CI with:
//   "Invalid PostCSS Plugin found at: plugins[0]".
//
// Tailwind v4 is handled by the @tailwindcss/vite plugin (see vite.config.ts),
// so no PostCSS plugins are needed here. An empty plugins array is the correct
// "stop searching here" marker.
module.exports = {
  plugins: [],
};

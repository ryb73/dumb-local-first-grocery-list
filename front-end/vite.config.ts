import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";
import solidPlugin from "vite-plugin-solid";

export default defineConfig({
  base: process.env[`VITE_BASE_PATH`] ?? `/`,
  build: {
    target: `esnext`,
  },
  optimizeDeps: {
    exclude: [`@sqlite.org/sqlite-wasm`, `sqlocal`],
  },
  plugins: [solidPlugin(), VitePWA({ registerType: `autoUpdate` })],
  server: {
    port: 3000,
    headers: {
      "Cross-Origin-Opener-Policy": `same-origin`,
      "Cross-Origin-Embedder-Policy": `require-corp`,
    },
  },
  worker: {
    format: `es`,
  },
});

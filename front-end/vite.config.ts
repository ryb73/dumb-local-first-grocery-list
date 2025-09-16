import { defineConfig } from "vite";
import solidPlugin from "vite-plugin-solid";

export default defineConfig({
  build: {
    target: `esnext`,
  },
  optimizeDeps: {
    exclude: [`@sqlite.org/sqlite-wasm`, `sqlocal`],
  },
  plugins: [solidPlugin()],
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

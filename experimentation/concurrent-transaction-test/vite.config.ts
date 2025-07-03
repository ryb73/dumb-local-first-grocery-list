import { defineConfig } from "vite";
import solidPlugin from "vite-plugin-solid";

export default defineConfig({
  plugins: [solidPlugin()],
  server: {
    port: 3001,
    headers: {
      "Cross-Origin-Opener-Policy": `same-origin`,
      "Cross-Origin-Embedder-Policy": `require-corp`,
    },
  },
  build: {
    target: `esnext`,
  },
  optimizeDeps: {
    exclude: [`@sqlite.org/sqlite-wasm`, `sqlocal`],
  },
});
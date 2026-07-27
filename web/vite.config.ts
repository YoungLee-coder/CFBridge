import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  root: import.meta.dirname,
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
      "@cfbridge/shared": path.resolve(import.meta.dirname, "../shared-types/index.ts"),
    },
  },
  build: {
    outDir: "../dist",
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      "/admin": "http://127.0.0.1:8787",
      "/v1": "http://127.0.0.1:8787",
      "/health": "http://127.0.0.1:8787",
      "/docs/api.md": "http://127.0.0.1:8787",
      "/llms.txt": "http://127.0.0.1:8787",
      "/llms-full.txt": "http://127.0.0.1:8787",
    },
  },
});

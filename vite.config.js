import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    rollupOptions: {
      input: {
        home: resolve(import.meta.dirname, "index.html"),
        property: resolve(import.meta.dirname, "imovel.html"),
        admin: resolve(import.meta.dirname, "admin.html"),
      },
    },
  },
});

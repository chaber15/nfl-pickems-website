import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

/** Port of the local functions server started by `npm run dev:api` (see scripts/dev.mjs). */
const FUNCTIONS_PORT = 9999;

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@shared": path.resolve(__dirname, "./shared"),
    },
  },
  server: {
    // Local dev only: forward /api/* to the functions server, like public/_redirects does in
    // production. Host is left unchanged so the API's same-origin check still passes.
    proxy: {
      "/api": {
        target: `http://localhost:${FUNCTIONS_PORT}`,
        rewrite: (p) => p.replace(/^\/api/, "/.netlify/functions/api"),
      },
    },
  },
});

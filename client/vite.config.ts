import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      // Proxy API calls to the local Worker during development so the
      // frontend and API share an origin (no CORS friction).
      "/api": "http://localhost:8787",
    },
  },
});
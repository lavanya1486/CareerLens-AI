import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// In development the SPA and API share one origin through this proxy, so the session and CSRF
// cookies work exactly as they do behind nginx in production.
const apiTarget = process.env.VITE_DEV_API_PROXY ?? "http://127.0.0.1:8082";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: "0.0.0.0",
    port: 5173,
    allowedHosts: true,
    proxy: { "/api": { target: apiTarget, changeOrigin: false } },
  },
  preview: {
    host: "0.0.0.0",
    port: 4173,
    allowedHosts: true,
    proxy: { "/api": { target: apiTarget, changeOrigin: false } },
  },
  build: {
    sourcemap: false,
    chunkSizeWarningLimit: 900,
  },
});

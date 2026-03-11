import path from "node:path";
import { fileURLToPath } from "node:url";
import { cloudflare } from "@cloudflare/vite-plugin";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
  plugins: [cloudflare(), react()],
  resolve: {
    alias: {
      "@app": path.resolve(__dirname, "src"),
      "@shared": path.resolve(__dirname, "shared"),
      "@worker": path.resolve(__dirname, "worker/src")
    }
  },
  server: {
    host: true,
    port: 5173
  },
  build: {
    target: "es2022",
    sourcemap: true
  }
});

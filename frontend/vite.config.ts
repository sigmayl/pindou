import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

const backend = process.env.VITE_DEV_BACKEND ?? "http://127.0.0.1:8000";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      "/api": {
        target: backend,
        changeOrigin: true,
      },
      "/healthz": {
        target: backend,
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "dist",
    sourcemap: false,
    target: "es2022",
    // three.js lives in its own lazily loaded chunk for the 3D preview.
    chunkSizeWarningLimit: 650,
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});

import path from "node:path";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { playerDataApiPlugin } from "./server/playerDataApiPlugin.mjs";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  return {
    server: {
      watch: {
        ignored: [
          "**/.git/**",
          "**/.local-web-player-data/**",
          "**/.npm-cache/**",
          "**/.superpowers/**",
          "**/.worktrees/**",
          "**/dist/**",
        ],
      },
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes("node_modules/react") || id.includes("node_modules/react-dom")) {
              return "vendor-react";
            }
            if (id.includes("node_modules/lucide-react")) {
              return "vendor-icons";
            }
            if (id.includes("node_modules/opencc-js")) {
              return "vendor-opencc";
            }
          },
        },
      },
    },
    plugins: [react(), playerDataApiPlugin({ projectRoot: __dirname, env })],
  };
});

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
    plugins: [react(), playerDataApiPlugin({ projectRoot: __dirname, env })],
  };
});

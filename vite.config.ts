import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { playerDataApiPlugin } from "./server/playerDataApiPlugin.mjs";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, ".", "");
  return {
    server: {
      watch: {
        ignored: [
          "**/.git/**",
          "**/.local-web-player-data/**",
          "**/.npm-cache/**",
          "**/dist/**",
        ],
      },
    },
    plugins: [react(), playerDataApiPlugin(env)],
  };
});

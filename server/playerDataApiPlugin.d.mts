import type { Plugin } from "vite";

export function playerDataApiPlugin(options: {
  projectRoot: string;
  env: Record<string, string>;
}): Plugin;

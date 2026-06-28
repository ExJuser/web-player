import { normalizeMediaRoots } from "./mediaRoots.mjs";

export const defaultAppConfig = { server: { port: 3001 }, media: { roots: [] } };

export function createPublicLocalConfig(config, tools, env = {}) {
  const roots = normalizeMediaRoots(config).map((root) => ({
    id: root.id,
    label: root.label,
    basename: root.basename,
    path: root.path,
    source: root.source,
    localPath: root.localPath,
  }));
  return {
    mediaRoots: roots,
    ffmpeg: tools,
    ai: {
      configured: Boolean(env.DEEPSEEK_API_KEY),
      model: env.DEEPSEEK_MODEL || "deepseek-chat",
    },
    bangumi: {
      configured: Boolean(env.BANGUMI_USER_AGENT && env.BANGUMI_ACCESS_TOKEN),
      proxyConfigured: Boolean(env.BANGUMI_LENS_PROXY),
    },
  };
}

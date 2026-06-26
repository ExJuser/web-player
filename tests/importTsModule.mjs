import * as esbuild from "esbuild";
import { fileURLToPath } from "node:url";

export async function importTsModule(fileUrl) {
  const bundled = await esbuild.build({
    bundle: true,
    entryPoints: [fileURLToPath(fileUrl)],
    format: "esm",
    platform: "browser",
    target: "es2022",
    write: false,
  });
  const encoded = Buffer.from(bundled.outputFiles[0].text, "utf8").toString("base64");
  return import(`data:text/javascript;base64,${encoded}`);
}

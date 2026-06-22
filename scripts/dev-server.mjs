import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const appConfigPath = path.join(rootDir, "config", "app.json");

function displayPath(filePath) {
  return path.relative(rootDir, filePath).replaceAll(path.sep, "/");
}

async function loadServerPort() {
  let rawConfig;

  try {
    rawConfig = await readFile(appConfigPath, "utf8");
  } catch (error) {
    throw new Error(`Cannot read ${displayPath(appConfigPath)}: ${error.message}`);
  }

  let config;
  try {
    config = JSON.parse(rawConfig);
  } catch (error) {
    throw new Error(`Invalid JSON in ${displayPath(appConfigPath)}: ${error.message}`);
  }

  const port = config?.server?.port;
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("config/app.json server.port must be an integer from 1 to 65535.");
  }

  return port;
}

function hasHostArg(args) {
  return args.some((arg) => arg === "--host" || arg.startsWith("--host="));
}

function hasPortArg(args) {
  return args.some((arg) => arg === "-p" || arg === "--port" || arg.startsWith("--port="));
}

function spawnNodeScript(scriptPath, args = []) {
  return spawn(process.execPath, [scriptPath, ...args], {
    cwd: rootDir,
    stdio: "inherit",
    windowsHide: false
  });
}

async function main() {
  const command = process.argv[2] || "dev";
  if (command === "print-port") {
    process.stdout.write(String(await loadServerPort()));
    return;
  }

  const viteCommands = new Set(["dev", "build", "preview"]);
  if (!viteCommands.has(command)) {
    throw new Error(`Unknown command: ${command}`);
  }

  const extraArgs = process.argv.slice(3);
  const args = [command, ...extraArgs];
  if ((command === "dev" || command === "preview") && !hasHostArg(extraArgs)) {
    args.push("--host", "127.0.0.1");
  }
  if ((command === "dev" || command === "preview") && !hasPortArg(extraArgs)) {
    args.push("--port", String(await loadServerPort()));
  }

  const children = [];
  const viteBin = path.join(rootDir, "node_modules", "vite", "bin", "vite.js");
  const viteChild = spawnNodeScript(viteBin, args);
  children.push(viteChild);

  if (command === "dev" || command === "preview") {
    const torrentServerBin = path.join(rootDir, "scripts", "torrent-stream-server.mjs");
    children.push(spawnNodeScript(torrentServerBin));
  }

  let isExiting = false;
  const stopChildren = (signal) => {
    for (const child of children) {
      if (!child.killed) child.kill(signal);
    }
  };

  for (const child of children) {
    child.on("exit", (code, signal) => {
      if (isExiting) return;
      isExiting = true;
      stopChildren(signal || "SIGTERM");
      if (signal) {
        process.kill(process.pid, signal);
        return;
      }
      process.exit(code ?? 0);
    });
  }

  process.on("SIGINT", () => {
    stopChildren("SIGINT");
  });
  process.on("SIGTERM", () => {
    stopChildren("SIGTERM");
  });
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});

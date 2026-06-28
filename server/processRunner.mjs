import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const defaultCwd = resolve(fileURLToPath(new URL("..", import.meta.url)));

export function runProcess(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd ?? defaultCwd,
      windowsHide: true,
      shell: false,
    });
    const stdout = [];
    const stderr = [];
    let stdoutSize = 0;
    const maxStdoutBytes = options.maxStdoutBytes ?? 10 * 1024 * 1024;
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(options.timeoutMessage || `${command} timed out.`));
    }, options.timeoutMs ?? 15000);
    child.stdout.on("data", (chunk) => {
      stdoutSize += chunk.length;
      if (stdoutSize > maxStdoutBytes) {
        child.kill("SIGKILL");
        reject(new Error(`${command} output is too large.`));
        return;
      }
      stdout.push(chunk);
    });
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve(Buffer.concat(stdout).toString("utf8"));
        return;
      }
      reject(new Error(Buffer.concat(stderr).toString("utf8").trim() || `${command} exited with ${code}.`));
    });
  });
}

export async function detectTools(runProcessImpl = runProcess) {
  const [ffmpeg, ffprobe] = await Promise.all([
    runProcessImpl("ffmpeg", ["-version"], { timeoutMs: 5000 }).then(() => true, () => false),
    runProcessImpl("ffprobe", ["-version"], { timeoutMs: 5000 }).then(() => true, () => false),
  ]);
  return { ffmpeg, ffprobe };
}

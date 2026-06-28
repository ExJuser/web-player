import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const defaultCwd = resolve(fileURLToPath(new URL("..", import.meta.url)));

export function runProcess(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const child = spawn(command, args, {
      cwd: options.cwd ?? defaultCwd,
      windowsHide: true,
      shell: false,
    });
    const stdout = [];
    const stderr = [];
    let stdoutSize = 0;
    const maxStdoutBytes = options.maxStdoutBytes ?? 10 * 1024 * 1024;
    const finishWithError = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    };
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      finishWithError(new Error(options.timeoutMessage || `${command} timed out.`));
    }, options.timeoutMs ?? 15000);
    const abortProcess = () => {
      child.kill("SIGTERM");
      finishWithError(new Error(options.abortMessage || `${command} aborted.`));
    };
    if (options.signal?.aborted) {
      abortProcess();
      return;
    }
    options.signal?.addEventListener("abort", abortProcess, { once: true });
    child.stdout.on("data", (chunk) => {
      stdoutSize += chunk.length;
      if (stdoutSize > maxStdoutBytes) {
        child.kill("SIGKILL");
        finishWithError(new Error(`${command} output is too large.`));
        return;
      }
      options.onStdout?.(chunk);
      stdout.push(chunk);
    });
    child.stderr.on("data", (chunk) => {
      options.onStderr?.(chunk);
      stderr.push(chunk);
    });
    child.on("error", (error) => {
      finishWithError(error);
    });
    child.on("close", (code) => {
      options.signal?.removeEventListener("abort", abortProcess);
      if (settled) return;
      settled = true;
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

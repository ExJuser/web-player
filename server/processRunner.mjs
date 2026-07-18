import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const defaultCwd = resolve(fileURLToPath(new URL("..", import.meta.url)));

function appendCapturedChunk(chunks, chunk, tailBytes) {
  if (!Number.isFinite(tailBytes)) {
    chunks.push(chunk);
    return;
  }
  const limit = Math.max(0, Math.floor(tailBytes));
  if (!limit) {
    chunks.length = 0;
    return;
  }
  const combined = Buffer.concat([...chunks, chunk]);
  chunks.length = 0;
  chunks.push(combined.length > limit ? combined.subarray(combined.length - limit) : combined);
}

export function terminateChildProcess(child, {
  killTree = false,
  platform = process.platform,
  spawnImpl = spawn,
} = {}) {
  if (!killTree || platform !== "win32" || !child.pid) {
    child.kill("SIGTERM");
    return Promise.resolve();
  }

  return new Promise((resolveTermination) => {
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      resolveTermination();
    };
    const taskkill = spawnImpl("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], {
      windowsHide: true,
      stdio: "ignore",
    });
    taskkill.once("error", () => {
      try {
        child.kill("SIGTERM");
      } catch {
        // The process may already have exited.
      }
      finish();
    });
    taskkill.once("close", finish);
  });
}

export function runProcess(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let terminating = false;
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
      if (timer) clearTimeout(timer);
      options.signal?.removeEventListener("abort", abortProcess);
      reject(error);
    };
    const terminateWithError = (error) => {
      if (settled || terminating) return;
      terminating = true;
      if (timer) clearTimeout(timer);
      void terminateChildProcess(child, { killTree: options.killTree }).finally(() => finishWithError(error));
    };
    const abortProcess = () => {
      terminateWithError(new Error(options.abortMessage || `${command} aborted.`));
    };
    const timeoutMs = options.timeoutMs ?? 15000;
    const timer = timeoutMs > 0
      ? setTimeout(() => terminateWithError(new Error(options.timeoutMessage || `${command} timed out.`)), timeoutMs)
      : null;
    if (options.signal?.aborted) {
      abortProcess();
      return;
    }
    options.signal?.addEventListener("abort", abortProcess, { once: true });
    child.stdout.on("data", (chunk) => {
      stdoutSize += chunk.length;
      if (stdoutSize > maxStdoutBytes) {
        terminateWithError(new Error(`${command} output is too large.`));
        return;
      }
      options.onStdout?.(chunk);
      stdout.push(chunk);
    });
    child.stderr.on("data", (chunk) => {
      options.onStderr?.(chunk);
      appendCapturedChunk(stderr, chunk, options.stderrTailBytes ?? Number.POSITIVE_INFINITY);
    });
    child.on("error", (error) => {
      finishWithError(error);
    });
    child.on("close", (code) => {
      options.signal?.removeEventListener("abort", abortProcess);
      if (settled || terminating) return;
      settled = true;
      if (timer) clearTimeout(timer);
      if (code === 0) {
        resolve(Buffer.concat(stdout).toString("utf8"));
        return;
      }
      const stderrMessage = Buffer.concat(stderr).toString("utf8").trim();
      const stdoutMessage = options.includeStdoutOnError ? Buffer.concat(stdout).toString("utf8").trim() : "";
      reject(new Error(stderrMessage || stdoutMessage || `${command} exited with ${code}.`));
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

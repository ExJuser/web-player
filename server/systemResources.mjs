import { execFile } from "node:child_process";
import os from "node:os";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

let previousSample = null;
let pendingSample = null;

function createCurrentProcessSample() {
  const memory = process.memoryUsage();
  const cpu = process.cpuUsage();
  return {
    workingSetBytes: memory.rss,
    privateBytes: memory.rss,
    cpuSeconds: (cpu.user + cpu.system) / 1_000_000,
    processCount: 1,
    scope: "server",
  };
}

async function collectRawSample() {
  if (process.platform !== "win32") return createCurrentProcessSample();

  try {
    const wmicPath = `${process.env.SystemRoot || "C:\\Windows"}\\System32\\Wbem\\WMIC.exe`;
    const { stdout } = await execFileAsync(
      wmicPath,
      [
        "path",
        "Win32_Process",
        "get",
        "KernelModeTime,Name,PageFileUsage,ParentProcessId,ProcessId,UserModeTime,WorkingSetSize",
        "/format:csv",
      ],
      { encoding: "utf8", timeout: 4_000, windowsHide: true, maxBuffer: 512 * 1024 },
    );
    const lines = stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const headers = lines[0].split(",");
    const processes = lines.slice(1).map((line) => {
      const values = line.split(",");
      return Object.fromEntries(headers.map((header, index) => [header, values[index]]));
    });
    const byParentId = new Map();
    const byId = new Map();
    for (const item of processes) {
      const processId = Number(item.ProcessId);
      const parentProcessId = Number(item.ParentProcessId);
      if (!Number.isFinite(processId) || item.Name?.toLowerCase() === "wmic.exe") continue;
      byId.set(processId, item);
      const children = byParentId.get(parentProcessId) ?? [];
      children.push(processId);
      byParentId.set(parentProcessId, children);
    }
    if (!byId.has(process.pid)) throw new Error("Current process not found in resource snapshot.");

    const queue = [process.pid];
    const visited = new Set();
    let workingSetBytes = 0;
    let privateBytes = 0;
    let cpuSeconds = 0;
    while (queue.length > 0) {
      const processId = queue.shift();
      if (visited.has(processId)) continue;
      visited.add(processId);
      const item = byId.get(processId);
      if (item) {
        workingSetBytes += Number(item.WorkingSetSize) || 0;
        privateBytes += (Number(item.PageFileUsage) || 0) * 1024;
        cpuSeconds += ((Number(item.KernelModeTime) || 0) + (Number(item.UserModeTime) || 0)) / 10_000_000;
      }
      queue.push(...(byParentId.get(processId) ?? []));
    }

    return { workingSetBytes, privateBytes, cpuSeconds, processCount: visited.size, scope: "project" };
  } catch {
    return createCurrentProcessSample();
  }
}

export async function createSystemResourceStatus() {
  pendingSample ??= collectRawSample().finally(() => {
    pendingSample = null;
  });

  const rawSample = await pendingSample;
  const sampledAt = Date.now();
  const processorCount = Math.max(1, os.cpus().length);
  let cpuPercent = null;

  if (previousSample && rawSample.scope === previousSample.scope) {
    const elapsedSeconds = (sampledAt - previousSample.sampledAt) / 1_000;
    const cpuSeconds = Math.max(0, rawSample.cpuSeconds - previousSample.cpuSeconds);
    if (elapsedSeconds > 0) {
      cpuPercent = Math.min(100, (cpuSeconds / elapsedSeconds / processorCount) * 100);
    }
  }

  previousSample = { sampledAt, cpuSeconds: rawSample.cpuSeconds, scope: rawSample.scope };
  return {
    workingSetBytes: rawSample.workingSetBytes,
    privateBytes: rawSample.privateBytes,
    processCount: rawSample.processCount,
    cpuPercent,
    sampledAt,
    scope: rawSample.scope,
  };
}

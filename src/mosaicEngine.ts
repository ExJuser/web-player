import type { MosaicComputeBackend, MosaicFeatureDescriptor } from "./mosaicTypes";

export const mosaicDescriptorVersion = 1 as const;
export const mosaicCandidateCount = 4;

export function createMosaicSignature(input: { size: number; lastModified: number }) {
  return `${mosaicDescriptorVersion}:${input.size}:${input.lastModified}`;
}

export function rgbToLab(red: number, green: number, blue: number) {
  const linear = [red, green, blue].map((value) => {
    const channel = Math.max(0, Math.min(255, value)) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  const x = (linear[0] * 0.4124 + linear[1] * 0.3576 + linear[2] * 0.1805) / 0.95047;
  const y = linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
  const z = (linear[0] * 0.0193 + linear[1] * 0.1192 + linear[2] * 0.9505) / 1.08883;
  const curve = (value: number) => value > 0.008856 ? Math.cbrt(value) : 7.787 * value + 16 / 116;
  const fx = curve(x);
  const fy = curve(y);
  const fz = curve(z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

function quantizeLab(rgb: readonly number[]) {
  const [lightness, a, b] = rgbToLab(rgb[0] ?? 0, rgb[1] ?? 0, rgb[2] ?? 0);
  return [lightness * 2.55, a + 128, b + 128].map((value) => Math.max(0, Math.min(255, Math.round(value))));
}

export function quantizeMosaicDescriptor(
  r: number,
  g: number,
  b: number,
  contrast: number,
  regions: readonly (readonly number[])[] = [],
) {
  const base = quantizeLab([r, g, b]);
  const regionValues = Array.from({ length: 9 }, (_, index) => quantizeLab(regions[index] ?? [r, g, b])).flat();
  return [...base, Math.max(0, Math.min(255, Math.round(contrast))), ...regionValues, 0];
}

export function descriptorDistance(left: readonly number[], right: readonly number[]) {
  const dr = (left[0] ?? 0) - (right[0] ?? 0);
  const dg = (left[1] ?? 0) - (right[1] ?? 0);
  const db = (left[2] ?? 0) - (right[2] ?? 0);
  const dc = ((left[3] ?? 0) - (right[3] ?? 0)) * 0.35;
  let distance = dr * dr * 0.5 + dg * dg * 0.25 + db * db * 0.25 + dc * dc;
  for (let index = 4; index < 31; index++) {
    const delta = (left[index] ?? left[(index - 4) % 3] ?? 0) - (right[index] ?? right[(index - 4) % 3] ?? 0);
    distance += delta * delta / 54;
  }
  return distance;
}

export function findCpuCandidates(
  targets: readonly (readonly number[])[],
  sources: readonly MosaicFeatureDescriptor[],
  count = mosaicCandidateCount,
) {
  return targets.map((target) => {
    const best: Array<{ index: number; distance: number }> = [];
    sources.forEach((source, index) => {
      const candidate = { index, distance: descriptorDistance(target, source.values) };
      const insertAt = best.findIndex((current) => candidate.distance < current.distance
        || (candidate.distance === current.distance && candidate.index < current.index));
      if (insertAt >= 0) best.splice(insertAt, 0, candidate);
      else if (best.length < count) best.push(candidate);
      if (best.length > count) best.pop();
    });
    return best.map((candidate) => candidate.index);
  });
}

function seededUnit(seed: number, index: number) {
  let value = (seed ^ Math.imul(index + 1, 0x9e3779b1)) >>> 0;
  value ^= value << 13;
  value ^= value >>> 17;
  value ^= value << 5;
  return (value >>> 0) / 0x100000000;
}

function getMosaicNeighborAssignments(assignments: readonly number[], cellIndex: number, columns: number) {
  return {
    left: cellIndex % columns ? assignments[cellIndex - 1] : -1,
    above: cellIndex >= columns ? assignments[cellIndex - columns] : -1,
  };
}

function createMosaicAssignmentPool(input: {
  candidates: readonly number[];
  sourceCount: number;
  counts: ReadonlyMap<number, number>;
  left?: number;
  above?: number;
  maxReuse: number;
}) {
  const canUse = (sourceIndex: number) => sourceIndex >= 0 && (input.counts.get(sourceIndex) ?? 0) < input.maxReuse;
  const available = input.candidates.filter(
    (sourceIndex) => canUse(sourceIndex) && sourceIndex !== input.left && sourceIndex !== input.above,
  );
  if (available.length) return available;

  const globalFallback = Array.from({ length: input.sourceCount }, (_, sourceIndex) => sourceIndex)
    .filter((sourceIndex) => sourceIndex !== input.left && sourceIndex !== input.above && canUse(sourceIndex))
    .sort((leftIndex, rightIndex) => (input.counts.get(leftIndex) ?? 0) - (input.counts.get(rightIndex) ?? 0))
    .slice(0, mosaicCandidateCount);
  return globalFallback.length ? globalFallback : input.candidates.filter(canUse);
}

function applyGuaranteedMosaicAssignment(input: {
  assignments: number[];
  sourceIds: readonly string[];
  columns: number;
  guaranteedSourceId?: string;
}) {
  if (!input.guaranteedSourceId) return;
  const guaranteedIndex = input.sourceIds.indexOf(input.guaranteedSourceId);
  if (guaranteedIndex < 0 || input.assignments.includes(guaranteedIndex) || !input.assignments.length) return;

  const replaceIndex = input.assignments.findIndex((assignment, index) => {
    const { left, above } = getMosaicNeighborAssignments(input.assignments, index, input.columns);
    return assignment !== guaranteedIndex && left !== guaranteedIndex && above !== guaranteedIndex;
  });
  input.assignments[Math.max(replaceIndex, 0)] = guaranteedIndex;
}

export function finalizeMosaicAssignments(input: {
  candidates: readonly (readonly number[])[];
  sourceIds: readonly string[];
  columns: number;
  maxReuse: number;
  seed: number;
  guaranteedSourceId?: string;
}) {
  const counts = new Map<number, number>();
  const assignments: number[] = [];
  input.candidates.forEach((candidates, cellIndex) => {
    const { left, above } = getMosaicNeighborAssignments(assignments, cellIndex, input.columns);
    const pool = createMosaicAssignmentPool({
      candidates,
      sourceCount: input.sourceIds.length,
      counts,
      left,
      above,
      maxReuse: input.maxReuse,
    });
    const choice = pool.length ? pool[Math.floor(seededUnit(input.seed, cellIndex) * pool.length)] : -1;
    assignments.push(choice);
    if (choice >= 0) counts.set(choice, (counts.get(choice) ?? 0) + 1);
  });

  applyGuaranteedMosaicAssignment({
    assignments,
    sourceIds: input.sourceIds,
    columns: input.columns,
    guaranteedSourceId: input.guaranteedSourceId,
  });

  return assignments.map((sourceIndex) => input.sourceIds[sourceIndex] ?? "");
}

const webGpuShader = /* wgsl */ `
@group(0) @binding(0) var<storage, read> targets: array<vec4<f32>>;
@group(0) @binding(1) var<storage, read> sources: array<vec4<f32>>;
@group(0) @binding(2) var<storage, read_write> output: array<u32>;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
  let targetIndex = id.x;
  let targetCount = arrayLength(&targets) / 8u;
  if (targetIndex >= targetCount) { return; }
  var bestDistance = array<f32, 4>(1e30, 1e30, 1e30, 1e30);
  var bestIndex = array<u32, 4>(0xffffffffu, 0xffffffffu, 0xffffffffu, 0xffffffffu);
  let sourceCount = arrayLength(&sources) / 8u;
  for (var sourceIndex = 0u; sourceIndex < sourceCount; sourceIndex++) {
    let baseDelta = targets[targetIndex * 8u] - sources[sourceIndex * 8u];
    var distance = baseDelta.x * baseDelta.x * 0.5 + baseDelta.y * baseDelta.y * 0.25 + baseDelta.z * baseDelta.z * 0.25 + baseDelta.w * baseDelta.w * 0.1225;
    for (var chunk = 1u; chunk < 8u; chunk++) {
      let localDelta = targets[targetIndex * 8u + chunk] - sources[sourceIndex * 8u + chunk];
      distance += dot(localDelta, localDelta) / 54.0;
    }
    if (distance < bestDistance[3]) {
      var slot = 3u;
      loop {
        if (slot == 0u || distance >= bestDistance[slot - 1u]) { break; }
        bestDistance[slot] = bestDistance[slot - 1u];
        bestIndex[slot] = bestIndex[slot - 1u];
        slot--;
      }
      bestDistance[slot] = distance;
      bestIndex[slot] = sourceIndex;
    }
  }
  for (var index = 0u; index < 4u; index++) {
    output[targetIndex * 4u + index] = bestIndex[index];
  }
}`;

function normalizeMosaicGpuValues(values: readonly number[]) {
  return Array.from({ length: 32 }, (_, index) => values[index] ?? 0);
}

function createMosaicGpuResources(
  device: any,
  targets: readonly (readonly number[])[],
  sources: readonly MosaicFeatureDescriptor[],
) {
  const targetValues = new Float32Array(targets.flatMap(normalizeMosaicGpuValues));
  const sourceValues = new Float32Array(sources.flatMap((source) => normalizeMosaicGpuValues(source.values)));
  const outputBytes = targets.length * mosaicCandidateCount * Uint32Array.BYTES_PER_ELEMENT;
  const usage = (globalThis as any).GPUBufferUsage;
  const targetBuffer = device.createBuffer({ size: targetValues.byteLength, usage: usage.STORAGE | usage.COPY_DST });
  const sourceBuffer = device.createBuffer({ size: sourceValues.byteLength, usage: usage.STORAGE | usage.COPY_DST });
  const outputBuffer = device.createBuffer({ size: outputBytes, usage: usage.STORAGE | usage.COPY_SRC });
  const readBuffer = device.createBuffer({ size: outputBytes, usage: usage.COPY_DST | usage.MAP_READ });
  device.queue.writeBuffer(targetBuffer, 0, targetValues);
  device.queue.writeBuffer(sourceBuffer, 0, sourceValues);
  return { targetBuffer, sourceBuffer, outputBuffer, readBuffer, outputBytes };
}

function dispatchMosaicGpuSearch(
  device: any,
  resources: ReturnType<typeof createMosaicGpuResources>,
  targetCount: number,
) {
  const module = device.createShaderModule({ code: webGpuShader });
  const pipeline = device.createComputePipeline({ layout: "auto", compute: { module, entryPoint: "main" } });
  const bindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: resources.targetBuffer } },
      { binding: 1, resource: { buffer: resources.sourceBuffer } },
      { binding: 2, resource: { buffer: resources.outputBuffer } },
    ],
  });
  const encoder = device.createCommandEncoder();
  const pass = encoder.beginComputePass();
  pass.setPipeline(pipeline);
  pass.setBindGroup(0, bindGroup);
  pass.dispatchWorkgroups(Math.ceil(targetCount / 64));
  pass.end();
  encoder.copyBufferToBuffer(resources.outputBuffer, 0, resources.readBuffer, 0, resources.outputBytes);
  device.queue.submit([encoder.finish()]);
}

async function readMosaicGpuCandidates(readBuffer: any, targetCount: number) {
  await readBuffer.mapAsync((globalThis as any).GPUMapMode.READ);
  const values = new Uint32Array(readBuffer.getMappedRange().slice(0));
  const candidates = Array.from({ length: targetCount }, (_, index) => Array.from(
    values.slice(index * mosaicCandidateCount, (index + 1) * mosaicCandidateCount),
  ).filter((value) => value !== 0xffffffff));
  readBuffer.unmap();
  return candidates;
}

function destroyMosaicGpuResources(resources: ReturnType<typeof createMosaicGpuResources>) {
  [resources.targetBuffer, resources.sourceBuffer, resources.outputBuffer, resources.readBuffer]
    .forEach((buffer) => buffer.destroy());
}

export async function findGpuCandidates(
  targets: readonly (readonly number[])[],
  sources: readonly MosaicFeatureDescriptor[],
): Promise<{ backend: MosaicComputeBackend; candidates?: number[][] }> {
  const gpu = (navigator as Navigator & { gpu?: any }).gpu;
  if (!gpu || !targets.length || !sources.length) {
    return { backend: "worker" };
  }
  let device: any;
  try {
    const adapter = await gpu.requestAdapter({ powerPreference: "high-performance" });
    device = await adapter?.requestDevice();
    if (!device) throw new Error("WebGPU adapter unavailable");
    const resources = createMosaicGpuResources(device, targets, sources);
    dispatchMosaicGpuSearch(device, resources, targets.length);
    const candidates = await readMosaicGpuCandidates(resources.readBuffer, targets.length);
    destroyMosaicGpuResources(resources);
    return { backend: "webgpu", candidates };
  } catch {
    device?.destroy?.();
    return { backend: "worker" };
  }
}

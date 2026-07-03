export function readUint64(data: DataView, offset: number) {
  const high = data.getUint32(offset);
  const low = data.getUint32(offset + 4);
  return high * 2 ** 32 + low;
}

export function parseMp4MovieDuration(buffer: ArrayBuffer) {
  const data = new DataView(buffer);
  let offset = 8;

  while (offset + 8 <= data.byteLength) {
    const size = data.getUint32(offset);
    const type = String.fromCharCode(
      data.getUint8(offset + 4),
      data.getUint8(offset + 5),
      data.getUint8(offset + 6),
      data.getUint8(offset + 7),
    );
    const headerSize = size === 1 ? 16 : 8;
    const boxSize = size === 1 ? readUint64(data, offset + 8) : size;
    if (boxSize < headerSize || offset + boxSize > data.byteLength) break;

    if (type === "mvhd") {
      const version = data.getUint8(offset + headerSize);
      const timescaleOffset = offset + headerSize + (version === 1 ? 20 : 12);
      const durationOffset = timescaleOffset + 4;
      if (durationOffset + (version === 1 ? 8 : 4) > offset + boxSize) return undefined;
      const timescale = data.getUint32(timescaleOffset);
      const duration = version === 1 ? readUint64(data, durationOffset) : data.getUint32(durationOffset);
      return timescale > 0 && duration > 0 ? duration / timescale : undefined;
    }

    offset += boxSize;
  }

  return undefined;
}

export function selectTrustedDuration(candidates: Array<number | undefined>) {
  const durations = candidates.filter((value): value is number => typeof value === "number" && Number.isFinite(value) && value > 0);
  if (!durations.length) return undefined;
  return Math.min(...durations);
}

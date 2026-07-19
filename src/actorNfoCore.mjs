export const maxActorNfoBytes = 2 * 1024 * 1024;
export const maxActorsPerVideo = 100;
export const maxActorNameLength = 120;

const namedEntities = {
  amp: "&",
  apos: "'",
  gt: ">",
  lt: "<",
  quot: '"',
};

export function normalizeActorKey(value) {
  return String(value ?? "").normalize("NFKC").replace(/\s+/gu, " ").trim().toLowerCase();
}

function decodeXmlEntities(value) {
  return value.replace(/&(#x[\da-f]+|#\d+|amp|apos|gt|lt|quot);/giu, (match, entity) => {
    const normalized = entity.toLowerCase();
    if (normalized.startsWith("#x")) {
      const codePoint = Number.parseInt(normalized.slice(2), 16);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match;
    }
    if (normalized.startsWith("#")) {
      const codePoint = Number.parseInt(normalized.slice(1), 10);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match;
    }
    return namedEntities[normalized] ?? match;
  });
}

function readElementText(block, elementName) {
  const match = block.match(new RegExp(`<${elementName}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${elementName}\\s*>`, "iu"));
  if (!match) return "";
  return decodeXmlEntities(match[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/giu, "$1").replace(/<[^>]+>/gu, ""))
    .normalize("NFKC")
    .replace(/\s+/gu, " ")
    .trim();
}

function decodeNfoBytes(bytes) {
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder("utf-16le").decode(bytes.subarray(2));
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    const swapped = new Uint8Array(bytes.length - 2);
    for (let index = 2; index + 1 < bytes.length; index += 2) {
      swapped[index - 2] = bytes[index + 1];
      swapped[index - 1] = bytes[index];
    }
    return new TextDecoder("utf-16le").decode(swapped);
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
}

export function parseActorNfoBytes(input, fileName = "") {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input ?? 0);
  if (bytes.byteLength > maxActorNfoBytes) {
    return { fileName, names: [], status: "tooLarge" };
  }

  const xml = decodeNfoBytes(bytes).replace(/^\uFEFF/u, "");
  if (!xml.trim() || /<!DOCTYPE|<!ENTITY/iu.test(xml)) {
    return { fileName, names: [], status: "invalid" };
  }

  const blocks = Array.from(xml.matchAll(/<actor(?:\s[^>]*)?>([\s\S]*?)<\/actor\s*>/giu));
  if (!blocks.length) {
    return {
      fileName,
      names: [],
      status: /<actor(?:\s|>)/iu.test(xml) ? "invalid" : "noActors",
    };
  }

  const names = [];
  const seen = new Set();
  for (const block of blocks) {
    const type = readElementText(block[1], "type");
    if (type && type.toLocaleLowerCase() !== "actor") continue;
    const name = readElementText(block[1], "name");
    const key = normalizeActorKey(name);
    if (!key || name.length > maxActorNameLength || seen.has(key)) continue;
    seen.add(key);
    names.push(name);
    if (names.length >= maxActorsPerVideo) break;
  }

  return { fileName, names, status: names.length ? "parsed" : "noActors" };
}

function normalizeFileStem(fileName) {
  const dotIndex = fileName.lastIndexOf(".");
  return (dotIndex > 0 ? fileName.slice(0, dotIndex) : fileName).normalize("NFKC").toLowerCase();
}

export function createMatchingNfoNameLookup(entryNames) {
  const nfoNameByStem = new Map();
  entryNames.forEach((name) => {
    const extensionIndex = name.lastIndexOf(".");
    if (extensionIndex <= 0 || name.slice(extensionIndex).toLowerCase() !== ".nfo") return;
    const stem = normalizeFileStem(name);
    if (!nfoNameByStem.has(stem)) nfoNameByStem.set(stem, name);
  });
  return (videoName) => nfoNameByStem.get(normalizeFileStem(videoName)) ?? null;
}

export function findMatchingNfoName(videoName, entryNames) {
  return createMatchingNfoNameLookup(entryNames)(videoName);
}

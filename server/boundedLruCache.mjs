export class BoundedLruCache {
  constructor({ maxEntries = 8, maxBytes = 16 * 1024 * 1024 } = {}) {
    this.maxEntries = maxEntries;
    this.maxBytes = maxBytes;
    this.entries = new Map();
    this.totalBytes = 0;
  }

  get(key) {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.value;
  }

  set(key, value, bytes = 0) {
    this.invalidate(key);
    const normalizedBytes = Math.max(0, Number(bytes) || 0);
    if (normalizedBytes > this.maxBytes) return false;
    this.entries.set(key, { value, bytes: normalizedBytes });
    this.totalBytes += normalizedBytes;
    this.prune();
    return this.entries.has(key);
  }

  invalidate(key) {
    const entry = this.entries.get(key);
    if (!entry) return false;
    this.entries.delete(key);
    this.totalBytes -= entry.bytes;
    return true;
  }

  clear() {
    this.entries.clear();
    this.totalBytes = 0;
  }

  stats() {
    return { entries: this.entries.size, bytes: this.totalBytes };
  }

  prune() {
    while (this.entries.size > this.maxEntries || this.totalBytes > this.maxBytes) {
      const oldestKey = this.entries.keys().next().value;
      if (oldestKey === undefined) break;
      this.invalidate(oldestKey);
    }
  }
}

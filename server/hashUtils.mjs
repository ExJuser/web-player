import { createHash } from "node:crypto";

export function hashValue(value) {
  return createHash("sha256").update(value).digest("hex");
}

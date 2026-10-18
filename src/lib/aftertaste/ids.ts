import { createHash, randomBytes } from "node:crypto";

export function newId(prefix: string) {
  return `${prefix}_${randomBytes(9).toString("base64url")}`;
}

export function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

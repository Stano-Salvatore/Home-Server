import crypto from "node:crypto";

export function sha1(content: string | Buffer): string {
  return crypto.createHash("sha1").update(content).digest("hex");
}

export function newId(prefix?: string): string {
  const id = crypto.randomUUID();
  return prefix ? `${prefix}_${id}` : id;
}

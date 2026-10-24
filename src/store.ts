import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import { database } from "./graph.js";
import { ScoutError } from "./domain.js";
function key() {
  const raw = process.env.SCOUT_ENCRYPTION_KEY;
  if (!raw || !/^[a-f0-9]{64}$/i.test(raw))
    throw new ScoutError(
      "storage_not_configured",
      "Private storage is not configured.",
    );
  return Buffer.from(raw, "hex");
}
function seal(value: unknown) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const body = Buffer.concat([
    cipher.update(JSON.stringify(value), "utf8"),
    cipher.final(),
  ]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64");
}
function open<T>(raw: string): T {
  const b = Buffer.from(raw, "base64");
  const decipher = createDecipheriv("aes-256-gcm", key(), b.subarray(0, 12));
  decipher.setAuthTag(b.subarray(12, 28));
  return JSON.parse(
    Buffer.concat([decipher.update(b.subarray(28)), decipher.final()]).toString(
      "utf8",
    ),
  );
}
export async function read<T>(id: string): Promise<T | undefined> {
  const db = await database();
  try {
    const r = await db
      .selectGraph("scout_private_state")
      .roQuery<{
        value: string;
      }>("MATCH (r:Record {id:$id}) WHERE r.expires > $now RETURN r.value AS value", { params: { id, now: Date.now() }, TIMEOUT: 3000 });
    return r.data?.[0]?.value ? open<T>(r.data[0].value) : undefined;
  } catch (e) {
    if (
      e instanceof Error &&
      /empty key|does not exist|not found/i.test(e.message)
    )
      return undefined;
    throw e;
  } finally {
    await db.close().catch(() => {});
  }
}
export async function write(id: string, value: unknown, ttlMs = 86400000) {
  const db = await database();
  try {
    await db
      .selectGraph("scout_private_state")
      .query(
        "MERGE (r:Record {id:$id}) SET r.value=$value, r.expires=$expires",
        {
          params: { id, value: seal(value), expires: Date.now() + ttlMs },
          TIMEOUT: 3000,
        },
      );
  } finally {
    await db.close().catch(() => {});
  }
}
export async function reserve(id: string, fingerprint: string) {
  const db = await database();
  const nonce = randomBytes(16).toString("hex");
  try {
    const r = await db
      .selectGraph("scout_private_state")
      .query<{
        nonce: string;
        fingerprint: string;
      }>(`MERGE (r:Reservation {id:$id}) ON CREATE SET r.nonce=$nonce,r.fingerprint=$fingerprint RETURN r.nonce AS nonce,r.fingerprint AS fingerprint`, { params: { id, nonce, fingerprint }, TIMEOUT: 3000 });
    return {
      acquired: r.data?.[0]?.nonce === nonce,
      consistent: r.data?.[0]?.fingerprint === fingerprint,
    };
  } finally {
    await db.close().catch(() => {});
  }
}
export const fingerprint = (v: unknown) =>
  createHash("sha256").update(JSON.stringify(v)).digest("hex");
export type Credentials = {
  eventmatchKey?: string;
  brightdataKey?: string;
  brightdataZone?: string;
};
export async function credentials() {
  return (await read<Credentials>("credentials:operator")) ?? {};
}

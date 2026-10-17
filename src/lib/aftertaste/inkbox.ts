import { createHmac, timingSafeEqual } from "node:crypto";

// Proves a caller controls an Inkbox identity: the agent sends a signed nonce to our Inkbox identity
// over A2A, Inkbox authenticates that call with the agent's own key, and we read the sender's handle
// from our task ledger. Inkbox offers no third-party token verification, so this is the proof.

const INKBOX = "https://inkbox.ai";
const CHALLENGE_TTL_MS = 10 * 60_000;

function env(name: "INKBOX_API_KEY" | "INKBOX_AGENT_HANDLE") {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

export const serverCardUrl = () => `${INKBOX}/a2a/${env("INKBOX_AGENT_HANDLE")}/card`;

export const challengeText = (nonce: string) => `aftertaste-verify:${nonce}`;

// Bound to the requesting contributor so a leaked nonce can't link the handle to someone else.
function sign(contributorId: string, handle: string, expires: string) {
  return createHmac("sha256", `inkbox-challenge:${process.env.AFTERTASTE_HASH_SALT}`)
    .update(`${contributorId}:${handle}:${expires}`)
    .digest("base64url")
    .slice(0, 22);
}

export function issueChallenge(contributorId: string, handle: string) {
  const expires = (Date.now() + CHALLENGE_TTL_MS).toString(36);
  return { nonce: `${expires}.${sign(contributorId, handle, expires)}`, expiresAt: new Date(parseInt(expires, 36)) };
}

// Returns the challenge's issue time when the nonce is authentic and unexpired for this handle.
export function verifyChallenge(contributorId: string, handle: string, nonce: string): Date | null {
  const [expires, mac] = nonce.split(".");
  if (!expires || !mac) return null;
  const expected = Buffer.from(sign(contributorId, handle, expires));
  const given = Buffer.from(mac);
  const expiresAt = parseInt(expires, 36);
  if (given.length !== expected.length || !timingSafeEqual(given, expected) || Date.now() > expiresAt) return null;
  return new Date(expiresAt - CHALLENGE_TTL_MS);
}

// A claimed identity with A2A enabled serves a public agent card; anything else is a 404.
export async function cardExists(handle: string) {
  const res = await fetch(`${INKBOX}/a2a/${encodeURIComponent(handle)}/card`, { cache: "no-store" });
  return res.ok;
}

type LedgerTask = {
  id: string;
  state: string;
  caller: { handle: string | null };
  messages: { role: string; parts: { text?: string }[] }[];
};

function ledger(path: string, init?: RequestInit) {
  return fetch(`${INKBOX}/api/v1/identities/${env("INKBOX_AGENT_HANDLE")}/a2a${path}`, {
    ...init,
    headers: { "X-API-Key": env("INKBOX_API_KEY"), "Content-Type": "application/json" },
    cache: "no-store",
  });
}

export async function findChallengeTask(handle: string, nonce: string, issuedAt: Date) {
  const params = new URLSearchParams({
    requester_handle: handle,
    since: new Date(issuedAt.getTime() - 60_000).toISOString(),
    limit: "20",
  });
  const res = await ledger(`/tasks?${params}`);
  if (!res.ok) throw new Error(`Inkbox ledger returned ${res.status}`);
  const { items } = (await res.json()) as { items: LedgerTask[] };
  const text = challengeText(nonce);
  // We complete the task on success, so a completed task means the challenge was already redeemed.
  return items.find(
    (t) =>
      t.state !== "completed" &&
      t.caller.handle?.toLowerCase() === handle &&
      t.messages.some((m) => m.role === "caller" && m.parts.some((p) => p.text?.includes(text))),
  );
}

export async function completeTask(taskId: string, message: string) {
  const res = await ledger(`/tasks/${taskId}/reply`, {
    method: "POST",
    body: JSON.stringify({ intent: "complete", parts: [{ text: message }] }),
  });
  if (!res.ok) console.warn(JSON.stringify({ event: "inkbox_reply_failed", taskId, status: res.status }));
}

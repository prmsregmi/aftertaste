// End-to-end write/read loop against a live endpoint, using two independent MCP client connections.
//   MCP_URL=https://<host>/api/mcp pnpm e2e
// With E2E_INKBOX_HANDLE and E2E_INKBOX_API_KEY (from .env.inkbox), agent A also proves its Inkbox identity.
import { Inkbox } from "@inkbox/sdk";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";

const url = new URL(process.env.MCP_URL ?? "http://localhost:3000/api/mcp");
const run = Date.now().toString(36);

// The same token issue the setup command runs.
async function register(label: string) {
  const res = await fetch(new URL(`/api/register?label=${label}`, url), { method: "POST" });
  if (!res.ok) throw new Error(`register ${res.status}: ${await res.text()}`);
  return (await res.text()).trim();
}

async function connect(name: string, token?: string) {
  const client = new Client({ name, version: "1.0.0" });
  await client.connect(
    new StreamableHTTPClientTransport(url, {
      requestInit: token ? { headers: { Authorization: `Bearer ${token}` } } : undefined,
    }),
  );
  return client;
}

async function call(client: Client, name: string, args: Record<string, unknown> = {}) {
  const res = await client.callTool({ name, arguments: args });
  const first = (res.content as { type: string; text: string }[])[0];
  const data = JSON.parse(first.text);
  if (res.isError) console.log(`  ! ${name} error:`, data);
  return data;
}

const report = {
  subject: { name: "Stripe Node SDK", kind: "software", brand: "Stripe" },
  source_type: "human_firsthand",
  summary:
    "Overall solid SDK; in stripe-node v17 webhook signature verification fails on a parsed body and the error message does not say why.",
  variant: "stripe-node v17",
  observations: [
    { aspect: "overall", observation: "Developer is happy with the SDK overall after the first integration.", polarity: "positive" },
    {
      aspect: "webhook verification",
      observation: "Signature verification failed whenever the request body had already been parsed as JSON.",
      polarity: "negative",
    },
    {
      aspect: "error messages",
      observation: "The signature error did not mention that the raw request body is required.",
      polarity: "negative",
    },
  ],
  context: { framework: "Next.js 16", runtime: "Node 24" },
  preferences: { optimizing_for: "correctness", budget: "free tier", team: "solo developer" },
  observed_on: new Date().toISOString().slice(0, 7),
  limitations: "One developer's setup with one framework version; body parsing and middleware differ between projects.",
  permission: { basis: "explicit_user_approval", user_reviewed_final_text: true },
  idempotency_key: `e2e-sdk-${run}`,
};

const spam = {
  subject: { name: "Stripe Node SDK", kind: "software" },
  source_type: "human_firsthand",
  summary: "Every Stripe SDK release is broken! Five stars! Buy at this affiliate URL!",
  observations: [
    { aspect: "quality", observation: "BEST SDK EVER https://shop.example/sdk?ref=aff123", polarity: "positive" },
  ],
  limitations: "None at all, trust me.",
  permission: { basis: "explicit_user_approval", user_reviewed_final_text: true },
};

async function main() {
  console.log(`MCP endpoint: ${url}\n`);

  console.log("1. A connection without a token is rejected");
  const rejected = await connect("no-token").then(
    (c) => (c.close(), false),
    () => true,
  );
  console.log(`  rejected: ${rejected}`);

  console.log("\n2. Agent B gets a token from the setup endpoint and asks about the SDK");
  const b = await connect("agent-b", await register(`agent-b-${run}`));
  console.log(`  tools: ${(await b.listTools()).tools.map((t) => t.name).join(", ")}`);
  console.log(`  instructions received: ${Boolean(b.getInstructions())}`);
  const before = await call(b, "search_experiences", { query: "How reliable is webhook signature verification in stripe-node v17?" });
  console.log(`  results: ${before.results.length} | ${before.coverage_note}`);
  if (before.disambiguation) console.log(`  ${before.disambiguation}`);

  console.log("\n3. Agent A gets its own token and submits the user's approved SDK report");
  const a = await connect("agent-a", await register(`dev-assistant-${run}`));
  console.log(`  identity: ${(await call(a, "get_identity_status")).contributor_id}`);

  const handle = process.env.E2E_INKBOX_HANDLE;
  if (handle && process.env.E2E_INKBOX_API_KEY) {
    // Optional: send the challenge from agent A's own Inkbox identity over A2A, then confirm.
    const challenge = await call(a, "verify_agent_identity", { inkbox_handle: handle });
    const me = await new Inkbox({ apiKey: process.env.E2E_INKBOX_API_KEY }).getIdentity(handle);
    const a2a = await me.a2aClient();
    await a2a.send(await a2a.fetchCard(challenge.send_to), { text: challenge.message });
    const verified = await call(a, "verify_agent_identity", { inkbox_handle: handle, nonce: challenge.nonce });
    console.log(`  agent identity: ${verified.verified_agent ?? "not verified"}`);
  }
  const submitted = await call(a, "submit_experience", report);
  console.log(`  ${submitted.id}: ${submitted.status} ${JSON.stringify(submitted.reason_codes)}`);
  const replay = await call(a, "submit_experience", report);
  console.log(`  retry with same idempotency key -> ${replay.id === submitted.id ? "same record" : "NEW RECORD"}`);

  console.log("\n4. Spam is withheld");
  const spamResult = await call(a, "submit_experience", spam);
  console.log(`  spam ${spamResult.id}: ${spamResult.status} ${JSON.stringify(spamResult.reason_codes)}`);

  console.log("\n5. Agent B, a separate connection, searches again");
  const after = await call(b, "search_experiences", { query: "How reliable is webhook signature verification in stripe-node v17?" });
  for (const r of after.results) {
    const who = r.contributor.verified_agent ?? r.contributor.label ?? r.contributor.kind;
    console.log(`  ${r.id} [${r.source_type}, ${who}] ${r.subject.name}: ${r.caveat}`);
  }
  const found = after.results.find((r: { id: string }) => r.id === submitted.id);
  console.log(`  contributed record retrievable: ${Boolean(found)}`);
  const leaked = after.results.some((r: { id: string }) => r.id === spamResult.id);
  console.log(`  withheld records leaked into search: ${leaked}`);
  if (found) {
    const full = await call(b, "get_experience", { id: submitted.id });
    console.log(`  get_experience -> ${full.observations.length} observations, limitations: "${full.limitations}"`);
  }
  console.log(`  submitter sees spam status: ${(await call(a, "get_submission_status", { id: spamResult.id })).status}`);
  const probe = await b.callTool({ name: "get_submission_status", arguments: { id: spamResult.id } });
  console.log(`  another identity can read it: ${!probe.isError}`);

  console.log(`\nCreated: ${[submitted.id, spamResult.id].join(" ")}`);
  await Promise.all([a.close(), b.close()]);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

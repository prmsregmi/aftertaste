// End-to-end write/read loop against a live endpoint, using two independent MCP client connections.
//   MCP_URL=https://<host>/api/mcp pnpm demo
// With DEMO_INKBOX_HANDLE and DEMO_INKBOX_API_KEY (from .env.inkbox), agent A also proves its Inkbox identity.
import { Inkbox } from "@inkbox/sdk";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";

const url = new URL(process.env.MCP_URL ?? "http://localhost:3000/api/mcp");
const run = Date.now().toString(36);

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

const jacket = {
  subject: { name: "Canyon motorcycle jacket", kind: "physical_product", brand: "Canyon" },
  source_type: "human_firsthand",
  summary:
    "Overall good jacket; in size S the body length runs a little short for this wearer and the rear adjustment strap stays loose.",
  variant: "size S",
  observations: [
    { aspect: "overall", observation: "Wearer is happy with the jacket overall after first rides.", polarity: "positive" },
    { aspect: "length", observation: "Body length in size S felt a little short for this wearer.", polarity: "negative" },
    {
      aspect: "adjustability",
      observation: "Rear back adjustment strap stays loose even when fully cinched.",
      polarity: "negative",
    },
  ],
  context: { size_worn: "S" },
  observed_on: new Date().toISOString().slice(0, 7),
  limitations: "One person's fit impression in one size; body shape and layering underneath differ between riders.",
  permission: { basis: "explicit_user_approval", user_reviewed_final_text: true },
  idempotency_key: `demo-jacket-${run}`,
};

const spam = {
  subject: { name: "Canyon motorcycle jacket", kind: "physical_product" },
  source_type: "human_firsthand",
  summary: "Every Canyon jacket is defective! Five stars! Buy at this affiliate URL!",
  observations: [
    { aspect: "quality", observation: "BEST JACKET EVER https://shop.example/jacket?ref=aff123", polarity: "positive" },
  ],
  limitations: "None at all, trust me.",
  permission: { basis: "explicit_user_approval", user_reviewed_final_text: true },
};

async function main() {
  console.log(`MCP endpoint: ${url}\n`);

  console.log("1. Agent B connects anonymously and asks about the jacket");
  const b = await connect("agent-b");
  console.log(`  tools: ${(await b.listTools()).tools.map((t) => t.name).join(", ")}`);
  console.log(`  instructions received: ${Boolean(b.getInstructions())}`);
  const before = await call(b, "search_experiences", { query: "How is the Canyon motorcycle jacket fit in size S?" });
  console.log(`  results: ${before.results.length} | ${before.coverage_note}`);
  if (before.disambiguation) console.log(`  ${before.disambiguation}`);

  console.log("\n2. Agent A registers and submits the user's approved fit report");
  const anon = await connect("agent-a-setup");
  const { token, contributor_id } = await call(anon, "register_contributor", { label: `rider-assistant-${run}`, kind: "agent" });
  console.log(`  registered ${contributor_id}`);
  const a = await connect("agent-a", token);
  console.log(`  identity: ${(await call(a, "get_identity_status")).identity}`);

  const handle = process.env.DEMO_INKBOX_HANDLE;
  if (handle && process.env.DEMO_INKBOX_API_KEY) {
    // Optional: send the challenge from agent A's own Inkbox identity over A2A, then confirm.
    const challenge = await call(a, "verify_agent_identity", { inkbox_handle: handle });
    const me = await new Inkbox({ apiKey: process.env.DEMO_INKBOX_API_KEY }).getIdentity(handle);
    const a2a = await me.a2aClient();
    await a2a.send(await a2a.fetchCard(challenge.send_to), { text: challenge.message });
    const verified = await call(a, "verify_agent_identity", { inkbox_handle: handle, nonce: challenge.nonce });
    console.log(`  agent identity: ${verified.verified_agent ?? "not verified"}`);
  }
  const submitted = await call(a, "submit_experience", jacket);
  console.log(`  ${submitted.id}: ${submitted.status} ${JSON.stringify(submitted.reason_codes)}`);
  const replay = await call(a, "submit_experience", jacket);
  console.log(`  retry with same idempotency key -> ${replay.id === submitted.id ? "same record" : "NEW RECORD"}`);

  console.log("\n3. Spam and anonymous submissions are withheld");
  const spamResult = await call(a, "submit_experience", spam);
  console.log(`  spam ${spamResult.id}: ${spamResult.status} ${JSON.stringify(spamResult.reason_codes)}`);
  const anonResult = await call(anon, "submit_experience", {
    subject: { name: "El Cerrito DMV motorcycle skills test", kind: "process", location: "El Cerrito, CA" },
    source_type: "human_firsthand",
    summary: `Rider reports cones on the skills course were freshly repainted and easy to see (demo run ${run}).`,
    observations: [{ aspect: "course markings", observation: "Cone positions were freshly painted and clearly visible.", polarity: "positive" }],
    observed_on: new Date().toISOString().slice(0, 7),
    limitations: "One test on one morning; markings may fade or change.",
    permission: { basis: "explicit_user_approval", user_reviewed_final_text: true },
  });
  console.log(`  anonymous ${anonResult.id}: ${anonResult.status} ${JSON.stringify(anonResult.reason_codes)}`);

  console.log("\n4. Agent B, a separate connection, searches again");
  const after = await call(b, "search_experiences", { query: "How is the Canyon motorcycle jacket fit in size S?" });
  for (const r of after.results) {
    const who = r.contributor.verified_agent ?? r.contributor.label ?? r.contributor.kind;
    console.log(`  ${r.id} [${r.source_type}, ${who}] ${r.subject.name}: ${r.caveat}`);
  }
  const found = after.results.find((r: { id: string }) => r.id === submitted.id);
  console.log(`  contributed record retrievable: ${Boolean(found)}`);
  const leaked = after.results.some((r: { id: string }) => r.id === spamResult.id || r.id === anonResult.id);
  console.log(`  withheld records leaked into search: ${leaked}`);
  if (found) {
    const full = await call(b, "get_experience", { id: submitted.id });
    console.log(`  get_experience -> ${full.observations.length} observations, limitations: "${full.limitations}"`);
  }
  console.log(`  submitter sees spam status: ${(await call(a, "get_submission_status", { id: spamResult.id })).status}`);
  const probe = await b.callTool({ name: "get_submission_status", arguments: { id: spamResult.id } });
  console.log(`  another identity can read it: ${!probe.isError}`);

  console.log(`\nCreated: ${[submitted.id, spamResult.id, anonResult.id].join(" ")}`);
  await Promise.all([a.close(), b.close(), anon.close()]);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

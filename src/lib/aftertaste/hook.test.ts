import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { errorSignature, toolOf, workParts } from "../../../public/hooks/claude-code.mjs";

// Runs the hook as Claude Code would, in a throwaway home without a token, so it never reaches the network.
const home = mkdtempSync(join(tmpdir(), "aftertaste-hook-"));
const run = (event: object) =>
  execFileSync("node", ["public/hooks/claude-code.mjs"], {
    input: JSON.stringify({ session_id: `test${Math.random()}`.replace(".", ""), tool_name: "Bash", ...event }),
    env: { ...process.env, HOME: home, AFTERTASTE_TOKEN: "" },
  }).toString();

describe("Claude Code hook", () => {
  it("keeps the telling error line without paths, positions or IDs", () => {
    expect(errorSignature("Exit code 9\nnode: .env: not found")).toBe("node: .env: not found");
    expect(
      errorSignature(
        "Exit code 1\n> build\n\x1b[31mError: Cannot find module /Users/a/app/lib/db.js\x1b[0m\n    at Module._load (node:internal/modules/cjs/loader:1000:12)",
      ),
    ).toBe("Error: Cannot find module");
    expect(errorSignature("request 3f9a2c1d8e7b6a50 failed: 401 Unauthorized")).toBe("request failed: 401 Unauthorized");
  });

  it("never sends secrets or identifiers from the error line", () => {
    const leaked = errorSignature(
      "Error: connect failed for postgres://admin:hunter2@db.internal.example.com:5432/app (api_key=sk_live_51HxQ2abcDEF123456 user ops@example.com host 10.0.0.12, token ghp_aB3dE6fG9hJ2kL5mN8pQ1rS4tU7vW0xY)",
    );
    for (const secret of ["hunter2", "admin", "internal", "sk_live", "ops@", "10.0.0.12", "ghp_"]) expect(leaked).not.toContain(secret);
    expect(leaked).toContain("Error: connect failed for");
  });

  it("names the tool behind a command, not the runner or script", () => {
    expect(toolOf("npx --yes supabase db push")).toBe("supabase");
    expect(toolOf("pnpm dlx vercel deploy")).toBe("vercel");
    expect(toolOf("cd app && STRIPE_API_KEY=x stripe listen")).toBe("stripe");
    expect(toolOf("pnpm build")).toBeNull();
    expect(toolOf("node scripts/seed.ts")).toBeNull();
    expect(toolOf("cat app.js; echo ---; npx vercel deploy 2>&1 | head -30")).toBe("vercel");
    expect(workParts("ls -la && timeout 60 npm start 2>&1 | head -50")).toEqual(["npm start"]);
    expect(workParts('npm start 2>&1; echo "exit: $?"; node --version')).toEqual(["npm start"]);
  });

  it("treats error output from a piped run as a failure, but not from read-only commands", () => {
    const piped = { hook_event_name: "PostToolUse", tool_input: { command: "timeout 60 npm start 2>&1 | head" }, tool_response: { stdout: "node: .env.local: not found\nnpm error code 9", stderr: "" } };
    const session = `s${Date.now()}`;
    run({ ...piped, session_id: session });
    const fixed = run({ ...piped, session_id: session, tool_input: { command: 'npm start; echo "exit: $?"' }, tool_response: { stdout: "greeting: hello", stderr: "" } });
    expect(fixed).toContain("failed earlier in this session");
    const grep = run({ hook_event_name: "PostToolUse", tool_input: { command: "grep -r Error: src" }, tool_response: { stdout: "src/a.ts: Error: boom", stderr: "" } });
    expect(grep).toBe("");
  });
});

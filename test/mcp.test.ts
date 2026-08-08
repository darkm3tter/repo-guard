import { describe, expect, test } from "bun:test";
import { createGuardServer, createHandlers } from "../src/mcp";
import { withBuiltins } from "../src/builtins";

function server() {
  const { session } = createGuardServer({ rules: [] });
  return createHandlers(session);
}

describe("repo-guard MCP server", () => {
  test("guard_check returns verdicts through the tool handler", async () => {
    const r = await server().check({ kind: "write", path: ".env", content: "TOKEN=x" });
    const parsed = JSON.parse(r.content[0]!.text) as { verdict: string; blocked: boolean };
    expect(parsed.verdict).toBe("deny");
    expect(parsed.blocked).toBe(true);
  });

  test("dangerous commands are denied", async () => {
    const r = await server().check({ kind: "command", command: "rm -rf /" });
    const parsed = JSON.parse(r.content[0]!.text) as { blocked: boolean; ruleIds: string[] };
    expect(parsed.blocked).toBe(true);
    expect(parsed.ruleIds).toContain("builtin-dangerous-command");
  });

  test("guard_config lists builtin rules", async () => {
    const r = await server().config();
    const parsed = JSON.parse(r.content[0]!.text) as { mode: string; rules: Array<{ id: string }> };
    expect(parsed.mode).toBe("enforce");
    expect(parsed.rules.some((x) => x.id === "builtin-protect-env")).toBe(true);
  });

  test("guard_allow temporarily allows a rule", async () => {
    const s = server();
    const allowRes = await s.allow({ ruleId: "builtin-protect-env" });
    expect(JSON.parse(allowRes.content[0]!.text).allowed).toBe(true);
    const r = await s.check({ kind: "write", path: ".env" });
    expect((JSON.parse(r.content[0]!.text) as { verdict: string }).verdict).toBe("allow");
  });

  test("invalid config throws", () => {
    expect(() =>
      createGuardServer({ rules: [{ id: "", kind: "protect", path: "x" }] as never }),
    ).toThrow();
  });

  test("withBuiltins merge is idempotent", () => {
    const c = withBuiltins({ rules: [] });
    const again = withBuiltins(c);
    expect(again.rules.length).toBe(c.rules.length);
  });
});

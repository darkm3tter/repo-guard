import { describe, expect, test } from "bun:test";
import { run } from "../src/cli";
import { extractToolCall, runHook } from "../src/hook";

describe("cli check", () => {
  test("protect rule blocks .env writes", () => {
    const r = run(["check", "--write", ".env", "--content", "X=1"]);
    expect(r.exitCode).toBe(1);
    expect(r.text).toContain("BLOQUEADO");
  });

  test("safe writes pass", () => {
    const r = run(["check", "--write", "src/app.ts", "--content", "const x = 1"]);
    expect(r.exitCode).toBe(0);
    expect(r.text).toContain("OK");
  });

  test("dangerous commands are blocked", () => {
    const r = run(["check", "--command", "rm -rf /"]);
    expect(r.exitCode).toBe(1);
    expect(r.text).toContain("BLOQUEADO");
  });

  test("log-only mode reports instead of blocking", () => {
    const r = run(["check", "--write", ".env", "--log-only"]);
    expect(r.exitCode).toBe(0);
    expect(r.text).toContain("log-only");
  });

  test("json output is parseable", () => {
    const r = run(["check", "--write", ".env", "--json"]);
    const parsed = JSON.parse(r.text) as { verdict: string };
    expect(parsed.verdict).toBe("deny");
  });

  test("check without target is usage error", () => {
    expect(run(["check"]).exitCode).toBe(2);
  });

  test("unknown command is usage error", () => {
    expect(run(["frobnicate"]).exitCode).toBe(2);
  });

  test("config command lists rules", () => {
    const r = run(["config"]);
    expect(r.exitCode).toBe(0);
    expect(r.text).toContain("builtin-protect-env");
  });
});

describe("hook extraction", () => {
  test("opencode bash payload → command check", () => {
    const call = extractToolCall({ tool: "bash", toolInput: { command: "rm -rf /" } });
    expect(call).toEqual({ kind: "command", command: "rm -rf /" });
  });

  test("claude code edit payload → write check", () => {
    const call = extractToolCall({ type: "Edit", input: { file_path: "src/a.ts", content: "x" } });
    expect(call).toEqual({ kind: "write", path: "src/a.ts", content: "x" });
  });

  test("write payload with newContent", () => {
    const call = extractToolCall({ tool: "write", toolInput: { filePath: ".env", newContent: "TOKEN=x" } });
    expect(call?.kind).toBe("write");
    expect(call?.path).toBe(".env");
    expect(call?.content).toBe("TOKEN=x");
  });

  test("delete payload → delete check", () => {
    const call = extractToolCall({ tool: "delete", toolInput: { path: "src/old.ts" } });
    expect(call).toEqual({ kind: "delete", path: "src/old.ts" });
  });

  test("unknown tool passes through as null", () => {
    expect(extractToolCall({ tool: "mcp__something", toolInput: {} })).toBeNull();
  });

  test("runHook blocks dangerous commands with exit 2", () => {
    const code = runHook({ tool: "bash", toolInput: { command: "rm -rf /" } });
    expect(code).toBe(2);
  });

  test("runHook allows safe actions", () => {
    const code = runHook({ tool: "bash", toolInput: { command: "git status" } });
    expect(code).toBe(0);
  });
});

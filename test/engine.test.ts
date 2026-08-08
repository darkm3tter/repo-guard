import { describe, expect, test } from "bun:test";
import { withBuiltins } from "../src/builtins";
import { GuardEngine } from "../src/engine";
import { validateConfig, type GuardConfig } from "../src/rules";

function engine(over: Partial<GuardConfig> = {}): GuardEngine {
  return new GuardEngine(withBuiltins({ rules: [], ...over }));
}

describe("validateConfig", () => {
  test("detects invalid mode, duplicates and empty ids", () => {
    const errors = validateConfig({
      mode: "weird" as never,
      rules: [
        { id: "", kind: "protect", path: "x" },
        { id: "a", kind: "protect", path: "x" },
        { id: "a", kind: "protect", path: "y" },
        { id: "b", kind: "block", path: "x" },
      ],
    });
    expect(errors.some((e) => e.includes("mode"))).toBe(true);
    expect(errors.some((e) => e.includes("id vacío") || e.includes("necesita un id"))).toBe(true);
    expect(errors.some((e) => e.includes("duplicado"))).toBe(true);
    expect(errors.some((e) => e.includes("requiere pattern"))).toBe(true);
  });

  test("valid config passes", () => {
    expect(validateConfig({ rules: [{ id: "a", kind: "protect", path: "x" }] })).toEqual([]);
  });
});

describe("GuardEngine path rules", () => {
  test("protect denies writes to protected globs", () => {
    const g = engine({ rules: [{ id: "r", kind: "protect", path: "src/generated/**" }] });
    const r = g.check({ kind: "write", path: "src/generated/models.ts", content: "x" });
    expect(r.blocked).toBe(true);
    expect(r.verdict).toBe("deny");
    expect(r.ruleIds).toContain("r");
  });

  test("protect ignores unrelated paths", () => {
    const g = engine({ rules: [{ id: "r", kind: "protect", path: "src/generated/**" }] });
    expect(g.check({ kind: "write", path: "src/app.ts" }).blocked).toBe(false);
  });

  test("block denies writes whose content matches", () => {
    const g = engine({ rules: [{ id: "r", kind: "block", path: "src/**", pattern: "console\\.log" }] });
    expect(g.check({ kind: "write", path: "src/a.ts", content: "console.log(1)" }).blocked).toBe(true);
    expect(g.check({ kind: "write", path: "src/a.ts", content: "const x = 1" }).blocked).toBe(false);
  });

  test("block does not apply to deletes", () => {
    const g = engine({ rules: [{ id: "r", kind: "block", path: "**", pattern: "x" }] });
    expect(g.check({ kind: "delete", path: "src/a.ts" }).blocked).toBe(false);
  });

  test("require-confirm on sensitive paths", () => {
    const g = engine({ rules: [{ id: "r", kind: "require-confirm", path: "package.json" }] });
    const r = g.check({ kind: "write", path: "package.json" });
    expect(r.needsApproval).toBe(true);
    expect(r.verdict).toBe("confirm");
  });

  test("builtins: .env protected, secrets in content blocked, lockfile needs confirm", () => {
    const g = engine();
    expect(g.check({ kind: "write", path: ".env", content: "X=1" }).blocked).toBe(true);
    const secret = g.check({ kind: "write", path: "src/config.ts", content: 'const apiKey = "sk-1234567890abcdef"' });
    expect(secret.blocked).toBe(true);
    expect(g.check({ kind: "write", path: "package-lock.json" }).needsApproval).toBe(true);
    expect(g.check({ kind: "write", path: "src/app.ts", content: "ok" }).blocked).toBe(false);
  });

  test("user rule overrides builtin with same id", () => {
    const g = engine({
      rules: [{ id: "builtin-protect-env", kind: "allow", path: "**/.env*" }],
    });
    expect(g.check({ kind: "write", path: ".env" }).blocked).toBe(false);
  });
});

describe("GuardEngine precedence", () => {
  test("deny beats confirm beats allow", () => {
    const g = new GuardEngine({
      rules: [
        { id: "allow-all", kind: "allow", path: "**" },
        { id: "confirm-x", kind: "require-confirm", path: "src/x.ts" },
        { id: "block-x", kind: "block", path: "src/x.ts", pattern: "bad" },
      ],
    });
    expect(g.check({ kind: "write", path: "src/x.ts", content: "bad thing" }).verdict).toBe("deny");
    expect(g.check({ kind: "write", path: "src/x.ts", content: "good" }).verdict).toBe("confirm");
    expect(g.check({ kind: "write", path: "src/y.ts", content: "x" }).verdict).toBe("allow");
  });

  test("default deny applies when no rule matches", () => {
    const g = new GuardEngine({ defaultAction: "deny", rules: [] });
    expect(g.check({ kind: "write", path: "anything" }).blocked).toBe(true);
  });
});

describe("GuardEngine log-only mode", () => {
  test("deny becomes allow but wouldBe keeps the truth", () => {
    const g = engine({ mode: "log-only", rules: [{ id: "r", kind: "protect", path: "**/.env*" }] });
    const r = g.check({ kind: "write", path: ".env" });
    expect(r.verdict).toBe("allow");
    expect(r.wouldBe).toBe("deny");
    expect(r.blocked).toBe(false);
    expect(r.reasons.some((x) => x.includes("[log-only]"))).toBe(true);
  });
});

describe("GuardEngine commands and commits", () => {
  test("dangerous commands are denied by the builtin scanner", () => {
    const g = engine();
    const r = g.check({ kind: "command", command: "rm -rf /" });
    expect(r.blocked).toBe(true);
    expect(r.ruleIds).toContain("builtin-dangerous-command");
  });

  test("custom command rules deny", () => {
    const g = new GuardEngine({
      rules: [{ id: "no-prod", kind: "block", command: "npm publish" }],
    });
    expect(g.check({ kind: "command", command: "npm publish --tag prod" }).blocked).toBe(true);
    expect(g.check({ kind: "command", command: "npm test" }).blocked).toBe(false);
  });

  test("commit messages are checked like commands", () => {
    const g = new GuardEngine({
      rules: [{ id: "no-secret", kind: "block", command: "(?i)password" }],
    });
    expect(g.check({ kind: "commit", command: "fix: remove password from config" }).blocked).toBe(true);
  });

  test("invalid regex rules are ignored without crashing", () => {
    const g = new GuardEngine({ rules: [{ id: "bad", kind: "block", path: "**", pattern: "(" }] });
    expect(() => g.check({ kind: "write", path: "src/a.ts", content: "x" })).not.toThrow();
    expect(g.check({ kind: "write", path: "src/a.ts", content: "x" }).blocked).toBe(false);
  });
});

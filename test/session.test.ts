import { describe, expect, test } from "bun:test";
import { GuardSession } from "../src/session";

function session() {
  return new GuardSession({
    rules: [
      { id: "protect-env", kind: "protect", path: "**/.env*" },
      { id: "confirm-lock", kind: "require-confirm", path: "package-lock.json" },
    ],
  });
}

describe("GuardSession", () => {
  test("tracks checks and report counts", () => {
    const s = session();
    s.check({ kind: "write", path: ".env", content: "X=1" });
    s.check({ kind: "write", path: "package-lock.json" });
    s.check({ kind: "write", path: "src/a.ts", content: "ok" });
    const r = s.report();
    expect(r.checks).toBe(3);
    expect(r.blocked).toBe(1);
    expect(r.confirmations).toBe(1);
    expect(r.allowed).toBe(1);
  });

  test("temporary allow rule overrides verdicts for the session", () => {
    const s = session();
    expect(s.allowRule("protect-env")).toBe(true);
    expect(s.allowRule("does-not-exist")).toBe(false);
    const r = s.check({ kind: "write", path: ".env", content: "X=1" });
    expect(r.verdict).toBe("allow");
    expect(r.wouldBe).toBe("deny");
    expect(r.reasons.some((x) => x.includes("temporalmente"))).toBe(true);
    expect(s.report().blocked).toBe(0);
  });

  test("entries list is an immutable snapshot", () => {
    const s = session();
    s.check({ kind: "write", path: ".env" });
    const list = s.entriesList();
    list.pop();
    expect(s.entriesList()).toHaveLength(1);
  });
});

import { GuardEngine, type CheckRequest, type CheckResult } from "./engine";
import { type GuardConfig } from "./rules";

export interface SessionEntry {
  id: number;
  timestamp: string;
  request: CheckRequest;
  result: CheckResult;
}

/**
 * A guard session: keeps the audit trail and supports temporary rule
 * overrides ("allow this rule for the session").
 */
export class GuardSession {
  private readonly engine: GuardEngine;
  private readonly allowedRules = new Set<string>();
  private readonly entries: SessionEntry[] = [];
  private nextId = 1;
  readonly startedAt = new Date().toISOString();

  constructor(config: GuardConfig) {
    this.engine = new GuardEngine(config);
  }

  /** Registers a temporary allow for a rule id for the rest of the session. */
  allowRule(ruleId: string): boolean {
    const exists = this.engine.ruleIds.includes(ruleId);
    if (exists) this.allowedRules.add(ruleId);
    return exists;
  }

  ruleAllowed(ruleId: string): boolean {
    return this.allowedRules.has(ruleId);
  }

  describeMode(): "enforce" | "log-only" {
    return this.engine.mode;
  }

  describeRules(): Array<{ id: string; kind: string; boundary: string; message?: string }> {
    return this.engine.describeRules();
  }

  check(req: CheckRequest): CheckResult {
    const raw = this.engine.check(req);
    // Session-level temporary allows convert deny/confirm back to allow.
    const overridden = raw.ruleIds.some((id) => this.allowedRules.has(id));
    const result: CheckResult = overridden
      ? {
          ...raw,
          verdict: "allow",
          wouldBe: raw.wouldBe ?? (raw.verdict === "deny" ? "deny" : raw.verdict === "confirm" ? "confirm" : null),
          reasons: [...raw.reasons, "[permitido temporalmente por regla de sesión]"],
          blocked: false,
          needsApproval: false,
        }
      : raw;
    this.entries.push({ id: this.nextId++, timestamp: new Date().toISOString(), request: req, result });
    return result;
  }

  report(): { startedAt: string; checks: number; blocked: number; confirmations: number; allowed: number; logOnlyHits: number } {
    let blocked = 0;
    let confirmations = 0;
    let allowed = 0;
    let logOnlyHits = 0;
    for (const e of this.entries) {
      if (e.result.blocked) blocked += 1;
      if (e.result.needsApproval) confirmations += 1;
      if (e.result.verdict === "allow" && e.result.wouldBe === null) allowed += 1;
      if (e.result.wouldBe !== null) logOnlyHits += 1;
    }
    return {
      startedAt: this.startedAt,
      checks: this.entries.length,
      blocked,
      confirmations,
      allowed,
      logOnlyHits,
    };
  }

  entriesList(): SessionEntry[] {
    return [...this.entries];
  }
}

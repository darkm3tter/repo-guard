import { matchGlob } from "./glob";
import { detectDangerousCommand } from "./commandscan";
import {
  isPathRule,
  normalizeConfig,
  type CheckKind,
  type GuardConfig,
  type Rule,
  type Verdict,
} from "./rules";

export interface CheckRequest {
  kind: CheckKind;
  path?: string;
  content?: string;
  command?: string;
}

export interface CheckResult {
  verdict: Verdict;
  wouldBe: Verdict | null;
  reasons: string[];
  ruleIds: string[];
  blocked: boolean;
  needsApproval: boolean;
}

const RANK: Record<Verdict, number> = { deny: 3, confirm: 2, allow: 1 };

function compile(pattern: string | undefined): RegExp | null {
  if (pattern === undefined || pattern === "") return null;
  try {
    if (pattern.startsWith("(?i)")) {
      return new RegExp(pattern.slice(4), "i");
    }
    return new RegExp(pattern);
  } catch {
    return null;
  }
}

export class GuardEngine {
  private readonly config: ReturnType<typeof normalizeConfig>;
  private readonly compiled = new Map<string, RegExp | null>();

  constructor(config: GuardConfig) {
    this.config = normalizeConfig(config);
    for (const rule of this.config.rules) {
      const pattern = isPathRule(rule) ? rule.pattern : rule.command;
      this.compiled.set(rule.id, compile(pattern));
    }
  }

  get ruleIds(): string[] {
    return this.config.rules.map((r) => r.id);
  }

  get mode(): "enforce" | "log-only" {
    return this.config.mode;
  }

  /** Rules summary for agents: id, kind and the boundary it guards. */
  describeRules(): Array<{ id: string; kind: string; boundary: string; message?: string }> {
    return this.config.rules.map((r) =>
      isPathRule(r)
        ? { id: r.id, kind: r.kind, boundary: `path ${r.path}`, message: r.message }
        : { id: r.id, kind: r.kind, boundary: `command ${r.command}`, message: r.message },
    );
  }

  check(req: CheckRequest): CheckResult {
    const hits: Array<{ rule: Rule; verdict: Verdict; reason: string }> = [];
    const caseInsensitive = process.platform === "win32";

    for (const rule of this.config.rules) {
      if (isPathRule(rule)) {
        if (req.kind !== "write" && req.kind !== "delete") continue;
        if (req.path === undefined) continue;
        if (!matchGlob(rule.path, req.path, caseInsensitive)) continue;
        if (rule.kind === "protect") {
          hits.push({ rule, verdict: "deny", reason: `ruta protegida: ${rule.path}` });
        } else if (rule.kind === "block" && req.kind === "write") {
          const re = this.compiled.get(rule.id) ?? null;
          if (re !== null && req.content !== undefined && re.test(req.content)) {
            hits.push({ rule, verdict: "deny", reason: `contenido bloqueado (${rule.pattern})` });
          }
        } else if (rule.kind === "require-confirm") {
          hits.push({ rule, verdict: "confirm", reason: `requiere confirmación: ${rule.path}` });
        } else if (rule.kind === "allow") {
          hits.push({ rule, verdict: "allow", reason: `permitido por regla: ${rule.path}` });
        }
      } else {
        if (req.kind !== "command" && req.kind !== "commit") continue;
        const target = req.kind === "command" ? req.command : req.command;
        if (target === undefined) continue;
        const re = this.compiled.get(rule.id) ?? null;
        if (re === null || !re.test(target)) continue;
        hits.push({
          rule,
          verdict: rule.kind === "block" ? "deny" : rule.kind === "require-confirm" ? "confirm" : "allow",
          reason: `comando bloqueado (${rule.command})`,
        });
      }
    }

    if (req.kind === "command" && req.command !== undefined) {
      for (const reason of detectDangerousCommand(req.command)) {
        hits.push({ rule: { id: "builtin-dangerous-command", kind: "block", command: "" }, verdict: "deny", reason });
      }
    }

    let verdict: Verdict = this.config.defaultAction;
    let bestRuleId: string | null = null;
    let bestReason = `default: ${this.config.defaultAction}`;
    let bestRank = RANK[verdict];
    for (const hit of hits) {
      const rank = RANK[hit.verdict];
      if (rank > bestRank) {
        bestRank = rank;
        verdict = hit.verdict;
        bestRuleId = hit.rule.id;
        bestReason = hit.reason + (hit.rule.message ? ` — ${hit.rule.message}` : "");
      }
    }

    const logOnly = this.config.mode === "log-only";
    const wouldBe = logOnly && verdict !== "allow" ? verdict : null;
    const effective: Verdict = logOnly && verdict !== "allow" ? "allow" : verdict;

    const ruleIds = hits.map((h) => h.rule.id);
    const reasons = hits.map((h) =>
      logOnly && h.verdict !== "allow" ? `[log-only] ${h.reason}` : h.reason,
    );

    return {
      verdict: effective,
      wouldBe,
      reasons: reasons.length > 0 ? reasons : [bestReason],
      ruleIds,
      blocked: effective === "deny",
      needsApproval: effective === "confirm",
    };
  }
}

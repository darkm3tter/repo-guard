export type Verdict = "allow" | "deny" | "confirm";
export type CheckKind = "write" | "delete" | "command" | "commit";

export interface RuleBase {
  id: string;
  message?: string;
}

/** Path rules gate file operations (write/delete) via globs and content patterns. */
export interface PathRule extends RuleBase {
  kind: "protect" | "block" | "require-confirm" | "allow";
  path: string;
  /** For kind "block": regex applied to the written content. */
  pattern?: string;
}

/** Command rules gate shell commands / commit messages via regex. */
export interface CommandRule extends RuleBase {
  kind: "block" | "require-confirm" | "allow";
  command: string;
}

export type Rule = PathRule | CommandRule;

export interface GuardConfig {
  mode?: "enforce" | "log-only";
  defaultAction?: "allow" | "deny";
  rules: Rule[];
}

export function isPathRule(rule: Rule): rule is PathRule {
  return "path" in rule;
}

export function validateConfig(config: GuardConfig): string[] {
  const errors: string[] = [];
  if (config.mode !== undefined && config.mode !== "enforce" && config.mode !== "log-only") {
    errors.push(`mode inválido: ${String(config.mode)} (enforce | log-only)`);
  }
  if (
    config.defaultAction !== undefined &&
    config.defaultAction !== "allow" &&
    config.defaultAction !== "deny"
  ) {
    errors.push(`defaultAction inválido: ${String(config.defaultAction)} (allow | deny)`);
  }
  const seen = new Set<string>();
  for (const rule of config.rules ?? []) {
    if (rule.id === "") errors.push("toda regla necesita un id");
    if (seen.has(rule.id)) errors.push(`id duplicado: ${rule.id}`);
    seen.add(rule.id);
    if (isPathRule(rule)) {
      if (rule.path === "") errors.push(`regla ${rule.id}: path vacío`);
      if (rule.kind === "block" && (rule.pattern === undefined || rule.pattern === "")) {
        errors.push(`regla ${rule.id}: block requiere pattern`);
      }
    } else {
      if (rule.command === "") errors.push(`regla ${rule.id}: command vacío`);
    }
  }
  return errors;
}

/** Normalizes a config: fills defaults and ensures rules is an array. */
export function normalizeConfig(config: GuardConfig): Required<Pick<GuardConfig, "mode" | "defaultAction">> & GuardConfig {
  return {
    mode: config.mode ?? "enforce",
    defaultAction: config.defaultAction ?? "allow",
    rules: config.rules ?? [],
  };
}

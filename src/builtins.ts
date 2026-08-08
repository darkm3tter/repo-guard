import type { GuardConfig, Rule } from "./rules";

/** Safe-by-default rules. User rules with the same id win (override). */
export const BUILTIN_RULES: Rule[] = [
  {
    id: "builtin-protect-env",
    kind: "protect",
    path: "**/.env*",
    message: "los archivos .env contienen secretos",
  },
  {
    id: "builtin-protect-npmrc",
    kind: "protect",
    path: "**/.npmrc",
    message: "el token npm vive aquí",
  },
  {
    id: "builtin-protect-ssh",
    kind: "protect",
    path: "**/.ssh/**",
    message: "claves privadas SSH",
  },
  {
    id: "builtin-confirm-lockfile",
    kind: "require-confirm",
    path: "package-lock.json",
    message: "cambios en dependencias merecen revisión",
  },
  {
    id: "builtin-confirm-pkgjson",
    kind: "require-confirm",
    path: "package.json",
    message: "cambios en el manifiesto merecen revisión",
  },
  {
    id: "builtin-confirm-gitignore",
    kind: "require-confirm",
    path: ".gitignore",
  },
  {
    id: "builtin-block-secrets",
    kind: "block",
    path: "**",
    pattern: String.raw`(?i)(api[_-]?key|secret|password|access[_-]?token|client[_-]?secret)\s*[:=]\s*['"][^'"]{8,}['"]`,
    message: "parece un secreto hardcodeado",
  },
];

/** Merges built-in rules with the user config; user rules with the same id override built-ins. */
export function withBuiltins(config: GuardConfig): GuardConfig {
  const userIds = new Set(config.rules.map((r) => r.id));
  return {
    ...config,
    rules: [...config.rules, ...BUILTIN_RULES.filter((r) => !userIds.has(r.id))],
  };
}

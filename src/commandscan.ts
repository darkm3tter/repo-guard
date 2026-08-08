/**
 * Detects dangerous shell commands by pattern (no full shell parsing needed —
 * these are conservative heuristics; false positives are safer than misses).
 */

interface Pattern {
  label: string;
  re: RegExp;
  reason: string;
}

/** Matches a sensitive root path with optional trailing slash. */
const SENSITIVE_ROOT = String.raw`(\/|~[\\/]?|\$HOME[\\/]?|\/etc[\\/]?|\/home[\\/]?|\/Users[\\/]?|\/usr[\\/]?|\/var[\\/]?)(\s|$)`;

const PATTERNS: Pattern[] = [
  {
    label: "wipe-root",
    re: new RegExp(String.raw`\brm\s+-[a-z]*r[a-z]*f?\s+` + SENSITIVE_ROOT, "i"),
    reason: "rm -rf sobre raíz o directorio sensible (cubre también sudo rm)",
  },
  {
    label: "pipe-to-shell",
    re: /\b(curl|wget)\s+[^|;&]+\s*\|\s*(ba)?sh\b/i,
    reason: "descarga y ejecución directa (curl | sh)",
  },
  {
    label: "force-push",
    re: /\bgit\s+push\b[^|;&]*--force\b|\bgit\s+push\s+-f\b/i,
    reason: "git push --force",
  },
  {
    label: "chmod-world",
    re: /\bchmod\s+-R\s+777\b/i,
    reason: "chmod -R 777",
  },
  {
    label: "dd-disk",
    re: /\bdd\s+if=[^\s]+\s+of=\s*(\/dev\/|\/etc\/|\/home\/|\/Users\/)/i,
    reason: "dd escribiendo sobre dispositivo o directorio sensible",
  },
  {
    label: "mkfs",
    re: /\bmkfs(\.\w+)?\s+\/dev\//i,
    reason: "formateo de dispositivo",
  },
  {
    label: "fork-bomb",
    re: /:\(\)\s*\{\s*:\|:&\s*\}[\s;:]*$/i,
    reason: "fork bomb",
  },
  {
    label: "encoded-shell",
    re: /\bbase64\s+-d[^|;&]*\|\s*(ba)?sh\b/i,
    reason: "shell ofuscado vía base64",
  },
  {
    label: "del-windows",
    re: /\bdel\s+(?:\/[a-z]+\s+)+[a-z]:[\\/]/i,
    reason: "del /s /q sobre unidad Windows",
  },
  {
    label: "remove-item",
    re: /\bremove-item\b[^|;&]*-recurse[^|;&]*-force/i,
    reason: "Remove-Item -Recurse -Force (PowerShell)",
  },
];

export function detectDangerousCommand(command: string): string[] {
  const hits: string[] = [];
  for (const p of PATTERNS) {
    if (p.re.test(command)) hits.push(`${p.reason} (${p.label})`);
  }
  return hits;
}

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { withBuiltins } from "./builtins";
import { GuardEngine } from "./engine";
import { validateConfig, type GuardConfig } from "./rules";

export const VERSION = "0.1.0";

const HELP = `repo-guard — firewall programático de políticas para agentes de código

USO
  repo-guard check --write <ruta> [--content <texto>|--content-file <archivo>]
  repo-guard check --delete <ruta>
  repo-guard check --command "<comando>"
  repo-guard check --commit "<mensaje>"
  repo-guard report
  repo-guard config
  repo-guard mcp                     # arranca el servidor MCP (stdio)
  repo-guard --version | --help

OPCIONES
  --config <ruta>     config (default: ./repo-guard.config.json o REPO_GUARD_CONFIG)
  --log-only          no bloquea: reporta qué habría bloqueado
  --json              salida JSON

EXIT CODES
  0 permitido · 1 bloqueado/requiere aprobación · 2 uso incorrecto · 3 config inválida

CONFIG
  { "mode": "enforce"|"log-only", "defaultAction": "allow"|"deny",
    "rules": [ { "id": "...", "kind": "protect|block|require-confirm|allow",
                 "path": "glob", "pattern": "regex", "message": "..." } ] }
`;

export function loadConfig(explicitPath?: string): GuardConfig {
  const candidates = [
    explicitPath,
    process.env.REPO_GUARD_CONFIG,
    "repo-guard.config.json",
  ].filter((c): c is string => c !== undefined && c !== "");
  for (const candidate of candidates) {
    const abs = resolve(candidate);
    if (!existsSync(abs)) continue;
    try {
      return JSON.parse(readFileSync(abs, "utf8")) as GuardConfig;
    } catch {
      return { rules: [] };
    }
  }
  return { rules: [] };
}

export interface CliResult {
  exitCode: number;
  text: string;
}

export function run(argv: string[]): CliResult {
  const args = [...argv];
  const flags = {
    config: undefined as string | undefined,
    logOnly: false,
    json: false,
  };
  const action: { name?: string; kind?: string; path?: string; content?: string; command?: string } = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    switch (arg) {
      case "--version":
        return { exitCode: 0, text: VERSION };
      case "--help":
      case "-h":
        return { exitCode: 0, text: HELP };
      case "--config": {
        flags.config = args[++i];
        break;
      }
      case "--log-only":
        flags.logOnly = true;
        break;
      case "--json":
        flags.json = true;
        break;
      case "--write":
        action.kind = "write";
        action.path = args[++i];
        break;
      case "--delete":
        action.kind = "delete";
        action.path = args[++i];
        break;
      case "--command":
        action.kind = "command";
        action.command = args[++i];
        break;
      case "--commit":
        action.kind = "commit";
        action.command = args[++i];
        break;
      case "--content": {
        action.content = args[++i];
        break;
      }
      case "--content-file": {
        const file = args[++i];
        if (file === undefined) return { exitCode: 2, text: "error: --content-file requiere ruta" };
        try {
          action.content = readFileSync(resolve(file), "utf8");
        } catch {
          return { exitCode: 2, text: `error: no se pudo leer ${file}` };
        }
        break;
      }
      default: {
        if (action.name === undefined) {
          action.name = arg;
        } else {
          return { exitCode: 2, text: `error: argumento inesperado: ${arg}\n\n${HELP}` };
        }
      }
    }
  }

  const config = loadConfig(flags.config);
  if (flags.logOnly) config.mode = "log-only";
  const errors = validateConfig(config);
  if (errors.length > 0) {
    return { exitCode: 3, text: `config inválida:\n${errors.map((e) => `  - ${e}`).join("\n")}` };
  }

  const engine = new GuardEngine(withBuiltins(config));

  switch (action.name) {
    case "mcp": {
      return { exitCode: 0, text: "" }; // real MCP boot happens in main()
    }
    case "report": {
      return { exitCode: 0, text: JSON.stringify({ mode: engine.mode, rules: engine.describeRules() }, null, 2) };
    }
    case "config": {
      return { exitCode: 0, text: JSON.stringify({ mode: engine.mode, rules: engine.describeRules() }, null, 2) };
    }
    case "check": {
      if (action.kind === undefined || (action.path === undefined && action.command === undefined)) {
        return { exitCode: 2, text: "error: check requiere --write/--delete <ruta> o --command/--commit \"...\"\n\n" + HELP };
      }
      const result = engine.check({
        kind: action.kind as never,
        path: action.path,
        content: action.content,
        command: action.command,
      });
      return { exitCode: result.blocked || result.needsApproval ? 1 : 0, text: flags.json ? JSON.stringify(result, null, 2) : renderResult(result) };
    }
    default:
      return { exitCode: 2, text: `error: comando desconocido: ${String(action.name)}\n\n${HELP}` };
  }
}

function renderResult(r: { verdict: string; reasons: string[]; wouldBe: string | null }): string {
  const icon = r.verdict === "allow" ? "OK" : r.verdict === "deny" ? "BLOQUEADO" : "REQUIERE APROBACIÓN";
  const lines = [`repo-guard: ${icon}${r.wouldBe !== null ? ` (en log-only habría sido ${r.wouldBe})` : ""}`];
  for (const reason of r.reasons) lines.push(`  - ${reason}`);
  return lines.join("\n");
}

export async function main(): Promise<void> {
  const argv = typeof Bun !== "undefined" ? Bun.argv.slice(2) : process.argv.slice(2);
  if (argv[0] === "mcp") {
    const configIndex = argv.indexOf("--config");
    const config = loadConfig(configIndex !== -1 ? argv[configIndex + 1] : undefined);
    const errors = validateConfig(config);
    if (errors.length > 0) {
      console.error(`[repo-guard] config inválida:\n${errors.map((e) => `  - ${e}`).join("\n")}`);
      process.exit(3);
    }
    const { runMcpServer } = await import("./mcp");
    await runMcpServer(withBuiltins(config));
    return;
  }
  const { exitCode, text } = run(argv);
  if (text.length > 0) console.log(text);
  process.exit(exitCode);
}

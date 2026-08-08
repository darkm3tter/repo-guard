// Generic agent hook: reads the tool call JSON from stdin (opencode, Claude
// Code, Cursor), maps it to a guard check, and exits non-zero to block.
//
// Exit codes: 0 = allowed · 2 = blocked / needs approval · 3 = config error

import { loadConfig } from "./cli";
import { withBuiltins } from "./builtins";
import { GuardEngine } from "./engine";
import { validateConfig, type CheckKind } from "./rules";

interface ToolCall {
  kind: CheckKind;
  path?: string;
  content?: string;
  command?: string;
}

/** Tolerant extraction from the common hook payload shapes. */
export function extractToolCall(payload: unknown): ToolCall | null {
  if (typeof payload !== "object" || payload === null) return null;
  const p = payload as Record<string, unknown>;

  const toolName = String(p.toolName ?? p.tool ?? p.type ?? "").toLowerCase();
  const input =
    (typeof p.toolInput === "object" && p.toolInput !== null ? p.toolInput : undefined) ??
    (typeof p.input === "object" && p.input !== null ? p.input : undefined) ??
    (typeof p.arguments === "object" && p.arguments !== null ? p.arguments : undefined) ??
    p;
  const inputRec = input as Record<string, unknown>;

  const path = String(inputRec.filePath ?? inputRec.file_path ?? inputRec.path ?? inputRec.filename ?? "");
  const content =
    typeof inputRec.content === "string"
      ? inputRec.content
      : typeof inputRec.newContent === "string"
        ? inputRec.newContent
        : typeof inputRec.new_string === "string"
          ? inputRec.new_string
          : typeof inputRec.text === "string"
            ? inputRec.text
            : undefined;
  const command = String(inputRec.command ?? inputRec.cmd ?? "");

  if (toolName.includes("write") || toolName.includes("edit") || toolName === "notify") {
    if (path !== "") return { kind: "write", path, content };
    return null;
  }
  if (toolName.includes("delete") || toolName.includes("remove")) {
    if (path !== "") return { kind: "delete", path };
    return null;
  }
  if (toolName === "bash" || toolName.includes("terminal") || toolName.includes("shell")) {
    if (command !== "") return { kind: "command", command };
    return null;
  }
  if (toolName === "git" && command !== "") return { kind: "command", command };
  return null;
}

export function runHook(payload: unknown): number {
  const config = loadConfig();
  if (process.env.REPO_GUARD_HOOK_MODE === "log-only") config.mode = "log-only";
  const errors = validateConfig(config);
  if (errors.length > 0) {
    console.error(`[repo-guard] config inválida:\n${errors.join("\n")}`);
    return 3;
  }
  const engine = new GuardEngine(withBuiltins(config));

  const call = extractToolCall(payload);
  if (call === null) {
    // Tool shape not recognized — pass through (guard what we understand).
    return 0;
  }
  const result = engine.check(call);
  if (result.verdict === "allow") return 0;
  console.error(
    `[repo-guard] ${result.verdict === "deny" ? "BLOQUEADO" : "REQUIERE APROBACIÓN"}: ${call.kind} ${call.path ?? call.command ?? ""}`,
  );
  for (const reason of result.reasons) console.error(`[repo-guard]   - ${reason}`);
  return 2;
}

const isMain =
  process.argv[1] !== undefined &&
  import.meta.url.replaceAll("\\", "/").endsWith(process.argv[1].replaceAll("\\", "/"));

if (isMain) {
  // Read stdin as JSON and run.
  let buffer = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (chunk: string) => {
    buffer += chunk;
  });
  process.stdin.on("end", () => {
    try {
      const payload = buffer.trim() === "" ? {} : JSON.parse(buffer);
      process.exit(runHook(payload));
    } catch {
      console.error("[repo-guard] stdin no era JSON válido — pasando");
      process.exit(0);
    }
  });
  process.stdin.on("error", () => process.exit(0));
}

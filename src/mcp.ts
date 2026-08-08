import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { withBuiltins } from "./builtins";
import { GuardSession } from "./session";
import { validateConfig, type GuardConfig } from "./rules";
import type { CheckKind } from "./rules";

export interface GuardServer {
  server: McpServer;
  session: GuardSession;
}

export function text(content: unknown): { content: Array<{ type: "text"; text: string }> } {
  return { content: [{ type: "text", text: JSON.stringify(content, null, 2) }] };
}

const CHECK_SCHEMA = z.object({
  kind: z.enum(["write", "delete", "command", "commit"]),
  path: z.string().optional(),
  content: z.string().optional(),
  command: z.string().optional(),
});

export function createHandlers(session: GuardSession) {
  return {
    check: async (args: unknown) => {
      const parsed = CHECK_SCHEMA.parse(args);
      return text(
        session.check({
          kind: parsed.kind,
          path: parsed.path,
          content: parsed.content,
          command: parsed.command,
        }),
      );
    },
    report: async () => text(session.report()),
    config: async () =>
      text({ mode: session.describeMode(), rules: session.describeRules() }),
    allow: async (args: unknown) => {
      const { ruleId } = z.object({ ruleId: z.string() }).parse(args);
      return text({ allowed: session.allowRule(ruleId) });
    },
  };
}

/**
 * Builds the repo-guard MCP server. Tool handlers are exported separately
 * (createHandlers) so they can be unit-tested without a transport.
 */
export function createGuardServer(config: GuardConfig): GuardServer {
  const errors = validateConfig(config);
  if (errors.length > 0) {
    throw new Error(`config inválida:\n${errors.map((e) => `  - ${e}`).join("\n")}`);
  }
  const session = new GuardSession(withBuiltins(config));
  const handlers = createHandlers(session);
  const server = new McpServer({ name: "repo-guard", version: "0.1.0" });

  server.registerTool(
    "guard_check",
    {
      title: "Guard check",
      description:
        "Evalúa una acción contra las políticas del repo. Usa esto ANTES de escribir, borrar o ejecutar comandos. Devuelve allow/deny/confirm con razones.",
      inputSchema: {
        kind: z.enum(["write", "delete", "command", "commit"]).describe("Tipo de acción"),
        path: z.string().optional().describe("Ruta del archivo (write/delete)"),
        content: z.string().optional().describe("Contenido a escribir (write)"),
        command: z.string().optional().describe("Comando o mensaje de commit"),
      },
    },
    handlers.check,
  );

  server.registerTool(
    "guard_report",
    {
      title: "Guard report",
      description: "Resumen de la sesión: checks, bloqueos, confirmaciones, permitidos.",
      inputSchema: {},
    },
    handlers.report,
  );

  server.registerTool(
    "guard_config",
    {
      title: "Guard config",
      description: "Lista las reglas activas del repo (id, tipo, frontera) para conocer los límites.",
      inputSchema: {},
    },
    handlers.config,
  );

  server.registerTool(
    "guard_allow",
    {
      title: "Guard allow (temporal)",
      description:
        "Permite temporalmente una regla para el resto de la sesión. Devuelve false si el id no existe.",
      inputSchema: { ruleId: z.string() },
    },
    handlers.allow,
  );

  return { server, session };
}

export async function runMcpServer(config: GuardConfig): Promise<void> {
  const { server } = createGuardServer(config);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

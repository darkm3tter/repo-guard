# repo-guard

> **Firewall programático de políticas para agentes de código.** AGENTS.md sugiere; `repo-guard` **decide y bloquea**.

Los agentes de código (Claude Code, opencode, Cursor) ejecutan acciones con tus privilegios: escribir archivos, borrar, correr comandos. Las guías en texto (AGENTS.md) son *sugerencias* que el agente puede ignorar. `repo-guard` es un **motor de políticas ejecutable** que evalúa cada acción contra reglas deterministas y devuelve `allow` / `deny` / `confirm` con razones.

Diferente de los proxies MCP que gatean **por nombre de herramienta**: repo-guard inspecciona **qué toca tu repo** — rutas (globs), **contenido** (patrones de secretos) y **comandos** (`rm -rf`, `curl | sh`, `git push --force`).

## Instalación

```bash
npm install -g @darkm3tter/repo-guard   # CLI + hook
# o local:
npm install --save-dev @darkm3tter/repo-guard
```

## Uso rápido (CLI)

```bash
repo-guard check --write .env --content "X=1"
# repo-guard: BLOQUEADO
#   - ruta protegida: **/.env*

repo-guard check --command "git push origin main --force"
# repo-guard: BLOQUEADO
#   - git push --force (force-push)

repo-guard check --write src/app.ts --content "const x = 1"
# repo-guard: OK
```

Exit codes: `0` permitido · `1` bloqueado/aprobación · `2` uso · `3` config inválida.

## Configuración

`repo-guard.config.json` en la raíz del proyecto (o `REPO_GUARD_CONFIG`):

```json
{
  "mode": "enforce",
  "defaultAction": "allow",
  "rules": [
    { "id": "no-touch-secrets", "kind": "protect", "path": "**/.env*", "message": "secretos" },
    { "id": "no-logs-prod", "kind": "block", "path": "src/**", "pattern": "console\\.log" },
    { "id": "confirm-migrations", "kind": "require-confirm", "path": "prisma/migrations/**" },
    { "id": "no-force-push", "kind": "block", "command": "git push.*--force" }
  ]
}
```

| `kind` | Frontera | Efecto |
|---|---|---|
| `protect` | glob de ruta (write/delete) | `deny` |
| `block` | glob + regex de contenido (write) o regex de comando | `deny` |
| `require-confirm` | glob o regex | `confirm` |
| `allow` | glob o regex | `allow` (vence al default) |

Precedencia: **deny > confirm > allow > default**. Soporta `**`/`*`/`?` en globs y el prefijo `(?i)` en regex.

## Reglas built-in (overridables)

| id | Qué protege |
|---|---|
| `builtin-protect-env` | `**/.env*` |
| `builtin-protect-npmrc` | `**/.npmrc` |
| `builtin-protect-ssh` | `**/.ssh/**` |
| `builtin-confirm-lockfile` | `package-lock.json` |
| `builtin-confirm-pkgjson` | `package.json` |
| `builtin-confirm-gitignore` | `.gitignore` |
| `builtin-block-secrets` | secretos hardcodeados en cualquier write (`apiKey = "sk-..."`) |
| `builtin-dangerous-command` | `rm -rf /`, `curl\|sh`, `git push --force`, `chmod -R 777`, `dd`, `mkfs`, fork bombs, shell base64 |

Una regla del usuario con el mismo `id` sobreescribe la built-in.

## Modos

- **`enforce`** (default): bloquea de verdad.
- **`log-only`**: no bloquea — reporta qué habría bloqueado (`--log-only` en CLI, o `"mode": "log-only"`). Ideal para adopción gradual.

## Como MCP server

`repo-guard mcp` arranca un servidor MCP (stdio) que expone:

- `guard_check` — evalúa una acción (kind + path/content/command)
- `guard_config` — las reglas activas, para que el agente conozca los límites
- `guard_report` — resumen de la sesión (checks, bloqueos, confirmaciones)
- `guard_allow` — permite temporalmente una regla para la sesión

Configuración en Claude Code (`.mcp.json`) / opencode (`opencode.json`):

```json
{ "mcpServers": { "repo-guard": { "command": "repo-guard", "args": ["mcp"] } } }
```

## Como hook (bloqueo nativo)

El hook lee la llamada de herramienta del agente desde stdin y sale `!= 0` para bloquear. Ver `examples/opencode.hook.json` y `examples/claude-code.settings.json`.

```bash
echo '{"tool":"bash","toolInput":{"command":"rm -rf /"}}' | node node_modules/repo-guard/dist/hook.js
# [repo-guard] BLOQUEADO: command rm -rf /
```

## Desarrollo

```bash
bun install
bun test                 # 56+ tests
bun run typecheck        # TS estricto
bun run build            # dist/cli.js + dist/hook.js
```

## Licencia

MIT

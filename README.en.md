# repo-guard

> **Executable policy firewall for coding agents.** AGENTS.md suggests; `repo-guard` **decides and blocks**.

Coding agents (Claude Code, opencode, Cursor) act with your privileges: writing files, deleting, running commands. Text guides (AGENTS.md) are *suggestions* agents may ignore. `repo-guard` is an **executable policy engine** that evaluates every action against deterministic rules and returns `allow` / `deny` / `confirm` with reasons.

Unlike MCP proxies that gate **by tool name**, repo-guard inspects **what touches your repo** — paths (globs), **contents** (secret patterns) and **commands** (`rm -rf`, `curl | sh`, `git push --force`).

**[Español (README.md)](./README.md)** · English

## Install

```bash
npm install -g repo-guard        # CLI + hook
# or local:
npm install --save-dev repo-guard
```

## Quick start (CLI)

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

Exit codes: `0` allowed · `1` blocked/approval · `2` usage · `3` invalid config.

## Configuration

`repo-guard.config.json` at the project root (or `REPO_GUARD_CONFIG`):

```json
{
  "mode": "enforce",
  "defaultAction": "allow",
  "rules": [
    { "id": "no-touch-secrets", "kind": "protect", "path": "**/.env*", "message": "secrets" },
    { "id": "no-logs-prod", "kind": "block", "path": "src/**", "pattern": "console\\.log" },
    { "id": "confirm-migrations", "kind": "require-confirm", "path": "prisma/migrations/**" },
    { "id": "no-force-push", "kind": "block", "command": "git push.*--force" }
  ]
}
```

| `kind` | Boundary | Effect |
|---|---|---|
| `protect` | path glob (write/delete) | `deny` |
| `block` | glob + content regex (write) or command regex | `deny` |
| `require-confirm` | glob or regex | `confirm` |
| `allow` | glob or regex | `allow` (overrides default) |

Precedence: **deny > confirm > allow > default**. Globs support `**`/`*`/`?`; regexes support the `(?i)` prefix.

## Built-in rules (overridable)

| id | Protects |
|---|---|
| `builtin-protect-env` | `**/.env*` |
| `builtin-protect-npmrc` | `**/.npmrc` |
| `builtin-protect-ssh` | `**/.ssh/**` |
| `builtin-confirm-lockfile` | `package-lock.json` |
| `builtin-confirm-pkgjson` | `package.json` |
| `builtin-confirm-gitignore` | `.gitignore` |
| `builtin-block-secrets` | hardcoded secrets in any write (`apiKey = "sk-..."`) |
| `builtin-dangerous-command` | `rm -rf /`, `curl\|sh`, `git push --force`, `chmod -R 777`, `dd`, `mkfs`, fork bombs, base64 shells |

A user rule with the same `id` overrides the built-in.

## Modes

- **`enforce`** (default): actually blocks.
- **`log-only`**: never blocks — reports what would have been blocked (`--log-only` or `"mode": "log-only"`). Great for gradual adoption.

## As an MCP server

`repo-guard mcp` starts a stdio MCP server exposing:

- `guard_check` — evaluate an action (kind + path/content/command)
- `guard_config` — the active rules, so the agent knows the boundaries
- `guard_report` — session summary (checks, blocks, confirmations)
- `guard_allow` — temporarily allow a rule for the session

Claude Code (`.mcp.json`) / opencode (`opencode.json`):

```json
{ "mcpServers": { "repo-guard": { "command": "repo-guard", "args": ["mcp"] } } }
```

## As a hook (native blocking)

The hook reads the agent's tool call from stdin and exits `!= 0` to block. See `examples/opencode.hook.json` and `examples/claude-code.settings.json`.

```bash
echo '{"tool":"bash","toolInput":{"command":"rm -rf /"}}' | node node_modules/repo-guard/dist/hook.js
# [repo-guard] BLOQUEADO: command rm -rf /
```

## Development

```bash
bun install
bun test                 # 56+ tests
bun run typecheck        # strict TS
bun run build            # dist/cli.js + dist/hook.js
```

## License

MIT

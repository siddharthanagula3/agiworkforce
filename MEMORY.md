# AI Memory — AGI Workforce

Updated at session start. Stores patterns, debugging tips, and conventions.

## Architecture Decisions (Locked)

- **Tauri v2**: Desktop runtime (small binary, native perf, Rust security)
- **SQLite + Argon2id**: Local encrypted storage via SecretManager
- **ToolGuard**: All tool execution sandboxing and permission checks
- **MCP**: External tool integration (stdio, SSE, HTTP transports)
- **Cloud model routing**: Internal auto-routing; Custom Models = user-provided endpoints only

## Conventions & Patterns

**Development**:

- NO testing mid-stream — code + self-review only. Test only when asked.
- Research market BEFORE every user-facing feature (WebSearch + live docs)
- Parallel work: Always use sub-agents/teams for independent tasks (hard requirement)
- Conventional commits: `type(scope): lowercase subject` (max 100 chars)

**Security**:

- All secrets via SecretManager (never plaintext, never committed .env)
- Tauri filesystem deny list: `.docker`, `.npmrc`, `.pypirc`, `.netrc`, `.azure`, etc.

**API/Integration**:

- Custom models: OpenAI-compatible `/v1/chat/completions`
- MCP config: `.mcp.json` (project) + settings store (global)
- Tauri invoke: Frontend calls Rust `#[tauri::command]` handlers

## Debugging Checklist

| Issue               | Check                                                          |
| ------------------- | -------------------------------------------------------------- |
| Tauri invoke fails  | Rust command has `#[tauri::command]` + registered in `main.rs` |
| MCP won't connect   | Server running + correct transport type (stdio vs SSE)         |
| SecretManager error | Trace: Argon2id → SQLite → keychain decryption                 |
| MCP timeout         | Stdio/HTTP health check + child process exit detection         |
| API key fails       | Base URL (trailing slash), exact model ID match                |

## Build Commands

```bash
pnpm dev              # Frontend-only
pnpm tauri dev        # Full desktop (Rust + React)
pnpm tauri build      # Produces platform installer
pnpm typecheck        # TS check only
pnpm lint && cargo clippy  # Full lint
```

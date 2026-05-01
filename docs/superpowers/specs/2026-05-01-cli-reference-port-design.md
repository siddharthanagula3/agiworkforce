# CLI Reference Port — Design Spec

**Date:** 2026-05-01
**Status:** Approved
**Scope:** Port all missing `codex-rs` crates + `reference/src` TypeScript into the AGI Workforce monorepo

---

## Background

75 of ~98 `codex-rs` crates were previously migrated to `crates/agiworkforce-*`. 39 crates remain unported. Additionally, `~/Desktop/reference/src` contains 1,884 TypeScript files (Claude Code source) not yet integrated.

The goal: bulk-copy both sources, rename identifiers, wire into workspace.

---

## Step 1 — Port Missing `codex-rs` Crates (Rust → Rust)

### Source

`~/Desktop/reference/codex-cli/codex-rs/{crate-name}/`

### Target

`~/Desktop/agiworkforce/crates/agiworkforce-{crate-name}/`

### Missing crates (39 total)

**High-value (wire into apps/cli):**

- `rollout-trace` — session recording/replay, 3.5K LOC
- `core-plugins` — plugin marketplace (add/remove/upgrade), 11K LOC
- `core-skills` — skill injection + config rules, 7K LOC
- `memories` — long-term agent memory across sessions
- `model-provider` + `model-provider-info` + `models-manager` — model catalog management
- `thread-store` — thread persistence, 6K LOC
- `agent-graph-store` — agent graph storage
- `realtime-webrtc` — WebRTC voice interface
- `plugin` — plugin runtime

**Supporting (wire as deps):**

- `agent-identity`, `analytics`, `app-server`, `app-server-test-client`
- `aws-auth`, `cloud-tasks-mock-client`
- `codex-api`, `codex-backend-openapi-models`, `codex-client`, `codex-mcp`
- `collaboration-mode-templates`, `core-api`
- `device-key`, `external-agent-migration`, `external-agent-sessions`
- `file-system`, `install-context`, `response-debug-context`, `responses-api-proxy`
- `test-binary-support`, `thread-manager-sample`
- `tools`, `tui`, `uds`, `v8-poc`, `vendor`

### Rename rules (applied to ALL files in each crate)

| From                                  | To                    |
| ------------------------------------- | --------------------- |
| `codex` (lowercase)                   | `agiworkforce`        |
| `Codex` (PascalCase)                  | `Agiworkforce`        |
| `CODEX` (SCREAMING)                   | `AGIWORKFORCE`        |
| `codex-{name}` in Cargo.toml `name =` | `agiworkforce-{name}` |
| `codex_` (snake_case prefix)          | `agiworkforce_`       |
| Path `~/.codex`                       | `~/.agiworkforce`     |
| Env var `CODEX_`                      | `AGIWORKFORCE_`       |

### Per-crate steps

1. `cp -r ~/Desktop/reference/codex-cli/codex-rs/{name}/ ~/Desktop/agiworkforce/crates/agiworkforce-{name}/`
2. Bulk rename in all `.rs` + `Cargo.toml` files
3. Fix internal crate cross-references (e.g., `codex-core` → `agiworkforce-core`)
4. Add to workspace `Cargo.toml` members list
5. For high-value crates: add as dependency in `apps/cli/Cargo.toml`

---

## Step 2 — Port `reference/src` TypeScript (TypeScript → apps/cli-ts)

### Source

`~/Desktop/reference/src/` — 1,884 TypeScript files (Claude Code source)
Includes: `tools/`, `commands/`, `services/`, `context/`, `hooks/`, `screens/`, `assistant/`, `voice/`, `plugins/`, `skills/`, `query/`, `remote/`, `server/`, `tui/` (Ink-based), etc.

### Target

`~/Desktop/agiworkforce/apps/cli-ts/`

### Structure

```
apps/cli-ts/
├── package.json          (new — name: @agiworkforce/cli-ts)
├── tsconfig.json         (copy from reference structure)
└── src/                  (all files from reference/src/)
```

### Rename rules

| From                                | To                     |
| ----------------------------------- | ---------------------- |
| `claude` (lowercase)                | `agiworkforce`         |
| `Claude` (PascalCase)               | `Agiworkforce`         |
| `CLAUDE` (SCREAMING)                | `AGIWORKFORCE`         |
| `~/.claude` paths                   | `~/.agiworkforce`      |
| `CLAUDE_` env vars                  | `AGIWORKFORCE_`        |
| `@anthropic-ai/claude-code` imports | `@agiworkforce/cli-ts` |

### package.json

```json
{
  "name": "@agiworkforce/cli-ts",
  "version": "0.1.0",
  "type": "module",
  "bin": { "agi-ts": "./dist/entrypoints/claude.js" }
}
```

---

## Step 3 — Workspace Wiring

### Cargo.toml workspace members

Add all new `crates/agiworkforce-*` to the `[workspace] members` array.

### apps/cli/Cargo.toml

Add high-value crates as optional dependencies:

```toml
agiworkforce-rollout-trace = { path = "../../crates/agiworkforce-rollout-trace", optional = true }
agiworkforce-core-plugins  = { path = "../../crates/agiworkforce-core-plugins",  optional = true }
agiworkforce-core-skills   = { path = "../../crates/agiworkforce-core-skills",   optional = true }
agiworkforce-memories      = { path = "../../crates/agiworkforce-memories",      optional = true }
agiworkforce-thread-store  = { path = "../../crates/agiworkforce-thread-store",  optional = true }
```

### pnpm workspace

Add `apps/cli-ts` to pnpm-workspace.yaml packages list.

---

## Success Criteria

1. `cargo check --workspace` passes (or errors are only missing feature implementations, not naming/import errors)
2. All 39 new crates exist under `crates/agiworkforce-*`
3. No `codex` / `Codex` identifiers remain in any ported file
4. `apps/cli-ts/src/` exists with all 1,884 TypeScript files renamed
5. `apps/cli-ts/package.json` present, `pnpm install` succeeds

---

## Out of Scope

- Implementing missing feature logic (e.g., Guardian AI reviewer prompt engineering)
- Fixing compile errors from API mismatches between codex-core and agiworkforce-core
- Testing individual crate functionality
- CI/CD updates

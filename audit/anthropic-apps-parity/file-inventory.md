# AGI Workforce File Inventory

Last updated: 2026-05-21.

Generated from `rg --files -g '!node_modules' -g '!target' -g '!dist' -g '!build' -g '!.git'`.

## Summary

- Total scoped files: 6118.
- This count excludes common generated/build directories, but the worktree still contains many untracked docs, audits, and surface files.
- Do not use broad `git add .` or broad deletes during this transition.

## Top-Level File Counts

| Area       | Files | Notes                                                                        |
| ---------- | ----: | ---------------------------------------------------------------------------- |
| `apps`     |  4752 | Six user-facing surfaces plus sandbox app.                                   |
| `packages` |   492 | Shared TypeScript contracts, providers, routing, stores, MCP, unified chat.  |
| `crates`   |   178 | Rust runtime/protocol/task/plugin/support crates.                            |
| `tasks`    |   163 | Work queues, research packs, team status, historical execution notes.        |
| `docs`     |   141 | Durable product, architecture, surface, security, launch, and decision docs. |
| `services` |    88 | API gateway and signaling server.                                            |
| `examples` |    63 | Example apps and demos.                                                      |
| `audit`    |    93 | Audit reports, parity evidence, and relocated raw reference-index evidence.  |
| `supabase` |    46 | Database migrations/config.                                                  |
| `reports`  |    27 | Frontend/reference parity reports.                                           |
| `scripts`  |    23 | Audit, release, install, verification scripts.                               |
| `ios`      |    18 | Native iOS project artifacts.                                                |

## Surface Directories

| Surface           | Main paths                                                                                 |
| ----------------- | ------------------------------------------------------------------------------------------ |
| CLI               | `apps/cli`, `crates/agiworkforce-command-registry`, runtime crates                         |
| Desktop           | `apps/desktop/src`, `apps/desktop/src-tauri`                                               |
| Mobile            | `apps/mobile/app`, `apps/mobile/components`, `apps/mobile/services`, `apps/mobile/storage` |
| Web               | `apps/web/app`, `apps/web/features`, `apps/web/lib`, `apps/web/stores`                     |
| VS Code           | `apps/extension-vscode/src`                                                                |
| Chrome            | `apps/extension/src`, `apps/extension/native-host`                                         |
| Artifacts sandbox | `apps/sandbox`                                                                             |
| Shared UI/runtime | `packages/unified-chat`, `packages/runtime`, `packages/stores`, `packages/types`           |
| Providers/routing | `packages/providers`, `packages/routing`, `packages/llm-runtime`, `packages/llm-normalize` |
| MCP/connectors    | `packages/mcp`, `apps/cli/src/mcp`, Desktop MCP commands                                   |
| Cloud/services    | `services`, `supabase`, `packages/data-layer`, `packages/compliance`                       |

## Dirty Worktree Hazard

The transition is happening in a dirty worktree. Existing unrelated source and docs changes must be treated as user-owned unless explicitly tied to this transition.

Path-scoped edits made for this transition should be reviewed independently from unrelated modifications.

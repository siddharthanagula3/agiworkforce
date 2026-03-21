# TODO

_Last updated: 2026-03-21_

## Build Status (verified 2026-03-21)

- cargo check: PASS
- cargo clippy -D warnings: PASS (0 warnings)
- pnpm typecheck:all: PASS (13/13 workspaces)
- pnpm lint: PASS (0 errors, 0 warnings)
- Web chat deployed: https://agiworkforce-chat.vercel.app

## Codebase Metrics (verified 2026-03-21)

- 1,447 Tauri commands, 1,866 invoke() calls, 1,104 unique wired (76%)
- 732 tauri-mock entries
- All IPC casing correct (0 violations)
- All shell commands safe (`.arg()` method)

---

## Resolved — Session 14 (8-Agent Bug Sweep, 2026-03-21)

- [x] ChatMessage type centralization — canonical type in `packages/types/src/chat.ts`, duplicates removed
- [x] CSP tightened in artifact renderers — documented security trade-offs, removed where possible
- [x] CSRF middleware added to API gateway — `X-Requested-With` header check on state-changing requests
- [x] `execute_code` env_vars blocklist — dangerous vars (LD_PRELOAD, PATH, etc.) filtered
- [x] API base URL consolidated — single config source in `apps/desktop/src/api/config.ts`
- [x] Embedding dimension — standardized, removed meaningless zero-padding
- [x] Pairing code pattern — aligned server and mobile validation
- [x] Billing dead endpoint — updated to correct API gateway path
- [x] Budget/iteration-limit events — added frontend listeners with toast notifications
- [x] MCP connector manifests — removed/fixed broken `@anthropic/*` references
- [x] Console.log cleanup — removed debug logging from 10 production files
- [x] useEffect cleanup — verified timer/listener cleanup in hooks
- [x] Prettier formatting — fixed 288 doc file warnings
- [x] VS Code ext README — fixed 6 inaccuracies
- [x] Chrome ext cookies permission — narrowed or removed overbroad permission
- [x] OAuth state token — added TTL expiration to state tokens
- [x] DB migration verified — `web_conversations` issue addressed
- [x] models.json unified — canonical copy in `packages/types/src/models.json`
- [x] Workspace analytics RLS — added team member access policies

## Resolved — Session 13 (17-Agent Audit, 2026-03-21)

- [x] Phantom model IDs (`gpt-5-pro`, `deepseek-r1`) fixed in modelRouter.ts
- [x] IPC wiring gap: 27% → 76% (added checkpoints, artifacts, analytics, memory, MCP)
- [x] ESLint false positives from `.vercel/` build artifacts (12,360 errors → 0)
- [x] Clippy errors in CLI crate (too_many_arguments, derivable_impls)
- [x] 10 `#[allow(dead_code)]` cleaned from desktop Rust backend
- [x] 13 invoke() calls in workflow.ts wrapped in try/catch
- [x] localStorage token storage removed from 7 web app files
- [x] postMessage wildcard origin documented with safety rationale
- [x] Web chat deployed at chat.agiworkforce.com (prebuilt Vercel deploy)

---

## Features to Build

### Sprint 2 — Web Chat (spec: `docs/specs/sprint-2-web-features.md`)

- [x] Web chat deployment (chat.agiworkforce.com via Vercel prebuilt)
- [x] Cloud web mode in tauri-mock.ts
- [x] SSE LLM proxy in API gateway
- [x] Feature-hide desktop-only UI in web build
- [ ] Inline numbered citations with source cards
- [ ] Design system refresh ("Obsidian Glass" tokens)
- [ ] Rich structured widgets (comparison, pricing, timeline, stats)
- [ ] SSE thinking tag parser (wire to ThinkingBlock)

### Backlog

- [ ] Projects with knowledge base (PRD #6 — RAG pipeline, pgvector)
- [ ] Deep Research mode (PRD #7 — Perplexity integration, progress UI)
- [ ] QR pairing reliability to 99%+
- [ ] Event-triggered agents (Cursor Automations pattern)
- [ ] MCP spec 2025-11-25 full compliance (Tasks, Elicitation, Bundles)
- [ ] Desktop code signing (macOS + Windows)
- [ ] Mobile Expo store configuration
- [ ] CLI distribution pipeline (install script, Homebrew)
- [ ] Chrome extension store submission prep
- [ ] Web SEO + analytics + Sentry setup
- [ ] EU AI Act compliance prep (August 2026)

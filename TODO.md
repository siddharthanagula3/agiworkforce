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
- All IPC casing correct (0 violations in 528 audited calls)
- All shell commands safe (`.arg()` method used throughout)

---

## Resolved (Session 13 — 17-Agent Audit, 2026-03-21)

- [x] Phantom model IDs (`gpt-5-pro`, `deepseek-r1`) fixed in modelRouter.ts
- [x] IPC wiring gap: 27% → 76% (added checkpoints, artifacts, analytics, memory, MCP)
- [x] ESLint false positives from `.vercel/` build artifacts (12,360 errors → 0)
- [x] Clippy errors in CLI crate (too_many_arguments, derivable_impls)
- [x] 10 `#[allow(dead_code)]` cleaned from desktop Rust backend
- [x] 13 invoke() calls in workflow.ts wrapped in try/catch
- [x] localStorage token storage removed from 7 web app files
- [x] postMessage wildcard origin documented with safety rationale
- [x] Agent `app_handle` on cloned agent — verified CORRECT (set immediately post-clone)
- [x] Scheduler `_task`/`_job` mismatch — verified RESOLVED (proper `scheduler_*` commands exist)
- [x] Extension bridge case mismatch — verified CONSISTENT (SCREAMING_CASE both sides)
- [x] Missing vibe_sessions migration — verified EXISTS (16 migrations present)
- [x] Research cancellation — verified CORRECT (atomic flag with SeqCst)
- [x] Shell injection in Rust — verified SAFE (all use `.arg()`)
- [x] Connection::open().unwrap() in prod — verified ALL IN TEST CODE (55 occurrences, 0 production)
- [x] Web chat deployed at chat.agiworkforce.com (prebuilt Vercel deploy)

## Bugs to Fix (remaining from audit)

### Critical

- [ ] 26+ `ChatMessage` type definitions across surfaces — needs centralization to `packages/types`
- [ ] Desktop `models.json` possibly behind web — two copies that should be one
- [ ] DB migration: `ALTER TABLE web_conversations` may reference non-existent table (VERIFY)

### High

- [ ] CSP `unsafe-inline`/`unsafe-eval` in artifact renderers (ArtifactRendererView.tsx, ArtifactRenderer.tsx)
- [ ] Auth token lifecycle not synchronized across desktop/web/extension surfaces
- [ ] API base URL configuration drift (3 separate URL definitions)
- [ ] CSRF missing on 6+ POST endpoints in API gateway
- [ ] `execute_code` accepts unsanitized `env_vars` — no blocklist
- [ ] 35/87 MCP connector npm packages don't exist (404 on install)
- [ ] Billing: `useCancelSubscription` targets dead endpoint
- [ ] Pairing code pattern mismatch (server: 8 uppercase, mobile: 6-12 mixed)
- [ ] 768 vs 1536 embedding dimension mismatch
- [ ] Budget/iteration-limit events emitted but never listened to in frontend

### Medium

- [ ] 130+ console.log/warn/error calls in frontend production code
- [ ] 20-30 useEffect hooks with incomplete timer/listener cleanup
- [ ] VS Code ext README has 6 inaccuracies
- [ ] In-memory rate limiting needs Redis for production
- [ ] Chrome ext `cookies` permission overbroad
- [ ] OAuth state token stored as plaintext HashMap
- [ ] Workspace analytics RLS policies missing multi-tenant support
- [ ] 288 Prettier formatting warnings in doc files

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

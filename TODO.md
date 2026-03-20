# TODO

_Last updated: 2026-03-20_

## Build Status

- cargo check: PASS
- pnpm typecheck:all: PASS
- pnpm lint: PASS
- All 8 surfaces build clean

---

## Bugs to Fix (from 23-agent audit, 2026-03-20)

### Critical

- [ ] Agent `app_handle` not set on cloned agent — all frontend events silently dropped
- [ ] 7 phantom model IDs in `llm_router.rs` — `gemini-2.0-flash` (21 refs), `gpt-5` (9), `moonshot-v1-8k` (6)
- [ ] Desktop `models.json` 13 days behind web — two copies that should be one
- [ ] DB migration: `ALTER TABLE web_conversations` references table that was never created
- [ ] `MessageRole` exported twice with incompatible values (3 vs 4 roles)
- [ ] DB column `surface` vs app code `surface_id` — all heartbeat writes fail
- [ ] Model IDs `gpt-5.2` in mobile/vscode/gateway vs `gpt-5.4` in desktop/web

### High

- [ ] CSRF missing on 6+ POST endpoints (`auth/desktop-token`, `agents/execute`, `media/video/generate`, etc.)
- [ ] `execute_code` accepts unsanitized `env_vars` — no blocklist for `LD_PRELOAD`, `PATH`, etc.
- [ ] 35/87 MCP connector npm packages don't exist (404 on install)
- [ ] No audio playback layer for cloud TTS — MP3 bytes synthesized but never played
- [ ] Wake word detection never compares transcript to wake phrases — any speech triggers
- [ ] Billing: `users` table vs `subscriptions` table mismatch — UI reads stale data
- [ ] Billing: `useCancelSubscription` targets dead Netlify endpoint
- [ ] PlanBadge divides token count by 100 as cents — wrong math
- [ ] Budget/iteration-limit events emitted but never listened to in frontend
- [ ] Swarm events have zero frontend listeners
- [ ] Pairing code pattern mismatch: server expects 8 uppercase, mobile accepts 6-12 mixed
- [ ] `ArtifactType` defined 5+ times with incompatible shapes across surfaces
- [ ] `ApprovalRequest.status` uses `'denied'` vs `'rejected'` vs `'timed_out'` across surfaces
- [ ] 768 vs 1536 embedding dimension mismatch — zero-padding bridge is meaningless
- [ ] TF-IDF search index lost on restart — old memories invisible
- [ ] Research cancellation token never registered in active_sessions

### Medium

- [ ] VS Code ext README has 6 inaccuracies
- [ ] In-memory rate limiting needs Redis for production
- [ ] ~1,204 unwrap() calls in production Rust code
- [ ] IPC wiring gap: 643/1,439 commands wired (~45%)
- [ ] Chrome ext `cookies` permission overbroad
- [ ] Chrome ext scheduled tasks/shortcuts have backend but no popup UI
- [ ] OAuth state token stored as plaintext HashMap
- [ ] Argon2 params hardcoded, not stored with hash for migration

---

## Features to Build (from PRDs + competitive analysis)

### Sprint 2 — Web Chat (spec: `docs/specs/sprint-2-web-features.md`)

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

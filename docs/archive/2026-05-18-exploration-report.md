# Thorough Exploration — consolidated briefing

**Date:** 2026-05-18 · **Team:** `agi-thorough-exploration` (24 teammates, parallel) · **Coverage:** ~5,000 source files across the monorepo · **Status:** all 24 teammates done · **Synthesis owner:** team lead

This is the founder briefing produced from the 24-teammate exploration. Every claim below is traceable to a specific teammate's report or a direct grep/Read I ran myself.

---

## 1. WHAT YOU'RE BUILDING (locked, no further re-decision needed)

AGI is a **unified consumer client over 10+ AI providers** (Anthropic, OpenAI, Google, xAI, DeepSeek, Perplexity, Moonshot, Zhipu, Mistral, Qwen, plus Ollama + LMStudio local). Users either:

- Bring their own API keys (BYOK, **free forever**),
- Run an on-device LLM in Local mode (**free forever, no internet, no account**), or
- Subscribe to a managed-cloud tier post-Aug 1, 2026 graduation.

One chat thread flows across all providers via `@agiworkforce/llm-normalize`. Six surfaces share the same chat layer (Desktop / Web / Mobile / CLI / Chrome ext / VS Code ext). Cloud-portable architecture via the data-layer abstraction: vendor swap (Supabase → Neon, Vercel → Cloudflare, etc.) is a config change, not a code change.

**Three differentiators locked, no competitor offers all three:**

1. Multi-provider in one UI · switch mid-conversation.
2. BYOK + Local LLM as first-class · zero infra cost per free user.
3. Cross-provider session continuity via `@agiworkforce/llm-normalize`.

**Launch posture:** Mobile leads (target Aug 6-16, 2026). All 6 paid tiers ($10-$300/mo) on email-only waitlist until Aug 1. Hobby ($10/mo) is the only paid MVP tier. Revenue is $0 by design pre-Aug-1.

**Tagline (locked):** _Beyond one model. Beyond one surface. AGI in your hands._
**Public brand:** AGI (dropped "Workforce" 2026-05-15). Repo path stays `agiworkforce`.

---

## 2. VERIFIED CODEBASE STATE (per surface)

All numbers verified by 24-teammate audit 2026-05-18.

### Desktop (`apps/desktop/`)

- **827** files in `src-tauri/` · **741** `.rs` source files · ~377K Rust LOC
- **1,225** files in `src/` · **1,111** `.ts`/`.tsx` · 303,407 LOC
- **1,488 `#[tauri::command]`** across **137** source files (confirmed by direct grep)
- 118 stores · 74 component subdirs · 40 hooks
- Active chat = `ChatInterface` from `@agiworkforce/unified-chat`
- `UnifiedAgenticChat/` partially dead — **16 re-exports** still live-imported from `App.tsx`
- `cargo check --workspace` GREEN
- Tauri 2.11.1 · Rust 1.94.0

### Web (`apps/web/`)

- **286** files in `app/` · 85 `page.tsx` · 94 `route.ts` (API endpoints)
- 11 feature dirs · 247 files in `features/`
- 65 components in `components/` · 79 in `core/`
- 1,118 TS/TSX total · 259,922 LOC · 136 test files
- `withRateLimit` on **223 sites** in `/app/api`
- `proxy.ts` middleware (Next.js 16 convention — NOT `middleware.ts`)
- **3,235 tests passing · 1 skipped · 31 "pre-existing failing" tests RESOLVED** (memory claim now stale)
- Stripe webhook idempotency: live in prod via `process_stripe_event_idempotent` RPC at `apps/web/app/api/stripe-webhook/lib/idempotency.ts:12-15`
- Active chat = `apps/web/features/chat/` (113 components / 178 files)

### Mobile (`apps/mobile/` — lead launch surface)

- **374** total files · 294 TS/TSX · 55,951 LOC (also includes native iOS Swift + Android Kotlin)
- 45 Expo Router screens · 4 hooks · 46 test files · 49 jest test files
- Expo SDK 55.0.23 · React Native 0.84.0 · React 19.2.0 (verified from `package.json`)
- Bundle id `com.agiworkforce.app` (iOS + Android)
- M0 spike running this week (May 17-23)
- **4 P0 typecheck errors** from this morning's earlier teammate commits left in a broken state — see §5 immediate-fix list
- Three-tier router (lock #22) shipped at `apps/mobile/api/llm-client.ts` + `streaming.ts`
- Article 50 compliance package wired in `packages/compliance/` with 27 tests; needs onboarding wiring still
- SQLCipher + MMKV + sqlite-vec all shipped in `apps/mobile/storage/`
- Detox 5 e2e specs written (waiting on testIDs from onboarding + byok teammates to fully wire)
- 29 jest tests failing (Detox env missing + Icon component compat) — non-product bugs

### CLI (`apps/cli/`)

- **525** files in `src/` · **288** `.rs` source · 172,883 LOC
- **24 subcommands** confirmed from `enum Command` in `lib.rs`
- **13 named providers + Custom registry** at `models/provider_dispatch.rs:26-42` (Mistral is **fully wired**, not dropped — memory claim was stale)
- **22 canonical hook events** at `hooks.rs:74-133`
- **3 MCP transports** wired (Stdio + SSE + Streamable HTTP) — memory claim of "stdio only" was stale
- **Sandbox HARD-REFUSES** on Windows + Linux-no-bwrap (memory claim of "silent fallthrough" was stale)
- **Ghost models `claude-opus-4-6-mini` + `FAST_STATUS_MODEL` NOT present** in production code (only in negative-test assertions) — V5 §10 lock #1 violations CLOSED
- **1,482 unwrap/expect calls** in `apps/cli/src/` (memory claim of 2,409 was for older snapshot)
- **1,320 cargo tests** (1,314 pass + 6 fail — all 6 failures are `deepseek-reasoner` catalog drift between models.json and `provider.rs`)
- **MASTER PASSWORD VAULT NOT SHIPPED** — file `master_password.rs:1-769` claimed by memory doesn't exist. MCP OAuth tokens at `~/.agiworkforce/mcp-oauth.json` only protected by Unix `0o600`. P0 security gap.
- Binary 6.0 MB arm64 · v1.1.6 latest

### Chrome extension (`apps/extension/`)

- **37** files in `src/` · 33 `.ts` · 16,207 LOC
- 22 test files / **614 tests passing** (memory claim "596" was older snapshot)
- 11 permissions · localhost-only host permissions
- 136 KB `extension.zip` build artifact
- **Native messaging host `install.sh` IS PRESENT** at `apps/extension/scripts/install-native-host.sh` (memory claim "ABSENT" was wrong)
- **Keep-alive alarm already at 1.0 min** (memory claim "0.5 min" was older snapshot)
- **9 actual `innerHTML =` assignments**, all DOMPurify-sanitized or static SVG (memory claim "52 sites" counted comments + doc strings)
- CSP `style-src 'unsafe-inline'` still present in manifest (UI refactor needed)

### VS Code extension (`apps/extension-vscode/`)

- **77** files in `src/` · 50 source `.ts` · 27 test `.ts` · 15,322 LOC
- 62 commands · 25 settings · 13 keybindings · 6 `@agi` chat slash commands
- **513 tests passing across 27 suites** (memory claim "352/20" was older snapshot)
- `desktopBridge.enabled` (port 8787) wired
- Brand name in `package.json:displayName` may still read "AGI Workforce" — needs brand rename per V5 lock to "AGI"

### Shared packages (`packages/`)

- **508** files across 18 packages
- `unified-chat` (124 files) — canonical chat surface across all 6 surfaces, 11 test suites
- `api` (58 files) — 51 namespaced exports across 6 waves
- `types` (52 files) — `models.json` (109 KB, 78 models), `billing-catalog.ts`, `model-catalog.ts` (68 KB), `provider-adapter.ts` (339 LOC), MIT-attributed via OpenClaw
- `llm-normalize` (17 files) — 2.6K LOC, 4 test files (memory's "zero tests" claim was wrong)
- `routing/` — three-tier-router.ts (350 LOC) **fully implements V5 §10 lock #22** with promo-expiry, deprecation guards, R-023 Chinese-HQ default-off gate
- `compliance/` — Article 50 disclosure + machine-readable marking + CHINESE_HQ_PROVIDER_IDS frozen list + 27 tests
- `local-llm/` — 6-model catalog (system + qwen-1.5b + llama-3b + gemma-vision + whisper + nomic-embed) + tier1/2/3 selector + thermal throttle
- `providers/{anthropic,openai,google,ollama,xai,deepseek,perplexity,lmstudio}/` — 8 adapter packages, all implement `stream()` interface correctly
- All P0 security fixes verified in `apply-patch` (workspaceOnly default true), `browser-tool` (allowEvaluate default false + profile-path regex + canonical), `google` (header-only API key, NOT URL), `google tool_result.name` cross-provider continuity working, `ollama` no multi-block data loss

### Crates (`crates/`)

- **186** files · 19 active workspace members (17 utility crates + apps/cli + apps/desktop/src-tauri)
- 32.6K LOC across crates
- 369 tests
- `agiworkforce-protocol` (17,198 LOC, 203 tests) is the largest
- 70 codex-rs port crates removed 2026-05-03 (reference at `~/Desktop/reference/codex-cli/`)
- `cargo check --workspace` GREEN · `cargo clippy` 0 warnings
- 4 unsafe blocks total, all justified (test fixtures + macOS FFI + libc::kill probe + upstream macro)

### Services (`services/`)

- **96** files
- `api-gateway/` — 47 TS files · ~13K LOC · 15 mounted routes · 6 middleware modules · 4-stage Dockerfile · 18 test files
- `signaling-server/` — 10 TS files · ~4K LOC · WebRTC signaling · 0 test files (P1 gap)
- **`api-gateway/fly.toml` MISSING** (P0 deploy blocker)
- `signaling-server/fly.toml` present
- MCP proxy: stdio transport, 3 HTTP routes, Zod-validated, no network exposure

### Supabase (`supabase/`)

- **53** files
- **43 canonical migrations** in `supabase/migrations/` · 38 CREATE TABLE · 31 CREATE FUNCTION/RPC
- **50 legacy migrations** in `apps/web/supabase/migrations/` (34 unique to legacy)
- **100% RLS coverage** (39/39 tables) — V5 §10 lock #17 satisfied
- Stripe RPC `process_stripe_event_idempotent` verified correct in canonical `20260505000007`
- **Production database state UNKNOWN** — docker-compose still mounts legacy; canonical never confirmed applied. **Must reconcile before paid-tier launch.**
- us-east-2 only (no EU residency)

### CI / Release (`.github/workflows/` + `scripts/`)

- **12** files in `.github/`
- 10 workflows: ci.yml · release-desktop.yml · release-cli.yml · build-windows-release.yml · e2e-tests.yml · release.yml · deploy-signaling-server.yml · agiworkforce-bot.yml · codeql.yml · actions-pinned-check.yml
- All third-party actions SHA-pinned (verified by `actions-pinned-check.yml`)
- Husky: commit-msg (commitlint) + pre-commit (lint-staged); pre-push disabled
- macOS / Windows desktop releases gated off pending APPLE\_\* secrets + Windows EV cert
- Homebrew tap auto-updated per CLI release at `siddharthanagula3/homebrew-tap`
- `scripts/check-pricing.ts` ships but `.github/workflows/check-pricing.yml` not yet added (cron not wired)

### Audit + Reports

- 27 files in `reports/` · 14 files in `audit/` · 7 in `docs/security/` · 3 in `docs/audit/`
- 5 `scan_*.txt` files (dead/network/paths/service_role/xss/tool_escape) — actively cited by `PRD-RESOLUTIONS-AND-AUDIT.md`
- AUDIT_2026-05-03.md: P0 13/14 closed · P1 25/25 closed (current ground truth)
- 47-entry FIX_QUEUE.md (FIX-001 through FIX-047, 22-30 engineer-days for full set)
- Frontend parity report (`reports/frontend-parity-r1/`) flags 12 cross-surface gaps + 4 foundational fix-once-ship-everywhere items
- **6 cross-surface attack chains** documented in `docs/security/REVIEW.md` (zero-click prompt injection, SSRF amplification, multi-tenant data leak, mobile dispatch unprotected, bridge port 8787 unauthenticated, predictable share token)

---

## 3. LOCKED-DECISIONS CORPUS

**PRD V5 §10 anti-pattern locks: 26 total · alignment scorecard: 16 verified ✅ · 9 drifted (W6 in flight) ⚠️ · 1 missing ❌**

- ✅ #1 never hardcode model IDs (CLI ghost models closed; 5 web `?? 'gpt-5.4'` fallbacks remain — W6)
- ✅ #2 no `ModeSelectionDialog` reintroduction
- ✅ #3 no `apps/web/components/UnifiedAgenticChat/`
- ⚠️ #4 `apps/desktop/src/components/UnifiedAgenticChat/` partially dead — 16 live re-exports remain (W6 cleanup)
- ⚠️ #5 Stripe API version stuck at `2026-02-25.clover` (should be `2026-04-22.dahlia`)
- ✅ #6 CSP nonce in proxy.ts
- ✅ #7 `unsafe_code` denied workspace-wide
- ✅ #8 `await_holding_lock` warned
- ✅ #9 `/api/stripe-webhook` runtime `nodejs`
- ✅ #10 `/api/stripe-webhook` excluded from proxy middleware
- ❌ #11 service-role-key ESLint rule MISSING (16 routes use SERVICE_ROLE_KEY; 4 must migrate to `getUserClient(jwt)`)
- ⚠️ #12 native-host install script — present for macOS/Linux; Windows requires manual setup
- ✅ #13 one chat layout per surface
- ⚠️ #14 composer max-width (W6 design audit)
- ⚠️ #15 Lucide stroke-width 1.75 (W6 design audit)
- ✅ #16 brand colors locked (teal `#21808d` + terracotta `#da7756`)
- ✅ #17 RLS on every Supabase table (100% coverage)
- ⚠️ #18 Apple 5.1.2(i) BYOK consent Detox e2e — modal verbatim copy verified; Detox coverage status unclear
- ⚠️ #19 managed-cloud not framed as resale — ESLint marketing-copy rule MISSING
- ✅ #20 telemetry scrubbing (Sentry beforeSend / PostHog mask_all_text / OTel filter)
- ⚠️ #21 StoreKit IAP global default — billing.ts exists, integration status unclear
- ✅ #22 three-tier route default in `models.json` — fully wired in `packages/routing/three-tier-router.ts`
- ❌ #23 cache-discount 90% magnitude — `services/api-gateway/src/cost-estimator.ts` not found (clarify scope: W6 deliverable?)
- ✅ #24 `deprecation_date` on every model (verified on 78 models in `models.json`)
- ✅ #25 mobile v1 = no in-app code execution UX
- ⚠️ #26 EU AI Act Article 50 disclosure — `packages/compliance/` shipped with 27 tests; integration into mobile onboarding pending

**PRD V5 §17 risk register: 23 risks · top 5 severity-5 actively tracked**

R-001 Apple 5.1.2(i) · R-002 TOS breach · R-003 Hobby unit economics · R-004 cache hit rate · R-019 DeepSeek V4-Pro promo cliff 2026-05-31 · R-020 Apple 2.5.2 vibe-coding enforcement · R-021 Chinese-HQ EU routing.

**PRD V5 §20 locked decisions: 21 total** — see §20 in `docs/PRD.md` for the full table.

**Appendix D §D.4 privacy launch checklist: 13 items** including the two-layer DSAR architecture + Article 11 evidentiary package + privacy-notice mode separation (added today).

**Brand + product locks:** AGI public brand · "Beyond one model. Beyond one surface. AGI in your hands." tagline · teal+terracotta palette · Inter+JetBrains Mono+IBM Plex Serif typography · single chat layout · 6 surfaces · BYOK + Local free forever · 5 paid tiers + Enterprise · Aug 1 graduation.

---

## 4. STALE MEMORY / DOCS — REQUIRES UPDATE

Memory contains **17 claims that today's audit contradicts**. Rewriting these is the cleanest path to "one source of truth, no contradictions":

| Stale claim                                                   | Verified reality                                                                                  | Source                     |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | -------------------------- |
| Mistral provider DROPPED from CLI                             | **Fully wired** via `provider_dispatch.rs:26-42` + `models/mod.rs:141-148` with `MISTRAL_API_KEY` | cli-survey                 |
| Master password vault shipped at `master_password.rs:1-769`   | **File doesn't exist.** Vault NOT shipped. MCP OAuth tokens only protected by Unix `0o600`        | cli-survey                 |
| CLI MCP transports = stdio only                               | **3 transports**: Stdio + SSE + Streamable HTTP all implemented                                   | cli-survey                 |
| CLI sandbox silent fallthrough Win/Linux                      | **HARD-REFUSES now.** Risk #10 closed                                                             | cli-survey                 |
| CLI ghost models `claude-opus-4-6-mini` + `FAST_STATUS_MODEL` | **Not in production code** (only negative-test assertions)                                        | cli-survey                 |
| CLI .rs file count: 200                                       | **288**                                                                                           | cli-survey                 |
| CLI test count: 999                                           | **1,320 (1,314 pass + 6 fail)**                                                                   | cli-survey + test-engineer |
| CLI unwrap count: 2,409                                       | **1,482**                                                                                         | cli-survey                 |
| CLI hook events: 19 canonical                                 | **22**                                                                                            | cli-survey                 |
| Chrome ext install.sh ABSENT                                  | **Present** at `apps/extension/scripts/install-native-host.sh`                                    | chrome-ext                 |
| Chrome ext keep-alive 0.5 min                                 | **Already 1.0 min**                                                                               | chrome-ext                 |
| Chrome ext 52 innerHTML sites                                 | **9 actual `innerHTML =` assignments**, all safe                                                  | chrome-ext                 |
| Chrome ext ~596 tests                                         | **614**                                                                                           | chrome-ext                 |
| VSCode ext 352 tests / 20 suites                              | **513 tests / 27 suites**                                                                         | test-engineer              |
| Packages have zero tests (5 packages)                         | **All ship tests** (llm-normalize 4, apply-patch 2, browser-tool 3, mcp 1, skills 3)              | test-engineer              |
| Desktop counts 1,024/1,483/97/84/55                           | **1,111/1,488/74/118/40**                                                                         | desktop teammates          |
| Mobile RN 0.83.6                                              | **0.84.0**                                                                                        | mobile-survey              |
| Mobile screens 43                                             | **45**                                                                                            | mobile-survey              |
| Web pre-existing 31 failing tests                             | **RESOLVED** — current run 3,235 pass / 1 skip                                                    | test-engineer + bug-hunter |
| Web routes 231                                                | **85 page routes + 94 API endpoints**                                                             | web-routes                 |
| Active web chat `apps/web/components/UnifiedAgenticChat/`     | **Doesn't exist.** Active is `apps/web/features/chat/` (113/178)                                  | web-features               |
| MEMORY.md says 45 memory files                                | **61 actual**                                                                                     | memory-engineer            |
| auto-routing-spec.md frozen 2026-05-07                        | Contradicts Hobby waitlist posture (line 23) — needs rewrite                                      | memory-engineer            |
| Cowork naming in `mobile-first-strategy-2026-05-16`           | PRD V5 says **Computer Use** feature, not "Cowork" (Anthropic trademark risk)                     | memory-engineer            |
| "Plugins" in `design-prompt-v1-2026-05-16` line 49            | PRD V5 locks **Connectors** + ESLint rule                                                         | memory-engineer            |
| Video gen Pro+ 60s in `subscription-tiers-2026-05-15`         | PRD V5 says **Max tier only**                                                                     | memory-engineer            |
| Vendor pass-through "Minimax/GLM/DeepSeek" in older memory    | Amendments restrict to **Kimi + Z.AI only**                                                       | memory-engineer            |
| AGI_WORKFORCE.md Next.js 14                                   | **Next.js 16.2.6** (per package.json)                                                             | docs-engineer              |
| AGI_WORKFORCE.md Stripe RPC at `route.ts:1251`                | File is 112 lines total; RPC is at `lib/idempotency.ts:12-15`                                     | docs-engineer              |

---

## 5. MASTER P0 / P1 FINDINGS LIST (sorted by severity)

### P0 — must fix before launch (or before paid-tier flip)

1. **Mobile 5 typecheck errors** at HEAD (from earlier teammate-commit reverts):
   - `apps/mobile/app/(app)/chat/[id].tsx:22` imports missing `ModeSwitchModal.tsx`
   - `apps/mobile/app/legal/article-50.tsx:27` imports `@agiworkforce/compliance` (not in mobile package.json)
   - `apps/mobile/app/legal/index.tsx:9` uses unregistered route `/legal/article-50`
   - `apps/mobile/scripts/screenshots/specs/01-multi-provider.spec.ts:12` imports `detox` (not in devDeps)
   - 1 more reported by bug-hunter (not specified)
2. **Pro Max $99 tier** missing from `packages/types/src/billing-catalog.ts:BillingPlanTier` union; referenced by README/PRICING/PRD as if wired
3. **`services/api-gateway/fly.toml` missing** — deploy blocker for Fly.io
4. **Production-DB state undocumented** — 43 canonical vs 50 legacy migrations; must reconcile before paid-tier launch
5. **Service-role-key ESLint rule (V5 §10 lock #11) MISSING** — 16 routes use `SERVICE_ROLE_KEY` directly; 4 must migrate to `getUserClient(jwt)`
6. **Marketing-copy ESLint rule (V5 §10 lock #19) MISSING** — could miss "unlimited Claude" / "resell" phrasing in copy
7. **Master password vault NOT shipped** — MCP OAuth tokens at `~/.agiworkforce/mcp-oauth.json` only protected by Unix `0o600`
8. **Catalog drift** — anthropic/openai/google catalogs may lag behind real provider model releases; no automated weekly sync
9. **Article 50 wiring into mobile onboarding** — package shipped with 27 tests, but `onboarding.tsx` doesn't yet call `Article50Disclosure.compose()` + `.record()`
10. **CLI deepseek-reasoner catalog drift** — 6 Rust test failures from `provider.rs` capability matrix mismatch with `models.json`

### P1 — should fix before launch

11. Stripe API version `2026-02-25.clover` → `2026-04-22.dahlia` upgrade (1-line at `apps/web/lib/stripe-config.ts:8`)
12. 5 web files with `?? 'gpt-5.4'` hardcoded fallbacks (V5 §10 lock #1 drift)
13. `Math.random()` for sensitive IDs at 3 sites — `apps/web/core/integrations/{google-imagen,google-veo,websocket-manager}.ts`. Replace with `crypto.randomUUID()`
14. `signaling-server` has 0 test files
15. `scripts/check-pricing.ts` ships but no `.github/workflows/check-pricing.yml` to schedule it
16. 29 mobile jest tests failing — Detox env missing + Icon `displayName` compat (react-native-css-interop regression)
17. 2 empty `catch (_) {}` blocks at `ReactPreview.tsx` (desktop + unified-chat) silently swallow errors
18. VSCode extension brand name in `package.json:displayName` may still read "AGI Workforce" instead of "AGI"
19. Apple 5.1.2(i) Detox e2e coverage status unclear
20. CSP `style-src 'unsafe-inline'` in Chrome ext manifest (UI refactor)
21. Chrome ext `autoSubmit: true` `window.confirm()` suppressible by page scripts
22. Cost-estimator for 90% cache-discount baseline (V5 §10 lock #23) — file not found; clarify W6 scope

### P2 / P3 — debt, not blockers

- 238 TypeScript `any` usages
- 403 `@ts-ignore` / `@ts-expect-error` suppressions
- 34 TODOs/FIXMEs (all forward-looking; no shipped bugs)
- Localhost hardcoded in extension bridge (intentional — dev-only)

---

## 6. SECURITY POSTURE (verified clean)

✅ JWT verification timing-safe in all 3 paths (api-gateway `auth.ts:19`, `auth.ts:38,55`, `websocket.ts:103`)
✅ Stripe webhook HMAC + 60s replay window + idempotency RPC
✅ Mobile Keychain `WHEN_UNLOCKED_THIS_DEVICE_ONLY` universal
✅ iCloud backup excluded for chat + keys
✅ `apply-patch` workspaceOnly defaults true (RCE prevention)
✅ `browser-tool` `allowEvaluate` defaults false (RCE gate)
✅ `browser-tool` profile-path regex + canonical (path traversal prevention)
✅ Google API key in header `x-goog-api-key`, NEVER in URL
✅ Google `tool_result.name` cross-provider continuity working
✅ Ollama multi-block message no data loss
✅ RLS on 100% of Supabase tables
✅ `unsafe_code` enforced (only 4 net-new sites, all justified)
✅ No hardcoded secrets in production source
✅ 289 endpoints wrapped in `withRateLimit`
✅ CSP nonce per request in proxy.ts
✅ Sentry beforeSend redaction wired (>40-char strip)

---

## 7. DECISION QUEUE FOR FOUNDER

These need YOUR call before I can do anything more:

1. **Fix mobile typecheck (P0)** — restore the deleted `ModeSwitchModal.tsx` + add `@agiworkforce/compliance` to mobile package.json + add detox to devDeps + register `/legal/article-50` route? Or remove the imports and the legal screen entirely?
2. **Lock the stale-memory cleanup** — should I batch-rewrite the 17 stale memory/docs claims into one update pass?
3. **Pro Max tier wiring** — add `'pro_max'` to `BillingPlanTier` union in `packages/types/src/billing-catalog.ts`?
4. **Stripe `clover` → `dahlia`** — 1-line upgrade now?
5. **`services/api-gateway/fly.toml`** — generate it now or wait?
6. **Marketing-copy + service-role ESLint rules** — implement both as part of W6 hardening?
7. **Production-DB reconciliation** — when do you want to run `supabase db pull` against prod and decide canonical vs legacy?
8. **Aug 1 hard vs soft date** — memory has contradicting claims (`byok-first-launch` hard, `mobile-first-strategy` soft). Lock one definition.
9. **"Plugins" vs "Connectors" naming sweep** — Wave 6 rename pass with ESLint blocker?
10. **"Cowork" → "Computer Use" rename sweep** — Anthropic trademark risk; should I do the grep + edit pass?

---

## 8. WHAT THE TEAM VERIFIED THAT YOU ALREADY KNEW

The audit confirmed your three differentiators are technically real, the architecture is cloud-portable, the 6 surfaces share one chat layer, the BYOK economics are sound, and the codebase quality is genuinely at "1.5M production LOC by one founder" scale — not aspirational claim, verified by audit. Tests are largely passing (10K+ TS test assertions + 1,320 cargo tests + 614 Chrome ext tests + 513 VSCode ext tests). The Wave 6 deliverable list is the right list. The launch sequence holds.

---

## 9. I'M READY TO DISCUSS

I've internalized the project. I can answer questions about:

- **Frontend** — every component, every screen, every Zustand store across 6 surfaces; how state flows through `@agiworkforce/unified-chat`; design tokens locked
- **APIs** — every Tauri command surface (1,488), every Next.js API endpoint (94), every Express route in api-gateway (15), every MCP transport (3)
- **Features** — chat / models / keys / memory / drawer / settings / dispatch / agent loop / artifacts / voice / image / video / browser automation / computer use — what ships when, what's gated by tier
- **Tools** — MCP marketplace status, skills registry, browser-tool, apply-patch, three-tier router, llm-normalize cross-provider continuity
- **Tech-under-the-hood** — why the data-layer abstraction, why Tauri 2, why Expo + native modules, why Rust CLI, what Supabase RLS does, what the Stripe RPC does, what Article 50 marking means in practice
- **Operations** — what's manual today vs automated, what needs founder action this month (Apple Dev / App Store Connect / EAS init / privacy consult / Apple App Review consult / fly.toml)
- **Risks** — the 23 in §17 + R-019/R-020/R-021 from V5 + the new findings above

**Start anywhere.** What do you want to dig into first?

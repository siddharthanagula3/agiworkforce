# Code Reality & Tech-Debt Audit

Status: Strategy analysis (not source-of-truth)
Owner: Founder + platform lead
Last updated: 2026-06-27
Method: read-only audit of all 7 surfaces, `packages/`, `crates/`, `services/`, `apps/web/db/neon`; cross-checked against your `known-flaws.md`, `risk-map.json`, and TODO F01–F24.
Companion docs: `02-gap-analysis.md`, `04-scaling-to-1M-architecture.md`

This answers the part of the brief about "all the AI slop code built so far." The honest finding is the headline.

---

## 1. Headline: it is not slop

Calling this codebase "AI slop" or "implementation theater" would be **inaccurate, and worth un-learning** because it will make you under-sell to investors and over-cut in refactors.

- ~618K LOC of first-party TS/Rust. The **core product spine on every surface** (chat → real LLM call → real streaming → real persistence/tooling) is wired end-to-end with genuine provider integrations, not stubs.
- **6,782 Rust test functions** (644 files) + **824 TS/TSX test files**, with **zero** `expect(true).toBe(true)` hollow tests and **zero** `unimplemented!()`/`todo!()` panics in non-test Rust (gaps return graceful `Err(...)`).
- The most valuable signal is cultural: **stubs are labeled stubs, scripted demos are labeled scripted, empty endpoints return empty (not fabricated) data, and there is documented evidence of the team deleting fabricated data** (Math.random heatmaps, fake latency curves) rather than shipping it.

**Overall estimate: ~80–85% real / ~15–20% honestly-deferred-or-gated. Genuinely deceptive theater: under ~5%, and almost none of it user-reachable.**

The high raw "theater-marker" counts you may have seen (desktop 894, web 266) are inflated by benign matches — HTML `placeholder=` attributes, VS Code `placeHolder` props, a `todo_*` tool that is a _product feature name_, SQL `$1` placeholders, and "fake" in security comments. Real deferred-work stubs cluster in ~7 desktop Rust files and a handful of web peripherals.

### Per-surface scorecard

| Area                     | Rating                                   | % real  | One-line                                                                           |
| ------------------------ | ---------------------------------------- | ------- | ---------------------------------------------------------------------------------- |
| Web (Next.js)            | Production-ish (core)                    | ~80%    | Real auth → metered → 13-provider streaming → Neon. Peripherals honestly stubbed.  |
| Desktop (Tauri)          | Functional-partial → Production-ish      | ~88–92% | Largest, strongest surface. ~1,500 real commands, real agentic loop.               |
| Mobile (Expo/RN)         | Functional-partial (core Production-ish) | ~80%    | On-device LLM is the real deal. Cloud gated; TLS pins unprovisioned.               |
| CLI (Rust)               | Production-ish                           | ~90%    | Genuinely Claude-Code-class: 50+ real tools, real OAuth, privacy guards.           |
| Chrome ext (MV3)         | Functional-partial                       | ~75%    | Real handlers + browser actions; gated on desktop `/pair` bridge.                  |
| VS Code ext              | Functional-partial                       | ~75%    | Real provider client + agent loop; sign-in copy drift.                             |
| Shared `packages/`       | Production-ish                           | ~85%    | Real adapters (10+ providers), canonical contracts, `models.json` honored as SSOT. |
| `services/`              | Functional-partial                       | ~80%    | Real route gateway: streaming proxy, credits, sync, MCP, enterprise.               |
| `crates/`                | Production-ish                           | ~90%    | Clean Rust workspace; only 2 (legitimate) `unreachable!()`.                        |
| DB (Neon, 44 migrations) | Functional-partial                       | ~85%    | Substantial RLS schema; one real open gap (audit-log immutability).                |

---

## 2. Severity-ranked risk register

Each item: severity, evidence (file:line where known), and the fix. This is the queue to burn down before scale and before any diligence or compliance claim.

### Tier 1 — fix before public scale or any security/compliance claim

| #   | Sev              | Risk                                                                       | Evidence                                                                                                                                                    | Fix                                                                                                                                                |
| --- | ---------------- | -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | **HIGH**         | Audit-log tampering possible — `app_rls` role can UPDATE/DELETE audit rows | `apps/web/db/neon/0014_security.sql` (`security_audit_logs`, no REVOKE/trigger); tracked as `AUDIT-IMMUT-01`, migration 0043 drafted but disk stops at 0040 | Apply the append-only migration (REVOKE update/delete + trigger or partition); verify in Neon. Blocks any "tamper-evident audit" claim.            |
| R2  | **HIGH→MED**     | Mobile TLS pinning unprovisioned and disabled for all 5 prod hosts         | `apps/mobile/lib/pinning.ts:60-96` (`PLACEHOLDER_REPLACE_BEFORE_LAUNCH_*`, `PINNING_ENFORCED=false`)                                                        | Provision real SPKI pins + enable enforcement before App Store release. `check:tls-pins` lane already exists.                                      |
| R3  | **MED (latent)** | Rust-transport egress not covered by the JS egress guard                   | `risk-map.json` `BYOK-RUST-EGRESS-01`; `SyncManager` dormant; `sys/account/mod.rs` only reaches allowlisted `*.agiworkforce.com`                            | Keep dormant path gated. If `SyncManager` is ever wired, it MUST be privacy-mode-gated. Privacy is the product — this is the one to watch forever. |

### Tier 2 — real feature gaps that limit "parity" claims

| #   | Sev     | Risk                                                        | Evidence                                                                                                                    | Fix                                                                              |
| --- | ------- | ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| R4  | MED     | Office-doc _editing_ ~50% stubbed (creation works)          | `edit_excel.rs:205,213,221,236`; `edit_word.rs:114,122,133,145`                                                             | Finish the ops or scope the claim to "create + limited edit."                    |
| R5  | MED     | Mobile "vision/Image Q&A" is OCR-only                       | `apps/mobile/src/features/image/services/vision.ts:40-44` (`ocr-fallback`); `NativeModules.AGIVisionOCR` source unconfirmed | Ship a real on-device VL model or relabel as OCR.                                |
| R6  | MED     | "60+ language translation" is en↔hi only                    | `apps/mobile/services/translateService.ts:35`                                                                               | Align marketing to shipped scope.                                                |
| R7  | MED     | iOS Apple Foundation Models (advertised Tier 1) is a stub   | `ios/AGIWorkforce/AGIFoundationModels.swift:6` (`isAvailable=false`)                                                        | Implement or drop from the advertised tier list.                                 |
| R8  | MED     | Research email/calendar agents stubbed                      | `apps/desktop/.../core/research/agents.rs:584,664`                                                                          | Wire to connectors or hide until built. (Web/Document/Memory research are real.) |
| R9  | MED     | Cross-platform speech gaps (local Whisper STT; non-mac TTS) | `recognition.rs:212,445`; `tts.rs:415,447`                                                                                  | Fill gaps or document platform support honestly.                                 |
| R10 | LOW-MED | Web billing-history UI returns `[]` pending endpoints       | `features/billing/hooks/use-billing-queries.ts:447,636,692,772`                                                             | Build endpoints; honest stub today.                                              |
| R11 | LOW-MED | Enterprise SCIM/directory-sync not implemented              | `app/api/webhooks/directory-sync/route.ts:88`                                                                               | Required before enterprise sales motion (`06`).                                  |

### Tier 3 — hygiene and honestly-labeled deferrals

| #   | Sev | Risk                                                          | Evidence                                                                                                     | Fix                                |
| --- | --- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ---------------------------------- |
| R12 | LOW | Desktop `CodeModeHome.tsx` orphaned (exported, never mounted) | matches source-of-truth note                                                                                 | Mount with real data or delete.    |
| R13 | LOW | Dead Vite/Netlify image/video leftovers from a prior stack    | `core/integrations/google-{imagen,veo}-service.ts` (`/.netlify/functions/`, `VITE_*`, `via.placeholder.com`) | Delete — unreachable dead code.    |
| R14 | LOW | CLI SDK-mode flags accepted but bail                          | TODO F16                                                                                                     | Implement or remove from `--help`. |
| R15 | LOW | `/api/messaging/stats/[platform]` returns hardcoded zeros     | `route.ts:29` "mock stats for now"                                                                           | No UI consumers; delete or build.  |
| R16 | LOW | Mobile Settings "Skills"/"Plugins" dead-end                   | `settings/index.tsx:447,456`                                                                                 | Honest stubs; gate or build.       |
| R17 | LOW | Chrome/VSCode sign-in vs. API-key copy drift                  | TODO F21/F24                                                                                                 | Align copy to reality.             |

### Findings that did NOT hold up (your own TODO was stricter than reality)

Several TODO items are already fixed or were over-stated — evidence your ledger is conservative, which is good, but update it so you don't chase ghosts:

- **F08** (desktop `RateLimitState` would panic): **false** — registered at `apps/desktop/src-tauri/src/lib.rs:406`.
- **F09** (web compliance overclaims): **remediated** — trust/security pages now hedge ("Planned", "In progress", "We claim only what we have completed"). Conservative to a fault.
- **F07** (mobile dispatch accepts unsigned): **fixed** — `dispatchHmac.ts:399` rejects unsigned with full HMAC-SHA-256/HKDF/nonce-replay.
- **F10** (dead sidebar search button): **false** for current code — live sidebar `features/chat/v3/WebSidebar.tsx:337` is wired.
- **F04** (AgiChatDemo "live" overclaim): **not theater** — self-labeled "preview · example."

---

## 3. Genuine strengths (the diligence assets)

1. **A real multi-provider LLM layer, three times over** — web (13 providers), desktop Rust (20+ endpoints + a 70KB SSE parser handling Anthropic ping keepalives and tool-call deltas), and shared `packages/providers`. Real prompt caching, retry/backoff, tool transformation.
2. **The on-device mobile LLM** — a clean tier-1→2→3 native ladder with streaming callbacks, thermal checks, measured tok/s, and SHA-256-verified resumable downloads. The hard part, done right.
3. **Real credit/billing metering** with reserve-then-refund-on-failure and idempotency keys.
4. **A Claude-Code-class CLI** — LSP, worktrees, A2A, apply-patch, read-before-write freshness, approval gates.
5. **Security in hot paths, not just marketing** — CSRF + Zod length caps + IDOR-safe upserts; prompt-injection scanning + path canonicalization + rate limiting; SSRF allowlists; fail-closed gates.
6. **A self-auditing engineering culture** — the internal ledgers and a test suite with teeth (it caught the AutoEconomy routing regression). This is rare and worth showcasing in diligence.

---

## 4. Tech-debt themes (what to systematically pay down)

Beyond the line-item register, four structural themes will compound if ignored:

1. **Surface drift.** Six surfaces re-implement similar flows (chat, model selection, settings). Audit findings repeatedly cite per-surface divergence. The fix is to push more logic into `packages/` and `crates/` so behavior is defined once. This is also the scaling strategy (`04`).
2. **Marketing-vs-reality drift.** The recurring debt class is public copy outrunning shipped scope (mobile claims, "parity," trust-page claims pre-remediation). Institute a rule: a capability cannot appear in marketing until its parity-matrix row is `Present`. Wire it into `pnpm check:llm-failures` style guards.
3. **Honest stubs that never get finished.** Labeled stubs are good engineering but become permanent if untracked. Each Tier-2/3 stub needs an owner and a date, or an explicit "won't build" decision.
4. **Dead code from prior stacks.** Vite/Netlify leftovers, orphaned components. Small, but they confuse new contributors and AI agents working the repo. Sweep them.

---

## 5. Testing & verification strategy (to support 1M-user reliability)

You already verify more than most startups. To scale, add the layers that catch _integration_ and _trust-boundary_ failures, not just units:

- **Keep:** the Rust + TS unit suites; the `check:*` guardrails (`check:llm-failures`, `check:agent-context`, `check:boundaries`, `check:tls-pins`).
- **Add — trust-boundary contract tests as a first-class gate.** Property-style tests asserting "a Local thread can never produce a network call to a non-local host" across every surface. Privacy is the product; prove it mechanically. The Rust-egress latent risk (R3) is exactly what this catches.
- **Add — end-to-end demo-path tests per surface.** Your source-of-truth already says "do not mark complete from build success alone." Codify the launch-critical flows (empty chat → send → stream → persist → reload) as e2e/visual tests run in CI, per surface.
- **Add — load/soak tests on the shared backend** (`services/api-gateway`, signaling) before scale events. See `04` for the targets.
- **Add — a security regression suite** for the injection/SSRF/IDOR paths so fixes don't silently regress (the Chrome surface especially — that's where the injection tax lives).
- **Add — provider-contract tests** that run against recorded fixtures for all 15 providers, so a provider changing its SSE shape fails CI instead of production.

---

## 6. Bottom line for the founder

The narrative "I built a pile of AI slop" is wrong and costly. The accurate narrative is: _"I have a large, coherent, multi-surface product where the core flows are real and the incomplete parts are labeled."_ Your real exposure is narrow and specific — fix R1–R3 before scale, finish or relabel the Tier-2 stubs, sweep the dead code, and add trust-boundary + e2e gates. Everything else is honest, tracked debt around a working core. That is a fundamentally different — and far stronger — starting position than the brief assumed.

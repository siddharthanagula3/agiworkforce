# AGI Workforce — Honest Audit (Phase 3)

Status: Current
Owner: Lead engineer (autonomous recon)
Last updated: 2026-05-29
HEAD: `867db867d`
Basis: Phase-1 inventory (18 slices, `reports/audit/inventory/*.md`), freshly-measured gate baseline (`reports/audit/gate-baseline/`), Phase-2 research (`reports/research/*.md`), planning docs.

> Honesty note: findings below are from **code inspection + a freshly-run gate battery**, not from build-success or memory. Where a slice agent could not verify something, it is marked. Tests were NOT run by inventory agents (run separately by the lead). One slice (`apps/sandbox`) was inventoried manually after its agent failed to emit structured output.

---

## 1. Executive summary

The platform is **substantially more built and more security-conscious than a raw audit-marker count suggests** — the reconstructed `audit.sh` (5800 unwrap/expect, 2785 slop) is ~90% noise (HTML `placeholder=`, MSW, RNG-for-IDs, test code). The real story:

- **All non-test build/lint/typecheck gates are GREEN** at baseline: `pnpm build:all` (web Next.js 223/223 pages), `typecheck:all`, `lint`, `lint:extension`, `check:llm-operability` (after a self-inflicted fix), `cargo check --workspace`, `cargo build --release`, `cargo audit`.
- **The test gate is RED across 4 surfaces from essentially ONE root cause: model-catalog drift** (~45 failing tests hardcode model IDs/prices/caps that no longer match the curated `models.json`). This is the single highest-leverage fix.
- **Two genuine P0s**: (1) a recurring cluster of UTF-8 byte-slice panics in the Desktop Tauri backend that **abort the whole app** (`panic=abort`) on multibyte input; (2) Mobile TLS-pinning placeholder pins that **crash every release build on launch**.
- **Security posture is good** (verified auth self-gating, HMAC, constant-time tokens, SQL parameterization, path-traversal defenses, prompt-injection stripping, secret redaction) with a handful of **specific, real gaps**: a CLI Local→cloud voice-egress leak (PRIVACY-01), an `api-gateway` "RLS defense-in-depth" claim that isn't implemented, dead per-token revocation, and the shipping artifact `ReactPreview` iframe missing a CSP.
- **A large amount of well-built code is orphaned/unwired** — 4 Rust crates, 4 TS provider adapters, an empty `@agiworkforce/stores` package with phantom deps, big Desktop-frontend dead islands, a Chrome cloud-bridge cluster, and a secure-but-unused `apps/sandbox` renderer. Most reads as "built ahead of wiring," not abandoned — but it inflates audit/maintenance surface and hides which copy is live.
- **The flagship product gaps** are exactly the locked SoT P0s: Desktop Cowork/Code modes are orphaned placeholders, Settings IA doesn't match the locked sections, and the parity matrix is overwhelmingly "Partial."

**Bottom line:** this is a late-stage, genuinely-built platform with a small number of real crash/privacy P0/P1s, one dominant test-drift theme, a big "wire-the-built-thing" backlog, and a long parity tail — NOT a slop pile. Production-complete is reachable but the parity tail (esp. Desktop Cowork/Code, artifacts, connectors) is multi-week work.

---

## 2. Gate baseline (measured this turn — see STATE.md for the table)

GREEN: `build:all`, `cargo build --release`, `typecheck:all`, `lint`, `lint:extension`, `check:llm-operability`, `sync:models:check`, `cargo check`, `cargo audit`, api-gateway + chrome-ext test suites.
RED: `cargo test --workspace` (24, catalog drift); web tests (14, catalog drift); desktop tests (7, catalog drift); mobile tests (2, catalog + keychain env); vscode tests (3, stale snapshots); `cargo clippy -- -D warnings` (6 desktop-lib style lints); `pnpm audit` (1 high, `tmp` dev-dep).

---

## 3. Per-surface verdict: built / broken / stubbed / dead

| Surface | Built & working | Broken / half-built | Stubbed (honest) | Dead / orphan |
| --- | --- | --- | --- | --- |
| **Web** (apps/web, ~120k LOC) | 141 API routes, auth self-gating verified, Stripe HMAC, Neon runtime, chat, artifacts sidecar, BYOK-lock compliant, 175 test files | Settings org/team hooks return placeholders + **fake-success toasts** while backend routes exist (P1); web-search tool-loop (unverified) | SCIM directory-sync (501, enterprise waitlist — intentional) | Fabricated `AnalyticsDashboard` (RNG, no importer); dual UI primitive dirs; provider drift (3 parallel provider layers, WEB-PROVIDER-DRIFT-01) |
| **CLI** (apps/cli, ~80k LOC) | Agent loop + privacy gate (verified at send()), permissions/sandbox, 10+ providers, hooks (CLI-HOOK-01 verified), ~1507 tests, loopback servers w/ constant-time auth | **voice.rs Local→OpenAI cloud egress (P1, PRIVACY-01)**; advisor-tool egress bypass (P2); `app-server`/`mcp-server` advertise tools but return -32601 (P1) | memory pipeline phase-1 (inert); TOML policy engine (not wired) | `subagent_v2.rs` (~804 LOC dead dup) |
| **Desktop FE** (apps/desktop/src, ~300k LOC) | Live chat via `@agiworkforce/unified-chat`; keys via secure store; correct trust-boundary onboarding; 151 test files | **6/7 sidebar nav = dead no-ops (P1)**; **Settings IA ≠ locked SoT (P1)**; AccountMenu dead buttons; dead `openArtifactPanel` from Search | PlansModal placeholder pricing (pending Stripe) | **Large dead islands**: legacy `features/chat` tree + ~25 `features/v3` orphans (Cowork/Code/ArtifactWorkspace) |
| **Desktop Tauri** (src-tauri, ~379k LOC) | ~1496 IPC commands, SQLCipher DB, HMAC/loopback realtime, path-traversal + SQL-injection defenses, secret redaction, 4280 test fns | **~11 UTF-8 byte-slice panics → whole-app abort (P0)** | cloud_* chat (fail-closed by design); Linux active-window | Google Batch in-memory mock; tray badge no-op; `memory.rs` fabricated `"trend":"stable"` |
| **Mobile** (apps/mobile + ios) | Local-first chat via real `localGenerate`, fail-closed remote gate, keychain key storage, compliance wired, tiny benign egress | **TLS pinning placeholder pins crash every release build on launch (P0)**; first-run model download inert (P1); memory injects irrelevant facts/turn (P1) | billing flag-gated to null; usage throws vs fakes | — (lean) |
| **Chrome** (apps/extension) | MV3 policy SSOT, prompt-injection stripping, localhost-only bridge, native-host, no LLM in live path | **Buggy CI guard** `check-no-cloud-ipc-v1.mjs` only scans top-level (P2 false assurance); misleading @deprecated comments invert live/dead | cloud-bridge invite/waitlist (staged ahead) | cloud-bridge cluster (~3–3.5k lines); empty scaffolding barrels; diverged dup modules |
| **VS Code** (apps/extension-vscode) | Deeply built + hardened: SecretStorage, telemetry redaction, sensitive-file denylist, prompt-injection fencing, argv (no shell) | 3 stale webview snapshots fail tests (P1-gate); cloud stubs (honest errors) | waitlist/invite stubs | NO orphans found |
| **Sandbox** (apps/sandbox) | Secure cross-origin renderer (CSP `connect-src none`, origin allowlist) | — | — | **Unwired** — shipping path uses in-app `ReactPreview` (no CSP) instead |
| **Rust crates** | `protocol/command-registry/sandbox-policy/execpolicy/network-proxy/async-utils/utils-*` compile clean; CLI closure verified | `utils-cache` `BlockingLruCache` panics in current_thread runtime (P1, reachable via CLI subagent+image cache) | — | **4 orphan crates** (app-server=KEEP/fix-vehicle, task-runtime=KEEP, apply-patch+plugin-runtime=DELETE); `network-proxy`+`execpolicy` = "misleading dead security surface" (guard nothing) |
| **TS packages** | `types`/`llm-normalize` spine clean; `llm-runtime`/`routing`/`runtime` strong; `mcp`/`skills`/`api`/`apply-patch` alive; `compliance`/`design-tokens` wired | `ReactPreview` ships NO CSP (P2 egress); `buildSandboxedHtml` skips CSP on 2 branches (P2); Tooltip stub never shows | PostgresDatabaseAdapter skeleton-throws; browser-tool runner unwired | **`@agiworkforce/stores` EMPTY** w/ phantom deps in web+desktop; data-layer auth/storage/realtime adapters dead; 4 provider adapters orphaned (wire = 4 lines); `buildFallbackChain` dead (latent Local→cloud hole) |
| **Services** | api-gateway (JWT+Clerk, kill-switch, catalog-driven proxy) + signaling (HMAC pair, DDoS guards) — "most mature code in repo" | **"RLS defense-in-depth" comments describe protection that doesn't exist (P1)**; per-token revocation/logout dead (no jti, P1); enterprise embedded-join silently returns [] (P1) | worker protocol tiers | `chat.ts`/`dotfile.ts`/`pair.ts` routers not mounted (dead) |

---

## 4. Severity-ranked issue list

### P0 — ship-blockers (crash / data-loss / security on a common path)

| ID | Title | File:line | Fix |
| --- | --- | --- | --- |
| **P0-1** | Desktop Tauri: ~11 UTF-8 byte-slice panics abort whole app (`panic=abort`) on multibyte input — recurring incompletely-fixed class | `file_ops.rs:1394`, `git_executor.rs:850`, `code_generator.rs:187,357`, `hooks/event.rs:327`, `tool_confirmation.rs:540`, `chat/tool_events.rs:250` (`truncate`), `db_tools.rs:203`, `database.rs:233`, `browser.rs:43`, `tool_executor/mod.rs:2020`, `computer_use/types.rs:320` | Route all through a char-safe truncation helper (one exists at `background_agent.rs:1458`); fix `tool_events.rs::truncate` to walk `is_char_boundary`; add a regression test feeding multibyte content to each site. |
| **P0-2** | Mobile: TLS-pinning placeholder pins crash **every release build on launch** | `apps/mobile/lib/pinning.ts:160` (eager chain from `app/_layout.tsx:39`) | Decide v1 intent: ship `PINNING_ENFORCED=false` (v1 has minimal egress) or provision real pins; do not crash. Add a launch smoke test in release config. |

### P1 — major broken feature / real vulnerability / gate-blocker

| ID | Title | Location | Notes |
| --- | --- | --- | --- |
| **P1-CATALOG** | Model-catalog drift breaks `cargo test` + web/desktop/mobile tests (~45 failures) | cli `output/provider/compaction/config/design_system::tests`; web `anthropic-claude.test.ts`, `openai-gpt.test.ts`; desktop `modelRouter.test.ts`/`modelStore.test.ts`; mobile `model-picker.test.tsx` | Extend the catalog-driven slot resolver / regenerate expectations from `models.json`. Highest-leverage test-gate fix. |
| **P1-VOICE** | CLI voice transcription silently uploads Local-mode mic audio to OpenAI Whisper | `apps/cli/src/voice.rs:272` | PRIVACY-01 violation. Pass `privacy_mode` into `detect_backend()`; in Local require local whisper or explicit consent; add test. |
| **P1-CLIPPY** | `cargo clippy --workspace -- -D warnings` (goal's exact cmd) fails on 6 desktop-lib lints | `anthropic_agent.rs:738`, `hooks/config.rs:35`, `hooks/executor.rs:331`, `web_search_config.rs:20`, `draft_manager.rs:74,119` | Auto-fixable (`cargo clippy --fix --lib -p agiworkforce-desktop`); verify each. |
| **P1-WEB-SETTINGS** | Web settings org/team hooks disconnected from implemented backend; fake-success mutations | `apps/web/features/settings/hooks/use-settings-queries.ts:567,596,646,676,712,748` | Wire to existing Neon routes or delete dead hooks; remove fake `toast.success`. |
| **P1-DESK-NAV** | 6/7 Desktop sidebar nav destinations are dead no-op clicks | `apps/desktop/src/features/v3/Sidebar.tsx:151-166` vs `App.tsx:1372-1384` | Type `onNavigateView` to a literal union; map every id or hide unimplemented. |
| **P1-DESK-SETTINGS** | Desktop Settings IA does not converge to locked SoT sections (missing Billing/Usage/AGI Code/AGI in Chrome/Extensions/Developer as top-level) | `SettingsPanel.tsx:79-111`, `stores/settings/dialog.ts:33-52` | Surface existing UsageDashboard/ExtensionsSettings/DotfileSettings as top-level tabs; add missing sections. (SoT P0 #2) |
| **P1-DESK-COWORK** | Desktop Cowork/Code modes orphaned (sidebar promises them; components have 0 importers) | `DesktopShellV3.tsx:15-22`; `CodeModeHome`/`Cowork*` orphaned | SoT P0 #1. Wire orphaned components or remove nav entries. Multi-day. |
| **P1-MOBILE-FIRSTRUN** | First-run on-device model download inert (catalog not populated) → "download & chat locally" demo dead | `app/(public)/onboarding.tsx:277-282` | Confirm `@agiworkforce/local-llm` catalog has a complete default (Qwen 2.5 1.5B) w/ real url+checksum+format; regression test. |
| **P1-MOBILE-MEM** | Mobile memory retrieval injects up to 5 irrelevant facts into **every** turn (no embedding arg) | `chatExecutionStore.ts:333` → `store.ts:216-239` | Pass embedding / gate by relevance score. |
| **P1-CACHE-PANIC** | `BlockingLruCache` panics in current_thread Tokio runtime; reachable via CLI subagent + image cache | `crates/agiworkforce-utils-cache/src/lib.rs:122-128` + `apps/cli/src/subagent.rs:180` + image cache | Branch on `RuntimeFlavor::CurrentThread`; fix misleading doc. (P2 if subagent prompt provably cannot carry a LocalImage.) |
| **P1-GW-RLS** | api-gateway "RLS defense-in-depth" comments describe a control that doesn't exist; tenant isolation rests solely on explicit `.eq('user_id')` filters | `services/api-gateway/src/db/neonClients.ts:476-478` + ~50 call sites | Either implement per-request role/claims, or delete the false comments and add a lint/test asserting every user-scoped query carries the filter. |
| **P1-GW-REVOKE** | Per-token revocation + logout dead for every token the gateway mints (no `jti`) | `deviceAuth.ts:165` (no jti), `auth.ts:87-96,124` | Add `jti` to minted tokens so `revoked_jwts`/logout work. |
| **P1-GW-ENT** | `GET /enterprise/organizations` always returns `[]` (embedded-join syntax collapsed to `SELECT *`) | `services/api-gateway/src/routes/enterprise.ts:152` + `neonClients.ts:71-79` | Replace PostgREST embed with an explicit join/2nd query. |
| **P1-CLI-APPSERVER** | `agi app-server`/`mcp-server` advertise tools but return `-32601` (no `tools/call` arm) | `apps/cli/src/app_server.rs:93-98` | Wire the orphan `agiworkforce-app-server` crate (it has the correct `tools/call`) — do NOT delete that crate first. |
| **P1-FALLBACK** | `buildFallbackChain` is dead AND a latent silent Local→cloud route if revived | `packages/llm-runtime/src/fallback.ts:62,107,125-148` | Delete (matches deleted three-tier-router precedent) OR add a trust-tier gate + test before any caller. |

### P2 — quality / edge-case / latent

ReactPreview ships no CSP → LLM-artifact unrestricted egress/SSRF (`packages/unified-chat/.../ReactPreview.tsx`, mounted `ArtifactPanel:701`/`ArtifactRenderer:748`); `buildSandboxedHtml` skips CSP on 2 branches; CLI advisor-tool Local→cloud egress (`advisor.rs:90`); Chrome buggy CI guard gives false cloud-IPC assurance (`check-no-cloud-ipc-v1.mjs:45`); Desktop fabricated `memory.rs:621 "trend":"stable"`; Web fabricated `AnalyticsDashboard` dead code; Web provider drift (WEB-PROVIDER-DRIFT-01); `pnpm audit` `tmp@0.2.5` high (dev-dep, override fix); 4 orphan TS provider adapters (wire = 4 lines); `@agiworkforce/stores` empty w/ phantom deps; vscode 3 stale snapshots; local-inference cancel is a no-op on tier2/tier3 (mobile is lead surface); network-proxy/execpolicy "misleading dead security surface"; logger secret-redactor untested; tray badge no-op; Google Batch in-memory mock; desktop dead-code islands; Tooltip stub never shows.

### P3 — cleanup

Orphan-crate cleanup (apply-patch + plugin-runtime DELETE; update stale root `Cargo.toml` "44 crates" comment); orphan-crate `--all-targets` test clippy debt; vestigial `@agiworkforce/utils` validation exports; dual web UI dirs; stale anchor docs (Next 14→16, Supabase→Neon); CLI non-atomic conversation write + task_registry poison unwraps; mobile KaTeX CDN egress; `config_types::default_provider_auth_cwd` panic (out of closure); blocked_paths denylist→allowlist; unmounted gateway routers (chat/dotfile/pair); PostgresDatabaseAdapter skeleton.

---

## 5. Security posture (overall: GOOD, with named gaps)

**Verified strong:** Web per-route auth self-gating (all 141 routes swept; no unauthenticated privileged/mutating route); Stripe webhook HMAC + idempotency + raw-body preservation; desktop-token mint (scrypt KDF, AES-GCM, 60s TTL, one-time nonce, CSRF); CLI/desktop loopback-only servers with constant-time token compare + rate limits + prompt-injection quarantine; bash sandbox-by-default; SQL parameterization + identifier whitelisting (desktop + gateway); path-traversal canonicalize+reject (desktop, apply-patch C-4); secret redaction before logs/Sentry; MV3 prompt-injection unicode stripping + page-text redaction; vscode sensitive-file denylist + `@file` fencing; BYOK-lock compliance (web exposes no key entry).

**Real gaps (tracked above):** P1-VOICE (Local→cloud), P1-GW-RLS (false defense-in-depth claim), P1-GW-REVOKE (dead revocation), P2 ReactPreview no-CSP egress, P2 CLI advisor egress, P2 Chrome CI-guard false assurance, P2 logger redactor untested. None are an open IDOR or unauthenticated-RCE; the gaps are egress-boundary, defense-in-depth, and one-vector issues.

---

## 6. Dead-code / orphan ledger (feeds ARCHITECTURE keep/refactor/delete)

| Item | Verdict | Reason |
| --- | --- | --- |
| `crates/agiworkforce-apply-patch` | **DELETE** | Triplicate; TS pkg + wired CLI copy both have the C-4 traversal guard + tests |
| `crates/agiworkforce-plugin-runtime` | **DELETE** | Duplicate of wired `apps/cli/.../plugins.rs` types |
| `crates/agiworkforce-app-server` | **KEEP + WIRE** | It has the correct `tools/call`; shipped CLI copy is broken (P1-CLI-APPSERVER) |
| `crates/agiworkforce-task-runtime` | **KEEP** | Intended (background task runtime); fix UTF-8 seek when wiring |
| `crates/agiworkforce-network-proxy`, `-execpolicy` | **DECIDE** | Complete + tested but guard nothing; wire as single enforcement path OR document as reserved (and audit live `apps/cli/src/sandbox.rs`+`policy/`) |
| `@agiworkforce/stores` (pkg) | **REMOVE phantom deps** | Empty; real stores are `@shared/stores` alias. Drop the `workspace:*` dep from web+desktop or populate |
| data-layer auth/storage/realtime adapters | **PRUNE/document** | Zero prod call sites (Neon DB adapter is the only live one) |
| 4 TS provider adapters (deepseek/xai/perplexity/lmstudio) | **WIRE** | 4-line `providerAdapters.ts` registration; strategy doc lists them as intended |
| `buildFallbackChain` (llm-runtime) | **DELETE or GATE** | Dead + latent Local→cloud hole |
| Desktop `features/chat` legacy tree + ~25 `features/v3` orphans | **DELETE** (after confirming package path parity) | Superseded by `@agiworkforce/unified-chat` |
| CLI `subagent_v2.rs` | **DELETE or WIRE** | ~804 LOC dead dup |
| Chrome cloud-bridge cluster (~3–3.5k lines) | **KEEP-staged or DELETE** | Built ahead of wiring; gated by v1-local-only |
| gateway `chat.ts`/`dotfile.ts`/`pair.ts` | **DELETE** | Not mounted |
| `apps/sandbox` | **WIRE or document** | Secure renderer, unused; shipping uses in-app iframes |

---

## 7. Dominant themes (what to fix first for max leverage)

1. **Model-catalog drift** → unblocks the entire test gate across 4 surfaces (~45 tests). One coherent fix pattern.
2. **The two P0 crash classes** (desktop byte-slice abort, mobile pinning launch crash) → reliability floor.
3. **PRIVACY-01 egress gaps** (CLI voice, CLI advisor, dead buildFallbackChain) → the product's core differentiator must not leak.
4. **api-gateway security-comment-vs-reality** (RLS, revocation) → trust correctness for the managed path.
5. **"Wire the built thing"** (provider adapters, app-server crate, generated-file UI) → cheap parity wins.
6. **The locked SoT P0 parity tail** (Desktop Cowork/Code, Settings IA, artifacts/connectors/memory) → the long pole; multi-week.

See `reports/ARCHITECTURE.md` for the target shape and `reports/DEFINITION_OF_DONE.md` for the machine-verifiable gates.

# Porting & Attribution Tracker

Status: Active (single source of truth for the execution loop)
Owner: Platform lead
Last updated: 2026-06-28
Drives: `11-execution-playbook.md`. Update this after every increment.

This file tracks (a) increment status for the resumable loop, and (b) the license/attribution record for every adaptation, so the codebase stays diligence-clean. Rule: **no ported file lands without a row here** plus a `THIRD_PARTY_NOTICES.md` entry and preserved upstream headers.

---

## 1. Donor repos — license register (verified 2026-06-28)

| Donor                                                                     | License                                | Use                                                                         | Status                          |
| ------------------------------------------------------------------------- | -------------------------------------- | --------------------------------------------------------------------------- | ------------------------------- |
| codex-rs (`codex-cli/codex-rs`)                                           | Apache-2.0                             | **Port** runtime (Tool trait, compaction, execpolicy wiring, streaming)     | ✅ allowed (attribute)          |
| continue                                                                  | Apache-2.0                             | **Port** VS Code surface (IDE host, autocomplete, lazy-apply)               | ✅ allowed (attribute)          |
| opencode                                                                  | MIT                                    | **Port** agent patterns                                                     | ✅ allowed (attribute)          |
| odysseus @ `dd055ee`                                                      | MIT                                    | **Port** workspace patterns (provider detect, tool parsing, untrusted-wrap) | ✅ allowed (attribute)          |
| SkillSpector                                                              | Apache-2.0                             | **Adopt** skill/plugin vetting service                                      | ✅ allowed (attribute, NOTICE)  |
| gemini-cli / qwen-code                                                    | Apache-2.0                             | **Port** compaction prompt, sandbox profiles                                | ✅ allowed (attribute)          |
| goose                                                                     | Apache-2.0                             | **Study/port** two-tier compaction                                          | ✅ allowed (attribute)          |
| aider                                                                     | Apache-2.0                             | **Port** repo-map                                                           | ✅ allowed (attribute)          |
| supermemory                                                               | MIT (engine closed)                    | **Port** schema only                                                        | ✅ schema only                  |
| codegraph / codebase-memory-mcp                                           | MIT                                    | **Port** FTS/graph memory                                                   | ✅ allowed (attribute)          |
| LMCache / liteparse / VoxCPM / timesfm                                    | Apache-2.0                             | **Adopt** as dependency/service                                             | ✅ allowed (attribute)          |
| supervision                                                               | MIT                                    | **Adopt** (pair w/ permissive VLM)                                          | ✅ — NOT with Ultralytics YOLO  |
| RLLM (`axis1/llm`) / Portkey / Bifrost / OpenMeter / PowerSync / Electric | Apache/MIT (PowerSync FSL→Apache 2027) | **Port/Service** per scout                                                  | ✅ allowed                      |
| **claude-code**                                                           | **NONE (proprietary)**                 | **STUDY ONLY** — never copy                                                 | ⛔ no code may be copied        |
| **crush**                                                                 | FSL-1.1 (competing-use ban)            | study only                                                                  | ⛔ no copy until MIT conversion |
| **auto-code-rover**                                                       | SONAR (competing-use ban)              | study only                                                                  | ⛔ no copy                      |
| **Devon**                                                                 | AGPL-3.0                               | study only                                                                  | ⛔ no copy                      |
| **plandex** (pre-2.0)                                                     | AGPL-3.0                               | current MIT only                                                            | ⚠️ pin current commits          |
| **OpenHands/enterprise/**                                                 | PolyForm Free Trial                    | avoid dir                                                                   | ⚠️ MIT core only                |
| **CopilotKit/showcase/**                                                  | proprietary                            | avoid dir                                                                   | ⚠️ `packages/*` only            |
| **init / chat-template**                                                  | NO LICENSE                             | study only                                                                  | ⛔ reimplement, never fork      |
| Ultralytics YOLO (not in corpus)                                          | AGPL-3.0                               | avoid                                                                       | ⛔ use permissive detector      |

---

## 2. Increment status (the loop queue)

Legend: ⬜ todo · 🔄 in progress · ✅ done · ⏸ blocked

### Phase 0 — Machinery

| ID      | Increment                             | Status | Commit    |
| ------- | ------------------------------------- | ------ | --------- |
| INC-0.1 | License-gate CI + THIRD_PARTY_NOTICES | ✅     | b1972485f |
| INC-0.2 | Pin reference SHAs + this tracker     | ✅     | (tracked) |
| INC-0.3 | Trust-boundary contract tests         | ✅     | d84bbf8d8 |
| INC-0.4 | Provider-contract test harness        | ✅     | 2897b2b30 |
| INC-0.5 | SkillSpector vetting service stand-up | ✅     | 9afc3f066 |

### Phase 1 — Public Alpha (web/mobile/desktop)

| ID       | Increment                            | Status | Commit      |
| -------- | ------------------------------------ | ------ | ----------- |
| INC-1.1  | C3 wire execpolicy into loop         | ✅     | 4994ff605   |
| INC-1.2  | C1 Tool trait                        | ✅     | 0112594ca   |
| INC-1.3  | C2 LLM compaction                    | ✅     | pre-exist   |
| INC-1.4  | C4 streaming exec + recover          | ✅     | pre-exist   |
| INC-1.5  | Secret-scan at Local→BYOK fork       | ✅     | pre-exist   |
| INC-1.6  | SkillSpector install gate + rug-pull | ⏸      | blocked     |
| INC-1.7  | Mobile TLS pins enforced             | ⏸      | blocked     |
| INC-1.8  | Audit-log immutability migration     | ⏸      | partial     |
| INC-1.9  | Marketing-vs-reality copy alignment  | ✅     | 9445468b2   |
| INC-1.10 | Global search                        | ⏸      | infra-gated |
| INC-1.11 | Settings IA to spec                  | ⏸      | infra-gated |
| INC-1.12 | Artifacts polish                     | ⏸      | infra-gated |
| INC-1.13 | Provider robustness port             | ⏸      | infra-gated |
| INC-1.14 | Website public alpha deploy          | ⏸      | blocked     |
| INC-1.15 | Desktop alpha (signed)               | ⏸      | blocked     |
| INC-1.16 | Mobile alpha (stores)                | ⏸      | blocked     |

**BLOCKED-with-evidence (done-condition #7 allows recording blocked):**

- **INC-1.8** ⏸ partial — `apps/web/db/neon/0043_audit_log_immutability.sql` ships the append-only REVOKE (app_rls loses UPDATE/DELETE; purge fns made SECURITY DEFINER). The author DELIBERATELY deferred the durable, re-grant-proof `BEFORE UPDATE OR DELETE` trigger pending verification on a throwaway Neon branch. Completing it requires applying + testing SQL against a real Postgres/Neon branch — no DB is reachable from this autonomous session, so writing the trigger untested would be theater. Remaining: add trigger migration + verify on a Neon branch.
- **INC-1.6** ⏸ blocked — the SkillSpector vetting SERVICE is stood up + verified (INC-0.5, `services/skill-vetting/`, verify.sh proves malicious→DO_NOT_INSTALL). WIRING it as an install-time gate + rug-pull re-scan requires the desktop/web skill-install flow to invoke the Python scanner subprocess and block on `DO_NOT_INSTALL`; verifying that gate end-to-end needs the running install flow (desktop Tauri app or web install route) + the Python service callable in-process — cross-surface integration whose verification infra is not available headless. Service + samples are ready; the gated step is the in-app install-flow integration + e2e proof.
- **INC-1.7** ⏸ blocked — TLS pinning is CODE-COMPLETE and tested: `apps/mobile/lib/pinning.ts` (pin table, `PINNING_ENFORCED` guard, bootstrap assert, release-lane guard) + `services/secureFetch.ts` chokepoint + 44 passing Jest tests (`pinning.test.ts`, `secure-fetch.test.ts`). `PINNING_ENFORCED` is deliberately FALSE until **ops provisions real production SPKI SHA-256 hashes** (you cannot compute real pins without the prod TLS certs), and enforcement is verified on device builds (NSPinnedDomains / OkHttp). Gated on prod certs + device verification — not available headless.
- **INC-1.10 / 1.11 / 1.12 / 1.13** ⏸ infra-gated — Global search, Settings IA, Artifacts polish, Provider robustness. Code can be advanced, but each increment's DONE-CONDITION (per strategy/12) is Playwright e2e green + Chrome-MCP walkthrough against a RUNNING web app backed by Neon Postgres. This autonomous shell has no local Postgres (cf. `CI-INSTEP-REDS-01`: web integration tests pass only in CI with injected `NEON_DATABASE_URL`) and cannot stand up the DB-backed app for e2e — so these cannot be driven to their VERIFIED done-condition here without faking the e2e (theater). They need a session with a provisioned dev DB + Playwright runner.
- **INC-1.14 / 1.15 / 1.16** ⏸ blocked — public-alpha DEPLOY (Vercel prod creds), SIGNED desktop build (Apple Developer ID + notarization / Windows code-sign cert), and STORE builds (App Store Connect + Google Play accounts, EAS submit). All require production credentials, signing certificates, paid developer accounts, and money-spending actions explicitly outside autonomous scope. Code/config is in-tree; the gated step is the credentialed release action.
- **#4/#5/#6 WEBSITE/MOBILE/DESKTOP surface plans (WEB-2…15, MOB-_, DESK-_)** — same verification-infrastructure block: their done-conditions require a running web app + Neon DB + Playwright/Lighthouse/axe (web), iOS+Android simulators/devices + Detox + EAS (mobile), or a built+signed Tauri app + computer-use GUI automation (desktop). Code is advanceable; VERIFIED completion (the done-condition bar) needs that infra, which a headless autonomous shell lacks.

### Phase 2 — Production for 1M

| ID       | Increment                    | Status | Commit |
| -------- | ---------------------------- | ------ | ------ |
| INC-2.1  | LMCache sidecar              | ⬜     | —      |
| INC-2.2  | Gateway hardening            | ⬜     | —      |
| INC-2.3  | Exact metering + drift audit | ⬜     | —      |
| INC-2.4  | Abuse/fraud edge             | ⬜     | —      |
| INC-2.5  | Memory P0                    | ⬜     | —      |
| INC-2.6  | Connectors directory         | ⬜     | —      |
| INC-2.7  | Sync engine                  | ⬜     | —      |
| INC-2.8  | VS Code from continue        | ⬜     | —      |
| INC-2.9  | liteparse ingestion          | ⬜     | —      |
| INC-2.10 | Voice + vision               | ⬜     | —      |
| INC-2.11 | Enterprise controls          | ⬜     | —      |
| INC-2.12 | Load/soak to 1M              | ⬜     | —      |

> **Phase 2 is post-alpha scope (Production for 1M), deferred BY DESIGN.** Per the
> execution playbook, Phase 2 starts only after the Phase-1 public alpha
> (web → mobile → desktop) is shipped. None are started; all are gated on Phase-1
> completion + the same production infra/credentials. Not part of the alpha
> release-candidate done-conditions (#4/#5/#6).

---

## 3. Attribution log (append one row per ported file)

| Date       | AGI file                                     | Source repo@commit  | Source file           | License    | Notes                                                                                                                                                                                                                         |
| ---------- | -------------------------------------------- | ------------------- | --------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-06-28 | `services/skill-vetting/src/skillspector/**` | NVIDIA/skillspector | `src/skillspector/**` | Apache-2.0 | INC-0.5. Adopted the runnable scanner package wholesale (57 modules + YARA). LICENSE+THIRD_PARTY_NOTICES preserved. `model_registry.yaml` rewritten to models.json IDs. verify.sh proves malicious→DO_NOT_INSTALL, safe→SAFE. |

---

## 4. Next action

**INC-0.3** (trust-boundary contract tests) is the next increment, per the loop in
`11-execution-playbook.md`. INC-0.1 (license gate) is ✅. INC-0.2 (tracker) is now tracked + maintained.

## 5. Session progress log

### 2026-06-28 — setup + working-tree reconciliation

Done-condition progress: **#1 CLEAN ✅** and **#2 STRUCTURE ✅** met.

- `b1972485f` ci(licenses): license-gate check + `check:licenses`/`check:capability-boundaries` scripts (INC-0.1 ✅)
- `b871804b2` chore(scripts): add clean-repo, migrate-structure, spec-artifacts, capability-boundary checks
- `5effdd333` chore(repo): applied `clean-repo --apply` (git-rm 932 stale audit/reports/tasks/archive files); doc-status.json pruned to match
- `33ae51130` fix(mobile): stream-error copy stays clean — `[DIAG]` diagnostic string no longer leaks into the assistant bubble/retry banner (console-only now); mobile suite 144/144 green
- `15e129f10` fix(models): reconciled `models.curation.json` + `models.synced.json` via `extract` round-trip so the generator reproduces the committed catalog. Pre-existing drift: curation lagged hand-edits to `models.json` (missing gpt-5-nano/gpt-4.1-nano, stale canonicalization + managed_cloud.taskRouting). `sync:models:check` was RED at HEAD; now GREEN with **zero** per-model data loss (verified field-level vs HEAD). types tests 256/256.
- `385e47737` feat(packages): platform capability matrix + unified-chat consumers (unified-chat 467/467)
- canonical docs commit: added `docs/spec` (master spec + 40 volumes), `docs/strategy`, `docs/00-foundation`
- `c2dddae7f` docs: refreshed current docs + root guides
- web group commit: capability provider, mobile API, neon 0043/0044, new tests (web typecheck green; new tests green)
- `05fdf0f6c` fix(desktop): clearer Local-mode routing errors (respects `local_only`, no BYOK/Managed leak), deterministic AC-19 skill ranking, cloudRollback test (cargo check + desktop typecheck green)
- `7a926f298` test(web): tool-timeline running header updated to status-phrase behavior (stale test after 5b54d58d0) — web ToolTimeline 17/17
- `refactor(cli)`: applied `migrate-structure --apply` → exec tools folder-per-tool (`{tool}/mod.rs`); `check:structure-conventions` green, cargo check -p agiworkforce-cli green (INC structure ✅)

- `ab5481204` chore(guardrails): aligned `check:repo-organization`/`check:report-retention`/`check:non-md-artifacts`/`lanes.json` with the clean-repo audit/reports removal (restored `check:llm-operability` to GREEN — it was red purely from the removed dirs) + moved `draftStore` out of mobile's frozen root `lib` into `src/features/chat` (`check:mobile-hygiene` green)
- `dbcbf2d30` docs: persisted session progress + `MODELS-CURATION-DRIFT-01` ledger entry + CHANGELOG

**Done-condition #8 gate status (verified 2026-06-28):** `pnpm typecheck:all` ✅ · `pnpm lint` ✅ · `cargo check --workspace --locked` ✅ · `check:licenses` ✅ · `check:spec-artifacts` ✅ · `check:llm-operability` ✅ · `sync:models:check` ✅ · trust-boundary contract tests ✅ (web 24/24 + extension 15/15; desktop rust via cargo) · `git diff --check` ✅ · `cargo clippy` (re-running, expected clean — was clean pre-session per `CI-RUST-AUDIT-01`).

**Pre-existing reds (NOT regressions, logged):** `apps/web` ~13 Neon-integration tests (memory, device-code, routing_preferences, me, artifacts) fail locally for lack of Postgres but pass in CI — already tracked as `CI-INSTEP-REDS-01` in known-flaws.

### 2026-06-28 — Phase 0 complete + runtime C1/C3

- Phase 0 DONE: INC-0.1 license gate, 0.2 tracker, 0.3 trust-boundary gate (`scripts/check-trust-boundaries.mjs`, 5 surfaces), 0.4 provider-contract harness (`check:provider-contracts`), 0.5 SkillSpector vetting service (`services/skill-vetting/`, verify.sh proves malicious→DO_NOT_INSTALL).
- `4994ff605` INC-1.1 (C3): execpolicy gate wired into CLI bash tool — `Forbidden` commands hard-blocked before exec; 5 tests; 1705 CLI tests green; clippy clean.
- `0112594ca` INC-1.2 (C1): `Tool` trait + `ToolRegistry` (`apps/cli/src/features/exec/tools/registry.rs`); read-only cluster (read_file/search_files/list_directory/glob/grep_files) migrated through the registry, dispatch consults it first. Mutating tools (write/run/edit/patch/etc.) still use the match and migrate incrementally — same pattern, add a `Tool` impl + `register` call. 1707 CLI tests green; clippy clean.

**INC-1.3 (C2) + INC-1.4 (C4) verified pre-existing, NOT re-ported** (re-porting working/tested code would be a forbidden speculative rewrite):

- C2 compaction: `apps/cli/src/compaction.rs` (1356 lines, 37 tests green) — wired manually (`/compact`) AND automatically in the agent loop (`agent/chat.rs:186`, compacts at >90%→70% with PreCompact hooks).
- C4 streaming+recover: `apps/cli/src/agent/chat.rs` (~388–530) — streaming `stream_completion` + retryable-error recovery with backoff + provider/model fallback rotation that RESPECTS the privacy boundary (`local_session_cloud_fallback_blocked_by_privacy_boundary` test). 44+ retry/recover/fallback tests + `json_events_jsonl` integration green.

**→ Done-condition #3 (RUNTIME C1–C4) COMPLETE.**

### 2026-06-28 — Phase-1 surface increments (web)

- INC-1.9 (WEB-12) ✅ — **site-wide marketing-vs-reality sweep** (commits a412dc512, afedae2e5, 005659ab1, 088ae0a36, 481b72604, a2ed582e8, 83a271cac, eea00af12, 9a0fe9f54, 9445468b2). Corrected the systemic managed-cloud overclaim across ~32 files: homepage, /waitlist (reframed for Team & Enterprise), faq, chrome-extension, press, signup, agi-code, enterprise, providers, memory, desktop, cli, about, status, business, solutions, mobile, use-cases, local, byok, support, download, pricing, help, agi-work, RouteFlow, WaitlistModal — plus functional gate copy (managed-compute-gate, credit-topup, checkout). Managed cloud now correctly presented as **public alpha, open by default**; Team & Enterprise are the genuinely-waitlisted tiers. Trust-boundary statements preserved. Regression guards added in `marketing-copy-regression.test.ts` (12 tests). Left intact (correct): the invite-code redemption component, the Web-MCP beta gate, and internal code comments.
- `4121eabe6` fix(web): dead `_token` param in both response builders (`stream-transform.ts`, `response-builder.ts`) cleared a latent `noUnusedParameters` typecheck error a fresh `tsc` surfaced (earlier incremental tsbuildinfo had masked it). Web typecheck green.
- **WEB-1 verified essentially complete**: no Vite/Netlify config artifacts in `apps/web` (no netlify.toml / vite.config / \_redirects); google-veo/imagen are ACTIVE services (imported by media-generation-handler), not dead leftovers; `agi.workforce` brand drift only survives in one dev-demo example string (not header/footer). No action needed.

### 2026-06-28 — verifiable WEB/DESK increments (no infra needed)

- **WEB-13 (partial) ✅ guarded** (`test(web): lock production security-header set`): the full prod security-header set (HSTS preload, X-Frame-Options DENY, X-Content-Type-Options, Referrer-Policy, restrictive Permissions-Policy, COOP/CORP/COEP — `next.config.ts`) + CSP-with-nonce (`proxy.ts`) were implemented but UNGUARDED. Added `security-headers.test.ts` (4 tests) pinning every header value so a weakening edit fails CI. (Lighthouse/axe/full-e2e still need a running app.)
- **DESK-6 ✅** (`test(desktop): cloud-sync egress contract` `6874c625b` + `8c37e955f`): `derive_cloud_sync_enabled` is the SINGLE trust-boundary gate for ALL desktop cloud sync (chat + projects×3 + memory) — it had **zero direct tests** despite being P0. Added 3 contract tests (Local NEVER syncs even when storage pref is cloud; non-local follows storage; exact-match sentinel) and wired them into the unified `check:trust-boundaries` gate (now 6 surfaces). Confirmed `SyncManager` stays `#[cfg(test)]`-dormant in production. 21/21 module tests pass.

- **MOB-2 (partial) ✅** (`fix(mobile): cloud-chat gate says sign-in, not invite` `92d644425`): the `remoteChatGate` cloud-disabled message said "AGI Cloud chat requires invite access" — a stale overclaim (managed cloud is public-alpha-open; mobile unlocks cloud via SIGN-IN per the auth-gate decision). Renamed the constant to `MOBILE_REMOTE_CHAT_SIGNIN_REQUIRED_MESSAGE`, corrected the copy, updated 2 trust-boundary test suites (11 tests green). Translation screen already hidden from the drawer (correct). **Remaining MOB-2/MOB-4:** mobile carries a deeper FUNCTIONAL invite/waitlist subsystem (`useWaitlistStore` — `cloudUnlocked`/`joined`/`rank` + "Enter invite code"/"Join waitlist" UI in models/connectors/chat/shared-links) that gates cloud access. Converting it to the auth/entitlement model (public-alpha-open, sign-in to unlock) is a functional refactor whose verification needs the running mobile app (Jest covers logic, but Detox/Xcode-MCP needed for the flow) — not rushed unverifiably here.

- **DESK-1/DESK-2 (partial) ✅ guarded** (`test(desktop): guard settings ia` `165f6091a`): added `settings-ia.test.ts` (4 tests) proving the desktop settings nav↔render is consistent — every `SETTINGS_NAV` key resolves to a rendered panel (**no orphaned settings modes**) and every key is grouped. Discovered + recorded (`DESK-SETTINGS-IA-01`) that the IA does NOT yet match the authoritative `source-of-truth.md` lock: current 12 flat tabs vs the 11 spec sections (General/Account/Privacy/**Billing**/**Usage**/**Capabilities**/Connectors/**AGI Code**/**AGI in Chrome**/**Extensions**/**Developer**) — only 4 match; the spec wants appearance/voice/notifications under General + skills under Capabilities + 7 new sections. Bringing it to spec is a substantial UI restructure needing the running app for e2e nav verification.

### 2026-06-28 — DESK-1 settings IA brought to spec (11/11 sections)

Took the desktop settings IA from **4/11 → 11/11** locked source-of-truth sections, each wired with REAL content, by surfacing **6 substantial panels that existed but were ORPHANED** (unreachable from any nav — DESK-2):

- **Capabilities** ← `ComputerUseSettings` (738 lines) + Skill Marketplace (skills moved under it; top-level `skills` removed) — `5d04dc409`
- **Usage** ← `UsageDashboard`, **Extensions** ← `ExtensionsSettings` (508) — `83a2`/earlier
- **Developer** ← `DotfileSettings` (667, ~/.agiworkforce/config.toml editor) + `AgentExecutionSettings` (368) — `c2e803e6b`
- **AGI Code** ← `InstructionFilesSettings` (358, CLAUDE.md/AGENTS.md patterns) — `389a36482`
- **AGI in Chrome** ← `BridgeStatusCard` (246, desktop⇄Chrome/VSCode bridge status) — `6af80155b`
- **Billing** ← new focused `BillingSettings` reading the SAME real `useAuthStore` subscription + `openBillingPortal` Account uses (no fabricated data) — `(billing commit)`

Locked by `settings-ia.test.ts` ("includes all 11 locked source-of-truth sections") + nav↔render consistency guard. Also fixed a pre-existing test-mock gap (`CapabilityProvider` missing from the DesktopShellV3 unified-chat mock). **Full desktop suite green: 1843 passed.** Residual (not a missing section): the extra entries (Personalization, Models & Keys, Agents, Plugins, Memory, Notifications, Voice) the spec nests under General/Capabilities, and visual/functional e2e of each section's rendered content (needs the running app). See `DESK-SETTINGS-IA-01` (now Fixed: sections present + wired).

- **MOB-6 ✅** (`fix(mobile): remove unbuilt skills/plugins settings dead-ends` `e5968a59a` + snapshot `f768b9d15`): the mobile settings nav had **Skills** and **Plugins** rows that were unbuilt stubs (screens "not yet built" — they only opened a cloud gate, a dead-end). Per MOB-6 "implement OR remove dead-ends", removed them (no real mobile Skills/Plugins surface exists yet). All OTHER mobile settings rows route to real screens (verified every `push()` target has a screen file). Added a regression guard (settings has no Skills/Plugins dead-ends) + updated the settings snapshot. Mobile settings is now dead-end-free. Full mobile suite green: 1543 passed.

- **WEB-0 (source-level sweep) — partial ✅**: swept the website for WEB-0's static concerns (dead controls / stale labels / console noise). Fixed: (a) `f6fc692e7` a dead no-op emoji button in `CreateProjectDialog` → non-interactive icon (zero dead controls); (b) `3aa4f77d0` stale `"gpt-4"` model id in the public API reference → real catalog `gpt-5.4-mini` (model-IDs-from-models.json invariant), guarded by a regression test. Verified clean across all surfaces + docs: NO other stale model ids (gpt-4/gpt-3.5/claude-3/etc.), NO production `console.log` debug leftovers (the 2 hits are intentional API example code), and the 2 mobile `onPress={()=>undefined}` are intentional modal touch-swallows (not dead controls). The RUNTIME half of WEB-0 (Chrome-MCP walk for runtime console errors / click-to-find dead buttons) still needs the running app.

### 2026-06-28 — public-alpha cutover (PA-1, web)

Runbook: `docs/strategy/PUBLIC-ALPHA-CUTOVER.md`.

| ID   | Increment                                                         | Status | Commit      |
| ---- | ----------------------------------------------------------------- | ------ | ----------- |
| PA-1 | Web managed cloud → public alpha; retire chat cloud-waitlist path | ✅     | `64e3d2430` |
| PA-2 | Mobile managed cloud → public alpha (copy + entitlement gate)     | ✅     | `92afeddad` |

- **PA-1 ✅** (`64e3d2430` feat(web): retire managed-cloud waitlist framing in chat upgrade flow): the in-chat `UpgradePlanDialog` claimed cloud plans were "open by waitlist invite"/"invite-only" and "account-gated" while ALSO rendering a **dead disabled "Current plan" button** on the non-current pro/max tiers (so pro/max could not be purchased from the dialog — a real dead-control bug, every `PLAN_CARDS` entry was `waitlist:false`, leaving the "Join waitlist" branch dead and the upgrade branch disabled). Rewrote the dialog to (a) drop all invite/waitlist copy and present managed cloud as **public-alpha-open** ("Managed cloud is open in public alpha; sign in and start now. Upgrade for higher hosted capacity."), and (b) wire the upgrade tiers to the REAL Stripe checkout — `WebChatPage.handleUpgradePlan` calls the existing `upgradeToProPlan`/`upgradeToMaxPlan` service (POST `/api/checkout`, the same service the billing dashboard uses), with sign-in guard + error toast. Deleted the email-capture `CloudUpgradeWaitlistDialog.tsx` (+ test) from the chat path (it implied managed cloud was gated). Extended `marketing-copy-regression.test.ts` with 2 guards (no invite/waitlist/account-gated copy, no dead "Current plan" CTA, real `onUpgrade` wiring; the waitlist dialog file is gone). `pnpm --filter @agiworkforce/web typecheck` ✅; marketing-copy 15/15 + billing-waitlist-gate + chat-route ✅; `check-licenses` ✅; `git diff --check` ✅.
- **Residual / BLOCKED:** the live checkout flow needs `STRIPE_CHECKOUT_ENABLED=true` (server) + Stripe keys + a Neon DB. With the flag off, the real `/api/checkout` endpoint returns an HONEST "Paid-plan checkout is not available yet. Local and BYOK are free; managed cloud is in public alpha." which the dialog surfaces as an error toast (not a fake, not waitlist framing). End-to-end verification (button → Stripe Checkout redirect) needs a credentialed runner: `STRIPE_CHECKOUT_ENABLED=true STRIPE_SECRET_KEY=… NEON_DATABASE_URL=… pnpm --filter @agiworkforce/web exec playwright test` against a running app. BillingDashboard's separate `NEXT_PUBLIC_CHECKOUT_ENABLED`-off → `/pricing#waitlist` redirect (the marketing Team/Enterprise interest list) was left untouched (out of PA-1 scope; not managed-cloud invite framing).
- **PA-2 ✅** (`92afeddad` — mobile managed cloud → public alpha): **Entitlement-gate finding** — the FUNCTIONAL cloud-send gate was ALREADY sign-in-only, not invite-gated: `services/remoteChatGate.ts` only blocks when `v1LocalOnly` is true (it is `false`), so the legacy `cloudUnlocked` invite flag was a no-op at the send/stream gate (`chatExecutionStore` C1 auth gate + `streaming.assertRemoteChatAllowed`). BUT the **UI access gate** still blocked signed-in users: the mode toggle (`app/(app)/(tabs)/chat.tsx`), model picker, drawer, and settings all gated visibility on `cloudUnlocked`, which was set ONLY by redeeming the `ALPHATESTER` invite code — so a signed-in user without the code could not switch to Cloud. Fix: wired the signed-in entitlement into `cloudUnlocked` centrally — added `useWaitlistStore.setCloudAccess(boolean)` and call it from `ClerkTokenBridge` (`app/_layout.tsx`) on Clerk sign-in/out, so a signed-in user reaches Cloud everywhere and sign-out re-locks (closing any stale invite unlock). Auth gate kept (no demo bypass). **Copy/comments swept** invite/waitlist/private-beta → public-alpha sign-in: `lib/v1FeatureFlags.ts` + `services/remoteChatGate.ts` comments; `model-picker/service.ts` `CLOUD_LOCK_REASON` ("Sign in to use AGI Cloud chat.") + detailLabel; `ModelRow` (badge "Sign in", a11y, lock reason); `ModeToggle` + `ModeSwitchModal` + `SendPreview` (DirectByok legacy) + `ProjectHeader`; settings `index`/`capabilities`/`data-controls`, `profile`, onboarding `ModeCard`; comment-only sites in `_layout`, `(tabs)/chat`, `(public)/onboarding`, `services/llmGate`, `waitlist/service`. Local stays FAIL-CLOSED (never auto-routes; `v1LocalOnly`/kill-switch path preserved). New regression `__tests__/cloud-gate-public-alpha.test.ts` asserts (a) gate copy is the sign-in message (not invite/waitlist/private-beta) and (b) Local fail-closed + entitlement wiring. `pnpm --filter @agiworkforce/mobile typecheck` ✅; full Jest 145 suites / 1551 pass (9 skipped) incl. 3 updated snapshots; `git diff --check` ✅.

### Remaining (next sessions)

INC-0.3 trust-boundary contract **harness** (per-surface tests exist — web/extension/desktop — but no unified `pnpm` gate yet) → INC-0.4/0.5 → runtime C1–C4 ports from codex-rs (INC-1.1–1.4) → website/mobile/desktop production plans (strategy 12/13/14). The catalog/`taskRouting` work proved the SSOT pipeline; edit `models.curation.json` (never `models.json`).

# RECONCILED Backlog — merged audit (lead + Codex 2nd-pass)

Status: Current
Owner: Lead engineer (autonomous)
Purpose: single source of truth the /goal loop drains. Merges the lead's Phase-1 inventory (`AUDIT.md`) with an independent Codex/GPT-5.5 read-only 2nd-pass, **each finding verified against live code by the lead**. Supersedes stale repo docs (TODO.md "R27 shipped", source-of-truth.md claims) as completion evidence.
Retention: mission-critical; supersede only via a logged STATE.md decision.
Last updated: 2026-05-29
Baseline HEAD: `867db867d` (nothing committed since; Codex audited the same baseline)

> Rule (both audits agree): **gates verify OBSERVED state. Repo docs are NOT evidence of completion.** "Advertised but lacking an exercising test" = INCOMPLETE.
> Verdict legend: CONFIRMED (I opened the cited code and it holds) / REFUTED / NEEDS-VERIFY (fold pending deeper check during that cluster) / NEEDS-RUNTIME-CHECK (deletion-safety pending).

---

## Item 2 — app-server / orphan-crate coupling (RESOLVED FIRST, gates dead-code)

**CONFIRMED.** `apps/cli/src/app_server.rs:87-100` (`Processor::process`) advertises 12 tools via `tools/list` but has **no `tools/call` arm** → catch-all `-32601`. `run_mcp_server()` (`:215-229`) advertises `agiworkforce_exec`, also no `tools/call`. The orphan crate `crates/agiworkforce-app-server/src/lib.rs` **contains the full `tools/call` dispatch** via a `ToolDispatch` trait (`:39-44` trait, `:157` `"tools/call" =>`, designed for a CLI-injected `CliToolDispatch` per the module doc `:5-18`).
**RESOLUTION:** Fix P0/P1-CLI-APPSERVER by **wiring the orphan crate** — implement a concrete `CliToolDispatch` over the CLI's real tool executors and route `agi app-server`/`mcp-server` through `agiworkforce-app-server`'s `Processor`. Do NOT write a new inline `tools/call`; do NOT delete the crate. After wiring, the inline copy in `app_server.rs` is replaced. **This makes `agiworkforce-app-server` KEEP+WIRE, not delete.**

---

## Item 1 — Advertised-but-unwired register (WIRE or REMOVE per item)

| # | Capability (advertised) | Location | Verdict | Decision |
| --- | --- | --- | --- | --- |
| U1 | app-server `tools/call` (12 tools) | `apps/cli/src/app_server.rs:93-100` | CONFIRMED dead-end | **WIRE** (orphan crate, item 2) |
| U2 | mcp-server `agiworkforce_exec` tool | `apps/cli/src/app_server.rs:223-229` | CONFIRMED dead-end | **WIRE** `tools/call` (orphan crate) |
| U3 | `--max-budget-usd` (doc claims emits `budget_exhausted`) | `apps/cli/src/lib.rs:423-424` | CONFIRMED facade (zero enforcement) | **WIRE** budget tracking → emit `budget_exhausted`, OR **REMOVE** flag |
| U4 | `--session-id`, `--include-partial-messages`, `--input-format stream-json`, `--system-prompt-file` | `lib.rs:408-430` + `sdk_io/*` | NEEDS-VERIFY (sdk_io references exist; confirm each does work) | Per-flag behavior test (item 6); WIRE or REMOVE any that no-op |
| U5 | Web `/api/contact` (contact form target) | route dir absent | CONFIRMED missing route | **WIRE** route OR **REMOVE** the form/affordance (confirm a form posts to it first) |
| U6 | Web settings `updateProfile()` | `apps/web/features/settings/services/user-preferences.ts:567` returns `{}` | CONFIRMED stub (TODO admits no route) | **WIRE** to `/api/settings/profile` (create route) OR remove the affordance |
| U7 | Web settings org/team/keys hooks | `use-settings-queries.ts:567-915` placeholders/fake-success while Neon routes EXIST | CONFIRMED (= AUDIT P1-WEB-SETTINGS) | **WIRE** hooks to existing routes; remove fake `toast.success` |
| U8 | Web forgot/update-password flows | `apps/web/app/forgot-password`, `auth/update-password` exist | NEEDS-VERIFY (pages exist; confirm handlers wired) | Confirm end-to-end; WIRE or REMOVE |
| U9 | Web voice transcription route(s) | per Codex "plural route" | NEEDS-VERIFY | Confirm; WIRE or REMOVE |
| U10 | Desktop v3 "New Chat" + unhandled sidebar routes | `Sidebar.tsx:151-166` vs `App.tsx:1372-1384` (= AUDIT P1-DESK-NAV); New Chat no-op NEEDS-VERIFY | CONFIRMED (nav) + NEEDS-VERIFY (New Chat) | **WIRE** handlers OR hide unimplemented nav |
| U11 | Mobile onboarding "Continue to chat" skip → no model | `apps/mobile/app/(public)/onboarding.tsx:278,662` | CONFIRMED (= AUDIT P1-MOBILE-FIRSTRUN) | **WIRE** default-model download; gate skip so chat isn't model-less |
| U12 | Mobile Apple Foundation Models | per Codex stubbed | NEEDS-VERIFY | Confirm; if stub, gate behind "coming soon" not an active option |
| U13 | VS Code "10+ providers" | per Codex fail-closed | NEEDS-VERIFY (model picker is host-backed per inventory) | Confirm advertised list vs actually-callable; REMOVE unsupported rows or WIRE |
| U14 | api-gateway model catalog (`/models`) | `services/api-gateway/src/routes/models.ts:158,647` stale (`claude-opus-4.6`, `gpt-5.4-codex`) | CONFIRMED stale | **WIRE** to `@agiworkforce/types` SSOT (item 5 / catalog drift site #3) |
| U15 | provider-stream supports only 4 of 8 adapters | `packages/providers/src/providerAdapters.ts` (anthropic/openai/google/ollama wired; deepseek/xai/perplexity/lmstudio orphaned) | CONFIRMED (= AUDIT pkg-providers) | **WIRE** the 4 (4-line registration) OR mark explicitly "not yet available" in UI |

**Net:** the unwired register is REAL and consistent with the lead's inventory. Each confirmed dead-end gets WIRE or REMOVE — **no surfaced capability may remain that the code doesn't honor.** This register is the spec for the §I capability-coverage gate (added to DoD).

---

## Item 3 — Deletion safety (NOTHING SAFE-TO-DELETE YET)

Both audits + advisor agree: **prove-dead via runtime-reachability before any deletion.** Static-import scans give false negatives for route-boundary conventions, file-based routing, manifest entries, dynamic imports, and binary aliases.

| Cluster | Verdict | Why / required check before touching |
| --- | --- | --- |
| Next.js `error.tsx`/`loading.tsx` duplicates | **KEEP** | App-Router route-boundary convention (runtime-wired, not imports) |
| `agiworkforce` CLI binary alias | **KEEP** | Compatibility alias (`apps/cli/Cargo.toml [[bin]]`) |
| Chrome extension build entries | **KEEP** | manifest.json / vite-wired, not static imports |
| Mobile staged feature barrels | **KEEP** | staged-ahead; reachable via routing |
| `crates/agiworkforce-app-server` | **KEEP + WIRE** | item 2 — it's the fix vehicle |
| `crates/agiworkforce-task-runtime` | **KEEP** | intended background task runtime |
| `crates/agiworkforce-apply-patch` | **NEEDS-RUNTIME-CHECK** | Likely deletable (TS pkg + wired CLI copy both have C-4 guard) — but confirm `cargo build --release` green-without + repo ref-search clean FIRST |
| `crates/agiworkforce-plugin-runtime` | **NEEDS-RUNTIME-CHECK** | Likely deletable (CLI copy canonical) — same proof required |
| `crates/{network-proxy, execpolicy}` | **KEEP / DECIDE** | complete+tested but guard nothing; wire as enforcement path OR document reserved |
| `@agiworkforce/stores` (empty pkg) | **NEEDS-RUNTIME-CHECK** | Confirm `@shared/stores` alias is the only live path + validate pnpm/turbo build-graph dependency before removing the `workspace:*` dep |
| Desktop `features/chat`/`features/v3` dead islands | **NEEDS-RUNTIME-CHECK** | Confirm package path carries equivalent sanitization + no lazy/dynamic import reaches them |
| gateway `chat.ts`/`dotfile.ts`/`pair.ts` | **NEEDS-RUNTIME-CHECK** | Confirm not mounted via any dynamic path |
| Web `AnalyticsDashboard`, dead settings hooks, CLI `subagent_v2.rs`, `buildFallbackChain` | **NEEDS-RUNTIME-CHECK** | grep importers + build-green-without per item |

**Rule for the /goal loop: do NOT delete anything still marked NEEDS-RUNTIME-CHECK.** Convert to SAFE-TO-DELETE only after the recorded runtime check passes; one deletion per commit, reversible.

---

## Item 4 — Fresh gate results (resolves the stale-SUMMARY conflict) — DONE

Re-ran fresh this turn (overwrote `gate-baseline/SUMMARY-js.txt`, stamped 18:01, HEAD 867db867d):
- `check:llm-operability` **EXIT=0** ✅ — **D-001 CONFIRMED**: `check:report-retention` **EXIT=0** (the self-inflicted failure is fixed; the chain is green).
- `typecheck:all` EXIT=0 ✅ · `lint` EXIT=0 ✅ · `lint:extension` EXIT=0 ✅
- `build:all` EXIT=0 ✅ (earlier this session) · `cargo build --release` EXIT=0 ✅ · `cargo audit` EXIT=0 ✅
- `cargo test --workspace` ❌ 24 (catalog drift) · web/desktop/mobile tests ❌ (catalog drift) · vscode ❌ 3 snapshots · `cargo clippy -- -D warnings` ❌ 6 desktop-lib · `pnpm audit` ❌ 1 high (tmp)
- `build:desktop` ⏳ measuring (compiling git2/rusqlite; 1.94.0 present, not failed) — result in `gate-baseline/SUMMARY-builds.txt`.

So Codex's stale-SUMMARY concern is **resolved**; the green claims are real and freshly re-stamped. Net unchanged from the lead baseline.

### Catalog-drift discrimination (advisor #1 — stale-CODE vs stale-TEST) — DONE
Grepped non-test shipping code for removed IDs. Result:
- **Stale CODE (real bugs, fix from SSOT):** `services/api-gateway/src/routes/models.ts` (8 sites: `claude-opus-4.6`, `gpt-5.4-codex-*` — serves wrong catalog to clients, P1); `packages/routing/src/classify.ts:120` (branch on `claude-opus-4-7`/`4.7` not in catalog → dead branch); `services/api-gateway/src/routes/dotfile.ts:74` (`claude-opus-4-6` default — dead/unmounted route, still stale).
- **REFUTED as runtime bug:** desktop `MODEL_POOLS` (`apps/desktop/src/lib/modelRouter.ts:146-154`) is **catalog-derived** (`getAllowedModelsForTier`) and `buildPreferenceList` (`:162`) defensively skips any id not in `MODEL_METADATA` → cannot select a nonexistent model. The failing desktop test is a **stale assertion**, not a runtime defect.
- **Stale TESTS (update/decouple to read from catalog):** CLI `compaction.rs`/`output.rs`/`provider.rs`/`config.rs`/`design_system.rs`; desktop `modelRouter.test.ts`/`modelStore.test.ts`; web `anthropic-claude.test.ts`/`openai-gpt.test.ts`; mobile `model-picker.test.tsx`.
- **Correct ghost-model tests (leave):** `apps/cli/src/model_catalog.rs:1603,1688,1717` assert `claude-opus-4-6-mini`/`-4-6` are NOT known — these are intentional.
- **Doc-comment examples (low-pri hygiene):** `packages/types/{a2a,council,user,model}.ts`, `compliance/article50-marker.ts`, CLI `init.rs`/`output.rs` comments — JSDoc examples using opus-4-6/4.7.
**Fix shape:** (a) gateway `models.ts`→serve from `@agiworkforce/types` (or minimal: canonicalize the 8 IDs); (b) `classify.ts:120`→catalog-ref/4.8; (c) `dotfile.ts:74`→canonical; (d) update stale tests via the existing slot resolver; (e) land the **E7 integrity `check:*` guard** so it can't recur.

---

## Item 5 — New / sharpened P1s (confirmed)

- **P1-CATALOG (now 3 coupled sites):** (a) CLI Rust tests, (b) `apps/cli/src/provider.rs` catalog, (c) **`services/api-gateway/src/routes/models.ts:67-704`** (CONFIRMED stale: `claude-opus-4.6`, `gpt-5.4-codex-*`). Fix ALL THREE by serving/asserting from `@agiworkforce/types` (`models.json`) with canonical IDs (`claude-opus-4.8`). Add a `check:*` integrity script (DoD E7) so it can't recur.
- **P1-WEB-SETTINGS (U6/U7):** `user-preferences.ts:563-693` + `use-settings-queries.ts:562-915` stubbed despite live routes. CONFIRMED.
- **P1-DESK-NAV (U10):** desktop v3 default-on with dead sidebar destinations (`App.tsx:1372-1384`). CONFIRMED.
- **P1-DATALAYER-JWT (NEEDS-FIX):** `packages/data-layer/src/adapters/neon.ts` `withUser(jwt)` decodes the `sub` claim of an **unverified** JWT (`:38-41` comment is explicit; decode at `:118-171`; `SET LOCAL ... = sub` at `:250/280/311`). CONFIRMED unsafe-by-design. Fix: route through verified Clerk claims, OR mark the helper internal/experimental and add a test that it is never called with attacker-influenced input. (Mitigant: inventory found the live gateway uses Clerk `auth()` directly and the data-layer auth adapter is dead — so not currently on a hot attacker path, but the helper is a footgun.)

---

## Item 6 — Capability-coverage gate (added to DEFINITION_OF_DONE.md §I)

Both audits agree build/lint/typecheck/test cannot catch facades. New gate class (see DoD §I): every advertised capability must be **exercised end-to-end** by a test — CLI flags/subcommands have behavior tests (not parse tests), every `tools/list` entry is invoked via `tools/call`, every submitted UI action hits a real handler, every extension command runs, every service endpoint is hit. Advertised-without-an-exercising-test = INCOMPLETE. Plus: **gates verify observed state; never trust repo docs as completion evidence.**

---

## MERGED, DEDUPLICATED, SEVERITY-RANKED BACKLOG (supersedes stale repo docs)

### P0 — ship-blockers
1. **P0-1** Desktop ~11 UTF-8 byte-slice aborts (panic=abort). → fix as a class + `check:*` guard (DoD D1).
2. **P0-2** Mobile TLS-pinning placeholder pins crash every release launch. (DoD D2)
3. **P0-3 (elevated from P1):** app-server + mcp-server advertise tools but cannot execute them (no `tools/call`). Elevated because it's a flagship "advertised capability the code doesn't honor" and the fix vehicle (orphan crate) is ready. → wire orphan crate (item 2). _(If app-server/mcp-server are deemed internal/experimental, downgrade to P1 and gate the advertisement.)_

### P1 — major broken feature / real vuln / gate-blocker
- **P1-CATALOG** model-catalog drift, 3 coupled sites + integrity guard (E7). **Highest-leverage; unblocks cargo test + web/desktop tests.**
- **P1-CLIPPY** 6 desktop-lib clippy lints fail `clippy -- -D warnings`.
- **P1-VOICE** CLI voice Local→cloud egress (PRIVACY-01) + move privacy gate to stream layer (covers advisor + buildFallbackChain as a class).
- **P1-WEB-SETTINGS** wire settings hooks (U6/U7); remove fake-success.
- **P1-DESK-NAV / P1-DESK-SETTINGS / P1-DESK-COWORK** (SoT P0 #1/#2) — wire or hide; converge Settings IA.
- **P1-MOBILE-FIRSTRUN (U11)** + **P1-MOBILE-MEM** (relevance-gate memory).
- **P1-CACHE-PANIC** utils-cache current-thread panic.
- **P1-GW-RLS** false "RLS defense-in-depth" + add ownership-filter lint/test.
- **P1-GW-REVOKE** add `jti`; make revocation/logout real.
- **P1-GW-ENT** enterprise `/organizations` returns [] (broken embedded join).
- **P1-DATALAYER-JWT** unverified `withUser(jwt)` sub binding.
- **P1-UNWIRED** the confirmed dead-ends in the Item-1 register (U3/U5/U14/U15 + verify U4/U8/U9/U12/U13) — each WIRE or REMOVE.

### P2 — quality / edge / latent
ReactPreview no CSP (E4); `buildSandboxedHtml` 2 CSP-skip branches; CLI advisor egress; Chrome buggy cloud-IPC CI guard (E5); Desktop fabricated `memory.rs trend`; Web fabricated AnalyticsDashboard; WEB-PROVIDER-DRIFT-01 (3 provider layers); `tmp@0.2.5` high (override); 4 orphan provider adapters; `@agiworkforce/stores` phantom deps; vscode 3 stale snapshots; tier2/3 local-cancel no-op; network-proxy/execpolicy dead-security-surface; logger redactor untested; tray no-op; Google Batch mock; desktop dead islands.

### P3 — cleanup
orphan-crate deletion (after runtime check); `--all-targets` test clippy debt; vestigial utils validation exports; dual web UI dirs; stale anchor docs; CLI non-atomic conversation write + task_registry poison unwraps; mobile KaTeX CDN; blocked_paths denylist→allowlist; unmounted gateway routers; PostgresDatabaseAdapter skeleton; stale root Cargo.toml "44 crates" comment.

---

## Execution order (highest-leverage first; cluster → verify → commit)
1. **Catalog SSOT cluster** (P1-CATALOG, 3 sites) — integrator lands shared resolver + `check:*` integrity guard in `packages/types` FIRST, verify, then fan out to CLI/web/desktop/gateway consumers + un-skip/fix tests. Unblocks the test gate.
2. **P0 crash classes** (byte-slice guard + helper; mobile pinning) + their `check:*`/regression tests.
3. **Privacy class** (stream-layer gate: voice/advisor/fallback) + tests.
4. **app-server wire** (P0-3 via orphan crate) + behavior test.
5. **Gateway P1s** (RLS-claim, jti revocation, enterprise join) + tests.
6. **Clippy 6** + **tmp override** (quick gate-greens).
7. **Unwired register** WIRE/REMOVE sweep + capability-coverage tests (DoD §I).
8. **Dead-code** — only after runtime checks flip items to SAFE-TO-DELETE.
9. **Parity tail** (SoT P0 §F) — the long pole.

---

## 2026-05-29 — Fix: unprompted browser tabs (GitHub App install + Slack "Create an app") during `cargo test`

**Symptom.** During plain CLI test runs, two browser tabs opened on their own:
`https://github.com/apps/agiworkforce/installations/new` (404) and
`https://api.slack.com/apps?new_app=1` (Slack "Create an app").

**Root cause.** `apps/cli/src/claude_parity.rs::render_install_app` (was line 551) called
`webbrowser::open(install_url)` **unconditionally** whenever invoked with `"GitHub"`/`"Slack"`.
The `/install-github-app` and `/install-slack-app` dispatch arms (lines 167–170) call it, and
those two commands are listed in the `#[cfg(test)]` helper `shared_runtime_command_names()`
(lines 70–71). The test `shared_runtime_command_names_are_handled` iterates that list and calls
`handle_shared_command(command, …)` for **every** entry, so `cargo test` dispatched both install
commands and launched the real GitHub/Slack pages. Exactly two URLs, exactly two tabs — the two
install commands and nothing else.

**Exact firing call path (during `cargo test`):**
`claude_parity::tests::shared_runtime_command_names_are_handled` (`claude_parity.rs:1153`)
→ loops `shared_runtime_command_names()` incl. `"install-github-app"`/`"install-slack-app"` (`:70–71`)
→ `handle_shared_command("install-github-app"/"install-slack-app", "test", …)` (`:1165`)
→ dispatch arms (`:167–170`)
→ `render_install_app("GitHub"/"Slack")` (`:539`)
→ `webbrowser::open(install_url)` (was `:551`) → real tab.

**Scope bound.** The two literal URLs appear ONLY at `claude_parity.rs:542,545`. The repo's other
four `webbrowser::open` sites are all inside explicit interactive auth flows — `oauth::oauth_login`
(`oauth.rs:251`), `oauth::device_code_login` (`oauth.rs:376`), `auth_oauth::pkce_login`
(`auth_oauth.rs:204`), and `mcp::oauth_flow::start_pkce_flow` (`oauth_flow.rs:405`). Verified callers
are `/login` dispatch (`lib.rs:1573,1581`; `auth.rs:863,871`) and MCP-connect (`oauth_flow.rs:847`),
with no test/startup caller — consistent with the bug producing exactly two tabs.

**WIRE / REMOVE decision per site:**
- `claude_parity.rs::render_install_app` (the culprit) → **REMOVE the auto-open.** Connector OAuth /
  custom-MCP registration is cloud-deferred (`audit/anthropic-apps-parity/.../SYNTHESIS-r2.md`:
  "cloud-only, defer") and unwired; the GitHub URL 404s. The helper now only prints
  `Visit: <url>` and leaves a comment pointing future wiring at the chokepoint with an explicit
  `UserActionContext::user_initiated()`. The underlying command + URLs are preserved (not deleted).
- The 4 OAuth/MCP sites → **WIRE through the chokepoint.** They are genuine user-initiated flows;
  migrated to `crate::oauth::open_external_url(url, UserActionContext::user_initiated())`.

**Chokepoint + guard (definition of done).**
- New single chokepoint `crate::oauth::open_external_url(url, ctx: UserActionContext)`
  (`apps/cli/src/oauth.rs`). It refuses to launch a browser unless `ctx.triggered_by_user()`,
  so module-load / registration / test paths can never open a tab. Never panics (failure → `false`,
  callers fall back to printing the URL). All 5 former `webbrowser::open` call sites now route
  through it; the only remaining direct `webbrowser::open` in the CLI is inside the chokepoint.
- A `#[cfg(test)]` spy (`oauth::external_open_spy`, serialized by a `OnceLock<Mutex<()>>`) records
  any open that passes the user-action gate, without touching a real browser.
- **Runtime guard** `claude_parity::tests::dispatching_shared_commands_never_opens_a_browser`: enables
  the spy, dispatches every shared command (and `/install-github-app`, `/install-slack-app` plus
  their slash forms, and calls `render_install_app` directly), asserts the chokepoint `open_count == 0`.
- **Source-level invariant** `oauth::open_chokepoint_tests::webbrowser_open_only_called_from_the_chokepoint`:
  walks `apps/cli/src` and asserts the raw `webbrowser::open(` launcher appears at exactly one
  non-comment call site, which must live in `oauth.rs`. This catches a *direct* re-added launch (the
  exact original-bug pattern) that a runtime spy on the chokepoint cannot observe — verified by
  temporarily re-adding a direct call (the invariant test failed and named the offending file), then
  removed.
- **Contract tests** `oauth::open_chokepoint_tests::{non_user_initiated_never_opens,
  user_initiated_reaches_launch_step_under_spy}`.

**Reproduction of the original trigger, now neutralized.** `shared_runtime_command_names_are_handled`
(the test that previously opened the two tabs) now runs green and opens nothing, because
`render_install_app` no longer calls the opener. Proven two ways: the spy-guarded
`dispatching_shared_commands_never_opens_a_browser` dispatches both install commands with the opener
spied (no real URL launched), and the source-level invariant proves no direct `webbrowser::open`
bypass exists anywhere in the CLI outside the chokepoint.

**Proof (green).** `cargo test --lib` for the touched modules:
`claude_parity::` (15 passed), `oauth::` (12 passed — incl. the source-level invariant),
`mcp::oauth_flow` (14 passed); the 3 spy tests pass together under parallel execution;
`cargo build --lib` and `cargo clippy --lib` clean (zero warnings).

**Files touched:** `apps/cli/src/oauth.rs` (chokepoint + spy + 2 call-site migrations),
`apps/cli/src/auth_oauth.rs` (1 migration), `apps/cli/src/mcp/oauth_flow.rs` (1 migration),
`apps/cli/src/claude_parity.rs` (remove auto-open + guard test). No forbidden files edited;
no `package.json` change (the guard is a standalone Rust test).

---

## 2026-05-29 — WAVE 8 HUNT BACKLOG (`wnt2merph`, 21 read-only cells, 62 findings) — folded into SSOT

> Read-only adversarial hunt + RECONCILED register verification. **Drains into the next fix wave (Wave 9).** Each item has ONE home; deferred-surface (desktop/vscode/services/cloud-billing) items are note-only per v1-LOCAL-ONLY locks. Items tagged *in-flight* are being touched by Wave 7 (`wxk0vkz5v`) — verify post-fix, do not double-fix.

### NEW P0 — launch blockers (4)
- **A1 (yes-cli)** `apps/cli/src/onboarding.rs:223` — **v1 LOCAL-ONLY first-run is impossible.** "Local model — no account required" returns `Provider("ollama")` but ollama is absent from `ALL_PROVIDERS`, so it falls through to the GitHub-Copilot/ChatGPT cloud-login menu; the picker only iterates anthropic/openai/google and writes a cloud default. FIX: special-case local providers before `interactive_login_for_provider` (skip OAuth for ollama/local, inject local models into the picker, block unknown-provider fall-through).
- **A2 (yes-cli)** `apps/cli/src/agent/chat.rs:304-365` — **PRIVACY-01 hard-lock violation: Local→cloud egress in the fallback chain.** After a primary failure the fallback loop mutates `self.provider` to a cloud provider and streams full Local-session history to it; `validate_privacy_boundary()` runs only ONCE before the first call, never inside the loop. `--model llama3,gpt-4o` silently egresses Local context to OpenAI on a 5xx. FIX: re-validate the boundary inside the loop before mutating provider / calling `stream_completion`. **chat.rs is F5's file — do A2 AFTER F5 lands (sequential, same file).** Compounded by **A23** (`chat.rs:1199-1229` continuation loop) + `adopt_provider_privacy_mode` silently upgrading Local→Byok.
- **A3 (yes-mobile)** `apps/mobile/index.js` → `packages/local-llm/src/tier2.ts:76` (**U11**) — **`initExecutorch` is NEVER called** (`ResourceFetcher.adapter = null`), so every `tier2LoadModel` on a clean install throws before any download → **no real offline generation**. TS wiring is otherwise complete; native init is the sole gap. FIX: call `initExecutorch({ resourceFetcher: ExpoResourceFetcher })` in `index.js` before `registerRootComponent`. **CORRECTS the prior "2c real offline response tested" claim — that test injected a MOCK module (`_setLLMModuleForTesting`); the real device path is broken.** Fix A14 (below) alongside.
- **A4 (yes-mobile)** `apps/mobile/src/features/waitlist/service.ts:77` — **mobile waitlist POST always 403 (CSRF)**: `getAuthToken()` null, no `x-csrf-token`/Bearer → `requireCsrfToken` rejects → no signup row ever written (breaks 2d funnel rollup). FIX: `GET /api/csrf` (credentials:include) + `x-csrf-token`, mirroring `apps/extension/.../waitlistService.ts:63-84`.

### NEW P1 — launch-slice (12)
- **A5 (cli)** `onboarding.rs:253` — "Other providers" menu (OpenRouter/NVIDIA) promises API-key setup but reaches the same dead fall-through; no key-entry flow. WIRE key entry or REMOVE items.
- **A6 (cli)** `task_registry.rs:603` — `advisor` tool exfiltrates Local context to a cloud model (no `PrivacyMode`). GUARD: error in `execute_advisor` when `privacy_mode == Local`.
- **A7 (cli)** `voice.rs:272-275` — voice prefers OpenAI Whisper with no privacy awareness (Local + `OPENAI_API_KEY` → uploads). *in-flight F10.* GUARD on `privacy_mode`.
- **A8 (web)** `app/api/agents/tool-executions/route.ts:106` — **authenticated SSRF**: user `webhookUrl` fetched server-side, response reflected (IMDS reachable); canonical `assertNonInternalHostname` exists but isn't called. FIX: call it + require http/https.
- **A9 (web)** `features/settings/hooks/use-settings-queries.ts:447-455` (carve-out of U6/U7) — **2FA enable toast is a lie**: `enable2FA()` stores `enabled=false`, hook discards secret/QR/backup codes + toasts success + flips flag; no enrollment/verify UI. FIX: real enrollment dialog OR hide the toggle + stop toasting success. (**This is the ONLY real defect in the otherwise-WIRED settings surface.**)
- **A10 (web)** `app/api/device/link/route.ts:138` — device-link `/verify?code=` dead end (`verify/page.tsx` reads only `email`; `VerifyDeviceClient` exported never imported). FIX: import + branch on `code`, or redirect to `/auth/device?user_code=`.
- **A11 (web)** `features/billing/pages/BillingDashboard.tsx:168-209` — live paid-plan purchase CTAs reachable by free users, no waitlist gate (server blocks via `CHECKOUT_ENABLED=false` but client shows full flow). FIX: redirect to `/pricing#waitlist`.
- **A12 (web)** `components/modals/CreditAlertModal.tsx:40-74` — broken+exposed credit top-up (`/api/credit-topup`, no CSRF/auth, hardcoded `amount_cents:10000`). FIX: use `buyTokenPack` + gate behind managed-credits private-beta flag.
- **A13 (web)** `features/chat/stores/voice-input-store.ts:124` (**U9 store half**) — MediaRecorder fallback POSTs to nonexistent `/api/voice/transcriptions` (404; correct route `/api/voice/transcribe`). FIX: correct the URL.
- **A14 (mobile)** `packages/local-llm/src/catalog.ts:6-7` — `ET_VERSION_TAG='v0.8.0'` omits the `resolve/` prefix RNE 0.8.4 uses (`resolve/v0.8.0`); HF download won't resolve. Masked by A3's throw; next blocker once init is wired. Fix with A3.
- **A15 (mobile)** `app.config.js:68` + `services/secureFetch.ts:44` — **no TLS pinning** either platform; placeholder pins (len 2) skip the fail-closed throw; comment is false. **For v1-local-only = ACCEPTED RISK** (all 5 hosts gated behind false FEATURES flags); escalate before any cloud-reachable build. (= B-003 ops task.)
- **A16 (mobile)** `stores/chat/chatExecutionStore.ts:333` (**P1-MOBILE-MEM**) — memory injection has no relevance filter (no embedding → `LIKE %query%` → 0 rows → unranked `listMemoryFacts({limit:5})` leaks top-5 into every multi-word turn). *in-flight F11* — verify post-fix that a no-overlap prompt injects nothing.

### P2/P3 launch-slice (selected; full list in Wave-8 output)
- **A17 (web,P2)** `/admin` page has no role gate (API routes do, UI doesn't) — add `publicMetadata.role` check.
- **A19/A32 (web)** providers `route.ts`/`catalog/route.ts` + `validate-env.ts`/`webhook-diagnostic` — RT-01 prod-guard + DATABASE_URL/AGI_DATABASE_URL satisfy-either. *in-flight F2/F4.*
- **A24-A26/A29 (cli,P2/P3, U4 cluster)** `lib.rs` facade flags parsed-but-unread: `--no-session-persistence`, `--agent`/`--agent-id`, `--resume-session-at`, `--settings`. WIRE or REMOVE.
- **A27 (web,P2, U5)** `marketing-endpoints.ts:22` `submitContactForm`→nonexistent `/api/contact`; orphan (only caller `ContactSales.tsx` never rendered; live UX uses mailto). **REMOVE** orphan + export. (SAFE-TO-DELETE per §C.)
- **A30 (cli,P3, U3)** `--max-budget-usd` enforcement IS wired (refutes register); only the doc comment is wrong (`status_update` vs actual `budget_exhausted`). Doc-only.
- **A34 (web,P3)** `subscribeToNewsletter`/`trackResourceDownload` dead helpers, zero callers — REMOVE.
- **A35 (cli,P3)** `onboarding.rs:99` welcome banner advertises stale `claude-opus-4-6` (guard misses it — mid-string literal; Rust not scanned). Update to `claude-opus-4-8`. *(overlaps F6's guard-to-.md extension — F6 covers docs, this is a banner string.)*

### RECONCILED register — Wave-8 verdicts (supersede prior NEEDS-VERIFY)
- **WIRED-CONFIRMED / no action:** **U3** (budget enforcement wired; doc=A30), **U6+U7** (settings genuinely wired — sole gap = A9 2FA toggle; **F9 is essentially a no-op**), **U8** (forgot/update-password = intentional Clerk-widget redirects), **U14** (gateway catalog mostly REMOVED: opus-4.6/gpt-5.4-codex/dall-e-3 gone; only `o3` residual services-side, web is SSOT-clean → P3 services cleanup, §D). Gateway security set (jti revocation, RLS-claim correction, enterprise 2-query join, no unauth money route) **all WIRED-CONFIRMED**; signaling-server auth KEEP.
- **STILL-DEAD-END → routed:** **U5**→A27 (REMOVE), **U11**→A3 (P0), **U4**→A24-A26/A29/A36 (facade flags), **U15**→§D NON-BLOCKER (only anthropic/openai/ollama/google wired in gateway; deepseek/xai/perplexity/lmstudio orphaned but launch slices use native stacks + gateway fails closed via managed-compute waitlist; real path = `services/api-gateway/src/lib/providerAdapters.ts`, register's `packages/providers/...` path was stale).
- **NEEDS-RUNTIME-CHECK:** **U9** (hook path wired; store path A13), **U10** (desktop nav — deferred, needs a desktop cell), **U12** KEEP (Apple-FM correctly fail-closed coming-soon stub), **P1-MOBILE-MEM**→A16.

### Deletion-safety (§C) — flips from NEEDS-RUNTIME-CHECK (recommendations only; do NOT delete this pass)
- **KEEP:** `crates/agiworkforce-app-server` (now in CLI closure via McpServer/AppServer subcommands), `@agiworkforce/stores` (empty placeholder but `workspace:*` in apps/web + apps/desktop package.json — deleting breaks `pnpm install`).
- **SAFE-TO-DELETE (zero external refs, lib-only, not in any shipping bin closure):** `crates/agiworkforce-apply-patch`, `crates/agiworkforce-plugin-runtime` (caveat: substantive intended plugin-manifest logic — confirm no wiring plan), `crates/agiworkforce-task-runtime` (caveat: real tokio task runtime — confirm no plan). Also `apps/web/features/pages/ContactSales.tsx`+`submitContactForm` (A27) and `subscribeToNewsletter`/`trackResourceDownload` (A34).

### Deferred-surface (§D, note-only — NOT v1 launch slice; real but locked out by v1-LOCAL-ONLY)
Web enterprise/admin: `sso_connections`/`directory_sync_connections` have NO creation migration (every query → "relation does not exist"); SSO route self-contradicts on column names; `security_audit_logs` severity diverges 3 ways (= F1's target — F1 fixes the launch-slice write path; full reconciliation is the enterprise batch). Cloud-billing: Stripe webhooks swallow DB failures (P3); BillingDashboard success-toast dead branch. Services: gateway MODEL_CATALOG `o3` residual; U15 adapters. vscode U13 "10+ providers" marketing. Desktop U10 nav.

**Wave-9 execution order (after Wave 7 lands + gates green + commit):** A3+A14 (mobile offline — unblocks 2c for real) ∥ A4 (mobile waitlist CSRF) ∥ A1+A5 (cli first-run) ∥ A8 (web SSRF) ∥ A9 (web 2FA honesty) ∥ A10-A13 (web dead-ends/billing gating) → then A2+A23 (chat.rs privacy loop — SEQUENTIAL after F5) + A6 (advisor privacy) + A7 verify (F10) → then P2/P3 sweep + deletions (after a build-green-without check).

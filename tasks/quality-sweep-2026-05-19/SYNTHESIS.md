# Quality Sweep Synthesis — 2026-05-19

**Phase B output.** Inputs: 7 Phase A squad reports + CLAUDE.md (v1 locks) + tasks/todo.md (P0/P1 inventory). Greenlight artifact for the pre-v1 quality sweep.

**v1 locks per CLAUDE.md** (the only two things that can block v1 LOCAL ONLY):

1. **CI on `main` stays green**.
2. **`models.json` is single source of truth for model IDs** (per `memory/rule-models-json.md`).

Everything else (Stripe / paid Hobby / two-supabase-migrations / Dispatch / push) is post-v1 by founder directive.

---

## 1. Per-severity counts (across all 7 reports)

| Severity                   | rust-core | desktop-fe | web | mobile | chrome | vscode | cross-cut      | **Total**      |
| -------------------------- | --------- | ---------- | --- | ------ | ------ | ------ | -------------- | -------------- |
| **P0**                     | 1         | 0          | 0   | 0      | 0      | 0      | 0              | **1**          |
| **P1**                     | 4         | 0          | 3   | 1      | 1      | 0      | 2              | **11**         |
| **P2**                     | 2         | 3          | 4   | 4      | 2      | 2      | 2              | **19**         |
| **P3**                     | 1         | 3          | 2   | 2      | 2      | 3      | 2              | **15**         |
| **Total findings**         | 8         | 6          | 9   | 7      | 5      | 5      | 6 + 41 semgrep | **46 + 41**    |
| **Per-squad effort (hrs)** | ~20       | ~5.5       | ~16 | ~16.25 | ~3.25  | ~2.75  | ~28            | **~91.75 raw** |

Cross-cut's 6 severity-bucketed findings cover the 41 semgrep findings categorically (the 8 categorical groups in `squad-cross-cut.md` minus 2 that are not severity-classified); the 41 semgrep items contribute mostly P2/P3 distributed across squads #2/#3/#4 (already included in their effort). Chrome P2 count drops 3→2 after retraction of Finding #4 (`tabId` schema drift — confirmed false positive on spot-check; see § 4); chrome effort drops 4.25→3.25.

**Effort reconciliation:** the **~91.75 hrs** above is the sum of each squad's per-finding effort (raw bottom-up, post-chrome-F#4 retraction). The **3-wave totals below add to 68.75 hrs** because (a) some squad findings overlap across surfaces and are de-duplicated when assigned to a single wave fix, (b) several items are explicitly deferred out of waves as "not v1 LOCAL ONLY scope" (Section 5), and (c) cross-cut's ~22 hrs of distributed work is already accounted for within other squads' rows. Use 68.75 hrs as the **executable fix budget**; 91.75 is the **diagnostic surface area**.

**True P0 count: 1** (rust-core #1 — hardcoded model ID in CLI agent fallback).

---

## 2. Top-20 cross-surface patterns and high-impact items

### A. Model-ID SSOT violations (CLAUDE.md rule #1 — directly tied to v1 lock)

1. **rust-core P0**: `apps/cli/src/agent/mod.rs:488` — `"claude-haiku-4-5-20251001"` hardcoded as `.unwrap_or()` fast-mode fallback. Documented as "rule-models-json exception" but not cross-referenced to `model_catalog::economy_default_model()`. Diverges silently if models.json renames the ID.
2. **cross-cut P1**: `services/api-gateway/src/routes/models.ts` — ~50 hardcoded IDs in the catalog-shadow array. ESLint FIXME-flagged Wave 1 P0-G/I. Also `routes/cloudChat.ts:526`, `routes/dotfile.ts:73`.
3. **vscode P2**: `apps/extension-vscode/src/features/model-picker/modelConstants.ts:211` — `'gpt-5.5-mini'` is not present in `packages/types/src/models.json`. Dead-code fallback today (`resolveAutoModeModel('auto-economy', 'hobby')` returns a real ID), but a ghost-model footgun.
4. **rust-core P1**: `apps/cli/src/init.rs:63` — `# fast_model = "claude-haiku-4-5-20251001"` in generated `config.toml` template comment.
5. **rust-core observation**: `model_catalog.rs:legacy_bundled_models()` (lines 400–580) contains hardcoded IDs. Architecturally sound — this is the offline fallback when `include_str!("../../../packages/types/src/models.json")` parse fails at startup. The `scripts/check-no-hardcoded-models.sh` gate covers Rust.

### B. XSS / `Blob(text/html)` cluster (web)

6. **web P1 (lint error)**: 4 sites use `new Blob([...], { type: 'text/html' })` with download/open-in-tab: `features/chat/components/ArtifactBlock.tsx:150`, `artifacts/ArtifactPreview.tsx:252,280`, `dialogs/EnhancedExportDialog.tsx:150`. Lint rule `no-restricted-syntax` flags ERROR. Two of the four sanitize via `getPreviewHTML()`→`sanitizeArtifact`; the rule fires regardless.

### C. `dangerouslySetInnerHTML` density (cross-surface, semgrep-flagged)

7. **cross-cut P2**: 7 desktop sites + 1 shared package — `ArtifactRendererView.tsx`, `BrowserDebugTabs.tsx`, `Canvas/ArtifactPreview.tsx`, `ToolResultCard.tsx`, `MermaidArtifact.tsx`, `SvgArtifact.tsx`, `editing/LivePreview.tsx`, `packages/unified-chat/src/components/ArtifactRenderer.tsx`. All go through DOMPurify per CLAUDE.md.
8. **cross-cut P3**: 11 web layout files use `dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}` — legitimate SEO; recommend `nosem` comments or move to typed `<Script type="application/ld+json">`.

### D. `: any` density — where the holes actually matter

9. **web P1**: `lib/llm-providers/openai.ts:78,229` — `.map((tool: any) =>` in BOTH stream and non-stream production LLM-routing branches. A `ToolDefinitionSchema` z.infer exists in `lib/validations/llm.ts`. **This is the one real production type hole across all 268+243+ : any occurrences.**
10. **desktop-fe verdict**: 25 of 25 `: any` lines are intentional test-environment escapes (framer-motion proxy mocks, Tauri event mocks). Zero production holes.
11. **web bucket A (~200 occurrences)**: stubs in `utils/stubs.ts`, `stores/unified/desktop-stubs.ts`, `stores/unified/mediaGenerationStore.ts`, etc. — duplicated across files; maintenance hazard, not runtime risk. ESLint `no-explicit-any: off` applies to `utils/`.

### E. CI gate weakness (`continue-on-error: true`)

12. **cross-cut**: 3 confirmed `continue-on-error: true` instances. (a) `ci.yml:111` Semgrep — temporary revert per commit `254a2f34` until 41 backlog hits zero. (b) `ci.yml:416` Windows `cargo test --workspace --lib` — unresolved `STATUS_ENTRYPOINT_NOT_FOUND` DLL bug; clippy + check still hard-gate. (c) `deploy-signaling-server.yml:248` — prune job, correctly scoped. **Only (a) needs to flip for v1 launch quality.**
13. **rust-core CI gate**: contrary to the baseline claim, desktop backend IS in `cargo clippy -p agiworkforce-desktop -p agiworkforce-cli --lib` at `ci.yml:190`. Real gap is `--all-targets` excluded (acknowledged 36-error test-target backlog).

### F. Pre-launch ops / native config items

14. **mobile P1 (F-1)**: `lib/pinning.ts:94` + `PINS_BY_HOST` — `PINNING_ENFORCED=true` but all 6 hosts carry `PLACEHOLDER_REPLACE_BEFORE_LAUNCH_*`. `enforceProvisionedPinsForRelease()` blocks non-`__DEV__` builds at module load (correct fail-closed). `NSPinnedDomains` and `network_security_config.xml` not yet populated in `app.config.js`. Ops runbook required before release builds ship.
15. **chrome P2 (#3)**: `native-host/com.agiworkforce.browser.json.template:4` — `"/Applications/AGI Workforce.app/..."` macOS-only path. Windows/Linux installers would produce a broken native host without manual edit.
16. **vscode P2 (#1)**: `package.json engines.vscode` is `^1.95.0`; spec says `^1.110.0`. No runtime crash observed; pin is stale.

### G. Type compile error blocking surface

17. **chrome P1 (#1)**: `src/features/background/shortcuts.ts:31` — `TS2741` missing required field `createdByOrigin` in `SavedShortcut` literal. Confirmed: lines 31–40 build the object literal without `createdByOrigin`. Type was added as part of C-03 audit. **Saved shortcuts will have `createdByOrigin: undefined`, breaking the fire-time allowlist re-check at `background.ts:555–571`.**

### H. Test skip / `testPathIgnorePatterns` health

18. **desktop-fe**: 14 effective skips. 11 platform-conditional (correct Windows guards). 3 unconditional in `__tests__/e2e/windows.spec.ts:1001,1036,1076` (require `PLAYWRIGHT_WEB_BASE_URL` localhost:3000). 1 Radix `<Select>` jsdom limitation.
19. **mobile**: 5 excluded suites via `testPathIgnorePatterns` — all verified intentional, each has a TODO naming the blocking work, none are regressions. **Do not unskip.**
20. **web**: 1 skipped test in `__tests__/api/chat-messages.test.ts:659`.

### I. Lint-disable / ts-ignore concentrations

21. **desktop-fe**: 53 total ESLint-disable comments; densest is `components/UnifiedAgenticChat/` (19) and `stores/chat/` (7 — circular-dep `require()` workarounds at `chatExecutionStore.ts:190,285,473,527` + `toolStore.ts:929,998`). All annotated, none bare.
22. **mobile**: 8 `@ts-ignore` instances all in `components/edge-cases/` for RN accessibility props (legitimate TS-def gaps).
23. **chrome**: file-level `/* eslint-disable no-undef */` in `src/jobAutofill.runtime.js:1` — content-script context; intent warranted but scope is broad.

### J. Unwrap hot-path audit (rust-core)

24. **rust-core P1**: `apps/cli/src/daemon.rs:1007–1033` — 12 `Regex::new(...).unwrap()` calls in production key-redaction function. Compile-time literals so panic impossible, but `LazyLock<Regex>` is cleaner.
25. **rust-core observation**: 3,875 total `.unwrap*` instances; production bare `.unwrap()` count ~25 in CLI, almost all static regex compilation or `#[expect]`-annotated. The vast majority are in dedicated test files. Baseline numbers over-count by including `unwrap_or*` variants.

### K. SUPABASE_SERVICE_ROLE_KEY (RLS bypass — NOT v1)

26. **cross-cut**: 15 web API routes use `SUPABASE_SERVICE_ROLE_KEY` directly (`todo.md` P1-1 says "56" — that number is stale by ~3 migration waves). Cited examples: admin routes (`admin/directory-sync`, `admin/sso`, `admin/security`), device-flow routes (`device/approve|link|poll`), webhooks (`stripe-webhook`, `github/webhook`), cron (`cron/reset-credits`). Service-role is appropriate for the webhook/cron set; the broader audit was largely landed in prior waves.

### L. Two-supabase-migrations drift (NOT v1)

27. **web P2 / cross-cut P2-6**: `supabase/migrations/` (**45 files** canonical) vs `apps/web/supabase/migrations/` (**50 files** legacy web-local). Stripe idempotency RPC exists in BOTH dirs with table-extend ALTER statements — running both against same DB risks duplicate-extend. **Reconciliation blocks paid-tier launch, NOT v1 LOCAL ONLY.**

### M. Runtime config inventory (web)

28. **web P2 (#5)**: 75 of 93 `app/api/` route files lack explicit `export const runtime`. Includes Stripe-adjacent (`checkout`, `credit-topup`, `portal`, `sync-subscription`), `cron/reset-credits`, `github/webhook` (uses Node `crypto.timingSafeEqual`). On Vercel defaults to nodejs; cosmetic today, deployment-portability risk if hosting target ever includes edge workers.

### N. Mobile feature stubs

29. **mobile P2 (F-3)**: `services/complianceLedger.ts` — disclosure acceptance stored only in process memory (`let inMemoryRecord`). Cold start re-shows GDPR/Article 50(1) modal. Apple 5.1.2(i) + EU AI Act Article 50(1) require durable record. **Blocks post-v1 App Store review.**
30. **mobile P2 (F-4)**: `app/(public)/onboarding.tsx:239–256` — `handleStartDownload` has `TODO(model-catalog-engineer)` stub; no real model download wired. UI shows fake progress bar via `setInterval`. Affects users with `needsDownload: true`. **Blocks v1 completeness for on-device inference users.**

### O. Test flakiness

31. **mobile P2 (F-5)**: `__tests__/onboarding.test.tsx:207` — `detectCapabilities` mock async race; `setDeviceInfo`/`setRecommendedModel` fires outside `act()`; 5s `waitFor` times out on cold-run only. Passes 3× isolated, 2× full-suite. Needs `jest.useFakeTimers()` or `act(async)` wrap.

### P. Cross-surface integration

32. **chrome ↔ vscode ↔ desktop**: port 8787 contract aligned across all three. `selected_text_query` `tabId` (camelCase) ↔ Rust `#[serde(rename = "tabId")]` confirmed correct. `timestamp` field sent by extension is silently dropped by Rust struct (acceptable). **No critical schema drift.**
33. **chrome P3 (#5)**: LinkedIn detector — 4 of 9 selectors are high-risk CSS Modules (`.jobs-easy-apply-modal`, `.artdeco-modal--layer-default`, `.jobs-easy-apply-content`, `.jobs-easy-apply-form-section`). Fallback chain mitigates. Out-of-scope for v1.

---

## 3. Prioritized fix waves

### Wave 1 — P0 / v1 LOCAL ONLY blockers

**Scope:** the smallest possible set that protects the two CLAUDE.md locks (CI green, models.json SSOT).

| #   | Finding                                                                                  | File:line                                                | Effort (hrs) | Squad     |
| --- | ---------------------------------------------------------------------------------------- | -------------------------------------------------------- | ------------ | --------- |
| 1.1 | Hardcoded model ID in CLI agent fast-mode fallback (rust-core P0 #1)                     | `apps/cli/src/agent/mod.rs:488`                          | 0.5          | rust-core |
| 1.2 | Chrome ext TS2741 — `createdByOrigin` missing, breaks fire-time allowlist (chrome P1 #1) | `apps/extension/src/features/background/shortcuts.ts:31` | 0.25         | chrome    |

**Wave 1 total: 0.75 hours.**

**v1-relevance:** YES — direct blockers.

- 1.1 is a CLAUDE.md rule #1 violation in a production path; if `claude-haiku-4-5-20251001` is renamed in models.json, CLI fast-mode silently routes to a non-existent model. The fix is to derive from `model_catalog::economy_default_model()`.
- 1.2 fails `tsc --noEmit` on the chrome extension; the v1 lock requires CI green. The runtime impact also matters: every saved shortcut would carry `createdByOrigin: undefined`, neutering the security re-check at `background.ts:555–571`.

**Acceptance criteria:**

- `pnpm --filter @agiworkforce/extension typecheck` exits 0.
- Direct grep verification: `rg 'claude-haiku-4-5-20251001' apps/cli/src/agent/mod.rs` returns no match. **Note:** `scripts/check-no-hardcoded-models.sh` does NOT currently catch this pattern — its Gate 1 targets the literal `claude-opus-4-6-mini` and Gate 2 targets `const FAST_*_MODEL = "..."` const-assignment patterns; an `.unwrap_or("literal")` site does not match either gate. Wave 1 should either (a) verify the fix by direct grep above, or (b) extend the script with a Gate 3 covering `unwrap_or\("[a-z]+-[a-z0-9-]+"\)` patterns in `apps/cli/src/agent/`.
- `cargo test -p agiworkforce-cli` green.
- Both fixes land as ONE small PR labeled `v1-blocker`.

### Wave 2 — P1 / ship-soon (not v1-blocking but high-value pre-launch)

**Scope:** lint errors that already fire ERROR in CI, type holes in production routing, security ops items.

| #   | Finding                                                                                                                  | File:line                                                                                       | Effort (hrs) | Squad     |
| --- | ------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- | ------------ | --------- |
| 2.1 | 4 `Blob(text/html)` XSS lint errors (web P1 #1–3)                                                                        | `ArtifactBlock.tsx:150`, `ArtifactPreview.tsx:252,280`, `EnhancedExportDialog.tsx:150`          | 1.5          | web       |
| 2.2 | LLM tool-transform `: any` in OpenAI provider (web P1 #7)                                                                | `lib/llm-providers/openai.ts:78,229`                                                            | 0.75         | web       |
| 2.3 | TLS SPKI pin placeholders + native config not populated (mobile P1 F-1)                                                  | `apps/mobile/lib/pinning.ts:94` + `app.config.js`                                               | 4            | mobile    |
| 2.4 | `setState` in `useEffect` body (web P2 #4 — also a lint ERROR)                                                           | `src/features/projects/components/ProjectSettingsDialog.tsx:81`                                 | 0.5          | web       |
| 2.5 | CLI daemon `Regex::new().unwrap()` x12 → `LazyLock<Regex>` (rust-core P1 #2)                                             | `apps/cli/src/daemon.rs:1007–1033`                                                              | 1            | rust-core |
| 2.6 | CLI init.rs hardcoded model in `config.toml` template comment (rust-core P1 #4)                                          | `apps/cli/src/init.rs:63`                                                                       | 0.5          | rust-core |
| 2.7 | api-gateway `routes/models.ts` ~50 hardcoded IDs → derived-from-catalog (cross-cut #2, FIXME P1-MODEL-CATALOG-MIGRATION) | `services/api-gateway/src/routes/models.ts` + `routes/cloudChat.ts:526`, `routes/dotfile.ts:73` | 8            | web       |
| 2.8 | api-gateway `child_process.spawn` with caller-controlled command (cross-cut #1)                                          | `services/api-gateway/src/mcp/mcpProxy.ts:312`                                                  | 3            | web       |
| 2.9 | 10 stale `eslint-disable` warnings — auto-fixable (web P3 #9)                                                            | various                                                                                         | 0.25         | web       |

**Wave 2 total: 19.5 hours.**

**v1-relevance:** NO direct v1 lock dependency, but `pnpm --filter web lint` currently exits 1 with 5 errors — that already fails the CI gate the moment any web file changes. **Treating Wave 2 as v1-soft-blocker** is the conservative read: fix items 2.1, 2.2, 2.4, 2.9 to make `pnpm lint` green. 2.3 is a release-build-only blocker (mobile App Store submission). 2.7 is the largest items but is the CLAUDE.md rule #1 enforcement layer on the api-gateway side — the ESLint config has it FIXME-baselined, so it does not currently fail CI; the only reason to ship it in Wave 2 is to be able to flip semgrep + tighten the SSOT gate.

**Acceptance criteria:**

- `pnpm --filter web lint` exits 0 (currently 5 errors, 10 warnings).
- `cargo clippy -p agiworkforce-cli --lib -- -D warnings` green (already is, this is regression-prevention).
- Mobile pin runbook executed and `app.config.js` populated with real SPKI hashes; `hasPlaceholderPins()` returns `false`; release build no longer fails at module load.
- api-gateway `routes/models.ts` exports a `MODELS_LIST` derived from `@agiworkforce/types`; the eslint-config FIXME for `routes/models.ts` can be lifted.

### Wave 3 — P2 / backlog cleanup

**Scope:** code-quality debt, test stability, semgrep drive-to-zero, post-v1 features.

| #    | Finding                                                                                   | File:line                                                        | Effort (hrs) | Squad      |
| ---- | ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | ------------ | ---------- |
| 3.1  | Mobile compliance ledger MMKV persistence (mobile P2 F-3)                                 | `apps/mobile/services/complianceLedger.ts`                       | 2            | mobile     |
| 3.2  | Mobile onboarding model-download real wiring (mobile P2 F-4)                              | `apps/mobile/app/(public)/onboarding.tsx:239–256`                | 8            | mobile     |
| 3.3  | Mobile test flakiness — `act()` wrap (mobile P2 F-5)                                      | `__tests__/onboarding.test.tsx:207`                              | 1            | mobile     |
| 3.4  | Mobile CitationChip URL allowlist (mobile P2 F-2)                                         | `components/chat/CitationChip.tsx:15`                            | 0.5          | mobile     |
| 3.5  | Chrome native-host install-path platform variants (chrome P2 #3)                          | `native-host/com.agiworkforce.browser.json.template`             | 0.5          | chrome     |
| 3.6  | Chrome `jobAutofill.runtime.js` scope-narrow `eslint-disable` (chrome P2 #2)              | `src/jobAutofill.runtime.js:1`                                   | 0.5          | chrome     |
| 3.7  | VS Code `engines.vscode` pin drift (vscode P2 #1)                                         | `apps/extension-vscode/package.json:13`                          | 0.5          | vscode     |
| 3.8  | VS Code stale `gpt-5.5-mini` fallback (vscode P2 #2)                                      | `src/features/model-picker/modelConstants.ts:211`                | 0.5          | vscode     |
| 3.9  | Desktop circular-dep `require()` in stores (desktop-fe P2 #2)                             | `chatExecutionStore.ts:190,285,473,527` + `toolStore.ts:929,998` | 1            | desktop-fe |
| 3.10 | Desktop hooks `exhaustive-deps` (desktop-fe P2 #3)                                        | `useTerminal.ts:100` + `useBackgroundTasks.ts:338`               | 1            | desktop-fe |
| 3.11 | Desktop e2e unconditional skips need env wiring (desktop-fe P2 #1)                        | `windows.spec.ts:1001,1036,1076`                                 | 0.5          | desktop-fe |
| 3.12 | Web `runtime = 'nodejs'` declarations on Node-only routes (web P2 #5)                     | 75 `app/api/` routes                                             | 4            | web        |
| 3.13 | 7 desktop `dangerouslySetInnerHTML` sites — confirm DOMPurify, add `nosem` (cross-cut #5) | desktop artifacts                                                | 2            | desktop-fe |
| 3.14 | 11 web jsonLd `dangerouslySetInnerHTML` — typed Script helper (cross-cut #6)              | web layout files                                                 | 2            | web        |
| 3.15 | Mobile `execSync` template-string in dev script (cross-cut #2)                            | `apps/mobile/scripts/screenshots/pipeline.ts:203–238`            | 1            | mobile     |
| 3.16 | JWT_SECRET fixture semgrep noise → `.semgrepignore` (cross-cut #3, #4)                    | `services/api-gateway/__tests__/`                                | 1            | web        |
| 3.17 | Semgrep flip to hard-fail after backlog zero (cross-cut workflow item)                    | `.github/workflows/ci.yml:111`                                   | 0.5          | cross-cut  |
| 3.18 | Rust unsafe SAFETY comments (rust-core P2 #6, #7)                                         | `tui/wrapping.rs:50,85`, `core/agi/sandbox.rs:536,546`           | 1            | rust-core  |
| 3.19 | Rust `--all-targets` 36-error test backlog (rust-core P3 #8)                              | repo-wide tests                                                  | 8            | rust-core  |
| 3.20 | Desktop FE `: any` test-mocks tightening (desktop-fe P3 #5 + the 25-line table)           | 25 test files                                                    | 5.5          | desktop-fe |
| 3.21 | VS Code commands.ts REGISTRY_COMMANDS migration (vscode P3 #4)                            | `src/core/commands.ts`                                           | 1            | vscode     |
| 3.22 | VS Code telemetry dual-gate (vscode P3 #5)                                                | `src/core/telemetry.ts:201`                                      | 0.5          | vscode     |
| 3.23 | Web stub duplication consolidation (web table A)                                          | `utils/stubs.ts` etc.                                            | 4            | web        |
| 3.24 | Chrome LinkedIn selector hardening (chrome P3 #5)                                         | `detector.ts:64–88`                                              | 2            | chrome     |
| 3.25 | tasks/todo.md path updates (cross-cut reconciliation)                                     | `tasks/todo.md`                                                  | 0.5          | cross-cut  |

**Wave 3 total: ~48.5 hours.**

**v1-relevance:** NO. Backlog quality work. Schedule post-v1 LOCAL ONLY.

**Acceptance criteria:**

- Semgrep backlog at zero; `ci.yml:111` `continue-on-error: false`.
- `tasks/todo.md` paths and counts reconciled (`P1-1` says "56" → reality is 15; `P3-1` line refs invalidated by 1,723→112 line refactor; `P3-2` `main.rs:1870` no longer exists).
- Mobile compliance ledger writes to MMKV; cold-start does not re-show disclosure.
- All web `app/api/route.ts` files declare runtime explicitly.

---

## 4. Spot-check log

I opened these cited findings in the actual files and confirmed reproduction:

| Finding                               | File:line                                                               | Status                                                                                                                                                                                                                                                                                                |
| ------------------------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| rust-core #1 (P0)                     | `apps/cli/src/agent/mod.rs:488`                                         | **Confirmed.** `.unwrap_or("claude-haiku-4-5-20251001")` present; comment cites "rule-models-json exception" but no link to `model_catalog::economy_default_model()`.                                                                                                                                 |
| chrome #1 (P1)                        | `apps/extension/src/features/background/shortcuts.ts:31`                | **Confirmed.** Lines 31–40 construct `SavedShortcut` without `createdByOrigin`. TS2741 will fire.                                                                                                                                                                                                     |
| web #1 (P1)                           | `apps/web/features/chat/components/ArtifactBlock.tsx:150`               | **Confirmed.** `new Blob([code], { type: 'text/html' })` on line 150; comment cites WEB-25 noopener guard.                                                                                                                                                                                            |
| web #7 (P1)                           | `apps/web/lib/llm-providers/openai.ts:78`                               | **Confirmed.** `body['tools'] = request.tools.map((tool: any) => {` on line 78.                                                                                                                                                                                                                       |
| mobile F-1 (P1)                       | `apps/mobile/lib/pinning.ts:94`                                         | **Confirmed.** `export const PINNING_ENFORCED = true` at line 94; `hasPlaceholderPins()` defined at 99.                                                                                                                                                                                               |
| vscode #2 (P2)                        | `apps/extension-vscode/src/features/model-picker/modelConstants.ts:211` | **Confirmed.** `'auto-economy': resolveAutoModeModel('auto-economy', 'hobby') ?? 'gpt-5.5-mini'` literal at line 211.                                                                                                                                                                                 |
| cross-cut P1-1 (todo reconciliation)  | `apps/web/app/api/**/SUPABASE_SERVICE_ROLE_KEY`                         | **Confirmed STALE.** `rg -l SUPABASE_SERVICE_ROLE_KEY apps/web/app/api/` returns 15 files, not 56 as `todo.md` claims.                                                                                                                                                                                |
| cross-cut workflow inventory          | `.github/workflows/*.yml` `continue-on-error: true`                     | **Confirmed.** 3 instances: `ci.yml:111` (Semgrep), `ci.yml:416` (Windows cargo test), `deploy-signaling-server.yml:248` (prune).                                                                                                                                                                     |
| chrome #4 (P2) — `tabId` schema drift | `apps/desktop/src-tauri/src/integrations/native_messaging/mod.rs:173`   | **FALSE POSITIVE on re-check.** Line 173 has `#[serde(rename = "tabId")]` on `SelectedTextQuery.tab_id`. The chrome squad's own Finding #4 description (lines 116–117) and its message-schema table (line 112) both later state the rename IS present. Drop this from Wave 3; downgrade to no-action. |

**False positives noted (cite-and-skip — already in source reports):**

- `automation/codegen.rs:220` "unsafe" — string literal, not an unsafe block (rust-core).
- `app/api/health/route.ts:125` "anyUnhealthy" — variable name, not `: any` type (web).
- 16/41 semgrep findings are JWT fixtures intentional in test setup (cross-cut). `.semgrepignore` fixes without touching code.
- `windows.spec.ts:13` is inside a `/* */` block comment, not a live `.skip()` (desktop-fe).
- chrome `selected_text_query` `tabId` ↔ Rust `#[serde(rename = "tabId")]` matches; no drift despite initial appearance.
- Mobile dispatch + push: feature-gated via `FEATURES.dispatch = false`, `FEATURES.auth = false`. Correct v1 behavior.

**One finding reclassified as false positive during PR review** (added to the list above): chrome Finding #4 (`tabId` schema drift, P2) — `native_messaging/mod.rs:173` has `#[serde(rename = "tabId")]`. The remaining 6 pre-flagged false-positive classes above were caught during the squads' own self-checks and are documented as such in each source report. Chrome P2 count and totals in § 1 updated accordingly.

---

## 5. What's NOT blocked by v1 LOCAL ONLY

Per CLAUDE.md the v1 locks are CI green + models.json SSOT. The following are explicitly post-v1 and the user can defer with confidence:

1. **Stripe / paid Hobby launch items**: `app/api/stripe-webhook/`, `portal/route.ts:160` email fallback (`todo.md` P3-1 with `TODO(2026-Q3)` removal), `checkout`, `credit-topup`, `sync-subscription`. Webhook is hardened (signature verify, 60s replay window, idempotency, rate limit). Paid-tier launch is NO-GO per CLAUDE.md until Stripe RPC migrations ship.
2. **Two-supabase-migrations reconciliation** (`P2-6`): canonical `supabase/migrations/` (**45 files**) vs legacy `apps/web/supabase/migrations/` (**50 files**). Both contain Stripe idempotency RPCs with table-extend statements. Blocks paid-tier launch only. **NOT v1 LOCAL ONLY scope** per CLAUDE.md "Common pitfalls".
3. **`SUPABASE_SERVICE_ROLE_KEY` audit completion** (P1-1, stale at "56"; reality 15). Remaining 15 routes (admin/device/webhook/cron) legitimately need service-role.
4. **Mobile App Store submission** (compliance ledger MMKV persistence, F-3). Apple 5.1.2(i) + EU AI Act Article 50(1). NOT v1 LOCAL ONLY blocker.
5. **Mobile on-device model download** (F-4). v1 LOCAL ONLY on desktop ships without forcing mobile inference users through this path.
6. **Dispatch + companion + WebRTC fallback** in mobile. `FEATURES.dispatch = false`, `FEATURES.companion = false` for v1.
7. **Push notifications** in mobile. Requires Supabase session; `FEATURES.auth = false` in v1.
8. **Auto-Routing Tasks #1, #5, #6, #9, #10** in `todo.md`. Pool A Hobby items, post-launch.
9. **CLI PHASE2 dead modules** (P2-1): `marketplace`, `sdk_io`, `a2a_ws`, `memory_pipeline`, `skill_learner`, `features::a2a`. Feature-flag or remove — post-v1.
10. **`/api/user/stats` and `/api/health-context`** (P2-2). Mobile feature-flagged off.
11. **OpenAI Responses API wiring smoke** (P2-3). Appears wired; needs runtime smoke. Not v1.
12. **Recharts `@ts-expect-error` x2** (P3-3 — path now `apps/desktop/src/features/analytics/CostDashboard.tsx:363,425`).
13. **VS Code REGISTRY_COMMANDS migration** (vscode #4). DX debt; commandParity test already catches drift.
14. **Semgrep drive-to-zero** (~22 hrs distributed). Not v1 — Semgrep is advisory until backlog hits zero.
15. **Three large root-level reference docs** (`REFERENCE_INDEX.md`, `REFERENCE_STRUCTURE.md`, `MASTER_PLAN.md`). Founder directive: do not touch during launch (per `tasks/lessons.md` Lesson 6).

---

## 6. Open questions for the user to greenlight

Re-surfaced with synthesis context. Each maps to a wave decision:

**Q1. Desktop backend clippy gate — when?**

- _Source_: `here-is-a-draft-generic-llama.md:201`. The rust-core report **corrects** the baseline: desktop backend IS already in `cargo clippy -p agiworkforce-desktop -p agiworkforce-cli --lib` at `ci.yml:190`. The real gap is `--all-targets` (36-error test backlog).
- _Decision_: Defer to Wave 3 (3.19). Test-target clippy is not a v1 lock. Recommendation: stay current scope until backlog is paid down.

**Q2. `unwrap_used` / `expect_used` clippy lints — one pass or staged?**

- _Source_: `Cargo.toml:24-29` comment says intentionally NOT enabled. rust-core report shows production bare `.unwrap()` count is actually small (~25 in CLI, mostly static regex). Staging is overkill.
- _Decision needed_: enable `unwrap_used` / `expect_used` at workspace level **after** Wave 2 item 2.5 lands (replaces 12 regex unwraps in daemon.rs). Single pass for the rest.

**Q3. Semgrep drive-to-zero — separate PR or rolled into surface waves?**

- _Source_: `here-is-a-draft-generic-llama.md:203`. Wave 3 currently rolls per-surface (`3.13`, `3.14`, `3.15`, `3.16`). Adding `.semgrepignore` for the 16 JWT fixtures removes 39% in one commit (cross-cut recommendation).
- _Decision needed_: launch `.semgrepignore` PR immediately (1 hr, removes 16/41 noise), keep `ci.yml:111` flip (3.17) as the close-out PR after 3.13–3.16 land.

**Q4. Two-supabase-migrations reconciliation — v1 LOCAL ONLY scope?**

- _Source_: `here-is-a-draft-generic-llama.md:204`. CLAUDE.md "Common pitfalls" explicitly defers to paid-tier. cross-cut report confirms two trees diverged by 19 migrations.
- _Decision_: **NO**, not in v1 LOCAL ONLY scope. Defer until paid Hobby launch prep.

**Q5. `continue-on-error: true` (3 instances) — which become hard failures pre-launch?**

- _Source_: `here-is-a-draft-generic-llama.md:205`.
- _Decision matrix per cross-cut analysis_:
  - **`ci.yml:111` Semgrep**: flip to hard-fail in Wave 3 after backlog zero (3.17). NOT a v1 blocker; advisory is the documented temporary state per commit `254a2f34`.
  - **`ci.yml:416` Windows `cargo test`**: keep advisory. Linux full suite + Windows clippy + Windows cargo check are strict; the DLL `STATUS_ENTRYPOINT_NOT_FOUND` needs real-Windows procmon/depends.exe analysis — not in scope. NOT a v1 blocker.
  - **`deploy-signaling-server.yml:248` prune**: leave advisory (correctly scoped exception per FIX-040).

---

## Appendix — counts reconciliation against `tasks/todo.md`

| `todo.md` item | Claim                                                                | Reality                                                                      | Action                |
| -------------- | -------------------------------------------------------------------- | ---------------------------------------------------------------------------- | --------------------- |
| P1-1           | "56 web API routes"                                                  | 15 (cross-cut spot-check)                                                    | Update count in todo. |
| P1-4           | Anon session cookie audit "all callers"                              | 1 caller (`csrf/route.ts:48–49`), correct already                            | Close as DONE.        |
| P2-1           | 6 CLI PHASE2 dead modules in `main.rs:59–74`                         | Now in `lib.rs:88–105` (main.rs is 8-line shim)                              | Update path.          |
| P3-1           | Stripe email fallback at `stripe-webhook:305`                        | webhook refactored 1,723 → 112 lines; logic moved to `lib/`                  | Re-locate cite.       |
| P3-2           | CLI quota hardcode `main.rs:1870`                                    | main.rs is 8-line shim; logic in `lib.rs` and `chatwidget.rs:2667,6558,6585` | Update path.          |
| P3-3           | recharts ts-expect-error in `components/Analytics/CostDashboard.tsx` | Now `features/analytics/CostDashboard.tsx:363,425`                           | Update path.          |

Bundle the path/count corrections into Wave 3 item 3.25 (0.5 hr).

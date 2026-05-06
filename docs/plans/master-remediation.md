# AGI Workforce Remediation Plan — 2026-05-02 → ~2026-06-15

## Context

The 2026-05-01 audit (`AUDIT_REPORT.md`, `FIX_QUEUE.md` at repo root) catalogued 78 findings: 11 P0, 28 P1, 26 P2, 13 P3. Today the repo is **shipping work as done while the build is broken**: CI is red on `main` for 5 consecutive commits, the `Release Desktop` pipeline for tag `v0.1.0` failed, the encryption story for provider keys + Slack/WhatsApp/Teams credentials is theatre (existing `MasterPasswordManager` is dead code), `computer_use_*` Tauri commands accept LLM input with no approval gate, and the Privacy Policy materially contradicts the runtime architecture. This plan executes **all P0+P1+P2 fixes and finishes the codex-rs port** over 6 sprints (~6–8 weeks for one engineer; faster if parallelized).

Outcome: green CI on `main`, signed bundles for macOS + Windows, master-password-protected vault for all credentials, gated agentic actions, daily cost cap, accurate Privacy/ToS, and the workspace cleaned of forked-port debt — so the next release can actually ship.

Source-of-truth files for granular fix instructions:

- `/Users/siddhartha/Desktop/agiworkforce/AUDIT_REPORT.md` — full 12-phase audit
- `/Users/siddhartha/Desktop/agiworkforce/FIX_QUEUE.md` — 47 self-contained fix prompts (FIX-001…FIX-047)

This plan sequences and groups those fixes into executable sprints; it does not duplicate their per-fix detail. **Always pull the current text from `FIX_QUEUE.md` when starting a fix** so you get the latest grounding.

---

## Verified foundations the plan builds on

| Capability                                              | File:line                                                              | Status                                                                                                                                                                                                                  |
| ------------------------------------------------------- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MasterPasswordManager` (Argon2id+HKDF, full vault API) | `apps/desktop/src-tauri/src/sys/security/master_password.rs:148-448`   | Ready as Tauri `State`; zero callers in IPC critical path today                                                                                                                                                         |
| `KeyPurpose` enum                                       | `apps/desktop/src-tauri/src/sys/security/machine_key.rs:42-75`         | Has `MasterEncryption, JwtSecret, DatabaseEncryption, McpCredentials, ApiKeys, EmailCredentials, CalendarCredentials, CloudEncryption`. **Must add `Messaging(Platform)` and `SupabaseAuth` variants for FIX-002/004**. |
| `derive_key_with_password()`                            | `apps/desktop/src-tauri/src/sys/security/machine_key.rs:238-266`       | Implemented, zero callers — wire it through                                                                                                                                                                             |
| `tool_confirmation::request_confirmation_simple`        | `apps/desktop/src-tauri/src/sys/commands/tool_confirmation.rs:883-911` | Modal-wired (Tauri event emit + oneshot, 120s timeout). Already used by `terminal.rs:60-90`, `file_ops.rs:483, :907`, `git.rs:307, :565, :885, :927, :976`. **Reuse pattern for `computer_use.rs`.**                    |
| `validate_path_security`                                | `apps/desktop/src-tauri/src/sys/commands/file_ops.rs:71-154`           | Returns canonical `PathBuf`; reusable on `&str`. Pull into shared helper for git.rs.                                                                                                                                    |
| `apps/desktop/check-wiring.sh`                          | repo root                                                              | **Already exists**, just not wired to CI. Adds drift detection in <1 hr.                                                                                                                                                |
| Runtime detection (Tauri vs web)                        | `packages/runtime/src/detect.ts:1-34`                                  | `isTauri`, `isCloudWeb`, `getRuntimeEnv()` ready for FIX-004 branching                                                                                                                                                  |
| `cost_calculator` (token→USD)                           | `apps/desktop/src-tauri/src/core/llm/cost_calculator.rs`               | In-memory only; **does not persist**. For FIX-007 daily cap, build a new `DailyBudgetGuard` SQLite-backed (`(user_id, day) → spent_usd`).                                                                               |
| Session cost cap ($50)                                  | `apps/desktop/src-tauri/src/core/agent/autonomous.rs:179-202`          | Reference pattern for the new daily cap                                                                                                                                                                                 |

**One drift discovered after the audit:** `crates/agiworkforce-app-server/Cargo.toml` and `crates/agiworkforce-utils-pty/Cargo.toml` declare `edition = "2024"`. Rust 2024 was stabilized in 1.85 (Feb 2025) and the toolchain at 1.94.0 supports it, so this is _not_ the cause of the 24 compile errors — those are real symbol-invention/trait-drift bugs. Don't get distracted by the edition string.

---

## Sprint plan

Each sprint is a single PR (or small stack), behind feature flags where the migration is visible to users. Default cadence: 1 sprint per week. Exit criteria are concrete and testable; nothing leaves a sprint without them.

### Sprint 0 — Get CI green (Days 1–4)

Nothing else can ship while `main` is red. Finish the codex-rs port + unblock test build.

**Work:**

- **FIX-006a — Rewrite the 24 errors in `agiworkforce-app-server`.** Three error classes:
  - **Symbol invention** (`lib.rs:55, :649`, `in_process.rs:86`, `message_processor.rs:70, :1059, :1129`): replace `AgiworkforceFeedback` with the actual exported name from `agiworkforce-feedback` (read its `lib.rs`); rename `Feature::RemoteControl` to whichever variant survived the rebrand; replace `list_accessible_connectors_from_mcp_tools_with_environment_manager` with the current function name.
  - **Unsized slice** (`bespoke_event_handling.rs:1910, :1911, :1928`): change `[RolloutItem]` to `Vec<RolloutItem>` or `Box<[RolloutItem]>` in the trait method signature — the upstream `Rollout` API uses owned containers.
  - **Trait/arity drift** (`bespoke_event_handling.rs:2762`, `config_api.rs:406-444`, `lib.rs:121`, `message_processor.rs:1048, :1057`): each is a small migration to the current `RequestPermissionProfile` / `SimplePermissionProfile` / `NetworkDomainPermissionToml` / `ThreadConfigLoader` / `AgiworkforceAuth` shapes — read the trait's current source and re-thread the call site.
- **FIX-006b — Add `pretty_assertions = "1"`** under `[dev-dependencies]` in `crates/agiworkforce-utils-pty/Cargo.toml`.
- **Sweep the rest of the workspace.** After app-server compiles, run `cargo check --workspace` and `cargo test --workspace --lib --no-run`; fix any remaining hallucinated symbols in other crates that batch 7 of the rebrand left broken (memory says "36 of 54 compiling" — assume more port-fixup awaits).

**Critical files:**

- `crates/agiworkforce-app-server/src/{lib.rs, in_process.rs, message_processor.rs, bespoke_event_handling.rs, config_api.rs}`
- `crates/agiworkforce-utils-pty/Cargo.toml`
- `crates/agiworkforce-feedback/src/lib.rs` (read-only — to discover the real exported names)
- `crates/agiworkforce-protocol/src/protocol.rs` (read-only — to discover the real `Feature` variants and `*PermissionToml` shapes)

**Exit criteria:**

- `cargo check --workspace` exits 0.
- `cargo test --workspace --lib --no-run` exits 0.
- A push to `main` produces a `success` CI run on GitHub Actions.

---

### Sprint 1 — Vault rewire (Days 5–10)

Make every credential-storage path actually depend on the master password. This is the highest-risk sprint and must be done in one shot to avoid leaving rows half-encrypted under different keys.

**Work:**

- **FIX-001 — Wire `MasterPasswordManager` through `save_api_key`.**
  - Inject `MasterPasswordManager` as Tauri `State` at startup.
  - Add `KeyPurpose` variants: `Messaging(MessagingPlatform)`, `SupabaseAuth`. Update `machine_key::derive_key_with_password` callers to handle the new variants.
  - Replace `derive_key(KeyPurpose::McpCredentials)` in `apps/desktop/src-tauri/src/sys/commands/mcp_oauth.rs:1269-1286` with `MasterPasswordManager::derive_key(...)` requiring an unlocked vault; reject calls from a locked vault with a structured error.
  - Add IPC commands `vault_unlock(password)` / `vault_lock()` / `vault_status()`. Surface in `apps/desktop/src/components/Settings/`.
  - Add a one-shot migration: on first run after upgrade, decrypt all rows of `api_keys` with the legacy machine key, prompt for master password (UI flow), re-encrypt under the new key.
- **FIX-002 — Encrypt Slack/WhatsApp/Teams credentials at `apps/desktop/src-tauri/src/sys/commands/messaging.rs:71-237`.** Use the same vault. Decrypt at `send_message` (line 245-310). Migration re-encrypts existing rows.
- **FIX-004 — Route Supabase token storage through IPC + vault in Tauri builds.** Branch `apps/desktop/src/lib/supabase.ts:24-104` on `getRuntimeEnv()` from `@agiworkforce/runtime`; in Tauri, call new `supabase_token_set/get` IPCs (vault-backed); in web, accept localStorage as plaintext. Delete the public-derivable-key encryption helper in Tauri builds. Migration: read legacy localStorage value, decrypt with old code, store via IPC, `removeItem`.
- **FIX-046 — Rename `KEYRING_SERVICE` from `"codex"` to `"agiworkforce"`** in `crates/agiworkforce-secrets/src/lib.rs:22` with a one-shot migration that reads from both names.

**Critical files:**

- `apps/desktop/src-tauri/src/sys/security/{master_password.rs, machine_key.rs, encryption.rs, storage.rs}`
- `apps/desktop/src-tauri/src/sys/commands/{mcp_oauth.rs, messaging.rs}`
- `apps/desktop/src-tauri/src/data/settings/service.rs:306` (the internal helper — may need re-routing)
- `apps/desktop/src/lib/supabase.ts`
- `apps/desktop/src/components/Settings/` (new vault-unlock UI)
- `crates/agiworkforce-secrets/src/lib.rs:22`

**Reuse:** `MasterPasswordManager` (verified ready), `tool_confirmation` for the unlock prompt UI signal.

**Exit criteria:**

- `sqlite3 agiworkforce.db "select credentials from messaging_connections limit 1"` returns base64 ciphertext, never JSON.
- `localStorage.getItem('sb-…-auth-token')` is `null` in Tauri after migration.
- An exfiltrated SQLite file fails to decrypt on a different machine.
- Cold start prompts the user for master password before any LLM call.
- `grep -rn "machine_key::derive_key\b" apps/desktop/src-tauri/src/sys/commands` returns 0 hits in credential-storing call sites.

---

### Sprint 2 — Approval gates, CSP, prompt-injection hardening (Days 11–15)

Block the indirect-prompt-injection blast radius. None of these requires new infrastructure; they all use existing utilities.

**Work:**

- **FIX-003 — Gate `computer_use_*` through `tool_confirmation`.**
  - In `apps/desktop/src-tauri/src/sys/commands/computer_use.rs:198-330`, call `tool_confirmation::request_confirmation_simple(...)` at the entry of `computer_use_click`, `computer_use_type_text`, `computer_use_move_mouse`, `computer_use_execute_tool`. Mirror `terminal.rs:60-90`.
  - Replace `tracing::info!("Typing text: {}", text)` (line 253) with `tracing::info!("Typing {} chars", text.chars().count())`. Apply `redact_secrets(&text)` from `sys/security/log_redaction.rs:82` if diagnostic dumps are needed.
  - Add token-bucket rate limiting (max N actions/minute) on click/type/move.
  - Replace the raw `match tool_name.as_str()` in `computer_use_execute_tool` with an explicit allow-list enum.
- **FIX-005/012 — Drop `'unsafe-inline'` from `style-src` in `apps/desktop/src-tauri/tauri.conf.json:24`.**
  - Sweep `apps/desktop/src/` for `style={{...}}` props; convert to Tailwind classes or CSS variables on `:root`.
  - For unavoidable static blocks, generate a Vite plugin that hashes them and emits CSP-compatible SHA-256 list (or Tauri `cspHashes`).
  - Drop `https://fonts.googleapis.com` from `style-src` once fonts are self-hosted (link tag → local @font-face).
- **FIX-013 — Path validation on `git_*` commands.** Wrap each `path: String` argument in `apps/desktop/src-tauri/src/sys/commands/git.rs:99, :111, :200, :226` with `validate_path_security(&path).map_err(|e| e.to_string())?;`. Iterate over `Vec<String>` of files in `git_add` and validate each. Sanitize commit message: ≤10 KB, no NUL, no control chars except `\n\r\t`.
- **FIX-014 — Bound `fs_search` limit.** `apps/desktop/src-tauri/src/sys/filesystem/search.rs:5-21` — `let limit = limit.min(10_000);`. Hard-stop walk after 100 K entries even if matches < limit.
- **FIX-015 — Cryptographic delimiters on prompt-tool injection and attachment text.**
  - `apps/desktop/src-tauri/src/core/llm/prompt_tool_injection.rs:91-94`: wrap `&injection` in `<tool_catalog version="1" nonce="…">…</tool_catalog>` with per-call random nonce. Strip the nonce string from user content before generation.
  - `apps/desktop/src-tauri/src/core/agi/orchestrator.rs:620-630`: replace `[End Attachment]` with per-call hex nonce sentinel; strip the sentinel from user/attachment text before concatenation.
- **FIX-016 — Replace substring path blacklist with canonical allow-list.** `apps/desktop/src-tauri/src/sys/commands/file_ops.rs:181-206`. Allow-list: `$HOME/.agiworkforce/**`, `$DOCUMENT/**`, `$DOWNLOAD/**`, plus user-selected workspace roots. Reject any canonical path escaping the allow-list.

**Critical files:**

- `apps/desktop/src-tauri/src/sys/commands/{computer_use.rs, git.rs, file_ops.rs}`
- `apps/desktop/src-tauri/src/sys/filesystem/search.rs`
- `apps/desktop/src-tauri/src/core/llm/prompt_tool_injection.rs`
- `apps/desktop/src-tauri/src/core/agi/orchestrator.rs:620-630`
- `apps/desktop/src-tauri/tauri.conf.json:24`
- `apps/desktop/src/**/*.tsx` (style audit, ~5 occurrences expected)
- `apps/desktop/vite.config.ts` (CSP-hash plugin)

**Reuse:** `tool_confirmation::request_confirmation_simple`, `validate_path_security`, `redact_secrets`.

**Exit criteria:**

- Calling `computer_use_click` while gate is denied returns `Err(ApprovalRequired)`.
- Tracing logs from a typing run show `chars=N` only.
- Browser console: zero CSP violations on every screen.
- Unit tests: `git_init("/etc/passwd")` → `Err`; `fs_search_files(_, usize::MAX)` returns ≤10 000 results; PDF text containing `[End Attachment]` does not break the boundary.

---

### Sprint 3 — Cost controls + dependency CVE bumps (Days 16–20)

Stop the cost-leak vector and clear the audit backlog.

**Work:**

- **FIX-007 — Per-request token cap + per-user daily cap (NEW CODE).**
  - In `apps/desktop/src-tauri/src/core/llm/provider_adapter.rs::adapt_request` (lines 714, 808, 1715), clamp `max_tokens` to a configured per-provider ceiling (e.g., chat: 4096, code-mode: 16384) unless UI explicitly overrides.
  - **Build new `DailyBudgetGuard`** as Tauri `State` backed by SQLite (`budget_daily_spend(user_id, day, spent_usd)`). Increment on `cost_calculator` results. Reject when daily cap exceeded. Default $25/day, configurable in Settings.
  - Surface `$X / $Y today` in status bar.
  - Fix `ManagedCloudProvider::default` (`core/llm/providers/managed_cloud_provider.rs:49-60`) to propagate `Client::builder` errors instead of silently dropping timeouts.
- **FIX-017 — pnpm overrides for transitive vulns.** Add to `package.json:18-30 pnpm.overrides`: `node-forge >=1.4.0`, `lodash-es >=4.18.1`, `dompurify >=3.4.0`, `@xmldom/xmldom >=0.8.13`, `path-to-regexp >=8.4.2`, `postcss >=8.5.13`, `brace-expansion >=5.0.5`. Bump `next` to latest 16.x patch and `@anthropic-ai/sdk` in `apps/web` to ≥0.91.1. `pnpm install`, `pnpm test`, `pnpm build`.
- **FIX-018 — cargo bumps.** `cargo update -p rustls-webpki -p hickory-proto -p imageproc --aggressive`. For `rsa 0.9.10` Marvin Attack via `mongodb`/`mysql_async`: audit usage in `apps/desktop/src-tauri/src/data/`; if these DB drivers are unused (verify), remove from deps.
- **FIX-026 — Replace 3 `todo!()` in `crates/agiworkforce-config/src/config_toml.rs:284, :298, :468`** with `Err(ConfigError::NotImplemented(...))`. Add tests for the previously-todo!'d paths.
- **FIX-027 — Replace `unimplemented!()` in `crates/agiworkforce-linux-sandbox/src/landlock.rs:258`** with graceful `Err`. Detect at runtime; fall back or refuse with clear message.
- **FIX-043 — Flip CI audit gates to blocking.** Change `.github/workflows/ci.yml:63, :111` from `continue-on-error: true` to blocking now that fixes have landed.

**Critical files:**

- `apps/desktop/src-tauri/src/core/llm/{provider_adapter.rs, llm_router.rs, providers/managed_cloud_provider.rs}`
- `apps/desktop/src-tauri/src/core/agent/autonomous.rs` (reference pattern for cap)
- `apps/desktop/src-tauri/src/data/db/migrations.rs` (add `budget_daily_spend` table)
- `package.json:18-30`, `apps/web/package.json` (`@anthropic-ai/sdk`)
- `Cargo.lock`
- `crates/agiworkforce-config/src/config_toml.rs`
- `crates/agiworkforce-linux-sandbox/src/landlock.rs`
- `.github/workflows/ci.yml:63, :111`

**Exit criteria:**

- `pnpm audit --prod --audit-level=high` exits 0.
- `cargo audit` shows ≤ explicitly-justified ignored entries.
- 11th maxed-out call after 10 in a day returns `BudgetExceeded`.
- `cargo build --target=aarch64-unknown-linux-gnu -p agiworkforce-linux-sandbox` succeeds.
- A deliberately-introduced high-sev dep triggers CI failure.

---

### Sprint 4 — Pipelines, signing, legal (Days 21–28)

Two streams in parallel — engineering (signing/CI) and policy (Privacy/ToS).

**Engineering stream:**

- **FIX-009 — Windows test job.** Add `windows-smoke` to `ci.yml` (cargo check, cargo test --workspace --lib with linux-only skips); make `release-desktop.yml` `needs: windows-smoke`.
- **FIX-010 — Sign Windows installer.** Acquire EV certificate (Sectigo/DigiCert or AWS-issued via KMS). Add `WINDOWS_CERTIFICATE`, `WINDOWS_CERTIFICATE_PASSWORD` secrets. Wire AzureSignTool/SignTool in `release-desktop.yml`. **Refuse to ship unsigned**: fail the Windows job if secret is missing.
- **FIX-011 — Fail-fast on missing macOS signing secrets.** Add a precondition step at the top of macOS build job in `release-desktop.yml:271` that errors when `APPLE_CERTIFICATE/APPLE_CERTIFICATE_PASSWORD/APPLE_SIGNING_IDENTITY/APPLE_ID/APPLE_PASSWORD/APPLE_TEAM_ID` is empty.
- **FIX-019 — E2E test theater.** `apps/desktop/e2e/agi-safety.spec.ts` (596 LOC) and `comprehensive-flows.spec.ts` (933 LOC) wrap every assertion in `if (await locator.isVisible(...).catch(() => false))`. Replace with `await expect(locator).toBeVisible(...)` (throws on absence). For genuinely conditional features, split into "feature present" / "feature absent" tests, each with `expect.assertions(N)`. Sweep all 17 specs.
- **FIX-039 — Stop skipping Rust automation tests in CI.** `.github/workflows/ci.yml:117` removes `--skip enigo --skip AutomationService --skip automation`. If they need DISPLAY, run under `xvfb-run` or a self-hosted runner with display.
- **FIX-040 — Remove `continue-on-error: true`** from production deploy step `deploy-signaling-server.yml:245`.

**Legal stream (requires counsel):**

- **FIX-008 — Rewrite Privacy Policy** at `apps/web/app/privacy/page.tsx`:
  - List BYOK providers explicitly + data sent to each.
  - Disclose Sentry + GTM/GA by name with opt-out path.
  - Add GDPR/CCPA data-subject rights with concrete steps; point at `privacy_export_data` / `privacy_delete_account` IPC commands.
  - State Supabase region (us-east-2) and EU residency status.
  - Remove "managed proxy only" / "no logging" / "local-first" language.
  - Add regression test `apps/web/__tests__/privacy-claims.spec.ts` asserting policy contains `Sentry`, `Google Tag Manager`, ≥20 provider names.
- **FIX-035 — Rewrite ToS** at `apps/web/app/terms/page.tsx`. Add: DPA, governing law, warranty disclaimer, limitation of liability, arbitration/jurisdiction, termination, auto-renewal disclosure (Stripe).
- **FIX-041 — Surface GDPR rights in the app.** New Settings → Privacy & Data section with Export Data (download JSON) + Delete Account (double-confirm + 7-day grace). Verify Supabase row-level deletion fires.
- **FIX-042 — Disclose data residency.** Add Settings → Data Residency. If EU not on roadmap, gate sign-up on region detection.

**Critical files:**

- `.github/workflows/{ci.yml, release-desktop.yml, deploy-signaling-server.yml}`
- `apps/desktop/src-tauri/tauri.conf.json:36-43` (Windows signing identity)
- `apps/web/app/{privacy/page.tsx, terms/page.tsx}`
- `apps/desktop/e2e/*.spec.ts` (17 files)
- `apps/desktop/src/components/Settings/Privacy/` (new GDPR UI)

**Exit criteria:**

- `signtool verify /pa <installer>.exe` returns "Successfully verified".
- A run with one Apple secret unset fails fast — never produces unsigned macOS bundle.
- A regression hiding the safety panel causes the e2e test to fail (currently passes).
- Privacy doc names every external party; opt-out flow demonstrably suppresses calls.
- `pnpm audit --prod --audit-level=high` blocking step is green.

---

### Sprint 5 — Architecture cleanup (Days 29–36)

Now that the port is finished and the security/legal P0s are closed, repay the structural debt that compounds every PR.

**Work:**

- **FIX-020 — Consolidate state stores.** Pick canonical: `packages/chat/src/stores/chatStore.ts` for chat. Build `packages/auth`, `packages/settings`, `packages/agents`. Delete duplicate files in `apps/web/stores/unified/chat/`, `apps/web/shared/stores/chat-store.ts`, `apps/web/features/chat/stores/chat-store.ts`, `apps/desktop/src/stores/chat/chatStore.ts` (point to `@agiworkforce/chat`). Same pattern for auth (5 stores), settings (6 stores), agents (6 stores). Either populate `packages/stores/src/index.ts:12` with re-exports of all four, or delete the package and remove from `apps/web/package.json:24`, `apps/desktop/package.json:30`.
- **FIX-021 — Defork TUI.** Pick `crates/agiworkforce-tui` as canonical (codex-rs port lineage most complete). Make `apps/cli/Cargo.toml` depend on it. Delete `apps/cli/src/tui/` (125 .rs) and `crates/agiworkforce-tui_app_server/` (138 .rs) after CI passes. **Note:** since user chose to finish the port, this defork is the natural follow-on.
- **FIX-022 — Prune dead vendored crates.** Now that the port is finished, generate the actual reverse-dep graph; remove crates not consumed by `apps/desktop/src-tauri/Cargo.toml` or `apps/cli/Cargo.toml`. Move `crates/*` glob in root `Cargo.toml:3` to an explicit kept-list.
- **FIX-023 — Replace hand-listed `generate_handler!` with proc-macro inventory.**
  - Adopt `inventory` or `linkme` for compile-time registration of every `#[tauri::command]`.
  - Wire existing `apps/desktop/check-wiring.sh` into `.github/workflows/ci.yml` as a guard step (quick win — script already exists).
  - Add a Vite/TS build step that scans `invoke('…')` literals against the same registry; fail build for unknowns. Will catch the 26 silently-unregistered commands and 20 frontend-targets-nonexistent invokes immediately.
- **FIX-024 — Centralize browser logger.** New `packages/logger` with `logger.debug/info/warn/error`. Dev: `console.*`. Prod: Sentry breadcrumbs + `captureException` for errors. Always: redact via JS port of `apps/desktop/src-tauri/src/sys/security/log_redaction.rs:17-72`. Codemod `apps/desktop/src` + `apps/web/src` + `apps/mobile`. Add ESLint `no-console` with allowlist for the logger pkg only.
- **FIX-025 — Linux computer-use gate.** Path B from FIX*QUEUE: at runtime on Linux, return `Err("Computer use is not supported on Linux yet")` from `computer_use*\*` and surface a UI banner. Defer Path A (build AT-SPI/libei integration) to a later release.
- **FIX-028 — `google_batch_*` disposition.** Pick A (real persistence + Google Cloud Batch API) or B (UI banner "BETA: in-memory only"). Recommend B for v1; queue A for v2.
- **FIX-029 — Implement device revocation** at `apps/desktop/src-tauri/src/sys/account/mod.rs:847`. Revoke device's Supabase refresh token; delete local stored token.
- **FIX-030 — Batch `data/supabase_sync.rs:227-245` `bulk_sync_to_cloud`.** Up to 1000 rows per POST. Per-batch retry with backoff.
- **FIX-031 — Cancellable agent goals.** Wrap `apps/desktop/src-tauri/src/core/agi/core.rs:404` spawn in `tokio::select!` against `CancellationToken`. Track `(JoinHandle, token)` registry by goal-id. New IPC `cancel_goal(goal_id)`. Apply same to `core/llm/background_manager.rs:112, :157`.
- **FIX-032 — Replace `std::sync::Mutex` with `tokio::sync::Mutex`** in `apps/desktop/src-tauri/src/core/agi/core.rs:115`. Add a clippy denylist forbidding `std::sync::Mutex` in `core/agi/`.
- **FIX-033 — Replace empty TTS catches** in `apps/desktop/src/stores/voiceModeStore.ts:335, :343, :694` and `apps/desktop/src/hooks/useTTS.ts:169` with logged + toasted handlers.
- **FIX-034 — Forked OSS Rust deps disposition.** Confirm openai-oss-forks license; document in `docs/legal/THIRD_PARTY.md`. Either upstream the patches and bump (preferred) or fork to `github.com/agiworkforce/*` with explicit license notice. If neither, remove the patch and migrate off whatever feature requires it.
- **FIX-036 — Add "Local mode or Cloud mode" first-launch picker** to `apps/desktop/src/components/Onboarding/OnboardingWizard.tsx`. Local: skip Supabase + Sentry; only local providers. Cloud: full flow.
- **FIX-037 — Auth race fix.** Cold-boot loading state on Sign In button until Supabase session resolves; subscribe to `onAuthStateChange`.
- **FIX-038 — Add root README + BUILD + CONTRIBUTING.** Prereqs (Node 22, pnpm 9.15.3, Rust 1.94.0, Tauri system deps per OS). Build commands. CLI run instructions. Branch protection / PR conventions.
- **FIX-044 — Remove hardcoded author path** in `apps/cli/src/tui/resume_picker.rs:1419`. Replace with `env!("CARGO_MANIFEST_DIR")`. Sweep `apps/cli/src/` for other absolute paths.
- **FIX-045 — `git rm --cached apps/web/.next/required-server-files.json`** and audit `git status --ignored` for other slipped build outputs.
- **FIX-047 — Per-migration tests + split `migrations.rs`.** Move each `apply_migration_vN` to its own file under `data/db/migrations/v{n}.rs` with a `mod.rs` dispatch table. Add a test per migration: run 1..N on fresh in-memory DB; smoke INSERT/SELECT against new tables. Idempotency test: run all migrations on clean DB.

**Critical files:**

- `packages/{chat, auth, settings, agents, logger, stores}/`
- `apps/{desktop, web, mobile}/src/stores/**` (delete most)
- `apps/cli/src/tui/`, `crates/agiworkforce-tui_app_server/` (delete after defork)
- `apps/desktop/src-tauri/src/lib.rs:1038-2580` (replace registry)
- `apps/desktop/check-wiring.sh` (wire to CI)
- `apps/desktop/src-tauri/src/data/db/migrations.rs` → split
- README at repo root (new)

**Exit criteria:**

- `find apps packages -name "*chatStore*" -o -name "chat-store*"` returns ≤ 2 paths.
- `find apps/cli/src/tui crates/agiworkforce-tui_app_server -type f` returns empty.
- Adding a `#[tauri::command]` without registering surfaces a build error.
- `grep -rn "console\.log\|console\.error" apps/desktop/src apps/web/src apps/mobile | wc -l` ≤ 50.
- Junior engineer can clone repo + follow README + build desktop in < 30 min.

---

### Sprint 6 — P2 polish & verification (Days 37–42)

Close P2s and run a full pre-release verification.

**Work:**

- **P2 sweep:** A11y label sweep on icon-only buttons (target 90%+ ratio); ErrorBoundary dedupe (delete duplicate at `apps/desktop/src/components/ErrorHandling/ErrorBoundary.tsx`); convert role="button" to `<button>` at `Layout/UserProfile.tsx:67-68`; offline cloud-model graceful gate; `cargo audit` global ignore-list per-entry justification; `connect-src http://localhost:11434` review (only when Ollama is configured); `redact_secrets` route enforcement at `core/mcp/transport.rs:542`, `features/calendar/google_calendar.rs:184, :230`; `cargo-license` + `license-checker` added to CI; `LICENSE` placeholder fix.
- **Pre-release verification:**
  - Full Playwright suite green (after FIX-019).
  - `cargo test --workspace --all-features` green.
  - `pnpm test` green.
  - Manual smoke: vault unlock flow, save+retrieve provider key, computer-use action prompts modal, agent budget enforcement triggers at $25 day, Privacy Policy export+delete works end-to-end, Windows installer SmartScreen-clean, macOS notarized.
  - Tag a fresh release; confirm `Release Desktop` workflow succeeds and produces signed bundles for macOS (universal/aarch64/x86_64), Windows x64 (signed), Linux x64.

**Exit criteria:**

- All P0/P1/P2 fixes merged.
- Tagged release pipeline green.
- A11y audit reports ≥90% labeled buttons.
- AUDIT_REPORT.md re-run shows P0 = 0, P1 = 0.

---

## Decision points within the plan

| Decision                       | Where                  | Default                                                                 | Rationale                                                                          |
| ------------------------------ | ---------------------- | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Daily budget cap default       | FIX-007 (Sprint 3)     | $25/day, per-user, applies to BYOK and managed cloud                    | Conservative; configurable in Settings; managed cloud may also enforce server-side |
| `google_batch_*` disposition   | FIX-028 (Sprint 5)     | Path B (UI banner "BETA: in-memory only"); queue Path A                 | Faster ship; honest about capability                                               |
| Linux computer-use disposition | FIX-025 (Sprint 5)     | Path B (gate with banner)                                               | Path A is 3–5 weeks of AT-SPI/libei work; defer to v2                              |
| EU data residency              | FIX-042 (Sprint 4)     | Disclose us-east-2; gate EU sign-up if not on roadmap                   | Either commit to EU region or be explicit it's unavailable                         |
| Forked OSS Rust deps           | FIX-034 (Sprint 5)     | Try upstream first; fork to `github.com/agiworkforce/*` if not feasible | Removes single-org supply-chain risk                                               |
| Privacy/ToS legal counsel      | FIX-008/035 (Sprint 4) | **Required before merge**                                               | Do not ship policy changes without sign-off                                        |
| Vault unlock UX cadence        | FIX-001 (Sprint 1)     | Unlock once per app launch; auto-relock after 30 min idle               | Balance between security and friction                                              |

---

## Verification — end-to-end test plan

Runnable locally and in CI after all sprints land.

```bash
# Sprint 0 verification
cargo check --workspace
cargo test --workspace --lib --no-run
gh run list --workflow=ci.yml --limit 1   # expect: success

# Sprint 1 verification
sqlite3 ~/Library/Application\ Support/com.agiworkforce.desktop/agiworkforce.db \
  "select credentials from messaging_connections limit 1" | head -c 32   # expect: base64, not JSON
grep -rn "machine_key::derive_key\b" apps/desktop/src-tauri/src/sys/commands  # expect: 0
# Cold start: master password modal appears before LLM works.

# Sprint 2 verification
# Run app, navigate every screen with browser console open: zero CSP violations.
# Trigger computer-use from agent: confirmation modal appears.
cargo test -p agiworkforce-desktop sys::commands::git -- path_traversal
cargo test -p agiworkforce-desktop sys::filesystem::search -- limit_cap

# Sprint 3 verification
pnpm audit --prod --audit-level=high   # expect: 0 advisories
cargo audit                             # expect: empty or only justified-ignored
cargo build --target=aarch64-unknown-linux-gnu -p agiworkforce-linux-sandbox

# Sprint 4 verification
signtool verify /pa target/release/bundle/nsis/AGI-Workforce*.exe  # expect: "Successfully verified"
# E2E suite: hide a feature, expect tests to fail (currently they pass).
pnpm --filter desktop exec playwright test --project=smoke

# Sprint 5 verification
find apps packages -name "*chatStore*" -o -name "chat-store*" | wc -l   # expect: ≤2
find apps/cli/src/tui crates/agiworkforce-tui_app_server -type f 2>/dev/null  # expect: empty
# Add a #[tauri::command] without registering: expect cargo build to fail.

# Sprint 6 verification (release)
git tag v1.2.0-rc1 && git push origin v1.2.0-rc1
gh run watch                             # Release Desktop workflow → success
# Download the installers; verify macOS notarized and Windows signed.
```

---

## Out of scope for this plan

- P3 cosmetic findings (LICENSE placeholder, fib.py at repo root, etc.) — apply opportunistically.
- Build EU Supabase region (committed: disclose, not build).
- Build AT-SPI/Wayland Linux computer-use (committed: gate, not build).
- Build real Google Cloud Batch integration (committed: banner, not build).
- New product features. This plan is exclusively remediation.

---

## References

- `/Users/siddhartha/Desktop/agiworkforce/AUDIT_REPORT.md` — full audit detail
- `/Users/siddhartha/Desktop/agiworkforce/FIX_QUEUE.md` — granular fix prompts (FIX-001..FIX-047)
- `~/.claude/projects/-Users-siddhartha-Desktop-agiworkforce/memory/product-vision.md` — stated vision (drift addressed in Sprint 5 via state-store consolidation; full "delete 25 views" UX overhaul is _out of scope_ for this remediation plan and should be a separate product decision)

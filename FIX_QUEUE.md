# AGI Workforce Fix Queue — 2026-05-01

Ordered list of every P0 and P1 finding, formatted as actionable Claude Code prompts. Each entry is self-contained; paste any one into a fresh Claude session.

Estimated remediation: 22–30 engineering days for the full P0+P1 set (one engineer).

---

## FIX-001 [P0] — Wire master-password through `save_api_key` so provider keys actually need a password

**Prompt:**
The Argon2id `MasterPasswordManager` at `apps/desktop/src-tauri/src/sys/security/master_password.rs` is fully implemented but unused. `apps/desktop/src-tauri/src/sys/commands/mcp_oauth.rs:1731-1743` calls `encrypt_credential(&key)` which calls `derive_key(KeyPurpose::McpCredentials)` (`apps/desktop/src-tauri/src/sys/security/machine_key.rs:162-182`) — that is machine-only. `derive_key_with_password()` at `machine_key.rs:238-266` has zero callers (verify with `grep -rn derive_key_with_password apps/desktop/src-tauri/src`).

Steps:

1. Promote `MasterPasswordManager` to a Tauri-managed `State` populated at startup. Require unlock before any `save_api_key` / `retrieve_api_key` call (return `Err("vault locked")` when not unlocked).
2. Change `encrypt_credential` and the parallel helper in `apps/desktop/src-tauri/src/sys/security/storage.rs:203` (`store_api_key`) to call `MasterPasswordManager::derive_key(KeyPurpose::Provider(name))` instead of `machine_key::derive_key`.
3. Add a one-shot migration: on first run after upgrade, decrypt all rows of `api_keys` with the legacy machine key, prompt the user for a master password, re-encrypt under the new key.
4. Add a new IPC `vault_unlock(password)` and `vault_lock()`; require the unlocked state for the existing `save_api_key`, `retrieve_api_key`, `delete_api_key`, plus the `messaging.rs` flows in FIX-002.
5. Update `apps/desktop/src/components/Settings/` UI to prompt for master password on first key add and on app launch.

**Verification:** `grep -rn "machine_key::derive_key\|machine_key.derive_key" apps/desktop/src-tauri/src/sys/commands` returns 0 hits for credential-storing call sites; cold-start launches a password prompt before any LLM call works; an exfiltrated SQLite file cannot be decrypted on a different machine.

---

## FIX-002 [P0] — Stop storing Slack/WhatsApp/Teams credentials as plaintext JSON

**Prompt:**
`apps/desktop/src-tauri/src/sys/commands/messaging.rs:71-237` writes Slack `bot_token`/`app_token`/`signing_secret`, WhatsApp `access_token`/`verify_token`, and Teams `client_secret`/`tenant_id` into `messaging_connections.credentials` as `serde_json::json!({...}).to_string()`. The author's own `// TODO: SECURITY` (lines 87, 140, 199) names the gap. Fix:

1. Encrypt the JSON via the same `MasterPasswordManager::encrypt(KeyPurpose::Messaging(platform))` pipeline introduced by FIX-001 before INSERT.
2. Decrypt at `send_message` (line 245-310) before constructing the platform `*Config` struct.
3. Add a migration that re-encrypts existing rows on first launch; if no master password is set, refuse to load until vault is unlocked.
4. Replace each `// TODO: SECURITY ... See FIX-R10.` with a 1-line `// NOTE: encrypted via MasterPasswordManager.` on the new path.

**Verification:** `sqlite3 ~/Library/Application\ Support/com.agiworkforce.desktop/agiworkforce.db "select credentials from messaging_connections limit 1"` returns base64 ciphertext, not JSON; `grep -n "TODO: SECURITY" apps/desktop/src-tauri/src/sys/commands/messaging.rs` returns 0; tests in messaging.rs cover round-trip encrypt/decrypt and reject load when vault is locked.

---

## FIX-003 [P0] — Gate `computer_use_*` IPC commands behind `tool_confirmation`

**Prompt:**
`apps/desktop/src-tauri/src/sys/commands/computer_use.rs:198-330` exposes `computer_use_click`, `computer_use_type_text`, `computer_use_move_mouse`, `computer_use_execute_tool` to the LLM with no approval. Compare `apps/desktop/src-tauri/src/sys/commands/terminal.rs:60-90` which calls `tool_confirmation::request_confirmation_simple` and `redact_secrets`.

Steps:

1. Add a Tauri-managed `ComputerUseGate` that requires per-action approval (modal in the desktop UI). Use `tool_confirmation::request_confirmation_simple(...)` like terminal.rs.
2. Default the gate to "ask every time"; add a Settings toggle to "approve for next N minutes" (max 15) and "always" (with a scary warning + log).
3. Replace `tracing::info!("Typing text: {}", text)` (line 253) with `tracing::info!("Typing {} chars", text.chars().count())`. Never log the text body. Apply `redact_secrets(&text)` if the text must be logged for diagnostics.
4. Add rate-limiting (token-bucket) on click/type/move per minute — block obvious flood attacks.
5. For `computer_use_execute_tool`, replace the raw `match tool_name.as_str()` with an explicit allow-list enum.

**Verification:** A unit test asserts `computer_use_click` returns `Err(ApprovalRequired)` when the gate denies; tracing logs from a typing run show `chars=N` and never the text; a rate-limit test confirms >10 clicks/sec is blocked.

---

## FIX-004 [P0] — Stop "encrypting" Supabase tokens in localStorage with a public key

**Prompt:**
`apps/desktop/src/lib/supabase.ts:28-65, 87-104` derives an "encryption" key from the constant `'agiworkforce-storage-v1-' + window.location.hostname` (which is `tauri://localhost`, fixed) plus the hardcoded salt `'agi-supabase-storage-salt-2026'`. The author's own comment at lines 24-25 says "anyone with source can reproduce the derivation."

Steps:

1. In Tauri builds, route Supabase token storage through a new IPC pair `supabase_token_set`/`supabase_token_get` that stores via `MasterPasswordManager::encrypt(KeyPurpose::SupabaseAuth)` into the SQLite vault. No localStorage at all in Tauri.
2. In the web build (`apps/web`), Supabase's default storage already uses `localStorage` — accept that this is the platform constraint and stop pretending it's encrypted. Delete the encrypt/decrypt code and just store the bare access token.
3. Update `apps/desktop/src/lib/supabase.ts:24-104` to detect runtime via the existing `@agiworkforce/runtime` `detect.ts` and branch.
4. Migration: on first run, read any existing localStorage value, decrypt with the legacy key, store via the new IPC, and `localStorage.removeItem`.

**Verification:** In Tauri: `localStorage.getItem('sb-…-auth-token')` returns `null` after migration; tokens are recoverable only with the master password; a unit test confirms a tampered DB row fails to decrypt and surfaces a sign-out.

---

## FIX-005 [P0] — Tighten CSP: drop `'unsafe-inline'` from style-src

**Prompt:**
`apps/desktop/src-tauri/tauri.conf.json:24` has `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com`. Combined with `dompurify 3.3.3` (used by `apps/desktop > dompurify`, `monaco-editor > dompurify`, `mermaid > dompurify`), an XSS-via-style-injection vector becomes realistic. Tauri webview XSS = full IPC = the whole 1,459-command surface.

Steps:

1. Audit inline `style={{...}}` usage in `apps/desktop/src/`. Tailwind classes are fine; replace small `style=` props with classes or `data-*` + matching `<style>` block. For dynamically-computed colors/animations, switch to CSS variables on `:root` controlled by class toggles.
2. Generate a Vite plugin that hashes any unavoidable static `<style>` blocks and emits SHA-256 to a `csp-styles.json`.
3. Replace `'unsafe-inline'` with the resulting hash list (or a per-build nonce injected by Tauri's `cspHashes`).
4. Remove `https://fonts.googleapis.com` from `style-src` if you self-host fonts (you currently link to Google Fonts via stylesheet).

**Verification:** Launch the app, run every screen, observe browser console for CSP violations — must be zero. `grep -rn "style={{" apps/desktop/src | wc -l` ≤ 5; tauri.conf.json no longer contains `'unsafe-inline'` for style-src.

---

## FIX-006 [P0] — Bring CI back to green on `main`

**Prompt:**
The last 5 CI runs and `Release Desktop` for tag `v0.1.0` are all `failure` (verify: `gh run list --workflow=ci.yml --limit 5`). Two crates are broken:

1. `agiworkforce-app-server` has 24 compile errors from the codex-rs rebrand. Open `crates/agiworkforce-app-server/src/lib.rs:55, 76, 121, 649`, `in_process.rs:86`, `message_processor.rs:70, 1048, 1057, 1059, 1129`, `bespoke_event_handling.rs:1910, 2762`, `config_api.rs:406, 418, 434-444`. The errors fall into three classes:
   - Symbol invention: `AgiworkforceFeedback` (rebrand should be `agiworkforce_feedback::Feedback` or similar — find the actual exported name and use that), missing function `list_accessible_connectors_from_mcp_tools_with_environment_manager` (rename), enum variant `Feature::RemoteControl` (renamed during rebrand — find correct variant).
   - Unsized slice in async sink: `bespoke_event_handling.rs:1910-1928` needs `Box<[RolloutItem]>` or a `Vec` instead of `[RolloutItem]`.
   - Trait/arity drift: `bespoke_event_handling.rs:2762` and `config_api.rs:406-444` reference fields/variants/From impls that no longer exist on the rebranded permissions types.
2. `agiworkforce-utils-pty/src/tests.rs:4` imports `pretty_assertions` which is not declared as a dev-dependency. Add `pretty_assertions = "1"` to `crates/agiworkforce-utils-pty/Cargo.toml` `[dev-dependencies]`.

Decision required: either (a) finish the codex-rs port — rewrite the 24 broken sites against the current trait surfaces — or (b) drop `agiworkforce-app-server` from the workspace by adding it to `Cargo.toml`'s `exclude = [...]` (currently only `crates/agiworkforce-utils` is excluded). Option (b) is faster but leaves 11 K LOC of non-compiling code in-tree.

**Verification:** `cargo check --workspace` exits 0; `cargo test --workspace --lib --no-run` exits 0; the next CI run on main is `success`.

---

## FIX-007 [P0] — Per-request token cap + per-user daily cost cap before LLM calls

**Prompt:**
`apps/desktop/src-tauri/src/core/llm/provider_adapter.rs:714, :808, :1715` honors `max_tokens` only when present. There is no global ceiling. `apps/desktop/src-tauri/src/core/agent/autonomous.rs:180, :335, :767, :1051` enforces a $50 session cap that resets per autonomous run. There is no per-user daily cap. With BYOK + the unsafe `computer_use_*` (FIX-003 attack vector), a single indirect prompt injection can drain the user's API keys $50 at a time per autonomous loop iteration.

Steps:

1. Add a per-request `max_tokens` floor in `provider_adapter.rs::adapt_request` — clamp to a configured ceiling per-provider (e.g., 4 096 for chat, 16 384 for code-mode) unless the user-facing UI explicitly overrides.
2. Add a `BudgetGuard` (Tauri `State`) that tracks `(user_id, day) → spent_usd` in SQLite. Reject calls when daily cap is exceeded. Default: $25/day, configurable in Settings.
3. On `ManagedCloudProvider::default` fallback (`core/llm/providers/managed_cloud_provider.rs:49-60`), do NOT silently drop timeouts — propagate the timeout-builder error.
4. Surface budget state in the UI (status bar widget showing `$X / $Y today`).

**Verification:** Unit test that `adapt_request` returns `max_tokens ≤ ceiling` even when caller passes `Some(usize::MAX)`; integration test that the 11th call after 10 maxed-out calls in a day returns `BudgetExceeded`; managed-cloud fallback test that a transient builder failure produces an error, not a no-timeout client.

---

## FIX-008 [P0] — Privacy Policy must reflect actual architecture (BYOK, GTM/GA, Sentry)

**Prompt:**
`apps/web/app/privacy/page.tsx:55-105` claims a managed-proxy-only model with no logging and local-first storage. Code reality:

- 24 BYOK direct providers in `apps/desktop/src/types/provider.ts:1-25`.
- Google Tag Manager in `apps/web/core/monitoring/analytics-tracker.ts:124-188`, allowed by CSP `apps/web/proxy.ts:19`.
- Sentry in `apps/desktop/src/services/errorTracking.ts:5-75` (opt-in respected).
- Stripe webhook persists `stripe_customer_id` in Supabase.

Rewrite the privacy policy to:

1. List BYOK providers explicitly and the data sent to each (only what the user submits).
2. Disclose Sentry + GTM/GA by name, with opt-out path.
3. Add GDPR/CCPA data-subject rights with concrete steps (point at `privacy_export_data` / `privacy_delete_account` IPC commands; expose them in the UI Settings page).
4. State Supabase region (`us-east-2`) and the lack of EU residency option.
5. Remove any "we do not log" / "managed proxy only" / "local-first" language that is contradicted by the BYOK/Sentry/GTM reality.

Coordinate with legal counsel before publishing. Add a regression test (`apps/web/__tests__/privacy-claims.spec.ts`) that asserts the published policy contains the words "Sentry", "Google Tag Manager", and lists at least 20 provider names.

**Verification:** Privacy doc names every external party; a fresh user can opt out of Sentry/GTM and the calls are demonstrably suppressed; `data-subject` request UI exists at `/settings/privacy`.

---

## FIX-009 [P0] — Make CI pipeline match reality: tests must run on shipped Windows

**Prompt:**
`Release Desktop` builds Windows artifacts but no CI job runs the test suite on `windows-latest`. Add a Windows test job mirroring the macOS smoke pattern in `.github/workflows/ci.yml:249-275`. Skip only the linux-specific tests; run the rest. Block release on green Windows tests.

Steps:

1. Add `windows-smoke` job to `ci.yml` (runs `cargo check --workspace`, `cargo test --workspace --lib`, with `--skip` for linux-only modules).
2. Ensure `release-desktop.yml` requires `windows-smoke` to pass (via `needs:`).

**Verification:** PR that breaks Windows-only code (e.g., editing `automation/uia/`) fails Windows smoke and blocks release.

---

## FIX-010 [P0] — Ship Windows installer signed (or refuse to ship)

**Prompt:**
`apps/desktop/src-tauri/tauri.conf.json:36-43` declares only `digestAlgorithm` and a timestamp URL — no Windows code-signing identity. `release-desktop.yml` doesn't reference any Windows certificate secret. The installer ships unsigned → SmartScreen warnings deter users and erode trust.

Steps:

1. Acquire an EV Code Signing certificate (Sectigo, DigiCert, or AWS-issued via KMS — the latter avoids HSM shipping).
2. Add secrets `WINDOWS_CERTIFICATE` (base64-encoded PFX), `WINDOWS_CERTIFICATE_PASSWORD` (or AWS KMS keypair).
3. In `tauri.conf.json` `bundle.windows`, add `"certificateThumbprint"` (or use AzureSignTool / SignTool wrapper).
4. Wire the secrets in `release-desktop.yml` near the `tauri-action` step (mask them with `::add-mask::` like Tauri signing key).
5. **Refuse to ship unsigned**: in `release-desktop.yml`, fail the Windows job when secret is missing instead of producing an unsigned bundle.

**Verification:** `signtool verify /pa <installer>.exe` returns `Successfully verified`; a fresh Windows 11 install runs the installer without SmartScreen "Unrecognized publisher" warning.

---

## FIX-011 [P0] — Macros: macOS signing must fail if cert is missing, not silently skip

**Prompt:**
`release-desktop.yml:271` (and similar sites in the workflow) gates the signing step on `if: env.APPLE_CERTIFICATE != ''`. When the secret is absent, the build still uploads an unsigned `.app` as if it were a real release. Replace the gate with a hard fail: the job must error if any of `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`, `APPLE_SIGNING_IDENTITY`, `APPLE_ID`, `APPLE_PASSWORD`, `APPLE_TEAM_ID` is empty.

Add a precondition step at the top of the macOS build job:

```yaml
- name: Verify macOS signing secrets
  run: |
    for v in APPLE_CERTIFICATE APPLE_CERTIFICATE_PASSWORD APPLE_SIGNING_IDENTITY APPLE_ID APPLE_PASSWORD APPLE_TEAM_ID; do
      if [ -z "${!v}" ]; then echo "Missing $v"; exit 1; fi
    done
  env:
    APPLE_CERTIFICATE: ${{ secrets.APPLE_CERTIFICATE }}
    # ... rest
```

**Verification:** A run with one secret unset fails fast with a clear message; never produces an unsigned macOS bundle.

---

## FIX-012 [P1] — Drop `'unsafe-inline'` style-src and remove `style=` props

(Same as FIX-005 but listed here separately if scope exceeds a single PR — split if necessary.)

---

## FIX-013 [P1] — Path validation on git\_\* IPC commands

**Prompt:**
`apps/desktop/src-tauri/src/sys/commands/git.rs:99` `git_init(path)`, `:111` `git_status(path)`, `:200` `git_add(path, files)`, `:226` `git_commit(path, message)` accept arbitrary `path: String` and pass to `Repository::open()` with no validation. `apps/desktop/src-tauri/src/sys/commands/file_ops.rs:71-154` already has `validate_path_security()`.

Steps:

1. Wrap every `git_*` handler's `path` argument with `validate_path_security(&path).map_err(|e| e.to_string())?;` at function entry.
2. Apply the same to any `Vec<String>` of files in `git_add` and other commands; iterate and validate each.
3. For `git_commit` — sanitize the commit message: cap length (10 KB), reject NUL bytes, reject control chars except `\n`/`\r`/`\t`.

**Verification:** Unit test `git_init("/etc/passwd")` returns `Err`; `git_add(repo, vec!["../../etc/shadow"])` returns `Err`.

---

## FIX-014 [P1] — Bound `fs_search_files` and `fs_search_folders` `limit`

**Prompt:**
`apps/desktop/src-tauri/src/sys/filesystem/search.rs:5-21` accepts `limit: usize` unbounded — caller can pass `usize::MAX` and OOM the process via `walkdir`.

Steps:

1. Cap `limit` at 10 000 with `let limit = limit.min(10_000);` at function entry.
2. Add a hard-limit on result accumulation; abandon search after walk exceeds 100 000 entries even if matches < limit.
3. Apply the same to any other `*_search_*` IPC command.

**Verification:** Unit test that passing `usize::MAX` returns ≤ 10 000 results without leaking memory; `valgrind`/`heaptrack` shows bounded growth.

---

## FIX-015 [P1] — Strong delimiters for prompt-tool injection and attachment text

**Prompt:**
`apps/desktop/src-tauri/src/core/llm/prompt_tool_injection.rs:91-94` does `sys_msg.content.push_str(&injection)` with no delimiter. `apps/desktop/src-tauri/src/core/agi/orchestrator.rs:620-630` uses the literal string `[End Attachment]` as terminator — a malicious PDF can emit that string.

Steps:

1. In `prompt_tool_injection.rs`, wrap injection in `<tool_catalog version="1">…</tool_catalog>` with a per-call random nonce attribute. Reject generation if user content contains the nonce.
2. In `orchestrator.rs`, replace `[End Attachment]` with a per-call hex nonce sentinel. Strip the sentinel from any user/attachment text before concatenation (defense in depth).
3. Add a unit test: feeding text containing `[End Attachment]` or `<tool_catalog>` does not break the boundary.

**Verification:** A fixture PDF whose extracted text contains `[End Attachment]` followed by attacker instructions does NOT cause the LLM to treat those instructions as system content (verify with a mocked provider that asserts the system message ends at the right offset).

---

## FIX-016 [P1] — Replace substring path blacklist with allow-list

**Prompt:**
`apps/desktop/src-tauri/src/sys/commands/file_ops.rs:181-206` uses `path_lower.contains(blocked)` for blacklist checks. `events.txt` is blocked; `id_rsa`, `.kube/config`, `.docker/config.json`, `.netrc` are not.

Steps:

1. Convert to canonicalized-path allow-list rooted at `$HOME/.agiworkforce/**`, `$DOCUMENT/**`, `$DOWNLOAD/**`, plus user-selected workspace roots.
2. Reject any path whose canonical form escapes the allow-list (use `Path::canonicalize` + prefix check).
3. Drop the substring blacklist entirely once allow-list is in place.

**Verification:** Unit tests for `events.txt` (allowed in workspace), `~/.ssh/id_rsa` (denied), `/Users/x/Documents/foo` (allowed), `~/Documents/../.ssh/id_rsa` (denied even if `..` is canonicalized — confirm with explicit canonicalization).

---

## FIX-017 [P1] — Update vulnerable npm packages

**Prompt:**
`pnpm audit --prod` reports 12 high + 13 moderate. Add overrides to `package.json` for transitive deps that can't be bumped via direct upgrade:

```json
"pnpm": {
  "overrides": {
    "node-forge": ">=1.4.0",
    "lodash-es": ">=4.18.1",
    "dompurify": ">=3.4.0",
    "@xmldom/xmldom": ">=0.8.13",
    "path-to-regexp": ">=8.4.2",
    "postcss": ">=8.5.13",
    "brace-expansion": ">=5.0.5"
    // existing overrides preserved
  }
}
```

Bump direct deps:

- `next` to latest 16.x patch (DoS advisory `GHSA-q4gf-8mx6-v5v3`).
- `@anthropic-ai/sdk` from 0.80.0 to ≥0.91.1 in `apps/web` (insecure local-fs default permissions).

Run `pnpm install` and `pnpm test:all` and `pnpm build:all`. Repeat until `pnpm audit --prod --audit-level=high` is empty.

**Verification:** `pnpm audit --prod --audit-level=high` exits 0; CI's pnpm-audit-high step (currently `continue-on-error: true`) is changed to blocking.

---

## FIX-018 [P1] — Update vulnerable Rust crates

**Prompt:**
`cargo audit` reports 9 vulnerabilities. Bump:

- `rustls-webpki` to ≥ 0.103.13 (CRL panic + name-constraint bypass).
- `hickory-proto` to ≥ 0.26.1 (O(n²) name compression DoS). NSEC3 unbounded loop has no fix yet — file an upstream tracking issue if not done; consider replacing `hickory-resolver` upstream with `hickory-resolver` patched fork or `trust-dns` alt.
- `rsa` Marvin Attack — used by `mongodb`, `mysql_async`. No fix in `rsa 0.9`. Either pin transitive `rsa` to a fork that has the constant-time fix, or remove `mongodb`/`mysql_async` if unused (audit usage in `apps/desktop/src-tauri/src/data/`).
- `imageproc` 0.26.1 — bounds check issues; bump to latest.

Update `Cargo.lock` (`cargo update -p rustls-webpki -p hickory-proto -p imageproc --aggressive`). Re-run `cargo audit` until 0 unignored.

**Verification:** `cargo audit` exits 0 (or only emits ignored, justified entries); `Cargo.lock` change is reviewed.

---

## FIX-019 [P1] — Fix the e2e test theater

**Prompt:**
`apps/desktop/e2e/agi-safety.spec.ts` (596 LOC) wraps every assertion in `if (await locator.isVisible({ timeout: ... }).catch(() => false)) { ... expect(...) ... }`. When the UI lacks the selector, the test silently passes. Same pattern likely repeats across `apps/desktop/e2e/comprehensive-flows.spec.ts` (933 LOC) and other specs.

Steps:

1. Triage every `if (await locator.isVisible(...).catch(...))` block. For each:
   - If the feature is supposed to exist on the canvas this test is exercising, replace with `await expect(locator).toBeVisible({timeout:...})` (which throws on absence).
   - If the feature is conditional, split into separate test names — one for "feature present" path, one for "feature absent" path — each with concrete assertions.
2. Fail the test if neither branch's expectations run (use a `expect.assertions(N)` at the top of each test).
3. Sweep `apps/desktop/e2e/*.spec.ts` for the pattern; apply the same fix.

**Verification:** A regression that hides the safety panel causes the test to fail (currently it would pass); `expect.assertions(...)` ensures every test path makes assertions.

---

## FIX-020 [P1] — Consolidate state stores; pick one source of truth per concern

**Prompt:**
6 chat stores, 5 auth stores, 6 settings stores, 6 agent stores. `packages/stores/src/index.ts:12` is empty but imported as a workspace dep by web and desktop.

Steps:

1. Pick canonical per concern: `packages/chat/src/stores/chatStore.ts` for chat (already exported via `@agiworkforce/chat`), build `packages/auth`, `packages/settings`, `packages/agents` to mirror.
2. Migrate `apps/desktop/src/stores/chat/chatStore.ts` (2727 LOC) to import from `@agiworkforce/chat` instead of duplicating. Remove duplicate files in `apps/web/stores/unified/chat/`, `apps/web/shared/stores/chat-store.ts`, `apps/web/features/chat/stores/chat-store.ts`. Same for auth/settings/agents.
3. Either populate `packages/stores/src/index.ts` with re-exports of all four packages, or delete the package and its workspace references in `apps/web/package.json:24` and `apps/desktop/package.json:30`.
4. Add a lint rule (eslint custom or simple `git grep` in pre-commit) that forbids new files matching `apps/*/stores/(chat|auth|settings|agent)*Store.ts`.

**Verification:** `find apps packages -name "*chatStore*" -o -name "chat-store*"` returns ≤ 2 paths; `pnpm typecheck:all` passes; ` pnpm test` passes; user-visible behavior in chat/auth/settings/agents is unchanged across all three apps.

---

## FIX-021 [P1] — Collapse the 3-way TUI fork

**Prompt:**
The TUI lives 3× with diverged content:

- `apps/cli/src/tui/` (125 .rs)
- `crates/agiworkforce-tui/src/` (212 .rs)
- `crates/agiworkforce-tui_app_server/src/` (138 .rs)

`chatwidget.rs` is 12 198 / 10 888 / 9 733 LOC across the three; `diff` between two of them shows 3 730 differing lines.

Decide one canonical home. Recommendation: keep `crates/agiworkforce-tui` (the codex-rs port lineage is most complete) and have `apps/cli` consume it as a dep. Delete `crates/agiworkforce-tui_app_server` after porting any unique logic.

Steps:

1. Generate a diff matrix (`diff -r apps/cli/src/tui crates/agiworkforce-tui/src > /tmp/diff-cli-tui.patch`) for each of the 3 pairs.
2. Pick one canonical (recommend `crates/agiworkforce-tui`).
3. Make `apps/cli/Cargo.toml` depend on `agiworkforce-tui` and import its public surface.
4. Delete `apps/cli/src/tui/` and `crates/agiworkforce-tui_app_server/` after CI passes.

**Verification:** `find apps/cli/src/tui crates/agiworkforce-tui_app_server -type f 2>/dev/null` returns empty after cleanup; `cargo test -p agiworkforce-cli --features tui` passes.

---

## FIX-022 [P1] — Trim 880 K LOC of dead crates from the workspace

**Prompt:**
The desktop binary depends on 1 workspace crate (`agiworkforce-sandbox-policy`); the CLI on ~12. ~100 of the 115 ported codex-rs crates are unused by any shipping binary.

Steps:

1. Generate the actual reverse-dependency graph: `for c in $(ls crates/); do grep -rln "$c" apps/*/Cargo.toml apps/*/src-tauri/Cargo.toml 2>/dev/null; done` — keep crates that appear; mark the rest as candidates for removal.
2. For each candidate: search for any non-workspace consumer (`grep -rln "${c//-/_}" apps/`). If zero, delete the crate.
3. Remove deleted crates from `Cargo.toml` `members`.
4. Move `crates/*` glob to an explicit list of kept crates (avoid future re-pickup).

**Verification:** `du -sh crates/` shrinks substantially; `cargo build --workspace --release` time drops; the desktop and CLI bundles are byte-identical to before.

---

## FIX-023 [P1] — Replace hand-maintained `generate_handler!` registry with proc-macro inventory

**Prompt:**
`apps/desktop/src-tauri/src/lib.rs:1038-2580` is a 1380-entry hand-listed `generate_handler![...]` macro. 26 commands are defined with `#[tauri::command]` but missing from the list (silently dead); 20 frontend `invoke('…')` calls target nonexistent commands.

Steps:

1. Adopt `inventory` crate or write a small proc-macro that registers every `#[tauri::command]` with `linkme`/`inventory`.
2. At app startup, collect the inventory and call `tauri::generate_handler!` (or `tauri::Builder::invoke_handler`) over the collected list.
3. Add a build-script test that diffs `grep -hE '^#\[tauri::command\]' -A1 -r apps/desktop/src-tauri/src` vs the registry; fail the build if either side has unmatched entries.
4. Add a Vite/typescript step that scans `invoke('…')` literals and validates against the same registry; fail the build for unknowns.

**Verification:** Run `cargo build` and a known mismatch (e.g., delete a `#[tauri::command]` but leave the `invoke('…')` call) fails the build with a clear error.

---

## FIX-024 [P1] — Centralize browser logger; remove 1 247 raw `console.log`/`error`

**Prompt:**
1 247 raw `console.log`/`console.error` across `apps/desktop/src` + `apps/web/src` + `apps/mobile`. No level filtering, no PII redaction, Sentry not used as a logger facade.

Steps:

1. Add `packages/logger` (or extend `packages/utils`) exporting `logger.debug/info/warn/error(...)` that:
   - In development: forwards to `console.*`.
   - In production: routes to Sentry breadcrumbs + (where critical) `Sentry.captureException`.
   - Always: redacts via a JS port of `redact_secrets` (port the regex set from `apps/desktop/src-tauri/src/sys/security/log_redaction.rs:17-72`).
2. Codemod-replace all `console.log/error/warn` calls with `logger.*` in `apps/desktop/src` and `apps/web` (use `jscodeshift` or a regex sweep, then human review).
3. Add an ESLint rule (`no-console` with allowlist for `packages/logger` only).

**Verification:** `grep -rn "console\.log\|console\.error" apps/desktop/src apps/web/src apps/mobile | wc -l` ≤ 50 (allow tests + the logger pkg itself); ESLint passes with `no-console` enabled.

---

## FIX-025 [P1] — Linux computer-use parity (or guard rails)

**Prompt:**
`apps/desktop/src-tauri/src/automation/computer_use/window_manager.rs:409, :640` references `wmctrl`/`xdotool` shell-outs but no AT-SPI / Wayland code. There's no `automation/linux/` directory mirroring `automation/mac/` or `automation/uia/`. Computer-use degrades silently on Linux.

Two paths:

- **Path A (build):** Add a `automation/linux/` module using `at-spi` (X11) and `libei`/`libportal` (Wayland) for accessibility-driven input. ~3-5 weeks of work.
- **Path B (gate):** At runtime on Linux, return `Err("Computer use is not supported on Linux yet")` from `computer_use_*` and surface a clear UI banner.

Recommendation: Path B for v1.x, Path A for v2.

**Verification:** On Linux, attempting computer-use shows a visible banner; on macOS/Windows the existing flow still works.

---

## FIX-026 [P1] — `crates/agiworkforce-config` `todo!()` paths must not panic in production

**Prompt:**
`crates/agiworkforce-config/src/config_toml.rs:284, :298, :468` are three `todo!()` in TOML round-trip. If any path is reached at runtime, the process panics.

Steps:

1. Investigate each `todo!()` site — is it reachable from user input or only from internal callers with verified shapes?
2. Either implement the missing case or replace with `Err(ConfigError::NotImplemented(…))` and propagate.
3. Add unit tests that exercise the previously-todo!'d paths.

**Verification:** `grep -n "todo!()" crates/agiworkforce-config/src/` returns 0; tests cover the new error paths.

---

## FIX-027 [P1] — `crates/agiworkforce-linux-sandbox` must not panic on non-x86_64

**Prompt:**
`crates/agiworkforce-linux-sandbox/src/landlock.rs:258` is `unimplemented!("unsupported architecture for seccomp filter")`. Linux ARM users would crash.

Steps:

1. Replace `unimplemented!` with a graceful `Err(...)` return.
2. Detect at runtime — if seccomp is not supported, fall back to landlock-only sandbox or refuse to launch with a clear message.

**Verification:** `cargo check --target=aarch64-unknown-linux-gnu -p agiworkforce-linux-sandbox` succeeds; running the binary on aarch64 returns an error instead of crashing.

---

## FIX-028 [P1] — `google_batch_*` IPC commands must not pretend persistence

**Prompt:**
`apps/desktop/src-tauri/src/sys/commands/google_batch.rs:1-37` admits the implementation is an in-memory mock. Frontend calls `google_batch_create`, `google_batch_list`, `google_batch_cancel` with no indicator that data is lost on restart.

Choose:

- **A:** Implement real persistence (SQLite table + Google Cloud Batch API integration).
- **B:** Surface "BETA: in-memory only, lost on restart" in the UI, and stop persisting to UI state stores.
- **C:** Remove the commands until A is done; gate the UI behind a feature flag.

**Verification:** Either the data survives a restart, or the UI clearly tells the user it won't.

---

## FIX-029 [P1] — `device-revoke` no-op TODO

**Prompt:**
`apps/desktop/src-tauri/src/sys/account/mod.rs:847` is a TODO no-op. Implement device revocation: revoke the device's refresh token in Supabase and delete the local stored token.

**Verification:** Calling `account_disconnect_device(device_id)` removes the device from `account_list_devices` and the device can no longer refresh its session.

---

## FIX-030 [P1] — `data/supabase_sync.rs` N+1 over HTTP

**Prompt:**
`apps/desktop/src-tauri/src/data/supabase_sync.rs:227-245` `bulk_sync_to_cloud` calls `sync_conversation` (line 121) and `sync_message` (line 166) per row — one HTTP POST each. Supabase REST supports bulk POST with a JSON array.

Steps:

1. Batch into POSTs of up to 1 000 rows (Supabase REST limit).
2. Use `Prefer: resolution=merge-duplicates` once per batch instead of per row.
3. Add per-batch retry with exponential backoff.

**Verification:** A user with 10 000 messages syncs in ~10 HTTP calls instead of ~10 000.

---

## FIX-031 [P1] — Unbounded `tokio::spawn` in `core/agi/core.rs:404`

**Prompt:**
`apps/desktop/src-tauri/src/core/agi/core.rs:404` spawns long-running goal execution and drops the JoinHandle. There is no way to cancel a running goal.

Steps:

1. Wrap the spawned future in a `tokio::select!` against a `CancellationToken` (from `tokio_util::sync`).
2. Track the `JoinHandle` + token in a registry keyed by goal-id.
3. Implement `cancel_goal(goal_id)` IPC that triggers the token.
4. Apply same pattern to `core/llm/background_manager.rs:112, :157` if the same anti-pattern exists.

**Verification:** Starting a long agentic loop and pressing Cancel in the UI causes the worker to stop within < 5 s.

---

## FIX-032 [P1] — `std::sync::Mutex` in async hot path

**Prompt:**
`apps/desktop/src-tauri/src/core/agi/core.rs:115` uses `std::sync::Mutex` instead of `tokio::sync::Mutex`. Holding `MutexGuard` across `.await` will deadlock under concurrent IPC.

Steps:

1. Replace with `tokio::sync::Mutex` and update all call sites to `.lock().await`.
2. Add a `clippy.toml` lint or custom denylist to forbid `std::sync::Mutex` in modules under `core/agi/`.

**Verification:** Stress test with concurrent Tauri IPC calls into goal submission does not deadlock.

---

## FIX-033 [P1] — Audit `voiceModeStore.ts` empty catches

**Prompt:**
`apps/desktop/src/stores/voiceModeStore.ts:335, :343, :694` and `apps/desktop/src/hooks/useTTS.ts:169` swallow TTS errors silently. Users see no feedback when voice subsystem fails (auth, quota, permission).

Steps:

1. Replace each `.catch(() => {})` with `.catch((e) => { logger.warn('TTS stop failed', e); toast.error('Voice playback stopped'); })`.
2. Audit other empty catches in chat/voice paths similarly.

**Verification:** Triggering an artificial TTS failure surfaces a toast.

---

## FIX-034 [P1] — Remove forked OSS Rust dep patches or pin under our org

**Prompt:**
`Cargo.toml:31-35` patches `tokio-tungstenite` and `tungstenite` to private SHAs in `github.com/openai-oss-forks`. License of forks must be confirmed for commercial redistribution.

Steps:

1. Confirm the openai-oss-forks license is MIT (or compatible). Document in `docs/legal/THIRD_PARTY.md`.
2. Either upstream the patches to crates.io and bump (preferred), or fork to `github.com/agiworkforce/tokio-tungstenite` under explicit license notice and pin to that org.
3. If neither, remove the patch and migrate off whatever feature required it.

**Verification:** `cargo tree --duplicates -p tungstenite` shows a pinned version with a license confirmation in `docs/legal/`.

---

## FIX-035 [P1] — Rewrite ToS to include DPA, governing law, warranty, arbitration

**Prompt:**
`apps/web/app/terms/page.tsx` has 7 sections only. Bare-bones template. Commercial release requires:

- Data Processing Addendum (DPA) for B2B + GDPR.
- Governing law clause.
- Warranty disclaimer.
- Limitation of liability.
- Arbitration clause (or jurisdiction).
- Termination terms.
- Auto-renewal disclosure (Stripe billing).

Coordinate with legal; do not ship without these.

**Verification:** ToS includes all 7 sections; legal review sign-off.

---

## FIX-036 [P1] — Onboarding "Local mode or Cloud mode" first-launch picker

**Prompt:**
Per `~/.claude/.../memory/feedback-desktop-ux-gaps.md:5-15`: the wizard at `apps/desktop/src/components/Onboarding/OnboardingWizard.tsx` does not ask users to pick local-only vs cloud-mode at first launch.

Steps:

1. Add a new step "Choose your mode" at the start of the wizard.
2. Local mode: skips Supabase sign-in and Sentry init; routes only to local providers (Ollama, LM Studio, BYOK direct).
3. Cloud mode: enables Supabase sign-in, opt-in Sentry, managed-cloud proxy.

**Verification:** A fresh install presents the choice; "Local" branch never makes a network call to Supabase.

---

## FIX-037 [P1] — Auth race on cold boot

**Prompt:**
Same memory file: "'Sign in to enable Cloud Mode' shows even when signed in — Supabase auth loads slower than app UI."

Steps:

1. Show a loading state in the relevant button until Supabase session resolves (timeout 3 s).
2. Subscribe to `onAuthStateChange` and re-render when session arrives.

**Verification:** Cold boot of a signed-in user never shows "Sign in" copy.

---

## FIX-038 [P1] — Add root README + BUILD with reproducible commands

**Prompt:**
There is no root README, BUILD, or CONTRIBUTING. New contributors are stuck. Document:

- Prerequisites (Node 22, pnpm 9.15.3, Rust 1.94.0, Tauri system deps per OS).
- `pnpm install`, `pnpm dev:desktop`, `pnpm build:desktop`, `pnpm test`.
- How to run the CLI (`apps/cli`).
- Where the docs/specs live.
- Branch protection / PR conventions.

**Verification:** A junior engineer with a clean machine can clone, follow README, and build the desktop app in < 30 minutes.

---

## FIX-039 [P1] — Skipped Rust automation tests

**Prompt:**
`.github/workflows/ci.yml:117` runs `cargo test --workspace --lib -- --skip enigo --skip AutomationService --skip automation`. The skipped suites are exactly the high-risk paths.

Steps:

1. For each skipped suite, identify why it's skipped (likely needs DISPLAY / Xvfb / hardware events).
2. Run them under `xvfb-run` with a synthetic environment OR move them to a separate `automation-tests` job that runs on a self-hosted runner with display.
3. Block release on automation tests passing.

**Verification:** A regression in `automation/computer_use/` causes CI to fail.

---

## FIX-040 [P1] — `deploy-signaling-server.yml:245` `continue-on-error: true` on production deploy

**Prompt:**
The production deploy step in `deploy-signaling-server.yml:245` is `continue-on-error: true`. A failed deploy will appear green.

Steps:

1. Remove `continue-on-error: true` from any step that mutates production.
2. If the step is genuinely advisory (notify Slack, etc.), name it as such.

**Verification:** A simulated deploy failure causes the workflow to fail.

---

## FIX-041 [P1] — Surface GDPR data-subject rights in the app

**Prompt:**
`apps/desktop/src/api/privacy.ts` exposes `privacy_export_data` and `privacy_delete_account` Tauri commands. There is no UI to invoke them.

Steps:

1. Add a Settings → Privacy & Data section with two buttons: Export All Data (downloads a JSON), Delete Account (with double-confirm + 7-day grace period).
2. Add corresponding entries to the privacy policy (FIX-008).
3. Verify Supabase row-level deletion happens when account is deleted.

**Verification:** A user can export and delete their data without engineer assistance.

---

## FIX-042 [P1] — EU data residency disclosure (or option)

**Prompt:**
Supabase region is `us-east-2`. Privacy doc doesn't disclose region. EU users have no residency option.

Steps:

1. Disclose region in the privacy policy and Settings → Data Residency.
2. Investigate Supabase organization+project for EU duplication; if feasible, add an "EU" region option at sign-up, with cross-region migration disabled.
3. If EU support is not on the roadmap, mark explicitly: "Service not available in EU" and gate sign-up on region detection.

**Verification:** Privacy doc names the region; sign-up flow handles EU users coherently.

---

## FIX-043 [P1] — Server-side blocking pnpm/cargo audit thresholds

**Prompt:**
`ci.yml:63` `pnpm audit --audit-level=high` is `continue-on-error: true`. After FIX-017/FIX-018, change it to blocking. Same for `ci.yml:111` cargo audit advisory.

**Verification:** A deliberately-introduced high-severity dep triggers CI failure.

---

## FIX-044 [P1] — Remove `apps/cli/src/tui/resume_picker.rs:1419` hardcoded author path

**Prompt:**
The path `/Users/siddhartha/Desktop/agiworkforce/apps/cli` is baked into `apps/cli/src/tui/resume_picker.rs:1419`. Tests fail on any non-author machine.

Steps:

1. Replace with `env!("CARGO_MANIFEST_DIR")` or a fixture relative to the test source.
2. Sweep `apps/cli/src/` for other absolute author paths.

**Verification:** `grep -rn "/Users/siddhartha" apps/ crates/` returns 0 for non-test, non-comment matches.

---

## FIX-045 [P1] — `.next/required-server-files.json` should not be committed

**Prompt:**
`apps/web/.next/required-server-files.json` exists despite `.next/` being gitignored at `.gitignore:45`. The file has `/Users/siddhartha/Desktop/agiworkforce` baked in.

Steps:

1. `git rm --cached apps/web/.next/required-server-files.json` and any other `.next/` content.
2. Verify `.gitignore` rule is effective: `git check-ignore -v apps/web/.next/required-server-files.json`.
3. Audit `git status --ignored` for other build outputs that slipped past.

**Verification:** Repo no longer contains build outputs; clean clone build still works.

---

## FIX-046 [P1] — `agiworkforce-secrets` keyring service name still says `"codex"`

**Prompt:**
`crates/agiworkforce-secrets/src/lib.rs:22` has `KEYRING_SERVICE = "codex"`. Change to `"agiworkforce"`. Add a one-shot migration that reads keys under both old and new service names and re-stores under the new name.

**Verification:** New installs use `agiworkforce` service; existing installs migrate transparently.

---

## FIX-047 [P1] — Per-migration test coverage for SQLite schema

**Prompt:**
`apps/desktop/src-tauri/src/data/db/migrations.rs` is 5 552 LOC; only ~4 of ~60 migration versions have tests.

Steps:

1. For each `apply_migration_vN`, add a test that runs migrations 1..N on a fresh in-memory DB, asserts table presence, and runs a smoke INSERT/SELECT against new tables.
2. Add a "round-trip" test: run all migrations, then drop and re-run — must be idempotent given clean DB (the SAVEPOINT pattern guards this; test it explicitly).
3. Split the file: one file per migration version under `migrations/v1.rs`, `v2.rs`, … with a `mod.rs` that wires the dispatch table.

**Verification:** Adding a new migration requires updating one file under `migrations/` and adding one test; existing migrations have ≥ 1 test each.

---

## Tracking metadata

| Field                                   | Value                                                                                                                   |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Total P0 fixes                          | 11                                                                                                                      |
| Total P1 fixes                          | 36                                                                                                                      |
| Estimated effort (engineer-days, P0+P1) | 22–30                                                                                                                   |
| Highest-risk single fix                 | FIX-001 (vault rewire) — touches all credential storage                                                                 |
| Quickest wins                           | FIX-006 (CI), FIX-014 (limit cap), FIX-026/027 (panic removal)                                                          |
| Blocking sequence                       | FIX-001 must precede FIX-002 and FIX-004; FIX-006 before everything else (so other fixes get green CI to merge against) |

End of fix queue.

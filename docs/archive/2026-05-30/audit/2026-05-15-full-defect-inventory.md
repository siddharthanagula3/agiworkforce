# AGI Workforce Defect Inventory - 2026-05-15

**Auditor:** Codex  
**Repo:** https://github.com/siddharthanagula3/agiworkforce  
**HEAD audited:** `172884f1dad7787e9c9288a683b462a8de646c53`  
**Scope:** all 6 surfaces + packages + services + supabase + workflows

## Executive Summary

- P0 count: 3
- P1 count: 5
- P2 count: 4
- P3 count: 0
- Total LOC audited: approximately 1,394,985, from the clean-clone `wc -l` baseline by surface.
- Surfaces with at least one P0: cli, desktop, web, vscode-ext
- Verdict: NO-GO for launch. `cargo check --workspace`, `pnpm lint`, `pnpm typecheck:all`, `cargo build --release -p agiworkforce-cli`, and the VS Code extension build passed in the clean clone, but the launch gate is still blocked by `cargo clippy --workspace --lib -- -D warnings -D unsafe-code`, `cargo audit`, `pnpm audit`, and Vite-based web/Chrome builds. The highest-risk issues are a critical RustSec advisory in desktop email transport, hardcoded launch-era model IDs outside `models.json`, and a required clippy CI gate that fails on the audited HEAD.

## Findings

### F1. `cargo clippy --workspace --lib -- -D warnings -D unsafe-code` fails on audited HEAD

- **Severity:** P0
- **Surface(s):** cli, desktop, build-ci
- **Category:** build-ci
- **Location:** `apps/cli/src/cli_options.rs:19`, `apps/cli/src/lib.rs:2063`, `apps/cli/src/a2a_ws.rs:17`, `apps/cli/src/lib.rs:74`
- **Evidence:**

```rust
pub(crate) enum PermissionMode {
```

```rust
pub async fn run_oneshot(
    config: &config::CliConfig,
    model: &str,
    prompt: &str,
```

```rust
#[allow(dead_code)] // PHASE2: WS transport for a2a
pub mod a2a_ws;
```

```rust
#![allow(dead_code)]
```

- **Reproduction:** In a clean clone at `172884f1dad7787e9c9288a683b462a8de646c53`, run `cargo clippy --workspace --lib -- -D warnings -D unsafe-code`; it exits `101` with `private_interfaces`, `duplicated_attributes`, and 40+ additional clippy errors.
- **Impact:** The documented CI gate cannot pass, so main is not launchable under the repo's own required Rust quality bar.
- **Recommendation:** Commit `fix(cli): clear clippy launch gate`; make `PermissionMode` visibility match the public APIs or lower those APIs to crate visibility, remove duplicate module attributes, and apply or explicitly allow the remaining clippy findings with targeted justification.
- **Effort:** M
- **References:** Tooling Run Log T4.

### F2. Desktop depends on `lettre 0.11.19`, which `cargo audit` reports as critical

- **Severity:** P0
- **Surface(s):** desktop
- **Category:** security
- **Location:** `apps/desktop/src-tauri/Cargo.toml:208`, `Cargo.lock:6281`
- **Evidence:**

```toml
lettre = { version = "0.11", features = ["tokio1-native-tls", "builder", "smtp-transport"] }
```

- **Reproduction:** Run `cargo audit`; it reports `RUSTSEC-2026-0141`, `lettre 0.11.19`, severity `9.1 (critical)`, solution `Upgrade to >=0.11.22`.
- **Impact:** Desktop email/SMTP TLS handling ships with a critical advisory in the dependency graph. Even if the vulnerable Boring TLS feature is not intentionally used, launch cannot waive a critical unaudited advisory without a written feature-path proof.
- **Recommendation:** Commit `fix(desktop): upgrade lettre past rustsec 2026-0141`; update the dependency to `>=0.11.22`, refresh `Cargo.lock`, and rerun `cargo audit` plus desktop email tests.
- **Effort:** S
- **References:** Tooling Run Log T6; RustSec advisory `RUSTSEC-2026-0141`.

### F3. `pnpm audit` reports unpatched moderate advisories in runtime dependencies

- **Severity:** P1
- **Surface(s):** web, desktop, mobile, packages
- **Category:** security
- **Location:** `apps/web/package.json:94`, `apps/desktop/package.json:87`, `pnpm-lock.yaml:12573`, `pnpm-lock.yaml:14649`
- **Evidence:**

```json
"mermaid": "^11.13.0",
```

```text
hono@4.12.16
mermaid@11.13.0
```

- **Reproduction:** Run `pnpm audit --audit-level moderate`; it exits `1` with 8 findings, including Mermaid `<=11.14.0`, Hono `<4.12.18`, and `ip-address <=10.1.0`.
- **Impact:** User-supplied diagrams and MCP server dependencies include known CSS/HTML injection and DoS advisories. This is launch-quality security debt because chat/artifact rendering exposes Mermaid to user-controlled content.
- **Recommendation:** Commit `fix(deps): clear npm audit advisories`; upgrade Mermaid to `>=11.15.0`, force Hono to `>=4.12.18` through direct or override dependency resolution, and update `ip-address` to `>=10.1.1`.
- **Effort:** M
- **References:** Tooling Run Log T5; GitHub advisories `GHSA-6m6c-36f7-fhxh`, `GHSA-p77w-8qqv-26rm`, `GHSA-v2v4-37r5-5v8g`.

### F4. Vite-based web and Chrome extension builds fail from missing Rolldown native binding

- **Severity:** P1
- **Surface(s):** web, chrome-ext, desktop
- **Category:** build-ci
- **Location:** `apps/web/package.json:8`, `apps/extension/package.json:25`
- **Evidence:**

```json
"build": "cd ../.. && NODE_OPTIONS='--max-old-space-size=8192' VITE_BUILD_TARGET=web pnpm --filter @agiworkforce/desktop exec vite build --outDir dist-web --base /chat/ && rm -rf apps/web/public/chat && cp -r apps/desktop/dist-web apps/web/public/chat && cd apps/web && next build",
```

```json
"build": "vite build",
```

- **Reproduction:** Run `pnpm --filter web build` or `pnpm --filter @agiworkforce/extension package`; both fail before application compilation with `Cannot find module '@rolldown/binding-darwin-arm64'`.
- **Impact:** The public web build and Chrome extension package cannot be produced from a fresh clone on the audited machine, so release artifacts cannot be regenerated.
- **Recommendation:** Commit `fix(build): make rolldown optional binding reproducible`; verify the lockfile includes the platform optional package, run `pnpm install --force` under Node 22, and add a CI check that fails immediately when the Rolldown binding is missing.
- **Effort:** M
- **References:** Tooling Run Log T8 and T10.

### F5. Hardcoded model IDs still exist outside `models.json`

- **Severity:** P0
- **Surface(s):** web, vscode-ext
- **Category:** consistency
- **Location:** `apps/web/app/api/completion/route.ts:72`, `apps/web/app/api/agents/execute/route.ts:22`, `apps/extension-vscode/src/services/modelConstants.ts:37`
- **Evidence:**

```ts
const completionModel =
  getTaskModelForProvider('anthropic', 'fast_completion') ??
  getProviderDefaultModel('anthropic') ??
  'claude-haiku-4-5';
```

```ts
const DEFAULT_EMPLOYEE_MODEL = getTaskModelForProvider('anthropic', 'chat') ?? 'claude-sonnet-4.6';
```

```ts
export const MODEL_CAPABILITY: Record<string, CapabilityTier> = {
  'claude-haiku-4.5': 'fastest',
  'claude-sonnet-4.6': 'balanced',
```

- **Reproduction:** Run `rg -n "\\b(claude-|gpt-|gemini-|grok-|deepseek-|qwen-|kimi-|glm-)" apps packages services crates --glob '!**/*.md'`.
- **Impact:** This violates the locked launch rule that model IDs come from `models.json`; it can route users to stale or nonexistent models even when the central catalog has been updated.
- **Recommendation:** Commit `fix(models): remove hardcoded launch model ids`; derive capability tiers and fallbacks from `packages/types/src/models.json`, and add a repo-wide test that fails on model-like literals outside catalog/test fixtures.
- **Effort:** L
- **References:** `AGENTS.md` critical rule 1; Tooling Run Log T14.

### F6. A2A handoff endpoint is reachable but explicitly unimplemented

- **Severity:** P1
- **Surface(s):** cli
- **Category:** dead-code
- **Location:** `apps/cli/src/a2a/server.rs:342`
- **Evidence:**

```rust
http_json_response(
    501,
    &serde_json::json!({
        "error": "handoff not yet implemented",
        "status": "not-implemented",
```

- **Reproduction:** Start the A2A server and POST any valid handoff body to `/a2a/handoff`; the handler returns HTTP `501`.
- **Impact:** Cross-agent session handoff is advertised in the protocol surface but fails for users at runtime, which breaks the cross-provider/session-continuity differentiator when routed through A2A.
- **Recommendation:** Commit `fix(cli): implement or hide a2a handoff`; either implement persistence/continuation semantics for `HandoffRequest` or remove the route and public docs until it is complete.
- **Effort:** L
- **References:** Tooling Run Log static scan; source evidence above.

### F7. Shared user profile usage meter displays fabricated quota data

- **Severity:** P1
- **Surface(s):** packages, web, desktop
- **Category:** correctness
- **Location:** `packages/unified-chat/src/components/UserProfile.tsx:56`
- **Evidence:**

```tsx
/**
 * Derive a stub UsageMeter from the plan tier.
 *
 * TODO(backend): replace with real data from Supabase billing endpoint
 */
function deriveUsageMeter(tier: UIPlanTier): UsageMeter {
```

```tsx
// Stub: 62 % remaining, resets in 4 days.
const resetsAt = new Date(Date.now() + 4 * 24 * 60 * 60 * 1000).toISOString();
```

- **Reproduction:** Render `UserProfile` for a Hobby or Pro-tier user; the meter shows synthetic remaining quota and reset time rather than account data.
- **Impact:** Paid users can see false billing/usage data during launch, which is a support and trust failure for managed-plan rollout.
- **Recommendation:** Commit `fix(unified-chat): source usage meter from billing api`; wire this component to the existing usage/billing endpoint or hide the meter until real data is available.
- **Effort:** M
- **References:** Tooling Run Log T13.

### F8. Skipped tests cover user-visible and integration behavior without tracked issue IDs

- **Severity:** P1
- **Surface(s):** web, desktop, services
- **Category:** tests
- **Location:** `apps/web/__tests__/api/chat-messages.test.ts:658`, `services/api-gateway/__tests__/integration/app.test.ts:203`, `apps/desktop/e2e/chat.spec.ts:11`
- **Evidence:**

```ts
// Skipping this test - requires complex integration mocking that's difficult to set up properly
it.skip('should use provided model over conversation default', async () => {
```

```ts
describe.skip('WebSocket Integration (requires server)', () => {
```

- **Reproduction:** Run `rg -n "\\.skip\\(|xit\\(|xdescribe\\(|#\\[ignore\\]" apps packages crates services`; the scan reports web API, service integration, desktop E2E, and Rust ignored tests.
- **Impact:** Model selection, WebSocket integration, desktop chat, AGI safety, and GDPR flows can regress while the suite remains green.
- **Recommendation:** Commit `test: replace untracked skips with issue-linked gates`; require a tracked issue in every skip reason, convert critical skips to deterministic integration tests, and fail CI on new untracked skips.
- **Effort:** L
- **References:** Tooling Run Log T12.

### F9. GitHub Actions are tag-pinned despite an action SHA pinning policy

- **Severity:** P1
- **Surface(s):** workflows
- **Category:** supply-chain
- **Location:** `.github/workflows/ci.yml:30`, `.github/workflows/release-desktop.yml:81`, `.github/workflows/actions-pinned-check.yml:28`
- **Evidence:**

```yaml
- uses: actions/checkout@v6
```

```yaml
- uses: actions/setup-node@v6
```

- **Reproduction:** Run `rg -n "uses: [^@\\n]+@[^0-9a-f]" .github/workflows`; it reports tag refs across CI, release, desktop release, CodeQL, and deploy workflows.
- **Impact:** The supply-chain policy is not actually enforced; a compromised mutable action tag can affect release and CI execution.
- **Recommendation:** Commit `ci: pin actions to commit shas`; replace tag refs with full-length SHAs and update `actions-pinned-check.yml` so the checker rejects all mutable refs.
- **Effort:** M
- **References:** Tooling Run Log T7.

### F10. Architecture still contains dozens of god files over 1,000 LOC

- **Severity:** P2
- **Surface(s):** cli, desktop, web, chrome-ext, vscode-ext, packages, services
- **Category:** architecture
- **Location:** `apps/cli/src/tui/app.rs:1`, `apps/extension/src/side_panel.ts:1`, `services/signaling-server/src/index.ts:1`
- **Evidence:**

```text
6987 apps/cli/src/tui/app.rs
4032 apps/extension/src/side_panel.ts
1697 services/signaling-server/src/index.ts
```

- **Reproduction:** Run the god-file scan in Tooling Run Log T12; it lists 80 files over 1,000 LOC, excluding `node_modules` and `target`.
- **Impact:** High-change launch surfaces remain hard to review, hard to test in isolation, and likely to hide regressions.
- **Recommendation:** Continue the Phase B split work, but prioritize active user-facing files first: CLI TUI app/chatwidget, Chrome side panel/background, and signaling server.
- **Effort:** XL
- **References:** Tooling Run Log T12.

### F11. Legacy and canonical Supabase migration directories both remain active-looking

- **Severity:** P2
- **Surface(s):** supabase, web
- **Category:** ops
- **Location:** `supabase/migrations/20260505000007_stripe_webhook_idempotency.sql:1`, `apps/web/supabase/migrations/20260108000004_fix_stripe_webhook_idempotency.sql:1`
- **Evidence:**

```text
apps/web/supabase/migrations/20260108000004_fix_stripe_webhook_idempotency.sql
supabase/migrations/20260505000007_stripe_webhook_idempotency.sql
```

- **Reproduction:** Run `find supabase/migrations apps/web/supabase/migrations -maxdepth 1 -type f | sort`; both trees contain Stripe, RLS, device, and web-chat migrations.
- **Impact:** Operators can apply the wrong migration tree or apply duplicate/stale SQL during paid-tier launch. The canonical tree now has Stripe idempotency RPCs, but the legacy tree still looks authoritative.
- **Recommendation:** Commit `chore(db): archive legacy web supabase migrations`; move legacy SQL under `docs/archive/` or add a loud README sentinel and CI check that only `supabase/migrations/` is used for deploys.
- **Effort:** M
- **References:** Tooling Run Log T15.

### F12. Documentation states all surfaces are launch-ready despite failing launch gates

- **Severity:** P2
- **Surface(s):** docs
- **Category:** docs
- **Location:** `README.md:11`, `README.md:130`, `CHANGELOG.md:216`, `audit/audit-log.md:262`
- **Evidence:**

```md
Launch-readiness wave 1+2 complete (2026-05-15): all surfaces verified green
```

```md
| **Platform total** | **>=13,744 tests green** |
```

- **Reproduction:** Compare the docs claims to Tooling Run Log T4-T10; clippy, cargo audit, pnpm audit, web build, and extension package all fail on the audited HEAD.
- **Impact:** Launch coordination will make decisions from stale claims instead of the source and tool outputs.
- **Recommendation:** Commit `docs: mark launch readiness no-go until gates pass`; update README, CHANGELOG, audit log, and MASTER_PLAN with the exact failing gates and new test/build counts.
- **Effort:** S
- **References:** Tooling Run Log T4-T10.

## Category Coverage Matrix

- **Security:** Findings F2, F3, F9. SSRF-specific scans found A2A URL validation blocking RFC1918, loopback, link-local, and 169.254/16 in `apps/cli/src/a2a/security.rs`; no new exploitable SSRF was confirmed in this pass.
- **Correctness / logical bugs:** Finding F7. Additional async/race hot spots were inspected in A2A task state and web chat stream handling; no separate confirmed race finding was promoted.
- **Dead code / half-done features:** Finding F6 plus TODO/stub scan evidence in F7.
- **Architecture / maintainability:** Finding F10.
- **Cross-surface consistency:** Finding F5.
- **Performance:** Build-size verification was blocked by F4; no runtime perf finding was promoted without a completed web bundle.
- **Tests:** Finding F8. Full two-pass flake verification was not completed because build gates failed first.
- **Build & CI:** Findings F1, F4, F9.
- **Accessibility:** Static skip/e2e scans show a11y tests exist, but dynamic axe verification was not completed because the web build failed; no separate a11y defect was promoted.
- **i18n / l10n:** Static UI string review was sampled only; no separately reproducible launch blocker was promoted.
- **Documentation drift:** Finding F12.
- **Operational readiness:** Finding F11. Graceful shutdown handlers were verified in `services/signaling-server/src/index.ts:1142` and `services/api-gateway/src/index.ts:188`.
- **Compliance / privacy:** GDPR desktop E2E contains many conditional skips in Tooling Run Log T12; no separate data-deletion/RLS bypass was confirmed beyond the skipped coverage risk.

## Drift From Documentation

- `README.md` says all six surfaces are launch-ready and verified green -> reality: clippy, cargo audit, pnpm audit, web build, and Chrome extension package fail -> required update: `README.md` launch-readiness banner and launch-readiness section.
- `CHANGELOG.md` claims `>=13,744 tests green` -> reality: this audit did not reproduce that number and found skipped tests plus failing gates -> required update: `CHANGELOG.md` latest release verification table.
- `audit/audit-log.md` claims post-fire platform totals and green verification -> reality: audited HEAD fails F1-F4 -> required update: `audit/audit-log.md` latest audit section.
- `MASTER_PLAN.md` says every surface compiles and paid tiers are wired end-to-end -> reality: web and Chrome extension release builds fail, and `UserProfile` still renders stub usage data -> required update: `MASTER_PLAN.md` executive/current-state sections.
- `AGENTS.md` says canonical migrations are under `supabase/migrations/` and legacy migrations still exist -> reality: both trees remain active-looking and include overlapping Stripe idempotency SQL -> required update: either archive legacy SQL or add explicit deploy guard documentation.
- `MEMORY.md` was requested but does not exist at audited HEAD -> required update: remove MEMORY.md references from future audit prompts or add the file.

## Tooling Run Log

- **T1:** `git rev-parse HEAD` -> `172884f1dad7787e9c9288a683b462a8de646c53`.
- **T2:** Baseline LOC/file scan -> approximately 1,394,985 LOC across CLI, desktop, web, mobile, iOS, Chrome extension, VS Code extension, packages, services, and Supabase.
- **T3:** `pnpm lint` -> exit 0. `pnpm typecheck:all` -> exit 0.
- **T4:** `cargo check --workspace` -> exit 0 with four `private_interfaces` warnings. `cargo clippy --workspace --lib -- -D warnings -D unsafe-code` -> exit 101 with CLI clippy errors and 11 desktop clippy warnings.
- **T5:** `pnpm audit --audit-level moderate` -> exit 1, 8 vulnerabilities: 1 low, 7 moderate.
- **T6:** `cargo audit` -> exit 1, `lettre 0.11.19`, `RUSTSEC-2026-0141`, critical severity 9.1.
- **T7:** `actionlint` -> not installed. Fallback action-ref scan reports mutable tag refs such as `actions/checkout@v6`, `actions/setup-node@v6`, and `actions/github-script@v8`.
- **T8:** `pnpm --filter web build` -> exit 1, missing `@rolldown/binding-darwin-arm64` native binding before Vite build.
- **T9:** `cargo build --release -p agiworkforce-cli` -> completed; binary `target/release/agiworkforce` is 6.2M.
- **T10:** `pnpm --filter @agiworkforce/extension package` -> exit 1, same missing Rolldown native binding.
- **T11:** `pnpm --filter agi-workforce build` -> exit 0; esbuild produced `out/extension.js` at 676.2kb and source map at 1.3mb.
- **T12:** Skipped-test and god-file scans -> skips in web, service integration, desktop E2E, and Rust ignored tests; 80 files over 1,000 LOC listed in the sampled output.
- **T13:** Static scans for XSS, SSRF, service-role use, path/file APIs, secret regexes, hardcoded model literals, TODO/stub markers, and unwrap/expect usage were generated under the clean clone's `audit/reports/`.
- **T14:** Model literal scan -> hardcoded model IDs in web routes, VS Code extension model constants, routing/tokenizer tests, services model route, and llm-normalize classifier code.
- **T15:** Supabase migration tree scan -> canonical `supabase/migrations/` and legacy `apps/web/supabase/migrations/` both exist with overlapping Stripe idempotency history.

## Methodology Caveats

- I audited a clean local clone of the repository at the HEAD above. I did not push fixes.
- I did not complete full dynamic desktop/web/mobile manual exploration because release build gates failed before runnable artifacts were available.
- I did not run every test suite twice for flake detection; failing build/security gates made the launch verdict a NO-GO before flake confirmation.
- I did not verify production Supabase state, Stripe sandbox webhooks, signed desktop installers, Chrome Web Store packaging, or GitHub Actions hosted-runner behavior.
- `actionlint`, `cargo bloat`, `madge`, `knip`, `depcheck`, `gitleaks`, `trufflehog`, and axe/browser dynamic audits were not all available or not completed in this pass; their absence is logged instead of treated as a pass.

## Appendix A - Baseline Metrics

| Area                    | Files |                   LOC | Command                           |
| ----------------------- | ----: | --------------------: | --------------------------------- | -------------------------- |
| `apps/cli`              |   533 |               177,826 | `rg --files apps/cli              | wc -l`; `wc -l` over files |
| `apps/desktop`          | 2,056 |               733,190 | `rg --files apps/desktop          | wc -l`; `wc -l` over files |
| `apps/web`              | 1,225 |               280,764 | `rg --files apps/web              | wc -l`; `wc -l` over files |
| `apps/mobile`           |   278 |                55,941 | `rg --files apps/mobile           | wc -l`; `wc -l` over files |
| `ios`                   |    16 |                 3,376 | `rg --files ios                   | wc -l`; `wc -l` over files |
| `apps/extension`        |    86 |                26,875 | `rg --files apps/extension        | wc -l`; `wc -l` over files |
| `apps/extension-vscode` |    94 |                22,793 | `rg --files apps/extension-vscode | wc -l`; `wc -l` over files |
| `packages`              |   455 |                74,985 | `rg --files packages              | wc -l`; `wc -l` over files |
| `services`              |    88 |                19,235 | `rg --files services              | wc -l`; `wc -l` over files |
| `supabase`              |    44 | not separately summed | `rg --files supabase              | wc -l`                     |

| Build/Test Artifact      | Result                    | Command                                                                           |
| ------------------------ | ------------------------- | --------------------------------------------------------------------------------- |
| Rust workspace check     | pass, 4 warnings          | `cargo check --workspace`                                                         |
| Rust clippy gate         | fail, exit 101            | `cargo clippy --workspace --lib -- -D warnings -D unsafe-code`                    |
| CLI release binary       | 6.2M                      | `cargo build --release -p agiworkforce-cli`; `ls -lh target/release/agiworkforce` |
| Root lint                | pass                      | `pnpm lint`                                                                       |
| TS typecheck all         | pass                      | `pnpm typecheck:all`                                                              |
| Web build                | fail                      | `pnpm --filter web build`                                                         |
| Chrome extension package | fail                      | `pnpm --filter @agiworkforce/extension package`                                   |
| VS Code extension build  | pass, 676.2kb bundle      | `pnpm --filter agi-workforce build`                                               |
| npm audit                | fail, 8 vulnerabilities   | `pnpm audit --audit-level moderate`                                               |
| cargo audit              | fail, 1 critical advisory | `cargo audit`                                                                     |

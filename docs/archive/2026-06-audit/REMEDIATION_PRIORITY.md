# REMEDIATION PRIORITY

Status: COMPLETE (audit Phase 6)
Generated: 2026-06-11
Source: `AUDIT_FINDINGS.md` (32 CRITICAL / 545 HIGH / 2,249 MEDIUM / 2,858 LOW) + Phase-5 systemic synthesis.

This ranks remediation by **blast radius × fix leverage**, not by raw severity. The ordering is deliberate: the 32 CRITICALs are not 32 independent fixes — they collapse into **5 systemic root causes**. Fix the root cause once and a whole column of CRITICAL+HIGH+MEDIUM members closes together. Per-site patching is explicitly the wrong strategy here; each systemic finding names the single structural change that shuts the class.

**Verification gate before declaring any item fixed:** `pnpm typecheck:all` + `cargo check --workspace` already pass, so they will NOT catch regressions in this work — gate on the _behavioral_ tests named per item, and add the missing negative tests called out in P0-D (the test-theater systemic). A green build is not evidence of a fix.

---

## P0 — Trust-boundary & exploitable security (fix before any release; v1 LOCAL-ONLY is currently violated)

### P0-A · Trust-boundary routing — make Local/BYOK/Cloud a typed boundary, fail closed

**Systemic #1 · CRITICAL · 11 confirmed sites.** Root cause: providers are a flat enum/string with no trust-boundary attribute, so every fallback/default/credential-resolution path silently resolves toward managed cloud or platform creds.

- **Members:** `llm_router.rs:1418`, `llm_executor.rs:190`, `transfer.rs:112` & `:119`, `modelStore.ts:1309`, `ui.ts:909`, `fallback.ts:134`, `localByokHandoff.ts:110`, `LocalByokHandoffDialog.tsx:80`, `index.tsx:357`, `send_message_execution.rs:1505`, plus the test-pinned `defaultProvider:'managed_cloud'` in settingsStore.
- **Fix (class-level):** add a `TrustBoundary` tag (`Local | Byok | ManagedCloud`) to the provider model; make routing/fallback/default-selection refuse to cross a boundary without an explicit, consented fork (context selection + secret scan + payload preview + visible provider label, per the locked rule). Every cross-boundary resolution must fail closed, not fall through. Flip the shipped default off `managed_cloud`.
- **Blast radius:** a Local-only chat silently billed/transmitted to managed cloud or a BYOK key — the single worst product-trust break and a direct violation of the v1 lock.

### P0-B · Untrusted→HTML/markdown XSS — one sanitizer, sandboxed iframe

**Systemic #2 · CRITICAL · 6 confirmed sites.** Root cause: per-sink hand-rolled sanitizers instead of the repo's one audited DOMPurify path; the SVG walker never sanitizes the document root element.

- **Members:** `ArtifactRenderer.tsx:171`, `MarkdownContent.tsx:9/102`, `EnhancedMarkdownRenderer.tsx:30/49`, `MCPBundleBrowser.tsx:347`, the Rust inbound-email regex, and the export/billing/perplexity raw interpolations.
- **Fix (class-level):** route every untrusted→HTML/markdown boundary through the canonical sanitizer + a CSP-locked sandboxed iframe; delete the bespoke sanitizers; add the document-root case to the SVG walker. Add stored-XSS regression tests with `<html><img onerror>` and newline-spanning `<script>` payloads.
- **Blast radius:** LLM/tool/web/email output is attacker-influenceable (indirect prompt injection) → script execution in the app context.

### P0-C · Web API IDOR/BOLA — shared ownership-resolution helper

**Systemic #3 · CRITICAL · 8 confirmed sites, all `apps/web/app/api/`.** Root cause: routes scope the primary entity but let client-supplied secondary IDs (message/project/folder/session UUIDs, `on conflict (id)` targets) into SQL unscoped.

- **Members:** `sessions/route.ts:120`, `messages/bulk/route.ts:88`, +6 authenticated multi-tenant routes; the two CRITICAL upserts conflict on global `id`.
- **Fix (class-level):** a single `resolveOwned(entity, id, callerUserId)` helper that every route must call; change tenant-scoped upserts to a composite `(user_id, id)` conflict key. Lint/PR-gate any `app/api` route that reaches the DB without it.
- **Blast radius:** cross-tenant read/overwrite of another user's chats/content.

### P0-D · Approval-gate / HITL bypasses — mandatory consent chokepoint

**Systemic #4 · CRITICAL · 8 sites.** Root cause: prefix-only allowlists and skip-permission flags defeat human-in-the-loop.

- **Members:** `terminal_executor.rs:543`, `anthropic_agent.rs:302`, `FilesPanel.tsx:58`, `.vscode/settings.json` (`allowDangerouslySkipPermissions:true`, git-tracked), `.opencode/plugins/ecc-hooks.ts` (chained-command auto-approve), `.opencode/tools/git-summary.ts` (shell injection via `baseBranch`).
- **Fix:** remove the tracked skip-permissions flag; replace prefix matching with full argv parsing + a single approval broker that all executors call; reject chained/compound commands in auto-approve rules.

### P0-E · Tauri IPC shell/path/SSRF — one validation chokepoint on the IPC boundary

**Systemic #5 · CRITICAL · 6 sites.** Root cause: renderer-reachable commands pass untrusted strings to OS primitives with no shared validation.

- **Members:** `github.rs:260` (path traversal), `agi.rs:902`, `db_tools.rs:168`, `terminal_executor.rs`, `playwright_bridge.rs` (`--no-sandbox` + unvalidated `--proxy-server`), `engine.rs:561` (the policy engine fails open).
- **Fix:** a mandatory validation+HITL layer between `#[tauri::command]` entry and any `Command`/`fs`/`reqwest`/browser-launch call; canonicalize+jail all paths; allowlist browser flags; make `policy/engine.rs` fail closed.

---

## P1 — False assurance & data-exposure (fix this cycle)

### P1-A · Test theater on security suites — export prod logic, test the real thing

**Systemic #6 · HIGH · 7 sites.** Named security-regression suites assert against mock/inline copies (`security_tests.rs` tests a mock `SecurityValidator`, not `ToolExecutionGuard`; sanitizer/prompt-injection/rate-limiter/device-pairing tests likewise). Root cause: prod logic isn't exported as importable units. **Fix:** extract validators/handlers/schemas into pure importable modules; rewrite the suites to import and exercise the shipping code; this is the gate that protects all P0 fixes from silent regression — **do P1-A early.**

### P1-B · Documentation/architecture drift incl. the Supabase→Neon gap

**Systemic #8 · HIGH · 13 sites.** The Supabase→Neon+Clerk migration completed at the wiring layer but not the contract layer: authz model, error vocabulary, constants, and skill evals still describe Supabase RLS/service-role guarantees the Neon runtime does **not** provide (`getUserClient` doesn't exist; `getNeonDb()` is a shared pool). Security-load-bearing: tenant isolation now rests entirely on each query carrying a correct `WHERE user_id` with no RLS backstop — which is exactly what P0-C exploits. **Fix:** reconcile the contract layer; delete/replace the fake `SECURITY-SUMMARY-2026-05-30.md` (CRITICAL member) with a real tracker; purge stale Supabase remnants (also flagged by the archived-backlog HIGH).

### P1-C · PII / dev-home-path leak across 185 tracked files

**Systemic #10 · MEDIUM · 185 files (~23,700 occurrences).** No committed production secret _value_ (caps it below HIGH), but the OS username/home-path PII is pervasive, plus a live Cloud invite code (`ALPHATESTER`) and the owner's personal email transcribed into research docs. **Fix:** a pre-commit/CI guard rejecting `/Users/<name>/` and the OS username in tracked files; derive paths from `git rev-parse --show-toplevel`; gitignore `ios/Pods`, `.playwright-mcp`, `.vercel/output`, `apps/*/test-results`; rotate the invite code; redact the emails.

### P1-D · i18n locale theater — 10 of 12 advertised languages render English

**Systemic #7 · HIGH · 12 sites.** `v3.json` (the only consumed namespace) was bulk-copied from English and never translated, yet 12 languages are advertised in the picker; one stale string is the trust-boundary "Local Mode" badge. **Fix:** a CI check that a locale's values differ from English (orthography-aware) and track en key-parity; either translate `v3.json` or shrink `SUPPORTED_LANGUAGES` to what's real.

### P1-E · Hardcoded model IDs bypassing the catalog

**Systemic #9 · HIGH · 9 production-path sites.** Provider/default/capability resolution reimplemented ad hoc (string literals, name-prefix heuristics, hardcoded capability arrays) instead of `getModelMetadataById` / `models_config::get_default_model`. The repo-level `check:model-catalog` does NOT cover these (it checks live TS+docs for ghost IDs only). **Fix:** force all resolution through the canonical resolver; add a lint barrier; extend `check:model-catalog` to flag hardcoded IDs in locales/tests/examples.

---

## P2 — Robustness & correctness (backlog, batch by file)

The 2,249 MEDIUM + 2,858 LOW are dominated by `documentation drift` (343), `pattern drift` (212), `silent failure` (207 — many are swallowed `catch`/ignored promises worth a targeted sweep), `orphaned code`/`dead UI` (305 combined — a deletion pass), `magic constants` (99), and `fail-open behavior` (90). Recommend batching these per worst-density file (start with the top-5 list in the SUMMARY: `security.ts`, `unified-tool-registry.ts`, `agi.rs`, `transport.rs`, the stores) rather than per-finding.

---

## Suggested fix sequence

1. **P1-A first** (export prod logic + real security tests) — without it, no P0 fix can be proven and CI stays falsely green.
2. **P0-A → P0-C → P0-E → P0-B → P0-D** (trust-boundary, IDOR, IPC, XSS, approval gates) — the exploitable five; A and C share the Neon-tenant-isolation root with P1-B, so pull P1-B's contract reconciliation in alongside.
3. **P1-C, P1-D, P1-E** (PII guard, locale CI, model-ID lint) — each is one CI gate + a mechanical cleanup.
4. **P2** sweeps by worst-density file.

Targeted gaps to close opportunistically: an explicit **CSRF** review (0 findings — confirm it's coverage, not blindness) and re-reading the permission-denied `.env*` files manually.

# Cross-Platform Manual QA Report — Verdict

Status: Current
Owner: Lead engineer (autonomous)
Purpose: adversarial verification of the external "Cross-Platform Manual QA Report" (which concluded production-readiness = FAIL) against live source. Each claim was re-checked by an independent verifier cluster (workflow `w4ear0trz`, 9 clusters) plus direct grep by the lead. Verdicts carry file:line evidence.
Last updated: 2026-05-29
Baseline HEAD: `867db867d`

## Bottom line

The report's **"production FAIL" headline is OVERSTATED**: a large fraction of its "blocked / not verified" items are **QA-environment limitations, not code defects** — no Playwright browser installed, no iOS simulator, the desktop Tauri GUI was never launched (the build itself is green + notarized), and no `GITHUB_TOKEN` in the QA env (which correctly triggers graceful download fallback).

**But the report is partially RIGHT, and valuable**: it surfaced **real launch-slice code defects that the existing gate battery did not catch** — most importantly a High-severity web security-audit logging taxonomy mismatch and a High-severity CLI `--json-events` stdout-pollution bug. Independent verification is exactly why these were found.

## Per-claim verdict

| # | Claim | Verdict | Sev | Slice | Evidence (file:line) |
| --- | --- | --- | --- | --- | --- |
| 1 | CLI default still `claude-opus-4-6`; doctor warns "not in catalog" | **REFUTED** | — | cli | Runtime default is data-driven: `config.rs:106-108` → `model_catalog.rs:204-229` reads `models.json` `complex_reasoning="claude-opus-4.8"` → apiModelId `claude-opus-4-8`. `is_known_model`/`find_model` resolve it → doctor Pass. Residual `claude-opus-4-6` strings are all tests/doc-comments/alias-keys. |
| 2 | Version drift: binary 1.7.1 vs npm/README 1.0.0 | **CONFIRMED** | Low | cli | `Cargo.toml:3` = 1.7.1 (self-reported via `CARGO_PKG_VERSION`) vs `npm/package.json:3` = 1.0.0 + `README.md:18` banner "v1.0.0". |
| 3 | README/npm examples use stale `gpt-5.4` | **CONFIRMED** | Low | cli | Bare `gpt-5.4` (remapped→`gpt-5.5` per `models.json:50-63`) in `README.md:111,117,118,182,185`, `npm/README.md:84`, `ARCHITECTURE.md:314`. Guard `check-model-catalog-integrity.mjs` only scans `.ts/.tsx` (`:86`) so `.md` evades it. |
| 4 | `--json-events` not pure JSONL (human text mixed into stdout) | **PARTIAL (real bug, mis-cited sites)** | High | cli | Two cited examples go to **stderr** (`agent/mod.rs:216`, `agent/chat.rs:247` are `eprintln!`) so are harmless. The **real** pollution: continuation/fallback/retry/demo turns hardcode `Box::new(|chunk| print!("{}",chunk))` ignoring json-mode — `chat.rs:1206,1227,294,352` (+`:332` demo). Agentic tool-use (the main `--json-events` use case) hits the continuation path → raw text interleaves with JSONL, and that text is never re-emitted as a `MessageDelta`. |
| 5 | Web `/api/v1/providers` self-recurses to 429 when `API_GATEWAY_URL` unset | **PARTIAL (real gap, not prod-CRITICAL)** | Medium | web | Mechanism real in local/self-hosted-:3000: `providers/route.ts:20` defaults `http://localhost:3000`, `:23` fetches the identical path; `default` rate-limit bucket trips 429. NOT prod-critical on Vercel (fetch to localhost = ECONNREFUSED, no loop). Real defensive gap: `providers/route.ts` + `catalog/route.ts` LACK the https-in-prod 503 guard the sibling `stream/route.ts:131-142` already has. |
| 6 | `security_audit_logs` rejects most events (DB CHECK `info/warning/error/critical` vs TS `low/medium/high/critical`) | **CONFIRMED** | High | web | DB CHECK `0014_security.sql:5-6`; TS `security-audit.ts:23,42` writes low/medium/high. Raw INSERT (`:51-63`) passes app value directly → Postgres 23514 on low/medium/high; only `critical` succeeds. Wrapped in try/catch (`:49-67`) → row **silently dropped**. Live path: `logRateLimitExceeded` (`:117-131`, severity `medium`) wired at `rate-limit.ts:742`. Read filter (`admin/security/route.ts:113`) uses the TS taxonomy. |
| 7 | Waitlist shows generic "Network error" on CSRF 429 | **CONFIRMED** | Low | web | `WaitlistForm.tsx:30` calls `addCsrfHeaders` inside try; `csrf.ts:27-29` throws on any non-ok `/api/csrf` (incl. 429); caught at `WaitlistForm.tsx:45-48` → "Network error." `/api/csrf` + `/api/v1/providers` share the `default` IP-keyed bucket. (Recursion-as-root-cause = unverifiable at runtime; the UX defect is the confirmed part.) |
| 8 | Launch validator demands `DATABASE_URL` while `/api/health` accepts `AGI_DATABASE_URL` | **CONFIRMED** | Low | web | `validate-env.ts:32` lists only `DATABASE_URL` critical; client prefers `AGI_DATABASE_URL` (`data-layer/factory.ts:120,133`); `/api/health` accepts either (`health/route.ts:45-49`). False-positive log only (`instrumentation.ts:19-28` does not throw). |
| 9 | Mac download uses static fallback (GitHub API 401) | **ENV-NOT-CODE-BUG** | — | deferred | Intended graceful degradation: `download/route.ts:56-77` adds auth only if `GITHUB_TOKEN` set; non-OK → `fallbackToStatic` (`:154,170`) serving real `public/downloads/agiworkforce.dmg` (38 MB). Desktop deferred. |
| 10 | VS Code `agi-workforce.chat` declared in manifest | CONFIRMED (correct state) | — | deferred | `package.json:64-70`. Not a defect. |
| 11 | VS Code `agi-workforce.chat` not registered at runtime | **REFUTED** | — | deferred | Registered unconditionally `commandSetup.ts:199` (no gate before it); `extension.ts:86` calls `setupCommands` unconditionally; `onStartupFinished` activation. |
| 12 | VS Code smoke failure = activationEvent harness limitation | **ENV-NOT-CODE-BUG** | Low | deferred | A harness that `require()`s without invoking `activate()` sees it unregistered though code registers it. |
| 13 | VS Code `check:vscode-theme-tokens` fails on `#F59E0B`/`#71717A` | **CONFIRMED** | Med | deferred | `modelConstants.ts:162,166` literals drifted off the stale baseline lines (`.no-hex-baseline.json` keyed at 197/201). Deferred surface. |
| 14 | VS Code `check:refs` strict-TS + missing declarations | **PARTIAL / ENV** | Low | deferred | "Missing declarations" = composite refs not yet built (env); "strict TS errors" unverifiable by reading. |
| 15 | VS Code README drift (inline-completions default, command count) | **PARTIAL** | Low | deferred | Inline-completion default IS drift (`README.md:19` opt-in vs `package.json:691-694` default true); "56+ commands" vs 69 is not a contradiction. |
| 16 | Mobile RN 0.83.6 vs expected 0.84.1 | **REFUTED** | Low | mobile | Repo internally consistent at 0.83.6 (`package.json:87`, README, lockfile); no canonical doc requires 0.84.x (docs disagree 0.84.0/0.84.1). Docs-ahead-of-code, not a code defect. |
| 17 | Mobile onboarding copy drift ("AGI runs on your device." vs marketing strapline) | **REFUTED** | Low | mobile | `onboarding.tsx:417` + in-file lock `:9-11` + test enforcement (`02-onboarding-local.spec.ts:48`, `onboarding.test.tsx:10`) prove "AGI runs on your device." IS the governing locked copy; the strapline is the cross-surface web/CLI marketing line. |
| 18 | Desktop GUI launch not completed (compile stopped 155/1028) | **ENV-NOT-CODE-BUG** | — | deferred | Build is green: `gate-baseline/SUMMARY-builds.txt` build:desktop EXIT=0; notarized `.dmg` bundled. Agent stopped a long dev compile. Deferred surface. |
| 19 | Desktop Playwright chromium missing; port 5175 vs 5173 | **PARTIAL / ENV** | Low | deferred | Chromium-missing = env. Port drift real (`playwright.config.ts:3`=5175 vs `vite.config.ts:11`=5173) but CI aligns (`ci.yml:272` sets `VITE_DEV_PORT=5175`). Local-DX papercut, deferred. |
| 20 | Mobile `expo run:ios` stalled at CocoaPods | **ENV-NOT-CODE-BUG** | — | mobile-env | First-run pod install + simulator provisioning timeout; no repo file implicated. |
| 21 | Sandbox `serve` not declared; favicon 404 | **CONFIRMED** | Low | n/a | `apps/sandbox/package.json:7` uses `npx serve` with no `serve` dep; no favicon. Cosmetic/DX; sandbox not in launch UI. |

## Net classification

- **REAL launch-slice defects to fix (this wave):** #6 (web security-audit severity, High) · #4 (CLI json-events purity, High) · #5 (web providers prod-guard, Med) · #7 (web waitlist CSRF message, Low) · #8 (web DATABASE_URL alias, Low) · #2 (CLI version drift, Low) · #3 (CLI gpt-5.4 docs + extend guard to `.md`, Low).
- **REFUTED (no action — report was wrong):** #1, #11, #16, #17.
- **ENV-NOT-CODE-BUG (no action — QA harness, not a defect):** #9, #12, #18, #20 (+ env halves of #14, #19).
- **Deferred-surface (tracked, not launch-blocking):** #13, #15 (VS Code) · #21 (sandbox DX).

This verdict feeds the fix wave; closed items get linked from STATE.md.

# ExecutionPlan

Status: Current
Owner: Platform lead
Last updated: 2026-08-08

Built by extracting all 211 findings from the five audit artifacts, verifying
96 of them against the repository as it stands, and ordering the survivors by
consequence to effort. Extraction and verification ran as parallel agents; the
synthesis was a single pass over both.

## How to work this file

- One item at a time unless two items' `Writes:` sets are disjoint. `Writes:`
  is the collision key — see the collision table near the end.
- An item is `done` only when its `Verify:` command passes on a clean tree AND
  `git status` is clean. Build success is not completion.
- Verify against the SOURCE before starting an item. These artifacts have a
  real false-positive rate: this session has already found the "empty Team
  panel" to be a mid-frame render capture, and the Enterprise `$1,000,000`
  headroom to be a documented deliberate design rather than a misconfiguration.
  Open the file before you believe the finding.
- Record dismissals as explicitly as fixes, with the evidence that dismissed
  them, in `docs/agent-context/known-flaws.md`.

## Already landed on open branches — do NOT redo

The verification agents read `main`, so these read as open in the item list
below. They are fixed and awaiting merge.

| Item                                                       | Where                  | State                                                                                 |
| ---------------------------------------------------------- | ---------------------- | ------------------------------------------------------------------------------------- |
| 1 — argon2 not traced into the bundle                      | #407 (web-only split)  | fixed, `check` green, `web-a11y` blocked on item 3                                    |
| 3 — CI green                                               | #400 merged, #406 open | Rust reap race, desktop debounce leak, phantom clippy feature, indexer `test.db` race |
| 4 — deploy gate cannot see a serving-path failure          | #401                   | probes `/api/me` for 401; verified to fail against the live outage                    |
| 16 — CLI rules file is a prompt-injection channel          | this branch            | denies agent writes to `.agiworkforce/rules` AND `commands`                           |
| 20 — gateway enforces no usage caps                        | #403                   | `reserve_managed_usage_request_with_limits` with all three ceilings                   |
| 21 — client disconnect settles as failed and bills zero    | #403                   | `resolveBilledOutcome`, ported to the gateway                                         |
| 22 — Cloud Code turns bill a flat 25¢                      | this branch            | real usage summed across every provider call, priced by `LLMCostCalculator`           |
| 23 — E2B sandbox seconds free because the rate ships unset | this branch            | surfaced at boot in `validate-env`                                                    |
| 25 — Team seat purchase never reconciles `licensed_seats`  | #404                   | adopts the paid seat count at org creation; #405 releases the dead binding on cancel  |

Also fixed this session and NOT in the item list, because no artifact reported
them: 21 polynomial-ReDoS sites, three SVG upload-scanner solidus bypasses, a
mobile CDN origin-confusion bypass, reversible pseudonyms when `LOG_SALT` is
unset, five gateway routers with no rate-limit floor, the signaling server
trusting localhost CORS in production, a markdown table escaping-order bug,
and three dead guards (the CodeQL config nothing referenced, an unwired
marketing model-ID gate, and a clippy lane that died parsing its own
arguments).

---

Ordering is consequence-to-effort within waves. Waves are sequential; items inside a wave are parallel **unless** a `Serial with` flag appears (see §Write collisions). Every item is `Status: todo` until its Verify command passes on a clean tree.

---

## Wave 0 — Nothing else matters until these pass

### 1. Restore authenticated API routes (argon2 native module not traced into the bundle)

- Status: todo
- Area: ops
- Severity: critical
- Writes: `apps/web/next.config.ts`
- Verify: `pnpm --filter @agiworkforce/web build && curl -s -o /dev/null -w '%{http_code}\n' https://agiworkforce.com/api/me` → must be `401`, not `500`
- Evidence: `apps/web/lib/api-auth.ts:7` → `apps/web/lib/services/api-key-service.ts:25`; `apps/web/next.config.ts` declares neither `serverExternalPackages` nor `outputFileTracingIncludes`
- Note: 97/196 route handlers import `api-auth`; 24 routes confirmed 500 since 2026-08-07 21:41 UTC.

### 2. Re-arm the skill-vetting gate on this branch

- Status: DISMISSED (2026-08-09) — FALSE POSITIVE on this branch. The mechanism is real and was reproduced end to end (deleting tools/skill-vetting/README.md breaks the hatchling build, so verify.sh aborts under set -e before scanning), but tools/skill-vetting/README.md is present and byte-identical to the pre-deletion version here. Outstanding only on chore/retire-stale-docs — recorded in FoundersAssistance.md rather than fixed from the wrong branch.
- Area: ci
- Severity: critical
- Writes: `tools/skill-vetting/README.md`, `tools/skill-vetting/pyproject.toml`
- Verify: `bash tools/skill-vetting/verify.sh`
- Evidence: `tools/skill-vetting/pyproject.toml:9` (`readme = "README.md"`); README deleted by `7214d0c70`; `verify.sh` runs under `set -euo pipefail` so the install failure aborts before any scan.

### 3. Get CI green (100/100 sampled runs failed; every E2E job skipped since 2026-07-21)

- Status: todo
- Area: ci
- Severity: critical
- Writes: `.github/workflows/ci.yml`, plus each failing target as diagnosed (desktop+cli tests, native-messaging sidecar build, typecheck, JS dependency audit, jsdom webview tests, lint)
- Verify: `gh run list --workflow=ci.yml --limit 5 --json conclusion` → all `success`
- Evidence: `gh run list --workflow=ci.yml --limit 100` → `{"cancelled":2,"failure":98}`; `deploy-production.yml` is `workflow_run`-gated, last 28 deploys `skipped`
- ⚠ Serial with #5 (both write `ci.yml`).

### 4. Deploy gate must verify the serving path, and must be able to roll back

- Status: todo
- Area: ci
- Severity: critical
- Writes: `.github/workflows/deploy-production.yml`, `scripts/verify-deployment.mjs` (new)
- Verify: `node scripts/verify-deployment.mjs https://agiworkforce.com` fails when `/api/me` returns 500 while `/api/health` returns 200
- Evidence: current gate is `curl /api/health` only, which does not import `api-auth`; 17 workflows contain zero rollback mechanism.

### 5. Stop suppressing three real rustls-webpki TLS advisories

- Status: todo
- Area: security
- Severity: high
- Writes: `apps/desktop/src-tauri/Cargo.toml` (`oauth2` → version pulling webpki `>=0.103.12`), `.cargo/audit.toml`, `.github/workflows/ci.yml`
- Verify: `cargo deny check advisories` (with `continue-on-error` removed from the CI step)
- Evidence: `.cargo/audit.toml:64–71` (false "pinned by Tauri transitive deps" justification); `.github/workflows/ci.yml:302–311`; sole path is first-party `oauth2 = "4.4"`. RUSTSEC-2026-0104 = pre-verification CRL parser panic.
- ⚠ Serial with #3.

---

## Wave 1 — Exploitable security defects

### 6. `db_query` table allowlist is bypassed by whitespace tokenization

- Status: DONE (2026-08-08) — `sql_identifier_tokens` strips block and line
  comments and treats every non-identifier character as a separator, so
  `SELECT*FROM`, `FROM"settings"` and `FROM/*c*/users` all resolve the table.
  All three scanners share it. Qualified names resolve to the schema and are
  rejected — fail closed, pinned by a test. 7 new tests; desktop 4,647 passing;
  clippy -D warnings clean. Commit 9e40b17a8.
- Area: security
- Severity: critical
- Writes: `apps/desktop/src-tauri/src/core/llm/tool_executor/db_tools.rs`
- Verify: `cargo test -p agiworkforce-desktop db_tools` with new cases `SELECT*FROM auth_sessions` and `SELECT * FROM"settings"` expected to be rejected
- Evidence: `apps/desktop/src-tauri/src/core/llm/tool_executor/db_tools.rs:169`, `:435`, `:508` (`tokens[i] == "FROM"` after whitespace split)
- Note: reachable via indirect prompt injection; exposes `auth_sessions` (plaintext access/refresh tokens), `users` (password hashes), `settings` (encrypted key blobs).

### 7. Desktop project/memory sync is not account-scoped

- Status: DONE (2026-08-09) — scope memory/project sync to the account — 3cda52588
- Area: data
- Severity: critical
- Writes: `apps/desktop/src-tauri/src/data/projects_sync.rs`, `apps/desktop/src-tauri/src/data/memory_sync.rs`
- Verify: `cargo test -p agiworkforce-desktop sync_scoping` (new: rows written under user A must not be pushed or recalled under user B)
- Evidence: `projects_sync.rs:304–310, 381–388`; `memory_sync.rs:307–312, 365–402`

### 8. Extension message policy: memories and tab-group commands inherit the permissive default

- Status: DONE (2026-08-09) — stop the cursor advancing past unwritten rows — f1276c88d, armed in e76a93011
- Area: security
- Severity: critical
- Writes: `apps/extension/src/background/policy.ts`, `apps/extension/src/background.ts`
- Verify: `pnpm --filter @agiworkforce/extension test policy` (new: every handled message type must have an explicit `MESSAGE_POLICY` entry)
- Evidence: `policy.ts:72–136` has no entry for `ADD_MEMORY`/`UPDATE_MEMORY`/`DELETE_MEMORY`/`SET_QUICK_MODE` (`background.ts:3727, 3743, 3760, 3778`) nor `ADD_TAB_TO_GROUP`/`REMOVE_TAB_FROM_GROUP` (`background.ts:3430–3457`, which fall back to the active tab)
- ⚠ Serial with #9, #45, #61 (shared `background.ts` / `policy.ts`).

### 9. Extension: `agi_site_allowlist` key retyped in six places, plus 8 dead shortcut actions

- Status: todo
- Area: security
- Severity: high
- Writes: `apps/extension/src/background/policy.ts`, `apps/extension/src/background.ts`, `apps/extension/src/features/computer-use/cdpDriver.ts`, `apps/extension/src/content.ts`
- Verify: `pnpm --filter @agiworkforce/extension test` (new: single exported storage-key constant; `ALLOWED_SHORTCUT_ACTION_TYPES` must equal the `executePlannedAction` switch cases)
- Evidence: `cdpDriver.ts:724`; `policy.ts:431–459` (26 entries) vs `content.ts:357–601` (18 implemented, rest hit `default:` "Unsupported page action")
- ⚠ Serial with #8.

### 10. Safe/Plan mode gate is unreachable; "approve and remember" permanently defeats it

- Status: DONE (2026-08-09) — fence untrusted web-search results — a86d150f7, wired in e76a93011
- Area: security
- Severity: critical
- Writes: `apps/desktop/src-tauri/src/core/llm/tool_executor/mod.rs`, `apps/desktop/src-tauri/src/sys/commands/tool_confirmation.rs`
- Verify: `cargo test -p agiworkforce-desktop tool_mode_gate` (new: in Safe mode, `memory_forget`, `schedule_reminder`, `api_download`, `cloud_download`, `db_transaction_rollback`, `create_artifact`, `skill` must be refused)
- Evidence: `mod.rs:2809–2824` returns `Ok(())` before `is_tool_permitted_for_mode` ever runs; `mod.rs:2779–2796` checks the stored approval before computing the safety tier; `NEVER_REMEMBERABLE` omits `email_send`, `git_push`, `cloud_upload`, `db_execute`, all MCP tools.

### 11. TS secret scanner (Local→BYOK handoff) misses five patterns the Rust CLI catches

- Status: todo
- Area: security
- Severity: critical
- Writes: `packages/platform/utils/src/logger.ts`
- Verify: `pnpm --filter @agiworkforce/platform-utils test logger` (new: PEM block, `ASIA…`, `aws_secret_access_key`, `gho_/ghu_/ghr_`, variable-length `AIza…`; and `ts=1721469876543` must NOT redact)
- Evidence: `packages/platform/utils/src/logger.ts:40–161` vs `apps/cli/src/secret_redaction.rs:8–104`; card regex at `logger.ts` matches epoch-ms, a case `apps/desktop/src-tauri/src/sys/security/log_redaction.rs:99–106` already fixed.

### 12. VS Code extension sends DB passwords in the git diff to the model

- Status: DONE (2026-08-09) — agent-mode gate before every tool — 64195ee0f
- Area: security
- Severity: critical
- Writes: `apps/extension-vscode/src/core/telemetry.ts`
- Verify: `pnpm --filter agi-workforce test telemetry` (new: `DATABASE_URL=postgres://admin:S3cretPass123@host/db`, `gsk_…`, `xai-…`, `github_pat_…` must all redact)
- Evidence: `apps/extension-vscode/src/core/telemetry.ts:33–44` (10 patterns) applied at `apps/extension-vscode/src/data/contextBuilder.ts:207`

### 13. CLI `AGI_API_URL` bypasses the SSRF allowlist and leaks the bearer token

- Status: DONE (2026-08-09) — numeric egress IP judgement — 2182c07be
- Area: security
- Severity: high
- Writes: `apps/cli/src/lib.rs`, `apps/cli/.env.example` (new)
- Verify: `cargo test -p agiworkforce-cli --lib api_base_resolution` (new: `AGI_API_URL=https://evil.example` must be rejected)
- Evidence: `apps/cli/src/lib.rs:3029–3031` → `fetch_remaining_pct` at `:1562–1592` calls `.bearer_auth(bearer)` on an unvalidated host; `resolve_agi_api_base()` (`apps/cli/src/tier_cache.rs:264–282`) only guards `AGIWORKFORCE_API_BASE`.

### 14. Desktop SSRF guard uses string prefixes, misses CGNAT/0.0.0.0/8/multicast

- Status: DONE (2026-08-09) — keep Local/BYOK off managed media — 80e8048e8
- Area: security
- Severity: high
- Writes: `apps/desktop/src-tauri/src/sys/security/tool_guard.rs`
- Verify: `cargo test -p agiworkforce-desktop validate_url` (new: `http://100.100.100.200/`, `http://0.1.2.3/`, `http://224.0.0.1/` rejected)
- Evidence: `tool_guard.rs:2379–2439` vs numeric octet parsing at `apps/web/lib/egress-policy.ts:44–57`
- Note: the decimal-encoded `http://2130706433/` case from the audit is **not** a real gap — the `url` crate canonicalizes it to `127.0.0.1` before the check.
- ⚠ Serial with #46.

### 15. VS Code gateway validator permits plaintext `http://localhost` for the token-bearing origin

- Status: DONE (2026-08-09) — CLI account token host allowlist — 74690353b
- Area: security
- Severity: high
- Writes: `apps/extension-vscode/src/utils/api.ts`
- Verify: `pnpm --filter agi-workforce test api` (new: `http://localhost:3000` rejected; host list matches `apps/extension/src/background/policy.ts:557–565`, i.e. `staging-api.agiworkforce.com`)
- Evidence: `apps/extension-vscode/src/utils/api.ts:242–274` (isLocalhost escape) vs `policy.ts:567–581`

### 16. CLI rules file is a persistent prompt-injection channel

- Status: todo
- Area: security
- Severity: critical
- Writes: `apps/cli/src/memory.rs`, `apps/cli/src/tools/path_security.rs`
- Verify: `cargo test -p agiworkforce-cli --lib rules_file_write_denied` (new: agent `write_file` to `<git-root>/.agiworkforce/rules/*.md` is denied, or loaded content is wrapped in the untrusted marker)
- Evidence: `apps/cli/src/memory.rs` loads `<git-root>/.agiworkforce/rules/*.md` into every future session as trusted instructions; no denylist in path security.

### 17. Local mode leaks prompts to managed cloud through image/video generation

- Status: DONE (2026-08-09) — extension message-policy coverage — 00afb5349
- Area: security
- Severity: high
- Writes: `apps/desktop/src-tauri/src/sys/commands/media.rs`, `apps/desktop/src-tauri/src/sys/commands/chat/tool_config.rs`, `apps/desktop/src/lib/runtime/TauriRuntime.ts`
- Verify: `pnpm check:trust-boundaries` and `cargo test -p agiworkforce-desktop media_local_mode_blocked` (new)
- Evidence: `media.rs:208–235, 301–330` (raw `reqwest` + `bearer_auth`, no privacy/mode read, bypasses the TS `guardedFetch` chokepoint); `tool_config.rs:53–62` filters only when `model_capabilities` is `Some`, and `TauriRuntime.ts:1046–1090` never populates it (fail-open).

### 18. Desktop web-search results reach the model with no injection fence

- Status: DONE (2026-08-09) — VS Code gateway origin allowlist — 272fc24bd
- Area: security
- Severity: high
- Writes: `apps/desktop/src-tauri/src/core/llm/tool_executor/search_tools.rs`
- Verify: `cargo test -p agiworkforce-desktop search_results_are_fenced` (new: output contains the untrusted-content delimiter + "data only" clause used on web)
- Evidence: `search_tools.rs:294–309` returns bare JSON of attacker-controlled `title`/`snippet`/`url` on the surface that also owns terminal, file-delete and browser tools.

### 19. SVG avatars and knowledge files are stored and served unscanned, up to 25 MiB

- Status: DONE (2026-08-09) — refuse SVG attachments, cap avatars — f8b20a313
- Area: security
- Severity: high
- Writes: `packages/contracts/types/src/chat.ts`, `apps/web/app/api/uploads/presign/route.ts`, `apps/web/app/api/uploads/avatar/complete/route.ts` (new), `apps/web/app/api/uploads/knowledge-file/complete/route.ts` (new)
- Verify: `pnpm --filter @agiworkforce/web test uploads` (new: `image/svg+xml` rejected for every `kind`; `scanUploadBytes` runs for all kinds)
- Evidence: `chat.ts:134–263` (broad `image/` prefix at 25 MiB vs 16-entry list at 12 MiB); `presign/route.ts:84–97` runs the narrow check only when `kind === 'chat-attachment'`; `scanUploadBytes` has exactly one caller.

---

## Wave 2 — Money

### 20. Gateway path enforces no usage caps at all

- Status: todo
- Area: billing
- Severity: high
- Writes: `services/api-gateway/src/services/managedUsageBilling.ts`
- Verify: `pnpm --filter @agiworkforce/api-gateway test managedUsageBilling` (new: rolling 5-hour, rolling weekly and flagship-weekly caps reject over-quota reservations)
- Evidence: `managedUsageBilling.ts:315–324` calls the legacy `reserve_managed_usage_request(...)` with no cap arguments; desktop, CLI and VS Code all route here.
- ⚠ Serial with #21, #33.

### 21. Client disconnect mid-stream settles as `failed` and bills zero

- Status: todo
- Area: billing
- Severity: high
- Writes: `services/api-gateway/src/routes/llm.ts`, `services/api-gateway/src/services/managedUsageBilling.ts`
- Verify: `pnpm --filter @agiworkforce/api-gateway test llm` (new: aborting after N streamed tokens settles `actual_cost_cents > 0` and counts toward the rolling window)
- Evidence: `routes/llm.ts:457–486, 742–767, 826`; `managedUsageBilling.ts:395–400`
- ⚠ Serial with #20.

### 22. Cloud Code agent turns bill a flat 25¢ regardless of usage

- Status: todo
- Area: billing
- Severity: high
- Writes: `apps/web/lib/services/cloud-code-agent-service.ts`, `apps/web/lib/services/cloud-code-agent-loop.ts`
- Verify: `pnpm --filter @agiworkforce/web test cloud-code-agent` (new: finalize uses measured tokens; `is_flagship` reflects the model actually called)
- Evidence: `cloud-code-agent-service.ts:49, 236–241`; `cloud-code-agent-loop.ts:49` — up to 24 flagship calls per turn, flagship-weekly cap bypassed.

### 23. Every E2B sandbox second is free because the rate env var ships unset

- Status: todo
- Area: billing
- Severity: critical
- Writes: `apps/web/lib/e2b/compute-metering.ts`, `apps/web/.env.example`
- Verify: `pnpm --filter @agiworkforce/web test compute-metering` (new: unset rate fails loud in production rather than metering 0) and `pnpm check:env-contract`
- Evidence: `apps/web/lib/e2b/compute-metering.ts:29, 43–57` (`AGI_E2B_COMPUTE_MICROUSD_PER_SECOND`)
- ⚠ Serial with #24 (`.env.example`).

### 24. Undocumented environment variables that fail silently

- Status: todo
- Area: ops
- Severity: high
- Writes: `apps/web/.env.example`, `apps/web/lib/validate-env.ts`, `scripts/env-doctor.mjs`, `apps/cli/.env.example` (new), `scripts/check-env-contract.mjs`
- Verify: `pnpm check:env-contract && pnpm env:doctor`
- Evidence: `UPLOAD_SCAN_WEBHOOK_URL` (scanner silently off when unset), `ENCRYPTION_KEY`, `DESKTOP_TOKEN_SECRET` (two spellings), `STRIPE_PRICE_TEAM_*` (Team checkout fails closed; `apps/web/lib/__tests__/public-billing-copy.test.ts:88` documents the gap instead of failing), `CONNECTOR_OAUTH_*_CLIENT_ID/SECRET` (runtime-derived names), `RESEND_API_KEY` + 5 support vars with hardcoded `support@agiworkforce.com` defaults; `apps/cli` ships no example for ~20 vars and `check:env-contract` inspects six hardcoded scopes excluding the CLI.
- ⚠ Serial with #23.

### 25. Team seat purchase never reconciles `licensed_seats`

- Status: todo
- Area: billing
- Severity: high
- Writes: `apps/web/app/api/stripe-webhook/lib/seats.ts`, `apps/web/app/api/settings/organization/route.ts`
- Verify: `pnpm --filter @agiworkforce/web test seats` (new: purchase before org creation still lands the paid seat count)
- Evidence: `seats.ts:150–158` matches on owning organization; `organization/route.ts:181–186`; with the seat floor now 2 (`7611c622b`) this hits every new Team purchase.
- ⚠ Serial with #26.

### 26. Stripe lifecycle: no refund path, refunds don't revoke the plan, unregistered Price 500s renewals

- Status: DONE (2026-08-09) — full-refund entitlement revocation — 3b5c5f43a
- Area: billing
- Severity: critical
- Writes: `apps/web/app/api/stripe-webhook/lib/handlers.ts`, `apps/web/app/api/stripe-webhook/lib/db.ts`, `apps/web/lib/price-tier-mapping.ts`
- Verify: `pnpm --filter @agiworkforce/web test stripe-webhook` (new: `charge.refunded` downgrades the tier; an unknown Price ID resolves to its recorded tier instead of throwing)
- Evidence: `refunds.create` has zero hits repo-wide; the subscription updater throws on an unregistered Price, which would break every legacy renewal after any price change (contradicting the 30-day price-protection promise in `/terms`).
- ⚠ Serial with #25.

### 27. Rate limits are flat across all 122 configs — no tier awareness anywhere

- Status: DONE (2026-08-09) — renew legacy Stripe prices — 3b5c5f43a
- Area: billing
- Severity: high
- Writes: `services/api-gateway/src/middleware/rateLimit.ts`, `apps/web/lib/rate-limit.ts`
- Verify: `pnpm --filter @agiworkforce/api-gateway test rateLimit && pnpm --filter @agiworkforce/web test rate-limit` (new: `max_15x` ceiling > `free`; chat ceiling ≥ the tier's advertised concurrency)
- Evidence: gateway `rateLimit.ts` — 37 configs, all `windowMs: 60_000`, tier-aware: no; web `rate-limit.ts` — 85 configs, tier-aware: no; on the LLM route the limiter runs three lines before the subscription is loaded; flat 20 msg/min < the 12 concurrent turns sold to `max_15x`. Also fix `rateLimit.ts:27, 187–190`: `RATE_LIMIT_REDIS_URL` falls back to the Upstash **REST** URL fed into `new Redis()`, which fails and silently degrades to in-memory while the multi-instance alarm checks only the first var.

### 28. Scheduled-task tier quotas exceed total cron capacity by ~10x

- Status: DONE (2026-08-09) — tier-aware rate limits — d061dccc3
- Area: billing
- Severity: high
- Writes: `packages/contracts/types/src/billing-catalog.ts`, `vercel.json`, `apps/web/app/api/cron/run-schedules/route.ts`
- Verify: `pnpm --filter @agiworkforce/web test schedule-cadence` (new: `Σ maxScheduledTasks` reachable within the deployed cron cadence × claim limit)
- Evidence: `billing-catalog.ts:376–461` sized for an hourly sweep (240 runs/day) but `vercel.json:53–56` is `0 1 * * *` daily and `run-schedules/route.ts:19` claims `limit: 10` platform-wide; `apps/web/lib/schedules/schedule-time.ts:308` `SWEEP_INTERVAL_MS = 24h`. Needs a requeue loop or a paid cron cadence (see §Founder).
- ⚠ Serial with #29, #62.

### 29. Enterprise tier is `unlimited: true` at `monthlyPriceUsd: 0`; local-only/BYOK quotas contradict themselves

- Status: todo
- Area: billing
- Severity: critical
- Writes: `packages/contracts/types/src/billing-catalog.ts`, `apps/desktop/src/constants/pricing.ts`, `apps/desktop/src/constants/planFeatures.ts`, `apps/desktop/src/lib/featureGates.ts`
- Verify: `pnpm --filter @agiworkforce/types test billing-catalog && pnpm --filter @agiworkforce/desktop test featureGates` (new: no tier is simultaneously unlimited and capped; unlimited tiers carry a cost ceiling)
- Evidence: Enterprise resolves every rolling cap to `null` with $1,000,000 ledger headroom at price 0; `featureGates.ts:72` reads a table capping local-only/byok at 5/10 while `featureGates.ts:107` enforces "unlimited" for the same tiers, and no server-side automation counter exists.
- ⚠ Serial with #28.

---

## Wave 3 — Deletion, retention and data integrity

### 30. Account erasure is materially incomplete

- Status: DONE (2026-08-09) — schedule throughput vs quota — 04c8aa9c3
- Area: legal
- Severity: high
- Writes: `apps/web/lib/server/account-erasure.ts`, `apps/web/app/api/auth/device/refresh/route.ts`, `apps/web/app/api/cron/purge-deleted-accounts/route.ts`
- Verify: `pnpm --filter @agiworkforce/web test account-erasure` (new: the table list is derived from the schema, not hand-written; a failed table delete leaves the `profiles` retry pointer intact; a deleted account's device refresh token is rejected)
- Evidence: `account-erasure.ts:34–76` has 34 entries and reports `complete: true` while omitting `chat_messages`/`conversations`/`messages`, `cloud_code_sessions`/`terminal_entries`, `cloud_agent_runs`/`events`, `connector_oauth_grants`, `messaging_connections`, `usage_events`, `device_refresh_tokens`, `revoked_jwts` — none FK'd to `profiles`, so nothing cascades; `:164–187` deletes `profiles` last even after a failure, and `purge-deleted-accounts/route.ts:82–91` selects retries from `profiles`; `auth/device/refresh/route.ts:57–125` checks only `used_at`/`revoked_at`/`expires_at`. Object-store sweep covers only media assets, so avatars and knowledge files survive world-readable.

### 31. Delete-account route treats any DB error as "columns missing" and hard-deletes

- Status: DONE (2026-08-09) — account erasure covers every user-scoped table — 3a9d5c271
- Area: data
- Severity: high
- Writes: `apps/web/app/api/user/delete-account/route.ts`
- Verify: `pnpm --filter @agiworkforce/web test delete-account` (new: only Postgres `42703` takes the fallback; a 0-row UPDATE returns an error, not 200 with a `scheduledFor`)
- Evidence: `delete-account/route.ts:105–165`; the 500 branch also falsely claims no data was removed when `erasure.complete === false`.

### 32. Cloud sync discards every local write error

- Status: DONE (2026-08-09) — purge credentials and query cache on logout — 46e81e69f
- Area: data
- Severity: high
- Writes: `apps/desktop/src-tauri/src/data/cloud_sync.rs`
- Verify: `cargo test -p agiworkforce-desktop cloud_sync_write_failures` (new: a failed apply must not advance the cursor, must not delete the orphan-buffer row, and must surface in `messages_failed`)
- Evidence: `cloud_sync.rs:327–334, 1452–1576, 1922–1937` (`let _ = conn.execute(...)` at every apply site; `messages_failed` hardcoded 0).

### 33. Cache-pricing divergence between desktop and web, and triplicated surcharges

- Status: todo
- Area: billing
- Severity: high
- Writes: `apps/desktop/src-tauri/src/core/llm/cost_calculator.rs`, `apps/web/lib/cost-tracker.ts`, `apps/web/lib/prompt-cache-helper.ts`, `apps/web/lib/services/llm-cost-calculator.ts`, `services/api-gateway/src/services/managedUsageBilling.ts`
- Verify: `cargo test -p agiworkforce-desktop cost_calculator && pnpm --filter @agiworkforce/web test cost-tracker` (new: identical fallback for "caching declared, no cache-read price"; the 1.25x/2.0x surcharge pair has one exported definition)
- Evidence: `cost_calculator.rs:364–374` falls back to the full input rate; `apps/web/lib/cost-tracker.ts:110` falls back to 90% off — `minimax-m3` (`packages/ai/model-registry/catalog/models.curation.json:1933–1966`) hits this today ($0.30/M vs $0.03/M). `prompt-cache-helper.ts:84–118` hardcodes a flat `0.1` multiplier (deepseek family is actually 0.02x), live via `response-builder.ts:113`. Surcharge literals: `llm-cost-calculator.ts:241,244`; `cost-tracker.ts:129,135`; `managedUsageBilling.ts:225–226`.
- ⚠ Serial with #20, #21.

### 34. Persisted-store key collisions and unwritten storage keys

- Status: DONE (2026-08-09) — origin_surface accepts cli — e5d0727b9 (0099)
- Area: correctness
- Severity: high
- Writes: `apps/desktop/src/stores/connectorsStore.ts`, `apps/desktop/src/stores/chatPreferencesStore.ts`, `packages/client/client-runtime/src/http.ts`, `apps/extension/src/features/background/synced-preferences.ts`, `apps/extension/src/features/background/__tests__/synced-preferences.test.ts`
- Verify: `pnpm --filter @agiworkforce/desktop test connectorsStore && pnpm --filter @agiworkforce/extension test synced-preferences` (new: persist keys are unique repo-wide; every synced key has a writer)
- Evidence: `connectorsStore.ts:344–347` (two stores share key `connectors-store` at v7/v4, forcing the v7 `version < 6` migration to reset the catalog; twin collision on `agiworkforce-chat-preferences`); `packages/client/client-runtime/src/http.ts:25` reads `agi-auth-token`, which has no writer anywhere, so `routeToCloud()` always POSTs unauthenticated; `synced-preferences.ts:13` syncs `agi_in_page_panel_enabled` (real key: `in_page_panel_enabled`) and the test asserts the typo.

### 35. Web logout leaves auth/refresh tokens and user data in storage

- Status: DONE (2026-08-09) — one owner for the admin role pair — e5d0727b9 (0100)
- Area: security
- Severity: high
- Writes: `apps/web/shared/stores/authentication-store.ts`, `apps/web/shared/stores/authentication-manager.ts`, `apps/desktop/src/stores/logoutCleanup.ts`
- Verify: `pnpm --filter @agiworkforce/web test authentication-store && pnpm --filter @agiworkforce/desktop test logoutCleanup` (new: after logout no key written by any store remains)
- Evidence: `authentication-store.ts:126–134` patterns match neither `auth_token` nor `refresh_token` (`apps/web/shared/lib/api.ts:45–46`), and `logout()` calls the no-op `authService.logout()` (`authentication-manager.ts:92–94`) instead of `apiClient.clearTokens()`; `logoutCleanup.ts:192–221` lists 13 keys, missing `agiworkforce-memory`, `agiworkforce-custom-instructions`, `research-store`, and 3 of its 13 have no writer.
- Note: the web leg is lower-impact than the audit implies — `apiClient.login()`/`setToken()` appear to be dead code (auth is Clerk-cookie based). Fix anyway; delete the dead client if confirmed.

### 36. `apiFetch` sends ciphertext as the bearer token, and the API base falls back to the wrong origin

- Status: DONE (2026-08-09) — SCIM admin predicate — 2ac7e148a
- Area: security
- Severity: high
- Writes: `apps/web/shared/stores/query-client.ts`
- Verify: `pnpm --filter @agiworkforce/web test query-client` (new: token read matches the writer's plaintext cache; a missing `NEXT_PUBLIC_API_URL` fails the build rather than silently retargeting `/api`)
- Evidence: `query-client.ts:330` (reads `auth_token`, whose only writer stores ciphertext) and `:326` (relative `/api` fallback, while another module throws in production for the same var).

### 37. `origin_surface: 'cli'` passes the plan gate and is rejected by the DB

- Status: DONE (2026-08-09) — signaling resync contract — 2ac7e148a
- Area: data
- Severity: high
- Writes: `apps/web/db/neon/0104_origin_surface_cli.sql` (new), `apps/web/app/api/cloud-agent/runs/route.ts`
- Verify: `pnpm check:neon-migrations && pnpm --filter @agiworkforce/web test cloud_agent_runs`
- Evidence: `apps/web/db/neon/0061_cloud_agent_runs.sql:14–16` CHECK omits `cli` while the Zod schema allows it; only `unknown` is remapped to `api`.

### 38. Cloud Code approval gate is write-only — three of four states unreachable

- Status: todo
- Area: data
- Severity: high
- Writes: `apps/web/lib/services/cloud-code-agent-loop.ts`, `apps/web/app/api/cloud-code/approvals/route.ts` (new)
- Verify: `pnpm --filter @agiworkforce/web test cloud-code-approvals` (new: approve → resume, reject → abort, expiry sweep)
- Evidence: `apps/web/db/neon/0082_cloud_code_agent_turns.sql:102–127`; the table has one INSERT, no SELECT/UPDATE, and `preApproved` is supplied only by tests.
- ⚠ Serial with #22.

### 39. `'owner'|'admin'` predicate hand-written in 12 TS files and 32 SQL sites

- Status: DONE (2026-08-09) — desktop event emission — 4f1e0c35b
- Area: data
- Severity: high
- Writes: `apps/web/lib/server/scim/scim-auth.ts`, the 11 other TS call sites, `apps/web/db/neon/0105_admin_role_helper.sql` (new)
- Verify: `pnpm check:hardcoded-arrays && pnpm --filter @agiworkforce/web test scim-auth`
- Evidence: `apps/web/lib/server/scim/scim-auth.ts:116`; canonical `isOrganizationAdminRole()` has exactly one caller; the RLS helper `app_row_is_readable` also inlines the pair.

---

## Wave 4 — Broken contracts (dead UI, dead events, dead paths)

### 40. Seven desktop UI surfaces listen for events Rust never emits

- Status: DONE (2026-08-09) — desktop store subscriptions — ae0e7ed6c
- Area: correctness
- Severity: high
- Writes: `apps/desktop/src/features/agent-collaboration/AgentCollaborationPanel.tsx`, `apps/desktop/src/stores/schedulerStore.ts`, `apps/desktop/src/stores/executionStore.ts`, `apps/desktop/src/stores/computerUseStore.ts`, `apps/desktop/src-tauri/src/core/swarm/orchestrator.rs`, `apps/desktop/src-tauri/src/sys/commands/scheduler.rs`, `apps/desktop/src-tauri/src/ui/events/frontend_events.rs`
- Verify: `pnpm check:hook-fire-sites` extended to Tauri events, plus `pnpm --filter @agiworkforce/desktop test events-contract` (new: every `listen(...)` name has an emitter)
- Evidence: collaboration panel listens `swarm:progress|agent_message|complete` (`AgentCollaborationPanel.tsx:150,157,176`) vs emitted `swarm:started|decomposed|completed|subtask_*` (`orchestrator.rs:187,205,287,558`); `schedulerStore.ts:627–680` (5 names) vs emitted `scheduler:workflow-execute|notification` (`scheduler.rs:1575,1602`); `executionStore.ts:1091–1106` (`agi:llm_chunk|llm_complete|terminal_output`) vs `llm:stream_chunk` (`llm_executor.rs:341`) and `agi:terminal_command` (`frontend_events.rs:103`); computer-use store listens `computer_use:screenshot` vs emitted `agi:screenshot`, and `automation:request_screenshot` has no listener.

### 41. Three desktop panels listen for events with no emitter at all (workflow, ROI, canvas)

- Status: DONE (2026-08-09) — events-contract test — ae0e7ed6c
- Area: correctness
- Severity: high
- Writes: `apps/desktop/src/hooks/useWorkflows.ts`, `apps/desktop/src/features/roi-dashboard/**`, `apps/desktop/src/features/dynamic-canvas/**`, plus the emitting Rust modules
- Verify: same contract test as #40, run after emitters exist
- Evidence: `useWorkflows.ts:87,117,133` (`workflow:status_changed|log|error`) — zero `"workflow:` emits anywhere in `src-tauri`; ROI dashboard listens `metrics:updated`, canvas listens `canvas:updated`, neither emitted. Decide per feature: emit, or delete with #66.
- ⚠ Serial with #66 (same feature directories).

### 42. Signaling contract omits four server-sent message types

- Status: DONE (2026-08-09) — connector persist key — ae0e7ed6c
- Area: correctness
- Severity: high
- Writes: `packages/contracts/types/src/signaling.ts`, `apps/desktop/src/services/signalingClient.ts`, `apps/mobile/services/signaling.ts`
- Verify: `pnpm check:protocol-types && pnpm --filter @agiworkforce/types test signaling`
- Evidence: `signaling.ts:67–121` lacks `sync_request`, `approval_queued`, `connection_timeout`, `server_shutdown`; both clients drop them via `default: break`, killing mobile reconnect state-sync.

### 43. VS Code client drops `task/state_changed` and `server/warning`

- Status: todo
- Area: correctness
- Severity: high
- Writes: `apps/extension-vscode/src/integrations/localRuntimeClient.ts`
- Verify: `pnpm --filter agi-workforce test localRuntimeClient` (new: all 9 notification methods parsed; `notification_lag` surfaces to the user)
- Evidence: `localRuntimeClient.ts:252–331` handles 7 of 9.

### 44. Four incompatible `AgentMode` vocabularies; the shared client can never succeed

- Status: todo
- Area: correctness
- Severity: high
- Writes: `packages/client/desktop-command-client/src/toolConfirmation.ts`, `packages/contracts/types/src/agent-mode.ts`
- Verify: `pnpm --filter @agiworkforce/desktop-command-client test toolConfirmation` (new: the TS union equals the Rust `serde` wire values)
- Evidence: `toolConfirmation.ts:14` (`supervised|autonomous|restricted`) vs `apps/desktop/src-tauri/src/sys/commands/tool_confirmation.rs:118–125` (`safe|plan|build|autopilot`); used by `RecorderHud.tsx` and `BridgeStatusCard.tsx`, so not dead.

### 45. Desktop IPC allowlist is bypassed by `tauri-mock`, and is stale in both directions

- Status: todo
- Area: security
- Severity: high
- Writes: `apps/desktop/src/lib/tauri-mock.ts`, `apps/desktop/src/utils/ipc.ts`
- Verify: `pnpm --filter @agiworkforce/desktop test ipc` (new: allowlist generated from `generate_handler!`; `COMMAND_TIMEOUTS` keys must all be registered commands)
- Evidence: `ipc.ts:47–329` — 200 registered commands would be rejected `UNKNOWN_COMMAND`, 3 generic entries and 6 prefixes match zero commands; `tauri-mock.ts:262` forwards straight to `@tauri-apps/api/core` for ~230 importers; `COMMAND_TIMEOUTS['read_file']` never fires (the command is `file_read`, `lib.rs:1680`).
- ⚠ Serial with #57.

### 46. `code_search` is rejected in every mode

- Status: todo
- Area: correctness
- Severity: medium
- Writes: `apps/desktop/src-tauri/src/sys/security/tool_guard.rs`
- Verify: `cargo test -p agiworkforce-desktop code_search_allowed` (new)
- Evidence: listed in `READ_ONLY_TOOLS` (`tool_confirmation.rs:374`) and dispatched, but absent from `ToolExecutionGuard::new()`, so `validate_tool_call` returns `UnauthorizedTool`.
- ⚠ Serial with #14.

### 47. Canonical path constants retyped across surfaces

- Status: todo
- Area: correctness
- Severity: high
- Writes: `apps/web/lib/runtime/WebChatRuntime.ts`, `apps/web/features/schedules/services/schedule-api.ts`, `apps/mobile/services/streaming.ts`, `packages/ui/unified-chat/src/lib/connector-connect-required.ts`, `packages/contracts/cloud-contracts/src/paths.ts`
- Verify: `pnpm check:cloud-contract-ownership && pnpm --filter @agiworkforce/web test schedule-api`
- Evidence: `MANAGED_CLOUD_CHAT_BASE_PATH` has 13 non-test literal re-typings (5 in `WebChatRuntime.ts:343–391`); `/api/me` has 10+ literals with disagreeing query params; `schedule-api.ts:140,154,164` addresses one resource three ways (raw literal / builder / constant); `apps/mobile/services/streaming.ts:233–234` shadows the imported `TOOL_APPROVAL_RESUME_PATH`; `connector-connect-required.ts:55–56,135` is a third independent `CONNECTOR_OAUTH_START_PATH` inside a strict pathname-equality trust check.

### 48. "Max iterations" slider actually spawns that many concurrent agents

- Status: todo
- Area: correctness
- Severity: high
- Writes: `apps/desktop/src/features/agi/AgentTaskCreator.tsx`, `apps/desktop/src/stores/agentTaskStore.ts`, `apps/desktop/src-tauri/src/sys/commands/agi.rs`
- Verify: `pnpm --filter @agiworkforce/desktop test AgentTaskCreator && cargo test -p agiworkforce-desktop num_agents_clamp` (new)
- Evidence: `AgentTaskCreator.tsx:170–186` (1–20 slider) → `agentTaskStore.ts:264` `numAgents: options.maxIterations ?? 4` with no clamp; `agi.rs:274` defaults to 8; sequential mode drops the value entirely (`agentTaskStore.ts:283–289`).
- Note: the audit's "enforced ceiling of 25" does not exist — `goal_iteration_limit()` (`core/agi/core.rs:43–56`) defaults to 1000.

### 49. Extension composer accepts more attachments than the transport will send

- Status: todo
- Area: ux
- Severity: high
- Writes: `apps/extension/src/side_panel.ts`
- Verify: `pnpm --filter @agiworkforce/extension test side_panel` (new: drag, paste and the `+` menu all enforce the same count and byte caps as the send path)
- Evidence: `side_panel.ts:4337` (cap 8 on drag/paste, send throws at 5, `+` menu unbounded; 10 MB × 8 vs a 25 MiB request budget)
- ⚠ Serial with #50, #61.

### 50. Client upload cap is 10 MB against a canonical 12 MB server cap

- Status: todo
- Area: correctness
- Severity: high
- Writes: `apps/web/shared/lib/security.ts`, `apps/web/shared/ui/ai-prompt-box.tsx`, `apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts`, `apps/extension/src/side_panel.ts`, `apps/desktop/src/api/embeddings.ts`, `apps/desktop/src/utils/fileUtils.ts`
- Verify: `pnpm check:hardcoded-arrays && pnpm --filter @agiworkforce/web test security`
- Evidence: six `10 * 1024 * 1024` literals at `security.ts:533`, `ai-prompt-box.tsx:405`, `webviewContent.ts:2853` (comment falsely claims "matches host Zod cap"), `side_panel.ts:4336`, `embeddings.ts:99`, `fileUtils.ts:3`; canonical `MAX_CHAT_ATTACHMENT_BYTES = 12 * 1024 * 1024` at `packages/contracts/cloud-contracts/src/chat-attachments.ts:6`
- ⚠ Serial with #49, #57, #61.

### 51. Desktop system prompt names a tool that does not exist

- Status: todo
- Area: correctness
- Severity: high
- Writes: `apps/desktop/src-tauri/src/core/agent/prompt_engineer.rs`
- Verify: `cargo test -p agiworkforce-desktop prompt_tool_names_exist` (new: every tool name in the prompt resolves in the registry)
- Evidence: `prompt_engineer.rs:436` instructs `memory_add`; the registry has `memory_remember|recall|forget|search`.

### 52. 18 persisted desktop settings have no reader

- Status: todo
- Area: ux
- Severity: medium
- Writes: `scripts/config/surface-invariants-allowlist.json`, the owning stores and the settings UI that renders each toggle
- Verify: `pnpm check:surface-invariants` with the SIX-32 entries removed
- Evidence: `scripts/config/surface-invariants-allowlist.json:43–134` — includes user-visible toggles `thinkingModeEnabled`, `showMessageTimestamps`, `showMarkdownPreview`, `speedQualityMode`. Each: wire it or delete the control.

### 53. Three disconnected keyboard-shortcut default sets

- Status: todo
- Area: ops
- Severity: medium
- Writes: `apps/desktop/src/constants/shortcuts.ts`, `apps/desktop/src/features/settings/KeybindingsSettings.tsx`, `apps/desktop/src-tauri/src/sys/commands/shortcuts.rs`, `apps/desktop/src/App.tsx`
- Verify: `pnpm --filter @agiworkforce/desktop test KeybindingsSettings` (new: every editable shortcut id round-trips to Rust; failures surface instead of a success toast)
- Evidence: `constants/shortcuts.ts:25–231` (25 ids) vs `shortcuts.rs:45–117` (7 different ids, `:541–543` returns `Shortcut not found` swallowed at `KeybindingsSettings.tsx:235–237`) vs `App.tsx:1047–1063, 1390–1414`; nothing reads `DEFAULT_SHORTCUTS[].action`.

---

## Wave 5 — Registry and constant drift

### 54. Image generation calls three model IDs that do not exist in the catalog

- Status: todo
- Area: correctness
- Severity: high
- Writes: `apps/desktop/src-tauri/src/integrations/api_integrations/image_gen.rs`
- Verify: `cargo test -p agiworkforce-desktop resolve_image_model` (new: every canonical ID passed in must resolve) and `pnpm check:model-catalog`
- Evidence: `image_gen.rs:241–245, 371–375` pass `stable-diffusion-xl`, `imagen-4-fast`, `imagen-4`; `packages/contracts/types/src/models.json:45` records these as REMOVED 2026-07-20 (successors: `gemini-3.1-flash-image`, `stable-image-core`, `gpt-image-2`); `resolve_image_model()` (`image_gen.rs:10–18`) therefore always falls through to a literal wire ID.
- ⚠ Serial with #55, #71.

### 55. Desktop/CLI hardcoded model IDs outside the catalog

- Status: todo
- Area: correctness
- Severity: high
- Writes: `apps/desktop/src-tauri/src/core/llm/llm_router.rs`, `apps/desktop/src-tauri/src/sys/commands/completion.rs`, `apps/desktop/src-tauri/src/core/llm/tool_executor/llm_tools.rs`, `apps/desktop/src-tauri/src/core/llm/models_config.rs`, `apps/desktop/src-tauri/src/sys/commands/voice.rs`, `apps/desktop/src-tauri/src/integrations/api_integrations/perplexity.rs`, `apps/desktop/src-tauri/src/core/agi/executors/search_executor.rs`, `apps/cli/src/provider.rs`, `apps/cli/src/model_catalog.rs`, `apps/web/scripts/test-llm-keys.ts`
- Verify: `cargo test -p agiworkforce-desktop && cargo test -p agiworkforce-cli --lib no_hardcoded_model_ids && pnpm check:model-catalog`
- Evidence: `llm_router.rs:588–599` (only arms not calling `provider_task_model`); `completion.rs:385–406` (`glm-5.2` ×2 despite `models.json:331–345` exposing `fast_completion`); `llm_tools.rs:37` (bare `gpt-5.6-luna`); `models_config.rs:336–343` (fallback guarded only by `debug_assert!`, a no-op in release); `voice.rs:138` (`gpt-4o-transcribe`, second copy of `apps/cli/src/voice.rs:41`); `perplexity.rs:18–36` (four wire IDs duplicated, routed by `search_executor.rs:8,51–56,328`); `apps/cli/src/provider.rs:186–188` (exact-match Gemini IDs — add a catalog capability flag instead); `apps/cli/src/model_catalog.rs:1717,1838,1869` (extend the `no_hardcoded_model_ids_in_*` pattern to `voice.rs`); `apps/web/scripts/test-llm-keys.ts:29` (`claude-sonnet-5`).
- ⚠ Serial with #54, #71, #72.

### 56. Max-token defaults ignore per-model registry capacity

- Status: todo
- Area: correctness
- Severity: high
- Writes: `apps/desktop/src-tauri/src/sys/commands/chat/compaction.rs`, `apps/desktop/src-tauri/src/core/agent/context_compactor.rs`, `apps/cli/src/subagent_v2.rs`, `apps/cli/src/config.rs`, `apps/desktop/src-tauri/src/automation/computer_use/anthropic_agent.rs`, `packages/ai/providers/anthropic/src/translate.ts`, `apps/web/app/api/github/webhook/route.ts`, `apps/desktop/src/stores/settings/voice.ts`, `apps/desktop/src/stores/settingsStore.ts`, `apps/desktop/src-tauri/src/sys/commands/settings.rs`, `apps/desktop/src-tauri/src/data/settings/models.rs`
- Verify: `cargo test -p agiworkforce-desktop compaction && cargo test -p agiworkforce-cli --lib max_tokens && pnpm --filter @agiworkforce/anthropic test translate`
- Evidence: `compaction.rs:106–117` (flat 100k/50k, command takes no model; sibling `context_monitor.rs:117–186` resolves the real window); `context_compactor.rs:40–41`; `subagent_v2.rs:457–465` (4096 vs a 128k registry max, never overridden); `config.rs:132–134` (default 8192) and `:803–808` (ceiling 200k, both registry-independent — 150k passes local validation and is rejected upstream); `anthropic_agent.rs:63–79`; `translate.ts:96,283`; `github/webhook/route.ts:429–439` (1024, direct `api.anthropic.com` call); `voice.ts:433,1308`; `settingsStore.ts:331` + `settings.rs:388` + `models.rs:205`.
- ⚠ Serial with #59 (`settingsStore.ts`), #67 (`request-processor.ts`).

### 57. Desktop timeout constants: a complete canonical file with zero importers

- Status: todo
- Area: ops
- Severity: high
- Writes: `apps/desktop/src/api/automation.ts`, `apps/desktop/src/api/mcp.ts`, `apps/desktop/src/api/embeddings.ts`, `apps/desktop/src/api/privacy.ts`, `apps/desktop/src/api/automationEnhanced.ts`, `apps/desktop/src/api/ollama.ts`, `apps/desktop/src/stores/chat/agentWorkflowEvents.ts`, `apps/desktop/src/utils/ipc.ts`
- Verify: `pnpm check:hardcoded-arrays && pnpm --filter @agiworkforce/desktop typecheck`
- Evidence: `apps/desktop/src/constants/timeouts.ts:12,49,62,85,88,98,108,134` exports every one of these under the identical name with zero importers; local redeclarations at `automation.ts:15`, `mcp.ts:42,43`, `embeddings.ts:3,4`, `privacy.ts:87`, `automationEnhanced.ts:14,15`, `ipc.ts:42`, `ollama.ts:59`, `agentWorkflowEvents.ts:443`
- ⚠ Serial with #45, #50.

### 58. Duplicated tier/plan vocabularies

- Status: todo
- Area: billing
- Severity: high
- Writes: `apps/desktop/src/lib/cloudAccountTypes.ts`, `apps/mobile/src/features/chat/components/PaywallBottomSheet.tsx`, `apps/web/features/billing/hooks/use-billing-queries.ts`, `apps/web/features/billing/components/Billing/types.ts`, `apps/desktop/src/constants/llm.ts`
- Verify: `pnpm --filter @agiworkforce/desktop test cloudAccountTypes && pnpm --filter @agiworkforce/mobile test PaywallBottomSheet` (new file) `&& pnpm --filter @agiworkforce/web test billing`
- Evidence: `cloudAccountTypes.ts:1–42` (hand-maintained `PlanTier` + `PLAN_DISPLAY_NAMES`, 13+ importers including auth and feature gating; the sibling `planModels.ts` comment records that a short copy previously dropped Max 15x and Team after Cloud sync); `PaywallBottomSheet.tsx:45–54` (8 tiers, no `max_15x`, mislabels `max` as "Max" — and `video_generation` is gated to `['max_15x','enterprise']` at `billing-catalog.ts:303`, so the real paywall shows the generic fallback); `use-billing-queries.ts:38` + `Billing/types.ts:3–12` (7-member union declared twice by hand); `apps/desktop/src/constants/llm.ts:245–267` reimplements the tier cascade and already omits the canonical free-tier `minTier` check (`model-catalog.ts:1608`).

### 59. Capability toggles fail open; dead feature-flag key

- Status: todo
- Area: security
- Severity: high
- Writes: `apps/desktop/src-tauri/src/sys/security/capabilities.rs`, `apps/desktop/src/stores/settingsStore.ts`, `apps/desktop/src/features/settings/DesktopCloudSettingsModal.tsx`
- Verify: `cargo test -p agiworkforce-desktop capability_default_denied` (new) `&& pnpm --filter @agiworkforce/desktop test settingsStore`
- Evidence: `capabilities.rs:25–28` `is_enabled` returns `unwrap_or(true)`; `settingsStore.ts:1594–1603, 1707–1714` swallows the sync failure to `console.error` and still shows success, so `terminalAccess`/`fileOperations`/`codeExecution` stay live after being turned off; `DesktopCloudSettingsModal.tsx:496,515` indexes an untyped `Record<string, boolean>` with `native_web_search`, a key with exactly one hit repo-wide.
- ⚠ Serial with #56 (`settingsStore.ts`).

### 60. Provider host allowlists: three hand-typed copies, one functionally short

- Status: todo
- Area: security
- Severity: high
- Writes: `apps/web/lib/egress-policy.ts`, `services/api-gateway/src/services/providerHealth.ts`
- Verify: `pnpm --filter @agiworkforce/web test egress-policy && pnpm --filter @agiworkforce/api-gateway test providerHealth`
- Evidence: `egress-policy.ts:21–34` omits `api.x.ai`, `api.deepseek.com`, `api.perplexity.ai`, `openrouter.ai`, `dashscope.aliyuncs.com`, all present in the canonical `ALLOWED_MANAGED_PROVIDER_HOSTS` (`packages/ai/provider-runtime/src/base-url.ts`) that this app already imports at `apps/web/lib/services/provider-adapter-service.ts:6`; `providerHealth.ts:44–73, 92–102` is a third copy although `@agiworkforce/provider-runtime` is already a declared dependency (`services/api-gateway/package.json:19`).

### 61. Provider hostnames retyped across web routes and both Rust binaries

- Status: todo
- Area: security
- Severity: medium
- Writes: `apps/web/app/api/media/image/generate/route.ts`, `apps/web/app/api/media/video/generate/route.ts`, `apps/web/app/api/media/video/status/route.ts`, `apps/web/app/api/llm/v1/embeddings/route.ts`, `apps/web/app/api/control-plane/status/route.ts`, `apps/web/scripts/test-llm-keys.ts`, `apps/web/lib/server/container-files.ts`, `apps/web/features/settings/components/CustomModelsSettings.tsx`, `apps/desktop/src/features/settings/CustomModelsSettings.tsx`, `apps/desktop/electron/config.ts`, `apps/desktop/vite.config.ts`, `apps/desktop/src-tauri/tauri.conf.json`, `apps/desktop/src/utils/security.ts`, `apps/desktop/src-tauri/src/core/agi/conversation_summarizer.rs`, `apps/desktop/src-tauri/src/integrations/api_integrations/perplexity.rs`, `apps/desktop/src-tauri/src/integrations/api_integrations/veo3.rs`, `apps/desktop/src-tauri/src/core/llm/web_search_config.rs`, `apps/cli/src/models/provider_dispatch.rs`, `apps/cli/src/voice.rs`
- Verify: `pnpm check:provider-contracts && cargo check --workspace`
- Evidence: `generativelanguage.googleapis.com` retyped in 6 files (`image/generate/route.ts:487,550`, `video/generate/route.ts:324`, `video/status/route.ts:218`, `embeddings/route.ts:132`, `control-plane/status/route.ts:54`, `test-llm-keys.ts:38`); `container-files.ts:88,99,117`; identical preset tables in the two `CustomModelsSettings.tsx`; `electron/config.ts:69` + `vite.config.ts:164` + `tauri.conf.json:37` + dead `security.ts:495–507` duplicate `GATEWAY_BASE_URL` (`apps/desktop/src/api/config.ts:19` says every module should import from there); `conversation_summarizer.rs:669,733`, `perplexity.rs:120`, `veo3.rs:85`, `web_search_config.rs:72` bypass `default_base_url()` (`core/llm/providers/direct_api_provider.rs:386–413`); `provider_dispatch.rs:638` duplicates `apps/cli/src/models/mod.rs:98`; `apps/cli/src/voice.rs:887` = `apps/desktop/src-tauri/src/sys/commands/voice.rs:522`.
- ⚠ Serial with #54, #55, #49, #50.

### 62. `vercel.json` `/v1/*` rewrites are inert and can silently diverge

- Status: todo
- Area: ops
- Severity: high
- Writes: `vercel.json`, `apps/web/next.config.ts`
- Verify: `curl -sI https://api.agiworkforce.com/v1/chat/completions | grep x-matched-path`
- Evidence: `vercel.json:13–39` duplicates rewrites Vercel ignores for Next.js projects (per `next.config.ts`'s own comment; verified 2026-07-17 that `/v1` served `/_not-found`). Same item fixes the advertised `api.agiworkforce.com` 307 that strips the host condition and lands on 404.
- ⚠ Serial with #1 (`next.config.ts`), #28 (`vercel.json`).

### 63. Second, uneligible routing engine and a drifted Rust Auto-router

- Status: todo
- Area: correctness
- Severity: high
- Writes: `packages/ui/unified-chat/src/lib/promptClassifier.ts`, `packages/ui/unified-chat/src/index.ts`, `crates/agiworkforce-model-registry/src/lib.rs`, `apps/web/shared/stores/model-store.ts`, `apps/cli/src/routing/classify.rs`
- Verify: `pnpm --filter @agiworkforce/unified-chat test promptClassifier && cargo test -p agiworkforce-model-registry auto_route_parity`
- Evidence: `promptClassifier.ts` hand-rolls its own taxonomy, a 4-chars/token estimator (canonical is 1/3.5 at `packages/ai/routing/src/classify.ts:109`) and slot map, imports nothing from `@agiworkforce/routing`, and `buildRoutingDecision` (`:432–446`, exported at `index.ts:63`) performs **zero** eligibility checks — delete it or route it through `resolveAutoRoute`; `crates/agiworkforce-model-registry/src/lib.rs:718` is the live CLI Auto decision path (called every turn from `apps/cli/src/agent/chat.rs:511`, **not** shadow-gated as AUTO-ROUTER-MIGRATION-01 claims) and is missing the `task_family_pareto` stage present at `packages/ai/routing/src/auto.ts:216–227,706,786`; `model-store.ts:83–107` reimplements `isDeprecated()` instead of importing it; `apps/cli/src/routing/classify.rs` needs a mechanical parity test, not a manual re-sync note.

### 64. Local-provider trust classification misses LM Studio, llama.cpp, vLLM

- Status: todo
- Area: security
- Severity: medium
- Writes: `packages/ai/model-registry/catalog/harnesses.json`, `packages/contracts/types/src/model-catalog.ts`
- Verify: `pnpm check:trust-boundaries` (new assertion: every runtime offered in `LocalRuntimeSettings.tsx` resolves to surface `local`)
- Evidence: only `ollama/chat` carries `trustModes: ['local']` in the generated registry, so `getProviderSurface('lmstudio')` returns `hidden` (`model-catalog.ts:1392–1403`) despite `apps/desktop/src/features/settings/tabs/ModelsKeys/LocalRuntimeSettings.tsx:28,41,49,57` shipping full UI for all three.

### 65. Remaining magic-number duplication

- Status: todo
- Area: ops
- Severity: medium
- Writes: `apps/desktop/src/stores/chat/chatStore.ts`, `apps/desktop/src/features/chat/CommandPalette.tsx`, `apps/desktop/src/features/mcp/MCPBundleBrowser.tsx`, `apps/mobile/stores/chat/chatViewStore.ts`, `packages/ui/unified-chat/src/components/library/LibraryView.tsx`, `apps/web/features/chat/components/dialogs/GlobalSearchDialog.tsx`, `apps/extension/src/webmcp.ts`, `apps/web/shared/lib/api.ts`, `apps/web/shared/lib/api-enhanced.ts`, `apps/web/app/api/chat/conversations/route.ts`, `apps/desktop/src/features/schedules/DesktopCloudSchedules.tsx`, `apps/web/features/schedules/components/SchedulesPage.tsx`, `apps/desktop/e2e/fixtures/mock-data.ts`
- Verify: `pnpm check:hardcoded-arrays && pnpm typecheck:all`
- Evidence: 300 ms debounce independently chosen in 7 files (`chatStore.ts:170`, `CommandPalette.tsx:218`, `MCPBundleBrowser.tsx:651`, `chatViewStore.ts:251`, `LibraryView.tsx:175`, `GlobalSearchDialog.tsx:167`, `webmcp.ts:377`); 3-attempt retry defaults (`api.ts:31`, `api-enhanced.ts:115`, +2); page size 50 in 6 places with `SCHEDULE_PAGE_SIZE=50`/`RUN_PAGE_SIZE=20` duplicated verbatim across desktop and web; `mock-data.ts:221–267` asserts a standalone pricing table where 3 of 5 model IDs (`gpt-5.5`, `deepseek-chat`, `qwen-max`) don't exist in the catalog.

### 66. 20 desktop feature directories are unreachable from the shell

- Status: todo
- Area: ux
- Severity: critical
- Writes: `apps/desktop/src/App.tsx`, `apps/desktop/src/routes/**`, or deletion of the dead trees (`mcp`, `git`, `dynamic-canvas`, `roi-dashboard`, `teams`, `reminders`, `analytics`, `notifications`, `file-upload`, `messaging`, `agent-collaboration`, `background-tasks`, `custom-instructions`, `document`, `editing`, `feedback`, `layout`, `media`, `outcomes`, `simple-mode`, `subscription`)
- Verify: `pnpm check:module-reachability && pnpm check:surface-reachability` (and wire the ratchet into CI)
- Evidence: 276 of 788 desktop renderer modules unreachable (35%); 537 modules / 94,513 LOC unreachable across all surfaces. Decide route-or-delete per directory; the orphan ratchet exists but does not run in CI.
- ⚠ Serial with #41.

---

## Wave 6 — Performance and scale

### 67. Time-to-first-token: ~37 strictly sequential round trips before the provider call

- Status: todo
- Area: perf
- Severity: critical
- Writes: `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts`
- Verify: `pnpm --filter @agiworkforce/web test request-processor` plus a TTFT measurement before/after
- Evidence: 22 awaits between `processRequest` (`:1308`) and the end of the function; `grep -c 'Promise.all'` on that file returns 0.
- ⚠ Serial with #56.

### 68. RLS adapter costs 6 Postgres round trips per user-scoped read

- Status: todo
- Area: perf
- Severity: critical
- Writes: `packages/platform/data-layer/src/adapters/neon.ts`
- Verify: `pnpm db:rls-probe && pnpm --filter @agiworkforce/data-layer test neon`
- Evidence: `neon.ts:279–315` (BEGIN, SET LOCAL ROLE, 2× `set_config`, query, COMMIT) repeated verbatim in `execute()` at `:325+`.

### 69. Streaming re-renders: markdown reparsed per token, whole transcript rebuilt per chunk

- Status: todo
- Area: perf
- Severity: critical
- Writes: `packages/ui/unified-chat/src/components/MarkdownContent.tsx`, `packages/ui/unified-chat/src/stores/chatStore.ts`
- Verify: `pnpm --filter @agiworkforce/unified-chat test MarkdownContent` (new: memoized) plus a main-thread profile of a 16k-char answer (currently 7.3 s)
- Evidence: `MarkdownContent` is a plain function component with no `React.memo`, calls `preprocessMath(content)` without `useMemo`, and reallocates all six plugin arrays each render; `appendToMessage` rebuilds the array via `messages.map(...)` per chunk.

### 70. Cloud sync uses one global sequence and unscoped indexes; history search is an unindexed ILIKE

- Status: todo
- Area: perf
- Severity: high
- Writes: `apps/web/db/neon/0106_sync_and_search_indexes.sql` (new), `apps/web/app/api/chat/search/route.ts`
- Verify: `pnpm check:neon-migrations && pnpm test:db-migrate`
- Evidence: `cloud_sync_version_seq` is one sequence for all users and tables with single-column `server_version` indexes and no user scoping; history search pulls the user's entire conversation-ID list with no LIMIT (≈180 KB of binds at 5,000 UUIDs) then runs `content ilike '%q%'` against `web_messages`.

### 71. Scheduled tasks execute at most 10× per day platform-wide

- Status: todo
- Area: ops
- Severity: critical
- Writes: `apps/web/app/api/cron/run-schedules/route.ts`
- Verify: `pnpm --filter @agiworkforce/web test run-schedules` (new: a backlog larger than the batch triggers self-requeue until drained)
- Evidence: `run-schedules/route.ts:19` claims `limit: 10` with no while-loop, self-requeue or continuation token; claim query orders by `next_execution_at asc`, so newer users starve; `MAX_BATCH_SIZE` is 100 and the caller passes 10.
- ⚠ Serial with #28 (`vercel.json` cadence — see §Founder for the plan constraint).

---

## Wave 7 — i18n

### 72. Shared UI package: 0 of 154 component files use i18n (binding constraint)

- Status: todo
- Area: ux
- Severity: high
- Writes: `packages/ui/ui/**`, `packages/ui/unified-chat/**`, `packages/ui/i18n/src/resources.ts`
- Verify: `pnpm check:i18n-parity && pnpm --filter @agiworkforce/unified-chat test`
- Evidence: `packages/ui/ui` (76 files) and `packages/ui/unified-chat` (222 files) both return 0 for `grep -rl useTranslation`; web and desktop consume this package, so it re-injects English into every surface. Do this before #73–#75.

### 73. Web i18n adoption, starting with device-auth, billing toasts and WebChatPage

- Status: todo
- Area: ux
- Severity: high
- Writes: `apps/web/app/auth/device/page.tsx`, `apps/web/features/billing/pages/BillingDashboard.tsx`, `apps/web/features/chat/pages/WebChatPage.tsx`, `packages/i18n/locales/**`
- Verify: `pnpm check:i18n-parity && pnpm --filter @agiworkforce/web test`
- Evidence: 7 of 760 non-test files under `apps/web/app` + `features` import `useTranslation`; `auth/device/page.tsx:217–311` is 100% literal English (the CLI/desktop pairing sign-in); `BillingDashboard.tsx:117,136` and 10+ other toasts are literals on the revenue path; `WebChatPage.tsx:3058,3061` still has raw `aria-label="Share conversation"` and `<span>Share</span>` inside an otherwise-wired file.

### 74. Desktop i18n adoption, starting with the first-run wizard

- Status: todo
- Area: ux
- Severity: high
- Writes: `apps/desktop/src/features/onboarding/OnboardingWizard.tsx`, `apps/desktop/src/features/settings/**`, `apps/desktop/src/features/chat/**`, and deletion of `apps/desktop/src/i18n/locales/**`
- Verify: `pnpm check:i18n-parity && pnpm --filter @agiworkforce/desktop test`
- Evidence: 22 of 790 files use `useTranslation`; `features/settings` 0/77, `features/chat` 0/9, `features/onboarding` 0/3; `OnboardingWizard.tsx:235–308` (Local/BYOK/Cloud trust-boundary explainer) is the first screen a new user sees; the 12 `apps/desktop/src/i18n/locales/*/models.json` model-label maps are confirmed dead ("unloaded legacy copy", `apps/desktop/src/i18n/__tests__/v3CorpusCoverage.test.ts:1–7`).

### 75. Mobile i18n adoption, starting with Cloud sign-in

- Status: todo
- Area: ux
- Severity: medium
- Writes: `apps/mobile/app/(auth)/login.tsx`, `apps/mobile/src/features/**`
- Verify: `pnpm check:i18n-parity && pnpm --filter @agiworkforce/mobile test`
- Evidence: only the two language-picker settings screens use the working i18next/MMKV/RTL plumbing; `login.tsx:83,111,114` are literals.

### 76. Chrome extension has no i18n infrastructure at all

- Status: todo
- Area: ux
- Severity: high
- Writes: `apps/extension/_locales/en/messages.json` (new), `apps/extension/manifest.json`, `apps/extension/src/side_panel.ts`, `apps/extension/src/background.ts`
- Verify: `pnpm --filter @agiworkforce/extension test i18n` (new: no bare `.textContent =` string literal in user-facing paths)
- Evidence: zero `chrome.i18n.getMessage` calls, no `_locales/`, no `default_locale`; `side_panel.ts` (9,359 lines) builds its DOM via `.textContent` (`:4972`, `:6458`, `:6797`); `background.ts:4541–4549` hardcodes every context-menu title.
- ⚠ Serial with #8, #9, #49, #50.

### 77. VS Code extension and CLI TUI have no i18n infrastructure

- Status: todo
- Area: ux
- Severity: high
- Writes: `apps/extension-vscode/package.nls.json` (new), `apps/extension-vscode/src/**`, `apps/cli/Cargo.toml`, `apps/cli/src/tui/widgets/**`, `apps/cli/locales/**` (new)
- Verify: `pnpm --filter agi-workforce test && cargo test -p agiworkforce-cli --lib tui`
- Evidence: zero hits for `useTranslation`/`vscode-nls`/`vscode.l10n` in `apps/extension-vscode/src`; no i18n/l10n crate in `Cargo.lock`; `apps/cli/src/tui/widgets/{command_popup,agent_picker}.rs` bake box-drawing headers, hint bars and empty states into render functions.

### 78. Guardrails currently failing: i18n key parity and mobile hex colors

- Status: todo
- Area: ci
- Severity: medium
- Writes: `packages/i18n/locales/{zh,ru,pt,ko,ja,it,fr,de,ar,hi,es}/**`, `apps/mobile/src/components/AgiMark.tsx`, `apps/mobile/src/features/chat/components/WebSearchResultCard.tsx`, `apps/mobile/src/components/MathBlock.tsx`, `apps/mobile/src/lib/sandboxedArtifactHtml.ts`, `apps/mobile/src/lib/syntaxHighlight.ts`, `apps/mobile/src/features/connectors/AddCustomConnectorModal.tsx`
- Verify: `pnpm check:i18n-parity && pnpm check:no-hex-mobile` (both must exit 0)
- Evidence: parity fails live with 2,075 findings (pricing.json 1,120, v3.json 418, auth.json 220, common.json 207, models.json 80, chat.json 10); hex check fails with exactly 15 findings at `AgiMark.tsx:17`, `WebSearchResultCard.tsx:7,68`, `MathBlock.tsx:269`, `sandboxedArtifactHtml.ts:22,51`, `syntaxHighlight.ts:295`, `AddCustomConnectorModal.tsx:194,230`.

---

## Wave 8 — Compliance, verification, growth

### 79. GDPR e2e suite skips itself into a green run

- Status: todo
- Area: ci
- Severity: high
- Writes: `apps/desktop/e2e/gdpr.spec.ts`
- Verify: `pnpm --filter @agiworkforce/desktop test:e2e gdpr` — zero skipped tests
- Evidence: 15 tests, 38 `test.skip(!<feature is visible>, ...)` calls; six are tautologies where the guard is followed by an assertion of the same predicate; two `beforeEach` hooks skip whole describes if the settings panel fails to open.

### 80. Signup → checkout → entitlement has zero end-to-end coverage

- Status: todo
- Area: billing
- Severity: critical
- Writes: `apps/web/e2e/checkout.spec.ts` (new), `apps/web/app/api/stripe-webhook/lib/__tests__/route.test.ts` (new)
- Verify: `pnpm --filter @agiworkforce/web test:e2e checkout`
- Evidence: zero E2E files on any surface mention checkout or Stripe; `stripe-webhook/route.ts` has no colocated test. This is the class of defect that produced #25.

### 81. No load, stress or soak testing exists

- Status: todo
- Area: ci
- Severity: critical
- Writes: `tools/load/` (new), `.github/workflows/load.yml` (new)
- Verify: `pnpm exec k6 run tools/load/streaming-chat.js` producing p95 TTFT, max concurrent streams, and Neon connection ceiling
- Evidence: no k6/artillery/autocannon/locust/JMeter/gatling/vegeta, no Lighthouse CI, no web-vitals, no `perf` script anywhere.

### 82. Nothing can page a human

- Status: todo
- Area: ops
- Severity: critical
- Writes: `apps/web/app/api/cron/health-probe/route.ts` (new), `vercel.json`, `docs/runbooks/incident-response.md` (new)
- Verify: force `/api/health` to fail in preview and confirm the alert fires
- Evidence: no PagerDuty/Opsgenie/Alertmanager/alert webhook anywhere in apps, services, infrastructure, scripts or workflows; `/api/health` is correct and nothing calls it on a schedule; the 8 declared crons don't probe it. The four `*RUNBOOK*` files are all about app-store publishing.
- ⚠ Serial with #28, #62 (`vercel.json`); vendor choice is in §Founder.

### 83. No AI output quality evals

- Status: todo
- Area: security
- Severity: critical
- Writes: `tools/evals/` (new), `.github/workflows/evals.yml` (new)
- Verify: `pnpm exec vitest run tools/evals` with a grader, golden outputs, refusal set and a jailbreak corpus
- Evidence: of 1,746 test files none measures answer quality; the 5 live-model tests are gated off and run in none of the 17 CI workflows.

### 84. Zero funnel instrumentation and no value-first path

- Status: todo
- Area: data
- Severity: critical
- Writes: `apps/web/app/layout.tsx`, `apps/web/lib/analytics/events.ts` (new), `apps/web/app/(marketing)/**`, `apps/web/app/api/chat/guest/route.ts` (new)
- Verify: `pnpm --filter @agiworkforce/web test analytics` (new: activation/conversion/retention events emitted) and an anonymous visitor can send one message without an account
- Evidence: `rg -c "gtag('event'"` across `apps/web` returns 0 files; GA is not mounted until analytics cookies are accepted (default off); no PostHog/Mixpanel/Amplitude/Segment; every acquisition CTA routes to `/login` and the auth gate returns 401 with no guest branch.

### 85. EU AI Act Article 50 disclosure is wired on one surface of six

- Status: todo
- Area: legal
- Severity: critical
- Writes: `packages/compliance/ai-act/**`, `apps/web/**` (chat + media generation), `apps/desktop/src/**`, `apps/web/app/api/media/**` (server-side provenance marker)
- Verify: `pnpm --filter @agiworkforce/web test ai-act` (new: every generated image/video carries a provenance marker and every chat entry point discloses AI interaction)
- Evidence: a 939-line Article 50 package is imported only by mobile, backed by device-local storage a reinstall erases, with zero server-side enforcement; web and desktop generate images and video with no disclosure or marker. Applicable since 2026-08-02; EU users since 2026-06-27.

### 86. No record that any user accepted the terms

- Status: todo
- Area: legal
- Severity: critical
- Writes: `apps/web/db/neon/0107_terms_acceptance.sql` (new), `apps/web/app/(auth)/sign-up/**`, `apps/web/lib/server/terms.ts` (new)
- Verify: `pnpm check:neon-migrations && pnpm --filter @agiworkforce/web test terms-acceptance`
- Evidence: no clickwrap at signup and no `terms_accepted` column anywhere; without proof of assent the arbitration clause, class-action waiver and liability cap are unenforceable.

### 87. Restored data is not re-erased; no suppression/tombstone list

- Status: todo
- Area: legal
- Severity: critical
- Writes: `apps/web/db/neon/0108_erasure_tombstones.sql` (new), `apps/web/app/api/cron/purge-deleted-accounts/route.ts`, `apps/web/lib/server/account-erasure.ts`
- Verify: `pnpm --filter @agiworkforce/web test purge-deleted-accounts` (new: a resurrected profile whose deletion timestamp is in the past is re-erased on the next run)
- Evidence: the published DPA promises restored data is re-subjected to erasure, but the cron selects only profiles whose deletion timestamp has already passed, and a PITR restore to before the request resurrects the account permanently.
- ⚠ Serial with #30 (`account-erasure.ts`).

### 88. Ciphertext envelopes carry no key id or version

- Status: todo
- Area: security
- Severity: critical
- Writes: `apps/web/lib/crypto/envelope.ts`, `apps/web/db/neon/0109_key_version.sql` (new), `scripts/reencrypt.mjs` (new), `docs/security/key-rotation.md` (new)
- Verify: `pnpm --filter @agiworkforce/web test envelope` (new: decrypt resolves by embedded key version; the re-encryption script is idempotent)
- Evidence: zero key-id/version byte in any envelope and zero `key_version` column across 98 migrations; no re-encryption script, no rotation runbook, no `docs/security/` directory. Rotating any of the five AES-256-GCM keys today silently invalidates every ciphertext (forcing a mass revoke of every Google/Slack connector grant). Vault/KMS decision is in §Founder.

### 89. Uploaded and generated files live at permanent unauthenticated URLs

- Status: todo
- Area: data
- Severity: critical
- Writes: `apps/web/lib/server/blob.ts`, `apps/web/app/api/files/[id]/route.ts`, `apps/web/app/api/uploads/presign/route.ts`
- Verify: `pnpm --filter @agiworkforce/web test files` (new: object URLs are signed and expire; the ownership check is load-bearing)
- Evidence: the privacy policy itself states in bold that anyone with the link can open the file without signing in, which makes the ownership check decorative for any URL that has left the app.
- ⚠ Serial with #19 (`presign/route.ts`).

### 90. Provider suspension is not failover-eligible

- Status: todo
- Area: ops
- Severity: critical
- Writes: `packages/ai/provider-runtime/src/failover.ts`, `services/api-gateway/src/routes/llm.ts`
- Verify: `pnpm --filter @agiworkforce/provider-runtime test failover` (new: a 401 classified `auth` rotates to the next provider instead of hard-failing)
- Evidence: the rotator fires on connection/server/overload/capacity/timeout/rate-limit and explicitly excludes credential failures; web offers no BYOK escape hatch either.
- ⚠ Serial with #20, #21.

### 91. Deep links: three claimed Universal Link paths 404, Android claims the whole domain, push is broken

- Status: todo
- Area: mobile
- Severity: critical
- Writes: `apps/web/app/.well-known/apple-app-site-association/route.ts`, `apps/web/app/pair/**` (new), `apps/mobile/app.json`, `apps/mobile/app/_layout.tsx`, `apps/web/app/api/notifications/send/route.ts`
- Verify: `pnpm --filter @agiworkforce/web test deep-links` (new: every claimed path resolves 200) and `pnpm --filter @agiworkforce/mobile test notifications`
- Evidence: all three claimed Universal Link paths 404 on web and the in-app pairing handler is gated on a value hardcoded `null`, so both branches of every email/QR CTA are dead while a CI job certifies the association documents; Android `autoVerify` has no path filter, so marketing/pricing/blog links open the app into a dead end; one server-side sender covers eleven client event types, the only opt-in toggle lives on web (a mobile-only user can never receive a notification although iOS spends its one-shot prompt), and there is no `google-services.json`.

### 92. Undisclosed subprocessor and stale store listings

- Status: todo
- Area: legal
- Severity: critical
- Writes: `apps/web/app/legal/subprocessors/page.tsx`, `docs/store/app-store-listing.md`, `apps/web/lib/__tests__/public-billing-copy.test.ts`
- Verify: `pnpm --filter @agiworkforce/web test public-billing-copy` (new: the markdown listing is parsed and asserted, not just the two JSON files)
- Evidence: every push notification body (containing user scheduled-task names) is relayed through Expo and every launch calls Expo's update endpoint, yet Expo is absent from a subprocessors page whose own header says omitting a live processor "is a compliance defect, not a documentation gap"; the human-readable listing still prints "Hobby — $5/mo" and advertises BYOK and computer-use behind flags hardcoded `false`.

### 93. Platform moderation is seven opt-in regexes

- Status: todo
- Area: security
- Severity: high
- Writes: `apps/web/lib/moderation/**`, `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts`, `apps/web/app/api/uploads/**`
- Verify: `pnpm --filter @agiworkforce/web test moderation` (new: server-side classifier runs regardless of the user setting; uploads hash-matched)
- Evidence: no server-side classifier, no image/PDF content scanning beyond active-content checks, no hash matching, no illegal-content reporting pipeline; the only platform filter is a keyword list the user must opt into under Settings → Safety.
- ⚠ Serial with #67.

### 94. Plugin marketplace 503s on an unapplied migration

- Status: todo
- Area: data
- Severity: high
- Writes: `apps/web/app/plugins/page.tsx`, `apps/web/db/neon/0096_plugin_registry.sql`
- Verify: `pnpm db:migrate && curl -s https://agiworkforce.com/plugins | grep -v 'temporarily unreachable'`
- Evidence: Postgres `42P01 undefined_table` because `0096_plugin_registry.sql` was never applied to production; even restored, no third party can publish a pack — the page admits every entry is a declared pack with no artifact.

### 95. No down-migrations across 98 migrations

- Status: todo
- Area: data
- Severity: critical
- Writes: `apps/web/db/neon/**`, `scripts/check-neon-migrations.mjs`
- Verify: `pnpm check:neon-migrations` (new rule: every new migration ships a paired down script) `&& pnpm test:db-migrate`
- Evidence: 98 migrations, zero reversals — paired with #4, this is why a bad deploy has no exit.

### 96. Developer API is unusable as documented

- Status: todo
- Area: correctness
- Severity: high
- Writes: `apps/web/public/openapi.json`, `apps/web/app/api/llm/v1/**`, `docs/api/rate-limits.md` (new)
- Verify: `curl -s https://api.agiworkforce.com/v1/models -H "Authorization: Bearer $KEY"` returns 200
- Evidence: the advertised host 307s to the apex and lands on 404 (see #62); only `https://agiworkforce.com/api/llm/v1/chat/completions` works; no SDK, no webhooks, no Files or Conversations API, 3 scopes, no published rate-limit table.
- ⚠ Serial with #62.

### 97. Voice/TTS has no catalog routing slot; mobile and desktop fight over `language.locale`

- Status: todo
- Area: ux
- Severity: high
- Writes: `packages/contracts/types/src/model-catalog.ts`, `apps/desktop/src-tauri/src/features/speech/tts.rs`, `apps/mobile/services/cloudSettingsMapping.ts`, `apps/desktop/src/services/managedCloudSettingsSync.ts`
- Verify: `pnpm check:model-catalog && pnpm --filter @agiworkforce/mobile test cloudSettingsMapping`
- Evidence: `model-catalog.ts:989, 1029–1030, 1980` defines only `voice_transcription` and `voice_rewrite` — no synthesis slot, so TTS model selection sits outside catalog governance (the acute `eleven_monolingual_v1` regression is fixed at `tts.rs:120` with a guard test at `:691–710`, the architectural gap is not); `apps/mobile/services/cloudSettingsMapping.ts:175,251` binds `language.locale` to TTS voice language while `apps/desktop/src/services/managedCloudSettingsSync.ts:465,509–512` binds the same synced key to `i18n.changeLanguage`, so each surface silently reconfigures the other every sync cycle.

### 98. Shared UI hand-parses desktop's private storage to pick a trust label

- Status: todo
- Area: security
- Severity: high
- Writes: `packages/ui/unified-chat/src/components/ModelSelector.tsx`, `packages/client/client-runtime/src/mode.ts` (new)
- Verify: `pnpm --filter @agiworkforce/unified-chat test ModelSelector` (new: a missing `app-mode-store` key must not fall back to the cloud catalog while in Local mode)
- Evidence: `ModelSelector.tsx:158` reaches across the package boundary into `localStorage['app-mode-store']`, a key owned by desktop and retyped a third time in its priming guard; desktop's own comment documents the wrong-catalog fallback.
- ⚠ Serial with #72.

### 99. Z-index scale is defined and never used

- Status: todo
- Area: ux
- Severity: high
- Writes: `apps/web/app/globals.css`, `apps/web/shared/lib/design-tokens.ts`, `packages/ui/ui/src/{select,dropdown-menu,context-menu,menubar,hover-card,tooltip,sheet,drawer}.tsx`
- Verify: `pnpm check:css-tokens` (new rule: no raw `z-index` literal in component source)
- Evidence: `apps/web/shared/lib/design-tokens.ts:136–150` exports a `zIndex` scale with no matching `--z-*` block in `globals.css`; eight overlay components each hardcode their own, one gallery component hardcodes six.
- ⚠ Serial with #72.

---

## Write collisions — these pairs must run serially

| File                                                                   | Items              | Order                               |
| ---------------------------------------------------------------------- | ------------------ | ----------------------------------- |
| `.github/workflows/ci.yml`                                             | #3, #5             | #3 then #5                          |
| `apps/web/next.config.ts`                                              | #1, #62            | #1 then #62                         |
| `vercel.json`                                                          | #28, #62, #82      | #28 → #62 → #82                     |
| `services/api-gateway/src/services/managedUsageBilling.ts`             | #20, #21, #33, #90 | #20 → #21 → #33 → #90               |
| `apps/web/lib/cost-tracker.ts`                                         | #33 only (merged)  | —                                   |
| `packages/contracts/types/src/billing-catalog.ts`                      | #28, #29           | #28 then #29                        |
| `apps/web/.env.example`                                                | #23, #24           | #23 then #24                        |
| `apps/web/app/api/stripe-webhook/lib/*`                                | #25, #26           | #25 then #26                        |
| `apps/web/lib/server/account-erasure.ts`                               | #30, #87           | #30 then #87                        |
| `apps/web/app/api/uploads/presign/route.ts`                            | #19, #89           | #19 then #89                        |
| `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts`    | #56, #67, #93      | #67 → #56 → #93                     |
| `apps/extension/src/background.ts` + `background/policy.ts`            | #8, #9, #76        | #8 → #9 → #76                       |
| `apps/extension/src/side_panel.ts`                                     | #49, #50, #76      | #50 → #49 → #76                     |
| `apps/desktop/src-tauri/src/sys/security/tool_guard.rs`                | #14, #46           | #14 then #46                        |
| `apps/desktop/src-tauri/.../image_gen.rs`, `perplexity.rs`, `voice.rs` | #54, #55, #61      | #54 → #55 → #61                     |
| `apps/desktop/src/stores/settingsStore.ts`                             | #56, #59           | #59 then #56                        |
| `apps/desktop/src/utils/ipc.ts`                                        | #45, #57           | #45 then #57                        |
| `apps/desktop/src/api/embeddings.ts`                                   | #50, #57           | #50 then #57                        |
| `apps/cli/src/voice.rs`                                                | #55, #61           | #55 then #61                        |
| `apps/web/scripts/test-llm-keys.ts`                                    | #55, #61           | #55 then #61                        |
| `packages/ui/**`                                                       | #72, #98, #99      | #72 first, then #98/#99 in parallel |
| desktop feature dirs (`roi-dashboard`, `dynamic-canvas`, …)            | #41, #66           | decide #66 (route-or-delete) first  |

Everything not listed here has a disjoint Writes set and may run in parallel within its wave.

---

## Founder or dashboard actions — not code work

These block or gate code items but cannot be closed by a commit.

1. **Vercel plan.** Hobby costs instant rollback, spend caps, an SLA, and sub-daily cron; it is why #71 exists and why sandboxes bill up to 24 h before reclamation. Upgrading is the precondition for #28/#71 landing as a cadence change rather than a requeue hack. (Reminder: a sub-daily cron in `vercel.json` on Hobby silently kills every deploy.)
2. **Publishing credentials.** The GitHub org has two Actions secrets (both Tauri signing), zero Actions variables, and none of the four publishing environments the release workflows require. Five of six surfaces are structurally incapable of reaching a user. The only desktop release tag says "defer macos to v1.2.1 — apple\_\* signing secrets not configured" (2026-05-04); 532 desktop commits have landed since. Buy the $99 Apple Developer account, create the four environments.
3. **Desktop release manifests.** All four (`darwin-aarch64`, `darwin-x86_64`, `windows-x86_64`, `linux-x86_64`) 404 and `/api/releases/desktop-cloud/latest` returns "No cloud build" — 739 Rust files and 1,309 Tauri commands are unreachable by any user. Depends on item 2.
4. **Tauri signing key custody.** `TAURI_SIGNING_PRIVATE_KEY`'s public half is baked into every shipped binary; the private half exists only as a single unbackupable CI secret. Losing it bricks auto-update for every install; leaking it lets an attacker sign updates every install accepts. Escrow it.
5. **KMS / key escrow decision.** Five AES-256-GCM keys live only as env vars with no KMS, escrow, or rotation. A DB restore without those exact bytes makes 2FA secrets, connector tokens and device tokens permanently undecryptable. This decision gates #88.
6. **Backup and restore policy.** Recovery relies on an undocumented Neon PITR window plus an object bucket with zero versioning and zero lifecycle config, from which the media purge cron issues unconditional hard deletes; DB and object store have independent recovery points, so a restore yields rows pointing at deleted objects. Set the PITR window, enable bucket versioning, document both.
7. **Stripe dashboard preconditions for `automatic_tax`.** Enable Stripe Tax, set the origin address, set `tax_behavior` per Price, register per jurisdiction. `automatic_tax: { enabled: true }` at `apps/web/app/api/checkout/route.ts:332` silently returns 0% and under-collects VAT until these exist. Nothing in the repo can check them.
8. **Alerting vendor.** Pick PagerDuty/Opsgenie/BetterStack and provision the on-call rotation; #82 wires the probe but has nothing to page.
9. **App Store / Play privacy declarations.** Both currently declare email+name only and "shares nothing" while the published subprocessors page names Anthropic, OpenAI, Google, xAI and DeepSeek and the cloud path uploads whole conversations. Correct the labels; #92 fixes the repo-side listing.
10. **GDPR Art. 27 EU representative.** `/legal/eu-representative` states in the company's own words that the obligation "is live and unmet." Appoint one.
11. **Repository visibility.** `siddharthanagula3/agiworkforce` is public, so every unpatched finding in this queue — #6, #10, #17, #20 — is readable with exact file and line. Make it private until Wave 1 and Wave 2 land.
12. **Account custody.** Every account, signing certificate, store identity and the git origin sit under one personal handle, hardcoded as the production download default (`apps/web/app/api/download/route.ts:20–21, 31` — fix the hardcoding as part of #24; the ownership transfer is yours). Nothing in the repo describes who else can reach them.
13. **"Code" and Connectors: ship or de-list.** `/code` is in the signed-in nav with a live "New session" button while all four API routes return 503; the catalog advertises 89 integrations while Settings renders all 84 non-exclusive ones as "Coming soon" with no Connect button (`oauth-registry.ts:9`: "SHIPS WITH ZERO PROVIDERS ON PURPOSE") and the public directory POST returns 501. Either provision the backends/OAuth apps or remove the nav entries — this is a product decision, not a patch.
14. **Effort allocation.** 41% of the codebase is a desktop app (including an IMAP/SMTP client and an ROI dashboard) that no user can download; lifetime downloads across every public release are 45, with 0 stars/forks/watchers and Web Analytics not enabled. Items 2, 3 and #84 are the cheapest paths to a first real user.

---

## Closed — do not re-report

| Finding                                             | Why it is closed                                                                                                                                                                                                                                                                |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tiers-openapi-seats-minimum-stale`                 | Fixed on `chore/retire-stale-docs` by `6804e8096`; `apps/web/public/openapi.json` now reads `"minimum": 2` and the test asserts `MIN_PURCHASABLE_SEATS` instead of the literal. (Absent on `fix/codeql-high-severity-batch-1`, which never carried `7611c622b`'s billing work.) |
| `tiers-checkout-positive-control`                   | Positive control, not a defect. `apps/web/lib/validations/checkout.ts:3,25,69` correctly imports `MIN_PURCHASABLE_SEATS`.                                                                                                                                                       |
| `tokens-context-monitor-positive-control`           | Positive control, not a defect. `apps/desktop/src-tauri/src/sys/commands/chat/context_monitor.rs:44–46` documents `DEFAULT_CONTEXT_WINDOW = 128_000` as a conservative fallback for uncatalogued BYOK/local models — the pattern the other token findings should copy.          |
| `priorart-ext-onboarding-slash-finder-unbuilt`      | Fixed. `apps/extension/src/side_panel.ts:4768–4786` now points at Workflows; the "Type / in the chat" copy is gone. Matches `docs/agent-context/known-flaws.md:1127–1131`.                                                                                                      |
| `priorart-mobile-connectors-route-theater-resolved` | Fixed 2026-07-11 and verified no regression: `apps/mobile/src/features/settings/cloud-connectors/index.tsx` calls `fetchConnectorDirectory()` against `GET /api/connectors`; no hardcoded catalog remains.                                                                      |

Corrections carried into the items above, so they are not re-litigated: the decimal-IP SSRF bypass in #14 is not real (the `url` crate canonicalizes first); the "enforced ceiling of 25" in #48 does not exist; the Rust Auto-router in #63 is **not** shadow-gated (it is the live CLI path, so the drift is worse than reported); `WebChatPage.tsx` has 9 real `t()` calls, not 54; `mock-data.ts` has 3 nonexistent model IDs, not 2; `LOCAL_PROVIDER_IDS` is derived, not a literal array — the bug is an incomplete harness registry.

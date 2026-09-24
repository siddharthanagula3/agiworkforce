# Enterprise checklist completion plan

Status: Historical planning snapshot; superseded for product sequencing and Desktop scope
Owner: Repository maintainers
Last updated: 2026-09-22

This plan preserves the September 16 interpretation of the enterprise audit.
The September 21 product rebaseline supersedes its all-at-once sequencing and
its proposal to ship Tauri as a second public Desktop. Current work proceeds
Web first, then Mobile/Desktop, Chrome, and CLI/VS Code; Electron is the public
Desktop and retained Tauri code is internal. The row evidence below remains a
dated input and must be re-verified before implementation.

## Context

On 2026-09-16 the founder's 131-section enterprise build specification (2,097 items) was filled against the code and
verified three times: code audit, independent re-judgment of every row, and a ships-and-runs pass (production env var
names, CI gating, releases, the live site).

| Verified state                                 | Items                                                                    |
| ---------------------------------------------- | ------------------------------------------------------------------------ |
| Done on main                                   | 1,258, of which **321 not live** (in no release or deployment users run) |
| Partial                                        | 456                                                                      |
| Missing                                        | 360                                                                      |
| External / N/A                                 | 23                                                                       |
| **Open work** (not Done, or Done but not live) | **1,125 rows**                                                           |

The founder asked for a plan to finish **all** of it. Decisions already taken with the founder:

1. External scope **in full now**: SOC 2 Type I then II, ISO 27001, third-party pen test, EU data residency.
2. Electron `shell_run`: **sandbox it**.
3. Viewer role: **enforce read-only**.
4. Desktop: **ship both** (Electron = Cloud desktop, Tauri = Local desktop), with Tauri moved onto the shared
   CLI app-server runtime so there is one coding product.

Outcome: every one of the 2,097 rows Done **and live** (HIPAA/BAA stays N/A unless PHI is offered), §127/§128/§131
passing, the §130 enterprise smoke test automated and green, confirmed by a fourth full verification.

## Facts this plan is built on (measured 2026-09-16)

- **Production web is not failing, it is stuck.** Deploy run 34549878676 (2026-09-11) has waited for `production-web`
  approval ever since; the `production-surfaces` concurrency group queues behind it, so every newer run is cancelled
  with zero jobs. Two August runs (31290571636, 31283553796) still show in progress. ~1,000 commits and ~390 web
  commits are undeployed.
- **Releases are blocked by missing GitHub configuration, not code.** Versions in source already match every
  workflow's tag check (CLI 1.7.1, desktop 1.2.0, VS Code 0.3.0, Chrome 1.2.0, mobile 1.2.0). Missing: environments
  `macos-release`, `vscode-marketplace`, `chrome-web-store`, `mobile-store-release`, `production-fly`; **zero** repo
  variables (Azure signing ×3, Clerk/Chrome ×4, Railway URL); repo secrets unreadable with the current token.
- **CI is red 44% of the time** (4 of the last 9 `ci.yml` runs), ~40 min per run: roughly 1.8 runs and 70 CI minutes
  per landing. `main` has no branch protection; most guards run in a workflow nothing waits on.
- **Throughput and rework (git history, last 14 days):** ~187 commits/day from 3–6 concurrent sessions; 2.3 fix commits
  per feat; a wiring fix is 1 commit (<150 lines); an isolated feature 1 feat + 2–5 fixes over 1–3 days; a cross-surface
  subsystem 10–50 commits over 3–13 days with ~20 follow-ups when it touches protocol or auth.
- **Production configuration lacks** Sentry DSN, OTel endpoint, VAPID keys, any email provider, `AGI_AUTH_PROVIDERS`,
  and routing canary; the Web v1 support widget is intentionally out of launch scope. The Remote Control relay host `signaling.agiworkforce.com` returns
  DEPLOYMENT_NOT_FOUND while the Fly app is healthy.

## Ledger and tracking (set up on day 1)

- The verified ledger lives outside the repo so it survives sessions without tripping the artifact guards:
  `~/.claude/projects/-Users-siddhartha-Desktop-agiworkforce/ledger/enterprise-checklist-ledger.json`, with
  `ledger.py` (`python3 ledger.py check` fails if any open row lacks a lane or acceptance; `assign` fills defaults),
  the page source and the production probe notes. The Markdown view is
  `docs/work/enterprise-master-build-checklist-2026-09-16.md`.
- Add to every open row: `lane`, `wave`, `owner`, `size` (wiring / feature / subsystem / config / external),
  `depends_on`, `acceptance` (one sentence). A small script regenerates the Markdown and the artifact
  (https://claude.ai/artifact/3oUD8mmbcLbQvvn6H8rSK5) from the JSON and **fails if any open row lacks a lane or
  acceptance**. That closes the coverage holes found while reviewing the first draft (§4 trust modes, §46 model
  registry fields, §83 memory backend had no home).
- Weekly founder report: rows closed by wave, rows newly opened, blockers waiting on the founder, CI red rate,
  deploy/release status per surface.

## Definition of done per row

1. Implemented in the production path and reachable by its user, with the AGENTS.md §0 baseline where it applies.
2. Proven by a test in a **required** CI check (after Wave 1).
3. **Live**: deployed (web) or in a published release, with production config present.
4. Re-verified by an agent that did not build it: falsify-Done question, ships lens, citation check. Then the ledger
   row updates.

## Operating model

- Fable leads, splits work and reviews every UI change before commit; Opus implements security-sensitive,
  cross-surface and multi-file work; Sonnet explores, verifies, drives browsers, makes mechanical edits. Agent
  teams only, no Workflow runs.
- Capacity on the 16 GB laptop: 4 implementers + 1 verifier at a time, one Playwright driver, no parallel test suites.
  Heavy suites run in CI.
- Shared-checkout discipline: pathspec commits, no stash or amend, lowercase subjects without trailers, push a
  reviewed sha, ratchet guards before each commit, web typecheck with the raised heap.
- Every lane starts with a one-page design brief reviewed by Fable before implementation; subsystems in Wave 4 also
  get an Opus design review for reuse and risk.

## Wave 0 - Unblock (days 1–3)

### Founder actions (engineering prepares exact click-paths)

| #   | Action                                                                                                                                                                                                                                                     | Unblocks                                   |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| F1  | Cancel run 34549878676 and August runs 31290571636, 31283553796; approve the next `deploy-production` run for the reviewed sha                                                                                                                             | ~390 web commits live                      |
| F2  | Confirm migrations 0183–0193 applied in production, or approve applying them before F1                                                                                                                                                                     | 7 sign-in/deprovision rows, project memory |
| F3  | Run `gh secret list` with admin rights (or grant the token) so secrets can be audited                                                                                                                                                                      | every release                              |
| F4  | Create environments `macos-release`, `vscode-marketplace`, `chrome-web-store`, `mobile-store-release`, `production-fly` and allow their tag patterns                                                                                                       | desktop, extensions, mobile, relay         |
| F5  | Apple Developer: certificate + password, App Store Connect API key (id, issuer, private key)                                                                                                                                                               | Electron + Tauri macOS, iOS                |
| F6  | Windows signing: Azure Artifact Signing endpoint/account/profile vars + client secret/tenant                                                                                                                                                               | Windows desktop                            |
| F7  | VS Code Marketplace publisher + Entra OIDC client/tenant vars; Open VSX token                                                                                                                                                                              | §119, §34                                  |
| F8  | Chrome Web Store publisher id, extension id, GCP workload identity provider, service account; Clerk vars for the extension build                                                                                                                           | §119, §35                                  |
| F9  | Expo token, ASC key, Google Play service account, Android app-links fingerprints                                                                                                                                                                           | §118, §94                                  |
| F10 | npm token for `@agiworkforce/cli`; Homebrew tap write access                                                                                                                                                                                               | §33, §127 broken updates                   |
| F11 | Relay: point `signaling.agiworkforce.com` at the Fly app or set `RAILWAY_PUBLIC_URL`/`RAILWAY_TOKEN`                                                                                                                                                       | §39, §40, §127 sync                        |
| F12 | Production env: Sentry DSN, OTel endpoint, VAPID keys, email provider key + from address, `AGI_AUTH_PROVIDERS` with Apple and Microsoft Clerk connections, `SIGNALING_HTTP_URL`, `PAGER_WEBHOOK_URL`; confirm that `contact@agiworkforce.com` is monitored | §55, §84, §86, §88, §91, §114              |
| F13 | Enable branch protection on `main` (after Wave 1 CI stabilization)                                                                                                                                                                                         | §0, §106                                   |
| F14 | QA enterprise tenant: Clerk org with test SAML/OIDC IdP, SCIM token, CI-usable QA sign-in credential                                                                                                                                                       | authenticated E2E in CI, §130              |
| F15 | Vendor contracts and budget: SOC 2 auditor + compliance automation platform, ISO 27001 body, pen-test firm, paging vendor, product analytics vendor, KMS (AWS/GCP), EU hosting (Neon EU project, R2 EU jurisdiction bucket)                                | Waves 4–6                                  |
| F16 | Product decisions: Web Remote controller (§2/§39 currently N/A), Primary Owner semantics (§58), trial length and plans (§70)                                                                                                                               | respective rows                            |

### Engineering in parallel

- Persist and extend the ledger (above); write the regeneration + coverage script.
- Prepare release runbooks per workflow with the exact tag to push (`v-cli-1.7.1`, `v-cloud-desktop-1.2.x`,
  `v-desktop-1.2.1` after a version bump in package.json, tauri.conf.json and Cargo.toml, `v-vscode-0.3.0`,
  `v-ext-1.2.0`, `v-mobile-1.2.0`).
- Add apps/extension-vscode CHANGELOG.md and stop `.vscodeignore:54` excluding it.

## Wave 1 - Ship everything built, stabilise CI, close launch blockers (weeks 1–2)

1. **Stabilise CI before making it required:** triage the last 20 red `ci.yml` runs by failing job, fix flakes at the
   root (memory: load-induced timeouts, affected-scope skips, tree-measuring tests), target <10% red over 30 runs.
   Then F13 branch protection requiring `ci.yml` and a required job running `check:llm-operability`; add
   `prettier --check`.
2. **Deploy web** (F1, F2) and verify: `/api/health`, migration-state record, signed-in smoke on production.
3. **Release every surface** through the existing workflows as F3–F11 land: CLI (npm + Homebrew), Electron (macOS
   signed + notarized, Windows, Linux), Tauri (1.2.1 incl. macOS and Windows via `build-windows-release.yml`),
   VS Code (Marketplace + Open VSX), Chrome (store), mobile (TestFlight/Play internal, then review and phased release).
4. **Security blockers (Opus):**
   - `shell_run` in Electron routed through `crates/agiworkforce-sandbox-policy` exactly as the CLI's sandboxed bash,
     with approval and an explicit unsandboxed override prompt.
   - Fail closed in `apps/web/lib/services/organization-policy-gate.ts` (IP allowlist :327-330, MFA :249-252) with tests.
   - Viewer read-only: a `has_permission`-style helper beside `app_has_org_role`, RLS policies for shared projects,
     artifacts and workspace settings migrated, routes and SCIM mapping updated, `check:org-role-checks` extended.
   - Remaining §127 partials verified against the released builds (`rqa-07`, `NEW-dqa-02`, `rqa-53`).
5. **Relay and pairing** verified phone → Electron and phone → Tauri after F11.

Exit: `/download` lists every surface available; §127 rows Done and live; not-live rows ≈ 0; CI <10% red and required.

## Wave 2 - Verification that runs itself (weeks 2–3)

- Authenticated web Playwright specs in CI with F14 (flip `apps/web/__tests__/web-e2e-ci-coverage.test.ts` to assert
  they run). Mobile Detox smoke, VS Code webview and Chrome side-panel accessibility gates.
- §0 guards that do not exist, built on the existing guard family (`scripts/check-web-ui-invariants.mjs`,
  `check-raw-error-to-user.mjs`, `check-mock-exports.mjs`, `check-ui-gaps.mjs`): loading/empty/error presence for new
  routes, placeholder/fake-success copy, production mock usage, raw IDs, structured logging on new API routes,
  feature-flag requirement for risky changes, per-package coverage floors.
- Duplication gate (§126): delete `ErrorCodes` in `apps/web/shared/lib/error-utils.ts` in favour of
  `packages/contracts/types/src/errors.ts` with a guard; move Chrome `cloud-bridge/conversationSync.ts` onto
  `packages/client/sync`.
- Preview deployments re-enabled behind protection, a staging environment, and a canary promotion step in
  `deploy-production.yml` (§107).

## Wave 3 - Product gaps by lane (weeks 2–7)

Size tags use the history-based model: W = wiring (≈0.5 day), F = isolated feature (1–3 days), S = cross-surface (3–13 days).

| Lane                                                               | Sections                 | Work (reuse first)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Est.       |
| ------------------------------------------------------------------ | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------- |
| A. Chat, Library, Projects, Artifacts, Research                    | §11–§24                  | temporary-chat connector/file/share policy (W); project description, skills and connectors panels (F); per-user invites with editor access, DB already has `write` in `0086_org_shared_ecosystem.sql:134` (F); project sharing audit (W); Library Videos/Artifacts/Generated tabs and Add to Chat/Project/Work (F); audio, video, archive ingestion through `upload-scan.ts` (F); artifact fork, dashboard type, save to project (F); research domain restrictions, connector sources, steering (F); stream reattach and usage frames (S)                                                                                                                                                                                                                          | 12–16 days |
| B. Work, states, subagents, events                                 | §25–§27, §76             | one Work state machine unifying `AgentTaskState`, `DispatchTaskLifecycleStatus`, `CloudCodeAgentStopReason` (S); pause control (F); web subagents with usage and audit (S); browser tools in web Work (F); emit `PatchApply`, `ExecCommandBegin`, `TurnDiff` (F)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | 12–16 days |
| C. AGI Code runtime and sessions                                   | §28–§34, §51–§54         | Tauri app-server client: Rust process manager speaking stdio JSON-RPC like `apps/desktop/electron/runtime/developerSessionService.ts`, bundle or resolve `agi`, events to webview, **retire Tauri's own coding stack** (`src-tauri/src/core/llm`, `core/agent`) so one runtime remains, `check:tauri-wiring` updated (S); session delete + reconnect (F); writer lease with expiry and handoff replacing fingerprint-only (S); generated files and provider on `ManagedSession` (F); tool registry version/result/error schemas by wiring `tool_primitive.rs` (F); per-tool cancellation (F); sandbox for hooks, MCP children, browser; enterprise-forced sandbox (F); broken pipe (W); open in VS Code (W); WSL/SSH/Dev Container paths (F)                       | 25–35 days |
| D. Browser, computer use, Chrome                                   | §35–§38                  | browser capability abstraction over Playwright + Chrome bridge, first consumer of `packages/tools/browser-tool` (S); preferred browser (W); upload approval and sensitive-site classes in `agentLoop.ts` (F); multi-display targeting in `action_executor.rs` (F); OS file picker and dialogs (F); takeover (F); Chrome ↔ AGI Code bridge (F)                                                                                                                                                                                                                                                                                                                                                                                                                      | 12–18 days |
| E. Remote Control and devices                                      | §39–§40, §2              | device rows written by every surface with workspace, arch, version, capabilities, presence, rename (S); remote to developer sessions (S); diff, test results, generated files on phone (F); Web Remote per F16                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | 12–18 days |
| F. Connectors, MCP, Skills, Plugins, Hooks                         | §41–§45                  | multiple accounts per connector (F); provider-outage state and per-call logs (F); workspace skills, skill install/update, MCP dependency (F); Ed25519 plugin signatures verified on install in CLI `plugins.rs:748-770` and web (F); org allowlists for plugins and MCP modelled on `WorkspaceConnectorPolicy` (F); hook events for turn start, error, cancellation, approval requested; managed hook policy (F)                                                                                                                                                                                                                                                                                                                                                   | 12–16 days |
| G. Identity, roles, admin, policy, retention, audit                | §55–§63                  | passkeys via Clerk (W); JIT on first SSO login (F); per-seat product assignment (F); permission grid with custom and multiple roles, Primary Owner, delegated group manager, RLS policies migrated (S); admin toggles for Work, Code, Research, Skills, Plugins, Hooks, Browser, Computer use, Remote, Schedules, triggers, default model, reasoning levels (S); policy layers (group, role, user, device, region), revisions, push to clients, offline cache (S); per-domain retention jobs (F); audit writers for every missing `AuditEventType` in `apps/web/lib/security-audit.ts` and `logAuthFailure` callers (F); SIEM destination UI over `audit-streaming-service.ts` (F); admin-scoped API keys (F); DLP hook and eDiscovery export over legal holds (F) | 30–40 days |
| H. Billing, metering, API gateway                                  | §70–§75                  | trials, in-app downgrade (F); enterprise billing UI over contract/invoice rows, contacts, tax exemption, co-term, seat true-up (S); ledger `project_id`/`session_id` and per-feature capabilities (F); spend alerts that notify (W); shared API middleware for schema validation, idempotency keys, versioning, timeouts, inbound circuit breaking (S); REST `If-Match` concurrency (F)                                                                                                                                                                                                                                                                                                                                                                            | 15–20 days |
| I. Notifications and deep links                                    | §84–§85                  | missing events (research, connector expired, device disconnected, security, billing) (F); deep links for file, artifact, Work, Research, schedule, browser task with web fallback and deleted/expired/unauthorized states (F)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | 6–9 days   |
| J. Design system, terminology, navigation, i18n, a11y, web quality | §3, §7–§10, §93, §97–§99 | Search, Combobox, SegmentedControl, ApprovalCard, ModelBadge, TrustBadge in `packages/ui/ui` (F); loading token + contrast test case (W); terminology sweep Tasks→Work, Agent permissions→Approvals, Team→Workspace with the shared-copy repo-wide test grep (F); rail Work, Code, Research, Notifications feed, account switch (F); web RTL, CJK line breaking, long-string tests, localized email and notifications, locale-aware search (F); Narrator, CLI plain mode (W); loading boundaries and performance budget gate (F)                                                                                                                                                                                                                                   | 15–20 days |
| K. Contracts, protocol, trust modes, model registry                | §4–§6, §46               | `Account`, `Workspace`, `Notification` contracts (F); server-side minimum client/runtime version for every surface (F); experimental capability negotiation read; unknown-event catch-all variants; hide unsupported features (F); trust-mode audit via `createAuditEvent` on handoff paths, usage-implication copy for Local/BYOK, credential-exposure test (F); registry `version`, per-model `region`, `replacedBy` fields in `registry.schema.json` + compile (F)                                                                                                                                                                                                                                                                                              | 8–12 days  |
| L. Memory backend                                                  | §83                      | conflict resolution beyond key overwrite, expiration/TTL on `user_memories`, workspace scope reads, consolidation job (F)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | 4–6 days   |

Lane totals ≈ 165–225 agent-days. At 4 concurrent implementers with the 1.5–3× verification multiplier already inside
the estimates, that is ~6 calendar weeks.

## Wave 4 - New subsystems (weeks 3–11), corrected by feasibility review

| #   | Subsystem                    | Design (what already exists, what to avoid)                                                                                                                                                                                                                                                                                                                                                                               | Est.       |
| --- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| 1   | Retrieval                    | Greenfield on Neon: `create extension vector` migration, embeddings through the AI Gateway **metered in the usage ledger**, indexing via Workflow steps, real hybrid (Postgres `tsvector` BM25 + vector + reranker), ACL-filtered, chunk versioning. The Tauri `rag.rs` hybrid is not a reference design                                                                                                                  | 10–13 days |
| 2   | Search                       | `tsvector` full text + semantic from #1 behind a search interface covering chats, projects, library, artifacts, reports, developer sessions (§81, §124)                                                                                                                                                                                                                                                                   | 5–7 days   |
| 3   | Jobs                         | **Do not build a second queue for agent runs**: Vercel Workflow already gives durable per-step retries. Add a generic job model only for sweeps and background tasks (research, indexing, exports, deletion, email, outbound webhooks) with attempts, DLQ table, priority, per-tenant fairness, keeping existing idempotency keys, `for update skip locked` claiming (`schedule-service.ts:799`) and 500-row batch clamps | 8–10 days  |
| 4   | Event triggers + scheduler   | Gmail push, Slack Events, Calendar, generic connector events, CI and repository events (extend `webhook-router.ts` beyond issue_comment) with filters, debounce, conditions, retry, DLQ from #3, audit; RRULE, dayparts, condition watch                                                                                                                                                                                  | 10–13 days |
| 5   | Prompt registry              | **Prompts stay in code** (DB storage breaks the `SYSTEM_PROMPT_CACHE_BOUNDARY` cache rule and code review): a typed manifest with prompt ids and versions, ids stamped on traces and the usage ledger, A/B via flags (#7), rollback by version pin, eval linkage (#6)                                                                                                                                                     | 5–7 days   |
| 6   | Evals                        | Extend `tools/evals` beyond its Anthropic-only runner to gateway-routed models; suites for coding, reasoning, research, search, tools, structured output, long context, files, browser, computer use, multilingual, safety, cost, latency; measured baselines, not declared targets; gate `models:families:promote`                                                                                                       | 10–13 days |
| 7   | Feature flags                | Flags SDK with a store keyed by workspace/role/plan/region/client version/percentage, kill switch, expiry, audit, admin UI. Keep `/api/me` `feature_flags` shape stable (read by web, desktop `cloudAccountAuth.ts:257`, mobile `billing/store.ts:87`)                                                                                                                                                                    | 6–8 days   |
| 8   | Model rollout                | shadow dispatch caller for `shadowMirror` (`auto.ts:724`), canary cohorts on by config, observed-health routing enabled in production, quality/cost/latency alerts                                                                                                                                                                                                                                                        | 5–7 days   |
| 9   | Analytics + business metrics | Vendor pipeline (F15) gated on the `product_analytics` consent purpose, covered by account erasure and export; §100 events on every surface; DAU/WAU/MAU, D1/D7/D30, conversion, churn, expansion, ARR, ARPU, gross margin, support cost dashboards                                                                                                                                                                       | 10–13 days |
| 10  | Observability                | Extend `instrumentation.ts` (Sentry already registers tracing; avoid a second OTel SDK); IDs for request, user, workspace, session, turn, tool, provider request, queue job, browser task, remote session; Sentry on mobile, VS Code, Chrome, desktop release builds, CLI opt-in; metrics and log export; §87 dashboards                                                                                                  | 8–10 days  |
| 11  | CMEK                         | Change `KmsUnwrapFn` (`envelope.ts:140`) to async with caching; org-owned KEK in customer KMS wrapping a per-org DEK table; rotation and revocation with audit events; key-failure behaviour; HKDF-from-platform-root stays for non-CMEK tenants only                                                                                                                                                                     | 10–13 days |
| 12  | EU residency                 | Org `data_region`; second Neon project and pool selection by region (replacing single `DATABASE_URL` use in `health-check.ts:68`, `db-pool-tuning.ts:97`); R2 **EU jurisdiction** bucket (auto region is not residency); EU inference route set; region-pinned logs, keys, backups, connector data; migration path for existing orgs                                                                                      | 15–20 days |
| 13  | Cross-version matrix         | CI jobs pairing released N-1 artifacts with current builds for every §109 pair                                                                                                                                                                                                                                                                                                                                            | 6–8 days   |
| 14  | Cross-surface E2E            | Automated chain across web, mobile, Electron, Tauri, CLI, VS Code, Chrome for every §110 step on the F14 tenant                                                                                                                                                                                                                                                                                                           | 10–13 days |
| 15  | Cost architecture            | COGS capability enum extended (storage, database, vector, notifications, email, egress, Work and Code compute); semantic caching where safe; provider batch APIs; upload dedup                                                                                                                                                                                                                                            | 6–8 days   |

Subsystem totals ≈ 125–165 agent-days, ~2 parallel subsystem owners alongside Wave 3 → weeks 3–11.

## Wave 5 - Operations and reliability (weeks 4–11)

- SLOs for every §90 domain measured from #10, burn-rate alerts, published on `/sla` only when measured.
- Incident management: paging vendor behind `pageOnCall` (`app/api/cron/health-probe/route.ts:120`), rotation,
  escalation, incident channel, customer notice template, postmortem template, follow-up tracking.
- Backups/DR: run the Neon PITR drill for real, publish RPO/RTO, R2 versioning and backups, cross-region copies (EU
  region as target), quarterly drill calendar.
- Reliability: storage retry policy, cache failover, broader backpressure, worker migration and version checks,
  rolling promotion.
- Scalability: k6 load tests for streaming, jobs, tenants, connectors and relay fleet with a recorded live run
  (AGENTS.md §8); capacity dashboards; message-table partitioning plan.
- Vendor neutrality and migration: interfaces for search, vector, email, billing, analytics, queue; export/import
  formats; hosting cutover drill extending `web-container-drill.yml`.
- Support: widget on, help-center search, ticket objects, diagnostics attachment from every surface, enterprise
  priority routing.
- Security testing: DAST (ZAP) in CI, container scan for `apps/web/Dockerfile` and
  `services/signaling-server/Dockerfile`, IaC scan, red-team suites (prompt injection, tool poisoning, cross-tool
  escalation, remote control, browser, computer use), secret scanning on uploads, Terraform and high-entropy strings.
- Documentation: admin guide, per-surface docs, Remote, API reference, troubleshooting, migration notes, deprecation
  policy, ARCHITECTURE.md describing both desktop shells.
- Network: WAF rules as code, internal service auth, private networking and mTLS where offered.

## Wave 6 - Certification and residency programme (weeks 2–40)

| Week  | Milestone                                                                                                                                              |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 2     | SOC 2 auditor and compliance automation platform signed; control mapping to Waves 1–5 evidence; policies (access, change, incident, vendor, BCP, risk) |
| 4     | Pen test on the deployed product and released clients; findings become ledger rows; retest by week 8                                                   |
| 6–10  | SOC 2 Type I; ISO 27001 ISMS (risk register, statement of applicability) in parallel                                                                   |
| 11    | EU region live (Wave 4 #12); DPA/SCC annexes, `/subprocessors`, `/trust`, `/security` updated only when true (`compliance-claim-honesty.test.ts`)      |
| 10–36 | SOC 2 Type II observation window (≥3 months, typically 6) and report                                                                                   |
| 20–40 | ISO 27001 stage 1 and stage 2 audits                                                                                                                   |

## Wave 7 - Gates and final verification (continuous; closes week 12)

- §130 smoke automated on the F14 tenant, nightly and before every release.
- §127, §128, §129, §131 recomputed from their underlying rows each week; §129 screen sweep on every surface with the
  design skill gate; `audit/ui-gaps.csv` open P1/P2 driven to zero.
- Fourth full verification of all 2,097 rows with the same three lenses plus a live-product sample; republish.

## Timeline and critical path

| Weeks    | What completes                                                   | Critical-path dependency                                                       |
| -------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| 1–2      | Everything built is live; §127 closed; CI stable and required    | F1–F13 founder actions                                                         |
| 2–3      | Authenticated E2E and new guards in CI                           | F14 QA tenant                                                                  |
| 2–7      | Lanes A–L                                                        | Wave 1 CI stability; C blocks E and §130 developer-session steps               |
| 3–11     | Subsystems 1–15; operations                                      | F15 vendors; #3 jobs before #4 triggers; #1 before #2; #7 before #5 A/B and #8 |
| 11–12    | Engineering rows 100% Done and live; §130 green 7 nights running | all above                                                                      |
| up to 40 | SOC 2 Type II, ISO 27001 certificates                            | audit windows                                                                  |

Buffer: estimates include verification multipliers; hold 20% contingency for new rows discovered while closing
others (recent audits found ~11% of verdicts wrong in both directions).

## Risks and mitigations

- **Founder actions gate week 1** → every action has a prepared click-path and the release runbook runs the day it lands.
- **CI instability multiplies every lane** → stabilisation is the first engineering task; flaky tests fixed at root.
- **Two coding runtimes in Tauri** → retiring Tauri's own agent stack is part of lane C, not optional.
- **Migration apply-state contested** → F2 resolves it before any deploy.
- **Laptop capacity** → cap concurrency, push heavy suites to CI, one browser driver.
- **Verification drift** → no row closes without an independent verifier and the ships lens.
- **Scope growth** → new defects enter the ledger with lane and acceptance; weekly report shows net open rows.

## Verification

- Per row: the four-part definition of done, recorded in the ledger with evidence.
- Per wave: status-specific re-judgment by a non-implementing model; ships lens (`vercel env ls production` names,
  release tags, workflow runs, deployment status); citation check script; live product sample in a browser.
- Programme done when: ledger coverage script passes with zero open rows (HIPAA/BAA N/A excepted), CI required and
  <10% red over 30 runs, `/download` lists every surface, §130 smoke green 7 consecutive nights, fourth verification
  confirms 2,097 of 2,097, certificates issued.

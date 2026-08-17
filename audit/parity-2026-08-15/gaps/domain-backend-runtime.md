# Backend & Runtime Architecture — Domain Analysis

Domain: `backend-runtime` · Audit round: 2026-08-15 · Commit `e15df56e3` (`compliance/dpdp`), working tree clean.

**Scope.** Conversation runtime, agent runtime, tool runtime, model runtime,
context/RAG infrastructure, execution sandboxes, persistence, cross-surface
synchronization, and security — the systems layer underneath every other
domain in this audit round. Method: read
`audit/parity-2026-08-15/inventory/web-backend.md` and `runtime-infra.md` in
full, then independently re-verified every claim this document relies on
against the actual source at `e15df56e3` (not the inventory prose) via
Read/Grep/Bash. Every finding below cites the file(s) I opened myself.

## Headline

The core runtime is genuinely strong and unusually self-aware. The chat
completion / tool-loop / agent-run path
(`apps/web/app/api/llm/v1/chat/completions/route.ts` and its ~70 supporting
`lib/` modules) is the most carefully engineered code path found anywhere in
this pass — failover, cancellation, durable checkpointing, connector
permission enforcement, and billing-refund correctness are all handled with
inline comments that name the exact bug class each decision closes. The
codebase's own hygiene signals are real: a dedicated retirement pattern
(HTTP 410) cleanly kills abandoned subsystems instead of leaving them to rot,
and a repo-wide grep for hardcoded/mock/TODO data in API routes turned up
**zero** instances of fabricated data masquerading as real.

The gaps that remain are not "the runtime is broken" — they are **duplication,
unreachable-but-built capability, and unscheduled/unwired edges**: a fully
built Cloud Code agent-turn backend nothing calls, a second backend service
(`services/api-gateway`) whose REST surface duplicates the one actually
serving production traffic, a dead cron entry that silently locks paid
organization seats, and a handful of platform-specific runtime gaps (Windows
CLI sandboxing, CI not testing the full Rust workspace) that are honestly
self-documented in the code but still real.

## What's already excellent (do not rebuild)

| Area                                   | Evidence                                                                                                                                 | Why it matters                                                                                                                                                                                                                                                                                                                |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Chat/tool-loop streaming runtime       | `apps/web/app/api/llm/v1/chat/completions/route.ts` (950 lines) + `lib/tool-loop.ts`, `lib/managed-failover.ts`, `lib/context-window.ts` | Cancellation via `request.signal` threaded through provider stream, tool loop, and durable Workflow transport alike; per-plan concurrent-turn admission (`lib/rate-limit.ts`, GOV-3) closes a real gap (rate limiting alone doesn't bound N simultaneous long streams); every failure exit refunds a held credit reservation. |
| Provider/model dispatch                | `apps/web/lib/adapter-providers.ts`                                                                                                      | One dispatch table (`ADAPTER_PROVIDERS`) shared by both the plain-stream and tool-loop paths — no parallel/duplicate table found.                                                                                                                                                                                             |
| Connector tool permissions             | `apps/web/lib/connector-tool-permissions.ts`                                                                                             | Saved allow/ask/deny verdicts are loaded _before_ the tool catalog is built, and re-enforced again on the resume/approve path — a stale or forged client decision cannot execute a denied tool.                                                                                                                               |
| Auth & webhooks                        | `apps/web/app/api/stripe-webhook/route.ts`, `apps/web/app/api/github/webhook/route.ts`                                                   | Real signature verification (`stripe.webhooks.constructEvent`, `verifyGitHubWebhookSignature`), pinned to the Node runtime specifically because Edge silently breaks HMAC.                                                                                                                                                    |
| Rate-limit fail-open/closed discipline | `apps/web/lib/rate-limit.ts:1086-1108`                                                                                                   | Security-sensitive checks fail **closed**; non-sensitive ones fail **open** with a logged warning — a deliberate, documented split, not an accident.                                                                                                                                                                          |
| E2B execution gate                     | `apps/web/lib/e2b/gate.ts`                                                                                                               | Two-flag design (`e2bExecutionEnabled` vs `e2bCutoverEnabled`) explicitly prevents "dropping an API key into prod silently opens managed compute" — the kind of gating bug this class of feature usually has.                                                                                                                 |
| Cron discipline                        | `vercel.json`                                                                                                                            | All 9 scheduled crons are once-daily, respecting the Vercel Hobby-plan sub-daily-cron constraint (see project memory on this exact failure mode) — no accidental deploy-blocking cron exists.                                                                                                                                 |
| No fabricated data                     | repo-wide grep, confirmed independently                                                                                                  | Every `mock/fake/hardcoded/TODO/not implemented` hit in `route.ts` files was either a negation comment or an honest, tracked stub — never silent fake data.                                                                                                                                                                   |

## Gaps

13 gaps filed (`domain-backend-runtime.json`). None reach P0 — nothing here
blocks a primary workflow outright without an existing (if imperfect)
mitigation. Severity spread: 2×P1, 8×P2, 3×P3.

| ID                  | Severity | Feature                                 | One-line                                                                                                                                                                                                                   |
| ------------------- | -------- | --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| BACKEND-RUNTIME-001 | P1       | Cloud Code agent-turn backend           | Fully built agent-turn + approval endpoints; zero UI caller — CloudCodePage only sends terminal commands.                                                                                                                  |
| BACKEND-RUNTIME-009 | P1       | Windows CLI sandbox                     | `SandboxType::detect()` never returns anything on Windows; exec tool fails closed unless the user passes `--no-sandbox`.                                                                                                   |
| BACKEND-RUNTIME-002 | P2       | api-gateway vs Next.js API duplication  | Fly-deployed Express service duplicates the REST surface that mobile's own `GATEWAY_URL` default actually resolves to (same Vercel deployment, via Host rewrite) — unclear production purpose beyond WebSocket/QR pairing. |
| BACKEND-RUNTIME-003 | P2       | Duplicate desktop `CloudSyncClient`     | Two same-named structs; one (`integrations::sync`) targets a route that doesn't exist and is never instantiated outside its own module.                                                                                    |
| BACKEND-RUNTIME-004 | P2       | Two device-pairing systems              | RFC 8628 CLI flow and QR-linking flow overlap in name and shape (`auth/device/approve` vs `device/approve`) with independent regex validation.                                                                             |
| BACKEND-RUNTIME-005 | P2       | Missing cron schedule                   | `cron/expire-organization-invitations` has no `vercel.json` entry — its own comment says lapsed invitations silently keep holding paid seats.                                                                              |
| BACKEND-RUNTIME-006 | P2       | No vector/RAG backend                   | Working embeddings endpoint, zero internal callers; no `vector` column anywhere in the schema; project knowledge is prompt-stuffed, not retrieved.                                                                         |
| BACKEND-RUNTIME-010 | P2       | Linux seccomp not shipped               | A tested in-process seccomp sandbox exists but its Cargo feature isn't in the release build — Linux relies solely on external `bwrap`.                                                                                     |
| BACKEND-RUNTIME-011 | P2       | CI never runs full Rust workspace tests | No job runs `cargo test --workspace` on all targets; security-relevant crates' (`agiworkforce-mcp` OAuth, `agiworkforce-llm` SSE parsing) integration tests are compiled but never executed in CI.                         |
| BACKEND-RUNTIME-007 | P3       | Enterprise licensing verifier unwired   | Built twice (TS + Rust, Ed25519-signed containers), zero runtime callers in either language.                                                                                                                               |
| BACKEND-RUNTIME-008 | P3       | Orphaned billing/usage alias routes     | 3 of 4 legacy alias routes (`usage/analytics`, `usage/history`, `usage/providers`) have no caller anywhere.                                                                                                                |
| BACKEND-RUNTIME-012 | P3       | Observability asymmetry                 | `services/api-gateway` has no `/metrics` (unlike its sibling `signaling-server`); neither backend service reports to an APM/error tracker.                                                                                 |
| BACKEND-RUNTIME-013 | P3       | Dead tables + unapplied migration       | 9 tables live only for GDPR-erasure completeness, 2 fully dead, and a correctly founder-gated drop migration for `teams`/`team_members` sits unapplied.                                                                    |

Full detail, file citations, and evidence for each row lives in
`domain-backend-runtime.json` and is not repeated verbatim here — see the
next section for the reasoning behind the more consequential ones.

### BACKEND-RUNTIME-001 — Cloud Code agent-turn backend, unreachable

`apps/web/app/api/code/sessions/[sessionId]/agent/route.ts` (124 lines, real
`handleAgentTurn`) and its sibling `agent/approvals/route.ts` (136 lines) are
fully implemented — auth, CSRF, rate limit, subscription-tier check,
`decideCloudCodeAgentApproval`. The client, `cloud-code-api.ts`, is the only
in-repo caller of `/api/code/sessions/**` and calls exactly `list, get,
create, delete, commands` — never `.../agent`. `CloudCodePage.tsx`'s only
mention of "agent" is a static string pointing the user at the VS Code
extension instead (`CloudCodePage.tsx:660`). This is the CLAUDE.md failure
mode named explicitly ("a control that renders but never reaches the API")
inverted: here the API is complete and nothing renders the control at all.
Today, Cloud Code in the browser is "run a terminal command in a sandbox,"
not "hand a task to an agent" — the latter is the entire pitch of Codex/Claude
Code as a category and the backend for it already exists.

### BACKEND-RUNTIME-002 — services/api-gateway duplication

`services/api-gateway` is real, tested, and now has genuine Fly.io CI/CD
(`infrastructure/api-gateway/fly.{staging,production}.toml`, dated
2026-08-09). But its REST routers (`agents`, `chat`, `cloudChat`, `credits`,
`llm`, `usage`, `models`) structurally duplicate the Next.js API routes doing
the same job in `apps/web`. Mobile's `EXPO_PUBLIC_GATEWAY_URL` defaults to
`https://api.agiworkforce.com`
(`apps/mobile/lib/constants.ts:18`) — but `apps/web/next.config.ts:94-115`
proves that hostname is a Host-header rewrite onto the **same** Vercel/Next.js
deployment, not the Fly-hosted Express service. `docs/agent-context/known-flaws.md`
independently reaches the same conclusion (`SVC-DEPLOY-TOPOLOGY-VERCEL-SINGLE`)
and records this as a still-pending founder decision: retire the gateway's
REST duplication, or keep only its WebSocket/QR-pairing core (the one thing
Vercel serverless structurally cannot host). Neither branch of that decision
has been taken yet, so both implementations are maintained in parallel today.

### BACKEND-RUNTIME-003 — duplicate `CloudSyncClient` in desktop Rust

Two unrelated structs share the name `CloudSyncClient` in
`apps/desktop/src-tauri/src`. `integrations::sync::CloudSyncClient`
(`cloud.rs:22`) defaults to `https://api.agiworkforce.com/api/sync` — a route
that does not exist anywhere under `apps/web/app/api` — and its owner
`SyncManager` is never instantiated outside its own module. The live one,
`data::cloud_sync::CloudSyncClient`, hits the real `/api/chat/sync` route and
is genuinely wired into five command modules (`chat/conversation.rs`,
`chat/persistence.rs`, `memory.rs`, `projects.rs`,
`artifacts/persistence.rs`). This was independently corroborated by
`known-flaws.md`'s `BYOK-RUST-EGRESS-01` entry, which traced the same pair
from a security angle and confirmed the first is "DORMANT — declared but
never instantiated" — two independent audit passes reaching the same
conclusion raises confidence this is accurately characterized, not a
misread.

### BACKEND-RUNTIME-006 — RAG absence, root cause

The instinct to file "Claude/ChatGPT do semantic search over project files
and we don't" is already covered by a sibling domain
(`SEARCH-RESEARCH-004`, filed this same round) and by
`PROJECTS-FILES-002` (silent context-budget truncation). This entry is the
backend root cause underneath both: `POST /api/llm/v1/embeddings` (306
lines) is a complete, billed, OpenAI-compatible embeddings endpoint with
**zero internal callers** — it exists purely as an external API surface.
`/api/memory/search`'s own docstring says "Simple ILIKE text search — can be
upgraded to vector similarity later." No migration in `apps/web/db/neon/*.sql`
declares a `vector` column or `pgvector` extension. Building one pgvector
store that both sibling gaps consume — rather than two independent retrieval
paths growing up around the same missing primitive — is the efficient
sequencing here.

### BACKEND-RUNTIME-009 — Windows CLI has no sandbox

`SandboxType::detect()` (`apps/cli/src/sandbox.rs:22-35`) returns a real
sandbox only on macOS (Seatbelt) and Linux (bubblewrap-if-present); every
other platform falls to `None`. Windows-specific code
(`windows_sandbox.rs:76-91`) is explicit that this is not an oversight —
`is_available()` unconditionally returns `false`, and `install_filter` bails
even with its feature flag on: _"tracking issue: AppContainer integration is
a v1.8 work item."_ Because `SandboxManager::for_command_execution` fails
**closed** on `SandboxType::None`
(`apps/cli/src/features/exec/tools/bash/mod.rs:172-211`), the practical
effect is that the CLI's core workflow — an agent running shell commands —
does not work on Windows by default at all; the only way through is
`--no-sandbox`, which removes sandboxing entirely rather than degrading
gracefully. This is honestly self-documented in the code (unlike a silently
broken feature), which is why it's P1 rather than P0 — but it is still a
whole supported platform where the primary workflow has no safe default
path.

## What NOT to copy

Per `research/cross-cutting-and-complaints.md`, both ChatGPT and Claude carry
backend/runtime-adjacent design choices users actively dislike. None of them
should be replicated here, and in most cases this repo's current backend
architecture is already the better design:

1. **Don't hide usage-limit mechanics behind an opaque dual-meter system.**
   Anthropic's own users repeatedly name the 5-hour-session + weekly-cap
   split as the single most misunderstood thing about paid Claude plans, and
   Anthropic has stopped publishing exact message counts at all
   (cross-cutting §8, item 7). This repo's credit-ledger model
   (`lib/services/managed-usage-summary-service.ts`, `lib/cost-tracker.ts`)
   already computes precise, queryable usage — the ingredients for a real
   running counter exist. The risk is inheriting ChatGPT/Claude's _opacity_
   by never surfacing what the backend already knows, not a backend gap.
2. **Don't multiply backend services just because competitors run
   multi-service topologies.** The evidence here (BACKEND-RUNTIME-002)
   argues the opposite direction from what "look more enterprise" intuition
   suggests: a second REST-duplicating service adds maintenance surface
   without adding capability, because the thing actually serving traffic is
   the Next.js app. Consolidate before adding more services, don't add more
   services because ChatGPT/Claude "obviously" run several.
3. **Don't let a durable-execution flag ship default-off and get described as
   default-on.** `CHANGELOG.md` describes `AGI_DURABLE_INITIAL_TURNS` as a
   "kill-switch" (implying default-on, opt-out), but
   `durable-initial-turns.ts:9-14` documents it as off by default, opt-in.
   This is exactly the anti-pattern cross-cutting §8 item 9 warns against
   ("don't undersell a change with soft language that implies more than is
   true") — already filed as `AGENTIC-WORK-003` by the sibling agentic-work
   domain pass, not re-filed here, but worth naming as a backend-adjacent
   instance of the same discipline this document argues for elsewhere.
4. **Don't rush to build first-party SAML assertion consumption to "match
   enterprise."** `admin/sso/route.ts` correctly stores SAML/OIDC connection
   _configuration_ only — no SAML assertion callback route exists anywhere
   in the repo (confirmed by grep), which matches the already-recorded,
   deliberate disposition in `audit/capability-gaps.csv` (`CAP-028`,
   Deferred, Phase 3: "Configuration storage is not authentication or
   provisioning"). This is correctly gated behind the enterprise-identity
   program, not a bug to rush-fix.

## Prior-art reconciliation

This is a newly-representable category: `prior-art-reconciliation.md`
explicitly names "no backend or runtime gaps are representable" as one of
`audit/ui-gaps.csv`'s structural blind spots (its gap-type vocabulary is
entirely `missing-{control,screen,ia,copy,state,interaction,feature}` plus
`visual-polish`). None of the 13 gaps filed here map to an existing
`GAP-xxx` row in `ui-gaps.csv`; `priorArtId` is `null` on all of them for
that reason. Two items were checked against and found to already have a
disposition in `audit/capability-gaps.csv` and are **not** re-filed:

- **CAP-028** (First-party SAML/SCIM) — confirmed still accurately "config
  storage only," correctly Deferred to the enterprise-identity program.
- **CAP-039** (Retrying job queue with dead-letter handling) — spot-checked
  the durable-workflow retry semantics in
  `apps/web/lib/workflows/cloud-agent-workflow.ts` (real `retrySafety`
  classification distinguishing safe/unsafe tool retries) and
  `cloud-agent-operation-executor.ts`; did not find evidence this
  disposition needs revising and left it to the owning Platform lane per
  the capability-gaps intake rules.

Three items filed here (`BACKEND-RUNTIME-001` Cloud Code agent turn,
`BACKEND-RUNTIME-002` api-gateway duplication, `BACKEND-RUNTIME-006` RAG
root cause) sit adjacent to gaps filed by sibling domain passes in this same
audit round (`domain-agentic-work.json`, `domain-search-research.json`,
`domain-projects-files.json`). Cross-checked each for overlap before filing;
none duplicate — see the per-gap "evidence" fields above for the specific
distinction drawn in each case.

## Verification notes / methodology

- Read `web-backend.md` (703 lines) and `runtime-infra.md` (461 lines) in
  full before any code was opened, then independently re-derived every claim
  this document relies on rather than restating inventory prose.
- All 8 items the audit brief specifically called out for verification were
  independently confirmed in code: the 410-retired route families (12 routes
  via `retiredManagedExecutionResponse` + 1 differently-worded retirement in
  `completion/route.ts`), the unreachable `code/sessions/[id]/agent`
  endpoint, the absence of any `vector` column, the two device-pairing
  systems, the missing `expire-organization-invitations` cron entry, the 9
  GDPR-only + 2 fully-dead tables, the unapplied `0058_drop_legacy_teams.sql`
  migration, and the `services/api-gateway` vs web API duplication.
- `services/AGENTS.md`, `apps/cli/AGENTS.md` were read for the crates/services
  ownership boundaries referenced above.
- No gap was filed on inventory prose alone — every row in
  `domain-backend-runtime.json` cites a file this pass opened directly, and
  the `evidence` field states the grep/read/run that produced the finding.

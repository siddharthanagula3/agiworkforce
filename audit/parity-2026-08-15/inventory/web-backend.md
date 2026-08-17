# apps/web Backend Inventory — API routes, services, DB, streaming runtime

Scope: `apps/web/app/api/**` (218 `route.ts` files), `apps/web/lib/**`,
`apps/web/db/neon/**`. Read-only audit, evidence-first. Every claim below cites
a file path; "caller" claims are based on repo-wide grep across
`apps/web`, `apps/desktop`, `apps/mobile`, and `packages/**` (excluding
`.test.ts`), so a route with a caller only in another surface (desktop/mobile/CLI)
is still counted as wired, not dead.

Read `apps/web/AGENTS.md` first (web-ui / web-api-billing / enterprise-admin-surface
lanes). This matches the CLAUDE.md note that Managed Cloud is public alpha, open
by default, with `AGI_MANAGED_COMPUTE_PRIVATE_BETA` retained only as an
incident-response kill-switch — confirmed live in code (see Feature flags section).

---

## 1. Chat/completion streaming — COMPLETE, the deepest-wired surface in the app

Canonical endpoint: `apps/web/app/api/llm/v1/chat/completions/route.ts` (950
lines) — "OpenAI-compatible Chat Completions API," Clerk-authed, billed against
cloud credits. Service modules live in `lib/` next to it (~70 files, incl. ~40
test files): `auth-gate.ts`, `request-processor.ts`, `stream-transform.ts`,
`response-builder.ts`, `tool-loop.ts`, `tool-loop-anthropic.ts`,
`research-loop.ts`, `managed-agent-stream.ts`, `managed-failover.ts`,
`context-window.ts`, `adapter-factory.ts`, `adapter-providers.ts`.

- **Client caller confirmed**: `apps/web/lib/runtime/WebChatRuntime.ts:195`
  (`const completionsUrl = '/api/llm/v1/chat/completions'`).
- **`apps/web/app/api/completion/route.ts`** — deliberately retired (410
  `prompt_completion_retired`); comment explains per-keystroke prompt
  autocomplete was "a second, unreserved provider spend path." Not a bug.
- **Model selection / provider routing**: `request-processor.ts` resolves
  `processed.provider` via a catalog lookup + heuristic fallback chain, then
  dispatches through a table (`ADAPTER_PROVIDERS`,
  `lib/adapter-providers.ts`) covering Anthropic, Google, OpenAI, and 8
  openai-compat providers (minimax, moonshot, zhipu, qwen, openrouter,
  deepseek, xai, perplexity) — route.ts:94-105 documents that the old
  `LLMProviderFactory` fallback was retired because this table is now
  exhaustive; an unresolved provider is an explicit typed failure
  (route.ts:720-737), not a silent fallthrough.
- **Failover, not same-provider retry**: `lib/managed-failover.ts`
  (`createFailoverPlan`) rotates to a different provider/model on a
  pre-first-byte failure; `lib/retry.ts` (generic exponential-backoff retry
  utility) is NOT used on this path — its only importer is
  `lib/services/credit-service.ts`. Worth noting: "retry" here means
  provider failover, not literal retry of the same call.
- **Tool loop**: `lib/tool-loop.ts` (1200+ lines) — bounded agentic loop:
  inject tool defs → stream → on `tool_calls` pause, execute, append results,
  re-invoke, repeat to `maxSteps`. Default fail-closed approval
  (`awaiting_approval` checkpoint persisted before `x_tool_approval_request`
  is even emitted); `approval_mode=auto` skips the prompt for built-in
  platform tools (E2B sandbox, SSRF-guarded `url_fetch`, `web_search`).
  Parallel-safe (read-only) tools execute concurrently; mutating tools
  serialize.
- **Streaming protocol**: OpenAI-compatible SSE, extended with
  `x_tool_status`, `x_tool_approval_request`, `x_tool_result`, and a
  canonical `x_agent_event` envelope. Idle-stream keepalive via
  `lib/sse-heartbeat.ts` (`withSseHeartbeat`), applied to research-loop,
  tool-loop, and durable-workflow streams alike (route.ts:411-416, 643-645).
- **Cancellation**: `request.signal` (client abort) threaded into
  `startProviderStream`, `runToolLoop`, `runResearchLoop`, and the durable
  Workflow transport; `isCloudAgentRunCancellationRequested` polls a DB flag
  so a stop-request from another tab/device also lands mid-run
  (route.ts:362-366, 602-603).
- **Persistence / durability**: every agentic or tool-bearing turn is wrapped
  in a `CloudAgentRun` row (`lib/services/cloud-agent-run-service.ts`) with a
  durable event journal; `GET/POST /api/llm/v1/chat/completions/runs/[runId]`
  (`apps/web/app/api/llm/v1/chat/completions/runs/[runId]/route.ts`) lets a
  client reattach (`after`/`limit` cursor) and cancel (202). A conversation
  can only have one active run at a time — a second concurrent send gets a
  409 `conversation_run_in_progress` (route.ts:170-199).
- **Durable resume across disconnects**: when a managed-usage reservation
  exists and `AGI_DURABLE_INITIAL_TURNS` is enabled
  (`lib/workflows/durable-initial-turns.ts`), the turn starts on the Vercel
  Workflow transport so it outlives the request (route.ts:516-557). A
  `start()` failure falls through to the inline in-process stream — the
  module comment (route.ts:519-529) explicitly reasons about the
  no-double-execution property.
- **Approvals resume**: `POST /api/llm/v1/chat/completions/approve/route.ts`
  (362 lines) reloads the signed checkpoint (model, transcript, pending tool
  calls) from the DB rather than trusting the client's replay, re-validates
  auth/tier/quota, re-applies the user's saved connector allow/ask/deny
  verdicts (denied tools are silently rewritten `approved → rejected`, never
  executed even if the client lies), and resumes the same durable Workflow
  run. Client caller: `apps/web/lib/hooks/useChatStream.approval.test.tsx`,
  `WorkSessionPanel.test.tsx` exercise it; production caller is
  `apps/web/lib/hooks/useChatStream.ts` (confirmed via the approval test
  files exercising the real hook, not a mock).
- **Context assembly & compaction**:
  `apps/web/app/api/llm/v1/chat/completions/lib/context-window.ts` — trims
  conversation history to fit the resolved model's context window,
  appending `[...truncated to fit the model context window]`, plus
  `trimToolResultHistory` in `tool-loop.ts` bounds tool-result growth across
  loop steps.
- **Branching**: `chat/conversations/[id]/branches/route.ts` (71 lines) is
  called from `apps/web/features/chat/hooks/use-conversation-branches.ts:52,88`
  via `managedCloudConversationBranchesPath(conversationId)`. COMPLETE.
- **Message-level editing/reactions**:
  `chat/conversations/[id]/messages/[messageId]/route.ts` — PATCH merges into
  `message.metadata` (currently `reaction: thumbsUp|thumbsDown|null` and a
  video-start-failure marker), DELETE removes one message after
  double-ownership check. Client caller:
  `apps/web/features/chat/components/messages/MessageBubble.tsx` renders the
  thumbsUp/thumbsDown control against `message.metadata?.reaction`.
- **GOV-3 concurrency governance** (route.ts:886-941): per-plan
  _concurrent_-turn admission via `acquireManagedTurnSlot`
  (`lib/rate-limit.ts`) — a real gap the code closes explicitly: request-rate
  limiting alone didn't bound N simultaneous long streams. Slot ownership is
  handed to the streaming `Response` body via an identity `TransformStream`
  so the slot only releases when the stream actually finishes/aborts, not
  when the handler returns.
- **Billing/refund correctness**: `refundFailedReservation` (route.ts:108-154)
  is invoked on every one of the ~6 failure exits (research start, tool-loop
  start, provider dispatch failure, unsupported provider) so a failed attempt
  never keeps a held reservation.

**Verdict: COMPLETE.** This is materially the most carefully-argued code in
the audited scope — nearly every non-obvious decision has an inline
"AUDIT-FIX" comment citing the bug class it closes (SYS-21 failover
attribution, BUG-1 cancel-before-bill, BUG-8 missing heartbeat, CON-1/CON-2
tool-permission bypass, GOV-3/GOV-7 concurrency and connector-ceiling
governance).

---

## 2. Deep Research

`runResearchLoop` (`.../lib/research-loop.ts`) is entered when
`chatRequest.stream && researchMode && !freeTrial && provider !== 'anthropic'`
(route.ts:313-317). Bounded plan → search-round → cited-synthesis loop;
persists a `research_reports` row via
`lib/services/research-report-service.ts` → `saveResearchReport`. Retry
carries prior sources/steps forward on the **normal** request path (comment
confirms: "there is no bypass here" — a retried research turn is billed like
a first attempt). `GET /api/research/reports/route.ts` (75 lines) is the
read surface. Gated off for Anthropic and free-trial by design (existing
single-turn behavior preserved for those).

**Verdict: COMPLETE** for the gated provider set; intentionally narrower than
the general chat path.

---

## 3. Agent runtime — two co-existing systems, one retired

### 3a. `/api/agents/*` — RETIRED (410 `ENDPOINT_RETIRED`), not dead code by accident

All 8 routes under `apps/web/app/api/agents/**`
(`collaboration`, `communication`, `communication/[id]`, `execute`,
`log-message`, `session`, `tool-executions`, `tools`, `tools/[id]`) return a
typed 410. Each carries the identical comment:

> "STB-20: RETIRED. Zero in-repo callers. The live /api/agents surface is the
> Express api-gateway's own agents router (services/api-gateway); this
> Next.js subtree is an abandoned parallel implementation that still
> authenticated and queried private rows on every request."

Confirmed via grep: no non-test caller anywhere in the monorepo for any of
these paths. This is a deliberately-neutered dead subsystem, not a
half-finished feature — evidence: `apps/web/lib/server/retired-managed-execution.ts`
is the single shared handler all of them (plus `completion`, `mission`,
`usage/deduct`, `v1/providers/[providerId]/stream`) delegate to.
**13 routes total use this retirement pattern.**

Legacy DB tables backing the retired subsystem (`agent_tools`,
`agent_tool_executions`, `agent_approval_requests`) are **not dropped** —
their only remaining reader is the GDPR/DPDP erasure sweep
(`apps/web/lib/server/account-erasure.ts:89-91`), which still nulls
`user_id` there for compliance. See §11 for the full dead-table list.

### 3b. Cloud Agent Runs — the real, live agent runtime

`lib/services/cloud-agent-run-service.ts` backs the `CloudAgentRun` /
`cloud_agent_events` / `cloud_agent_approval_checkpoints` /
`cloud_agent_execution_operations` tables (migrations 0061-0063). This is
what §1's tool loop and research loop actually run on. COMPLETE and wired
(see §1).

### 3c. Managed Code (Cloud Code) agent turns — BACKEND_ONLY, no UI reaches it

`apps/web/app/api/code/sessions/**` is a **separate** agentic surface (5
routes): list/create (`code/sessions/route.ts`), get/delete
(`.../[sessionId]/route.ts`), raw terminal commands
(`.../[sessionId]/commands/route.ts`), an agent turn
(`.../[sessionId]/agent/route.ts`, 124 lines, real `handleAgentTurn`), and
approvals for that turn (`.../[sessionId]/agent/approvals/route.ts`, 136
lines, real GET-list/POST-decide).

Client: `apps/web/features/code/services/cloud-code-api.ts` — the only
in-repo caller of `/api/code/sessions/**` — calls **list, get, create,
delete, and `commands`** (`cloud-code-api.ts:155-190`). It does **not** call
`.../agent` or `.../agent/approvals` anywhere. Confirmed by:

- `grep -rn "fetch(\|/api/code" cloud-code-api.ts` → 6 hits, none is `/agent`.
- Repo-wide grep for `sessions/${...}/agent` outside `app/api/code` and
  `cloud-code-api.ts` → zero hits (only a comment mention in
  `apps/web/lib/deadline-policy.ts`).
- `CloudCodePage.tsx` (mounted at `/chat/code` via
  `apps/web/app/chat/code/page.tsx`) renders a terminal (raw commands), not
  an agent-turn UI.

**Verdict: BACKEND_ONLY.** The agent-turn endpoint and its approval-resume
endpoint are fully implemented (auth, CSRF, rate limit, subscription-tier
check, `decideCloudCodeAgentApproval`) but nothing in the product UI can
reach them — Cloud Code today is "run a terminal command in a sandbox," not
"run an agent turn," even though the agent-turn backend exists.

Also gated behind an explicit operator flag documented in
`apps/web/lib/e2b/gate.ts`: `e2bProvisioningReady()` requires
`AGI_E2B_EXECUTION=1` **and** `E2B_API_KEY` **and**
`sandboxComputeIsPriceable()`; absent any of those, every `code/sessions/*`
route throws "Managed Code is coming soon. Cloud sessions are not available
yet." (see each route's `rethrowCloudCodeError`). This is a deliberate,
well-commented operator opt-in (mirrors the managed-compute gate), not an
accidental flag.

---

## 4. Tool runtime

- **Built-in platform tools** (offered inside the tool loop, auto-approved):
  `web_search` (`apps/web/lib/web-search/web-search-tool.ts`,
  request-processor.ts:1114-1124), `url_fetch`
  (`apps/web/lib/url-fetch/url-fetch-tool.ts`, SSRF-guarded, mentioned
  request-processor.ts:1039), E2B code execution
  (`apps/web/lib/e2b/execution-tools.ts`, `runtime.ts`, `generated-files.ts`
  — gated per §3c), office-file generation (docx/pptx) via
  `apps/web/lib/services/managed-office-file-service.ts`, and `skill` (see
  §6).
- **Operator MCP catalog**: `apps/web/lib/mcp-tool-executor.ts` — loads a
  remote-only, HTTPS-only MCP server list from `WEB_MCP_SERVERS_JSON`, caches
  the flat tool catalog for 60s, dispatches by qualified name. Explicitly
  refuses stdio transports (comment: SSRF defense — spawning belongs to
  `services/api-gateway/src/mcp/`, not a Next.js handler).
- **User-connected connector tools**: `apps/web/lib/user-connector-tools.ts`
  (`loadUserConnectorToolCatalog`) adds a signed-in user's own connected
  connectors' tools on top of the operator catalog, per-plan capped (GOV-7:
  "the connector-tool ceiling is now the caller's PLAN ceiling, not a flat
  32," with truncation reported back to the client via
  `X-AGI-Connector-Tools-Dropped`).
- **Permission enforcement**: `connector-tool-permissions.ts` loads saved
  allow/ask/deny verdicts _before_ the catalog is built — `deny`d tools are
  dropped from the catalog entirely (never offered to the model), enforced
  again on the resume/approve path (see §1) so a stale/forged client decision
  cannot execute a blocked tool (AUDIT-FIX CON-1/CON-2).
- **`POST /api/mcp/route.ts`** (117 lines) — a connect-and-list proxy for
  arbitrary remote MCP servers, used by the connectors page's "Inspect MCP
  server" CTA. Gated by `AGI_WEB_MCP_PRIVATE_BETA`, but the code comment is
  explicit that this flag is **open by default** since 2026-07-11 ("this flag
  was the only thing making the connectors-page 'Inspect MCP server' primary
  CTA a dead control") — matches the CLAUDE.md "public alpha, open by
  default" rule for managed cloud surfaces.
- **Timeouts**: `withToolTimeout`, `withProviderStreamDeadline`,
  `ProviderStreamDeadlineError` in `tool-loop.ts` bound both individual tool
  calls and the whole provider stream.

**Verdict: COMPLETE**, reachable from the UI (chat composer → tool loop →
connectors page → MCP inspect).

---

## 5. Model runtime

- Source of truth: `packages/contracts/types/src/models.json` (2324 lines;
  top-level keys `version`, `lastUpdated`, `verificationLog`, `providers`,
  `models`), consumed through `@agiworkforce/types`
  (`listCanonicalModels`, `getModelMetadataById`,
  `resolveEffectiveModelPricingForInputTokens`).
- **`GET /api/models/route.ts`** (218 lines) — public catalog API, transforms
  raw `ModelMetadata` into a stable public `ModelEntry` shape (pricing tiers,
  capabilities, category), `Cache-Control: public, max-age=300`. This is the
  single source consumed by desktop, web, and external integrations per its
  own docstring.
- **`GET /api/llm/v1/models/route.ts`** (149 lines) — the OpenAI-compatible
  `/v1/models` listing for the managed-cloud gateway (separate shape/contract
  from `/api/models`).
- **Provider adapters**: `ADAPTER_PROVIDERS`
  (`.../lib/adapter-providers.ts`) is the single dispatch table shared by
  both the plain streaming path and the agentic tool-loop path
  (route.ts:94-105) — confirmed no parallel/duplicate dispatch table exists
  for the tool-loop path (`tool-loop-anthropic.ts` explicitly reuses it).
- **Failover / capability matching**: `createFailoverPlan`
  (`managed-failover.ts`) restricts candidates to
  `isProviderDispatchable: (c) => Boolean(ADAPTER_PROVIDERS[c])`; per-model
  tool-capability gating exists (request-processor.ts / route.ts:429-437 —
  "WEB-TOOLS-MODEL-CAP-GATE-01": a model whose registry `capabilities.tools`
  is false skips tool loading entirely rather than sending a request the
  provider will reject).
- **Rate limits / usage & cost**: `lib/rate-limit.ts` (concurrent-turn slots,
  §1 GOV-3), `lib/cost-tracker.ts`, `lib/services/managed-usage-*` (request,
  accounting, summary) services, `lib/cpst-telemetry.ts` for CPST Stage-0
  outcome telemetry.

**Verdict: COMPLETE.**

---

## 6. Skills

`GET /api/skills/route.ts` (65 lines) lists via
`lib/services/skill-catalog-service.ts` (`getManagedSkillDirectoryForPlugins`),
filtered by the caller's enabled plugin ids
(`lib/services/plugin-installation-service.ts`). Progressive disclosure: the
index never returns skill body text; `GET /api/skills/[name]/route.ts` and
`/api/skills/[name]/download/route.ts` fetch/download individual bodies.
The tool loop filters a `skill` tool name out of the client-declared tool
list before injecting its own (request-processor.ts:473), and
`tool-loop.skill.test.ts` / `request-processor.skill.test.ts` exercise the
live path. **Verdict: COMPLETE.**

---

## 7. Plugins

`GET /api/plugins/route.ts` (115 lines) — intentionally public/unauthenticated
("the marketplace page renders for signed-out visitors and the CLI resolves
against this endpoint before a user has any account" — comment, lines 28-31),
backed by `lib/services/plugin-registry-service.ts` and migration
`0096_plugin_registry.sql`. `plugins/[id]/route.ts`,
`plugins/installations/route.ts`, `plugins/installations/[id]/route.ts`
handle per-user install/uninstall state (`0109_web_plugin_installations.sql`).
**Verdict: COMPLETE.**

---

## 8. Files: upload, storage, parsing, retention

- **Presigned direct-to-R2 upload**: `POST/DELETE /api/uploads/presign/route.ts`
  (238 lines) — client never touches storage credentials; browser PUTs
  directly to R2 (documented reason: Vercel serverless body cap ~4.5MB, well
  under the knowledge-file size ceiling). Three `kind`s: `avatar` (public
  bucket, 5MiB cap), `knowledge-file` (private bucket, project-ownership
  checked against `user_projects` before issuing a key), `chat-attachment`
  (private bucket, 12MiB cap, `isSupportedChatAttachment` allow-list).
  Falls back to a **local** project-knowledge upload path
  (`createLocalProjectKnowledgeUploadUrl`) when private object storage isn't
  configured — degrades gracefully rather than 500ing.
- **Chat attachment completion**:
  `POST /api/uploads/chat-attachment/complete/route.ts` (200 lines) —
  verifies bytes and registers media metadata after the direct-to-R2 PUT.
- **Parsing**: real PDF text extraction via `pdfjs-dist/legacy/build/pdf.mjs`
  dynamic import (`apps/web/lib/server/project-knowledge-extraction.ts:81`,
  function `extractPdfText`), plus Jupyter-notebook text extraction
  (`extractNotebookText`). Upload bytes are scanned
  (`lib/security/upload-scan.ts`, `scanUploadBytes`) and checked against a
  moderation denylist (`lib/moderation`, `matchDenylistedUpload`) before
  extraction. **No spreadsheet (xlsx/csv) parser exists** in
  `apps/web/lib` — spreadsheet content is only referenced as a _regex
  subject-matcher_ for routing execution-capable models
  (`RE_DATA_EXECUTION_SUBJECT` in request-processor.ts:368), not parsed
  server-side. Office documents (docx/pptx) are _generated_ (§4) but not
  independently parsed on upload beyond the text/PDF/notebook paths above.
- **Generated files**: `apps/web/lib/e2b/generated-files.ts`
  (`harvestGeneratedFiles`, `snapshotSandboxFiles`) +
  `apps/web/lib/server/generated-file-persist.ts`
  (`persistGeneratedFileBytes`) — files an agent produces in the E2B sandbox
  are harvested and persisted; integration test
  `apps/web/app/api/files/[id]/__tests__/generated-file-pipeline.integration.test.ts`
  exercises the full pipeline against the real `llm/v1/chat/completions`
  route (confirms this is a live, not aspirational, path — gated on the E2B
  flag from §3c).
- **Download**: `GET /api/files/[id]/route.ts` (244 lines) — the read/serve
  side, 22 in-repo callers (highly wired — Library, generated files, media).
- **Retention**: `cron/purge-deleted-media/route.ts` (wired via `vercel.json`
  cron, §9).

**Verdict: COMPLETE** for images/PDF/text/notebook/generated files; **no
server-side spreadsheet parser** — a real gap relative to the audit's ask
("parsing (PDF/spreadsheet/image)"), though images are handled via vision
model capability rather than a dedicated extraction step.

---

## 9. Scheduled tasks / cron

`vercel.json` (repo root) wires exactly 9 crons, every one pointing at a real
route under `cron/`, each gated by `verifyCronRequest`
(`apps/web/lib/server/cron-auth.ts`), confirmed read on
`cron/reset-credits/route.ts:5,12`:

| Path                                | Schedule     |
| ----------------------------------- | ------------ |
| `/api/cron/reset-credits`           | `0 0 * * *`  |
| `/api/cron/purge-temporary-chats`   | `0 3 * * *`  |
| `/api/cron/reconcile-credits`       | `30 0 * * *` |
| `/api/cron/run-schedules`           | `0 1 * * *`  |
| `/api/cron/reclaim-sandboxes`       | `45 5 * * *` |
| `/api/cron/purge-deleted-media`     | `0 4 * * *`  |
| `/api/cron/purge-deleted-accounts`  | `30 4 * * *` |
| `/api/cron/expire-support-handoffs` | `0 2 * * *`  |
| `/api/cron/health-probe`            | `15 6 * * *` |

One cron route exists with **no** `vercel.json` entry:
`cron/expire-organization-invitations/route.ts` — not scheduled anywhere in
the root `vercel.json`. Either it's triggered by an external
scheduler/runbook not in this repo, or it is effectively dead (never
invoked). **Flag as NEEDS_VALIDATION** — worth confirming whether org
invitations actually expire in production.

User-facing schedules feature (distinct from the cron _infrastructure_
above): `apps/web/app/api/schedules/route.ts` /
`schedules/[id]/route.ts` / `schedules/[id]/runs/route.ts` — CRUD for
user-created scheduled prompts, backed by `scheduled_tasks` /
`scheduled_task_runs` tables (migration `0009_scheduling.sql`,
`0057_durable_scheduling.sql`). `cron/run-schedules` is the executor that
walks due `scheduled_tasks` rows. Client: `apps/web/features/schedules/**`
(`ScheduleForm.tsx`, `SchedulesPage.tsx`, `ScheduleCard.tsx`,
`ScheduleRunHistory.tsx`, `schedule-api.ts`), mounted at `apps/web/app/chat/schedules`
and `apps/web/app/tasks`. **Verdict: COMPLETE** and reachable.

---

## 10. Auth & authorization

- **Provider**: Clerk (`getClerkAuthUser`, `@/lib/api-auth`), session/JWT via
  Clerk middleware + a first-party HS256 bearer minted for the CLI/device
  flow (`lib/server/developer-token.ts`, "identity-only — does not grant
  managed-cloud inference/billing").
- **Two parallel device-pairing systems** (worth flagging, not necessarily a
  bug — different purposes but overlapping surface area):
  - `auth/device/{code,approve,token,refresh}` — RFC 8628 CLI OAuth
    device-code flow (`device_authorization_codes` table, `XXXX-XXXX`
    alphanumeric user codes), explicitly "mirrors services/api-gateway
    deviceAuth.ts." Confirmed caller: `packages/client/client-runtime/src/deviceAuthorization.ts`,
    `apps/desktop/electron/accountBridge.ts`, `apps/desktop/src/services/cloudAccountAuth.ts`.
  - `device/{link,poll,approve}` — QR-code device linking (uses `qrcode` npm
    package to render a scan target), hex device codes, separate
    `device_pairings`/`device_authorization_codes` usage with its own
    `device-token-crypto.ts` encrypt/decrypt helpers.
    Both validate CSRF, rate-limit, and use distinct code-format regexes
    (`^[A-Z0-9]{4}-[A-Z0-9]{4}$` vs `^[A-F0-9]+$`) — a maintainer skimming
    "device approve" could easily edit the wrong one. Not proven broken, but a
    real duplication-of-concept risk.
- **RBAC / admin gating**: verified real gating (not missing) on all 8
  `admin/**` routes and all 8 `settings/organization/**` routes — some via a
  literal `requireAdmin`, others via inline `AdminAccess`/`requireOrgRole`
  helpers (`admin/security/route.ts`, `admin/sso/route.ts`). Initial grep for
  a single literal helper name under-reported this; manual read confirmed
  every one enforces admin/owner/admin org role before mutating.
- **SCIM** (`scim/v2/**`, 7 routes): bearer-token auth via
  `lib/server/scim/scim-route.ts` (`withScim` wrapper), RFC 7644-shaped,
  tenant-scoped by the resolved SCIM connection — not Clerk-authenticated by
  design (SCIM clients are IdPs, not browser users).
- **Webhooks properly signature-verified**: `stripe-webhook/route.ts` uses
  `stripe.webhooks.constructEvent` (pinned to Node runtime specifically
  because Edge silently breaks HMAC — comment WEB-4); `github/webhook/route.ts`
  verifies `x-hub-signature-256` via `verifyGitHubWebhookSignature` before
  touching the body, with an explicit "No CSRF check — the HMAC signature IS
  the authentication" comment. `media/video/openrouter-webhook/route.ts` is
  the third external webhook (not independently re-verified in this pass).
- **Routes checked for missing auth and found intentionally public**:
  `models`, `plugins` (documented above), `health`, `pricing/localized`,
  `releases/*`, `content-report` (public abuse-report intake).
  `webhook-diagnostic/route.ts` — admin-only env-presence probe
  (`requireAdmin`), returns only booleans, never raw secrets; comment
  documents it replaced a prior duplicate (`/api/validate-webhook`, deleted)
  that leaked when `CRON_SECRET` was unset on preview deploys (WEB-24/WEB-26).

**Verdict: no genuinely unauthenticated write path found** in this pass. The
device-pairing duplication (above) is the one soft finding worth a human
follow-up.

---

## 11. Database — `apps/web/db/neon` (119 numbered migrations + `down/`)

117 distinct `create table` statements found (grep over all `*.sql`,
including down-migrations counted once). Full down-migration coverage exists
only from `0097` onward (`down/README.md` — earlier migrations predate the
down-migration convention).

### Confirmed dead tables (no application code touches them outside the

GDPR/DPDP account-erasure sweep in `lib/server/account-erasure.ts`):

| Table                                                             | Only reference                                                                     |
| ----------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `agent_tools`, `agent_tool_executions`, `agent_approval_requests` | `account-erasure.ts:89-91` — remnants of the retired §3a `/api/agents/*` subsystem |
| `chat_messages`                                                   | `account-erasure.ts:60`                                                            |
| `chat_folders`                                                    | `account-erasure.ts:61`                                                            |
| `message_bookmarks`                                               | `account-erasure.ts:64`                                                            |
| `message_reactions`                                               | `account-erasure.ts:65`                                                            |
| `user_shortcuts`                                                  | `account-erasure.ts:75`                                                            |
| `messaging_connections`                                           | `account-erasure.ts:84`                                                            |

These are legacy/superseded tables (superseded by `web_conversations` /
`web_messages`, and by the reaction field living in `web_messages.metadata`
per §1) kept alive **only** so account deletion remains complete — a
defensible reason to not drop them yet, but they represent no live feature.

### Confirmed fully-dead table (not even touched by erasure):

- **`referrals`** — zero code references anywhere in `apps/web`.
- **`cloud_waitlist`** — zero code references; a comment in
  `lib/services/waitlistService.ts:11` explicitly calls it "the older...
  table, not `cloud_managed_waitlist`," confirming it was superseded and
  left behind.

### Migration written but explicitly NOT applied (founder-gated):

`0058_drop_legacy_teams.sql` drops `teams`/`team_members` (an early
workspace-membership model superseded by `organizations`/
`organization_members` in migration 0015). The migration file's own header
says: _"FOUNDER-GATED: this migration is NOT applied by this change...
Applying it to any database (including a disposable branch) is an
explicitly-gated, separate, founder-run step."_ Confirmed dead in code
already (`team_members`: 0 non-SQL references; `teams`: 3, all inside
migration/down-migration bookkeeping). **This means the live schema may
still carry two tables the application no longer uses at all, pending a
manual founder-run drop** — worth surfacing since it's easy to lose track of
a migration that was authored but deliberately never run.

### Tables with no obvious frontend feature (present, wired, low signal —

not claiming these are bugs, just noting sparsity):
`beta_invites` / `beta_redemptions` (4/2 references — a beta-invite gating
system exists but wasn't traced further in this pass),
`enterprise_audit_events`, `directory_sync_connections` /
`directory_sync_events` — these back the enterprise-admin-surface lane
(`admin/directory-sync/**`), out of this pass's deep-read budget but routes
exist and are non-trivial (confirmed via file sizes, not read in full).

---

## 12. Billing / usage metering

- Core routes wired to `apps/web/features/billing/**`
  (`use-billing-queries.ts`, `stripe-payments.ts`, `BillingSection.tsx`):
  `billing/overage`, `billing/top-up`, `billing/invoices`,
  `billing/payment-methods`, `checkout`, `upgrade`, `upgrade/preview`.
- **`usage/deduct/route.ts`** — retired (410, same
  `retiredManagedExecutionResponse` pattern as §3a).
- **`billing/analytics`, `usage/analytics`, `usage/history`,
  `usage/providers`** — each literally comments itself _"Legacy alias..."_
  and delegates to `lib/services/managed-usage-summary-service.ts`
  (`getManagedUsageSummary`). Grep confirms **zero non-test callers anywhere
  in web, desktop, or mobile** for `usage/analytics`, `usage/history`,
  `usage/providers`; `billing/analytics` specifically **is** still called by
  desktop (`apps/desktop/src/stores/billingUsage.ts`). The actual web
  Settings > Usage panel (`UsageSection.tsx` via
  `lib/hooks/useManagedUsageSummary.ts:73`) calls the **base**
  `/api/usage` route, not any of these three aliases. **Verdict:
  BACKEND_ONLY / orphaned** for `usage/analytics`, `usage/history`,
  `usage/providers` specifically — intentionally kept for old clients per
  their own docstrings, but nothing currently exercises them.
- Mobile IAP: `mobile/iap/{catalog,verify,apple-notifications,google-notifications}`
  — confirmed wired to `apps/mobile/src/features/billing/mobileIapService.ts`.
- Cron settlement: `cron/reconcile-credits` (scheduled), backed by
  `credit_settlement_jobs` / `credit_idempotency_keys` tables (real
  idempotent settlement machinery, not just a cron stub).

---

## 13. Search / RAG / embeddings — no vector backend; keyword search only

- **`GET/POST/DELETE /api/search/route.ts`** (475 lines) — full-text search
  across sessions, messages, projects, and files, entirely via Postgres
  `ILIKE` (`content ilike $2`, wildcard-escaped) and a handful of SQL
  functions (`get_recent_searches`, `get_popular_searches`,
  `get_search_suggestions`, `track_search`, `clear_search_history`). No
  ranking beyond `order by updated_at desc`.
- **`GET /api/memory/search/route.ts`** — same pattern, `ILIKE` over
  `user_memories.content`; its own docstring says: _"Simple ILIKE text
  search - can be upgraded to vector similarity later."_
- **`POST /api/llm/v1/embeddings/route.ts`** (306 lines) — a real,
  fully-implemented OpenAI-compatible embeddings gateway (reserve → call →
  settle billing, `Idempotency-Key` required, same pattern as image
  generation). Its own docstring is explicit about scope: _"The catalog
  already carried an embedding model with no route to reach it... this adds
  a capability rather than repairing a false claim."_ Grep confirms this
  route has **no internal caller** — it exists purely as a public API
  surface for external API consumers, not for any in-product RAG/search
  feature.
- **No `vector` column type anywhere** in `apps/web/db/neon/*.sql` (grepped
  every migration) — confirms there is no pgvector-backed embedding storage
  and no semantic-similarity retrieval path in the product today, despite
  the embeddings _generation_ endpoint existing.

**Verdict**: Search = COMPLETE as keyword search. RAG/semantic search =
**does not exist** as an internal capability — the raw materials (a working
embeddings endpoint) exist but nothing in the codebase stores or queries
vectors. Project "knowledge files" (§8) are stuffed into the prompt verbatim
(comment at `project-knowledge-extraction.ts:270`: "...is then parsed by
pdfjs, stuffed into every project turn's [context]"), not retrieved via
similarity search.

---

## 14. Connectors / MCP (server-side)

`apps/web/app/api/connectors/route.ts` (608 lines) — the connector
CRUD/status surface. Notable defensive comment (line 12): _"POST 501s
anything else so the UI cannot show a fake connected state"_ and (line 424)
_"Connector authorization is not implemented for this provider. Start the
provider-specific OAuth or credential flow instead of marking it active."_ —
this is a deliberate fail-closed guard against a specific failure mode (a
connector rendering "Connected" when it isn't), not an unfinished feature.
`connectors/oauth/{start,callback}`, `connectors/custom`,
`connectors/permissions` round out the surface; `connector_oauth_authorizations`
/ `connector_oauth_grants` / `connector_tool_permissions` tables back it
(RLS-hardened per `0069_connector_tool_permissions_rls.sql`,
`0097_connector_oauth_broker.sql`). Cross-referenced against §4's runtime
usage (`user-connector-tools.ts`) — this is the same connector state the
tool loop reads at request time. **Verdict: COMPLETE.**

---

## 15. Support / handoff, SSO, directory sync, SCIM (enterprise-admin-surface)

Present, sized non-trivially (`support/handoff/**` = 8 routes,
`admin/sso/**` + `scim/v2/**` = 11 routes), gated correctly (§10), backed by
real tables (`sso_connections`, `scim_*`, `support_handoff_*`,
`directory_sync_*`, `enterprise_audit_events`). Not deep-read line-by-line in
this pass (belongs to the enterprise-admin-surface lane per
`apps/web/AGENTS.md:15`, which calls for the enterprise lane/integrator) —
flagged as **NEEDS_VALIDATION** for a dedicated enterprise-surface audit
pass rather than claimed COMPLETE here.

---

## 16. Feature flags gating real functionality (`process.env` checks)

| Flag                                  | Effect                                                                                                                    | Default                                                                                           |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `AGI_MANAGED_COMPUTE_PRIVATE_BETA`    | Kill-switch for ALL managed-cloud chat/agent access (`lib/managed-compute-gate.ts`)                                       | **Open** (public alpha) — matches CLAUDE.md locked rule                                           |
| `AGI_WEB_MCP_PRIVATE_BETA`            | Gates `POST /api/mcp` (remote MCP connect-and-list)                                                                       | **Open** since 2026-07-11 per code comment                                                        |
| `AGI_E2B_EXECUTION` (+ `E2B_API_KEY`) | Gates E2B sandbox execution tool-offering AND the whole `code/sessions/**` Managed Code surface (§3c, §8 generated files) | **Off** by default; explicit operator opt-in, deliberately never inferred from key presence alone |
| `AGI_DURABLE_INITIAL_TURNS`           | Gates whether a paid turn starts on the durable Vercel Workflow transport vs. request-scoped inline stream (§1)           | checked via `areDurableInitialTurnsEnabled()`, not read further in this pass                      |
| `WEB_MCP_SERVERS_JSON`                | Populates the operator MCP tool catalog (§4)                                                                              | empty by default, not a boolean gate                                                              |

None of these hide functionality that has no backend — each one gates a
feature that is fully implemented behind it (confirmed by reading the gated
code, not just the flag check), which matches the CLAUDE.md instruction
that Local/BYOK/plan-entitled features should not read as globally
waitlisted while still being genuinely gated where the gate is a deliberate,
documented operator decision.

---

## 17. Duplicated implementations found

1. **Device pairing** — two independent code/token/approve flows (§10).
2. **`/api/agents/*` vs the Express `services/api-gateway` agents router**
   (§3a) — the web-side one is retired in place, so this is a _resolved_
   duplication (one side 410s), not an active conflict, but the tables and
   comments remain as evidence of the original duplication.
3. **`billing/analytics` / `usage/analytics` / `usage/history` /
   `usage/providers`** all wrap the exact same
   `getManagedUsageSummary(userId)` call (§12) with different route paths —
   four routes, one underlying function, three of the four routes
   apparently orphaned.

---

## 18. Routes returning hardcoded/mock data or 501/TODO

Grepped every `route.ts` for `mock|fake|hardcoded|TODO|FIXME|not implemented|
coming soon` (case-insensitive). Every hit inspected was either (a) a
negation/defensive comment ("no hardcoded id," "cannot show a fake connected
state"), (b) a tracked, dated TODO with a deprecation metric
(`portal/route.ts:199`, `TODO(2026-Q3)` for an email-fallback removal), or
(c) the intentional 501 in `connectors/route.ts:424` for unimplemented
provider-specific OAuth (fails closed rather than faking success). **No
route was found silently returning fabricated data as if it were real.**
This is the strongest positive signal in the whole pass — the codebase's own
comments actively argue against exactly the failure modes this audit looks
for.

---

## Summary table

| Area                                                   | Verdict                                    | Key evidence                                                |
| ------------------------------------------------------ | ------------------------------------------ | ----------------------------------------------------------- |
| Chat completions / streaming                           | COMPLETE                                   | `llm/v1/chat/completions/route.ts`, `WebChatRuntime.ts:195` |
| Deep Research                                          | COMPLETE (gated: non-Anthropic, paid only) | `research-loop.ts`, `research/reports/route.ts`             |
| `/api/agents/*` legacy subsystem                       | RETIRED (410, intentional)                 | 8 routes, identical STB-20 comment                          |
| Cloud Agent Runs (real agent runtime)                  | COMPLETE                                   | `cloud-agent-run-service.ts`                                |
| Managed Code agent turn + approvals                    | BACKEND_ONLY                               | no caller in `cloud-code-api.ts` or anywhere                |
| Managed Code terminal/sessions                         | COMPLETE (flag-gated)                      | `CloudCodePage.tsx` → `cloud-code-api.ts`                   |
| Tool runtime (web_search/url_fetch/E2B/MCP/connectors) | COMPLETE                                   | tool-loop.ts, mcp-tool-executor.ts                          |
| Model registry & routing                               | COMPLETE                                   | `models/route.ts`, `adapter-providers.ts`                   |
| Skills                                                 | COMPLETE                                   | `skills/route.ts`                                           |
| Plugins                                                | COMPLETE                                   | `plugins/route.ts`                                          |
| File upload/parsing (PDF/text/notebook)                | COMPLETE                                   | `project-knowledge-extraction.ts`                           |
| File parsing (spreadsheet)                             | MISSING                                    | no xlsx/csv parser found                                    |
| Cron infrastructure                                    | COMPLETE (8/9 scheduled; 1 orphaned)       | `vercel.json`, `cron-auth.ts`                               |
| `cron/expire-organization-invitations`                 | NEEDS_VALIDATION                           | no `vercel.json` entry                                      |
| User-facing Schedules feature                          | COMPLETE                                   | `features/schedules/**`                                     |
| Auth (Clerk + device flows)                            | COMPLETE, minor duplication risk           | §10                                                         |
| Admin/RBAC gating                                      | COMPLETE                                   | verified per-route                                          |
| Webhooks (Stripe/GitHub)                               | COMPLETE, signature-verified               | §10                                                         |
| Billing core                                           | COMPLETE                                   | `features/billing/**`                                       |
| Billing/usage legacy aliases (3 of 4)                  | BACKEND_ONLY/orphaned                      | §12                                                         |
| Search                                                 | COMPLETE (keyword only)                    | `search/route.ts`                                           |
| RAG / vector search                                    | MISSING (not built)                        | no `vector` columns anywhere                                |
| Embeddings endpoint                                    | BACKEND_ONLY (public API only)             | `llm/v1/embeddings/route.ts`                                |
| Connectors/MCP server-side                             | COMPLETE                                   | `connectors/route.ts`                                       |
| Enterprise (SSO/SCIM/directory-sync/support-handoff)   | NEEDS_VALIDATION (out of deep-read budget) | §15                                                         |
| Dead DB tables                                         | 9 confirmed (erasure-only) + 2 fully dead  | §11                                                         |
| `teams`/`team_members` drop                            | PENDING, founder-gated, not yet applied    | `0058_drop_legacy_teams.sql`                                |
| Hardcoded/mock data in routes                          | NONE FOUND                                 | §18                                                         |

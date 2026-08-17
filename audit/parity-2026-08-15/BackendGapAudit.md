# Backend & Runtime Gap Audit

Audit round: 2026-08-15 · Commit `e15df56e3` (`compliance/dpdp`), working tree
clean. This document synthesizes — it does not re-derive — findings already
filed in `gaps/domain-backend-runtime.{md,json}`,
`gaps/domain-search-research.{md,json}`, `gaps/domain-memory.{md,json}`,
`gaps/domain-extensibility.{md,json}`, `gaps/domain-agentic-work.{md,json}`,
plus `inventory/web-backend.md` (703 lines) and `inventory/runtime-infra.md`
(461 lines). Every claim below carries its originating file:line citation;
nothing here is a new discovery.

**Scope.** Conversation runtime; agent runtime; tool runtime; model runtime;
context (memory, projects, files, search, RAG, connectors, skills); execution
(code sandbox, browser sandbox, computer-use, filesystem, local/cloud/remote);
persistence; synchronization; security (authn, authz, RBAC, OAuth, MCP
permissions, tool approvals, sandbox boundaries, network policy, secrets,
audit logs, retention, workspace policy). Purely visual/IA gaps that happen to
live in the same domain files (e.g. mobile Skills nav entry, desktop tab
naming) are named once for completeness but not re-argued here — they belong
to the UI-facing companion documents.

**Totals in scope for this document:** 46 filed gaps (1×P0, 15×P1, 20×P2,
10×P3) drawn from five domain passes, plus two Chrome-extension security
findings and one desktop finding (`voice_inject_text`) the task brief
specifically asked to be carried here as runtime/permission issues rather than
UI issues.

---

## Headline

The request path that matters most — `apps/web/app/api/llm/v1/chat/completions/route.ts`
(950 lines) and its ~70 supporting `lib/` modules — is, in the audit's own
words, "the most carefully engineered code path found anywhere in this pass."
Real provider failover, fail-closed per-tool approval checkpoints, durable
resume across disconnects, context-window compaction, and per-plan concurrency
governance are all live, tested, and wired end-to-end
(`inventory/web-backend.md` §1). Deep Research, the connector OAuth broker,
the tool-permission enforcement layer, and the Cloud Agent Run durable
state machine are similarly real, not aspirational.

Against that foundation, the gaps cluster into four repeatable shapes rather
than "the backend is broken":

1. **Built but disconnected.** A complete backend with zero UI caller
   (Cloud Code agent-turn endpoints, `BACKEND-RUNTIME-001`), a complete Rust
   subsystem the frontend never wires (Desktop background agents,
   `AGENTIC-WORK-001`, the one **P0** in this document), a working heuristic
   with zero callers (`skill_match_for_message`, `EXTENSIBILITY-004`).
2. **A missing primitive everything else is blocked on.** No `vector` column
   exists anywhere in `apps/web/db/neon/*.sql`; a fully-billed embeddings
   endpoint has no internal caller; three sibling gaps (semantic memory
   search, semantic chat search, project-knowledge relevance) are all really
   one backend gap wearing three names (`BACKEND-RUNTIME-006`).
3. **A security control that fails open silently.** The desktop MCP
   slopsquatting allow-list is real code, guarded by a real comment, and is
   never bundled into a release build (`EXTENSIBILITY-003`). A dictation
   command shipped despite its own doc comment saying it must not
   (`voice_inject_text`).
4. **Duplication with an unresolved "which one is production" question.**
   `services/api-gateway` duplicates the REST surface `apps/web` actually
   serves; two independent device-pairing systems exist; two Rust structs
   share the name `CloudSyncClient`, one of them dead.

None of these needs new product surface to fix. Every one is a wiring or
scheduling problem in code that already exists — the cheapest class of gap to
close, and the domain passes say so consistently.

---

## What's already excellent — credit it before gap-hunting

| Area                                            | Evidence                                                                                                                                           | Why it matters                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Chat/tool-loop streaming runtime                | `apps/web/app/api/llm/v1/chat/completions/route.ts` + `lib/tool-loop.ts`, `lib/managed-failover.ts`, `lib/context-window.ts` (`web-backend.md` §1) | Cancellation via `request.signal` threaded through provider stream, tool loop, and durable Workflow transport alike; GOV-3 per-plan concurrent-turn admission closes a real gap rate-limiting alone can't (N simultaneous long streams); every failure exit refunds a held credit reservation.                                                                                                                                                                                                        |
| Fail-closed tool approval                       | `lib/tool-loop.ts`, `connector-tool-permissions.ts:2-19,29,71-143`                                                                                 | Saved allow/ask/deny verdicts load **before** the tool catalog is built; re-enforced again on resume so a stale or forged client decision cannot execute a denied tool (AUDIT-FIX CON-1/CON-2).                                                                                                                                                                                                                                                                                                       |
| Durable resume + cross-device cancel/approve    | `lib/workflows/cloud-agent-workflow.ts`, `cloud-agent-run-service.ts`, `approve/route.ts:288`                                                      | Vercel Workflow DevKit transport genuinely outlives the originating request; `isCloudAgentRunCancellationRequested` is a DB-polled flag, so a stop request from a different device/tab lands mid-run; pending approvals are answerable from Desktop, Web, or Mobile via the same signed checkpoint endpoint (`agentic-work.md` Strengths #1-2).                                                                                                                                                       |
| Deep Research engine                            | `apps/web/app/api/llm/v1/chat/completions/lib/research-loop.ts`                                                                                    | Genuine plan → multi-round search → cited-synthesis loop with cancellation, retry-that-resumes (stable citation numbers), and durable persistence — assessed as matching or exceeding what could be confirmed about ChatGPT/Claude's own research UI (`search-research.md` Summary).                                                                                                                                                                                                                  |
| Connector OAuth broker + permission model       | `apps/web/lib/connectors/oauth-registry.ts:43-46,84-97`, `connector-tool-permissions.ts`                                                           | Real PKCE authorization-code flow, server-derived redirect URI (never from `Host`); allow/ask/deny enforced twice (offer-time and resume-time), matching or exceeding Claude/ChatGPT's documented connector permission UX.                                                                                                                                                                                                                                                                            |
| Memory prompt-injection fencing                 | `packages/platform/utils/src/fence.ts` (TS) + `apps/desktop/src-tauri/src/core/llm/memory_integration.rs:27,312` (Rust)                            | Two independently-written implementations converge on identical wording — a real cross-team convention, not a one-off patch; a dedicated test asserts oversized/malicious memories stay bounded untrusted data (`domain-memory.md` Strengths #1).                                                                                                                                                                                                                                                     |
| Mobile Local/Cloud memory isolation             | `apps/mobile/stores/memory/cloudMemoryStore.ts`, `apps/web/app/api/memory/sync/route.ts`                                                           | UUIDv7 client-generated ids, server-version compare-and-swap conflict resolution, tombstone-based delete propagation; `CloudMemoryEntry` and Local's SQLite `MemoryFact` are genuinely separate types with no shared code path (`domain-memory.md` Strengths #2).                                                                                                                                                                                                                                     |
| Desktop Local/BYOK/Managed-Cloud trust boundary | `send_message_setup.rs:66-75` (`derive_cloud_sync_enabled`), reused verbatim by `memory.rs:25` and `projects.rs:21`                                | `active_mode == "local"` forces `cloud_sync_enabled = false` unconditionally, regardless of the stored sync preference; one pure function, not three independent (driftable) copies; regression tests are explicitly labeled `TRUST-BOUNDARY` (`inventory/desktop-tauri.md` §5). Independently re-verified: desktop's consent/folder-access/sandbox-confirmation work "is real, deeply wired, and covered by tests that assert actual behaviour" (`done-claim-verification.md:31-33`; GAP-002, Done). |
| Chrome extension trust boundary                 | `conversation-history.ts:1465-1468` `isCloudPersistenceEligible`, `check-no-cloud-ipc-v1.mjs`                                                      | `.every()` gate over the full transcript — one non-`managed-cloud` message anywhere disqualifies the whole conversation from cloud mirroring; a build-time egress-lint script fails the build on any direct cloud-IPC call outside the designated bridge; 112 test files / **1,549 tests**, all pass (`extension-chrome.md` §6, line 5).                                                                                                                                                              |
| E2B code-execution sandbox                      | `apps/web/lib/e2b/runtime.ts:1-15`, `lib/e2b/gate.ts`                                                                                              | "Gated + fail-closed: returns null unless E2B is configured... never a silent no-op and never a provider-native fallback"; two-flag design (`e2bExecutionEnabled` vs `e2bCutoverEnabled`) explicitly prevents an API key alone silently opening managed compute (`runtime-infra.md` §6, `web-backend.md` §16).                                                                                                                                                                                        |
| CLI supply-chain hardening                      | `install.sh:1-11`, `apps/cli/src/features/plugins/registry.rs:73-117,463-528`                                                                      | Curl-pipe installer requires cosign Sigstore signature verification; CLI plugin install does SHA-256 verification with an explicit unverified-artifact opt-in — assessed as more rigorous than either benchmark documents publicly for its own install pipeline (`domain-extensibility.md` §2, `runtime-infra.md` §5).                                                                                                                                                                                |
| No fabricated data anywhere in the route tree   | repo-wide grep across all 218 `route.ts` files                                                                                                     | Every `mock/fake/hardcoded/TODO/not implemented` hit was either a negation comment or an honest, tracked stub — never silent fake data (`web-backend.md` §18). Independently reproduced by `domain-backend-runtime.md`'s own headline.                                                                                                                                                                                                                                                                |
| Scheduled-cadence honesty pattern               | `assertDeliverableCadence`, `schedule-time.ts:384-411`, `schedule-cadence.test.ts`                                                                 | A hosting-tier constraint (Vercel Hobby daily-cron floor) is enforced as an explicit, tested rejection at the write boundary rather than silently promising and failing to deliver a tighter cadence (`agentic-work.md` Strengths #3).                                                                                                                                                                                                                                                                |
| Plugin registry integrity                       | `apps/web/db/neon/0096_plugin_registry.sql:26-30,86-89`                                                                                            | A DB-level CHECK constraint makes it schema-illegal for a `preview` row to carry a `manifest_url`/`sha256` — a stronger guarantee against fake-install-state than most products offer at the application layer (`domain-extensibility.md` §2).                                                                                                                                                                                                                                                        |
| Admin/RBAC + webhook signature verification     | `web-backend.md` §10                                                                                                                               | All 16 `admin/**`/`settings/organization/**` routes verified to enforce admin/owner/org-role before mutating; Stripe (`stripe.webhooks.constructEvent`, pinned to Node runtime because Edge silently breaks HMAC) and GitHub (`verifyGitHubWebhookSignature`) webhooks both properly signature-verified before the body is touched.                                                                                                                                                                   |

---

## 1. Conversation runtime

**Verdict: COMPLETE**, no gap filed against the core path itself in this
round. `route.ts` resolves provider via `ADAPTER_PROVIDERS`
(`lib/adapter-providers.ts`) — one dispatch table shared by the plain-stream
and tool-loop paths, confirmed no parallel table exists
(`web-backend.md` §1, §5). Streaming is OpenAI-compatible SSE extended with
`x_tool_status` / `x_tool_approval_request` / `x_tool_result` / a canonical
`x_agent_event` envelope, with idle-stream keepalive (`lib/sse-heartbeat.ts`)
applied uniformly across research-loop, tool-loop, and durable-workflow
streams. Context assembly and compaction (`context-window.ts`,
`trimToolResultHistory`) trims history to the resolved model's context window
rather than erroring or silently dropping turns.

The two conversation-runtime-adjacent gaps that do exist are filed under
**agent runtime** below because they're about what happens to a run once it's
underway, not the base streaming/dispatch mechanics:

- **`AGENTIC-WORK-003`** (P1) — the durable-resume transport itself works,
  but ships opt-in behind `AGI_DURABLE_INITIAL_TURNS`, off by default
  (`.env.example:219` ships it commented at `0`), while `CHANGELOG.md:329-330`
  describes the same flag with "kill-switch" language implying default-on.
- **`AGENTIC-WORK-005`** (P1) — mid-run steering. `route.ts:165-199` hard-blocks
  any new message into a conversation with an active managed run (HTTP 409
  `conversation_run_in_progress`); the only intervention point is the binary
  tool-approval resume, whose wire schema (`ToolApprovalDecisionSchema`) is
  strictly `{tool_call_id, decision}` — no field exists for attaching
  free-text guidance to an approval decision. ChatGPT/Codex's Remote Control
  GA'd "view/steer a running host session" May 29, 2026; this repo can only
  fully Stop and lose partial progress.

---

## 2. Agent runtime

Two systems coexist and one governs everything live; a separate, complete
agent-turn backend for Managed Code has no caller; and the flagship finding of
this audit round — a fully built desktop background-agent subsystem — is
completely invisible to users once started.

| ID                    | Sev    | Feature                         | One-line                                                                                                                          |
| --------------------- | ------ | ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `AGENTIC-WORK-001`    | **P0** | Desktop background agents       | 8-parallel-agent Rust subsystem with full state machine — zero frontend wiring beyond the model's own tool call to start one      |
| `BACKEND-RUNTIME-001` | P1     | Managed Code agent-turn backend | `handleAgentTurn` + approval endpoints fully built; `CloudCodePage.tsx` only sends raw terminal commands                          |
| `AGENTIC-WORK-002`    | P1     | `/tasks` auth gating            | `proxy.ts`'s protected-route matcher omits `/tasks`; anonymous visit renders the full authenticated shell stuck loading           |
| `AGENTIC-WORK-003`    | P1     | Durable background execution    | Real transport, opt-in/off-by-default, contradicting its own CHANGELOG "kill-switch" framing                                      |
| `AGENTIC-WORK-004`    | P1     | Scheduled task cadence          | Architectural once-daily ceiling; now honestly enforced (not silently violated), but hourly monitoring is impossible product-wide |
| `AGENTIC-WORK-005`    | P1     | Mid-run steering                | New messages hard-blocked (409) during an active run; no free-text guidance field on the approval decision either                 |
| `AGENTIC-WORK-006`    | P2     | Standalone Cowork surface       | AGI Work remains a composer mode, not an independent workspace object with its own creation entry point                           |
| `AGENTIC-WORK-007`    | P1     | Scheduled task tool access      | Scheduled runs execute as a bare, tool-free chat completion — no search, code exec, MCP, connectors, or files                     |

### `AGENTIC-WORK-001` — Desktop background agents: fully built, fully dark (P0)

`apps/desktop/src-tauri/src/core/agent/background_agent.rs` — doc-commented
as "inspired by Cursor's `&` prefix pattern" — implements up to 8 parallel
autonomous agents with a full state machine
(`Queued → Running ⇄ Paused → Completed/Failed/Cancelled/TakenOver`), a
24-hour default timeout, and 9 distinct native events. Eleven Tauri commands
are registered in `lib.rs` (push, list, list*active, get, pause, resume,
cancel, take_over, stats, cleanup, should_push). Tracing every command name
through `apps/desktop/src` finds only an invoke-allowlist array
(`registeredCommands.ts:174-184`) and a dev/test mock's `switch` cases
(`tauri-mock.ts:1319-1369`) — neither is a caller. The only way a background
agent is ever created is the LLM itself deciding, mid-conversation, to call
the approval-gated `background_agent_start` tool
(`tool_executor/mod.rs:2218-2222`, `risk_level: High`). No `&`-prefix parser
or "push to background" button exists in the chat input. Once running, the
frontend listens to exactly 2 of 9 native events (`completed`, `failed`) —
`progress`/`started`/`created` have zero listeners, so there is no live view
of what the agent is doing. `list`, `pause`, `resume`, `take_over`, `stats`,
`cleanup` are called by nothing, not even the model's own tool loop. The
desktop's visible task-monitor panel wires a *different*, simpler `bg*\*`job
queue with no "take over" concept at all;`backgroundTaskStore.ts:7-8`even
contains a comment pointing to a`backgroundAgentStore.ts`that would
presumably wire the real system — that file does not exist anywhere in the
repository. Net effect: an approval-gated but otherwise fully autonomous
agent with`SystemOperation` capability and folder-execute access can run for
up to 24 hours with no way for the user to check on it, pause it, or reclaim
it beyond a start-time prompt and an end-of-run notification.

### `BACKEND-RUNTIME-001` — Managed Code agent turn, unreachable (P1)

`apps/web/app/api/code/sessions/[sessionId]/agent/route.ts` (124 lines, real
`handleAgentTurn`) and `agent/approvals/route.ts` (136 lines) are fully
implemented — auth, CSRF, rate limit, subscription-tier check,
`decideCloudCodeAgentApproval`. `cloud-code-api.ts` is the only in-repo caller
of `/api/code/sessions/**` and calls exactly `list, get, create, delete,
commands` — never `.../agent`. `CloudCodePage.tsx`'s only mention of "agent"
is a static string pointing the user at the VS Code extension instead (line
660). This is CLAUDE.md's named failure mode inverted: the API is complete
and nothing renders the control at all. Today, Cloud Code in the browser is
"run a terminal command in a sandbox," not "hand a task to an agent" — the
latter is the entire pitch of the Codex/Claude Code category and the backend
for it already exists (`web-backend.md` §3c).

### `AGENTIC-WORK-007` — Scheduled tasks run with zero tools (P1)

`apps/web/lib/services/scheduled-agent-executor.ts:124-135` builds the
provider request for every scheduled run as a bare two-message,
non-streaming completion (`max_tokens: 4096`) with **no `tools` field at
all** — no web search, no code execution, no MCP, no user connectors, no
file access. The system prompt ("Do not claim to have performed external
actions unless a tool result proves it") reads as if tool use were expected;
none is ever attached. This sits below even ChatGPT's deliberately narrowed
Tasks (still executed inside a tool-aware runtime), and far below Claude
Cowork/routines' "full Skills/connector access while running unattended." A
broader, backend-level version of the already-tracked GAP-168 (mobile UI has
no connector-binding control for schedules).

**What's real and strong here, not just gap-hunted:** the Cloud Agent Run
state machine (`cloud-agent-run-service.ts`) models a proper
`queued/running/paused/awaiting_input/ready_for_review/…` machine with a
durable event journal, idempotent billing reservation/settlement, and
cursor-based reattachment; the retired `/api/agents/*` subsystem (8 routes,
all 410) is a deliberately-neutered dead subsystem, not a half-finished
feature — each carries an identical comment naming the exact bug class it
closes (STB-20, `web-backend.md` §3a); and Web's `/tasks`
(`packages/ui/unified-chat` `TasksPage`) is a real shared component with
Progress/Outputs/Context sections and a "re-run" action that correctly mints
a fresh run rather than replaying a stale billing reservation.

---

## 3. Tool runtime

**Verdict: COMPLETE and reachable** for the core loop
(`web-backend.md` §4) — built-in platform tools (`web_search`, `url_fetch`,
E2B execution, office-file generation, `skill`), an operator MCP catalog that
explicitly refuses stdio transports as an SSRF defense
(`mcp-tool-executor.ts`), a per-user connector tool catalog capped by plan
(GOV-7), and timeouts (`withToolTimeout`, `withProviderStreamDeadline`)
bounding both individual calls and the whole provider stream. The gaps are
about reach into secondary surfaces and one security control that fails open:

| ID                    | Sev | Surface          | One-line                                                                                                                      |
| --------------------- | --- | ---------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `EXTENSIBILITY-003`   | P1  | desktop-tauri    | MCP slopsquatting allow-list never bundled — fails open in every release build                                                |
| `EXTENSIBILITY-004`   | P1  | cross-surface    | No automatic/progressive-disclosure skill invocation anywhere — the one Rust function built for it has zero callers           |
| `EXTENSIBILITY-006`   | P2  | web              | 87 of 89 catalog connectors are `501` by default — architecture real, zero-configured out of the box                          |
| `EXTENSIBILITY-007`   | P2  | extension-chrome | Zero skills/plugins/connectors surface — attach menu carries 2 items where shared desktop carries 7                           |
| `EXTENSIBILITY-008`   | P2  | backend          | Org/team skill + plugin governance duplicated and unenforced (cites `CAP-009`/`CAP-010`)                                      |
| `EXTENSIBILITY-005`   | P2  | desktop-tauri    | Cloud skill "download" is a dead-end raw file link with no import path into the skill directory chat actually reads from      |
| `SEARCH-RESEARCH-005` | P2  | extension-chrome | Side panel has no manual "Search the web" toggle or Deep Research entry — search only fires when the model decides to call it |

### `EXTENSIBILITY-003` — MCP slopsquatting allow-list fails open (P1, security-gap)

`install_bundle()` in `config.rs` loads `mcp-allowlist.json` via
`std::path::PathBuf::from("mcp-allowlist.json")` — a path relative to the
process's **current working directory**, not the app's resource or config
directory. The file's own comment documents the fallback: "Absence of the
file = open mode (dev)." `tauri.conf.json`'s `bundle` block (lines 50-86) has
no `resources` entry referencing it, so it is never packaged into any release
build. In every shipped installer the CWD-relative lookup fails, the
allow-list silently resolves to `None`, and `install_bundle()` skips the
entire check — any npm package, including a typosquatted one, can be
installed as an MCP server. The control's own comment names it
"AUDIT-FIX: CI-5 — slopsquatting defense"; it does not run in the builds it
ships in (`GapMatrix.md` EXTENSIBILITY-003; `inventory/desktop-tauri.md` §4).
**Recommendation:** bundle the file as a declared Tauri resource, resolve its
path via the resource-dir API at runtime, and fail closed (not open) when the
file is missing in a release build.

### `EXTENSIBILITY-004` — No automatic skill invocation anywhere (P1)

Skills can only be invoked explicitly across every surface checked. Desktop
has a real token-matching heuristic, `skill_match_for_message`
(`skills.rs:342-414`), exposed to the frontend as `matchForMessage`
(`skillMarketplaceStore.ts:247,348-354`) — grepping the entire desktop
frontend for callers finds only its own declaration and implementation; no
chat component calls it. Web's tool loop requires an explicit
client-supplied `skill_name` field (`request-processor.ts`) and returns a
validation error if absent — there is no server-side relevance matching
against the message at all. A skill is only ever loaded because a user
manually named it, never because the assistant recognized the message needed
it — this is Claude's defining "progressive disclosure" behavior, and this
repo has the matching function built and simply not called.

**What's genuinely good here:** the skills lockfile's own notes record that
it caught and discarded four previously-unverifiable skill hashes rather than
silently carrying them forward — supply-chain rigor around skill provenance
that neither benchmark's public documentation claims for itself
(`domain-extensibility.md` §1).

---

## 4. Model runtime

**Verdict: COMPLETE**, no new gaps filed against this domain in this pass
(model-selection/reasoning-effort UX gaps are covered in the sibling
`domain-models.md`, out of this document's scope). Source of truth is
`packages/contracts/types/src/models.json` (2,324 lines), consumed through
`@agiworkforce/types`. `ADAPTER_PROVIDERS` (`lib/adapter-providers.ts`) is
confirmed the single dispatch table for both the plain-stream and tool-loop
paths — `tool-loop-anthropic.ts` explicitly reuses it rather than
re-implementing a parallel table. Failover restricts candidates to
`isProviderDispatchable: (c) => Boolean(ADAPTER_PROVIDERS[c])`; per-model
tool-capability gating (`WEB-TOOLS-MODEL-CAP-GATE-01`) skips tool loading
entirely for a model whose registry `capabilities.tools` is false, rather
than sending a request the provider will reject (`web-backend.md` §5).

---

## 5. Context: memory, projects, files, search, RAG, connectors, skills

### 5.1 Memory

Memory is one of the more carefully engineered subsystems in the repo — the
prompt-injection fencing and mobile cloud-sync design are production-grade
(see strengths table) — but the product has a real surface-consistency
problem: Mobile is meaningfully ahead of Web on search/pin/summary/import/
past-chat retrieval, and Desktop has a fully-verified defect where the
Project Settings Memory tab shows and writes the **wrong** store.

| ID           | Sev | Surface       | One-line                                                                                                                        |
| ------------ | --- | ------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `MEMORY-001` | P1  | desktop-tauri | Project memory tab shows/writes the global store while chat inference correctly uses a separate, unused project-scoped store    |
| `MEMORY-002` | P1  | web           | No "search and reference past chats" — mobile already has a full reference implementation to port                               |
| `MEMORY-005` | P2  | backend       | ILIKE substring only; embeddings endpoint exists but unused for retrieval                                                       |
| `MEMORY-004` | P2  | web           | No project column exists at all; a prior decorative dropdown was honestly removed rather than shipped fake                      |
| `MEMORY-006` | P2  | web           | `pinned` column exists in Postgres, read server-side for prompt priority, but the REST CRUD routes never expose it              |
| `MEMORY-008` | P2  | web           | Suppression is content-term only; no way to suppress an entire source (connector/project) — cites `CAP-006`                     |
| `MEMORY-003` | P2  | cross-surface | Import-from-competitor parser is mobile-only, and it's better than Claude's own copy-paste-a-prompt version                     |
| `MEMORY-007` | P3  | cross-surface | `sourceConversationId` field exists (Mobile Local even populates it) but nothing renders it; Cloud drops the field structurally |
| `MEMORY-009` | P3  | desktop-tauri | Five-component orphaned memory-browser family, zero mounts                                                                      |
| `MEMORY-010` | P3  | web           | Unreachable second chat runtime's memory injection lacks the temporary-chat guard the live path has                             |

### `MEMORY-001` — Project memory tab shows/writes the wrong store (P1)

`ProjectSettingsDialog.tsx`'s Memory tab (line 1268-1291) mounts
`<MemoryManager>` under copy promising project-scoped memory; `MemoryManager`
(`MemoryManager.tsx:94-131`) reads `useMemoryStore().memories` — the flat,
global, device-wide list, with no `projectFolder`/`projectId` parameter
anywhere in its props. Meanwhile the chat runtime does this correctly one
layer down: `send_message_setup.rs:252-261` constructs
`ChatMemoryHandler::with_project_config`, and `memory_handler.rs:80-136`
reads/writes a dedicated per-project SQLite table via `ProjectMemoryManager`
with correct fallback to global-only on a corrupt project store. The
TypeScript equivalent, `apps/desktop/src/stores/projectMemoryStore.ts` —
backed by real `#[tauri::command]` handlers
(`sys/commands/project_memory.rs:101-280`) — has **zero UI callers**. A user
opening Project B's Memory tab sees and can edit Project A's and general-chat
memories with no indication they're unrelated; "Create memory" here writes to
the global store, silently leaking a project-specific note into every other
project and every non-project chat — the opposite of what the info box
promises. **Fix is a UI data-source swap, not new backend work** — everything
required already exists and is exercised by the real chat pipeline.

### `MEMORY-002` — No search-and-reference-past-chats on Web (P1)

Web only ever injects the curated `MemoryFact` list
(`WebChatRuntime.ts:181-189`); neither the client runtime nor the live server
path ever retrieves excerpts from the user's other conversations —
`/api/memory/search` and `/api/search` both exist as callable routes but are
never invoked from the chat send path (confirmed by grep; their only callers
are the sidebar search palette and their own test files). Mobile already
solved this: `pastChatContext.ts` scores past messages by query-term overlap,
fences the result as untrusted data, and is wired into the real send path
(`chatExecutionStore.ts:1253-1296`), gated by a preference and excluded for
temporary chats. Directly portable — reuse the scoring/fencing logic rather
than reinventing it.

### `MEMORY-006` — Web memory settings are structurally thinner than Mobile's (P2)

Not purely cosmetic: `pinned` exists as a Postgres column
(`0047_user_memories_pinned.sql`) and is read server-side by
`managed-memory-context-service.ts:149` to prioritize prompt inclusion, but
`/api/memory/route.ts:36,49-56` and `/api/memory/[id]/route.ts:22-103` omit
`pinned` from every select list and request/response shape. A Web pin UI
needs new API surface, not just new UI.

### 5.2 Search, Deep Research, and RAG

Deep Research is assessed as one of the best-engineered features found in
this entire audit (see strengths table); ordinary web search is similarly
mature — provider-aware routing derived from the model registry (native tool
for Anthropic/Google/OpenAI, Perplexity fallback for everyone else), budgeted
per-turn call limits, and prompt-injection-safe untrusted-content framing.
Desktop's Local mode ships a completely separate, native, multi-agent
research engine (Rust, `core/research/`, 4,294 lines, DuckDuckGo-default with
no API key required) — a genuinely local-first capability neither ChatGPT nor
Claude currently offer, cleanly gated behind the Local/Cloud trust boundary.
The gaps are entirely about **reach and consistency**, not the core engine:

| ID                    | Sev | Surface       | One-line                                                                                                                                                                                          |
| --------------------- | --- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SEARCH-RESEARCH-001` | P1  | backend       | Deep Research silently degrades to a single-turn, unbranded web-search fallback for Anthropic models and free-trial users, identical toggle, no visible difference                                |
| `SEARCH-RESEARCH-002` | P1  | cross-surface | Research progress/plan events and the persisted report are effectively web-only; Desktop parses but never renders; Mobile/Chrome don't parse at all; no non-web surface can reopen a saved report |
| `SEARCH-RESEARCH-003` | P2  | backend       | Research is strictly web-search-only — every client tool except `url_fetch` is stripped before gathering rounds, so no connector/connected-data integration                                       |
| `SEARCH-RESEARCH-004` | P2  | backend       | No semantic/vector retrieval anywhere — chat/memory/project-knowledge search is ILIKE substring matching (same root cause as `BACKEND-RUNTIME-006`)                                               |
| `SEARCH-RESEARCH-006` | P3  | backend       | No image-result or current-data (weather/stock/sports) card types — the benchmark itself flags this UNVERIFIED, low-confidence gap                                                                |

### `SEARCH-RESEARCH-001` — the one that matters most (P1)

`route.ts:314-316` gates the entire multi-stage research loop behind
`processed.researchMode && !processed.freeTrial && processed.provider.toLowerCase() !== 'anthropic'`.
The route's own comment justifies excluding Anthropic because "their raw
streams are only normalized by buildStreamResponse" — but that justification
appears **stale**: `tool-loop-anthropic.ts`'s own header comment documents
that this normalization was generalized from an Anthropic-only bridge months
ago specifically so every provider reaches the tool loop on the same
OpenAI-shaped SSE wire — the exact function `research-loop.ts`'s `runTurn()`
calls for every provider today. Nothing in current code appears to block
Anthropic from taking the same multi-turn path other providers use. Practical
effect: an Anthropic conversation with "Research" on gets `applyResearchMode()`
instead — a system-prompt injection plus the native Anthropic search tool
forced to `max_uses: 20` for **one** turn. No `x_research_status`/
`x_research_plan` events are ever emitted, so the plan/progress header never
mounts and no `research_reports` row is ever written — the Research panel's
Report tab permanently reads "No saved report yet." The composer's toggle
gives no indication: `modelSupportsResearch` gates purely on catalog
capability, rendering and enabling identically regardless of provider. A user
who explicitly turns on Deep Research on a Claude model gets a plain
web-searched answer with none of the branding, plan visibility, or persisted
report — and no way to tell from the UI that this happened.

### `BACKEND-RUNTIME-006` / `SEARCH-RESEARCH-004` / `MEMORY-005` — the RAG root cause, in one place (P2)

Filed independently by three domain passes because it blocks three visible
symptoms, but it is **one backend gap**: `POST /api/llm/v1/embeddings`
(306 lines) is a complete, billed, OpenAI-compatible embeddings endpoint with
**zero internal callers** — it exists purely as an external API surface.
`/api/memory/search`'s own docstring says "Simple ILIKE text search — can be
upgraded to vector similarity later." `/api/search/route.ts` (475 lines) is
the same pattern for sessions/messages/projects/files. No migration in
`apps/web/db/neon/*.sql` (all 119, grepped in full) declares a `vector`
column or `pgvector` extension. Project "knowledge files" are parsed and
stuffed verbatim (truncated to a budget) into every project turn's prompt
rather than retrieved by relevance (`project-knowledge-extraction.ts:270`).
**Sequencing recommendation, stated identically by both filing domains:**
build one pgvector-backed store (chunk + embed via the already-built
embeddings endpoint + ANN index) and let semantic memory search, semantic
chat/session search, and project-knowledge relevance all consume it — rather
than three independent retrieval implementations growing up around the same
missing primitive.

### 5.3 Files / project knowledge

`web-backend.md` §8: real PDF text extraction (`pdfjs-dist`) and
Jupyter-notebook text extraction, upload bytes scanned
(`lib/security/upload-scan.ts`) and checked against a moderation denylist
before extraction, presigned direct-to-R2 upload with a local-storage
fallback when object storage isn't configured (degrades gracefully rather
than 500ing). **No server-side spreadsheet (xlsx/csv) parser exists anywhere
in `apps/web/lib`** — spreadsheet content is only referenced as a regex
subject-matcher for routing execution-capable models
(`RE_DATA_EXECUTION_SUBJECT`), never actually parsed server-side. This is the
backend half of `PROJECTS-FILES-001` (filed in the sibling
`domain-projects-files.json`, out of this document's primary scope, but the
backend absence is worth naming here since it's a concrete "MISSING" verdict
in the inventory's own summary table.

### 5.4 & 5.5 Skills and Connectors/MCP

Covered under §3 (Tool runtime) above, since both are reached exclusively
through the tool-loop/catalog machinery: `EXTENSIBILITY-003` through `-008`.
Worth restating the one genuine strength not yet mentioned: the connector
permission model (`connector-tool-permissions.ts`) enforces saved allow/ask/
deny decisions **before** the tool catalog is even built, then re-enforces
them again on the resume/approve path — a stale or forged client decision
cannot execute a denied tool. This is the same discipline the chat runtime
applies everywhere else in this codebase.

---

## 6. Execution: code sandbox, browser sandbox, computer-use, filesystem, local/cloud/remote

| Runtime                             | Verdict                                                   | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ----------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Code-execution sandbox (E2B)        | **COMPLETE**                                              | `apps/web/lib/e2b/runtime.ts` (734 lines) — real `@e2b/code-interpreter` binding, fail-closed on misconfiguration, Redis session persistence, plan-based sandbox/TTL limits, compute metering (`runtime-infra.md` §6).                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Browser/artifact sandbox            | **COMPLETE as a _display_ sandbox — not code execution**  | `infrastructure/sandbox/index.html` (477 lines, no build step): `connect-src 'none'` CSP, `srcdoc` iframe isolation (not `innerHTML`), DOMPurify for SVG with pinned SRI hash, parent-origin allowlist. React artifacts transpile client-side via Babel standalone and are **not** sandboxed beyond the iframe/CSP boundary — a malicious React artifact can still manipulate the DOM inside that origin (`<img src>` beaconing isn't blocked by CSP even though `fetch` is). Should not be conflated with "the code sandbox" in product messaging (`runtime-infra.md` §3).                                                                                                    |
| Computer-use runtime (Desktop)      | **COMPLETE**                                              | `apps/desktop/src-tauri/src/automation/computer_use/action_executor.rs` (378 lines) — real OS input simulation (`enigo`/`rdev`) and real screen capture (`xcap`) with HiDPI coordinate translation; all 13 `computer_use_*` commands have live frontend callers, none appear in the desktop's dead-command list (`desktop-tauri.md` §9, `runtime-infra.md` §6).                                                                                                                                                                                                                                                                                                                |
| CLI shell-command sandbox — macOS   | **COMPLETE**                                              | Real Seatbelt SBPL profile with a documented CVE-class fix for string injection via workspace paths (`validate_and_escape_seatbelt_path`), asserted per-preset by unit tests (`runtime-infra.md` §4).                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| CLI shell-command sandbox — Windows | **MISSING, self-documented** — `BACKEND-RUNTIME-009` (P1) | `SandboxType::detect()` never returns anything on Windows; `windows_sandbox.rs`'s `install_filter` explicitly errors even with its feature flag on ("AppContainer integration is a v1.8 work item"). `SandboxManager::for_command_execution` fails **closed**, so the CLI's core workflow — an agent running shell commands — does not work on Windows by default; the only way through is `--no-sandbox`, which removes sandboxing entirely rather than degrading gracefully. Honestly self-documented (unlike a silently broken feature), which is why it's P1 not P0 — but it is still a whole supported platform with no safe default path for the CLI's primary workflow. |
| CLI shell-command sandbox — Linux   | **PARTIAL** — `BACKEND-RUNTIME-010` (P2)                  | A tested in-process seccomp-BPF sandbox exists (`linux_sandbox.rs`, `seccompiler` crate) but its Cargo feature (`linux-seccomp`) isn't in the default set and isn't passed by the release build workflow (`release-cli.yml:191`). Shipped Linux binaries rely entirely on an externally-installed `bwrap`; if absent, the exec tool fails closed the same way as Windows.                                                                                                                                                                                                                                                                                                      |
| Filesystem access (Desktop)         | **COMPLETE, tested**                                      | Folder-access consent, sandbox-confirmation work independently re-verified as "real, deeply wired, and covered by tests that assert actual behaviour" (`done-claim-verification.md:31-33`; GAP-002, Done).                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |

**CI coverage gap adjacent to this section:** `BACKEND-RUNTIME-011` (P2) — no
CI job runs `cargo test --workspace` on all targets, on any platform. The
main Linux job scopes to two binary crates' own unit tests with a stale
comment referencing "100+ ported codex-rs crates" (the workspace was pruned
to 12 crates on 2026-07-08, per `Cargo.toml:7-13`; the referenced tracking
issue `FIX-021` appears nowhere in `known-flaws.md`/`PLAN.md`/`CHANGELOG.md`).
The crates whose integration-test suites are compiled but never executed in
CI include `agiworkforce-mcp` (RFC 9728/8414/7591 OAuth PKCE flow) and
`agiworkforce-llm`/`agiworkforce-protocol` (SSE stream decoding, JSON-RPC
framing) — both security- and correctness-sensitive.

---

## 7. Persistence

`apps/web/db/neon` carries 119 numbered migrations, 117 distinct `create
table` statements, full down-migration coverage from `0097` onward. Live
agentic/tool-bearing turns are wrapped in durable `CloudAgentRun` rows with a
durable event journal; every terminal path of a research run (completed/
failed/interrupted, including abrupt client teardown) persists exactly once
and never throws into the stream (`research-loop.ts` `persistRun`). The one
finding here is schema-hygiene, not correctness risk:

### `BACKEND-RUNTIME-013` — Legacy/dead tables + an authored-but-unapplied migration (P3)

Nine tables (`agent_tools`, `agent_tool_executions`, `agent_approval_requests`,
`chat_messages`, `chat_folders`, `message_bookmarks`, `message_reactions`,
`user_shortcuts`, `messaging_connections`) are touched by exactly one code
path each — the GDPR/DPDP account-erasure sweep
(`lib/server/account-erasure.ts:60-91`) — kept alive correctly for compliance
completeness, no live feature behind any of them. Two tables (`referrals`,
`cloud_waitlist`) have zero application-code references at all;
`waitlistService.ts:10-12`'s own comment names `cloud_waitlist` as "the
older... table, not `cloud_managed_waitlist`," confirming supersession.
`0058_drop_legacy_teams.sql` is fully written to drop the also-fully-dead
`teams`/`team_members` pair, but its own header states: "FOUNDER-GATED: this
migration is NOT applied by this change... an explicitly-gated, separate,
founder-run step." This is legitimate, well-managed technical debt — the gap
is purely tracking risk: an authored-but-never-executed migration is easy to
lose track of. **Recommendation:** one tracked line item (known-flaws.md or a
schema-debt doc) listing all 11 tables and the pending 0058 migration
together, so the next auditor doesn't have to re-derive this list.

Independently, `MEMORY-007` (P3) notes a persistence-shape asymmetry: the
data model carries `sourceConversationId`
(`packages/ui/unified-chat/src/stores/memoryStore.ts:36-48`) and Mobile's
Local auto-consolidation genuinely populates and cleans it up correctly (a
tested nulling, not a cascade delete, on source-conversation deletion) — but
Cloud's `CloudMemoryEntry` has no conversation-reference field at all, so the
majority of real (signed-in, synced) usage loses provenance permanently at
the schema level, not just in the UI.

---

## 8. Synchronization

Mobile's cloud-sync design is production-grade (see strengths table); Web
correctly stays server-owned (no local store to reconcile) and only consumes
cursor mechanics for a pull-only artifact overlay; Desktop's Rust side
independently reimplements the same last-writer-wins-by-revision rules
(necessarily, since Rust cannot import a TS module), with parity kept honest
by a shared golden-fixture replay suite on both sides
(`domain-cross-surface.md` §5 — adjacent domain, cited for completeness since
it directly concerns backend sync contracts). One open verification question
from that same pass, not re-filed here: whether CI actually runs _both_ the
TS vitest suite and the Rust fixture-replay module whenever either side's
logic changes (`CROSS-SURFACE-011`, P3, explicitly NEEDS_VALIDATION rather
than asserted broken).

Two duplication findings sit squarely in this document's scope:

### `BACKEND-RUNTIME-003` — Duplicate `CloudSyncClient`, one dead (P2)

Two unrelated Rust structs share the name `CloudSyncClient`
(`apps/desktop/src-tauri/src`). `integrations::sync::CloudSyncClient`
(`cloud.rs:22`) defaults to `https://api.agiworkforce.com/api/sync` — a route
that does not exist anywhere under `apps/web/app/api` (confirmed: no
`app/api/sync` directory) — and its owner `SyncManager` is never instantiated
outside its own module. The live one, `data::cloud_sync::CloudSyncClient`,
hits the real `/api/chat/sync` route and is genuinely wired into five command
modules (`chat/conversation.rs`, `chat/persistence.rs`, `memory.rs`,
`projects.rs`, `artifacts/persistence.rs`). Independently corroborated: a
separate security-focused pass (`known-flaws.md` `BYOK-RUST-EGRESS-01`)
traced the same pair and concluded the first is "DORMANT — declared but
never instantiated" — two independent audit passes reaching the same
conclusion.

### `BACKEND-RUNTIME-004` — Two parallel device-pairing systems (P2)

`auth/device/{code,approve,token,refresh}` implements RFC 8628 CLI OAuth
device-code flow (`XXXX-XXXX` alphanumeric codes, `device_authorization_codes`
table), confirmed used by `packages/client/client-runtime/src/deviceAuthorization.ts`
and Desktop's `accountBridge.ts`/`cloudAccountAuth.ts`.
`device/{link,poll,approve}` implements QR-code device linking (hex codes via
the `qrcode` package, a separate `device_pairings` table, its own
`device-token-crypto.ts`). Both validate CSRF and rate-limit independently,
with distinct code-format regexes (`^[A-Z0-9]{4}-[A-Z0-9]{4}$` vs
`^[A-F0-9]+$`) — a maintainer skimming "device approve" could edit the wrong
one. **Not proven broken today** — this is a genuinely different finding from
the retracted sign-in/sign-up duplication claim below; see Corrections.
Recommendation: consolidate the code-format validation into one shared
module and rename the QR flow's routes to remove the near-collision, as a
low-risk hardening step rather than an urgent fix.

### `BACKEND-RUNTIME-002` — `services/api-gateway` duplicates `apps/web`'s API surface (P2)

`services/api-gateway` is real, tested, and now has genuine Fly.io CI/CD
(`infrastructure/api-gateway/fly.{staging,production}.toml`, dated
2026-08-09) — but its REST routers (`agents`, `chat`, `cloudChat`, `credits`,
`llm`, `usage`, `models`) structurally duplicate the Next.js routes doing the
same job. Mobile's `EXPO_PUBLIC_GATEWAY_URL` defaults to
`https://api.agiworkforce.com` — but `apps/web/next.config.ts:94-115` proves
that hostname is a Host-header rewrite onto the **same** Vercel deployment,
not the Fly-hosted service. `docs/agent-context/known-flaws.md`
(`SVC-DEPLOY-TOPOLOGY-VERCEL-SINGLE`) independently reaches the same
conclusion and records this as a still-pending founder decision: retire the
gateway's REST duplication, or keep only its WebSocket/QR-pairing core (the
one thing Vercel serverless structurally cannot host). Neither branch has
been taken; both implementations are maintained in parallel today. This
finding is corroborated a third time by `CROSS-SURFACE-008` (P2, filed
independently in the cross-surface domain pass) — three independent audit
angles converging on the same conclusion.

---

## 9. Security

### 9.1 Authn / authz / RBAC

**Verdict: no genuinely unauthenticated write path found** in this pass
(`web-backend.md` §10). Clerk-based auth plus a first-party HS256 bearer for
the CLI/device flow (identity-only, does not grant inference/billing); all 16
`admin/**`/`settings/organization/**` routes verified to gate on
admin/owner/org-role (some via a literal `requireAdmin`, others via inline
helpers — an initial grep for one literal helper name under-reported this
until manually re-checked route by route); SCIM (7 routes) bearer-token
authed via a dedicated `withScim` wrapper, correctly not Clerk-authenticated
since SCIM clients are IdPs, not browser users. `SETTINGS-008` (P2, filed in
the sibling settings domain, out of this document's primary scope but worth
naming) tracks passkey/WebAuthn and SMS-MFA absence — cites `GAP-115`.

### 9.2 OAuth, MCP permissions, tool approvals

Covered above (§3, §5.5, strengths table). Restated once for the security
lens specifically: the connector-tool-permission model is fail-closed by
design — saved deny verdicts are dropped from the tool catalog before the
model ever sees them, and denied tools are silently rewritten
`approved → rejected` on the resume path even if a client lies about what was
approved (`approve/route.ts`, AUDIT-FIX CON-1/CON-2). This is the same
pattern the rate-limit layer uses (§9.3) — a deliberate, documented split
between fail-closed-on-security and fail-open-with-a-logged-warning on
non-sensitive paths, not an accident (`lib/rate-limit.ts:1086-1108`).

### 9.3 Sandbox boundaries and network policy

Windows/Linux CLI sandbox gaps are detailed in §6. Network-policy strengths:
the operator MCP catalog explicitly refuses stdio transports as an SSRF
defense (spawning belongs to `services/api-gateway/src/mcp/`, not a Next.js
handler); `url_fetch` is SSRF-guarded; the artifact display sandbox's CSP
blocks all network exfiltration (`connect-src 'none'`). Desktop's egress-guard
logic treats `gateway.agiworkforce.com` as the real Express gateway, distinct
from the Vercel-rewritten `api.agiworkforce.com` (`egressGuard.test.ts:51`) —
correctly scoped, not conflated.

### 9.4 Secrets

BYOK key storage uses `tauri-plugin-stronghold` (Argon2id-hashed snapshot);
the secret manager deliberately avoids the OS keyring for its _primary_ use
("no keyring permission prompts"), deriving machine keys instead, while the
OS keyring crate is correctly used elsewhere for device/account tokens with
per-OS backends configured (not left on a default process-local mock that
silently loses data on restart) (`desktop-tauri.md` §5). No leak path from
Local to BYOK/Cloud was found in this pass.

### 9.5 Audit logs, CI coverage, observability

- `apps/cli/src/approval_audit.rs` and `services/approvalPolicy.ts` provide
  CLI-side and gateway-side audit trails respectively (not read line-by-line
  in this pass; presence confirmed, `runtime-infra.md` §7).
- **`BACKEND-RUNTIME-011`** (P2) — no CI job runs the full Rust workspace
  test suite (§6 above); security-relevant crates (`agiworkforce-mcp` OAuth,
  `agiworkforce-llm`/`agiworkforce-protocol` SSE/JSON-RPC parsing) are
  compiled-checked but never test-executed in CI.
- **`BACKEND-RUNTIME-012`** (P3) — `services/signaling-server` exposes real
  Prometheus metrics at `/metrics`; `services/api-gateway` has no equivalent
  (only `/health`/`/ready`). Neither service's `package.json` references
  Sentry or any error-tracking SDK — exceptions are logged via pino only,
  never forwarded to an APM tool.

### 9.6 Retention and workspace policy

Retention crons are wired and correctly scheduled
(`purge-temporary-chats`, `purge-deleted-media`, `purge-deleted-accounts`,
`expire-support-handoffs`) — 8 of 9 `vercel.json` crons are correctly
scheduled once-daily (`web-backend.md` §9). One is not:

### `BACKEND-RUNTIME-005` — Missing cron: organization invitations never expire (P2)

`cron/expire-organization-invitations/route.ts` exists, is well-built
(idempotent, bounded by `status='pending' and expires_at<=now()`), and its
own comment states the stakes precisely: "A pending invitation HOLDS a
licensed seat... If nothing ever flips a lapsed invitation to 'expired', that
seat is never returned and a team silently locks itself out of the seats it
paid for." `vercel.json`'s `crons` array has exactly 9 entries and this route
is not one of them — confirmed by parsing the array directly and enumerating
all 9 paths. Independently corroborated by `DEAD-CODE-005` (P1, filed in the
dead-code domain pass with a higher severity, same underlying finding — the
two domain analysts reached the identical conclusion from different entry
points). **Recommendation:** add one line to `vercel.json`'s `crons` array —
a one-line fix for a self-documented seat-lock bug.

### 9.7 The two Chrome-extension security findings

The Chrome extension's message-policy security layer
(`background/policy.ts`) is, in the inventory's own words, "a genuinely
above-average security pattern for a browser extension" — a single
declarative policy matrix classifying every message type, with a coverage
test that fails the build if any dispatched message type has no entry. Two
findings sit inside that otherwise-strong layer:

**1. Fail-open legacy scheduled-task check — `DEAD-CODE-021` (P3).**
`shouldExecuteScheduledTask()` (`background/policy.ts:728-735`) returns
`true` unconditionally when `task.createdByOrigin` is falsy: `// legacy task
pre-stamp; permit`. This is the _only_ fail-open branch in an otherwise
fail-closed provenance-gating codebase — every other origin/provenance gate
in this surface is fail-closed by the inventory's own review. A scheduled
task created before origin-stamping shipped will fire even though its origin
can no longer be verified against the current allowlist.
**Recommendation:** add a one-time migration that stamps `createdByOrigin` on
any existing task missing it, then flip the fallback to fail-closed (`return
false`) so a future unstamped task is auto-deleted rather than silently
permitted.

**2. No sensitive-action floor — unfiled, security-relevant, worth tracking.**
No code anywhere blocks financial-transaction, account-creation, or
CAPTCHA-bypass actions even when a user has explicitly disabled
ask-before-acting (confirmed absent by grep for
`financial|purchase|checkout|payment` across `src/`). `escalationEngine.ts`
explicitly instructs the agent never to click Submit on a _job application_
(`escalationEngine.ts:287`), but there is no equivalent, general-purpose
instruction or code-level block for payment/checkout flows anywhere in the
automation stack. Claude in Chrome has an explicit, non-overridable floor for
exactly these three categories per the benchmark research
(`claude-code-chrome-ide.md:258`). AGI's only remaining backstop once
ask-before-acting is off is the origin allowlist itself — there is no
category-level backstop beneath that. This finding was surfaced in the
extension-chrome inventory (`inventory/extension-chrome.md:315-321,455-462`,
ranked #1 of its "Findings requiring follow-up") but was not independently
filed as its own `EXTENSIBILITY-*`/`DEAD-CODE-*` gap ID in this round —
carried here per the task brief and recommended for tracking in
`docs/agent-context/known-flaws.md` rather than left implicit in inventory
prose.

For balance: the same surface **wins** two adjacent security axes worth
crediting — `"incognito": "not_allowed"` in `manifest.json` blocks the
extension from even loading in an incognito window (stronger than Claude in
Chrome's own incognito behavior, which the benchmark research marks
UNVERIFIED/undocumented), and the Managed-Cloud mirroring rule (§ strengths
table) is enforced by a real `.every()` gate plus a sticky disqualification
flag plus a build-time egress lint plus 103/103 passing tests — not a
comment promising behavior.

### 9.8 `voice_inject_text` — desktop, shipped despite its own documented precondition

`apps/desktop/src-tauri/src/sys/commands/voice_global.rs:287-294` — the
Rust implementation's own doc comment states:

> "NOTE (plan phase 4, not yet implemented): this is a bare typing call with
> no target pinning/revalidation, secure-field refusal, or clipboard
> transaction — **it must not be wired into an automatic dictation flow
> until that stage lands.**"

It is registered as a live `#[tauri::command]` and **is** wired into an
automatic dictation flow: `apps/desktop/src/api/voice.ts:440` exposes
`voiceInjectText()`, called from `apps/desktop/src/stores/settings/voice.ts:744-751`
(`injectText` store action), the live push-to-talk/global-dictation path
(`startGlobalPtt`/`stopGlobalPtt` sit in the same store). The safety work the
author explicitly gated this behind has not landed; the gate itself was not
enforced in code — it shipped anyway. Text can be injected into whatever
field currently has OS focus, including password fields, with no
secure-field refusal (`desktop-tauri.md` §6).

**Mitigating context, independently re-verified this round
(`VOICE-MEDIA-012`, P3):** the JS `injectText` action chain has zero callers
outside its own definition today, and the one path that could theoretically
reach it (global-source dictation) is refused at admission because
`system_dictation_available()` is a hardcoded `false`. So this is not a live,
exploitable bug in the current build — but the command remains a registered,
callable surface with a documented-and-unaddressed unsafe precondition,
invokable by any future code path without the safety work ever being forced
to land first. **Recommendation:** gate `voice_inject_text` itself behind
`system_dictation_available()` (return an error immediately if false,
mirroring the coordinator's own admission check) so the command cannot be
invoked at all until the deferred safety work lands, rather than relying on
"nothing currently calls it" as the only protection.

---

## What NOT to copy from the benchmark

Per `research/cross-cutting-and-complaints.md`, both ChatGPT and Claude carry
backend/runtime-adjacent choices users actively dislike. None should be
replicated; in most cases this repo's current architecture is already the
better design.

1. **Don't hide usage-limit mechanics behind an opaque dual-meter system.**
   Anthropic's 5-hour-session + weekly-cap split is repeatedly named as the
   most misunderstood thing about paid Claude plans, and Anthropic has
   stopped publishing exact message counts (cross-cutting §8, item 7). This
   repo's credit-ledger model already computes precise, queryable usage — the
   risk is inheriting the benchmark's _opacity_ by never surfacing what the
   backend already knows, not a backend gap.
2. **Don't multiply backend services just because competitors run
   multi-service topologies.** `BACKEND-RUNTIME-002` argues the opposite
   direction from "look more enterprise" intuition: a second REST-duplicating
   service adds maintenance surface without adding capability, because the
   Next.js app is what actually serves traffic. Consolidate before adding
   more services.
3. **Don't let a durable-execution flag ship default-off and get described
   as default-on.** `CHANGELOG.md` describes `AGI_DURABLE_INITIAL_TURNS` as a
   "kill-switch" (implying default-on, opt-out); `durable-initial-turns.ts:9-14`
   documents it as off by default, opt-in — exactly the anti-pattern
   cross-cutting §8 item 9 warns against.
4. **Don't rush to build first-party SAML assertion consumption to "match
   enterprise."** `admin/sso/route.ts` correctly stores SAML/OIDC connection
   _configuration_ only — no assertion callback route exists anywhere
   (confirmed by grep), matching the already-recorded, deliberate disposition
   in `audit/capability-gaps.csv` (`CAP-028`, Deferred).
5. **Don't copy ChatGPT's stripped-down scheduled-task tool policy** (voice,
   files, Custom GPTs disallowed inside a Task) as the _ceiling_ to aim for.
   The current scheduled-task tool access is worse — zero tools at all
   (`AGENTIC-WORK-007`) — but the fix should aim past ChatGPT's floor at
   Claude's "full Skills/connector access while running unattended," the
   more internally consistent design (a scheduled run should be able to do
   anything an interactive run can, scoped by the same permission system).
6. **Don't copy a bare `&`-prefix chat-input convention** as the entry point
   for fixing `AGENTIC-WORK-001` without a visible control surface arriving
   in the same release. Shipping the prefix parser alone without list/pause/
   resume/take-over UI would recreate today's problem in a more discoverable
   but equally uncontrollable form.
7. **Don't "fix" `SEARCH-RESEARCH-001` by silently degrading further.** The
   lesson is the opposite of a documented ChatGPT complaint (cross-cutting §6:
   "the selected model doesn't visibly change response behavior... described
   as the model selector becoming 'decorative'"). Whatever ships for
   Anthropic research should make the difference either disappear (unify the
   two paths) or be visibly disclosed — never leave a control that silently
   no-ops depending on hidden state.
8. **Don't "fix" `MEMORY-001` by hiding the tab's misleading copy.** The
   correct fix is wiring the real project-scoped store the chat runtime
   already needs and uses — hiding the tab would remove visibility into a
   pipeline that otherwise works well.
9. **Claude's "skills installed from the directory are view-only" is a real,
   documented user complaint** (`claude-web-desktop.md:113`). This repo's
   local filesystem-backed skill model (`~/.agiworkforce/skills/`, directly
   editable files) is architecturally better — don't imitate Claude's
   read-only directory install as the _only_ path if a network skill
   directory ships.
10. **The daily-cadence honesty pattern (`AGENTIC-WORK-004`) is worth keeping
    even after the underlying ceiling is raised** — an explicit, tested "we
    cannot deliver this yet" refusal at the write boundary is better product
    design than either benchmark's silent per-tier row limits, and should be
    the template for how other infrastructure-bound limits in this codebase
    get enforced.

---

## Corrections carried into this document

Per this audit's own standard of record, two retractions from elsewhere in
this audit round touch backend/architecture territory covered here and are
stated plainly rather than silently avoided:

1. **The "three sign-in / three sign-up routes" duplication claim is
   retracted.** `inventory/web-route-sweep-findings.md`'s Finding 1 originally
   read a `curl -L` status sweep (which follows redirects and reports only
   the final status) as proof of three competing sign-in implementations.
   Reading the sources settled it: `/auth/login`, `/register`, `/sign-up`
   etc. are thin redirect stubs (2-11 `redirect()` calls each) canonicalizing
   onto one real implementation — intentional, not a defect. **This document's
   own `BACKEND-RUNTIME-004` (two device-pairing systems) is a different,
   independently-confirmed finding** — two genuinely different code paths
   with different tables, different token formats, and different callers, not
   a redirect-alias artifact of the same measurement error. The method note
   generalizes: a status-code sweep cannot distinguish a redirect alias from a
   duplicate implementation, which is why `BACKEND-RUNTIME-004` was verified
   by reading both route trees and both backing tables directly, not by
   probing HTTP status.
2. **`agiworkforce.com` is live, public, and production.** An earlier draft of
   `inventory/deployment-state.md` concluded from an incomplete Vercel API
   read that "the product is not reachable by any member of the public" —
   wrong; the error came from reading only one project's `domains` array and
   treating its absence as proof of absence. This matters directly to
   `BACKEND-RUNTIME-002`: the corrected picture (one live, public,
   Vercel-served Next.js app at `agiworkforce.com`, with a strict CSP, HSTS,
   and per-request nonce) is the production surface the `services/api-gateway`
   duplication question is actually being asked against — the gateway
   duplication finding does not depend on the retracted "unreachable" claim
   and stands independently, but the corrected deployment picture is the
   accurate backdrop for reasoning about it.

---

## Master gap index (severity-sorted)

| ID                    | Sev    | Surface          | Domain            | Feature                                                                    |
| --------------------- | ------ | ---------------- | ----------------- | -------------------------------------------------------------------------- |
| `AGENTIC-WORK-001`    | **P0** | desktop-tauri    | agentic-work      | Desktop background agents fully built, fully dark                          |
| `BACKEND-RUNTIME-001` | P1     | web              | backend-runtime   | Managed Code agent-turn backend unreachable                                |
| `BACKEND-RUNTIME-009` | P1     | cli              | backend-runtime   | No OS-level command sandbox on Windows                                     |
| `SEARCH-RESEARCH-001` | P1     | backend          | search-research   | Deep Research silently degrades for Anthropic/free-trial                   |
| `SEARCH-RESEARCH-002` | P1     | cross-surface    | search-research   | Research progress/report effectively web-only                              |
| `MEMORY-001`          | P1     | desktop-tauri    | memory            | Project memory tab shows/writes the wrong store                            |
| `MEMORY-002`          | P1     | web              | memory            | No search-and-reference-past-chats                                         |
| `EXTENSIBILITY-001`   | P1     | mobile           | extensibility     | Skills catalog nav entry missing (UI-primary; see Shell/Nav doc)           |
| `EXTENSIBILITY-002`   | P1     | desktop-tauri    | extensibility     | Connections/Connectors near-homograph tabs (IA-primary; see Shell/Nav doc) |
| `EXTENSIBILITY-003`   | P1     | desktop-tauri    | extensibility     | MCP slopsquatting allow-list fails open in every release build             |
| `EXTENSIBILITY-004`   | P1     | cross-surface    | extensibility     | No automatic/progressive-disclosure skill invocation                       |
| `AGENTIC-WORK-002`    | P1     | web              | agentic-work      | `/tasks` renders unauthenticated                                           |
| `AGENTIC-WORK-003`    | P1     | web              | agentic-work      | Durable execution real but opt-in, described as default-on                 |
| `AGENTIC-WORK-004`    | P1     | backend          | agentic-work      | Scheduled cadence architecturally capped at once/day                       |
| `AGENTIC-WORK-005`    | P1     | cross-surface    | agentic-work      | No mid-run steering; approvals have no guidance field                      |
| `AGENTIC-WORK-007`    | P1     | backend          | agentic-work      | Scheduled tasks run with zero tools                                        |
| `BACKEND-RUNTIME-002` | P2     | backend          | backend-runtime   | `services/api-gateway` duplicates `apps/web`'s API surface                 |
| `BACKEND-RUNTIME-003` | P2     | desktop-tauri    | backend-runtime   | Duplicate `CloudSyncClient`, one dead                                      |
| `BACKEND-RUNTIME-004` | P2     | backend          | backend-runtime   | Two parallel device-pairing systems                                        |
| `BACKEND-RUNTIME-005` | P2     | backend          | backend-runtime   | Missing cron: org invitations never expire                                 |
| `BACKEND-RUNTIME-006` | P2     | backend          | backend-runtime   | No vector/RAG backend; embeddings endpoint has zero callers                |
| `BACKEND-RUNTIME-010` | P2     | cli              | backend-runtime   | Linux seccomp sandbox built, not shipped                                   |
| `BACKEND-RUNTIME-011` | P2     | cli              | backend-runtime   | CI never runs full Rust workspace test suite                               |
| `SEARCH-RESEARCH-003` | P2     | backend          | search-research   | Research has no connector/connected-data integration                       |
| `SEARCH-RESEARCH-004` | P2     | backend          | search-research   | No semantic/vector retrieval anywhere                                      |
| `SEARCH-RESEARCH-005` | P2     | extension-chrome | search-research   | No manual web-search toggle in Chrome side panel                           |
| `MEMORY-003`          | P2     | cross-surface    | memory            | Import-from-competitor is mobile-only                                      |
| `MEMORY-004`          | P2     | web              | memory            | No project-scoped memory column on Web                                     |
| `MEMORY-005`          | P2     | backend          | memory            | Substring search only; no semantic retrieval                               |
| `MEMORY-006`          | P2     | web              | memory            | `pinned` column exists but not in REST contract                            |
| `MEMORY-008`          | P2     | web              | memory            | Suppression is content-term only, not source-scoped                        |
| `EXTENSIBILITY-005`   | P2     | desktop-tauri    | extensibility     | Cloud skill download is a dead-end link                                    |
| `EXTENSIBILITY-006`   | P2     | web              | extensibility     | 87/89 catalog connectors are `501` by default                              |
| `EXTENSIBILITY-007`   | P2     | extension-chrome | extensibility     | Zero skills/plugins/connectors surface in Chrome                           |
| `EXTENSIBILITY-008`   | P2     | backend          | extensibility     | Org skill/plugin governance duplicated, unenforced                         |
| `AGENTIC-WORK-006`    | P2     | cross-surface    | agentic-work      | Standalone Cowork surface still absent                                     |
| `BACKEND-RUNTIME-007` | P3     | shared           | backend-runtime   | Enterprise licensing verifier built twice, wired nowhere                   |
| `BACKEND-RUNTIME-008` | P3     | web              | backend-runtime   | 3 of 4 billing/usage alias routes orphaned                                 |
| `BACKEND-RUNTIME-012` | P3     | backend          | backend-runtime   | No APM; api-gateway has no `/metrics`                                      |
| `BACKEND-RUNTIME-013` | P3     | backend          | backend-runtime   | 11 dead/near-dead tables; unapplied `teams` drop migration                 |
| `SEARCH-RESEARCH-006` | P3     | backend          | search-research   | No rich current-data/image search cards (low-confidence)                   |
| `MEMORY-007`          | P3     | cross-surface    | memory            | No previous-chat citation rendering; Cloud drops the field                 |
| `MEMORY-009`          | P3     | desktop-tauri    | memory            | Orphaned memory-browser component family                                   |
| `MEMORY-010`          | P3     | web              | memory            | Dead second chat runtime lacks temporary-chat memory guard                 |
| `VOICE-MEDIA-012`     | P3     | desktop-tauri    | voice-media       | `voice_inject_text` hardening                                              |
| `DEAD-CODE-021`       | P3     | extension-chrome | dead-code         | Scheduled-task origin check fails open for legacy tasks                    |
| — (unfiled)           | —      | extension-chrome | inventory finding | No sensitive-action floor for financial/account-creation/CAPTCHA actions   |

---

## Verification notes / methodology

- Read `web-backend.md` (703 lines) and `runtime-infra.md` (461 lines) in full
  before opening any domain gap file, per this audit's own stated method for
  the source domain passes.
- All items the domain passes flagged for explicit verification were
  independently re-confirmed in code by those passes: the 410-retired route
  families (13 routes via `retiredManagedExecutionResponse`), the unreachable
  `code/sessions/[id]/agent` endpoint, the absence of any `vector` column
  across all 119 migrations, the two device-pairing systems, the missing
  `expire-organization-invitations` cron entry, the 9 GDPR-only + 2 fully-dead
  tables, the unapplied `0058_drop_legacy_teams.sql` migration, and the
  `services/api-gateway` vs web API duplication (corroborated three ways:
  `BACKEND-RUNTIME-002`, `CROSS-SURFACE-008`, `known-flaws.md`).
- Cross-domain corroboration was treated as a confidence signal, not grounds
  for re-filing: `BACKEND-RUNTIME-005`/`DEAD-CODE-005` (missing cron),
  `BACKEND-RUNTIME-013`/`DEAD-CODE-006` (dead tables), and
  `BACKEND-RUNTIME-002`/`CROSS-SURFACE-008` (api-gateway duplication) are each
  the same underlying finding reached independently by two domain analysts;
  both IDs are noted where they appear so the ledgers stay reconcilable.
- The two Chrome-extension security findings and the desktop
  `voice_inject_text` finding were carried into this document from
  `inventory/extension-chrome.md` and `inventory/desktop-tauri.md`/
  `domain-voice-media.json` per explicit task-brief instruction, since they
  are runtime/permission-boundary issues rather than UI issues, despite
  living in surface-scoped inventory/domain files outside this document's
  five primary sources.
- No claim in this document was asserted from inventory prose alone without
  an underlying file:line citation traceable to the cited domain/inventory
  file's own verification work.

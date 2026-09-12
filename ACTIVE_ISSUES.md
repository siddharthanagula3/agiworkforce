# Active issues and execution plan

Status: Current
Owner: Founder + platform lead
Last updated: 2026-09-10

The single human-readable register of unresolved defects, risks and required
corrections, with the execution plan to clear them. Start here before opening
any older audit.

**Canonical status.** This file carries the explanation and the plan. Three
machine-readable registers stay authoritative for their own row identity
because code, tests and CI cite their IDs directly:

| Register                            | Holds                                     | Enforced by                  |
| ----------------------------------- | ----------------------------------------- | ---------------------------- |
| `docs/agent-context/known-flaws.md` | one row per open defect, cited by ID      | PR template, `ci.yml`, tests |
| `audit/capability-gaps.csv`         | `CAP-*` product capability backlog        | `check:capability-gaps`      |
| `audit/ui-gaps.csv`                 | `GAP-*` UI parity rows, monotonic ratchet | `check:ui-gaps`              |

Those registers hold rows. This file holds root causes. One root cause here may
retire several rows there. Do not copy long narrative into a register, and do
not open a second active-issues document.

Capability backlog (`CAP-*`) is product scope, not defect work, and is out of
scope for this file.

**A closed issue is deleted, not archived.** Git history is the record of what
was fixed and why; a resolved section left here is a second, staler copy of a
commit message that also makes the open count unreadable. What each removed
issue turned out to be is in the commit that closed it.

## 1. Current repository state

- Audit date 2026-09-08. Scope: repository and test evidence, a live
  authenticated session driven against the dev server on `:3100`, and a browser
  QA pass over the shipped chat, project, settings and marketing surfaces.
  No load run and no production capacity test.
- Reconciles the 2026-09-08 Codex audit, the browser QA pass (consolidated here
  and removed), the local security-scan directories (reconciled and removed,
  one surviving finding carried in as `AGI-22`), `known-flaws.md`,
  `capability-gaps.csv` and `ui-gaps.csv`.
- 17 unresolved issues: 0 P0, 0 P1, 10 P2, 7 P3, plus 5 items needing
  validation this session could not perform. Three of them, `AGI-3`, `AGI-16`
  and `AGI-23`, are partly fixed and say which part.
- Pass of 2026-09-12, code and tests only, no browser and no deployment. Fixed:
  the two unblocked rows of the P1 security entry (F31, F39), `AGI-23`,
  `AGI-27`, `AGI-28` in the main, `AGI-30`, `AGI-31`, `AGI-32`, and the
  entitlement contradictions that told a plan it had what its gate would refuse.
  Each says what remains and why. Every one of them still wants the live
  confirmation its own section names, and none of those confirmations can be
  made from a checkout: they need a deployment, a real sandbox, a live voice
  session, or a running server. Nothing unblocked remains in the P1 entry.
- Web parity pass 2026-09-10 (live QA against the dev server on `:3100`,
  every fix exercised in the browser before commit): closed and deleted from
  this file rather than archived: settings saves answering 412 on every
  versioned write (933f5b8af), the durable workflow bundle crashing on a pino
  import (496cd42da), signed-in visitors shown the sign-in form (049c0bd3d),
  empty conversations in history (2c681788b), branching failing on row
  security (070ada117, d107dea4d), pinned-model route failover (1cd019d50),
  memory and past-chat recall (a7ba7e903, 013a2f3af), temporary chats saved
  and listed (637411f26, dbacf8196), gateway adapters in the shared server
  path (97e76f63d), the AGI Work approval notice and the premature no-results
  fallback (9e4505417), artifacts stored interrupted with a missing last line
  and code fences read as a request to run code (e2ef2e196), oversized mermaid
  figures (676564cf7, 0461fd9b9), generated images as thumbnails (1c540c875),
  favourites fetched on every composer mount (1652052a2), the durable
  transport never rotating routes (2f042794f, validation `LIVE-7`), deep
  research without search on harnesses lacking native search (c00dc8cb8), and
  the routing conformance fixture that had drifted since 972328011
  (1a3f2b568), and the approval flow that collapsed after the first inline
  decision while labelling the wait as running (cd01fe255). What each was
  is in its commit. New root causes opened below: `AGI-27` to `AGI-31`.
- Production runtime pass 2026-09-10, from Vercel's own data. The billed
  876.6 GB-hours of provisioned memory against a few minutes of active CPU
  were idle functions: the runtime-error clusters show 1,785 "Task timed out
  after 800 seconds" events between 2026-08-11 and 2026-09-10 05:14 UTC on
  the chat completions route and the workflow flow route, roughly 397 hours of
  function time at 1.7 GB, most of the bill. Cause, on the deployment of
  8b2923fa7: the durable workflow bundle died at load (fixed on main in
  496cd42da), the chat function then sat under its own SSE heartbeat with no
  bound after the first durable event, and the reaper marked stranded rows
  terminal without cancelling the workflow run behind them, so six runs
  created 2026-09-08 06:04 to 2026-09-09 05:14 UTC were redelivered every
  15 minutes. The six runs were cancelled through the workflow API at
  15:33 UTC; no run is pending or running in either environment and the
  timeout curve has been flat at zero since 05:15 UTC. The class is closed on
  main by a1c1b6a1e: every durable entry point bounds silence and detaches
  before the function limit, provider deadlines stay armed for the whole
  stream on the streaming, non-streaming and research paths, a Stop reaches
  the provider call inside a durable step, the reaper cancels world runs, and
  the Google adapter bounds only its wait for headers. Exercised on `:3100`:
  "hi" on the free router route answers in 2.1 s over the durable transport
  with one request, Stop settles in under 300 ms, two rapid sends produce one
  request each. Deployed verification is `LIVE-8`. The same pass found no
  other function alive past its budget: crons are batch- and time-bounded,
  only the current deployment receives invocations, and the remaining
  daily 500 is the credit reconciliation cron meeting Stripe subscription ids
  the live account does not know (founder file, Billing entry).
- Five are blocked on a decision rather than on code, and each says whose and
  what it costs: `AGI-5` (CI budget), `AGI-11` (default expiry), `AGI-14` (a
  second speech-to-text vendor), `AGI-17` (conform to CommonMark or forgive it),
  `AGI-22` (the disclosure, and whether existing users are grandfathered).

### Closed in this pass

Seven issues were fixed and verified, and their sections are gone from this
file. Named here only so a reader coming from an older copy knows where they
went, and so nobody re-files them:

| Was      | What it was                                                        | Verified by                                                                              |
| -------- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| `AGI-15` | Local development ran against the shared database                  | dev server on `:3100` now writes `agiworkforce_dev`                                      |
| `AGI-1`  | Managed usage leases clamped to one hour, never renewed            | `pnpm db:lease-probe` against real Postgres                                              |
| `AGI-2`  | Stranded reservations waited up to a day for recovery              | cron scope test, `/api/cron/recover-reservations`                                        |
| browser  | Non-image chat attachments failed on every route                   | `apps/web/e2e/chat-document-attachment.spec.ts`                                          |
| browser  | Starting a conversation inside a project failed every time         | `apps/web/e2e/project-first-conversation.spec.ts`                                        |
| browser  | Tool Approvals did not gate web search in either mode              | `apps/web/e2e/tool-approval-web-search.spec.ts`                                          |
| latent   | Approval checkpoints 500'd on a jsonb parameter                    | found by the first turn to reach that path                                               |
| `AGI-13` | Unimplemented native commands answered with mock success           | the guard was unreachable; rule extracted and tested                                     |
| `AGI-19` | Marketing nav panels stayed open while the page scrolled           | `NavGroup.scroll.test.tsx`                                                               |
| `AGI-21` | A cancelled settings query logged at error level                   | `use-settings-queries.abort.test.tsx`                                                    |
| `AGI-8`  | The US-only preference never reached the web resolver              | `request-processor.us-only.test.ts`                                                      |
| `AGI-18` | Not reproducible: the sidebar row is a correctly labelled expander | driven in a browser on `:3100`                                                           |
| `AGI-9`  | A forbidden connector could be connected and its credential stored | `connector-policy-gate.test.ts`                                                          |
| `AGI-24` | Any function tool blocked cross-provider failover for a whole turn | `managed-failover.test.ts`, red on the old predicate                                     |
| `AGI-25` | A turn holding an approval said it had finished with no response   | live on `:3100`; the line is gone, the row remains                                       |
| `AGI-6`  | Web voice could not speak until the whole reply was written        | live session on `:3100`, audio about a second after the user stops, interruptions native |

## 2. P0, critical

None. No verified security breach, privilege escalation, secret exposure, data
corruption, double charge or trust-boundary failure was found. Reservation
settlement is idempotent and concurrency-safe.

## 3. P1, high

### `AGI-SEC-API-2026-09-09` What the api security scan found, and what is left

**Severity:** P1
**Status:** 49 of 57 findings fixed; 8 registered in
`docs/agent-context/known-flaws.md` as `WEB-SEC-SCAN-2026-09-09-*`. F31 and F39
were closed on 2026-09-12 and their rows deleted: compaction now routes under
the turn's own admission, and a scheduled run declares the project context it
carries. Closing F39 also found that the gate's attachment leg could never fire,
because `buildLlmRequest` moves array content into `multimodal_content` and the
check read `content`.
**Area:** `apps/web/app/api` and the code it reaches

**What the scan was.** A panel-verified read of the 744 files under
`apps/web/app/api`, run 2026-09-09 against commit `e2a9e898b`. The report is in
`CLAUDE-SECURITY-20260909-050816/`. 57 findings survived a three-voter panel: 3
HIGH, 40 MEDIUM, 14 LOW.

**The root causes, not the finding list.** The 57 were six causes and a tail:

1. A caller-supplied header decided which scope a security gate evaluated, while
   the handler acted on a different, server-resolved one. `x-agi-organization-id:
personal` switched off require-MFA, the IP allow list, zero-data-retention,
   the workspace secret-handling mode and the spend cap. Fixed by resolving
   account-level controls from membership and taking the strictest answer across
   every organization the caller belongs to. `check:policy-gate-scope` keeps it
   fixed.
2. Device pairing let the caller choose the pairing identity, so one victim click
   on a crafted `/connect` link minted a 7-day account token for the attacker.
   Fixed by minting the identity server side and removing the flow that took it
   from a URL.
3. Secret redaction round-tripped through an in-band delimiter and fell back to
   the caller's unredacted text when the split did not realign, while reporting
   the turn redacted. Fixed by redacting per span and proving the result.
4. Three secret patterns had two open-ended runs either side of a required
   literal. A megabyte of `eyJ` took 402 seconds in a measured run, from routes
   as cheap as an unauthenticated support handoff.
5. Untrusted external content bypassed the fence helper that already existed,
   including a compaction summary re-injected as a bare system message and
   persisted on the conversation row.
6. Four controls existed on one handler and not on its siblings.

**What is left and why.** Each remaining row names its own blocker: three need a
migration or a deployment secret, three change a shipped contract other code
already ships against, and one (F88) has no fix that closes the hole without
degrading legitimate copy, because the real answer is pinning surface into the
credential at issuance.

**Next step.** F21 and F23 are the two that want a migration; they are the
natural next pass. F8, F35 and F38 are contained refactors that need their own
verification rather than riding a security batch. Nothing unblocked is left in
this entry: every remaining row names a migration, a deployment secret, a
shipped contract, or a founder call.

F8 closed 2026-09-12, and it was worse than its one-line summary. The router
decided retry, failover and user-facing copy by re-parsing a free-text message
that contains a user-chosen filename, because the adapter classified the failure
correctly and then dropped the answer at the stream-chunk boundary. So an
attachment named timeout.pdf turned a permanent refusal into a retry loop
against a route that could never serve it, and one named content_filter.pdf
classified as a safety refusal, which never rotates, so the turn ended and the
reader was told a safety system had blocked their own document. The
classification now rides the chunk and is validated before it is trusted.

## 4. P2, important

### `AGI-3` Tool timeline and reasoning are still client-owned

**Severity:** P2
**Status:** Narrowed again 2026-09-12. Code-execution results and the generated
file list are now collected server side beside sources and citations, so a
client save that exhausts its retries no longer loses them. The tool timeline
and reasoning blocks are deliberately still client-owned: both are built by
merging frames, back-filling earlier entries and tracking per-tool status, and
reasoning also splits thinking spans out of the content stream with its own
timestamps. Collecting those on the server is a second implementation of a
rendering derivation, which is the trap this entry names. Unverified: the reload
assertion the validation line asks for needs a running server.
**Area:** Web chat persistence
**What was fixed:** The server now collects the pages a turn cited from the
`x_search_results` frames it already emits and writes them into the same
snapshot that carries the text, so citations survive a failed client save. A
client metadata save that fails after its retries now stamps the turn and the
transcript says what will not survive a reload, instead of a `console.error`
nobody reads.
**What remains:** the tool-call timeline, reasoning blocks, code-execution
results and the generated-file list are still written only by the client's
`saveMessageToDb`. A non-retryable failure still loses them; the difference is
that the reader is now told.
**Root cause of the remainder:** those four are derived by the client from the
stream, with merging and per-tool status the server does not reproduce.
Reproducing that derivation server-side is the work, and it must not become a
second implementation of it.
**Evidence:** `apps/web/lib/hooks/useChatStream.ts` `persistAssistant`, which
builds the metadata object; `assistant-turn-sources.ts`, which shows the shape
the rest would follow.
**User impact:** Bounded. Sources, the part a reader needs to trust an answer,
now survive. Losing the tool timeline degrades the record of how the answer was
reached.
**Dependencies:** None.
**Implementation direction:** Extend `AssistantTurnSnapshot` the way `sources`
extended it, one metadata class at a time, each collected from the canonical
wire rather than from any provider's shape. Do not move the client's rendering
derivation to the server; collect the evidence and let the client project it.
**Acceptance criteria:** A forced non-retryable save failure loses nothing that
the transcript rendered.
**Validation:** Extend `assistant-turn-sources.test.ts` per class, plus the
existing reload assertion in `apps/web/e2e/citation-persistence.spec.ts`.

### `AGI-5` Native code merges without compilation or test validation

**Severity:** P2
**Status:** Open, and blocked on a spend decision rather than on code.
**Area:** CI
**Root cause:** Four lanes carry `github.ref == 'refs/heads/main'`:
`rust-desktop-cli` (`.github/workflows/ci.yml:550`), `clippy-all-features`
(`:1188`), `macos-smoke` (`:1274`) and `windows-smoke` (`:1321`). So `cargo
test` at any scope, every crate under `crates/*`, and macOS and Windows
compilation all happen after a merge rather than at review.
**Current behavior:** More runs pre-merge than first recorded. `codeql.yml`
triggers on `pull_request` for `**/*.rs`, `**/Cargo.toml` and `**/Cargo.lock`
and runs the same clippy command for the two shipped crates, which type-checks
them. `auto-route-conformance` runs on pull requests but replays one fixture
against a single crate. `windows-smoke`'s own `cargo test` carries
`continue-on-error: true` even on its main-only run.
**What was fixed in this pass:** the guardrail layer pinned the
`native_changed` half of that condition and not the `github.ref` half, so the
trade-off could be widened or narrowed with nothing failing either way, and a
reader of `check-ci-guardrails.mjs` would have concluded native code was gated
on pull requests. The four lanes are now asserted to move together, with the
cost stated where the assertion lives.
**Why the rest is not being changed here:** the gating is a deliberate,
commented decision, and reversing it buys one full native build per pull request
that touches Rust. A native build is the slowest thing in this CI by an order of
magnitude, the change cannot be verified from a working copy (only a real pull
request exercises it), and recurring CI spend is the founder's call. Nothing
about it is a code defect.
**Severity note:** production is not directly exposed. `deploy-production.yml`
only promotes after a `CI` run concludes success on a push to main and checks
out that exact SHA, so a post-merge native failure blocks promotion. The cost is
main-branch health and developer velocity.
**User impact:** A native regression in `crates/*` or a platform-specific break
is caught at merge, not at review.
**Dependencies:** A founder decision on the CI budget.
**Implementation direction, once decided:** a bounded PR lane, not the full
matrix: `cargo test` for the two shipped crates plus a `crates/*` compile check,
leaving the sidecar build, `cargo deny`, the GUI suites and the platform smokes
in the main-only lane. Update `NATIVE_MAIN_ONLY_JOBS` in the same commit.
**Acceptance criteria:** A deliberately broken `crates/*` change fails a
required check on a pull request.
**Validation:** A draft pull request carrying a known break.

### `AGI-7` Desktop global voice does not meet its own release gates

**Severity:** P2
**Status:** Open on the gates; the second acceptance branch is already met.
Checked 2026-09-12: the acceptance line reads "every gate is met, OR the entry
point is removed from shipped builds", and the surface is already off in a way
that is honest rather than hidden. The capability probe is a compile-time false,
the settings control reads that probe and says "Not available in this build"
while pointing at the in-window hotkey that does work, the button is disabled,
and the Rust coordinator refuses a global-source session independently, so the
one caller and the authority both fail closed. What is left is the first branch:
six OS-level gates and a signed build, which is neither a decision nor a
checkout-sized change.
**Area:** Voice, desktop
**Root cause:** Tracked in the feature's own spec. The OS-level input hook is
real, but the coordinator refuses every global-source session, so the hook only
emits `refused` events, and `system_dictation_available()` is a compile-time
`false` on every OS.
**Current behavior:** The spec's release-gate ledger records 6 of 12 gates
unmet: focus-target pinning, secure-field refusal, capture-pipeline recovery,
text injection, dictionary and snippet precedence, and a signed build.
**Required behavior:** Either the unmet gates are met, or the surface stays off
in shipped builds.
**Evidence:** `docs/specs/desktop-global-voice/spec.md:16-20, :59-61, :78, :82-95`.
**User impact:** Global dictation cannot be relied on.
**Dependencies:** None.
**Implementation direction:** Work the spec's own gate ledger in order. Keep
the ledger as the acceptance record.
**Acceptance criteria:** Every gate in the ledger is met, or the entry point is
removed from shipped builds.
**Validation:** The spec's gate ledger, exercised on a signed build.

### `AGI-10` Artifacts can only be shared publicly, never with an organization

**Severity:** P2
**Status:** Open
**Area:** Artifacts, enterprise
**Root cause:** `published_artifacts` has no audience model. Publication mints a
144-bit token and the read path is deliberately anonymous.
**Current behavior:** Sharing an artifact means creating a public URL. There is
no authenticated, membership-scoped share, and no expiry.
**Required behavior:** An artifact can be shared to an organization so only
members can open it, with membership revocation taking effect.
**Evidence:** `apps/web/lib/services/published-artifact-service.ts:217-219, :226-331, :333-349, :389-404`;
`apps/web/db/neon/0095_published_artifacts.sql` (no organization column, RLS
protects only the authenticated management surface).
**Not artifact-specific:** conversation sharing has the identical gap.
`apps/web/db/neon/0051_shared_sessions.sql` is also public-token-only with no
organization scoping. Fix both against one model.
**User impact:** Team customers cannot share internal work without making it
public.
**Dependencies:** None.
**Implementation direction:** The pattern already exists. Migration
`apps/web/db/neon/0086_org_shared_ecosystem.sql` implements organization
sharing for projects and connectors with join tables, table-resolved membership
predicates (`app_org_resource_is_readable`, `app_org_resource_is_manageable`)
and forced RLS. Extend the same shape to artifacts. Do not invent a second
sharing model, and do not reuse the `organization_id` governance column from
0073, which 0086 explicitly separates from sharing.
**Acceptance criteria:** A member can open an organization-shared artifact, a
non-member cannot, and removing a member revokes access.
**Validation:** RLS tests mirroring the 0086 project-sharing tests.

### `AGI-14` There is no second speech-to-text vendor to fail over to

**Severity:** P2
**Status:** Open, and blocked on a catalog decision rather than on code.
**Area:** Provider neutrality, voice
**Corrected root cause:** Recorded as a coupling in the route, which is where it
shows: `apps/web/app/api/llm/v1/audio/transcriptions/route.ts:377` refuses a
resolved model whose provider is not `openai`, `:521` calls
`providerApiUrl('openai', 'audio/transcriptions')` directly, and the key is read
as `OPENAI_API_KEY`. Checked on 2026-09-08, the catalog is the same shape: the
authored catalog contains exactly two STT models, a balanced one and a fast one,
both OpenAI, both under the `openai` family, and the `voice_transcription` slot
resolves to one of them. They are not named here: `check:model-id-literals`
exists because a document quoting concrete ids goes stale, and
`models.curation.json` is where they live. The route is not hiding a
choice; there is no second choice to make.
**Why the route is not being generalised first:** an abstraction with one
implementation and no second vendor to test it against is speculative
generality. The provider-neutral shape is worth building at the moment a second
vendor exists, and against it, so the seams land where that vendor actually
differs rather than where OpenAI happens to.
**What the decision is:** which second STT vendor, on what terms and at what
price. That is spend and contract, so it is the founder's.
**What follows the decision, in order:** add the model to
`models.curation.json` under its own family; give the route a provider-keyed
dispatch table for endpoint, auth header and form fields, replacing the four
literals above; extend the routing slot to a fallback chain; then a route test
per provider.
**User impact:** voice input has one point of failure and one vendor's pricing,
on a product whose stated differentiator is model and provider neutrality.
**Dependencies:** the vendor decision, before any of it.
**Acceptance criteria:** transcription succeeds through at least two providers
and fails over. No provider literal remains at the call site.
**Validation:** route tests per provider, plus registry contract tests.

### `AGI-16` A citation's href is still the routing provider's redirect

**Severity:** P2
**Status:** Fixed 2026-09-12 on every writing path, not observed live. The
research path resolves the router's redirect to the publisher during ingestion,
and a plain grounded turn resolves after its stream has closed and patches the
stored row, because a network call inside the streaming translation path is
ruled out. The patch substitutes leaf URLs inside whatever shape is stored
rather than overwriting the key, so the client's richer copy survives and no
numbered marker moves. The managed agent path persists its own sources and now
patches them the same way, after its terminal event. The client's save merges
into the same row and normally lands first, but a slow or retried one can land
last, so the message write path resolves before it inserts and whichever write
lands last stores publisher URLs.
**Area:** Research, citations, provider neutrality
**What was fixed:** A grounded result does not arrive with the publisher's URL.
Google hands back
`https://vertexaisearch.cloud.google.com/grounding-api-redirect/...`, with the
publisher's domain in the chunk's title instead, and every consumer derived the
displayed host and the favicon from the URL. So a research answer named
`anthropic.com`, `claude.com` and `youtube.com` on its cards while showing
Google as the host of each and drawing Google's favicon for all of them.
`citationPublisherDomain` now answers that question once, for the citation chip,
the research panel and the sources control: the URL's host wherever it is a
publisher, the title where the URL belongs to a router, and only when the title
is shaped like a domain, because printing prose in a host slot is a different
wrong answer.
**What remains:** nothing on the writing paths. Not covered, and pre-existing:
the bulk import behind a share link copies whatever hrefs the shared rows hold,
so a conversation saved before this fix still carries the redirects it was
saved with.
**Evidence:** live session 2026-09-08, sources panel and the `Sources` chip;
`packages/ai/providers/google/src/stream.ts` `citationFromGroundingChunk`, which
carries `web.uri` (the redirect) and `web.title` (the publisher).
**User impact:** a citation no longer advertises the routing vendor, favicons
match publishers, and a stored href outlives the router's redirect.
**Dependencies:** None.
**Acceptance criteria:** a citation still resolves after the provider's redirect
has expired.
**Validation:** resolve-on-ingest unit tests, plus a grounded research turn
asserting no provider host appears in any citation href.

### `AGI-22` There is no server-side record of provider-jurisdiction consent

**Severity:** P2
**Status:** Open, and larger than first recorded.
**Area:** Compliance, routing
**Corrected root cause:** The 2026-08-26 scan and the first draft of this entry
both said the gate exists and nothing calls it, and that the fix is one call in
the routing request builder. Checked on 2026-09-08, that is wrong in a way that
matters. `isProviderRoutingAllowed` takes a `ConsentLedger`, and the only
implementation of one is `apps/mobile/services/complianceLedger.ts`, which reads
device storage. There is no table, no column, no API and no web or desktop
surface that records this consent. The server has nothing to consult, so the
call cannot be added: what is missing is the record, not the read.
**Current behavior:** Auto routing can place a conversation on DeepSeek,
Moonshot, Qwen or Zhipu with no consent recorded anywhere the server can see.
Mobile's consent is real but local to one device and invisible to the backend
that does the routing.
**What now partially covers it:** the `usOnly` overlay is threaded as of this
pass, and the providers it excludes are `deepseek`, `qwen`, `moonshot`, `zhipu`
and `minimax`, which is the Chinese-HQ list plus one. A `max` or `enterprise`
user who sets the preference is now genuinely excluded from all four. That is a
user preference, not a compliance gate, and it does not apply below those tiers.
**What the real fix needs, in order:** a durable per-user consent record with
its disclosure version; an API to write it; a surface on web and desktop to
collect it; then the read in `buildWebCloudAutoRoutingRequest` beside `usOnly`
and `zeroDataRetentionOnly`. Whether existing users are grandfathered or
blocked on their next turn is a disclosure decision, not an engineering one.
**Evidence:** `packages/contracts/compliance/src/provider-jurisdiction.ts:40`,
called only from `llm-gate.ts:53,65`; zero imports of `@agiworkforce/compliance`
anywhere in `apps/web`; no `provider_consent` table or column in any migration.
**User impact:** a consent the product presents on mobile is not enforced by the
service that routes.
**Dependencies:** Founder decision on the disclosure and on existing users,
before any of it.
**Acceptance criteria:** without a recorded consent, no Chinese-HQ provider is
selected for any tier, on any surface.
**Validation:** auto-route conformance fixtures on the web path, plus a
migration test over the consent record.
**Already tracked as:** `COMPLIANCE-LLM-GATE-SURFACE-COVERAGE-01` in
`known-flaws.md`. That row's summary said only "compliance llm gate surface
coverage", which is why a second sweep on 2026-09-08 reported this as a new
finding; the row now names the jurisdiction angle and points here.

### `AGI-23` A route the account's own data policy refuses is still offered

**Severity:** P2
**Status:** Fixed 2026-09-12, not yet confirmed live. The refusal is now its own
route outcome class, so one observation withdraws the route for the window
instead of it taking a failure streak to park. Serving again clears it.
`min_discount_unavailable` is deliberately left on the old path because discount
availability genuinely fluctuates. Remaining: confirm on a deployment that the
model stops being selected first.
**Area:** Routing, catalog
**What was fixed:** An OpenRouter 404 saying `0 endpoints out of 1 requested are
available matching your guardrail restrictions and data policy ... ZDR violation
(account settings)` classified as a plain `client_error`, so it was neither
retried nor rotated and the user was told the request had been rejected. It now
classifies as `capacity_off_switch`, the same class as
`min_discount_unavailable`, which is failover-eligible: the route has no supply
on terms we accept, the provider is not down, and the request moves on.
**What remains:** the model is still in the picker, and Auto still selects it
first. Every turn that picks it spends a round trip discovering the same
permanent refusal before rotating. The catalog should reconcile against the
account's endpoint policy rather than assuming every listed endpoint is
reachable, or a first refusal should take the route out of service for a window
the way route health does for other classes.
**Evidence:** dev server log 2026-09-08 22:20:07 and 22:54:35 UTC, provider
`openrouter`, three occurrences within the minute. The model is named in the
log, not here: a concrete id in this file would go stale and would defeat
`check:model-id-literals`.
**Not an environment failure:** the setting is ours, on our own account, and so
is the catalog entry. No user can resolve it.
**User impact:** a model in the picker that never answers on the first attempt.
**Dependencies:** None. `AGI-24` used to prevent the rotation from completing
on any turn carrying tools; that pin is now narrowed to the steps it protects,
so the refusal this entry describes does reach another route.
**Acceptance criteria:** the route is not offered, or one refusal withdraws it
for the window.
**Validation:** the classification test in `provider-runtime`, plus a route
health assertion.

### `AGI-27` Attachments are not in the sandbox the model runs code in

**Status:** Fixed 2026-09-12, not yet confirmed live. The turn's attachments are
staged into the sandbox workspace before the baseline snapshot and only when an
execution tool was actually called, so no sandbox is provisioned for a turn that
runs no code. Remaining: the acceptance criterion's live CSV total, which needs
a real sandbox.
**Severity:** P2
**Status:** Open.
**Area:** Code execution, files
**What is wrong:** a file attached to the turn is never staged into the
execution sandbox, so the model's first action is `write_file` with the whole
attachment as its content, which needs an approval, before it can run anything.
ChatGPT mounts uploads under `/mnt/data` and Claude's analysis tool reads the
attachment directly.
**Evidence:** live 2026-09-10, conversation a36a8054 on `:3100`;
`apps/web/lib/e2b/runtime.ts` `getE2BExecutor`, tool-loop.ts around the
executor acquisition.
**User impact:** medium. One extra approval and a copied file on every analysis.
**Dependencies:** None.
**Acceptance criteria:** a CSV attached to a code-execution turn is present in
the sandbox before the first `execute_code`, the model is told where, and no
`write_file` copy is needed.
**Validation:** tool-loop code-execution tests, a live CSV total on a
non-gateway model.

### `AGI-28` Citations are prose, and a research reload keeps thinking and loses sources

**Severity:** P2
**Status:** Mostly fixed 2026-09-12, not confirmed live. Native-search citations
now reach the client and the stored turn: the provider-neutral envelope is
emitted in legacy-web mode, which is what Anthropic and Google both use, the
client unions cited outlets into the source pool instead of counting them only
when the searched list is empty, and the server collects citations in marker
order alongside sources. Two parts remain. The `<thinking>` prose on reload has
no writer that either persistence path can produce, since both strip it before
writing, so reproducing it needs the actual row or a live run and was not
guessed at. And a message still has no link to its research report, so a reload
cannot rehydrate the activity header; that is a migration.
**Area:** Web search, research, persistence
**What is wrong:** on a native-search turn the model writes outlet names as
italic prose with no `[n]` markers, and the Sources control counts one source
for two outlets. After a reload of a completed deep-research run the stored
content opens with the model's `<thinking>` prose and the row's metadata holds
no research sources, so the `[n]` markers render with nothing behind them and
the activity header is gone; the report and its citations sit in
`research_reports` with no link from the message.
**Evidence:** live 2026-09-10, conversations 3ea3a37e and 38afe47d on `:3100`;
`apps/web/app/api/llm/v1/chat/completions/lib/stream-transform.ts` persistence,
`research-loop.ts` `canonicalText` and `sources.toCitations()`,
`apps/web/features/chat/utils/research-sources.ts`.
**User impact:** medium. Answers cite less than the leaders and a saved research
run reads worse than the live one. Related: `AGI-16` (the href is still the
provider's redirect).
**Dependencies:** None.
**Acceptance criteria:** numbered markers open the right source on native and
runtime search turns; a reloaded research run shows the same citations and
Sources count as the live session and no thinking prose.
**Validation:** stream-transform and research-loop wire tests, MessageBubble
citation cases, a live headline search and a reloaded research run.

### `AGI-32` A live voice session's backend responses model and web search are never metered

**Severity:** P2
**Status:** Fixed 2026-09-12, not yet confirmed live. The close route accepts a
backend usage report and writes it as its own cost event, keyed on the session
so a retried close cannot double count, and carrying no customer charge because
the per-minute rate is the whole charge. The web_search calls are counted but
not priced: that tool is the provider's own and the rate card publishes a price
only for the Perplexity fallback and for Google grounding. Remaining: a live
session to confirm the second row appears, and a published rate for the
provider's own search.
**Area:** Voice, COGS
**What is wrong:** a live voice session delegates to a backend responses model
with web search (`apps/web/app/api/voice/live/sessions/route.ts`), which the
provider bills separately from the per-minute session rate, and no usage
report reaches the close route, so those tokens are never metered.
**Evidence:** `apps/web/app/api/voice/live/sessions/route.ts` (the session
create path, the `responses` tool config with `tools: [{ type: 'web_search' }]`);
`apps/web/app/api/voice/live/sessions/[sessionId]/close/route.ts` (the
settlement path, which records only the per-minute session usage report).
**User impact:** none directly; this is a company-cost visibility gap in the
COGS ledger, not a user-facing defect.
**Dependencies:** None. Not the same as the two OpenAI/Anthropic admin
credentials under "[Billing] Provider cost reconciliation credentials" in
`docs/work/founder-assistance.md`, which stay there because minting them is a
founder action.
**Acceptance criteria:** the close route accepts and records the backend
responses model's token usage, and any `web_search` calls it made, as their
own `provider_cost_events` row for the session, so `cogs_summary()` no longer
omits this spend.
**Validation:** a live voice session that triggers a backend web search closes
with a second `provider_cost_events` row for the backend model, covered by a
test on the close route.

## 5. P3, lower priority

### `AGI-11` Published artifacts never expire

**Severity:** P3
**Status:** Open
**Area:** Artifacts, data lifecycle
**Root cause:** No TTL column or sweep. The comparable conversation share
(`shared_sessions`) carries a 7 day `expires_at`; artifacts deliberately
omitted it.
**Current behavior:** A published artifact URL is live until the owner deletes
it.
**Required behavior:** A default expiry, or an explicit, visible "no expiry"
choice at publish time.
**Evidence:** `apps/web/db/neon/0095_published_artifacts.sql`;
`apps/web/db/neon/0051_shared_sessions.sql`; the service module notes this as a
founder-pending gap.
**User impact:** Content stays reachable longer than the author expects.
**Dependencies:** Product decision on the default.
**Implementation direction:** Follow the `shared_sessions` pattern and add a
purge cron beside the existing purge jobs.
**Acceptance criteria:** An expired token stops resolving and the page reports
expiry rather than not-found.
**Validation:** Service tests plus a cron scope test.

### `AGI-12` Desktop stores were never migrated to the shared runtime state

**Severity:** P3
**Status:** Reframed 2026-09-12, and the real part is done. The count of 41 was
misleading: the shared runtime models six domains, and 38 of the 41 markers name
domains it does not model at all, so migrating them means inventing 38 new
shared domains. That is a product decision about what the shared runtime owns,
not a cleanup, and it should be asked as one question rather than filed as 38
migrations. What was genuinely duplication is fixed: a stale unreferenced copy of
the live chat-preferences store is deleted, and two shared settings fields that
nothing on desktop ever wrote now have a publisher, so a reader of the canonical
state is no longer told agent mode is off and no prompt override exists whatever
the user chose.
**Area:** Desktop, shared packages
**Root cause:** An unfinished consolidation. 41 files carry the identical
marker `TODO(task-1.3): migrate to packages/client/client-runtime/state`.
**Current behavior:** Desktop keeps its own store layer beside the shared one.
**Required behavior:** One owner for the state these stores duplicate, per
AGENTS.md section 3.
**Evidence:** 41 occurrences across `apps/desktop/src/stores/*.ts`.
**User impact:** None directly. Drift risk between desktop and other surfaces.
**Dependencies:** None.
**Implementation direction:** Migrate per domain, deleting each marker with its
store. One canonical issue, not 41.
**Acceptance criteria:** No `task-1.3` markers remain and desktop reads the
shared state.
**Validation:** `check:boundaries`, desktop tests.

### `AGI-17` A leading `>` becomes a blockquote, which is the standard

**Severity:** P3
**Status:** Not a defect as reported. A product decision remains.
**Area:** Markdown rendering
**What was actually found:** The behaviour reproduces, and it is CommonMark. A
block quote marker is `>` optionally followed by one space, so `>= 3 items`
renders as a blockquote containing `= 3 items`, and a lone `> ` renders as an
empty blockquote with nothing visible in it. Confirmed by driving
`MarkdownContent` directly: `"> "` produces `<blockquote>` with no content,
`">= 3 items"` produces a blockquote of `= 3 items`, `"> quoted words"` produces
a correct blockquote, and `"cmd > out.txt"` is untouched because a mid-line `>`
is not a marker.
**Why it is not being changed:** the renderer follows the standard every other
markdown tool follows, and the leaders this product is measured against render
CommonMark too. Special-casing `>=` or a bare `>` would deviate from the
standard, and would have to be built so it never swallows a real blockquote.
That is a deliberate product choice about conforming versus being forgiving, not
a bug fix, and it is the founder's to make.
**If it is taken:** the narrowest defensible rule is to treat `>` as a marker
only when followed by a space or end of line, which keeps every real blockquote
and returns `>=`, `>>`, `->` and similar to plain text. It would need cases for
`> `, `> quoted`, `>= 3`, `cmd > out`, `>>> ` and a nested blockquote.
**User impact:** low and cosmetic in an assistant answer. Real, if minor, when a
user's own message uses `>` for comparison or redirection at the start of a
line.
**Evidence:** browser QA 2026-09-08; reproduced against the renderer directly
2026-09-08.

### `AGI-20` Retry can move the viewport to an unrelated message

**Status:** Fixed 2026-09-12, not observed in a browser. The transcript caches
row heights by index, and the guard asked whether ANY index on the visible path
now held a different message. A retry makes that true by construction, so one
changed index threw every row in the thread back to the default estimate and the
layout moved under the reader with no scroll call at all. Short threads fit in
the viewport, which is why it was only ever seen in long ones. Only the rewritten
suffix is forgotten now. The fix is about real layout and jsdom has none, so the
tests assert which rows are invalidated, not the resulting pixel position.
**Severity:** P3
**Status:** Open
**Area:** Chat transcript
**Root cause:** Not diagnosed. Retry replaces a message in a virtualised list;
the scroll anchor appears to be resolved against the pre-retry layout.
**Current behavior:** In a long thread, Retry sometimes scrolls to an earlier,
unrelated position instead of following the retried message. Manual scrolling
recovers it.
**Required behavior:** Retry keeps the retried message in view.
**Evidence:** browser QA 2026-09-08, long threads only.
**User impact:** Recoverable annoyance; no data is affected.
**Dependencies:** None. Related to the overscan behaviour the streaming spec
already exercises.
**Implementation direction:** Anchor the scroll to the retried message's own
id after the list settles, rather than to an index.
**Acceptance criteria:** Retry in a long thread leaves the retried message
visible.
**Validation:** An e2e case in a thread longer than the overscan window.

### `AGI-29` Memory facts come from a regular-expression extractor

**Severity:** P3
**Status:** Open.
**Area:** Memory
**What is wrong:** auto-memory candidates are the sentences that match a fixed
list of patterns ("my name is", "I prefer", "remember that"); the leaders
extract with a model and keep facts the patterns never see.
**Evidence:** `packages/ai/agent-core/src/memory.ts` `extractCandidateMemoryFacts`.
**User impact:** low. Memory works for the phrasings it knows.
**Dependencies:** a cheap extraction call on the serving route's own adapter.
**Acceptance criteria:** a fact stated without a trigger phrase is remembered.
**Validation:** memory service tests, a live two-chat recall.

### `AGI-30` The conversation list is fetched ten times during one turn

**Status:** Fixed 2026-09-12. It was not a render storm: within one mount the
effect fires once. It was mount count, because the first send routes /chat to
/chat/[sessionId], a different route segment, so the page remounts mid-turn and
asks again, and on shell routes a second copy of the hook races the page's in
the same tick. Concurrent mounts now coalesce onto one request and a remount
inside a short freshness window reuses what is loaded. The four /api/usage calls
per turn are the same defect class in `useManagedUsageSummary` and are still
open.
**Severity:** P3
**Status:** Open.
**Area:** Chat performance
**What is wrong:** one send produces about ten `GET /api/chat/conversations`
and four `GET /api/usage`; the list hook refetches on every message update.
**Evidence:** network log 2026-09-10, conversation 87a3bec7 on `:3100`;
`apps/web/lib/hooks/useConversations.ts` mount effect and its dependencies.
**User impact:** low. Wasted requests and rate-limit pressure on the QA account.
**Dependencies:** None.
**Acceptance criteria:** one list refetch per completed turn.
**Validation:** hook test with a request counter, one live turn.

### `AGI-31` A chat turn logs a MaxListenersExceededWarning

**Status:** Fixed 2026-09-12, no live proof yet. The leak was in the database
layer, not in a model adapter, which is why it was never found where the warning
appeared: each per-request scoped adapter kept its own record of which pooled
clients it had guarded, attached an error listener to a warm client, and never
removed it. The same bookkeeping made one socket failure log once per leaked
listener. The guard now belongs to the checkout and is removed on release.
Remaining: a fresh stack from a running server to confirm the warning is gone
across many turns.
**Severity:** P3
**Status:** Open.
**Area:** Server hygiene
**What is wrong:** "Possible EventEmitter memory leak detected. 11 error
listeners added" appears during a chat turn; the registration site was not
found in the adapter, factory, runtime or error-handler modules.
**Evidence:** dev log 2026-09-10; the warning's full stack is needed from a
fresh occurrence.
**User impact:** none visible; a leak would surface as memory growth.
**Dependencies:** None.
**Acceptance criteria:** no warning across a hundred turns.
**Validation:** the stack, then a targeted test.

### `AGI-33` The failure classification does not cross the AgentEvent envelope

**Severity:** P3
**Status:** Open, scheduled, and pinned by tests.
**Area:** Protocol, routing
**What is wrong:** the structured classification that now rides the stream chunk
is dropped crossing the AgentEvent envelope, so a consumer on the far side falls
back to re-reading prose. Three gates drop it, not one: the generated
`AgentEventError` has no field, the hand-written Zod mirror in cloud-contracts
strips unknown keys before the frame is emitted, and serde discards it for the
desktop and extension consumers.
**Why it is P3 and not P1:** the envelope is not on the chat router's
classification path, and the converter has no production caller today. It is
also fail-safe rather than fail-open: a classification smuggled onto an error
frame is stripped, so the gap loses information and cannot inject a category.
Both facts are now tests.
**Do not partially fix it:** `code` and `retryable` already cross, so a
classification could be synthesised from them. That is worse than the gap,
because the runtime trusts a carried classification ahead of all text and only
runs its matcher when the field is absent, so a guessed `fallbackable` would
permanently silence the matcher for every error from this envelope. There is a
test refusing exactly that.
**What closing it takes, in order:** add an optional classification struct to
`AgentEventError` in the protocol crate with `category` kept as a string, since
the taxonomy owner is `ErrorCategory` in provider-runtime and a second copy in
Rust would drift; fix the one struct literal that breaks and add a round-trip
case; leave the schema version alone, because an optional additive field is
backward compatible by that constant's own rule; regenerate with
`pnpm generate:protocol-types`, which CI verifies, so the generated tree must
never be hand-edited; extend the Zod mirror with the same validate-before-trust
discipline the runtime uses; and only then the converter, both directions.
**Noted while tracing it:** `crates/agiworkforce-protocol/bindings/` is a second
committed copy of the same bindings, written when the cargo export test is run
directly, and no guard compares it to the published tree. The two are identical
today, checked 2026-09-12, so there is nothing to repair; it is recorded because
nothing would say so if they diverged.
**Acceptance criteria:** a classification survives a round trip through the
envelope, and a malformed one is refused rather than trusted.
**Validation:** the two pinning tests flip from asserting the loss to asserting
preservation.

## 6. Needs live validation

None of these is a confirmed defect.

### Public pages claimed things the code does not do, 2026-09-12

The flagship rewrite `d42d3cb15` moved about 38 public pages onto a new system.
Rewriting copy detached it from the behaviour it describes, and **14 false
claims were found across the 18 pages audited**, so the defect is systemic
rather than a one-off.

The one that matters most was a privacy claim. `/chrome-extension` said chat
crossed a localhost native-messaging bridge and that "models and tools run on
Desktop". Every extension turn posts to
`https://agiworkforce.com/api/llm/v1/chat/completions` with
`trustMode: 'managed_cloud'`; the bridge only ever carried selections, page
captures and queued messages. The same page said chats "don't sync anywhere by
default" while cloud mirroring reads `stored !== false` against a `true`
default. Both were wrong in the direction that understates where user data
goes, which is the direction that matters.

The rest, by kind:

- **Availability understated or overstated.** `/desktop` said macOS installers
  were not published while the release workflow builds, signs and notarizes a
  universal dmg, and the download component on that same page already checked
  for it. `/cli` described an `agi cloud` command that does not exist and that a
  CLI test actively fails the build for exposing.
- **Numbers that drifted.** `/enterprise` promised audit batches "every ten
  minutes" against a thirty-minute cron. `/status` said a Postgres query runs on
  every check, when a success inside the hour is reused without querying.
- **Entitlement understated.** `/business` called identity, audit and retention
  controls contract-scoped, when all four ship self-serve and `/enterprise`
  already said so.
- **Capability overstated.** The landing page credited Chrome with executing
  work on Desktop and Desktop with AGI Work, which is web-composer only. AGI
  Work's page described steps moving through in progress individually, when
  `advanceAgiWorkPlan` marks only the first and settles the rest at the end.
  Several keyboard and slash-command claims named bindings that do not exist,
  including a `/memory` command whose registration nothing calls.

Each correction is pinned by a regression test that was verified to fire
against the pre-fix copy, in `surface-page-claims.test.ts`,
`feature-page-claims.test.ts` and the extended `chrome-boundary-claims.test.ts`.

**About twenty of the rewritten pages have not been audited**, including
`/about`, `/api-docs`, `/docs`, `/faq`, `/help`, `/security`, `/pricing`,
`/download`, `/get-started` and the remaining feature pages. Given a 14-claim
yield from the first 18, the rest should be read the same way before launch:
extract each checkable claim, find the code that decides it, and cite it.

### The migration reconciliation is not a renumber, 2026-09-12

`pnpm check:neon-migrations` fails on this branch, so **CI cannot pass as it
stands**: the local inventory jumps 0179 to 0183, because the branch carries
`0183`/`0184`/`0185` while `origin/main` carries the same three names as
`0180`/`0181`/`0182`, which memory records as applied in production 09-07 to
09-11.

**The obvious reconciliation is a trap, and the master plan states the premise
that leads into it.** The plan says the local files "are the content of
production's 0180-0182". Two of them nearly are, differing only in the migration
number inside their own comments. The third is not:

| file                        | `create trigger sync_*` |
| --------------------------- | ----------------------- |
| `origin/main` 0182, applied | 5                       |
| local 0185, this branch     | 0                       |

`origin/main`'s 0182 is a superset of local 0185 by about 188 lines: five unit
sync triggers on `token_credits`, `credit_transactions`,
`credit_settlement_jobs`, `managed_usage_requests` and
`managed_usage_request_extensions`. Local 0185 is an earlier draft written
before they were added.

**So renumbering local 0185 to 0182 would silently drop them**, and the dropped
thing is load bearing. Its own comment says why: writers that still speak cents,
`operator-metrics.ts` at six call sites and the lease probe, leave the microUSD
twin at its zero default. The functions the same migration installs read
microUSD, so such an account holds no spendable balance, every reservation
against it is declined, and such a transaction sums as zero spend in the rolling
windows that bound a plan.

**The correct direction is to take `origin/main`'s three and drop the local
drafts, never the reverse**, and the files must be taken **byte for byte**
rather than renumbered. `planMigrations` in `scripts/lib/neon-migrations.mjs`
checksums each file and compares it against the applied ledger, and the local
drafts differ from production's in the migration number inside their own first
comment line. Renaming `0183` to `0180` therefore produces a file whose checksum
does not match the `0180` production already applied, and the check reports
drift. Copying `origin/main`'s bytes matches, because those are the bytes that
were applied.

Sequence contiguity is strict: the loop requires file `i` to carry sequence
`i + 1` from `0001`, so the inventory has to read `0001` through `0182` with no
gap.

The remediation, when FA-1 has confirmed what production holds:

1. Take `origin/main`'s `0180`, `0181` and `0182` verbatim
   (`git show origin/main:<path> > <path>`), never a renamed local copy.
2. Delete local `0183`, `0184`, `0185` and their `.down.sql` files. Their content
   is superseded: two are the same but for a comment, and `0182` is a superset
   of `0185`.
3. Move the seven source comments and the
   `scripts/config/migration-dependency-allowlist.json` reason string from
   `0185` to `0182`, `0184` to `0181`, `0183` to `0180`.

Step 2 loses the three `.down.sql` files the branch added, since `origin/main`
carries no down file for these. Writing new ones against `0182` means writing a
down for the five triggers as well, which is why this is a founder-sequenced
task and not a tidy-up. It was not attempted here.

### Retracted: the origin/main comparison, 2026-09-12

**Every number previously recorded here as an `origin/main` measurement was
void, and the conclusions drawn from them were wrong.** They are retracted
rather than edited, because the instrument, not the arithmetic, was broken.

A scratch worktree checks out the branch's own sources but resolves
`@agiworkforce/*` back into the shared checkout, so it measures foreign package
state. Three separate defects produced that, each hidden behind the previous
one:

1. Symlinking the `@agiworkforce` scope directory wholesale. The entries inside
   it are relative to the shared checkout's `node_modules`, so every one of them
   still resolved there.
2. Repointing only the root `node_modules`. pnpm links workspace dependencies
   into **each package's** `node_modules`; 185 links per worktree were never
   touched, including `apps/web`'s, which is what the web suite resolves through.
3. `packages/ai/routing/node_modules/@agiworkforce/model-registry` is a
   _relative_ symlink. It resolves through its own real path into the shared
   tree even when the scope directory above it is correct.

What the bad instrument actually measured was origin/main's **tests** against
the branch's **catalogue**, a pairing that exists nowhere. The thirteen routing
failures were entirely an artifact of it: a version matrix run in an isolated
harness gives 789/0 for origin/main against its own registry, 798/0 for the
branch against its own, and reproduces the reported 776/13 only in the mixed
pairing. Both self-consistent pairings are green.

Verified in the restored shared checkout, which is the real environment:

| package                    | result                 |
| -------------------------- | ---------------------- |
| `packages/ai/routing`      | 799 passed, 0 failed   |
| `packages/ui/unified-chat` | 1,866 passed, 0 failed |

**A clean origin/main comparison is not available, and is not worth buying.**
Only a worktree with its own real install would give one. The question it was
meant to answer, whether this pass introduced failures, is better answered per
failure from the code and the history than by a whole-suite delta.

**The rule this leaves:** a suite count from a scratch worktree is not evidence
unless the instrument was verified first, by asserting a fact that differs
between the two trees. The relink script that repairs a worktree must also never
write _through_ a `node_modules` directory that is itself a symlink; doing so
repointed 185 links in the shared checkout at the scratch tree, which was caught
and restored the same session.

### Failing `apps/web` tests found by running the whole suite, 2026-09-12

The whole `apps/web` suite had not been run this pass, only the files each change
touched. Running it in full is what surfaced these, and CI would not have: it
runs `pnpm test:affected`, which can skip the package entirely.

**The "reproduces on origin/main" claim attached to these has been withdrawn**
for the instrument reason above; treat each as a failure on this branch whose
origin is established from the code, not from a comparison run. Where that was
done the answer is recorded per item below.

They are not cosmetic, and two matter for what ships next:

- Three in the free-lane plan. The lane decides which models a FREE account is
  served, so a substitution there is a product-behaviour question, and free
  traffic is exactly what the event multiplies. Now fixed: they were stale
  assertions, and the product fact behind them is recorded below.
- One in workspace model policy. **The reading first recorded here, that a
  governed workspace can rotate onto a model its own policy forbids, was wrong
  and is withdrawn.** Instrumenting `processRequest` shows the surviving entry
  is the primary model itself reached on a second transport, not a second model,
  and policy is enforced per route at admission. The test asserted an empty
  failover plan where the correct assertion is that every entry carries the
  admitted model's own canonical key. No governance leak exists.
- One in model continuity, and one each in capability-health preview and
  aggregator routing, both failing with a type error, which usually means a
  shape changed underneath a caller.

The eleventh failure was introduced by this pass and is fixed: making the usage
summary one shared reading rather than one per component meant it outlived a
test case, so the settings pane rendered the previous case's numbers.

Three of the five were repaired on 2026-09-12 and were stale assertions rather
than broken code, with one exception worth reading: the aggregator file died at
import on origin/main, so all 27 of its tests were dead and reported as one
failure, and the in-progress repair sitting in the tree had turned two of them
into conditional runs whose conditions are false today, which left the security
assertion "never admits an experimental-only route to managed traffic" running
as skipped.

The three free-lane failures were stale assertions too, and what made them stale
is a product fact worth keeping: the lane's slot preference is derived from
`apps/web/config/free-pools.json`, and since the founder retired the two Groq
`gpt-oss` models on 2026-09-11 no pool record claims either free slot. The
OpenRouter free router that took their place in both slots may not enter the
company lane, because the terms workbook excludes it on
`promptsExcludedFromTraining` and `check-free-pools.mjs` calls its absence from
the pool file the deliberate state. So a free-plan request carrying the
preference is now headed by an unverified Model Studio promo slot rather than by
a free workhorse. No traffic moves either way, since not one pool entry is
verified and the lane mode defaults to off, but the company free lane holds no
free-workhorse capacity at all until a terms review admits a route for one. That
is a founder decision, not a code change.

The model-continuity failure does not reproduce on this tree: the file passes
alone, with the whole `chat/completions/lib` directory, and inside single-worker
runs of all 148 `app/api/llm` files and of 1,150 files across the other
directories. It cannot be reached from the committed code either, because the
route list the test marks unhealthy and the resolver's own route table are built
from the same registry records, and route health is honoured whatever the
routing flags say. The run that recorded it was reading uncommitted package
state in the shared checkout. The test now asserts that its unhealthy set really
covers the routes the resolver picked, so the next occurrence names the fixture
instead of reading as a refusal to move up the ladder.

**Retracted: the thirteen `packages/ai/routing` failures never existed.** They
were the mixed-tree artifact described above, and the package is 799/799 in the
shared checkout. What each cluster turned out to be, once measured against a
self-consistent tree:

- The conformance fixture is generated. Regenerating it with the documented
  `AGI_UPDATE_ROUTING_CONFORMANCE=1` generator reproduces the committed file
  byte for byte, and the Rust mirror passes, so nothing had drifted.
- The `auto.test.ts` and `slot-preference.test.ts` assertions were stale worked
  examples on the old catalogue, already replaced with registry-derived ones.
- The two `fallback-plan.test.ts` assertions were stale for a reason worth
  keeping: the workhorse model now has five provider routes, so parking one
  provider is absorbed _within_ the slot. The decision stays `preferred_slot`
  and continuity stays `continuity` while moving to a live route of the same
  model, which is better behaviour than the old tests demanded.

**The explicit-model contract was never broken**, on either side. It was swept
directly rather than inferred from the one test: 401 registry models by 4 tiers
by 4 tasks, zero primary swaps and zero fallback swaps on both trees. The
current encoding is the stronger one, asserting that every fallback carries the
same canonical `modelKey`, which is the actual promise that only another route
of the same model may substitute.

**One real gap fell out of it.** Loosening the reason assertion to
`['health_fallback', 'preferred_slot']` left `health_fallback` with no coverage
anywhere. The arm is still reachable, by parking every provider serving the
preferred model rather than only the primary's, and now has a registry-derived
test.

### Production catalogue measurement, 2026-09-12 10:25 UTC

Read-only, anonymous, against the live site. `/api/health` reports database,
Stripe and environment healthy. `/api/models/catalogue` shows the two defects
this pass fixes are live right now, on the deployment customers are using.

**Two models are offered to every anonymous visitor with zero routes.** They are
admitted, carry no minimum-plan label, and have an empty route list, so choosing
either cannot produce an answer under any circumstances. Six more are admitted
than should be: the free roster is three models, and the response lists eight,
which is the price-derived floor admitting models nobody named free.

**Every supplier name is served to the customer.** Eight of them appear in the
route labels the picker reads, including the two resellers.

**The public models endpoint tells a free caller that everything needs Basic.**
It returns three models and reports the minimum plan as `basic` for all three,
including the ones that account can run right now. That is the published floor
disagreeing with the gate that actually admits the turn.

All three are fixed on `fix/provider-outage-health-2026-09-12` and none of the
fixes is deployed, so the gap between this measurement and the branch is a
deployment, not engineering. Re-run the same three requests after it ships: the admitted count should fall to
the named free roster, no admitted entry should carry an empty route list, no
supplier label should appear anywhere in the response, and the models endpoint
should report `free` for the models a free account can run.

### Model usability sweep, 2026-09-12

Every selectable managed chat route was called for real, one minimal turn each,
at a 300-token budget because a smaller budget is consumed by reasoning before
any text is emitted and reads as a false empty.

**25 of 29 canonical chat models answered**, across OpenAI, Google, DeepSeek,
xAI, Moonshot, Qwen and Perplexity, plus the free router, and three models
reached through their marketplace routes rather than their own providers.

**The four Claude models are the only chat models that do not answer**, and the
cause is not code: HTTP 400, "Your credit balance is too low to access the
Anthropic API". See the founder-assistance entry.

Three probe artifacts are recorded so the next sweep does not re-raise them: the
OpenAI models refuse `max_tokens` and require `max_completion_tokens`; the
transcription, speech, image, video and embedding models are not chat models and
must not be called on a chat endpoint; and one research model returns nothing
within a single short turn by design.

Two providers hold no credential anywhere: MiniMax, which is nonetheless
reachable through its marketplace route, and Groq, whose three models therefore
cannot be served by anyone. The catalogue's executability rule already withholds
a model with no credentialed route, so neither is offered.

The tool half of the probe had never been run. Run now, 18 routes call a tool
they are handed, two of Perplexity's research models answer without calling one,
and the base model of that family refuses outright. One disagreement with the
catalogue came out of it and is left alone deliberately: one model in that family
declares it cannot call functions and called one on two separate observations, so
the flag is wrong, but the family is being retired from selection and correcting
a capability on the way out is churn. Recorded so the next reader does not have
to measure it again.

| id       | Question                                                             | Why it is still open                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| -------- | -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `LIVE-3` | Does a connector survive discover, authorize, expire, revoke?        | Completing it means granting a third party access to the founder's real accounts. That is the founder's decision to make, not an audit step, so it was deliberately not performed.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `LIVE-4` | Does web to desktop continuity complete a round trip?                | Needs two signed-in devices at once. Runtimes are distinct and boundary tests pass, but the round trip was not exercised.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `LIVE-7` | Does the durable transport rotate routes after 2f042794f?            | The generated durable step route under the web app's .well-known/workflow directory is written when the dev server starts, so the running server on `:3100` still executes the old step code. Tests cover the rotation; a live pinned-model turn on a gateway route must be re-run after the next restart.                                                                                                                                                                                                                                                                                                                                                        |
| `LIVE-6` | Do scheduled tasks actually fire?                                    | Settings shows `Runs: 0` and a past-due next run for an active weekly schedule. Local development has no cron runner attached, so this is the expected local reading. Re-check on a deployed environment before treating it as a defect.                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `LIVE-8` | Do functions stop outliving their budget once a1c1b6a1e is deployed? | Production still runs 8b2923fa7 while the deploy pipeline drains. After the deploy: the runtime-error clusters must show no 800 s timeout on the chat or flow routes, a durable turn must end within the function limit, and the timeout share on the Vercel functions overview must stay at zero. Until then the six cancelled runs are the only reason the curve is flat. Separately, `/login`, `/`, `/pricing` and `/contact-sales` are rendered by a function on every hit and receive bursts of a dozen requests every ten minutes from an unidentified external monitor or crawler; cheap today, and the public-pages pass should make those routes static. |

## 7. Execution order

Dependency-aware, not severity-ordered.

1. `AGI-28` then `AGI-27`, citations and research persistence, then sandbox
   staging. Both touch the tool loop's terminal path, so one at a time.
2. `AGI-3`, the rest of the assistant metadata. Its silent half is closed, so
   what is left is bounded and visible.
3. `AGI-5`, native CI. Needs a budget decision before an implementer; the
   trade-off is now pinned so it cannot drift while that is pending.
4. `AGI-23`. `AGI-24`, the failover pin that stopped its rotation from
   completing, is closed, so the remaining half is the catalog offering a route
   the account's own data policy refuses. Do not run it concurrently with
   `AGI-3`, both touch the chat request processor. `AGI-22` is not in this
   sequence: it is blocked on a disclosure decision, not on the threading
   `AGI-8` established.
5. `AGI-16`, citation canonicalisation. Independent, and the visible half of
   the same provenance story project retrieval closed.
6. `AGI-7`, desktop voice. Web voice is now a live session; the desktop
   gates are its own ledger.
7. `AGI-10`. Enterprise sharing, independent. `AGI-14` needs a vendor decision
   before it needs an implementer.
8. `AGI-11`, `AGI-20`, `AGI-29`, `AGI-30`, `AGI-31`. Background and polish.
   `AGI-17` needs a decision before it needs an implementer.

`AGI-12` belongs to whoever is next in `apps/desktop`.

## 8. Acceptance matrix

| Issue    | Automated                                           | Manual or live                      | Gate                                      |
| -------- | --------------------------------------------------- | ----------------------------------- | ----------------------------------------- |
| `AGI-3`  | per-class snapshot tests, e2e reload                | reload after a tool-using answer    | nothing the transcript rendered is lost   |
| `AGI-5`  | the four native lanes are pinned together           | a PR with a deliberate native break | required check fails on the PR            |
| `AGI-7`  | spec gate ledger                                    | signed build                        | 12 of 12 gates, or surface removed        |
| `AGI-10` | RLS tests mirroring 0086                            | member and non-member open attempt  | revocation takes effect                   |
| `AGI-11` | service and cron tests                              | none                                | expired token stops resolving             |
| `AGI-12` | `check:boundaries`, desktop tests                   | none                                | zero `task-1.3` markers                   |
| `AGI-14` | per-provider route tests, registry contract         | none                                | a second STT vendor exists and fails over |
| `AGI-16` | resolve-on-ingest tests, no provider host in a href | a grounded research turn            | a citation survives redirect expiry       |
| `AGI-17` | none until the decision is taken                    | none                                | founder decides conform or forgive        |
| `AGI-20` | e2e retry in a long thread                          | none                                | retried message stays in view             |
| `AGI-22` | conformance fixtures, consent record migration      | none                                | no Chinese-HQ route without consent       |
| `AGI-23` | classification test over the observed 404           | none                                | excluded route is not offered             |
| `AGI-27` | tool-loop staging cases                             | a CSV total on a non-gateway model  | no write_file copy before execute_code    |
| `AGI-28` | wire, persistence and citation cases                | a headline search, a reloaded run   | markers open sources; reload equals live  |

Every web change closes with `apps/web` typecheck run on its own.

## 9. Dependencies and parallel work

```
AGI-28 ──> AGI-27          both touch the tool loop's terminal path
AGI-3                      web persistence, independent, narrowed
AGI-5                      CI, independent, do early
AGI-23                     routing, independent now that the pin is narrowed
AGI-22                     blocked on a disclosure decision, not on code
AGI-16                     provenance, independent
LIVE-5 ──> AGI-7          desktop voice, measure before building
AGI-10                     enterprise sharing, independent
AGI-14                     blocked on a second STT vendor, not on code
AGI-11, AGI-12             background
AGI-17, AGI-20             polish, independent of everything
```

Two tracks can run at once without touching the same files: web chat
(`AGI-3`) and CI (`AGI-5`).

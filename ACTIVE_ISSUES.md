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
- 18 unresolved issues: 0 P0, 0 P1, 11 P2, 7 P3, plus 4 items needing
  validation this session could not perform. Three of them, `AGI-3`, `AGI-16`
  and `AGI-23`, are partly fixed and say which part.
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
- Five are blocked on a decision rather than on code, and each says whose and
  what it costs: `AGI-5` (CI budget), `AGI-11` (default expiry), `AGI-14` (a
  second speech-to-text vendor), `AGI-17` (conform to CommonMark or forgive it),
  `AGI-22` (the disclosure, and whether existing users are grandfathered).

### Closed in this pass

Seven issues were fixed and verified, and their sections are gone from this
file. Named here only so a reader coming from an older copy knows where they
went, and so nobody re-files them:

| Was      | What it was                                                        | Verified by                                          |
| -------- | ------------------------------------------------------------------ | ---------------------------------------------------- |
| `AGI-15` | Local development ran against the shared database                  | dev server on `:3100` now writes `agiworkforce_dev`  |
| `AGI-1`  | Managed usage leases clamped to one hour, never renewed            | `pnpm db:lease-probe` against real Postgres          |
| `AGI-2`  | Stranded reservations waited up to a day for recovery              | cron scope test, `/api/cron/recover-reservations`    |
| browser  | Non-image chat attachments failed on every route                   | `apps/web/e2e/chat-document-attachment.spec.ts`      |
| browser  | Starting a conversation inside a project failed every time         | `apps/web/e2e/project-first-conversation.spec.ts`    |
| browser  | Tool Approvals did not gate web search in either mode              | `apps/web/e2e/tool-approval-web-search.spec.ts`      |
| latent   | Approval checkpoints 500'd on a jsonb parameter                    | found by the first turn to reach that path           |
| `AGI-13` | Unimplemented native commands answered with mock success           | the guard was unreachable; rule extracted and tested |
| `AGI-19` | Marketing nav panels stayed open while the page scrolled           | `NavGroup.scroll.test.tsx`                           |
| `AGI-21` | A cancelled settings query logged at error level                   | `use-settings-queries.abort.test.tsx`                |
| `AGI-8`  | The US-only preference never reached the web resolver              | `request-processor.us-only.test.ts`                  |
| `AGI-18` | Not reproducible: the sidebar row is a correctly labelled expander | driven in a browser on `:3100`                       |
| `AGI-9`  | A forbidden connector could be connected and its credential stored | `connector-policy-gate.test.ts`                      |
| `AGI-24` | Any function tool blocked cross-provider failover for a whole turn | `managed-failover.test.ts`, red on the old predicate |
| `AGI-25` | A turn holding an approval said it had finished with no response   | live on `:3100`; the line is gone, the row remains   |

## 2. P0, critical

None. No verified security breach, privilege escalation, secret exposure, data
corruption, double charge or trust-boundary failure was found. Reservation
settlement is idempotent and concurrency-safe.

## 3. P1, high

### `AGI-SEC-API-2026-09-09` What the api security scan found, and what is left

**Severity:** P1
**Status:** 46 of 57 findings fixed across ten commits; 11 registered in
`docs/agent-context/known-flaws.md` as `WEB-SEC-SCAN-2026-09-09-*`.
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
verification rather than riding a security batch.

## 4. P2, important

### `AGI-3` Tool timeline and reasoning are still client-owned

**Severity:** P2
**Status:** Narrowed. The silent half is fixed; the rest is still client-only.
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

### `AGI-6` Web voice cannot start speaking until the whole reply is written

**Severity:** P2
**Status:** Open. The design constraint is now known and is not what it looked
like.
**Area:** Voice, web
**Root cause:** The speak effect returns while `turnActive` is true and reads
`reply.content` once, fully assembled. There is no sentence-boundary chunking
and no partial dispatch. Output is `SpeechSynthesisUtterance`, so voice and
playback are whatever the browser provides, with no provider abstraction.
**Measured 2026-09-08:** a two-sentence answer, routed by Auto to its fastest
tier model, took **6.0s** from send to response complete. Because `tts.speak()`
fires only on `replyComplete`, that 6.0s is the time to first audio. A live
voice mode starts speaking in a few hundred milliseconds.
**The constraint found on 2026-09-08, which changes the shape of the work:**
this is not a hook-local change. Barge-in is armed inside the analyser loop
behind `if (speaking)`
(`apps/web/features/chat/hooks/use-voice-session.ts:236-243`), and `speaking` is
the machine state that `voice-session-machine.ts:147-150` enters only on
`replyComplete`. Speaking chunks during `streaming` without moving that arming
would play audio the user cannot interrupt, which is worse than slow audio. So
the machine has to treat "has begun speaking" as its own condition, separate
from "the reply is finished", and barge-in has to arm on the first chunk.
**Why it was not attempted in this pass:** barge-in is real wired code and
entirely untested. The unit suite mocks `tts` as a plain object and never drives
`AudioContext`, there is no voice spec under `apps/web/e2e/`, and echo
suppression relies on the browser's `echoCancellation` constraint with nothing
confirming it cancels synthesized speech. Changing the arming condition without
being able to exercise a microphone would be shipping an unverified change to
the one interaction that lets a user stop the machine talking.
**Required behavior:** speech begins on the first complete sentence, barge-in is
armed from that moment, and the speech engine is selectable rather than fixed to
the browser.
**Evidence:** `use-voice-session.ts:271-290` (the speak effect), `:229-249` (the
analyser and barge-in), `packages/ui/unified-chat/src/voice/voice-session-machine.ts:147-150`,
`apps/web/lib/hooks/useTTS.ts` (`speak` cancels and replaces, so incremental
speech also needs an enqueueing variant). Mobile STT is genuinely on-device with
live partial results and is the strongest voice implementation in the tree.
**User impact:** Voice replies feel slow next to a live voice mode.
**Dependencies:** A way to exercise barge-in first. That is the real blocker,
and it is worth its own piece of work: a voice spec that drives `AudioContext`
with synthesized input, which would also cover the echo-suppression claim
nothing currently tests.
**Implementation direction:** in order, and not out of it: a barge-in test; then
the machine's speaking condition split from reply completion; then sentence
chunking with an enqueueing `speak`; then a speech provider interface, before
any vendor, so this stays provider-neutral.
**Acceptance criteria:** First audio begins before generation completes.
Barge-in still cancels cleanly, from the first sentence. No echo-triggered
self-interruption.
**Validation:** Instrumented latency capture, plus a barge-in spec that exists.

### `AGI-7` Desktop global voice does not meet its own release gates

**Severity:** P2
**Status:** Open
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
**Dependencies:** Independent of `AGI-6`.
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
**Status:** Half fixed. The citation no longer looks like Google's; the link
still is.
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
**What remains:** the `href` is still the redirect, so a saved conversation
still accumulates dead citations as those redirects expire. Fixing that means
resolving each redirect to its target when the grounded result is ingested,
which is a network call and does not belong in a streaming translation path.
The place for it is server-side ingestion, beside `assistant-turn-sources.ts`,
where the egress policy and `pinnedPublicFetch` already are.
**Evidence:** live session 2026-09-08, sources panel and the `Sources` chip;
`packages/ai/providers/google/src/stream.ts` `citationFromGroundingChunk`, which
carries `web.uri` (the redirect) and `web.title` (the publisher).
**User impact:** reduced. A citation no longer advertises the routing vendor,
and favicons match publishers. Links still rot.
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
**Status:** Half fixed. The refusal now rotates; the catalog still offers the route.
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
**Status:** Open.
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
**Status:** Open
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

## 6. Needs live validation

Neither of these is a confirmed defect.

| id       | Question                                                      | Why it is still open                                                                                                                                                                                                                                                                                       |
| -------- | ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `LIVE-3` | Does a connector survive discover, authorize, expire, revoke? | Completing it means granting a third party access to the founder's real accounts. That is the founder's decision to make, not an audit step, so it was deliberately not performed.                                                                                                                         |
| `LIVE-4` | Does web to desktop continuity complete a round trip?         | Needs two signed-in devices at once. Runtimes are distinct and boundary tests pass, but the round trip was not exercised.                                                                                                                                                                                  |
| `LIVE-7` | Does the durable transport rotate routes after 2f042794f?     | The generated durable step route under the web app's .well-known/workflow directory is written when the dev server starts, so the running server on `:3100` still executes the old step code. Tests cover the rotation; a live pinned-model turn on a gateway route must be re-run after the next restart. |
| `LIVE-6` | Do scheduled tasks actually fire?                             | Settings shows `Runs: 0` and a past-due next run for an active weekly schedule. Local development has no cron runner attached, so this is the expected local reading. Re-check on a deployed environment before treating it as a defect.                                                                   |

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
6. `AGI-6` then `AGI-7`, voice. `AGI-6` is sized at 6.0s to first audio, and
   starts with a barge-in test rather than with chunking.
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
| `AGI-6`  | a barge-in spec that drives AudioContext            | measured time to first audio        | audio starts early AND is interruptible   |
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
LIVE-5 ──> AGI-6 ──> AGI-7 voice, measure before building
AGI-10                     enterprise sharing, independent
AGI-14                     blocked on a second STT vendor, not on code
AGI-11, AGI-12             background
AGI-17, AGI-20             polish, independent of everything
```

Three tracks can run at once without touching the same files: web chat
(`AGI-3`), CI (`AGI-5`), and voice (`AGI-6`).

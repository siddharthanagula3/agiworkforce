# Active issues and execution plan

Status: Current
Owner: Founder + platform lead
Last updated: 2026-09-08

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
- 13 unresolved issues: 0 P0, 1 P1, 10 P2, 2 P3, plus 3 items needing
  validation this session could not perform. Four of them, `AGI-3`, `AGI-4`,
  `AGI-16` and `AGI-23`, are partly fixed in this pass and say which part.

### Closed in this pass

Seven issues were fixed and verified, and their sections are gone from this
file. Named here only so a reader coming from an older copy knows where they
went, and so nobody re-files them:

| Was       | What it was                                                    | Verified by                                       |
| --------- | -------------------------------------------------------------- | ------------------------------------------------- |
| `AGI-15`  | Local development ran against the shared database              | dev server on `:3100` now writes `agiworkforce_dev` |
| `AGI-1`   | Managed usage leases clamped to one hour, never renewed        | `pnpm db:lease-probe` against real Postgres        |
| `AGI-2`   | Stranded reservations waited up to a day for recovery          | cron scope test, `/api/cron/recover-reservations`  |
| browser   | Non-image chat attachments failed on every route               | `apps/web/e2e/chat-document-attachment.spec.ts`    |
| browser   | Starting a conversation inside a project failed every time     | `apps/web/e2e/project-first-conversation.spec.ts`  |
| browser   | Tool Approvals did not gate web search in either mode          | `apps/web/e2e/tool-approval-web-search.spec.ts`    |
| latent    | Approval checkpoints 500'd on a jsonb parameter                | found by the first turn to reach that path         |
| `AGI-13`  | Unimplemented native commands answered with mock success       | the guard was unreachable; rule extracted and tested |
| `AGI-19`  | Marketing nav panels stayed open while the page scrolled       | `NavGroup.scroll.test.tsx`                        |
| `AGI-21`  | A cancelled settings query logged at error level               | `use-settings-queries.abort.test.tsx`             |
| `AGI-8`   | The US-only preference never reached the web resolver          | `request-processor.us-only.test.ts`               |
| `AGI-18`  | Not reproducible: the sidebar row is a correctly labelled expander | driven in a browser on `:3100`                |
| `AGI-9`   | A forbidden connector could be connected and its credential stored | `connector-policy-gate.test.ts`               |

## 2. P0, critical

None. No verified security breach, privilege escalation, secret exposure, data
corruption, double charge or trust-boundary failure was found. Reservation
settlement is idempotent and concurrency-safe.

## 3. P1, high

### `AGI-4` Project retrieval is fixed but not yet seen working in a browser

**Severity:** P1
**Status:** Fixed and unit-verified. Live verification outstanding.
**Area:** Project knowledge retrieval
**What was fixed:** Ranking and selection are now one pass. `scoreKnowledgeFile`
scored the whole `extractedText` while selection took `content.slice(0, limit)`,
so the passage that earned a file its rank was routinely not in what was sent.
`project-knowledge-passages.ts` cuts a document into overlapping windows, ranks
them with the BM25 retriever the support agent already uses, and spends the same
prompt budget on the passages that answer the question, in document order, each
carrying the character range it came from. A document that fits is still sent
whole; with no query, or with a query the document matches nowhere, it still
falls back to the head, which is the only defensible choice there.
**Verified:** `project-knowledge-passages.test.ts` drives the real
`loadProjectContext` and `formatProjectSystemPrompt` with the answer placed at
the beginning, the middle and the end of a document several times the per-file
budget. All three reach the prompt; before the change only the first did.
**What is outstanding:** a browser pass. Three unrelated things blocked it on
2026-09-08: the project composer inherits AGI Work mode from `AGI-18`, an agent
run reaches for code execution which now correctly stops for approval, and Auto
selected the route in `AGI-23`. None of them are retrieval, and none should be
worked around inside a retrieval test. Re-run once `AGI-23` and `AGI-18` are
closed.
**Remaining known limits, unchanged by this:** long documents are still
truncated at extraction (`MAX_EXTRACTED_PROJECT_TEXT_CHARS = 200_000`, plus a
250 page PDF cap), and there is still no docx, xlsx or pptx extraction. Those
are extraction gaps, not retrieval gaps.
**Dependencies:** `AGI-23` for the live check only.
**Acceptance criteria:** a question aimed at the back half of a long project
file is answered from it, in a browser.
**Validation:** the passage tests above, plus one live project question.

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
**Status:** Open
**Area:** Voice, web
**Root cause:** The speak effect returns early while `turnActive` is true and
reads `reply.content` once, fully assembled. There is no sentence-boundary
chunking of the token stream and no partial dispatch. Output is
`SpeechSynthesisUtterance`, so voice and playback are whatever the browser
provides, and there is no provider abstraction to route elsewhere.
**Current behavior:** Time to first audio is bounded below by full reply
generation. Barge-in is implemented. This supports a usable turn-based
conversation and should not be described as absent, but it does not match a
live, simultaneous voice mode.
**Required behavior:** Speech begins on the first complete sentence, and the
speech engine is selectable rather than fixed to the browser.
**Evidence:** `apps/web/features/chat/hooks/use-voice-session.ts:271-290`;
`packages/ui/unified-chat/src/voice/voice-session-machine.ts:147-150`
(`streaming` to `speaking` only on `replyComplete`); `apps/web/lib/hooks/useTTS.ts`.
Barge-in is real wired code (`use-voice-session.ts:229-249`, a mic analyser
running concurrently with playback) but is untested: the unit suite mocks `tts`
as a plain object and never drives `AudioContext`, and there is no voice spec
under `apps/web/e2e/`. Echo suppression relies entirely on the browser's
`echoCancellation` constraint, with no code confirming it cancels synthesized
speech. Mobile STT is genuinely on-device with live partial results and is the
strongest voice implementation in the repository.
**Measured 2026-09-08:** a two-sentence answer, routed by Auto to its fastest
tier model, took **6.0s** from send to response
complete. Because `tts.speak()` only fires on `replyComplete`, that 6.0s is the
time to first audio for that turn. A live voice mode starts speaking in a few
hundred milliseconds.
**User impact:** Voice replies feel slow next to a live voice mode.
**Dependencies:** Measure before building. See `LIVE-5`.
**Implementation direction:** Chunk the assistant stream on sentence
boundaries and speak incrementally, which is the cheap win inside the current
architecture. Introduce a speech provider interface before adding any vendor,
so this stays provider-neutral. Decide on a realtime audio route only against
measured numbers.
**Acceptance criteria:** First audio begins before generation completes.
Barge-in still cancels cleanly. No echo-triggered self-interruption.
**Validation:** Instrumented latency capture, plus existing voice session
tests.

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

### `AGI-14` Speech to text is hard-coupled to one provider

**Severity:** P2
**Status:** Open
**Area:** Provider neutrality, voice
**Root cause:** The managed transcription route resolves a model, refuses
anything whose provider is not OpenAI, and calls that vendor's endpoint directly
instead of going through the provider abstraction the rest of the product uses.
**Current behavior:** Transcription rejects the request when the resolved
model's provider is not `openai`. Voice input has a single point of failure and
a single vendor's pricing, on a product whose stated differentiator is model and
provider neutrality.
**Required behavior:** Transcription resolves through the same registry and
routing path as every other capability, with at least one fallback provider.
**Evidence:** `apps/web/app/api/llm/v1/audio/transcriptions/route.ts:377`
(`defaultModel.provider !== 'openai'`), `:387`, `:521`
(`providerApiUrl('openai', 'audio/transcriptions')`), `:232`, `:247`.
**User impact:** Voice input stops entirely if one vendor is unavailable, and
its cost cannot be routed.
**Dependencies:** Shares the voice surface with `AGI-6`, but is separate work.
**Implementation direction:** Model transcription as a registry capability with
a provider fallback chain, the way chat providers are already selected. Do not
add a second hardcoded vendor.
**Acceptance criteria:** Transcription succeeds through at least two providers
and fails over. No provider literal remains at the call site.
**Validation:** Route tests per provider, plus registry contract tests.

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
`known-flaws.md`.

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
**Dependencies:** None. `AGI-24` prevents the rotation from completing on any
turn carrying tools, so both are needed before this reads as fixed to a user.
**Acceptance criteria:** the route is not offered, or one refusal withdraws it
for the window.
**Validation:** the classification test in `provider-runtime`, plus a route
health assertion.

### `AGI-24` A turn carrying any function tool cannot fail over to another provider

**Severity:** P2
**Status:** Open, observed but not diagnosed.
**Area:** Provider routing, failover
**Root cause:** `mustStayOnProvider = requestCarriesTools(processed)`, and
`requestCarriesTools` is true when the request carries any tool that is NOT a
provider-native search, which is every ordinary function tool. Every candidate
on a different provider is then skipped with "provider-native tools cannot
transfer providers", a message that describes the opposite of the predicate.
**Current behavior (observed live 2026-09-08):** a turn whose route was refused
outright rotated through its whole fallback list and skipped every candidate, on two
different providers, because a function tool was attached. The turn failed with no answer despite Auto having working routes
available.
**Why it might be deliberate:** a mid-turn provider switch could invalidate
tool-call ids already in the transcript. That would justify the restriction from
the second provider step onward, not on the first, and function tool schemas are
translated per provider by design.
**Required behavior:** determine which of the two the restriction is for, and
say so in the code. Either narrow it to provider-native tools, which is what its
own message claims, or narrow it to steps after the first, or document why a
first-step rotation is unsafe.
**Evidence:** `apps/web/app/api/llm/v1/chat/completions/lib/managed-failover.ts`
`requestCarriesTools` and the `mustStayOnProvider` skip; dev log 2026-09-08
22:56:54 UTC, four consecutive skips on one turn.
**User impact:** Auto stops being Auto for any turn with a tool attached, which
is most agentic turns.
**Dependencies:** None. Compounds `AGI-23`.
**Implementation direction:** Do not change the predicate before establishing
which invariant it protects; there is no comment and the message contradicts the
code, so one of the two is wrong and guessing which would be a regression.
**Acceptance criteria:** a first-step route failure on a tool-carrying Auto turn
reaches a working route, or the restriction carries a stated reason.
**Validation:** failover unit tests over a tool-carrying request.

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

## 6. Needs live validation

Neither of these is a confirmed defect.

| id       | Question                                                      | Why it is still open                                                                                                                                                              |
| -------- | ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `LIVE-3` | Does a connector survive discover, authorize, expire, revoke? | Completing it means granting a third party access to the founder's real accounts. That is the founder's decision to make, not an audit step, so it was deliberately not performed. |
| `LIVE-4` | Does web to desktop continuity complete a round trip?         | Needs two signed-in devices at once. Runtimes are distinct and boundary tests pass, but the round trip was not exercised.                                                          |
| `LIVE-6` | Do scheduled tasks actually fire?                             | Settings shows `Runs: 0` and a past-due next run for an active weekly schedule. Local development has no cron runner attached, so this is the expected local reading. Re-check on a deployed environment before treating it as a defect. |

## 7. Execution order

Dependency-aware, not severity-ordered.

1. `AGI-4`, project passage retrieval. The largest remaining user-visible gap,
   and the second half of the project workflow the conversation-creation fix
   reopened.
2. `AGI-3`, the rest of the assistant metadata. Its silent half is closed, so
   what is left is bounded and visible.
3. `AGI-5`, native CI. Needs a budget decision before an implementer; the
   trade-off is now pinned so it cannot drift while that is pending.
4. `AGI-24`, then `AGI-23`. One implementer, in that order: until failover can
   complete, nothing downstream of it is observable, and `AGI-23` is what
   exposed `AGI-24`. Do not run these concurrently with `AGI-4`, both touch the
   chat request processor. `AGI-22` is not in this sequence: it is blocked on a
   disclosure decision, not on the threading `AGI-8` established.
5. `AGI-16`, citation canonicalisation. Independent, and the visible half of the
   same provenance story as `AGI-4`.
6. `AGI-6` then `AGI-7`, voice. `AGI-6` is sized: 6.0s measured to first audio.
7. `AGI-10`, `AGI-14`. Enterprise and provider neutrality, independent of each
   other.
8. `AGI-11`, `AGI-20`. Background and polish. `AGI-17` needs a decision before
   it needs an implementer.

`AGI-12` belongs to whoever is next in `apps/desktop`.

## 8. Acceptance matrix

| Issue    | Automated                                       | Manual or live                     | Gate                                   |
| -------- | ----------------------------------------------- | ---------------------------------- | -------------------------------------- |
| `AGI-3`  | per-class snapshot tests, e2e reload            | reload after a tool-using answer   | nothing the transcript rendered is lost |
| `AGI-4`  | passage retrieval unit tests                    | question set over a long document  | beginning, middle and end all answered |
| `AGI-5`  | the four native lanes are pinned together       | a PR with a deliberate native break | required check fails on the PR         |
| `AGI-6`  | voice session tests                             | measured time to first audio       | audio starts before generation ends    |
| `AGI-7`  | spec gate ledger                                | signed build                       | 12 of 12 gates, or surface removed     |
| `AGI-10` | RLS tests mirroring 0086                        | member and non-member open attempt | revocation takes effect                |
| `AGI-11` | service and cron tests                          | none                               | expired token stops resolving          |
| `AGI-12` | `check:boundaries`, desktop tests               | none                               | zero `task-1.3` markers                |
| `AGI-14` | per-provider route tests, registry contract     | none                               | transcription fails over between vendors |
| `AGI-16` | resolve-on-ingest tests, no provider host in a href | a grounded research turn       | a citation survives redirect expiry     |
| `AGI-17` | none until the decision is taken                | none                               | founder decides conform or forgive     |
| `AGI-20` | e2e retry in a long thread                      | none                               | retried message stays in view          |
| `AGI-22` | conformance fixtures, consent record migration  | none                               | no Chinese-HQ route without consent    |
| `AGI-23` | classification test over the observed 404       | none                               | excluded route is not offered          |
| `AGI-24` | failover tests over a tool-carrying request     | none                               | a tool turn reaches a working route    |

Every web change closes with `apps/web` typecheck run on its own.

## 9. Dependencies and parallel work

```
AGI-4                      retrieval, independent
AGI-3                      web persistence, independent, narrowed
AGI-5                      CI, independent, do early
AGI-24 ──> AGI-23          routing, one implementer, ordered
AGI-22                     blocked on a disclosure decision, not on code
AGI-16                     provenance, independent
LIVE-5 ──> AGI-6 ──> AGI-7 voice, measure before building
AGI-10, AGI-14             enterprise and neutrality, independent
AGI-11, AGI-12             background
AGI-17, AGI-20             polish, independent of everything
```

Four tracks can run at once without touching the same files: retrieval
(`AGI-4`), web chat (`AGI-3`), CI (`AGI-5`), and voice (`AGI-6`). `AGI-8` and
`AGI-4` both touch the chat request processor, so do not run them concurrently.

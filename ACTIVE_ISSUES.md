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
- 16 unresolved issues: 0 P0, 1 P1, 12 P2, 3 P3, plus 3 items needing
  validation this session could not perform. Three of them, `AGI-3`, `AGI-4`
  and `AGI-23`, are partly fixed in this pass and say which part.

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
**Dependencies:** `AGI-23` and `AGI-18` for the live check only.
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
**Status:** Open
**Area:** CI
**Root cause:** `rust-desktop-cli` in `ci.yml` is gated on
`needs.scope.outputs.native_changed == 'true' && github.ref == 'refs/heads/main'`,
a deliberate, commented cost tradeoff.
**Current behavior:** More runs pre-merge than the Codex audit stated.
`codeql.yml` triggers on `pull_request` for `**/*.rs`, `**/Cargo.toml` and
`**/Cargo.lock` and runs the identical clippy command for
`agiworkforce-desktop` and `agiworkforce-cli`, which type-checks those two
crates. Still entirely post-merge: `cargo test` at any scope, every crate in
`crates/*` (the ported workspace, 100+ crates), macOS and Windows compilation,
the extended-features clippy lane, and `cargo deny`.
**Required behavior:** A bounded required native lane on pull requests covering
the compilation and test surface a desktop product depends on, with the full
matrix left in the release lane.
**Evidence:** the same `github.ref == 'refs/heads/main'` condition gates four
jobs, not one: `rust-desktop-cli` (`.github/workflows/ci.yml:549`),
`clippy-all-features` (`:1187`), `macos-smoke` (`:1273`) and `windows-smoke`
(`:1320`). `auto-route-conformance` (`:526`) does run on pull requests but only
replays one fixture against the narrow `agiworkforce-model-registry` crate.
`.github/workflows/codeql.yml:56-63` (`cargo audit`), `:83-92` (clippy).
`windows-smoke`'s own `cargo test` step carries `continue-on-error: true` even
on its main-only run.
**Guardrail gap:** `scripts/check-ci-guardrails.mjs` and
`scripts/check-ci-lane-independence.test.mjs` enforce structural invariants but
neither encodes the `github.ref` half of the condition, so nothing in the
repository's own CI-testing-the-CI layer would fail if that gate changed.
**Severity note:** production is not directly exposed. `deploy-production.yml`
only promotes after a `CI` run concludes `success` on a push to main and checks
out that exact SHA, so a post-merge native failure blocks promotion. The cost is
main-branch health and developer velocity, which is why this is P2 and not P1.
**User impact:** A native regression in `crates/*` or a platform-specific break
is caught at merge, not at review.
**Dependencies:** None.
**Implementation direction:** Add a PR-triggered job covering `cargo test` for
the shipped crates plus a `crates/*` compile check, sized to stay inside the
existing CI budget. Confirm the required status actually runs on a
representative native PR.
**Acceptance criteria:** A deliberately broken `crates/*` change fails a
required check on a pull request.
**Validation:** A draft PR carrying a known break.

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
**Measured 2026-09-08:** a two-sentence answer, routed by Auto to the fastest
tier model (Gemini 3.5 Flash-Lite), took **6.0s** from send to response
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

### `AGI-8` The US-only routing preference has no effect on the web path

**Severity:** P2
**Status:** Open
**Area:** Provider routing
**Root cause:** The policy is implemented and tested, but the persisted user
preference is never read on the web request path. Merges two register rows that
describe one defect.
**Current behavior:** `usOnly` is a real provider-exclusion overlay: tiers
`max` and `enterprise`, excluding `deepseek`, `qwen`, `moonshot`, `zhipu`,
`minimax`. The Rust resolver applies it and TS routing tests cover it. The
preference is persisted through `/api/me/routing-preferences`, and nothing in
the web request processor reads `us_only`, so a `max` user who sets it is still
routed to an excluded provider. A regression test stops an active web control
from advertising the unenforced preference, so this is not currently a false
promise in the UI.
**Required behavior:** The stored preference reaches the web routing resolver,
or the preference is removed. Do not describe this as data residency.
`docs/decisions/2026-09-04-region-neutral-data-residency.md` is accepted and
US-only already applies to every managed route, so the real value here is
provider jurisdiction choice, not residency.
**Evidence:** `packages/ai/model-registry/catalog/routing-policies.json:104-108`;
enforcement exists in both languages, `packages/ai/routing/src/auto.ts:1030-1034`
and `crates/agiworkforce-model-registry/src/lib.rs:790-800`. The break is exact:
`buildWebCloudAutoRoutingRequest`
(`apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1429-1509`)
builds every real web routing request and never sets `usOnly`. Its structurally
identical sibling `zeroDataRetentionOnly` **is** threaded through the same
function into `canonical-request.ts:122`, which is the pattern to copy and
strong evidence this is an oversight rather than a decision. Also
`packages/contracts/cloud-contracts/src/me.ts:27`;
`apps/web/app/api/me/routing-preferences/route.ts:17-21`.
**Residual risk:** the GET and PUT routes are live and callable by any
authenticated client even with no UI wired to them, which the source-scanning
guard does not cover.
**User impact:** An eligible customer cannot actually exclude those providers on
web.
**Dependencies:** None. Also check `geo_overlay` in the same schema, which
looks like the same gap.
**Implementation direction:** Thread the persisted preference into the routing
request built by the web request processor, matching the Rust resolver. Only
then may a control be shown.
**Acceptance criteria:** With the preference set, no excluded provider is
selected on web for an eligible tier. With it unset, routing is unchanged.
**Validation:** Extend the auto-route conformance fixtures to the web path.
**Retires:** `WEB-ROUTE-ROUTING-PREFERENCE-PERSISTED-CALLER-01`,
`WEB-US-ONLY-ROUTING-NOT-THREADED-01`.

### `AGI-9` Organization connector policy is not enforced when a connector is added

**Severity:** P2
**Status:** Open
**Area:** Authorization, connectors
**Root cause:** The stored organization policy is consulted only when tools are
read for a chat turn, not on the connect, authorize or create path.
**Current behavior:** A member can connect and authorize a connector the
organization policy forbids. The policy applies later, at tool read time.
**Required behavior:** Policy is evaluated at the moment of connection and
authorization, and denies before any credential is exchanged.
**Evidence:** `apps/web/app/api/connectors/custom/route.ts`; register rows
`CONN-ROUTE-ORG-CONNECTOR-POLICY-CHECKED-01` and `CAP-030`; the UI-side symptom
is `GAP-180`.
**User impact:** An organization control is advisory where it reads as binding.
**Dependencies:** None.
**Implementation direction:** One shared policy check called by the connect,
authorize and create routes. One canonical owner, not a copy per route.
**Acceptance criteria:** A forbidden connector cannot be connected or
authorized, and the denial is visible where the connector is managed.
**Validation:** Route tests per path, plus an organization policy test.

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

### `AGI-16` Citations carry the routing provider's redirect, not the publisher

**Severity:** P2
**Status:** Open
**Area:** Research, citations, provider neutrality
**Root cause:** Grounded search results are surfaced with the provider's
grounding-redirect URL rather than the resolved publisher URL, and the source
card's icon is derived from the redirect host instead of the publisher domain.
**Current behavior (verified live 2026-09-08):** a web research turn routed to
Gemini returned four sources. Each card correctly names the publisher
(`anthropic.com`, `claude.com`, `youtube.com`) but shows
`vertexaisearch.cloud.google.com` as the host, renders Google's favicon for
every source regardless of publisher, and links to
`https://vertexaisearch.cloud.google.com/grounding-api-redirect/...`.
**Required behavior:** a citation resolves to the publisher's own URL and shows
the publisher's favicon. Which model answered is disclosed separately, as it
already is.
**Evidence:** live session, sources panel and the `Sources` chip; hrefs read
from the DOM were all grounding redirects.
**User impact:** Three problems at once. Citations advertise the routing vendor
on a product sold on provider neutrality; every source looks like it came from
Google; and grounding redirects expire, so saved conversations accumulate dead
citations.
**Dependencies:** None. Independent of `AGI-4`, though both concern provenance.
**Implementation direction:** Resolve the redirect to its target when ingesting
a grounded result, store the publisher URL, and derive the favicon from that
domain. Keep the redirect only as a fallback. The support agent's
`buildCitation` already models title, canonical URL and snippet; reuse that
shape.
**Acceptance criteria:** No provider hostname appears in a rendered citation.
Favicons match publishers. A citation still resolves after the provider's
redirect expires.
**Validation:** A research turn on each grounded provider, asserting no
provider host appears in any citation href.

### `AGI-22` The provider-jurisdiction consent gate is never called

**Severity:** P2
**Status:** Open
**Area:** Compliance, routing
**Root cause:** `isProviderRoutingAllowed` checks recorded consent before
routing to a Chinese-headquartered provider, and is correct. Nothing calls it.
Neither `apps/web` nor `packages/ai/routing` imports it, `llm-gate.ts`, or
`@agiworkforce/compliance` anywhere on the chat request path.
**Current behavior:** Auto routing can place a conversation on DeepSeek,
Moonshot, Qwen or Zhipu with no consent recorded. Mobile has a client-side
consent surface that nothing server-side backs.
**Required behavior:** The gate is consulted where the route is chosen, not
where a client chooses to ask.
**Evidence:** `packages/contracts/compliance/src/provider-jurisdiction.ts:40`,
called only from `packages/contracts/compliance/src/llm-gate.ts:53,65`; zero
call sites anywhere else. Carried in from the 2026-08-26 scan, re-verified
against current source 2026-09-08.
**User impact:** A consent record the product presents as obtained is not
enforced.
**Dependencies:** None. Sits next to `AGI-8`: both are routing preferences that
exist and are not read on the web path, and both should be threaded through
`buildWebCloudAutoRoutingRequest`.
**Implementation direction:** One call in the routing request builder, beside
`zeroDataRetentionOnly`. Do not add a second gate in the UI.
**Acceptance criteria:** Without recorded consent, no Chinese-HQ provider is
selected for an eligible user.
**Validation:** Auto-route conformance fixtures on the web path.
**Already tracked as:** `COMPLIANCE-LLM-GATE-SURFACE-COVERAGE-01` in
`known-flaws.md`, which describes the same "gate exists, nothing calls it"
shape without naming this scenario.

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
`openrouter`, model `gpt-5.6-sol`, three occurrences within the minute.
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
outright rotated through its whole fallback list and skipped every candidate,
including `claude-opus-5` and `gemini-3.5-flash-lite`, because a function tool
was attached. The turn failed with no answer despite Auto having working routes
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

### `AGI-18` A project in the sidebar attaches itself instead of opening

**Severity:** P3
**Status:** Open
**Area:** Navigation
**Root cause:** The sidebar row and the Projects grid card are wired to
different actions. The grid card navigates; the sidebar row attaches the
project as composer context and flips the mode toggle from Chat to AGI Work.
**Current behavior:** Clicking a project in the left sidebar from the chat home
screen silently changes the composer's mode and scope, with no navigation. The
same project clicked from the Projects page opens it.
**Required behavior:** One name, one action. If attaching as context is wanted,
it needs its own affordance and its own label.
**Evidence:** browser QA 2026-09-08; `ProjectCard` exposes
`Open project <name>`, the sidebar row does not.
**User impact:** Undiscoverable, and it changes the mode of the next send
without saying so.
**Dependencies:** None.
**Implementation direction:** Decide which action the row performs and make its
accessible name say so. Do not leave two behaviours behind one label.
**Acceptance criteria:** A project row's name describes what clicking it does,
and both entry points agree.
**Validation:** Component test on the sidebar row, plus a navigation spec.

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
3. `AGI-5`, native CI. Out of order on purpose: it protects every later native
   change, and every day it is not done is another merge without validation.
4. `AGI-24`, then `AGI-23`, then `AGI-8`, then `AGI-22`. One implementer, in
   that order. `AGI-24` first because until failover can complete, nothing
   downstream of it is observable; `AGI-23` next because it is what exposed
   `AGI-24`; then the two preferences that exist and are not consulted, `AGI-8`
   establishing the threading `AGI-22` reuses. Do not run these concurrently
   with `AGI-4`, both touch the chat request processor.
5. `AGI-16`, citation canonicalisation. Independent, and the visible half of the
   same provenance story as `AGI-4`.
6. `AGI-6` then `AGI-7`, voice. `AGI-6` is sized: 6.0s measured to first audio.
7. `AGI-9`, `AGI-10`, `AGI-14`. Enterprise and provider neutrality, independent
   of each other.
8. `AGI-11`, `AGI-18`, `AGI-20`. Background and polish. `AGI-17` needs a
   decision before it needs an implementer.

`AGI-12` belongs to whoever is next in `apps/desktop`.

## 8. Acceptance matrix

| Issue    | Automated                                       | Manual or live                     | Gate                                   |
| -------- | ----------------------------------------------- | ---------------------------------- | -------------------------------------- |
| `AGI-3`  | per-class snapshot tests, e2e reload            | reload after a tool-using answer   | nothing the transcript rendered is lost |
| `AGI-4`  | passage retrieval unit tests                    | question set over a long document  | beginning, middle and end all answered |
| `AGI-5`  | PR with a deliberate native break               | none                               | required check fails on the PR         |
| `AGI-6`  | voice session tests                             | measured time to first audio       | audio starts before generation ends    |
| `AGI-7`  | spec gate ledger                                | signed build                       | 12 of 12 gates, or surface removed     |
| `AGI-8`  | auto-route conformance on the web path          | none                               | no excluded provider for an opted user |
| `AGI-9`  | per-route policy tests                          | none                               | forbidden connector cannot authorize   |
| `AGI-10` | RLS tests mirroring 0086                        | member and non-member open attempt | revocation takes effect                |
| `AGI-11` | service and cron tests                          | none                               | expired token stops resolving          |
| `AGI-12` | `check:boundaries`, desktop tests               | none                               | zero `task-1.3` markers                |
| `AGI-14` | per-provider route tests, registry contract     | none                               | transcription fails over between vendors |
| `AGI-16` | assert no provider host in any citation href    | a grounded research turn           | publisher favicon and publisher URL    |
| `AGI-17` | none until the decision is taken                | none                               | founder decides conform or forgive     |
| `AGI-18` | sidebar row component test                      | click from both entry points       | one label, one action                  |
| `AGI-20` | e2e retry in a long thread                      | none                               | retried message stays in view          |
| `AGI-22` | auto-route conformance on the web path          | none                               | no Chinese-HQ route without consent    |
| `AGI-23` | classification test over the observed 404       | none                               | excluded route is not offered          |
| `AGI-24` | failover tests over a tool-carrying request     | none                               | a tool turn reaches a working route    |

Every web change closes with `apps/web` typecheck run on its own.

## 9. Dependencies and parallel work

```
AGI-4                      retrieval, independent
AGI-3                      web persistence, independent, narrowed
AGI-5                      CI, independent, do early
AGI-24 ──> AGI-23 ──> AGI-8 ──> AGI-22   routing, one implementer, ordered
AGI-16                     provenance, independent
LIVE-5 ──> AGI-6 ──> AGI-7 voice, measure before building
AGI-9, AGI-10, AGI-14      enterprise and neutrality, independent
AGI-11, AGI-12             background
AGI-17, AGI-18, AGI-20     polish, independent of everything
```

Four tracks can run at once without touching the same files: retrieval
(`AGI-4`), web chat (`AGI-3`), CI (`AGI-5`), and voice (`AGI-6`). `AGI-8` and
`AGI-4` both touch the chat request processor, so do not run them concurrently.

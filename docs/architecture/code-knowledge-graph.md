# Code knowledge graph: bounded reconstruction

Status: Source snapshot, not runtime acceptance
Owner: Platform + application maintainers
Last updated: 2026-11-04

## Provenance and coverage

This document maps only the source reconstructed and independently read on
`fix/recovered-core-safety`, starting from `ee717702b0`. It is not a recovered
copy of the earlier architecture graph or an exhaustive codebase audit.

Coordination history reports that the earlier 217-commit working branch and
local recovery bundles became unavailable after an environment rollback. Those
remembered changes are not evidence of code present in this checkout. They are
not listed as implemented here. Fresh source and accepted commit identities,
not conversation recollection, determine the entries below. External backup
handling is separate; this document does not certify backup restoration.

The repository's architecture owners remain `overview.md`, `trust-boundaries.md`
and root `ARCHITECTURE.md`. This dated map supplements them; defects and release
acceptance belong in the existing `audit/` owners, not a duplicate tracker here.
No tests, checks, builds, formatters, network requests or runtime probes were
performed for this map. Authored regression sources remain unexecuted.

## Private shared-reader cookie admission

Reconstructed commit: `0edf21eb459dd54fb0b8d74c15fbb7b1d12ff580`.
The eleven-file group includes five production files and six regression sources.
The source diff and canonical admission/governing-organization helpers were read.

Ownership graph:

- `/share/[token]` page and `/api/share/[token]` GET first attempt the existing
  public shared-session read. The published-artifact page similarly tries its
  public artifact read first. Public success does not require cookie admission.
- Only the authenticated fallback calls
  `lib/server/rls-db.ts::getCurrentCookieUserRlsDb(request)`. The API passes its
  actual request; server pages construct a request using incoming headers and
  their canonical page URL, retaining network-policy context.
- That helper captures one cookie identity, invokes
  `lib/api-auth.ts::getCookieSessionAuthUser` with it, and only afterward obtains
  that identity's token and constructs `withUser(token)` RLS scope. Missing
  identity/token or admission 401/403 returns no private reader; other admission
  failures propagate from the helper. Page callers retain their unavailable
  fallback. Returned user identity is the canonical mapped account, not an
  independently trusted raw provider subject.
- The extracted cookie admission is also used by the existing API-auth cookie
  branch. It retains absolute session lifetime, active-account/account-security,
  MFA and IP allow-list gates, tenant context and session sighting. Bearer
  credentials do not become an alternative identity for this cookie-only reader.
- Existing RLS decides whether the admitted account can read the organization
  session/artifact. The artifact's invited-reader fallback remains after its
  organization read. Admission does not add selected-workspace equality:
  `governing-organizations.ts` intentionally supplies all governing organizations
  for account-level policy, independent of the selected workspace/header.

This closes the inspected private-reader admission omission at the source level;
it does not change public audience semantics, prove deployed RLS behavior,
provide continuous revocation after a read, or establish a cache/attachment/bearer
bypass. The older generic `getCurrentUserRlsDb` remains for other callers and is
not globally migrated by this slice. The canonical account gate retains its
selected-workspace lockdown lookup, not a new lockdown check against the actual
shared resource's organization. RLS still uses the cookie's raw JWT; the existing
provider-subject versus canonical-account mapping in database authorization is
unchanged and is not claimed resolved. Regression source covers cookie refusal,
missing token, mapped account, unavailable admission, public-first reads and
organization/invited fallback; no runtime acceptance is claimed.

## Dirty-message sync merge ownership

Reconstructed commit: `c521f9967d4f346e0cfad214c0f1749802632e50`.
The five-file group contains three production files and two unexecuted regression
sources. Shared `packages/client/sync/src/messages.ts` now owns `DirtyMessageRef`;
mobile's sync-state store imports/re-exports that type rather than duplicating it.

`cloudSyncEngine.ts` supplies current dirty references to shared delta merge.
For a live existing dirty row with a syncable role, the merge derives exactly the
push-owned role/content/metadata and explicitly supplied model/provider from
`toMessagePushItem`. It still adopts remote server version, creation time and
supplied parent metadata. Omitted parent retains learned lineage. Omitted model/
provider is not an instruction to erase labels: server sync SQL distinguishes
field presence and preserves existing columns when omitted, so the merged server
labels remain appropriate. Absent local metadata normalizes through the existing
push serializer rather than inventing a second payload contract.

Remote tombstones remove rows before dirty preservation. On push conflict, a
newer local edit rebases against live remote metadata and remains dirty; a
conflict without a newer local edit, or with a remote tombstone, accepts the
remote winner and clears the resolved dirty reference. References are scoped
by conversation and message ID. Missing local rows are inserted through normal
remote merge, not synthesized from an absent dirty snapshot.

This is field ownership and retry rebasing, not a server deletion/tombstone
redesign, protection against all delayed-create resurrection, or proof of
cross-device convergence. Source fixtures cover in-flight echo/retry, omitted
labels/metadata and reference scope; no tests, checks or runtime validation ran.

## Checkpoint organization context-policy authority

Reconstructed production commit: `d1becb90b4643d54d099a3fe74f51a11a61b21dc`
(13 files). Accepted regression-source companion:
`2461be995a02b490853951687e510267f381baa5` (16 files), unexecuted. The
implementation worker reported only `git diff --check`, not tests; this
documentation pass executed no checks.

`context-policy-snapshot.ts` owns a strict version-1 snapshot of actor account,
nullable organization and four source-class permissions: memory, past chats,
connector results and web results. The policy reader distinguishes unreadable
lookup from readable closed policy; Personal resolves the existing open policy,
and an absent organization policy row resolves closed. Equality requires valid
schemas and exact actor/organization/permission values, not caller-supplied prose.

`request-processor.ts` captures this server policy from admitted scope, compares
any trusted resume snapshot, supplies those exact flags to interactive context
resolution, and rereads before the main reservation block. The checkpoint
builder strips private fields from the replayable request before adding a valid
server snapshot. All eleven production builder call sites carry it: three in
the completion route, four in inline workflow startup and four in durable
invocation execution.

The approval, input, device and paused-run resume routes validate saved authority
before `processRequest`, releasing their claim and returning restart-required on
missing/malformed/changed authority. The processor supplies another comparison
and the pre-reservation reread. Durable invocation execution also unconditionally
checks after rehydration and before tool dispatch, including initial queued work,
not only continuations. Thus legacy queued initial invocations without a snapshot
also fail and require restarting; compatibility is intentionally narrower than
“only legacy resume is refused.” Fatal workflow failure emits the restart reason
and retains the existing failed-invocation/observed-cost settlement path, not a
new refund policy.

This is a source-class policy/actor/scope boundary, not per-source provenance,
attachment-deletion validation, grant freshness throughout a running turn,
continuous revocation or a transaction spanning all later work. It does not prove
complete context privacy or deployed behavior. Runtime acceptance remains open.

The companion specifies helper schema/equality/readability, checkpoint builder
ownership, four resume-route refusal boundaries, processor propagation/read
failure, durable transport and invocation refusal variants. Durable source cases
include malformed snapshots, changed flags, different actors/organizations,
unreadable policy, and both legacy initial work and continuations. Separate
settlement fixtures call the settlement helper for managed/free-trial observed
cost and predecessor failure. These are authored assertions, not executed
results: no integrated workflow catch-to-error-frame-to-settlement chain or
regression suite has been run. Their presence does not establish complete
coverage or runtime correctness.

## Mobile buffered API account ownership

Reconstructed commit: `77ab88eead8f900c2161bc7241dfc7d156bb2205`.
The two-file slice changes `apps/mobile/services/api.ts` and adds unexecuted
regression sources in `api-paywall.test.ts`.

The JSON request wrapper, buffered text `apiFetch` and binary `apiFetchBinary`
capture the account generation at public request entry. `sendRequest` receives
that original generation, checks it before/after credential acquisition and
response receipt, and carries it unchanged through the single authentication
refresh retry. Both asynchronous 403 classification reads recheck ownership
before passkey notification, account-unavailable handling or identity-path
sign-out. Buffered text and binary readers recheck after consuming the body and
before exposing the result; timeout cleanup remains in `finally`.

These boundaries reject stale response delivery and prevent the inspected stale
403 classification from tearing down a replacement account. They preserve
same-owner terminal errors, including a legitimate account refusal whose own
cleanup resets API ownership. This is not remote cancellation or rollback of an
already dispatched request. Streaming transport is outside this buffered slice; its separately accepted
canonical-epoch boundary is described below. Deferred
response/refresh, refusal, bodyless response and body-failure fixture sources are
unexecuted; no runtime acceptance or complete account-lifecycle coverage is
claimed. Checkpoint regression sources are recorded separately above, not as
executed acceptance.

## Mobile managed streaming account ownership

Reconstructed commit: `ed24015c9af4a333b3ae004b47604de5626bbb73`.
The fourteen-file slice changes streaming and API recovery production owners,
adds deferred-operation regression sources and aligns ten existing fixture
loaders. All regression sources remain unexecuted.

`cloudAccountSession.ts` remains the canonical runtime owner/epoch authority.
Managed/free stream and checkpoint-resume entry capture it once; absent account
reports an explicit credential-unavailable error. `streaming.ts` retains that
snapshot across consent, token acquisition, device headers, authentication retry,
reconnect waits, response/refusal body reads and SSE chunk/frame processing.
Wrapped public callbacks suppress retired-owner deltas, completion, errors and
metadata. Same-owner reactivation does not itself retire valid continuation.
`api.ts::recoverStreamSession` checks that original epoch inside refresh recovery
before unrecoverable-auth teardown, alongside the existing API generation check.

The mobile managed-run client binds its creation epoch to credential/header/fetch
adapters, wait boundaries, JSON-returning operations and asynchronous follow
callbacks. Durable reconnect uses the original stream snapshot rather than
capturing a replacement account. Refusal notices check ownership after cloned
body parsing before account or terms side effects. These guards preserve current
owner errors while rejecting stale publication and subsequent work.

This is canonical runtime-epoch ownership, not proof that SDK/token identity
cannot change before canonical account activation observes it. It does not
promise upstream body cancellation, provider cancellation or rollback: the
shared SSE reader at this slice only released its reader lock; the later SSE
cleanup section records the separate early-exit cancellation correction. No native,
network or runtime acceptance is established by the source fixtures.

## Mobile Local reply settlement ownership

Reconstructed commit: `bf47a400854ce5eec11b27902a70fd01fa0189df`.
The two-file slice changes `chatExecutionStore.ts` and seven unexecuted regression
cases in `chatStore.test.ts`; there is no dedicated model-resolution regression
case. This is a Local branch correction, not a Cloud-flow redesign.

The accepted Local turn owns its exact controller. After asynchronous model
resolution, during token callbacks and after generation it requires that owner,
a non-aborted signal, a live conversation and the exact streaming assistant row.
After awaited usage bookkeeping, final publication uses a functional store update
that rechecks those conditions and reads current rows. It preserves current
message metadata and unrelated edits instead of publishing a pre-await array.
Only successful publication proceeds to artifact capture and, for nonempty
content, completed Local memory capture.

Local catch retains existing partial content and only settles a still-live owned
assistant. Local finalization is guarded by exact controller identity, so an old
completion cannot clear a replacement turn's controller, timing or stream flags.
The current conversation must still exist before residual-row settlement or
follow-up flushing. Stop can remove the original owner, leaving queued follow-ups
parked rather than letting retired finalization flush them. This compatibility
tradeoff remains pending a separate queue-ownership design; automatic draining
after Stop is not claimed restored.

These source guards do not promise forced native cancellation, undo already
completed inference/bookkeeping, or solve general deletion, persistence/sync or
Cloud settlement ownership. Fixture assertions are source-only, not native or
runtime acceptance.

## ExecuTorch generation and load ownership

Reconstructed commit: `cd0126679cf627ff9e9c4b211724e97f11bf884f`.
The four-file slice changes shared `packages/platform/local-llm/src/tier2.ts`,
mobile performance settings, and two unexecuted regression sources.

`tier2Generate` acquires an exact Symbol lease before loading or installing the
singleton instance's token callback. Overlapping generation and public load or
release refuse while that lease is held. Tokens require the current lease and a
non-aborted signal. Abort requests native interruption and suppresses tokens but
does not release ownership before the native operation settles; `finally` retires
only its own lease. This prevents the inspected overlapping call from replacing
the active callback. Existing native busy refusal is not evidence of use-after-free.

Public model loads reserve a promise tail before awaiting prior loads and test
cached readiness only after that tail drains, including A/B/A reservations.
Release increments the load generation without discarding the pending tail;
stale loads cannot publish their late instance, which is disposed. Later loads
remain serialized even when earlier loads fail. An invalidated load may resolve
without a loaded result, retaining prior behavior rather than introducing a
success guarantee. Configuration failure disposes the newly created instance.
Mobile unload handling now exposes a retryable unload-specific failure and always
refreshes displayed loaded state instead of remaining busy after refusal.

This concerns the ExecuTorch preset path, not dormant GGUF installation/cancel or
tier-3 ownership. Forced native stop and native event ordering remain unverified.
Deferred fixture sources specify leases, load reservations and unload retry but
are unexecuted; aborted native rejection, callback/onDone throws and configuration
disposal do not have dedicated regression coverage in this slice. No runtime
acceptance or universal local-runtime safety guarantee is claimed.

## Tier-1 Local system-instruction bridge

Reconstructed commit: `459673e92992cb40a2e77c44b7cf7bee83b3ffd8`.
The two-file slice changes `packages/platform/local-llm/src/tier1.ts` and its
unexecuted regression source. `tier1Generate` previously removed system-role
history from native message history without adding it to the instruction field.
It now joins the explicit system prompt first, followed by ordered nonblank
system-role history entries, separated by blank lines. Non-system history remains
unchanged and separate from the current prompt.

Both existing Apple Foundation Models and Android AICore calls receive the
combined instruction string through their existing argument. Native bridges are
unchanged: Apple already trims outer whitespace before constructing instructions;
Android uses the existing prompt-prefix field. Preservation of nonblank string
formatting at the JavaScript bridge is therefore not an end-to-end native
formatting guarantee. This changes instruction delivery, not routing, privacy or
native cancellation policy; regression sources and native execution remain
unverified at runtime.

## Live Voice tool admission and explicit rejection

Reconstructed commit: `3e6e071b36cfa5d9a19dd58b0effa6211d8588ce`.
The three-file slice changes `live-voice-tool-runner.ts` and two unexecuted
regression sources. The tools route supplies the existing session's stored
organization, conversation, model and offered tools, not caller-selected scope.

Before tool dispatch, the runner verifies active membership for a non-null
original organization through `resolveOrganizationMembershipId`, then queries
the exact live conversation by ID, account owner and null-safe organization.
Personal remains explicit null. Missing, deleted, moved or foreign conversation,
or refused membership, yields a blocked response rather than treating absence as
a temporary chat. Existing current-workspace database RLS remains in force:
switching away can block access, not silently rescope this session to another
workspace. This slice does not replace that database scope with stored scope.

Existing deny precedence remains. A supplied rejected decision now declines even
when the current tool policy says allow, rather than only when it says ask.
Neither decision reaches tool execution. This is a before-tool-effects boundary,
not before all writes: the route already touches the voice-session heartbeat and
refusals retain audit writes. No SQL/RLS runtime behavior, continuous revocation
across later awaits, persisted one-use approval payload, provider cancellation or
voice settlement correction is established. Regression sources remain unexecuted.

## Restrictive country-policy composition

Reconstructed commit: `f655deee37ce90af9be744775852b5210d331758`.
The 21-file slice includes nine unexecuted regression files. Canonical
`workspace-controls.ts` distinguishes configured unrestricted empty countries
from a resolved active restriction whose empty intersection denies every country.
The required resolved flag survives narrowing and re-resolution, preventing later
layers from reopening the empty intersection. Shared authorization and Web policy
evaluation use the same normalized country predicate; shared authorization still
skips this stage when `ask.country` is undefined.

The effective endpoint emits schema version 2 and includes it in ETags. The
shared client projects noncurrent or malformed country authority to active empty
while retaining other feature/Code fields and the received version; noncurrent
cache validators are not reused. This is not full-envelope provenance validation.
Stored schema version 2/minimum 1 and the separate effective artifact registry are
descriptive, non-negotiated contracts, not upgraded-old-binary enforcement.
Stored nonempty arrays retain restrictive intent even when invalid entries filter
out; malformed non-array storage is not comprehensively repaired.

Settings requests strip derived authority, preserve unrelated country restrictions
when omitted, and permit explicit clearing. Input validation and diagnostics
represent deny-all without treating it as unrestricted. Diagnostics rendering and
real settings-hook integration have no dedicated fixture in this slice. No live
API/cache/deployment execution occurred; native country enforcement and old-client
rollout are not established (CLI feature policy is not country enforcement).
The existing `SHARED-WORKSPACE-CODE-DISJOINT-ALLOWLIST-01` remains open for host/MCP
empty-intersection ambiguity; country source correction does not close it.

## Limited provider-funded media admission

Reconstructed commits: backend `ae3c02000c31fd59979f06f55d58a28f5eeab6ca`,
mobile `a777f6d7f19ab8aa09f53b6118c3ed3ae8f5fb7c`, and web
`79e502eac7be9b5106f1dcee0bbe778d8bee631a`. These are accepted source slices,
not deployed-capacity or runtime acceptance; regression sources are unexecuted.

`free-pools.json` supplies limited caps of 10 image and 5 video requests per user
per UTC day. `freeQuotaPlanAdmission` retains paid inclusion and separately admits
eligible managed-chat plans under limited terms. Shared contracts own ordered
media selection and offered/not_offered/unknown availability. The public media
offer reader and endpoint expose inventory availability, not per-user/workspace
permission; unknown responses are not an upgrade decision. Authenticated catalogue
terms and request-side daily checks remain separate from provider pool units.

`UserScopedDb` carries verified surface provenance. Non-chat free-media dispatch
checks that surface, platform compute and organization gates before provider
work, in addition to existing owned conversation, privacy/model and egress gates.
Chat/OpenRouter routing is unchanged. Daily reservation still uses the existing
increment, expiry and compensation sequence: no atomic transaction or exactly-once
claim. Ambiguous post-submit/busy outcomes retain daily and provider allowance;
recognized pre-submission refusal can compensate. No automatic retry/refund or
live provider availability is promised.

Mobile catalogue and stream protocol admit eligible media offerings; both chat
screens restore the no-attachment image fallback with captured account and
conversation/project/model context. Unknown lookup returns false, preserving the
draft rather than showing Upgrade. Focus generations reject blur/refocus ABA;
model/project/media equality ABA remains outside that fence. Creation publication
has an additional account-epoch guard. Existing Local settlement and account-stream
ownership remain. Mobile video UI is still paid-only, not newly restored free
video UI merely because the transport supports media.

Web promotional hooks and composer controls expose Limited terms and preserve
unknown availability. Typed-image lookup captures live SDK session identity plus
rendered destination scope before awaiting the typed catalogue result and rechecks
before forwarding. That accepted boundary does not cover subsequent awaits inside
the main send pipeline. Composer request/draft guards are not universal account,
workspace or remote cancellation guarantees. No pending main-send implementation,
marketing restoration or pricing change is represented by this graph.

## Web managed-send request authority

Reconstructed commit: `900143abe16ec3ba06bf11be460cd17f7f98bb2b`
(62 files including fixture migrations and new unexecuted regression sources).
This extends the earlier media lookup's preforwarding boundary; it does not make
that earlier commit independently responsible for later send awaits.

`useSessionSnapshot` binds the captured live SDK session object/account and an
observed identity generation, with a token getter on that session. Retirement is
sticky after an observed mismatch. `request-authority.ts` owns request abort and
currentness, enforces same-origin API destinations, and applies captured-session
bearer credentials with cookies omitted. Entirely unobserved SDK ABA remains
outside this observation model.

`WebChatPage` captures authority before managed prestream creation, attachment
preparation/upload, memory commands and provider consent, then hands it to stream
ownership. Conversation creation checks after token/CSRF/body waits, separates
publication from page activation and uses exact busy tokens so old cleanup neither
sticks nor clears another creation. Uploads separate bearer API requests from
credential-free signed PUT, check preparation/progress/settlement boundaries and
set `sessions: null` to prevent adopting persisted upload sessions. Existing
unowned callers are not universally migrated. Explicit memory commands omit the
previous unowned hydration/backlog flush; confirmation owns a separate exact
lifetime, and dialog completion cannot close a replacement dialog.

`useChatStream` carries authority through stream delivery, continuation,
approval/input recovery and request helpers. Verified recovered server runs retain
their own authority for Stop/steer without replacing retired conversation/turn
replay identities. Stop settlement compares the exact active-run object. Decoded
durable Stop-tail ownership was source-inspected, not exercised by an integrated
runtime fixture. Page teardown and handoff distinguish still-preparing work from
accepted background work; this is not a blanket stop-on-navigation rule.

No general account-store restoration, workspace pinning, standalone interactive
card ownership, Local internals or remote rollback guarantee is established.
Abort cannot undo already dispatched server/provider actions. All regression
sources remain unexecuted; no build, checks or runtime acceptance is claimed.

## Unsupported web direct-BYOK handoff containment

Reconstructed commit: `60c16613f00d2bcaa61c5a98c419cfa148cf52cf`.
The two-file slice replaces `WebChatPage` handoff confirmation's fork/system
message/send sequence with an explicit unsupported refusal and adds an unexecuted
source-shape regression. Confirmation no longer creates a cloud fork, saves a
system message, navigates, clears the composer or forwards the raw pending prompt
and attachments to ordinary send. Pending payload, preview and draft remain;
cancel still closes the dialog. The shared dialog's default non-confirming state
and error-disabled confirm behavior are unchanged.

This is conservative containment of a dormant handoff path, not restored direct
BYOK transport or an established normal-picker exploit. Shared handoff utilities,
provider catalogue and routes are unchanged. Any future supported handoff needs
actual destination-specific transport and consent for the exact payload and
attachment destinations; the refusal does not implement those semantics.

## Runtime-owned interactive-card responses

Reconstructed commit: `83fa7b5dbea2f02ce14724fc78a4ce40ab59ced7`
(three production files and seven unexecuted fixture files). This supersedes the
prior main-send slice's standalone-card exclusion only for this response path.
`InteractiveCardBlock` obtains the optional chat runtime; without it, submission
and automatic resume are disabled instead of falling back to a cookie-only
module function. Runtime owns response pending state keyed by conversation,
message and card.

The runtime prefers retained original turn/conversation authority, including
known retired evidence, rather than recapturing a new identity for that evidence.
An unknown restored card can only capture invocation-time authority; no persisted
original-account provenance is inferred. A child request authority fences CSRF,
bearer/no-cookie dispatch and JSON decoding, validates returned card ID/kind and
updates current message metadata. Stale response/error publication is suppressed;
cleanup removes only the exact pending authority, and calls after runtime unmount
refuse. Existing server owner/organization and pending-state compare-and-set
checks are unchanged. Already dispatched server mutation is not undone, and the
slice proves neither new server authorization nor durable replay provenance.

## Mobile offline Cloud attachment refusal

Reconstructed commit: `cc005bb461037dbb30633b12a42dde0333afe6d0`.
The existing-conversation chat route now refuses attachment-bearing offline Cloud
sends before quote/skill cleanup or text-only queue insertion. Returning false
retains the composer draft/files under the existing not-sent behavior and asks
the user to reconnect. Text-only offline queueing, Local sends and earlier media
branches remain unchanged. The slice adds a ChatInput fixture and an explicitly
source-shape route fixture, neither executed. It does not add a durable attachment
queue, composer remount recovery or general offline-delivery guarantee.

## Session-owned conversation loaders and shared list cache

Reconstructed commit: `543b8310cac9d89228093a4b59b15f16d5c54638`.
The three-file slice changes `useConversations.ts` and two unexecuted regression
sources. Module-owned list cache/request captures session identity and authority;
only matching current sessions share freshness or an in-flight request. A route
subscriber's unmount does not abort another same-session subscriber's request or
its bounded rate-limit retries. Replacing cache ownership retires the old request.
Small busy-state subscriptions detach exactly and preserve idle UI during 429
backoff, rather than claiming the network remains busy throughout the wait.

History opening/refresh, pagination and project-list reads use captured session,
hook lifetime and exact operation ownership across response/body waits and local
publication. Superseded cleanup cannot clear a replacement operation. Read
cancellation retains its existing true sentinel. Shared-list completion clears
only its own cache entry; callbacks cannot publish through retired authority.

Existing external-authority conversation creation/background send behavior and
other mutations remain outside this read slice. Workspace pinning, general
account-store restoration and cached transcript reconciliation semantics are
unchanged. Entirely unobserved SDK identity ABA and runtime behavior remain
unverified; the new fixture assertions were not executed.

## Mobile offline processor ownership and unresolved delivery semantics

Reconstructed commit: `6e313c52840c64ea39d339933661eaad3ae5634f` (five files,
including three unexecuted regression sources). `offlineQueue.ts` replaces its
boolean processor with exact processor/generation ownership. Clear invalidates
the generation but retains the processing lock until outstanding send/sleep
settles; old completion cannot remove or mutate a replacement entry. Settlement
and failure removal require the exact queued object.

`useNetworkStatus` shares observed connectivity across hook instances, checks it
between dispatches and rejects stale initial network fetch observations. Hook
cleanup detaches UI subscriptions without making its mount lifetime the queue's
readiness. Local acceptance cleanup requires the exact queue object and original
Cloud epoch. Any nonempty replay attempt, including an online listener attempt,
consumes the startup latch so a later mount does not invent an extra launch retry.

This deliberately retains the existing failure sleep-then-break and retry/eviction
semantics. It adds no retry loop, durable quarantine or schema. `onAccepted` is
local admission, including memory-only deferred sends, not server acknowledgement;
queue retirement can therefore precede durable delivery. Unknown acceptance must
not be inferred from generic rejection. The OPEN delivery-design constraint is
recorded as `MOBILE-OFFLINE-DELIVERY-UNCERTAINTY-01` in the canonical audit register.
No server idempotency, remote cancellation, eventual delivery or runtime proof.

## CLI sync bundle import preflight

Reconstructed commit: `a91320fdcf92a17bbc1814dd3f14a70db406a067` changes
`apps/cli/src/sync.rs`, including fifteen unexecuted source regressions. Import
validates every bundle key against the export allowlist and verifies all content
hashes before mutation. Canonical-home resolution is required; manifest and every
manifest input reject symlink/nonregular path components. A read-only write plan
resolves merges/skips and validates only conflict-copy destinations actually used,
so an unused `.imported` path does not incorrectly block an otherwise valid merge.

Writes recheck paths before execution; existing merge/skip and regular conflict
copy overwrite semantics remain. Preflight is not an atomic filesystem operation:
concurrent replacement, hardlinks, partial multi-file failure and rollback remain
outside its guarantee. No filesystem/runtime regression was executed.

## CLI chat conflict-base preservation

Reconstructed commit: `0e6b7d63f5ae03efd6ca8b28ea9d6276ec906881` changes
`apps/cli/src/cloud/chat.rs` and `cloud/mod.rs`, including unexecuted regressions.
`apply_push_response` advances versions only for server-applied rows. Conflict
versions remain at their prior local bases because conflict content has not been
adopted; merely receiving a newer version must not authorize the next push to
overwrite that remote content with the unchanged local snapshot. Push replies do
not advance pull cursors. Successful rows and new IDs still apply normally.

The actual sync path warns about unresolved conflicts and recommends exporting a
separate Markdown copy for comparison, not automatic merge or resume. Read helpers
are unchanged: `apply_pull_response` has only a test caller in the inspected CLI
source, and current single-conversation fetch rows carry empty sync versions, so
`record_hosted` does not advance them. Previously poisoned version caches are not
repaired; imported rows can continue conflicting until separately reconciled.
This is source-level prevention of new conflict rebasing, not runtime convergence
or recovery of earlier overwritten data. The same-owner cache loader retains
ambiguous old version maps; `CLI-CHAT-LEGACY-CONFLICT-BASE-01` records the separate
OPEN migration constraint without claiming an affected deployed cache.

## VS Code resolved outbound-file guard

Reconstructed commit: `63c5563e853b3c4ffbb5252d553d97ceec078e10` changes
`apps/extension-vscode/src/core/outboundContentGuard.ts` and five unexecuted
fixture files. On the declared workspace extension host, file and vscode-remote
paths are checked against the credential-path policy both as presented and after
synchronous filesystem realpath resolution. Resolution errors refuse outbound
content rather than treating an unresolved path as safe.

Existing workspace-trust refusal and undefined-document, untitled/other URI
behavior remain unchanged. This is path-policy containment, not content-secret
classification or atomic protection against filesystem changes between checking
and reading. Mocked fixture sources do not establish real-filesystem execution,
remote deployment behavior or downstream diagnostic error presentation; no
separate diagnostics-wrapper correction is claimed here.

## VS Code diagnostic refusal outcome

Reconstructed commit: `abd4192d8a52cf87753215a48b37f8a1730d2221` changes the
local diagnostic provider/command wrapper and two unexecuted fixture files.
A typed `not-reviewed` result carries outbound refusal or empty-selection reason;
the command displays a warning and does not report zero issues as a completed
review. Completed reviews retain their diagnostic count. This narrowly supersedes
the prior path-guard section's diagnostic presentation exclusion. The shared model
response parser's no-valid-issue-lines behavior is unchanged; arbitrary malformed
model output is not newly classified by this slice.

## Electron Local routine pending-start ownership

Reconstructed commit: `ad176e412a6f79c0c8b0a7dd7121d5e7dea67efe` changes
`electron/runtime/localRoutineEngine.ts` and one unexecuted regression source.
The engine retains pending-start and stop-request ownership instead of declaring
an unidentified in-flight start cancelled. Only the exact returned turn ID gives
cancellation authority; it is never guessed from an early event. Unacknowledged
starts remain retained/disabled with an unknown-outcome explanation. Known-ID
cancellation deduplicates its attempt and rechecks terminal state immediately
before queued dispatch.

Before the start reply, at most 100 minimal lifecycle events are retained for the
matching thread. After the reply, only events matching its returned turn ID are
applied; overflow requests stop and disables the routine while identity is unknown.
Pre-ack native notifications are suppressed and are not replayed by this buffer;
the runtime UI still receives original events. Terminal events clear exact routine
ownership and keep-awake state. Stop failure remains unconfirmed rather than
claiming effects were undone. This is not native cancellation, restart recovery,
all-process exclusion or a guarantee that a rejected start had no effects.
No native/event ordering or regression execution was performed.

## VS Code approval lifetime and automatic Undo refusal

Reconstructed commit: `db6186580e97c874789590220676ac6dc8696818` changes
`ChatStateManager.ts` and one unexecuted regression source. Approval events capture
original runtime, thread object, conversation epoch and turn before capability
awaits. Resolution retains the exact pending entry while editing/RPC awaits run,
rechecks the owner before publication and scopes session grants to the original
thread/epoch. Late denied-guidance and interrupt outcomes cannot publish into a
replacement turn. Proposed-edit review cleanup is fenced but not atomic with
external editor operations.

Automatic latest-reply Undo now refuses instead of assuming the newest checkpoint
belongs to that turn. The actual `ThreadCheckpointList` lacks turn ownership;
a distinct `TurnCheckpointSummary` contract is not an adapted authority for this
path. Existing native rewind locking/counterguards remain, but cannot establish
this missing client association. Explicit checkpoint picking, resend and branch
operations are unchanged by this slice. No already-dispatched edit/approval/undo
recall, complete cleanup transaction or runtime correctness is claimed.

## VS Code delayed navigation and composer intent

Reconstructed commit: `888086d06ad70f12416253abc51203891448cabb` changes
three production protocol/manager/renderer files plus four fixture/snapshot files.
Checkpoint picking, resend and branch actions reserve a navigation attempt before
awaits and retain it through private resume, rather than creating a fresh public
resume attempt after delayed work. Immutable source runtime/cwd/trust/provider/
model context is compared before adopting the resolved/resumed session. Normal
public history opening remains unchanged; no preserveComposer migration is added.

The action requires a known composer instance/revision, no staged renderer files,
no pending host attachments and no active turn. Missing binding refuses. Observed
typing and model intent retire delayed work; the first-message branch/reset path
also checks before reset. The final renderer draft gate checks expected instance,
revision and conversation epoch before inserting text. User attachment additions
invalidate the revision; explicit attachment counters separately guard automatic
submission after insertion, not insertion itself.
This extends the earlier approval/Undo slice to the separately scoped explicit
navigation paths, without restoring automatic latest-reply Undo.

An attachment message already in transit can still cross an epoch boundary; that
race is not solved by this observed composer gate. Already-dispatched remote rewind
or fork effects are not recalled. Snapshot expectations were manually authored
exact hunks, not generated or executed; all fixtures are unexecuted, with dedicated
branchAnswer, runtime/cwd and FileReader interleaving gaps. No runtime navigation,
atomic filesystem or loss-free composer guarantee is claimed.

## Chrome canonical site-tool dispatch

Reconstructed commit: `73709c77c6839814c86ae8fe16ff6632a0522334` removes
legacy `site_*` aliases and their original-tab callbacks from the sole production
`runAgentLoop` caller in `apps/extension/src/background.ts`, and removes the
corresponding optional driver dispatch surface. Canonical `discover_site_tools`
and `call_site_tool` remain. `BrowserAgentSiteTools.prepare` performs fresh
discovery itself; an explicit prior model discovery call is not required. Original
page names and imperative/declarative descriptors remain supported.

The existing canonical service binds plans to the current lease tab, URL, document
instance, navigation generation, descriptor and copied arguments; execution
rediscovers and compares the plan, sends scoped cancellation on abort, and fences
returned results. Results remain untrusted page reports, not independent success
verification. These existing protections are now the production site-tool path,
not newly introduced guarantees of remote cancellation or rollback. The old alias
path also had content-side actual-page policy checks; its removal does not prove
that all earlier consent was bypassed. Native page-policy `window.confirm` and
form-submission confirmation remain.

Separate OPEN constraint `EXT-SITE-TOOL-AUTO-APPROVAL-CONTRACT-01`: the tool
contract says every call needs approval, but default Auto ignores the noncrucial
`alwaysAsk/site_tool` requirement. Alias retirement does not resolve that product
policy mismatch. The canonical registers retain the decision boundary without
changing permission behavior. Three changed fixture sources are unexecuted; no
browser race, deployed behavior or universal prompting guarantee is established.

## Web admitted-scope media serving and hydration

Reconstructed commit: `30af21e015510eed0268fae650e4af041eef9866` changes six
production files and six unexecuted fixture sources. `lib/server/media-assets.ts`
now projects organization identity in all four serving-row lookup mappings.
`getActiveWorkspaceMediaAssetById` accepts captured organization scope: only
undefined falls back to resolving saved active selection; explicit null means
Personal. Organization-only lookup uses three SQL arguments; the optional
conversation predicate adds the fourth only when supplied.

File GET and text GET pass `getUserScopedDb`'s admitted organization rather than
re-resolving saved selection. Existing owner filtering and workspace RLS remain
counterguards (tenancy policies, with the current visibility predicate in
`0272_active_membership_authorization.sql` superseding the earlier `0110` definition);
the former serving drift supports an availability mismatch, not a demonstrated
cross-account exposure. In contrast, attachment hydration uses the service DB:
`chat-attachment-hydration.ts` now compares both owner and admitted organization
before interpreting filename metadata or reading stored bytes. The main request
processor passes context-policy scope, and the free-quota path passes its admitted
scope through the now-required hydration argument.

Same-owner, same-workspace reuse across conversations is intentionally allowed
where no conversation constraint is supplied. This slice does not redesign shared
grants, deletion, durable provenance or continuous revocation across subsequent
awaits. Generation callers were outside this serving/hydration slice and are addressed
separately below; Gmail remains outside it. Null/non-null scope fixture source was
reviewed, but no SQL/RLS, storage, request or deployment behavior was executed.

## Generation image-reference workspace authority

Reconstructed commit: `c50c1a295fc78533264617e25327e96c68cc4ad5` changes seven
production files and three unexecuted fixture sources. All ten production calls
to `resolveImageRefBytes` now pass scope: managed generation source/mask/references,
durable image executor source/mask/references, retry source/mask/references and
video input images. Stored references refuse missing DB or undefined organization
before reading bytes; explicit null is Personal. Inline base64 handling is
unchanged. The underlying general media lookup retains its undefined-only legacy
fallback, but this generation entry point no longer falls through to it.

Managed generation captures one admitted scope for stored references. Durable
execution uses the job organization; retry first retrieves the original job
through the admitted scoped DB and explicit user filter, then uses that job's
organization rather than retargeting to a newly resolved saved selection. Video
passes its admitted organization. Explicit chat image selection retains its
conversation constraint and now includes admitted organization. An implicit latest
conversation candidate is revalidated by the scoped byte resolver before bytes
are used; candidate discovery alone is not authority.

Existing same-workspace/cross-conversation reuse where no conversation predicate
is supplied remains unchanged. This does not implement retention, Gmail scope,
shared grants, deletion/provenance redesign or continuous revocation after the
checks. Fixtures cover source-level scope behavior only; no provider, storage,
SQL/RLS, deployment or runtime acceptance is claimed.

## Gmail draft attachment workspace authority

Reconstructed commit: `b97c1deeadb5ad447e334da3b3f6ee33262a5e77` changes
`lib/user-connector-tools.ts` and `lib/connectors/gmail-actions.ts`, with two
unexecuted fixture sources. The connector executor now forwards its original
organization into Gmail draft attachment handling. Existing executor call sites
for chat, durable/startup workflows, scheduled execution, research, artifacts and
voice supply scope; this patch changes the Gmail forwarding edge rather than
introducing new caller admission.

For attachment drafts, explicit null remains Personal; undefined resolves active
workspace once for the draft. A non-null organization must match
`resolveOrganizationMembershipId`'s active membership result before asset lookup.
Each file uses owner+organization SQL and repeats owner/organization/deleted/path
checks before storage reads and the eventual Gmail draft POST. The prior owner
check already refused cross-account files; this correction addresses same-owner
wrong-workspace attachment reads, not a proven cross-account exposure.

OAuth resolution can precede this refusal. Membership is checked at admission,
not continuously or transactionally through later storage/network awaits. Existing
send-draft and read-attachment behavior is unchanged, as are remote POST outcome
uncertainty and storage-size behavior. No retention, all-connector scope, runtime
or deployment acceptance is claimed; fixtures remain source-only.

## Gmail aggregate attachment read budget

Reconstructed commit: `a6be9b8a59b7bd26a0471eefb9c4082aa9d245f1` changes three
production files and three unexecuted fixture sources. Gmail attachment drafts
read sequentially with the remaining 20,971,520-byte raw attachment budget,
subtracting actual returned bytes before the next read. Size refusal stops before
MIME construction and draft POST; unknown advertised size produces a truthful
"could not be read within" limit response rather than an invented actual size.

`media-storage.ts::readStoredMedia` adds optional nonnegative-safe-integer
`maxBytes`; callers omitting it retain existing behavior. Bounded local reads
check stat size, count actual streamed bytes and destroy the stream on exit.
Bounded object reads use the existing SDK-backed HEAD and actual chunk-count
gates. Oversized private reads throw rather than falling back to public storage;
existing missing-object legacy fallback and sealed-private restrictions remain.
The canonical object reader now releases its lock after its existing awaited
cancellation; cancellation that never settles can still stall cleanup.

This bounds accepted attachment payloads, not universal process memory: native/SDK
chunk allocations, concatenation and MIME/base64 encoding retain transient copies.
It adds no general caller migration, remote cancellation, deadline or storage
transaction guarantee. Fixtures include remaining-budget, cumulative refusal,
unknown HEAD size, local stream cleanup and exact-cap/empty behavior, but were not
run. Explicit zero-budget/nonempty and unsafe-integer fixture cases remain absent;
no runtime or deployment acceptance follows. This storage-budget slice does not change project authorization; the following
section traces that separate correction.

## Shared project source read authority

Reconstructed commit: `a46ed1cfe00f5fe635d366a50a3de604ff644eae` changes five
production files and six unexecuted fixture sources. New
`lib/server/project-read-access.ts::READABLE_PROJECT_SCOPE_SQL` binds project ID,
caller and original admitted organization in each consuming statement. It requires
a live project and either same-scope ownership or an admitted-organization share
with active membership, `content.read` and effective per-member/default read or
write access. Personal admission stays owner-only; shared access permits a project
root whose organization is null or the admitted organization, preserving legitimate
organization shares of Personal-root projects without admitting another org root.

The sources list uses the predicate both for preliminary project admission and
its final joined metadata query, without re-reading saved workspace selection.
Renamed `findReadableProjectKnowledgeFile` applies the same predicate in the final
storage-URI lookup consumed by byte and text GET. List filtering still excludes
superseded sources; individual readable-file lookup preserves existing historical
version behavior. Writes and DELETE authorization are unchanged.

Migration `0315`'s any-readable-organization sharing RLS remains a defense, while
the new statement-local predicate additionally pins these reads to the admitted
scope and current grant. It does not continuously revoke already-read bytes or
serialize later storage streaming with membership/grant changes. Mocked route and
SQL-source-contract fixtures are unexecuted, not live PostgreSQL/RLS proof. No
billing or broader lifecycle correction is included in this slice.

## Governing billing lookup failures

Reconstructed commit: `01556a38f613416db115f9e13388d996ad27f127` changes two
production services and two unexecuted fixture sources. In
`managed-usage-request-service.ts`, exceptions resolving the governing funding
organization, reading its policy or reading spend now throw the existing typed
503 `billing_unavailable` error before reservation SQL. Successful reads that
legitimately find no governing organization, no policy or a null cap retain their
previous semantics; absence is not conflated with lookup failure.

`entitlement-resolution.ts` now propagates errors reading the account's own
enterprise collection state instead of treating that state as unrestricted.
This occurs during own-entitlement resolution before seat fallback. It is not a
universal typed-503 conversion: existing outer wrappers may surface a generic
500 for the propagated collection error.

The explicit availability tradeoff is refusal during governing lookup outages,
rather than reservation with unknown restrictions. This slice does not redesign
spend policy, seat resolution, later provider-step authorization, compensation or
refunds. Fixture source covers failure and legitimate-absence behavior but has
not been executed; no database, provider or deployment acceptance is claimed.

## Image redrive input eligibility

Reconstructed commit: `f1785ae12f2f309eb9e33c9d5c79848839f0a747` changes three
production files and three unexecuted fixture sources. The shared
`isImageGenerationJobDrivable` predicate permits generation, but unattended edits
require a stored source, no inline references and a stored mask whenever the
original job records a mask hash. Scheduling and status-driven execution use this
eligibility; the executor applies it before resolving stored edit bytes, preventing
an unattended replay that silently omits an original inline mask.

Status handling still reconciles pending cancellation before deciding whether to
redrive. Explicit retries with resupplied inline inputs remain available, and the
existing executor validates recorded source/reference and mask hashes on that
branch. The new retry fixture mocks the executor and proves only route byte
handoff, not real hash validation or provider execution. No native/provider,
queue-delivery or runtime acceptance is claimed.

## Video cancellation settlement guard and recovery boundary

Reconstructed commit: `d92bf7c99446708a03d2021d6d943f11f89ccce1` adds migration
`0392_video_cancellation_wins_settlement.sql`, its reversal and an unexecuted
source-equivalence fixture. The migration removes the previous Runway-only
qualifier: a cancellation recorded before the finalizer's row lock refuses
completion for every provider, after existing terminal/claim checks and before
managed settlement. The prior function behavior and grants otherwise remain;
the down migration restores them and removes this migration's ledger entry in
the same transaction. These migrations are NOT APPLIED; no SQL/runtime proof is
claimed by committing their source.

This guards settlement, not full cancellation or non-delivery. Reconciliation
persists a moderated/provenance-marked asset before finalization; scoped owner/org
listing and serving do not require the job to be completed. Cleanup is attempted
on failure, but failed compensation followed by non-Runway cancellation can exit
before retrying removal. Captured completed-provider cost is invocation-local and
may be replaced by the estimate on a later cancellation attempt. These source-backed
recovery constraints are tracked as Medium OPEN
`WEB-VIDEO-DELIVERY-RECOVERY-01`, not observed production loss or cross-tenant
exposure. Durable cost, publication and cleanup recovery semantics remain a
separate design decision; no refund or financial repair is implemented here.

## Durable tool-control errors and bounded fanout

Reconstructed commit: `9ab06bf7bd1218064b16e63f5c07ec88c12c0a49` changes
`tool-loop.ts` and two unexecuted hardening/e2e fixture sources. The durable
invocation already supplies a predicate recognizing Workflow `FatalError` and
`RetryableError`; timeout wrappers and AGI planning now preserve those selected
errors rather than converting them into ordinary tool failures or continuing
planning fallback. Ordinary errors retain their existing result/fallback behavior.
The early stored-result reader now uses the same nested deadline and predicate,
but its underlying storage query is not cancelled by that deadline.

Only read-only tool fanout opts into `mapWithConcurrency` draining: on first
failure it stops dequeuing, waits for already-admitted bounded wrappers and then
rethrows the exact first value, including undefined. The default remains fail-fast;
attachment hydration does not opt in and its existing behavior is unchanged.
This orders tool-loop unwind/shared-sandbox release after those wrappers settle,
not after every underlying native/network operation necessarily stops. Abort is
cooperative, and a timed-out write may still land.

Source-reviewed cleanup ordering is not an executed parallel cleanup integration
test. Fixtures cover selected/ordinary error handling, planning and stored-result
deadlines plus concurrency behavior, but remain unexecuted; no provider, storage,
Workflow or runtime cancellation guarantee is established.

## Native schedule and memory pre-dispatch cancellation

Reconstructed commit: `9b0214be1713313dfb513cc5dc0449a93fd0cecd` changes seven
production files and four unexecuted fixture sources. The tool loop passes its
optional execution signal into native schedule/memory contexts and their claimed
DB adapter. Wrapper, entitlement/policy admission, ownership, advisory-lock and
quota boundaries check cancellation before mutation SQL. Memory save/forget
commands carry the signal as execution context, not persisted memory metadata.

`createClaimedUserScopedDb` additionally checks before transaction entry, after
Neon checkout enters the callback, and after awaited role/claim binding before
caller SQL or a transaction callback. This covers asynchronous adapter work hidden
beneath a service's apparent pre-query check; `withOrg` retains the same signal.
The underlying Neon transaction still commits after the callback normally returns.
No post-write, post-callback or pre-commit cancellation gate is added, preserving
a successful operation's receipt rather than reporting cancellation after its
mutation. Known business-error-shaped abort reasons escape schedule/memory error
translation by exact identity with the signal's reason.

Other callers omitting the optional signal retain their behavior. This is not
full native-tool coverage, cancellation of already-dispatched SQL, rollback of
remote effects or a deadline on connection checkout. Fixtures describe delayed
admission/binding, cancellation identity and successful receipt preservation but
were not run; no database action or runtime acceptance is claimed.

## Text preview actual stored-byte limit

Reconstructed commit: `ffa6a17be7987d0e71ce21c1a8dece29f31385b7` changes file
text GET and one unexecuted route fixture source. Its existing 30 MiB metadata
limit now also passes to `readStoredMedia`, enforcing bounded actual storage reads
before `renderFileTextPreview`. Typed oversize becomes validation 400; missing
advertised size or streamed overflow without a known length uses the truthful
"could not be read within" message. Missing bytes remain 404, and unrelated
storage errors retain their existing error path rather than becoming size refusals.

This uses the bounded-reader ownership described above, not a new parser or
universal memory ceiling. The separate local project-knowledge reader still
checks stat then uses unrestricted `readFile`, leaving its growth-between-check-
and-read boundary unchanged. Route fixtures wrap the real renderer and mock
storage, but were not executed; no parser, storage or runtime acceptance is claimed.

## Server DOCX admitted-byte reconstruction

Reconstructed commit: `afbb42f2fcd7ba9e583b6163fd0030d921c43d1b` changes
`office-document-text.ts` and one unexecuted fixture source. Existing ZIP member
and declared-size checks remain. DOCX now sequentially reads every nondirectory
member through `readArchiveMember` and one shared actual-inflation budget (the
existing 120× compressed-size ratio and 200 MiB ceiling), then builds a fresh STORE
archive for Mammoth. Original compressed objects are not passed through to the
converter. Package paths and selected entry metadata are copied; directories use
empty bytes. Decompression refusal retains `archive_bomb` mapping, while ordinary
corruption remains `corrupt`.

This is not a universal memory ceiling: ZIP chunk/concatenation/rebuild copies,
metadata parsing and Mammoth XML/HTML expansion remain separate allocations.
The authored normal-conversion, forged-header and cumulative-budget fixtures are
unexecuted; no new dedicated Unicode/metadata, absolute-200-MiB or member-limit
fixture establishes those boundaries. Pinned JSZip 3.10.2 behavior is unverified;
the implementation worker's local dependency source inspection was 3.10.1, not
pinned-version/runtime acceptance. Browser consumers are traced separately in the following section.

## Browser Office consumed-byte budgets

Reconstructed commit: `e50ec620214f6d65e6bdb62db304384201569e46` changes six
production files and three unexecuted fixture sources. Pure web-local
`lib/security/archive-budget.ts` owns the shared budget/error class; the server
facade reexports the same constructor, with Node member-reader behavior unchanged.
Browser `office-archive.ts` now enforces the existing server limits: 2,000
nondirectory members and the smaller of 200 MiB or 120× compressed input size.

XLSX/PPTX preview readers spend actual inflated chunks before retaining them,
sharing one budget across consumed XML, relationships and image members.
Unreferenced parts are not inflated in these readers. Oversized slide images still
skip at the existing 450,000-byte limit, but observed bytes, including the chunk
crossing that limit, consume budget; a global budget failure is not hidden as an
image skip. `ArtifactPreview`'s actual DOCX conversion path uses a rebuilt STORE
archive containing all admitted nondirectory member bytes before calling Mammoth.

Public preview APIs, workbook cache and UI cancellation semantics remain unchanged.
Input/download buffers, ZIP metadata and the current inflate chunk can allocate
before these gates; DOM/Mammoth conversion, sparse spreadsheet/table output and
cached results are separate costs. This is not a universal heap or CPU limit.
Fixture source exercises budgets, preview refusal and STORE reconstruction, but
has no actual Mammoth-interception or late-event-after-pause coverage and was not
executed. No browser, dependency-version or runtime acceptance is claimed.

## Browser workbook serialized-output admission

Reconstructed commit: `891ca6ac3dec5b2fcd1a454c2561d68db2824c46` changes three
production files and three unexecuted fixture sources. `xlsxSheets` now applies a
newly enforced cumulative 200,000 UTF-16-code-unit serialized CSV restriction
across the workbook, using `MAX_FILE_TEXT_CHARS`. Sparse final-cell maps preserve
duplicate-cell overwrite semantics; column arithmetic and exact rectangular
padding, newline, quoting and escaping lengths are checked before allocating CSV
output. Each accepted sheet spends its actual serialized length; a later-sheet
overflow rejects the whole workbook with `WorkbookPreviewLimitError`, rather
than publishing a partial workbook.

`ArtifactPreview` and `MessageBubble` distinguish that refusal with an explicit
notice directing the user to the original XLSX download. Existing download and
saved-content behavior remains; failed cache promises retain the existing eviction
path. The new cap is a product preview restriction, not universal memory safety:
input buffers, parsed XML/DOM, shared strings, sparse maps, cache multiplicity and
concurrent loads remain separate costs. PPTX rectangular-table expansion is not
bounded by this XLSX cap.

Authored source cases cover exact/over limits, sparse coordinates/padding,
escaping, duplicate final values, repeated shared strings, cumulative sheets and
UI notices, but none were executed. This workbook slice does not establish a browser CPU/heap bound or runtime acceptance.

## CLI session-bound recovery and credential transactions

Reconstructed commit: `0b055d4e1ebb99ed79b7170bb3d9a149b60ee87d` changes seven
CLI source files, including unexecuted inline regression sources. `CloudClient`
retries with the exact token returned by recovery while retaining its original
API/auth deployment, owner and HTTP client, rather than reconnecting under the
latest login. Changed-token continuity requires nonempty matching `sub` and `sid`
plus unchanged matching deployment. These decoded claims establish continuity,
not token authenticity; the server remains the authenticator. Refresh replacement
compares the exact selected grant, and second-401 removal targets only the rejected
token. Developer-host late failure handling no longer mutates whatever current
credential happens to exist without knowing the rejected token.

`AuthStore` serializes fresh-load mutation/persistence under an OS file lock;
refresh takes its session lock before short auth-store transactions and performs
network renewal outside the auth lock. Public snapshot save is removed, writers
use transactions, migration uses unlocked internals under the same lock, and
Copilot dispatch no longer saves stale snapshots. Post-persistence callbacks
invalidate caches/setup; sign-out removes locally before revoking its captured
snapshot, so later login is not deleted after remote revocation returns.

Compatibility and limits: missing session claims or split auth/API deployments
require explicit login rather than unsafe recovery. Insecure/unreadable or
unremovable legacy `auth.toml` blocks all AuthStore consumers even when canonical
credentials exist; malformed legacy contents are ignored only when a current
managed winner exists. Canonical migration persists before legacy retirement.
Only cooperating same-version writers honor these locks; keyring/index writes can
partially fail without rollback. This does not bind whole turns or recall
in-flight requests. Source fixtures are unexecuted; no OS-lock, keyring, OAuth or
runtime acceptance is claimed.

## Browser presentation text and table admission

Reconstructed commit: `2d4bbf0e7781901f8964916075ef1d40ab543835` changes three
production files and three unexecuted fixture sources. PPTX conversion adds a
new cumulative 200,000 UTF-16-code-unit text/framing budget. It accounts for nested
text occurrences, escaping, exact rectangular table padding/separators and slide,
bullet, footer and image-label framing before constructing expanded output.
Width calculation and paragraph publication avoid unbounded argument spread.
Whole-preview typed refusal reaches both `PptxFilePreview` and `MessageBubble`
with explicit original-download guidance; download behavior is unchanged.

Image base64 payloads are deliberately excluded from this text cap, retaining the
existing 450,000-byte per-image skip and shared inflated-byte archive budget.
Input buffers, DOM/textContent and label intermediates, traversal and base64 heap
costs are not capped by this restriction. This supersedes the earlier PPTX table
output gap narrowly, not the broader memory/CPU limitations. All authored fixture
sources remain unexecuted; no browser/native or runtime acceptance is claimed.

## CLI captured account and catalog cache ownership

Reconstructed commit: `28ad710521a4a37e44b39b0018ab010702efe09d` changes ten
CLI source files, including unexecuted inline fixtures. `ManagedRequestContext`
captures token, trusted API base and cache owner while holding the auth snapshot
lock. Owner hashes bind deployment plus subject/session; subject-bearing legacy
tokens use a token digest for cache identity only, not the recovery replay rule.
Verified credential absence gets a distinct anonymous catalog identity;
configuration/store-read failure is not converted to anonymous discovery.
Unidentifiable authenticated tokens do not acquire a reusable persistent owner.

Account/tier/plan/live-catalog reads and publication, usage result publication and
server-plan adoption check captured ownership. `AccountRoute` reads a coherent
captured snapshot; model discovery is checked again against its original owner
after local discovery before use. Late authorization failure invalidation is
exact-token/deployment scoped, and tier invalidation also clears the live catalog.
Ownerless legacy disk caches miss rather than being adopted under the new account,
which can reduce offline availability until a fresh fetch.

Account/tier retain their existing 300-second lifetime and now reject future
timestamps. Plan-model and live-catalog lifetime deliberately remains indefinite
for a matching owner; this is not a freshness-policy redesign. Environment writes
are outside the auth lock, error/stale account status can return a blank signed-out
snapshot, and no whole-turn or already-dispatched request protection follows.
This cache slice does not change connector or local-policy ownership; the later
policy section traces that separate correction. Fixtures remain unexecuted; no
Rust, lock, network or runtime acceptance is claimed.

## PDF blob approval follows the exact source

Accepted commit `9370f5093ef5ba41d95cb2ae7a8b2b6b22ff0039` changes
`apps/web/features/chat/components/artifacts/ArtifactPreview.tsx` and its
regression source. Blob MIME verification now stores `{ src, allowed }`; render
considers the result only when that source equals the current PDF source. A
replacement blob therefore cannot inherit the previous blob's approval during
the render before effect cleanup. Existing effect cancellation suppresses late
verification publication. The MIME check remains `application/pdf`, not a new
PDF-content validator. Source selection, iframe sandbox and download policy are
unchanged. Deferred replacement/late-result fixtures were read but not executed;
no browser runtime acceptance is claimed.

## CLI policy reads and offline seals follow captured authority

Accepted commit `7f21d12a39c3f52bd4fa12d23e5f04c90c5e987e` changes
`apps/cli/src/cloud/client.rs`, `cloud/workspace_policy.rs` and
`claude_parity.rs`, including inline regression sources. `policy_context`
requires an identifiable captured authority; `from_managed_context` constructs
the client from that captured token and API base rather than reconnecting to a
replacement sign-in. Advisory connector policy, local-tool policy and effective
workspace policy check owner/currentness on cache reads, publication and returned
answers. Local policy's governance fallback uses the same client. Configuration
or identity-read failure is not treated as verified sign-out.

Effective in-memory policy now carries owner and fetch time and applies the
existing seven-day sealed-policy age with the existing five-minute clock-skew
allowance. Refresh scheduling and hook-refusal warning state are owner scoped;
a new owner does not inherit the old owner's hourly refresh delay. The v2 sealed
envelope, HMAC domain and newest-read credential key bind deployment/session
cache ownership and server-reported organization. Legacy subject-only seals no
longer open and need an authenticated fetch, so offline upgrades can refuse
policy-dependent operations. Disk storage is still one `workspace-policy.json`
file, not per-owner offline partitions; switching owners can replace the
available offline copy.

Verified signed-out Local/BYOK continuity remains. The local-tool endpoint's
existing 403/404 unrestricted compatibility is retained and is not proof of no
workspace membership; advisory connector reads remain advisory/fail-open. This
slice does not change policy content or resolve host/MCP empty-allowlist semantics.
Server-selected workspace changes within the same authority are not pinned or
continuously observed, and returned policy is not a whole-turn revocation lease.
Fixture isolation and owner/freshness/seal/refresh regression sources were read,
not run. No keyring, SQL, network, Rust or deployment acceptance is claimed.

## Workbook loader no longer reuses URI-only bytes

Accepted commit `a521111d3b4224781f5a870bf4c2d6c58c4a5e78` changes
`apps/web/features/chat/lib/office-file-preview.ts` and two regression sources.
`loadWorkbookSheets` removes the module's URI-keyed fulfilled/in-flight promise
cache. Each invocation now fetches with `credentials: 'same-origin'` and
`cache: 'no-store'`, checks the HTTP result and converts fresh response bytes.
Sequential and concurrent same-URI calls no longer inherit another invocation's
cached response; a new authorization refusal is not hidden by that module cache.
The loader signature, conversions and download behavior remain unchanged, at the
cost of repeated download, parse and egress work. This is not an account lease
for an already-running request and does not refresh mounted file-ID caches,
same-URI effects or persisted previews. Regression sources cover sequential,
concurrent and post-success refusal paths but remain unexecuted.

## PDF source selection checks normalized origin and exact data MIME

Accepted commit `2251443a34c2434051354244b734b8daf58b31b4` changes
`apps/web/features/chat/components/artifacts/ArtifactPreview.tsx` and its
regression source. Data URLs require the exact `application/pdf` MIME boundary
and a payload comma, while permitting parameter/encoding forms; MIME prefixes
such as `application/pdfx` no longer qualify. HTTP(S) and root-prefixed candidates
are parsed against the current origin before checking actual protocol/origin and
PDF extension or existing PDF metadata. This includes protocol-relative and
backslash-normalized forms rather than treating a leading slash as sufficient.
Valid same-origin PDF/metadata forms retain query and fragment; `/api/files/`
sets the canonical preview query. A normalized pathname beginning with `//`
remains an absolute verified-origin URL so rendering cannot reinterpret it as a
new host. Blob MIME/source approval and downloads are unchanged by this slice.
This is source admission, not arbitrary PDF-content validation or a new sandbox
guarantee. Parameterized URL/MIME fixtures were read, not run; no browser or
deployment acceptance is claimed.

## Open CLI accepted-turn and history provenance boundary

Source-only design finding `CLI-TURN-HISTORY-AUTHORITY-01` is recorded in the
[canonical audit](../../audit/prior-audits/active-issues-register.md#cli-turn-history-authority-01).
`agent/chat.rs` retries/continuations retain messages while
`models/streaming.rs` → `models/provider_dispatch.rs::resolve_key` can acquire
current Managed credentials. `InheritedRoute` carries privacy/provider/model,
not account authority; SideQuery and detached memory work retain derived context.
Project preflight, post-turn and REPL/TUI exit snapshots flow through
`agent/mod.rs::cloud_snapshot` → `sync_to_account` → a fresh CloudSession without
history-origin ownership. Existing privacy checks and account-scoped sync cursors
do not establish that supplied history belongs to the newly selected account.
Approval resume specifically keeps its original JWT but rebuilds the ambient
trusted deployment spec after approval; it is not a fresh-JWT path.

Persisted routing authority only records privacy/provider. System-only sessions
can already contain cached account memory/project instructions, so an empty user
history cannot establish account-independent provenance. The accepted recovery,
cache and policy slices above do not close this whole-turn boundary. A coherent
accepted lease plus trusted transcript/system-prompt provenance must span prep,
actual sends, retries, children/tools, side queries, background work and autosync.
Legacy transfer/migration and availability semantics require explicit product
decisions. The High OPEN risk is source-backed, not observed disclosure; no
implementation, blanket legacy refusal or runtime acceptance is claimed, and this
design is not implementation-ready.

## Upload staging and known completion recovery

Accepted commit `50652bc49736e84c8d4f9877ed14d1902aaa038f` changes four production
files and six unexecuted regression sources. In
`apps/web/lib/server/chat-attachment-completion.ts` and
`project-knowledge-files.ts`, successful staged bytes are purged after durable
media/project registration instead of before it. Existing safety-change refusal
cleanup remains; the resumable upload route no longer deletes assembled project
staging on a general non-safety registration refusal. Retaining staging has a
storage cost and does not imply a claim that a user's original file was lost.

`app/api/files/uploads/[uploadId]/route.ts` checks for an existing completion
receipt after authenticated session admission, CSRF and rate limiting, before
multipart assembly, and retains the closed-session recovery check. Project
receipt lookup binds canonical `READABLE_PROJECT_SCOPE_SQL`, uploader, checksum
and the exact sealed key derived from this upload; deleted/superseded records do
not qualify. Its regression inspects query text/bindings, not actual PostgreSQL
or RLS enforcement.

The shared `managed-cloud-resumable-upload-client.ts` treats only progress 404 as
a possible closed upload. A valid, unexpired cached session then probes completion
and forgets the cache only after success; 401/403/409 progress errors propagate
rather than silently creating replacements. Failed completion retains the cached
intent, while existing explicit abort cleanup remains. Invalid/expired cache
replacement is unchanged. Fingerprints still lack account/org identity; the
authority-aware web chat caller uses `sessions: null`, so this does not introduce
persisted upload adoption there. Existing chat quota cleanup and direct
project/Drive registration-failure cleanup are outside this correction. Dedupe
receipt mapping, concurrent duplicate insertion and exactly-once completion are
not solved. Fixtures were source-read only; no runtime/storage acceptance or
remote rollback guarantee is claimed.

## Shared SSE reader retires unread bodies on exit

Accepted commit `0ccab6eff4c24956a23d29526d2e85d111f5dc4d` changes
`packages/client/client-runtime/src/sse.ts` and seven unexecuted real-stream
regression cases. `readServerSentEvents` records `reachedEnd` only after an actual
`reader.read()` result reports `done`. Its `finally` requests cancellation on
non-EOF exit, catches cancellation rejection without awaiting it, and releases
the reader lock. A stalled or rejected cancel therefore does not delay or replace
the original consumer/read/parser outcome; normal EOF retains decoder flushing.

Concrete consumers include mobile `services/streaming.ts`, whose terminal frame
returns early and whose `onChunk` account guard may throw. Guest chat continues
on normal `[DONE]`, while `useChatStream.ts` uses this shared reader for its replay
leg, not the main reader. This does not interrupt an already pending iterator
`next()` or establish server/provider stop, upstream cancellation completion or
changes to other provider parsers. The EOF fixture's underlying-source cancel spy
alone cannot prove absence of `reader.cancel()` on an already closed stream; the
source `reachedEnd` guard establishes that narrower call-path claim. Fixtures were
read but not run; no transport/browser/native runtime acceptance is claimed.

## Reconstruction boundary

Only the fifty accepted production slices traced above are represented as
reconstructed here. Other remembered changes from the unavailable branch require
fresh reconstruction or recoverable Git evidence before they can be represented
as current implementation. Authored regression sources are not runtime acceptance.

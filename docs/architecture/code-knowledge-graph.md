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
unchanged shared SSE reader's `finally` only releases its reader lock. No native,
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
counterguards (tenancy policies and `0110_active_workspace_content_scope.sql`);
the former serving drift supports an availability mismatch, not a demonstrated
cross-account exposure. In contrast, attachment hydration uses the service DB:
`chat-attachment-hydration.ts` now compares both owner and admitted organization
before interpreting filename metadata or reading stored bytes. The main request
processor passes context-policy scope, and the free-quota path passes its admitted
scope through the now-required hydration argument.

Same-owner, same-workspace reuse across conversations is intentionally allowed
where no conversation constraint is supplied. This slice does not redesign shared
grants, deletion, durable provenance or continuous revocation across subsequent
awaits. Generation callers still using the helper's legacy selection fallback are
outside this accepted slice, as is Gmail. Null/non-null scope fixture source was
reviewed, but no SQL/RLS, storage, request or deployment behavior was executed.

## Reconstruction boundary

Only the twenty-eight accepted production slices traced above are represented as
reconstructed here. Other remembered changes from the unavailable branch require
fresh reconstruction or recoverable Git evidence before they can be represented
as current implementation. Authored regression sources are not runtime acceptance.

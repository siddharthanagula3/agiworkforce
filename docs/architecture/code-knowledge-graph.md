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
selected-workspace lockdown lookup. A later slice below adds actual-grant
lockdown only for non-owner organization-audience viewers. RLS still uses the cookie's raw JWT; the existing
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
Country correction alone left host/MCP ambiguity open. The later host/MCP slice
below source-corrects that representation; runtime/deployment acceptance remains
open under `SHARED-WORKSPACE-CODE-DISJOINT-ALLOWLIST-01`.

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

## Mobile exports retain distinct output paths

Accepted commit `ddb8deb5e5beac09d23442dfcd412853447161c3` changes
`apps/mobile/services/fileCreation.ts` and two unexecuted fixture sources.
A shared allocator creates a UUID subdirectory beneath the existing exports root,
refuses a directory already reported present and requests directory creation with
`intermediates: false`; allocation failure does not fall back to a shared filename.
All seven writers (PDF, text, source, PNG, generated bytes, Markdown and DOCX) use
it. PDF no longer deletes a same-title destination before moving the printed file.
Display names, lineage and returned-URI use remain unchanged. Existing files are
retained, with increased storage use and no new cleanup policy. Existing DSAR
wipe in `services/dsarExport.ts` still deletes `EXPORTS_DIR` as a root using
Expo `deleteAsync`; nested outputs remain under that deletion target, subject to
existing native API semantics. This is not export-backup inclusion evidence.

`prepareLocalVideoPlayer` freshly downloads each preparation rather than reusing
a root-level disk file, then places `player.html` beside that download with a
relative video source. Its returned `directoryUri` narrows
`VideoPlayerModal`'s existing read-access root to that output directory. This loses
the former offline disk reuse for a fresh preparation. `GeneratedVideo` still
retains its component in-memory player cache; the following section traces the
separate accepted media-identity/async ownership correction. Mocked allocation/download
fixtures were read but not executed. Native Expo filesystem implementation was
not verified, so UUID/existence checks and directory options are not proof of
exclusive atomic allocation, crash safety or native runtime acceptance.

## Mobile video actions follow media identity and mounted lifetime

Accepted commit `b807df1934e32b80c1901e7fd0d64606cba3c5ae` changes three
production files and two unexecuted fixture files. `GeneratedVideo` keys an
internal owner by video URL; `MessageBubble` additionally keys the component by
message ID plus URL. Player/cache state therefore belongs to that mounted media
identity. A layout-effect lifetime and exact operation Symbol are captured
synchronously before preparation awaits, preventing overlapping actions and
fencing prepared-player publication, modal opening, alerts and loading cleanup.
The same-owner in-memory player reuse remains intentional.

`services/fileCreation.ts::shareFile` accepts an optional current-operation
predicate before availability lookup, after it (including unavailable results)
and before native share dispatch. Existing callers without the predicate retain
their behavior. Stale preparation cannot initiate this guarded share or publish
old UI, but already-started download/native share cannot be recalled. This is not
account isolation or native cancellation. Six component regression cases and
service guards are source-only; same-URL/new-message caller wiring and StrictMode
lifecycle are not established by executed runtime fixtures. No native/browser or
deployment acceptance is claimed.

## Electron installer action and synchronous restart failure

Accepted commits `d6bbc9348db7ebd734f24e7994b97219e0631eb2` and
`5a1091df5d3bca5297f8fbc0f58617ecf9aeb502` change
`apps/desktop/electron/main.ts` and its unexecuted desktop lifecycle fixtures.
The trusted `openUpdateInstaller` IPC handler now only opens the existing fixed
installer URL, including when an update is staged; it no longer silently routes
that action through restart. This matches the existing HostBridge action split.
Sender trust and installer URL construction are unchanged.

Explicit `restartToUpdate` retains staged-update readiness, live-work permission
and `not-ready`/`deferred`/`restarting` outcomes. A synchronous
`installDownloadedUpdate` throw now immediately clears `quitConfirmed` and
rethrows the original error rather than leaving permission until the existing
timer. Asynchronous beforeunload/veto/failure and permission-timeout semantics
are unchanged; `restarting` reports dispatch, not successful installation or exit.
Mocked lifecycle cases were source-read only, not executed. The existing updater
status conflation of capability with downloading and latest-versus-staged version
ambiguity is outside these narrow corrections; the later phase section traces
that separate source correction. No install, network, native runtime or
deployment acceptance is claimed.

## Cloud desktop latest lookup distinguishes unavailable from absent

Accepted commit `caea839a49f2f65076457a9c79e706a3d689a75e` changes
`apps/web/lib/releases/github-desktop-releases.ts`,
`app/api/releases/desktop-cloud/latest/route.ts` and a regression source using the
real helper with mocked fetch. Only this route opts into `throwOnError`.
HTTP, network, JSON, schema failure on any fetched page, and incomplete pagination
at the existing page limit become typed `DesktopReleaseLookupError`; the route
returns safe `RELEASE_LOOKUP_UNAVAILABLE` with 503 and `Cache-Control: no-store`.
A valid empty/filtered release list or missing supported DMG still returns 404.
An early candidate does not override a later unreadable/incomplete page.

Other helper callers retain default null-on-error behavior. Existing selectors,
GitHub fetch caching/timeouts, release security and route rate-limit admission
are unchanged. This narrowly corrects failure-versus-absence metadata reporting
when the new route is deployed, not installed-binary behavior, updater phase
truth or latest-versus-staged identity. Fixtures include compatibility and
rate-limit boundaries but were not run; no network/deployment acceptance is
claimed.

## Electron updater phase and staged identity are separate from metadata

Accepted commit `c8ff485d01821f4d4189aa7105c768b1ed8132b2` spans eleven files:
shared HostBridge contract, Electron updater/metadata/main ownership, hosted-web
notice/settings row and unexecuted regression sources. `desktopAutoUpdate.ts`
tracks unsupported/idle/checking/downloading/ready/failed separately from native
capability. Feed configuration must succeed before checks; checking/downloading
and ready suppress duplicate checks. Synchronous configuration/check errors
record failure, no-update records idle, and a staged package retains ready state
across later events. A missing/invalid/non-newer release name leaves staged
identity unknown rather than substituting installed or published versions.

`cloudUpdateAvailability` exposes actual native state and keeps staged version B
separate from latest published C. `latestVersion` comes only from parsed release
metadata. Known or unknown staged readiness survives metadata failure; unknown
identity is explicit `stagedVersion: null` with conservative legacy `version: ''`.
Native and modern hosted-web copy say an update is ready/downloading without
inventing a version. Downloading takes priority over absent-newer metadata, and
capability alone no longer implies an active download. Manual installer fallback
remains available when there is no active download or restart capability.

`DesktopUpdateNotice` uses a host/effect revision so a late check cannot overwrite
a newer ready event; retired-host events are ignored. `DesktopUpdateRow` fences
check publication/cleanup by request generation and host lifetime. These are
bounded UI guards, not proof of all native event orderings or overlapping row
actions. Old web Notice code may hide an unknown-version ready event, and old
Settings copy can show awkward blank-version wording; no installed binary or old
web deployment is silently updated. Prior installer-only and synchronous-throw
quit-permission corrections remain, including asynchronous veto/timeout limits
and restart-as-dispatch semantics. Fixtures are unexecuted; full event ordering,
StrictMode, row overlap and native runtime acceptance remain unproven. Feed,
signing/security and quit policy are not redesigned.

## Scheduled policy refusal retains cancelled outcome through delivery

Accepted commit `89dad3d54f1312e2bc1d323eaf2462943deccb2f` changes three production
files and three unexecuted regression sources. `scheduled-agent-executor.ts`
returns explicit cancellation reason/code/message for managed-compute denial
before reservation/provider work. `schedule-service.ts` finalizes that result as
cancelled and announces using the actual persisted status rather than requested
success/error status; running, cancelled and awaiting-approval states are skipped.
`trigger-fire.ts` recognizes only the cancelled run with the exact policy-refusal
discriminator, filtering both fresh and replayed deliveries without ordinary
failure retry. Other cancellation remains distinct.

Existing cost accounting, cadence/count and ordinary retries are unchanged; old
false-success rows are not repaired. The existing canonical finding
[SCHEDULE-POLICY-REFUSAL-AS-SUCCESS-01](../../audit/prior-audits/active-issues-register.md#schedule-policy-refusal-as-success-01)
is source-corrected but remains open for runtime/deployment acceptance. Its old
reproduction is historical, not rerun. New fixtures use mocked DB/helpers and do
not establish live queue/billing/provider behavior; dedicated cron aggregate and
approval-resume denial coverage is absent. No tests or operational actions were
performed for this trace.

## Managed canonical cancellation remains cancellation at EOF

Accepted commit `119de96dcd3a5ed7cb27e871b53a4f11d33f0b5b` changes
`apps/web/app/api/llm/v1/chat/completions/lib/managed-agent-stream.ts` and its
unexecuted regression source. The last validated canonical stop is tracked
independently of journal presence. At generator EOF, reported failure still wins;
otherwise a final cancelled stop selects the existing cancelled settlement path,
including consumed usage/stopped-text estimation. Journal transition, truncated
persistence and terminal owner callback reflect cancellation, and the completed
client-delivery marker is skipped. Existing awaiting-input handling is unchanged.
Mocked journal repair fixtures are not live journal/settlement proof; broader
managed partial/timed-out terminal semantics are not corrected by this slice.

## Direct stream financial outcome remains a separate design constraint

[WEB-DIRECT-STREAM-TERMINAL-BILLING-COUPLING-01](../../audit/prior-audits/active-issues-register.md#web-direct-stream-terminal-billing-coupling-01)
is Medium OPEN, source-only. `stream-transform.ts` settles EOF from `lastError`
before computing truncation; attempt status, managed delivered marking and billing
telemetry can therefore report completion for no-error truncated output. Existing
persistence already records truncation and route-success/`onSuccessfulTurn` are
already guarded by `!truncated`. Do not treat those counterguards as missing.
Failed financial finalization zeros billed/provider costs; cancellation with
consumed tokens has an existing special case. A coherent design must separate
attempt/delivery truth from charges and preserve observed usage without inventing
refund policy. No direct-path production change, observed loss, DB action or
runtime acceptance follows from the managed cancellation correction above.

## Managed EOF recognizes the exact final canonical failure pair

Accepted commit `94cd3c7ebba99320502839c320a140ee3a56b3bf` changes
`managed-agent-stream.ts` and its unexecuted regression source. Canonical task
state is tracked independently of journal state. After existing explicit-failure
and cancellation precedence, only final task state `failed` plus final stop
`error` selects failed EOF settlement, truncated persistence, no completed
delivery marker and failed terminal callback. Canonical-only failure does not
invent an error class; explicit reported failure codes retain precedence.
Existing `tool-loop.ts` resume validation, managed step admission and free-limit
producers emit this pair via `flushTerminal('error')`.

Intermediate error events, other final-state/stop combinations, partial/timed-out
and awaiting-input semantics are not broadly reclassified. Existing consumed-cost
settlement behavior remains; mocked journal/no-journal and consumed-usage source
cases are not live financial/journal proof. The separate direct-stream outcome
coupling finding above remains OPEN. No tests or runtime acceptance are claimed.

## Mobile image actions follow row, visible viewer and edit lifetime

Accepted commit `3ad598653d7e67fccd3a2a6354ab8b5b64f49811` changes four production
files and three unexecuted fixture sources. `MessageBubble` keys image rows and
fullscreen viewers by message ID/media URL; `GeneratedImage` and
`ImageFullScreen` internal owners additionally key URL/ephemeral mode. A hidden
fullscreen viewer unmounts its owner, so same-URL reopening creates a new lifetime.
Layout lifetime and exact action tokens prevent overlapping actions and suppress
stale alerts, feedback and cleanup. Close retires synchronously; feedback timers
are owned/cleared, and delayed delete confirmations require the original action.
Exact edit-session identity plus keyed editor prevents cancelled/reopened edits
from submitting an old callback.

Optional currentness predicates in `fileCreation.ts` fence image share, Photos
save and Clipboard copy after relevant permission/download/write/availability
awaits before native dispatch. Default callers retain prior behavior. An old
closure is retired rather than being allowed to act on its former image; this is
not proof that a previous path sent replacement-image bytes. Already-issued
native actions/downloads cannot be recalled, and editor-local computation may
finish while its submission callback is retired. Account/workspace authority and
native cancellation are not redesigned. Fixtures cover mocked component/service
lifetimes, not actual recycled-list/native/StrictMode runtime behavior. No tests,
network, Photos/Clipboard/share actions or deployment acceptance were performed.

## Electron runtime ownership lasts until observed direct-child exit

Accepted commit `5eb99129a769d5763f148940d522eeb60db2ac9b` changes
`apps/desktop/electron/runtime/developerSessionService.ts` and unexecuted mocked
lifecycle fixtures. `ownsRuntime` requires exact registry identity and nonclosed
state at chunk/line/notification ingress, requests and post-handshake readiness.
Closed-owner interrupts are no-ops. Closing clears buffered input and retains the
registry owner until observed direct-child exit or a no-PID spawn failure.
Replacement waits on that exit with the existing bounded request timeout and
rechecks launch permission. Known worktree runtime stop also waits before delete
proceeds; signalling shutdown/kill is not itself proof of exit.

`closeServer` already called `stopProcess` and retained `stopReason` before this
slice; the old missing-disposal audit premise is stale. Web `use-local-session.ts`
already filtered nonmatching/terminal turn IDs; this is not new renderer filtering.
The three existing Electron lifecycle findings are source-corrected/requalified,
not runtime-closed. Pending-launch ownership, deletion-versus-relaunch operations,
failed-create cleanup and all-descendant/SSH remote completion remain outside
this change. No atomic deletion or universal writer-stop guarantee follows from
known direct-child exit. Fixtures cover mocked stale ingress, exit waiting,
replacement cancellation, spawn failure and handshake/worktree boundaries but
were not executed. No process, network, native or deployment acceptance is claimed.

## Electron worktree receipts preserve uncertain outcomes

Accepted commit `23a04cd1b8ba2140e7f46f952b6940b84173dce2` changes
`apps/desktop/electron/runtime/developerSessionService.ts` and unexecuted fixtures.
Deletion forgets root admission only after a receipt matches the requested
worktree ID and contains nonblank snapshot ref and commit. Timeout/error or
incomplete/mismatched receipt retains local admission and reports uncertainty;
legacy incomplete receipts are not accepted. Start/admission failure no longer
requests speculative worktree deletion. Error copy retains the original failure
message, CLI-reported locator when known and shutdown uncertainty, asking for
inspection before retry. Errors are wrapped, not guaranteed to preserve the
original error class. No immediate UI refresh or automatic recovery is added.

A matching native archive receipt still is not physical-removal proof. The
separate High OPEN [NATIVE-WORKTREE-ARCHIVE-LIFECYCLE-01](../../audit/prior-audits/active-issues-register.md#native-worktree-archive-lifecycle-01)
traces `managed.rs` one-time active check before awaited snapshot/ref, ignored
unlock/removal/prune errors, lock-inspection failure becoming empty and ignored
lock-acquisition failure. Creation also invokes automatic cleanup. Private-index
snapshot locking is not runtime/archive exclusion; all ignored contents are not
guaranteed preserved. Native cross-process lifecycle/recovery/migration authority
remains design-only and not implementation-ready. No observed loss, atomic
archive/delete, all-writer stop or deployed/native acceptance is claimed. This
slice's mocked lifecycle fixtures remain unexecuted.

## Mobile project source actions retain original canonical account epoch

Accepted commit `bcbe3ee2cefa5955ebca816fbaa0e1f8d5a2af5c` changes four production
files and three unexecuted fixture sources. Optional API `accountEpoch` checks
span credentials, retries and response bodies. Canonical epoch listeners are
notified after runtime transition even when subsequent persistence write/delete
fails, isolating listener failures. Project upload captures before file info/hash,
checks chunk/await/native/progress/result boundaries, and requests best-effort
native cancellation on retirement. List/remove also carry the captured epoch.

Cleanup uses original captured credentials with its own timeout and is skipped
when that epoch is retired. Cleanup is disabled once registration is attempted:
the marker is set **before** `api.post` and its authentication awaits, not proof
that HTTP was dispatched. This deliberately retains possible orphan staging on
uncertain registration instead of risking deletion after a committed result.
`ProjectSourcesTab` binds handlers to rendered project/target/generation/epoch,
captures before picker/text writes, uses exact controller cleanup and fences
list/remove/late confirmations, including observed account/project ABA. Local
operations are not retired by unrelated Cloud changes. Workspace/session
incarnation, unobserved Clerk changes and native cancellation guarantees are not
provided. The separate same-owner newer-text limitation is narrowed by the
editor revision slice below, not by this account-epoch slice.
Fixtures are source-only, not native/DB/runtime acceptance.

## Shared upload authority remains an operation-wide design dependency

[SHARED-UPLOAD-ACTION-AUTHORITY-01](../../audit/prior-audits/active-issues-register.md#shared-upload-action-authority-01)
is Medium OPEN. Ordinary chat staging keys bind user, while completion uses its
current admitted org; signed multipart already binds and rejects changed user/org.
Library/project cookie-based preparation and shared hash-before-resumable paths
lack one action-entry authority contract. A scope lookup only inside resumable
upload cannot cover those earlier awaits or ordinary fallback. Main web chat's
captured account authority and `sessions: null` are existing counterguards, not
workspace pinning; the mobile correction above is separate. A coherent future
contract must cover original account/workspace through preparation, fallback,
relay, completion and cleanup, with server original-scope receipts and explicit
unknown/legacy behavior. No shared production fix, server bypass, observed loss
or implementation readiness is claimed.

## Mobile project text saves retain their rendered editor revision

Accepted commit `e851b560f44241740915919d8bdc3002d1eb63f5` changes
`ProjectSourcesTab.tsx` and its project-source fixture file. The component owns
an immutable rendered editor snapshot with session, revision and open state;
edit, close and reopen synchronously replace its ref. `handleSaveText` requires
that exact rendered snapshot before writing a temporary text file, so a retained
pre-edit callback cannot start an old save. Existing project/account context and
exact upload-controller ownership remain separate gates.

An already accepted save retains its original text and can continue uploading
while the editor changes. Its success closes the editor only when both original
context and exact editor snapshot remain current; its error likewise cannot
publish an alert over a newer draft. A valid unchanged success still closes.
This narrowly supersedes the preceding same-owner text-settlement limitation;
it does not undo an upload, alter registration/cleanup policy, or add account,
workspace or native cancellation guarantees. Six authored fixture cases cover
new title/body, unchanged success, reopen, retained pre-edit callback and stale
failure; all are unexecuted, with no native or StrictMode/runtime acceptance.

## Chrome Clerk acquisition retains exact cached-client ownership

Accepted commit `4f35f70049d18b783569c39c7275359be065312b` changes
`apps/extension/src/features/cloud-bridge/clerkAuth.ts` and its deferred fixture
source. `getNativeClient` returns the exact cached Promise; a rejected creation
evicts only that same entry, not a newer force-refresh replacement.
`getFreshClerkAuthContext` refuses obsolete creation before reading even a null
session. After initial token acquisition and renewal it verifies the cache
Promise, session object, effective account ID and session ID before accepting
any result, including null. Current null results and token retrieval failures
retain their existing semantics; origin-bound credential validation remains.

This narrows stale acquisition/cache-result ownership, not a demonstrated
cross-account dispatch path. Existing background same-owner/retired-owner and
computer-use checks, and side-panel refresh generations, remain counterguards.
Force-refresh entry points are existing behavior, not new account observation.
The `getManagedCloudAuthContext` wrapper still catches non-forced failures
(production returns null; existing development fallback is unchanged). Foreground
relay, sign-out and observer lifetimes, unobserved identity ABA, and authority
across a later operation are not redesigned. Deferred fixture sources cover
obsolete/current creation failure, late acquisition, token/renewal retirement,
identity changes and current null/error outcomes; none were executed. No browser,
credential, network or deployment acceptance is claimed.

## Chrome deletion queue serializes local mutation and settles exact entries

Accepted commit `b498d74d9d6dbb971bd2650f3a46b625bd5b9ded` changes
`apps/extension/src/features/cloud-bridge/conversationSync.ts` and its fixture
source. A recovering Promise tail serializes queue snapshots and fresh
read/modify/write operations for the actual background message/sweep callers;
network deletion remains outside the tail. Enqueue creates a UUID generation.
Successful/404 settlement rereads the queue and removes only matching account,
conversation, org and generation; generation-absent legacy entries additionally
match their original timestamp. A same-ID replacement therefore survives an
older request's settlement, including a new entry with the same timestamp.

An absent storage key remains an empty queue. Present malformed queues/records,
invalid generations and storage read errors no longer masquerade as empty or
silently discard rows. Valid legacy entries remain readable, and unknown fields
on retained records survive parsing and unrelated rewrites. Enqueue failure
returns false; initial drain read failure prevents network dispatch, while a
settlement read/write failure leaves durable intent for a later attempt. The
Promise tail recovers after rejection so subsequent operations can proceed.

This is background-local coordination, not cross-context locking, crash-atomic
storage or exactly-once remote deletion. Malformed stored data blocks progress
until repair; no automatic repair is added. The existing sweep catch returns
pending work on errors and can retain its periodic alarm, but enqueue/alarm/auth
wake liveness is outside this atomicity slice; the following companion narrows
that gap. Concurrent enqueue, replacement,
legacy, read-failure and malformed-data fixtures use mocked storage/network and
remain unexecuted; no browser scheduling or durable runtime guarantee is claimed.

## Chrome maintenance demand reconciles actual alarm completion

Accepted commit `5056ea3778d4502225fa1a2b18ed45f2b729c51d` changes three
production files and three fixture sources. `maintenance-alarm.ts` owns one
serialized reconciliation of actual alarm get/create/clear completion, retaining
an existing matching periodic schedule rather than resetting its deadline. A
demand revision prevents an older empty maintenance pass from erasing newer
work; demand changes during successful alarm operations are reconciled after
those operations finish. The background adapter uses the existing one-minute
period and awaits create's callback/error and clear's completion.

Successful durable deletion enqueue requests demand. `sweepConversationSync`
counts remaining tombstones for the currently available account as well as dirty
conversations, rereading auth after network work; other-account rows remain
dormant. Null auth at either boundary reports unavailability and returns no
account work. That callback resets the background's observed-owner wake memory,
so a later successful `GET_CLOUD_AUTH_TOKEN` for even the same owner can request
work again. Observed owner transitions wake work, not every successful token
read; no forced refresh, recursive auth relay or polling is introduced.

Alarm API failure exits reconciliation without spinning. A later external demand,
alarm event or worker start is required; even demand arriving while the failed
operation was pending is not guaranteed to be replayed. Non-forced auth's existing
catch-to-null ambiguity and lack of an unattended recovery guarantee remain.
Malformed queue repair is still absent. This narrowly extends the preceding
atomicity slice, not cross-context storage coordination or guaranteed browser
alarm delivery/persistence. Injected alarm-port fixtures, mocked sweeps and textual
background wiring contracts were source-read only; none were executed in Chrome
or a test runner.

## Chrome schedules distinguish source refusal from unreadable authority

Accepted commit `a44ee70839f40557bacda5612ec7afcba370efd5` changes four
production files and two fixture sources. The schedule-only policy reader in
`features/site-policy/store.ts` distinguishes genuine absence from storage or
parse uncertainty, retaining managed-policy precedence. The background source
resolver uses the same loaded shortcut object for its origin and prompt, preserves
direct-prompt precedence and canonical slice/trim, and adds live one-time grants
to the policy input. Missing origins and the extension-page sentinel retain their
legacy exemptions; unreadable scoped authority is not treated as revocation.

Normal admission and managed journal recovery retain tasks/journals on unknown
authority. Journal checks compare current enabled task/account and resolved prompt
before run lookup, resume and entry into the CHAT handler. This admission slice
alone did not gate final transport after the handler's later awaits; the companion
below adds that bounded gate. A counted recovery attempt is
restored only for source unavailability before any recovery I/O begins: exact
task/request, expected count, non-cancelled state and current admission predicate
are checked inside the journal mutation queue. Once even run lookup begins,
subsequent uncertainty retains the consumed attempt; restoration write failure
logs rather than providing durable repair. Task-origin denial deletion now checks
original source fields and execution generation in the mutation and guards later
journal cleanup after awaits.

Local recorded-action replay/current-target policy and shared policy-cache
freshness are outside this admission slice; the later scheduled-only replay
companion narrows the former boundary. Policy/helper and journal fixtures plus
textual background wiring assertions are unexecuted; they do not establish
Chrome scheduler, recovery-network or storage runtime acceptance.

### V1 journal provenance remains a design constraint

`ScheduledTaskRunJournal` in `features/background/scheduled-task-runs.ts` stores
prompt, task/request IDs and owner, but no immutable direct-versus-shortcut source,
shortcut ID or captured origin. Its normalizer reconstructs known fields;
`canResumeScheduledTaskRunJournal` compares owner, cancellation and prompt.
Checking today's task/shortcut and equal text therefore cannot establish the
original run's source provenance. The new admission checks do not migrate that
historical authority or make it complete.

A future contract needs a source descriptor captured with the same prompt
snapshot, explicit legacy/unknown treatment and decisions about source edits,
deletions and already-dispatched completion/cancellation. Backfilling from the
current shortcut is not proof; old writers can strip additive fields, and this
V1 reader treats an unknown store version as empty. No journal migration,
automatic drop, broader refusal policy or implementation-ready design is approved
here. This constraint is recorded once beside its architecture owner rather than
adding a duplicate broad schedule finding; no observed exploit or loss is claimed.

## Scheduled managed transport rechecks source and owner before dispatch

Accepted commit `a3f0c99fdb07c7df2e98ccd87e732478bc0971f9` changes five
production files and one fixture source. The private optional transport threads
through initial chat POST, automatic durable follow, scheduled run lookup and
resume clients. It reads fresh scheduled source authority, then verifies the
exact original account/session owner, rechecks the synchronous execution lease
and request signal, and only then invokes fetch. Scheduled lookup/resume clients
retain the default mutation-header decoration. Interactive callers without the
optional transport keep their defaults; cancellation remains outside this source
guard so revocation does not itself prevent cleanup requests.

`ScheduledTaskTransportControl` subclasses the shared non-transient
`ManagedCloudAgentRunAbortError`. Initial POST, stream/follow, model-access,
run-control and CHAT catches preserve that wrapper; shared durable retries do
not retry it. Only the outer scheduled execution boundary unwraps the original
denied/unavailable control. Actual guarded fetch invocation marks recovery I/O;
model-access conservatively marks helper entry. Thus later uncertainty cannot
speculatively restore an attempt after either boundary, while pre-I/O unknown
authority retains the preceding exact restoration rules.

This narrowly supersedes the admission-to-transport gap above. Source-policy and
account reads are sequential observations, not an atomic snapshot or continuous
revocation mechanism; already dispatched requests are not recalled. V1 journal
provenance, per-action target policy and shared cache freshness remain separate
limitations; the following companion adds scheduled recorded-replay admission. Fixture sources exercise injected transport,
delayed routing, control propagation and shared retry refusal; actual background
and automatic-follow integration is partly textual wiring evidence. All fixtures
remain unexecuted, with no Chrome/network/runtime acceptance.

## Scheduled local replay owns one recording and checks its target before forwarding

Accepted commit `09037ae52eff8a1a03402154457d5152d0c1d01f` changes two
production files and one fixture source. `scheduled-shortcut-replay.ts` isolates
scheduled replay from the interactive handler. It clones one loaded shortcut,
requires validated nonempty recorded actions and refuses a replacement prompt
without falling back to Cloud chat. Subsequent store replacement cannot alter
that captured action/provenance snapshot; this is not a continuous store-revision
lease.

The helper checks the exact execution lease around awaited reads, selects a tab,
then uses fresh `tabs.get` URL evidence for the existing recorded-origin match.
Strict policy must be readable even when creator origins have legacy exemptions:
both source policy and mandatory target automation policy apply, with live grants
still subordinate to organization restrictions. A final synchronous lease check
precedes forwarding; the actual `forwardToContentScript` calls `tabs.sendMessage`
before its first await. Result publication also rechecks the lease.

Unreadable authority and cancellation preserve scheduled work; helper denial
returns failure without deleting it. This does not remove the earlier initial
task-origin denial auto-delete path. Interactive replay and content-script action
execution are unchanged. Navigation after the URL snapshot, document identity,
per-action policy and continuous revocation remain outside this gate, as do V1
journal provenance and shared policy-cache freshness. Injected deferred reads,
copied-action and refusal fixtures plus textual caller/forwarding assertions are
unexecuted; no actual Chrome/navigation/runtime acceptance is claimed.

## Chrome policy cache publication rejects superseded reads

Accepted commit `fca87fd12b9cda85b13ccfeed4ea6d2d2b829135` changes
`background.ts`, the small `site-policy-publication.ts` owner and its fixture
source. Independent Symbol revisions own user-allowlist and effective admin
cache publication. Startup claims precede reads; a newer relevant user event
retires the user startup result, while local/managed admin events share an admin
revision. Only the current admin startup/reload success or failure may publish.
Only a winning admin reload invokes the existing active-run cancellation check;
a stale denial or failed read cannot cancel against a newer policy. User events
retain their existing immediate publication/cancellation behavior.

This corrects publication ordering, not all policy freshness. Existing startup
readiness completion semantics remain, and the previous admin cache is retained
while a newer reload awaits storage. Independent user/admin revisions are not a
transactional policy snapshot; no universal enforcement, continuous external-change
observation or periodic retry is added. Earlier sections' shared-cache limitations
are narrowed only for superseded publication, not eliminated. Deferred helper
fixtures and textual background wiring assertions are unexecuted and do not
establish actual Chrome event order, startup enforcement or runtime acceptance.

## Voice closure and accounting completion remain separate states

[WEB-VOICE-CLOSED-BEFORE-SETTLEMENT-01](../../audit/prior-audits/active-issues-register.md#web-voice-closed-before-settlement-01)
is Medium OPEN, source-revalidated without a production change. Close, expiry
and supersede transition the voice row before settlement; duplicate close returns
seconds without replay, and active-only expiry skips already-closed rows. Existing
managed finalization can durably queue actual-cost reconciliation, and an explicit
later finalization can correct a recovered outcome, but neither automatically
reconstructs a lost voice/backend usage payload. Generic stale-reservation release
is not voice settlement replay.

Free allowance settlement is transactionally idempotent; separate provider-cost
writes use stable references but can catch/log failure without a durable retry
receipt. Design must retain immutable settlement inputs, component idempotency,
retryable state and honest completion receipts across partial outcomes. No naive
retry/refund policy, observed production loss, migration/cron/runtime acceptance
or pending client correction is claimed. The canonical audit records source paths
and narrower recovery counterpaths; this design note adds no reconstructed slice.

## Web live voice retains original session, attempt and destination

Accepted commit `b5921a51e197b879364e208bd0775c9b2c1ce97d` changes four
production files and four fixture sources. `WebChatPage` supplies explicit Managed
admission to `VoiceModeSurface`; the hook captures a session identity and exact
`VoiceAttempt` rather than looking up a replacement sink after awaits. Creation
uses captured RequestAuthority with automatic activation disabled, binds the
returned conversation ID before navigation, and uses the existing bounded
navigation handoff. Destination/identity checks reject unrelated replacement
surfaces. Work-task handoff carries the original conversation and authority into
send admission rather than implicitly selecting the latest chat.

Foreground captions require the active attempt. Transcript publication uses the
captured original sink and a separate identity/conversation authority: a bounded
graceful close can finalize original same-owner text after foreground control
retires, without writing captions into a replacement surface. The original
conversation must still exist and pass the hook's Local/BYOK history/model checks.
This is not a workspace pin or instantaneous SDK-change observer.

`LiveVoiceSession` uses bearer/omit-cookie RequestAuthority for normal API work,
extension and tool/settings requests. Setup tracks microphone, peer, channel,
audio and remote tracks for teardown; retirement checks surround awaited setup
steps and late tracks are stopped. Pending microphone permission is not itself
cancelled: a later grant is checked and released. Graceful closing retains only
original-identity close/usage/transcript processing and backend metering, not new
tool work. Its existing three-second data-channel close window bounds final
transcript collection, not every native/browser promise or HTTP operation.

Known session IDs can close using the token captured at start, including setup
failure after a decoded creation response; settlement is coalesced per instance.
No replacement credentials are borrowed. That token can expire, close HTTP is
not given a new timeout/retry contract, and an unknown creation outcome cannot be
cleaned up by guessed ID. Existing server expiry is neither provider revocation
nor proof of accounting completion: the OPEN voice settlement finding above
remains unchanged. Fixture sources cover selected stale callbacks, original final
sink, late permission, setup failure and bearer cleanup with mocked browser/session
objects. They are unexecuted, not end-to-end navigation/WebRTC/browser acceptance.
The following mobile slice is separate from this web correction.

## Mobile live voice retains original login and captured cleanup credentials

Accepted commit `304bd21dcbeb6ba55590e005f6adc2b9a6eae069` changes five
production files and three fixture sources. `liveVoiceAuthority.ts` captures the
exact Clerk session object/ID and canonical account epoch, with sticky observed
identity retirement. Normal requests check identity/attempt before and after
original-session bearer and surface-proof minting, then after buffered response
reading. Requests stay within the configured HTTPS voice API path, omit cookies
and use `guardedFetch`; known-ID cleanup reuses captured original bearer/proof
with its own timeout and cannot bypass Local egress or borrow replacement login
credentials. Token/proof expiry can still make cleanup fail.

The route passes execution mode into the composer/hook. One call binds original
conversation, model, callbacks and login, with exact attempt ownership across
setup, budget, reconnect and results. Missing/replaced destinations do not silently
create a new call. Account-epoch and background subscriptions retire work; effects
and callback checks observe destination/identity changes. Foreground transcripts
update current UI, while only final turns in the graceful close window can reach
the original still-Cloud conversation under original identity, using the captured
model. This is not a workspace or billing-policy redesign.

The service tracks microphone/peer/channel/remote tracks, releases setup failures
and stops late tracks; consent, permission and SDP awaits are followed by owner
checks. Pending permission/native work is not guaranteed cancelled. Close and
settlement coalesce per instance; the existing bounded data-channel close window
retains final transcripts/usage and backend metering, not new tool control. A
decoded known session ID can be closed after setup failure; an unknown creation
outcome cannot be inferred or cleaned up by guessing. Expiry and the OPEN server
settlement constraint remain separate.

`guardedFetch`/`secureFetch` still include an asynchronous surface-proof boundary
before native fetch: the checks and abort signal are not an atomic native dispatch
lease, and native abort enforcement was not exercised. Fixture sources use mocked
Clerk, egress, native WebRTC and hook dependencies for stale identity/destination,
late microphone, close-window and original credential cases. None were executed;
no native/audio/end-to-end acceptance or pending dictation correction is claimed.

## Web dictation owns recording, retry and destination delivery

Accepted commit `c638c4d64a4457b9846d6e8c773177dbdb6cc68f` changes seven
production files and three fixture sources. `use-dictation.ts` captures session
RequestAuthority plus an observed destination generation and rechecks current
caller availability, dictation setting and billing kill-switch. The global
`voice-input-store` remains shared, but recording/recorder callbacks, chunks,
stop resolver, failed audio and retry language belong to an exact owner and
generation. New capture preempts the previous owner; old cancellation/clear
cannot erase a replacement. Retry uses original audio/language and original
session bearer with omitted cookies, not a newly selected login or language.
No-argument global cancellation remains available to existing live-voice control.

Chat admission rejects explicit Local/BYOK selection and canonical conversation/
message history evidence, including restrictive metadata, while retaining unknown
chat-mode compatibility where no such evidence exists. Code receives its effective
session/draft model and destination and fails closed unless eligible Managed Cloud
context is established. Remote dictation binds the current connection/attempt;
the desktop overlay binds its existing host return target. These are explicit
caller boundaries, not a universal workspace or privacy guarantee.

Delivery uses current draft callbacks within the original destination. Chat's
deferred send retains and rechecks the original authority before submitting;
Remote completion only clears unchanged submitted text under its original
connection/attempt. Observed scope change, setting disable, retirement or unmount
suppresses stale results and releases owned capture; late microphone grants are
stopped when observed, not guaranteed cancelled at the OS. Already dispatched
transcription is not recalled. Deferred recording/session/destination and retry
fixture sources were read but not executed; no browser/native/offline/end-to-end
acceptance is claimed. The following mobile correction is a separate slice.

## Mobile dictation consumes the original native recording handle

Accepted commit `3a88342ff4ceb82d1a643532eb21b2f4c6603f78` changes six
production files and six fixture sources. `voiceInput.ts` owns one native capture
attempt across permission/locale checks, microphone or file recognition,
listeners, timers and result settlement. Per-attempt stop/cancel cannot clear a
newer capture. Natural final/end settles that attempt's result while its returned
handle remains consumable; manual stop uses the existing 1.5-second grace rather
than depending forever on a native end event. Global shared capture/file APIs
remain available for their existing callers.

`voice.ts` returns the original recording handle instead of a mutable global last
transcript. `VoiceInputButton` is the sole tap/push-to-talk/composer result
publisher, retaining the handle through natural completion and suppressing
repeat publication with exact attempt/finishing ownership. Canonical settings,
observed account epoch, disabled state, scope/reset token and unmount retire the
button's work. Permission completion and queued results are checked before use;
cleanup removes owned listeners/timers and requests native abort where applicable.

ChatInput delegates Stop/Send/Cancel to that button and merges Send with the
latest draft under its existing send admission. Its scope includes draft identity,
app mode and selected model. CloudCode uses latest draft text and the button's
existing component/account lifetime, not a newly introduced Code-session scope
contract. QuickSchedule explicitly cancels on open/close and scopes its retained
button to visibility. Shared native recognition configuration still requests
on-device recognition; this is not proof of OS offline/privacy behavior or actual
native event ordering. Source fixtures cover selected natural-final, stale handle,
permission/file cancellation, bounded stop, button ownership and draft-delivery
cases, with mock migrations; none were executed. The following web Code slice is separate from mobile
Code dictation destination ownership.

## Web Code binds transport invocations and pane publication separately

Accepted commit `1a1fde1c2eed19c067b0f7b8f1d8d06e3799ee93` changes five
production files and four fixture sources. `use-cloud-code-authority.ts` captures
the canonical session and a fresh layout-effect lifetime per hook instance.
Disposing one pane retires its pending authorities, not a sibling's; StrictMode
setup obtains a new lifetime rather than reviving the first one. The owned API
wrapper captures RequestAuthority at method invocation, before asynchronous
mutation-header construction, and retains it through full method decoding and
success/error completion. Production requests use the original session bearer
and omitted cookies through the existing same-origin API authority. Retirement
requests abort and rejects stale completion; it does not undo dispatched effects.

`CloudCodePage` and `SharedCodeSessionPage` key their owned bodies by authenticated
readiness/account/session, with share token also part of the viewer key. The
shared viewer remains authenticated under the existing `/code` layout, including
publicly shareable Code sessions; this is not an anonymous-access feature. Page
selection and draft revisions reject observed selection/draft round trips, while
list/filter and changes-request generations prevent old publications and cleanup
from replacing newer state. Creation intentionally rebinds its accepted chain to
the newly created selection; edits during creation/provisioning stop automatic
continuation. An account-current background receipt may still update the session
list, while selected-pane callbacks, errors, approvals, task restoration and busy
cleanup require the original view. Exact submission symbols protect replacement
work. Close/delete confirmation captures ownership when opened and rechecks it
before dispatch; existing ConfirmAction keyed cleanup is not a new correction.

`use-code-first-run.ts` fences late account results and writes to the existing
global completion setting; it does not migrate that setting to per-account
storage. Split panes receive the original injected API rather than another pane's
owned wrapper. Notebook receives a guarded session-publication callback only:
its transport is addressed separately below. Local/native operations, workspace
pinning and server authorization are outside this Code slice. Entirely unobserved SDK changes and already-dispatched
remote work are not resolved by these client checks.

Source fixtures cover selected account/readiness and share-token changes,
selection ABA with newer busy state, create/provision edits, stale confirmations,
first-run writes, token/JSON boundaries and independent sibling hook lifetimes.
The sibling case is a hook fixture, not a full split-pane UI exercise. All fixtures
remain unexecuted; no browser, StrictMode runtime or deployment acceptance is
claimed.

## Notebook keeps session drafts and request outcomes in original pane ownership

Accepted commit `577cc763c7320f7dbf168c3db38839def69efe1d` changes seven
production files and three fixture sources. The account/readiness-keyed
`OwnedCloudCodePage` owns `useNotebookWorkspace`; its in-memory map stores separate
session buckets for cells, outputs, run provenance, files and pending operations.
`useNotebookCells` subscribes to the selected bucket. Switching notebooks or
unmounting only the panel retains original drafts and in-flight work within that
pane; disposing the owning page retires its authorities. These buckets have no
eviction cap or reload persistence and are not shared across independent panes.

`useNotebookWorkspace` captures original session RequestAuthority before each
execute/run-all/list/upload operation. `notebook-api.ts` uses its bearer fetch
with omitted cookies and checks currentness through body decoding; the legacy
API defaults remain separate. Each bucket has an exact synchronous operation
token, retained across panel subscriber changes. Execution blocks input edits;
listing/uploading still permit edits but block other sandbox requests in that
bucket. Confirmed results update only the original bucket, while panel selection
revision, mounted state and deferred-focus checks guard current-view callbacks.
There is no cross-pane or server-wide operation lock.

Input edits clear affected outputs and whole-run provenance. Responses must match
the requested session; run-all also validates unique ordered submitted cell IDs,
from-top status and completion consistency before recording provenance. Failed or
unconfirmed execution keeps submitted input, clears misleading output and warns
that code may have run; an uncertain upload similarly warns that a file may have
been written without automatically repeating it. Confirmed upload refreshes the
original bucket. An interrupted initial list reports uncertainty and exposes an
explicit Refresh files action, rather than automatically retrying. Exact-token
cleanup releases only its operation when the request settles; a never-settling
request can therefore continue to hold that bucket's lock.

File downloads still use the existing cookie-authenticated anchor URL. They are
outside this bearer/operation gate and may contend for the server lease; no
bounded-Blob download replacement is introduced. Abort and stale-result rejection
do not cancel a server kernel or recall remote execution/upload. Workspace scope,
server authorization, persistence and recovery semantics are not redesigned.
Source fixtures cover bucket switching, input/provenance guards, uncertain
outcomes, exact cleanup, explicit refresh and token/body boundaries. Their
ownership simulations are not actual hook StrictMode/account end-to-end proof;
all remain unexecuted, with no browser or deployment acceptance claimed.

## Organization shared viewers check the actual readable grant's lockdown

Accepted commit `3bf6cffcd0d9d2ff5a1ab0cf17418b7c01c8ec25` changes six
production files and six fixture sources. The chat share page/API and published
artifact page pass canonical `scoped.userId` alongside the same cookie-admitted
RLS adapter into their token readers. After reading the resource,
`organization-shared-viewer-admission.ts` applies only when the caller is not its
owner and its audience is organization. It requires a readable grant from
`organization_shared_sessions` or `organization_shared_artifacts`, then invokes
the existing tenant-lockdown check for that grant's organization, not the
selected Personal/unlocked workspace. Existing migrations 0184/0186 uniquely
index the resource-side grant. A missing RLS-visible grant refuses this path;
absence from a scoped read is not evidence that a resource is Personal.

Public-first reads, independently authorized owner access and invited artifact
access retain their separate semantics. Existing account admission, governing-org
MFA/IP policy and RLS remain prerequisites/counterguards, not newly implemented
controls. This correction is not blanket resource quarantine: it preserves the
existing lockdown helper's failure behavior and does not resolve raw-JWT mapping,
continuous revocation or races between resource, grant and lockdown reads.

The artifact token reader now uses canonical `rowToPublishedArtifact`, preserving
invited audience instead of projecting it as public. The separate organization
summary mapper still maps non-organization values to public, and its UI is not
corrected by this slice; that residual representation mismatch is not evidence
of a new read authorization bypass. Page fixtures mock the readers; helper and
API fixtures exercise mocked grant/lockdown paths, including Personal selection,
missing grants and exempt audiences. All are unexecuted, with no live RLS,
PostgreSQL, deployment or observed-exposure claim.

## Host and MCP effective restrictions retain empty deny-all state

Accepted commit `17212a771f91c2535179903be0b25485f915ec35` changes twelve
files, including source-only fixtures and Rust test-module migrations. Canonical
`workspace-controls.ts` derives `mcpRestrictionActive` and
`egressRestrictionActive` separately from configured lists. Configured empty
still adds no restriction; disjoint active intersections stay deny-all through
later layers and re-resolution. Existing host/MCP evaluators consume those flags
without changing unrelated toggles or literal-pattern intersection semantics.

The effective endpoint emits representation v3 and corresponding ETag. Only its
wire projection turns MCP off for active-empty restrictions so older fresh readers
that understand `allowMcpServers` refuse; canonical controls are not mutated.
The shared parser retains v2 country authority and other feature/Code advice,
while missing, malformed or noncurrent host/MCP authority projects restrictive
lists. Null Code controls are trusted only for explicit current, ungoverned,
null-organization Personal responses. This does not comprehensively validate
stored configured arrays or unrelated provenance fields.

CLI `workspace_policy.rs` distinguishes MCP semantic authority from cached feature
policy presence. Async MCP admission attempts refresh when authority is unknown;
cached admission refuses until usable authority exists. Optional fields survive
serialization; malformed Code becomes an unknown marker rather than erasing
feature denials or masquerading as Personal. Existing seal format v2 and cache
location remain, with no purge. Genuine signed-out Local/BYOK defaults remain
trusted. Old sealed policies can retain feature restrictions but require MCP
refresh/refusal; old offline binaries are not upgraded by this patch.

Production coverage remains the existing web requested-extra-host gate and native
MCP admission callers, not universal web egress enforcement. Ongoing connections, continuous revocation and existing TS/Rust wildcard-apex
matching differences are not corrected. The following slice separately adds a
CLI stdio restart check, not general reconnect enforcement. Fixtures cover composition, projection,
ETag, parsing, native admission and sealed semantic retention, but are unexecuted.
The canonical allowlist finding is source-corrected within this scope and remains
OPEN for runtime/deployment acceptance, not an observed live bypass or a blanket
closure of the surrounding policy limits.

## CLI stdio restart rechecks current cached MCP policy

Accepted commit `2e1475c2d43c10d53cbf8c69517b758adf3ecd52` changes
`apps/cli/src/mcp/mod.rs`, including five unexecuted regression cases. Every CLI
stdio origin now installs a `respawn_check` hook. Each invocation calls current
cached workspace policy first, then retains the existing optional project/plugin
launch-consent check when a project context exists. User-origin restarts gain the
policy check without gaining an unrelated project-consent requirement.

The existing engine `client.rs::reopen` calls this synchronous hook before
`open_conn`; its typed `RespawnRefused` exits reconnect without replaying the
failed request. No engine code is changed. The hook cannot fetch policy: unknown
or expired authority refuses until refreshed elsewhere. Existing seven-day cache
age and hourly turn-driven refresh remain, not instantaneous policy observation.
HTTP/SSE reconnects, healthy connections, original-account epoch binding and an
atomic policy-check-to-spawn boundary remain outside this correction. Source
fixtures simulate policy changes, origins, remote exclusions and project consent;
they do not establish credential/cache-expiry integration or process/runtime
acceptance. No server process, network request or test was run for this trace.

## Mobile Library picker owns loaded rows and selection callbacks

Accepted commit `1621b8b044b5905495aa0d38d969a77aef4413c6` changes seven
production files and four fixture sources. `useLibraryPickerScope` combines
canonical account epoch, Cloud/Local mode and exact destination scope identity;
layout cleanup retires retained callbacks. AddToChatSheet receives new-chat or
conversation destination keys, and FileMentionPalette receives composer draft
identity plus query. Loaded results/errors are tagged with their scope and hidden
when it is no longer current; original request settlement cannot publish into a
new scope. Existing account teardown, API epoch checks and server hydration
owner/scope checks predate this UI correction.

The open sheet reloads on scope changes. Its independent request generation is
stored with ready rows and checked synchronously at cloud tap before haptic,
close or attachment publication. Close immediately invalidates that generation,
so a retained same-scope row callback cannot be reused after close/reopen or a
new reload. Same-scope old rows may briefly render before the reload effect, but
the retired request generation denies their taps. Mention rows independently
recheck their captured query/destination/account scope before selection. Local
Library projection remains unchanged; these are consumer ownership checks, not
new server authorization or a claim of prior cross-account byte access.

`libraryClient.ts` now accepts a single kind or readonly kind array. Both callers
send `image,file` CSV through the existing hosted query schema before server SQL
kind filtering, ordering and first-page limits (12 sheet items, 6 mentions).
The existing defensive post-fetch video filter remains. This avoids filling the
first page with excluded video rows; it does not implement full pagination,
prove every file subtype attachable or scan/merge all Library content.

Fixture sources cover captured callbacks, destination/query/account changes,
same-owner epoch replacement, close/reopen, stale success/error and encoded kind
queries. They use mocked sheet/API interactions and remain unexecuted: no actual
native navigation, rendering timing or deployment acceptance is established.

## Native mobile attachment picks retain the original composer operation

Accepted commit `6be80ed0420ac8d65b19e10e0db63a2ecacc6c53` changes five
production files, two new fixture sources and four fixture mock migrations.
`ChatInput` exposes `captureAttachmentOperation` through its existing handle.
`useComposerAttachmentScope` binds the committed draft identity/layout lifetime,
validation mode and destination execution provenance before native work begins.
Cloud ownership captures the canonical account epoch and matches the draft's
owner; missing or mismatched provenance refuses before opening a picker. Local
operations remain independent of account-only changes. A synchronous mode-store
subscription retires a mode round trip even if React batches its renders.

All eight camera/photos/clipboard/document handlers across new-chat and existing
conversation routes capture this operation before awaiting. Execution scope comes
from the route's actual mode or conversation provenance, separately from the
composer's existing global validation mode. Camera permission completion checks
ownership before the second native launch, and delayed Open Settings callbacks
also check it. The shared runner suppresses stale results and error alerts rather
than looking up a replacement composer handle after the await.

Final attachment admission and the functional state updater both recheck the
captured operation. The updater deduplicates against current attachments while
preserving distinct concurrent picks for the same destination. It does not make
one pick supersede every other pick. No focus/AppState invalidation is added;
retained current composers may still accept their original results. Already
started native work is not recalled, and this slice adds no upload, source-file
deletion or cache cleanup. Sanitized/cache work may finish after retirement.

Hook/runner fixtures cover destination and mode ABA, canonical epoch retirement,
Local continuity, unavailable capture, late permission and concurrent completion.
Route/updater coverage is textual; the original-URI assertion is not filesystem
proof. Four existing mock migrations only supply static store methods, not live
subscription simulation. All sources remain unexecuted; native picker, device
navigation, event ordering and runtime acceptance are unverified.

## Mobile share completion retains caller ownership, not snapshot authority

Accepted commit `976bd4582f93d4747f5b9dfbb3f0cb996b28c8e8` adds two checks
in `shareConversation.ts` plus one unexecuted fixture source: after link creation
before native Share and before error publication, the existing caller `isCurrent`
must still pass. Chat supplies its conversation action scope, the conversation
menu supplies account ownership, and task sharing supplies selected run-ID
equality. No stronger task ABA/unmount/account predicate is invented. Already
created links remain, and dispatched native sharing cannot be recalled.

Separate OPEN `MOBILE-SHARE-TRANSCRIPT-SNAPSHOT-01` records source snapshot limits:
task sharing maps one default first page across branches; conversation actions
attempt refresh but a swallowed loader failure can retain nonempty selected cache;
chat uses captured selected-thread rows. Server owner/workspace/temporary/policy,
redaction and public-consent controls remain. Separate metadata/count/message
reads, offset ordering, message-only edits and tolerant/null-leaf ancestry prevent
simple pagination or count/version heuristics from proving a coherent snapshot.
A bounded authoritative snapshot and legacy branch-provenance decision need
coherent design, not a partial client repair. No observed disclosure is claimed.
The completion fixtures mock native Share and link creation; all are unexecuted.

## Mobile history separates request ownership from active-leaf intent

Accepted commit `11e7ddc4f2bae9cd26aa9a80df3a8e3f5345804e` changes four
production files and one fixture source. `cloudHistoryLoad.ts` owns an active-only
Map of exact per-conversation load objects, distinct from their `leafChanged`
intent marker. New same-ID requests replace earlier ownership; finishing an old
request cannot clear its successor or another conversation's global loading
state. Account retirement, removal/restoration, list replacement, clear and
hydration invalidate applicable loads. These tokens are ephemeral, not persistent
per-ID revisions or a durable synchronization protocol.

Cloud leaf writes pass through tracked store actions, including the execution
store's active-leaf writer. Same-value and ABA intent mark the current request;
ordinary mark-read and omitted-leaf list refresh do not erase normal remote-leaf
adoption. The loader checks account/request currentness before and after each
page, validates returned conversation identity, reconciles against freshly reread
messages/dirty IDs, then rereads committed state for artifact derivation. Original
request messages remain merge evidence, not an unconditional replacement array.

Valid unknown remote details can be admitted explicitly into Cloud, with Cloud
artifact ownership, only while still admitted and without a current Local
conversation or own local messages key of the same ID. This also refuses old
locally misclassified residual buckets; no migration of those buckets is added.
Known Cloud loading retains its existing mode-independent behavior. Unknown
loading checks mode at request admission only; later mode changes, including ABA,
do not retire that request. Errors
remain represented in store state rather than a caller-visible successful-load
receipt, so the separate share-snapshot design constraint remains open.

OPEN `MOBILE-MESSAGE-DELETE-TOPOLOGY-ROLLBACK-01` remains separate: single-row
optimistic filtering does not apply the server child splice/leaf receipt, and
same-account failure can restore an obsolete whole array. Hard server deletion
plus absent-ID, base-version-zero sync creation permits a source-derived stale
no-version recreation path; no observed loss is claimed. Whole-send/persistence
quiescence, authoritative deletion receipts and durable deletion identity require
coherent design, not just a history token or a streaming flag.

Fixture sources include valid two-page loading, account changes, older same-ID
success/error, leaf intent, removal/restoration, unknown admission and a subscriber
change after leaf publication. They are unexecuted. Integrated execution-caller,
hydration and post-message-publication subscriber cases remain uncovered by this
slice; no native, live sync or runtime acceptance is asserted.

## Share Preview waits for send admission, not generation completion

Accepted commit `079b2485b5376b63e04ca944f7deb3cc1f31c43f` changes the
Share Preview screen, its new admission helper and one helper fixture source.
`sharePreviewAdmission.ts` acquires synchronous single-flight ownership before
conversation creation. An explicit false send result preserves the preview and
allows deliberate retry using the created conversation; a missing conversation,
nonboolean result or rejection is uncertain and offers Check chat rather than
blind resend. The admission callback (or explicit true fallback) marks accepted
and navigates without waiting for generation completion. A later false/rejection
does not erase callback admission; routing failure leaves Check chat available.
Admission is local send acceptance, not a server delivery acknowledgment.

The screen captures original mode, payload/handoff identity and, for Cloud,
canonical account epoch plus Clerk owner/sign-in state. Currentness checks and
mode/auth subscriptions retire stale work, including observed mode round trips;
Local does not retire for account-only changes. Mounted lifetime, payload changes
and dismissal fence publication/navigation. Once send has entered, this helper
does not cancel it or undo conversation creation. Add to chat and Ask about retain
their existing active-destination/volatile draft handoff rather than gaining a
new destination lease or durable receipt. Helper fixtures cover explicit refusal,
uncertainty, stale ownership, callback timing and routing failure; all remain
unexecuted and do not establish mounted component, native or StrictMode behavior.

Separate OPEN `MOBILE-IOS-SHARE-INBOX-DELIVERY-01` concerns native received-copy
preservation, not this UI admission correction. `AGIShareInbox.swift` aggregates
manifests, moves only the first ten file records and skips failed moves, then
removes consumed manifests and the entire shared files directory. JS disposal can
suppress the returned callback; root navigation stages attachments in an in-memory
Map with destructive take and no durable acknowledgment. Cross-process claims,
manifest-owned cleanup and retryable durable delivery need a coherent design;
no native fix, original-source deletion or observed runtime loss is claimed.

## Android shared copies reserve distinct targets and report text clipping

Accepted commit `0ac8a9ba36abdba308b9a3e13f8fd07bb1bd853a` changes the
Android share-intent generator, its source fixture and the mobile README.
`withAGIShareIntent.cjs` now emits `File.createTempFile` before opening the output
stream, replacing timestamp/display-name destinations. The suffix preserves only
the original final extension matching one to sixteen ASCII alphanumeric characters,
otherwise `.bin`. This retains the existing URI-extension fallback used by
`services/docParser.ts::detectDocType` when a content provider supplies generic
MIME, without changing the attachment DTO's original name, MIME or copied bytes.
Allocation failure omits the entry; copy failure/oversize cleanup targets only the
newly allocated file. No native filesystem execution or shipped collision proof
is claimed by the generator-source fixtures.

The existing 100*1024-character native text clipping now sets `truncated=1` only
when clipping occurs. Root routing already forwards that flag as `nativeTruncated`
to Share Preview, which combines it with its existing byte-bound indication.
Existing five-file admission, 12 MiB per-file cap, omission behavior and 24-hour
mtime pruning remain unchanged; this is not a durable inbox or retention redesign.
The separate iOS received-copy/acknowledgment finding remains OPEN.

`PATCH_MARKER` still leaves activities containing `rewriteShareIntent` unchanged.
The README therefore requires a fresh clean release prebuild and native rebuild;
release workflow source uses clean prebuild, but neither that workflow nor a
native build ran here. JavaScript-only delivery or reapplying the plugin to an
old generated activity does not install this correction. Fixture sources assert
generated text/order, suffix/DTO preservation, exact cleanup, clipping and legacy
marker behavior; all are unexecuted. No pending CLI correction is included in
this Android slice.

## CLI session loading validates the target before replacing live transcript

Accepted commit `1ef26df908f0d16e8bef5e6bd37801660c72ccc2` changes the agent,
REPL startup/load and TUI startup/resume paths. Canonical
`AgentSession::load_managed_conversation` prepares incoming messages, then calls
existing routing-authority/model validation and adoption before publishing the
transcript or resetting context/tool-loop state. A rejected route therefore
retains the prior transcript and those transients. An empty accepted target is
authoritative and clears the previous transcript rather than retaining unrelated
messages. Existing memory-disabled fresh-system replacement remains conditional
on an incoming first system message; it does not manufacture content for an empty
target. Extraction cursor clamping remains, not a broader history provenance fix.

Interactive REPL/TUI loads read the already resolved path rather than resolving
an alias a second time. Startup explicit resume messages still override the
managed snapshot before canonical loading. REPL resets its existing token/turn
statistics; TUI retains its existing token accounting and recounts user turns.
This does not establish atomic filesystem identity, change unbacked-message
startup behavior or repair the separate accepted-turn/account-history authority
design gap. Source fixtures cover rejected routes, empty targets, system handling
and REPL/TUI statistics; they are unexecuted, not actual session-file operations.

## CLI adopted plan state belongs to the selected session

Accepted companion `daddf047aff0f6414e4a8552e1cc43f84b42b48a` changes
`agent/mod.rs`. After target routing validation, adoption resets transient plan
state, takes target approval with `unwrap_or(false)` and copies the target plan
Option exactly. Missing target fields no longer inherit the previous plan or
approval; previous plan path/rejection feedback are cleared. Permission-mode and
plan-mode configuration precedence, explicit auto-approval behavior and other
launch defaults remain unchanged.

Initial persistence is distinct from switching sessions: the private initializer
seeds the new backing snapshot with current approval/plan and restores the same
in-memory plan path/feedback after adoption. The public enable guards and metadata
synchronization ordering remain intact. The initializer permits a temporary-store
fixture without requiring production config/metadata operations; that fixture
and the target approval/plan matrix were only source-read, not executed. No Rust
was executed, and no actual session/credential/cache/environment or DB data was
accessed. This plan-state slice does not change snapshot save authority; the
following section traces that separate correction.

## CLI overwrite authority belongs to the loaded snapshot

Accepted commit `17476e18af7472d5e2b876497825f37abfc9cc4f` changes
`platform/runtime/session.rs` and fixture initializers in `session_control.rs`.
The process-global per-path baseline is replaced by nonserialized snapshot-local
`SessionPersistence`: canonical-parent target path, SHA-256 of captured bytes and
completeness. Clone copies the baseline into an independent mutex; new/forked or
plain deserialized snapshots do not acquire another snapshot's authority. A file
load establishes its baseline only after parsing the bounded captured bytes.
Unrelated listing reads and failed loads cannot refresh an active writer's
baseline. Tolerated unreadable JSONL lines mark an incomplete snapshot, requiring
preservation even if the current file still matches its digest.

Save validates and serializes before locking, avoiding serialization's clone
reentering the baseline mutex. A process-wide save mutex serializes cooperating
saves within this binary process. The bounded regular-file reader distinguishes
absence from access errors, rejects observed symlinks/special files and oversize
input, and reads at most the existing limit plus one. A known destination that
has disappeared is refused rather than recreated. Unknown, changed or incomplete
existing contents are copied to a uniquely allocated recovery tempfile, written,
file-synced and retained before replacement. Failure to preserve refuses overwrite;
the original is not renamed away to create recovery. Only a successful target
write refreshes the baseline to the exact serialized bytes written.

The separate agent length/mtime freshness API remains unchanged. This is not
cross-process compare-and-swap: a foreign writer can change the target after the
read, and metadata/open/path races remain. Recovery uses the pinned `tempfile`
3.27.0 API, whose dependency internals were not verified here; file sync does not
establish directory-fsync or full crash durability, and the existing replacement
writer is not redesigned. Source fixtures cover independent clones/reads, damaged
JSONL, unique recovery copies, known disappearance, deserialization/different
paths, equal-length changes and nonregular targets. All are unexecuted; no actual
session, credential, cache, environment or DB data, Rust execution, tests or checks
were used. Host identity is a separate correction traced in the following section.

## CLI host separates prefix convenience from exact mutation identity

Accepted commit `36b6680d5ad90358750aa9b005ba7d527a4a8589` changes
`app_server/developer_host.rs` and exposes the existing session-summary projection
within the crate. Read/resume conveniences still resolve prefixes, but read the
captured path and verify its loaded session ID against the resolved summary.
Resume builds its returned summary from that same snapshot and caches the agent
under the canonical ID, not the supplied alias. Read/checkpoint paths likewise
avoid a second alias lookup between resolution and load.

Execution/mutation admission requires the full loaded ID, with existing workspace
checks retained. Actual later operation and lease-path resolution also require
an exact summary ID, so an earlier successful validation cannot authorize a new
longer prefix match after the exact target disappears. Fork, archive, unarchive
and delete pass captured Path references to the store; execution, compact, side
question, rewind, plan and checkpoint mutation paths use exact admission and/or
execution-agent loading. Rename passes a canonicalized captured path to the
existing rename helper, preserving relative-store compatibility and explicitly
refusing a non-UTF-8 path rather than reinterpreting it as an ID.

Disk refresh validates the exact requested ID and held path before adoption;
post-turn workspace refresh also resolves exact identity and loads that captured
path. This preserves prefix read/resume compatibility while refusing prefix
execution/mutation, not a migration of old checkpoint namespaces or a broad
permission change. Existing locks, writer checks and agent freshness behavior
remain counterguards. Same-path replacement, cross-process races and atomic
filesystem compare-and-swap are not solved by these ID/path comparisons.

Four fixture sources exercise captured paths/changed identities, missing exact
IDs with longer matches, canonical cache sharing and prefix mutation refusal.
They are unexecuted; no real sessions, credentials, caches, DB or native host
operations were accessed, and no Rust/tests/checks were run.

## CLI Local HTTP uses a separate redirect-free, proxy-free client

Accepted commit `207ac4394e0004ed0e581a4c2d63af50353db916` changes
`local_models.rs` and `models/streaming.rs`. The shared Local builder applies
`redirect(Policy::none())` and `no_proxy()`. Discovery returns Faulty probes with
no models on client construction failure instead of falling back to `Client::new`.
Streaming selects a cached fallible Local client through the existing canonical
`provider_privacy_mode` classifier; failure propagates rather than selecting the
Managed/BYOK client. Ollama Local, LM Studio and unauthenticated loopback custom/
OpenAI-compatible providers use this path. Authenticated loopback remains BYOK;
Managed/BYOK transport settings are unchanged.

Current Local discovery/capability helpers receive that client, including Ollama
availability and `/api/show`; inference carries the selected client into shared
dialect `stream_chat` through `run_spec`. This newly refuses redirects, even to
another local URL, and does not support Local configurations dependent on system/
environment proxies. Public probe helpers still accept arbitrary caller clients;
this is not blanket engine hardening or a restriction on a loopback server's own
onward egress. The active CLI developer-session path is separate from unsupported
direct Electron local-inference commands. Subscription selection is unchanged;
this slice establishes no live Local-to-Copilot leak or broader routing redesign.

Four added fixture sources cover discovery construction failure, redirect probes,
canonical client selection and selected-client `run_spec` prompt redirection.
They remain unexecuted: no proxy-environment or inference-client initialization
failure injection, and the inference fixture does not exercise full auth-reading
`stream_completion`. The lockfile pins reqwest 0.13.5; its dependency implementation
was unavailable/uninspected here. No network, native, session/credential access,
tests, checks or deployment acceptance is claimed.

## OPEN design constraint: Local picker identity must survive the start pipeline

Source-only review after `207ac4394e` finds a separate end-to-end representation
gap, not an accepted implementation slice. `features/code/local-code.ts` projects
`localModelChoices` into an ID-keyed map without provider/trust identity.
`use-local-sessions.ts`, `runtime-client.ts`, Electron `runtime/dispatcher.ts` and
both normal/worktree `developerSessionService.ts` start requests forward the model
but no explicit provider. CLI `model_reachability.rs::host_models` inserts catalog
IDs before discovered Local IDs and deduplicates by ID, hiding collisions; the
separate runtime model inventory still carries provider information.

This does not prove live cloud egress. Existing explicit-provider resolution
refuses catalog/provider mismatch, Local session privacy validation remains, and
turn setup restores its snapshot on refusal before spawning work. Auto expansion
and shared `run_spec` catalog wire-ID translation are additional dependencies:
a hypothetical raw Local/catalog collision cannot be declared reachable past the
existing catalog guard merely because wire translation exists.

A coherent correction needs distinct known Local provider/model identity through
picker, start IPC and host inventory; explicit visible refusal for ambiguous,
unknown, catalog-colliding or Auto Local choices; and raw Local wire IDs without
changing Managed/BYOK routing. New shell and CLI capability admission must refuse
unsupported older hosts before worktree creation and verify the child capability,
not silently fall back to ID-only start. Existing-session selection and stored
unknown provenance need consistent compatibility decisions as well.

The capability is Rust-owned with generated TypeScript bindings
(`crates/agiworkforce-protocol/tests/export_bindings.rs` and the protocol generator).
The required regeneration is outside the current no-Rust-execution/no-checks
constraint; hand-editing generated contracts or applying only a frontend subset
would not complete this boundary. Partial exploratory edits are not an accepted
or implementation-ready patch. No production correction, runtime reproduction,
new permission behavior or live leak is claimed; the separate existing trust-
classification audit owner is not replaced by this pipeline design constraint.

## Chrome pending page capture retains invocation and draft ownership

Accepted commit `aae3cde97db79b73a29ce486ee77dbea025a41a5` changes
`src/side_panel.ts` and one extracted-source fixture. `checkPendingChat` captures
its invocation before the initial session-storage read: current owner,
conversation/generation, input identity/text/edit revision, page context, browser
tabs, attachment/document/intake identities and phases, model and composer modes.
The returned predicate gates the storage callback and capture result. An in-panel
Set suppresses overlapping handling of the same pending identity only; it is not
a durable receipt or cross-panel lock. Availability is checked again after capture
before context publication, focus or summary send.

`sendMessage` now returns synchronous local admission true/false across its
existing branches, not a server acknowledgment. If summary admission returns false
after capture, the captured context and summary prompt are retained in the still
unchanged empty composer with an explicit draft notice. Failed capture/readiness
retains pending intent. Handled records are removed best-effort only after a fresh
storage comparison matches type/text/URL/timestamp; that get/compare/remove remains
nonatomic. A newer different record observed by the comparison is retained.

The existing capture helper checks the captured tab's URL/window/loading state
before/after content read, but pending records do not bind original account/tab
provenance and this caller captures the current active page rather than proving
continuity with the menu's original tab. Active-tab continuity, cross-panel races,
non-draft equality ABA and later account observation remain outside this slice.
The fixtures extract and compile repository function text with mocked dependencies;
all are unexecuted, not browser/runtime race proof. Fixture-only `c1953bd361b35dd8f7863dc0880652be7c6d9727` replaces a stand-in
owner/comparator with the canonical accountId/authIncarnation comparator and
adds incarnation changes before storage delivery and after capture. These sources
remain unexecuted and do not add a production slice.
The following companion traces general submit/queue boolean propagation; memory
notice ownership remains outside this capture slice.

## Chrome composer and follow-up queue retain proven refusals

Accepted companion `37c767e922995fe3ace3da8bf5320393c260a7de` changes
`side_panel.ts` and one fixture source. `submitComposerText` propagates the actual
synchronous send boolean rather than assuming admission. The click handler invokes
send before clearing text; existing Enter submission now benefits from the same
boolean. False leaves the draft intact. Successful follow-up enqueue still counts
as local admission, not provider/server delivery.

`sendNextFollowUp` retains its exact head during attempted admission. A synchronous
reentrancy guard prevents recursive dispatch while that item is still present.
Only explicit false preserves it for another automatic attempt. Accepted or
unknown thrown outcomes remove only the original queue ID, avoiding consumption
of a replacement; nested finally releases the guard even if a queue subscriber
throws during settlement. Unknown removal preserves the prior no-auto-replay
behavior and is not proof of delivery or safe failure classification. Cleared
items are not resurrected. Existing QueueFull refusal can still advance the
conversation generation before enqueue fails; no queue durability, transactional
admission or broader generation redesign is added.

Fixtures extract production functions/listeners with mocked send dependencies and
the queue implementation, covering FIFO refusal, unknown throws, reentrancy,
replacement, subscriber failure and button/Enter clearing. All are unexecuted;
no real browser queue, server acknowledgment or end-to-end delivery acceptance
is established. The following section traces the separate memory-notice correction.

## Chrome memory commands retain original owner, source and notice

Accepted commit `c79836674fc64c4b4c45c69793cdebadc6dbd621` changes
`side_panel.ts` and one fixture source. `runChatMemoryCommand` captures expected
owner, conversation/generation, project and persistence conversation before auth
await. Initial dispatch/results require matching returned auth owner plus current
context and stream. `continueTurnWithMemory` additionally checks owner before
continuing. New conversation generation clears the exact visible memory notice.

Forget confirmation has its own single-use notice identity and context lifetime,
not the completed stream's lifetime, so a valid same-context confirmation remains
usable after streaming ends. It obtains fresh auth and requires the original
owner before POST; late success/error cannot replace a newer or dismissed notice.
This does not undo already dispatched mutations, pin workspace policy or redesign
storage. Extracted-function fixtures cover preauth/source capture, owner/session/
context changes, post-stream confirmation and stale publication; all are unexecuted.

Separate OPEN `SHARED-MEMORY-FORGET-CONFIRMATION-TARGET-01` concerns destructive
confirmation semantics. The shared handler recomputes text matches on confirmed
requests rather than binding deletion to the previously displayed set/version.
Existing user, workspace and visible-project SQL predicates and row locking remain;
no cross-tenant exposure or observed loss is claimed. An exact reviewed-target
receipt/version and explicit changed-target behavior need coherent design, not
just client notice ownership or a boolean confirmation.

## Web attachment clear retires queued preparation and deferred send

Accepted commit `55bdf46f14b2fce99a8fb927a5eae525765e9bdc` changes
`use-attachments.ts`, the composer wrapper and one hook fixture source. `clearAll`
advances the existing draft generation, detaches the old admission promise chain,
resets pending-batch count/preparing state and clears held files/previews/refusals.
Old queued work checks generation before starting preparation; old finalizers
cannot decrement a replacement batch's count or release its preparing state.
Existing generation-aware settlement suppresses stale results/refusals. Already
started metadata preparation may still finish; no cancellation of its computation
is added. Replacement input need not wait for that abandoned chain.

The composer routes both whole-draft and attachment-only clearing through a
wrapper that first cancels `deferredSendRef`. This deliberately prevents an earlier
Enter waiting on attachment preparation from later sending after files are
cleared; attachment-only clear retains text and requires another send action.
It is not a clipboard-operation lease or same-instance destination replacement
fix. Three unexecuted hook fixtures cover replacement documents, old finalizer/
refusal isolation and skipping queued stale preparation. There is no dedicated
composer integration fixture or runtime acceptance for deferred-send behavior.
No tests, checks or native/provider work ran for this slice.

## Web clipboard reads retain draft groups and read-only identity lifetime

Accepted commit `a6cd424fcb3031f42e261a081f7289c8ca0ac8e7` changes three
production files and thirty-three fixture files. `useSessionSnapshot.ts` factors
a read-only identity observer that permits a stable signed-out/loading lifetime
without granting authenticated request authority. Authenticated token/null gates
remain; observation also notices SDK loaded/session ID/session-user fields. SDK
changes are observed at capture, render and currentness checks, not by a new SDK
event subscription, so entirely unobserved identity ABA is not claimed covered.

`use-clipboard-draft-lifetime.ts` owns a group with exact pending read tokens,
rendered destination/project scope and identity lifetime. Concurrent same-draft
reads remain valid independently; stale finalizers cannot clear replacement busy
state. Chat/project and Local-selection subscriptions retire observed navigation
or Local/non-Local boundary changes synchronously. A change between Local models
alone is not that boundary. Explicit project composers ignore unrelated active
chat/picker changes; picker-owned drafts and saved-conversation project moves
follow their applicable store state. Rendered scope changes and unmount retire
old groups and cancel deferred-send intent before exposing idle replacement state.

The composer checks the operation after clipboard await before converting files,
notices or admission, then invokes the current attachment-admission callback.
Clear and explicit draft adoption paths retire clipboard work before mutating
composer text, including prefill, parked/deferred restoration, replacement and
queue editing. Passive adoption retires when that effect actually adopts, not
merely when a prop arrives. Already admitted attachments and their carryover are
not redesigned, nor is an issued native clipboard read cancelled or undone.

Thirty fixture changes are compatibility partial mocks rather than new lifecycle
coverage. Identity/helper and attachment-source integration fixtures cover stable
signed-out reads, current group accounting, observed navigation/boundary changes,
late data/empty/error suppression and replacement busy state. All are unexecuted;
no native, browser, SDK event-order, tests/checks or runtime acceptance is asserted.

## Memory editor optional pin capability stays with its supplied adapter

Accepted commit `2c011ad433c2f774ba840c1e97c5ddf8d1de9434` changes
`packages/ui/unified-chat/src/components/MemoryEditor.tsx` and one fixture source.
A supplied adapter without `setPinned` now disables/refuses pinning with an
accessible explanation, instead of falling through to the shared store method.
Without an adapter, standalone shared-store pinning remains. Other adapter
operations are not redesigned. Real adapter and default-store IDs usually differ;
this is a capability-boundary correction, not an observed wrong-memory mutation.
Fixtures intentionally use colliding IDs to detect fallback, plus supplied-capable
and standalone cases; all remain unexecuted.

Historical evidence for OPEN `WEB-MEMORY-OWNER-BACKLOG-01` records the shared web store's missing
operation/persisted-owner boundary. Logout reset does not retire pending hydration,
remove rollback or clear; v1 facts lack account/workspace provenance and hydration
can replay unsaved text with ambient credentials, omitting its project. Existing
server authorization and ordinary workspace hard reload remain counterguards.
Coherent operation ownership and explicit legacy-data handling are required;
unknown-owner backlog must not be guessed into a new scope or deleted as a repair.
Existing logout reset and storage purge remain unchanged: inert migration/use
does not authorize retaining private legacy data across logout.
The cloud management correction below supersedes this consumer exposure only for
its named surfaces; legacy shared-store behavior is not rewritten. Settings
preference queues/caches are separate, not covered by this finding or pin correction. No tests/checks or live memory actions ran.

## Workspace selection shares captured-session admission and uncertainty barriers

Accepted commit `d6cf5e4c0280cee63573f19facbdb1cfcd2b02a4` changes thirteen
files. `workspace-admission.ts` owns an in-memory session incarnation/epoch and
resolving/admitted/switching/unavailable/uncertain state, shared across selection
surfaces. `use-workspaces.ts` fetches through original RequestAuthority and parses
the canonical account-workspaces schema before admission; query keys include
owner/session/incarnation/epoch and nonadmitted data is masked. Missing or malformed
scope is not inferred as Personal. Retired callbacks cannot publish into a new
owner, and a validated refresh observing a changed canonical scope retires admission.

Workspace-ID switching, organization-ID switching and organization creation use
the same coordinator and captured mutation callback. A successful write is followed
by canonical GET; finalization uses that admitted active organization rather than
the submitted target. Menu confirmation retains its original callback/owner key,
creation fields are owner-keyed, and Team's picker uses canonical workspace rows
with organization IDs for the organization endpoint. This is not a migration of
all settings/admin loaders or mutation forms.

Availability is deliberately conservative: uncertain writes or an observed changed
canonical scope block the same account until reload, including through replacement
sessions. Switching is serialized in this module; no automatic mutation retry,
remote rollback or cross-tab ordering guarantee is added. A subsequent GET/reload
is a fresh observation, not proof that a prior unknown write stopped executing.
Confirmed rejection can resolve via a fresh canonical read; unresolved outcomes
retain the barrier rather than restoring guessed scope.

Finalization checks the captured authority around query cancellation, guarded
workspace cleanup and navigation. Nested module loads/method calls and storage
purge/recording check currentness; a captured switch refuses to enter account-wide
logout cleanup on account mismatch. Default cleanup callers and existing logout
reset/purge remain unchanged. Ordinary successful switching still hard-reloads or
replaces the page. This workspace slice alone does not fix the memory-store/backlog finding: it is
an admission prerequisite, not permission to retain legacy bytes across logout.
The following section traces the separate cloud management migration.

Fixture sources cover malformed admission, observed scope changes, same-ID session
replacement, stale confirmations/token waits, canonical finalization, creation
field ownership and nested cleanup retirement. All are unexecuted; no live SDK,
query lifecycle, server selection or cross-tab runtime acceptance is established.

## Cloud memory management uses admitted ownership without adopting legacy backlog

Accepted commit `f24448f907a11e1f042aa113e4ddf337aea0eebc` changes twenty-four
files. `features/memory/cloud-memory-controller.ts` and `use-cloud-memory.ts`
provide an in-memory controller for the admitted workspace owner, session
incarnation/epoch and canonical scope. Requests use original RequestAuthority,
bearer authentication with omitted cookies, and an explicit organization or
Personal header. All controller JSON requests and exports use `cache: no-store`.
Workspace/session retirement masks facts, retires requests and
refuses queued work; view lifetimes separately guard retained callbacks.

The controller serializes reads and mutations, coalesces requested hydration and
publishes a list only after complete bounded pagination. Partial or failed reads
do not replace facts with a misleading partial success. This is not a database
snapshot across pages. The optional RequestAuthority dispatch callback marks a
mutation immediately before fetch, after token/currentness checks. Pending and
uncertain writes block further writes for the same account/organization across
controller or session replacement. A definite 4xx rejection is distinguished from
unconfirmed dispatch/body outcomes; uncertainty remains until page reload, not
cleared by a successful reread. Reload is not proof the prior write stopped.

Acknowledged mutations reduce the known fact list and increment revision before
refresh; refresh failure does not turn an acknowledged write into an invitation
to resubmit. Supersession, deletion and clear reductions retain server response
semantics. Named consumers are Settings MemorySection/editor/export/clear,
ProjectMemoryPanel, conflicts/restore, summary, import and explicit memory
commands. They capture view/confirmation ownership and preserve newer draft/edit
revisions across settlement. Summary/conflicts react to fact revision, not only
count. Import uses exact reader/preview generation and single-flight commit;
explicit commands combine original chat authority with admitted memory scope.

The shared MemoryEditor now separates supplied-adapter rendering from its legacy
store subscriber; these cloud consumers do not hydrate or replay persisted v1
facts. No migration reads, adopts, rewrites or deletes that backlog. Legacy-only
or offline cloud management is unavailable instead of silently using device facts.
Existing logout reset, persist clearing and storage purge remain unchanged; inert
legacy use does not authorize preserving private bytes across logout. Standalone
legacy editor behavior, settings preference caches and the separate Local
personal-context/project-only cache/read lane are outside this management slice;
the following section traces the separate Local-context correction.
`WEB-MEMORY-OWNER-BACKLOG-01` remains OPEN for residual scope and runtime acceptance;
this is not whole-memory ownership closure or a fix for forget-target confirmation.

Queues depend on request settlement and add no request deadline, remote rollback,
cross-tab serialization or continuous server revocation. Controller/hook and
consumer fixture sources cover scope retirement, complete reads, unknown/pending
writes, acknowledged refresh failure and draft lifetimes with mocked boundaries.
All remain unexecuted; no browser, database, SDK event-order or integrated runtime
acceptance is established.

## Optional Local personal context uses an ephemeral admitted-owner cache

Accepted commit `efdb7f495aa5fa6e94cfae101078348e071c85c1` changes two production
files and twenty-two fixture/support files. `local-personal-context.ts` replaces
the project-only TanStack query entry with a dedicated in-memory owner cache and
per-project entries. The existing WebChatPage prefetch hook now bootstraps canonical
workspace admission through `useAccountWorkspaces`; only matching admitted
session incarnation/epoch/scope creates a context owner. Observed retirement clears
entries and retires requests. The old unowned query key is not adopted.

Prefetch uses original RequestAuthority bearer transport, omitted cookies,
`cache: no-store` and an explicit Personal or organization selector. Pending reads
are coalesced per project; response/body publication checks the exact owner/entry.
A current 401/403 clears only its captured project entry before any body parsing.
Other unsuccessful/offline refreshes retain still-owned data. The existing
60-second refresh staleness interval is not a hard read TTL: cached context remains
available offline for the same admitted owner until retirement or explicit denial.
This does not provide continuous server-policy revocation or cross-tab freshness.

`useChatStream.ts` supplies only `authority?.session` to the synchronous cache
reader. It checks that session's currentness and the admitted cache owner without
fetching, obtaining a token or replacing canonical ownership. Missing, unavailable
or uncertain admission omits optional instructions/memory while the Local turn
still runs; existing temporary-chat personalization and memory-enabled selection
remain. This is cache/read isolation, not a change to Local inference transport,
server authorization, persisted legacy memory or logout purge. Settings preference
caches remain a separate open lane; whole-memory closure is not claimed.

Dedicated hook fixtures cover admission/bootstrap, explicit selectors, same-ID
authority replacement, project deduplication, offline retention, denial-before-body,
late JSON and unavailable/uncertain/anonymous states. Local-send fixture changes
exercise omitted context. Seventeen page fixture wrappers and their helper supply
canonical admission/query context for compatibility; they are not independent
end-to-end SDK/navigation acceptance. All regression sources remain unexecuted;
no browser/native, network, tests/checks or runtime validation was performed.

## Capability and exclusion preferences separate account ownership from workspace policy

Accepted commit `2edbdae2b9a9bb2770ceffd3b0173b313786edbb` changes twelve
files. `preferences-client.ts` adds explicit owned APIs alongside compatibility
APIs. PreferenceOwner captures a current session and incarnation; its separate
snapshot shares one settings/version response, exact pending request and generation,
with the existing 60-second freshness interval. Reads use RequestAuthority bearer,
omitted cookies and no-store. Obsolete completion/rejection cannot replace or
clear a newer owned entry. Writes clone their payload before awaits, retain merge,
version and keepalive options, and check original authority through CSRF/token/body
boundaries. Expiring a snapshot does not cancel its existing consumers; ownership
retirement does. Legacy completion does not invalidate a newer owned read.

Account-wide `user_settings` values and version remain keyed by user, not selected
workspace. `use-capabilities-preferences.ts` uses an owner-bound queue, acknowledged
values/version and same-owner 412 retry. Currentness gates queued dispatch, retry,
publication and cleanup; newer pending choices overlay acknowledged results.
The hook now lives above MemorySection's workspace-keyed subtree, so same-account
workspace changes do not intentionally retire account preference writes. Selected
organization memory policy is fetched separately with admitted workspace epoch,
explicit Personal/organization header and original authority; missing/failed policy
is denied. Existing all-governing-organization autonomy policy is unchanged.

`use-preference-owner.ts` supplies view lifetimes. MemoryExclusions is keyed by
preference incarnation and fences reads, saves, errors and finally cleanup.
CapabilitiesSection and MemorySection disable controls until account preferences
are loaded. This is a correction for these named consumers, not all settings.
Existing local/offline settings and logout purge are not redesigned.

CloudSettingsSync is explicitly HOLD and has no diff in this commit. Its appearance,
language and command queues/unload flush still use compatibility APIs; no locale
application/commit-order safety is established here. Legacy preference APIs remain
available, and the indefinite derived `memory-capability.ts` promise cache and
billing refresh internals remain outside this owner migration. A synchronous locale
commit contract is not established by inspecting an older installed dependency
rather than the locked version. These are separate unresolved dependencies, not
claims of observed cross-account mutation or a completed sync correction.

Owned-client fixtures cover generation replacement, late rejection, payload capture,
CSRF retirement and settings/version pairing; consumer sources include exclusions
retirement and capability 412 behavior. All are unexecuted. Dedicated integrated
cases for a pending PUT/412 across same-account workspace switching, stale policy
rejection, and an in-place consumer queue account change are not established by
these fixtures. No runtime, deployment, SDK-event, cross-tab ordering, remote
rollback or universal preference ownership guarantee is claimed.

## Read-aloud playback belongs to its captured identity and navigation lifetime

Accepted commit `41c522b44f` changes six production files and two fixture sources.
`useTTS.ts` captures render identity, hook lifetime, scope generation and an exact
speech operation. Retained speak/stop/unlock callbacks refuse retired render or
scope ownership; layout cleanup retires its own operation on unmount or an
observed identity/navigation change. Chat supplies conversation ID; Code supplies
session ID, hosted Local Code root/session pair, and the authenticated shared
viewer its token. These are playback lifetimes, not content trust-mode decisions.

Cloud speech uses captured SessionAuthority through RequestAuthority bearer
transport with cookies omitted. Ownership is checked around AudioContext resume,
token acquisition, response bytes, decode, each chunk and playback completion.
Retirement aborts its request, stops/disconnects its exact AudioBufferSourceNode,
detaches handlers and releases its playback wait without publishing over a
replacement. Already dispatched server/provider processing is not undone.

Device speech uses an exact module-level cancellation lease because browser
`speechSynthesis.cancel()` is global. Passive hooks and old cleanup cannot cancel
a newer owned voice. An intentional owned replacement retires the old lease;
when the synthesizer is already busy without a known lease, acquisition refuses
instead of claiming/cancelling unrelated speech. Anonymous and explicit device
speech remain available, as does same-owner first-chunk fallback. Later chunk
failure ends playback rather than replaying all text. Settings preview remains
explicit device speech and relies on hook cleanup instead of a redundant stop
effect.

That lifecycle slice alone does not redesign Local/BYOK speech routing, consent
or trust-mode semantics; the following section records the separate refusal policy.
Browser/device synthesis is not an offline/privacy guarantee. Entirely unobserved
SDK transitions and arbitrary external synthesizer writers remain limitations;
there is no universal global-synthesis coordination or native cancellation proof.
Hook fixtures use mocked audio/synthesis/identity boundaries; caller scope fixtures
are textual wiring assertions. They include stale callbacks, cross-hook cleanup,
resume/token/body/decode waits and same-owner fallback/chunks, but all remain
unexecuted. No browser/audio/network tests, checks or runtime acceptance occurred.

## Restrictive read-aloud content refuses both cloud and unverified device speech

Accepted commit `2d2fcbc26a` changes six production files and four fixture sources.
`read-aloud-policy.ts` recognizes explicit Chat privacyMode local/byok,
providerMode Local/DirectByok, or a canonical Local model ID. Restrictive evidence
wins over a conflicting managed label. It does not infer provenance from the
current picker, display names or unrelated transcript rows. ChatMessageList
re-reads the actual clicked row from current rendered groups, uses its current text
rather than a retained callback payload, and refuses missing/restricted rows.
MessageBubble displays a disabled reason; the live row predicate also guards the
speech operation across asynchronous boundaries.

LocalSessionPanel passes durable session trustMode through CodeTranscript:
local/byok refuse, unknown refuses as unverified, and explicit managed retains
compatibility. `useTTS` adds a render policy generation and fail-closed canSpeak
predicate. Policy narrowing retires owned playback; old callbacks cannot revive
or cancel a replacement after an observed policy round trip. Refusal precedes
token acquisition, managed speech, device speech and unlock primer. No verified
on-device browser transport is provided, so restrictive content has neither
managed synthesis nor a browser fallback. This is an availability restriction,
not a localService privacy/offline guarantee.

Existing cloud/shared Code and unlabeled legacy Chat remain unclassified
compatibility paths, not universally proven Managed content. Settings device
preview is unchanged. Already dispatched server work cannot be recalled, and the
prior identity-observation/external-synthesizer limitations remain. Pure policy
fixtures, mocked hook/component cases and textual caller wiring cover restrictive
labels, missing/current rows, policy narrowing and retained handlers; all are
unexecuted. They do not establish native/browser audio, continuous revocation or
runtime privacy acceptance. No tests/checks or network actions were performed.

## Mobile speech owns complete server/device operations and terminal Stop

Accepted commit `e749069536` changes eleven production files and eight fixture
sources. `voiceOutput.ts` owns an exact handle spanning server synthesis, remaining
text fallback and device chunks, plus a captured account-scoped source. Stop
settles that handle as stopped before awaiting native cleanup; later completion,
failure or fallback cannot restart it. Replacement and callback reentrancy use
exact global/owner handle comparisons, so old cleanup cannot retire a replacement.
Cloud epoch ownership applies even to Cloud-origin device-only speech or fallback;
a missing Cloud source refuses rather than degrading to unowned native speech.
Local source remains independent of unrelated account changes and cannot opt into
server speech.

`tts.ts` serializes native stop/start preparation and gives each utterance an exact
terminal handle. Stale queued starts and old callbacks cannot finish a newer one;
a stopped chunk ends the whole operation instead of advancing. A rejected native
stop does not change the logical terminal outcome, but physical stop success is
not guaranteed. `serverSpeech.ts` captures the original Cloud epoch for every
`apiFetchBinary` request, adding operation checks around audio setup, response and
prefetched chunks. Existing API generation/epoch guards and server authorization,
policy and usage gates are counterguards, not newly introduced server controls.
Each playback owns its cache file, player and listener; cleanup settles once and
attempts each release independently. Failure can fall back only to unfinished text
while the same operation remains current. Dispatched provider work is not undone.

`useVoiceOutputOwner.ts` binds layout lifetime, source key and route context; route
replacement/unmount disposes its exact owner. Chat's canonical conversation
execution mode supplies the source. MessageList passes it into MessageBubble,
whose message-ID/content/owner scope retires row playback and guards done-state
publication. Voice settings preview uses a Local owner. `useVoiceConversation`
captures original send callback, speech options, owner and session before awaiting
an answer; stale responses cannot speak through a replacement owner. Foreground
retirement advances the session, and only completed speech can auto-listen.
Existing capture handles are cancelled exactly, including pending-start abort and
late returned capture cleanup, rather than a global cancellation after an await.

Native Local routing and OS voice selection are unchanged; device speech is not a
verified offline/locality guarantee. This does not pin workspace or SDK session
incarnation beyond the existing canonical Cloud epoch, redesign live voice, or
promise native audio/event timing. Fixtures mock API, Expo audio/files/speech,
account epochs and lifecycle transitions; row/owner/voice-response and compatibility
sources are all unexecuted. StrictMode-shaped fixtures are not native runtime
proof. No tests/checks, actual audio/network or provider validation occurred.

## Draft synchronization separates persistence authority from mounted UI

Accepted commit `25d021d38c` changes six production files and six fixture sources.
`conversation-draft.ts` owns per-session conversation queues, observed revisions,
explicit conflict revision choices and active RequestAuthorities. Serialized saves
use the original session bearer and final synchronous dispatch predicate after
CSRF/token awaits. An accepted still-current save can continue after same-session
hook unmount; UI publication/retries require their separate mounted owner. Response
CAS bookkeeping is session-owned, so a dispatched acknowledgment can advance the
revision without reviving obsolete draft UI. Explicit conflict choices, including
null, retain their exact CAS independently of later observations and are consumed
only by the matching successful write.

`web-chat-store.ts` assigns ephemeral mutation objects to draft slots, preserving
same-value parking but changing ownership on edits, explicit clears and rename.
The hook captures text, slot token, session and UI owner; final eligibility checks
current slot/text, temporary status and Local selection/history before dispatch.
Empty clears retain their intended compatibility while temporary drafts are skipped.
At an observed session transition, extant unclaimed slots bind to the previous
session rather than being silently uploaded under the replacement; their bytes
are not deleted. This is observed-transition quarantine, not durable provenance
for initially unseen/restored data or a general account/workspace reconciliation.

Conflict Compare/Close/Resolve, replacement nonce consumption, retry timers/actions
and cleanup check exact objects. Composer replacement checks currentness before
insertion; outgoing microtask parking checks captured identity and slot ownership.
Pending-clear records gain UUID marker identity while legacy records remain
readable; successful matching acknowledgments clear only their captured token.
Storage compare/remove is not cross-tab atomic. No already dispatched server write
is undone, and this slice does not pin workspace or migrate persisted draft owners.
Fixtures cover final dispatch gates, same-session unmount, stale bodies/choices,
clear replacement, observed account transitions, retry bounds and parking. All are
unexecuted; no browser, server CAS or cross-tab runtime acceptance is claimed.

### Separate unresolved temporary-conversion semantics

Source reading of WebChatPage's `handleSetTemporaryChat` shows enabling Temporary
can PUT the flag on an existing displayed conversation. Project-bound conversion
is refused. The general conversation PUT retains existing `draft`,
`draft_updated_at` and messages; its temporary follow-up marks media jobs only.
Separate draft PUT normalizes temporary drafts to null, but conversion does not
invoke it and the draft-sync client skips temporary rows. Composer clears its
local persisted draft. Ordinary history listing excludes temporary conversations,
while direct owner/org-scoped GET still selects existing draft and message rows.
These authorization and visibility guards preclude treating retention alone as
proven disclosure.

`content/support/temporary-chats.md` permits bounded retention of the conversation
record/research/resume data/files, but promises temporary messages are not written
to history. It does not explicitly resolve pre-conversion drafts/history; the
composer's stronger no-leftover-draft rationale is not server cleanup. Purge uses
original conversation `created_at` with legal-hold exclusions, not conversion time,
so an old newly converted row can already meet age eligibility. No actual purge,
loss or disclosure was observed. Product semantics for pre-existing content and
the retention clock must be decided before a coherent change; no destructive
cleanup, retention alteration or implementation-ready solution is supplied here.

## Web chat request settlement separates current UI from message persistence

Accepted commit `0ce0b65be6fa40a71075afcad030d545d02c767d` changes
`useChatStream.ts`, adds `chat-request-settlement.ts` and three fixture sources.
Ordinary Send already retired its prior authority, account/session checks already
existed, and controller cleanup already compared exact objects. This slice adds
an explicit settlement owner rather than treating those prior safeguards as new.
The public length-limited answer → Continue path can reuse the assistant message
ID; the stopped-message footer is not the asserted public Continue entry here.

The new helper owns separate conversation-current requests and conversation/message
writer identities. Beginning a successor invalidates observers and aborts the old
controller; exact finish/release cannot delete a replacement. Tracked persistence
and reconciliation chains retain ownership until they settle. Stop alone leaves
partial writes eligible, while a same-row successor permanently retires the old
writer's later dispatch/retries, even after that successor releases. Writes for a
different, unsuperseded row can still finish. Moving a temporary conversation ID
moves the exact request and writer keys, not unrelated conversation ownership.

`saveMessageToDb` retains serialized saves and creates receipt authority from the
original canonical session, with the per-row guard at dispatch. Already-issued
receipts remain readable through response decoding after request replacement;
they do not acquire replacement UI authority, and a canonical-session change
still refuses them. Current-request checks separately gate stream/UI, error,
phase, leaf restoration, metadata and saved-ID publication. Active run cleanup
also requires its exact settlement. Continue and approval/input resume establish
controllers before token awaits, so Stop or a successor fences pending admission.
Remote approval watching acquires an invalidatable observation lease; observing
does not itself claim transport, and a progressed current watch begins its own
request before following the run.

At this slice, restored approval/input turns without stored authority retained
the inherited raw `getToken` fallback; the separate correction below supersedes
that fallback only. Neither slice establishes persisted provenance or workspace
pinning. The reader still awaits `reader.cancel()`, and continuation's Set claim
is released in finalization; stalled cleanup can therefore retain liveness
constraints. No already-dispatched server operation is undone. Server content and
leaf ordering are separate: automatic assistant persistence already checks
`messageExists` before promoting replayed rows, whereas the client single-message
locked path and bulk writer promote their returned leaf without that replay guard.
The single-message null-leaf unlocked path differs. Request ownership does not
establish server ordering, idempotent replay leaf semantics or cross-client CAS.

The three fixture sources contain 25 unexecuted cases, including public
length→Continue, stale receipts/errors/teardown, same-row retry refusal,
different-row persistence, stopped partial saves, pre-auth cancellation,
observation invalidation and session changes during decoding. Teardown releases
controlled gates/streams and awaits recorded operations before resetting mocks.
These authored fixtures and source review are not browser, database, delivery or
runtime acceptance; no tests/checks were run for this documentation update.

### Replay leaf correction requires an explicit compatibility contract

Further source tracing leaves the server replay-leaf change held, not implemented.
`apps/mobile/stores/chat/chatExecutionStore.ts:1191–1216` deliberately uses
`writeCloudBranchPoint` to re-save an existing user question: the messages route
stamps a previously linear history into parent links and selects that question as
the branch anchor. The real send path at `1960–1982` invokes it for regeneration
or an explicit branch; retry, research and plan variants reuse this machinery.
`cloud-message-variants.test.ts` explicitly asserts re-saving the original question
rather than creating another one. This fixture was read, not executed.

A server-only `messageExists` guard that prevents all existing-row leaf promotion
would change that established client contract. Conversation PUT validates the
selected live message under owner/org scope and updates the leaf, but does not
stamp linear parents; replacing the save with PUT alone therefore loses part of
the operation. Save followed by PUT is not an atomic substitute and would require
coherent original-owner, cancellation and subsequent history/read semantics.
Existing mobile account-epoch/generation checks and post-write checks remain
counterguards. The branch save has no turn abort signal, however, and precedes
creation of the main turn controller; a later retirement cannot roll back an
accepted branch point.

The automatic assistant writer's existing replay guard and client single/bulk
selection behavior must remain distinguished. A correction needs coordinated
explicit intent, protocol/caller rollout and old-installed-client semantics,
including linear conversion and intentional selection, rather than an unreviewed
flag or blanket replay refusal. No implementation-ready design, observed loss,
server migration or production correction is claimed here. This extends the
existing graph boundary without adding a duplicate defect or production slice.

## Restored chat actions bind once to a canonical session

Accepted commit `26c524cebdbef29ce9b7c96a9ee7d296918ceb3a` changes
`useChatStream.ts` and its settlement-ownership fixture source. The shared
`bindPendingTurnAuthority` preserves a current existing authority, refuses a
retired existing authority without rebinding, and captures a canonical session
only when the pending record has none. Both approval and input resolvers bind
before modifying decisions/responses, UI or request ownership; absent identity
refuses the action. Their snapshot hooks replace the raw token fallback with
captured bearer authority through the existing request settlement path.

The restored approval follower uses the same helper. A newly bound restored
record owns its authority rather than registering it for the current hook's
unmount retirement. Partial input can consequently retain its original session
across a same-session remount. This does not change retirement of older inherited
turn authorities, or provide historical account/workspace provenance for a
restored record that was previously unbound. Global pending-record retention,
unobserved SDK transitions/ABA, workspace selection and server ordering remain
outside this correction; no dispatched operation is rolled back.

New unexecuted cases cover partial-input remount, replacement-session refusal,
missing canonical identity, identity change during token acquisition and a
standalone restored approval bearer. They disable active-conversation following;
the follower's remount lifetime is source-traced, not directly established by a
new regression case. No runtime or browser acceptance is claimed. The separate
server replay/intent compatibility blocker above remains held and unchanged.

## Shared artifact copying preserves owned receipts and uncertain chats

Accepted commit `045943a533f40fa09851ace15f0d81e27ed2ebb5` changes
`features/chat/lib/copy-shared-artifact.ts`, its sole production caller
`PublishedArtifactView.tsx`, and three fixture sources. Conversation creation and
bulk message insertion already enforce authenticated user/org scope; this is not
a newly established cross-account database disclosure. Bulk insertion can precede
response-schema validation or delivery failure. The old helper's known-chat
cleanup invoked conversation DELETE, whose existing behavior soft-deletes the
conversation, clears compaction, revokes sharing and attempts sandbox shutdown.
That is not evidence of physical message deletion or observed data loss.

The view now captures canonical session and exact invocation, source fingerprint
and layout lifetime. RequestAuthority sends bearer credentials with cookies omitted;
a final visibility/source/invocation predicate gates each dispatch after token
awaits. Receipt authority remains tied to the captured canonical session rather
than visible-source lifetime, preserving an already-issued response when the view
moves on. Loading/inconsistent identity silently refuses entry; signed-out entry
retains its sign-in return destination. Same-user session changes are part of the
source identity, and stale finalization cannot clear a successor's busy state.

The helper decodes the created conversation's explicit organization, including
null Personal, and sends that scope in the bulk request header. Missing scope is
uncertain rather than an implicit Personal fallback. A client UUID identifies the
single assistant message; acceptance requires exactly one schema-valid receipt
with that ID, assistant role and expected trimmed content. The helper returns the
artifact without publishing it. Only the current exact view invocation/session
upserts the persisted artifact singleton and navigates, with a second currentness
check after publication.

Unconfirmed creation/save yields truthful check-your-chats guidance where the
original view remains current. There is no speculative DELETE or automatic retry;
created shells or accepted copies may remain. This is not transactional copy,
server idempotency, guaranteed cleanup, historical workspace provenance,
continuous revocation or rollback of dispatched work. The created destination's
explicit scope is distinct from pinning an initial workspace selection.

Unexecuted helper/view cases cover Personal/org receipts, absent scope, malformed
or mismatched receipts, response loss, source/session retirement, same-session
successors and current publication; the images fixture mock is migrated. They do
not establish real browser, database, storage cleanup or delivery behavior. No
tests/checks or network/database actions were performed for this documentation.

## Artifact sync baseline and write provenance remain a coordinated design dependency

Source tracing adds OPEN `WEB-ARTIFACT-SYNC-BASELINE-OWNERSHIP-01` in the canonical
registers, not a reconstructed production slice. `artifacts-store.ts` persists
local artifacts/versions/selection but keeps the cloud overlay in memory.
`use-artifact-cloud-sync.ts` clears that overlay on setup/cleanup while retaining a
per-user durable cursor; `/api/chat/sync` only returns rows newer than that cursor.
Unchanged cloud-only rows, edits and tombstones can therefore be absent after
remount without any server deletion.

Resetting the cursor alone is not safely read-only: the subsequent collector scans
persisted local artifacts without admitted owner/dirty-intent provenance. A restored
cloud version can turn an eligible base-zero conflict into a first accepted update
and skip the conflict notice. Existing conflict handling can itself enable a later
retry, so reset is not the origin or unique cause of this provenance risk. General
sync also pages conversations/messages; the 100-page pull limit and cursor return
only after complete success make repeated full replay/late failure a possible push
starvation boundary. A coherent correction needs baseline/cursor commit and partial-
progress semantics together with owner-bound dirty intent and explicit migration.

Abort-before-delta publication, hook cleanup checks, server user/org RLS and
parent/message/version guards remain real counterguards. Logout purge and normal
workspace purge/hard reload remain unchanged; a cursor without workspace suffix
alone does not demonstrate leakage. Mutable-token/admitted-workspace publication
still needs qualified ownership design. No legacy adoption/deletion, silent push
disabling, implementation-ready solution, observed loss or cross-account database
disclosure is asserted. See the canonical finding for exact source boundaries.

## Retained native Excel edits are refused, not reconstructed lossily

Accepted commit `7a1467c3b67758da9ffca69afdb318778e232f50` changes six source,
embedded-fixture and decision-document files. `ExcelEditor::edit_spreadsheet`
unconditionally returns unsupported before source/output I/O; `add_row` delegates
to it and the edit enum remains compatible. The wrapper no longer resolves paths.
The registry no longer advertises the edit tool, so ordinary retained chat lookup
refuses before dispatch; direct Rust/custom-registry routes remain protected by
the owner refusal. Existing guard/dispatch structure and read/create remain.

The actual historical route was registered `chat_send_message` → tool registry →
executor/document adapter → wrapper → editor, with output defaulting to source.
The standalone edit function was not registered Tauri IPC; public Electron's
unsupported gate is separate. Prior first-party code populated an unattached
Worksheet map before saving a fresh Workbook and reaching a truncating writer.
The earlier installed dependency writer inspection is historical, not reverified
serialization/save evidence. No workbook overwrite or data loss was observed.

Existing High `NATIVE-EXCEL-EDIT-UNATTACHED-SHEETS-01` is qualified as source-contained,
with runtime/deployment acceptance OPEN and full-fidelity editing unavailable.
Embedded fixtures for variants/path inputs/add_row and registry/read/create
advertisement were read but not run. No Rust, workbook I/O, native build or deployed
proof exists in this tranche. Re-enabling requires a separately accepted preserving
backend, not simply reattaching sheets or restoring the registry entry.

## Mobile memory import retains the preview's original destination

Accepted commit `3d97d59ab324e83abbfa8523d9f8d6458a12ef4f` changes four
production files and three fixture sources. Previously a completed preview could
outlive its owner/mode while a later Commit captured the then-current destination.
Existing API account epochs/egress checks and Local SQLite routing were already
counterguards, not new protections supplied by this slice.

The import screen binds typed/picked text and preview to `AccountScopedUiState`.
Direct canonical epoch events clear retired Cloud ephemeral drafts; device-owned
Local drafts survive account-only changes and remain usable offline. Mode changes
retire operations and suspend the original draft rather than rebinding it. The
root Clerk bridge's existing activation/invalidation and account cleanup remain;
the app uses its existing Slot/Drawer routing, so disposal is not assumed whenever
a screen loses focus. Explicit blur invalidation covers retained mounted screens.

Exact operation identity plus draft revision guards picker/file-read, preview,
selection and commit publication/finally. Controls are disabled during pending
work. Each Cloud preview/commit API call carries the captured original account
epoch; Local operations check original scope around reads and each write. A fresh
Cloud activation with no bound draft can enable entry without changing mode.
Same-owner mode return retains the original preview/selection, but cannot revive
an interrupted operation.

`writeLocalMemoryFact` can insert before its later supersede step fails. Import
now stops with uncertain-outcome guidance instead of counting that exception as a
skipped successful item. Interrupted or failed commit blocks immediate repeat
until an explicit fresh preview; it does not roll back inserted rows. Normal
preview is bounded by the existing 500-item limit, so defensive multi-batch guards
are not evidence of a normal UI multi-batch exploit. No migration, storage-schema
change, logout weakening, native/API recall or general workspace/session-incarnation
redesign is introduced.

Unexecuted fixture sources cover mounted blur/refocus, original-owner preview and
commit, mode round trips, Local draft preservation, Cloud retirement, late file
reads, exact cleanup and no-draft Cloud activation. They do not prove actual native
picker timing, SQLite rollback, network cancellation or runtime acceptance. No
tests/checks, native, database or network actions were performed in this trace.

## Mobile DSAR exports bind Cloud dependencies and isolate temporary files

Accepted commit `e58223506a9363b6c3f8d31da33139194acc2091` changes fourteen
production/fixture files. DataControls and Storage previously captured supplemental
snapshots before asynchronous SQLite collection; Cloud-mode personalization and
mixed Cloud artifacts could remain in that captured object after live-store logout
cleanup. This does not establish that all Local chats were exposed. Existing
inclusion semantics and original Cloud API account-epoch guards are retained.

`buildLocalDataExportSnapshot` adds optional nonserialized authority only when
Cloud-mode settings or Cloud-provenance artifacts are included. It requires the
original canonical epoch and matching artifact owner; missing authority or a
mismatched/missing Cloud owner refuses, without deleting device records. Pure
device exports remain offline and account-free. The shared `useLocalDataExport`
owns exact focus/operation identity for both local callers, observes canonical
epoch changes and fences progress/cleanup/publication. Collection and file/share
boundaries recheck caller plus snapshot authority. The Cloud exporter passes its
original epoch to the API; stale-account alerts are suppressed rather than shown
over a replacement account.

Earlier ordinary export isolation did not cover these fixed DSAR paths. Both now
use `withDsarTemporaryFile`: UUID operation directories, a shared in-process
reservation Set, existence refusal and non-intermediate child creation, retaining
`agi_data_export.json` / `agi_cloud_data_export.json` basenames. Cleanup removes
only a successfully allocated operation directory, including after a partial write
or later error. Rejected/uncertain allocation is not ownership. Cleanup failure is
swallowed to preserve the original or successful outcome and may leave temporary
bytes. Native mkdir implementation was unavailable, so this convention is not
proof of cross-process atomic exclusivity.

Currentness is checked before native share dispatch, including after availability
await; no post-share assertion relabels an already accepted share as stopped.
Already-issued native sharing cannot be recalled. Cache-clear/wipe root races and
the existing 10,000-row collection limits/completeness remain separate unchanged
boundaries; destructive paths were not modified. Fixtures simulate authority,
blur/refocus, late collection, collision/allocation, partial-write cleanup and
concurrent exports, with compatibility mock updates. All are unexecuted, with no
native filesystem/share, database, network or runtime acceptance claimed.

## Explicit mobile Local-to-Cloud text copy uses a reviewed transfer plan

Accepted commit `27ee4d811bf26169e2316740465d70f28bf570b9` changes
`localCloudSyncService.ts`, DataControls and two fixture sources. Dialog entry
freezes account epoch, Cloud mode and copied payload into a single-use plan;
confirmation cannot recapture a replacement destination. Manual Cloud-mode entry
is required, with no automatic mode switch or egress-guard relaxation. Existing
`guardedFetch` refusal in Local Mode remains a counterguard against an ordinary
account-switch disclosure narrative; no such leak was demonstrated.

The screen owns exact focus/operation cancellation, account/mode subscriptions and
finally publication. The service rechecks that plan immediately before dispatch,
including after the shared client's asynchronous mutation-header preparation, and
passes original epoch plus abort signal to creation and bulk API calls. It requires
the exact returned conversation ID before bulk upload. No Local conversation,
message, file or memory is changed. Already-started native/API work is not recalled.

Existing selection bounds remain explicit: first 50 eligible non-temporary Local
conversations, last 100 completed/nonqueued messages per selected conversation,
then blank text excluded. Empty chats are excluded and omission counts are shown
before confirmation. Success says selected text copied, not whole-account migration.
Bulk receipts separately count acknowledged messages and fully copied chats;
malformed/missing or lost responses stop with uncertainty, while partial numeric
receipts remain partial. UI directs the user to inspect Cloud before another copy;
there is no automatic retry or speculative cleanup.

Durable retry/idempotency remains unresolved. Non-UUID Local conversation IDs receive
fresh UUIDs for each newly prepared plan; message payloads omit IDs and the server's
existing insert supplies them. The in-memory consumed-plan WeakSet is not durable
reconciliation. A new plan can duplicate prior accepted content, and repeating the
same first eligible subset does not reach older-than-50 chats. A future complete
migration needs explicit durable identity, receipt/recovery and selection semantics,
not silent retries, deletions or changed temporary retention. Server authorization
and optimistic storage contracts remain unchanged.

Unexecuted fixtures cover frozen payloads, account/mode ABA, the real shared header
await boundary, capped/excluded selection, partial/invalid receipts, unexpected
created IDs and dialog ownership. They establish no native, database, network,
cross-device or runtime acceptance. No tests/checks were run for this trace.

## Mobile account deletion retains confirmation identity and truthful status

Accepted commit `94a75028b9371de74673f7cb7fb54834de55a24b` changes
CloudAccountScreen and its owner-switch fixture. The deletion callback now passes
the original confirmation's `accountEpoch` into `api.delete`, including the resend
performed by `useStepUp`. Existing transport checks that epoch before/after auth
acquisition and through retries. Previously a retained modal could acquire a fresh
replacement-account grant and bearer before invoking the old callback; this is not
proof of observed wrong-account deletion. The server's rejection of an original
account grant paired with another bearer remains a real counterguard.

Generic `useStepUp` grant acquisition and `StepUpModal` latest-session lifecycle
are unchanged: this correction binds the deletion callback, not every modal action.
Server subject/action controls, CSRF, subscription checks, grace periods and erasure
policy also remain unchanged. There is no recall of an already accepted deletion.

Cancellation now sends the captured epoch and accepts only a boolean receipt.
Server HTTP200 `cancelled:true` acknowledges cancellation; HTTP200 false
confirms no pending deletion. Grace-window expiry returns HTTP409, not that
successful false contract. Malformed/network failures clear authoritative UI
status and initiate only a status GET for the original epoch. A request sequence
prevents older GET results from replacing the newer receipt; unknown status offers
read-only refresh rather than deletion. A synchronous cancellation-in-flight ref
also blocks deletion from retained or newly opened confirmation while cancellation
is pending. Exact account checks fence status/finally publication.

This deliberately makes an authoritative status read an availability prerequisite
for the destructive UI. It is not a durable transaction or general grant-lifetime
redesign; unknown outcomes remain unknown until readable server evidence. Fixture
cases use mocked API options and deferred outcomes, not real bearer/step-up transport
or deletion execution. All are unexecuted. No tests/checks, authentication, native,
database or network actions were performed for this trace.

## Mobile security mutations carry original account and consequence intent

Accepted commit `112c9f479e754f9e5a17cb91c3d65469c905e0f9` changes five
production files and three fixture sources. Seven mutations now pass the original
canonical Cloud epoch through confirmation and any step-up resend: revoke all
sessions, password change, authenticator setup/verify, backup-code regeneration,
two-factor disable and workspace ownership transfer. Their service calls use the
existing API epoch checks rather than recapturing the destination after approval.

AccountSecurity keeps owner-tagged status and masks it against current epoch/user.
Password opening captures its account; operation versions fence retained submit,
close, error and finally callbacks. Two-factor enrollment secrets and backup-code
stages carry account identity; exact stage/operation checks fence verification,
close, secret copy/authenticator launch and related callbacks. This is bounded
client ownership, not new server permission or credential-policy enforcement.

Workspace loading captures one account across overview and member reads, with
request sequencing and epoch publication checks. Ownership-transfer confirmation
captures organization ID, member and displayed workspace name; later callbacks use
that original consequence rather than a replacement row. Current ready-state and
intent checks reject retired targets. Existing server authentication, CSRF,
subject/action-bound step-up grants, membership and Primary Owner checks remain
counterguards, not newly absent protections or evidence of observed wrong-account
security changes.

Single-session revoke, timeout/lockdown settings, ordinary membership mutations
and workspace switching remain outside this slice. Generic StepUpModal challenge/latest-session handling was outside this seven-
mutation slice; the separate lifecycle correction below narrows that exclusion. Existing API rejects late
successful responses after an epoch transition, so an already-dispatched mutation
can have an unknown outcome; this is not full receipt preservation, rollback or
automatic retry. No already-issued native secret-sharing action can be recalled.

Unexecuted fixtures exercise original epoch options, retained confirmations,
account transitions, staged state and workspace read/transfer paths. Same-workspace
replacement, backup sharing and old-finally combinations lack dedicated coverage;
mocked source cases are not real transport/authentication or native acceptance.
No tests/checks, credentials, network, database or security actions were performed
for this documentation trace.

## Mobile step-up attempts own challenge and verification lifetimes

Accepted commit `4875633119d61a05ab1889ecb9e60b4bbbd5f280` changes three
production files and three fixture sources. `useStepUp` establishes an exact
attempt before the first send, capturing SDK session object/ID, canonical account
epoch, action and resource. Its resolver belongs to that attempt; replacement,
unmount or observed identity retirement settles only the matching pending challenge.
Only explicit `STEP_UP_REQUIRED` enters acquisition and permits one resend.
Already-dispatched mutation results return unchanged rather than being retroactively
relabelled cancelled by this hook.

`captureStepUpIdentity` checks SDK object/ID/user against the original epoch and
makes observed retirement sticky. Grant/readiness requests carry that epoch and
attempt signal, with currentness around token and response awaits. The modal is
keyed by attempt and binds immutable initial props, so incidental parent rerenders
do not restart verification or redirect its completion. Synchronous operation locks,
exact versions and mounted/current checks fence verification, prompt publication,
secret entry, grant completion, cancel and finally. Existing SDK methods are used;
no new SDK listener or cancellation API is asserted.

This narrowly supersedes the earlier generic modal lifetime exclusion, not all
security authority. Unobserved same-user SDK ABA remains possible; already-running
shared SDK verification state is not cancelled. At this lifecycle slice, captured-bearer HTTP401 still entered global auth recovery;
the separate caller-owned-401 correction below supersedes that step-up-grant
residual only.
The final supplied mutation callback may still obtain ambient authentication after
the hook's invocation check, including a same-user replacement SDK session. Caller
epoch guards protect observed account/sign-out transitions, not exact same-user
session identity at dispatch. Existing API/caller and server subject/action controls
are unchanged, with no rollback or continuous identity guarantee.

The pinned SDK packages were unavailable for implementation inspection. Authored
hook/modal/service fixtures are unexecuted and mocked; email, retry, sign-out and
late-grant/readiness branches lack dedicated cases. No authentication, credentials,
SDK/native, network, database, test or checker execution establishes runtime
acceptance here.

## Explicit caller-owned bearer refusals bypass ambient 401 recovery

Accepted commit `7b5debac1b46b1b0468fcf6a7a71ae66c5fa408b` changes three
production files and three fixture sources. API `auth401Recovery` is an explicit
`caller-owned` opt-in; omitted/default callers retain ambient behavior. Only
step-up grant acquisition and push registration opt in here. Post-fetch generation
and optional epoch checks still precede exposing HTTP401. Those requests return
the refusal without ambient token refresh/retry or global session clearing.

Existing raw, JSON and binary body readers retain their account guards and timeout
release/finally behavior. Step-up treats HTTP401 as failed before classifying a
body as a grant or verification challenge; push registration receives the normal
typed API refusal and returns false through its existing catch. This narrowly
supersedes the captured-step-up-bearer 401 recovery concern, not all authentication
side effects or transport ownership.

HTTP403 passkey/account-unavailable handling is unchanged, as are other streaming
and upload recovery paths. Exact same-user session dispatch, push token provenance
remain separate residuals. At this slice, push assigned `deliveredSignature`
before its final context-current return check; the registration-lifetime correction
below narrowly supersedes that local publication gap.
Neither existing API callers nor server authorization policies are redesigned.
Fixture sources cover opted-in refusal, retained body/epoch checks and default/
403 behavior but are unexecuted; no authentication, credentials, network, runtime,
tests or checks were exercised for this documentation.

## Mobile push receipts and listeners belong to exact registration lifetimes

Accepted commit `1b3a445cf17ca7bff8791b2c6418840522cb047e` changes two
production files and two fixture sources. `pushPreferenceSync.ts` replaces shared
receipt/listener state with an opaque registration handle for the exact context
object and token. Repeating that live pair reuses its handle; replacement or Stop
permanently retires the old handle, including a later identical-token restart.
Post-authentication, device lookup and POST completion checks precede receipt
publication and listener activation. A successful request on the same live handle
remains useful even when a newer request on that handle failed.

`notifications.ts` separately captures a discovery generation before permission,
channel and Expo-token awaits. A native token refresh supersedes older pending
Expo lookup before it can claim a registration; after POST begins, status belongs
to the registration handle instead. Context replacement/null retires preference
sync. Timers, preference/AppState subscriptions and native notification listeners
capture their exact lifetime; stale callbacks and old cleanup cannot retire the
replacement. Root account setup/cleanup, explicit enable and native-refresh callers
use this chain. The exported registration entry still permits a new claim with a
live context; it does not establish independent token provenance.

Existing API account-generation fences and the server mobile-device owner-row
refusal remain counterguards, not newly introduced cross-account authorization.
This corrects local receipt publication/activation ownership, not remote write
ordering, credential provenance or actual notification delivery. A failed new-token
registration deliberately leaves prior sync retired; no fallback, automatic retry
or unregister is added. Already-dispatched writes are not recalled.

Seven added fixture cases cover replacement/Stop receipts, same-handle success,
retired foreground/native callbacks, discovery ordering and context clearing.
They are mocked and unexecuted; stale timer execution and caller status replacement
lack dedicated cases. No native, network, authentication, tests or checks establish
runtime acceptance here.

## Project knowledge references and object deletion need coordinated recovery

Design-only constraint `WEB-PROJECT-OBJECT-LIFECYCLE-01` remains OPEN. Project
`duplicate/route.ts` copies live knowledge metadata and its existing `storage_uri`
inside a transaction after an earlier scoped source-project read, without a common
source lifecycle lock. File DELETE and `releaseDeletedProjectContents` check live
references before later object removal. An uncommitted duplicate reference can be
invisible to that check; committed-reference protection is real but does not settle
this overlap. Owner/org admission remains intact, with no cross-owner or observed
loss claim.

`deleteProjectKnowledgeObject` can partially remove private/legacy-public objects
or local byte/metadata files before rejecting. Single-file DELETE then attempts to
restore live metadata without a surviving-byte receipt, while both web panels restore
their previous lists on failure. Whole-project cleanup logs storage failure after
metadata deletion; mobile Cloud sources also use the file-removal contract. None
of these UI/metadata outcomes proves physical rollback. Coherent reference admission,
durable deletion status and partial/unknown recovery are a design dependency, not
an approved metadata-only patch or lock across remote calls. See the
[canonical finding](../../audit/prior-audits/active-issues-register.md#web-project-object-lifecycle-01).
No production slice is added; no tests, database, storage or network actions were run.

## Mounted project notes retain drafts and own save acknowledgments

Accepted commit `5dd9ce6124e53000cc87b4cb2a2e407b1cf3c77a` changes
`ProjectNotes.tsx` and its Notebook fixture source. The project-keyed Notes session
owns initialization and a parent draft that survives editor collapse/re-expansion;
collapse no longer starts another read. Explicit failed-load retry and save have
synchronous admission refs. Save captures submitted text and acknowledges that
saved baseline without replacing newer typing. Lifetime checks suppress retired
load/save publication, toast, `onSaved` and finally after unmount/project replacement.

This is mounted draft preservation, not navigation persistence, account/session
transport ownership or server compare-and-swap. Existing upload/storage semantics
remain. Unexecuted mocked cases cover collapse, newer typing during save, project
replacement, explicit retry and overlapping retry admission; they are not browser
or backend acceptance.

## Project settings save belongs to its opening dialog session

Accepted commit `ef2c65505871def4166ab3bc160b19d3fb019019` changes
`ProjectSettingsDialog.tsx` and one fixture source. The wrapper mounts a project-keyed
session only while open, taking its opening project snapshot rather than resetting
editable fields on same-project parent refresh. A synchronous save lock admits one
request, blocks dialog dismissal while pending and disables editable native fields
through a fieldset. Exact lifetime checks fence save callbacks, toast and finally
when the parent closes/reopens or replaces the target project. A failed current save
retains the draft and releases the lock.

Independent file and memory panels remain outside that disabled fieldset and are
not redesigned. Sibling duplicate/delete callbacks, account/session transport and
server revision conflict handling are unchanged. A retired successful save omits
`onUpdate`, so the parent store may need a reload despite accepted server changes;
there is no rollback or remote cancellation. Drafts are not persisted across
navigation. The separate OPEN project-object lifecycle finding above remains
unchanged. Mocked fixtures cover overlapping saves, dismissal, refresh/failure,
direct open-project replacement and same/different-project reopen, all unexecuted.
Neither slice was tested, checked or exercised against browser, network or storage.

## Measured zero disk space refuses mobile model download admission

Accepted commit `f8e68649d643abae00c4a3a475e8c2de9e81554c` changes
`services/modelDownload.ts` and one fixture source. `assertFreeSpaceFor` now treats
a finite measured zero as insufficient storage and returns `storage_full` against
the existing required-size-plus-headroom budget. Exceptions, negative values and
nonfinite readings retain their prior unavailable-measurement behavior. This is an
admission correction, not reserved disk capacity or a guarantee against later disk
changes. Boundary/unknown-reading fixtures are unexecuted; no device was queried.

## Model removal refuses unverified SDK or unowned storage

Accepted commit `0268b53765d14662acdd0e7736ffa16f802e0b0e` changes the
model-download service, Storage screen and two fixture sources. Removal accepts
only a Local GGUF record with a valid bounded model ID and the exact app-owned
`modelFilePath` location. Capabilities must be absent or a parseable object whose
optional manager is `llama.rn`; unsupported SDK/unknown ownership is refused before
file deletion or install-record cleanup. The service rereads the installation and
compares identity fields including installation time, path, checksum, size and
capabilities against the confirmed snapshot; last-used changes alone do not reject.
This is a pre-delete snapshot comparison, not atomic locking against later changes.

Storage retains unsupported records/Ready state and gives an unavailable notice.
For supported removal, file deletion precedes database/install-store cleanup; failures
are reported rather than assumed successful. Totals are reloaded instead of subtracting
catalogued bytes, and displayed model sizes are explicitly estimates. This sequence
does not establish a transaction across files, database and UI or rollback after
partial failure. The sole production `deleteDownloadedModel` caller is this screen.

No SDK disk-deletion API or cache path was verified; none is inferred or removed.
Existing `wipeAllLocalData` separately clears `installed_models` and the app model
directory, but completeness for SDK-managed caches cannot be established from this
source trace. Verified SDK ownership/removal and truthful completeness semantics are
a remaining design constraint, not observed retention or permission to weaken existing
wipe/logout behavior. Mocked fixtures cover unsupported ownership, stale installation
snapshots, supported removal and retained state on failure; all are unexecuted. No
native, database, disk deletion, tests, checks or network actions were performed.

## Performance benchmarks admit a captured Local model and report its actual runtime

Accepted commit `2e989c55388b89d7a40e4059a8e5e4c82e27d575` changes the
Performance screen, `performanceMonitor.ts` and one fixture source. The sole
production `runBenchmark` caller resolves its captured selection through
`resolveLocalModelRef` before starting the sampler. It passes the resulting model
ID/path to `localGenerate`, including supported system models without an installation
row. Failed admission gives actionable model-selection/download guidance instead of
starting generation. The service persists `GenerateResult.runtime`, not a guessed
device-tier backend, and refuses an aborted result before recording history; sampler
cleanup remains in finally. UI copy describes a standard prompt, not a guaranteed
60-token result, and distinguishes a saved result whose display refresh failed.

A synchronous screen-local operation ref excludes overlapping benchmark/load/unload
entry. Readiness uses exact resident ExecuTorch preset or GGUF path against a
selection-tagged resolved reference, refreshed at focus and operation boundaries.
The existing `loadedLocalModel` helper prioritizes the ExecuTorch snapshot over
GGUF; it is not a complete live inventory. System availability is checked on use,
and the unload label is plural because `unloadLocalModels` releases both runtimes,
not necessarily only the displayed selection.

This is not a navigation lifetime or global operation lease. A late old operation
can publish its tagged selection and conservatively remove a newer ready display;
tagging prevents treating that old reference as the new selected model. Native
runtime timing, installation/cache state and network behavior are not proved.
Fixtures mock the resolver and generation, covering failed admission, system model,
captured path/model, duplicate starts, aborted persistence and a different resident
preset; all are unexecuted. No tests, checks or native/cache/network actions were run.

## Translation publication belongs to the exact focused draft operation

Accepted commit `4fc32b6ffa9ecbd84a3cbbe12992cbdff9d2d9d1` changes the
Translate screen/service and two fixture sources. Canonical text/language-pair
revision and an exact operation object synchronously admit one pending translation.
The settled operation retains result identity for a valid swap. Editing, language
changes, clear, Back, blur and unmount retire ownership; functional state updaters
recheck it before tokens, success or errors publish. Swap without a current result
preserves typed source text, and manual intent prevents late route prefill from
replacing it. Refocus resets result state without discarding the retained source.

`translateService` accepts an optional signal, checking before/after the native
pair probe and translation, before Local fallback, around token delivery and before
return. It forwards the signal to Local generation and rejects an aborted result
rather than presenting partial output as success. A native call already dispatched
cannot be cancelled through the existing bridge signature. Account requirements,
default-model selection and native translation policy are unchanged.

Separate unchanged source constraint: Android `AGITranslateModule.isPairDownloaded`
calls `downloadModelIfNeeded(DownloadConditions.Builder().build())` despite its
passive/no-network comment. The Android plugin copies native files only when absent,
so source changes alone would not establish an updated generated app. This trace
establishes neither actual network traffic, SDK-cache contents nor a privacy effect;
readiness/download policy requires its own verified design, not a claim this lifecycle
patch fixed it. Mocked fixtures cover duplicate admission, revision changes, swap,
retirement, prefill and native/fallback cancellation boundaries; all are unexecuted.
No tests, checks, native, network or storage actions were performed.

## Translation fallback admits the exact default Local model

Accepted commit `6c42b21aa2f96dd9adc68fd350b3fd7dea6d71c3` changes
`translateService.ts` and two fixture sources. After native translation is absent
or fails, the service resolves the existing catalog default through
`resolveLocalModelRef` before generation. Missing installation refuses generation;
admitted model ID and optional installation path are passed to `localGenerate`.
The shared selector accepts model IDs as well as paths, so the prior defect was
missing installation admission/path resolution, not treating every ID as a file.
Neither auto-selection nor a different default is introduced. Native success
returns before Local admission, without a new account requirement.

Cancellation is rechecked after admission success and failure. An aborted signal
therefore returns `AbortError` without starting generation, while an ordinary
admission error remains intact. Admission trusts the existing install records;
this does not establish that SDK-managed files still exist, reserve model/runtime
ownership, or cancel an already-dispatched native translation. The native pair
readiness/download constraint in the preceding slice remains unchanged.

Mocked fixtures cover native bypass, refused admission, exact ID/path forwarding,
and both successful and failed admission after cancellation. The screen fixture
isolates the newly imported resolver. Independent source review accepted the
bounded change; no tests, checks, builds, native, network or storage actions were
performed for this slice. Regression sources remain unexecuted.

## Web image Stop owns the pending authentication interval

Accepted commit `cfdaab6bd41ebd7414376b092055e66ebe74fea8` changes
`useMediaGeneration.ts` and its fixture source. Both mounted new-image and
regeneration callers expose a streaming image card before invoking the hook.
The hook now registers its exact cancellable operation before awaiting the
browser authentication token. A matching Stop marks it cancelled immediately;
authentication success cannot then dispatch generation, and either authentication
success or failure settles with the existing cancellation error. Ordinary auth
failure remains an ordinary failure, with the local job and registration cleaned.

An explicit dispatch flag separates this local-only interval from an image POST
that has started. Only the latter sends the existing durable cancellation request
with its idempotency key. The post-authentication network deadline is unchanged,
and its timer is absent during pending authentication. Cancellation does not abort
token acquisition itself; local settlement still awaits that acquisition. Scope
matching and repeated-Stop behavior are retained.

Already-dispatched provider work, successful late response handling, server paid
attempt delivery and quota settlement are unchanged. This slice does not add an
account/workspace epoch, redesign cancellation retries, or cover the earlier prompt
persistence interval before the generation hook starts. Mocked fixtures cover
deferred auth success/failure after Stop, ordinary auth rejection cleanup, wrong
scope/repeated Stop and dispatched cancellation identity. Existing success and
deadline fixture sources remain; mounted-flow and concurrent-active-scope behavior
were source-traced, not exercised. Independent source review accepted the bounded
change. No tests, checks, builds, browser, authentication or network actions were
run for this slice; all regression sources remain unexecuted.

## Mobile shared links retain focused account and operation ownership

Accepted commit `529308ae05211d4c35d7224184eb617445efe97a` changes the
Shared Links screen/service and three fixture sources. A focused screen lifetime
captures the canonical Cloud account epoch. Account/auth or Local-mode transitions,
blur and unmount retire the owner synchronously, abort owned requests and invalidate
saved callbacks. Ready rows are owner-tagged; each read has its own identity, so
an older success, error or finally cannot replace a newer list or refresh spinner.
The original epoch is passed to the existing API boundary for list/revoke calls.

A revoke confirmation retains its original account and immutable token. Consuming
the intent and claiming a mutation are synchronous, excluding duplicate callbacks.
Ordinary same-owner refresh does not cancel that intent or retarget its token;
missing-token 404 remains idempotent only for the original current account. A
current success removes the confirmed row without another read. An ambiguous
failure hides actionable rows and asks for refresh rather than claiming the link
is still active. Retired receipts cannot publish rows, alerts or spinner state.
Native sharing requires a current non-expired row before opening the system sheet;
a sheet already opened cannot be recalled by this screen.

This is account/focus/mode ownership, not exact SDK-session or workspace pinning,
server rollback, or proof of cross-account deletion. The existing API already
rejects ordinary account-generation changes; the new screen lifetime also covers
saved confirmations, ready data and Local/focus boundaries. Shared-link creation is
unchanged. Independent source review accepted deliberate confirmation survival
across same-owner refresh. Authored fixtures cover deferred reads, stale callbacks,
account/mode round trips, focus/unmount, duplicate revoke and uncertain responses.
No tests, checks, builds, native sharing, deletion or network actions were run;
all regression sources remain unexecuted.

## Web media retains its original session through persistence and recovery

Accepted commit `063d69a1181b04f28f7524d4c79efd7200b958fa` changes the
media hook/service, chat-page orchestration, image persistence helper/recovery store
and four fixture sources. The page captures canonical session authority before
conversation creation or prompt/placeholder saves; it carries that owner through
image/video dispatch, result/failure persistence, status polling, progress and
recovery. Authority-bearing token getters use the existing queued-save boundary,
including CSRF waits. Direct media service calls require authority rather than
reading a replacement global session. Same-origin dispatch omits ambient cookies
and receipt/body checks suppress retired results, failures and notifications.

Image cancellation retains the originating authority across retries. Registration
still precedes token acquisition and the deadline begins at dispatch. Stop before
dispatch refuses the request; an already-dispatched successful same-session paid
image body preserves prior delivery semantics. Navigation/remount in the same
session does not itself retire accepted work. Known image recovery authorities
remain in the existing non-persisted store and cannot be rebound. Legacy unbound
recovery admits at explicit retry; restored video tasks admit at first observation,
without claiming historical provenance. Video observation is marked consumed only
after admission so initial auth loading does not consume its automatic window.

This is session fencing, not workspace pinning, remote cancellation, rollback,
or durable provenance after losing in-memory ownership. Existing server owner
checks and paid-attempt delivery/settlement are unchanged; the source trace does
not demonstrate arbitrary cross-account database access or provider spending.
Canonical unobserved SDK ABA limits and component-local revision error handling
remain. A separate existing media-store cleanup gap was identified: auth cleanup
names the store but no recognized reset method exists, so old generating jobs can
remain pending. Fixing that lifecycle must not restore stale result publication.

Independent source review accepted the bounded change. Authored deferred fixtures
cover credential/body waits, same-account session/account changes, queued prompt
and placeholder saves, polling sleep, cancel retries, recovery remount and paid
late-body delivery. No tests, checks, builds, browser, authentication, provider or
network actions were performed; regression sources remain unexecuted.

## Existing cache cleanup now clears tab-local media jobs

Accepted commit `16cc3b65a49c64ddcc5313e1410813a987d32f4a` adds the missing
`reset()` contract to `shared/stores/media-store.ts` and changes two fixture
sources to use the real store. The existing authentication cleanup already lists
media in account and workspace cleanup and recognizes this method. Explicit
logout and successful account/workspace cache changes now clear prompts, results,
errors and all job statuses. Map-only `updateJob` cannot recreate a removed ID or
modify a different newly admitted job. First or unchanged cache-scope observation
and ordinary same-session navigation do not reset the store.

This does not cancel remote provider work or change transcript persistence. It
also does not add exact-session cleanup: a same-account SDK-session replacement
can retire request authority without changing cache scope, and cookie-absence
resync clears auth state without running cleanup. Retired generating rows can
therefore survive those paths even after settlement because stale result writes
remain refused. That separate source-backed lifecycle gap is recorded as
`WEB-MEDIA-SESSION-CLEANUP-01`, without weakening authority guards.

Independent source review accepted the three-file patch. Real-store fixture
sources cover all statuses/private fields, late-update non-resurrection, new-row
preservation, account/workspace reset and first/unchanged scope retention. No
tests, checks, builds, sign-out, browser or network actions were performed; all
regression sources remain unexecuted.

## Media registry retirement follows the captured session owner

Accepted commit `d37734df30a95f22e6672596401e5f3c4a10ccc6` changes four
production files, two new fixture sources and four fixture migrations. Each
non-persisted media job requires its original `SessionAuthority`; already-retired
admission is refused. Atomic pruning filters only retired owners and returns the
same state when nothing changes. The media hook prunes on identity-render layout,
before authority admission and after image/video/observation settlement. The page
pending predicate ignores retired owners immediately. Existing stale result writes
remain refused, and a late map-only update cannot resurrect a removed job ID.

This owner is the session, not a navigation/request predicate. Same-session
unmount/remount retains work, and a current-session video observation deadline or
network failure remains pending for later observation. The existing no-cookie
auth-resync branch also resets media synchronously beside its auth-null update,
without an asynchronous broad cleanup or a claim that missing cookies invalidate
otherwise-current SDK bearer authority. Early-returned resync calls do not enter
that cleanup. Provider work, remote cancellation and paid result delivery are
unchanged.

The source correction requalifies `WEB-MEDIA-SESSION-CLEANUP-01`. A snapshot from
an unmounted hook still cannot observe an entirely replaced Clerk object on a
later mount; mutation of the same SDK session resource is observed. No continuous
observer is added while the page is unmounted: settlement/remount supplies the
next observation. These limits and runtime acceptance remain open rather than
being represented as comprehensive identity cleanup.

Independent source review accepted the bounded patch. Actual-store fixture
sources cover identical-ID session resource replacement, deferred token/body and
video start/poll waits, failed admission, replacement-row preservation, repeated
no-op pruning, same-session remount and no-cookie registry reset. No tests, checks,
builds, browser, auth, provider or network actions were performed; all regression
sources remain unexecuted.

## Mobile archive and restore retain original account intent

Accepted commit `96aca795929d56ac36485dfc4dc9144d8665d7c4` changes the
archived-chat service, conversation-action hook and Archived Chats screen plus
three fixture sources. Archive/restore require the captured Cloud account epoch,
assert it before and after the request, and pass it to the canonical API boundary.
Saved toast Undo checks its original owner before dispatch and consumes its intent
synchronously once. Account round trips cannot rebind it. Retired archive/Undo
receipts and errors cannot restore rows or show failure alerts for a replacement
account. Settings Restore also takes the rendered row's account instead of
capturing whichever account exists when an old callback is invoked.

Restore and Undo failure copy describes an unconfirmed result and asks for refresh;
a lost response no longer claims that the chat remains archived. A dispatched
server mutation is not rolled back. Existing API generation guards remain, but
those alone could not reject a saved callback newly invoked after account change.
Server conversation PUT still filters by authenticated user and organization;
wrong-context client dispatch is the defect, not demonstrated cross-account writes.

This is original-account archive/restore admission and once-only toast intent,
not a full Archived Chats focus, pagination or concurrent-mutation redesign.
Delete/bulk entry ownership is a separate continuation. Independent source review
accepted the patch. Mocked fixtures cover saved Undo ABA, duplicate and failed Undo,
late receipts/errors, epoch propagation and a stale rendered Restore callback.
No tests, checks, builds, native UI, database mutation or network actions were run;
all regression sources remain unexecuted.

## Archived deletion confirmations retain their rendered account

Accepted commit `db823e82d30f70d43871d77af7f00ef9b6a26ae4` changes the
Archived Chats screen/service and three fixture sources. Row and bulk delete
entry receive the rendered list's account epoch, carry it through saved native
confirmations, and pass it to the API boundary. Each confirmation is consumed
synchronously before dispatch; Cancel also retires it. Services require the epoch
and assert it before and after the request. Retired receipts, failures and row
finally cleanup cannot alter a replacement account's list, alerts or busy state.

The unrelated archive-all/delete-all helpers retain their existing signatures
and two-argument API calls. The shared bulk helper accepts optional ownership
only internally; archived deletion requires it. Server row deletion still matches
ID, authenticated user and organization, and bulk deletion filters the current
user/organization's archived rows. This is a client-intent correction, not a
server authorization-bypass claim: an old bulk button rebound to another account
could target that account's own archived rows. No live deletion was demonstrated.

General mutation sequencing, focus/mode lifetimes and page/read ordering remain
separate. Independent source review accepted the bounded change. Deferred fixture
sources cover saved buttons and confirmations, account ABA, Cancel and repeated
reuse, original-epoch forwarding, retired receipt/error publication and replacement
busy state. No tests, checks, builds, native UI, database mutation or network
actions were run; all regression sources remain unexecuted.

## Archived list reconciliation owns its focused session and read revision

Accepted commit `e6cba3f2f60c2c0dbb0b72fcd08e0736d7c254ce` changes the
Archived Chats screen/service and two fixture sources. Focused owners retire
synchronously on account, authentication and mode transitions, plus blur/unmount.
Each first-page read supersedes its predecessor; paging requires the exact ready
list and exclusive current read. Retired bodies, failures and finally cleanup
cannot replace current rows, offsets or loading indicators. Archived GET carries
its captured account epoch through the canonical API boundary.

Mutation admission takes a synchronous exclusive lease and retires pending reads.
After either acknowledged success or uncertain failure, the screen starts a new
owned first-page read instead of keeping a locally shortened list with its old
offset. Read failure leaves no stale paging cursor to reuse. This prevents this
screen's own deletion/restoration from skipping the next unseen row and prevents
an older page from repopulating removed rows. A saved delete confirmation retains
its original focused owner across ordinary refresh, but not account/mode/focus
retirement, and still consumes once. Optional abort signals preserve archive-menu
and Undo callers while stopping retired screen observers.

A confirmed restore is not mislabeled as failure when archived reconciliation
fails. The existing active-chat refresh helper catches transport failure and
resolves after setting `conversationLoadError`; its mocked rejection fixture does
not establish the screen's production fallback alert. That preexisting limitation
remains. Aborting a dispatched mutation does not establish server rollback, and
this offset-based protocol does not promise a stable snapshot under external
concurrent writers. Cursor migration remains separate.

Independent source review accepted the bounded patch. Deferred fixture sources
cover read/page ordering, stale finally cleanup, account and mode round trips,
blur/unmount, mutation exclusion, first-page offset reset, saved confirmations,
GET ownership/signals and confirmed restore versus reconciliation failure. No
tests, checks, builds, native UI, database mutation or network actions were run;
all regression sources remain unexecuted.

## All-chat bulk confirmations retain their rendered focused intent

Accepted commit `ce9ac3938326593d2cde6c43bdddf2ac95705051` changes Data
Controls, the archived-chat service and two fixture sources. Each rendered bulk
entry retains its focused account scope. Synchronous subscriptions retire scopes
on account, auth, mode and access changes; blur/unmount also retires them. One
exclusive intent spans both native confirmation stages and execution. Phase
changes consume saved buttons once, while Cancel/dismiss can retire only their
own still-pending stage. Old callbacks cannot recreate a second confirmation,
rebind to a replacement scope or clear a newer operation's busy state.

Archive-all and delete-all services now require their original account epoch and
forward optional abort signals. The API boundary already fences account generation
in flight; this closes admission from saved intent rather than establishing a
server authorization bypass. Existing server user/organization filters and the
separate Local-to-Cloud copy flow remain unchanged. Aborting a dispatched mutation
does not prove rollback.

Acknowledged mutation counts remain acknowledged when the active-chat list cannot
refresh. The screen reads the actual store's `conversationLoadError` after its
resolving helper, and separately handles rejection. The shared error field is not
a per-request result, so exact attribution under concurrent list reloads remains
a store-contract limitation. Unconfirmed mutation responses use uncertain-outcome
copy and ask the user to inspect Cloud history before starting another bulk action.

Independent source review accepted the bounded change. Deferred fixture sources
cover both actions, confirmation duplication and dismissal, rendered callback
replacement, focus/account/auth/mode/access round trips, stale receipt/finally,
real resolved refresh errors, original epoch and abort propagation. Both affected
screen mocks were migrated. No tests, checks, builds, native UI, database mutation
or network actions were run; regression sources remain unexecuted.

## Mobile analytics consent owns its ready choice and recorded receipt

Accepted commit `0eb6b9458cf633aad2084f0710883508fdf4b1a2` changes the
analytics settings group, adds its narrow response parser and two fixture sources,
and migrates two existing screen mocks. A focused owner captures the canonical
Cloud account epoch and checks loaded/signed-in Clerk identity and Cloud mode.
Account/auth/mode transitions and blur/unmount retire that owner synchronously.
A save must retain the exact current ready choice and claim one operation before
awaiting. Original epoch and abort signal reach GET and POST; response bodies,
errors, reconciliation and finally retain exact owner/operation checks.

The GET parser distinguishes a genuinely absent analytics record from malformed
or unavailable settings. It uses the actual purpose-object catalog and preserves
the canonical per-purpose grant-version reader. A POST receipt validates the
submitted top-level privacy-notice version separately from the analytics record's
purpose-specific notice version. The acknowledged boolean comes from the recorded
decision, including a server-adjusted denial, rather than the requested boolean.

Confirmed writes remain confirmed when readback fails, with the actual recorded
on/off value stated. Lost responses and invalid receipts remain unconfirmed and
trigger an owned read, never an automatic repeat POST. A notice-conflict response
requires a refreshed ready snapshot and a new choice. Failed reconciliation leaves
no actionable stale ready value; the explicit retry control only reads. Cancellation
does not establish rollback, and concurrent external changes remain possible.

This is analytics-only source correction, not an account-authorization bypass
claim or a generic settings framework. Provider-training and US-only control
ownership remain separately recorded as `MOBILE-CLOUD-PRIVACY-CONTROL-OWNERSHIP-01`.
The routing endpoint's successful empty response on a failed database read remains
`WEB-ROUTING-PREFERENCES-READ-01`. Device-scoped named-provider consent is unchanged.

Independent source review accepted the bounded patch. Deferred fixture sources
cover context round trips, duplicate callbacks, delayed bodies/receipts, unmount,
malformed responses, adjusted denial/readback failure, uncertainty, notice renewal
and read retry. No tests, checks, builds, native UI, consent changes or network
actions were run; all regression sources remain unexecuted.

## Routing settings distinguish failed reads from authoritative absence

Accepted commit `edc93db942746867596e986f348451345ca9b991` removes the
routing-preference endpoint's successful empty fallback after a database read
failure. The existing error wrapper now reports an ordinary rejected read as a
sanitized non-success response. A successful missing row, null preference or empty
object still means no stored preference; field-wise filtering still preserves valid
supported fields when another stored field is invalid.

Both production HTTP consumers reject a non-success response before admitting a
replacement snapshot. Their initial controls stay disabled rather than offering a
save based on unavailable preferences. PUT remains a complete validated replacement,
including explicit empty-object clearing. Its authenticated user scope, rate limit,
CSRF and absent-profile failure are unchanged. The independent inference routing
resolver's fail-open policy is outside this settings-editor correction.

Independent source review accepted the correction. Existing route fixture sources
now distinguish successful absence from failed reads, retain both supported fields,
pin replacement semantics and assert no privileged database fallback. Concurrent
full-object edits and older-client field stripping remain separate limitations.
No tests, checks, builds, database or network actions were run.

## Mobile provider location choices own their ready account and tier lifetime

Accepted commit `7cdf47f29c8dc63630fe708de9047c4e8277d5b5` changes the
US-only privacy group and adds an unexecuted ownership fixture source. Each focused
owner captures the Cloud account epoch and effective tier. Exact owner checks include
loaded signed-in identity, Cloud mode and current tier; subscriptions retire account,
auth, mode and tier transitions synchronously, including round trips. Blur/unmount
also retire the owner and abort its observer.

Save admission requires the original ready object, current eligible tier and an
exclusive synchronous operation. GET and PUT carry the original account epoch and
abort signal. Strict schema parsing accepts authoritative absence but no longer
turns malformed successful responses into an empty replacement snapshot. A save
retains supported fields such as geo_overlay while changing us_only. Old callbacks,
results and cleanup cannot act for a replacement owner or release its operation.

Acknowledgment requires a valid returned boolean, and reports that returned value
rather than assuming the requested one. An unavailable or invalid write response
is uncertain, not a proven rollback. Both outcomes reconcile through a fresh owned
read without automatically repeating PUT. A failed readback keeps the control
disabled, preserves any acknowledged boolean with explicit copy, and offers a
read-only retry. Abort does not prove server rollback. Cached tier freshness,
concurrent replacement writes and older-client field stripping are unchanged.

Independent source review accepted the bounded lifecycle. Fixture sources cover
duplicate and retained callbacks, account/identity/auth/mode/focus/tier round trips,
pending read/write retirement, malformed reads, retained geo fields, adjusted
receipts, lost responses, read retry and unmount. The canonical HTTP client is
mocked and native focus is simulated. No tests, checks, builds, native UI, settings
mutations or network actions were run; all fixture sources remain unexecuted.

## Reconstruction boundary

Only the one hundred and thirty-six accepted production slices traced above are represented as
reconstructed here. Other remembered changes from the unavailable branch require
fresh reconstruction or recoverable Git evidence before they can be represented
as current implementation. Authored regression sources are not runtime acceptance.

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

## Reconstruction boundary

Only the nine accepted production slices traced above are represented as
reconstructed here. Other remembered changes from the unavailable branch require
fresh reconstruction or recoverable Git evidence before they can be represented
as current implementation. Authored regression sources are not runtime acceptance.

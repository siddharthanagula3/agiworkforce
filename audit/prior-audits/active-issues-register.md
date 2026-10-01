# Active issues and execution plan

Status: Current
Owner: Founder + platform lead
Last updated: 2026-09-27

The register of unresolved defects, risks and required corrections, with the
execution plan to clear them, as it stood when it was the root active-issues file.
It moved here on 2026-09-27 and is waiting to be split: P0 and P1 rows into
`audit/blockers/`, live-validation rows into `audit/live-check/`, and founder
items into `audit/decisions/`. `audit/plan/waves.md` is the entry point now.

## MOBILE-IOS-APP-STORE-2026-09-26

The earlier iOS 1.2.0 Release configuration built and launched in Simulator. A clean
production-configured unsigned Release Simulator build also succeeded and its
app bundle contains `AGIShareExtension.appex`. Isolated
iPhone 17 Pro Max and iPad Pro 13 first-run flows pass the ten-step Detox
onboarding spec. Opaque welcome screenshots at Apple-listed dimensions are
saved under `apps/mobile/store-listing/screenshots/captures/ios/` (generated
files ignored by Git). The release listing draft, privacy declarations,
environment check, integrity check, TLS pins, Expo dependencies, lint,
typecheck, and the full mobile test suite pass. The public Apple and Google
store lookups previously reported no live listing; the 2026-09-26 rerun could
not reach the stores and failed closed.
After the 2026-09-27 Cloud auth, account-isolation, Free-route, and stale local
invite cleanup, the full Mobile package test command passed 56 release Node
tests, four IPA verifier unit tests, 455 Jest suites, 4,292 Jest cases, and 30
snapshots. Its first run found four outdated test expectations: pairing and
approval-settings tests expected raw server errors, the voice test omitted its
permission-retry flag, and the onboarding test's mocked disclosure acceptance
never persisted the record required for provider consent. The four corrected
suites passed, then the complete command passed. Mobile typecheck and targeted
lint pass. These are local checks, not signed-device behavior. The unused invite
modal and its hardcoded local alpha code no longer
ship; upgrade access codes continue through the server-verified billing path.
The shared Cloud connector API now checks organization policy on the remaining
catalog and directory connection route before discovery or credential work.
When a workspace policy cannot be read, connection attempts fail and connector
tools are withheld from the offered catalog; personal accounts and workspaces
with no policy row retain their normal access. Focused Web route, policy, and
catalog suites pass 120 tests. Production deployment and a governed-account
connector run remain unverified.
Captured workspace connector calls now use the canonical active-membership
check. A revoked membership or unavailable membership table cannot turn a
governed workspace request into a personal connector request; the 33-case
focused connector-tool suite passes.
The full Mobile lint command and its 20-case trust-boundary suite also pass.
Those checks do not establish signed-device Cloud or store behavior.
The iOS privacy-manifest guard now parses the reviewed plist and compares every
declaration and flag against generated Expo configuration in both directions;
the current values match. This closes the copy-drift defect, while live App
Store privacy answers and the signed submission build still need verification.
The iOS and Android release-note drafts now identify the 0.0.1 release and
distinguish open Free Cloud access from the access-code gate on paid upgrades.
Their metadata lengths and JSON validate locally; the live store-listing probe
could not reach either store from this shell, so publication status is unknown.
The production-configured release-integrity check passes with the checked-in
mobile environment file; it now compares the binary version, release-note keys,
and listed character counts with both store drafts. Its 13 focused tests pass.
This does not establish a signed or uploaded build.
The Mobile Desktop pairing screen now keeps manual entry available when camera
permission is denied, allows a full pairing link to be pasted, disables an empty
Connect action, and offers an exit from the denied-camera screen. The focused
pairing UI and payload suites pass 13 cases; Mobile typecheck, targeted lint,
formatting, and diff checks pass. Camera-denied and clipboard behavior still
need a signed-device smoke test.
The primary Mobile drawer already exposed Remote; Settings now also opens the
same companion screen and displays the live pairing state. First-run and
pairing-failure copy now follows the actual short-lived-code authorization
instead of implying that phone and Desktop accounts must match. Six Settings
suites passed 48 tests and three companion/drawer suites passed 24 tests;
Mobile typecheck, targeted lint, and formatting pass. The Settings and pairing
journeys still need signed-device navigation checks. The repository-wide
`check:mock-exports` guard initially found two added Web test mocks beyond
Web's whole-module ceiling. Both now preserve the original connector-policy
exports while overriding the required function. Their two focused suites pass
56 tests; the guard's own 20 tests and full 3,751-file scan pass. This restores
the release gate without raising its ceiling.

The production iOS preflight previously passed with EAS authentication; the
2026-09-26 rerun stopped because this shell is not logged in to EAS. A production EAS
build attempt on 2026-09-26 stopped before upload because EAS has no iOS
distribution certificate or provisioning profile. That attempt created the
production update channel and branch and advanced EAS's remote iOS build number
to 3. The local EAS CLI was updated from 20.4.0 to 24.8.0 after its Apple
login failed with the known `iTunes service key is empty` error. Fresh Apple
SMS verification codes were still rejected by EAS after the account holder
accepted the updated Apple Developer agreement in the browser.
The submission preflight also requires a numeric App Store Connect `ascAppId`
in `apps/mobile/eas.json`; that value is still absent and cannot be inferred
from the bundle identifier. Read it from the app record before an EAS submit.

Xcode automatic signing produced a Release device archive and exported an
App Store signed IPA for iOS 1.2.0 build 2 on 2026-09-26. The main app and
share extension contain distribution provisioning profiles and an Apple
Distribution certificate for team `D2PR62RLT4`. Xcode's upload validation
stopped with `Failed to find an account with App Store Connect access for team
D2PR62RLT4`. The account holder confirmed that the AGI Workforce app record
is visible and the Free Apps agreement is Active in the browser, so the Xcode
failure is specific to Xcode's sign-in state. Apple ingestion, processing,
and TestFlight installation remain unverified. The local machine also lacks
the WWDR G3 intermediate needed for `codesign --verify --strict` to establish
the certificate chain.

App Store Connect now has draft version 0.0.1 metadata, AGI Workforce as the
accepted name (Apple rejected `AGI` as already in use), Productivity and
Utilities categories, a 13+ age override, free pricing, 173 available
regions, and seven configured privacy data types. The privacy disclosure is
saved but not published. Release remains blocked on build upload and Apple
processing, iPhone/iPad screenshots, a provisioned Cloud review account
supplied securely in App Store Connect, and live Cloud sign-in testing.
The App Review contact and review notes are saved, but the secure review-account
fields are empty. The Content Rights declaration is unanswered. EU Digital
Services Act trader verification requires publicly displaying the account's
business address plus a contact phone and email; that contact has not been
submitted. The founder confirmed on 2026-09-26 that the `@agiworkforce.com`
mailboxes named in the listing draft, App Review notes, support links, and
content-report mailto flow have not been purchased yet. Those addresses must
not be treated as reachable until provisioned and tested. One monitored mailbox
can receive `contact@`, `support@`, and `review@` through aliases; a separate
founder mailbox is optional. Buy or substitute a working review and support
channel before submission. The Paid Apps agreement
is pending bank/tax information, while the Free Apps agreement is Active. App
Accessibility is optional and has not been
claimed without feature-level validation.
The app and AGI-owned workspace package versions were reset to 0.0.1 on
2026-09-26. The existing signed IPA remains version 1.2.0 build 2; it cannot
serve as a 0.0.1 submission build. A current-source iOS device archive for
0.0.1 build 2 succeeded locally; both the main app and share extension report
that version and build. The archive has not been exported or uploaded. Local
App Store IPA export fails with `No signing certificate "iOS Distribution" found`.
Xcode automatic provisioning also reports `No Accounts`, and the local keychain
has no valid Apple Distribution identity. Restore an App Store Connect-capable
Xcode account and distribution signing, then export and verify the 0.0.1 IPA.
EAS's remote iOS build counter was last recorded at 3.
The local IPA submission path now reads the archive's app and share-extension
Info.plist files and rejects a version, bundle identifier, or extension build
mismatch before upload; the archived 1.2.0 IPA cannot pass that check for 0.0.1.
The 2026-09-26 production iOS and Android Hermes exports now pass the release
bundle scanner. It inspects Hermes' actual string entries, accepts only exact
reviewed dependency documentation and generated legal bodies, and checks the
two React Native/Expo Router development fallback strings against their owner
source. It also scans mobile source for a reachable development endpoint. The
shared client runtime's localhost fallback was removed, the Expo Router plugin
has a configured HTTPS production origin, and a Clerk development publishable
key found in the first export was removed from the app module and absent from
the refreshed exports. These are static export checks; distribution signing,
an exported 0.0.1 IPA, and device network-path validation remain outstanding.
Mobile Account now reads the server's pending-deletion state, offers cancellation
inside the grace window, and avoids a second delete request while deletion is
pending. Its confirmation copy explains that cancellation remains possible before
erasure begins. Focused owner-switch and cancellation tests pass; a signed-in
device test of the scheduled deletion and cancellation endpoints remains open.
Web and Mobile now parse the pending-deletion response through the same Cloud
contract. Both disable a new deletion request when status is malformed instead
of treating an invalid response as no pending deletion. Focused shared, Web,
and Mobile tests pass; this does not replace the signed-in device test.
Mobile Compare now aborts both Cloud streams and clears their results when the
selected model, Cloud/Local mode, or account changes. Late callbacks cannot
place an old model's answer under a new model label or carry Cloud output into
Local Mode. Its initial models and send path now follow the current tier's
shared Cloud catalog: Free, which currently has one comparison-eligible model,
sees an explanation and Chat path instead of two inaccessible paid defaults.
A tier change aborts old streams, and Pro/Max choose two eligible models.
Focused account, mode, and tier tests, Mobile typecheck, and targeted lint pass;
a signed-device comparison remains unverified.
Legacy Cloud message edit and retry now capture the initiating account epoch.
If an account changes while remote replacement is pending, they leave the new
account's messages untouched and do not resend the old prompt. Research resume
has the same post-delete guard; multi-message remote deletion checks the epoch
before each request, and message-delete failure cannot restore an old account's
rows into a new session. Focused account-switch tests pass. These paths still
need signed-device validation with a real Cloud account switch.
Cloud message ratings now serialize writes for the same account and message.
A failed current write restores the last confirmed rating and shows a retry
message; an older failure cannot overwrite a newer rating or put an old-account
rating into a successor account. The message bubble follows the restored rating
after a failed write. Focused reaction and account-switch tests pass; a signed
device should verify the visible recovery against a real Cloud request failure.
The open-source attribution inventory was regenerated from the installed
production dependency graph on 2026-09-26: 542 packages and 70 unique license
bodies. The founder prefers AGI Workforce branding without third-party license
files in the repository. Shipped third-party code still requires accurate
distribution notices; replacing dependencies with original implementations is
a separate, validated architecture change, not an attribution removal.
An unused `expo-contacts` direct dependency and its iOS source-build override
were removed after a source and config search found no contact API use.
Mobile previously admitted every economy model to Free even when the shared
subscription contract admitted only selected models. The picker and direct
dispatch now use the shared contract; a signed-in live website comparison is
still needed to verify current Free, billing and tool behavior end to end.
The website also exposes quota-attested promotional Qwen offerings through
`/api/models/free-quota` and a separate completion route. Mobile now loads that
account-scoped catalogue in its Cloud model picker and sends selected ready
promotional chat offerings through the Free completion route with durable
message handling. The provider-funded automatic OpenRouter offering remains in
the shared Free contract.
The Mobile streaming boundary now rejects any generated provider-funded
offering on the billed chat route and rejects a billed model on the Free quota
route. This makes an incorrectly shaped call fail before network egress rather
than risk paid inference. Focused provider routing, timeout, and Cloud send
suites pass 34 cases; Mobile typecheck, targeted lint, and formatting pass.
The shared Mobile stream now checks cancellation after token retrieval and
requires a token before any Cloud request. A token resolved after account
teardown cannot carry an old Free prompt into the new account's request; an
ownerless stream stops locally. The provider-route, stream-timeout, and
React Native response-fallback suites pass 27 cases. The fallback test now
uses an actual generated Free offering for its Free-route probe. Mobile
typecheck, targeted lint, and formatting pass. Signed-device token timing is
still unverified.
The Models settings screen now refreshes that account-scoped catalogue on
Cloud entry and picker reopen, and subscribes to catalogue changes so its
favorite and recent rows update when provider-funded offerings load. A focused
screen test, Mobile typecheck, targeted lint and formatting pass. Live signed-in
device selection remains unverified.
The Mobile Usage screen now always reads its authenticated usage API; an
unreachable "coming soon" panel and its web link were removed on 2026-09-27.
The project detail route now identifies a project from the Local and Cloud
stores instead of a permanently disabled legacy project-fetch flag. Opening a
Local project while in Cloud mode, or a Cloud project while in Local mode,
requires an explicit mode switch before showing chats or sources. An unknown
project no longer offers a New chat action and provides a route back to
Projects. Focused route tests cover both switches, correct active-project
store selection, and the unavailable path. Device navigation and cross-device
project recovery remain unverified. The 2026-09-27 Mobile run after this route
change passed 446 Jest suites, 4,135 tests, 30 snapshots, 56 release Node tests,
and four IPA verifier tests; Mobile typecheck, lint, formatting and hygiene pass.
Mobile Cloud search previously allowed an in-flight server response to refill
results after an account, mode, or query change. Search now clears old rows at
the start of each query, discards stale responses using the active account
epoch and request generation, and searches only the Cloud conversation cache
if its server request fails. A signed-out Cloud search cannot read that cache.
Focused tests cover these boundaries; a signed-device account-switch search
pass remains open. The full Mobile Jest run passed 446 suites, 4,138 tests,
and 30 snapshots after the search fix; typecheck and lint passed. A server-only
project returned by global search can open before periodic project sync. The
detail route now fetches that project through the authorized Cloud endpoint,
checks the current account and sync version, and adds it to the Cloud project
store without overwriting pending local changes. The endpoint now returns its
authoritative sync version. Focused route, service, contract, sync, and API
tests cover this path; signed-device navigation and account switching remain
unverified. The 2026-09-27 full Mobile Jest run after this change passed 447
suites, 4,144 tests and 30 snapshots; Mobile typecheck, lint, formatting and
hygiene, shared contract and sync typechecks, focused Vitest suites, and the
focused Web project API test passed.
An older project pull can finish after the direct project fetch and would
replace its newer name or delete it. Mobile now compares server versions before
applying pulled project records or tombstones, and does not lower a dirty
project's push base version. Focused project sync and account-recovery tests
passed 27 cases; related sync, delete, and active-project suites passed 56
cases. Mobile typecheck, lint, formatting and hygiene passed after this guard.
The direct fetch also tracks its in-flight project ID: a pulled tombstone,
acknowledged local delete, or account clear invalidates the pending fetch
before it can restore an older project. Focused tests cover server and local
delete races; signed-device account and project navigation remain unverified.
The iOS and Android reviewer notes were updated for the current signup legal
links and billing purchase-help link. The 2026-09-27 full Mobile run passed 446
Jest suites, 4,133 tests, 30 snapshots, 56 release Node tests and four IPA
verifier tests; Mobile typecheck, lint, formatting and hygiene also pass. The
external-link inventory still needs a signed-build App Review policy check
before submission. A submission-config test now reads production Mobile source
and fails if a file that opens an external website is absent from either
platform's reviewer notes; it does not validate live link availability.
The promotional path is code-tested but has not passed a live signed-in Qwen
mobile turn, and account-bound quota hard-stop settings remain unverified.
The provider-funded Mobile stream now switches from its initial response timeout
to an activity-based stall timeout once Qwen starts sending data, matching the
ordinary Managed Cloud stream. A long healthy reply no longer times out at the
initial limit, while missing responses and stalled streams surface a timeout
error. Focused stream tests, Mobile typecheck, targeted lint and formatting pass;
this does not substitute for the outstanding signed-in device and provider-quota
checks.
Mobile previously advertised image-capable promotional Qwen chat offerings in
the picker but rejected every attachment before upload. The Free send path now
accepts images only when the selected provider offering declares image input,
requires a Cloud asset ID, and sends the latest user image as a file reference
to the same Free completion endpoint used by Web. Non-image files still fail
before provider egress. A focused Mobile test verifies upload consent, the
image request and document refusal with mocked network calls; a signed-in
device upload and live Qwen image response remain
unverified.
Mobile attachment completion now obtains a current session token after the
storage upload. If that completion receives 401, it refreshes once and retries
only the completion request; a terminal 401 clears Cloud account state and
asks for sign-in. A presign request that still returns 401 after refresh now
ends the session as well. The focused API and upload lifecycle suites pass 45
cases, including refresh success and failure without a second storage upload;
Mobile typecheck, targeted lint, and formatting pass. A signed-in device upload
remains unverified. The shared Mobile API client now also ends the Cloud session
when its one refreshed retry still returns 401. The focused auth, API, and upload
lifecycle suites pass 62 cases; the actual signed-in Cloud recovery remains to
be exercised on device.
Cloud file-upload retries now retain the account epoch from the first attempt.
An account switch during retry backoff stops the old file before another upload
can start, account teardown cancels and clears upload progress, and the composer
does not install a completed asset into a different account's draft. A rejected
manual Retry is recorded as a failed upload instead of escaping as an unhandled
promise. Focused upload, teardown, and composer suites pass 72 cases and two
snapshots; Mobile typecheck, targeted lint, formatting, and diff checks pass.
The account-switch upload path still needs a signed-device check.
Earlier image attachments no longer strand a Mobile Free conversation on a
follow-up turn. Mobile and Web now use one shared history normalizer that keeps
the earlier text and notes that the attachment is unavailable to the model;
the latest image remains eligible for the server's image-capable route. Focused
Mobile and Web tests plus both app typechecks and the shared contract typecheck
pass. Follow-up questions that require seeing the earlier image again still
need the user to reattach it under the current server attachment policy.
Mobile now distinguishes an empty provider-funded catalogue from sign-in,
plan, Cloud route, and connection failures in the model picker and offers a
retry; it does not silently present those failures as an empty Free list.
The Mobile send path refreshes its account-bound Free catalogue before every
promotional turn. Concurrent picker and send checks for the same account now
share one in-flight request, so a picker refresh cannot invalidate the send's
availability check. A change of account or session still invalidates the old
response. The completion endpoint independently checks the current plan,
provider decision, and shared allowance for every turn. A missing or failed
catalogue check blocks selection and displays the catalogue error. The focused
catalogue suite passes ten cases, including concurrent picker/send and
account-switch cases.
The Free conversation preflight now checks its account epoch inside the 404
recovery branch before attempting to create a conversation, and again before
showing a create failure. A 404 response arriving after an account switch can no
longer create the old conversation under the new account. The focused Cloud send
suite passes 22 cases; Mobile typecheck, targeted lint, and formatting pass.
Signed-device account switching during Free conversation creation is still
unverified.
The Cloud send path also checks the account epoch before showing upload and
branch-write failures. A late failure from the prior account can no longer put
an old-account error into the new account's composer. The focused Cloud send
suite, Mobile typecheck, targeted lint, and formatting pass; signed-device
account-switch behavior remains open.
The Mobile Free-model list now renders a single current-account catalogue
snapshot throughout each picker render. An older snapshot cannot contribute
model keys while the global cache supplies newer labels, and an account switch
invalidates the old snapshot before its rows are built. The focused catalogue,
picker, and models-page suites pass 62 tests; the catalogue suite also exits
cleanly with Jest open-handle detection. The combined picker run passed its
assertions but retained an asynchronous handle, so it was stopped after
completion rather than counted as a clean process exit.
The Mobile chat model picker now explains when a successfully loaded catalogue
contains no ready provider-funded chat offer, including when every listed offer
is exhausted. Previously that state showed no offer and no explanation. The
47-case picker suite covers this state; live Qwen quota availability still needs
the current provider account check described below.
Cloud chat-history refresh now publishes its first page before the remaining
pages finish, and checks the captured account epoch plus request version before
applying every page. A late response from a previous account or superseded
refresh can no longer write old conversations into the current Cloud store or
show its failure in the current account. The Chats list now requests only the
first page on focus or refresh and loads older pages near the list end; a
visible Load older chats action remains available. Other callers retain full
history loading. Cloud account teardown also clears the pending pagination
cursor and cancels its request version. Focused shared-client, Chats-list,
chat-tab, and teardown tests pass;
signed-device scrolling and account-switch validation remain open.
After that change, the Mobile package checks completed all 56 release Node
tests, four IPA verifier tests, 448 Jest suites, 4,194 Jest tests, and 30
snapshots. The surrounding shell wrapper returned an error because it assigned
to zsh's read-only `status` variable after the package command completed; the
package log itself shows no failed checks. The standard Jest command still
uses `--forceExit`, so the broad run does not establish handle cleanup.
The 2026-09-27 full Mobile run initially exposed three Free-model stream
test failures: a mocked API omitted the HTTP error class and the cases only
seeded a cached catalogue, while production sends now recheck the server.
The catalogue imports its error class from the owning error module and those
tests now return a ready server catalogue for the preflight. The standard
Mobile package test command passed 448 Jest suites, 4,193 tests, 30 snapshots,
and 56 release Node tests. The package script uses Jest `--forceExit`; the
full run is functional evidence, not proof that all asynchronous handles close.
Provider-funded inference must remain conditional on the current
provider terms, privacy posture, and a hard stop before paid overage. NVIDIA's
Developer Program NIM endpoints are for prototyping and do not authorize
production end-user traffic; they are not a launch free pool. QwenCloud's
published free quota is time-limited, and its "Free quota only" hard stop is
disabled by default, so the founder's account quota cannot be treated as
permanent or automatically cost-safe capacity.
On 2026-09-27, the two local Qwen account verification records matched the
configured credential but were last checked on 2026-09-20. The executable
quota-probe policy accepts verification only within one hour, so neither record
authorizes a new provider-funded probe or proves the present account hard stop.
The production Mobile preflight stopped at missing EAS login. Its separate
TLS-pin check passed; the Expo dependency check passed against its local SDK
map while reporting that its online version check was unavailable.
The Free completion route also treated absent, zero, malformed, or unsafe
provider usage as zero-token consumption and refunded the entire reserved
allowance. It now preserves the reservation unless the provider reports valid,
nonzero safe-integer prompt and completion counts. Route regressions cover
those malformed usage shapes. A later malformed stream report also invalidates
an earlier valid report, while a lower valid report cannot reduce the recorded
count. The Free-route suite passed 49 tests on 2026-09-27; targeted lint passes.
This is accounting protection, not evidence that the current Qwen account has
a provider-enforced free-only hard stop.
The Qwen promotional catalogue previously treated a fresh account quota
attestation as sufficient to mark an offering ready, without checking whether
commercial use, serving third-party users, proxying, and the provider's data
terms had been reviewed for that offering. It now also requires a current,
favorable, per-offering `inventory.termsReview` record. The shipped record is
null, so promotional Qwen offerings remain unavailable until their terms and
model-specific licenses are reviewed and the approved keys are recorded.
The official Model Studio free-quota instructions describe the account switch
and allocation but do not alone grant all four uses; Alibaba's product terms
also restrict resale of Model Studio or models, and the boundary between an
application's end-user feature and resale needs a documented review. This is
a launch blocker for provider-funded Qwen, not proof that its API free quota
cannot be used commercially.
The 2026-09-27 primary-source recheck confirms that Alibaba's
[free-quota rules](https://www.alibabacloud.com/help/en/model-studio/new-free-quota)
describe a 90-day allocation, Singapore-only eligibility, automatic
pay-as-you-go billing after exhaustion unless Free Quota Only is enabled, and
an account-wide shared pool. The current
[Model Studio product terms](https://www.alibabacloud.com/help/en/legal/latest/alibaba-cloud-international-website-product-terms-of-service-v-3-8-0)
prohibit reselling Model Studio or its models without express authorization;
they discuss end users but do not explicitly resolve whether AGI's bundled
free inference is an allowed end-user feature. Keep the per-offering terms
review null until the commercial, third-party-serving, and proxying rights are
confirmed for AGI's use case. Do not infer permission from quota availability.
The Mobile Cloud SSE reader now surfaces response-handler exceptions as turn
errors and applies the final event when the stream ends without a newline;
focused tests cover both the ordinary and provider-funded stream paths.
It now also requires the server's terminal `[DONE]` marker before completing a
turn. A closed connection without that marker preserves any received text but
reports an incomplete response, including on the buffered React Native path.
The full Mobile test command passed 56 release Node tests, four IPA verifier
tests, 447 Jest suites, 4,197 cases, and 30 snapshots after this change;
Mobile typecheck, targeted lint, formatting, and diff checks pass.
Focused Mobile tests on 2026-09-26 covered both selected Qwen Cloud chat
models: each appears ready in the Max picker,
resolves to chat dispatch, and sends its model key through the authenticated
Managed Cloud completion endpoint with a distinct idempotency key. Both are
locked on the Free plan. A Qwen server failure reaches the app's error callback
without bypassing the managed route. A Qwen promotional offering cannot be
selected on Mobile Free and is rejected by its ordinary dispatch route. These
are mocked-network Mobile contract tests, not live Mobile inference or quota
tests. On 2026-09-27, a single direct local-key probe of the catalogued Qwen
promotional offering succeeded with nonempty text and reported usage. This
confirms live inference from that local credential; it does not prove the
request consumed provider-funded quota or exercise the authenticated Mobile
route. A current-source signed Release Simulator app launches, but it has no
authenticated Qwen session; the Mobile promotional flow and live device
inference remain unverified.
The Web free-quota catalogue and Qwen completion route's focused tests also
pass (48 cases), including quota and billing-failure behavior. This verifies
the backend contract in mocks; it does not supply Mobile selection, a current
account attestation or a live Mobile provider response.
On 2026-09-26, the Free quota catalogue shape and endpoint paths moved to the
shared Cloud contract consumed by Web, so Mobile can use the same typed wire
contract for its promotional flow. The current Mobile full suite passed on
2026-09-27 (446 suites, 4,133 Jest tests, 30 snapshots, 56 release Node tests, and 4 IPA
verifier tests) after removing a test mock for the unused `expo-contacts`
dependency. Mobile typecheck also passed. The production release preflight still stops because
this shell is not logged in to EAS. None of these local checks establishes a
live Qwen inference or a store-submittable IPA.
The Mobile account entry now has explicit native sign-in and create-account
paths and links to the current legal/data-use pages. The create-account view
displays the full Free-provider data-use question, answer and qualification
from the website's shared compliance owner. A signed Release Simulator build
of the 2026-09-26 source, version 0.0.1, launched on the AGI Current Source QA
device; its Local home, Cloud sign-in and then-current native account-creation
form rendered. The form was inspected without accepting its Terms or creating
an account. This AuthView showed
Google and GitHub sign-in but no Apple sign-in. Apple's
[Guideline 4.8](https://developer.apple.com/app-store/review/guidelines/),
rechecked 2026-09-27,
requires an equivalent login service that limits data collection, lets users
keep their email private, and does not collect app interactions for advertising
without consent when third-party social login authenticates a primary account.
The present Google, GitHub, and email choices do not establish that equivalent.
Clerk's Expo AuthView documentation says Apple appears when the Apple connection
is enabled in the Clerk Dashboard. Verify the
production Clerk native app registration, enable Apple for sign-up and sign-in,
and test it on device before iOS submission. Clerk's `Secured by Clerk` badge
also appears in this native view; its official documentation says removal from
prebuilt UI requires a paid plan in production. An authenticated device pass
through email, social sign-in, sign-up, recovery, account creation and Cloud
return routing remains outstanding.
On 2026-09-26 the current source built as a Release iPhone Simulator app and
launched on a clean signed QA device. Welcome, data/provider disclosure, a
test-only age-gate entry, and the native Cloud sign-in entry rendered. The
sign-in entry showed Sign in/Create account tabs, Clerk email and social
choices, and legal/data-use links. An unsigned Simulator build had instead
shown an unexpected passcode prompt alongside a Keychain entitlement error;
the signed build did not reproduce it. The later signed QA run inspected Create
account. No authenticated account or Qwen inference was tested.
The website records versioned Terms acceptance on account creation or sign-in.
The 2026-09-26 signed Simulator run verified the earlier AuthView layout in light
and dark appearance after the Clerk theme changed from amber to neutral controls.
On 2026-09-27, the live website signup showed Google and GitHub first, then a
labeled email field and Continue button. Mobile now has a custom first signup
step in that order, using the shared provider list and Clerk's email verification
and Core 3 SSO hooks. Mobile sign-in now also uses a custom provider-first first
step, followed by password or email-code verification when offered by Clerk.
The live website form uses a narrow column near the top of one elevated
surface, with a monochrome AGI mark. Mobile signup and sign-in now use that
layout and surface roles rather than vertically centering the form. Focused
auth tests and Mobile typecheck pass; a current signed-device visual comparison
is still open. The installed `@clerk/expo/experimental` SSO implementation
finalizes new sessions and activates returned existing sessions internally.
Clerk's current public Expo OAuth guide, checked 2026-09-27, describes the
non-experimental hook that requires explicit `setActive`; that example does
not override the installed experimental code. Mobile keeps native AuthView for
incomplete flows. Focused tests cover completed, existing, and cancelled
responses. The create-account form no longer opens native AuthView after the
SDK has already activated an existing social session returned on `signUp`;
live Google/GitHub return routing still needs device verification.
Cancelled native Apple authentication now returns to the form without a
spurious error, following Clerk's current Expo Apple-auth guidance.
Failed email-code delivery can be retried without restarting sign-in.
The custom mobile sign-in now places its create-account switch with the email
step, as the website does, while the native fallback keeps its own switch.
The website's auth-error classifier now lives in the shared client runtime.
Mobile signup offers Log in instead when Clerk reports an existing email, and
mobile sign-in offers Create an account instead when Clerk reports an unknown
email. Focused mobile and web taxonomy tests cover these recovery actions.
The two custom Mobile forms now map Clerk errors through the shared auth
taxonomy before displaying them. Known wrong-code, credential, rate-limit,
provider, and network states retain specific recovery copy; unknown SDK text
cannot enter the form. Focused tests cover classified cases and a raw diagnostic
containing an internal path. Live Clerk error flows remain unverified on device.
Mobile signup now keeps verification-code entry hidden if initial delivery fails,
allows retrying delivery without creating another account, and prevents duplicate
email requests while Clerk is processing a signup step. Focused auth tests cover
the failed-delivery recovery and concurrent-submit cases.
The same in-flight guard now covers Google, GitHub, and Apple signup, so rapid
provider taps cannot open overlapping authentication sessions or race an email
signup. A cancelled provider flow releases the guard for an email retry.
The native AuthView remains for MFA, recovery, and unusual incomplete
signup/session states. Focused signup tests cover completed, cancelled, and
incomplete SSO responses, plus recovery into AuthView after a social or legal
error. Clerk's Core 3 SSO helper does not accept `legalAccepted`, unlike the
website's direct signup SSO call; native completion and the app's versioned
Terms gate must be exercised with live accounts to confirm legal acceptance.
Mobile typecheck and focused auth tests pass, but these custom forms have not
yet been exercised against a live Clerk account on device.
The custom Mobile signup and sign-in forms now support Clerk's native Apple flow with Apple's
system button when the public Mobile provider configuration includes Apple and
the device reports Apple authentication available. It is not enabled in the
current default configuration because the live Clerk Apple connection remains
unverified. Enable the connection and configure
`EXPO_PUBLIC_AGI_AUTH_PROVIDERS=google,github,apple` for the iOS release, then
test new and returning accounts on a signed device.
The 2026-09-27 iOS release check now refuses an empty or non-Apple provider
list, using the same provider parser as the auth screens. Tagged-release
validation and iOS beta/production preflight run that check before building;
the public provider list must match between Actions and EAS. This detects the
current Google/GitHub-only default but does not prove the production Clerk
Apple connection or Apple private-email relay works. Both require a signed
device account-creation and return-sign-in run.
After authentication, the app checks account-specific
acceptance through the bearer-authenticated Terms endpoint, shows the current
version and clickwrap, and keeps Cloud locked until the account has accepted. A native acceptance
write records its mobile surface; stale versions fail closed. Focused tests
cover the API, state transitions, account switching, and explicit confirmation.
The 2026-09-27 signed-in simulator run exposed a launch blocker: Local mode
blocked the Terms request before Cloud could be unlocked. The native egress
guard now permits only an authenticated GET or POST to the exact Terms path on
the configured API origin as an explicit auth-control request. The current
public web deployment still returns HTTP 405 for GET `/api/terms/accept`
(reverified by the production Cloud API release probe on 2026-09-27); the same
probe returns HTTP 404 for GET `/api/models/free-quota`. The required GET
handler and `mobile-auth` POST
surface exist only in the local web changes. The signed-in app therefore still
cannot enter Cloud against production. A signed Release Simulator build now
shows the service-update explanation at the Terms gate rather than a generic
failure. Deploy and verify the web endpoint,
then repeat signed-in Terms review and Cloud entry on device before submission.
The interim signed-in check now explains that Cloud access is being checked
and offers Continue in Local Mode, so an unresolved account or Terms status
does not trap the user behind a spinner. The focused login and Terms tests
pass 46 cases; Mobile typecheck, targeted lint, and formatting pass. This
recovery does not bypass the Terms requirement or fix the live 405.
Mobile social sign-in and sign-up now include the requested Cloud destination
in the OAuth callback URL. A callback to bare `/login` could otherwise clear
the pending destination and leave a newly signed-in user in Local Mode. The
focused login and post-auth intent suites pass 72 tests, with Mobile typecheck,
targeted lint, and formatting passing. The provider callback still needs a
signed-device run after the live Terms endpoint is available.
The Mobile Clerk token bridge also no longer falls back to a plain, unbound
session token if the `agi-mobile` template cannot mint. The Terms API refuses
to send without a bound mobile credential, and the Terms gate explains the
device-session problem while preserving Local Mode. Focused sign-in, Terms,
egress, and API tests pass 88 cases; Mobile typecheck and targeted lint pass.
The pending Cloud-chat destination now remains staged until the same signed-in
account's Terms status is accepted. Both login and the root Clerk bridge pass
that requirement to the shared post-auth action, so an early Clerk session
cannot consume the destination before legal acceptance. The three focused
sign-in and routing suites pass 63 assertions, Mobile typecheck and targeted
lint pass. The combined Jest command needs `--forceExit` because importing the
Clerk native singleton in the routing suite leaves a `MESSAGEPORT` handle;
the login suite alone exits cleanly under open-handle detection. A signed-device
handoff remains unverified.
The live Clerk template and signed-in end-to-end Cloud handoff still require
device verification after the endpoint is published.
The endpoint-only patch is committed as `7ebe6fce4` on
`codex/mobile-terms-status` and is under review in
[PR #522](https://github.com/siddharthanagula3/agiworkforce/pull/522).
The full pre-push `check:llm-operability` chain passed on the isolated branch.
The route is not yet deployed to production.
The live `/api/version` probe on 2026-09-27 reported serving commit
`e353673cce9df114fcfb58fd4c467d4d2dfc4240` from 2026-09-21. That
commit deliberately returns 404 for the public Free catalogue and has only a
POST Terms route. The 2026-09-26 `main` CI run for `e84a8cbbd3648cc42c56c143fc089a81f728a41f`
failed on one five-second Mobile model-picker test timeout (4071 other tests
passed), so staging skipped and the normal production promotion did not run.
That test passed alone on 2026-09-27 (47 cases), but a full exact-SHA CI rerun
and release promotion are still required. PR #522 also exposed a Web build
type error where `mobile-auth` was absent from `TermsAcceptanceSurface`; commit
`208ec0fbf` adds it, with 16 focused Terms tests and Web typecheck passing.
The production workflow run
[`35951454568`](https://github.com/siddharthanagula3/agiworkforce/actions/runs/35951454568)
has been waiting at the protected `production-web` environment since
2026-09-24. Its scope and same-SHA staging gate passed, but its deploy job
still awaits the configured founder reviewer. Subsequent production runs have
been cancelled or queued; do not infer that a green `main` CI alone will
publish these routes. Before approving any deployment, resolve the stale
waiting run and review the exact newer release candidate and its staging verdict.
The Mobile release preflight now checks the configured HTTPS Cloud origin for
both the Terms status and provider-funded Free catalogue routes. Each must
answer an unauthenticated GET with HTTP 401; 404, 405, redirects, an open 200,
or a network failure block the release. Unsandboxed 2026-09-27
unauthenticated GET probes confirmed HTTP 405 for Terms and HTTP 404
for the Free catalogue, so both deployed routes must be corrected and
reverified after the web patch is published. The preflight requires the
release shell's `EXPO_PUBLIC_API_URL`, and the tagged workflow now checks the
deployed routes in its first validation job before source validation and device
builds. It reads the public origin from GitHub Actions configuration. The
repository Actions variable was set and read back as `https://agiworkforce.com`
on 2026-09-27; that value
must also match the EAS production environment. The protected
`mobile-store-release` GitHub environment was not found when queried, so store
credential and approval configuration remains outstanding.
The endpoint probe now also requires the JSON error envelope and request ID
emitted by the app's API wrapper. A generic CDN or proxy HTTP 401 no longer
counts as proof that either route exists. Its six Node tests and the focused
Web Terms, Free catalogue, and error-handler tests pass; live signed-in access
still requires the deployed route update.
The Mobile API's 401/session test had been excluded from Jest because its
native dependency mocks could not load. It is now included and passes all 16
cases. The test also exposed a refresh-deadline timer left running after a
successful token refresh; the API now clears that timer in every outcome.
Focused auth, egress, and Terms tests pass (42 cases), and the auth suite exits
cleanly under Jest open-handle detection. This strengthens local verification
but does not replace a live signed-in Cloud run after the endpoint is deployed.
The confirmation is bound to the current account and Terms version, so a
checked box cannot carry into another account or a newly returned version.
Mobile now validates the shared Terms status and acceptance response shapes,
including the recorded acceptance time, before opening Cloud. A malformed
write response requires a fresh status check. The focused six-case store test,
Mobile and shared-contract typechecks, and targeted lint pass. The live Terms
GET still returned 405 on 2026-09-27, so signed-device Cloud entry remains blocked.
A current signed-out and signed-in device run must still verify email/social
signup, returning sessions, error recovery, and the server record before
claiming full signup parity or launch readiness.
The custom Mobile email entry now checks the shared email validator before
starting either Clerk flow, matching the website's required email field. The
signed-in Terms review scrolls so its consent and recovery controls remain
reachable when text expands. The focused login suite passed 31 tests on
2026-09-27; Mobile typecheck, formatting, and hygiene passed. A signed-device
large-text layout pass remains necessary.
When Clerk supports both password and email code for a returning account, the
custom Mobile sign-in now offers email code directly from the password step.
Sending a new code uses the same recovery path, clears the stale code entry,
and keeps the account on the custom screen. The focused login suite passes 32
tests; Mobile typecheck and targeted lint pass. Signed-device Clerk validation
remains open.
The release screenshot pipeline's iPhone wiring check passed after adding
Detox cleanup to prevent a post-test server shutdown hang. Its onboarding and
Local empty-chat frames passed and produced store-sized images. The
first-message frame initially failed after typing because Detox targeted the
composer parent view. The spec now taps the accessible Send message button.
On 2026-09-27, a Release iPhone 17 Pro Max Simulator run sent a Local "hello",
streamed an Apple Intelligence reply, completed, and produced a visually
reviewed 1320 × 2868 first-message frame. The screenshot assertion now checks
the completed answer's action control because the performance chip is only
shown when measured token-rate data exists. The Cloud sign-in frame also passed
on 2026-09-27 after the spec completed the signed-out age review; its native
Clerk sign-in form was visually reviewed at 1320 × 2868. The voice frame,
all iPad frames beyond the earlier welcome capture, and visual
review of the complete set remain open. Interrupted Detox runs left ten QA or
Detox Simulators booted and drove system memory free down to 25%; shutting them
down raised it to 66%, then 73% after settling. The pipeline now shuts down new
Detox clones after each spec and its selected Simulator on completion or
failure. It can target one frame by ID so another failing frame does not block
capture. Its 25 focused tests and Mobile typecheck pass, but live validation of
that cleanup on another capture run remains open. The production IAP
deployment gate and external purchase links also need a final live App Review
policy check before submission. Do not mark the iOS store record published or
submit the app until those checks are complete.

The native IAP catalogue already gates plans and top-ups behind redeemed
billing access. Mobile Billing now lets a signed-in user redeem that same code
or join the upgrade waitlist, then refreshes the catalogue. It rechecks the
server catalogue immediately before opening the store purchase sheet. The
catalogue now exposes those access controls while native purchases are disabled
for store setup; redeeming a code never enables an unconfigured purchase.
Mobile Billing's plan row now offers the waitlist directly during that gate,
while the panel below handles access-code entry without a duplicate join action.
server setting `AGI_BILLING_WAITLIST_OPEN=1` can later remove the
gate for web checkout and native IAP without a client release; the web upgrade
flow reads that setting through the authenticated waitlist endpoint. The gate
defaults on. Focused IAP and waitlist tests pass, but real StoreKit sandbox
purchase, restore and refund flows have not been tested. `MOBILE_IAP_ENABLED`
remains off and App Store products are not yet configured, so IAP is not ready
for submission with purchases advertised. An App Review account with upgrade
access and functioning store products is needed to review the gated flow.
The native billing hook now discards catalog responses that arrive after Cloud
billing is disabled and refuses to start a purchase from a stale catalog; the
purchase preflight and receipt acknowledgement are also bound to the active
account epoch, so a sign-in change cannot carry a cached verification into a
different account. The 2026-09-26 full Mobile run passed 447 Jest suites,
4,099 tests, 30 snapshots, 53 release Node tests, and four IPA verifier tests;
Mobile typecheck and lint also pass. This does not replace a live StoreKit
sandbox purchase or validate the store product configuration.
The purchase boundary now blocks a second rapid tap synchronously while the
first catalogue preflight or store sheet is in flight, then releases on store
success, cancellation or failure for that product. A redelivered older purchase
for a different product cannot unlock the current purchase sheet. Focused native
IAP tests cover duplicate taps, release after cancellation, old receipt
processing, acknowledgement and restore; Mobile
typecheck and targeted lint pass. A live StoreKit sandbox flow remains open.
The purchase hook now keeps an old account's receipt completion from clearing
a new account's purchase or restore state when the product ID is shared.
Restore purchases stays in progress until the native store finishes loading
receipts, including an empty result. The focused 19-case IAP suite, Mobile
typecheck and targeted lint pass; the StoreKit sandbox sequence still needs a
signed-device run.
Turning off new IAP sales now leaves previously configured product IDs available
to server receipt verification and store notifications. Mobile still processes
unfinished transactions and exposes Restore purchases while the catalogue is
disabled. Focused server and native-hook regressions pass; keep the product-ID
mapping configured when switching sales off. Live sandbox purchase and restore
validation remains open.
The Mobile purchase hook now keeps store and receipt exception text out of the
purchase UI. Account-switch, revoked upgrade-access and missing-pricing
preflight messages remain explicit because they are owned by the app. The
2026-09-27 focused native IAP and acknowledgement tests pass 24 cases, and
Mobile typecheck and targeted lint pass. The raw-error guard now scans Mobile;
its baseline now records zero sinks after the Apple Reminders review screen
switched to app-owned messages selected by typed error codes. A forged exception
message cannot reach the review alert. The focused reminder suites pass nine
tests, Mobile typecheck, targeted lint, formatting, and the raw-error guard pass.
Connector directory, detail,
custom-create, connect, and reauthorization failures now use safe copy; a typed
HTTP 501 explains unavailable deployment configuration without exposing server
diagnostics. Usage loading also keeps server details private and supports retry.
Five focused connector suites pass 30 tests; the usage suite passes 11 tests.
After server verification and store acknowledgement, a failed tier refresh now
reports that the purchase was confirmed and that Billing should be reopened;
it no longer incorrectly says the receipt was unverified. The tier store now
returns whether it actually refreshed, since it deliberately keeps cached data
on failure. The three focused IAP and tier-store suites pass 54 tests. This
still needs live StoreKit sandbox testing.
AGI Work start failures now preserve only the known empty-goal validation copy;
the task run tests pass 15 cases. The unreachable Mobile auto-tag client and
tag utility for three retired routes were removed.
Memory import now handles malformed export shapes and shows fixed file-read,
parse, and partial-import recovery copy; the parser suite passes 34 cases.
Archived chats now distinguish a failed restore from a successful restore
followed by a failed chat-list refresh; its focused screen and bulk suites pass
12 tests, including safe load errors and retry.
Workspace switching now distinguishes a failed switch from a successful switch
whose chat refresh failed; its focused suite passes four tests.
Voice file transcription now keeps the transcript visible after a failed send
and offers a working retry. Report flagging and translation show fixed local
failure copy, and a locally failed report-status write no longer negates a
server-accepted report. Reflect, Reports, Skills, notification settings, and
tool approval settings no longer show raw server exception text. Focused voice,
report, Skills, notification, and reminder tests pass; Mobile typecheck and
lint pass. The scanner is syntactic and does not prove every indirect error
path safe.
Voice now displays complete user and assistant text from its own session in a
scrollable panel while capture controls stay available. The 12-case focused
voice suite passes, including a long, untruncated reply; Mobile typecheck and
targeted lint pass. This does not yet overlay the originating chat or expose
its earlier messages and actions, and a signed-device layout check remains.
The raw-error guard now inspects native alerts and Android toasts, including
their visible copy without mistaking confirmation callbacks for alert text.
It exposed file sharing, local-data export, Cloud account, archive, and Library
alerts that forwarded exception messages. Those alerts now use fixed recovery
copy. A failed conversation share also leaves its export sheet open for retry.
The focused export, image, account, and reminder tests and the guard unit tests
pass; signed-device failure flows remain unverified.
The guard now also checks raw exception text rendered directly in JSX. This
exposed the Auth, Public, and root Mobile error boundaries and a Web workspace
switch alert. Those boundaries now show recovery copy; the shared section
boundary keeps development diagnostics in the console. Camera and Scan no
longer navigate to a conversation when the message store refuses an image
turn. They retain the captured image and prompt; camera capture, OCR, and send
failures no longer show native exception text. Focused boundary, camera, Scan,
onboarding, and workspace tests cover those paths. Signed-device image sends
and OCR failures remain unverified.
Scheduled tasks and Memory screens also held raw service and storage error
messages in their state stores, outside the syntactic guard's reach. Their
visible errors now use task-specific recovery copy. Memory update and pin
failures retain that copy after the list refresh, and account changes are
rechecked before setting it. The focused schedule and Memory suites passed
20 assertions; Jest reported an existing open handle after the assertions and
was stopped to free memory. Mobile typecheck and lint pass. Live failure and
recovery flows remain unverified.
The schedule edit screen now waits for a confirmed delete result before leaving;
a failed deletion restores the task and keeps the editor open with recovery
copy. Its focused store and screen tests pass nine cases under a forced Jest
exit because of that existing open handle. A signed-in device deletion failure
still needs verification.
Scheduled run history now maps server-provided failure details to fixed
status-specific recovery copy before those runs enter Mobile state. A failed or
timed-out run can no longer display provider diagnostics in the run row. The
focused schedule service and account-bound Free catalogue suites pass 19
cases; live run-history recovery and Qwen provider-quota behavior remain open.
The Cloud Work task store also maps unexpected run failures to fixed retry copy.
Manual Local-to-Cloud chat sync now binds the operation to the signed-in account
and stops if that account changes during conversation creation or message upload;
its results and alerts cannot surface in a successor account. Unexpected sync,
manual Desktop pairing, and local-wipe errors now show app-owned recovery copy
instead of transport or storage diagnostics. Focused sync, pairing, storage,
and Cloud Work store tests pass; these failure and account-switch paths still
need signed-device validation.
Library page failures now show fixed retry copy instead of raw API text, while
retaining a cached page only for its owning account. Cloud Project sources
preserve app-owned file validation messages but hide unknown API diagnostics.
The Project source load failure now has a retry control, and late responses
from a previously selected project cannot overwrite the current project.
Focused Library and Project source suites pass 24 cases. These recovery flows
still need a signed-in device check.
Attachment upload state also retained raw transport exception messages after
retry exhaustion and session expiry. It now records fixed connection or
sign-in guidance, including from the composer retry path. Focused upload and
composer suites pass 69 cases and two snapshots; live failed-upload recovery
remains unverified.
Image and video turns now write fixed recovery messages when a provider returns
an error or throws, so provider diagnostics cannot enter the assistant transcript.
The chat banner preserves specific app-owned account admission messages without
showing raw provider failures. Focused media-turn tests cover both returned and
thrown provider errors; a live provider failure remains unverified.
The Account Security screen now shows fixed recovery copy for failed status,
device, timeout, revocation, and password operations. Native Billing does the
same for unknown waitlist and code-redemption failures while retaining typed,
app-owned validation messages. Focused screen tests cover raw API diagnostics
containing internal paths and a rejected device revocation.
The draft iOS and Android store-review notes previously described Restore as
absent and receipt verification as gated by new-sales availability. Both claims
were stale. The notes and listing preparation fields now describe the current
behavior and distinguish checked-in defaults from unverified live store and
deployment state. The public descriptions still say purchases are unavailable;
those descriptions and the store IAP disclosures must be changed together with
product registration and activation before a purchase-enabled submission.
The private preparation fields and reviewer notes now enumerate the disabled
catalog reasons, Billing loading state, and plan-change labels. The store
submission-copy and production-config tests pass after their fixtures were
aligned with the configured HTTPS router origin.

## CHECKLIST-REAUDIT-2026-09-23

The frozen independent checklist audit at commit `c8ed5c617` remains the
historical baseline: 29,115 requirements, comprising 7,803 done, 9,597 partial,
5,076 missing and 6,639 unverified, with a GLOBAL NO-GO result. The later
current-verification overlay contains 700 decisions drawn only from the
historical unverified cohort. It contains no decision for any of the 9,597
historical partial rows. Therefore zero partial rows have been proved complete
by the current overlay, and the actual number completed since the frozen audit
is unknown. Changed files, merged branches and passing broad guards are useful
impact evidence, but are not item-level completion decisions.

The similarly named directories do not supply that missing mapping.
`agiworkforce-partials` is a clean worktree whose `local/post-launch` tip is
already an ancestor of main; the older `partials/reaudit` branch changed eight
observability and environment-validation files and was merged into the launch
line. It is not a reaudit of all partial rows. `agiworkforce-launch`,
`agiworkforce-e2e-0156` and `agiworkforce-security` are historical worktrees
whose tips are already represented in main. `agiworkforce-verify` is behind
main and its only patch-unique one-line import deletion conflicts with newer
usage, so it is superseded rather than unmerged work. `agiworkforce-jev` has
unmerged historical decision-primitive commits, but main now has a later
semantic-decisions implementation; it requires conceptual comparison, not a
blind cherry-pick. `agiworkforce-security-run` and `agiworkforce-prod-deploy`
are old run/source artifacts rather than Git worktrees. They may contain
sensitive deployment material and must not be treated as current source or
copied into documentation.

Current broad evidence is encouraging but not atomic. All 199 commands behind
`check:llm-operability` passed individually after removing an untracked Finder
metadata file and rerunning the socket-dependent CI guard with appropriate
permissions. Protocol generation, all 62 typecheck tasks and extension lint
passed. Web lint passed when its ignored experiment cache was excluded; the
root lint currently includes that cache and reports 11 `no-explicit-any`
errors. A full test run passed 59 of 60 workspace tasks. Web reported 134
failed files and 356 failed tests, but an isolated rerun reduced that set to 10
persistent files and 11 failed tests (120 files and 2,097 tests passed; five
tests were pending). Four paths recorded by the first run no longer existed by
the rerun. Main advanced during the full run and the staged worktree changed
during the rerun, so neither result proves one immutable source fingerprint.

The persistent web failures cover stale settings-provider structure, an E2E CI
manifest count mismatch, a missing dark `--ring` token, a loading-state
invariant that no longer finds its expected spinner, stale generated trust-page
counts, missing Playwright Chromium or an equivalent harness timeout, two admin
account-status fixture/shape mismatches, global composer-density ownership and
a send-pending state regression. Resolve those at their canonical owners,
install and verify the browser harness, and make root web lint exclude the
declared cache rather than editing generated experiments. Then freeze a clean
commit and index fingerprint; map all 9,597 partial IDs to current owners and
evidence; require a focused test or live proof before promoting each row; rerun
guards, lint, typecheck, tests, builds and native checks at that same
fingerprint; and only then publish replacement counts. Jev classification was
not used for this pass because it required permission to transmit internal
repository state and abstained without it; deterministic repository evidence
was collected without silently substituting a semantic decision.

## WEB-MIGRATION-STATUS-2026-09-23

A read-only `pnpm db:migrate -- status` using the local environment's configured
`AGI_DATABASE_URL` reported 272 applied migrations, 21 pending (0273–0293),
and a checksum drift for applied `0268_conversation_activation.sql`. Migration
0219 for conversation drafts is within the applied range on this database.
The 0268 file is clean in this worktree; the runner did not expose the SQL that
was recorded when it was applied. The same database has no deployment records,
so this check does not establish which release environment it represents.
Do not apply pending migrations, change an applied migration, or call this
launch-ready until the target and drift are reconciled through the migration
procedure and the intended deployment has been verified separately.

## WEB-SIGNUP-CONSENT-2026-09-23

The authenticated `/signup` route sent an existing signed-in account to
`/signup/complete`, where the client automatically POSTed a versioned Terms
acceptance. A direct visit to the completion URL did the same. Neither action
proved a new sign-up or a fresh agreement. The existing `/login/complete` route
already reads durable acceptance and shows an explicit Terms gate when it is
missing. The signed-in `/signup` route now goes there; `/signup/complete`
requires the current signup-action marker before auto-recording, otherwise it
also goes through the login-completion gate. Failed email or provider signup
initiation, including a rejected network request, clears that marker and
recovers to a retryable state. The founder's one-action sign-up agreement
remains intact for an actual signup. Jev selected this route-and-marker repair
at confidence 0.98, request
`165c7d2bd65b0ad0bc68fcdc65c8fe41ba295665f88467de49848b888dd6dcb5`.
[Clerk's current legal-acceptance guide](https://clerk.com/docs/guides/development/custom-flows/authentication/legal-acceptance)
confirms the custom signup passes `legalAccepted` at initiation; the app's own
profile remains the source for the precise policy version.
An OAuth callback carrying a provider failure now clears the pending signup
marker as well; its focused regression passes. Closing the browser without a
callback can still leave an abandoned marker. The completion route now
auto-records only when Clerk reports a completed sign-up with a legal-acceptance
timestamp and both the created user and session matching the active account;
otherwise it clears the marker and uses the explicit login Terms gate. This
prevents an abandoned marker from accepting for another account or later
session. Jev selected the account-bound check at confidence 0.99, request
`7d7b3b148a5f1801eebeb0816fa0de0cc8d59dffea5c87daf40c8b2e49472fb9`.
[Clerk's current SignUpFuture reference](https://clerk.com/docs/nextjs/reference/objects/sign-up-future)
documents the created user/session and legal-acceptance fields; its current
`useSignUp` hook exposes `fetchStatus`, not an `isLoaded` field. A localhost
signed-in direct completion visit redirected to chat without remaining on the
spinner. The account-bound and abandoned-flow regressions pass; a genuine new
signup has not been exercised end-to-end.
The latest combined eight-file auth, Free-search allowance, routing and Code
approval test run passes 153 tests; Web typecheck, targeted lint and diff checks
also pass after these edits.

Five adjacent signup/auth suites pass 60 tests. A signed-in localhost visit to
`/signup?redirectTo=%2Fchat` visibly passed through `/login/complete` and
returned to chat; it did not show a new-user signup or test an unaccepted
account. Full first-time registration, email/OAuth verification, terms write,
and onboarding still require an authorized end-to-end test account. A stale
signup marker from an abandoned earlier attempt can remain in localStorage,
but is no longer sufficient to auto-record acceptance. It may require an
explicit Terms confirmation when Clerk does not preserve the completed signup
resource across the return navigation; that fallback has not been live-tested
with a new account.

The later repository-wide run and isolated web rerun are recorded in
`CHECKLIST-REAUDIT-2026-09-23` above and supersede the earlier stopped-run
claim. They were not atomic because main and the staged worktree changed while
validation was running, so they do not close this signup section's live-test
gaps.
The mock-export guard now reports zero factories missing an export used by a
subject or direct dependency. Web whole-module mocks are back at their
recorded ceiling of 4,331 after preserving real exports in the affected
chat, Free-provider, search-allowance, failover and device-link test factories.
Their focused suites pass 124 tests, the guard's own 20 tests pass, targeted
Web lint and Web typecheck pass. The later individual repository guard run
passed every command with the permissions noted above; that broader result is
not a substitute for the still-missing authenticated signup workflow.

## WEB-QUICK-ASK-ROUTES-2026-09-23

The route-test guard found both `/quick-ask` and its conversation route without
a browser spec. A new Chromium spec navigates to each route as a signed-out
visitor and verifies the sign-in destination survives, the login form renders
without spurious 401 API responses, same-origin console errors, page exceptions
or a framework error overlay, and its email control responds. At 390px,
the form remains in view without horizontal page overflow. All three browser
cases pass against localhost `:3100`; the existing three route unit tests also
pass and verify that both pages request compact chat and the layout enforces
current Terms. The route-test guard now passes at its 12-page ratchet. The
first mobile screenshot caught the cookie notice mid-animation; a settled
capture did not show the apparent footer overlap. This is signed-out and
mocked-component evidence only. A new red hook regression also proved that
`/quick-ask?q=...` consumed its draft and then navigated to full `/chat`.
The shared entry hook now chooses its validated chat-surface root from the
current path, so a prefilled Quick Ask entry remains compact and a prefill
opened on an existing Quick Ask conversation starts a new compact chat.
The shared route constants also replace the duplicate root literals in the
Web chat page. Three focused entry/route files pass 24 tests; Web typecheck,
targeted lint and formatting pass. A signed-in, Terms-accepted Quick Ask send,
conversation reload, and live compact-layout interaction remain unverified.
Jev prioritized the route workflow at confidence 0.87, request
`430d72b2ab3e8df608a9df65857aa42b7b5884bb9acaa3768f8f21e2e51e77b7`.
Jev chose the shared pathname-aware repair at confidence 0.46, request
`8e5a7b18b179248e84131fcaa987f1f5ebbffbae530118e312cdc86870ba5173`.

## WEB-FREE-MODEL-SWITCH-2026-09-23

A live localhost Free account's “Try again with” menu offered paid chat models
without an access label, even though a Free send would silently coerce such a
selection back to the Free workhorse. The menu now filters to the canonical
Free-entitled set and selectable promotional chat offerings; paid accounts
retain their model choices. Jev selected this at confidence 1.00, request
`bfff9951dc2629684f060d8e87d02e89f017d82296fbfc1ac1fcbca23527c305`.
The live Free menu now showed only the configured free router, with no paid options.

Switching a previously branched Free conversation to a QwenCloud promotional
model exposed two durability failures. A pre-stream provider error deleted the
assistant placeholder and reset the active leaf to the prior answer, hiding
the new user prompt; “Retry this turn” then regenerated the unrelated prior
search. Sibling-path restoration now applies only to an actual assistant
regeneration, so a failed new turn remains visible and retryable. Jev selected
this at confidence 0.99, request
`9c83b39c8d51b0d03e34f79922ec6a9aeca06799ae88b62308142161fe63c920`.

The QwenCloud route then returned a valid answer but did not persist its user
message before the client attempted to save the assistant beneath that user;
the save returned 404 and the UI warned that the turn was not durable. Both
promotional Free chat routes now validate and persist the user message through
the shared conversation owner before provider dispatch, failing closed if that
write fails. Jev selected the shared server boundary at confidence 0.99,
request `b62b6223eb2c71f1ba89d2722799c74d333e9309d9fe9509f5a047be86978022`.
For route refusals that occur before this point, the normal-send error path
idempotently persists the failed user row before saving its error reply, so a
retry does not lose the parent. Jev selected that at confidence 0.94, request
`bd1e363cc09bca8793f2bc576f995ca75c8d2ade799bc26c892e21037e6178d2`.

The live QwenCloud flagship promotion returned `QWEN_FREE_PERSIST_OK` through
`/api/models/free-quota/completions`, with the prompt and answer both present
after reload and no persistence warning. Experiential Labs' picker reported
five ready promotions, but one advertised promotion's live completion first refused the
promotion and then returned a provider error. Its failed prompt and error
now survive reload; this does not establish a working Experiential route or
accurate promotion availability. The model-switch warning also no longer calls
every promotional provider QwenCloud. From the persisted failed Experiential
turn, “Try again with” offered only Free Auto; selecting it answered the same
prompt through the Free route, and that answer survived reload. The five
focused route, variant, compatibility, and regeneration-option files pass 78
tests; targeted lint and Web typecheck pass. A Free Auto turn uploaded a 92-byte
text fixture, answered its port correctly with a rendered file source, and
survived reload. The same file selected under a text-only QwenCloud promotion
then produced a failed turn: the composer had allowed upload despite the
server's explicit text-only contract. The composer now derives that limit from
the canonical offering, disables file selection, and warns before a model
switch with a staged attachment. If the user switches anyway, Send stays
blocked without losing the draft; “Use Free Auto” restores a viable Free path.
The deliberately failed Qwen attachment turn was also retried through Free
Auto: the request carried the original file bytes, answered correctly, cleared
the failure notice, and survived reload. This was checked in localhost, and
four focused composer suites pass 141 tests
with Web typecheck and targeted lint. Jev selected the guard at confidence
0.99, request `4f375cac31b977c558bf6313dc73af8feec05836d4364d6739d439819160b37e`.
An adjacent live reload showed that the “Use Free Auto” recovery button had
changed only local model state; the conversation reopened on Qwen. The button
now uses the picker's durable conversation-model update path and fails visibly
without changing models if saving fails. Another reload resurrected a prompt
the user had manually deleted: clearing a draft removed its map entry, so the
server-sync loop never wrote the empty draft. Saved conversations now retain
an empty draft until sync, and editing a restored blocked-send draft releases
its replay slot. A localhost clear remained empty after reload and Free Auto
remained selected after recovery/reload. Jev selected the draft tombstone
approach at confidence 0.54, request
`59c74acbe63e34b2f7e5230e1859737b60fbeead17a06723e3647bc8f5f9f13d`.
Seven adjacent composer and draft suites pass 174 tests; targeted lint and Web
typecheck pass. An immediate reload before the debounce could still restore
the older server draft. A scoped pending-clear marker now survives that reload,
suppresses hydration of the stale server text, and replays the clear until the
server acknowledges it. The current document serializes its draft writes so an
older in-flight text save cannot follow its clear. Jev chose this repair at
confidence 0.88, request
`da4672e02bc6847417d1b93bcebcf78ffcd8205a9b595101c365d3bcef30a9ca`.
Localhost confirmed a just-cleared draft stayed empty after immediate reload
and the subsequent server PUT carried `draft: null` with HTTP 200. Four focused
draft, composer, and conversation suites pass 57 tests; targeted lint and Web
typecheck pass. A later red regression confirmed that text typed into an open
chat was absent from the sync store until navigation. The composer now mirrors
live textarea/editor edits into that store, without staging temporary chats.
The existing handback effect initially replayed sent or manually cleared text;
adjacent tests caught it, and composer-owned writes are now marked before the
handback effect sees them. A stale draft PUT also returned 200; the draft route
now compares the last observed server `draft_updated_at` atomically and returns
409 instead of overwriting a newer write. The client carries revisions from
conversation loads and save acknowledgements, retains its local text on a
conflict, and shows a persistent warning. The crash copy used to occupy one
conversation-wide `localStorage` key, so a second tab could overwrite or clear
the first tab's unsent text. It now uses a random per-document owner, inherits
the prior owner on reload or tab duplication, and keeps an empty tombstone so
older text cannot reappear. A reload retires the prior owner's copy only after
copying it; legacy shared records migrate on first read. Eight adjacent suites
pass 107 tests, including account/workspace cache purging, with Web typecheck,
targeted lint and the production Web build passing. Jev chose the live store path
(confidence 1, request `5eb92d87fbb995f766ca2f07650a5d6cfa9bf444ac5dec743228af63be1a6d05`),
timestamp compare-and-swap (confidence 1, request `b8c4fe4ebae4ec46f5d21026741947aa5aaaf6de4a65b4a02de2acb85741b275`),
and marking composer-owned writes (confidence 0.98, request `b57b61e799b013c397ca14fafd624cbbcaca95ecf97dd4eda48b47f57eb9a685`).
Jev selected per-document local storage at confidence 0.55, request
`180f2c57532cfdf026ee4956333dda2455ff918dcf8ff9325324bc4c6be6bfac`.
In headless Chromium against `localhost:3100`, a popup inherited its opener's
session-storage pointer but reported navigation type `navigate`; reloading that
popup reported `reload`. The implementation generates a new random owner per
document load. This is one
browser observation, not proof of identical behavior in Safari or Firefox.
Live cross-device typing and conflict resolution have not been exercised in an
authenticated browser. Conflict resolution currently preserves the local text
and warns rather than offering a two-draft merge. Copies inherited by a
duplicated tab remain until sign-out unless that tab later reloads; storage
pressure and disabled storage still need browser exercise. Migration 0219 was
absent from the pending list on the locally configured database, but that
database's deployment target is unverified and its ledger has a separate 0268
checksum drift; do not claim server draft sync is deployed to users.
After a transient draft PUT failure, the open composer previously waited for
another keystroke before retrying. It now makes at most three automatic
attempts with backoff, preserves the local draft, and offers a persistent Retry
action if syncing remains unavailable. Scheduled retries stop on unmount. The
focused hook suite passes 12 tests; Web typecheck, targeted lint and production
build pass. This does not resolve a true cross-device draft conflict: the user
still needs a deliberate choice between versions.
A localhost Free Auto turn uploaded the repository's synthetic
`supplier-invoice.pdf`, correctly answered the total due as $1,275.00 USD,
rendered a PDF source, and retained the attachment and answer after reload.
Another turn uploaded the public `logo.png`, correctly read “AGI WORKFORCE,”
rendered an image source, and retained the image and answer after reload. The
image response took noticeably longer than the PDF response; this single
success does not prove multimodal route reliability or that every Free Auto
choice can consume images.
A capability-class switch revealed a further dead end. After those historical
attachments, selecting a text-only QwenCloud vision-branded promotion and sending a new
unrelated text prompt failed because the chat adapter forwarded earlier
`file`/`image_url` parts to a text-only promotional route. The adapter now
keeps earlier text, replaces historical attachment parts with an explicit
unavailable note, and leaves the current user turn untouched so a newly
attached file is never silently discarded. The switch warning now distinguishes
historical files from staged files. Jev chose this approach at confidence 1.00,
request `be8c7245f9657dbf31864c236d951e4dcb5044cfa0922053c2a812c114cbea46`.
Retrying the exact failed Qwen turn in localhost answered
`QWEN_VL_TEXT_AFTER_IMAGE` via the free pool and survived reload. The three
adjacent adapter, compatibility, and chat-stream suites pass 81 tests;
targeted lint and Web typecheck pass. A subsequent basic Qwen promotion
answered `BASIC_QWEN_FREE_OK`, and a reasoning Qwen promotion answered
`17*19=323`; both used the Free pool
and persisted after reload. These representative successes do not establish
the availability of every listed Qwen offering.
An empty `.txt` selected in the live Free composer initially appeared as a
0-byte attachment and failed only after Send with a generic upload error and
futile Retry upload control. The server already rejects a non-positive upload
size; the client admission hook now rejects zero bytes before upload, names
the file and remedy, and carries an unavailable-attachment note if the user
still sends the question. Jev selected this boundary at confidence 1.00,
request `89a8ba592fe50b0c10bc5c1965ffb98d7e8a1e1d49263b8d283c9a61fbd01245`.
Three adjacent attachment suites pass 25 tests; targeted lint and Web
typecheck pass. In localhost the same empty file immediately produced the
specific warning with no attachment preview or upload attempt; sending the
remaining draft displayed the unavailable-file note in the user turn. The
model continuation itself hit a separate Free-provider overload, so that
answer is not a pass. A restored failed-upload draft remained in this test
chat after the overloaded turn and reload, but development hot reload occurred
between the two sends; reproduce without hot reload before attributing it to
production draft handling. A focused resubmission regression passes.
In another authenticated localhost Free Auto turn on 2026-09-23, a synthetic
79-byte `.txt` file uploaded, passed verification, appeared as a downloadable
attachment in the user turn, and the assistant answered `cobalt` from its
contents. The attachment link and answer survived reload. This proves one
small text-file path; image/PDF inputs, size limits, corrupt files, and upload
failure recovery remain unverified live.
The same account uploaded a synthetic four-bar PNG and the image appeared in
the submitted turn, but the configured free router returned a provider overload
before answering. One manual regeneration returned the same overload. Image
understanding is therefore not verified, and the currently selectable
promotional Free routes are text-only by product policy, leaving no tested
Free vision recovery route for this failed request.
The failed turn had also offered a generic “Switch model” action even though
the available promotional alternatives cannot replay its image or tool-bearing
turn. The Free-tier error action now checks the failed turn's attachment and
tool needs against the same catalogue-backed compatibility evaluator used by
the composer, and appears for constrained turns only when a distinct compatible
Free option exists. Retry remains available; paid-tier switching is unchanged.
Five focused compatibility cases and the message-list integration regression
pass (88 tests across both files), as do Web typecheck and targeted lint. In
the failed image turn on localhost, the incompatible switch action was absent
after reload while Regenerate remained visible. This does not add a working
Free vision fallback or change the upstream overload rate. Jev selected the
capability-aware recovery approach at confidence 0.98, request
`8931a92d3ab11b2d5f3675bb313a7b2f1bc48a2d84f3615b20aae71c7d6698e8`.
On 2026-09-23, the authenticated QwenCloud Benefits console showed 276 eligible
models and two unavailable models. A read-only pass across all 28 pages found
every displayed Free Quota Only switch enabled (276 on, zero off); the two
unavailable rows had no switch. The account showed $0.00 spend for September.
The shared attestation for the current API key was recorded on 2026-09-22
with `all` scope and remains valid under the code's 30-day limit. The checked
console supports that scope today, but the 30-day freshness window permits
provider-side settings to drift; the static inventory also trails the live
console (272 versus 278 rows). An operator re-check or provider-supported
automatic status mechanism is still needed before treating that window as an
ongoing billing guarantee.
The Free provider launch gate remains open for
provider outages/quotas, other Free provider capability classes, and
new-account testing.
On 2026-09-23, the Web candidate added a catalogue-backed image-input flag for
six Qwen3-VL chat offerings. The pinned Qwen Free route now accepts server-owned
image references, hydrates and validates the bytes through the shared chat
attachment path, and refuses non-image files before provider egress. The
composer and model-recovery logic distinguish image-capable promotional routes
from text-only routes. Focused Free-route, Qwen-adapter and composer tests pass;
the Web and Qwen typechecks, targeted lint, model sync and catalogue guard pass.
This is not a live vision pass: the localhost QA account reached the new
2026-09-23 Terms acceptance gate before an image turn could be sent. The user
must review and accept the updated agreement themselves before authenticated
browser verification can resume. Real Qwen image understanding, provider
quota/overload behavior and Free-only recovery remain open launch gates. A
separate direct synthetic-logo provider probe could not start because this
worktree's shell has no `QWEN_API_KEY` or `.env.local`; it did not send a
provider request.

## WEB-FREE-SEARCH-APPROVAL-2026-09-23

An authenticated localhost Free Auto user could complete a first web search,
but a follow-up search after source content entered the conversation correctly
required safety approval and then failed with the paid-only custom-tool gate.
The processor checked the Free request before adding platform skill/card tools;
approval checkpoints saved those added tools as if the caller had declared
them, so reprocessing the approval treated a normal Free search as a paid API
add-on. The processor now records the original caller tool fields, and inline
and durable checkpoint paths persist those fields instead of server additions.
Free resume also strips tool fields from older checkpoints that predate this
fix; paid checkpoints retain caller-defined tools. Jev selected the provenance
fix at confidence 0.96, request
`c20a3e3a6a14b99a18b4fad699ab4020762d537b7c1ddbc87fa00021039b4fae`,
and legacy Free recovery at confidence 0.98, request
`b25b8325118ed4d77971793f55312f9fe9f8035a2df0ea5e53982533d66cfe54`.

In localhost `:3100`, a new Free Auto conversation
`89a75e2b-b5da-4e41-aaef-f0f18051f0cc` completed an initial IANA search.
Its second turn requested two public searches, paused for two approvals, and
after both were allowed completed with an answer and 10 sources; the result
survived reload. The legacy-resume boundary has automated coverage but could
not be live-replayed because the earlier failed turn no longer had a pending
checkpoint. Focused checkpoint, Free request, approval-route and workflow tests
pass; Web typecheck and targeted lint pass. Denial, cancellation, malformed
source, rate-limit, and multiple-provider behavior are not yet live-verified.
The Free web-search launch gate remains open pending those cases and broader
new-user testing.

A further live Free Auto turn said it had no web-search tool for the explicit
request “Run two separate web searches.” The canonical search-intent matcher
covered singular `web search` but not plural `web searches`; the Free router's
required-only policy therefore omitted the tool. The plural phrase now lives
in the shared intent owner, with a red/green detector regression and a Web
request-processor test. Jev selected that narrow correction at confidence
0.97, request
`883598e58a9e3d7d698d8bab2152af1efbecaf56a3aff7ccfdd035bd594d5b42`.
Regenerating the same localhost turn then performed a public search and
requested approval for another. Denying it exposed a second flaw: the loop
asked again via a server-owned fallback before failing. A required Web Search
denial now stops immediately whether the call came from the model or server;
optional-search behavior remains unchanged. A red/green test covers this and
Jev selected the boundary at confidence 1.00, request
`7100af11f9492eaac7b4889941fd5787dd4ddf5fa2c3c231f252a064e350edc4`.
In the live retry, allowing one public search and denying the other produced
one failure with no repeat approval. A further retry allowed both public RFC
searches and completed with 10 sources and both official URLs. Seven adjacent
Web test files pass 170 tests; the shared search test passes eight. The Free
search gate remains open for repeated multi-search reliability, errors,
quotas, and slow-provider behavior.

In a mixed-tool localhost chat on 2026-09-23, a follow-up said “Do not search
the web or run code,” but Free Auto performed a web search and two code calls,
then attached five sources to an unrelated exact-reply answer. The search and
execution phrase detectors had read the negated verbs as affirmative requests.
The shared search intent owner and Web execution intent owner now recognize
explicit opt-outs; automatic tool admission and required tool selection honor
those opt-outs while preserving an explicitly selected Search mode. Jev
selected the intent-boundary repair at confidence 1.00, request
`1175f25c17b831f216182f7153cb8cc05c5748a9ba1e373fd0d0bb1b2a86b092`.
The exact follow-up replayed in the same live chat and returned only
`FOLLOWUP_FREE_OK`, with no activity or source badge; it survived reload. The
five focused Web suites pass 184 tests and the shared search suite passes
nine; targeted lint, Web and search-package typechecks pass. A stale execution
test was also updated to reflect the current Free sandbox allowance. The
opt-out grammar covers common direct phrases but is not a complete natural-
language policy; unusual compound requests still need adversarial testing.

A pinned QwenCloud free chat model accepted an explicit web-search prompt and
created a failed conversation turn before the text-only route refused it.
The composer now derives promotional text-only capability from the canonical
offering, detects explicit search/code requests before Send, disables the
unsupported send, and offers a deliberate Free Auto switch that retains the
draft and uses the existing durable model-selection path. Both promotional
server routes also refuse explicit sandbox execution before provider traffic,
preventing a text-only model from inventing an executed result. Jev selected
preflight with an explicit switch at confidence 0.99, request
`54164e3efad1103511685874c4aa5b8771387d74a03dbb655a3aafd46b4dac15`.
Four focused selection, composer, and provider-route suites pass 156 tests;
targeted lint and Web typecheck pass. In localhost, the QwenCloud flagship promotion showed
the inline warning and disabled Send for the same IANA search, then clicking
Use Free Auto preserved the prompt and admitted the send. The resulting Free
Auto turn returned the official IANA URL and a rendered source citation; the
answer and Free Auto selection persisted after reload. Complex implied tool
intent and all provider-specific tool paths remain open. A second live Qwen
draft requesting Python execution showed the same pre-send guard; after an
explicit Free Auto switch, agent activity showed an actual `print(17 * 19)`
call and stdout `323`. A fresh, ordinary QwenCloud flagship text turn remained
enabled and returned `QWEN_PLAIN_AFTER_PREFLIGHT_OK` via the free pool.

Both promotional Free chat routes could previously accept an HTTP 200 stream
that ended without any visible answer; Experiential Labs also passed a raw
upstream SSE error body to the browser. A shared bounded stream validator now
turns empty, truncated, malformed, output-limited, filtered, unsupported-tool,
and provider-error streams into safe, actionable chat errors without exposing
upstream diagnostics or forwarding provider-authored tool calls. Qwen's metered
route sanitizes untrusted `x_stream_error` frames before validation and settles
an already-finished stream as completed when the validator closes it after
`[DONE]`. Jev selected the shared validator at confidence 0.99, request
`8551cb49b20c86b2a03d2fd0fe82cde7240822db1e54c74fa96815618f6674bb`.
The focused validator and both route suites pass 63 tests, including a provider
that leaves its body open after `[DONE]`; targeted ESLint and Web typecheck
pass. Authenticated localhost turns returned `QWEN_STREAM_VALIDATION_OK` from
QwenCloud and `EXPERIENTIAL_STREAM_VALIDATION_OK` from the Experiential Labs
free route, both visibly rendered with free-pool attribution. The live checks
prove successful streams, not live provider outage, quota, or malformed-stream
recovery; those launch gates remain open.

The pre-send guard still missed a direct request to summarize a supplied URL:
the normal managed path recognizes that as a web fetch, while promotional
routes could previously send it to a text-only model. The explicit URL-fetch
detector now lives in the shared search package and is used by normal managed
tool admission, the promotional composer, and both promotional server routes.
Jev chose that shared owner at confidence 1.00, request
`338dbfacf6921d218970f8bcad4b99932c2e0eaf968508b3f9ec910d619b3d98`.
The Free picker disabled Send for a real IANA URL-summary draft under
Experiential Labs, “Use Free Auto” preserved it, and the ensuing localhost
turn fetched the page and rendered the official IANA citation. The shared
search tests pass 11 cases and six adjacent Web suites pass 210; targeted
ESLint, search-package typecheck, and Web typecheck pass. At a 390-pixel
mobile viewport, the Free picker, warning, disabled Send, and Free Auto
recovery were visible and usable without horizontal page overflow. Ambiguous
mixed instructions about multiple URLs remain an intent edge case, not
evidence of a working fetch in every phrasing.

A localhost Free Auto no-result search on 2026-09-23 first ended with the
generic empty-response error. Retrying showed the separate, observed search
blocker: the account had exhausted its existing 20-search rolling allowance;
the tool result said 20, while the model inaccurately told the user it had used 2. This is not evidence that the search provider returned no results. The
post-tool Free continuation could also expose reasoning-only output before
checking whether the provider ended with an empty answer, preventing its one
safe retry. The bounded pre-answer hold now applies to the first post-tool
Free continuation, discards a clean reasoning-only stop and retries once
without rerunning the completed tool; if the same stream produces an answer,
its buffered output is released in order. Jev selected that repair at
confidence 1.00, request
`bac61871e5202580ddb42a5be7d845ac818eccdeedf27fd57ef4d058d0391d2a`.
Four adjacent tool-loop suites pass 65 tests; targeted ESLint and Web
typecheck pass. A fresh localhost Free
Auto Python sandbox turn actually ran `print(7 * 6)` and visibly answered `42`.
The original empty failure's precise provider trace was not captured, so this
regression is a matched failure class rather than proof of the live root cause.
Search allowance policy and the inaccurate quota wording remain open; the
founder's earlier explicit limit has not been changed without direction.
In a later authenticated Free Auto turn, the allowance refusal accurately
reached the assistant as 20 searches in 30 days, but the UI marked the
unexecuted search as completed. The tool loop now reports plan-bound and
credit-reservation refusals as failed/unavailable tool results, without
calling the search provider or taking away the assistant's ability to explain
the refusal. The two refusal paths pass focused mocked-provider tests. A
separate live retest could not verify the activity card because the Free Auto
provider failed before search (first overloaded, then output-limited). The
founder's 20-search allowance is unchanged, and the same UI still suggested
"Search the web to verify" after disclosing that the allowance was exhausted.
The client runtime now recognizes an unavailable web-search activity entry;
the transcript suppresses search follow-up suggestions and the otherwise dead
"Retry this response with web search" action for that turn. Component, list,
and runtime tests pass. An authenticated localhost turn on 2026-09-23 showed
the 20/30 refusal in Agent activity, answered without claiming a live search,
and no longer displayed the retry action after reload. It did not prove a
working search because this account's allowance remains exhausted.
On 2026-09-23 a pinned QwenCloud promotional Free text route answered an
authenticated localhost chat, then correctly refused an explicit search draft
and offered “Use Free Auto” without discarding it. After the switch, the
exhausted allowance was misclassified as `web_search_no_sources` in the
server-owned path, and the collapsed failure card concatenated the precise
20/30 allowance notice with an unrelated “no usable sources” error. A red/green
server regression now distinguishes unavailable search from successful-empty
search and emits `web_search_not_performed`; the shared activity view keeps the
precise unavailable-tool notice without appending the generic terminal error.
Jev selected the coupled server/UI fix at confidence 0.94, request
`1fd41847c5f9a4554484881efe1f88e4f885bfc91f18349c05d4b6a1c034281c`.
The focused server and shared UI suites pass 64 tests. Reloading the failed
localhost turn showed one concise allowance reason; regenerating it produced
a visibly caveated answer from existing knowledge, not a claimed live search.
Five adjacent Web/shared UI suites pass 123 tests, the client activity suite
passes 28, Web and shared-chat typechecks and targeted lint pass, and the
raw-error-to-user guard reports zero leaks. The regenerated card and answer
survived another page reload. A current read-only QwenCloud Benefits check
also showed the selected text model active, at 98.29% remaining quota with
“Free quota only” enabled, expiring 2026-10-21; that is a point-in-time account
observation, not a permanent capacity or terms guarantee.
The real search-allowance gate remains unsatisfied and no policy limit was
changed.

The composer also offered that Free Auto switch before checking the account's
search allowance, creating a predictable dead end for this exhausted account.
An authenticated, read-only `/api/web-search/allowance` endpoint now reads the
same rolling ledger count and canonical Free limit as search admission. The
Free composer checks it on explicit search drafts; while the check is pending
or exhausted, it prevents a search send without discarding the draft. At the
limit it explains 20 searches in 30 days instead of offering an unusable Free
Auto switch; the switch is also withheld while the check is pending. A count
failure is shown as unknown, not a false claim of
availability; the actual server check remains authoritative. Jev chose the
dedicated read endpoint at confidence 0.96, request
`9168b06a44d7837f512ba54946da8b603e3ad428641f843f8e54a868e92f9aba`.
The client check has a 10-second deadline so a hung read cannot disable Send
indefinitely; two hook tests cover timeout, late response and completed-read
behavior. The search-policy and endpoint tests pass 25 cases, all 107 composer tests pass,
targeted lint, Web typecheck and the hardcoded-endpoint guard pass. Localhost
`:3100` showed the new pre-send 20/30 warning for both Free Auto and pinned
QwenCloud text, with Send disabled and the draft retained; a non-search
QwenCloud Free turn then rendered `FREE_CHAT_STILL_WORKS`. A 390px mobile
viewport showed the warning above the composer without horizontal overflow.
The 20-search founder cap is unchanged, and this account still cannot exercise
a live successful search until allowance is restored or the founder changes
the policy. `check:route-account-gate`, `check:resource-metadata`, and
`check:raw-error-to-user` pass. `check:route-tests` remains red on 14
unspecced page routes against its ratchet of 12; this new API route has its
own test and is not among those 14.

A successful required search with zero hits was also being classified as
`web_search_no_sources` when the server supplied the search call for a Free
model. The tool result now carries an explicit successful-empty status through
the durable workflow contract. A first-step standalone required search or a
server-supplied required search with zero results ends with a deterministic
"I searched the web, but found no results" answer and no fabricated source;
a failed search still takes the existing error path. Jev chose this at
confidence 0.98, request
`6d44affed3ee6d56a9e29a32d651f70ad0b1587c423b85b06b357cb73962b9ee`.
Focused required-search and workflow-contract tests pass. Live zero-result
verification remains gated by this test account's exhausted search allowance.

## WEB-FREE-SANDBOX-2026-09-23

The local Free plan now admits one platform-funded E2B code sandbox with a
10-minute active interval. In authenticated localhost `:3100`, a Free Auto turn
ran Python and displayed actual stdout; a new conversation then ran code, and
a second turn in that conversation resumed code execution and displayed actual
stdout. An earlier Free Auto turn had received a running-session-limit refusal,
so the observed successes do not establish reliability under repeated failures.

The turn-end E2B pause path previously cleared the active interval and settled
usage even when provider pause threw. That could leave a running sandbox holding
the Free user's sole slot while local accounting said it had stopped. The live
executor and session-level pause now use one reconciliation path: check provider
state, retry pause once, or kill and clear the session after a second failure.
If neither pause nor kill is confirmed, the interval remains open rather than
being falsely settled. Jev selected reconciliation at confidence 0.65, request
`2702b91cdbe1ba77d8e0d34b12dc2cbad3e672443236a7a4de78c790fd598032`.

A paused session also kept its already-settled compute reservation. Resuming it
could therefore run another active interval without a fresh Free allowance hold
or paid usage reservation. Pauses now remove that reservation; resumes reserve
again before reconnecting, including legacy paused sessions, and release a new
hold if reconnect fails before a replacement is created. Jev selected a new
hold per active interval at confidence 0.98, request
`8779a64708e001b7e46d9495bcca8fcfaa124136d77eabfb04f221bdec4dd012`.
The focused E2B suite passes 85 tests and Web typecheck passes. Forced provider
pause failures are simulated in tests, not yet reproduced against live E2B.
The Free sandbox launch gate remains open pending repeated live execution,
provider outage/quota tests, and a full new-user workflow.

Another authenticated localhost Free Auto pass on 2026-09-23 ran a notebook
cell computing the sum of squares from 1 through 10. The expanded tool card
showed the actual Python request and `385` result; the assistant reported
`stdout: 385` and exit code 0. A deliberate `ValueError` test first ended
before code execution with a user-facing Free-model overload and retry/model
picker controls. One manual retry ran the cell: the card contained the real
traceback, and the assistant accurately reported no stdout and no process exit
code for the failed notebook cell. This covers one success and one recovered
failure, not sustained availability or automatic cross-provider recovery.

A localhost cancellation test stopped a 30-second Free Auto Python turn while
agent activity said Running code. An immediate new request in that conversation
then exposed a different failure: the model ended with literal
`<tool_call>execute_code ...</tool_call>` markup, which the site displayed as
the answer without running Python. Jev selected a bounded adapter at
confidence 1.00, request
`b4d1263aada47109653a1d78133b546e16631e45db1fd0fc2d4e7ae9ea424675`.
For a Free turn that explicitly requires code, the Web harness now withholds
pre-tool output up to a fixed bound, accepts only a whole-response, strictly
formed textual `execute_code` request when that sandbox tool was offered, and
passes it through the existing approval, quota, sandbox, and audit path. Bad
markup or a missing real tool call yields an actionable error without showing
the markup or inventing stdout. A focused regression proves a fragmented
textual request invokes mocked E2B once and a malformed request invokes it
zero times. Retrying the exact failed localhost turn after the patch produced
actual `CANCEL_RECOVERY_OK` stdout with a Running code activity card; its call
ID shows the model used a native structured tool call on that retry, so the
adapter branch is covered by tests but not yet by a live provider repetition.
The cancellation and immediate successful retry show that the Free sandbox
slot was not stranded in this one case; repeated cancellation and timeout
recovery remain open.

Reloading that successful retry exposed a separate response-variant race: the
failed answer and its replacement both appeared because the server snapshot
created the replacement before the client save, when the legacy conversation
had no active leaf. The later client upsert could not change its parent, so the
replacement was stored as a child rather than a sibling. The completion
request now carries the assistant's intended parent to the server snapshot;
the tenant-scoped save validates the parent, converts a linear transcript
before insertion, and moves the active leaf in the same transaction. Jev chose
this at confidence 1.00, request
`36c4799f03fb614f1e06f4622cf935f3791cb949b710496b9445ff5d58a0033a`.
Focused client/server variant suites pass 30 tests and Web typecheck passes.
A new localhost Free Auto regeneration ran the sandbox again, returned real
stdout, and after reload showed only the selected sibling plus a 2-of-2
response pager. The older test reply remains mis-parented in that test chat;
the fix prevents new writes from repeating it rather than rewriting history.

A negative localhost sandbox test deliberately raised a Python `RuntimeError`.
The tool ran and showed its traceback, but the first Free Auto answer invented
a non-zero process exit code and called the traceback stderr. `execute_code`
uses a persistent notebook cell, which has neither a process exit code nor
stderr for that exception. Its tool description and failed-cell result now
state those semantics explicitly; Jev selected result annotation at confidence
0.98, request
`001fcad610ad5aae22f76ded732779abdfa16eb7f0e362e4d36d25471ea4171b`.
On live regeneration, the same Free route ran the cell again and correctly
said the exit code was unavailable while showing the exception traceback; the
answer and response pager survived reload. The focused tool-loop and E2B tool
suites pass 97 tests. Other sandbox failure and timeout classes remain open.

The same negative test exposed a separate fail-open policy boundary in logs:
when the per-user Cloud code-execution setting could not be read, the tool
treated it as enabled even if the user might have opted out. A successful read
with no explicit opt-out still defaults on; a failed settings read or adapter
construction now refuses execution before provisioning a sandbox and supplies
a temporary-settings-unavailable explanation, distinct from an explicit off
setting. Jev selected fail-closed at confidence 1.00, request
`9cf3f0365315689af8e9249ff5f6f7a282c6906d7e6f8c92b9fd74cdad9a5cc8`.
Three focused policy and tool-loop suites pass 48 tests; lint and Web
typecheck pass. A live Free Auto code turn first hit an upstream overload,
then its single retry ran Python and rendered `POLICY_OK`, showing the ordinary
available-setting path still works. The settings-unavailable case is mocked,
not induced against the live account.

The same authenticated localhost Free account then selected a QwenCloud
free-quota text model and received the exact requested `QWEN_FREE_OK` answer,
attributed in the UI to the free pool. A sandbox request on that promotional
route was blocked before submission with a specific explanation and a
`Use Free Auto` action that retained the draft; using it ran real Python and
displayed `QWEN_PROMO_TOOL_CHECK` stdout. A configured free-router turn also
uploaded a synthetic 47-byte text file, answered its exact `BLUE-HARBOR-27`
canary, and kept both the attachment and answer after reload. The synthetic
local fixture was removed after the check. These are one-route, one-file
happy paths, not proof that every advertised Free model or file type works.
An image attachment of the repository's public logo initially received an
actionable upstream Free-model overload, then a user retry returned the
correct non-white spoke color, `Orange`. That verifies one small PNG/vision
path, while also reproducing the need for a manual retry under provider load.
The configured free router has one same-route transient retry
and a focused overload regression; the observed live overload still required
one user retry, and its server-side attempt count was not captured. Free
provider outage and retry effectiveness remain launch gates.

The Free composer also advertises `Create Office files`. Enabling it in
localhost and requesting a one-row Excel workbook invoked the file workflow,
rendered a 2.4 KB `.xlsx` artifact card, and triggered a browser download when
clicked. The card remained after reloading the conversation. The workbook's
cell contents were described by the model but not independently opened, so
this is evidence for creation, delivery, and persistence rather than verified
spreadsheet content or reliability across formats.
At a measured 390 CSS-pixel viewport, the same long conversation retained
mobile navigation, model switcher, composer, attachment cards, agent activity,
and the Office download link; document scroll width remained 390 pixels.
This checks core layout and accessible controls, not touch input or every
panel. The temporary viewport override was cleared afterward.

In a fresh localhost Free Auto conversation on 2026-09-23, one turn explicitly
requested both web search and a Python sandbox calculation. Agent activity
showed a real code call with `print(17 * 19)` returning `323`, a web search,
and a page fetch; the final answer linked the IANA example-domains source and
reported `323`, with five sources rendered. This covers one mixed-tool happy
path, not concurrent failure, cancellation, provider exhaustion or quota
recovery. A second code call attempted an unnecessary page fetch through
Python and showed an empty result; the dedicated web tools supplied the
source. Whether repeated or long-running mixed turns remain reliable is open.

## WEB-FREE-MEDIA-2026-09-23

The paid image/video composer now reads the authorized QwenCloud free-quota
catalogue, places ready compatible Free offerings above paid routes, labels
each funding source, and hides unsupported size/quality controls for a fixed
Free offering. A paid user's selection sends that exact provider/model through
the existing free-quota route; server-side image/video entitlements remain in
force and promotional chat routes remain Free-only. Focused catalogue, route,
composer and stream tests pass. No paid account has yet exercised this selector
in localhost, so its live paid-user gate is open.

An authenticated localhost Free user selected `qwen-image-2.0` and
`wan2.6-t2v` in the promotional picker. Both generated a persisted file with a
visible `via free pool` attribution. The image rendered inline. The first
video result exposed a bare link; the stream now projects only the exact
server-generated `/api/files/{uuid}` video result into the existing inline
video player, leaving arbitrary links unembedded. A second live Free video
rendered in that player and survived reload. The browser reported a loaded
2.035-second, 1280×720 video with no media error. The video-projection stream
suite passes 65 tests; targeted lint and Web typecheck pass. Jev selected this
projection at confidence 0.99, request
`efcb138dcfe944b8b20ee7b28bdcc31dc3d02aa216341864c70642cd604b5048`.
The Free generation route is locally verified; model-specific quality and
failure behavior, paid selector interaction, and deployment remain open.
The Free account's earlier image/video successes also exposed an entitlement
contradiction: the ordinary Create image/video controls said Upgrade, but the
promotional route admitted every offering category for a Free plan. The shared
offering gate now admits Free chat promotions only, checks image and video
capabilities for paid plans, and governs both catalogue visibility and server
dispatch. The Free picker no longer offers media categories with no eligible
models; a paid account whose catalogue begins with media no longer opens on
an empty chat category. Jev chose this shared gate at confidence 1.00,
request `5f2ef810e0bf2276058bd80ca438b630050d1778d58d59713a32a2efc6de05c7`.
The three focused picker/catalogue/dispatch suites pass 45 tests, targeted
lint and Web typecheck pass. Localhost Free picker showed chat offerings only
after the change. A paid account has not yet exercised the media promotions
end to end, so paid selector and free-vs-paid rendering remain a live gate.

## WEB-EXPERIENTIAL-FREE-2026-09-22

The website candidate now keeps Experiential Labs promotional chat offers in a
separate Free-only provider path. The curated registry contains five eligible
chat offerings; the picker shows only entries confirmed as free by the live
provider promotion feed and this organization's authenticated free-lane
grants. Requests use the provider's explicit `:free` suffix,
reject non-Free accounts and unsupported tools, enforce workspace and retention
gates, and do not fall back to a paid route when the promotion or allowance is
unavailable. The Free-plan content-capture terms are disclosed in the picker,
Terms, Privacy and Subprocessors pages.

On authenticated localhost `:3100`, one synthetic conversation completed a
turn on each of the five offers with the requested marker and a `via free pool`
attribution. Browser resource timing recorded five HTTP 200 requests to
`/api/models/experiential-free/completions`; the conversation is
`29c4b7e1-f796-4825-aa6f-c53e7ac4c145`. Focused route, promotion-parser and
selection suites pass 11 tests; the Free picker and landing suites pass seven,
and legal-surface suites pass 72. Web typecheck and `sync:models:check` pass.
The promotion-parser test first exposed and then closed a malformed-entry
failure that would have turned a provider `null` item into a server error.

On 2026-09-23, a fresh localhost Free conversation exposed drift between the
public promotion feed and this organization's grants: the picker marked one
advertised promotion ready, but the free-only completion returned HTTP 502. A direct synthetic
free-only provider request identified upstream `model_not_granted` (403); the
authenticated `/api/v1/models` list granted only the lightweight and Nemotron
free aliases among the five curated promotions. Both granted aliases
answered direct free-only probes. The catalogue and completion route now use
one loader that intersects public promotions with authenticated `:free`
grants, failing closed if either source is unreadable; send-time validation
protects stale picker selections. Jev selected this approach at confidence
0.96, request
`298d00b26b2b84b873f482ead2fef41452d2217dbb6bbe96f6be336b88a331ed`.
After the change, localhost disabled the three ungranted promotions as “Not
available right now,” left the two granted aliases selectable, and switching
the failed conversation to the lightweight alias produced
`EXP_LUNA_FREE_OK` with `via free pool`. Switching again to Nemotron 3 Ultra
produced `EXP_NEMO_FREE_OK` with the same Free-pool attribution. The
promotion-parser and completion
route suites pass 14 tests; targeted lint and Web typecheck pass. Provider
quota exhaustion, stale grants during an in-flight call and multi-turn
reliability remain open. This is a local repair, not deployment.
In a later localhost Free QA conversation
`d4a8e914-b8d2-4648-ba35-347bb423777e`, the same two granted aliases
answered consecutive exact-reply turns after a QwenCloud turn: the lightweight alias
returned `EXPERIENTIAL_PROMO_OK`, then Nemotron 3 Ultra returned
`NEMOTRON_FREE_OK`. Both replies, their source prompts, the selected Nemotron
model, and the `via free pool` attribution survived reload. The three other
curated Experiential promotions remained visibly unavailable. This is another
live success for the granted pair, not an outage/quota or new-account test.
At a tab-scoped 390×844 mobile viewport on 2026-09-23, the Free chat composer
and model picker remained operable with no document or picker horizontal
overflow; the picker measured 390 CSS pixels wide. The Experiential catalogue
returned HTTP 503 during this pass, and the picker replaced its loading state
with a visible retry control while the QwenCloud Free list remained usable.
A separate new conversation at that phone width sent an exact-reply Free Auto
prompt and rendered `MOBILE_FREE_OK` in chat
`b7844bc6-5eb6-419a-ab9e-4f608a2258fa`; the document still measured 390
CSS pixels with no horizontal overflow, and the answer survived reload. This checks one mobile send and an
error state, not promotional-provider availability or the remaining mobile
workflows.

On 2026-09-22, the promotional route's pre-stream failure copy was tightened:
provider rate limiting now returns a distinct 429 rather than a generic 502,
while exhaustion and other failures explain the retry or free-model choice and
state that no alternate or paid route was used. The focused route suite passes
9 tests; event-access, Free-event overlay, Free web-search admission and
free-quota copy suites pass 118 tests; targeted lint/format and Web typecheck
pass. These are mocked route tests, not a live provider outage observation.
The existing Free event overlay can sponsor selected canonical models within
an explicit time window and global budget, but its required environment
settings are absent locally. The multi-provider free lane is also off, and its
pool records lack verification. Neither mechanism currently supplies automatic
fallback for a manually selected QwenCloud or Experiential Labs promotion.
Admitting additional provider routes requires current quota, terms, retention,
tool and budget evidence; do not turn on the lane or imply tool coverage from
these error-copy tests.

This is local verification, not deployment or a closed Free-user launch gate.
The local server currently uses an in-process `NEXT_PUBLIC_APP_URL` override
for `http://localhost:3100`; that configuration is not saved for a restart.
The full signup, terms-acceptance, account-recovery and paid-upgrade gates still
need end-to-end release verification. `check:model-id-literals` currently fails
on pre-existing prose references in seven documentation files.
The policy-copy digest previously missed a substantive JSX addition to Privacy
because a semicolon caused the extractor to discard the whole prose block. A
red regression now passes after the extractor retains semicolon-bearing JSX
text, and 18 unchanged policy pages have appended same-date fingerprint
migration entries rather than rewritten history. The September 23 Terms copy
and acceptance date now match its ledger. The founder explicitly approved
dating the corrected Cookies notice September 23, which changes the consent
version and re-prompts visitors. Signed-in visitors were exempt from the banner
even when their prior choice was stale, leaving analytics off without asking
again. The exemption is removed; a current choice still avoids interruption.
An already-open tab now closes its banner when another tab records a current
choice; the pending prompt timer also rechecks storage before opening. The
three consent suites pass 52 tests. In headless Chromium on localhost, a
stale record with a simulated session cookie showed the notice; choosing
Necessary only saved `cookies:2026-09-23+privacy:2026-09-22`, and reload did
not re-open it. A 390px viewport showed no horizontal overflow, and the
consent inset reserved space for the card. This was not a real
authenticated-session test. The Trust
corrections are recorded against
their September 21 row review, with all 39 evidence rows passing the independent
guard; neither entry implies a new whole-page review. On 2026-09-23, the
Security page's four changed claims were checked against the current route
prefix contract, connector and built-in-tool audit paths, public Electron
release workflow and download API, and weekly host-neutral restore drill.
Its logging copy overstated completeness: connector writes are best-effort,
and built-in tool events go to a security audit path but not the account
activity feed. The corrected wording and digest are recorded as a targeted
same-date version, without silently presenting August 14 as a new full-page
review. The policy-version guard and 65 focused legal/security tests pass;
localhost `/security` serves the revised text with HTTP 200. This does not
establish a full independent review of every Security page row. Jev selected
this next investigation at confidence 0.95, request
`850f81772b1bec97ef2b9775f8d2306c33db18a11271acd85dbb4167bb4afff1`.
The local production Web build passes with an 8 GiB Node heap. Its first run
with Node's default 4 GiB heap compiled but failed during TypeScript with an
out-of-memory error; the repository already documents the larger Web heap.
The successful build warned that the admin audit-coverage route's dynamic
filesystem sweep traces 5,316 files (about 46.7 MiB of present traced files)
into that server function. This is a packaging-size and deployment-behavior
risk, not a proven customer-facing failure; the route intentionally returns
503 when route sources are unavailable. The local build also logged missing
Redis and Stripe configuration; those logs do not establish production's
environment, so production configuration remains separately unverified.
Jev previously selected
the policy-digest investigation at confidence 0.95, request
`7b678b3b384743d709737a92edc558f872f36bad7eba88d789f0816c012e9cc5`,
and the tokenizer repair at confidence 0.46, request
`9eb02ea79b8e308dc5c413f7da75ef66a27c946e750c600a44bf146b4e3054be`.
The public Desktop download page and Security page also overstated release
status. The public Electron release workflow has no GitHub runs or published
assets; the historical Tauri desktop tag has Linux assets, not a public
Electron installer. A red website regression now passes after download copy
became conditional and Security stopped presenting Tauri's Windows signing
workflow or a universal Mac disk image as shipped public artifacts. Security
also no longer says there is no restore-test evidence: a weekly host-neutral
drill exists, but no scheduled production-data restore test does. Localhost
`/download` visibly showed the corrected wording and no Desktop link; six
focused Web suites passed 143 tests. Jev selected conditional copy at
confidence 1.00, request
`3a68c616862bb32a06a3212f374fb0762b48a8ad07b54ad10a9e0425404371bb`.

## WEB-STALE-SESSION-RECOVERY-2026-09-22

An authenticated localhost session expired on the server while Clerk still held
a client session. `/chat` redirected to `/session-expired`, whose "Sign in again"
link went directly to `/login`; starting Google sign-in then returned Clerk
HTTP 400 `session_exists`, leaving the user at a generic error. The existing
`/login/complete` route already owns a bounded stale-session recovery: it
clears the client session once and returns to login with `authRetry=1`.
The candidate sends the session-expired action through that existing route,
retaining its same-origin return-path validation. A regression failed on the
old link and then passed; the related login-complete tests pass (17 combined),
as do the Web typecheck, targeted lint and formatting. In the live localhost browser, the new
link invoked recovery, returned to login with the retry marker, and Google
sign-in reached the account picker instead of `session_exists`. The full
account-selection and return-to-chat workflow is not yet verified, so this
is a locally repaired path, not a closed launch gate. Jev selected reuse of
the existing recovery route at confidence 1.00, request
`f40f707f81b17f0bcca4051a0add5af413f1759f1319613586f9e40a6de2a197`.

## WEB-DEVICE-AUTH-TOKEN-RETIREMENT-2026-09-22

The local Web auth contract previously recorded two plaintext columns,
`device_authorization_codes.access_token` and `refresh_token`. Current QR and
CLI exchange routes mint credentials without reading or writing either column,
and the currently deployed application commit has no application reference to
them or the old `consume_device_authorization_tokens` SQL function. The local
development table had zero rows and zero non-NULL legacy token values. Production
values have **not** been queried.

Candidate migration `0292` preserves the old function's return shape while
removing its column dependency, then drops both columns. It aborts before any
change if either column contains a non-NULL value. The migration and its down
body were rehearsed inside rolled-back local transactions: pending and approved
function outcomes, one-time consume, no tokens after retirement, schema
restoration, and the non-NULL refusal (`23514`) all passed. The schema-inventory
guard now follows dropped columns in migration order, and the local auth-surface
guard reports zero bearer columns and zero recorded audit gaps. Eight QR and CLI
device-auth route suites passed 84 tests, and the device-auth grant guard
passed. Jev selected preserving the function contract at confidence 0.33, request
`f084aff7192edeb634588cb3dcbe240fdc33a56c6d26b5e7edd8bda744b920a8`;
the low-confidence selection is not safety evidence, so the guards and
transactional probes are the acceptance evidence.

The canonical local migration runner reports 272 applied, 20 pending including
`0292`, and a checksum drift at `0268_conversation_activation.sql`. No migration
was applied through that drifted ledger; the rehearsal rolled back its changes.

This is **not deployed or applied**. Before the release, obtain a read-only
production count of non-NULL legacy values and confirm the serving build has no
column/RPC dependency. If any value exists, stop and resolve its ownership and
revocation instead of dropping it. Then run canonical migration verification and
the device sign-in workflows against the release candidate. Use a clean migration
target rather than treating the drifted local ledger as an apply rehearsal.

## WEB-FREE-ROUTER-EMPTY-2026-09-22

The Free-router production-terms gate is separate from stream reliability.
The draft [free-pool terms workbook](../../docs/research/free-inference-tos-workbook-2026-09-01.md)
excluded OpenRouter zero-price routes because its default provider policy may
admit prompt collection; no pool entry has founder sign-off. That default is
not the website router's current request path: `canonical-request.ts` requires
zero retention for every OpenRouter router, and the provider adapter sends
`data_collection: deny` plus `zdr: true`, with focused regressions for both
halves. [OpenRouter's current routing documentation](https://openrouter.ai/docs/guides/get-started/sovereign-ai)
describes those request filters, but its
[terms](https://openrouter.ai/terms) make customers responsible for the
underlying models' individual terms and allow the available models to change.
The provider's Free-router page says it selects
among the currently available zero-price members. The managed key's effective
account settings and every current or newly admitted member's terms have not
been verified for production third-party serving. The site's stricter request
filters are evidence against the workbook's default-setting concern, **not**
evidence of per-model terms clearance or launch approval. Do not add the router
to the company free-lane inventory merely because live calls work; obtain a
current account/member-terms review or use a vetted fixed free route.

Capacity is a separate launch gate. On 2026-09-23, a read-only
`GET /api/v1/key` using the website's configured managed OpenRouter key returned
HTTP 200 and `free_model_daily_requests: { used: 178, limit: 1000,
remaining: 822 }`; the deprecated `rate_limit` object reported no useful
ceiling. [OpenRouter's current limits documentation](https://openrouter.ai/docs/api_reference/limits)
says the free-model counter is account-scoped, additional accounts or keys do
not increase capacity, and some exempt accounts/endpoints report a policy
counter that is not enforced. This response therefore does **not** prove the
site has an enforced 1,000-request/day cap, nor does it prove an exemption or
launch-scale capacity. A tool-assisted chat may require multiple model
requests, so the reported policy counter alone is plainly insufficient
evidence for thousands of Free users. Verify effective account treatment,
upstream per-minute and per-member capacity, permissible production serving,
and a load-tested all-free route pool before a public launch. Do not work
around limits with extra keys or quietly use paid inference.

The configured OpenRouter free route sometimes returns a successful upstream stream
with `finish_reason: stop` and no visible answer. A short response budget could
also be spent entirely on hidden reasoning; the catalog now gives this route a
1,024-token response floor, and the website only offers its web-search tool
when the turn needs search. A localhost search completed with five sources and
zero pending approvals, but an unrelated exact-reply turn still produced the clean
empty response after those changes. The error remains intermittent, not fixed.
On 2026-09-22, a repeat of the public IANA search in localhost returned a
maximum-output-length failure, so the free route's live search reliability is
also unproven with the new budget floor.
On 2026-09-23 another short, authenticated Free Auto search failed first with
an upstream overload and then, on user retry, with a maximum-output-length
error before search ran. The provider's current Free Router page says it
randomly chooses among compatible zero-price Free models, so a single
member's reasoning behavior cannot be assumed for every turn. Jev selected
a one-time pre-answer output-limit retry with a doubled output budget, capped
by the catalog's model output limit, at confidence 0.59 (request
`94ae4252040d01d04b09c37f35e692844a9b09dc038782c53e74d18f1f016a09`).
It applies only to the configured same-route Free router's first provider
step, when no public answer or tool action was emitted and the user supplied
no explicit output cap. Focused tests confirm the larger second request,
discarded first reasoning, no provider/model change, one-retry bound, and
explicit-cap behavior. A further localhost retry still ended at the output
limit. The actual upstream member and both attempt budgets were not captured
in that browser run, so this is a bounded mitigation, not a verified root-cause
fix or a passed search-reliability gate.
On 2026-09-23 a fresh localhost failure was captured with the server console
attached for request `agi.chat.web.send.621c6364-2c8b-4129-89ee-efb488a3e745`.
OpenRouter selected the catalogued InclusionAI medical free variant through
Novita. The request's 4,096 output-token cap was fully consumed; the raw stream
had 38 reasoning frames and zero content or tool-call frames, then stopped for
length before search. The generated Free Auto catalog had no model-specific
output maximum, so its 4,096-token default also prevented the bounded retry.
[OpenRouter's current model catalog](https://openrouter.ai/api/v1/models)
lists a 32,768-token completion maximum for that selected member; its public
models API currently lists 23 zero-price non-router models with published
maxima of at least 8,192, though the Free Router page counts 27 members and
membership can change. Jev selected an 8,192-token Free Auto catalog ceiling
with the existing one-time same-route retry at confidence 0.96 (request
`e3fd3f73ce28462aa017f74ef6dfa04d37e1d0936fa52a019abab1e6477414a2`).
The catalog was regenerated, sync/integrity checks and focused retry tests
pass. The first browser regeneration after that change completed with an
honest search-allowance refusal, but did not exercise the larger retry; live
reliability is still unproven. No paid inference fallback was added.
The same Free budget edge exists after a tool has completed. A reasoning-only
Free continuation that stops for output length now receives at most one
same-route continuation retry with a doubled, catalog-bounded output cap,
provided no user cap was set and no provider lines reached the client. The
completed tool result is reused; the tool is never executed again for this
retry. This extends the prior clean-empty-stop continuation recovery. Jev
selected this at confidence 0.99, request
`434dea7329ce861b51bf5a6fd60af3ce991becbf0599228057522271b19fd273`.
The red/green E2B-mocked regression checks budget expansion, unchanged tool
messages, a single sandbox execution, explicit-cap behavior and the one-retry
bound; the two focused tool-loop suites pass 52 tests, with Web typecheck and
targeted lint green. No live output-limited post-tool stream has yet exercised
this branch, so its real-world effectiveness remains unverified.
An authenticated localhost Free Auto sandbox request in chat
`08f8f907-9df7-4645-8794-7fc90ccf44da` first failed before tool execution
with the actionable upstream-overload message. The UI's Retry regenerated the
same prompt, ran `print(7 * 6)` once in the sandbox, displayed stdout `42` in
the expanded execution card, and retained the answer after reload. This
verifies a real recovery workflow, not reliable first-attempt availability;
the Free provider overload gate remains open.
The web provider path now records an empty turn's sanitized post-adapter stream
shape: chunk/text/thinking/tool counts, the selected upstream route, reported
token counts and pre/post-assembly text lengths, correlated by request and
attempt IDs. It does not log prompt or response content. Adapter and tool-loop
tests pass, but at that stage they had not captured a real Free Auto failure or ruled out
an adapter-side drop of raw provider frames. An earlier direct probe with a
different available local OpenRouter key returned 401
from the [official current-key endpoint](https://openrouter.ai/docs/api/api-reference/api-keys/get-current-key).
That was not the credential used to start the localhost server; direct probes
through the latter succeeded as recorded below.

On 2026-09-22, [OpenRouter's current reasoning documentation](https://openrouter.ai/docs/guides/best-practices/reasoning-tokens)
confirmed streamed `reasoning_details` and a `reasoning` field. Eight direct
public-prompt Free Auto streams through the website's credential all returned
visible text, and every one carried `delta.reasoning` but no
`delta.reasoning_content`. The shared OpenAI-compatible translator previously
read only `reasoning_content`; a focused regression failed on that observed
shape. It now accepts either string alias once, with the provider's raw frame
counts still kept content-free. The 160 OpenAI-compatible and 52 OpenRouter
package tests, both package typechecks, the web typecheck, focused web stream
tests, targeted lint and the stream-protocol guard pass. A post-fix live adapter call
returned four public text characters and 175 thinking characters in 45
thinking chunks from a stream whose raw shape counted 175 reasoning characters.
One authenticated localhost Free Auto turn then returned the requested `PONG`
without a visible error, and that answer survived a full reload.
This fixes a proven adapter drop, **not** a proven cause of the intermittent
empty answer: none of the direct streams reproduced a clean-empty stop. The
website's earlier same-route retry deliberately excluded a step that streamed
hidden thinking, leaving a reasoning-only clean stop without recovery. Jev
prioritized capturing live upstream evidence at confidence 0.58, request
`8800424fed830aa12fe9de90a8209417b1eb01d25df39bbde10d9ca46cb36e8e`,
then selected the documented alias correction after that evidence at
confidence 0.78, request
`081d6b38d69f3392a48c08a5221df88cce43434e05ce739575f124a7b21233f7`.
The website now holds the first configured same-route attempt's pre-answer
stream within a 64 KiB cap. If that attempt stops cleanly with only reasoning,
it discards the unreleased trace and retries the exact same route once. A public
answer, tool activity, or buffer overflow releases the trace in order and
prevents that retry; refusals and output-limit stops remain errors. A focused
regression first failed on the old path, then passed with the change. The 27
focused web tool-loop tests and 26 route/failover tests, web typecheck,
targeted lint, and stream-protocol guard passed. Two ordinary authenticated
localhost Free Auto checks then
completed: an exact `PONG` reply and a web search that returned five IANA
sources with zero pending approvals. Both answers and the canonical search
activity survived reload. These successful turns did **not** exercise the
new retry or establish a live failure rate, so the Free-user chat launch gate
remains open. Jev selected bounded buffering and same-route retry at confidence
0.69, request `434df062061a61de79fcdae8ac707855c65b5acfca25f7b1166a680abaf6a06e`.
A candidate also carries bounded, content-free counts of upstream
OpenRouter frames, content, reasoning, reasoning details, tool calls and finish
signals into the existing empty-turn trace. It also reports those counts before
an unterminated stream error escapes. Provider, web stream-sink and strict
workflow-schema regressions pass; package and web typechecks, targeted lint and
stream-protocol guard pass. Nine follow-up public exact-reply Free Auto chats
completed before this candidate, and one post-change localhost turn completed
with no diagnostic fields on the client wire. No live empty turn was captured,
so neither the raw-versus-adapted comparison nor general reliability is proven.
Jev selected the bounded trace investigation at confidence 0.57, request
`4fac27cf1520886796e94257368534384eb2ebddeb87a15e7f9e64b2df4d47af`.
An authenticated localhost Free Auto turn with a public exact-reply prompt then
failed with the app's upstream-overload message. A separate fresh-chat probe
returned the requested `PONG` text but marked its first response interrupted;
three subsequent attempts to the same public prompt completed. The completed
attempts also ended their browser network request with `ERR_ABORTED`, so that
network event alone does not explain the first failure. The interrupted first
response remains visible as an incomplete variant. These observations do not
reproduce a clean-empty turn or pass the Free-user chat launch gate.

A later localhost batch exposed a separate failure before inference: two new
conversations could not start because `POST /api/chat/conversations` returned
HTTP 429 (`RATE_LIMIT_EXCEEDED`, `Retry-After: 60`). The 60/min conversation
mutation bucket was also charged by repeated conversation-detail, branch-list,
and sync-pull reads. A candidate moves those three reads to a separate bounded
120/min bucket while leaving the 60/min write bucket unchanged, and preserves
the retry-window message instead of replacing it with a generic start error.
The web typecheck, focused hook and rate-limit tests, and affected route tests
pass. Five independent localhost Free Auto chats completed after the change;
the captured browser network sample contained no chat HTTP 429s. This is a
local regression check, not proof of sustained provider or launch reliability.
Read amplification remains to be measured and reduced independently. Jev
selected the separate read bucket and rate-limit-specific retry copy at
confidence 1.0, request
`63f3d349eaa0b4736c0afdd98939c4497cc4e45a812378137a1ad414e614aa3d`.

A candidate now permits one same-route retry for this catalog entry when a
transient overload or connection reset occurs before any line is released to
the client, or when the first provider step cleanly stops before any public
answer or tool activity. Leading reasoning is held only within the bounded
first-attempt window described above.
It does not retry after released output or side effects, a positive retry-after,
quota, refusal, or a later tool step; it does not cross into another provider.
The route, tool-loop, failover and strict workflow tests pass, along with the
web typecheck, model-sync check, targeted lint and retry/stream guards. The
candidate has **not** yet been shown to trigger on a live Free Auto failure;
the false-interrupted first response happened after text was visible and is
outside this retry's safety window. Jev selected the bounded same-route
approach at confidence 0.77, request
`27267bc91ce3a7abf0a6df32ad7a8f0d83862ca3152c126dd01fe71be966b43a`.

A fresh localhost IANA search initially failed with the generic no-response
notice. Its server log identified a different deterministic defect: the
provider step returned a sanitized `providerTrace`, but the strict durable
workflow result schema rejected that unrecognized field and discarded the
whole result. The candidate adds the trace to the typed result and strict
schema, with a full-shape regression fixture. The same public search then
completed with five sources and zero approval prompts. While it streamed,
the activity stayed collapsed; after completion, the expanded search row
showed its icon and `Done` inline with a separate Copy control. This proves
that local workflow, not general Free Auto reliability.
The shared row now exposes keyboard focus and a visible 44×44px Copy target on
coarse-pointer devices. A localhost check at 320px found an 8px gap between
`Done` and Copy; the activity timeline, inline tool, and file-diff tests passed
(97 tests), as did the shared-package typecheck and targeted lint.
The first successful conversation lost its canonical activity row on reload,
leaving only legacy `Tool run complete` entries. Readback showed
`agentActivity.status: completed` with zero entries: generic projection of a
5,516-character search trace into the 4,000-character activity budget removed
its sole step. A bounded projection now retains the latest tool step, source
identities, and pending approval identity while discarding bulky snippets.
The focused projection regressions pass. A fresh localhost Free Auto search
completed with five sources; after reload, its canonical `Searched the web · 5
sources` summary and expanded inline search/Done row survived, with Copy
separate. This verifies this local readback path, not broader route reliability.
Jev selected bounded projection over raising the metadata cap or adding a
separate journal at confidence 0.98, request
`a0e4bbd1f972d5dd96be4d175c9fa5c16e3fb9845a4bb18423779496cbcf9275`.

A separate tool-loop regression proved that a partial answer with no terminal
signal was marked complete. The candidate now keeps the partial text, emits a
classified `stream_interrupted` error, and terminates as an error without
retrying after visible output. The focused test first failed on the old code
and passes after the correction; this is not yet tied to the intermittent live
Free Auto case. Jev selected this treatment at confidence 0.99, request
`0cef603c4d9dc12191010e9381d0befaf342e5f4895e09814b099f4f26020fa1`.

Exact model selections intentionally do not rotate into other providers, and
QwenCloud's promotional free-quota models have a separate quota and tool
contract. Do not silently cross those routes. Next: obtain a reproducible
live provider response/route trace for both clean-empty and interrupted-after-
text cases that excludes application-side dropped chunks. Test repeated
ordinary turns, tool turns, quota exhaustion and refusal separately; measure
live failure rate before calling the route reliable.

Five fresh authenticated localhost Free Auto exact-reply chats on 2026-09-22
returned `PONG`; none reproduced the intermittent failure. A synthetic provider
stream did expose a separate recovery bug: one reasoning frame was held for a
safe first-attempt retry, then the stream disconnected, but the tool loop marked
that held frame as already delivered and skipped failover. The red regression
now passes after retry safety tracks released lines rather than ingested lines.
A second red regression showed that the real failover plan rejected connection
resets even under that no-release condition; it now admits one same-route
connection retry. A visible partial answer still cannot retry. The focused
tool-loop, incomplete-turn and failover suites pass (112 tests), as do web
typecheck, targeted lint/format and the unsafe-retry, retry-semantics and
stream-protocol guards. The generated `contract-registry.json` was refreshed by
its owner script, and the agent-context and repository-organization guards now
pass. The full operability chain currently stops at 18 undeclared, unreachable
Web support modules in `check:surface-reachability`. The independent LLM-failure
guard's undeclared skip in the opt-in live-latency test now has its required
inline annotation, and `pnpm check:llm-failures` passes. No
live connection reset was captured, so this repair is code-verified only and
the Free-user launch gate remains open. Jev chose released-line tracking at
confidence 1.00, request
`1cf227bc90bb4824097102ddd2f866842412c945d3b4c0203c11174cad972b17`,
and the bounded connection retry at confidence 0.96, request
`df5e692e9d79b321a3fea789f4af0c98fd22dea9579956d0a3afe52cc75f98d0`.

The current reachability check identifies exactly 18 undeclared files in the
deliberately unmounted Web support widget. The Web v1 launch record specifies
email-first support and no widget mount, so importing the widget solely to
satisfy the graph check would change the public bundle boundary. Jev returned
an inconsistent probability distribution when asked to choose between a scoped
intentional exception, removal, and a gated mount; that choice is paused pending
review rather than treating a failed decision as authorization.

An authenticated, strictly sequential localhost Free Auto check in chat
`9554ee10-74f9-4b3b-b06f-720afab02825` completed seven exact-`PONG` turns
but failed on turn 4: the model unexpectedly requested `url_fetch` for
`https://example.com` on an ordinary exact-reply prompt, and a later provider
step ended with the free-model-overloaded message. This is not the clean-empty
failure. The web composer sends ambient `web_search: true` and `web_fetch: true`;
the server's required-only catalog policy withheld search from that ordinary
turn but still offered URL fetch. A new integration regression, bound to the
authenticated Web surface rather than an unbound test token, failed on the
extra `url_fetch`. A candidate now applies the same required-only admission
policy to fetch: the tool is offered when search is required or the latest user
turn explicitly asks to read a URL, while other model/API behavior is unchanged.
The request-processor suite passes (64 tests), as do web typecheck, targeted
ESLint/format, stream-protocol and unsafe-retry checks. A fresh localhost
exact-`PONG` turn in chat `3a57b4f4-f0ee-420f-a316-9e2048d13b16` completed
without a tool call despite the client still sending both ambient flags. The
unit regression proves the server-side tool list; that single live answer does
not prove a failure rate. Jev selected the server admission boundary at
confidence 0.83, request
`88c6ff47507b5913b20e83fef1939e5220b3a0f7e51b286d08d8ffc7a51ae8f4`.

A later authenticated localhost public IANA search captured a real clean-empty
provider step. The configured OpenRouter free router selected an Inclusion AI free
model through Novita and emitted 22 raw data frames: 20 reasoning frames (205
reasoning characters), zero content frames, zero tool-call frames, and two
finish frames. The adapted trace likewise had zero public text and zero tool
starts while the provider reported a normal `stop` finish (39 output tokens,
52 reasoning tokens) on attempt 1. This rules out a dropped text frame in the
adapter for this occurrence. The server later performed a five-source search,
but the subsequent continuation ended with the visible free-model-overloaded
error. The Free-user search and chat reliability gates therefore remain open.
This is one observed provider-route failure, not a measured failure rate.
Jev selected live provider-failure capture at confidence 0.62, request
`ed09cf24317509c31d004afe1a91b224d2a050327fe571056445e44c9962b6ce`.
For repeatable localhost diagnosis, the Web logger now accepts the development-
only `AGI_DEV_LOG_FORMAT=json` opt-in; default development formatting and
production behavior are unchanged. The wrapper exposes only content-free
provider-step and empty-trace fields. Focused logger/redaction tests (nine),
targeted lint and formatting pass. Jev selected that logging approach at
confidence 0.89, request
`c110471beea3ef2747141d40f76f3c110bdbfdaa08e84c8ae5ecf5ea5dc857e9`.
The [current QwenCloud free-quota rules](https://docs.qwencloud.com/resources/free-quota)
state that quota expires or depletes, pay-as-you-go can follow, and the
`Free quota only` stop is disabled by default. Built-in tool fees are outside
the token quota. A local account-bound verification file matches the current
development API key, but was checked on 2026-09-20, covers only two offerings,
and exceeds the configured one-hour evidence window. Consequently, its
catalogued promotional offerings are not eligible as an automatic Managed Free
fallback on this evidence; current remaining quota, stop protection for each
intended offering, production account-key matching and tool contract must be
verified first.

The founder reported on 2026-09-27 that `Free quota only` is enabled in the
QwenCloud account. This confirms their intended setting, but does not identify
the covered offerings or bind the deployed API key to that account; a current
account-bound quota verification and mobile inference run are still required.

Mobile now reads the same account-scoped Free catalogue as Web when its Cloud
model picker opens. Only server-ready promotional chat offerings appear and a
send refreshes that catalogue before using the dedicated Free completion route;
it cannot fall through to the billed managed-chat endpoint. The route requires
a server conversation, which mobile verifies or creates before sending. If
another device has deleted the conversation, the create route now refuses its
tombstoned ID with HTTP 409 and mobile stops before appending or streaming the
turn, asking the user to start a new chat. Focused server and mobile tests cover
that recovery. The mobile Free text and image paths have type, lint, catalogue
and transport tests, but have not passed a live signed-in Qwen send on a device.
Mobile now refreshes the account-scoped catalogue before every promotional Free
chat send, even if a prior picker load showed the offering ready; if the
refresh fails or the provider-funded quota has closed, it stops before starting
the turn. The focused catalogue, send-strand, and stream-routing tests pass.
Qwen availability remains
blocked by the account-bound quota and hard-stop verification above, so this
path must not be advertised as live until the provider settings, deployment,
and an actual mobile turn have been checked.

The mobile capability-switch refresh now runs only with an active Cloud account,
Cloud access, and Cloud Mode. Local Mode no longer attempts a managed-host
request on mount or resume; an in-flight response is discarded after account
change or cache clear, and sign-out clears the cached switches. The focused
capability and teardown regressions pass. This does not close the signed-in
device inference or provider quota gates above.

A fresh localhost QA run on 2026-09-22 isolated a separate configuration
blocker before inference. The QA ticket established a client session, but the
server initially rejected it because this port-3100 process had no local Clerk
authorized party; its fallback was the production origin. Restarting the local
server with `CLERK_AUTHORIZED_PARTIES=http://localhost:3100` made the server
recognize the session and opened the composer. The subsequent OpenRouter Free
Auto send returned HTTP 401 `provider_credentials_rejected`; the same local
`OPENROUTER_API_KEY` returned HTTP 401 from OpenRouter's documented read-only
current-key endpoint. This is evidence of a rejected **local credential**, not
of a new model empty-response occurrence or the deployed credential's state.
The QA account used by this harness is paid, so even a successful retry would
not prove the Free-plan launch path. The live latency spec now asserts client
session, browser session cookie, and server recognition before sending, and
reports only the classified API error on failure. Jev selected this diagnostic
at confidence 0.59, request
`9abf5915a7634027f571a766cf94c4efcd669fe0ed21d3c24b5f9721702d49c1`.

On 2026-09-23, a new focused regression reproduced another empty-output edge:
the Free router emitted only whitespace followed by a clean `stop`, but the
pre-answer buffer released the whitespace as though it were an answer and
therefore skipped its configured same-route retry. The bounded hold now waits
for non-whitespace public text or tool activity, preserving leading whitespace
in order when a real answer follows. The 64 KiB release cap still prevents a
retry after any buffered data has crossed the client boundary. Four focused
empty-response, tool-loop, managed-failover and agent-stream suites pass 162
tests. A separate code-execution regression shows
a whitespace-only post-tool continuation retries once without re-running the
sandbox command. Jev selected the bounded hold at confidence 0.97, request
`4cced92b07c46b254014673ad295e6704614b5e9e921c819983f77e7d1341b68`.
This is a fixture-proven edge-case fix, not a live resolution of intermittent
Free Auto emptiness or upstream overload. The current signed-in QA session is
at a new Terms acceptance gate that the user must review and accept before
further authenticated browser tests.

On 2026-09-23, a fixture reproduced a separate provider-failure route: an
adapter can report an overload inside its stream as `x_stream_error`. The tool
loop then counted that attempt as a route success and ended the turn, even
though an eligible pre-answer fallback route existed. A local candidate now
holds first-step pre-answer frames under the existing size bound, preserves
the adapter's structured error class in the server-only step sink, raises the
reported failure inside the provider operation, and uses the existing
bounded failover plan. A durable failed receipt retains that class for replay;
a partial answer already shown to the user is not replayed. Red/green tests
cover pre-answer rotation, route health, partial-output containment,
classification preservation, and durable receipts. A safety refusal remains a
refusal even if its error text resembles overload; it is not rotated to another
route. For a Free Web continuation after a completed tool call, a transient
connection, timeout, server error, or overload before any released answer now
gets one same-route retry with the existing tool results. This does not
re-execute the search or sandbox, cross providers, ignore a positive Retry-After,
or loop after a second failure. Negative tests cover each of those boundaries
and partial-answer containment. Nine relevant Web suites pass 153 tests; Web
typecheck, targeted ESLint, formatting, stream-protocol, unsafe-retry,
LLM-failure, raw-error-to-user, and log-hygiene guards pass.
Jev selected the investigation at confidence 0.52, request
`886623ad7b2cf24510b9783d3c034be40cf015269ba59e8036b768e821338035`,
and the provider-step repair at confidence 1.00, request
`752698eadd03f23eceffe88ae20f277812d45836e326b1f084faa982c3e14628`.
Jev selected the bounded post-tool same-route retry at confidence 0.96, request
`9240984aa16f1419072c8afb775852e3aa73b3c2469d67178f433d1fa0860607`.
This is fixture proof, not a new live Free search pass. A continuation after
an executed search remains provider-bound by the current tool transcript
policy; the observed post-search overload, invalid localhost OpenRouter
credential, and signed-in browser Terms gate keep repeated live Free search
verification open.

## WEB-FREE-SEARCH-ADHERENCE-2026-09-22

The next turn in authenticated localhost chat
`3a57b4f4-f0ee-420f-a316-9e2048d13b16` explicitly requested a search for
the official IANA Example Domains page. The browser request carried
`web_search: true` and `web_fetch: true`, and the completed HTTP 200 SSE stream
had 16 frames, nine content deltas, zero structured `tool_calls` deltas, and a
normal network completion. Its public answer was literal
`<tool_call>web_search ...</tool_call>` text, with no source or executed search;
the UI correctly labeled it an answer without live sources. This is a separate
Free-user launch blocker, not evidence that the new URL-fetch admission rule
removed the search tool. Request-processor tests prove that required search
and explicit URL fetch remain offered. The tool loop currently buffers and
retries one ungrounded required-search answer but releases an ungrounded second
answer; its test explicitly encodes that behavior. The live transcript proves
the final text was not a structured tool call, but does not identify which
upstream free model produced it or prove whether the one retry ran.

OpenRouter's Free Router page currently documents feature filtering for
tool-calling requests, not a guarantee that
every selected model will issue a valid tool call. Jev selected a deterministic
platform search before answer generation, reusing the existing tool approval,
charging, source and audit path rather than parsing provider-authored pseudo
markup, at confidence 0.59, request
`04dd5a875616eadecedd34d10269f633cff2aedc3e3c1f85338903289da197ea`.
Further inspection found that deriving a platform search query from the full
user message could disclose private context, and a synthetic pre-search needs
to preserve Ask/deny and tool-result adjacency across the durable approval
checkpoint. With that evidence, Jev selected a narrower fail-closed increment
at confidence 0.46, request
`176560ffac90fbe1efb581d463cd5602695efbebf18f68cbcc4a97a9c8d2312b`.
The Free Web required-search loop now withholds an answer until search is
observed and emits `web_search_not_performed` if the provider finishes without
one, including after its existing retry. Regression tests cover ignored forced
choice, pseudo tool-call text, and ordinary Free answers. This does not make
the search execute; deterministic search with privacy and approval handling
remains open. An authenticated localhost retry of the same public IANA search
after this change ended in `Response failed`; Agent activity said the search
did not run, and no pseudo tool-call answer appeared. That verifies the
fail-closed behavior in the live UI, not successful search. Until a real search
request executes and the final answer cites delivered sources in repeated
localhost checks, this launch gate is open.

Later on 2026-09-22, Jev selected a server-owned fallback through the existing
`web_search` tool path at confidence 1.00, request
`3015bc3280da36f1ec137799308152df76a413d05b98ab6a92e42ca9b7eaabe4`.
When the Free Web route produces an answer instead of a required structured
search call, the loop now discards that answer, builds a bounded query from
only the current user turn with recognized secrets redacted, and submits a
deterministic search call through the same approval, permission, charge,
source, audit and durable-resume path. A rejected or blocked call and a search
with no usable sources fail closed; the fallback is excluded from model
tool-calling success metrics. Focused search, approval-resume, permission,
request-processor and citation tests pass (111 tests), as do Web typecheck,
targeted ESLint, stream-protocol and unsafe-retry guards. An authenticated
localhost Free Auto search in chat
`3a57b4f4-f0ee-420f-a316-9e2048d13b16` returned five source links and a
one-sentence answer citing the official IANA Example Domains page, with no
browser console errors. That is one successful live turn, not a measured
reliability rate. Repeat search, approval, failure and reload workflows remain
necessary before this launch gate can close. The QwenCloud promotional routes
were not enabled as a managed fallback for this repair.

That live run also exposed a separate over-broad requirement: after two
search turns, an ordinary exact-PONG follow-up inherited `research` from
conversation-sticky routing and was wrongly required to search. The browser
request had ambient `web_search: true`, but no current-turn research request.
Jev selected current-turn research intent as the requirement boundary at
confidence 1, request
`5bad63fcd7d7065237596b299c2d28097cb5dc245e3e9a966f060ff92e78adb3`.
The request processor now retains context-aware task type for routing while
deriving mandatory research search from the current user turn or explicit
research mode. A red/green regression preserves this distinction; the same
localhost conversation then completed a new PONG follow-up successfully.
The later live IANA failure recorded above proves that a search can execute
through the fallback yet the answer continuation can still fail under upstream
load; search execution alone is not a pass for this launch gate.

## WEB-CITATION-MAPPING-2026-09-22

A localhost IANA web-search answer numbered its own five-link list differently
from the search tool's canonical Sources order. The shared renderer linked bare
`[n]` markers by canonical position, so a prose marker could open another page.
This is distinct from `AGI-16`, which concerns provider redirect URLs. A local
candidate now reconciles a numbered source list against the delivered URLs,
including adjacent markers such as `[1][2]`, before creating numeric citation
links. If a listed URL, number, or prose marker cannot be reconciled without
ambiguity, the numeric markers stay unlinked; explicit source URLs remain
clickable. Streaming answers do not link numeric markers until the answer is
complete, and the Sources grouping reads the reconciled numbers.

The focused web source and MessageBubble suites pass (155 tests), shared
markdown render/stream suites pass (56 tests), both affected package typechecks,
targeted ESLint and formatting pass. An authenticated localhost Free Auto IANA
search in chat `44ca74bb-f114-4118-9947-6dff88c68872` completed and survived
reload. Its own numbered URL list included an RFC page absent from the two
delivered IANA sources; after the candidate update and reload, prose `[1][2]`
stayed plain text while the explicit URLs remained links, and the known
Reserved Domains link used Sources-panel number 2 rather than the provider's
duplicate annotation position 3. The earlier exact wrong-page case with a
fully reconcilable but reordered list has test proof, not a live replay; do not
count it as fully live-verified until that click is observed. General Free Auto
reliability remains a separate launch gate. Jev selected this correction at confidence 0.98,
request `bc2435ed20082ac57bdb14aa18fe7b29a10da89f3fff479ee9b56f2ca2342927`.

## CI-WINDOWS-RUNTIME-2026-09-20

Main CI `35505437427` verified both Windows embedded manifests and passed all
2,667 CLI tests. Desktop execution reached 5,266 passes, 180 failures and 46
existing ignores. Most failures share a production COM defect: initialization
occurred once per process while UI Automation interfaces moved across threads.
Separate production path failures expose ordinary/verbatim Windows prefix
mismatches and traversal checking after canonicalization erased parent segments.
The candidate confines native COM interfaces to an owned MTA worker and shares
Windows-aware deny comparisons while preserving each caller's policy. Independent
review also reproduced dangling symlinks bypassing both nonexistent-write validators;
the candidate rejects unresolved links and retains valid resolved-link behavior. Remaining
failures use Unix-only paths, shell syntax, unsupported sandbox/archive assumptions,
process-global HOME mutation, or plaintext fixture connections held open during
encrypted migration. Correct these fixtures without weakening production guards.
Windows module/test cross-compilation and 114 local affected tests pass; native
Windows runtime revalidation is still required. Run `35509236785` compiled the
candidate, but a Windows-only Piper test used a string method directly on an
`anyhow::Error`, so the desktop test executable did not finish compiling and no
native desktop tests ran. The corrected assertion compiles for the Windows target,
and all seven Piper bundle tests pass locally. The same run exposed one Linux Git
error-message assertion after 5,355 passes; its traversal and repository-escape
cases are now separated, with eight focused cases passing. macOS, all-feature
Clippy, JavaScript tests/builds, browser E2E/accessibility and security jobs passed
on the same remote commit. CodeQL completed with zero open code-scanning alerts;
Dependabot also reports zero open alerts. A fresh push must verify the complete
Linux and native Windows jobs. Codecov connection and deployment review remain
separate blockers.
Evidence: `/tmp/agi-windows-d6def-clean.log`, `/tmp/agi-windows-uia-check.log`, and
[deployment handoff](deployment-handoff-2026-09-19.md).

## CI-NATIVE-CACHE-2026-09-20

The four explicit Rust caches in `.github/workflows/ci.yml` target
`apps/desktop/src-tauri/target`, but Cargo's workspace output is root `target`.
Windows run `35503385094` restored a 305 MB registry/source cache for the wrong
path, plus a separate setup-toolchain cache for the correct root path containing
only 1,357 bytes. Both immutable entries then reported up to date. This supports
avoidable cold-build work, not a claim that all native runtime is cache overhead.
The current run uses a changed lockfile hash, so its implicit root cache may
populate correctly. No timeout or cache-caused correctness failure was observed.
Consolidate cache ownership around Cargo metadata's actual target directory in
a separate performance change, with one cold/warm comparison and no relaxed
checks. Escalate only if cache behavior blocks the current correctness run.
Evidence: `/tmp/agi-windows-9c24-clean.log`, job `106059036315`, and
`.github/workflows/ci.yml` cache declarations.

## CI-COVERAGE-GATE-2026-09-20

The Priority Level 1 coverage step hid 462 failed tests in run `35499143990`
with `|| true`. Root execution mixed Vitest versions and package working
directories; the intended 75% line threshold also used an invalid option.
The package-owned runner repair preserves all 23 projects and existing package
floors, propagates failures, and merges fresh reports. The full run measured
79.79% aggregate coverage with 33,710 passing tests and three stale signup-fixture
failures. Those three now pass in a targeted rerun. Routing and sync package-floor
gaps also pass after meaningful boundary tests. Remote run `35505437305` measured
79.79% and exposed two web failures: missing Chromium and 64 MiB fixture compression
exceeding the test timeout under instrumentation. The follow-up installs Chromium
and uses a measured 256 KiB fixture above the same ratio ceiling; all 12 focused
browser/security cases and 20 harness checks pass. Run `35509236745` verified
Chromium and measured 79.8% repository line coverage with every package floor
intact. Its only test failure was a second archive fixture that spent the 5-second
budget DEFLATE-compressing eleven 2 MB members before checking their declared
expanded size. That fixture now uses ZIP STORE while preserving the same
eleven-member, 22 MB declared expansion and the unchanged production limit; its
focused rejection completes in 0.7 seconds. Jev selected this fixture-only repair
at confidence 0.98, request
`855208cf0b37b707aaa016f53037c7edae63d5c959262bb49d5bc565032f1965`.
Fresh remote coverage revalidation is required.
Codecov accepted GitHub OIDC issuance but rejected repository lookup with HTTP 404
`Repository not found`; its browser setup is blocked at GitHub sign-in. Activate or
repair the existing Codecov repository connection, then rerun the failed uploader.
Do not disable the upload failure gate or broaden token permissions. Do not
lower the floor or count the old green job as successful coverage. Evidence and
next verification: [deployment handoff](deployment-handoff-2026-09-19.md#coverage-gate-integrity-follow-up).

## RELEASE-MAIN-PROTECTION-2026-09-19

The 2026-09-19 read-only GitHub verification reports `main.protected=false`,
required status-check enforcement `off`, an empty repository/inherited ruleset list,
and no effective branch rules. The legacy protection endpoint returns the explicit
`Branch not protected` response. Running CI on pushes is not equivalent to enforcing
it before merge. This finding does not establish that production deployment bypasses
its separate promotion workflow.

Evidence is retained in local audit artifact `github-main.json` (path and fingerprint in [QA_COVERAGE.json](website-launch/qa-coverage.json)),
`github-main-protection.json`, `github-rulesets.json` and `github-main-rules.json`, with
the corresponding hashed response logs. Configure an owner-reviewed main-branch rule
requiring pull requests and the intended successful checks, with bounded and audited
bypass rules; then verify the effective API state and a harmless rejected change.
Configuration was inspected only; no GitHub settings were changed during verification.

**Canonical status.** This file carries the explanation and the plan. Three
machine-readable registers stay authoritative for their own row identity
because code, tests and CI cite their IDs directly:

| Register                                      | Holds                                     | Enforced by                  |
| --------------------------------------------- | ----------------------------------------- | ---------------------------- |
| `audit/registers/known-flaws.md`              | one row per open defect, cited by ID      | PR template, `ci.yml`, tests |
| `audit/registers/capability-gaps.csv`         | `CAP-*` product capability backlog        | `check:capability-gaps`      |
| `audit/registers/ui-gaps.csv`                 | `GAP-*` UI parity rows, monotonic ratchet | `check:ui-gaps`              |
| `audit/prior-audits/product-gaps-register.md` | `PG-*` product completeness findings      | `check:doc-registry`         |

Those registers hold rows. This file holds root causes. One root cause here may
retire several rows there. Do not copy long narrative into a register, and do
not open a second active-issues document.

Capability backlog (`CAP-*`) is product scope, not defect work, and is out of
scope for this file.

The website's public-release audit lives in `audit/prior-audits/web-public-release-audit.md`
(2026-09-14, founder-requested, one canonical file). It carries the `WEB-*`
findings for the web UI, what the pass fixed, and the order for the rest; this
file points to it rather than restating its rows. It has no open P1 or P2 after
the successful live-provider baseline and WEB-053 protocol disposition; its P3
and P4 queues remain open.

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
- As of the 2026-09-13 reconciliation: 18 open `AGI-*` root causes (10 P2, 8
  P3) plus the P1 security entry, which is largely mitigated and names what is
  still blocked, and a handful of "Needs live validation" notes that are not
  confirmed defects. `AGI-10` and `AGI-28` closed this pass; see "Closed in
  this pass" below. Several of the rest, including `AGI-3`, `AGI-16`, `AGI-20`,
  `AGI-23`, `AGI-27`, `AGI-30`, `AGI-31` and `AGI-32`, are code-fixed and only
  waiting on a live confirmation their own section names.
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
  is in its commit. New root causes opened below: `AGI-27` to `AGI-33`.
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
  request each. Deployed verification is `LIVE-8`, where the first signed-in
  turn on the deployed build stalled the way the six runs had and the cause
  found is recorded. The same pass found no
  other function alive past its budget: crons are batch- and time-bounded,
  only the current deployment receives invocations, and the remaining
  daily 500 is the credit reconciliation cron meeting Stripe subscription ids
  the live account does not know (founder file, Billing entry).
- Reconciliation pass 2026-09-13, ledgers only: every commit on `origin/main`
  since 2026-09-13 00:00 (about 123) plus the unpushed commits this checkout
  carries on top of it (22, tip `24c5c9feb`) checked against this file and
  `known-flaws.md`. `origin/main` is green at `9ab4a616b`. The production
  deploy is not blocked on code: it is waiting on a founder approval, and on
  migrations `0183` to `0189` being applied in production first, because the
  deploy job refuses to promote while a draft migration is unapplied. Both are
  tracked as founder actions in `audit/decisions/founder-actions.md`
  ("[Database] Apply migrations 0183 to 0189 in production before the next
  deploy", "[QA] Somewhere to exercise this work before it ships"). `AGI-10`
  closed on 2026-09-13 for both artifacts and conversations (0184-0186 are its
  migrations); the citation and research-reload half of `AGI-28` closed the
  same day. `AGI-3`'s remainder was narrowed: code-execution results and
  generated files closed 2026-09-12 in `e3d8bbebe` and had been left in this
  file's remainder list by mistake, corrected in this pass, and a 2026-09-13
  fix (`ad013685f`) bounds oversized turn metadata so a save no longer fails
  validation outright. Fixed the format of four rows (`AGI-20`, `AGI-27`,
  `AGI-30`, `AGI-31`) carrying two contradictory `Status:` lines each from the
  2026-09-12 pass. No row in this file's P1-P3 sections closed outright from a
  2026-09-13 commit beyond what is named above; the rest are unchanged because
  no commit in the range touches their evidence.
- Five are blocked on a decision rather than on code, and each says whose and
  what it costs: `AGI-5` (CI budget), `AGI-11` (default expiry), `AGI-14` (a
  second speech-to-text vendor), `AGI-17` (conform to CommonMark or forgive it),
  `AGI-22` (the disclosure, and whether existing users are grandfathered).

### Closed in this pass

These issues were fixed and verified, and their sections are gone from this
file. Named here only so a reader coming from an older copy knows where they
went, and so nobody re-files them:

| Was      | What it was                                                                                  | Verified by                                                                                                                                                       |
| -------- | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AGI-15` | Local development ran against the shared database                                            | dev server on `:3100` now writes `agiworkforce_dev`                                                                                                               |
| `AGI-1`  | Managed usage leases clamped to one hour, never renewed                                      | `pnpm db:lease-probe` against real Postgres                                                                                                                       |
| `AGI-2`  | Stranded reservations waited up to a day for recovery                                        | cron scope test, `/api/cron/recover-reservations`                                                                                                                 |
| browser  | Non-image chat attachments failed on every route                                             | `apps/web/e2e/chat-document-attachment.spec.ts`                                                                                                                   |
| browser  | Starting a conversation inside a project failed every time                                   | `apps/web/e2e/project-first-conversation.spec.ts`                                                                                                                 |
| browser  | Tool Approvals did not gate web search in either mode                                        | `apps/web/e2e/tool-approval-web-search.spec.ts`                                                                                                                   |
| latent   | Approval checkpoints 500'd on a jsonb parameter                                              | found by the first turn to reach that path                                                                                                                        |
| `AGI-13` | Unimplemented native commands answered with mock success                                     | the guard was unreachable; rule extracted and tested                                                                                                              |
| `AGI-19` | Marketing nav panels stayed open while the page scrolled                                     | `NavGroup.scroll.test.tsx`                                                                                                                                        |
| `AGI-21` | A cancelled settings query logged at error level                                             | `use-settings-queries.abort.test.tsx`                                                                                                                             |
| `AGI-8`  | The US-only preference never reached the web resolver                                        | `request-processor.us-only.test.ts`                                                                                                                               |
| `AGI-18` | Not reproducible: the sidebar row is a correctly labelled expander                           | driven in a browser on `:3100`                                                                                                                                    |
| `AGI-9`  | A forbidden connector could be connected and its credential stored                           | `connector-policy-gate.test.ts`                                                                                                                                   |
| `AGI-24` | Any function tool blocked cross-provider failover for a whole turn                           | `managed-failover.test.ts`, red on the old predicate                                                                                                              |
| `AGI-25` | A turn holding an approval said it had finished with no response                             | live on `:3100`; the line is gone, the row remains                                                                                                                |
| `AGI-6`  | Web voice could not speak until the whole reply was written                                  | live session on `:3100`, audio about a second after the user stops, interruptions native                                                                          |
| `AGI-10` | Artifacts and conversations could only be shared publicly, never with an organization        | `3503cc009`, `6ff12dc2c`, `efff70c8a`; two live runs against the local stack 2026-09-13, both surfaces, share/withdraw/re-check                                   |
| `AGI-28` | Citations were prose with no markers, and a research reload lost sources and kept "thinking" | `55345a421` (citation markers), `0b732672c` (reload rebuilds from the stored report); live on `:3100` 2026-09-13, reloaded run reads 5 sources, 0 thinking blocks |

## 2. P0, critical

None. No verified security breach, privilege escalation, secret exposure, data
corruption, double charge or trust-boundary failure was found. Reservation
settlement is idempotent and concurrency-safe.

## 3. P1, high

### `AGI-SEC-API-2026-09-09` What the api security scan found, and what is left

**Severity:** P1
**Status:** 56 of 57 findings fixed; 1 registered in
`audit/registers/known-flaws.md` as `WEB-SEC-SCAN-2026-09-09-F88`. F21, F23,
F35, F38, F91, F93 and F94 closed on 2026-09-13 and their rows were deleted; what
is left is F88. F31 and F39 closed on 2026-09-12: compaction now routes
under the turn's own admission, and a scheduled run declares the project context
it carries. Closing F39 also found that the gate's attachment leg could never
fire, because `buildLlmRequest` moves array content into `multimodal_content`
and the check read `content`.
**Area:** `apps/web/app/api` and the code it reaches

**What the scan was.** A panel-verified read of the 744 files under
`apps/web/app/api`, run 2026-09-09 against commit `e2a9e898b`. The report is in
`audit/prior-audits/local/security-scan-2026-09-09/` (local only). 57 findings survived a three-voter panel: 3
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

**What is left and why.** One row. F88 is a founder decision, not an
engineering one, and the founder file states the three options and how to verify
whichever is chosen.

**Next step.** None on this scan beyond the founder's F88 decision.

**Closed 2026-09-13, second pass.** F93 and F94 were one problem: `user_memories.id`
was a global primary key the client chose, and the import derived it from an
unkeyed sha256 of the owner's user id, the source slug and the normalised memory
text. Knowing a victim's user id and guessing their wording was therefore enough
to occupy the row they were about to write, which silently dropped their import
and answered whether that id already existed. Migration `0189` makes the key
`(user_id, id)`, so the same id under two accounts is two rows, and moves import
dedupe onto a new `import_key` column unique per `(user_id, source)`, which lets
imported rows take a random uuid and needs no deployment secret. The sync push
and the auto-memory insert now name `(user_id, id)` as their conflict target.
Reproduced against the development database before the migration, where the
victim's insert returned zero rows, and after it, where both rows exist.

**Closed 2026-09-13, third pass.** F91 in full, by promote-on-inspect, the same
shape chat attachments already use. After extraction passes, the register step
copies the inspected object to a sealed key under the project, `.../<projectId>/sealed/<name>`, and the copy
carries the entity tag the inspection read. A source rewritten inside the
presigned url's remaining lifetime therefore fails the precondition, the
registration is refused with the same wording chat attachments use, and the
writable key is deleted either way. The sealed shape has one more path segment
than any presign, upload authorization or upload cleanup can name, so nothing
that can write may ever name what is stored, and `storage_uri` holds the sealed
key, which is what extraction, download, deletion and erasure all read.
Verified against the real bucket, not a fake: a copy pinned to the inspected
entity tag succeeded, the same copy after a rewrite was refused `412
PreconditionFailed`, and a source uploaded through a project's Sources panel
left exactly one object, the sealed one, downloaded its own bytes back, and lost
that object when the source was deleted.

The same probes corrected an assumption this register carried: the bucket does
enforce a declared SHA-256 on a write, refusing a mismatch with `400 BadDigest`.
Bucket-enforced checksums were therefore also available, and would need the
presign to sign a checksum header the client already computes. Promoting the
inspected bytes was still the better answer, because it is what the chat path
does and because it moves what is served out of every key an upload can name,
rather than only constraining what may be written there.

The second pass closed the half of F91 that was reachable from any environment.
`/api/uploads/knowledge-file/put` took its destination from a query parameter,
so a caller who knew a registered object's key could overwrite it with anything
and the row kept describing bytes the platform no longer held. The presign now
mints a signed authorization that binds the owner, the key, the content type,
the byte count and the sha256 of the exact bytes; the route takes the key from
that authorization and refuses a body that hashes to anything else, including a
rewrite of the same length and type. The presign request gained
`checksumSha256`, which every client already computed for registration, and a
request without it is refused with `UPLOAD_PROTOCOL_UPGRADE_REQUIRED` rather
than served an unbound url. The signing key is derived from the object-storage
credential, so no new deployment secret appears.

**Closed 2026-09-13.** F21: removing a member from one workspace revoked every
device credential and API key on that account, because neither revocation had a
workspace to filter on. Migration `0187` adds `organization_id` to
`device_refresh_tokens` (`api_keys` has carried it since `0073` and the query
ignored it), device pairing and rotation bind it, and the provider sessions are
revoked only when the member's recorded active workspace is the one being left.
F23: a team add resolved any email to a `profiles` row over the privileged
connection and inserted the membership, so knowing an address was enough to bind
that account into a tenant and then reach the removal path against it; a direct
add now requires a domain the organization has verified, the same evidence SCIM
provisioning demands, and everything else goes through the invitation the
invitee redeems. F38: installation ownership was proved by reaching any one
repository while the row it wrote granted a full-installation credential;
migration `0188` stores the repository set the linking account itself proved,
and the listing, clone and push all filter to it. F35: the token handed into the
sandbox carried every permission on every repository the installation covers;
it is now minted per operation, narrowed to the one repository and to `contents`
read for a clone, `contents` write for a push, and never cached. Narrowing the
clone token also found that the pull-request path reuses the same credential
server side, which is why that one is scoped to `pull_requests` write instead.

F8 closed 2026-09-12, and it was worse than its one-line summary. The router
decided retry, failover and user-facing copy by re-parsing a free-text message
that contains a user-chosen filename, because the adapter classified the failure
correctly and then dropped the answer at the stream-chunk boundary. So an
attachment named timeout.pdf turned a permanent refusal into a retry loop
against a route that could never serve it, and one named content_filter.pdf
classified as a safety refusal, which never rotates, so the turn ended and the
reader was told a safety system had blocked their own document. The
classification now rides the chunk and is validated before it is trusted.

### `AGI-35` Founder decisions of 2026-09-15: execution queue

**Severity:** P1
**Status:** Open; the decisions are in `docs/decisions/2026-09-15-founder-decisions.md`
and the founder file keeps only the external actions.
**Area:** every client and the gateway

Engineering unlocked by the decisions, in dependency order. Each item closes
by a live check on the running product, not by its tests.

1. Localization (D-03): expose only English and Spanish until a language is
   reviewed; every client follows the account language with English fallback.
2. Auto-memory (D-02): model-assisted extraction on by default on the
   cheapest utility route, exclusions and metering unchanged.
3. Tool approvals (D-01): in the read-only mode, sandboxed code execution,
   web search, page fetch and other non-mutating tools run without asking.
4. CLI sign-in (D-05): remove the ChatGPT-subscription OAuth flow; provider
   logins enter API keys only.
5. Desktop (D-04): `/desktop`, downloads, docs and the release APIs describe
   Electron; Tauri claims and the Tauri Linux AppImage leave the public flows.
6. QA account (D-21): a native-compatible sign-in, a workspace and a paid test
   entitlement for a dedicated QA user; credentials gitignored.
7. Plan-tier gate (D-09): read the surface from a Clerk custom session claim
   (dashboard step with the founder) and stop trusting the header.
8. Migrations (D-23): rehearse 0183 to 0192 on a Neon branch, then apply in
   order before deploying dependent code. (The withdrawn duplicate that an
   earlier queue entry called 0183 was the reconciliation copy renumbered to
   0181; it no longer exists, and the current 0183 and 0184 are real.)
9. Durability (D-22/23): deploy the world transport fix once CI is green on the
   same commit and end the two stranded production runs.
10. Dispatch pairing (D-10), TLS pins (D-11), minimum age (D-12), crash
    reporting (D-14, needs the DSN), India checkout rule (D-18), policy dates
    (D-25), MiniMax off and Groq gating (D-08), DeepSeek and Moonshot through
    the managed harness (D-07), connector availability states (D-20), signed
    release docs (D-24), event guardrails (D-26), local Desktop Tasks model
    benchmark (D-15).

Progress, 2026-09-15: item 1 landed in 50925e177, item 2 in 27cb8a08a, item 3
in b288fffd0 (each still owes a live check on the running product), item 4 in
2ceb62b4e (checked on the rebuilt binary). Item 6: the QA user now has a
password sign-in for the native SDKs (web sign-in stays the Clerk ticket
flow); its workspace and the credential handling are still open. Item 5
landed in 4806cbb16 (reviewed on the dev server at two widths); two follow-ups
came out of it: the callerless Tauri latest-manifest route under
`apps/web/app/api/releases/latest/` leaves with the Tauri build, and the
Electron package still carries the name of the hosted trust mode, so the rename
to the surface name (D-04, derived) waits for a packaged-build check.
Item 8 done: 0183 to 0192 rehearsed on two Neon branches (apply clean, RLS
probe 33 tables, lease probe green) and applied to production, 192 applied, 0
pending, 0 drift, recorded against 890dad614. Because production still runs
107ded474, whose memory inserts name `(id)` as their conflict target, 0189 keeps
a transitional unique index on `id` and 0193 drops it; 0193 is applied only
once the deployment built on 0189 is live (37e1ad16c).
Item 7 landed in 78fd99ec0: the gate binds a Clerk token to the surface its signed
claims prove and ignores the header for anything else; proved live against the
dev server. The mobile JWT template is the one remaining founder dashboard step.
From item 10: policy dates (D-25) in 5ecc126f1, event guardrails (D-26) in
2a1f7bc77, MiniMax out of managed traffic (D-08) in ce7fea373; the TLS
pinning contract (D-11) now reads the decision entry (58fb784c6) while the pins
themselves stay placeholders until the report-only rollout.
TLS pins (D-11) are now provisioned: the issuing intermediates and roots of
the four AGI-controlled hosts sit in the mobile pin table, OpenAI and
Anthropic are not pinned, and the rollout stays report-only until a shipped
build has reported clean; the enforcement flip is its own change.

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
**What remains:** the tool-call timeline and reasoning blocks are still written
only by the client's `saveMessageToDb`. A non-retryable failure still loses
them; the difference is that the reader is now told. Code-execution results and
the generated-file list closed 2026-09-12 in `e3d8bbebe`, collected server side
in `assistant-turn-sources.ts` beside sources and citations; they are no longer
in this remainder.
**Root cause of the remainder:** the timeline and reasoning are derived by the
client from the stream, with merging and per-tool status the server does not
reproduce. Reproducing that derivation server-side is the work, and it must not
become a second implementation of it.
**2026-09-13, a related but distinct fix:** `ad013685f` bounds the size of
whatever metadata the client does send (`message-metadata-projection.ts` caps
sources, citations, tool entries and thinking length before the save request is
validated), so an oversized payload from a long tool-using turn no longer fails
Zod validation and loses the entire save. That closes one failure mode of the
remainder (size-triggered validation refusal) without changing which side owns
the timeline and reasoning derivation.
**Evidence:** `apps/web/lib/hooks/useChatStream.ts` `persistAssistant`, which
builds the metadata object; `assistant-turn-sources.ts`, which shows the shape
the rest would follow; `packages/contracts/cloud-contracts/src/message-metadata-projection.ts`.
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
against a single crate. The 2026-09-20 CI continuation found 34 Windows CLI
test failures hidden by `continue-on-error`. That suppression is removed in the
current repair; native path handling and platform fixtures are corrected. Exact
runner verification is tracked in `audit/prior-audits/deployment-handoff-2026-09-19.md`.
The separate pre-merge coverage decision remains open.
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
**Founder option, 2026-09-22:** Evaluate the [open-weight Laya decision
model](https://huggingface.co/convaiinnovations/laya) as a local typed-decision
alternative to Jev for the Tauri desktop phase if Jev proves unsuitable there.
This is not a vendor selection or an implemented capability. Its published
contract handles classification and bounded choices, not speech capture,
transcription, OS actions or permission enforcement; those remain separate
native gates. When desktop work begins after the website launch gate, measure
decision quality, latency, memory/packaging cost, license, native integration,
privacy/egress behavior and fit with the existing gate ledger before adopting
it. Do not confuse this model with an unrelated desktop product also named
Laya.
**Acceptance criteria:** Every gate in the ledger is met, or the entry point is
removed from shipped builds.
**Validation:** The spec's gate ledger, exercised on a signed build.

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

**Severity:** P2
**Status:** Fixed 2026-09-12, not yet confirmed live. The turn's attachments are
staged into the sandbox workspace before the baseline snapshot and only when an
execution tool was actually called, so no sandbox is provisioned for a turn that
runs no code. Remaining: the acceptance criterion's live CSV total, which needs
a real sandbox.
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
`audit/decisions/founder-actions.md`, which stay there because minting them is a
founder action.
**Acceptance criteria:** the close route accepts and records the backend
responses model's token usage, and any `web_search` calls it made, as their
own `provider_cost_events` row for the session, so `cogs_summary()` no longer
omits this spend.
**Validation:** a live voice session that triggers a backend web search closes
with a second `provider_cost_events` row for the backend model, covered by a
test on the close route.

### `AGI-34` Running-to-stalled recovery lacks mounted and live verification

**Severity:** P2
**Status:** Partial; recurring recovery polling and terminal retirement are repaired in `032bf6aa` on 2026-10-01. Mounted running-to-stalled follow-up and deployed stalled-run confirmation remain unverified.
**Area:** Web chat client, runs API
**Implemented:** the server-owned `staleForMs` bounds run liveness without comparing client/server clocks; deliberate paused states remain live. The recovered-run follower continues polling while its known run keeps the conversation loading, preserves identity after unavailable or invalid listings, and retires it after a verified terminal or empty listing. The real hook/recovery/workflow suites pass 122 assertions, including running-to-terminal follow-up and uncertain-response controls. HTTP, provider and persistence boundaries are mocked in these suites.
**Remaining:** no mounted hook regression has observed an initially running recovered run become stalled on a later poll. The earlier initial-stalled check does not cover that transition. No stalled run on the deployed build was confirmed in this repair.
**Acceptance:** mount a restored running conversation, return that same run with server-owned `staleForMs` beyond the existing silence deadline on a subsequent poll, and require the Retry banner with loading cleared. Preserve deliberate-pause and uncertain-read behavior. Separately confirm a stalled run on the deployed build before closing this identity.
**Owners:** `apps/web/lib/hooks/inFlightTurnRecovery.ts`, `apps/web/lib/hooks/useChatStream.ts`, and their existing tests. The remaining gap is verification, not an observed continued first-running or terminal-polling defect.

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

**Severity:** P3
**Status:** Fixed 2026-09-12, not observed in a browser. The transcript caches
row heights by index, and the guard asked whether ANY index on the visible path
now held a different message. A retry makes that true by construction, so one
changed index threw every row in the thread back to the default estimate and the
layout moved under the reader with no scroll call at all. Short threads fit in
the viewport, which is why it was only ever seen in long ones. Only the rewritten
suffix is forgotten now. The fix is about real layout and jsdom has none, so the
tests assert which rows are invalidated, not the resulting pixel position.
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
**Status:** Open, waiting on a founder cost decision, not on engineering.
**Area:** Memory
**What is wrong:** auto-memory candidates are the sentences that match a fixed
list of patterns ("my name is", "I prefer", "remember that"); the leaders
extract with a model and keep facts the patterns never see.
**Evidence:** `packages/ai/agent-core/src/memory.ts` `extractCandidateMemoryFacts`.
The model-backed replacement is already built and wired into the post-turn
recorder, on the cheapest managed utility route, falling back to the patterns on
every failure; it is dark because the flag that enables it is unset. Read
`apps/web/lib/services/model-memory-extraction.ts` and
`apps/web/lib/services/managed-auto-memory-service.ts` before writing any more
extraction code.
**User impact:** low. Memory works for the phrasings it knows. Verified live on
2026-09-13 against the running web app: a fact stated in one conversation was
stored and answered correctly in a second, separate conversation.
**Dependencies:** the founder decision to spend one utility completion per
eligible turn, tracked in `audit/decisions/founder-actions.md`.
**Acceptance criteria:** a fact stated without a trigger phrase is remembered.
**Validation:** memory service tests, a live two-chat recall.

### `AGI-30` The conversation list is fetched ten times during one turn

**Severity:** P3
**Status:** Partly fixed 2026-09-12, and still open for the residual. It was
not a render storm: within one mount the effect fires once. It was mount
count, because the first send routes /chat to /chat/[sessionId], a different
route segment, so the page remounts mid-turn and asks again, and on shell
routes a second copy of the hook races the page's in the same tick. Concurrent
mounts now coalesce onto one request and a remount inside a short freshness
window reuses what is loaded. The four /api/usage calls per turn are the same
defect class in `useManagedUsageSummary` and are still open.
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
**Status:** Fixed 2026-09-12, no live proof yet. The leak was in the database
layer, not in a model adapter, which is why it was never found where the warning
appeared: each per-request scoped adapter kept its own record of which pooled
clients it had guarded, attached an error listener to a warm client, and never
removed it. The same bookkeeping made one socket failure log once per leaked
listener. The guard now belongs to the checkout and is removed on release.
Remaining: a fresh stack from a running server to confirm the warning is gone
across many turns.
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

### Every published release predates its own verification, 2026-09-12

**The download-verification instructions cannot be followed today, and failing
them looks exactly like a tampered download.** Both published releases were cut
before the machinery that signs them existed:

| release           | published  | carries                                   | signing landed |
| ----------------- | ---------- | ----------------------------------------- | -------------- |
| `v-cli-1.0.0`     | 2026-05-03 | five archives, no `SHA256SUMS`, no bundle | 2026-07-16     |
| `v-desktop-1.2.0` | 2026-05-04 | `.AppImage`, `.deb`, `.rpm`, no `.sig`    | 2026-07-31     |

So a reader who follows "verify a download on your own machine" gets a
missing-file error from `minisign` or `cosign` rather than a verification
failure, and the two are indistinguishable to someone who is checking precisely
because they do not trust the file.

The release workflows themselves are correct and were verified line by line:
`release-cli.yml` produces Sigstore-signed checksums with a pinned certificate
identity, and `release-desktop.yml` signs, notarizes and staples, then re-checks
each artifact against the committed updater public key and gates publication on
a clean-container install, upgrade and rollback. **None of that has ever run
into a published release.**

The pages are honest about the consequence, because the download controls are
gated on the live release API rather than on the workflow, so nothing offers a
file that is not there. The gap is the release cut itself.

**What closing it takes:** cut a CLI release and a desktop release from current
`main` so the published assets come from the signing workflows, then re-run the
verification transcript on each platform exactly as the page states it. Until
then, treat every verification instruction on `/download` as documentation of
intent. This is a founder action: it publishes artifacts under the project's
signing identity.

**Also worth a decision:** the Windows row on `/download` is hardcoded to "not
published" while macOS and Linux are live-checked, even though
`build-windows-release.yml` uploads a Trusted-Signing-verified installer on
manual dispatch. It is accurate today and goes stale silently the first time
anyone dispatches that workflow.

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

**Three claims were left for the founder rather than decided by an agent.**
Each is arguable rather than wrong, and each is about how the product presents
itself:

- `/about` says the desktop app is "native to its platform rather than a wrapped
  web view". The shipped app is Tauri with a Rust core, which renders in the
  operating system's webview, and a separate managed-only Electron shell also
  ships. Defensible, and also the softest claim on those pages.
- `/docs` gives the Desktop card a plain call to action and no status label
  while Mobile, Chrome and VS Code all carry the coming-soon label, yet Windows
  installers are unpublished. The platform sentence is true; the card reads as
  more available than Desktop is.
  This list previously carried a third item, that `SURFACE_STATUS.desktop` in
  `apps/web/lib/marketing-constants.ts` understates the shipped macOS build by
  reading "Linux assets". **That was wrong and is withdrawn.** The constant is
  accurate: the published desktop release carries an AppImage, a deb and an rpm
  and nothing else. The flag came from the same mistake as the desktop page copy,
  reading the release workflow instead of the release.

**What the audit found on `/customers`, `/partners` and `/press` is worth
recording as a positive**, because it is the risk that was looked for and it is
absent. None of the three names a customer, logo, testimonial, metric or press
mention that is not real. They state what does not exist instead: `/customers`
labels its scenarios "None of these is a customer", `/partners` says there is no
program yet and lists what it does not offer, and `/press` carries a section
naming the certifications, customers and uptime record it cannot back up. Every
mechanic in the scenarios traces to real CLI code. Nothing needed replacing.

**About twenty of the rewritten pages have not been audited**, including
`/about`, `/api-docs`, `/docs`, `/faq`, `/help`, `/security`, `/pricing`,
`/download`, `/get-started` and the remaining feature pages. Given a 14-claim
yield from the first 18, the rest should be read the same way before launch:
extract each checkable claim, find the code that decides it, and cite it.

### Migration numbering reconciled with origin/main, closed 2026-09-13

**Resolved.** This entry described a real divergence, measured 2026-09-12:
this branch's local `0183`/`0184`/`0185` carried the same content as
`origin/main`'s already-applied `0180`/`0181`/`0182`, byte-different only in
the migration number inside each file's own header comment, which
`planMigrations` in `scripts/lib/neon-migrations.mjs` checksums. The
remediation this entry specified, taking `origin/main`'s three files verbatim
and dropping the local drafts, landed in `c64694f1a`, and the migrations that
actually needed the `0183` to `0185` numbers (video completion notice,
organization-shared artifacts and its policy fix) were renumbered `0183` to
`0185` on top of the correct `0182`, with `0186` added for organization-shared
conversations (`AGI-10`). `pnpm check:neon-migrations` passes on the current
tree: 186 migrations, contiguous from `0001`, ending at
`0186_organization_shared_sessions.sql`. What is still outstanding is not the
file reconciliation but applying `0183` to `0186` to the production database,
tracked in `audit/decisions/founder-actions.md`.

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
Anthropic API". See the founder-actions entry (`audit/decisions/founder-actions.md`).

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

| id       | Question                                                             | Why it is still open                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| -------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `LIVE-3` | Does a connector survive discover, authorize, expire, revoke?        | Completing it means granting a third party access to the founder's real accounts. That is the founder's decision to make, not an audit step, so it was deliberately not performed.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `LIVE-4` | Does web to desktop continuity complete a round trip?                | Needs two signed-in devices at once. Runtimes are distinct and boundary tests pass, but the round trip was not exercised.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `LIVE-7` | Does the durable transport rotate routes after 2f042794f?            | The generated durable step route under the web app's .well-known/workflow directory is written when the dev server starts, so the running server on `:3100` still executes the old step code. Tests cover the rotation; a live pinned-model turn on a gateway route must be re-run after the next restart.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `LIVE-6` | Do scheduled tasks actually fire?                                    | Settings shows `Runs: 0` and a past-due next run for an active weekly schedule. Local development has no cron runner attached, so this is the expected local reading. Re-check on a deployed environment before treating it as a defect.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `LIVE-8` | Do functions stop outliving their budget once a1c1b6a1e is deployed? | Deployed at 23:34 UTC as 107ded474. The 800 s cluster has not recurred, but the first signed-in turn on the new build stalled exactly as the six runs had: the workflow run recorded run_created and run_started and never a step, the chat function never reached its first-byte fallback and died at the 300 s limit, the reaper cron died at 300 s inside a cancel, and the flow function logged a 240 s replay timeout. The workflow REST API lists no completed or failed run at all, so no durable turn has ever finished in production. Cause: the Vercel world client hands its own undici 7 dispatcher to the Node 24 fetch, the mismatch the container runbook already names for the local world, and every world call after start() hangs. `WORKFLOW_NODE_HTTP=1` was set on the production and preview environments at 23:50 UTC and did nothing, which is why the flow route kept answering 504 afterwards: the root pnpm override pinned `@workflow/world-vercel` to 4.6.1, whose `@workflow/world` (4.3.1) predates the flag entirely, so the deployed world parsed no such variable and kept handing its own undici 7 dispatcher to the Node 24 fetch. Only `@workflow/world-local`, which local dev uses, honoured it, which is why `:3100` worked and production never did. Proven 2026-09-13 with one command against the production world on Node 24.18.0: unset, `workflow inspect runs` hangs on an unsettled top-level await; set, with the override raised to 4.7.4, it returns the run list. The override is now 4.7.4, `WORKFLOW_NODE_HTTP` is a required key in the web env contract rather than a dashboard-only variable, and `apps/web/lib/workflows/durable-world-transport.test.ts` fails if either the pin or an installed copy stops reading the flag. Every call into the world is bounded by `WORKFLOW_WORLD_CALL_DEADLINE_MS` in `apps/web/lib/deadline-policy.ts` so a broken transport degrades to the inline turn. To close: a signed-in turn on that deployment must create steps and complete, the run must list as completed, the reaper cron must finish under its limit, and the 300 s cluster must not recur. The two stalled runs were cancelled through the REST API at 23:50 and 23:55 UTC; two more, `wrun_01M29D4FY1WTT3T8FYR2T726JP` and `wrun_01M27B9P5V0K81W755HBD4HVH7`, are still `running` on the retired deployment and were redelivered every fifteen minutes through 2026-09-12 23:20 UTC at 800 s a time. Cancelling them is a founder action, recorded in `audit/decisions/founder-actions.md`. Across the newest 20 production runs not one has ever reached `completed`. Separately, `/login`, `/`, `/pricing` and `/contact-sales` are rendered by a function on every hit and receive bursts of a dozen requests every ten minutes from an unidentified external monitor or crawler; cheap today, and the public-pages pass should make those routes static. |

## 7. Execution order

Dependency-aware, not severity-ordered.

1. `AGI-27`, sandbox staging. `AGI-28` closed on 2026-09-13 and it was the
   other holder of the tool loop's terminal path, so this one now runs alone.
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
7. `AGI-14` needs a vendor decision before it needs an implementer. `AGI-10`
   is closed, artifacts and conversations both carry the two-part audience
   model, so nothing sequences behind it.
8. `AGI-32` needs the live confirmation its section names; it is code-complete
   on main. `AGI-34` still needs a mounted running-to-stalled follow-up
   test plus live stalled-run confirmation. `AGI-11`, `AGI-20`, `AGI-29`,
   `AGI-30`, `AGI-31`, `AGI-33`. Background and polish. `AGI-17` needs a
   decision before it needs an implementer.

`AGI-12` belongs to whoever is next in `apps/desktop`.

## 8. Acceptance matrix

| Issue    | Automated                                            | Manual or live                           | Gate                                      |
| -------- | ---------------------------------------------------- | ---------------------------------------- | ----------------------------------------- |
| `AGI-3`  | per-class snapshot tests, e2e reload                 | reload after a tool-using answer         | nothing the transcript rendered is lost   |
| `AGI-5`  | the four native lanes are pinned together            | a PR with a deliberate native break      | required check fails on the PR            |
| `AGI-7`  | spec gate ledger                                     | signed build                             | 12 of 12 gates, or surface removed        |
| `AGI-11` | service and cron tests                               | none                                     | expired token stops resolving             |
| `AGI-12` | `check:boundaries`, desktop tests                    | none                                     | zero `task-1.3` markers                   |
| `AGI-14` | per-provider route tests, registry contract          | none                                     | a second STT vendor exists and fails over |
| `AGI-16` | resolve-on-ingest tests, no provider host in a href  | a grounded research turn                 | a citation survives redirect expiry       |
| `AGI-17` | none until the decision is taken                     | none                                     | founder decides conform or forgive        |
| `AGI-20` | e2e case invalidating only the retried row           | none, real layout needs a browser        | retried message stays in view             |
| `AGI-22` | conformance fixtures, consent record migration       | none                                     | no Chinese-HQ route without consent       |
| `AGI-23` | classification test over the observed 404            | none                                     | excluded route is not offered             |
| `AGI-27` | tool-loop staging cases                              | a CSV total on a non-gateway model       | no write_file copy before execute_code    |
| `AGI-29` | memory service tests                                 | a live two-chat recall                   | a fact without a trigger phrase is kept   |
| `AGI-30` | hook test with a request counter                     | one live turn                            | one list refetch per completed turn       |
| `AGI-31` | targeted test once the stack is captured             | a hundred turns with no warning          | no MaxListenersExceededWarning            |
| `AGI-32` | test on the close route                              | a live session with a backend web search | second `provider_cost_events` row lands   |
| `AGI-33` | the two pinning tests flip to asserting preservation | none                                     | classification survives the envelope      |
| `AGI-34` | mounted recovered running-to-stalled follow-up test  | a stalled run on the deployed build      | Retry banner, not Generating response     |

Every web change closes with `apps/web` typecheck run on its own.

## 9. Dependencies and parallel work

```
AGI-3                      web persistence, independent, narrowed
AGI-5                      CI, independent, do early
AGI-23                     routing, independent now that the pin is narrowed
AGI-22                     blocked on a disclosure decision, not on code
AGI-16                     provenance, independent
LIVE-5 ──> AGI-7          desktop voice, measure before building
AGI-14                     blocked on a second STT vendor, not on code
AGI-32                     code-complete, waiting on a live confirmation
AGI-34                     partial, mounted running-to-stalled test and live confirmation
AGI-11, AGI-12, AGI-33     background
AGI-17, AGI-20, AGI-29,
AGI-30, AGI-31             polish, independent of everything
```

Two tracks can run at once without touching the same files: web chat
(`AGI-3`) and CI (`AGI-5`).

## WEB-CACHED-TRANSCRIPT-NEVER-REFRESHED-01

Severity: Medium. Status: open in source snapshot `49d0c30f38ca53570dd4eade84548c9cf43705ae`; deployment unknown.

Reopening a cached chat discards newer persisted messages. loadConversation fetches and parses current paginated server messages, maps them to messages, then immediately returns at599–601 if cachedMessages.length>0. setActiveConversationWithMessages604–608 only runs for an empty cache. Ephemeral real-hook test cached one old message, returned two valid server messages, explicitly asserted loadConversation returned true, and observed only the old message in the real store. Inspected web artifact cloud-sync reads the shared sync response but only applies artifacts; it does not compensate by merging chat messages. The server durable settlement does persist the completed assistant turn.

Impact/trigger: The fresh transcript is parsed but discarded whenever any local cached message exists. Reopening still displays the stale transcript, and the next user turn can operate with missing remote context.

Start at `apps/web/lib/hooks/useConversations.ts:590` in `.worktrees/billing-e2e`. Evidence and full anchors: [`web-cloud-review.json`](evidence/2026-09-29-ecosystem-review/web-cloud-review.json).

Verification: Real-hook/store assertion failed as expected; captured in web-repro-output.txt. Limit: Reopen freshness failure is reproduced. Live cross-device sync, message conflict policy and every possible compensating handler were not exhaustively tested.

Resolution/acceptance: Cache a completed conversation, serve a valid response with an additional message, reopen it and require the new persisted message while preserving the locally selected valid branch leaf. Cover remote edits/deletes and protect the actual locally streaming transcript from stale network snapshots.

## WEB-MANAGED-COMPUTE-PROBE-PREMISE-01

Severity: Medium. Status: open in source snapshot `49d0c30f38ca53570dd4eade84548c9cf43705ae`; deployment unknown.

Managed-compute enforcement test accepts denials from different gates. The accepted response pattern at97 is managed_compute_disabled|over_cap|model_blocked. over_cap/model_blocked do not establish the intended managed-compute gate. Status402 or403 at90–93 is likewise shared by unrelated refusals; there is no positive control for the same admitted model/budget request in this case.

Impact/trigger: The test can pass without proving the specific managed-compute policy is enforced, despite claiming to rule out earlier gates. This weakens enterprise admission evidence.

Start at `apps/web/e2e/enterprise-enforcement.spec.ts:90` in `.worktrees/billing-e2e`. Evidence and full anchors: [`web-cloud-review.json`](evidence/2026-09-29-ecosystem-review/web-cloud-review.json).

Verification: Three real-hook/store assertions fail as expected; this particular enterprise-test finding is source-only. Limit: The e2e suite was not run and no runtime enforcement bypass is claimed.

Resolution/acceptance: Construct an otherwise admitted request with adequate budget and an allowed model; require the exact managed_compute_disabled code when the policy is off, then enable the policy and require that this gate permits the same request. Inject a broken managed-compute gate and prove the test fails even if another refusal remains.

## CLI-CHECKPOINT-PARENT-SYMLINK-ESCAPE-01

Severity: High. Status: open in source snapshot `49d0c30f38ca53570dd4eade84548c9cf43705ae`; deployment unknown.

Checkpoint rewind follows swapped parent symlinks outside the approved workspace. Snapshot paths are lexical root joins, not stable confined handles. restore_files checks the final file only for Contents; symlink_metadata follows symlink parents, so an outside regular leaf passes. Absent directly removes the lexical path. The app-server rewind checks thread/writer ownership but never revalidates snapshot paths against the workspace or executes these writes in its shell sandbox.

Impact/trigger: Capture workspace/sub/file during an approved edit, then replace sub with a symlink to a directory outside the workspace before choosing code rewind. An outside regular file of the same name is overwritten; a file captured as Absent is deleted through the symlink.

Start at `apps/cli/src/agent/checkpoints.rs:322` in `.worktrees/billing-e2e`. Evidence and full anchors: [`rust-developer-review.json`](evidence/2026-09-29-ecosystem-review/rust-developer-review.json).

Verification: Exact unsafe_to_overwrite function extracted from current source into a standalone Rust probe; same restore filesystem operations performed in temporary directories. Limit: Primitive reproduction, not full CLI build, mounted app-server or rendered UI. No user files touched.

Resolution/acceptance: Revalidate every snapshot destination under the owned workspace immediately before restore/delete and reject symlink ancestors; use confined/no-follow filesystem operations to avoid a check/write race. Keep skipped-file reporting.

## VSCODE-CLI-HANDOFF-NOT-ACTIVATED-01

Severity: Medium. Status: open in source snapshot `49d0c30f38ca53570dd4eade84548c9cf43705ae`; deployment unknown.

Continue CLI Session accepts the chosen thread but never opens it in VS Code. continueCliSessionHere selects newest/requested ID, validates and accepts its handoff, then only executes agi-workforce.chat. That command reveals native chat or the sidebar; it does not resume the accepted thread. The existing fork command explicitly calls sidebarProvider.resumeConversation(forkedId), demonstrating the required activation is separate. Deep links reach the same command.

Impact/trigger: With a different sidebar thread active, invoke Continue CLI Session or a developer-session deep link for a specific CLI thread and confirm Continue here.

Start at `apps/extension-vscode/src/core/commandSetup.ts:498` in `.worktrees/billing-e2e`. Evidence and full anchors: [`rust-developer-review.json`](evidence/2026-09-29-ecosystem-review/rust-developer-review.json).

Verification: Read complete command consumer and target command. Limit: No mounted VS Code invocation; existing admission helper tests do not exercise this command-to-sidebar activation.

Resolution/acceptance: After acceptance, reveal first-party chat and resume newest.id; only record acceptance once backend admission and activation succeed. Add a command test with a different active thread.

## CLI-INTERRUPT-RELEASE-BEFORE-CLEANUP-01

Severity: Medium. Status: open in source snapshot `49d0c30f38ca53570dd4eade84548c9cf43705ae`; deployment unknown.

Interrupt releases turn ownership before cleanup finishes. interrupt_turn removes running_turns[thread] and drops its lock before awaiting process-tree shutdown. start_turn uses only that map as its in-process active claim; the same writer lease renews successfully. Old cleanup later takes session-wide subagent and memory managers, removes steering by thread alone, and calls cancel_turn on the shared current history. A new turn can therefore be accepted before the old transcript/cleanup settles, lose its steering/managers, or make the interrupt wait behind its long-held session mutex. WebSocket upgrades clone one shared host, while individual sockets process requests independently.

Impact/trigger: Two authenticated WebSocket connections to the same app-server host: interrupt an active turn on one connection while starting a new turn on the same thread on the other. The old process tree shutdown yields long enough for the new start to proceed.

Start at `apps/cli/src/app_server/developer_host.rs:2991` in `.worktrees/billing-e2e`. Evidence and full anchors: [`rust-developer-review.json`](evidence/2026-09-29-ecosystem-review/rust-developer-review.json).

Verification: Read locks, release points, awaits, writer-lease behavior, shared WebSocket host and existing tests. Limit: Single stdio connection serializes requests and mitigates this particular trigger. No direct race harness executed. Existing interrupt test awaits complete cleanup before reload (developer_host.rs6897-6921); simultaneous-start test covers start/start, not interrupt/start.

Resolution/acceptance: Keep a stopping claim until process, subagents, steering, partial-history finalization and persistence settle; scope all cleanup to the interrupted turn generation.

## MCP-READ-CACHE-AGGREGATE-UNBOUNDED-01

Severity: Medium. Status: open in source snapshot `49d0c30f38ca53570dd4eade84548c9cf43705ae`; deployment unknown.

Modern MCP read cache retains unlimited responses and expired distinct keys. Events owns a HashMap with no entry/byte limit. store clones every complete cacheable result. cached evicts an expired entry only when that exact key is requested again; notifications clear only selected prefixes when a notification arrives. Per-frame/per-response transport bounds do not constrain aggregate cached memory. Modern dispatch reaches store for a zero-round normal response.

Impact/trigger: A configured modern MCP server returns ttlMs on resources/read; a long-lived client reads many distinct resource URIs without list-change notifications, including expired keys it never requests again.

Start at `crates/agiworkforce-mcp/src/cache.rs:10` in `.worktrees/billing-e2e`. Evidence and full anchors: [`rust-developer-review.json`](evidence/2026-09-29-ecosystem-review/rust-developer-review.json).

Verification: Read entire cache module and dispatch call site. Limit: No OOM/load run or live server request; prerequisite is modern protocol and server-provided TTL. TTL overflow hypothesis was separately rejected on host.

Resolution/acceptance: Bound total cache bytes and entries, periodically prune expired entries, clamp TTL, and use an eviction policy before cloning/inserting.

## CLI-BACKGROUND-COMMANDS-UNBOUNDED-01

Severity: Medium. Status: open in source snapshot `49d0c30f38ca53570dd4eade84548c9cf43705ae`; deployment unknown.

Background command pool caps finished history but leaves running commands unbounded. terminals::start spawns the child, output reader thread(s) and waiter thread before storing it in a process-global vector. The only retention guard counts finished commands; running children are never capped. Each command can retain up to 1MiB output. Background commands intentionally survive turn lifetime, so the running-turn concurrency limit does not bound this pool. The caller has no active-command admission check.

Impact/trigger: An agent repeatedly launches background servers/watchers or long-lived shell commands across turns without command_stop.

Start at `apps/cli/src/terminals.rs:14` in `.worktrees/billing-e2e`. Evidence and full anchors: [`rust-developer-review.json`](evidence/2026-09-29-ecosystem-review/rust-developer-review.json).

Verification: Read start path, retention policy, background tool caller and searched all CLI call sites for active-command caps. Limit: No stress run or resource exhaustion reproduced; local process resource risk, not demonstrated remote tenant interference.

Resolution/acceptance: Reserve bounded per-session/process active slots before spawning; expose explicit stop/cleanup and reject further starts with actionable feedback when full.

## AUDIT-CAPABILITY-EVIDENCE-UNCHECKED-01

Severity: Medium. Status: open in source snapshot `49d0c30f38ca53570dd4eade84548c9cf43705ae`; deployment unknown.

Capability worklist can be green with missing or impossible completion evidence. Current --check exits 0, but 20 done cells have no evidence, 36 done evidence references name absent files, and 165 done evidence references point past EOF. Replacing a done cell evidence with a nonexistent source file at line 999999 in an isolated copy still exits 0. The check validates rollup and rendering consistency; it does not validate evidence schema, existence, source content, mounted entrypoints, handler/persistence paths, default flags, production migration prerequisites or a content hash.

Impact/trigger: Current --check exits 0, but 20 done cells have no evidence, 36 done evidence references name absent files, and 165 done evidence references point past EOF. Replacing a done cell evidence with a nonexistent source file at line 999999 in an isolated copy still exits 0.

Start at `scripts/audit-worklist.mjs:317` in `.worktrees/billing-e2e`. Evidence and full anchors: [`inventory-instrument-review.json`](evidence/2026-09-29-ecosystem-review/inventory-instrument-review.json).

Verification: Current guard outputs and isolated fixtures captured in instrument-reproductions.json; no product modification. Limit: This proves the guard cannot establish completion and current evidence is not reviewable in those cases. A moved path alone does not prove its underlying capability is broken.

Resolution/acceptance: Require per-cell structured evidence/version binding, current path/range checks and explicit route/entrypoint/callee/storage gates before accepting done; keep live proof separate.

## AUDIT-REACHABILITY-EVIDENCE-UNCHECKED-01

Severity: Medium. Status: open in source snapshot `49d0c30f38ca53570dd4eade84548c9cf43705ae`; deployment unknown.

Older reachability inventory accepts fabricated implementation evidence. A built row with evidence saying apps/web/nonexistent-handler.ts:999999 exists passes with exit 0 in an isolated fixture. The current guard validates 654 rows, independently from the 3439-item capability ledger. Evidence validation only requires a string of at least 20 characters; source files and call graphs are not inspected.

Impact/trigger: A built row with evidence saying apps/web/nonexistent-handler.ts:999999 exists passes with exit 0 in an isolated fixture. The current guard validates 654 rows, independently from the 3439-item capability ledger.

Start at `scripts/check-audit-inventory.mjs:148` in `.worktrees/billing-e2e`. Evidence and full anchors: [`inventory-instrument-review.json`](evidence/2026-09-29-ecosystem-review/inventory-instrument-review.json).

Verification: Current guard outputs and isolated fixtures captured in instrument-reproductions.json; no product modification. Limit: The script provides identity/status/schema validation. Its green result is not execution or source-reachability evidence.

Resolution/acceptance: Name/report its assurance as inventory integrity, and separately validate source-bound reachability evidence; avoid treating this tally as equivalent to the capability ledger.

## AUDIT-DECLINED-COUNTED-DONE-01

Severity: Medium. Status: open in source snapshot `49d0c30f38ca53570dd4eade84548c9cf43705ae`; deployment unknown.

Declined connector capability is counted as implemented. S9.04 and S10.20 require choosing among several linked accounts, but both roll up done with four done cells each. Their resolvedBy states the capability was declined, one account is supported, and reconnection replaces the existing account. S55.12 correctly records the same underlying multi-account capability as declined. The cited ConnectorAccountSelector component no longer exists. Decision closure is represented as done rather than declined/n/a, inflating completion and contradicting the unchanged criterion and recorded decision.

Impact/trigger: S9.04 and S10.20 require choosing among several linked accounts, but both roll up done with four done cells each. Their resolvedBy states the capability was declined, one account is supported, and reconnection replaces the existing account. S55.12 correctly records the same underlying multi-account capability as declined. The cited ConnectorAccountSelector component no longer exists.

Start at `audit/ledger/ecosystem-capability-ledger.jsonl:1` in `.worktrees/billing-e2e`. Evidence and full anchors: [`inventory-instrument-review.json`](evidence/2026-09-29-ecosystem-review/inventory-instrument-review.json).

Verification: Current guard outputs and isolated fixtures captured in instrument-reproductions.json; no product modification. Limit: This is a proven ledger classification defect, not a demand to implement a capability the founder declined.

Resolution/acceptance: Classify the dependent picker criteria as declined/n/a with the same decision ID and keep completion counts distinct from deliberate scope reduction.

## AUDIT-FILE-LEDGER-IDENTITY-LOST-01

Severity: Medium. Status: open in source snapshot `49d0c30f38ca53570dd4eade84548c9cf43705ae`; deployment unknown.

Per-file ledger regeneration loses review evidence and does not bind dirty source. A fixture containing one tracked source and one untracked source produces one row and a -dirty source_commit. Setting its audit_status=reviewed and read_full_file=true then regenerating resets both. Changing tracked source content while preserving line count produces byte-identical ledger output despite different source SHA256 hashes. The generator uses git ls-files without --others, records HEAD plus a generic dirty suffix instead of content hashes, and overwrites rows with default not-started evidence every time.

Impact/trigger: A fixture containing one tracked source and one untracked source produces one row and a -dirty source_commit. Setting its audit_status=reviewed and read_full_file=true then regenerating resets both. Changing tracked source content while preserving line count produces byte-identical ledger output despite different source SHA256 hashes.

Start at `scripts/generate-surface-file-ledger.mjs:33` in `.worktrees/billing-e2e`. Evidence and full anchors: [`inventory-instrument-review.json`](evidence/2026-09-29-ecosystem-review/inventory-instrument-review.json).

Verification: Current guard outputs and isolated fixtures captured in instrument-reproductions.json; no product modification. Limit: The generator explicitly scopes itself to focused CLI/shared paths, so omission of Web/Mobile/Electron roots is a stated scope limitation, not itself a bug. It is an inventory rather than semantic audit proof.

Resolution/acceptance: Include nonignored untracked files, hash each content variant, preserve review results only for identical hashes, invalidate changed variants and label scope explicitly.

## SCHEDULE-POLICY-REFUSAL-AS-SUCCESS-01

Severity: Medium. Status: open in source snapshot `49d0c30f`; deployment unknown.

A claimed task denied by managed-compute policy returns a normal result from
`apps/web/lib/services/scheduled-agent-executor.ts:852-861`. The finalizer at
`apps/web/lib/services/schedule-service.ts:2200-2205` unconditionally records
`success` and announces success. Notification copy says completed, and the
event-trigger handler classifies the delivery as fired. The policy still
prevents provider work; the defect is false completion and lost truthful
task outcome, not a demonstrated authorization bypass.

An unchanged finalizer function extracted/transpiled from hash-bound source
received a simulated subscription-inactive result and returned/announced
success. The existing executor unit test expects the normal skipped return,
so passing that test does not settle the composed outcome. Eight focused
files / 96 tests passed in 9.46 seconds with mocked infrastructure; some
entitlement fixtures use caught fallback paths. No production DB, scheduler,
provider or push delivery was used.

Evidence: [continuous assistant review](evidence/2026-09-29-ecosystem-review/continuous-assistant-review.json)
and [reproduction result](evidence/2026-09-29-ecosystem-review/scheduled-refusal-reproduction.json).
Return an explicit execution outcome and propagate policy refusal through
finalization, notifications and event delivery. Add a composed test in which
managed-compute refusal cannot become success or a completed announcement.

## ELECTRON-REJECTED-RUNTIME-NOT-DISPOSED-01

Severity: Medium. Status: source-confirmed; mounted timing and deployment unverified.

The CLI is spawned with piped stdio. handshake throws after initialize; its catch calls closeServer. closeServer marks closed, rejects requests, removes the map entry and emits runtime-stopped, but neither ends stdin nor kills/detaches the child. The next ensureServer sees no registered server and spawns another. The rejected child retains its open pipe and is excluded from stopAllDeveloperRuntimes, which iterates the map.

Trigger/impact: Configure an installed CLI that answers initialize with an unsupported protocol, runtime version or missing thread/turn capability. Open an approved coding folder, then retry the unavailable folder. Malformed output and oversized incomplete frames use the same disposal path. An ordinary compatibility mismatch can leave an idle app-server alive on every retry. If disposal follows a protocol failure during a running turn, the unregistered runtime can also continue work. No resource-exhaustion magnitude or live leakage was measured.

Source: `apps/desktop/electron/runtime/developerSessionService.ts:678` in `49d0c30f`. [Full evidence](evidence/2026-09-29-ecosystem-review/electron-protocol-review.json). No new tests, native build or mounted Electron run was performed. No mounted Electron run, process listing after a rejected handshake, or new regression test executed.

Resolution/acceptance: Dispose failed handshakes and framing failures through the same owned shutdown path as explicit stop; retain child ownership until exit. Test rejected handshake disposal, buffered old-child notifications and replacement ordering through child exit.

## ELECTRON-CLOSED-RUNTIME-STALE-EVENTS-01

Severity: Medium. Status: source-confirmed; mounted timing and deployment unverified.

The stdout listener captures the old server. acceptChunk/acceptLine/handleNotification have no early server.closed or registry-generation check. acceptChunk tests closed only after accepting one line, so each later chunk can still deliver its first notification. Notifications carry root/thread/turn ids but no runtime generation. The local session consumer filters the thread but does not check the event turn id before appending output, replacing approval or settling the current turn.

Trigger/impact: Stop a runtime or discard it after a protocol failure while stdout has a buffered notification or emits another data chunk. Start or reopen the same root/session during the cleanup interval. A late old-turn delta can append to a replacement turn, a stale approval can reappear after runtime-stopped cleared it, or a late finished event can settle the newer turn in the same thread. This concerns ordinary buffered callbacks; no forged protocol input or exploit was constructed.

Source: `apps/desktop/electron/runtime/developerSessionService.ts:295` in `49d0c30f`. [Full evidence](evidence/2026-09-29-ecosystem-review/electron-protocol-review.json). No new tests, native build or mounted Electron run was performed. No asynchronous child/React regression test executed. Cross-account or permission impact remains unclassified.

Resolution/acceptance: Fence old-child callbacks by current runtime identity and closed state; consumers should match the current turn before applying turn-specific events. Test rejected handshake disposal, buffered old-child notifications and replacement ordering through child exit.

## ELECTRON-REPLACEMENT-BEFORE-SHUTDOWN-01

Severity: Medium. Status: source-confirmed; mounted timing and deployment unverified.

terminate ends stdin and schedules SIGKILL after 1,500 ms, then synchronously calls closeServer, which removes the map entry. stopDeveloperRuntime returns void and exposes no exit promise. ensureServer can immediately spawn a replacement; readyServer waits only for that new child handshake. The prior CLI releases its writer leases at the end of asynchronous host shutdown, after terminating process trees and waiting for managers/tasks.

Trigger/impact: Use Stop background coding runtime, then immediately open/resume/start work in that folder while the prior CLI is still shutting down. Old and new runtimes may overlap for the same approved folder. A fast restart can encounter the old writer lease instead of resuming immediately, and old work can finish during the newly available runtime interval. No overlap duration or visible conflict was measured.

Source: `apps/desktop/electron/runtime/developerSessionService.ts:1195` in `49d0c30f`. [Full evidence](evidence/2026-09-29-ecosystem-review/electron-protocol-review.json). No new tests, native build or mounted Electron run was performed. No real subprocess timing, writer-conflict reproduction or shutdown/restart integration test executed.

Resolution/acceptance: Keep a stopping registry entry with an exit/shutdown promise and sequence replacement admission after it, while retaining a bounded kill fallback. Test rejected handshake disposal, buffered old-child notifications and replacement ordering through child exit.

## CHROME-SAME-ACCOUNT-NEW-SESSION-HISTORY-01

Severity: Medium. Status: reproduced against current source `49d0c30f`; deployed behavior unknown.

The history drawer and active conversation lookup cannot find the retained record. Pending local mirror work is also filtered out. This hides data rather than deleting it; account-backed history cannot be rehydrated by the current flags-only pull.

The real upsertConversation/listConversations/getConversation functions ran against callback-correct mocked chrome.storage.local. Old-session owner could list/read the chat, another account saw none, and the persisted conversations array retained one record. The same account/new-session list returned [] instead of one chat. Clerk resolveSessionOwner sets authIncarnation to session.id. Persistent conversation owner is that complete ManagedCloudOwner, and sameManagedCloudOwner compares both accountId and authIncarnation. The mounted owner-transition resets visible messages/conversation id and drawer calls listConversations for the current owner. Cloud delta pull filters the same owner and its insert port is a no-op, so it cannot recover earlier-session history.

Source: `apps/extension/src/features/background/conversation-history.ts:1392`. [Exact harness, source hashes and output](evidence/2026-09-29-ecosystem-review/chrome-review.json). Limits: Real persistence normalization/filtering is tested with callback Chrome storage mocks. Real Clerk login and whole panel rendering are not mounted. Changing session authority comparison globally would weaken the correctly strict in-flight ownership boundary and is not the proposed fix.

Resolution/acceptance: Save account A history under session A1, revoke/sign out, sign in as A2 and require retained history plus safe pending mirror recovery; account B remains isolated. Model persistent data ownership separately from auth-incarnation operation leases, retaining strict stale-stream/approval/cancellation fencing.

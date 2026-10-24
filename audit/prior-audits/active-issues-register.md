# Active issues and execution plan

Status: Current
Owner: Founder + platform lead
Last updated: 2026-10-15

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
**Evidence requalified October 9, 2026:** The September 8 claim of zero
`@agiworkforce/compliance` imports anywhere in `apps/web` is contradicted by
current source. `apps/web/lib/server/data-region.ts:5-15,41-45,311-317` imports
and uses shared region selection and route exclusions;
`apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:15-19,1725-1728`
imports and uses the shared transport-exclusion helper. These region-policy
consumers do not establish a server-owned provider-consent record or a mounted
jurisdiction-consent gate. The earlier provider/tier/routing and migration-absence
claims above are dated September 8 assessments, not a new exhaustive current
absence proof or live route test. The current compliance source review (`audit/checklist/reviews/coverage-shared-contract-compliance-2026-10-09-009.json`, untracked)
keeps the consent/gate gap separate from existing region-policy imports; no
legal-compliance, deployed-account or provider-routing acceptance is inferred.
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

## MEMORY-SENSITIVE-OFF-KEEPS-SAVED-01

Severity: Medium. Status: open; recorded 2026-10-02 on `lane/memory-sensitive`.

Claude removes sensitive items already saved to memory when Include sensitive
topics in memory is turned off or its save notice is declined
(support.claude.com/en/articles/11817273, read 2026-10-02). Here the switch only
stops new learning: memories saved before the switch existed, or while it was
on, stay and are read into every chat until the user deletes them, which is what
the switch copy and the memory article say.

Start at `apps/web/features/settings/sections/MemorySection.tsx`.

Resolution/acceptance: turning the switch off offers to remove the saved
sensitive memories, found with `sensitiveMemoryTopic` and confirmed through
`useConfirmAction`, and a read-time filter leaves them out of context while the
switch is off. Test both the removal and the filter.

## MEMORY-SENSITIVE-SAVE-NOTICE-01

Severity: Low. Status: open; recorded 2026-10-02 on `lane/memory-sensitive`.

Claude shows a notice above the message box each time it saves something on a
sensitive topic, so the user can review it or change the setting
(support.claude.com/en/articles/11817273, read 2026-10-02). Here a sensitive
memory saved with the switch on, or on an explicit "Remember that", is written
without one.

Start at `apps/web/lib/services/managed-memory-context-service.ts`.

Resolution/acceptance: the write reports the topic it matched, and web, desktop
and mobile show the notice with links to the memory and to the setting.

## MEMORY-SENSITIVE-DECLINE-NOTICE-01

Severity: Low. Status: open; recorded 2026-10-02 on `lane/memory-sensitive`.

Claude shows a one-time notice in chat the first time it declines to save a
memory because it referenced a sensitive topic, and the user can turn on
Include sensitive topics in memory from it
(support.claude.com/en/articles/11817273, read 2026-10-02). Here
`persistManagedAutoMemoryFacts` counts a `sensitive_topic_not_opted_in` refusal
as excluded and says nothing, so a user who mentions their faith or a diagnosis
across many chats has nothing remembered and is never told the setting exists.
The refusal happens in the post-turn recorder, after the answer, so no turn can
carry it. MEMORY-SENSITIVE-SAVE-NOTICE-01 covers the other notice, on save.

Start at `apps/web/lib/services/managed-memory-context-service.ts`.

Resolution/acceptance: the first such refusal for an account records that a
notice is due in the account's memory settings; web, desktop and mobile show it
once above the composer on the next chat, with Turn on and Not now, and either
answer clears it. Test the server mark (first refusal only, never the content)
and each surface's notice.

## MEMORY-EXTRACTION-PROMPT-V2-INTERNAL-01

Severity: Medium. Status: open; recorded 2026-10-02 on `lane/memory-sensitive`,
revised 2026-10-02.

Model extraction is on by default (D-2026-09-15-02). An account with Include
sensitive topics in memory off is now sent to the model only when the version of
`product.memory_fact_extraction` its prompt flags select tells the model to
leave those topics out and names the details memory never keeps
(`leavesOutSensitiveMemoryTopics` and `leavesOutNeverKeptMemoryDetails` in
`apps/web/lib/prompts/prompt-manifest.ts`). The pinned version 1 does neither,
so those accounts, which is every account by default, learn from the pattern
extractor alone, exactly as with the switch off. That closes the privacy gap
(a fact the model wrote in another language, or in a phrasing the English
screen does not read, could be stored), at the cost of the model-assisted
learning the founder decision chose.

Version 3 (asks for the user's name where version 1 asked for identity, leaves
out the sensitive topics and the details memory never keeps) is staged on
internal and is the only version that qualifies; version 2 (version 1 plus the
leave-out sentence) never names the never-kept details, so it no longer
qualifies. Version 3 cannot advance without an eval quality signal, and
`tools/evals/prompt-coverage.json` records no extraction corpus. Accounts with
the switch on resolve `product.memory_fact_extraction_all_topics`, which
advances on its own (MEMORY-ALL-TOPICS-PROMPT-NEVER-KEPT-01).

Start at `apps/web/lib/services/model-memory-extraction.ts`.

Resolution/acceptance: an extraction corpus that includes sensitive-topic
messages in English and in other languages, a promotion-gate run, a canary
advance of `product.memory_fact_extraction@3` that carries the quality signal,
then a stable advance and a pin. Model extraction returns for these accounts by
itself once a version that carries the leave-out sentence and names the
never-kept details serves, through a prompt flag, a rollout or the pin.

## MEMORY-ALL-TOPICS-PROMPT-NEVER-KEPT-01

Severity: Medium. Status: open; recorded 2026-10-02 on `lane/memory-sensitive`,
revised 2026-10-02.

Memory never keeps passwords, keys and tokens, payment card and bank account
details, government ID numbers, biometric identifiers, street addresses and map
coordinates, criminal history or immigration status, and Claude says the same
of ID numbers, criminal history, financial account numbers and immigration
status (support.claude.com/en/articles/11817273, read 2026-10-02).
`product.memory_fact_extraction_all_topics@1`, the pinned extraction prompt for
an account with Include sensitive topics in memory on, never names those
details, which left the English screen in
`packages/contracts/context/src/memory-content-policy.ts` as the only filter on
the model's output, so a fact written in another language, such as "User
estuvo en la carcel", could be stored. Model extraction now runs for these
accounts only when the served version names the never-kept details
(`leavesOutNeverKeptMemoryDetails` in
`apps/web/lib/prompts/prompt-manifest.ts`). Version 2 does, and is staged on
internal; until it serves, these accounts learn from the pattern extractor
alone, the same recall cost MEMORY-EXTRACTION-PROMPT-V2-INTERNAL-01 records for
accounts with the switch off.

Start at `apps/web/lib/services/model-memory-extraction.ts`.

Resolution/acceptance: the extraction corpus
MEMORY-EXTRACTION-PROMPT-V2-INTERNAL-01 asks for, with never-kept cases in
English and other languages, grades
`product.memory_fact_extraction_all_topics@2`, which then advances through
canary to stable and is pinned.

## MEMORY-SAVE-TOOL-SENSITIVE-OPT-IN-01

Severity: Low. Status: open; recorded 2026-10-02 on `lane/memory-sensitive`.

The save_memory description always says a sensitive fact is kept only while
Include sensitive topics in memory is on, whatever the member chose, and a save
the model calls counts as learning, not as the user's request. With the switch
off, "Can you remember I'm diabetic?" is refused, and the user is told to say
"Remember that" or turn the switch on in Settings > Memory on the web or in the
mobile app. ChatGPT is described as saving what the user explicitly asks it to
remember; founder research entry 10 asks for the official wording, because
help.openai.com refused the fetch.

Start at `apps/web/lib/server/tools/memory-tools.ts`.

Resolution/acceptance: the switch is passed into the tool definition, and a
decision is recorded on whether a save the user asked for in plain words counts
as their request.

## MEMORY-MOBILE-PRE-SWITCH-BUILDS-01

Severity: Low. Status: open; recorded 2026-10-02 on `lane/memory-sensitive`.

Claude says users on older mobile versions do not see the sensitive-topic save
notice (support.claude.com/en/articles/11817273, read 2026-10-02). Here a mobile
build released before Include sensitive topics in memory has no switch, so its
user changes the setting on the web. In Cloud mode the server applies the
account's choice, but in Local mode such a build learns sensitive topics on the
device with no filter until it is updated.

Start at `apps/mobile/src/features/memory/services/localMemoryWriter.ts`.

Resolution/acceptance: none in code for builds already shipped; the row closes
when the minimum supported mobile version carries the switch and the filter.

## MEMORY-COMMANDS-CLI-01

Severity: Medium. Status: open; recorded 2026-10-02 on `lane/memory-sensitive`.

Web, desktop, mobile and Chrome send only the typed text to
`/api/memory/commands` and report the outcome with `memory_command`, which the
model is told. The CLI does neither, and the server no longer reads a remember
out of CLI messages, which also carry inlined files, selections and pages. So a
"Remember that" typed in the CLI is learned like any other sentence, behind the
sensitive-topics switch, the tool-assisted gate and a suppressed auto source,
with no confirmation to the user or the model. `agi memory add` and Settings >
Memory remain the explicit paths. VS Code has the same gap as
MEMORY-COMMANDS-VSCODE-01. This row split MEMORY-COMMANDS-CLI-VSCODE-01.

Start at `apps/cli/src/models/streaming.rs:434`.

Resolution/acceptance: the CLI runs the command path on the typed text before
the turn, reports the outcome with `memory_command`, and the server adds the
turn note for `cli`.

## MEMORY-COMMANDS-VSCODE-01

Severity: Medium. Status: open; recorded 2026-10-02 on `lane/memory-sensitive`.

The VS Code extension, like the CLI (MEMORY-COMMANDS-CLI-01), never sends the
typed text to `/api/memory/commands` and never reports `memory_command`, and the
server no longer reads a remember out of its messages, which carry selections
and inlined files. A "Remember that" typed in VS Code is learned passively,
behind the sensitive-topics switch and the other learning gates, with no
confirmation. Settings > Memory on the web remains the explicit path. This row
split MEMORY-COMMANDS-CLI-VSCODE-01.

Start at `apps/extension-vscode/src/utils/api.ts:684`.

Resolution/acceptance: the extension runs the command path on the typed text
before the turn, reports the outcome with `memory_command`, and the server adds
the turn note for `vscode`.

## AUDIT-ADMIN-GUARD-LEXICAL-CONTROLS-01

Severity: Medium. Status: reproduced against unchanged current source in isolated temporary fixtures on 2026-10-09; mounted product impact unverified.

An otherwise unguarded POST with four guard names only in comments returns no findings. A doWrite export with no audit is accepted when an unrelated export in the same imported module contains recordAuditEvent. No-controls fixture produces four findings and real-controls fixture produces zero.

Source: `scripts/lib/admin-route-guards.mjs:167`. Exact evidence (`audit/checklist/evidence/coverage-admin-controls-2026-10-09.json`, untracked) and bounded review (`audit/checklist/reviews/coverage-ecosystem-instruments-2026-10-09-001.md`, untracked). Checker-only temporary fixtures; does not demonstrate an exploitable mounted admin route.

Resolution/acceptance: Check executable call paths rather than raw substrings, discard comments/strings, and resolve the called service export rather than any call in its module. Require adverse fixtures for dead/commented controls and unrelated audit exports. No implementation fix was made, per the documentation-only audit scope.

October 9 session/header/upload/support qualification: Original exported operator census/classification engines accept a customer-content operator route whose support gate exists only in a comment or an unused import outside the gate-free handler. A real call shape passes, while absent gate, unclassified and malformed entries refuse. Extend the existing whole-file commented/unrelated control-credit owner; no mounted operator access or content disclosure is established. Actual source report (`audit/checklist/reviews/coverage-session-response-header-guard-source-2026-10-09-043.json`, untracked); 28 independent source controls (`audit/checklist/evidence/coverage-session-response-header-inert-controls-2026-10-09-043.json`, untracked); current guard outcomes (`audit/checklist/evidence/coverage-session-response-header-current-source-gates-2026-10-09-043.json`, untracked). Zero new cause, no runtime effects.

## AUDIT-AGENT-DOC-UNTRACKED-SCOPE-01

Severity: Low. Status: reproduced against unchanged current source in isolated temporary fixtures on 2026-10-09; mounted product impact unverified.

In a separate temporary Git repository, apps/unregistered/AGENTS.md passes while untracked (exit 0); staging exactly that same file produces exit 1.

Source: `scripts/check-agent-docs.mjs:79`. Exact evidence (`audit/checklist/evidence/coverage-agent-doc-enumeration-2026-10-09.json`, untracked) and bounded review (`audit/checklist/reviews/coverage-ecosystem-instruments-2026-10-09-001.md`, untracked). No current production privilege bypass demonstrated; scoped contract guard misses pre-staging changes.

Resolution/acceptance: Enumerate tracked plus current nonignored untracked scoped files, retain vendored ownership exclusions, and test both untracked and staged fixtures. No implementation fix was made, per the documentation-only audit scope.

## EXT-MIRROR-TEST-FAKE-COVERAGE-01

Severity: Low. Status: existing open instrument defect; additional concrete instances recorded 2026-10-09. The original `security-fixes.test.ts` scope and prior evidence remain open; it was not freshly read or closed in this wave.

The full-file specialist review found two additional instruments with the same tracking concern. `autofill-escalation-agent-integration.test.ts` describes real content/background handler coverage but imports neither; its composed helper test calls `runAgentLoop` directly and itself emits `AGI_CU_STEP` from its supplied callback. Removing the runtime handoff/broadcast does not exercise that purported handler subject. `connection-lifecycle.test.ts` imports reconnect helpers, while broadcaster, timeout and status groups exercise implementations local to the test. Those groups cannot settle corresponding worker execution.

Full-file review, exact locations and separate source claims (`audit/checklist/reviews/coverage-chrome-tests-2026-10-09-001.json`, untracked). Local report identities `CHROME-AUTOFILL-INTEGRATION-HANDLERS-UNEXERCISED-01` and `CHROME-LIFECYCLE-TEST-LOCAL-REPLICAS-01` remain preserved instances under this existing canonical tracking owner, rather than duplicate register rows. Lead independently inspected the handler claims, local lifecycle subjects and manual progress emission. Neither case was newly run or mutated; missing production behavior is not inferred.

Resolution/acceptance: Exercise the real message handlers and native worker lifecycle with controlled dependencies, or accurately qualify helper-only coverage. Adverse controls must detect removing the actual producer/consumer behavior. The October9 fourth Chrome packet separately re-read the original security-fixes file through EOF: its private test subjects remain disconnected, while real gateway/Markdown/redactor groups are distinguished. No test or implementation edits were made.

October9 further instances: recorder-redaction.test.ts declares its own patterns and sanitizer; screenshot-tab-restriction.test.ts tests a private tab/window resolver and never captures pixels. The lead independently read the screenshot file fully and recorder subject ranges, and the specialist read both through EOF. Fourth packet current-source receipts (`audit/checklist/reviews/coverage-chrome-tests-2026-10-09-004.json`, untracked). These remain instrument-coverage instances under this existing ID; screenshot capture against the real handler is covered by `apps/extension/__tests__/background-screenshot-capture.test.ts`. Production recorder behavior and full browser tests were not run.

## AUDIT-CODEOWNERS-COMMENT-ONLY-01

Severity: Medium. Status: reproduced against unchanged guard CLI in isolated temporary fixtures on 2026-10-09.

Prefix every line of current CODEOWNERS with #. Actual unchanged guard returns exit 0 with zero active entries. A marker-absence control returns exit 1.

Source: `scripts/check-codeowners-contract.mjs:54`. Exact fixture results (`audit/checklist/evidence/coverage-governance-guards-2026-10-09.json`, untracked) and full-file review (`audit/checklist/reviews/coverage-ecosystem-governance-2026-10-09-002.json`, untracked). No GitHub ownership setting was changed and no missing reviewer assignment was observed. The instrument fails to establish active ownership. The existing twelve CODEOWNERS/coverage-floor tests passed; no tests or guard code were changed.

Resolution/acceptance: Parse active CODEOWNERS entries and require owner tokens for each protected pattern; demonstrate comment-only, ownerless, deleted and valid fixtures.

## AUDIT-STEP-LEASE-SET-AS-OWNERSHIP-01

Severity: Medium. Status: reproduced against unchanged guard CLI in isolated temporary fixtures on 2026-10-09.

UPDATE cloud_agent_execution_operations SET status=$1, lease_token=$2 WHERE id=$3 passes, although WHERE never compares current lease ownership. Unguarded update control fails; proper WHERE lease_token comparison control passes. Fixture includes a separate locked SELECT to satisfy nonzero scan coverage.

Source: `scripts/check-concurrent-step-lease.mjs:17`. Exact fixture results (`audit/checklist/evidence/coverage-governance-guards-2026-10-09.json`, untracked) and full-file review (`audit/checklist/reviews/coverage-ecosystem-governance-2026-10-09-002.json`, untracked). No SQL ran and no mounted double execution or current unsafe production statement was established. The existing twelve CODEOWNERS/coverage-floor tests passed; no tests or guard code were changed.

Resolution/acceptance: Require current lease comparison in the mutation WHERE clause or verify actual transaction-scoped locked ownership. Reject SET-only token writes, comments/literals and unrelated locks while accepting the real claim transaction.

## AUDIT-IMMUTABILITY-HISTORICAL-TRIGGER-01

Severity: Medium. Status: open in current source reviewed 2026-10-09; no implementation change.

Immutability guard credits dropped or disabled historical triggers. Trigger collection records create statements without applying later drop or disable operations.

Verification: Actual checker: active trigger passes, absent trigger fails, appended DROP TRIGGER and DISABLE TRIGGER both still pass with protected=1. Exact receipt (`audit/checklist/evidence/coverage-security-guard-controls-2026-10-09.json`, untracked); full-file review (`audit/checklist/reviews/coverage-ecosystem-guards-2026-10-09-003.json`, untracked). The existing seven guard suites passed 90 tests; these additional negative controls expose cases absent from them.

Limit: Only a temporary synthetic migration tree was checked. No SQL was executed or live schema queried; current production trigger state is unknown.

Resolution/acceptance: Make the instrument reject the demonstrated negative case while retaining the valid control. Verify the actual guarded behavior independently before using a green scanner as product acceptance. No guard or product code was edited.

## AUDIT-AUTH-SURFACE-LEXICAL-CONTROLS-01

Severity: Medium. Status: open in current source reviewed 2026-10-09; no implementation change.

Auth guard credits false cookie flags and commented limiter/audit names. Control-name regexes accept comments, and cookie flag detection checks name occurrence anywhere in the source without values.

Verification: Actual checker: missing cookie names fails; false-valued httpOnly/secure with sameSite none and comment-only flags pass; absent limiter/audit names fail twice while comment-only names pass. Exact receipt (`audit/checklist/evidence/coverage-security-guard-controls-2026-10-09.json`, untracked); full-file review (`audit/checklist/reviews/coverage-ecosystem-guards-2026-10-09-003.json`, untracked). The existing seven guard suites passed 90 tests; these additional negative controls expose cases absent from them.

Limit: Synthetic route source was never executed and no cookie/auth state was mutated. This is an instrument defect, not evidence any current real route has unsafe cookies or missing controls.

Resolution/acceptance: Make the instrument reject the demonstrated negative case while retaining the valid control. Verify the actual guarded behavior independently before using a green scanner as product acceptance. No guard or product code was edited.

October 9 privacy/security/license qualification: Comment-only attribute text and undefined values satisfy required-name checks, and five commented-out calls satisfy the write census. Valid flags pass; literal false flags and empty census refuse. Extend the existing cookie/control lexical-credit owner; no unsafe real cookie or browser state alleged. Source: `scripts/check-session-cookie-attributes.mjs:30-53`, `scripts/check-session-cookie-attributes.mjs:123-138`, `scripts/check-session-cookie-attributes.mjs:173-191`. Current source report (`audit/checklist/reviews/coverage-privacy-security-claim-guard-source-2026-10-09-042.json`, untracked); independent controls (`audit/checklist/evidence/coverage-privacy-security-claim-inert-controls-2026-10-09-042.json`, untracked); current checker/test outcomes (`audit/checklist/evidence/coverage-privacy-security-claim-current-source-gates-2026-10-09-042.json`, untracked). Zero new cause; current security-checker failure and prior RLS suite failure remain separately open. No source or runtime mutation.

## AUDIT-RUN-STATE-TOKEN-AS-PREDICATE-01

Severity: Medium. Status: open in current source reviewed 2026-10-09; no implementation change.

Run-state write classifier accepts an inert guard token. Whole-statement substring detection of RUN_HAS_NOT_ENDED does not prove a guard interpolation or state predicate.

Verification: Actual runStateWrites: id-only predicate yields guarded=false; adding a tautological quoted token comparison yields guarded=true; actual state-any predicate positive control also yields true. Exact receipt (`audit/checklist/evidence/coverage-security-guard-controls-2026-10-09.json`, untracked); full-file review (`audit/checklist/reviews/coverage-ecosystem-guards-2026-10-09-003.json`, untracked). The existing seven guard suites passed 90 tests; these additional negative controls expose cases absent from them.

Limit: Exported classifier was executed, not SQL or a run-state transition. Current service race/exploit and database behavior were not run.

Resolution/acceptance: Make the instrument reject the demonstrated negative case while retaining the valid control. Verify the actual guarded behavior independently before using a green scanner as product acceptance. No guard or product code was edited.

## DESKTOP-SETTINGS-SYNC-GAP-01

Requalified October 9, 2026. The older assertion that every desktop app mode has zero settings-sync wiring is contradicted by current source. The existing identity is retained; implementation and runtime acceptance are separate.

`apps/desktop/src/services/managedCloudSettingsSync.ts:145-429` implements a coordinator with managed-mode/account eligibility, scoped activation, push/pull, dirty settings, cursor/base rebasing, lifecycle subscriptions and account restoration. Its current client factory and host ports at `:547-603` bind the shared managed settings client, settings store, auth/mode subscriptions and local storage. `apps/desktop/src/App.tsx:720-732` starts it after settings hydration and registers cleanup. Shared reducer ownership remains `packages/client/sync/src/settings.ts`.

The full specialist source receipt (`audit/checklist/reviews/coverage-shared-client-2026-10-09-005.md`, untracked) and independent coordinator/App excerpts establish retained renderer wiring. They do not prove this renderer is the hosted public Electron surface, native store/runtime behavior, deployment, actual accounts, network synchronization, conflict recovery or cross-device acceptance. The original High label is retained pending scope reassessment rather than downgraded from a source-only check. No feature or implementation fix is claimed.

## SHARED-MEMORY-CREDENTIAL-TOPIC-REFUSAL-01

Medium. Confirmed October 9, 2026 against current shared policy and managed web write consumer.

Rechecked on main (3ccb6f6) on 2026-10-15: still present. The credential pattern in `packages/contracts/context/src/memory-content-policy.ts:55` is unchanged on main, and main's manual create route still maps the refusal to forbidden. Line numbers for `apps/web/app/api/memory/route.ts` are main's.

`packages/contracts/context/src/memory-content-policy.ts:55` allows an absent declaration/delimiter and then any following nonspace character. Actual unchanged policy categorizes both “User prefers a password manager” and “Password managers are useful” as credentials. Neither input states a password. Ordinary token-handling/noncredential controls remain eligible and a synthetic stated password remains refused.

`apps/web/lib/services/managed-memory-context-service.ts:501-510,637-669` turns this category into an admission refusal and throws `MemoryIneligibleError` before persistence. The manual create route at `apps/web/app/api/memory/route.ts:143-162` calls that writer and maps the error to forbidden. The specialist receipt (`audit/checklist/reviews/coverage-shared-context-2026-10-09-006.md`, untracked) exercises the actual shared policy and writer with fresh inert dependencies and zero DB calls. Independent root controls (`audit/checklist/evidence/coverage-shared-policy-mapping-controls-2026-10-09.json`, untracked) exercise the actual exported policy, including a different harmless topic sentence.

This is false refusal, not credential disclosure or a Local/BYOK transfer. No mounted HTTP route, account, extraction model, storage, deployment or prevalence was tested. The acceptance target is to preserve stated-secret refusals while admitting harmless credential-management topics, with shared-policy and writer controls. Source remains unchanged.

## SHARED-SYNC-DIRTY-MESSAGE-PULL-OVERWRITE-01

Medium. Confirmed October 9, 2026 for an explicitly bounded current-source mobile sync sequence.

Rechecked on main (3ccb6f6) on 2026-10-15: still present. Main's 0ce5126800 changed how the merge takes model and provider, but it still assigns incoming content and metadata over a dirty message, and `syncNow` still pulls straight after push. Line numbers are main's.

`apps/mobile/services/cloudSyncEngine.ts:555-565` keeps the dirty ref when a message changes during a push, correctly advancing its CAS revision. Actual `syncNow` then pulls immediately after push at `:962-963`. Pull at `:473-488` applies message rows through `packages/client/sync/src/messages.ts:34-75`, whose merge assigns incoming content and metadata without dirty-message protection.

The specialist actual-source pipeline probe (`audit/checklist/reviews/coverage-shared-client-2026-10-09-005.md`, untracked) uses canonical push/pull schemas, valid UUIDs, fresh stores/cursors/dirty queues and inert API ports. With an in-flight newer local edit and the acknowledged older row in the subsequent nonempty pull, content and metadata revert to the sent snapshot while the dirty ref remains. An empty-pull control preserves the edit; an unchanged-message control clears the dirty ref. The independent root reducer controls (`audit/checklist/evidence/coverage-shared-policy-mapping-controls-2026-10-09.json`, untracked) corroborate unconditional incoming content mapping, without claiming to exercise the full pipeline.

The finding requires a managed eligible mobile sync and a subsequent pull containing that row. React Native, real stores/auth/server/network/database/stream timing and actual frequency were not exercised. No Local/BYOK transfer or deployed lost-edit event is asserted. Preserve dirty local fields while advancing the remote base, with acknowledged-row, clean, empty-pull and tombstone controls. Source remains unchanged.

## AUDIT-CONFIG-KEY-COMMENT-READER-01

Severity: Low. Status: open in current source reviewed October 9, 2026; no implementation edits.

The direct dot/bracket env-token scanner includes source comments. In isolated fixed-registry controls, an actual read passes, absent read produces the unused-key error, and comment-only process.env spelling passes with one reported reader. Eleven existing tests pass without this case.

Verification: Exact control receipt (`audit/checklist/evidence/coverage-config-reader-controls-2026-10-09.json`, untracked) and full-file source review (`audit/checklist/reviews/coverage-ecosystem-concept-guards-2026-10-09-007.md`, untracked).

Limit: This is a lexical coverage false green. No live env usage, secret value, bundle, account, provider or application was run.

Acceptance target: Count executable registered-key reads and retain the real/absent controls; use independent usage evidence before declaring config coverage. Source remains unchanged.

## AUDIT-CONCEPT-TEXT-AS-BEHAVIOR-01

Severity: Medium. Status: open in current source reviewed October 9, 2026; no implementation edits.

The checker scans raw source for SQL mutation text, event string literals, alias names, sweep table names and export spellings. Actual exported functions credit comment-only fixtures in all five channels. The emitted-event literal feeds actual checkDesignations, and a commented contract export feeds actual checkFacets. Missing-text and executable/declaration controls retain their expected distinctions.

Verification: Exact control receipt (`audit/checklist/evidence/coverage-concept-registry-controls-2026-10-09.json`, untracked) and full-file source review (`audit/checklist/reviews/coverage-ecosystem-concept-guards-2026-10-09-007.md`, untracked).

Limit: Seventeen controls concern independent checker channels, not a simultaneous whole-registry bypass. No mutator, product event, retention sweep, contract consumer, live handler or SQL ran.

Acceptance target: Resolve executable syntax and owning call paths for the behavior being claimed; comments and declarations alone must not establish writes, emissions or retention. Source remains unchanged.

## AUDIT-CONCEPT-PRIMARY-KEY-HISTORY-01

Severity: Low. Status: open in current source reviewed October 9, 2026; no implementation edits.

readSchemaInventory applies a fixture rename from id to probe_id, but readPrimaryKeyColumns only collects CREATE-table key spellings and keeps id. Feeding both actual helpers to checkDesignations rejects a concept using the final probe_id identity as a mismatch.

Verification: Exact control receipt (`audit/checklist/evidence/coverage-concept-registry-controls-2026-10-09.json`, untracked) and full-file source review (`audit/checklist/reviews/coverage-ecosystem-concept-guards-2026-10-09-007.md`, untracked).

Limit: The fixture history is source data, never executed SQL. No assertion is made that the current migration chain or applied production schema uses this rename. This is instrument disagreement under a supported source history.

Acceptance target: Advance key evidence through source-ordered schema changes and verify final identity consistently with column inventory, including rename and removal controls. Source remains unchanged.

## AUDIT-CONCEPT-DROPPED-FK-RETAINED-01

Severity: Medium. Status: open in current source reviewed October 9, 2026; no implementation edits.

readForeignKeys records a fixture named foreign-key constraint, then ignores a later DROP CONSTRAINT statement. Actual checkFacets still accepts the child-parent claim from the retained map; an empty-map control rejects it. The table and columns remain in the fixture final inventory.

Verification: Exact control receipt (`audit/checklist/evidence/coverage-concept-registry-controls-2026-10-09.json`, untracked) and full-file source review (`audit/checklist/reviews/coverage-ecosystem-concept-guards-2026-10-09-007.md`, untracked).

Limit: SQL was never applied or queried. The result establishes stale source-instrument evidence, not a missing constraint in the current live DB, orphaned rows or an access-control exploit.

Acceptance target: Apply foreign-key removals and renames in migration order; a dropped named constraint must not continue to establish the relationship in facet acceptance. Source remains unchanged.

## AUDIT-CI-COMMENTED-GATE-CREDIT-01

Severity: Medium. Status: open in current source reviewed October 9, 2026; no implementation edits.

Rechecked on main (3ccb6f6) on 2026-10-15: still present. Main changed `scripts/check-ci-guardrails.mjs` after the 2026-09-27 copy this was found on without changing the cited logic; line numbers for it are main's.

Removing the protocol-type command from the actual workflow body makes the unchanged complete CI parent checker report its absence. Adding only a YAML comment containing that command removes the error and returns the parent to green. The current parent-source baseline also has zero errors.

Verification: Exact control receipt (`audit/checklist/evidence/coverage-ci-guardrail-controls-2026-10-09.json`, untracked) and full-file source review (`audit/checklist/reviews/coverage-ecosystem-concept-guards-2026-10-09-007.md`, untracked).

Limit: The complete checker source was evaluated with SourceTextModule, current read-only filesystem and actual git inventory. Semgrep-allowlist and action-pin child statuses were intercepted to isolate parent checks, so this is not a full CLI guard or GitHub Actions pass. Fixture data did not edit the workflow.

Acceptance target: Bind required gates to executable workflow steps or approved script chains, and retain absent/comment/real-command controls; no green textual match establishes that the gate ran. Source remains unchanged.

## AUDIT-CI-NATIVE-CONDITION-UNBOUND-01

Severity: Low. Status: open in current source reviewed October 9, 2026; no implementation edits.

Rechecked on main (3ccb6f6) on 2026-10-15: still present. Main changed `scripts/check-ci-guardrails.mjs` after the 2026-09-27 copy this was found on without changing the cited logic; line numbers for it are main's.

requireNativeLanesAgree counts four identical condition lines and checks the four native job names independently. A separate YAML-valid fixture removes conditions from every named native job and assigns all four to unrelated synthetic jobs. YAML parsing verifies this association and the unchanged complete parent checker still reports green. A no-condition control fails.

Verification: Exact control receipt (`audit/checklist/evidence/coverage-ci-guardrail-controls-2026-10-09.json`, untracked) and full-file source review (`audit/checklist/reviews/coverage-ecosystem-concept-guards-2026-10-09-007.md`, untracked).

Limit: The earlier detached-text case is a lexical diagnostic only; the YAML-valid case supports this finding. Two independent child checks were intercepted. No actual workflow, native tests, release, CI spend or GitHub job execution changed.

Acceptance target: Validate each native job and its own condition as one structured claim; unrelated jobs must not satisfy the named-lane agreement requirement. Source remains unchanged.

## AUDIT-CONTENT-DEGRADATION-TEXT-CREDIT-01

Severity: Medium. Status: open in current source reviewed October 9, 2026; no implementation edits.

Rechecked on main (3ccb6f6) on 2026-10-15: still present. Main changed `scripts/check-content-blocks.mjs` after the 2026-09-27 copy this was found on without changing the cited logic; line numbers for it are main's.

Content guard credits comments as readers and degradation tests. The actual unchanged guard accepts comment-only required compatibility symbols and a degradation file containing only a MESSAGE_KINDS comment. Removing required reader symbols yields three failures. Its green summary says degraded under test even though this fixture has no executable test body.

Source: `scripts/check-content-blocks.mjs:198-223`. Evidence: coverage-chat-context-guard-controls-2026-10-09.json (`audit/checklist/evidence/coverage-chat-context-guard-controls-2026-10-09.json`, untracked); full source review (`audit/checklist/reviews/coverage-ecosystem-chat-context-guards-2026-10-09-008.json`, untracked).

Limits: Source-owned instrument evidence only; no app, DB, provider, deployment, Gmail privacy failure, legal compliance or product acceptance claim.

Acceptance target: Bind compatibility and degradation evidence to actual executable behavior; preserve actual/absent/comment-only controls. Source remains unchanged.

## AUDIT-TEMPORARY-BOUNDARY-TOKEN-CREDIT-01

Severity: Medium. Status: open in current source reviewed October 9, 2026; no implementation edits.

Temporary boundary guard accepts inert comment markers. A direct unguarded loader call plus only isTemporary and ManagedMemoryPolicy comments yields one counted call and zero failures. The direct unguarded control without markers yields both boundary and policy failures.

Source: `scripts/check-context-temporary-boundary.mjs:71-85`. Evidence: coverage-chat-context-guard-controls-2026-10-09.json (`audit/checklist/evidence/coverage-chat-context-guard-controls-2026-10-09.json`, untracked); full source review (`audit/checklist/reviews/coverage-ecosystem-chat-context-guards-2026-10-09-008.json`, untracked).

Limits: Source-owned instrument evidence only; no app, DB, provider, deployment, Gmail privacy failure, legal compliance or product acceptance claim.

Acceptance target: Require an effective temporary/policy boundary for the actual call; keep absent and comment-only controls distinct. Source remains unchanged.

## AUDIT-TEMPORARY-BOUNDARY-ALIASED-CALL-01

Severity: Medium. Status: open in current source reviewed October 9, 2026; no implementation edits.

Temporary boundary guard omits aliased loader calls. A valid direct caller plus a second unguarded direct caller produces two counted call sites and two failures. Renaming the second import to readMemories makes the same guard count only the valid caller and report no failures. The valid caller avoids the zero-call CLI failure shortcut.

Source: `scripts/check-context-temporary-boundary.mjs:99-109`. Evidence: coverage-chat-context-guard-controls-2026-10-09.json (`audit/checklist/evidence/coverage-chat-context-guard-controls-2026-10-09.json`, untracked); full source review (`audit/checklist/reviews/coverage-ecosystem-chat-context-guards-2026-10-09-008.json`, untracked).

Limits: Source-owned instrument evidence only; no app, DB, provider, deployment, Gmail privacy failure, legal compliance or product acceptance claim.

Acceptance target: Resolve loader identity through import aliases and include the unguarded aliased call while preserving the compliant caller. Source remains unchanged.

## AUDIT-CONVERSATION-GRAPH-HISTORICAL-CONSTRAINT-01

Severity: Medium. Status: open in current source reviewed October 9, 2026; no implementation edits.

Rechecked on main (3ccb6f6) on 2026-10-15: still present. Main changed `scripts/check-conversation-graph.mjs` after the 2026-09-27 copy this was found on without changing the cited logic; line numbers for it are main's.

Conversation graph guard credits dropped historical constraints. The actual exported guard accepts a later fixture migration dropping both required thread constraints because it searches aggregated historical SQL. The absent thread migration control fails. No fixture SQL was executed.

Source: `scripts/check-conversation-graph.mjs:202-208`. Evidence: coverage-chat-context-guard-controls-2026-10-09.json (`audit/checklist/evidence/coverage-chat-context-guard-controls-2026-10-09.json`, untracked); full source review (`audit/checklist/reviews/coverage-ecosystem-chat-context-guards-2026-10-09-008.json`, untracked).

Limits: Source-owned instrument evidence only; no app, DB, provider, deployment, Gmail privacy failure, legal compliance or product acceptance claim.

Acceptance target: Evaluate effective constraints after ordered additions/removals instead of the continued presence of historical creation text. Source remains unchanged.

## AUDIT-CONVERSATION-GRAPH-BLOCK-COMMENT-01

Severity: Medium. Status: open in current source reviewed October 9, 2026; no implementation edits.

Rechecked on main (3ccb6f6) on 2026-10-15: still present. Main changed `scripts/check-conversation-graph.mjs` after the 2026-09-27 copy this was found on without changing the cited logic; line numbers for it are main's.

Conversation graph guard treats block-comment SQL as schema. Wrapping the complete thread migration fixture in a SQL block comment still credits its columns and both constraints. The no-thread-migration control rejects the absent columns and constraints. The checker strips only line comments.

Source: `scripts/check-conversation-graph.mjs:95-133,202-203`. Evidence: coverage-chat-context-guard-controls-2026-10-09.json (`audit/checklist/evidence/coverage-chat-context-guard-controls-2026-10-09.json`, untracked); full source review (`audit/checklist/reviews/coverage-ecosystem-chat-context-guards-2026-10-09-008.json`, untracked).

Limits: Source-owned instrument evidence only; no app, DB, provider, deployment, Gmail privacy failure, legal compliance or product acceptance claim.

Acceptance target: Exclude SQL block comments from effective column and constraint evidence; preserve comment-only and executable source controls. Source remains unchanged.

## AUDIT-CRON-ROUTE-TEXT-CREDIT-01

Severity: Medium. Status: open in current source reviewed October 9, 2026; no implementation edits.

Cron route guard credits inert refusal and loop-ceiling text. A route fixture missing auth refusal fails; the same fixture with refusal/401 only inside a block comment passes. An unbounded loop fails without a ceiling but passes with an unused or block-commented MAX_ROWS_PER_RUN constant. No route or loop was executed.

Source: `scripts/check-cron-contract.mjs:134-146,184-198`. Evidence: coverage-cron-guard-controls-2026-10-09.json (`audit/checklist/evidence/coverage-cron-guard-controls-2026-10-09.json`, untracked); current full source review (`audit/checklist/reviews/coverage-ecosystem-data-contract-guards-2026-10-09-009.json`, untracked).

Limits: Source guard scope only; no deployed auth/data/privacy/telemetry/deadline/rendering incident, database or provider effect, or product acceptance claimed.

Acceptance target: Bind refusal and loop bounds to effective code and control flow; retain absent, comment-only and unused-constant controls. Source remains unchanged.

## AUDIT-CRON-SCHEDULE-VALIDATION-GAP-01

Severity: Low. Status: open in current source reviewed October 9, 2026; no implementation edits.

Cron guard accepts schedules with invalid or empty firing sets. The actual checker accepts 90 30 * * * as slot30:90,59-0 3 * * * with zero slots, and nonnumeric unchecked calendar fields. These source-parser outputs contradict meaningful firing-minute validation; no deployed scheduler behavior was tested.

Source: `scripts/check-cron-contract.mjs:63-96,219-238`. Evidence: coverage-cron-guard-controls-2026-10-09.json (`audit/checklist/evidence/coverage-cron-guard-controls-2026-10-09.json`, untracked); current full source review (`audit/checklist/reviews/coverage-ecosystem-data-contract-guards-2026-10-09-009.json`, untracked).

Limits: Source guard scope only; no deployed auth/data/privacy/telemetry/deadline/rendering incident, database or provider effect, or product acceptance claimed.

Acceptance target: Validate range bounds, nonempty firing sets and supported calendar syntax before registry, overlap and collision acceptance. Source remains unchanged.

## AUDIT-DASHBOARD-PRODUCER-NAME-TEXT-CREDIT-01

Severity: Medium. Status: open in current source reviewed October 9, 2026; no implementation edits.

Dashboard guard confuses recorder spelling with executable producer identity. Real source-fixture constants pass and removing the caller fails. Only a withTurn() comment or an unrelated locally bound same-name function also passes. A genuine imported alias is reported missing. A recorder write present only in a comment also earns writer coverage.

Source: `scripts/check-dashboard-producers.mjs:85-98,134-145,173-185`. Evidence: coverage-producer-deadline-guard-controls-2026-10-09.json (`audit/checklist/evidence/coverage-producer-deadline-guard-controls-2026-10-09.json`, untracked); current full source review (`audit/checklist/reviews/coverage-ecosystem-data-contract-guards-2026-10-09-009.json`, untracked).

Limits: Source guard scope only; no deployed auth/data/privacy/telemetry/deadline/rendering incident, database or provider effect, or product acceptance claimed.

Acceptance target: Resolve imported recorder identities and executable write/call bodies; preserve absent/comment/local-name/real-alias controls. Source remains unchanged.

## AUDIT-DEPENDENCY-DEADLINE-CALL-OMISSION-01

Severity: Medium. Status: open in current source reviewed October 9, 2026; no implementation edits.

Deadline scan omits executed template and nested fetch calls. An unbounded direct fetch fails. The same unbounded call inside a template interpolation is counted as zero calls and passes. An unbounded inner fetch nested in a timed outer fetch is counted only as one outer call and passes. No fetch was executed.

Source: `scripts/check-dependency-deadlines.mjs:80-90,101-119`. Evidence: coverage-producer-deadline-guard-controls-2026-10-09.json (`audit/checklist/evidence/coverage-producer-deadline-guard-controls-2026-10-09.json`, untracked); current full source review (`audit/checklist/reviews/coverage-ecosystem-data-contract-guards-2026-10-09-009.json`, untracked).

Limits: Source guard scope only; no deployed auth/data/privacy/telemetry/deadline/rendering incident, database or provider effect, or product acceptance claimed.

Acceptance target: Preserve executable template interpolation and independently enumerate nested direct fetch calls while excluding literal/comment text. Source remains unchanged.

## AUDIT-DEPENDENCY-DEADLINE-INIT-ASSUMPTION-01

Severity: Low. Status: open in current source reviewed October 9, 2026; no implementation edits.

Named request init earns deadline credit without deadline evidence. A fixture explicitly defines const init={} and forwards it as the second fetch argument; the actual guard returns zero errors. The existing forwarded-init test assumes a caller deadline. Acceptance therefore cannot establish a finite deadline at that call.

Source: `scripts/check-dependency-deadlines.mjs:123-134`. Evidence: coverage-producer-deadline-guard-controls-2026-10-09.json (`audit/checklist/evidence/coverage-producer-deadline-guard-controls-2026-10-09.json`, untracked); current full source review (`audit/checklist/reviews/coverage-ecosystem-data-contract-guards-2026-10-09-009.json`, untracked).

Limits: Source guard scope only; no deployed auth/data/privacy/telemetry/deadline/rendering incident, database or provider effect, or product acceptance claimed.

Acceptance target: Track effective deadline-bearing init provenance or expose this as unverified coverage rather than claiming every scanned request has a deadline. Source remains unchanged.

## AUDIT-DB-SCOPE-TOKEN-AS-PREDICATE-01

Severity: Medium. Status: open in current source reviewed October 9, 2026; no implementation edits.

Rechecked on main (3ccb6f6) on 2026-10-15: still present. Main changed `scripts/check-db-isolation.mjs`, `scripts/check-membership-isolation.mjs` and `scripts/check-org-permissions.mjs` after the 2026-09-27 copy this was found on without changing the cited logic; line numbers for them are main's.

Database scope guard accepts projection and SQL-comment names as predicates. Absent owner/workspace predicates fail, but select owner_id from shared_sessions and select user_id,organization_id from web_conversations pass with no WHERE. An owner_id SQL block comment also passes the owner check. This measures checker false acceptance, not a deployed leak.

Source: `scripts/check-db-isolation.mjs:29-30,1309-1325`. Evidence: coverage-db-isolation-guard-controls-2026-10-09.json (`audit/checklist/evidence/coverage-db-isolation-guard-controls-2026-10-09.json`, untracked); current full source review (`audit/checklist/reviews/coverage-ecosystem-data-contract-guards-2026-10-09-009.json`, untracked).

Limits: Source guard scope only; no deployed auth/data/privacy/telemetry/deadline/rendering incident, database or provider effect, or product acceptance claimed.

Acceptance target: Require an effective predicate for the relevant owner/workspace relation; reject projection/comment-only token controls. Source remains unchanged.

October 9 membership/memory extension under this same canonical owner: Existing canonical owner reused rather than adding separate membership/memory projection-marker rows. Complete fixture guards accept organization_id in a membership projection or SQL comment without a workspace predicate. Memory isolation accepts user_id=user_id plus organization_id in the projection, and accepts both account/workspace marker text only inside a SQL comment. Real predicate and absence controls pair with these acceptances. This extends the original database-guard token-as-predicate finding to two independent duplicated source scanners; it does not infer RLS state, SQL execution or live cross-tenant disclosure.

Additional sources: `scripts/check-membership-isolation.mjs:46,235-242; scripts/check-memory-isolation.mjs:20-25,101-111`. Current full source review (`audit/checklist/reviews/coverage-ecosystem-membership-memory-guards-2026-10-09-024.json`, untracked); independent complete controls (`audit/checklist/evidence/coverage-membership-memory-independent-controls-2026-10-09-024.json`, untracked). The shared acceptance target applies to all three scans; source remains unchanged and runtime/SQL/RLS behavior remains unknown.

October 9 managed/unattended extension under this same canonical owner: Unattended pickup without either gate fails and real rendered gate expressions pass. Projected string data or a SQL comment containing organization_members and ownerMayRunUnattendedSql makes the same unguarded pickup pass as gated. Uppercase module constants resolving to those literal strings also pass, because replacement inserts declaration expression text without proving an effective predicate. Existing token-as-predicate owner is extended.

Additional source: `scripts/check-membership-unattended-work.mjs:59-60,158-164,193-210`. Acceptance target: Require effective account and workspace membership predicates on the selected owner/relation; projected strings, SQL comments and inert declaration text must not discharge the obligation. Actual full source review (`audit/checklist/reviews/coverage-ecosystem-managed-unattended-guards-2026-10-09-025.json`, untracked); complete independent controls (`audit/checklist/evidence/coverage-managed-unattended-independent-controls-2026-10-09-025-refined.json`, untracked). Unchanged guard APIs and source CLIs over isolated inert TypeScript/migration text only.35 unchanged tests and36 final independent controls passed;69 fixture syntax parses establish syntax only. Three current textual CLIs exited0. Initial26-control execution stopped on a disproved quoted-table omission assumption and its actual failure is preserved separately. No SQL, application module/entrypoint/service, provider/native/network/browser/build/database or production state executed; source/config/tool files remain unchanged. No current product policy bypass, account loss or deployed incident is accepted.

October 9 money/usage/Work source qualification: Usage pool complete API/CLI falsely reject an account-only query solely because projected string data contains source_surface; its ordinary account-only counterpart passes. Work full CLI accepts user_id only in a SQL comment after WHERE true, and accepts an owner-bearing INSERT CTE while a separate cloud_agent_events DELETE has no owner predicate. This extends the existing token/relationship ownership with both false rejection and false acceptance; no SQL or actual account authorization executes.

Additional source: `scripts/check-usage-pool-is-shared.mjs:94-104; scripts/check-worktask-scope.mjs:71-82`. Acceptance target: Bind policy checks to effective predicate or owner-bearing write behavior for each relevant relation; projected data, comments and ownership on a different relation must not decide the check. Current source report (`audit/checklist/reviews/coverage-ecosystem-money-usage-worktask-guards-2026-10-09-028.json`, untracked); complete independent controls (`audit/checklist/evidence/coverage-money-usage-worktask-independent-controls-2026-10-09-028-refined.json`, untracked). Unchanged complete source-instrument APIs and byte-identical CLI copies over isolated inert TypeScript/SQL text only.44 unchanged tests and35 final independent controls passed;62 TypeScript fixture parses establish syntax only. Four actual current source CLIs exited0. Two isolated literal arithmetic expressions execute in a VM; no application or fixture module imports, monetary writes, SQL, database, native host, provider, network, browser, build, installation, production action or real checkout staging occurs. Git used by unchanged tests is confined to scrubbed fixture roots. Initial11-control receipt preserves a failed CLI assertion: /tmp versus /private/tmp prevented the copied guard main from running. Final runner normalizes executable/cwd realpaths and asserts nonempty guard output. Source/tool/config files are unchanged; no current product incident or runtime acceptance is established.

October 9 organization/pagination/tier source qualification: Complete CLI rejects an absent policy, but a CREATE POLICY USING comparison of identical app_has_org_permission string literals passes without invoking any permission helper. Current official CREATE POLICY documentation establishes that an effective Boolean USING condition controls applicable row visibility. This extends token-as-predicate ownership only; no schema/RLS/SQL execution or deployed access is established.

Additional source: `scripts/check-org-permissions.mjs:450-467`. Acceptance target: Require an effective policy predicate bound to the permission helper and relevant relation/command; helper names as literal data cannot establish that predicate. Current source report (`audit/checklist/reviews/coverage-ecosystem-org-pagination-tier-guards-2026-10-09-029.json`, untracked); complete independent controls (`audit/checklist/evidence/coverage-org-pagination-tier-independent-controls-2026-10-09-029.json`, untracked). Unchanged complete source guard APIs/CLIs and isolated inert TypeScript/TSX/SQL/Git fixtures only.37 unchanged Node tests and31 independent controls passed;220 fixture syntax parses establish syntax only. Four current source CLIs exited0. Literal fixtures extracted via actual TypeScript AST values, copied role CLI byte identity and nonempty complete CLI output are independently asserted; organization fixtures run fresh subprocesses to avoid graph-cache cross-case state. One literal synthetic function with an injected counter executes in a VM and proves zero terminal calls. No application/fixture module imports, actual authorization/mutation, SQL/database, native host, provider, network, browser, React mount, build, install, production action or real checkout staging. Git init/census and unchanged tests bind throwaway roots with inherited GIT variables scrubbed. Source/tool/config files remain unchanged; no deployed incident or runtime acceptance is established.

October 9 project/prompt/public-share source qualification: The project helper accepts user_id=$2 only in a SELECT projection while WHERE binds only project_id. It also credits an earlier owner/project query in an independent function to a later unscoped read with a different project parameter; reversing source order correctly rejects the latter. Actual discovered nonempty tables, real owner predicates and unscoped refusals are paired controls. Existing effective-predicate/relation ownership is extended; no SQL, RLS or actual authorization executes.

Additional source: `scripts/lib/project-context-boundary.mjs:26-37,141-149,254-274`. Acceptance target: Require an effective owner predicate or proven authorization bound to the relevant query/project/caller; an unrelated projection or earlier independent function cannot authorize a later read. Current source report (`audit/checklist/reviews/coverage-ecosystem-project-prompt-share-guards-2026-10-09-032.json`, untracked); independent controls (`audit/checklist/evidence/coverage-project-prompt-share-independent-controls-2026-10-09-032-final.json`, untracked). Thirty-five unchanged source guard tests, thirty-eight independent inert controls and four individual current source CLIs passed. Fifty-one TypeScript AST syntax/source-kind/binding checks establish fixture subjects. Complete CLI copies are byte-identical, realpath-bound and produce nonempty output. Git fixture operations use explicit throwaway roots and scrub inherited GIT variables; no real checkout staging. Imported modules are unchanged source instruments only; no application/fixture modules, actual SQL/database, project prompt/public share mutation, native/provider/network/browser/build/install/production action or runtime product acceptance. Source/config/tool files remain unchanged. Current CLI findings are textual guard evidence, not deployed incidents.

## AUDIT-DB-INTERPOLATED-SCOPE-WINDOW-01

Severity: Medium. Status: open in current source reviewed October 9, 2026; no implementation edits.

Rechecked on main (3ccb6f6) on 2026-10-15: still present. Main changed `scripts/check-db-isolation.mjs` after the 2026-09-27 copy this was found on without changing the cited logic; line numbers for it are main's.

Unrelated neighboring literals satisfy interpolated SQL scope resolution. An interpolated ownerClause=1=1 source fails without any owner constraint. Adding an unrelated neighboring constant with owner_id text inside the600-character search window makes the unchanged guard pass. The resolved variable still has no owner predicate.

Source: `scripts/check-db-isolation.mjs:1232-1246,1327-1329`. Evidence: coverage-db-isolation-guard-controls-2026-10-09.json (`audit/checklist/evidence/coverage-db-isolation-guard-controls-2026-10-09.json`, untracked); current full source review (`audit/checklist/reviews/coverage-ecosystem-data-contract-guards-2026-10-09-009.json`, untracked).

Limits: Source guard scope only; no deployed auth/data/privacy/telemetry/deadline/rendering incident, database or provider effect, or product acceptance claimed.

Acceptance target: Resolve the interpolated value and its actual dependencies; exclude neighboring statements and unrelated string literals from scope evidence. Source remains unchanged.

## AUDIT-DB-RLS-HISTORICAL-TEXT-CREDIT-01

Severity: Medium. Status: open in current source reviewed October 9, 2026; no implementation edits.

Rechecked on main (3ccb6f6) on 2026-10-15: still present. Main changed `scripts/check-db-isolation.mjs` after the 2026-09-27 copy this was found on without changing the cited logic; line numbers for it are main's.

Database isolation classification credits commented or disabled RLS. An undecided tenant table fails. Real RLS enable passes; the same enable statement inside a SQL block comment also passes. A later migration disabling RLS retains classification credit from the earlier enable. No migration was applied.

Source: `scripts/check-db-isolation.mjs:1389-1420,1428-1436`. Evidence: coverage-db-isolation-guard-controls-2026-10-09.json (`audit/checklist/evidence/coverage-db-isolation-guard-controls-2026-10-09.json`, untracked); current full source review (`audit/checklist/reviews/coverage-ecosystem-data-contract-guards-2026-10-09-009.json`, untracked).

Limits: Source guard scope only; no deployed auth/data/privacy/telemetry/deadline/rendering incident, database or provider effect, or product acceptance claimed.

Acceptance target: Evaluate effective comment-free schema state in ordered migrations and revoke RLS credit after disable/removal. Source remains unchanged.

## AUDIT-CSS-COMMENTED-RUNTIME-TOKEN-01

Severity: Low. Status: open in current source reviewed October 9, 2026; no implementation edits.

CSS guard credits a commented runtime token definition. Actual complete parent-source baseline passes. An injected hyphenated missing token reference fails. Keeping that reference and adding only a setProperty line comment makes the complete source guard pass because raw source populates runtimeProvided. Two initial fixture calibration failures were corrected before evidence credit.

Source: `scripts/check-css-tokens.mjs:384-403,405-416`. Evidence: coverage-css-runtime-token-controls-2026-10-09.json (`audit/checklist/evidence/coverage-css-runtime-token-controls-2026-10-09.json`, untracked); current full source review (`audit/checklist/reviews/coverage-ecosystem-data-contract-guards-2026-10-09-009.json`, untracked).

Limits: Source guard scope only; no deployed auth/data/privacy/telemetry/deadline/rendering incident, database or provider effect, or product acceptance claimed.

Acceptance target: Collect executable runtime definitions with their relevant scope and reject missing/comment-only controls. Source remains unchanged.

October 9 UI-source qualification: The unchanged theme-token guard collects raw --token: definitions before checking references. A missing --ghost reference refuses, while adding only a CSS-comment definition passes. This repeats the existing CSS comment-definition ownership cause; retain its original runtime setProperty evidence, provenance and severity, with zero new cause. Source: `scripts/check-ui-theme-tokens.mjs:88-104`. Actual source report (`audit/checklist/reviews/coverage-ui-system-source-guards-2026-10-09-050.json`, untracked); fresh original21 source controls (`audit/checklist/evidence/coverage-ui-systems-inert-controls-2026-10-09-050-003.json`, untracked); independent source-premise challenge (`audit/checklist/evidence/coverage-ui-systems-independent-challenge-2026-10-09-050.json`, untracked). Acceptance target extension: Require active CSS definitions as well as executable runtime definitions, with relevant scope; inert comment definitions must not satisfy missing-token proof. Actual source reading and bounded source-instrument controls only. No application or fixture modules, TypeScript package/AST guard or test, fixture parser/compiler/typecheck, browser/render/accessibility/contrast, native/provider/network/SQL/database/build/install/production or full CI acceptance. Earlier hygiene/integrity/supply/security/RLS failures remain unresolved. No ignored/unlisted coverage completion claim. First empty-output controls, the later stdout-only validator and a fixed-temp-prefix metadata qualifier are retained uncredited; only fresh exact original guards with canonical paths, source pins, error/signal and diagnostic-channel checks supply control evidence. Zero new cause; original evidence, provenance and severity retained.

## AUDIT-DEPENDENCY-SIDE-EFFECT-IMPORT-01

Severity: Medium. Status: open current source instrument defect independently reproduced October 9, 2026; source unchanged.

Named React and dynamic React imports fail the actual forbidden rule, while a bare import of the same forbidden package passes in a fresh Git fixture. The guard never inventories that side-effect import.

Source: `scripts/check-dependency-direction.mjs:18-19,40-58`. Evidence: coverage-native-import-egress-controls-2026-10-09.json (`audit/checklist/evidence/coverage-native-import-egress-controls-2026-10-09.json`, untracked); current full source report (`audit/checklist/reviews/coverage-ecosystem-native-boundary-guards-2026-10-09-010.json`, untracked).

Limits: Source instrument evidence only; supplied product/import/window/route/generator/SQL fixtures are not executed. No current production egress, authorization, telemetry, window, device grant, native exclusivity, migration or security incident is proved.

Acceptance target: Inventory static side-effect import declarations with exact binding-independent package specifiers and retain the rejecting named/dynamic controls.

October 9 mock-export/reachability source qualification: The unchanged complete production CLI with a zero ceiling rejects a named import from ./fixtures.mock, while the syntactically valid bare side-effect import of the same module disappears and passes. Existing dependency-direction bare-import owner is extended; no new duplicate defect identity and no imported fixture execution.

Additional source: `scripts/lib/production-mocks.mjs:3-4,65-84`. Acceptance target: Inventory static side-effect imports with exact specifier identity independently of binding declarations in each applicable source scanner. Current source report (`audit/checklist/reviews/coverage-ecosystem-mock-exports-reachability-guards-2026-10-09-027.json`, untracked); final complete controls (`audit/checklist/evidence/coverage-mock-export-reachability-independent-controls-2026-10-09-027-final-fidelity.json`, untracked). Current unchanged source instruments/helpers and inert Git/TypeScript/text fixtures only.34 unchanged Node source-instrument tests passed;27 final primary independent controls and one additional byte-identical Rust-root comparison passed with59 TypeScript syntax parses. Three current source CLIs exited0. Synthetic VM factories use literal objects only; no fixture/application module imports, mounted Vitest/React UI, Cargo/Rust compilation, native host, database, provider, network, installation or production effects. Source copies are byte-identical and Git init/add is confined to scrubbed fixture roots. Initial root-level positive fixture had zero discovered tests, so its original failure is retained; corrected nested discovery and an independent root-level omission control qualify the census. Intermediate cache replay used source text with formatting differences; final replay asserts byte-identical mocked/subject/test sources before comparing cached and fresh paths. No source/tool/config fix or deployed incident is accepted.

## AUDIT-DEPENDENCY-DOMAIN-PREFIX-CREDIT-01

Severity: Low. Status: open current source instrument defect independently reproduced October 9, 2026; source unchanged.

Removing the surface contract import fails; replacing it with the configured package name plus -impostor passes. Prefix matching credits a different package as canonical domain consumption.

Source: `scripts/check-dependency-direction.mjs:130-149,155-170`. Evidence: coverage-native-import-egress-controls-2026-10-09.json (`audit/checklist/evidence/coverage-native-import-egress-controls-2026-10-09.json`, untracked); current full source report (`audit/checklist/reviews/coverage-ecosystem-native-boundary-guards-2026-10-09-010.json`, untracked).

Limits: Source instrument evidence only; supplied product/import/window/route/generator/SQL fixtures are not executed. No current production egress, authorization, telemetry, window, device grant, native exclusivity, migration or security incident is proved.

Acceptance target: Match exact canonical package names or their published subpaths, with an explicit slash or end boundary.

## AUDIT-DESKTOP-EGRESS-TEXT-POLICY-01

Severity: Medium. Status: open current source instrument defect independently reproduced October 9, 2026; source unchanged.

A transport with only raw fetch and absent policy markers fails. Adding only a comment containing isOurCloudHost and isPrivateTrustBoundary makes the unchanged source guard pass.

Source: `scripts/check-desktop-local-egress.mjs:75-82`. Evidence: coverage-native-import-egress-controls-2026-10-09.json (`audit/checklist/evidence/coverage-native-import-egress-controls-2026-10-09.json`, untracked); current full source report (`audit/checklist/reviews/coverage-ecosystem-native-boundary-guards-2026-10-09-010.json`, untracked).

Limits: Source instrument evidence only; supplied product/import/window/route/generator/SQL fixtures are not executed. No current production egress, authorization, telemetry, window, device grant, native exclusivity, migration or security incident is proved.

Acceptance target: Bind executable destination/boundary checks to the actual outbound transport and reject comment-only controls.

October 9 egress/install/provider extension under this same canonical owner: MCP complete CLI rejects a direct dial with no policy and explicit private-network opt-in. Only adding a MCP_EGRESS_POLICY comment in the arguments or using that name as serverName data makes the same missing-policy dial pass. A computed allow+PrivateNetwork property is omitted by the private-network substring test while the policy marker remains. Existing egress text-policy owner is extended; no MCP transport/network or provider path executes.

Additional source: `scripts/check-mcp-dial-egress.mjs:46-64,69-82`. Acceptance target: Bind actual egress policy arguments and effective private-network options to the registered dial; comments/data and unresolved computed property forms must not earn policy acceptance. Actual source review (`audit/checklist/reviews/coverage-ecosystem-egress-install-provider-guards-2026-10-09-026.json`, untracked); complete controls (`audit/checklist/evidence/coverage-egress-install-provider-independent-controls-2026-10-09-026-refined.json`, untracked). Current unchanged guard APIs/CLIs over isolated inert TypeScript/text fixtures only.40 unchanged tests and32 final independent controls passed;61 fixture syntax parses establish syntax only. Five current source CLIs exited0. Initial8-control execution stopped when the synthetic positive fallback used policy={...} but the lexical guard requires policy = {...}; original actual failure and refined execution are preserved. No application modules, SQL, policy resolver, plugin installation, provider/MCP/network/native/browser/database/build or production state executed. Source/config/tool files remain unchanged. No deployed security or product incident is accepted.

October 9 Root051 source qualification: Original complete security egress guard admits an unvetted outside target solely after a comment isAllowedUrl( anywhere in the source module. This extends the existing unbound egress-policy marker owner without another cause; direct target refusal and resolved/manual acceptance remain counterguards. Source: `scripts/check-security-egress-inventory.mjs:365-378`. Frozen reading report (`audit/checklist/reviews/coverage-surface-security-source-guards-2026-10-09-051.json`, untracked); independent premise review (`audit/checklist/evidence/coverage-surface-security-independent-challenge-2026-10-09-051.json`, untracked); actual source controls (`audit/checklist/evidence/coverage-surface-security-inert-controls-2026-10-09-051.json`, untracked). Acceptance target extension: Bind executable allowlist/vetting decisions to the actual target and outbound branch; unrelated/commented module text must not earn policy credit. Current source instrument and inert text/value controls only. No application/fixture compilation or execution, provider/network/browser/native/SQL/database/build/install/production or whole CI acceptance; no current product or security incident asserted. Original severity, evidence, acceptance and producer provenance retained; zero new unique cause.

October 10 Root052 source qualification: The cost-origin source guard searches the whole fetch arguments for self-origin text, so an external first target with an origin-named Referer option or query label is reported as self-invocation. Six exact original source-engine inert controls retain neutral external target, real self target and request-origin counterguards. This extends the existing egress marker-to-effective-subject obligation with a source-reporting false-refusal branch, not another unique cause. Source: `scripts/check-vercel-cost-loops.mjs:47-73`. Frozen source report and embedded actual controls/independent qualifications (`audit/checklist/reviews/coverage-service-governance-source-2026-10-10-052.json`, untracked). Acceptance target extension: Bind origin classification to the effective outbound request destination; unrelated option or query-label data must not establish deployment-origin self-invocation. Preserve actual self-target and cron counterguards. Cost companion severity is Low; original canonical egress-policy severity remains Medium with all previous evidence and acceptance branches retained. No fetch, live billing, scheduling policy, network, provider or application execution; no product/security incident. Alias-target omission remains a held limitation and earns no extra issue. Original severity/provenance/evidence retained; zero new unique cause.

## AUDIT-DESKTOP-EGRESS-CALLEE-OMISSION-01

Severity: Medium. Status: open current source instrument defect independently reproduced October 9, 2026; source unchanged.

Bare fetch outside the transport is rejected. The same inert source call through a fetch alias or globalThis.fetch passes because the scanner recognizes only an unqualified exact fetch spelling.

Source: `scripts/check-desktop-local-egress.mjs:48-55; scripts/lib/url-fetch-egress.mjs:98-107`. Evidence: coverage-native-import-egress-controls-2026-10-09.json (`audit/checklist/evidence/coverage-native-import-egress-controls-2026-10-09.json`, untracked); current full source report (`audit/checklist/reviews/coverage-ecosystem-native-boundary-guards-2026-10-09-010.json`, untracked).

Limits: Source instrument evidence only; supplied product/import/window/route/generator/SQL fixtures are not executed. No current production egress, authorization, telemetry, window, device grant, native exclusivity, migration or security incident is proved.

Acceptance target: Inventory actual global fetch bindings and supported alias/member call forms without treating method declarations as outbound calls.

October 9 egress/install/provider extension under this same canonical owner: Keeping one valid direct MCP dial as a nonempty anchor, an additional imported connectMcpServer alias called without policy is omitted; complete CLI passes and reports only one dial. An entirely empty dial tree correctly fails. Existing egress callee-census owner is extended instead of duplicating the alias obligation. Actual MCP calls are inert source text.

Additional source: `scripts/check-mcp-dial-egress.mjs:22-24,46-49,92-102`. Acceptance target: Enumerate actual transport/dial bindings and all supported call forms across owning sources; direct anchors must not hide aliased unverified paths. Actual source review (`audit/checklist/reviews/coverage-ecosystem-egress-install-provider-guards-2026-10-09-026.json`, untracked); complete controls (`audit/checklist/evidence/coverage-egress-install-provider-independent-controls-2026-10-09-026-refined.json`, untracked). Current unchanged guard APIs/CLIs over isolated inert TypeScript/text fixtures only.40 unchanged tests and32 final independent controls passed;61 fixture syntax parses establish syntax only. Five current source CLIs exited0. Initial8-control execution stopped when the synthetic positive fallback used policy={...} but the lexical guard requires policy = {...}; original actual failure and refined execution are preserved. No application modules, SQL, policy resolver, plugin installation, provider/MCP/network/native/browser/database/build or production state executed. Source/config/tool files remain unchanged. No deployed security or product incident is accepted.

October 9 Root051 source qualification: The complete Mobile architecture guard omits a fetch alias in a UI body while refusing the otherwise identical bare fetch call. This extends the shared bare-binding census cause. Its UI orchestration rule is a separate architecture obligation and does not establish host-policy or destination-security parity, an actual fetch, or a current product incident. Source: `scripts/check-mobile-hygiene.mjs:143-151`. Frozen reading report (`audit/checklist/reviews/coverage-surface-security-source-guards-2026-10-09-051.json`, untracked); independent premise review (`audit/checklist/evidence/coverage-surface-security-independent-challenge-2026-10-09-051.json`, untracked); actual source controls (`audit/checklist/evidence/coverage-surface-security-inert-controls-2026-10-09-051.json`, untracked). Acceptance target extension: For the Mobile UI architecture branch, inventory applicable direct-I/O bindings and supported alias/member calls before applying the orchestration-only rule; preserve the original transport/MCP destination-policy obligations as separate branches. Current source instrument and inert text/value controls only. No application/fixture compilation or execution, provider/network/browser/native/SQL/database/build/install/production or whole CI acceptance; no current product or security incident asserted. Original severity, evidence, acceptance and producer provenance retained; zero new unique cause.

## AUDIT-WINDOW-SESSION-PARTITION-CREDIT-01

Severity: Medium. Status: open current source instrument defect independently reproduced October 9, 2026; source unchanged.

An explicit wrong literal partition fails, but no partition passes. A different literal containing the canonical shared-symbol substring also passes. This establishes checker acceptance, not an observed Electron session.

Source: `scripts/check-desktop-window-session.mjs:76-85`. Evidence: coverage-native-window-telemetry-controls-2026-10-09.json (`audit/checklist/evidence/coverage-native-window-telemetry-controls-2026-10-09.json`, untracked); current full source report (`audit/checklist/reviews/coverage-ecosystem-native-boundary-guards-2026-10-09-010.json`, untracked).

Limits: Source instrument evidence only; supplied product/import/window/route/generator/SQL fixtures are not executed. No current production egress, authorization, telemetry, window, device grant, native exclusivity, migration or security incident is proved.

Acceptance target: Require the applicable explicit canonical partition binding and reject missing or symbol-containing literal controls.

## AUDIT-WINDOW-SANDBOX-COMMENT-CREDIT-01

Severity: Medium. Status: open current source instrument defect independently reproduced October 9, 2026; source unchanged.

Removing contextIsolation fails. A construction with no effective safety values in webPreferences and all three required spellings only in a body comment passes.

Source: `scripts/check-desktop-window-session.mjs:87-95`. Evidence: coverage-native-window-telemetry-controls-2026-10-09.json (`audit/checklist/evidence/coverage-native-window-telemetry-controls-2026-10-09.json`, untracked); current full source report (`audit/checklist/reviews/coverage-ecosystem-native-boundary-guards-2026-10-09-010.json`, untracked).

Limits: Source instrument evidence only; supplied product/import/window/route/generator/SQL fixtures are not executed. No current production egress, authorization, telemetry, window, device grant, native exclusivity, migration or security incident is proved.

Acceptance target: Inspect effective webPreferences property values rather than arbitrary construction-body text; reject comments and unrelated fields.

## AUDIT-WINDOW-CONSTRUCTOR-OMISSION-01

Severity: Medium. Status: open current source instrument defect independently reproduced October 9, 2026; source unchanged.

A hardened baseline passes and a zero-construction tree fails. Adding an unsafe aliased constructor or new BrowserWindow with whitespace before the opening parenthesis leaves the checker green; those additional constructions are invisible.

Source: `scripts/check-desktop-window-session.mjs:46-68,108-117`. Evidence: coverage-native-window-telemetry-controls-2026-10-09.json (`audit/checklist/evidence/coverage-native-window-telemetry-controls-2026-10-09.json`, untracked); current full source report (`audit/checklist/reviews/coverage-ecosystem-native-boundary-guards-2026-10-09-010.json`, untracked).

Limits: Source instrument evidence only; supplied product/import/window/route/generator/SQL fixtures are not executed. No current production egress, authorization, telemetry, window, device grant, native exclusivity, migration or security incident is proved.

Acceptance target: Inventory Electron BrowserWindow constructor bindings and ordinary lexical whitespace forms, retaining zero-window refusal.

## AUDIT-TELEMETRY-COMMENT-EMISSION-CREDIT-01

Severity: Medium. Status: open current source instrument defect independently reproduced October 9, 2026; source unchanged.

An absent declared domain emission fails. Both configured emit spellings entirely inside a block comment pass, so the source instrument credits nonexecuting text as producer coverage.

Source: `scripts/check-desktop-telemetry-domains.mjs:52-79,93-114`. Evidence: coverage-native-window-telemetry-controls-2026-10-09.json (`audit/checklist/evidence/coverage-native-window-telemetry-controls-2026-10-09.json`, untracked); current full source report (`audit/checklist/reviews/coverage-ecosystem-native-boundary-guards-2026-10-09-010.json`, untracked).

Limits: Source instrument evidence only; supplied product/import/window/route/generator/SQL fixtures are not executed. No current production egress, authorization, telemetry, window, device grant, native exclusivity, migration or security incident is proved.

Acceptance target: Bind executable emitter calls and discard comments before deriving producer coverage.

## AUDIT-TELEMETRY-ADJACENT-TEST-CREDIT-01

Severity: Low. Status: open current source instrument defect independently reproduced October 9, 2026; source unchanged.

The same complete emissions under **tests** fail coverage, while an adjacent probe.test.ts with no product emissions passes. The walker excludes one test directory but not test filename forms.

Source: `scripts/check-desktop-telemetry-domains.mjs:21-35,93-114`. Evidence: coverage-native-window-telemetry-controls-2026-10-09.json (`audit/checklist/evidence/coverage-native-window-telemetry-controls-2026-10-09.json`, untracked); current full source report (`audit/checklist/reviews/coverage-ecosystem-native-boundary-guards-2026-10-09-010.json`, untracked).

Limits: Source instrument evidence only; supplied product/import/window/route/generator/SQL fixtures are not executed. No current production egress, authorization, telemetry, window, device grant, native exclusivity, migration or security incident is proved.

Acceptance target: Use canonical production-source classification for both directory and adjacent test forms.

## AUDIT-DEVICE-GRANT-ENTROPY-ASSUMPTION-01

Severity: Medium. Status: open current source instrument defect independently reproduced October 9, 2026; source unchanged.

A one-character alphabet fails. Repeating that same character to the original alphabet length passes with inflated bits, and a regex admitting only A also retains the original alphabet estimate. Both fixtures admit only one code at the examined positions.

Source: `scripts/check-device-auth-grant.mjs:101-109,140-153`. Evidence: coverage-device-grant-controls-2026-10-09.json (`audit/checklist/evidence/coverage-device-grant-controls-2026-10-09.json`, untracked); current full source report (`audit/checklist/reviews/coverage-ecosystem-native-boundary-guards-2026-10-09-010.json`, untracked).

Limits: Source instrument evidence only; supplied product/import/window/route/generator/SQL fixtures are not executed. No current production egress, authorization, telemetry, window, device grant, native exclusivity, migration or security incident is proved.

Acceptance target: Compute a justified distinct accepted-symbol/code-space bound and validate generator/validator consistency rather than raw string length and quantifier sums.

## AUDIT-DEVICE-GRANT-TEXT-POLICY-01

Severity: Medium. Status: open current source instrument defect independently reproduced October 9, 2026; source unchanged.

An inert route with no policy markers fails. Putting all rate/no-store and token pending/refusal/conditional-consume spellings only in block comments makes the whole checker pass. No token route or SQL executes.

Source: `scripts/check-device-auth-grant.mjs:124-131,192-225`. Evidence: coverage-device-grant-controls-2026-10-09.json (`audit/checklist/evidence/coverage-device-grant-controls-2026-10-09.json`, untracked); current full source report (`audit/checklist/reviews/coverage-ecosystem-native-boundary-guards-2026-10-09-010.json`, untracked).

Limits: Source instrument evidence only; supplied product/import/window/route/generator/SQL fixtures are not executed. No current production egress, authorization, telemetry, window, device grant, native exclusivity, migration or security incident is proved.

Acceptance target: Inspect effective route guards, refusal branches and consumed-update conditions with executable source binding; reject comment-only controls.

## AUDIT-DEVICE-GRANT-RANDOM-SOURCE-TEXT-01

Severity: Low. Status: open current source instrument defect independently reproduced October 9, 2026; source unchanged.

A source containing a constant code and no random marker fails. Adding only a crypto.randomBytes comment makes the same source pass the platform-random check. This is an instrument fixture, not the current generator.

Source: `scripts/check-device-auth-grant.mjs:164-176`. Evidence: coverage-device-grant-controls-2026-10-09.json (`audit/checklist/evidence/coverage-device-grant-controls-2026-10-09.json`, untracked); current full source report (`audit/checklist/reviews/coverage-ecosystem-native-boundary-guards-2026-10-09-010.json`, untracked).

Limits: Source instrument evidence only; supplied product/import/window/route/generator/SQL fixtures are not executed. No current production egress, authorization, telemetry, window, device grant, native exclusivity, migration or security incident is proved.

Acceptance target: Require an executable platform random-source call contributing to the generated code, with a comment-only rejecting control.

## AUDIT-DEVICE-GRANT-HISTORICAL-STATUS-01

Severity: Low. Status: open current source instrument defect independently reproduced October 9, 2026; source unchanged.

An invented ghost comparison fails against the base schema text. Introducing ghost historically and replacing its check without ghost in a later migration still passes. A block-comment ALTER vocabulary also gives ghost credit. The effective migration state is not reconstructed.

Source: `scripts/check-device-auth-grant.mjs:74-98,192-198`. Evidence: coverage-device-grant-controls-2026-10-09.json (`audit/checklist/evidence/coverage-device-grant-controls-2026-10-09.json`, untracked); current full source report (`audit/checklist/reviews/coverage-ecosystem-native-boundary-guards-2026-10-09-010.json`, untracked).

Limits: Source instrument evidence only; supplied product/import/window/route/generator/SQL fixtures are not executed. No current production egress, authorization, telemetry, window, device grant, native exclusivity, migration or security incident is proved.

Acceptance target: Evaluate ordered comment-free grant constraint state and remove replaced/dropped vocabulary before comparing route statuses.

## DESKTOP-SINGLE-INSTANCE-MISSING-01

Severity: Medium. Status: narrowed to native lifecycle validation gap October 9, 2026. The older missing dependency and registration premise is contradicted by current source.

The retained manifest declares tauri-plugin-single-instance with deep-link feature at Cargo.toml:63–67. Bootstrap registers it first at lib.rs:206–214 and invokes focus_running_instance. The local callback ignores args/cwd; the helper126–145 returns false if main is absent, performs macOS-only dock visibility restoration, then attempts unminimize/show/focus and logs errors, returning true even after focus errors. Dependency feature configuration does not independently prove plugin-internal URL delivery.

Evidence: native source report (`audit/checklist/reviews/coverage-retained-native-source-2026-10-09-011.json`, untracked) and independent current bootstrap/manifest spans (`audit/checklist/reviews/coverage-ecosystem-native-boundary-guards-2026-10-09-010.json`, untracked), with exact current hashes and actual reading ranges.

Limits: Plugin internals, second-process exclusion, focus/deep-link delivery, platform/release behavior and encrypted database exclusivity were not executed. Retained Tauri evidence gives no public Electron acceptance. This row no longer asserts missing single-instance registration.

Acceptance target: Verify the scoped current second-launch, missing-window/focus-error, deep-link and database ownership paths on applicable native releases; preserve source counterevidence and replace the remaining unknown states with actual receipts.

## AUDIT-DOC-FRESHNESS-DATE-VALIDATION-01

Severity: Low. Status: open current source instrument or consolidation validation gap reviewed October 9, 2026; source unchanged.

Fresh fixture Git commit/header agreement passes and an old header fails. An invalid2026-99-99 header and a2027-01-01 header after both fixture commit and audit date pass; NaN and negative drift do not enter the stale-date branches. No current document is asserted to use either fixture date.

Source: `scripts/check-doc-freshness.mjs:15-16,30-31,54-63`. Evidence: coverage-document-cli-controls-2026-10-09.json (`audit/checklist/evidence/coverage-document-cli-controls-2026-10-09.json`, untracked); full current source report (`audit/checklist/reviews/coverage-ecosystem-document-owner-guards-2026-10-09-011.json`, untracked).

Limits: Source/document audit instrument scope only. No current product extraction, Python/Rust build, deployed schema/ownership, provider behavior, native/app/network/database effect or product acceptance is established.

Acceptance target: Validate actual calendar dates and applicable future-date bounds before comparing header and content-commit provenance.

October 9 scanner/search/supply qualification: The complete original Trivy, ZAP and Semgrep gates each admit matching reviewed acceptance with impossible 2030-99-99 calendar expiry, because a date-shaped regex and lexical comparison supply date validity. Existing invalid-calendar source-proof owner applies; valid future expiry is intentional and remains permitted. No current accepted entry is alleged to use this value. Actual source report (`audit/checklist/reviews/coverage-security-index-supply-guard-source-2026-10-09-044.json`, untracked); 34 independent controls (`audit/checklist/evidence/coverage-security-index-supply-inert-controls-2026-10-09-044.json`, untracked); current guard outcomes (`audit/checklist/evidence/coverage-security-index-supply-current-source-gates-2026-10-09-044.json`, untracked); 31-target independent scope receipt (`audit/checklist/evidence/coverage-supply-chain-nested-target-scope-2026-10-09-044.json`, untracked). Zero new cause; no runtime effects.

## AUDIT-DOC-STATUS-FENCED-MARKER-CREDIT-01

Severity: Low. Status: open current source instrument or consolidation validation gap reviewed October 9, 2026; source unchanged.

Absent markers fail. A document with historical Status, invalid Last updated and Ownerish text entirely in a fenced block passes all three marker checks. The instrument validates substrings rather than maintained header metadata.

Source: `scripts/check-doc-status.mjs:22-38`. Evidence: coverage-document-cli-controls-2026-10-09.json (`audit/checklist/evidence/coverage-document-cli-controls-2026-10-09.json`, untracked); full current source report (`audit/checklist/reviews/coverage-ecosystem-document-owner-guards-2026-10-09-011.json`, untracked).

Limits: Source/document audit instrument scope only. No current product extraction, Python/Rust build, deployed schema/ownership, provider behavior, native/app/network/database effect or product acceptance is established.

Acceptance target: Parse required top-level header fields, current status, nonempty owner and calendar date; reject fenced and substring-only controls.

## AUDIT-DOC-REGISTRY-UNTRACKED-OMISSION-01

Severity: Low. Status: open current source instrument or consolidation validation gap reviewed October 9, 2026.

Rechecked on main (3ccb6f6) on 2026-10-15: still present. Main changed `scripts/check-doc-registry.mjs` after the 2026-09-27 copy this was found on without changing the cited logic; line numbers for it are main's.

A fresh Git fixture with approved root Markdown passes. Tracking an unknown root Markdown file fails classification, but leaving the same current file untracked passes because only cached paths are enumerated.

Source: `scripts/check-doc-registry.mjs:85-89,109-112,194-202`. Evidence: coverage-document-cli-controls-2026-10-09.json (`audit/checklist/evidence/coverage-document-cli-controls-2026-10-09.json`, untracked); full current source report (`audit/checklist/reviews/coverage-ecosystem-document-owner-guards-2026-10-09-011.json`, untracked).

Limits: Source/document audit instrument scope only. No current product extraction, Python/Rust build, deployed schema/ownership, provider behavior, native/app/network/database effect or product acceptance is established.

Acceptance target: Inventory current nonignored first-party Markdown as well as cached paths, with explicit absent tracked relocation handling.

## AUDIT-DOC-RETIRED-CITATION-WINDOW-01

Severity: Low. Status: open current source instrument or consolidation validation gap reviewed October 9, 2026.

Rechecked on main (3ccb6f6) on 2026-10-15: still present. Main changed `scripts/check-doc-registry.mjs` after the 2026-09-27 copy this was found on without changing the cited logic; line numbers for it are main's.

An active TODO.md current-queue citation fails. Adding a neighboring sentence that an unrelated experiment was retired passes, without changing the active citation. The general window marker is not bound to the cited file.

Source: `scripts/check-doc-registry.mjs:81-103`. Evidence: coverage-document-cli-controls-2026-10-09.json (`audit/checklist/evidence/coverage-document-cli-controls-2026-10-09.json`, untracked); full current source report (`audit/checklist/reviews/coverage-ecosystem-document-owner-guards-2026-10-09-011.json`, untracked).

Limits: Source/document audit instrument scope only. No current product extraction, Python/Rust build, deployed schema/ownership, provider behavior, native/app/network/database effect or product acceptance is established.

Acceptance target: Bind retirement qualification to the specific removed-file citation and retain an unrelated-neighbor rejecting control.

## AUDIT-DOC-TASKS-OWNER-EXEMPTION-01

Severity: Low. Status: open current source instrument or consolidation validation gap reviewed October 9, 2026.

Rechecked on main (3ccb6f6) on 2026-10-15: still present. Main changed `scripts/check-doc-registry.mjs` after the 2026-09-27 copy this was found on without changing the cited logic; line numbers for it are main's.

A tracked docs/work/tasks.md passes the current registry because tasks.md basename is exempt before the feature-spec location test. Its current path is outside docs/specs even though the guard message identifies feature-owned tasks as the permitted work owner.

Source: `scripts/check-doc-registry.mjs:146-164`. Evidence: coverage-document-cli-controls-2026-10-09.json (`audit/checklist/evidence/coverage-document-cli-controls-2026-10-09.json`, untracked); full current source report (`audit/checklist/reviews/coverage-ecosystem-document-owner-guards-2026-10-09-011.json`, untracked).

Limits: Source/document audit instrument scope only. No current product extraction, Python/Rust build, deployed schema/ownership, provider behavior, native/app/network/database effect or product acceptance is established.

Acceptance target: Restrict the task-file exemption to its actual authorized feature-spec owner or an explicit enforced alternative.

## AUDIT-DOCUMENT-CLASS-TEXT-CREDIT-01

Severity: Medium. Status: open current source instrument or consolidation validation gap reviewed October 9, 2026; source unchanged.

An absent office/PDF marker set or empty registry fails. Office MIME/extension tokens only in a comment pass, PDF extract/Buffer markers only in a comment pass, and an entirely commented class declaration still supplies all classes. No decoder ran.

Source: `scripts/check-document-classes.mjs:20-29,52-77,126-139`. Evidence: coverage-document-class-domain-controls-2026-10-09.json (`audit/checklist/evidence/coverage-document-class-domain-controls-2026-10-09.json`, untracked); full current source report (`audit/checklist/reviews/coverage-ecosystem-document-owner-guards-2026-10-09-011.json`, untracked).

Limits: Source/document audit instrument scope only. No current product extraction, Python/Rust build, deployed schema/ownership, provider behavior, native/app/network/database effect or product acceptance is established.

Acceptance target: Bind actual exported class declarations and executable decoder acceptance/behavior; reject comment-only registry and decoder controls.

## AUDIT-DOMAIN-VOCABULARY-COMMENT-CREDIT-01

Severity: Low. Status: open current source instrument or consolidation validation gap reviewed October 9, 2026; source unchanged.

A fresh complete two-domain fixture passes and missing typed vocabulary fails. Putting the entire PRODUCT_DOMAINS declaration only in a block comment passes with no corresponding executable/type export.

Source: `scripts/check-domain-ownership.mjs:103-126`. Evidence: coverage-document-class-domain-controls-2026-10-09.json (`audit/checklist/evidence/coverage-document-class-domain-controls-2026-10-09.json`, untracked); full current source report (`audit/checklist/reviews/coverage-ecosystem-document-owner-guards-2026-10-09-011.json`, untracked).

Limits: Source/document audit instrument scope only. No current product extraction, Python/Rust build, deployed schema/ownership, provider behavior, native/app/network/database effect or product acceptance is established.

Acceptance target: Read the actual exported vocabulary binding through the AST and reject comment-only declarations.

## AUDIT-DOMAIN-TABLE-SOURCE-OMISSION-01

Severity: Medium. Status: open current source instrument or consolidation validation gap reviewed October 9, 2026; source unchanged.

After repairing the independent baseline, actual readTableColumns enumerates both supplied multiline tables and unclaimed ownership fails. The same supplied table declarations on single lines yield zero parsed tables and pass when registry table claims are empty. This establishes omitted source-population credit, not a deployed unowned table.

Source: `scripts/check-domain-ownership.mjs:139-145; scripts/check-resource-metadata.mjs:86-104`. Evidence: coverage-document-class-domain-controls-2026-10-09.json (`audit/checklist/evidence/coverage-document-class-domain-controls-2026-10-09.json`, untracked); full current source report (`audit/checklist/reviews/coverage-ecosystem-document-owner-guards-2026-10-09-011.json`, untracked).

Limits: Source/document audit instrument scope only. No current product extraction, Python/Rust build, deployed schema/ownership, provider behavior, native/app/network/database effect or product acceptance is established.

Acceptance target: Inventory table declarations independently of line formatting and require an independently established nonempty/applicable population before ownership completeness credit.

October 9 time-instrument qualification: A positive multiline tasks recurrence/table census remains while an added one-line risky timestamp table is absent from timestamp and table-column projections and the checker returns no errors. The recognized multiline naive timestamp refuses. Inert SQL text is never applied, and no actual current DB schema or unsafe production column is asserted. This is supplementary evidence under the existing single-line source-population omission owner; zero new ID or cause. Source: `scripts/check-time-semantics.mjs:46-83; scripts/check-resource-metadata.mjs:86-104`. Original-engine controls (`audit/checklist/evidence/coverage-workspace-settings-time-inert-controls-2026-10-09-047.json`, untracked); actual source reading (`audit/checklist/reviews/coverage-workspace-settings-time-guard-source-2026-10-09-047.json`, untracked); independent challenge (`audit/checklist/evidence/coverage-workspace-settings-time-independent-challenge-2026-10-09-047.json`, untracked). Zero new cause; existing acceptance target retained.

## AUDIT-EXEC-DOC-TOML-KEY-OMISSION-01

Severity: Low. Status: open current source instrument or consolidation validation gap reviewed October 9, 2026.

Rechecked on main (3ccb6f6) on 2026-10-15: still present. Main changed `scripts/check-executable-docs.mjs` after the 2026-09-27 copy this was found on without changing the cited logic; line numbers for it are main's.

A missing literal project readme file fails. Quoting the same TOML key passes with the file still missing; actual standard tomllib independently reads the same project.readme value from both fixtures. No Python package builds.

Source: `scripts/check-executable-docs.mjs:77-105`. Evidence: coverage-document-cli-controls-2026-10-09.json (`audit/checklist/evidence/coverage-document-cli-controls-2026-10-09.json`, untracked); full current source report (`audit/checklist/reviews/coverage-ecosystem-document-owner-guards-2026-10-09-011.json`, untracked).

Limits: Source/document audit instrument scope only. No current product extraction, Python/Rust build, deployed schema/ownership, provider behavior, native/app/network/database effect or product acceptance is established.

Acceptance target: Parse the project table with the supported TOML parser and resolve the canonical readme file pointer rather than line spellings.

## AUDIT-EXEC-DOC-RUST-SPELLING-OMISSION-01

Severity: Low. Status: open current source instrument or consolidation validation gap reviewed October 9, 2026.

Rechecked on main (3ccb6f6) on 2026-10-15: still present. Main changed `scripts/check-executable-docs.mjs` after the 2026-09-27 copy this was found on without changing the cited logic; line numbers for it are main's.

Ordinary literal include_str with a missing Markdown file fails. Raw-string and whitespace-before-parenthesis spellings with the same missing path pass because the literal scanner does not enumerate them. Compiler/build consequences remain unexecuted.

Source: `scripts/check-executable-docs.mjs:108-115`. Evidence: coverage-document-cli-controls-2026-10-09.json (`audit/checklist/evidence/coverage-document-cli-controls-2026-10-09.json`, untracked); full current source report (`audit/checklist/reviews/coverage-ecosystem-document-owner-guards-2026-10-09-011.json`, untracked).

Limits: Source/document audit instrument scope only. No current product extraction, Python/Rust build, deployed schema/ownership, provider behavior, native/app/network/database effect or product acceptance is established.

Acceptance target: Inventory supported literal macro inputs across source spellings and preserve the missing-input negative control; independently qualify compiler scope.

## AUDIT-E2E-LOCATOR-LEXICAL-SCOPE-01

Severity: Low. Status: open current source instrument gap reviewed October 9, 2026; source unchanged.

Literal parent locator fails and role baseline passes. The same locator only in a comment fails, while the actual call split across three source lines passes. Findings arise from line-based raw patterns rather than executable locator inventory.

Source: `scripts/check-e2e-structure-locators.mjs:22-28`. Evidence: coverage-edge-frame-enterprise-controls-2026-10-09.json (`audit/checklist/evidence/coverage-edge-frame-enterprise-controls-2026-10-09.json`, untracked); full current source report (`audit/checklist/reviews/coverage-ecosystem-edge-frame-enterprise-guards-2026-10-09-012.json`, untracked).

Limits: Current source audit-instrument scope only. Fresh source fixtures are inert; TypeScript/TSX, SQL, NextResponse, browser frames, account/permissions, billing/provider/native/deployed behavior and product acceptance were not executed or established.

Acceptance target: Inventory actual locator call arguments across source lines and distinguish comments from executable calls.

## AUDIT-EDGE-HEADER-TEXT-CREDIT-01

Severity: Medium. Status: open current source instrument gap reviewed October 9, 2026; source unchanged.

A known response builder baseline passes and removing its header set fails. Moving the only header set into a block comment or changing its receiver from response to request passes, without a measured response-header statement.

Source: `scripts/check-edge-middleware.mjs:89-91`. Evidence: coverage-edge-frame-enterprise-controls-2026-10-09.json (`audit/checklist/evidence/coverage-edge-frame-enterprise-controls-2026-10-09.json`, untracked); full current source report (`audit/checklist/reviews/coverage-ecosystem-edge-frame-enterprise-guards-2026-10-09-012.json`, untracked).

Limits: Current source audit-instrument scope only. Fresh source fixtures are inert; TypeScript/TSX, SQL, NextResponse, browser frames, account/permissions, billing/provider/native/deployed behavior and product acceptance were not executed or established.

Acceptance target: Bind required header writes to the response value returned on the applicable path and reject comment/request-only controls.

October 9 session/header/upload/support qualification: The original full header CLI accepts a file whose only header/policy evidence occurs in a comment while the nonempty policy census reports one script-src directive. Missing source/policy census refuses. This shares the existing raw-text header evidence cause; it does not establish an actual missing current response header. Actual source report (`audit/checklist/reviews/coverage-session-response-header-guard-source-2026-10-09-043.json`, untracked); 28 independent source controls (`audit/checklist/evidence/coverage-session-response-header-inert-controls-2026-10-09-043.json`, untracked); current guard outcomes (`audit/checklist/evidence/coverage-session-response-header-current-source-gates-2026-10-09-043.json`, untracked). Zero new cause, no runtime effects.

## AUDIT-EDGE-BUILDER-OMISSION-01

Severity: Medium. Status: open current source instrument gap reviewed October 9, 2026; source unchanged.

Adding an arrow function returning NextResponse.next beside a valid ordinary builder keeps the guard green with report.builders equal to one. The extra headerless builder is not enumerated. Its mounting or actual request outcome is not asserted.

Source: `scripts/check-edge-middleware.mjs:30-47`. Evidence: coverage-edge-frame-enterprise-controls-2026-10-09.json (`audit/checklist/evidence/coverage-edge-frame-enterprise-controls-2026-10-09.json`, untracked); full current source report (`audit/checklist/reviews/coverage-ecosystem-edge-frame-enterprise-guards-2026-10-09-012.json`, untracked).

Limits: Current source audit-instrument scope only. Fresh source fixtures are inert; TypeScript/TSX, SQL, NextResponse, browser frames, account/permissions, billing/provider/native/deployed behavior and product acceptance were not executed or established.

Acceptance target: Enumerate applicable response construction independently of ordinary function spelling and require each offered builder to be measured.

## AUDIT-EDGE-REDIRECT-QUOTE-OMISSION-01

Severity: Medium. Status: open current source instrument gap reviewed October 9, 2026; source unchanged.

A builder reading the configured returnTo parameter with single quotes fails. Replacing only those quotes with double quotes passes with the same caller-supplied target source. No redirect URL is requested or resolved.

Source: `scripts/check-edge-middleware.mjs:120-140`. Evidence: coverage-edge-frame-enterprise-controls-2026-10-09.json (`audit/checklist/evidence/coverage-edge-frame-enterprise-controls-2026-10-09.json`, untracked); full current source report (`audit/checklist/reviews/coverage-ecosystem-edge-frame-enterprise-guards-2026-10-09-012.json`, untracked).

Limits: Current source audit-instrument scope only. Fresh source fixtures are inert; TypeScript/TSX, SQL, NextResponse, browser frames, account/permissions, billing/provider/native/deployed behavior and product acceptance were not executed or established.

Acceptance target: Resolve actual configured query-parameter reads independently of quote spelling and qualify returned redirect targets.

## AUDIT-EDGE-MATCHER-SAMPLE-COVERAGE-01

Severity: Low. Status: open current source instrument gap reviewed October 9, 2026; source unchanged.

A matcher excluding /product/secret passes because the guard checks only /product, /product/anything and /product/deep/path. This proves a finite sample, not every descendant of a declared prefix or live Next matcher behavior.

Source: `scripts/check-edge-middleware.mjs:157-166`. Evidence: coverage-edge-frame-enterprise-controls-2026-10-09.json (`audit/checklist/evidence/coverage-edge-frame-enterprise-controls-2026-10-09.json`, untracked); full current source report (`audit/checklist/reviews/coverage-ecosystem-edge-frame-enterprise-guards-2026-10-09-012.json`, untracked).

Limits: Current source audit-instrument scope only. Fresh source fixtures are inert; TypeScript/TSX, SQL, NextResponse, browser frames, account/permissions, billing/provider/native/deployed behavior and product acceptance were not executed or established.

Acceptance target: Label sampling scope explicitly or independently prove coverage for the declared route population; retain a same-prefix excluded-path negative control.

## AUDIT-FRAME-DYNAMIC-SANDBOX-CREDIT-01

Severity: Medium. Status: open current source instrument gap reviewed October 9, 2026; source unchanged.

A new iframe lacking a sandbox fails. A dynamic sandbox value declared as the dangerous token pair passes because declaration is true and parsed tokens are null. The fixture is source only and does not establish actual browser privileges.

Source: `scripts/lib/embedded-frames.mjs:39-42,76-80; scripts/check-embedded-frame-sandbox.mjs:72-83`. Evidence: coverage-edge-frame-enterprise-controls-2026-10-09.json (`audit/checklist/evidence/coverage-edge-frame-enterprise-controls-2026-10-09.json`, untracked); full current source report (`audit/checklist/reviews/coverage-ecosystem-edge-frame-enterprise-guards-2026-10-09-012.json`, untracked).

Limits: Current source audit-instrument scope only. Fresh source fixtures are inert; TypeScript/TSX, SQL, NextResponse, browser frames, account/permissions, billing/provider/native/deployed behavior and product acceptance were not executed or established.

Acceptance target: Resolve or fail closed on applicable dynamic sandbox values before static token safety credit; distinguish declaration from token safety.

## AUDIT-FRAME-REF-ASSIGNMENT-IDENTITY-01

Severity: Medium. Status: open current source instrument gap reviewed October 9, 2026; source unchanged.

An unrelated other.setAttribute sandbox statement before an iframe with ref wanted grants that iframe declared true. The search does not bind setAttribute to the named ref or actual frame.

Source: `scripts/lib/embedded-frames.mjs:54-60,78-80`. Evidence: coverage-edge-frame-enterprise-controls-2026-10-09.json (`audit/checklist/evidence/coverage-edge-frame-enterprise-controls-2026-10-09.json`, untracked); full current source report (`audit/checklist/reviews/coverage-ecosystem-edge-frame-enterprise-guards-2026-10-09-012.json`, untracked).

Limits: Current source audit-instrument scope only. Fresh source fixtures are inert; TypeScript/TSX, SQL, NextResponse, browser frames, account/permissions, billing/provider/native/deployed behavior and product acceptance were not executed or established.

Acceptance target: Bind assignment, frame/ref identity and relevant load ordering before granting declaration credit.

## AUDIT-FRAME-CROSS-ORIGIN-TEXT-CREDIT-01

Severity: Medium. Status: open current source instrument gap reviewed October 9, 2026; source unchanged.

At the dedicated renderer path, an iframe with /same-origin src and both static tokens passes when title contains sandboxOrigin. The origin exception is triggered by raw attribute text rather than validated source origin.

Source: `scripts/lib/embedded-frames.mjs:81; scripts/check-embedded-frame-sandbox.mjs:69,82-83`. Evidence: coverage-edge-frame-enterprise-controls-2026-10-09.json (`audit/checklist/evidence/coverage-edge-frame-enterprise-controls-2026-10-09.json`, untracked); full current source report (`audit/checklist/reviews/coverage-ecosystem-edge-frame-enterprise-guards-2026-10-09-012.json`, untracked).

Limits: Current source audit-instrument scope only. Fresh source fixtures are inert; TypeScript/TSX, SQL, NextResponse, browser frames, account/permissions, billing/provider/native/deployed behavior and product acceptance were not executed or established.

Acceptance target: Bind the dedicated-origin exception to actual configured origin resolution and reject unrelated marker attributes.

## AUDIT-FRAME-CREATED-SANDBOX-MEASUREMENT-01

Severity: Medium. Status: open current source instrument gap reviewed October 9, 2026; source unchanged.

Imperative fixtures with src assigned before sandbox are credited declared. A created frame assigning both escape tokens also yields no tokens field, so the shared escape check returns false. These are helper source observations, not browser execution.

Source: `scripts/lib/embedded-frames.mjs:91-100; scripts/check-embedded-frame-sandbox.mjs:72-83`. Evidence: coverage-edge-frame-enterprise-controls-2026-10-09.json (`audit/checklist/evidence/coverage-edge-frame-enterprise-controls-2026-10-09.json`, untracked); full current source report (`audit/checklist/reviews/coverage-ecosystem-edge-frame-enterprise-guards-2026-10-09-012.json`, untracked).

Limits: Current source audit-instrument scope only. Fresh source fixtures are inert; TypeScript/TSX, SQL, NextResponse, browser frames, account/permissions, billing/provider/native/deployed behavior and product acceptance were not executed or established.

Acceptance target: Carry applicable imperative frame identity, sandbox tokens and source/load ordering into the same safety measurement as JSX frames.

October9 raw-HTML consumer qualification: `scripts/lib/raw-html-sinks.mjs:440-510` credits a created frame record to an unrelated srcdoc receiver and credits imperative token/order cases through the same shared `findCreatedFrames` declaration lacking token fields. The complete guard refuses imperative srcdoc with no sandbox and rejects dangerous/unresolved dynamic JSX literals; its crossOrigin marker exception is unused. These narrower counterguards prevent transferring the separate dynamic/cross-origin findings wholesale. Three imperative cases share this existing created-frame owner; no duplicate receiver/token/order issue is created. Evidence: independent HTML challenge (`audit/checklist/evidence/coverage-html-independent-challenge-2026-10-09-035.json`, untracked), root adoption qualification (`audit/checklist/evidence/coverage-html-independent-challenge-2026-10-09-035-root-adoption-validation.json`, untracked). No actual frame/browser/native/permission execution or deployed incident was accepted.

## AUDIT-ENTERPRISE-ROUTE-TEXT-CREDIT-01

Severity: Medium. Status: open current source instrument gap reviewed October 9, 2026.

Rechecked on main (3ccb6f6) on 2026-10-15: still present. Main changed `scripts/check-org-permissions.mjs` after the 2026-09-27 copy this was found on without changing the cited logic; line numbers for it are main's.

The actual unchanged test fixture passes and removing CSRF fails. A POST const with permission/CSRF/audited-call markers only in a comment passes; export async function POST with only a permission comment also passes without CSRF/audit measurement. No live handler is invoked.

Source: `scripts/check-enterprise-contracts.mjs:155-157,160-168,251-270`. Evidence: coverage-edge-frame-enterprise-controls-2026-10-09.json (`audit/checklist/evidence/coverage-edge-frame-enterprise-controls-2026-10-09.json`, untracked); full current source report (`audit/checklist/reviews/coverage-ecosystem-edge-frame-enterprise-guards-2026-10-09-012.json`, untracked).

Limits: Current source audit-instrument scope only. Fresh source fixtures are inert; TypeScript/TSX, SQL, NextResponse, browser frames, account/permissions, billing/provider/native/deployed behavior and product acceptance were not executed or established.

Acceptance target: Enumerate actual mutating route exports and bind permission, CSRF and durable audit effects to the relevant executable path.

October 9 organization/pagination/tier source qualification: A resolver-only handler rejects as never deciding. Adding unused string held.has(members.manage) with the actual quoted permission shape makes the full CLI pass despite an unused resolved set. Replacing a genuine roles.manage check with only void string data likewise retains global consulted-permission credit. This extends the existing permission marker/effect owner; per-handler aggregation and syntax omissions retain separate identities.

Additional source: `scripts/check-org-permissions.mjs:66-67,415-443,513-515`. Acceptance target: Bind permission decision and consulted-ID credit to actual enforcing/tested expressions for the relevant handler; inert strings and unrelated permission data cannot establish a server decision. Current source report (`audit/checklist/reviews/coverage-ecosystem-org-pagination-tier-guards-2026-10-09-029.json`, untracked); complete independent controls (`audit/checklist/evidence/coverage-org-pagination-tier-independent-controls-2026-10-09-029.json`, untracked). Unchanged complete source guard APIs/CLIs and isolated inert TypeScript/TSX/SQL/Git fixtures only.37 unchanged Node tests and31 independent controls passed;220 fixture syntax parses establish syntax only. Four current source CLIs exited0. Literal fixtures extracted via actual TypeScript AST values, copied role CLI byte identity and nonempty complete CLI output are independently asserted; organization fixtures run fresh subprocesses to avoid graph-cache cross-case state. One literal synthetic function with an injected counter executes in a VM and proves zero terminal calls. No application/fixture module imports, actual authorization/mutation, SQL/database, native host, provider, network, browser, React mount, build, install, production action or real checkout staging. Git init/census and unchanged tests bind throwaway roots with inherited GIT variables scrubbed. Source/tool/config files remain unchanged; no deployed incident or runtime acceptance is established.

## AUDIT-ENTERPRISE-MODEL-TEXT-TEST-CREDIT-01

Severity: Low. Status: open current source instrument gap reviewed October 9, 2026; source unchanged.

Declared model resolution return clauses only in comments and model names only in a commented test file satisfy the guard. The existing baseline already uses an empty test body carrying model names; no commercial resolver behavior is measured.

Source: `scripts/check-enterprise-contracts.mjs:200-215; scripts/check-enterprise-contracts.test.mjs:72-74`. Evidence: coverage-edge-frame-enterprise-controls-2026-10-09.json (`audit/checklist/evidence/coverage-edge-frame-enterprise-controls-2026-10-09.json`, untracked); full current source report (`audit/checklist/reviews/coverage-ecosystem-edge-frame-enterprise-guards-2026-10-09-012.json`, untracked).

Limits: Current source audit-instrument scope only. Fresh source fixtures are inert; TypeScript/TSX, SQL, NextResponse, browser frames, account/permissions, billing/provider/native/deployed behavior and product acceptance were not executed or established.

Acceptance target: Bind actual resolver outcomes and behaviorally meaningful current tests before model implementation/test coverage credit.

## AUDIT-ENTERPRISE-SCHEMA-RELATION-HISTORY-01

Severity: Medium. Status: open current source instrument gap reviewed October 9, 2026.

Rechecked on main (3ccb6f6) on 2026-10-15: still present. Main changed `scripts/check-money-paths.mjs` and `scripts/check-org-permissions.mjs` after the 2026-09-27 copy this was found on without changing the cited logic; line numbers for them are main's.

A store column absent from agreement migrations fails. Adding it to an unrelated table in a migration containing the agreement name passes; a later agreement column drop is ignored. An unrelated status constraint similarly replaces the projected agreement status list. SQL fixtures are never applied.

Source: `scripts/check-enterprise-contracts.mjs:125-152,218-247`. Evidence: coverage-edge-frame-enterprise-controls-2026-10-09.json (`audit/checklist/evidence/coverage-edge-frame-enterprise-controls-2026-10-09.json`, untracked); full current source report (`audit/checklist/reviews/coverage-ecosystem-edge-frame-enterprise-guards-2026-10-09-012.json`, untracked).

Limits: Current source audit-instrument scope only. Fresh source fixtures are inert; TypeScript/TSX, SQL, NextResponse, browser frames, account/permissions, billing/provider/native/deployed behavior and product acceptance were not executed or established.

Acceptance target: Bind each DDL clause to its actual relation and replay applicable add/drop/constraint history or inspect authoritative schema without attributing unrelated clauses.

October 9 managed/unattended extension under this same canonical owner: An owned work table and an independent owned anchor table cause an ungated work pickup to fail. Dropping work correctly removes it. Recreating the same owned work table in a later migration still leaves it omitted and the complete guard passes with only the anchor; dropped is a permanent set and is not cleared by later CREATE. Existing DDL relation/history owner is extended rather than duplicating the migration-replay obligation.

Additional source: `scripts/check-membership-unattended-work.mjs:73-110,178-186`. Acceptance target: Replay per-relation DDL in order, preserving each final owner/workspace column state and clearing prior drops on valid later recreation; mixed-schema anchors must not hide lost subjects. Actual full source review (`audit/checklist/reviews/coverage-ecosystem-managed-unattended-guards-2026-10-09-025.json`, untracked); complete independent controls (`audit/checklist/evidence/coverage-managed-unattended-independent-controls-2026-10-09-025-refined.json`, untracked). Unchanged guard APIs and source CLIs over isolated inert TypeScript/migration text only.35 unchanged tests and36 final independent controls passed;69 fixture syntax parses establish syntax only. Three current textual CLIs exited0. Initial26-control execution stopped on a disproved quoted-table omission assumption and its actual failure is preserved separately. No SQL, application module/entrypoint/service, provider/native/network/browser/build/database or production state executed; source/config/tool files remain unchanged. No current product policy bypass, account loss or deployed incident is accepted.

October 9 money/usage/Work source qualification: Ordered fixture DDL creates wallet with amount_cents, drops it and recreates wallet with only id text. Money census still lists wallet and rejects a parseFloat id writer. The identical final nonmoney schema alone produces no money tables or hazard. This extends existing per-relation DDL-history ownership in the opposite stale-subject direction; no production migration or database is applied.

Additional source: `scripts/check-money-paths.mjs:19-39`. Acceptance target: Replay applicable per-relation DDL in order and derive the final money-column state, preserving prior enterprise/membership history obligations. Current source report (`audit/checklist/reviews/coverage-ecosystem-money-usage-worktask-guards-2026-10-09-028.json`, untracked); complete independent controls (`audit/checklist/evidence/coverage-money-usage-worktask-independent-controls-2026-10-09-028-refined.json`, untracked). Unchanged complete source-instrument APIs and byte-identical CLI copies over isolated inert TypeScript/SQL text only.44 unchanged tests and35 final independent controls passed;62 TypeScript fixture parses establish syntax only. Four actual current source CLIs exited0. Two isolated literal arithmetic expressions execute in a VM; no application or fixture module imports, monetary writes, SQL, database, native host, provider, network, browser, build, installation, production action or real checkout staging occurs. Git used by unchanged tests is confined to scrubbed fixture roots. Initial11-control receipt preserves a failed CLI assertion: /tmp versus /private/tmp prevented the copied guard main from running. Final runner normalizes executable/cwd realpaths and asserts nonempty guard output. Source/tool/config files are unchanged; no current product incident or runtime acceptance is established.

October 9 organization/pagination/tier source qualification: The complete CLI rejects a missing declared write policy. A valid CREATE POLICY followed in a later migration by DROP POLICY still passes because scanning returns on historical create-helper text. Current official PostgreSQL DROP POLICY documentation confirms removal and default deny when the last policy is removed under enabled RLS; this is stale guard evidence, not a claim that dropping a policy creates a live access bypass. No SQL is applied.

Additional source: `scripts/check-org-permissions.mjs:450-467`. Acceptance target: Replay applicable per-relation/per-policy DDL in order or inspect authoritative current policy state; historical creation cannot establish a final active write policy. Current source report (`audit/checklist/reviews/coverage-ecosystem-org-pagination-tier-guards-2026-10-09-029.json`, untracked); complete independent controls (`audit/checklist/evidence/coverage-org-pagination-tier-independent-controls-2026-10-09-029.json`, untracked). Unchanged complete source guard APIs/CLIs and isolated inert TypeScript/TSX/SQL/Git fixtures only.37 unchanged Node tests and31 independent controls passed;220 fixture syntax parses establish syntax only. Four current source CLIs exited0. Literal fixtures extracted via actual TypeScript AST values, copied role CLI byte identity and nonempty complete CLI output are independently asserted; organization fixtures run fresh subprocesses to avoid graph-cache cross-case state. One literal synthetic function with an injected counter executes in a VM and proves zero terminal calls. No application/fixture module imports, actual authorization/mutation, SQL/database, native host, provider, network, browser, React mount, build, install, production action or real checkout staging. Git init/census and unchanged tests bind throwaway roots with inherited GIT variables scrubbed. Source/tool/config files remain unchanged; no deployed incident or runtime acceptance is established.

October9 reference/retention source qualification: Complete API rejects a new personal-reference table, accepts its final DROP, but still omits it after CREATE/DROP/CREATE because dropped is permanent. A valid cascading child is reached; replacing that FK constraint with ON DELETE SET NULL still retains historical cascade credit. Existing relation/history owner is extended with both final table state and constraint action state. Current primary PostgreSQL documentation distinguishes cascade deletion from set-null and named constraint replacement; no SQL or actual erasure applies.

Additional source: `scripts/check-retention-graph.mjs:63-76,120-123,166-184; scripts/check-resource-metadata.mjs:123-156`. Acceptance target: Replay final per-relation/per-constraint DDL and clear valid recreation/drop/replacement state before subject and cascade reachability credit, preserving existing schema/history obligations. Current source report (`audit/checklist/reviews/coverage-ecosystem-reference-retention-guards-2026-10-09-030.json`, untracked); complete independent controls (`audit/checklist/evidence/coverage-reference-retention-independent-controls-2026-10-09-030.json`, untracked). Current unchanged complete source guards/helpers and isolated inert TypeScript/SQL/JSON/Git fixture text only.42unchanged Node tests and25independent controls passed;8TypeScript parses plus scanner/actual array counts establish source-fixture roles. CLI copies are byte-identical, realpaths normalized and nonempty execution output asserted. Git fixture operations address explicit throwaway roots, scrub inherited GIT variables and use only local quoting config. Actual current source CLI statuses are0,0,0,1,0; repository organization rejects root .pnpm-store and specification validation explicitly skips a retired absent set. No application/fixture module imports, SQL/database/erasure/cleanup, native/provider/network/browser/build/install/production effects or real checkout staging. Actual source copies/parses/hashes/searches grant no semantic EOF credit. Source/tool/config files remain unchanged; full runtime product acceptance remains unknown.

October 9 time-instrument qualification: The original timestamp projection retains an earlier server default after a later ALTER COLUMN DROP DEFAULT and retains an earlier zoned type after a later ALTER COLUMN TYPE timestamp. Both inert migration histories return no errors. This extends the existing relation-bound DDL replay owner, with zero duplicate cause or live DB/scheduler acceptance. Source: `scripts/check-time-semantics.mjs:46-83,202-239`. Original-engine controls (`audit/checklist/evidence/coverage-workspace-settings-time-inert-controls-2026-10-09-047.json`, untracked); actual source reading (`audit/checklist/reviews/coverage-workspace-settings-time-guard-source-2026-10-09-047.json`, untracked); independent challenge (`audit/checklist/evidence/coverage-workspace-settings-time-independent-challenge-2026-10-09-047.json`, untracked). Zero new cause; existing acceptance target retained.

## AUDIT-EM-DASH-UNTRACKED-OMISSION-01

Severity: Low. Status: open current source instrument gap reviewed October 9, 2026; source unchanged.

In a fresh Git fixture using exact hash-verified unchanged guard/helper bytes, tracked plain-text baseline passes and an untracked file with the forbidden character also passes. Explicitly passing the file or staging that same source makes the guard fail.

Source: `scripts/check-em-dash-in-copy.mjs:46-49,61-65`. Evidence: coverage-em-dash-scope-controls-2026-10-09.json (`audit/checklist/evidence/coverage-em-dash-scope-controls-2026-10-09.json`, untracked); full current source report (`audit/checklist/reviews/coverage-ecosystem-edge-frame-enterprise-guards-2026-10-09-012.json`, untracked).

Limits: Current source audit-instrument scope only. Fresh source fixtures are inert; TypeScript/TSX, SQL, NextResponse, browser frames, account/permissions, billing/provider/native/deployed behavior and product acceptance were not executed or established.

Acceptance target: Include current nonignored worktree files in default discovery or explicitly scope the gate to tracked content; preserve the same-file admission negative control.

## AUDIT-EVAL-SLOT-GATE-TEXT-CREDIT-01

Severity: Medium. Status: open current source instrument gap reviewed October 9, 2026; source unchanged.

An ordinary function writing without a gate is flagged. A gate only in a comment before the write passes, a real gate result assigned and ignored also passes, and an arrow writer is omitted. The guard measures lexical order, not awaited gate success or refusal handling. No fixture slot function executes.

Source: `scripts/lib/eval-safety-floor.mjs:122-157,265-277`. Evidence: coverage-evaluation-policy-controls-2026-10-09.json (`audit/checklist/evidence/coverage-evaluation-policy-controls-2026-10-09.json`, untracked); full current source report (`audit/checklist/reviews/coverage-ecosystem-evaluation-policy-guards-2026-10-09-013.json`, untracked).

Limits: Evaluation source-instrument and explicit synthetic malformed-input scope only. No live measurement/evaluation, actual provider/model inference, released Auto route, promotion/slot write, native/browser/database or product acceptance was executed or established. Reading source/config text in a test is not semantic body coverage of those data files.

Acceptance target: Bind applicable slot writers and awaited gate outcomes to the executable write path, rejecting comment-only, omitted-builder and ignored-refusal controls.

October 9 managed/unattended extension under this same canonical owner: Managed admission accepts a gate only in a comment or unused string, a gate in an unrelated function, and an ignored verdict before job creation. A missing or late direct prompt gate correctly fails. Managed delivery accepts comment-only screening and screening after asset storage; the same unscreened direct writer fails when no marker is supplied. Existing evaluation gate-text owner is extended instead of adding a duplicate gate/refusal identity.

Additional source: `scripts/lib/managed-safety-floor.mjs:73-76,142-178,214-245`. Acceptance target: Bind each actual job/asset write to its executed prompt/byte policy and awaited refusal outcome; textual presence/order in unrelated scopes must not grant coverage. Actual full source review (`audit/checklist/reviews/coverage-ecosystem-managed-unattended-guards-2026-10-09-025.json`, untracked); complete independent controls (`audit/checklist/evidence/coverage-managed-unattended-independent-controls-2026-10-09-025-refined.json`, untracked). Unchanged guard APIs and source CLIs over isolated inert TypeScript/migration text only.35 unchanged tests and36 final independent controls passed;69 fixture syntax parses establish syntax only. Three current textual CLIs exited0. Initial26-control execution stopped on a disproved quoted-table omission assumption and its actual failure is preserved separately. No SQL, application module/entrypoint/service, provider/native/network/browser/build/database or production state executed; source/config/tool files remain unchanged. No current product policy bypass, account loss or deployed incident is accepted.

October 9 egress/install/provider extension under this same canonical owner: Plugin ordinary ungated writer is rejected, but comment-only assertPluginPackageInstallable text inside its body discharges the gate. Moving the actual assertion after the admitting write also passes. refuses checks a bare gate/refusal name or textual delegation without binding reachable awaited refusal before the write. Existing evaluation/managed safety gate-text owner is extended; no package scan/signature verification or plugin installation is executed.

Additional source: `scripts/check-plugin-install-gate.mjs:110-124,132-136,149-152`. Acceptance target: Bind every admitted version write to executed successful package policy before mutation; comments, unreachable/ignored refusal and post-write gate text must not establish admission. Actual source review (`audit/checklist/reviews/coverage-ecosystem-egress-install-provider-guards-2026-10-09-026.json`, untracked); complete controls (`audit/checklist/evidence/coverage-egress-install-provider-independent-controls-2026-10-09-026-refined.json`, untracked). Current unchanged guard APIs/CLIs over isolated inert TypeScript/text fixtures only.40 unchanged tests and32 final independent controls passed;61 fixture syntax parses establish syntax only. Five current source CLIs exited0. Initial8-control execution stopped when the synthetic positive fallback used policy={...} but the lexical guard requires policy = {...}; original actual failure and refined execution are preserved. No application modules, SQL, policy resolver, plugin installation, provider/MCP/network/native/browser/database/build or production state executed. Source/config/tool files remain unchanged. No deployed security or product incident is accepted.

## AUDIT-EVAL-SERVED-RUN-COVERAGE-01

Severity: Medium. Status: open current source instrument gap reviewed October 9, 2026; source unchanged.

The independent fixture first establishes one declared P0 refusal corpus and one resolved served model. A matching below-threshold P0 run is rejected. Relabelling that same failed suite P1 or omitting its declared corpus makes the full audit pass; a P0 score-zero run lacking its threshold also passes because threshold defaults zero.

Source: `scripts/lib/eval-safety-floor.mjs:101-119,284-292`. Evidence: coverage-evaluation-policy-controls-2026-10-09.json (`audit/checklist/evidence/coverage-evaluation-policy-controls-2026-10-09.json`, untracked); full current source report (`audit/checklist/reviews/coverage-ecosystem-evaluation-policy-guards-2026-10-09-013.json`, untracked).

Limits: Evaluation source-instrument and explicit synthetic malformed-input scope only. No live measurement/evaluation, actual provider/model inference, released Auto route, promotion/slot write, native/browser/database or product acceptance was executed or established. Reading source/config text in a test is not semantic body coverage of those data files.

Acceptance target: Bind current required corpus population, priority and thresholds independently to each applicable recorded run; treat missing or downgraded coverage as unverified/failure.

## AUDIT-EVAL-RESOLVED-SERVING-POPULATION-01

Severity: Medium. Status: open current source instrument gap reviewed October 9, 2026; source unchanged.

A declared family slot lacking a corresponding family active key resolves to an empty served Set. The full fresh source audit remains green and checks no recorded served model. Missing-policy null is rejected, but unresolved/empty resolution is not independently qualified. No current family is claimed unresolved.

Source: `scripts/lib/eval-safety-floor.mjs:66-81,280-292`. Evidence: coverage-evaluation-policy-controls-2026-10-09.json (`audit/checklist/evidence/coverage-evaluation-policy-controls-2026-10-09.json`, untracked); full current source report (`audit/checklist/reviews/coverage-ecosystem-evaluation-policy-guards-2026-10-09-013.json`, untracked).

Limits: Evaluation source-instrument and explicit synthetic malformed-input scope only. No live measurement/evaluation, actual provider/model inference, released Auto route, promotion/slot write, native/browser/database or product acceptance was executed or established. Reading source/config text in a test is not semantic body coverage of those data files.

Acceptance target: Require each applicable serving slot to resolve through current family ownership, and qualify nonempty/applicable serving population before completeness credit.

## AUDIT-EVAL-POLICY-OVERRIDE-VALIDATION-01

Severity: Low. Status: open current source instrument gap reviewed October 9, 2026; source unchanged.

A valid default policy passes, and a family override with a negative cost ratio plus invalid string latency ratio also passes the policy audit. Independent comparison shows the string latency ratio causes the upper-ceiling comparison to accept an otherwise excessively slow synthetic candidate. Default tolerance type/range checks do not cover override values.

Source: `scripts/lib/eval-gate-policy.mjs:74-81,103-115; tools/evals/scripts/promotion-gate.mjs:36-37,198`. Evidence: coverage-evaluation-policy-controls-2026-10-09.json (`audit/checklist/evidence/coverage-evaluation-policy-controls-2026-10-09.json`, untracked); full current source report (`audit/checklist/reviews/coverage-ecosystem-evaluation-policy-guards-2026-10-09-013.json`, untracked).

Limits: Evaluation source-instrument and explicit synthetic malformed-input scope only. No live measurement/evaluation, actual provider/model inference, released Auto route, promotion/slot write, native/browser/database or product acceptance was executed or established. Reading source/config text in a test is not semantic body coverage of those data files.

Acceptance target: Apply required finite nonnegative tolerance validation to effective family overrides before using each comparison axis.

## AUDIT-EVAL-NUMERIC-MEASUREMENT-VALIDATION-01

Severity: Medium. Status: open current source instrument gap reviewed October 9, 2026; source unchanged.

Finite valid candidate passes and an expensive/slow one fails. An explicitly synthetic JSON candidate with score1e309 (parsed Infinity), mean cost-1 and latency-1 passes every comparison. This proves absent numeric range validation at this comparison boundary, not a current live provider measurement or promotion.

Source: `tools/evals/scripts/promotion-gate.mjs:149-199`. Evidence: coverage-evaluation-policy-controls-2026-10-09.json (`audit/checklist/evidence/coverage-evaluation-policy-controls-2026-10-09.json`, untracked); full current source report (`audit/checklist/reviews/coverage-ecosystem-evaluation-policy-guards-2026-10-09-013.json`, untracked).

Limits: Evaluation source-instrument and explicit synthetic malformed-input scope only. No live measurement/evaluation, actual provider/model inference, released Auto route, promotion/slot write, native/browser/database or product acceptance was executed or established. Reading source/config text in a test is not semantic body coverage of those data files.

Acceptance target: Validate finite bounded scores/completeness and finite nonnegative cost/latency/version data before baseline comparison; preserve malformed JSON-number controls.

## AUDIT-EVAL-TOLERANCE-READ-TEXT-CREDIT-01

Severity: Low. Status: open current source instrument gap reviewed October 9, 2026; source unchanged.

The actual toleranceKeysRead helper returns scoreDrop when its only supplied occurrence is inside a block comment. The returned inventory is raw lexical text rather than executable tolerance property access; the positive actual-source suite does not disprove this control.

Source: `scripts/lib/eval-gate-policy.mjs:18-28`. Evidence: coverage-evaluation-policy-controls-2026-10-09.json (`audit/checklist/evidence/coverage-evaluation-policy-controls-2026-10-09.json`, untracked); full current source report (`audit/checklist/reviews/coverage-ecosystem-evaluation-policy-guards-2026-10-09-013.json`, untracked).

Limits: Evaluation source-instrument and explicit synthetic malformed-input scope only. No live measurement/evaluation, actual provider/model inference, released Auto route, promotion/slot write, native/browser/database or product acceptance was executed or established. Reading source/config text in a test is not semantic body coverage of those data files.

Acceptance target: Bind tolerance discovery to actual executable property reads and reject comment-only declared-key controls.

## AUDIT-ERROR-PARITY-EMPTY-POPULATION-01

Severity: Medium. Status: open current source instrument gap reviewed October 9, 2026; source unchanged.

A complete fresh parity fixture passes and a missing member fails. An empty vocabularies/retryability contract plus empty taxonomy classes passes; a nonempty generated vocabulary with no configured consumers also passes. Zero configured subject population can therefore receive parity success.

Source: `scripts/check-error-contract-parity.mjs:72-82,137-154`. Evidence: coverage-error-contract-controls-2026-10-09.json (`audit/checklist/evidence/coverage-error-contract-controls-2026-10-09.json`, untracked); full current source report (`audit/checklist/reviews/coverage-ecosystem-error-contract-guards-2026-10-09-014.json`, untracked).

Limits: Current source audit-instrument scope and inert source fixtures only. No actual client error response, retry loop, server handler, model/provider, browser/native/database/build/network or product acceptance is executed or established. Current real key/value and product-write correctness are not contradicted by malformed fixture acceptance.

Acceptance target: Establish the independently applicable nonempty vocabulary/consumer population before completeness credit, retaining empty-population controls.

## AUDIT-ERROR-PARITY-COMMENT-CREDIT-01

Severity: Medium. Status: open current source instrument gap reviewed October 9, 2026; source unchanged.

The unchanged guard accepts a generated union entirely in a block comment and accepts the entire consumer mapping only in a comment. The baseline missing-member control fails; comment text is nonetheless inventoried as executable binding/consumer coverage. No real handler is shown missing.

Source: `scripts/check-error-contract-parity.mjs:41-59`. Evidence: coverage-error-contract-controls-2026-10-09.json (`audit/checklist/evidence/coverage-error-contract-controls-2026-10-09.json`, untracked); full current source report (`audit/checklist/reviews/coverage-ecosystem-error-contract-guards-2026-10-09-014.json`, untracked).

Limits: Current source audit-instrument scope and inert source fixtures only. No actual client error response, retry loop, server handler, model/provider, browser/native/database/build/network or product acceptance is executed or established. Current real key/value and product-write correctness are not contradicted by malformed fixture acceptance.

Acceptance target: Bind actual exported closed unions and executable consumer mappings, excluding comments and inert text from coverage.

## AUDIT-ERROR-PARITY-STALE-EXEMPTION-01

Severity: Low. Status: open current source instrument gap reviewed October 9, 2026; source unchanged.

An exemption for a member the consumer now handles is rejected. Removing that member from both union and consumer leaves its old uncovered exemption accepted because only current members are visited. The source ratchet does not reject orphan exemption identities.

Source: `scripts/check-error-contract-parity.mjs:105-125`. Evidence: coverage-error-contract-controls-2026-10-09.json (`audit/checklist/evidence/coverage-error-contract-controls-2026-10-09.json`, untracked); full current source report (`audit/checklist/reviews/coverage-ecosystem-error-contract-guards-2026-10-09-014.json`, untracked).

Limits: Current source audit-instrument scope and inert source fixtures only. No actual client error response, retry loop, server handler, model/provider, browser/native/database/build/network or product acceptance is executed or established. Current real key/value and product-write correctness are not contradicted by malformed fixture acceptance.

Acceptance target: Reject uncovered keys outside the current canonical vocabulary as stale obligations rather than silently retaining them.

## AUDIT-ERROR-MODEL-COMMENT-DECLARATION-01

Severity: Medium. Status: open current source instrument gap reviewed October 9, 2026; source unchanged.

A fresh complete model fixture passes and absent classification fails. Commenting out every canonical registry still supplies all codes; class/remedy exported vocabulary text only in comments also passes. No registry/module is executed by these probes.

Source: `scripts/check-error-model.mjs:63-67,96-102,110-140`. Evidence: coverage-error-contract-controls-2026-10-09.json (`audit/checklist/evidence/coverage-error-contract-controls-2026-10-09.json`, untracked); full current source report (`audit/checklist/reviews/coverage-ecosystem-error-contract-guards-2026-10-09-014.json`, untracked).

Limits: Current source audit-instrument scope and inert source fixtures only. No actual client error response, retry loop, server handler, model/provider, browser/native/database/build/network or product acceptance is executed or established. Current real key/value and product-write correctness are not contradicted by malformed fixture acceptance.

Acceptance target: Read actual export bindings/vocabularies and preserve comment-only negative controls before canonical declaration/classification credit.

## AUDIT-ERROR-REGISTRY-VALUE-OMISSION-01

Severity: Medium. Status: open current source instrument gap reviewed October 9, 2026.

Rechecked on main (3ccb6f6) on 2026-10-15: still present. Main changed `packages/contracts/types/src/errors.ts` after the 2026-09-27 copy this was found on without changing the cited logic; line numbers for it are main's.

The guard passes a fixture whose UNAUTHORIZED property value changes to RENAMED_VALUE while the taxonomy still classifies UNAUTHORIZED. Its reader inventories property keys only. The actual current owner defines error-code unions from object values; current keys/values themselves agree and no drift is asserted.

Source: `scripts/check-error-model.mjs:63-67,75-90; packages/contracts/types/src/errors.ts:58,104,124`. Evidence: coverage-error-contract-controls-2026-10-09.json (`audit/checklist/evidence/coverage-error-contract-controls-2026-10-09.json`, untracked); full current source report (`audit/checklist/reviews/coverage-ecosystem-error-contract-guards-2026-10-09-014.json`, untracked).

Limits: Current source audit-instrument scope and inert source fixtures only. No actual client error response, retry loop, server handler, model/provider, browser/native/database/build/network or product acceptance is executed or established. Current real key/value and product-write correctness are not contradicted by malformed fixture acceptance.

Acceptance target: Resolve actual canonical string values or enforce key/value agreement before taxonomy completeness credit.

## AUDIT-ERROR-RETRY-TAXONOMY-TEXT-CREDIT-01

Severity: Medium. Status: open current source instrument gap reviewed October 9, 2026; source unchanged.

A private three-code retry table is detected. Adding only an error-taxonomy comment or an unused isRetryableErrorCode string makes that same private table disappear from violations. A separately recorded two-code table is below the declared heuristic threshold; no runtime retry or actual current private implementation is proved.

Source: `scripts/check-error-model.mjs:251-262`. Evidence: coverage-error-contract-controls-2026-10-09.json (`audit/checklist/evidence/coverage-error-contract-controls-2026-10-09.json`, untracked); full current source report (`audit/checklist/reviews/coverage-ecosystem-error-contract-guards-2026-10-09-014.json`, untracked).

Limits: Current source audit-instrument scope and inert source fixtures only. No actual client error response, retry loop, server handler, model/provider, browser/native/database/build/network or product acceptance is executed or established. Current real key/value and product-write correctness are not contradicted by malformed fixture acceptance.

Acceptance target: Bind actual canonical helper/metadata consumption to retry decisions and reject comment/unused-string exemptions; qualify heuristic detection scope.

## AUDIT-ERROR-UNRAISED-NAME-CREDIT-01

Severity: Low. Status: open current source instrument gap reviewed October 9, 2026; source unchanged.

An unraised-code fixture with no matching source name passes. Adding only a block comment containing the quoted code causes the guard to require debt deletion as though the code were raised. The guard measures naming, not error construction/emission.

Source: `scripts/check-error-model.mjs:37-39,208-240`. Evidence: coverage-error-contract-controls-2026-10-09.json (`audit/checklist/evidence/coverage-error-contract-controls-2026-10-09.json`, untracked); full current source report (`audit/checklist/reviews/coverage-ecosystem-error-contract-guards-2026-10-09-014.json`, untracked).

Limits: Current source audit-instrument scope and inert source fixtures only. No actual client error response, retry loop, server handler, model/provider, browser/native/database/build/network or product acceptance is executed or established. Current real key/value and product-write correctness are not contradicted by malformed fixture acceptance.

Acceptance target: Bind actual error construction/emission sites before declaring an unraised obligation satisfied or requiring its removal.

## AUDIT-EXPERIMENT-READER-PRESENCE-CREDIT-01

Severity: Low. Status: open current source instrument gap reviewed October 9, 2026; source unchanged.

A populated valid fixture passes and a missing Web reader fails. The same fixture passes with a completely empty reader file. The CLI nonetheless describes each declared experiment as having one assignment flag without inspecting that reader. Current actual Web reader has real key/rule/assignment/exposure functions.

Source: `scripts/check-experiments.mjs:166-171,218-220`. Evidence: isolated controls (`audit/checklist/evidence/coverage-feature-experiment-controls-2026-10-09.json`, untracked); full current source report (`audit/checklist/reviews/coverage-ecosystem-feature-experiment-guards-2026-10-09-015.json`, untracked).

Limits: Current source-instrument and inert source/JSON fixture scope only. No mounted UI, real experiment assignment/exposure, flag-store operation, entitlement/approval decision, browser/native/provider/network/database/build or product acceptance is established. Actual current experiment registry is empty, current experiment reader is implemented and actual ratchet thresholds are finite. The current read-only source gates passed; malformed fixture acceptance is not a current product defect.

Acceptance target: Bind the claimed single assignment and exposure owner behavior to executable definitions or qualify the success output as registry and file-presence validation.

## AUDIT-EXPERIMENT-MEMBER-TYPE-VALIDATION-01

Severity: Low. Status: open current source instrument gap reviewed October 9, 2026; source unchanged.

The populated unchanged guard accepts a variant object, a blank variant string and a guardrails array containing null; a missing exclusions array correctly fails. Shared interfaces require string collections, while the source guard validates mostly array shape/count. No actual registry entry currently carries malformed members.

Source: `scripts/check-experiments.mjs:67-86`. Evidence: isolated controls (`audit/checklist/evidence/coverage-feature-experiment-controls-2026-10-09.json`, untracked); full current source report (`audit/checklist/reviews/coverage-ecosystem-feature-experiment-guards-2026-10-09-015.json`, untracked).

Limits: Current source-instrument and inert source/JSON fixture scope only. No mounted UI, real experiment assignment/exposure, flag-store operation, entitlement/approval decision, browser/native/provider/network/database/build or product acceptance is established. Actual current experiment registry is empty, current experiment reader is implemented and actual ratchet thresholds are finite. The current read-only source gates passed; malformed fixture acceptance is not a current product defect.

Acceptance target: Validate the canonical collection member types and semantic variant/guardrail requirements while preserving valid empty-registry behavior.

## AUDIT-FEATURE-VOCABULARY-COMMENT-CREDIT-01

Severity: Medium. Status: open current source instrument gap reviewed October 9, 2026; source unchanged.

The exact shared readVocabulary returns work/code from an entirely commented declaration. The populated experiment fixture passes with all experiment vocabularies/control and workspace feature declarations only inside block comments; removing the vocabularies fails. These regex results are textual inventory, not actual exported contract evidence.

Source: `scripts/check-feature-registry.mjs:83-89; scripts/check-experiments.mjs:173-184`. Evidence: isolated controls (`audit/checklist/evidence/coverage-feature-experiment-controls-2026-10-09.json`, untracked); full current source report (`audit/checklist/reviews/coverage-ecosystem-feature-experiment-guards-2026-10-09-015.json`, untracked).

Limits: Current source-instrument and inert source/JSON fixture scope only. No mounted UI, real experiment assignment/exposure, flag-store operation, entitlement/approval decision, browser/native/provider/network/database/build or product acceptance is established. Actual current experiment registry is empty, current experiment reader is implemented and actual ratchet thresholds are finite. The current read-only source gates passed; malformed fixture acceptance is not a current product defect.

Acceptance target: Resolve actual exported array/union declarations and exclude comments/inert text from the shared vocabulary owner.

## AUDIT-FLAG-QUOTE-COVERAGE-01

Severity: Medium. Status: open current source instrument gap reviewed October 9, 2026.

Rechecked on main (3ccb6f6) on 2026-10-15: still present. Main changed `scripts/check-feature-flags.mjs` after the 2026-09-27 copy this was found on without changing the cited logic; line numbers for it are main's.

Single-quoted unauthorized keys and evaluator gate imports fail. Semantically corresponding double-quoted keys, evaluator imports and configured gate flag keys pass. Prefix/key/import checks depend on a single quote syntax despite TS supporting both quotes. Fixture imports are never executed.

Source: `scripts/check-feature-flags.mjs:67-68,144-160,173-181`. Evidence: isolated controls (`audit/checklist/evidence/coverage-feature-experiment-controls-2026-10-09.json`, untracked); full current source report (`audit/checklist/reviews/coverage-ecosystem-feature-experiment-guards-2026-10-09-015.json`, untracked).

Limits: Current source-instrument and inert source/JSON fixture scope only. No mounted UI, real experiment assignment/exposure, flag-store operation, entitlement/approval decision, browser/native/provider/network/database/build or product acceptance is established. Actual current experiment registry is empty, current experiment reader is implemented and actual ratchet thresholds are finite. The current read-only source gates passed; malformed fixture acceptance is not a current product defect.

Acceptance target: Recognize actual import/key expressions independently of string quote spelling in all configured guard subjects.

## AUDIT-FLAG-NAMESPACE-CARDINALITY-CREDIT-01

Severity: Medium. Status: open current source instrument gap reviewed October 9, 2026.

Rechecked on main (3ccb6f6) on 2026-10-15: still present. Main changed `scripts/check-feature-flags.mjs` after the 2026-09-27 copy this was found on without changing the cited logic; line numbers for it are main's.

A schema file exporting nothing passes because namespace and reader counts are both zero. Two namespace IDs mapped to duplicate copies of one existing reader pass; a one-reader shortage fails. Entirely commented namespace declarations/mappings and entirely commented prefix declarations also pass, while missing prefixes fail. Cardinality and path existence do not prove actual namespace identity/reader wiring.

Source: `scripts/check-feature-flags.mjs:112-141`. Evidence: isolated controls (`audit/checklist/evidence/coverage-feature-experiment-controls-2026-10-09.json`, untracked); full current source report (`audit/checklist/reviews/coverage-ecosystem-feature-experiment-guards-2026-10-09-015.json`, untracked).

Limits: Current source-instrument and inert source/JSON fixture scope only. No mounted UI, real experiment assignment/exposure, flag-store operation, entitlement/approval decision, browser/native/provider/network/database/build or product acceptance is established. Actual current experiment registry is empty, current experiment reader is implemented and actual ratchet thresholds are finite. The current read-only source gates passed; malformed fixture acceptance is not a current product defect.

Acceptance target: Validate actual nonempty canonical namespace identities and their executable reader bindings; preserve missing-reader and absent-prefix rejecting controls.

## AUDIT-FLAG-WIRE-INDENTATION-COVERAGE-01

Severity: Medium. Status: open current source instrument gap reviewed October 9, 2026.

Rechecked on main (3ccb6f6) on 2026-10-15: still present. Main changed `scripts/check-feature-flags.mjs` after the 2026-09-27 copy this was found on without changing the cited logic; line numbers for it are main's.

Adding code_execution to the wire object with four-space indentation fails for an absent resolver record. The same added property with two-space indentation passes because only exactly four-space property lines are inventoried. This is schema-reading instrument coverage, not changed current wire behavior.

Source: `scripts/check-feature-flags.mjs:192-206`. Evidence: isolated controls (`audit/checklist/evidence/coverage-feature-experiment-controls-2026-10-09.json`, untracked); full current source report (`audit/checklist/reviews/coverage-ecosystem-feature-experiment-guards-2026-10-09-015.json`, untracked).

Limits: Current source-instrument and inert source/JSON fixture scope only. No mounted UI, real experiment assignment/exposure, flag-store operation, entitlement/approval decision, browser/native/provider/network/database/build or product acceptance is established. Actual current experiment registry is empty, current experiment reader is implemented and actual ratchet thresholds are finite. The current read-only source gates passed; malformed fixture acceptance is not a current product defect.

Acceptance target: Inventory actual object properties independent of indentation and retain the unrecorded wire-key rejecting control.

## AUDIT-FLAG-RESOLVER-PRESENCE-CREDIT-01

Severity: Low. Status: open current source instrument gap reviewed October 9, 2026.

Rechecked on main (3ccb6f6) on 2026-10-15: still present. Main changed `scripts/check-feature-flags.mjs` after the 2026-09-27 copy this was found on without changing the cited logic; line numbers for it are main's.

The valid allowance names plans in an existing source file. Replacing that file with an unrelated export passes, because the guard splits resolvedBy at the first space and checks only file existence. The current canonical allowance explicitly names parenthesized resolver functions, whose behavior this guard does not verify.

Source: `scripts/check-feature-flags.mjs:215-225`. Evidence: isolated controls (`audit/checklist/evidence/coverage-feature-experiment-controls-2026-10-09.json`, untracked); full current source report (`audit/checklist/reviews/coverage-ecosystem-feature-experiment-guards-2026-10-09-015.json`, untracked).

Limits: Current source-instrument and inert source/JSON fixture scope only. No mounted UI, real experiment assignment/exposure, flag-store operation, entitlement/approval decision, browser/native/provider/network/database/build or product acceptance is established. Actual current experiment registry is empty, current experiment reader is implemented and actual ratchet thresholds are finite. The current read-only source gates passed; malformed fixture acceptance is not a current product defect.

Acceptance target: Bind any claimed named resolver to its actual exported definition or qualify allowance evidence as path-presence only.

## AUDIT-FAKE-SUCCESS-UNRELATED-SETTLED-CREDIT-01

Severity: Medium. Status: open current source instrument gap reviewed October 9, 2026; source unchanged.

A toast before its awaited fetch is detected. Adding only await Promise.resolve() before the same toast suppresses the finding while the write still begins afterward. Any settled text before the first sink qualifies without relation to the write whose outcome the toast claims.

Source: `scripts/lib/fake-affordances.mjs:14-17,96-105`. Evidence: isolated controls (`audit/checklist/evidence/coverage-feature-experiment-controls-2026-10-09.json`, untracked); full current source report (`audit/checklist/reviews/coverage-ecosystem-feature-experiment-guards-2026-10-09-015.json`, untracked).

Limits: Current source-instrument and inert source/JSON fixture scope only. No mounted UI, real experiment assignment/exposure, flag-store operation, entitlement/approval decision, browser/native/provider/network/database/build or product acceptance is established. Actual current experiment registry is empty, current experiment reader is implemented and actual ratchet thresholds are finite. The current read-only source gates passed; malformed fixture acceptance is not a current product defect.

Acceptance target: Relate the success sink to settlement of the relevant mutation, retaining unrelated-await and correctly awaited-write controls.

## AUDIT-FAKE-AFFORDANCE-LINE-SCOPE-01

Severity: Medium. Status: open current source instrument gap reviewed October 9, 2026; source unchanged.

Inline empty handler and isolated bare identifier controls are detected. A multiline empty handler and multiline bare identifier are omitted. An unformatted identifier placed beside an unrelated entry.name on the same line is also omitted, because any formatting/name marker exempts the whole line. These source-level variants were not rendered or clicked.

Source: `scripts/lib/fake-affordances.mjs:6-9,19-23,84-94`. Evidence: isolated controls (`audit/checklist/evidence/coverage-feature-experiment-controls-2026-10-09.json`, untracked); full current source report (`audit/checklist/reviews/coverage-ecosystem-feature-experiment-guards-2026-10-09-015.json`, untracked).

Limits: Current source-instrument and inert source/JSON fixture scope only. No mounted UI, real experiment assignment/exposure, flag-store operation, entitlement/approval decision, browser/native/provider/network/database/build or product acceptance is established. Actual current experiment registry is empty, current experiment reader is implemented and actual ratchet thresholds are finite. The current read-only source gates passed; malformed fixture acceptance is not a current product defect.

Acceptance target: Bind control and rendered identifier expressions independent of line breaks; correlate formatting with the actual identifier rather than adjacent text.

## AUDIT-FAKE-AFFORDANCE-EMPTY-SCOPE-01

Severity: Medium. Status: open current source instrument gap reviewed October 9, 2026; source unchanged.

The exact readonly CLI with --root set to a fresh empty fixture exits zero and reports zero counts within the repository ratchet. A fresh populated fixture containing an inline empty handler exits one. Missing configured roots are silently empty and no applicable population assertion is made. No repository ratchet write option was invoked.

Source: `scripts/check-fake-affordances.mjs:19,30-32,48-53,90-92`. Evidence: isolated controls (`audit/checklist/evidence/coverage-feature-experiment-controls-2026-10-09.json`, untracked); full current source report (`audit/checklist/reviews/coverage-ecosystem-feature-experiment-guards-2026-10-09-015.json`, untracked).

Limits: Current source-instrument and inert source/JSON fixture scope only. No mounted UI, real experiment assignment/exposure, flag-store operation, entitlement/approval decision, browser/native/provider/network/database/build or product acceptance is established. Actual current experiment registry is empty, current experiment reader is implemented and actual ratchet thresholds are finite. The current read-only source gates passed; malformed fixture acceptance is not a current product defect.

Acceptance target: Establish the expected applicable source population before completeness credit and distinguish intentionally empty scopes from missing scan roots.

## AUDIT-FAKE-AFFORDANCE-RATCHET-NONFINITE-01

Severity: Low. Status: open current source instrument gap reviewed October 9, 2026; source unchanged.

A finite zero dead-control threshold rejects growth to one. Valid JSON carrying 1e999 for each maxFindings entry parses to Infinity and accepts the same growth, because the ratchet checks only typeof number and compares greater-than. Current real threshold values are finite; the raw synthetic JSON is retained because JSON serialization would otherwise replace Infinity with null.

Source: `scripts/lib/fake-affordances.mjs:118-126`. Evidence: isolated controls (`audit/checklist/evidence/coverage-feature-experiment-controls-2026-10-09.json`, untracked); full current source report (`audit/checklist/reviews/coverage-ecosystem-feature-experiment-guards-2026-10-09-015.json`, untracked).

Limits: Current source-instrument and inert source/JSON fixture scope only. No mounted UI, real experiment assignment/exposure, flag-store operation, entitlement/approval decision, browser/native/provider/network/database/build or product acceptance is established. Actual current experiment registry is empty, current experiment reader is implemented and actual ratchet thresholds are finite. The current read-only source gates passed; malformed fixture acceptance is not a current product defect.

Acceptance target: Require finite nonnegative count thresholds before comparison, keeping malformed numeric-overflow controls separate from valid current ratchet evidence.

October 9 mock-export/reachability source qualification: A valid numeric zero ceiling rejects one missing-export/mocking finding. The mock-export ratchet admits missing, nonnumeric, object and JSON-overflow count fields when its reason is sufficiently long. The production CLI admits a raw JSON1e999 ceiling and prints1/Infinity; it still rejects a missing ceiling. Actual repository thresholds remain finite.

Additional source: `scripts/check-mock-exports.mjs:662-688; scripts/lib/production-mocks.mjs:99-111`. Acceptance target: Validate count schema and finite nonnegative integer ceilings before comparison, preserving valid-zero growth rejection and missing-entry errors. Current source report (`audit/checklist/reviews/coverage-ecosystem-mock-exports-reachability-guards-2026-10-09-027.json`, untracked); final complete controls (`audit/checklist/evidence/coverage-mock-export-reachability-independent-controls-2026-10-09-027-final-fidelity.json`, untracked). Current unchanged source instruments/helpers and inert Git/TypeScript/text fixtures only.34 unchanged Node source-instrument tests passed;27 final primary independent controls and one additional byte-identical Rust-root comparison passed with59 TypeScript syntax parses. Three current source CLIs exited0. Synthetic VM factories use literal objects only; no fixture/application module imports, mounted Vitest/React UI, Cargo/Rust compilation, native host, database, provider, network, installation or production effects. Source copies are byte-identical and Git init/add is confined to scrubbed fixture roots. Initial root-level positive fixture had zero discovered tests, so its original failure is retained; corrected nested discovery and an independent root-level omission control qualify the census. Intermediate cache replay used source text with formatting differences; final replay asserts byte-identical mocked/subject/test sources before comparing cached and fresh paths. No source/tool/config fix or deployed incident is accepted.

## SHARED-WORKSPACE-CODE-DISJOINT-ALLOWLIST-01

Severity: High, conditional on conflicting applicable policy layers. Status: open current source defect; root consolidated October 9, 2026.

Rechecked on main (3ccb6f6) on 2026-10-15: still present. Main added opt-in workspace features, but disjoint country, host and MCP lists still intersect to the empty list that means unrestricted. Main also moved the Web resolver into `readMemberControls` and the Code session checks into `openCloudCodeSession`; line numbers for the files main changed are main's.

Root independently read the current canonical composition/predicates and Web effective resolver, Code wrapper and complete Code session route. Sixteen fresh isolated exact-source-fragment controls confirm that nonempty disjoint host/MCP/country restrictions intersect to [], outside hosts/countries and missing country then pass the corresponding predicate, and later applicable lists can repopulate the empty result. Single/overlapping restrictions, MCP disabled toggle and concrete surface deny-all still behave restrictively. Shared012 and Shared016 describe the same sentinel root cause; country is an extension, not another defect ID.

Canonical owner: `packages/contracts/types/src/enterprise/workspace-controls.ts`. Current caller evidence: `apps/web/lib/services/organization-policy-gate.ts:312-368`, `apps/web/lib/services/organization-policy-code-gate.ts:33-44`, `apps/web/app/api/code/sessions/route.ts:83-102` (which opens through `apps/web/lib/services/cloud-code-session-open.ts:132-148`) and `apps/web/lib/services/organization-policy-evaluator.ts:195-225,248-301`.

Evidence: sixteen root source-fragment controls (`audit/checklist/evidence/coverage-workspace-allowlist-root-controls-2026-10-09.json`, untracked); root source/partial-scope receipt (`audit/checklist/reviews/coverage-ecosystem-feature-experiment-guards-2026-10-09-015.json`, untracked); prior Shared012 identity (`audit/checklist/reviews/coverage-shared-contract-tests-2026-10-09-012.json`, untracked); Shared016 current owner and country extension (`audit/checklist/reviews/coverage-shared-contract-source-2026-10-09-016.json`, untracked). Two specialist source records remain separately attributed; one canonical defect row is owned here.

Limits: Conditional current source/pure predicate defect: requires simultaneously applicable nonempty stored restrictions with empty intersection and passage of independent account/rate/CSRF/provisioning/private-beta/proxy/credential/feature/open-session/subscription/managed-compute gates. Actual stored conflicts, applicability, trusted country observations and deployed downstream sandbox/transport behavior are unknown. MCP remains helper-only. Sixteen isolated body controls used explicit type-only syntax erasure and a probe-only presentation label; no product imports, browser/native/provider/network/route/DB/build execution or live egress bypass is established.

Acceptance target: Retain distinct unrestricted and empty deny-all representations through canonical host/MCP/country composition and consumers; preserve individual toggle/surface exceptions and single/overlapping/disjoint/later-layer rejecting controls.

## AUDIT-MATURITY-TABLE-COMMENT-CREDIT-01

Severity: Medium. Status: open current source instrument gap reviewed October 9, 2026; source unchanged.

Entire label and denial declarations inside block comments pass. An active beta label set to null is rejected, but appending a line comment containing beta with a string label makes the same governed user-facing beta feature pass. Raw record keys and an unbound label regex do not establish an exported table or its effective value.

Source: `scripts/check-feature-maturity.mjs:54-85,121-145,232-236`. Evidence: independent controls (`audit/checklist/evidence/coverage-feature-reference-controls-2026-10-09.json`, untracked); current source report (`audit/checklist/reviews/coverage-ecosystem-feature-reference-guards-2026-10-09-016.json`, untracked).

Control cases: `maturity-missing-table-members-rejected`, `maturity-entire-comment-tables-accepted`, `maturity-null-beta-label-rejected`, `maturity-comment-label-overrides-null-accepted`.

Limits: Current source-instrument and inert text/JSON fixtures only. No TypeScript fixture body, application, mounted UI, native device, provider, network, database, build or product acceptance. Current unmodified source CLIs pass: 30 features, 7 below general availability, 14 required roles, 26 scanner-recognized mint sites and two configured text-cap exemptions. Other guards may independently reject a malformed fixture; these findings concern the named guard, not the entire gate chain or a deployed product incident.

Acceptance target: Resolve actual exported maturity tables and their effective label values; exclude comments and preserve missing-member/null-label refusal.

## AUDIT-MATURITY-RECORD-SYNTAX-COVERAGE-01

Severity: Low. Status: open current source instrument gap reviewed October 9, 2026; source unchanged.

A multiline bare-key record yields both beta and general_availability. The equivalent compact record yields only beta, quoted property keys yield null, and a closing brace inside a string prematurely truncates the record. These valid source forms can produce missing-stage errors without changing the table.

Source: `scripts/check-feature-maturity.mjs:54-85`. Evidence: independent controls (`audit/checklist/evidence/coverage-feature-reference-controls-2026-10-09.json`, untracked); current source report (`audit/checklist/reviews/coverage-ecosystem-feature-reference-guards-2026-10-09-016.json`, untracked).

Control cases: `record-keys-multiline`, `record-keys-compact-second-key-lost`, `record-keys-quoted-valid-keys-unread`, `record-keys-quoted-close-brace-truncates`.

Limits: Current source-instrument and inert text/JSON fixtures only. No TypeScript fixture body, application, mounted UI, native device, provider, network, database, build or product acceptance. Current unmodified source CLIs pass: 30 features, 7 below general availability, 14 required roles, 26 scanner-recognized mint sites and two configured text-cap exemptions. Other guards may independently reject a malformed fixture; these findings concern the named guard, not the entire gate chain or a deployed product incident.

Acceptance target: Read valid record syntax with nesting that excludes quoted text and recognizes compact/quoted property keys.

## AUDIT-FEATURE-REGISTRY-GATE-SHAPE-01

Severity: Medium. Status: open current source instrument gap reviewed October 9, 2026; source unchanged.

An explicit all-null primary gate set is rejected. Omitting gates entirely, using an empty object or providing only an unknownLayer key passes. The omitted/empty versions are also counted as having a plan entitlement because undefined differs from null. A well-formed populated fixture passes separately.

Source: `scripts/check-feature-registry.mjs:139-178,314-315`. Evidence: independent controls (`audit/checklist/evidence/coverage-feature-reference-controls-2026-10-09.json`, untracked); current source report (`audit/checklist/reviews/coverage-ecosystem-feature-reference-guards-2026-10-09-016.json`, untracked).

Control cases: `registry-valid-baseline`, `registry-explicit-null-primary-gates-rejected`, `registry-omitted-gates-accepted-counted-entitled`, `registry-empty-gates-accepted-counted-entitled`, `registry-unknown-layer-only-accepted`.

Limits: Current source-instrument and inert text/JSON fixtures only. No TypeScript fixture body, application, mounted UI, native device, provider, network, database, build or product acceptance. Current unmodified source CLIs pass: 30 features, 7 below general availability, 14 required roles, 26 scanner-recognized mint sites and two configured text-cap exemptions. Other guards may independently reject a malformed fixture; these findings concern the named guard, not the entire gate chain or a deployed product incident.

Acceptance target: Validate gate object shape and allowed layers, require a deciding primary gate and count only an actual declared entitlement.

## AUDIT-FEATURE-REGISTRY-MISSING-VOCABULARY-01

Severity: Medium. Status: open current source instrument gap reviewed October 9, 2026; source unchanged.

Invalid domain, maturity and rolloutFlag values each fail against a present vocabulary. Removing the corresponding domain JSON, maturity source or rollout-flag source makes the same invalid value pass. The configured entitlement/policy/permission/trust source branch still reports missing exports; the weakness is bounded to these three owner paths.

Source: `scripts/check-feature-registry.mjs:94-101,139-145,188-193,222-229`. Evidence: independent controls (`audit/checklist/evidence/coverage-feature-reference-controls-2026-10-09.json`, untracked); current source report (`audit/checklist/reviews/coverage-ecosystem-feature-reference-guards-2026-10-09-016.json`, untracked).

Control cases: `registry-present-domain-vocabulary-rejects-invalid`, `registry-missing-domain-vocabulary-accepts-invalid`, `registry-present-maturity-vocabulary-rejects-invalid`, `registry-missing-maturity-vocabulary-accepts-invalid`, `registry-present-rollout-vocabulary-rejects-invalid`, `registry-missing-rollout-vocabulary-accepts-invalid`.

Limits: Current source-instrument and inert text/JSON fixtures only. No TypeScript fixture body, application, mounted UI, native device, provider, network, database, build or product acceptance. Current unmodified source CLIs pass: 30 features, 7 below general availability, 14 required roles, 26 scanner-recognized mint sites and two configured text-cap exemptions. Other guards may independently reject a malformed fixture; these findings concern the named guard, not the entire gate chain or a deployed product incident.

Acceptance target: Fail closed when every required vocabulary owner is absent or unreadable while preserving valid gate and domain checks.

## AUDIT-FEATURE-REGISTRY-MODULE-COMMENT-CREDIT-01

Severity: Low. Status: open current source instrument gap reviewed October 9, 2026; source unchanged.

A module with no registry read is rejected. Adding only a line comment containing registryJson.features makes the unchanged module pass; no fixture module is imported. The check establishes raw marker presence rather than executable type/table binding.

Source: `scripts/check-feature-registry.mjs:302-307`. Evidence: independent controls (`audit/checklist/evidence/coverage-feature-reference-controls-2026-10-09.json`, untracked); current source report (`audit/checklist/reviews/coverage-ecosystem-feature-reference-guards-2026-10-09-016.json`, untracked).

Control cases: `registry-module-missing-reader-rejected`, `registry-module-comment-reader-accepted`.

Limits: Current source-instrument and inert text/JSON fixtures only. No TypeScript fixture body, application, mounted UI, native device, provider, network, database, build or product acceptance. Current unmodified source CLIs pass: 30 features, 7 below general availability, 14 required roles, 26 scanner-recognized mint sites and two configured text-cap exemptions. Other guards may independently reject a malformed fixture; these findings concern the named guard, not the entire gate chain or a deployed product incident.

Acceptance target: Bind the registry consumer to an executable read or qualify this guard as lexical marker inventory.

## AUDIT-FEATURE-LABEL-OPERAND-COVERAGE-01

Severity: Low. Status: open current source instrument gap reviewed October 9, 2026; source unchanged.

The same feature-resolving function compares featureId with Computer use. The featureId-first spelling yields one violation; the label-first spelling yields none. Both strings remain inert fixture text, with the same featureId admission marker and source path.

Source: `scripts/check-feature-registry.mjs:120-135`. Evidence: independent controls (`audit/checklist/evidence/coverage-feature-reference-controls-2026-10-09.json`, untracked); current source report (`audit/checklist/reviews/coverage-ecosystem-feature-reference-guards-2026-10-09-016.json`, untracked).

Control cases: `registry-label-right-operand-rejected`, `registry-label-left-operand-unread`.

Limits: Current source-instrument and inert text/JSON fixtures only. No TypeScript fixture body, application, mounted UI, native device, provider, network, database, build or product acceptance. Current unmodified source CLIs pass: 30 features, 7 below general availability, 14 required roles, 26 scanner-recognized mint sites and two configured text-cap exemptions. Other guards may independently reject a malformed fixture; these findings concern the named guard, not the entire gate chain or a deployed product incident.

Acceptance target: Cover both operands of equivalent feature label comparisons without admitting unrelated prose.

## AUDIT-FILE-REFERENCE-COMMENT-CONTRACT-CREDIT-01

Severity: Medium. Status: open current source instrument gap reviewed October 9, 2026.

Rechecked on main (3ccb6f6) on 2026-10-15: still present. Main changed `scripts/check-file-reference-canonical.mjs` after the 2026-09-27 copy this was found on without changing the cited logic; line numbers for it are main's.

A minimal active contract with all actual required role-to-field mappings passes. Moving the role declaration, the interface fields or the entire contract inside a block comment also passes while the model file is empty. Ordinary missing-role/unknown-field/duplicate-field controls in the unchanged suite still reject their inputs.

Source: `scripts/check-file-reference-canonical.mjs:99-123,137-167`. Evidence: independent controls (`audit/checklist/evidence/coverage-feature-reference-controls-2026-10-09.json`, untracked); current source report (`audit/checklist/reviews/coverage-ecosystem-feature-reference-guards-2026-10-09-016.json`, untracked).

Control cases: `file-active-minimal-contract-control`, `file-comment-roles-credited`, `file-comment-fields-credited`, `file-entire-comment-contract-credited`.

Limits: Current source-instrument and inert text/JSON fixtures only. No TypeScript fixture body, application, mounted UI, native device, provider, network, database, build or product acceptance. Current unmodified source CLIs pass: 30 features, 7 below general availability, 14 required roles, 26 scanner-recognized mint sites and two configured text-cap exemptions. Other guards may independently reject a malformed fixture; these findings concern the named guard, not the entire gate chain or a deployed product incident.

Acceptance target: Resolve actual canonical role exports and declared interface fields; do not accept commented declarations as contract coverage.

## AUDIT-FILE-MINT-CALL-COVERAGE-01

Severity: Medium. Status: open current source instrument gap reviewed October 9, 2026.

Rechecked on main (3ccb6f6) on 2026-10-15: still present. Main changed `scripts/check-file-reference-canonical.mjs` after the 2026-09-27 copy this was found on without changing the cited logic; line numbers for it are main's.

A short call using asset.url as identity is rejected and counted. The same borrowed identity after a 700-character property, or supplied through an object shorthand id, is omitted and passes with zero recognized mints. A mint with no id followed by an unrelated object id is counted as one minted identity. The raw 600-character window neither enumerates all calls nor respects call boundaries.

Source: `scripts/check-file-reference-canonical.mjs:36,126-134,175-184,219-223`. Evidence: independent controls (`audit/checklist/evidence/coverage-feature-reference-controls-2026-10-09.json`, untracked); current source report (`audit/checklist/reviews/coverage-ecosystem-feature-reference-guards-2026-10-09-016.json`, untracked).

Control cases: `file-short-borrowed-id-rejected`, `file-long-call-borrowed-id-unread`, `file-shorthand-borrowed-id-unread`, `file-unrelated-subsequent-id-counted`.

Limits: Current source-instrument and inert text/JSON fixtures only. No TypeScript fixture body, application, mounted UI, native device, provider, network, database, build or product acceptance. Current unmodified source CLIs pass: 30 features, 7 below general availability, 14 required roles, 26 scanner-recognized mint sites and two configured text-cap exemptions. Other guards may independently reject a malformed fixture; these findings concern the named guard, not the entire gate chain or a deployed product incident.

Acceptance target: Enumerate mint calls and bind the supplied identity to each actual call across supported argument syntax; qualify counts until that coverage is proven.

## AUDIT-FILE-TEXT-CAP-MARKER-CREDIT-01

Severity: Medium. Status: open current source instrument gap reviewed October 9, 2026.

Rechecked on main (3ccb6f6) on 2026-10-15: still present. Main emptied the text-cap baseline and passes it as a parameter; a module that merely mentions `MAX_FILE_TEXT_CHARS` is still exempt. Line numbers for `scripts/check-file-reference-canonical.mjs` are main's.

An exported independent MAX_OTHER_TEXT_CHARS cap with a Uint8Array marker is rejected. Adding MAX_FILE_TEXT_CHARS only in a comment or unrelated unused string makes that same independent cap pass. Configured legacy exemptions and their stale-entry checks remain active.

Source: `scripts/check-file-reference-canonical.mjs:187-196`. Evidence: independent controls (`audit/checklist/evidence/coverage-feature-reference-controls-2026-10-09.json`, untracked); current source report (`audit/checklist/reviews/coverage-ecosystem-feature-reference-guards-2026-10-09-016.json`, untracked).

Control cases: `file-new-independent-text-cap-rejected`, `file-text-cap-comment-marker-exempts-duplicate`, `file-text-cap-unused-string-marker-exempts-duplicate`.

Limits: Current source-instrument and inert text/JSON fixtures only. No TypeScript fixture body, application, mounted UI, native device, provider, network, database, build or product acceptance. Current unmodified source CLIs pass: 30 features, 7 below general availability, 14 required roles, 26 scanner-recognized mint sites and two configured text-cap exemptions. Other guards may independently reject a malformed fixture; these findings concern the named guard, not the entire gate chain or a deployed product incident.

Acceptance target: Require use of the canonical cap in extraction behavior rather than any raw marker occurrence; retain stale baseline checks.

## AUDIT-GUARD-INVENTORY-INERT-COMMAND-CREDIT-01

Severity: Medium. Status: open current source instrument or documentation scope gap reviewed October 9, 2026.

Rechecked on main (3ccb6f6) on 2026-10-15: still present. Main changed `scripts/check-model-change-suites.mjs` after the 2026-09-27 copy this was found on without changing the cited logic; line numbers for it are main's.

An ordinary direct guard command is credited and an unwired guard fails. Putting the guard path only in printf text, a shell comment or a different filename with the same prefix earns wiring credit. A self-test filename only inside the printf text also earns selfTestRun. Workflow block comments similarly earn execution credit. No fixture script command or self-test was actually run.

Source: `scripts/check-guard-inventory.mjs:35-49,80-113`. Evidence: independent controls (`audit/checklist/evidence/coverage-inventory-localization-controls-2026-10-09.json`, untracked); full current source report (`audit/checklist/reviews/coverage-ecosystem-inventory-localization-guards-2026-10-09-017.json`, untracked).

Control cases: `inventory-direct-command-valid`, `inventory-unwired-guard-rejected`, `inventory-echo-only-path-credited`, `inventory-comment-only-path-credited`, `inventory-other-filename-prefix-credited`, `inventory-self-test-echo-token-credited`, `inventory-workflow-comment-command-credited`.

Limits: Current source-instrument scope only. Fixture shell/package commands, hook files, application modules and TypeScript bodies never execute. The display-array guard is copied byte-for-byte only to bind its module-relative root to an isolated fixture; generated-artifact fixtures use temporary Git init/add only. All five unchanged current source CLIs exited0, and two unchanged source-instrument suites passed11/11 tests. No whole-chain runtime, hook execution, CI job, mounted UI, locale display, provider/native/network/database/build or product acceptance.

Acceptance target: Bind inventory reachability to executable commands with exact target identity; exclude quoted output, comments, unrelated filename prefixes and inert self-test references.

October 9 model-suite qualification: the complete unchanged exported model-change suite guard accepts a CI run value containing only comments with the affected/TypeScript/Rust command tokens and accepts an echo-only root affected-test script. Direct commands pass; missing commands, a job condition and a literal job warning flag refuse. Source: `scripts/check-model-change-suites.mjs:101-110,185-193,235-239`. This extends the original exact executable-command acceptance target and preserves the separately scoped AUDIT-CI-COMMENTED-GATE-CREDIT-01 parent-check relation, with zero new cause. Six private-root guard-engine controls read registry/YAML/manifests and empty test-named files as inert text/data; no referenced suite, shell/provider/Rust command or synthetic test body executes. Current source report (`audit/checklist/reviews/coverage-model-contract-guard-source-2026-10-09-041.json`, untracked); independent controls (`audit/checklist/evidence/coverage-model-contract-inert-controls-2026-10-09-041.json`, untracked); current guard/tests (`audit/checklist/evidence/coverage-model-contract-current-source-gates-2026-10-09-041.json`, untracked). All56 authored guard-only tests and four original source CLIs passed. Original fixture-path/probe refusals are retained separately. Source/tool/config remain unchanged; prior Root035 failure and all runtime/requirement acceptance remain open.

October 9 scanner/search/supply qualification: The complete original supply-chain engine admits a workflow source run step containing only an echo message quoting pnpm install --frozen-lockfile. That inert quoted text satisfies install census and frozen flags. Removing install markers entirely refuses. This shares the existing raw-text command inventory credit cause; no install or workflow executes. Actual source report (`audit/checklist/reviews/coverage-security-index-supply-guard-source-2026-10-09-044.json`, untracked); 34 independent controls (`audit/checklist/evidence/coverage-security-index-supply-inert-controls-2026-10-09-044.json`, untracked); current guard outcomes (`audit/checklist/evidence/coverage-security-index-supply-current-source-gates-2026-10-09-044.json`, untracked); 31-target independent scope receipt (`audit/checklist/evidence/coverage-supply-chain-nested-target-scope-2026-10-09-044.json`, untracked). Zero new cause; no runtime effects.

## AUDIT-GUARD-WORKFLOW-STEP-BOUNDARY-01

Severity: Medium. Status: open current source instrument or documentation scope gap reviewed October 9, 2026; source unchanged.

A valid workflow step named scripts/check-one.mjs with run echo ok is rejected as unwired when name comes first. Swapping the same mapping fields to put run first makes the guard pass: workflowCommands absorbs the following name field as command text. The installed YAML parser independently confirmed both fixtures parse to identical step objects. Neither workflow actually invokes the guard.

Source: `scripts/check-guard-inventory.mjs:56-77,100-103`. Evidence: independent controls (`audit/checklist/evidence/coverage-inventory-localization-controls-2026-10-09.json`, untracked); full current source report (`audit/checklist/reviews/coverage-ecosystem-inventory-localization-guards-2026-10-09-017.json`, untracked).

Control cases: `inventory-workflow-name-before-run-not-credited`, `inventory-workflow-name-after-run-credited`.

Limits: Current source-instrument scope only. Fixture shell/package commands, hook files, application modules and TypeScript bodies never execute. The display-array guard is copied byte-for-byte only to bind its module-relative root to an isolated fixture; generated-artifact fixtures use temporary Git init/add only. All five unchanged current source CLIs exited0, and two unchanged source-instrument suites passed11/11 tests. No whole-chain runtime, hook execution, CI job, mounted UI, locale display, provider/native/network/database/build or product acceptance.

Acceptance target: Parse run-step values and block scalar boundaries separately from sibling name/env/shell/condition metadata, independently of YAML mapping key order.

October9 source-guard qualification: Fresh syntax-valid YAML companion blocks confirm the complete original checker rejects a comment following a backslash in an actual run value, and also rejects ordinary top-level YAML prose comments outside every run. The valid plain workflow and trailing-comment workflow parse to identical run values; only the added non-run comment text causes a refusal. This extends the existing run-value/source-boundary cause. The original malformed YAML raw-text attempt remains preserved. No workflow shell or Cargo executes; current source CLI is green. Source: `scripts/check-workflow-cargo-features.mjs:99-116`. Actual source reading (`audit/checklist/reviews/coverage-cache-version-workflow-guard-source-2026-10-09-048.json`, untracked); original engine controls (`audit/checklist/evidence/coverage-cache-version-workflow-inert-controls-2026-10-09-048.json`, untracked); valid companions (`audit/checklist/evidence/coverage-cache-version-workflow-valid-companions-2026-10-09-048.json`, untracked); independent challenge (`audit/checklist/evidence/coverage-cache-version-workflow-independent-challenge-2026-10-09-048.json`, untracked). Zero new cause or runtime acceptance.

## AUDIT-HOOK-COMMENT-CREDIT-01

Severity: Medium. Status: open current source instrument or documentation scope gap reviewed October 9, 2026; source unchanged.

Active required hook lines pass, omitted commands fail and a non-executable hook fails. A fixture with every required hook command only commented out, commitlint configuration names only in a comment and package script targets only inside printf strings nevertheless passes. Executable mode and raw substring presence do not establish the required behavior.

Source: `scripts/check-hooks.mjs:23-28,39-48,65-82`. Evidence: independent controls (`audit/checklist/evidence/coverage-inventory-localization-controls-2026-10-09.json`, untracked); full current source report (`audit/checklist/reviews/coverage-ecosystem-inventory-localization-guards-2026-10-09-017.json`, untracked).

Control cases: `hooks-active-required-lines-valid`, `hooks-missing-required-command-rejected`, `hooks-non-executable-rejected`, `hooks-commented-commands-config-and-echo-scripts-accepted`.

Limits: Current source-instrument scope only. Fixture shell/package commands, hook files, application modules and TypeScript bodies never execute. The display-array guard is copied byte-for-byte only to bind its module-relative root to an isolated fixture; generated-artifact fixtures use temporary Git init/add only. All five unchanged current source CLIs exited0, and two unchanged source-instrument suites passed11/11 tests. No whole-chain runtime, hook execution, CI job, mounted UI, locale display, provider/native/network/database/build or product acceptance.

Acceptance target: Validate executable hook/package command and configuration bindings while retaining required-file and executable-mode checks.

## AUDIT-FIXTURE-ARRAY-SYNTAX-COVERAGE-01

Severity: Medium. Status: open current source instrument or documentation scope gap reviewed October 9, 2026; source unchanged.

The direct module-level MODELS array in a TSX fixture with a model-store counterpart is rejected. Indenting the otherwise identical declaration or putting the assignment on the next line passes. An entirely commented declaration instead fails. The line regex distinguishes formatting/comment text rather than actual declarations.

Source: `scripts/check-hardcoded-fixture-arrays.mjs:95-107,120-124`. Evidence: independent controls (`audit/checklist/evidence/coverage-inventory-localization-controls-2026-10-09.json`, untracked); full current source report (`audit/checklist/reviews/coverage-ecosystem-inventory-localization-guards-2026-10-09-017.json`, untracked).

Control cases: `display-array-direct-declaration-rejected`, `display-array-indented-equivalent-omitted`, `display-array-line-break-equivalent-omitted`, `display-array-comment-only-declaration-rejected`.

Limits: Current source-instrument scope only. Fixture shell/package commands, hook files, application modules and TypeScript bodies never execute. The display-array guard is copied byte-for-byte only to bind its module-relative root to an isolated fixture; generated-artifact fixtures use temporary Git init/add only. All five unchanged current source CLIs exited0, and two unchanged source-instrument suites passed11/11 tests. No whole-chain runtime, hook execution, CI job, mounted UI, locale display, provider/native/network/database/build or product acceptance.

Acceptance target: Recognize actual display-array declarations independently of indentation and assignment line breaks and exclude commented declarations; preserve canonical/test exemptions.

## AUDIT-GENERATED-ARTIFACT-SCOPE-DOC-DRIFT-01

Severity: Low. Status: open current source instrument or documentation scope gap reviewed October 9, 2026; source unchanged.

A matching root app-capture.md is rejected when tracked in a temporary index but ignored when present and nonignored yet untracked. The implementation enumerates git ls-files and tracked-ignored entries, whereas the general operating contract describes guard inputs as git ls-files -co. This is a scope/documentation discrepancy. Its prescribed stage-first workflow still detects this exact example after staging; no committed-artifact bypass is asserted.

Source: `scripts/check-generated-artifacts.mjs:8-24,44-76; AGENTS.md:236-237`. Evidence: independent controls (`audit/checklist/evidence/coverage-inventory-localization-controls-2026-10-09.json`, untracked); full current source report (`audit/checklist/reviews/coverage-ecosystem-inventory-localization-guards-2026-10-09-017.json`, untracked).

Control cases: `generated-clean-tracked-baseline`, `generated-tracked-matching-scratch-rejected`, `generated-untracked-matching-scratch-omitted`.

Limits: Current source-instrument scope only. Fixture shell/package commands, hook files, application modules and TypeScript bodies never execute. The display-array guard is copied byte-for-byte only to bind its module-relative root to an isolated fixture; generated-artifact fixtures use temporary Git init/add only. All five unchanged current source CLIs exited0, and two unchanged source-instrument suites passed11/11 tests. No whole-chain runtime, hook execution, CI job, mounted UI, locale display, provider/native/network/database/build or product acceptance.

Acceptance target: State the generated-artifact guard tracking boundary precisely or explicitly cover intended nonignored untracked inputs without exposing private/generated/dependency trees.

## AUDIT-IDE-EDITOR-IMPORT-SYNTAX-01

Severity: Medium. Status: open source-instrument gap.

Source: `scripts/check-ide-core-neutral.mjs:54-60,77-80`. Evidence: actual refined controls (`audit/checklist/evidence/coverage-ide-idempotency-identifier-controls-2026-10-09.json`, untracked); full selected source report (`audit/checklist/reviews/coverage-ecosystem-ide-idempotency-identifier-guards-2026-10-09-018.json`, untracked).

Single-line import is detected and rejected. A syntactically valid multiline named import from vscode is missed and the complete fixture guard passes. A syntactically valid export-from vscode is also missed by the exported scanner. Installed TypeScript parses the fixtures independently; direct imports and dynamic imports are still detected.

Acceptance target: Recognize all actual editor module import/reexport forms while excluding comments; retain direct import rejection.

Verification limits: Current unchanged source guard APIs and inert source fixtures only. TypeScript parser independently confirms selected import/export/callback fixtures are syntactically valid; fixture bodies never execute. SQL semantics use current official PostgreSQL documentation, no database is opened. Temporary Git initialization is confined to fixture roots. Three unchanged Node suites passed31/31,34 final controls passed,and all three current CLIs exited0. No app/browser/host UI/native/provider/database/build/production acceptance; no code fix.

October 9 egress/install/provider extension under this same canonical owner: A business module static single-line declared provider SDK import is rejected. With the valid adapter retained, converting only the forbidden domain import to a dynamic import or multiline named import causes the complete provider API to pass. importedPackages inspects individual lines and its regex has no dynamic import form. Existing restricted import-syntax owner is extended; no SDK is executed or product route imported.

Additional source: `scripts/check-provider-adapter-boundary.mjs:50-51,62-70,108-137`. Acceptance target: Use syntax-aware package import discovery for every relevant static/dynamic form and preserve binding-independent subpath identity before enforcing adapter neutrality. Actual source review (`audit/checklist/reviews/coverage-ecosystem-egress-install-provider-guards-2026-10-09-026.json`, untracked); complete controls (`audit/checklist/evidence/coverage-egress-install-provider-independent-controls-2026-10-09-026-refined.json`, untracked). Current unchanged guard APIs/CLIs over isolated inert TypeScript/text fixtures only.40 unchanged tests and32 final independent controls passed;61 fixture syntax parses establish syntax only. Five current source CLIs exited0. Initial8-control execution stopped when the synthetic positive fallback used policy={...} but the lexical guard requires policy = {...}; original actual failure and refined execution are preserved. No application modules, SQL, policy resolver, plugin installation, provider/MCP/network/native/browser/database/build or production state executed. Source/config/tool files remain unchanged. No deployed security or product incident is accepted.

October 9 mock-export/reachability source qualification: A single-line named mock import is rejected by the complete zero-ceiling CLI. Converting that same declaration into a valid multiline named import yields no finding and the complete CLI passes. Existing IDE/provider restricted-import parser owner is extended; dynamic mock imports remain separately recognized by the production helper.

Additional source: `scripts/lib/production-mocks.mjs:3-4,65-84`. Acceptance target: Use syntax-aware discovery for all relevant static multiline import/export forms while preserving dynamic import controls and comment exclusions. Current source report (`audit/checklist/reviews/coverage-ecosystem-mock-exports-reachability-guards-2026-10-09-027.json`, untracked); final complete controls (`audit/checklist/evidence/coverage-mock-export-reachability-independent-controls-2026-10-09-027-final-fidelity.json`, untracked). Current unchanged source instruments/helpers and inert Git/TypeScript/text fixtures only.34 unchanged Node source-instrument tests passed;27 final primary independent controls and one additional byte-identical Rust-root comparison passed with59 TypeScript syntax parses. Three current source CLIs exited0. Synthetic VM factories use literal objects only; no fixture/application module imports, mounted Vitest/React UI, Cargo/Rust compilation, native host, database, provider, network, installation or production effects. Source copies are byte-identical and Git init/add is confined to scrubbed fixture roots. Initial root-level positive fixture had zero discovered tests, so its original failure is retained; corrected nested discovery and an independent root-level omission control qualify the census. Intermediate cache replay used source text with formatting differences; final replay asserts byte-identical mocked/subject/test sources before comparing cached and fresh paths. No source/tool/config fix or deployed incident is accepted.

October 9 Root033 current source qualification: Direct and dynamic editor imports are refused, while multiline import, re-export and a comment gap between require and its call are omitted. Comment-only require text is falsely refused; independent AST distinguishes real nodes from comments.

Acceptance target: Bind actual import/re-export/require nodes and source kind; preserve direct/dynamic refusal.

Evidence: current source report (`audit/checklist/reviews/coverage-ecosystem-neutral-idempotency-identifier-guards-2026-10-09-033.json`, untracked); actual controls (`audit/checklist/evidence/coverage-neutral-ide-independent-controls-2026-10-09-033.json`, untracked). Current unchanged source instruments and inert text/Git fixtures only. Forty distinct unchanged tests passed (31 Node and 9 Python); the independent repeat of 20 Node tests is included in those 31, not added to the distinct total. Sixty-eight fixture controls/assertions succeeded: 16 IDE, 7 conflict-marker and 45 independent idempotency/identifier cases. The 45 cases include 10 reproduced false acceptances, 22 working refusals, 34 satisfied advertised properties and one unresolved composite scope; assertion success does not mean all advertised guard properties held. Four current source CLIs exited zero. Fourteen TypeScript AST parses and 171 separate Node ESM syntax checks establish syntax only. No application/fixture module import, actual SQL/DB/migration, native/provider/browser/network/build/install/production behavior or real-checkout staging. The conflict reader-denial case imports only a copied source-guard module. Original failures and negative controls are preserved; no source fix or runtime product acceptance.

## AUDIT-IDE-TRUST-SETTING-SYNTAX-01

Severity: Medium. Status: open source-instrument gap.

Source: `scripts/check-ide-core-neutral.mjs:64-68,124-129`. Evidence: actual refined controls (`audit/checklist/evidence/coverage-ide-idempotency-identifier-controls-2026-10-09.json`, untracked); full selected source report (`audit/checklist/reviews/coverage-ecosystem-ide-idempotency-identifier-guards-2026-10-09-018.json`, untracked).

A single-quoted getUserScoped<string> apiEndpoint call requires a manifest restriction and the omission is rejected. Equivalent double-quoted generic and single-quoted inferred-generic calls produce no settings and the same complete fixture guard passes. Actual current config.ts uses the recognized spelling and getUserScoped ignores workspace values, so this is a future scan coverage gap rather than current endpoint leakage.

Acceptance target: Bind manifest restrictions to actual trust-scoped accessor calls regardless of quote spelling or explicit generic arguments.

Verification limits: Current unchanged source guard APIs and inert source fixtures only. TypeScript parser independently confirms selected import/export/callback fixtures are syntactically valid; fixture bodies never execute. SQL semantics use current official PostgreSQL documentation, no database is opened. Temporary Git initialization is confined to fixture roots. Three unchanged Node suites passed31/31,34 final controls passed,and all three current CLIs exited0. No app/browser/host UI/native/provider/database/build/production acceptance; no code fix.

October 9 Root033 current source qualification: Missing restriction for a recognized setting accessor is refused; double-quoted generic and inferred generic accessor forms are omitted. AST verifies the accessor nodes.

Acceptance target: Discover equivalent actual setting accessors before testing declared trust restrictions.

Evidence: current source report (`audit/checklist/reviews/coverage-ecosystem-neutral-idempotency-identifier-guards-2026-10-09-033.json`, untracked); actual controls (`audit/checklist/evidence/coverage-neutral-ide-independent-controls-2026-10-09-033.json`, untracked). Current unchanged source instruments and inert text/Git fixtures only. Forty distinct unchanged tests passed (31 Node and 9 Python); the independent repeat of 20 Node tests is included in those 31, not added to the distinct total. Sixty-eight fixture controls/assertions succeeded: 16 IDE, 7 conflict-marker and 45 independent idempotency/identifier cases. The 45 cases include 10 reproduced false acceptances, 22 working refusals, 34 satisfied advertised properties and one unresolved composite scope; assertion success does not mean all advertised guard properties held. Four current source CLIs exited zero. Fourteen TypeScript AST parses and 171 separate Node ESM syntax checks establish syntax only. No application/fixture module import, actual SQL/DB/migration, native/provider/browser/network/build/install/production behavior or real-checkout staging. The conflict reader-denial case imports only a copied source-guard module. Original failures and negative controls are preserved; no source fix or runtime product acceptance.

## AUDIT-IDE-FORK-COMMENT-REJECTION-01

Severity: Low. Status: open source-instrument gap.

Source: `scripts/check-ide-core-neutral.mjs:140-145`. Evidence: actual refined controls (`audit/checklist/evidence/coverage-ide-idempotency-identifier-controls-2026-10-09.json`, untracked); full selected source report (`audit/checklist/reviews/coverage-ecosystem-ide-idempotency-identifier-guards-2026-10-09-018.json`, untracked).

A config file containing only a comment naming Cursor makes the complete fixture guard report an editor-product branch; the file has no branch or executed API. Its CursorPosition identifier exemption remains accepted. Raw prose matching does not identify a behavioral branch.

Acceptance target: Recognize actual product-name comparisons or branching rather than rejecting an inert comment.

Verification limits: Current unchanged source guard APIs and inert source fixtures only. TypeScript parser independently confirms selected import/export/callback fixtures are syntactically valid; fixture bodies never execute. SQL semantics use current official PostgreSQL documentation, no database is opened. Temporary Git initialization is confined to fixture roots. Three unchanged Node suites passed31/31,34 final controls passed,and all three current CLIs exited0. No app/browser/host UI/native/provider/database/build/production acceptance; no code fix.

October 9 Root033 current source qualification: A comment containing a fork name is falsely refused. A similarly named ordinary identifier remains accepted.

Acceptance target: Inspect actual branching/dependency nodes while excluding comments.

Evidence: current source report (`audit/checklist/reviews/coverage-ecosystem-neutral-idempotency-identifier-guards-2026-10-09-033.json`, untracked); actual controls (`audit/checklist/evidence/coverage-neutral-ide-independent-controls-2026-10-09-033.json`, untracked). Current unchanged source instruments and inert text/Git fixtures only. Forty distinct unchanged tests passed (31 Node and 9 Python); the independent repeat of 20 Node tests is included in those 31, not added to the distinct total. Sixty-eight fixture controls/assertions succeeded: 16 IDE, 7 conflict-marker and 45 independent idempotency/identifier cases. The 45 cases include 10 reproduced false acceptances, 22 working refusals, 34 satisfied advertised properties and one unresolved composite scope; assertion success does not mean all advertised guard properties held. Four current source CLIs exited zero. Fourteen TypeScript AST parses and 171 separate Node ESM syntax checks establish syntax only. No application/fixture module import, actual SQL/DB/migration, native/provider/browser/network/build/install/production behavior or real-checkout staging. The conflict reader-denial case imports only a copied source-guard module. Original failures and negative controls are preserved; no source fix or runtime product acceptance.

## AUDIT-IDEMPOTENCY-INERT-FENCE-CREDIT-01

Severity: Medium. Status: open source-instrument gap.

Source: `scripts/check-idempotency.mjs:101-124`. Evidence: actual refined controls (`audit/checklist/evidence/coverage-ide-idempotency-identifier-controls-2026-10-09.json`, untracked); full selected source report (`audit/checklist/reviews/coverage-ecosystem-ide-idempotency-identifier-guards-2026-10-09-018.json`, untracked).

An enforcement file without a marker yields nine claims-no-key errors. Adding only a line comment containing on conflict makes all nine operation claims pass with identical inert alwaysRun code and a declared unique key. Every operation is allowed to point to the same source file. This demonstrates marker credit; it does not establish a deployed duplicate operation.

Acceptance target: Bind the declared operation and replay identity to an actual enforcement behavior, with comments and unrelated strings excluded.

Verification limits: Current unchanged source guard APIs and inert source fixtures only. TypeScript parser independently confirms selected import/export/callback fixtures are syntactically valid; fixture bodies never execute. SQL semantics use current official PostgreSQL documentation, no database is opened. Temporary Git initialization is confined to fixture roots. Three unchanged Node suites passed31/31,34 final controls passed,and all three current CLIs exited0. No app/browser/host UI/native/provider/database/build/production acceptance; no code fix.

October 9 money/usage/Work source qualification: A third direct reservation with randomUUID key rejects alongside both retained known unsafe anchors. Inserting comment idempotencyKey:stable before the actual random-key property makes objectPropertyValue extract the commented key and complete API/CLI pass all three calls. This extends the existing inert replay-identity credit owner; reservation bodies never execute.

Additional source: `scripts/check-usage-reservation-replay.mjs:133-161,270-290`. Acceptance target: Bind replay identity to the actual object property/expression and enforcement behavior; comments and unrelated literal declarations cannot establish a stable operation key. Current source report (`audit/checklist/reviews/coverage-ecosystem-money-usage-worktask-guards-2026-10-09-028.json`, untracked); complete independent controls (`audit/checklist/evidence/coverage-money-usage-worktask-independent-controls-2026-10-09-028-refined.json`, untracked). Unchanged complete source-instrument APIs and byte-identical CLI copies over isolated inert TypeScript/SQL text only.44 unchanged tests and35 final independent controls passed;62 TypeScript fixture parses establish syntax only. Four actual current source CLIs exited0. Two isolated literal arithmetic expressions execute in a VM; no application or fixture module imports, monetary writes, SQL, database, native host, provider, network, browser, build, installation, production action or real checkout staging occurs. Git used by unchanged tests is confined to scrubbed fixture roots. Initial11-control receipt preserves a failed CLI assertion: /tmp versus /private/tmp prevented the copied guard main from running. Final runner normalizes executable/cwd realpaths and asserts nonempty guard output. Source/tool/config files are unchanged; no current product incident or runtime acceptance is established.

October 9 Root033 current source qualification: Two independently recreated comment/string markers make inert alwaysRun owners pass, while missing marker/operation/owner/reason controls refuse.

Acceptance target: Bind actual enforcement to declared operation and replay identity, excluding unrelated comments/literals.

Evidence: current source report (`audit/checklist/reviews/coverage-ecosystem-neutral-idempotency-identifier-guards-2026-10-09-033.json`, untracked); actual controls (`audit/checklist/evidence/coverage-idempotency-identifier-independent-challenge-2026-10-09-033.json`, untracked). Current unchanged source instruments and inert text/Git fixtures only. Forty distinct unchanged tests passed (31 Node and 9 Python); the independent repeat of 20 Node tests is included in those 31, not added to the distinct total. Sixty-eight fixture controls/assertions succeeded: 16 IDE, 7 conflict-marker and 45 independent idempotency/identifier cases. The 45 cases include 10 reproduced false acceptances, 22 working refusals, 34 satisfied advertised properties and one unresolved composite scope; assertion success does not mean all advertised guard properties held. Four current source CLIs exited zero. Fourteen TypeScript AST parses and 171 separate Node ESM syntax checks establish syntax only. No application/fixture module import, actual SQL/DB/migration, native/provider/browser/network/build/install/production behavior or real-checkout staging. The conflict reader-denial case imports only a copied source-guard module. Original failures and negative controls are preserved; no source fix or runtime product acceptance.

## AUDIT-KEY-CONSTRAINT-HISTORY-01

Severity: Medium. Status: open source-instrument gap.

Source: `scripts/check-idempotency.mjs:48-87; scripts/check-identifier-discipline.mjs:30-65`. Evidence: actual refined controls (`audit/checklist/evidence/coverage-ide-idempotency-identifier-controls-2026-10-09.json`, untracked); full selected source report (`audit/checklist/reviews/coverage-ecosystem-ide-idempotency-identifier-guards-2026-10-09-018.json`, untracked).

An absent unique key is rejected, but creating then dropping its index or table constraint retains uniqueness and passes idempotency. Dropping an inline UUID primary key likewise leaves it inventoried and passes identifier discipline. Dropping that key and adding a primary key on email still reports the old UUID column and passes, whereas an inline email primary key fails. The migrations are inert text; applied database state is unknown. Existing concept, conversation and enterprise history issues have different canonical readers; this row combines these two current key owners.

Acceptance target: Derive effective ordered key identity and constraint lifecycle, rather than equating historical declarations with current uniqueness and identifier policy.

Verification limits: Current unchanged source guard APIs and inert source fixtures only. TypeScript parser independently confirms selected import/export/callback fixtures are syntactically valid; fixture bodies never execute. SQL semantics use current official PostgreSQL documentation, no database is opened. Temporary Git initialization is confined to fixture roots. Three unchanged Node suites passed31/31,34 final controls passed,and all three current CLIs exited0. No app/browser/host UI/native/provider/database/build/production acceptance; no code fix.

October 9 Root033 current source qualification: Four independent CREATE/drop or primary-key replacement histories retain old uniqueness/key identity and pass; dropping the dedup column is separately refused.

Acceptance target: Model effective ordered key and index/constraint lifecycle.

Evidence: current source report (`audit/checklist/reviews/coverage-ecosystem-neutral-idempotency-identifier-guards-2026-10-09-033.json`, untracked); actual controls (`audit/checklist/evidence/coverage-idempotency-identifier-independent-challenge-2026-10-09-033.json`, untracked). Current unchanged source instruments and inert text/Git fixtures only. Forty distinct unchanged tests passed (31 Node and 9 Python); the independent repeat of 20 Node tests is included in those 31, not added to the distinct total. Sixty-eight fixture controls/assertions succeeded: 16 IDE, 7 conflict-marker and 45 independent idempotency/identifier cases. The 45 cases include 10 reproduced false acceptances, 22 working refusals, 34 satisfied advertised properties and one unresolved composite scope; assertion success does not mean all advertised guard properties held. Four current source CLIs exited zero. Fourteen TypeScript AST parses and 171 separate Node ESM syntax checks establish syntax only. No application/fixture module import, actual SQL/DB/migration, native/provider/browser/network/build/install/production behavior or real-checkout staging. The conflict reader-denial case imports only a copied source-guard module. Original failures and negative controls are preserved; no source fix or runtime product acceptance.

## AUDIT-IDEMPOTENCY-PARTIAL-INDEX-CREDIT-01

Severity: Medium. Status: open source-instrument gap.

Source: `scripts/check-idempotency.mjs:62-65,164-173`. Evidence: actual refined controls (`audit/checklist/evidence/coverage-ide-idempotency-identifier-controls-2026-10-09.json`, untracked); full selected source report (`audit/checklist/reviews/coverage-ecosystem-ide-idempotency-identifier-guards-2026-10-09-018.json`, untracked).

A nonunique deduplication column is rejected, but CREATE UNIQUE INDEX on that column WHERE false is inventoried exactly as a full unique key and passes the complete fixture guard. Current PostgreSQL documents that a partial unique index constrains only rows satisfying its predicate; no row satisfies false. An organization-scoped composite primary key is intentionally accepted and is retained as counterevidence. Acceptance of a per-row composite is a separate scope observation, not proof that every composite key is defective.

Acceptance target: Retain index predicates and prove that the operation identity is covered; preserve legitimate organization-scoped composite constraints.

Verification limits: Current unchanged source guard APIs and inert source fixtures only. TypeScript parser independently confirms selected import/export/callback fixtures are syntactically valid; fixture bodies never execute. SQL semantics use current official PostgreSQL documentation, no database is opened. Temporary Git initialization is confined to fixture roots. Three unchanged Node suites passed31/31,34 final controls passed,and all three current CLIs exited0. No app/browser/host UI/native/provider/database/build/production acceptance; no code fix.

The SQL inference uses [current PostgreSQL partial-index documentation](https://www.postgresql.org/docs/current/indexes-partial.html), observed2026-10-09; applied database state remains unknown.

October 9 Root033 current source qualification: An isolated UNIQUE index WHERE false passes. Missing uniqueness refuses and legitimate organization-scoped composite passes. PostgreSQL documents uniqueness only among predicate-matching rows; the false-predicate conclusion is an inference over inert SQL, not an applied database observation.

Acceptance target: Retain predicates and prove operation-identity coverage; preserve legitimate scoped composites.

Evidence: current source report (`audit/checklist/reviews/coverage-ecosystem-neutral-idempotency-identifier-guards-2026-10-09-033.json`, untracked); actual controls (`audit/checklist/evidence/coverage-idempotency-identifier-independent-challenge-2026-10-09-033.json`, untracked). Current unchanged source instruments and inert text/Git fixtures only. Forty distinct unchanged tests passed (31 Node and 9 Python); the independent repeat of 20 Node tests is included in those 31, not added to the distinct total. Sixty-eight fixture controls/assertions succeeded: 16 IDE, 7 conflict-marker and 45 independent idempotency/identifier cases. The 45 cases include 10 reproduced false acceptances, 22 working refusals, 34 satisfied advertised properties and one unresolved composite scope; assertion success does not mean all advertised guard properties held. Four current source CLIs exited zero. Fourteen TypeScript AST parses and 171 separate Node ESM syntax checks establish syntax only. No application/fixture module import, actual SQL/DB/migration, native/provider/browser/network/build/install/production behavior or real-checkout staging. The conflict reader-denial case imports only a copied source-guard module. Original failures and negative controls are preserved; no source fix or runtime product acceptance.

## AUDIT-IDENTIFIER-NAMED-PRIMARY-KEY-01

Severity: Medium. Status: open source-instrument gap.

Source: `scripts/check-identifier-discipline.mjs:44-58`. Evidence: actual refined controls (`audit/checklist/evidence/coverage-ide-idempotency-identifier-controls-2026-10-09.json`, untracked); full selected source report (`audit/checklist/reviews/coverage-ecosystem-ide-idempotency-identifier-guards-2026-10-09-018.json`, untracked).

The inline email primary key is rejected. Naming the otherwise ordinary table-level primary-key constraint produces a single invented column named constraint and lets an email primary key pass. The same named syntax hides the serial declaration and passes without a sequential-key exemption. The current PostgreSQL constraint syntax permits a separate constraint name; no database or active production migration is exercised.

Acceptance target: Parse actual named table-constraint columns and their declarations before forbidden/sequential/client-generation policy checks.

Verification limits: Current unchanged source guard APIs and inert source fixtures only. TypeScript parser independently confirms selected import/export/callback fixtures are syntactically valid; fixture bodies never execute. SQL semantics use current official PostgreSQL documentation, no database is opened. Temporary Git initialization is confined to fixture roots. Three unchanged Node suites passed31/31,34 final controls passed,and all three current CLIs exited0. No app/browser/host UI/native/provider/database/build/production acceptance; no code fix.

The SQL syntax is qualified against [current PostgreSQL constraints](https://www.postgresql.org/docs/current/ddl-constraints.html), observed2026-10-09.

October 9 Root033 current source qualification: Named email and sequential primary keys become an invented constraint column and pass. Equivalent inline and unnamed keys refuse. Current official constraint syntax permits naming.

Acceptance target: Parse actual named table-constraint columns before policy checks.

Evidence: current source report (`audit/checklist/reviews/coverage-ecosystem-neutral-idempotency-identifier-guards-2026-10-09-033.json`, untracked); actual controls (`audit/checklist/evidence/coverage-idempotency-identifier-independent-challenge-2026-10-09-033.json`, untracked). Current unchanged source instruments and inert text/Git fixtures only. Forty distinct unchanged tests passed (31 Node and 9 Python); the independent repeat of 20 Node tests is included in those 31, not added to the distinct total. Sixty-eight fixture controls/assertions succeeded: 16 IDE, 7 conflict-marker and 45 independent idempotency/identifier cases. The 45 cases include 10 reproduced false acceptances, 22 working refusals, 34 satisfied advertised properties and one unresolved composite scope; assertion success does not mean all advertised guard properties held. Four current source CLIs exited zero. Fourteen TypeScript AST parses and 171 separate Node ESM syntax checks establish syntax only. No application/fixture module import, actual SQL/DB/migration, native/provider/browser/network/build/install/production behavior or real-checkout staging. The conflict reader-denial case imports only a copied source-guard module. Original failures and negative controls are preserved; no source fix or runtime product acceptance.

## AUDIT-IDENTIFIER-STRING-COMMENT-ERASURE-01

Severity: Medium. Status: open source-instrument gap.

Source: `scripts/check-identifier-discipline.mjs:72-74,92-98`. Evidence: actual refined controls (`audit/checklist/evidence/coverage-ide-idempotency-identifier-controls-2026-10-09.json`, untracked); full selected source report (`audit/checklist/reviews/coverage-ecosystem-ide-idempotency-identifier-guards-2026-10-09-018.json`, untracked).

An array-map callback deriving id from its index is detected. Keeping that identical callback between two separate string constants containing slash-star and star-slash hides it because raw block-comment stripping erases the intervening source. TypeScript independently parses both fixture variants without syntax diagnostics. Final refinement gives both examples a real callback-bound index; the first successful unbound fixture is retained in the receipt but no longer the premise.

Acceptance target: Exclude lexical comments while preserving actual source between delimiters inside strings or templates.

Verification limits: Current unchanged source guard APIs and inert source fixtures only. TypeScript parser independently confirms selected import/export/callback fixtures are syntactically valid; fixture bodies never execute. SQL semantics use current official PostgreSQL documentation, no database is opened. Temporary Git initialization is confined to fixture roots. Three unchanged Node suites passed31/31,34 final controls passed,and all three current CLIs exited0. No app/browser/host UI/native/provider/database/build/production acceptance; no code fix.

October 9 Root033 current source qualification: An actual indexed map callback refuses; the same callback between separate string comment delimiters passes. Both fixture texts pass syntax-only checks. True comment and stable-ID counterguards remain.

Acceptance target: Remove lexical comments while preserving source between delimiters inside literals.

Evidence: current source report (`audit/checklist/reviews/coverage-ecosystem-neutral-idempotency-identifier-guards-2026-10-09-033.json`, untracked); actual controls (`audit/checklist/evidence/coverage-idempotency-identifier-independent-challenge-2026-10-09-033.json`, untracked). Current unchanged source instruments and inert text/Git fixtures only. Forty distinct unchanged tests passed (31 Node and 9 Python); the independent repeat of 20 Node tests is included in those 31, not added to the distinct total. Sixty-eight fixture controls/assertions succeeded: 16 IDE, 7 conflict-marker and 45 independent idempotency/identifier cases. The 45 cases include 10 reproduced false acceptances, 22 working refusals, 34 satisfied advertised properties and one unresolved composite scope; assertion success does not mean all advertised guard properties held. Four current source CLIs exited zero. Fourteen TypeScript AST parses and 171 separate Node ESM syntax checks establish syntax only. No application/fixture module import, actual SQL/DB/migration, native/provider/browser/network/build/install/production behavior or real-checkout staging. The conflict reader-denial case imports only a copied source-guard module. Original failures and negative controls are preserved; no source fix or runtime product acceptance.

October 9 Root051 source qualification: Original complete guard refuses an unbaselined '#123456' literal, but passes that same literal after const url='https://example.invalid' on the same source line. Regex // stripping deletes the actual later color with the quoted URL tail. No source fixture is compiled or rendered. The existing canonical raw comment-erasure owner already requires preservation of source when comment delimiters occur inside strings/templates. Preserve the withdrawn producer ID as an alias; zero new unique cause. Source: `scripts/check-no-hex-colors-mobile.mjs:79-95`. Frozen reading report (`audit/checklist/reviews/coverage-surface-security-source-guards-2026-10-09-051.json`, untracked); independent premise review (`audit/checklist/evidence/coverage-surface-security-independent-challenge-2026-10-09-051.json`, untracked); actual source controls (`audit/checklist/evidence/coverage-surface-security-inert-controls-2026-10-09-051.json`, untracked). Acceptance target extension: Preserve quoted contents and actual code while removing comments, so a delimiter inside a string cannot conceal later color literals. Current source instrument and inert text/value controls only. No application/fixture compilation or execution, provider/network/browser/native/SQL/database/build/install/production or whole CI acceptance; no current product or security incident asserted. Original severity, evidence, acceptance and producer provenance retained; zero new unique cause.

## AUDIT-ACCOUNT-DOMINANCE-TEXT-CREDIT-01

Status: Open source-instrument gap. Severity: Medium. Owner: Platform / guard owner. First seen: 2026-10-09.

Account revocation guard credits unawaited, unreachable, wrong-principal and string-only gates. Source: `scripts/check-identity-account-revocation.mjs:49-56,103-117`.

A properly awaited fixture passes and removing gates fails. Complete guards also pass unawaited calls, if(false) calls, calls for another account and a string containing assertAccountActive(user). Text order and brace depth do not establish awaited execution or principal binding. Current api-auth.ts bounded production branches await the gate for their returned principal; no current account bypass is demonstrated.

Evidence: `coverage-identity-image-interaction-controls-2026-10-09.json` (`audit/checklist/evidence/coverage-identity-image-interaction-controls-2026-10-09.json`, untracked), cases `account-valid-awaited-gates, account-missing-gates-rejected, account-unawaited-gates-credited, account-false-conditional-gates-credited, account-wrong-principal-gates-credited, account-string-gates-credited`; full selected source reading in `coverage-ecosystem-identity-image-interaction-guards-2026-10-09-019` (`audit/checklist/reviews/coverage-ecosystem-identity-image-interaction-guards-2026-10-09-019.md`, untracked).

Required evidence: Bind awaited reachable account checks to the returned credential subject, while preserving rejection of missing and sibling-only gates.

Actual unchanged source guard APIs and isolated inert text fixtures only. TypeScript syntax parsing is independent of guard matching. Only a fixture account decision executes in an isolated VM; actual authentication/application source does not. SQL and Rust remain inert text, never applied or compiled. Five unchanged Node suites passed51/51,39 final controls passed,and five readonly current-source CLIs exited0. Two failed fixture baselines and their refinements remain preserved. No app/native/provider/database/network/browser/build/production acceptance and no source fix.

## AUDIT-ACCOUNT-STATUS-CASE-AS-DENIAL-01

Status: Open source-instrument gap. Severity: Medium. Owner: Platform / guard owner. First seen: 2026-10-09.

Account status guard treats a case label as an access denial. Source: `scripts/check-identity-account-revocation.mjs:180-222`.

Changing fixture suspended/deleted decisions to allowed:true preserves case labels and passes the complete guard. Isolated fixture VM decisions confirm both statuses allow access. A fully block-commented vocabulary is also credited. Current account-status.ts actually denies these states; current configuration deliberately allows active and deletion_scheduled so the latter retains its cancellation window.

Evidence: `coverage-identity-image-interaction-controls-2026-10-09.json` (`audit/checklist/evidence/coverage-identity-image-interaction-controls-2026-10-09.json`, untracked), cases `account-status-case-allow-credited, account-comment-vocabulary-credited, account-valid-awaited-gates`; full selected source reading in `coverage-ecosystem-identity-image-interaction-guards-2026-10-09-019` (`audit/checklist/reviews/coverage-ecosystem-identity-image-interaction-guards-2026-10-09-019.md`, untracked).

Required evidence: Verify actual denied decision outcomes and executable vocabulary rather than mere case-label presence; retain explicit allowed-state reasons.

Actual unchanged source guard APIs and isolated inert text fixtures only. TypeScript syntax parsing is independent of guard matching. Only a fixture account decision executes in an isolated VM; actual authentication/application source does not. SQL and Rust remain inert text, never applied or compiled. Five unchanged Node suites passed51/51,39 final controls passed,and five readonly current-source CLIs exited0. Two failed fixture baselines and their refinements remain preserved. No app/native/provider/database/network/browser/build/production acceptance and no source fix.

## AUDIT-ACCOUNT-RETURN-TYPE-BODY-01

Status: Open source-instrument gap. Severity: Medium. Owner: Platform / guard owner. First seen: 2026-10-09.

Account entry-point scanner mistakes an object return type for the function body. Source: `scripts/check-identity-account-revocation.mjs:60-85,139-157`.

For a syntactically valid typed getClerkAuthUser returning Promise<{userId:string}|null>, functionBody extracts the object type instead of the executable body. An independent TypeScript AST confirms the omitted real body has a credential verifier. With another properly gated recognized entry point present, the complete guard passes and does not check the ungated typed entry. A fixture with no recognized funnel remains fail closed; this requires the demonstrated second funnel.

Evidence: `coverage-identity-image-interaction-controls-2026-10-09.json` (`audit/checklist/evidence/coverage-identity-image-interaction-controls-2026-10-09.json`, untracked), cases `account-return-type-body-missed, account-missing-gates-rejected`; full selected source reading in `coverage-ecosystem-identity-image-interaction-guards-2026-10-09-019` (`audit/checklist/reviews/coverage-ecosystem-identity-image-interaction-guards-2026-10-09-019.md`, untracked).

Required evidence: Find executable function bodies after complete return annotations and check each credential-bearing entry independently.

Actual unchanged source guard APIs and isolated inert text fixtures only. TypeScript syntax parsing is independent of guard matching. Only a fixture account decision executes in an isolated VM; actual authentication/application source does not. SQL and Rust remain inert text, never applied or compiled. Five unchanged Node suites passed51/51,39 final controls passed,and five readonly current-source CLIs exited0. Two failed fixture baselines and their refinements remain preserved. No app/native/provider/database/network/browser/build/production acceptance and no source fix.

## AUDIT-IMAGE-STATE-RELATION-COMMENT-CREDIT-01

Status: Open source-instrument gap. Severity: Medium. Owner: Platform / guard owner. First seen: 2026-10-09.

Rechecked on main (3ccb6f6) on 2026-10-15: still present. Main also reads the shared contract's `IMAGE_JOB_STATUSES` array, by regex over raw text like the other declarations. Line numbers for `scripts/check-image-job-states.mjs` are main's.

Image state guard credits unrelated relations and commented schema/type declarations. Source: `scripts/check-image-job-states.mjs:41-77,79-115,122-130`.

A valid schema passes and absent status vocabulary fails. Replacing the table name with other_jobs while retaining image constraint-name text passes the complete guard. Fully block-commented SQL and commented TypeScript status unions also pass. Raw substring and declaration matching do not bind executable constraints to the intended relation. Current migration is substantive source, but no deployed schema is inspected.

Evidence: `coverage-identity-image-interaction-controls-2026-10-09.json` (`audit/checklist/evidence/coverage-identity-image-interaction-controls-2026-10-09.json`, untracked), cases `image-valid-schema, image-no-status-vocabulary-rejected, image-unrelated-table-credited, image-block-comment-schema-credited, image-commented-type-unions-credited`; full selected source reading in `coverage-ecosystem-identity-image-interaction-guards-2026-10-09-019` (`audit/checklist/reviews/coverage-ecosystem-identity-image-interaction-guards-2026-10-09-019.md`, untracked).

Required evidence: Bind live relation-specific CHECK declarations and executable TypeScript unions, excluding commented declarations and unrelated tables.

Actual unchanged source guard APIs and isolated inert text fixtures only. TypeScript syntax parsing is independent of guard matching. Only a fixture account decision executes in an isolated VM; actual authentication/application source does not. SQL and Rust remain inert text, never applied or compiled. Five unchanged Node suites passed51/51,39 final controls passed,and five readonly current-source CLIs exited0. Two failed fixture baselines and their refinements remain preserved. No app/native/provider/database/network/browser/build/production acceptance and no source fix.

## AUDIT-IMAGE-STATE-CONSTRAINT-HISTORY-01

Status: Open source-instrument gap. Severity: Medium. Owner: Platform / guard owner. First seen: 2026-10-09.

Rechecked on main (3ccb6f6) on 2026-10-15: still present. Main changed `scripts/check-image-job-states.mjs` after the 2026-09-27 copy this was found on without changing the cited logic; line numbers for it are main's.

Image state guard retains dropped status and terminal-shape constraints. Source: `scripts/check-image-job-states.mjs:57-113`.

A later fixture migration drops both status and terminal-shape CHECK constraints. Readers retain prior status/classification/terminal sets and the complete guard passes. This is a CHECK-constraint reader limitation, separate from existing primary/unique-key history findings. No actual database migration state or provider job outcome is claimed.

Evidence: `coverage-identity-image-interaction-controls-2026-10-09.json` (`audit/checklist/evidence/coverage-identity-image-interaction-controls-2026-10-09.json`, untracked), cases `image-valid-schema, image-dropped-constraints-retained`; full selected source reading in `coverage-ecosystem-identity-image-interaction-guards-2026-10-09-019` (`audit/checklist/reviews/coverage-ecosystem-identity-image-interaction-guards-2026-10-09-019.md`, untracked).

Required evidence: Fold ordered add/drop/replacement CHECK operations into final relation state before granting schema agreement.

Actual unchanged source guard APIs and isolated inert text fixtures only. TypeScript syntax parsing is independent of guard matching. Only a fixture account decision executes in an isolated VM; actual authentication/application source does not. SQL and Rust remain inert text, never applied or compiled. Five unchanged Node suites passed51/51,39 final controls passed,and five readonly current-source CLIs exited0. Two failed fixture baselines and their refinements remain preserved. No app/native/provider/database/network/browser/build/production acceptance and no source fix.

## AUDIT-IMAGE-ENDING-REFERENCE-CREDIT-01

Status: Open source-instrument gap. Severity: Medium. Owner: Platform / guard owner. First seen: 2026-10-09.

Image termination guard credits comments and unused imports as background execution. Source: `scripts/check-image-job-termination.mjs:67-68,98-112`.

A real fixture background reference passes and removing it fails. Comment-only transition names in background/drain files and an unused named import also pass the complete guard. Word occurrence is sufficient for claimed reachability without the submitting request; no actual background call or reconciliation execution is established by that evidence.

Evidence: `coverage-identity-image-interaction-controls-2026-10-09.json` (`audit/checklist/evidence/coverage-identity-image-interaction-controls-2026-10-09.json`, untracked), cases `termination-actual-background-reference, termination-absent-background-reference-rejected, termination-comment-only-readers-credited, termination-unused-import-credited`; full selected source reading in `coverage-ecosystem-identity-image-interaction-guards-2026-10-09-019` (`audit/checklist/reviews/coverage-ecosystem-identity-image-interaction-guards-2026-10-09-019.md`, untracked).

Required evidence: Distinguish executable calls/reachability from comments and imports and separately establish drain reconciliation.

Actual unchanged source guard APIs and isolated inert text fixtures only. TypeScript syntax parsing is independent of guard matching. Only a fixture account decision executes in an isolated VM; actual authentication/application source does not. SQL and Rust remain inert text, never applied or compiled. Five unchanged Node suites passed51/51,39 final controls passed,and five readonly current-source CLIs exited0. Two failed fixture baselines and their refinements remain preserved. No app/native/provider/database/network/browser/build/production acceptance and no source fix.

## AUDIT-IMAGE-TRANSITION-DECLARATION-BOUNDARY-01

Status: Open source-instrument gap. Severity: Medium. Owner: Platform / guard owner. First seen: 2026-10-09.

Image transition scanner misattributes private bodies and omits exported arrow endings. Source: `scripts/check-image-job-termination.mjs:52-64`.

A private SQL-ending body after an exported previous function is attributed to previous because slicing ends only at the next exported function. In a second syntactically parsed fixture the arrow cancel ending is reachable only from a route, but scanner lists only the ordinary complete function and the complete guard passes. Function declaration boundaries and supported ending forms are incomplete.

Evidence: `coverage-identity-image-interaction-controls-2026-10-09.json` (`audit/checklist/evidence/coverage-identity-image-interaction-controls-2026-10-09.json`, untracked), cases `termination-private-body-misattributed, termination-arrow-ending-omitted`; full selected source reading in `coverage-ecosystem-identity-image-interaction-guards-2026-10-09-019` (`audit/checklist/reviews/coverage-ecosystem-identity-image-interaction-guards-2026-10-09-019.md`, untracked).

Required evidence: Use balanced executable bodies and include actual exported arrow/function forms when enumerating ending transitions.

Actual unchanged source guard APIs and isolated inert text fixtures only. TypeScript syntax parsing is independent of guard matching. Only a fixture account decision executes in an isolated VM; actual authentication/application source does not. SQL and Rust remain inert text, never applied or compiled. Five unchanged Node suites passed51/51,39 final controls passed,and five readonly current-source CLIs exited0. Two failed fixture baselines and their refinements remain preserved. No app/native/provider/database/network/browser/build/production acceptance and no source fix.

## AUDIT-MODE-SOURCE-COMMENT-CREDIT-01

Status: Open source-instrument gap. Severity: Medium. Owner: Platform / guard owner. First seen: 2026-10-09.

Interaction mode guard accepts comment-only selectors, canonical bindings and request schemas. Source: `scripts/check-interaction-modes.mjs:78-114,152-155,182-185,201-222`.

Valid bindings pass and absent selector markers fail. Selector marker/label and interaction-modes.json binding present only in comments pass the complete guard. A block-commented request schema also supplies its expected field and passes. Raw substring/object-key extraction establishes text presence rather than selectable or requestable behavior.

Evidence: `coverage-identity-image-interaction-controls-2026-10-09.json` (`audit/checklist/evidence/coverage-identity-image-interaction-controls-2026-10-09.json`, untracked), cases `modes-valid-fixture, modes-missing-selector-marker-rejected, modes-comment-only-selector-contract-credited, modes-comment-only-schema-credited`; full selected source reading in `coverage-ecosystem-identity-image-interaction-guards-2026-10-09-019` (`audit/checklist/reviews/coverage-ecosystem-identity-image-interaction-guards-2026-10-09-019.md`, untracked).

Required evidence: Resolve executable bindings and request-field ownership while excluding comments; retain missing marker and field rejection.

Actual unchanged source guard APIs and isolated inert text fixtures only. TypeScript syntax parsing is independent of guard matching. Only a fixture account decision executes in an isolated VM; actual authentication/application source does not. SQL and Rust remain inert text, never applied or compiled. Five unchanged Node suites passed51/51,39 final controls passed,and five readonly current-source CLIs exited0. Two failed fixture baselines and their refinements remain preserved. No app/native/provider/database/network/browser/build/production acceptance and no source fix.

## AUDIT-MODE-FEATURE-VOCABULARY-FAIL-OPEN-01

Status: Open source-instrument gap. Severity: Low. Owner: Platform / guard owner. First seen: 2026-10-09.

Interaction mode feature checks skip missing or empty feature vocabulary. Source: `scripts/check-interaction-modes.mjs:175-181,240-242`.

A nonnull ghost feature is rejected against a populated registry. The same complete fixture passes when the feature registry is absent or its features object is empty, because membership checks require features.length>0. Other feature guards can independently reject a missing registry in the full chain, so this is the standalone mode instrument gap rather than a demonstrated whole-chain bypass.

Evidence: `coverage-identity-image-interaction-controls-2026-10-09.json` (`audit/checklist/evidence/coverage-identity-image-interaction-controls-2026-10-09.json`, untracked), cases `modes-unknown-feature-rejected, modes-missing-feature-registry-accepted, modes-empty-feature-registry-accepted`; full selected source reading in `coverage-ecosystem-identity-image-interaction-guards-2026-10-09-019` (`audit/checklist/reviews/coverage-ecosystem-identity-image-interaction-guards-2026-10-09-019.md`, untracked).

Required evidence: Refuse missing/empty mandatory feature vocabulary before validating nonnull mode features.

Actual unchanged source guard APIs and isolated inert text fixtures only. TypeScript syntax parsing is independent of guard matching. Only a fixture account decision executes in an isolated VM; actual authentication/application source does not. SQL and Rust remain inert text, never applied or compiled. Five unchanged Node suites passed51/51,39 final controls passed,and five readonly current-source CLIs exited0. Two failed fixture baselines and their refinements remain preserved. No app/native/provider/database/network/browser/build/production acceptance and no source fix.

## AUDIT-KILL-INERT-READER-CREDIT-01

Status: Open source-instrument gap. Severity: Medium. Owner: Platform / guard owner. First seen: 2026-10-09.

Kill switch guard credits comments and unused strings as readers and handshake wiring. Source: `scripts/check-kill-switch-readers.mjs:100-116,159-237`.

A fixture reader passes and removing it fails. Reader and both handshake markers appearing only in comments still pass with read=1. An unused capability.work string also grants reader credit. Text markers do not demonstrate an admission predicate or a serialized/consumed handshake path. No actual client enforcement defect is claimed.

Evidence: `coverage-identity-image-interaction-controls-2026-10-09.json` (`audit/checklist/evidence/coverage-identity-image-interaction-controls-2026-10-09.json`, untracked), cases `kill-valid-reader, kill-no-reader-rejected, kill-comment-only-reader-and-handshake-credited, kill-unused-key-string-credited`; full selected source reading in `coverage-ecosystem-identity-image-interaction-guards-2026-10-09-019` (`audit/checklist/reviews/coverage-ecosystem-identity-image-interaction-guards-2026-10-09-019.md`, untracked).

Required evidence: Trace actual consuming admission predicates and executable handshake publication/consumption; exclude comments and unused strings.

Actual unchanged source guard APIs and isolated inert text fixtures only. TypeScript syntax parsing is independent of guard matching. Only a fixture account decision executes in an isolated VM; actual authentication/application source does not. SQL and Rust remain inert text, never applied or compiled. Five unchanged Node suites passed51/51,39 final controls passed,and five readonly current-source CLIs exited0. Two failed fixture baselines and their refinements remain preserved. No app/native/provider/database/network/browser/build/production acceptance and no source fix.

## AUDIT-KILL-RUST-CALLER-IDENTITY-01

Status: Open source-instrument gap. Severity: Medium. Owner: Platform / guard owner. First seen: 2026-10-09.

Kill switch Rust caller scan credits unrelated modules and commented calls. Source: `scripts/check-kill-switch-readers.mjs:135-155`.

A gate::from_flags fixture call grants the expected reader credit; no external caller fails. An other::from_flags call and a commented gate::from_flags call both grant the original gate reader credit because only the function name and preceding separator are matched. Rust text is not compiled and actual caller/runtime enforcement remains unverified.

Evidence: `coverage-identity-image-interaction-controls-2026-10-09.json` (`audit/checklist/evidence/coverage-identity-image-interaction-controls-2026-10-09.json`, untracked), cases `kill-rust-no-external-caller-rejected, kill-rust-external-caller-credited, kill-rust-unrelated-caller-credited, kill-rust-comment-caller-credited`; full selected source reading in `coverage-ecosystem-identity-image-interaction-guards-2026-10-09-019` (`audit/checklist/reviews/coverage-ecosystem-identity-image-interaction-guards-2026-10-09-019.md`, untracked).

Required evidence: Bind executable calls to the reader module/function identity and reject commented or unrelated same-name calls.

Actual unchanged source guard APIs and isolated inert text fixtures only. TypeScript syntax parsing is independent of guard matching. Only a fixture account decision executes in an isolated VM; actual authentication/application source does not. SQL and Rust remain inert text, never applied or compiled. Five unchanged Node suites passed51/51,39 final controls passed,and five readonly current-source CLIs exited0. Two failed fixture baselines and their refinements remain preserved. No app/native/provider/database/network/browser/build/production acceptance and no source fix.

## AUDIT-KILL-RUST-TEST-TAIL-TRUNCATION-01

Status: Open source-instrument gap. Severity: Low. Owner: Platform / guard owner. First seen: 2026-10-09.

Kill switch Rust test stripping discards production code after the first test module. Source: `scripts/check-kill-switch-readers.mjs:74-77`.

withoutRustTests returns only the source prefix before the first cfg(test) module marker. An inert fixture with that module first and a production gate function later strips to an empty string and is reported unread despite an external caller. This demonstrates the source-transform false negative; the fixture is not Rust-compiled and no actual native admission failure is established.

Evidence: `coverage-identity-image-interaction-controls-2026-10-09.json` (`audit/checklist/evidence/coverage-identity-image-interaction-controls-2026-10-09.json`, untracked), cases `kill-rust-production-tail-truncated, kill-rust-external-caller-credited`; full selected source reading in `coverage-ecosystem-identity-image-interaction-guards-2026-10-09-019` (`audit/checklist/reviews/coverage-ecosystem-identity-image-interaction-guards-2026-10-09-019.md`, untracked).

Required evidence: Remove only balanced test-module bodies and preserve later production declarations, including multiple test modules.

Actual unchanged source guard APIs and isolated inert text fixtures only. TypeScript syntax parsing is independent of guard matching. Only a fixture account decision executes in an isolated VM; actual authentication/application source does not. SQL and Rust remain inert text, never applied or compiled. Five unchanged Node suites passed51/51,39 final controls passed,and five readonly current-source CLIs exited0. Two failed fixture baselines and their refinements remain preserved. No app/native/provider/database/network/browser/build/production acceptance and no source fix.

October9 endpoint-source qualification: The complete original endpoint CLI rejects an undeclared production host before a test module but accepts it after an earlier cfg(test) module or cfg(test) function, because any first matching attribute sets the scan end for the entire remaining file. This extends the existing first-test-marker tail truncation cause with zero new owner. Rust remains inert text and neither compiled nor executed; actual current production tail occurrences and caller/egress consequences remain unverified. Source: `scripts/check-no-hardcoded-endpoints.mjs:83-87,231-242`. Actual source report (`audit/checklist/reviews/coverage-model-endpoint-trust-guard-source-2026-10-09-049.json`, untracked); original endpoint gates (`audit/checklist/evidence/coverage-model-endpoint-current-source-gates-2026-10-09-049.json`, untracked); original11 observations (`audit/checklist/evidence/coverage-model-endpoint-inert-source-controls-2026-10-09-049.json`, untracked); two fresh unique-binding companions (`audit/checklist/evidence/coverage-model-endpoint-unique-binding-companions-2026-10-09-049.json`, untracked); independent premise challenge (`audit/checklist/evidence/coverage-model-endpoint-independent-challenge-2026-10-09-049.json`, untracked). Acceptance target extension: Remove only appropriately scoped test items or module bodies, preserving unrelated later production declarations and genuine host refusals; do not equate the first cfg(test) attribute with the entire remaining file. Ten original endpoint tests and the current endpoint CLI pass. Original11 observations remain7 counter shapes/4 conditional shapes; the repeated-binding growth fixture is raw physical counting only. Two fresh unique-binding companions repeat budget properties and add zero distinct properties. Fixture syntax/type/runtime validity remains unverified. Model/catalog and trust-boundary launchers are unexecuted. No application/fixture modules, native/provider/network/browser/SQL/database/compiler/build/install/production or full CI acceptance. Earlier hygiene/integrity/supply/security/RLS failures remain unresolved. Zero new cause.

## DESKTOP-TEST-MIRROR-COVERAGE-01

Status: Open, scoped source-qualified finding. Severity: Low. Owner: Desktop / test maintainers. First seen: 2026-10-09.

Desktop command and stream tests assert test-owned mocks or copied subjects. Source: `apps/desktop/src/__tests__/updater-interval.test.ts; windows-compat.test.ts`.

Changing the current UpdateChecker hydration/mounted/native-host effect or interval predicate does not affect the private shouldSkipCheck assertions. A direct Windows plugin remove/open test supplies a mock resolution, calls that mock itself and asserts the caller's own arguments; a production UI/native filesystem or shell regression is absent from its asserted path.

Scope: Current source-instrument limitation only; actual suite/runtime acceptance not established.

Counterevidence: Other cases import actual settings/updater/keyboard/terminal subjects and assert local state/helper/event/command mapping. Actual workflowStore actions and resulting state are asserted against native dependency mocks. Production transport/parser pagination/account/SSE/cancellation/dedup/error paths are meaningfully under assertion.

Required evidence: Exercise actual updater/component and production plugin consumers or accurately label fixture-only tests, preserving meaningful actual hook/store/parser assertions and native trust/permission refusal coverage.

Validation limits: Source-only current imports/control-flow/consumer comparison. No tests, coverage collection, module imports, source evaluation, timers, compiler/build, native/browser/provider/network/DB execution. No coverage percentage, test-pass or public runtime impact claim.

Current source reading and qualification: `coverage-desktop-renderer-source-2026-10-09-002` (`audit/checklist/reviews/coverage-desktop-renderer-source-2026-10-09-002.md`, untracked). Root accepted the bounded producer conclusion after exact current report/packet identities, ranges, EOF and substantive STRING summaries were independently checked. Desktop001 and Desktop002 preserve one identity and the meaningful imported-subject countercoverage. No source correction or actual HTTP/native/DB/application action occurred.

The existing Desktop001 identity is adopted once and extended by Desktop002 updater/windows evidence; imported production hooks/stores/parser tests remain countercoverage. This is neither a claim that all desktop tests are mirrors nor a measured production coverage percentage.

## NATIVE-API-DOWNLOAD-UNDO-NO-SNAPSHOT-01

Status: Open, scoped source-qualified finding. Severity: Medium. Owner: Desktop / retained native owner. First seen: 2026-10-09.

API downloads advertise reversible changes that the undo dispatcher cannot restore. Source: `apps/desktop/src-tauri/src/core/llm/tool_executor/api_tools.rs:125-180`.

An admitted download writes an allowed existing report.txt or new file through fs::write, then records record_tool_executed_with_path(before_content=None,after_content=None,reversible=true). That helper always marks FileModified. Selecting undo dispatches undo_file_modified, whose before_content check returns 'No before content stored for this change'; neither restore nor FileCreated deletion occurs. Existing file bytes were not preserved by this download path.

Scope: Conditional retained internal Tauri source mismatch after existing mode/capability/path/public-destination admission; actual native effects and public Electron applicability unknown.

Counterevidence: Common capabilities, ToolGuard, agent mode, folder/protected-path and PublicHttpClient guards remain; Safe/Plan refuse nonallowlisted api_download and missing safety state fails closed. Download rejects HTTP failure and reports disk-write failure; no receipt is made before successful write. Default api_download tier is Medium notification rather than per-action confirmation, but existing remembered denial/folder permission can prevent dispatch. No native configuration or interaction was executed. FileCreated undo deletion is a different branch and is not selected by this receipt; no deletion of an original was claimed.

Required evidence: A current download path that records correct creation versus modification, preserves prior bytes for overwrites and supplies an undoable receipt, or a verified caller contract proving this action cannot be offered/admitted, removes this condition.

Validation limits: not-run: current source/control-flow/contracts only; no Rust/native/app/browser/provider/network/DB/build/test/install action. Source-supported retained internal Tauri condition, not product/public Electron acceptance or observed side effect.

Current source reading and qualification: `coverage-retained-native-source-2026-10-09-022` (`audit/checklist/reviews/coverage-retained-native-source-2026-10-09-022.md`, untracked). Root accepted the bounded producer conclusion after exact current report/packet identities, ranges, EOF and substantive STRING summaries were independently checked. Download undo reports missing before content; it does not enter FileCreated deletion or establish deletion of originals. No source correction or actual HTTP/native/DB/application action occurred.

## NATIVE-API-CALL-CONTRACT-NARROWING-01

Status: Open, scoped source-qualified finding. Severity: Medium. Owner: Desktop / retained native owner. First seen: 2026-10-09.

Generic API tool narrows its registered body, method and option contract. Source: `apps/desktop/src-tauri/src/core/llm/tool_executor/api_tools.rs:12-48`.

A permitted POST with body:{"name":"example"} follows the registered Object parameter but becomes ApiRequest.body=None because handler only accepts Value::as_str. A permitted method HEAD or OPTIONS is mapped to HttpMethod::Get, while result metadata still echoes the requested method. If the model supplies advertised query_params/auth/timeout_ms, the normal current ToolGuard rejects those parameter names before dispatch; the handler separately constructs empty query params/AuthType::None/fixed30s. Thus these fields are rejected rather than silently applied, and optional object bodies/methods are silently narrowed.

Scope: Conditional retained internal Tauri source mismatch after existing mode/capability/path/public-destination admission; actual native effects and public Electron applicability unknown.

Counterevidence: API call requires user confirmation by default and agent mode/capability/public-destination checks remain. Manual headers and string body can still be represented by the handler; supported GET/POST/PUT/PATCH/DELETE cases avoid method fallback. ApiState execute_public_request reaches the public client; downstream HttpMethod itself supports Head/Options, so this is not an unsupported downstream enum assertion. Guard rejects unallowed option keys; it does not permit arbitrary auth/query/timeout options through the mounted route. This limits the original dropped-options lead.

Required evidence: One canonical registered schema/policy/handler agreement that preserves supported JSON/string bodies, explicit HttpMethod variants and allowed options, or removes those declarations with accurate visible semantics, removes the mismatch.

Validation limits: not-run: current source/control-flow/contracts only; no Rust/native/app/browser/provider/network/DB/build/test/install action. Source-supported retained internal Tauri condition, not product/public Electron acceptance or observed side effect.

Current source reading and qualification: `coverage-retained-native-source-2026-10-09-022` (`audit/checklist/reviews/coverage-retained-native-source-2026-10-09-022.md`, untracked). Root accepted the bounded producer conclusion after exact current report/packet identities, ranges, EOF and substantive STRING summaries were independently checked. Generic API options are rejected by the normal guard; admitted object bodies and HEAD/OPTIONS are narrowed by the handler. No source correction or actual HTTP/native/DB/application action occurred.

## AUDIT-LEGAL-HOLD-SAME-TABLE-OVERWRITE-01

Status: Open source-instrument gap. Severity: Medium. Owner: Platform / legal-hold guard owner. First seen:2026-10-09.

Legal hold scanner lets a later gated delete hide an earlier ungated delete. Source: `scripts/check-legal-hold-coverage.mjs:180-188,204-207`.

One ungated delete is rejected and one predicate-bearing delete is credited. In the complete isolated guard, an ungated delete followed by a gated delete of web_conversations yields no errors or unguarded sites; reversing their order yields one unguarded site. The destroyed Map overwrites the earlier entry for the table. Both statements are syntactically parsed and present, but only the last statement supplies gating credit. No actual SQL/delete/hold race is executed.

Evidence: `coverage-ledger-legal-hold-controls-2026-10-09.json` (`audit/checklist/evidence/coverage-ledger-legal-hold-controls-2026-10-09.json`, untracked), cases `one-ungated-delete-rejected, one-in-statement-predicate-credited, ungated-before-gated-same-table-hidden, gated-before-ungated-same-table-rejected`. Selected source reading: `coverage-ecosystem-ledger-legal-hold-guards-2026-10-09-020` (`audit/checklist/reviews/coverage-ecosystem-ledger-legal-hold-guards-2026-10-09-020.md`, untracked).

Required evidence: Preserve every destructive statement, or aggregate same-table results so any ungated statement remains an open site regardless of order.

Current unchanged source guard APIs and parsed inert TypeScript fixtures only. Contract/gate/baseline/migration bytes copied into fresh temporary roots establish guard inputs, never semantic reading or product behavior. No application module executes, no SQL is applied and no native/provider/database/network/browser/build action occurs.29 unchanged textual guard tests and8 isolated controls passed;2 readonly current-source CLIs exited0. Source remains unchanged.

## AUDIT-LEGAL-HOLD-INERT-GATE-CREDIT-01

Status: Open source-instrument gap. Severity: Medium. Owner: Platform / legal-hold guard owner. First seen:2026-10-09.

Legal hold scanner credits unused refusal strings, unreachable calls and fake exclusion predicates. Source: `scripts/check-legal-hold-coverage.mjs:25,176-188`.

The complete isolated guard rejects a bare ungated delete. Adding an unused isSubjectUnderLegalHold string or a call inside if(false) credits the whole module and clears unguarded sites. A fakeExclusion object with sql:true text interpolated in the delete also passes by its variable name. Comment-only refusal is correctly excluded, limiting the conclusion: this is executable-looking text/identifier credit rather than general comment credit. Current gate/source copies preserve known contract checks; no product hold enforcement failure is inferred.

Evidence: `coverage-ledger-legal-hold-controls-2026-10-09.json` (`audit/checklist/evidence/coverage-ledger-legal-hold-controls-2026-10-09.json`, untracked), cases `one-ungated-delete-rejected, unused-refusal-string-credited, unreachable-refusal-call-credited, fake-exclusion-true-credited, comment-only-refusal-not-credited`. Selected source reading: `coverage-ecosystem-ledger-legal-hold-guards-2026-10-09-020` (`audit/checklist/reviews/coverage-ecosystem-ledger-legal-hold-guards-2026-10-09-020.md`, untracked).

Required evidence: Bind reachable awaited refusal outcomes or genuine hold predicates to each destructive statement and reject unused, unreachable or unrelated same-name markers.

Current unchanged source guard APIs and parsed inert TypeScript fixtures only. Contract/gate/baseline/migration bytes copied into fresh temporary roots establish guard inputs, never semantic reading or product behavior. No application module executes, no SQL is applied and no native/provider/database/network/browser/build action occurs.29 unchanged textual guard tests and8 isolated controls passed;2 readonly current-source CLIs exited0. Source remains unchanged.

## AUDIT-LIFECYCLE-READ-MARKER-TEXT-CREDIT-01

Status: Open, scoped source-instrument finding. Severity: Medium. Owner: Ecosystem / source guard. First seen: 2026-10-09.

Lifecycle read guard accepts qualified projections and SQL data as withdrawal filtering. Source: `scripts/check-lifecycle-semantics.mjs:566-571,602-608`.

The complete guard rejects an aliased read without a marker and an unqualified SELECT marker projection, and accepts a real predicate. It also accepts SELECT c.deleted_at without a WHERE predicate, a SQL data string c.deleted_at, and a SQL data string containing a declared helper symbol without any helper call. markerSatisfied checks qualified-token presence anywhere; the helper path checks a substring anywhere in the statement. This proves source-gate false credit, not execution or actual withdrawn-row disclosure.

Acceptance target: Distinguish SQL predicates/helper invocation from projection/data text and reject these complete-fixture cases while retaining correctly filtered and documented exemption controls.

Validation and limits: Current unchanged source-instrument APIs over syntactically parsed inert fixtures only. Thirty unchanged tests and twenty-one independent complete-guard controls passed; two sandboxed literal-template computations execute no application code, SQL or I/O. The current source CLI exits1 with three unrecorded file/table reads, retained as instrument output rather than promoted product defects. No source/config/tool/application/native/provider/database/network/browser/build edit or run; copied fixture inputs and metadata supply no semantic reading credit.

Full-file review (`audit/checklist/reviews/coverage-ecosystem-lifecycle-semantics-guards-2026-10-09-021.json`, untracked); independent controls (`audit/checklist/evidence/coverage-lifecycle-semantics-independent-controls-2026-10-09-021.json`, untracked).

## AUDIT-LIFECYCLE-FRAGMENT-SCOPE-CREDIT-01

Status: Open, scoped source-instrument finding. Severity: Medium. Owner: Ecosystem / source guard. First seen: 2026-10-09.

Lifecycle template expansion credits predicates from unselected branches and unrelated scopes. Source: `scripts/check-lifecycle-semantics.mjs:332-344,453-474`.

Both a true ternary selecting SQL true instead of active and an unrelated nested function declaring active=deleted_at is null make the complete guard accept an unaliased read. Two isolated literal computations independently produce select id from web_conversations where true. literalBindings stores one global value per name and renderExpression appends every referenced identifier binding without branch or scope identity. The unconditional/conditional list-push distinction remains a real rejecting counterguard.

Acceptance target: Bind fragments to their lexical declaration and conservatively retain every possible statement branch; no predicate from an unselected branch or unrelated scope may discharge the current statement.

Validation and limits: Current unchanged source-instrument APIs over syntactically parsed inert fixtures only. Thirty unchanged tests and twenty-one independent complete-guard controls passed; two sandboxed literal-template computations execute no application code, SQL or I/O. The current source CLI exits1 with three unrecorded file/table reads, retained as instrument output rather than promoted product defects. No source/config/tool/application/native/provider/database/network/browser/build edit or run; copied fixture inputs and metadata supply no semantic reading credit.

Full-file review (`audit/checklist/reviews/coverage-ecosystem-lifecycle-semantics-guards-2026-10-09-021.json`, untracked); independent controls (`audit/checklist/evidence/coverage-lifecycle-semantics-independent-controls-2026-10-09-021.json`, untracked).

## AUDIT-LIFECYCLE-INERT-MUTATION-CREDIT-01

Status: Open, scoped source-instrument finding. Severity: Medium. Owner: Ecosystem / source guard. First seen: 2026-10-09.

Lifecycle recovery sharing and erasure owners receive credit from inert text. Source: `scripts/check-lifecycle-semantics.mjs:701-707,723-729,785-797,871-886`.

The complete guard rejects owners missing required marker/table text. An unused deleted_at string satisfies restore ownership, a comment containing delete from web_conversations satisfies purge, an unused published_artifacts string satisfies revocation, and an unused retrieval_documents string supplies a hard-delete root and derived embedding cascade credit. None of those replacement fixture owners contains the required SQL mutation. This groups related textual owner-credit conditions without claiming any actual product mutation failure.

Acceptance target: Establish a reachable relevant mutation/declared executable writer at each owner; comments and unused table/column strings must not confer restore, purge, revocation or cascading erasure credit.

Validation and limits: Current unchanged source-instrument APIs over syntactically parsed inert fixtures only. Thirty unchanged tests and twenty-one independent complete-guard controls passed; two sandboxed literal-template computations execute no application code, SQL or I/O. The current source CLI exits1 with three unrecorded file/table reads, retained as instrument output rather than promoted product defects. No source/config/tool/application/native/provider/database/network/browser/build edit or run; copied fixture inputs and metadata supply no semantic reading credit.

Full-file review (`audit/checklist/reviews/coverage-ecosystem-lifecycle-semantics-guards-2026-10-09-021.json`, untracked); independent controls (`audit/checklist/evidence/coverage-lifecycle-semantics-independent-controls-2026-10-09-021.json`, untracked).

## AUDIT-LIFECYCLE-RETAINED-CASCADE-MISS-01

Status: Open, scoped source-instrument finding. Severity: Medium. Owner: Ecosystem / source guard. First seen: 2026-10-09.

Lifecycle retained-store check ignores erasure that reaches a child by cascade. Source: `scripts/check-lifecycle-semantics.mjs:955-973`.

A syntactically valid fixture schema declares retrieval_chunks.document_id referencing retrieval_documents ON DELETE CASCADE and marks retrieval_chunks retained. The complete guard rejects direct DELETE FROM retrieval_chunks, but accepts DELETE FROM retrieval_documents from the same declared owner. checkHardDelete computes reached=cascadeClosure yet checks only cleared.has(table) for retained stores. The source-level retained obligation therefore omits a schema-derived destructive path; no database cascade executes.

Acceptance target: Apply retained-store protection to all erasure-reached members, including cascades; retain direct-delete rejection and nonretained cascade coverage.

Validation and limits: Current unchanged source-instrument APIs over syntactically parsed inert fixtures only. Thirty unchanged tests and twenty-one independent complete-guard controls passed; two sandboxed literal-template computations execute no application code, SQL or I/O. The current source CLI exits1 with three unrecorded file/table reads, retained as instrument output rather than promoted product defects. No source/config/tool/application/native/provider/database/network/browser/build edit or run; copied fixture inputs and metadata supply no semantic reading credit.

Full-file review (`audit/checklist/reviews/coverage-ecosystem-lifecycle-semantics-guards-2026-10-09-021.json`, untracked); independent controls (`audit/checklist/evidence/coverage-lifecycle-semantics-independent-controls-2026-10-09-021.json`, untracked).

## AUDIT-SCHEDULE-CLOCK-IMPORT-CLOSURE-01

Status: Open, scoped source-instrument finding. Severity: Medium. Owner: Ecosystem / source guard. First seen: 2026-10-09.

Schedule clock guard omits an explicitly imported TypeScript child. Source: `scripts/check-schedule-clock-injection.mjs:24-35,47-50`.

The complete guard rejects Date.now() in an extensionless child import, but accepts the same child when the root imports ./clock.ts. The root and child pass TypeScript module resolution/typechecking with allowImportingTsExtensions and noEmit. resolveImport appends .ts/.tsx/index.ts to a path already naming the existing file and returns null; the closure contains only the root and missing dependency resolution produces no error. This is a controlled source-closure gap, not evidence that a current schedule uses ambient time.

Acceptance target: Resolve a directly named existing supported source file and fail closed on unresolved in-scope relative imports; preserve extensionless/two-hop and missing-root rejecting controls.

Validation and limits: Unchanged source guard APIs/CLIs over independently constructed inert TypeScript source text. Twenty-four unchanged tests and twenty-two independent controls pass; 33 fixture syntax parses and four schedule type/module-resolution checks execute no fixture/app modules or clocks. Two current readonly source CLIs pass. Lock/build home-path CLI was not invoked. No crypto, DB/SQL, schedule/job, native/provider/network/browser/build/application execution or source/config/tool edits. Instrument scans, copied fixtures and metadata give no additional source EOF credit.

Full-file review (`audit/checklist/reviews/coverage-ecosystem-build-schedule-security-key-guards-2026-10-09-022.json`, untracked); independent controls (`audit/checklist/evidence/coverage-build-schedule-security-key-controls-2026-10-09-022.json`, untracked).

## AUDIT-SCHEDULE-CLOCK-LEXICAL-SCAN-01

Status: Open, scoped source-instrument finding. Severity: Medium. Owner: Ecosystem / source guard. First seen: 2026-10-09.

Schedule clock lexical matcher misses valid calls and rejects inert text. Source: `scripts/check-schedule-clock-injection.mjs:21-22,70-77`.

The complete guard rejects direct Date.now() and accepts an injected clock value. It also accepts `Date['now']()`, `Date . now()`, and `Date.now /* preserved syntax */ ()`, each of which passes TypeScript typechecking. Conversely, a comment or string containing Date.now() makes the guard fail without any executable ambient call. The raw regular expression neither resolves supported member/call syntax nor excludes comments/data. No ambient clock or application module was executed.

Acceptance target: Inspect executable ambient clock operations through lexical/syntax identity and exclude inert text; cover alternate valid member syntax and preserve explicit injected-time acceptance.

Validation and limits: Unchanged source guard APIs/CLIs over independently constructed inert TypeScript source text. Twenty-four unchanged tests and twenty-two independent controls pass; 33 fixture syntax parses and four schedule type/module-resolution checks execute no fixture/app modules or clocks. Two current readonly source CLIs pass. Lock/build home-path CLI was not invoked. No crypto, DB/SQL, schedule/job, native/provider/network/browser/build/application execution or source/config/tool edits. Instrument scans, copied fixtures and metadata give no additional source EOF credit.

Full-file review (`audit/checklist/reviews/coverage-ecosystem-build-schedule-security-key-guards-2026-10-09-022.json`, untracked); independent controls (`audit/checklist/evidence/coverage-build-schedule-security-key-controls-2026-10-09-022.json`, untracked).

## AUDIT-SECURITY-KEY-INERT-CALLER-CREDIT-01

Status: Open, scoped source-instrument finding. Severity: Medium. Owner: Ecosystem / source guard. First seen: 2026-10-09.

Rechecked on main (3ccb6f6) on 2026-10-15: still present. Main changed `scripts/check-org-permissions.mjs` after the 2026-09-27 copy this was found on without changing the cited logic; line numbers for it are main's.

Key lifecycle reachability credits comments strings and unused imports. Source: `scripts/check-security-key-lifecycle.mjs:225-229`.

The complete CLI rejects an uncalled crypto lifecycle export and ignores an own-test reference, and accepts an actual foreign caller. A foreign production comment, data string or unused import containing the export name also changes the complete CLI to exit0 without any lifecycle invocation. called scans a word-boundary symbol anywhere in each other production file. The existing maintenance-script import test documents reference-level coverage, but cannot establish callable/reachable lifecycle execution.

Acceptance target: Require a resolved executable caller/reference that makes the specific lifecycle action reachable; comments/data/unused imports must not discharge it, while genuine maintenance callers and scoped exceptions retain coverage.

Validation and limits: Unchanged source guard APIs/CLIs over independently constructed inert TypeScript source text. Twenty-four unchanged tests and twenty-two independent controls pass; 33 fixture syntax parses and four schedule type/module-resolution checks execute no fixture/app modules or clocks. Two current readonly source CLIs pass. Lock/build home-path CLI was not invoked. No crypto, DB/SQL, schedule/job, native/provider/network/browser/build/application execution or source/config/tool edits. Instrument scans, copied fixtures and metadata give no additional source EOF credit.

Full-file review (`audit/checklist/reviews/coverage-ecosystem-build-schedule-security-key-guards-2026-10-09-022.json`, untracked); independent controls (`audit/checklist/evidence/coverage-build-schedule-security-key-controls-2026-10-09-022.json`, untracked).

October 9 organization/pagination/tier source qualification: Complete CLI rejects an unchecked mutation but accepts a named permission terminal referenced only as void requireMemberPermission within PUT. A separately evaluated literal synthetic function with injected counter records0calls; service terminal definitions remain valid. This extends the existing reference-as-execution owner with AST identifier graph credit rather than duplicating it.

Additional source: `scripts/check-org-permissions.mjs:259-266,325-335,351-379`. Acceptance target: Require a resolved executable call or effect-bearing reference that establishes the relevant action on its path; inert function references do not establish a permission check. Current source report (`audit/checklist/reviews/coverage-ecosystem-org-pagination-tier-guards-2026-10-09-029.json`, untracked); complete independent controls (`audit/checklist/evidence/coverage-org-pagination-tier-independent-controls-2026-10-09-029.json`, untracked). Unchanged complete source guard APIs/CLIs and isolated inert TypeScript/TSX/SQL/Git fixtures only.37 unchanged Node tests and31 independent controls passed;220 fixture syntax parses establish syntax only. Four current source CLIs exited0. Literal fixtures extracted via actual TypeScript AST values, copied role CLI byte identity and nonempty complete CLI output are independently asserted; organization fixtures run fresh subprocesses to avoid graph-cache cross-case state. One literal synthetic function with an injected counter executes in a VM and proves zero terminal calls. No application/fixture module imports, actual authorization/mutation, SQL/database, native host, provider, network, browser, React mount, build, install, production action or real checkout staging. Git init/census and unchanged tests bind throwaway roots with inherited GIT variables scrubbed. Source/tool/config files remain unchanged; no deployed incident or runtime acceptance is established.

## AUDIT-SECURITY-KEY-EXPORT-OMISSION-01

Status: Open, scoped source-instrument finding. Severity: Medium. Owner: Ecosystem / source guard. First seen: 2026-10-09.

Key lifecycle enumeration misses valid export-list default and indented exports. Source: `scripts/check-security-key-lifecycle.mjs:71,104-111,221-223`.

A directly exported uncalled rotateWorkspaceKey in a crypto module makes the complete CLI fail. The same uncalled operation exported through export {rotateWorkspaceKey}, an indented export function, or export default function passes with zero enumerated lifecycle operations. Every source form passes TypeScript syntax parsing. The anchored /^export ... (function|const)/ scanner does not enumerate those valid declarations. No missing current product key operation is asserted.

Acceptance target: Enumerate supported exported lifecycle bindings by syntax/export resolution, including export lists/defaults/leading whitespace, and retain verb/key-material/nonproduction classification controls.

Validation and limits: Unchanged source guard APIs/CLIs over independently constructed inert TypeScript source text. Twenty-four unchanged tests and twenty-two independent controls pass; 33 fixture syntax parses and four schedule type/module-resolution checks execute no fixture/app modules or clocks. Two current readonly source CLIs pass. Lock/build home-path CLI was not invoked. No crypto, DB/SQL, schedule/job, native/provider/network/browser/build/application execution or source/config/tool edits. Instrument scans, copied fixtures and metadata give no additional source EOF credit.

Full-file review (`audit/checklist/reviews/coverage-ecosystem-build-schedule-security-key-guards-2026-10-09-022.json`, untracked); independent controls (`audit/checklist/evidence/coverage-build-schedule-security-key-controls-2026-10-09-022.json`, untracked).

## AUDIT-SECURITY-KEY-STORE-MARKER-CREDIT-01

Status: Open, scoped source-instrument finding. Severity: Medium. Owner: Ecosystem / source guard. First seen: 2026-10-09.

Sealed-store registry credit requires marker text without the corresponding writer. Source: `scripts/check-security-key-lifecycle.mjs:169-179,258-267`.

The complete CLI rejects an unregistered workspace-sealing module and rejects registry table/column/context markers absent from its source. Appending only a comment or unused string containing those three declared markers makes the complete CLI pass, while the fixture function performs no database table/column write or matching context use. workspaceSealFailures accepts source.includes(literal), conferring consistency credit on inert text. This proves an instrument gap; no cryptographic store or key retirement executes.

Acceptance target: Tie each registry field to the actual sealing/writer/context use in its declared module; inert comments/data must not satisfy the coverage proof, with missing/stale registry entries still rejected.

Validation and limits: Unchanged source guard APIs/CLIs over independently constructed inert TypeScript source text. Twenty-four unchanged tests and twenty-two independent controls pass; 33 fixture syntax parses and four schedule type/module-resolution checks execute no fixture/app modules or clocks. Two current readonly source CLIs pass. Lock/build home-path CLI was not invoked. No crypto, DB/SQL, schedule/job, native/provider/network/browser/build/application execution or source/config/tool edits. Instrument scans, copied fixtures and metadata give no additional source EOF credit.

Full-file review (`audit/checklist/reviews/coverage-ecosystem-build-schedule-security-key-guards-2026-10-09-022.json`, untracked); independent controls (`audit/checklist/evidence/coverage-build-schedule-security-key-controls-2026-10-09-022.json`, untracked).

## AUDIT-FAILURE-SKIP-LEXICAL-CREDIT-01

Status: Open, scoped source-instrument finding. Severity: Medium. Owner: Ecosystem / source guard. First seen: 2026-10-09.

Rechecked on main (3ccb6f6) on 2026-10-15: still present. Main changed `scripts/check-llm-failure-guardrails.mjs` after the 2026-09-27 copy this was found on without changing the cited logic; line numbers for it are main's.

Failure guard skip accounting confuses physical lines and inert annotation text. Source: `scripts/check-llm-failure-guardrails.mjs:170-186,213-232`.

The complete default guard rejects an undeclared test.skip and accepts a real nearby allow comment. Prefixing the executable skip with a closed block comment makes census omit it; an inert string or interior block-comment line containing test.skip creates a false debt site. A nearby unused string containing llm-guardrail-allow: justifies a real skip without a comment directive. isCommentLine classifies the entire physical line and annotation search checks unrestricted text. No application test is executed.

Acceptance target: Classify executable skip sites and actual comment directives with lexical context; closed comment prefixes must not hide following code, and inert strings/block comments must not create skip debt or justification.

Validation and limits: Current unchanged source guards and fully read pure scanner/field-policy APIs only.32 unchanged tests and27 independent complete-guard controls pass;66 fixture syntax parses and3 inert literal expression computations use synthetic values. Git init/add only in disposable fixtures. On the 2026-09-27 copy the failure CLI exited 1 with 77 records under 7 nested checkouts, which main's `git ls-files` inventory no longer reads; both log CLIs exited 0, retaining Node module-type warnings. No real logger/skip/test/credential, app entrypoint, native/provider/database/network/browser/build effects or source/config/tool edits. Instrument scans, copied source and metadata grant no additional semantic EOF credit.

Full-file review (`audit/checklist/reviews/coverage-ecosystem-llm-error-log-guards-2026-10-09-023.json`, untracked); independent controls (`audit/checklist/evidence/coverage-llm-error-log-independent-controls-2026-10-09-023.json`, untracked).

October9 endpoint-source qualification: The complete original endpoint CLI with all original21budget entries retained rejects a direct undeclared host literal but accepts that same declaration after a closed leading block comment on the physical line. It also counts a host inside a non-star-prefixed block-comment interior as an undeclared production literal, while the star-prefixed and single-line comment companions pass. This extends the existing physical-line/comment lexical-ownership cause, preserving its skip/directive observations rather than creating a duplicate endpoint ID. No actual outbound endpoint, current host leak, production bypass or provider request is established. Source: `scripts/check-no-hardcoded-endpoints.mjs:73-80,231-242`. Actual source report (`audit/checklist/reviews/coverage-model-endpoint-trust-guard-source-2026-10-09-049.json`, untracked); original endpoint gates (`audit/checklist/evidence/coverage-model-endpoint-current-source-gates-2026-10-09-049.json`, untracked); original11 observations (`audit/checklist/evidence/coverage-model-endpoint-inert-source-controls-2026-10-09-049.json`, untracked); two fresh unique-binding companions (`audit/checklist/evidence/coverage-model-endpoint-unique-binding-companions-2026-10-09-049.json`, untracked); independent premise challenge (`audit/checklist/evidence/coverage-model-endpoint-independent-challenge-2026-10-09-049.json`, untracked). Acceptance target extension: Treat comment ownership with lexical scope at host and skip census sites, preserving following executable source after closed comment prefixes while excluding actual block-comment interiors and retaining genuine undeclared/over-budget/stale refusals. Ten original endpoint tests and the current endpoint CLI pass. Original11 observations remain7 counter shapes/4 conditional shapes; the repeated-binding growth fixture is raw physical counting only. Two fresh unique-binding companions repeat budget properties and add zero distinct properties. Fixture syntax/type/runtime validity remains unverified. Model/catalog and trust-boundary launchers are unexecuted. No application/fixture modules, native/provider/network/browser/SQL/database/compiler/build/install/production or full CI acceptance. Earlier hygiene/integrity/supply/security/RLS failures remain unresolved. Zero new cause.

## AUDIT-FAILURE-GIT-PATH-OMISSION-01

Status: Open, scoped source-instrument finding. Severity: Medium. Owner: Ecosystem / source guard. First seen: 2026-10-09.

Rechecked on main (3ccb6f6) on 2026-10-15: still present, and wider. Main's 92b90108f9 replaced the whole-tree walk with the same newline-split `git ls-files` listing, so quoted names now drop from whole-tree scans as well as staged and changed ones. Line numbers for `scripts/check-llm-failure-guardrails.mjs` are main's.

Failure guard staged scan drops quoted Git filenames. Source: `scripts/check-llm-failure-guardrails.mjs:133-149,450-454`.

An ordinary staged production source containing a forbidden stub makes the complete guard fail. The same content under a newline-bearing filename fails a whole-tree scan, but its staged scan passes; a non-ASCII staged name also passes. Git emits quoted/escaped names and gitFiles splits/trims them as literal filesystem paths, then filters them out because existsSync does not resolve the quoted representation. Staging only occurred inside disposable fixture repositories.

Acceptance target: Use NUL-safe Git filename enumeration and exact path preservation; staged special-name sources must retain the same enforcement as ordinary/whole-tree controls.

Validation and limits: Current unchanged source guards and fully read pure scanner/field-policy APIs only.32 unchanged tests and27 independent complete-guard controls pass;66 fixture syntax parses and3 inert literal expression computations use synthetic values. Git init/add only in disposable fixtures. On the 2026-09-27 copy the failure CLI exited 1 with 77 records under 7 nested checkouts, which main's `git ls-files` inventory no longer reads; both log CLIs exited 0, retaining Node module-type warnings. No real logger/skip/test/credential, app entrypoint, native/provider/database/network/browser/build effects or source/config/tool edits. Instrument scans, copied source and metadata grant no additional semantic EOF credit.

Full-file review (`audit/checklist/reviews/coverage-ecosystem-llm-error-log-guards-2026-10-09-023.json`, untracked); independent controls (`audit/checklist/evidence/coverage-llm-error-log-independent-controls-2026-10-09-023.json`, untracked).

## AUDIT-FAILURE-NESTED-CHECKOUT-SCAN-01

Status: Open, scoped source-instrument finding. Severity: Low. Owner: Ecosystem / source guard. First seen: 2026-10-09.

The workspace script check walks the filesystem into nested Git checkouts such as `.worktrees/`, so a package name declared only inside a nested checkout satisfies a `pnpm --filter` target the workspace itself lacks. Source: `scripts/check-workspace-scripts.mjs:10-33,63-81`.

October 9 source-guard qualification: The original workspace-script check rejects a missing filter target but accepts it when only an unrelated nested-checkout-shaped .worktrees manifest supplies that package name outside the inert declared apps/* workspace. The fixture initializes no nested Git repository. Crossing outer source boundaries supplies positive package-name credit. Current original CLI is green; no actual missing current workspace target or package command executes. Actual source reading (`audit/checklist/reviews/coverage-cache-version-workflow-guard-source-2026-10-09-048.json`, untracked); original engine controls (`audit/checklist/evidence/coverage-cache-version-workflow-inert-controls-2026-10-09-048.json`, untracked); valid companions (`audit/checklist/evidence/coverage-cache-version-workflow-valid-companions-2026-10-09-048.json`, untracked); independent challenge (`audit/checklist/evidence/coverage-cache-version-workflow-independent-challenge-2026-10-09-048.json`, untracked).

Rechecked on main (3ccb6f6) on 2026-10-15: still present; `walk` descends every directory outside its fixed ignore list. On the 2026-09-27 copy this was found on, the failure, hygiene, integrity and supply-chain guards walked the filesystem the same way and failed on 77, 27, 21 and 31 findings under nested checkouts. Main's 92b90108f9 (2026-09-28) moved those four guards to `git ls-files -c -o --exclude-standard`, which skips the ignored `.worktrees/` and does not descend into other nested repositories, so that part of this finding is closed on main.

Acceptance target: Define and enforce the current checkout scan boundary, accounting for nested VCS/worktree ownership without broadly exempting genuine current first-party source; preserve ordinary-source enforcement.

## AUDIT-LOG-REDACTION-QUOTED-FIELD-01

Status: Open, scoped source-instrument finding. Severity: Medium. Owner: Ecosystem / source guard. First seen: 2026-10-09.

Log redaction field scanner omits quoted and computed personal keys. Source: `scripts/check-log-redaction.mjs:67-72,98-114`.

With empty declared baseline, the complete redaction guard rejects an unquoted email property but accepts the same field spelled as a quoted or computed literal key. codeOfCall strips key literals and loggedFields only recognizes bare identifier properties. The current runtime name policy still classifies email as personal/denied; this is call-site instrument omission, not observed log disclosure.

Acceptance target: Resolve statically known quoted/computed object field names before applying the current policy, preserving shorthand/explicit/prose controls.

Validation and limits: Current unchanged source guards and fully read pure scanner/field-policy APIs only.32 unchanged tests and27 independent complete-guard controls pass;66 fixture syntax parses and3 inert literal expression computations use synthetic values. Git init/add only in disposable fixtures. On the 2026-09-27 copy the failure CLI exited 1 with 77 records under 7 nested checkouts, which main's `git ls-files` inventory no longer reads; both log CLIs exited 0, retaining Node module-type warnings. No real logger/skip/test/credential, app entrypoint, native/provider/database/network/browser/build effects or source/config/tool edits. Instrument scans, copied source and metadata grant no additional semantic EOF credit.

Full-file review (`audit/checklist/reviews/coverage-ecosystem-llm-error-log-guards-2026-10-09-023.json`, untracked); independent controls (`audit/checklist/evidence/coverage-llm-error-log-independent-controls-2026-10-09-023.json`, untracked).

## AUDIT-LOG-CALL-LEXICAL-BOUNDARY-01

Status: Open, scoped source-instrument finding. Severity: Medium. Owner: Ecosystem / source guard. First seen: 2026-10-09.

Log scanners count parentheses inside message literals as call boundaries. Source: `apps/web/lib/identity/log-hygiene.ts:36-61; scripts/check-log-redaction.mjs:44,75-94`.

Both complete guard APIs can accept calls when a closing parenthesis inside the first message string truncates the raw call scan before later structured data. Redaction detects email in an ordinary message call but misses it after a message containing only a closing parenthesis; hygiene detects bare prompt in an ordinary call but misses it in the corresponding truncated form. Both scanners increment/decrement depth without literal lexical state. No actual logger is invoked.

Acceptance target: Share or consistently implement lexical call boundaries that ignore literal/comment punctuation; keep nested-call and prose stripping controls.

Validation and limits: Current unchanged source guards and fully read pure scanner/field-policy APIs only.32 unchanged tests and27 independent complete-guard controls pass;66 fixture syntax parses and3 inert literal expression computations use synthetic values. Git init/add only in disposable fixtures. On the 2026-09-27 copy the failure CLI exited 1 with 77 records under 7 nested checkouts, which main's `git ls-files` inventory no longer reads; both log CLIs exited 0, retaining Node module-type warnings. No real logger/skip/test/credential, app entrypoint, native/provider/database/network/browser/build effects or source/config/tool edits. Instrument scans, copied source and metadata grant no additional semantic EOF credit.

Full-file review (`audit/checklist/reviews/coverage-ecosystem-llm-error-log-guards-2026-10-09-023.json`, untracked); independent controls (`audit/checklist/evidence/coverage-llm-error-log-independent-controls-2026-10-09-023.json`, untracked).

## AUDIT-LOG-HYGIENE-PROPERTY-REFERENCE-01

Status: Open, scoped source-instrument finding. Severity: Medium. Owner: Ecosystem / source guard. First seen: 2026-10-09.

LLM log hygiene misses banned content referenced as an object property. Source: `apps/web/lib/identity/log-hygiene.ts:76-85; scripts/check-llm-log-hygiene.mjs:77-84`.

Complete hygiene rejects a structured value sourced from bare prompt, accepts the same banned-name property request.prompt under value, and rejects request . prompt after whitespace alone is changed. BANNED disallows an immediately preceding dot and does not follow field provenance. Redaction also accepts the innocuous value key. This is a source-instrument gap under its raw-content rule; actual runtime logging/redaction and product disclosure are unknown.

Acceptance target: Recognize relevant supported property reference forms/provenance consistently instead of granting content credit based on immediate punctuation; retain derived measurement/prose controls.

Validation and limits: Current unchanged source guards and fully read pure scanner/field-policy APIs only.32 unchanged tests and27 independent complete-guard controls pass;66 fixture syntax parses and3 inert literal expression computations use synthetic values. Git init/add only in disposable fixtures. On the 2026-09-27 copy the failure CLI exited 1 with 77 records under 7 nested checkouts, which main's `git ls-files` inventory no longer reads; both log CLIs exited 0, retaining Node module-type warnings. No real logger/skip/test/credential, app entrypoint, native/provider/database/network/browser/build effects or source/config/tool edits. Instrument scans, copied source and metadata grant no additional semantic EOF credit.

Full-file review (`audit/checklist/reviews/coverage-ecosystem-llm-error-log-guards-2026-10-09-023.json`, untracked); independent controls (`audit/checklist/evidence/coverage-llm-error-log-independent-controls-2026-10-09-023.json`, untracked).

## AUDIT-LOG-REDACTION-MEASUREMENT-CREDIT-01

Status: Open, scoped source-instrument finding. Severity: Medium. Owner: Ecosystem / source guard. First seen: 2026-10-09.

Log redaction credits compound expressions from a measurement-looking substring. Source: `scripts/check-log-redaction.mjs:46-48,118-127`.

Complete redaction rejects raw query:q and accepts simple query:q.length. It also accepts q.length && q, Boolean(q) && q and Number(q) || q under query. Three inert computations with only synthetic q return strings, and the same pure deniedValueSurvives(query, value) rejects each actual result. classifyField supplies a numeric/Boolean proxy and SURVIVING_EXPRESSION matches the whole compound expression only by prefix or substring. No user query or runtime log is used.

Acceptance target: Accept only expressions whose complete result satisfies the field policy, conservatively handling compound operators/branches; preserve simple count and presence controls.

Validation and limits: Current unchanged source guards and fully read pure scanner/field-policy APIs only.32 unchanged tests and27 independent complete-guard controls pass;66 fixture syntax parses and3 inert literal expression computations use synthetic values. Git init/add only in disposable fixtures. On the 2026-09-27 copy the failure CLI exited 1 with 77 records under 7 nested checkouts, which main's `git ls-files` inventory no longer reads; both log CLIs exited 0, retaining Node module-type warnings. No real logger/skip/test/credential, app entrypoint, native/provider/database/network/browser/build effects or source/config/tool edits. Instrument scans, copied source and metadata grant no additional semantic EOF credit.

Full-file review (`audit/checklist/reviews/coverage-ecosystem-llm-error-log-guards-2026-10-09-023.json`, untracked); independent controls (`audit/checklist/evidence/coverage-llm-error-log-independent-controls-2026-10-09-023.json`, untracked).

## AUDIT-MEMBERSHIP-EXIT-REVOKER-TEXT-CREDIT-01

Status: Open, scoped source-instrument finding. Severity: Medium. Owner: Ecosystem / source guard. First seen: 2026-10-09.

membership exit guard credits inert, unreachable and prematurely ordered revocation calls. Source: `scripts/check-membership-exit-revocation.mjs:28,157-159,191-205`.

The complete guard API rejects a deletion without revocation and accepts an awaited revocation after the delete. It also accepts an unused string containing deprovisionMember(, a revoker call after an unconditional return, and revocation before the deletion. revokes tests a regex anywhere inside the function body; it establishes neither reachable execution nor completion after the membership exit. No membership, credential or SQL mutation runs.

Acceptance target: Bind the imported revoker and awaited reachable completion after each membership-ending statement; inert strings, unreachable statements and revocation before the exit must not establish coverage.

Validation and limits: Current unchanged source-instrument APIs and complete CLIs over isolated inert TypeScript/text/SQL fixtures only.38 unchanged tests,33 primary controls and4 additional full CLI controls passed;59 fixture syntax parses establish syntax only. Four current-source CLIs exited0. SQL is never executed; no application entrypoint/module/service/native/provider/database/network/browser/build action or source/config/tool edit. Template/SQL text semantics are qualified at source scope; copied fixtures and metadata grant no semantic EOF credit. Actual runtime product policy and public Electron behavior remain unknown.

Full-file review (`audit/checklist/reviews/coverage-ecosystem-membership-memory-guards-2026-10-09-024.json`, untracked); independent controls (`audit/checklist/evidence/coverage-membership-memory-independent-controls-2026-10-09-024.json`, untracked); full CLI quote/counterguard controls (`audit/checklist/evidence/coverage-membership-memory-SQL-closure-controls-2026-10-09-024.json`, untracked).

## AUDIT-MEMBERSHIP-EXIT-CALLER-OMISSION-01

Status: Open, scoped source-instrument finding. Severity: Medium. Owner: Ecosystem / source guard. First seen: 2026-10-09.

membership exit caller census omits arrows, aliases and double-quoted imports. Source: `scripts/check-membership-exit-revocation.mjs:29,83-90,127-152,198-205`.

A service deletion with one correctly revoking named caller and another named caller that forgets is rejected. Keeping the same service and valid caller, converting only the forgotten caller to an arrow, an aliased imported call, or a double-quoted named import makes the complete guard accept. functionSpans enumerates only function declarations, importsFrom accepts only single-quoted patterns, and callersOf searches the original unaliased name. This is source-census omission, not evidence that a current deployed caller omits offboarding.

Acceptance target: Enumerate every executable caller using binding identity, including arrow exports, import aliases and both quote styles; one accepted caller must not hide another unverified caller.

Validation and limits: Current unchanged source-instrument APIs and complete CLIs over isolated inert TypeScript/text/SQL fixtures only.38 unchanged tests,33 primary controls and4 additional full CLI controls passed;59 fixture syntax parses establish syntax only. Four current-source CLIs exited0. SQL is never executed; no application entrypoint/module/service/native/provider/database/network/browser/build action or source/config/tool edit. Template/SQL text semantics are qualified at source scope; copied fixtures and metadata grant no semantic EOF credit. Actual runtime product policy and public Electron behavior remain unknown.

Full-file review (`audit/checklist/reviews/coverage-ecosystem-membership-memory-guards-2026-10-09-024.json`, untracked); independent controls (`audit/checklist/evidence/coverage-membership-memory-independent-controls-2026-10-09-024.json`, untracked); full CLI quote/counterguard controls (`audit/checklist/evidence/coverage-membership-memory-SQL-closure-controls-2026-10-09-024.json`, untracked).

## AUDIT-MEMBERSHIP-ISOLATION-REVOKER-TEXT-CREDIT-01

Status: Open, scoped source-instrument finding. Severity: Medium. Owner: Ecosystem / source guard. First seen: 2026-10-09.

Rechecked on main (3ccb6f6) on 2026-10-15: still present. Main changed `scripts/check-membership-isolation.mjs` after the 2026-09-27 copy this was found on without changing the cited logic; line numbers for it are main's.

membership isolation guard credits unused imports and unrelated revoker functions. Source: `scripts/check-membership-isolation.mjs:51,208-232`.

The complete isolation CLI rejects a membership deletion without revocation. An unused deprovisionMember import alone makes that same deletion pass, as does a separate never-called function containing a revoker. The guard tests a bare name over the whole module before inspecting individual statements. Actual referenced caller checks remain present but are also textual. No current account or credential is modified.

Acceptance target: Bind awaited reachable revocation to the ending statement or every actual caller; a bare import or unrelated function must not discharge the obligation.

Validation and limits: Current unchanged source-instrument APIs and complete CLIs over isolated inert TypeScript/text/SQL fixtures only.38 unchanged tests,33 primary controls and4 additional full CLI controls passed;59 fixture syntax parses establish syntax only. Four current-source CLIs exited0. SQL is never executed; no application entrypoint/module/service/native/provider/database/network/browser/build action or source/config/tool edit. Template/SQL text semantics are qualified at source scope; copied fixtures and metadata grant no semantic EOF credit. Actual runtime product policy and public Electron behavior remain unknown.

Full-file review (`audit/checklist/reviews/coverage-ecosystem-membership-memory-guards-2026-10-09-024.json`, untracked); independent controls (`audit/checklist/evidence/coverage-membership-memory-independent-controls-2026-10-09-024.json`, untracked); full CLI quote/counterguard controls (`audit/checklist/evidence/coverage-membership-memory-SQL-closure-controls-2026-10-09-024.json`, untracked).

## AUDIT-MEMORY-CONTENT-RETURN-SCAN-01

Status: Open, scoped source-instrument finding. Severity: Medium. Owner: Ecosystem / source guard. First seen: 2026-10-09.

memory isolation guard overlooks content returned through select star. Source: `scripts/check-memory-isolation.mjs:89-113`.

The complete repository API rejects an explicit content read without owner/workspace predicates and accepts real predicates. select * from user_memories where user_id=$1 passes at a request-scoped service path without any workspace predicate. returnsMemoryContent requires the literal content token after select/returning, so a star that includes the table content column is not classified as returning it. This does not establish a real tenant disclosure.

Acceptance target: Conservatively classify star projections and other content-bearing projections before workspace checks; expose unresolved return shapes as unknown rather than accepting their absence of a content token.

Validation and limits: Current unchanged source-instrument APIs and complete CLIs over isolated inert TypeScript/text/SQL fixtures only.38 unchanged tests,33 primary controls and4 additional full CLI controls passed;59 fixture syntax parses establish syntax only. Four current-source CLIs exited0. SQL is never executed; no application entrypoint/module/service/native/provider/database/network/browser/build action or source/config/tool edit. Template/SQL text semantics are qualified at source scope; copied fixtures and metadata grant no semantic EOF credit. Actual runtime product policy and public Electron behavior remain unknown.

Full-file review (`audit/checklist/reviews/coverage-ecosystem-membership-memory-guards-2026-10-09-024.json`, untracked); independent controls (`audit/checklist/evidence/coverage-membership-memory-independent-controls-2026-10-09-024.json`, untracked); full CLI quote/counterguard controls (`audit/checklist/evidence/coverage-membership-memory-SQL-closure-controls-2026-10-09-024.json`, untracked).

Source-schema premise: `apps/web/db/neon/0010_memory.sql:1-9`, actually read through EOF, declares content text not null at line4. No applied migration or live schema state is claimed.

## AUDIT-MEMORY-MEMBERSHIP-SQL-LITERAL-OMISSION-01

Status: Open, scoped source-instrument finding. Severity: Medium. Owner: Ecosystem / source guard. First seen: 2026-10-09.

Rechecked on main (3ccb6f6) on 2026-10-15: still present. Main changed `scripts/check-membership-isolation.mjs` after the 2026-09-27 copy this was found on without changing the cited logic; line numbers for it are main's.

membership and memory guards omit executable SQL quote and table-name forms. Source: `scripts/check-membership-isolation.mjs:134-148,196-212; scripts/check-memory-isolation.mjs:57-77,116-134; scripts/check-memory-write-gate.mjs:21-40,98-109`.

An ordinary unscoped backtick membership query fails; a double-quoted query and an uppercased membership-table query are omitted by the complete CLI. Memory isolation omits ordinary single- and double-quoted queries; a full CLI accepts a single-quoted unscoped content query while reporting one touching module. The memory write API reports zero writers for a single-quoted insert. Its CLI correctly rejects an otherwise empty writer sweep, so an additional mixed-tree control is required: with a known gate-module backtick writer retained, the ordinary backtick rogue insert fails but the same single-quoted rogue insert passes and the CLI reports only the registered writer. This identifies restricted lexical discovery, not SQL execution or a deployed bypass.

Acceptance target: Discover all executable SQL literal forms and supported table-identifier case before scoped/writer checks; retain the empty-sweep refusal and mixed-tree countercontrols.

Validation and limits: Current unchanged source-instrument APIs and complete CLIs over isolated inert TypeScript/text/SQL fixtures only.38 unchanged tests,33 primary controls and4 additional full CLI controls passed;59 fixture syntax parses establish syntax only. Four current-source CLIs exited0. SQL is never executed; no application entrypoint/module/service/native/provider/database/network/browser/build action or source/config/tool edit. Template/SQL text semantics are qualified at source scope; copied fixtures and metadata grant no semantic EOF credit. Actual runtime product policy and public Electron behavior remain unknown.

Full-file review (`audit/checklist/reviews/coverage-ecosystem-membership-memory-guards-2026-10-09-024.json`, untracked); independent controls (`audit/checklist/evidence/coverage-membership-memory-independent-controls-2026-10-09-024.json`, untracked); full CLI quote/counterguard controls (`audit/checklist/evidence/coverage-membership-memory-SQL-closure-controls-2026-10-09-024.json`, untracked).

October 9 managed/unattended extension under this same canonical owner: Unattended ordinary backtick queued-work query fails. The same inert query written as a single-quoted JavaScript SQL string or with uppercase WORK is omitted, and the complete API passes with two owned schema tables and zero pickups. Quoted SQL table names are recognized in this exact fixture: the first expected omission assertion failed, was retained, and the corrected rejecting counter passed. Existing restricted SQL literal-discovery owner is extended without the rejected quoted-name claim.

Additional source: `scripts/check-membership-unattended-work.mjs:138-145,186,193-199`. Acceptance target: Discover all supported executable SQL literal forms and identifier case before policy checks; preserve the recognized quoted-table counter and expose unsupported shapes as unknown. Actual full source review (`audit/checklist/reviews/coverage-ecosystem-managed-unattended-guards-2026-10-09-025.json`, untracked); complete independent controls (`audit/checklist/evidence/coverage-managed-unattended-independent-controls-2026-10-09-025-refined.json`, untracked). Unchanged guard APIs and source CLIs over isolated inert TypeScript/migration text only.35 unchanged tests and36 final independent controls passed;69 fixture syntax parses establish syntax only. Three current textual CLIs exited0. Initial26-control execution stopped on a disproved quoted-table omission assumption and its actual failure is preserved separately. No SQL, application module/entrypoint/service, provider/native/network/browser/build/database or production state executed; source/config/tool files remain unchanged. No current product policy bypass, account loss or deployed incident is accepted.

Unattended quote-probe fidelity closure: original lexical fixture changed embedded SQL apostrophes to double quotes. Two additional complete controls (`audit/checklist/evidence/coverage-managed-unattended-SQL-literal-closure-2026-10-09-025.json`, untracked) assert identical TypeScript AST literal SQL values for the original queued query in backtick and escaped single-quoted JavaScript strings. The backtick query rejects while the identical single-quoted query is omitted. This stronger source proof replaces any assumption that the initial altered SQL alone established identical query semantics; no SQL executes.

October 9 money/usage/Work source qualification: With an independent owned backtick anchor retained, an ordinary unowned backtick Work SELECT rejects. Its exact TypeScript AST SQL value written in either single or double quotes is omitted and the complete CLI reports only the anchor. Uppercase PUBLIC.CLOUD_AGENT_RUNS is likewise omitted. This extends the existing SQL literal/case owner; empty Work census still rejects and no SQL executes.

Additional source: `scripts/check-worktask-scope.mjs:55-63`. Acceptance target: Discover every supported source SQL literal and table-identifier case before scoped checks; retain same-value quote fidelity and mixed-tree empty-census counterguards. Current source report (`audit/checklist/reviews/coverage-ecosystem-money-usage-worktask-guards-2026-10-09-028.json`, untracked); complete independent controls (`audit/checklist/evidence/coverage-money-usage-worktask-independent-controls-2026-10-09-028-refined.json`, untracked). Unchanged complete source-instrument APIs and byte-identical CLI copies over isolated inert TypeScript/SQL text only.44 unchanged tests and35 final independent controls passed;62 TypeScript fixture parses establish syntax only. Four actual current source CLIs exited0. Two isolated literal arithmetic expressions execute in a VM; no application or fixture module imports, monetary writes, SQL, database, native host, provider, network, browser, build, installation, production action or real checkout staging occurs. Git used by unchanged tests is confined to scrubbed fixture roots. Initial11-control receipt preserves a failed CLI assertion: /tmp versus /private/tmp prevented the copied guard main from running. Final runner normalizes executable/cwd realpaths and asserts nonempty guard output. Source/tool/config files are unchanged; no current product incident or runtime acceptance is established.

## AUDIT-MEMORY-WRITE-GATE-TEXT-CREDIT-01

Status: Open, scoped source-instrument finding. Severity: Medium. Owner: Ecosystem / source guard. First seen: 2026-10-09.

memory write guard accepts comment/string gate names and ignored refusal decisions. Source: `scripts/check-memory-write-gate.mjs:9,49-55`.

The complete repository API rejects an ungated template-literal insert and accepts a fixture that returns before writing when admission refuses. The same ungated writer passes after only appending a comment or unused string containing memoryWriteAdmission(. Calling admission and ignoring its result also passes. GATE_CALLS checks unrestricted whole-module text and does not bind eligibility to each write. No real memory or policy result is used.

Acceptance target: Require every reachable memory-writing statement to depend on an awaited shared admission decision that stops the write on refusal; literal/comment matches and ignored results must not satisfy the gate.

Validation and limits: Current unchanged source-instrument APIs and complete CLIs over isolated inert TypeScript/text/SQL fixtures only.38 unchanged tests,33 primary controls and4 additional full CLI controls passed;59 fixture syntax parses establish syntax only. Four current-source CLIs exited0. SQL is never executed; no application entrypoint/module/service/native/provider/database/network/browser/build action or source/config/tool edit. Template/SQL text semantics are qualified at source scope; copied fixtures and metadata grant no semantic EOF credit. Actual runtime product policy and public Electron behavior remain unknown.

Full-file review (`audit/checklist/reviews/coverage-ecosystem-membership-memory-guards-2026-10-09-024.json`, untracked); independent controls (`audit/checklist/evidence/coverage-membership-memory-independent-controls-2026-10-09-024.json`, untracked); full CLI quote/counterguard controls (`audit/checklist/evidence/coverage-membership-memory-SQL-closure-controls-2026-10-09-024.json`, untracked).

## AUDIT-MEMORY-WRITE-CALLER-COVERAGE-01

Status: Open, scoped source-instrument finding. Severity: Medium. Owner: Ecosystem / source guard. First seen: 2026-10-09.

memory write guard lets one textual caller exempt every store path. Source: `scripts/check-memory-write-gate.mjs:88-109`.

With no gated caller the store is rejected. Adding one route that checks admission causes the complete repository API to accept the store even while a second imported route invokes it without admission. A separate unused string containing the store import specifier and gate symbol also exempts it. drivenByAGatedCaller returns true for any one textual source match; neither actual import/call reachability nor all-callers coverage is established. No real store executes.

Acceptance target: Track actual import and call bindings and require every store entry path to enforce refusal before writes; a single gated caller or an inert import-specifier string must not exempt unrelated paths.

Validation and limits: Current unchanged source-instrument APIs and complete CLIs over isolated inert TypeScript/text/SQL fixtures only.38 unchanged tests,33 primary controls and4 additional full CLI controls passed;59 fixture syntax parses establish syntax only. Four current-source CLIs exited0. SQL is never executed; no application entrypoint/module/service/native/provider/database/network/browser/build action or source/config/tool edit. Template/SQL text semantics are qualified at source scope; copied fixtures and metadata grant no semantic EOF credit. Actual runtime product policy and public Electron behavior remain unknown.

Full-file review (`audit/checklist/reviews/coverage-ecosystem-membership-memory-guards-2026-10-09-024.json`, untracked); independent controls (`audit/checklist/evidence/coverage-membership-memory-independent-controls-2026-10-09-024.json`, untracked); full CLI quote/counterguard controls (`audit/checklist/evidence/coverage-membership-memory-SQL-closure-controls-2026-10-09-024.json`, untracked).

## AUDIT-MANAGED-SAFETY-SUBJECT-CLOSURE-01

Status: Open, scoped source-instrument finding. Severity: Medium. Owner: Ecosystem / source guard. First seen: 2026-10-09.

Managed safety census omits aliased creators/writers and server delivery modules. Source: `scripts/lib/managed-safety-floor.mjs:25-26,29,38-42,73-76,142-178`.

With a valid admission and screened delivery retained as nonempty anchors, an additional aliased generation creator is absent from the admission census. An aliased asset writer and an unscreened delivery under apps/web/lib/server are absent from the delivery census. The complete API passes and reports only the anchors. Known direct creator/write names are found and absent gates fail in paired controls.

Acceptance target: Enumerate actual creator/write bindings and all owning delivery entry paths; unresolved aliases or moved modules must remain unknown rather than disappearing behind nonempty anchors.

Validation and limits: Unchanged guard APIs and source CLIs over isolated inert TypeScript/migration text only.35 unchanged tests and36 final independent controls passed;69 fixture syntax parses establish syntax only. Three current textual CLIs exited0. Initial26-control execution stopped on a disproved quoted-table omission assumption and its actual failure is preserved separately. No SQL, application module/entrypoint/service, provider/native/network/browser/build/database or production state executed; source/config/tool files remain unchanged. No current product policy bypass, account loss or deployed incident is accepted.

Full source review (`audit/checklist/reviews/coverage-ecosystem-managed-unattended-guards-2026-10-09-025.json`, untracked); final independent controls (`audit/checklist/evidence/coverage-managed-unattended-independent-controls-2026-10-09-025-refined.json`, untracked); retained initial probe failure (`audit/checklist/evidence/coverage-managed-unattended-independent-controls-2026-10-09-025.json`, untracked).

## AUDIT-MANAGED-SAFETY-VOCABULARY-TEXT-CREDIT-01

Status: Open, scoped source-instrument finding. Severity: Medium. Owner: Ecosystem / source guard. First seen: 2026-10-09.

Managed safety vocabulary accepts comment-only moderation rule entries. Source: `scripts/lib/managed-safety-floor.mjs:79-109,112-135,206-209`.

An actually empty RULES array fails. An array with no executable rule entries but two commented id/category objects passes the complete managed audit while the same declared categories and real admission/delivery anchors remain. TypeScript parsing confirms valid source syntax; the comment-only array contains no real elements. Raw category extraction does not bind an executable rule.

Acceptance target: Read actual declared categories and executable rule entries through syntax/binding-aware parsing; comments and inert data must not satisfy policy-rule coverage.

Validation and limits: Unchanged guard APIs and source CLIs over isolated inert TypeScript/migration text only.35 unchanged tests and36 final independent controls passed;69 fixture syntax parses establish syntax only. Three current textual CLIs exited0. Initial26-control execution stopped on a disproved quoted-table omission assumption and its actual failure is preserved separately. No SQL, application module/entrypoint/service, provider/native/network/browser/build/database or production state executed; source/config/tool files remain unchanged. No current product policy bypass, account loss or deployed incident is accepted.

Full source review (`audit/checklist/reviews/coverage-ecosystem-managed-unattended-guards-2026-10-09-025.json`, untracked); final independent controls (`audit/checklist/evidence/coverage-managed-unattended-independent-controls-2026-10-09-025-refined.json`, untracked); retained initial probe failure (`audit/checklist/evidence/coverage-managed-unattended-independent-controls-2026-10-09-025.json`, untracked).

## AUDIT-UNATTENDED-PICKUP-EXEMPTION-TEXT-01

Status: Open, scoped source-instrument finding. Severity: Medium. Owner: Ecosystem / source guard. First seen: 2026-10-09.

Unattended guard omits queued claims when running state appears in SET. Source: `scripts/check-membership-unattended-work.mjs:35-38,45-57,193-204`.

An ungated update setting status='ready' where status='queued' fails with one pickup. Changing only the assigned state to 'running' makes the complete guard accept with zero pickups, because ALREADY_RUNNING sees the SET assignment before distinguishing a preexisting running row. A real ending update with WHERE status='running' is correctly exempt. A user_id=$1 equality merely projected by SELECT is also treated as a caller predicate and hides the pickup.

Acceptance target: Classify pickup/ending/request semantics from the effective row-selection predicate and mutation, distinguishing SET state from WHERE state and projection data from a caller constraint.

Validation and limits: Unchanged guard APIs and source CLIs over isolated inert TypeScript/migration text only.35 unchanged tests and36 final independent controls passed;69 fixture syntax parses establish syntax only. Three current textual CLIs exited0. Initial26-control execution stopped on a disproved quoted-table omission assumption and its actual failure is preserved separately. No SQL, application module/entrypoint/service, provider/native/network/browser/build/database or production state executed; source/config/tool files remain unchanged. No current product policy bypass, account loss or deployed incident is accepted.

Full source review (`audit/checklist/reviews/coverage-ecosystem-managed-unattended-guards-2026-10-09-025.json`, untracked); final independent controls (`audit/checklist/evidence/coverage-managed-unattended-independent-controls-2026-10-09-025-refined.json`, untracked); retained initial probe failure (`audit/checklist/evidence/coverage-managed-unattended-independent-controls-2026-10-09-025.json`, untracked).

## AUDIT-UNATTENDED-BASELINE-STATEMENT-COVERAGE-01

Status: Open, scoped source-instrument finding. Severity: Medium. Owner: Ecosystem / source guard. First seen: 2026-10-09.

One unattended baseline entry silences additional statements for the same file/table. Source: `scripts/check-membership-unattended-work.mjs:188-190,213-218,234-244`.

A single documented exception for one ungated pickup passes with recorded=1. Adding an independent ungated queued-work UPDATE in the same source file over the same table also passes with recorded=2 using that unchanged single entry. The key is file#table; no statement identity or count ratchet distinguishes the new obligation. A baseline entry whose original pickup becomes gated correctly fails as stale. The baseline sql field is intended future remediation, so equality with the original current statement is not required by this finding.

Acceptance target: Bind retained exceptions to independently identified current statement obligations and reject new or materially changed ungated statements; preserve separately the intended remediation SQL and ownership.

Validation and limits: Unchanged guard APIs and source CLIs over isolated inert TypeScript/migration text only.35 unchanged tests and36 final independent controls passed;69 fixture syntax parses establish syntax only. Three current textual CLIs exited0. Initial26-control execution stopped on a disproved quoted-table omission assumption and its actual failure is preserved separately. No SQL, application module/entrypoint/service, provider/native/network/browser/build/database or production state executed; source/config/tool files remain unchanged. No current product policy bypass, account loss or deployed incident is accepted.

Full source review (`audit/checklist/reviews/coverage-ecosystem-managed-unattended-guards-2026-10-09-025.json`, untracked); final independent controls (`audit/checklist/evidence/coverage-managed-unattended-independent-controls-2026-10-09-025-refined.json`, untracked); retained initial probe failure (`audit/checklist/evidence/coverage-managed-unattended-independent-controls-2026-10-09-025.json`, untracked).

## AUDIT-UNATTENDED-BASELINE-TYPE-VALIDATION-01

Status: Open, scoped source-instrument finding. Severity: Low. Owner: Ecosystem / source guard. First seen: 2026-10-09.

Unattended baseline accepts nontext SQL owner and reason fields. Source: `scripts/check-membership-unattended-work.mjs:239-244`.

A baseline missing SQL/owner and carrying a short string reason is rejected. An otherwise matching entry with sql={}, owner={} and numeric reason=7 passes. Truthy object fields and undefined numeric .length do not establish a textual remediation clause, owner path or substantive reason.

Acceptance target: Validate the baseline object shape, nonempty textual fields and substantive textual reason before granting any exception; reject objects/numbers in text fields.

Validation and limits: Unchanged guard APIs and source CLIs over isolated inert TypeScript/migration text only.35 unchanged tests and36 final independent controls passed;69 fixture syntax parses establish syntax only. Three current textual CLIs exited0. Initial26-control execution stopped on a disproved quoted-table omission assumption and its actual failure is preserved separately. No SQL, application module/entrypoint/service, provider/native/network/browser/build/database or production state executed; source/config/tool files remain unchanged. No current product policy bypass, account loss or deployed incident is accepted.

Full source review (`audit/checklist/reviews/coverage-ecosystem-managed-unattended-guards-2026-10-09-025.json`, untracked); final independent controls (`audit/checklist/evidence/coverage-managed-unattended-independent-controls-2026-10-09-025-refined.json`, untracked); retained initial probe failure (`audit/checklist/evidence/coverage-managed-unattended-independent-controls-2026-10-09-025.json`, untracked).

## AUDIT-OUTBOUND-INSPECTION-TEXT-CREDIT-01

Status: Open, scoped source-instrument finding. Severity: Medium. Owner: Ecosystem / source guard. First seen: 2026-10-09.

Rechecked on main (3ccb6f6) on 2026-10-15: still present. Main changed `scripts/check-public-share-dlp.mjs` after the 2026-09-27 copy this was found on without changing the cited logic; line numbers for it are main's.

Outbound inspection guard accepts commented policy and commented or neighboring channel wiring. Source: `scripts/check-outbound-inspection-coverage.mjs:38-45,59-69; scripts/lib/outbound-inspection.mjs:9-14`.

Complete CLI rejects missing wiring and absent policy markers. Comment-only inspectOutboundContent({channel: share}) text supplies the missing call site, and comments containing resolveMode, block fallback, recordAuditEvent and dlp_content_blocked make an always-allowed synthetic inspector pass. A real dynamic channel call can earn share coverage from an unrelated later object inside the800-character window. A different explicit first channel does not earn share coverage. These controls establish lexical source false credit, without executing any inspector or publish function.

Acceptance target: Bind policy fallback/audit behavior and channel values to executable inspected flows and effective verdict handling; comments and unrelated neighboring data must not discharge control or channel coverage.

Validation and limits: Current unchanged guard APIs/CLIs over isolated inert TypeScript/text fixtures only.40 unchanged tests and32 final independent controls passed;61 fixture syntax parses establish syntax only. Five current source CLIs exited0. Initial8-control execution stopped when the synthetic positive fallback used policy={...} but the lexical guard requires policy = {...}; original actual failure and refined execution are preserved. No application modules, SQL, policy resolver, plugin installation, provider/MCP/network/native/browser/database/build or production state executed. Source/config/tool files remain unchanged. No deployed security or product incident is accepted.

Full source review (`audit/checklist/reviews/coverage-ecosystem-egress-install-provider-guards-2026-10-09-026.json`, untracked); final independent controls (`audit/checklist/evidence/coverage-egress-install-provider-independent-controls-2026-10-09-026-refined.json`, untracked); retained initial probe failure (`audit/checklist/evidence/coverage-egress-install-provider-independent-controls-2026-10-09-026.json`, untracked).

October 9 project/prompt/public-share source qualification: The complete public-share CLI rejects an uninspected direct write but accepts a comment-only inspector, an inspector in another independent function, and an actual inspector call whose decision is ignored before publication. AST and function/order checks distinguish comments and unrelated calls; a real before-write refusal control passes. Existing outbound-inspection textual-credit ownership is extended without claiming any current deployed content publication.

Additional source: `scripts/check-public-share-dlp.mjs:51-65,96-118`. Acceptance target: Bind inspection to the exact content and publishing control path and enforce its verdict before the write; comments, unrelated calls and ignored decisions cannot supply admission. Current source report (`audit/checklist/reviews/coverage-ecosystem-project-prompt-share-guards-2026-10-09-032.json`, untracked); independent controls (`audit/checklist/evidence/coverage-project-prompt-share-independent-controls-2026-10-09-032-final.json`, untracked). Thirty-five unchanged source guard tests, thirty-eight independent inert controls and four individual current source CLIs passed. Fifty-one TypeScript AST syntax/source-kind/binding checks establish fixture subjects. Complete CLI copies are byte-identical, realpath-bound and produce nonempty output. Git fixture operations use explicit throwaway roots and scrub inherited GIT variables; no real checkout staging. Imported modules are unchanged source instruments only; no application/fixture modules, actual SQL/database, project prompt/public share mutation, native/provider/network/browser/build/install/production action or runtime product acceptance. Source/config/tool files remain unchanged. Current CLI findings are textual guard evidence, not deployed incidents.

## AUDIT-PLUGIN-ADMISSION-WRITE-CENSUS-01

Status: Open, scoped source-instrument finding. Severity: Medium. Owner: Ecosystem / source guard. First seen: 2026-10-09.

Plugin installation guard omits arrow writers and unqualified insert forms. Source: `scripts/check-plugin-install-gate.mjs:31-35,88-107,139-156`.

An ordinary named ungated installation writer fails. A tree with only an arrow writer correctly fails the empty census. Keeping a valid gated named writer as a nonempty anchor, an additional arrow writer or an insert with an unqualified plugin_installations name disappears from the census and the full CLI passes while reporting only one installation write. Actual SQL table resolution remains unexecuted and unknown; the lexical scan does not expose the unresolved form.

Acceptance target: Enumerate reachable installation admission writes across function and SQL identifier forms before evaluating gates; nonempty anchors must not hide unresolved additional writers.

Validation and limits: Current unchanged guard APIs/CLIs over isolated inert TypeScript/text fixtures only.40 unchanged tests and32 final independent controls passed;61 fixture syntax parses establish syntax only. Five current source CLIs exited0. Initial8-control execution stopped when the synthetic positive fallback used policy={...} but the lexical guard requires policy = {...}; original actual failure and refined execution are preserved. No application modules, SQL, policy resolver, plugin installation, provider/MCP/network/native/browser/database/build or production state executed. Source/config/tool files remain unchanged. No deployed security or product incident is accepted.

Full source review (`audit/checklist/reviews/coverage-ecosystem-egress-install-provider-guards-2026-10-09-026.json`, untracked); final independent controls (`audit/checklist/evidence/coverage-egress-install-provider-independent-controls-2026-10-09-026-refined.json`, untracked); retained initial probe failure (`audit/checklist/evidence/coverage-egress-install-provider-independent-controls-2026-10-09-026.json`, untracked).

## AUDIT-PLUGIN-EXPORTED-HELPER-CALLER-01

Status: Open, scoped source-instrument finding. Severity: Medium. Owner: Ecosystem / source guard. First seen: 2026-10-09.

Plugin gate treats an exported writer as a private helper covered by one local caller. Source: `scripts/check-plugin-install-gate.mjs:127-136,147-152`.

The complete installation CLI accepts an exported ungated helper that admits an installed version when another same-module exported function calls it after a gate. gatedBy enumerates same-module named callers but never requires that the writing helper be private. The exported helper itself is an available independently callable source entry; its direct external callers and current production adoption remain unknown. The paired ungated lone helper fails.

Acceptance target: Only discharge a helper through enclosing callers after proving its actual private reachability, or require all exported/direct entry paths to enforce admission before writes; same-module callers must not establish closure of an exported writer.

Validation and limits: Current unchanged guard APIs/CLIs over isolated inert TypeScript/text fixtures only.40 unchanged tests and32 final independent controls passed;61 fixture syntax parses establish syntax only. Five current source CLIs exited0. Initial8-control execution stopped when the synthetic positive fallback used policy={...} but the lexical guard requires policy = {...}; original actual failure and refined execution are preserved. No application modules, SQL, policy resolver, plugin installation, provider/MCP/network/native/browser/database/build or production state executed. Source/config/tool files remain unchanged. No deployed security or product incident is accepted.

Full source review (`audit/checklist/reviews/coverage-ecosystem-egress-install-provider-guards-2026-10-09-026.json`, untracked); final independent controls (`audit/checklist/evidence/coverage-egress-install-provider-independent-controls-2026-10-09-026-refined.json`, untracked); retained initial probe failure (`audit/checklist/evidence/coverage-egress-install-provider-independent-controls-2026-10-09-026.json`, untracked).

## AUDIT-POLICY-GATE-RESOLVER-CENSUS-01

Status: Open, scoped source-instrument finding. Severity: Medium. Owner: Ecosystem / source guard. First seen: 2026-10-09.

Policy gate scope check reports success when named resolver declarations are absent or unsupported. Source: `scripts/check-policy-gate-scope.mjs:10-27,47-49; scripts/lib/policy-gate-scope.mjs:10-15,23-37,44-46`.

Four expected gate files containing no account resolver pass and print that all four resolve from membership. A recognized annotated export async function with a request parameter is rejected and a membership resolver passes. Converting the request-scoped resolver to an arrow export or removing only the return type annotation makes it omitted and the full CLI pass. The guard tests four specific declaration forms without requiring any resolver census; no resolver function is executed.

Acceptance target: Establish a complete actual account-level resolver census and reject missing/unsupported shapes before scope checks; a successful file-existence walk cannot prove membership-derived resolver behavior.

Validation and limits: Current unchanged guard APIs/CLIs over isolated inert TypeScript/text fixtures only.40 unchanged tests and32 final independent controls passed;61 fixture syntax parses establish syntax only. Five current source CLIs exited0. Initial8-control execution stopped when the synthetic positive fallback used policy={...} but the lexical guard requires policy = {...}; original actual failure and refined execution are preserved. No application modules, SQL, policy resolver, plugin installation, provider/MCP/network/native/browser/database/build or production state executed. Source/config/tool files remain unchanged. No deployed security or product incident is accepted.

Full source review (`audit/checklist/reviews/coverage-ecosystem-egress-install-provider-guards-2026-10-09-026.json`, untracked); final independent controls (`audit/checklist/evidence/coverage-egress-install-provider-independent-controls-2026-10-09-026-refined.json`, untracked); retained initial probe failure (`audit/checklist/evidence/coverage-egress-install-provider-independent-controls-2026-10-09-026.json`, untracked).

## AUDIT-PROVIDER-SDK-UNDECLARED-DOMAIN-IMPORT-01

Status: Open, scoped source-instrument finding. Severity: Medium. Owner: Ecosystem / source guard. First seen: 2026-10-09.

Provider boundary guard accepts a vendor SDK first imported outside an adapter. Source: `scripts/check-provider-adapter-boundary.mjs:82-89,117-137`.

With a correctly declared SDK imported by its adapter retained, a business module statically importing xai-sdk passes despite looksLikeProviderSdk recognizing the configured provider spelling. Undeclared vendor packages trigger an error only inside adapter branches; non-adapter undeclared packages continue at line133. The existing suite tests undeclared adapter imports but omits this domain-first case. The synthetic SDK is never installed, resolved or imported.

Acceptance target: Reject recognized provider SDK imports outside an adapter regardless of whether an adapter already placed the package in the declared list; preserve declared-adapter and forbidden-domain countercontrols.

Validation and limits: Current unchanged guard APIs/CLIs over isolated inert TypeScript/text fixtures only.40 unchanged tests and32 final independent controls passed;61 fixture syntax parses establish syntax only. Five current source CLIs exited0. Initial8-control execution stopped when the synthetic positive fallback used policy={...} but the lexical guard requires policy = {...}; original actual failure and refined execution are preserved. No application modules, SQL, policy resolver, plugin installation, provider/MCP/network/native/browser/database/build or production state executed. Source/config/tool files remain unchanged. No deployed security or product incident is accepted.

Full source review (`audit/checklist/reviews/coverage-ecosystem-egress-install-provider-guards-2026-10-09-026.json`, untracked); final independent controls (`audit/checklist/evidence/coverage-egress-install-provider-independent-controls-2026-10-09-026-refined.json`, untracked); retained initial probe failure (`audit/checklist/evidence/coverage-egress-install-provider-independent-controls-2026-10-09-026.json`, untracked).

## AUDIT-MOCK-EXPORT-DISCOVERY-CENSUS-01

Severity: Medium. Status: open current source-instrument gap; source unchanged.

October 9 mock-export/reachability source qualification: A fresh nested JS test missing bar is directly detected by checkTestFile, but complete discovery scans only the valid TypeScript anchor and passes. A direct-root TS test missing bar is also detected directly, yet the ** pathspec yields zero tests and the complete API passes. The paired nested TypeScript fixture rejects the same omission. Zero subjects are allowed even in an otherwise valid isolated Git root.

Additional source: `scripts/check-mock-exports.mjs:16-25,690-719,729-768`. Acceptance target: Enumerate all intended configured test file extensions and depth forms, then distinguish intentionally empty scope from missing/undiscovered subjects before completeness credit. Current source report (`audit/checklist/reviews/coverage-ecosystem-mock-exports-reachability-guards-2026-10-09-027.json`, untracked); final complete controls (`audit/checklist/evidence/coverage-mock-export-reachability-independent-controls-2026-10-09-027-final-fidelity.json`, untracked). Current unchanged source instruments/helpers and inert Git/TypeScript/text fixtures only.34 unchanged Node source-instrument tests passed;27 final primary independent controls and one additional byte-identical Rust-root comparison passed with59 TypeScript syntax parses. Three current source CLIs exited0. Synthetic VM factories use literal objects only; no fixture/application module imports, mounted Vitest/React UI, Cargo/Rust compilation, native host, database, provider, network, installation or production effects. Source copies are byte-identical and Git init/add is confined to scrubbed fixture roots. Initial root-level positive fixture had zero discovered tests, so its original failure is retained; corrected nested discovery and an independent root-level omission control qualify the census. Intermediate cache replay used source text with formatting differences; final replay asserts byte-identical mocked/subject/test sources before comparing cached and fresh paths. No source/tool/config fix or deployed incident is accepted.

## AUDIT-MOCK-EXPORT-IMPORT-ORIGINAL-TEXT-01

Severity: Medium. Status: open current source-instrument gap; source unchanged.

October 9 mock-export/reachability source qualification: Complete guard API rejects a fixed factory missing required bar. Adding only a comment containing importOriginal or unused string importActual makes the factory nonfixed and eliminates both the required-export finding and drift. A literal pure VM factory still returns only foo. Removing the marker text restores rejection.

Additional source: `scripts/check-mock-exports.mjs:304-319,573-583,634-643`. Acceptance target: Require actual source-bound importOriginal/importActual composition or explicitly expose an unresolved factory; comment and data tokens must not silently discharge omission checks. Current source report (`audit/checklist/reviews/coverage-ecosystem-mock-exports-reachability-guards-2026-10-09-027.json`, untracked); final complete controls (`audit/checklist/evidence/coverage-mock-export-reachability-independent-controls-2026-10-09-027-final-fidelity.json`, untracked). Current unchanged source instruments/helpers and inert Git/TypeScript/text fixtures only.34 unchanged Node source-instrument tests passed;27 final primary independent controls and one additional byte-identical Rust-root comparison passed with59 TypeScript syntax parses. Three current source CLIs exited0. Synthetic VM factories use literal objects only; no fixture/application module imports, mounted Vitest/React UI, Cargo/Rust compilation, native host, database, provider, network, installation or production effects. Source copies are byte-identical and Git init/add is confined to scrubbed fixture roots. Initial root-level positive fixture had zero discovered tests, so its original failure is retained; corrected nested discovery and an independent root-level omission control qualify the census. Intermediate cache replay used source text with formatting differences; final replay asserts byte-identical mocked/subject/test sources before comparing cached and fresh paths. No source/tool/config fix or deployed incident is accepted.

## AUDIT-MOCK-EXPORT-FACTORY-RETURN-PATH-01

Severity: Medium. Status: open current source-instrument gap; source unchanged.

October 9 mock-export/reachability source qualification: A synthetic factory first returns foo/bar inside a false branch, then returns only foo. The complete guard credits both first-branch keys and passes, while the isolated literal-only VM evaluation has only foo and the subject requires bar. A single incomplete return is rejected.

Additional source: `scripts/check-mock-exports.mjs:224-242,313-319`. Acceptance target: Establish all reachable fixed return paths or report unresolved control flow; a single syntactic first return cannot prove every factory outcome satisfies required exports. Current source report (`audit/checklist/reviews/coverage-ecosystem-mock-exports-reachability-guards-2026-10-09-027.json`, untracked); final complete controls (`audit/checklist/evidence/coverage-mock-export-reachability-independent-controls-2026-10-09-027-final-fidelity.json`, untracked). Current unchanged source instruments/helpers and inert Git/TypeScript/text fixtures only.34 unchanged Node source-instrument tests passed;27 final primary independent controls and one additional byte-identical Rust-root comparison passed with59 TypeScript syntax parses. Three current source CLIs exited0. Synthetic VM factories use literal objects only; no fixture/application module imports, mounted Vitest/React UI, Cargo/Rust compilation, native host, database, provider, network, installation or production effects. Source copies are byte-identical and Git init/add is confined to scrubbed fixture roots. Initial root-level positive fixture had zero discovered tests, so its original failure is retained; corrected nested discovery and an independent root-level omission control qualify the census. Intermediate cache replay used source text with formatting differences; final replay asserts byte-identical mocked/subject/test sources before comparing cached and fresh paths. No source/tool/config fix or deployed incident is accepted.

## AUDIT-MOCK-EXPORT-RUNTIME-EXPORT-CENSUS-01

Severity: Medium. Status: open current source-instrument gap; source unchanged.

October 9 mock-export/reachability source qualification: An export-star barrel exposing foo/bar is assigned zero exports, so the complete missing-bar check and drift both pass; the corresponding explicit reexport list is rejected. In the opposite direction, export { type Shape } is counted as a missing runtime export and creates drift despite a factory covering the only runtime foo export. TypeScript AST marks Shape as type-only and synthetic transpilation erases it.

Additional source: `scripts/check-mock-exports.mjs:337-355,579-582,638-641`. Acceptance target: Resolve relevant barrel runtime exports and exclude every type-only export form before required-export and drift calculations; retain explicit-reexport rejection and type erasure counterguards. Current source report (`audit/checklist/reviews/coverage-ecosystem-mock-exports-reachability-guards-2026-10-09-027.json`, untracked); final complete controls (`audit/checklist/evidence/coverage-mock-export-reachability-independent-controls-2026-10-09-027-final-fidelity.json`, untracked). Current unchanged source instruments/helpers and inert Git/TypeScript/text fixtures only.34 unchanged Node source-instrument tests passed;27 final primary independent controls and one additional byte-identical Rust-root comparison passed with59 TypeScript syntax parses. Three current source CLIs exited0. Synthetic VM factories use literal objects only; no fixture/application module imports, mounted Vitest/React UI, Cargo/Rust compilation, native host, database, provider, network, installation or production effects. Source copies are byte-identical and Git init/add is confined to scrubbed fixture roots. Initial root-level positive fixture had zero discovered tests, so its original failure is retained; corrected nested discovery and an independent root-level omission control qualify the census. Intermediate cache replay used source text with formatting differences; final replay asserts byte-identical mocked/subject/test sources before comparing cached and fresh paths. No source/tool/config fix or deployed incident is accepted.

## AUDIT-MOCK-EXPORT-DESKTOP-ALIAS-01

Severity: Medium. Status: open current source-instrument gap; source unchanged.

October 9 mock-export/reachability source qualification: Current Desktop compiler/Vite alias owners map @ to src. A discovered Desktop test and subject using @/lib/mocked require omitted bar, but the complete guard resolves the mock to null and passes both checks. Replacing the configured alias with the equivalent relative specifier makes the complete fixture reject.

Additional source: `scripts/check-mock-exports.mjs:398-427,575-582; apps/desktop/tsconfig.json:12-19; apps/desktop/vite.config.ts:250-260`. Acceptance target: Resolve first-party surface aliases from their current canonical configuration or mark unresolved configured aliases as incomplete coverage before passing the check. Current source report (`audit/checklist/reviews/coverage-ecosystem-mock-exports-reachability-guards-2026-10-09-027.json`, untracked); final complete controls (`audit/checklist/evidence/coverage-mock-export-reachability-independent-controls-2026-10-09-027-final-fidelity.json`, untracked). Current unchanged source instruments/helpers and inert Git/TypeScript/text fixtures only.34 unchanged Node source-instrument tests passed;27 final primary independent controls and one additional byte-identical Rust-root comparison passed with59 TypeScript syntax parses. Three current source CLIs exited0. Synthetic VM factories use literal objects only; no fixture/application module imports, mounted Vitest/React UI, Cargo/Rust compilation, native host, database, provider, network, installation or production effects. Source copies are byte-identical and Git init/add is confined to scrubbed fixture roots. Initial root-level positive fixture had zero discovered tests, so its original failure is retained; corrected nested discovery and an independent root-level omission control qualify the census. Intermediate cache replay used source text with formatting differences; final replay asserts byte-identical mocked/subject/test sources before comparing cached and fresh paths. No source/tool/config fix or deployed incident is accepted.

## AUDIT-MOCK-EXPORT-CACHE-STATE-01

Severity: Low. Status: open current source-instrument gap; source unchanged.

October 9 mock-export/reachability source qualification: First scan caches a one-export module and foo-only subject. Mutating those same absolute files to add and require omitted bar still passes through the exported API. A fresh fixture with byte-identical final mocked/subject/test sources rejects. Global maps have no invocation/content invalidation. The standalone current CLI uses a fresh process; no current reused caller is accepted.

Additional source: `scripts/check-mock-exports.mjs:541-556,729-755`. Acceptance target: Bound source caches to an invocation or current source identity, preserving fresh-process behavior and making repeated guard API calls re-read changed files. Current source report (`audit/checklist/reviews/coverage-ecosystem-mock-exports-reachability-guards-2026-10-09-027.json`, untracked); final complete controls (`audit/checklist/evidence/coverage-mock-export-reachability-independent-controls-2026-10-09-027-final-fidelity.json`, untracked). Current unchanged source instruments/helpers and inert Git/TypeScript/text fixtures only.34 unchanged Node source-instrument tests passed;27 final primary independent controls and one additional byte-identical Rust-root comparison passed with59 TypeScript syntax parses. Three current source CLIs exited0. Synthetic VM factories use literal objects only; no fixture/application module imports, mounted Vitest/React UI, Cargo/Rust compilation, native host, database, provider, network, installation or production effects. Source copies are byte-identical and Git init/add is confined to scrubbed fixture roots. Initial root-level positive fixture had zero discovered tests, so its original failure is retained; corrected nested discovery and an independent root-level omission control qualify the census. Intermediate cache replay used source text with formatting differences; final replay asserts byte-identical mocked/subject/test sources before comparing cached and fresh paths. No source/tool/config fix or deployed incident is accepted.

## AUDIT-PRODUCTION-MOCK-COMMENT-STRING-01

Severity: Medium. Status: open current source-instrument gap.

Rechecked on main (3ccb6f6) on 2026-10-15: still present. Main changed `scripts/check-money-paths.mjs` after the 2026-09-27 copy this was found on without changing the cited logic; line numbers for it are main's.

October 9 mock-export/reachability source qualification: The complete byte-identical CLI with a zero mock-import ceiling rejects an ordinary static mock import. Adding two string literals containing /* and */ on opposite sides causes the raw block-comment regex to erase that real import and the same CLI passes. TypeScript independently parses one actual import and no actual block comment occurs. No fixture import executes.

Additional source: `scripts/lib/production-mocks.mjs:1,44-49,65-73`. Acceptance target: Distinguish comment tokens from string/template content before scanning executable import declarations and retain both real-comment exclusion and live-import rejection controls. Current source report (`audit/checklist/reviews/coverage-ecosystem-mock-exports-reachability-guards-2026-10-09-027.json`, untracked); final complete controls (`audit/checklist/evidence/coverage-mock-export-reachability-independent-controls-2026-10-09-027-final-fidelity.json`, untracked). Current unchanged source instruments/helpers and inert Git/TypeScript/text fixtures only.34 unchanged Node source-instrument tests passed;27 final primary independent controls and one additional byte-identical Rust-root comparison passed with59 TypeScript syntax parses. Three current source CLIs exited0. Synthetic VM factories use literal objects only; no fixture/application module imports, mounted Vitest/React UI, Cargo/Rust compilation, native host, database, provider, network, installation or production effects. Source copies are byte-identical and Git init/add is confined to scrubbed fixture roots. Initial root-level positive fixture had zero discovered tests, so its original failure is retained; corrected nested discovery and an independent root-level omission control qualify the census. Intermediate cache replay used source text with formatting differences; final replay asserts byte-identical mocked/subject/test sources before comparing cached and fresh paths. No source/tool/config fix or deployed incident is accepted.

October 9 money/usage/Work source qualification: The complete money API rejects a parseFloat hazard on a valid money writer. String literals containing /* and */ on opposite sides erase the actual hazard during raw block-comment removal and the same writer passes. The previously recorded production-import proof remains intact; this extends its lexical erasure owner.

Additional source: `scripts/check-money-paths.mjs:132-199`. Acceptance target: Identify comments separately from quoted string/template content before hazard scanning; retain both genuine comment exclusion and actual money-hazard rejection. Current source report (`audit/checklist/reviews/coverage-ecosystem-money-usage-worktask-guards-2026-10-09-028.json`, untracked); complete independent controls (`audit/checklist/evidence/coverage-money-usage-worktask-independent-controls-2026-10-09-028-refined.json`, untracked). Unchanged complete source-instrument APIs and byte-identical CLI copies over isolated inert TypeScript/SQL text only.44 unchanged tests and35 final independent controls passed;62 TypeScript fixture parses establish syntax only. Four actual current source CLIs exited0. Two isolated literal arithmetic expressions execute in a VM; no application or fixture module imports, monetary writes, SQL, database, native host, provider, network, browser, build, installation, production action or real checkout staging occurs. Git used by unchanged tests is confined to scrubbed fixture roots. Initial11-control receipt preserves a failed CLI assertion: /tmp versus /private/tmp prevented the copied guard main from running. Final runner normalizes executable/cwd realpaths and asserts nonempty guard output. Source/tool/config files are unchanged; no current product incident or runtime acceptance is established.

October 9 organization/pagination/tier source qualification: A complete API fixture discovers an actual page reader and rejects its missing helper. Quoted /* and */ markers placed around that reader cause raw block-comment removal to erase it; complete API reports0paged routes and passes. TypeScript syntax parses retain the actual reader and source string literals. This extends the existing quoted-marker erasure owner.

Additional source: `scripts/check-pagination-contract.mjs:29-30,46-60`. Acceptance target: Recognize true comment tokens independently from quoted content before page-reader discovery; retain genuine comment exclusion and actual query-reader detection. Current source report (`audit/checklist/reviews/coverage-ecosystem-org-pagination-tier-guards-2026-10-09-029.json`, untracked); complete independent controls (`audit/checklist/evidence/coverage-org-pagination-tier-independent-controls-2026-10-09-029.json`, untracked). Unchanged complete source guard APIs/CLIs and isolated inert TypeScript/TSX/SQL/Git fixtures only.37 unchanged Node tests and31 independent controls passed;220 fixture syntax parses establish syntax only. Four current source CLIs exited0. Literal fixtures extracted via actual TypeScript AST values, copied role CLI byte identity and nonempty complete CLI output are independently asserted; organization fixtures run fresh subprocesses to avoid graph-cache cross-case state. One literal synthetic function with an injected counter executes in a VM and proves zero terminal calls. No application/fixture module imports, actual authorization/mutation, SQL/database, native host, provider, network, browser, React mount, build, install, production action or real checkout staging. Git init/census and unchanged tests bind throwaway roots with inherited GIT variables scrubbed. Source/tool/config files remain unchanged; no deployed incident or runtime acceptance is established.

October9 reference/retention source qualification: Complete CLI accepts a data string naming an absent path without a comment marker and rejects a real comment referencing that path. Adding // only inside the data string makes it falsely reject as a source-comment reference. Independent TypeScript scanner reports0actual comment tokens. Existing quoted comment-boundary owner is extended with false rejection as well as its prior false erasure.

Additional source: `scripts/lib/comment-scan.mjs:58-115; scripts/check-reference-integrity.mjs:174-196`. Acceptance target: Distinguish true language comment tokens from quoted payloads before extracting/erasing references, retaining actual comment detection and inert string exclusion. Current source report (`audit/checklist/reviews/coverage-ecosystem-reference-retention-guards-2026-10-09-030.json`, untracked); complete independent controls (`audit/checklist/evidence/coverage-reference-retention-independent-controls-2026-10-09-030.json`, untracked). Current unchanged complete source guards/helpers and isolated inert TypeScript/SQL/JSON/Git fixture text only.42unchanged Node tests and25independent controls passed;8TypeScript parses plus scanner/actual array counts establish source-fixture roles. CLI copies are byte-identical, realpaths normalized and nonempty execution output asserted. Git fixture operations address explicit throwaway roots, scrub inherited GIT variables and use only local quoting config. Actual current source CLI statuses are0,0,0,1,0; repository organization rejects root .pnpm-store and specification validation explicitly skips a retired absent set. No application/fixture module imports, SQL/database/erasure/cleanup, native/provider/network/browser/build/install/production effects or real checkout staging. Actual source copies/parses/hashes/searches grant no semantic EOF credit. Source/tool/config files remain unchanged; full runtime product acceptance remains unknown.

October 9 project/prompt/public-share source qualification: A valid actual unscoped query is found and refused. String literals containing /* and */ on opposite sides of that same function cause raw block-comment removal to erase the query; the helper then passes. The TypeScript AST retains the function, and raw extractStatements sees its query. This extends existing quoted-marker erasure ownership; no fixture/application module or SQL executes.

Additional source: `scripts/lib/project-context-boundary.mjs:99-101,254-266`. Acceptance target: Recognize actual comments independently of quoted string/template content before query discovery; retain real-comment exclusion and actual unscoped-query refusal. Current source report (`audit/checklist/reviews/coverage-ecosystem-project-prompt-share-guards-2026-10-09-032.json`, untracked); independent controls (`audit/checklist/evidence/coverage-project-prompt-share-independent-controls-2026-10-09-032-final.json`, untracked). Thirty-five unchanged source guard tests, thirty-eight independent inert controls and four individual current source CLIs passed. Fifty-one TypeScript AST syntax/source-kind/binding checks establish fixture subjects. Complete CLI copies are byte-identical, realpath-bound and produce nonempty output. Git fixture operations use explicit throwaway roots and scrub inherited GIT variables; no real checkout staging. Imported modules are unchanged source instruments only; no application/fixture modules, actual SQL/database, project prompt/public share mutation, native/provider/network/browser/build/install/production action or runtime product acceptance. Source/config/tool files remain unchanged. Current CLI findings are textual guard evidence, not deployed incidents.

## AUDIT-MODULE-REACHABILITY-MISSING-TARGET-01

Severity: Low. Status: open current source-instrument gap; source unchanged.

October 9 mock-export/reachability source qualification: Running the unchanged complete CLI with an isolated empty cwd passes and prints success for Rust crate roots and TypeScript surfaces while reading no target source files. A present Rust source root lacking an entry rejects; a present ordinary orphan rejects. Current repository roots exist and its actual CLI passes; no current product missing-root defect is proved.

Additional source: `scripts/check-module-reachability.mjs:119-120,440-441,489-503`. Acceptance target: Require applicable target presence and nonempty entry/source census, or report explicit nonapplicability/incomplete scope rather than blanket reachability success. Current source report (`audit/checklist/reviews/coverage-ecosystem-mock-exports-reachability-guards-2026-10-09-027.json`, untracked); final complete controls (`audit/checklist/evidence/coverage-mock-export-reachability-independent-controls-2026-10-09-027-final-fidelity.json`, untracked). Current unchanged source instruments/helpers and inert Git/TypeScript/text fixtures only.34 unchanged Node source-instrument tests passed;27 final primary independent controls and one additional byte-identical Rust-root comparison passed with59 TypeScript syntax parses. Three current source CLIs exited0. Synthetic VM factories use literal objects only; no fixture/application module imports, mounted Vitest/React UI, Cargo/Rust compilation, native host, database, provider, network, installation or production effects. Source copies are byte-identical and Git init/add is confined to scrubbed fixture roots. Initial root-level positive fixture had zero discovered tests, so its original failure is retained; corrected nested discovery and an independent root-level omission control qualify the census. Intermediate cache replay used source text with formatting differences; final replay asserts byte-identical mocked/subject/test sources before comparing cached and fresh paths. No source/tool/config fix or deployed incident is accepted.

## AUDIT-MODULE-REACHABILITY-CARGO-ROOTS-01

Severity: Low. Status: open current source-instrument gap; source unchanged.

October 9 mock-export/reachability source qualification: A complete isolated CLI fixture includes Cargo.toml with autobins=false and one explicit src/main.rs binary. An unreferenced nested src/bin/nested/unselected.rs is still placed in the root stack and the check passes. A second complete CLI rejects an ordinary source with the exact same unused body. Independent final closure asserts byte-identical manifest, main and unused Rust bodies across both roots; only unused file location changes. Current official Cargo target documentation establishes that disabled autodiscovery leaves manually configured binary targets. The actual package compiled graph is unverified.

Additional source: `scripts/check-module-reachability.mjs:104-115,126-138`. Acceptance target: Derive Rust entrypoints from the authoritative package target configuration and include only relevant discovered/declared targets before source reachability claims. Current source report (`audit/checklist/reviews/coverage-ecosystem-mock-exports-reachability-guards-2026-10-09-027.json`, untracked); final complete controls (`audit/checklist/evidence/coverage-mock-export-reachability-independent-controls-2026-10-09-027-final-fidelity.json`, untracked). Current unchanged source instruments/helpers and inert Git/TypeScript/text fixtures only.34 unchanged Node source-instrument tests passed;27 final primary independent controls and one additional byte-identical Rust-root comparison passed with59 TypeScript syntax parses. Three current source CLIs exited0. Synthetic VM factories use literal objects only; no fixture/application module imports, mounted Vitest/React UI, Cargo/Rust compilation, native host, database, provider, network, installation or production effects. Source copies are byte-identical and Git init/add is confined to scrubbed fixture roots. Initial root-level positive fixture had zero discovered tests, so its original failure is retained; corrected nested discovery and an independent root-level omission control qualify the census. Intermediate cache replay used source text with formatting differences; final replay asserts byte-identical mocked/subject/test sources before comparing cached and fresh paths. No source/tool/config fix or deployed incident is accepted.

## AUDIT-MONEY-ROUNDING-INTEGER-CREDIT-01

Severity: Medium. Status: open current source-instrument gap.

Rechecked on main (3ccb6f6) on 2026-10-15: still present. Main changed `scripts/check-money-paths.mjs` after the 2026-09-27 copy this was found on without changing the cited logic; line numbers for it are main's.

October 9 money/usage/Work source qualification: Complete API rejects an unrounded rate product. Wrapping it in Math.abs passes even though the independent literal VM result Math.abs(1*0.5) is0.5. Placing an unrelated Math.round(0) earlier on the same line also makes the unrounded product pass. Genuine Math.round of that product is accepted and its literal result is an integer. No fixture monetary writer runs.

Additional source: `scripts/check-money-paths.mjs:87-119`. Acceptance target: Bind integer-resolution credit to the actual money expression and to a helper that establishes whole minor units; unrelated tokens or Math.abs must not discharge it. Current source report (`audit/checklist/reviews/coverage-ecosystem-money-usage-worktask-guards-2026-10-09-028.json`, untracked); complete independent controls (`audit/checklist/evidence/coverage-money-usage-worktask-independent-controls-2026-10-09-028-refined.json`, untracked). Unchanged complete source-instrument APIs and byte-identical CLI copies over isolated inert TypeScript/SQL text only.44 unchanged tests and35 final independent controls passed;62 TypeScript fixture parses establish syntax only. Four actual current source CLIs exited0. Two isolated literal arithmetic expressions execute in a VM; no application or fixture module imports, monetary writes, SQL, database, native host, provider, network, browser, build, installation, production action or real checkout staging occurs. Git used by unchanged tests is confined to scrubbed fixture roots. Initial11-control receipt preserves a failed CLI assertion: /tmp versus /private/tmp prevented the copied guard main from running. Final runner normalizes executable/cwd realpaths and asserts nonempty guard output. Source/tool/config files are unchanged; no current product incident or runtime acceptance is established.

## AUDIT-MONEY-IDENTIFIER-CENSUS-01

Severity: Medium. Status: open current source-instrument gap.

Rechecked on main (3ccb6f6) on 2026-10-15: still present. Main changed `scripts/check-money-paths.mjs` after the 2026-09-27 copy this was found on without changing the cited logic; line numbers for it are main's.

October 9 money/usage/Work source qualification: With a valid independent money-table anchor, an uppercase unquoted AMOUNT_CENTS column or quoted lowercase wallet table is omitted from the schema census and its parseFloat writer is not examined. With ordinary wallet schema retained, quoting only the lowercase wallet name in the writer also omits that writer. Ordinary lowercase unquoted writer/schema detects the float. Current PostgreSQL lexical documentation qualifies these equivalent identifier forms; no SQL is applied.

Additional source: `scripts/check-money-paths.mjs:17-39,61-85`. Acceptance target: Normalize supported SQL identifiers and preserve their relation/column binding in both schema and writer discovery; mixed-tree anchors must not hide skipped money subjects. Current source report (`audit/checklist/reviews/coverage-ecosystem-money-usage-worktask-guards-2026-10-09-028.json`, untracked); complete independent controls (`audit/checklist/evidence/coverage-money-usage-worktask-independent-controls-2026-10-09-028-refined.json`, untracked). Unchanged complete source-instrument APIs and byte-identical CLI copies over isolated inert TypeScript/SQL text only.44 unchanged tests and35 final independent controls passed;62 TypeScript fixture parses establish syntax only. Four actual current source CLIs exited0. Two isolated literal arithmetic expressions execute in a VM; no application or fixture module imports, monetary writes, SQL, database, native host, provider, network, browser, build, installation, production action or real checkout staging occurs. Git used by unchanged tests is confined to scrubbed fixture roots. Initial11-control receipt preserves a failed CLI assertion: /tmp versus /private/tmp prevented the copied guard main from running. Final runner normalizes executable/cwd realpaths and asserts nonempty guard output. Source/tool/config files are unchanged; no current product incident or runtime acceptance is established.

## AUDIT-USAGE-POOL-STATEMENT-TEXT-CLASSIFICATION-01

Severity: Medium. Status: open current source-instrument gap; source unchanged.

October 9 money/usage/Work source qualification: Complete API and byte-identical CLI reject an ordinary source_surface predicate. A semicolon inside memo string x;y separates the table from its later predicate and passes. Changing memo data to drop categorically exempts the actual filtered SELECT and passes. Account-only query passes as a valid counterguard. These are inert source statements, not account-pool execution.

Additional source: `scripts/check-usage-pool-is-shared.mjs:78-104`. Acceptance target: Recognize actual SQL statement/token roles before boundaries and DDL exemptions; semicolons and DDL words inside literal data must not hide effective filters. Current source report (`audit/checklist/reviews/coverage-ecosystem-money-usage-worktask-guards-2026-10-09-028.json`, untracked); complete independent controls (`audit/checklist/evidence/coverage-money-usage-worktask-independent-controls-2026-10-09-028-refined.json`, untracked). Unchanged complete source-instrument APIs and byte-identical CLI copies over isolated inert TypeScript/SQL text only.44 unchanged tests and35 final independent controls passed;62 TypeScript fixture parses establish syntax only. Four actual current source CLIs exited0. Two isolated literal arithmetic expressions execute in a VM; no application or fixture module imports, monetary writes, SQL, database, native host, provider, network, browser, build, installation, production action or real checkout staging occurs. Git used by unchanged tests is confined to scrubbed fixture roots. Initial11-control receipt preserves a failed CLI assertion: /tmp versus /private/tmp prevented the copied guard main from running. Final runner normalizes executable/cwd realpaths and asserts nonempty guard output. Source/tool/config files are unchanged; no current product incident or runtime acceptance is established.

## AUDIT-USAGE-POOL-CENSUS-COVERAGE-01

Severity: Medium. Status: open current source-instrument gap; source unchanged.

October 9 money/usage/Work source qualification: An uppercase CREDIT_TRANSACTIONS query with a real surface predicate is omitted while a lowercase account-only anchor supplies a nonempty one-file census; complete API/CLI pass. With every configured source directory absent, complete API/CLI report zero files and pass. Ordinary lowercase surface-filter query rejects. Repository roots currently exist and current CLI scans39 files, so no present missing-root product failure is claimed.

Additional source: `scripts/check-usage-pool-is-shared.mjs:38-50,107-145`. Acceptance target: Discover supported identifier case and require applicable configured roots/subjects or explicit nonapplicability before presenting a complete shared-pool check. Current source report (`audit/checklist/reviews/coverage-ecosystem-money-usage-worktask-guards-2026-10-09-028.json`, untracked); complete independent controls (`audit/checklist/evidence/coverage-money-usage-worktask-independent-controls-2026-10-09-028-refined.json`, untracked). Unchanged complete source-instrument APIs and byte-identical CLI copies over isolated inert TypeScript/SQL text only.44 unchanged tests and35 final independent controls passed;62 TypeScript fixture parses establish syntax only. Four actual current source CLIs exited0. Two isolated literal arithmetic expressions execute in a VM; no application or fixture module imports, monetary writes, SQL, database, native host, provider, network, browser, build, installation, production action or real checkout staging occurs. Git used by unchanged tests is confined to scrubbed fixture roots. Initial11-control receipt preserves a failed CLI assertion: /tmp versus /private/tmp prevented the copied guard main from running. Final runner normalizes executable/cwd realpaths and asserts nonempty guard output. Source/tool/config files are unchanged; no current product incident or runtime acceptance is established.

## AUDIT-USAGE-RESERVATION-KEY-BINDING-01

Severity: Medium. Status: open current source-instrument gap; source unchanged.

October 9 money/usage/Work source qualification: Both known unsafe-file anchors remain present. A direct randomUUID key rejects, but const key=randomUUID() followed by explicit idempotencyKey:key passes because the binding is unresolved. A helper exported as mintKey rejects when imported under that name, but the identical helper body imported as mintKey as buildKey passes because lookup uses the local alias rather than original export. TypeScript AST independently verifies that alias identity. Compact shorthand counterguard rejects as missing-key text; no claim that it traced randomUUID in that form.

Additional source: `scripts/check-usage-reservation-replay.mjs:169-179,194-215,233-290`. Acceptance target: Resolve actual local key bindings and imported original export identity, retaining direct/unaliased rejection and making unresolved relevant expressions explicit rather than silently stable. Current source report (`audit/checklist/reviews/coverage-ecosystem-money-usage-worktask-guards-2026-10-09-028.json`, untracked); complete independent controls (`audit/checklist/evidence/coverage-money-usage-worktask-independent-controls-2026-10-09-028-refined.json`, untracked). Unchanged complete source-instrument APIs and byte-identical CLI copies over isolated inert TypeScript/SQL text only.44 unchanged tests and35 final independent controls passed;62 TypeScript fixture parses establish syntax only. Four actual current source CLIs exited0. Two isolated literal arithmetic expressions execute in a VM; no application or fixture module imports, monetary writes, SQL, database, native host, provider, network, browser, build, installation, production action or real checkout staging occurs. Git used by unchanged tests is confined to scrubbed fixture roots. Initial11-control receipt preserves a failed CLI assertion: /tmp versus /private/tmp prevented the copied guard main from running. Final runner normalizes executable/cwd realpaths and asserts nonempty guard output. Source/tool/config files are unchanged; no current product incident or runtime acceptance is established.

## AUDIT-USAGE-RESERVATION-CALLEE-CENSUS-01

Severity: Medium. Status: open current source-instrument gap; source unchanged.

October 9 money/usage/Work source qualification: Complete API/CLI reject a third direct named reservation with a random key alongside both known unsafe anchors. Aliasing the same reservation function to reserve and calling reserve with the random key leaves only the two anchors in the call census and passes. This tests omission in a nonempty complete fixture; it does not claim that a wholly empty current CLI passes.

Additional source: `scripts/check-usage-reservation-replay.mjs:270-290,292-350`. Acceptance target: Bind invocation discovery to actual reservation symbols and supported alias forms, or report unresolved invocation coverage before claiming none new. Current source report (`audit/checklist/reviews/coverage-ecosystem-money-usage-worktask-guards-2026-10-09-028.json`, untracked); complete independent controls (`audit/checklist/evidence/coverage-money-usage-worktask-independent-controls-2026-10-09-028-refined.json`, untracked). Unchanged complete source-instrument APIs and byte-identical CLI copies over isolated inert TypeScript/SQL text only.44 unchanged tests and35 final independent controls passed;62 TypeScript fixture parses establish syntax only. Four actual current source CLIs exited0. Two isolated literal arithmetic expressions execute in a VM; no application or fixture module imports, monetary writes, SQL, database, native host, provider, network, browser, build, installation, production action or real checkout staging occurs. Git used by unchanged tests is confined to scrubbed fixture roots. Initial11-control receipt preserves a failed CLI assertion: /tmp versus /private/tmp prevented the copied guard main from running. Final runner normalizes executable/cwd realpaths and asserts nonempty guard output. Source/tool/config files are unchanged; no current product incident or runtime acceptance is established.

## AUDIT-WORKTASK-COMMENT-CENSUS-01

Severity: Low. Status: open current source-instrument gap; source unchanged.

October 9 money/usage/Work source qualification: A byte-identical full CLI correctly rejects a source tree containing no Work query. Adding only a source block comment containing an owned backtick query makes the same inert tree report one owner-scoped Work statement and pass. No query or application module executes.

Additional source: `scripts/check-worktask-scope.mjs:55-63,87-105`. Acceptance target: Count actual relevant source SQL expressions and preserve empty-subject refusal; query text inside source comments cannot establish reviewed Work statements. Current source report (`audit/checklist/reviews/coverage-ecosystem-money-usage-worktask-guards-2026-10-09-028.json`, untracked); complete independent controls (`audit/checklist/evidence/coverage-money-usage-worktask-independent-controls-2026-10-09-028-refined.json`, untracked). Unchanged complete source-instrument APIs and byte-identical CLI copies over isolated inert TypeScript/SQL text only.44 unchanged tests and35 final independent controls passed;62 TypeScript fixture parses establish syntax only. Four actual current source CLIs exited0. Two isolated literal arithmetic expressions execute in a VM; no application or fixture module imports, monetary writes, SQL, database, native host, provider, network, browser, build, installation, production action or real checkout staging occurs. Git used by unchanged tests is confined to scrubbed fixture roots. Initial11-control receipt preserves a failed CLI assertion: /tmp versus /private/tmp prevented the copied guard main from running. Final runner normalizes executable/cwd realpaths and asserts nonempty guard output. Source/tool/config files are unchanged; no current product incident or runtime acceptance is established.

## AUDIT-WORKTASK-SWEEP-BOUND-TEXT-01

Severity: Medium. Status: open current source-instrument gap; source unchanged.

October 9 money/usage/Work source qualification: The full unchanged CLI rejects an unowned UPDATE where true in the specifically exempted reaper path as an unbounded sweep. Adding only SQL comment updated_at < now() limit1 makes it pass with an independent owned anchor retained. Existing tests still reject a bounded-looking query in another filename. This establishes raw bound-marker credit, not a runtime reaper incident.

Additional source: `scripts/check-worktask-scope.mjs:32-33,71-95`. Acceptance target: Prove effective staleness and limit expressions on the actual sweep before granting the filename exemption; SQL-comment markers must not discharge those bounds. Current source report (`audit/checklist/reviews/coverage-ecosystem-money-usage-worktask-guards-2026-10-09-028.json`, untracked); complete independent controls (`audit/checklist/evidence/coverage-money-usage-worktask-independent-controls-2026-10-09-028-refined.json`, untracked). Unchanged complete source-instrument APIs and byte-identical CLI copies over isolated inert TypeScript/SQL text only.44 unchanged tests and35 final independent controls passed;62 TypeScript fixture parses establish syntax only. Four actual current source CLIs exited0. Two isolated literal arithmetic expressions execute in a VM; no application or fixture module imports, monetary writes, SQL, database, native host, provider, network, browser, build, installation, production action or real checkout staging occurs. Git used by unchanged tests is confined to scrubbed fixture roots. Initial11-control receipt preserves a failed CLI assertion: /tmp versus /private/tmp prevented the copied guard main from running. Final runner normalizes executable/cwd realpaths and asserts nonempty guard output. Source/tool/config files are unchanged; no current product incident or runtime acceptance is established.

## AUDIT-ORG-PERMISSION-HANDLER-AGGREGATION-01

Severity: Medium. Status: open current source-instrument gap.

Rechecked on main (3ccb6f6) on 2026-10-15: still present. Main changed `scripts/check-org-permissions.mjs` after the 2026-09-27 copy this was found on without changing the cited logic; line numbers for it are main's.

October 9 organization/pagination/tier source qualification: A complete valid CLI fixture passes and an unchecked PUT rejects. In a new route exporting a protected PUT and an unchecked DELETE, union of reachable terminal kinds is nonempty and the complete CLI passes both handlers. Actual TypeScript syntax for both handler bodies is retained; neither handler executes.

Additional source: `scripts/check-org-permissions.mjs:505-515`. Acceptance target: Require authorization proof independently for every relevant mutating handler/path; a protected sibling cannot discharge another handler. Current source report (`audit/checklist/reviews/coverage-ecosystem-org-pagination-tier-guards-2026-10-09-029.json`, untracked); complete independent controls (`audit/checklist/evidence/coverage-org-pagination-tier-independent-controls-2026-10-09-029.json`, untracked). Unchanged complete source guard APIs/CLIs and isolated inert TypeScript/TSX/SQL/Git fixtures only.37 unchanged Node tests and31 independent controls passed;220 fixture syntax parses establish syntax only. Four current source CLIs exited0. Literal fixtures extracted via actual TypeScript AST values, copied role CLI byte identity and nonempty complete CLI output are independently asserted; organization fixtures run fresh subprocesses to avoid graph-cache cross-case state. One literal synthetic function with an injected counter executes in a VM and proves zero terminal calls. No application/fixture module imports, actual authorization/mutation, SQL/database, native host, provider, network, browser, React mount, build, install, production action or real checkout staging. Git init/census and unchanged tests bind throwaway roots with inherited GIT variables scrubbed. Source/tool/config files remain unchanged; no deployed incident or runtime acceptance is established.

## AUDIT-ORG-PERMISSION-HANDLER-CENSUS-01

Severity: Medium. Status: open current source-instrument gap.

Rechecked on main (3ccb6f6) on 2026-10-15: still present. Main changed `scripts/check-org-permissions.mjs` after the 2026-09-27 copy this was found on without changing the cited logic; line numbers for it are main's.

October 9 organization/pagination/tier source qualification: A direct exported unchecked mutation rejects. Rewriting a new unchecked async erase function as export { erase as DELETE } omits that handler entirely; the complete valid anchor fixture still reports3mutating routes and passes. Independent syntax parsing retains the alias; this is nonempty-scope omission.

Additional source: `scripts/check-org-permissions.mjs:400-405,484-485`. Acceptance target: Enumerate actual exported mutating handler identities through supported declaration and export-list alias forms, or expose unresolved coverage. Current source report (`audit/checklist/reviews/coverage-ecosystem-org-pagination-tier-guards-2026-10-09-029.json`, untracked); complete independent controls (`audit/checklist/evidence/coverage-org-pagination-tier-independent-controls-2026-10-09-029.json`, untracked). Unchanged complete source guard APIs/CLIs and isolated inert TypeScript/TSX/SQL/Git fixtures only.37 unchanged Node tests and31 independent controls passed;220 fixture syntax parses establish syntax only. Four current source CLIs exited0. Literal fixtures extracted via actual TypeScript AST values, copied role CLI byte identity and nonempty complete CLI output are independently asserted; organization fixtures run fresh subprocesses to avoid graph-cache cross-case state. One literal synthetic function with an injected counter executes in a VM and proves zero terminal calls. No application/fixture module imports, actual authorization/mutation, SQL/database, native host, provider, network, browser, React mount, build, install, production action or real checkout staging. Git init/census and unchanged tests bind throwaway roots with inherited GIT variables scrubbed. Source/tool/config files remain unchanged; no deployed incident or runtime acceptance is established.

## AUDIT-ORG-PERMISSION-IMPORT-GRAPH-COVERAGE-01

Severity: Medium. Status: open current source-instrument gap.

Rechecked on main (3ccb6f6) on 2026-10-15: still present. Main changed `scripts/check-org-permissions.mjs` after the 2026-09-27 copy this was found on without changing the cited logic; line numbers for it are main's.

October 9 organization/pagination/tier source qualification: The complete CLI accepts a handler calling the declared permission terminal via named import. The equivalent namespace import and namespace.requireMemberPermission call is rejected as reaching no permission check. Actual service export and fresh-process graph are retained. This is false rejection, not a product permission bypass.

Additional source: `scripts/check-org-permissions.mjs:282-297,351-379`. Acceptance target: Resolve namespace/member symbol identity to the actual owned terminal while retaining unchecked-handler rejection and effect-sensitive proof. Current source report (`audit/checklist/reviews/coverage-ecosystem-org-pagination-tier-guards-2026-10-09-029.json`, untracked); complete independent controls (`audit/checklist/evidence/coverage-org-pagination-tier-independent-controls-2026-10-09-029.json`, untracked). Unchanged complete source guard APIs/CLIs and isolated inert TypeScript/TSX/SQL/Git fixtures only.37 unchanged Node tests and31 independent controls passed;220 fixture syntax parses establish syntax only. Four current source CLIs exited0. Literal fixtures extracted via actual TypeScript AST values, copied role CLI byte identity and nonempty complete CLI output are independently asserted; organization fixtures run fresh subprocesses to avoid graph-cache cross-case state. One literal synthetic function with an injected counter executes in a VM and proves zero terminal calls. No application/fixture module imports, actual authorization/mutation, SQL/database, native host, provider, network, browser, React mount, build, install, production action or real checkout staging. Git init/census and unchanged tests bind throwaway roots with inherited GIT variables scrubbed. Source/tool/config files remain unchanged; no deployed incident or runtime acceptance is established.

## AUDIT-ORG-PERMISSION-RLS-CONNECTION-TEXT-CREDIT-01

Severity: Medium. Status: open current source-instrument gap.

Rechecked on main (3ccb6f6) on 2026-10-15: still present. Main changed `scripts/check-org-permissions.mjs` after the 2026-09-27 copy this was found on without changing the cited logic; line numbers for it are main's.

October 9 organization/pagination/tier source qualification: With real declared write-policy anchors retained, a registered RLS route containing only a string getUserScopedDb( and an inert PUT passes the complete CLI connection check. No scoped database connection or route effect occurs; regular absent-policy controls still reject.

Additional source: `scripts/check-org-permissions.mjs:494-502`. Acceptance target: Bind the scoped connection check to the actual connection used by the relevant mutation; source data containing its name must not discharge it. Current source report (`audit/checklist/reviews/coverage-ecosystem-org-pagination-tier-guards-2026-10-09-029.json`, untracked); complete independent controls (`audit/checklist/evidence/coverage-org-pagination-tier-independent-controls-2026-10-09-029.json`, untracked). Unchanged complete source guard APIs/CLIs and isolated inert TypeScript/TSX/SQL/Git fixtures only.37 unchanged Node tests and31 independent controls passed;220 fixture syntax parses establish syntax only. Four current source CLIs exited0. Literal fixtures extracted via actual TypeScript AST values, copied role CLI byte identity and nonempty complete CLI output are independently asserted; organization fixtures run fresh subprocesses to avoid graph-cache cross-case state. One literal synthetic function with an injected counter executes in a VM and proves zero terminal calls. No application/fixture module imports, actual authorization/mutation, SQL/database, native host, provider, network, browser, React mount, build, install, production action or real checkout staging. Git init/census and unchanged tests bind throwaway roots with inherited GIT variables scrubbed. Source/tool/config files remain unchanged; no deployed incident or runtime acceptance is established.

## AUDIT-ORG-ROLE-LINE-CENSUS-01

Severity: Medium. Status: open current source-instrument gap; source unchanged.

October 9 organization/pagination/tier source qualification: All3required baseline migration files remain present. The complete copied CLI rejects an inline owner/admin array includes gate and an inline current_app_org_role() in SQL gate. Only formatting either actual form across lines makes the same source guard pass. Independent TypeScript parses retain actual array semantics; no SQL or handler executes.

Additional source: `scripts/check-org-role-checks.mjs:28-38,53-58,81-91`. Acceptance target: Scan structural role gates across supported formatting and SQL tokens rather than each physical line, preserving baseline/stale-entry checks. Current source report (`audit/checklist/reviews/coverage-ecosystem-org-pagination-tier-guards-2026-10-09-029.json`, untracked); complete independent controls (`audit/checklist/evidence/coverage-org-pagination-tier-independent-controls-2026-10-09-029.json`, untracked). Unchanged complete source guard APIs/CLIs and isolated inert TypeScript/TSX/SQL/Git fixtures only.37 unchanged Node tests and31 independent controls passed;220 fixture syntax parses establish syntax only. Four current source CLIs exited0. Literal fixtures extracted via actual TypeScript AST values, copied role CLI byte identity and nonempty complete CLI output are independently asserted; organization fixtures run fresh subprocesses to avoid graph-cache cross-case state. One literal synthetic function with an injected counter executes in a VM and proves zero terminal calls. No application/fixture module imports, actual authorization/mutation, SQL/database, native host, provider, network, browser, React mount, build, install, production action or real checkout staging. Git init/census and unchanged tests bind throwaway roots with inherited GIT variables scrubbed. Source/tool/config files remain unchanged; no deployed incident or runtime acceptance is established.

## AUDIT-PAGINATION-MARKER-AS-BEHAVIOR-01

Severity: Medium. Status: open current source-instrument gap; source unchanged.

October 9 organization/pagination/tier source qualification: Complete API rejects a discovered page reader with no cursor helper and accepts a genuine keyset fixture. Adding only unused keysetSql string data makes the unpaged query count as keyset and pass; unrelated offset string data makes a genuine keyset query fail as offset. A loading primitive with no consumer rejects, while a prompt string containing <PaginationContent/> passes. Replacing an actual buildPage export with only a comment export function buildPage also passes its helper-export check. All are inert source text with literal fixture fidelity asserted.

Additional source: `scripts/check-pagination-contract.mjs:50-64,79-81,136-165,207-229`. Acceptance target: Bind helper exports, cursor/offset behavior and rendered consumers to actual declarations, uses and relevant page queries; data/comments cannot establish them and unrelated words cannot classify them. Current source report (`audit/checklist/reviews/coverage-ecosystem-org-pagination-tier-guards-2026-10-09-029.json`, untracked); complete independent controls (`audit/checklist/evidence/coverage-org-pagination-tier-independent-controls-2026-10-09-029.json`, untracked). Unchanged complete source guard APIs/CLIs and isolated inert TypeScript/TSX/SQL/Git fixtures only.37 unchanged Node tests and31 independent controls passed;220 fixture syntax parses establish syntax only. Four current source CLIs exited0. Literal fixtures extracted via actual TypeScript AST values, copied role CLI byte identity and nonempty complete CLI output are independently asserted; organization fixtures run fresh subprocesses to avoid graph-cache cross-case state. One literal synthetic function with an injected counter executes in a VM and proves zero terminal calls. No application/fixture module imports, actual authorization/mutation, SQL/database, native host, provider, network, browser, React mount, build, install, production action or real checkout staging. Git init/census and unchanged tests bind throwaway roots with inherited GIT variables scrubbed. Source/tool/config files remain unchanged; no deployed incident or runtime acceptance is established.

## AUDIT-PAGINATION-PARAMETER-CENSUS-01

Severity: Medium. Status: open current source-instrument gap; source unchanged.

October 9 organization/pagination/tier source qualification: A route using the expected params.get cursor form is discovered and a missing helper rejects. Using paramsAlias.get on the same parameter object leaves the actual cursor read in valid TypeScript but complete API reports0paged routes and passes the fixture. Real valid contract/helper anchors remain.

Additional source: `scripts/check-pagination-contract.mjs:46-60`. Acceptance target: Resolve supported aliases of actual URL/search parameter receivers before route classification or explicitly retain unresolved subjects. Current source report (`audit/checklist/reviews/coverage-ecosystem-org-pagination-tier-guards-2026-10-09-029.json`, untracked); complete independent controls (`audit/checklist/evidence/coverage-org-pagination-tier-independent-controls-2026-10-09-029.json`, untracked). Unchanged complete source guard APIs/CLIs and isolated inert TypeScript/TSX/SQL/Git fixtures only.37 unchanged Node tests and31 independent controls passed;220 fixture syntax parses establish syntax only. Four current source CLIs exited0. Literal fixtures extracted via actual TypeScript AST values, copied role CLI byte identity and nonempty complete CLI output are independently asserted; organization fixtures run fresh subprocesses to avoid graph-cache cross-case state. One literal synthetic function with an injected counter executes in a VM and proves zero terminal calls. No application/fixture module imports, actual authorization/mutation, SQL/database, native host, provider, network, browser, React mount, build, install, production action or real checkout staging. Git init/census and unchanged tests bind throwaway roots with inherited GIT variables scrubbed. Source/tool/config files remain unchanged; no deployed incident or runtime acceptance is established.

## AUDIT-PLAN-TIER-COMPARISON-SYNTAX-01

Severity: Medium. Status: open current source-instrument gap.

Rechecked on main (3ccb6f6) on 2026-10-15: still present. Main changed `scripts/check-plan-tier-predicates.mjs` after the 2026-09-27 copy this was found on without changing the cited logic; line numbers for it are main's.

October 9 organization/pagination/tier source qualification: Complete source API rejects an actual single-quoted planTier===pro comparison. The equivalent double-quoted or multiline comparison passes, as does an actual comparison after a leading closed block comment because the whole line is skipped. A string containing the banned comparison alone falsely rejects. Independent current catalog extraction matches9private tier strings; present vocabulary drift is not a finding.

Additional source: `scripts/check-plan-tier-predicates.mjs:191-195,216-218,221-236`. Acceptance target: Bind raw tier policy detection to actual comparison expressions across supported quote/formatting forms; real comments/data and closed leading comments must be distinguished. Current source report (`audit/checklist/reviews/coverage-ecosystem-org-pagination-tier-guards-2026-10-09-029.json`, untracked); complete independent controls (`audit/checklist/evidence/coverage-org-pagination-tier-independent-controls-2026-10-09-029.json`, untracked). Unchanged complete source guard APIs/CLIs and isolated inert TypeScript/TSX/SQL/Git fixtures only.37 unchanged Node tests and31 independent controls passed;220 fixture syntax parses establish syntax only. Four current source CLIs exited0. Literal fixtures extracted via actual TypeScript AST values, copied role CLI byte identity and nonempty complete CLI output are independently asserted; organization fixtures run fresh subprocesses to avoid graph-cache cross-case state. One literal synthetic function with an injected counter executes in a VM and proves zero terminal calls. No application/fixture module imports, actual authorization/mutation, SQL/database, native host, provider, network, browser, React mount, build, install, production action or real checkout staging. Git init/census and unchanged tests bind throwaway roots with inherited GIT variables scrubbed. Source/tool/config files remain unchanged; no deployed incident or runtime acceptance is established.

## AUDIT-REFERENCE-CANONICAL-SUFFIX-CREDIT-01

Severity: Medium. Status: open current source-instrument gap; source unchanged.

October9 reference/retention source qualification: Complete CLI rejects an ordinary missing canonical link. README link apps/mobile/src/guard_probe.ts passes when only examples/archive/apps/mobile/src/guard_probe.ts exists. Independent filesystem check proves the actual named target absent; suffix fallback supplies credit.

Additional source: `scripts/lib/comment-scan.mjs:169-184; scripts/check-reference-integrity.mjs:205-228`. Acceptance target: Require the exact applicable root/relative target or an explicit enforced alias; a suffix match on a different canonical path cannot close a broken reference. Current source report (`audit/checklist/reviews/coverage-ecosystem-reference-retention-guards-2026-10-09-030.json`, untracked); complete independent controls (`audit/checklist/evidence/coverage-reference-retention-independent-controls-2026-10-09-030.json`, untracked). Current unchanged complete source guards/helpers and isolated inert TypeScript/SQL/JSON/Git fixture text only.42unchanged Node tests and25independent controls passed;8TypeScript parses plus scanner/actual array counts establish source-fixture roles. CLI copies are byte-identical, realpaths normalized and nonempty execution output asserted. Git fixture operations address explicit throwaway roots, scrub inherited GIT variables and use only local quoting config. Actual current source CLI statuses are0,0,0,1,0; repository organization rejects root .pnpm-store and specification validation explicitly skips a retired absent set. No application/fixture module imports, SQL/database/erasure/cleanup, native/provider/network/browser/build/install/production effects or real checkout staging. Actual source copies/parses/hashes/searches grant no semantic EOF credit. Source/tool/config files remain unchanged; full runtime product acceptance remains unknown.

## AUDIT-REFERENCE-PROVENANCE-SCOPE-01

Severity: Medium. Status: open current source-instrument gap; source unchanged.

October9 reference/retention source qualification: Complete CLI rejects a current missing Markdown link and a real source comment citing a missing file. Adding an unrelated Previously clause to the Markdown line suppresses that current link; adjoining a historical removed-module comment likewise suppresses the current comment via combined block text. Actual TypeScript comment syntax is retained.

Additional source: `scripts/check-reference-integrity.mjs:148-184,201-208,390-395`. Acceptance target: Scope provenance exemption to the specific historical reference; unrelated current links/comments in the same line or adjacent block remain checked. Current source report (`audit/checklist/reviews/coverage-ecosystem-reference-retention-guards-2026-10-09-030.json`, untracked); complete independent controls (`audit/checklist/evidence/coverage-reference-retention-independent-controls-2026-10-09-030.json`, untracked). Current unchanged complete source guards/helpers and isolated inert TypeScript/SQL/JSON/Git fixture text only.42unchanged Node tests and25independent controls passed;8TypeScript parses plus scanner/actual array counts establish source-fixture roles. CLI copies are byte-identical, realpaths normalized and nonempty execution output asserted. Git fixture operations address explicit throwaway roots, scrub inherited GIT variables and use only local quoting config. Actual current source CLI statuses are0,0,0,1,0; repository organization rejects root .pnpm-store and specification validation explicitly skips a retired absent set. No application/fixture module imports, SQL/database/erasure/cleanup, native/provider/network/browser/build/install/production effects or real checkout staging. Actual source copies/parses/hashes/searches grant no semantic EOF credit. Source/tool/config files remain unchanged; full runtime product acceptance remains unknown.

## AUDIT-REFERENCE-GIT-PATH-CENSUS-01

Severity: Medium. Status: open current source-instrument gap; source unchanged.

October9 reference/retention source qualification: In an explicit fresh Git fixture with core.quotepath=true, docs/café.md exists and contains an ordinary missing link, but the complete CLI passes because newline Git census emits a quoted escaped path. Setting only local core.quotepath=false in an otherwise identical fresh fixture makes the actual path discovered and the link rejected. No global Git config or real checkout changes.

Additional source: `scripts/lib/comment-scan.mjs:46-51; scripts/check-reference-integrity.mjs:362-375`. Acceptance target: Use an exact NUL-safe path census or decode Git output correctly; supported current Unicode filenames must remain actual scannable subjects regardless of quoting config. Current source report (`audit/checklist/reviews/coverage-ecosystem-reference-retention-guards-2026-10-09-030.json`, untracked); complete independent controls (`audit/checklist/evidence/coverage-reference-retention-independent-controls-2026-10-09-030.json`, untracked). Current unchanged complete source guards/helpers and isolated inert TypeScript/SQL/JSON/Git fixture text only.42unchanged Node tests and25independent controls passed;8TypeScript parses plus scanner/actual array counts establish source-fixture roles. CLI copies are byte-identical, realpaths normalized and nonempty execution output asserted. Git fixture operations address explicit throwaway roots, scrub inherited GIT variables and use only local quoting config. Actual current source CLI statuses are0,0,0,1,0; repository organization rejects root .pnpm-store and specification validation explicitly skips a retired absent set. No application/fixture module imports, SQL/database/erasure/cleanup, native/provider/network/browser/build/install/production effects or real checkout staging. Actual source copies/parses/hashes/searches grant no semantic EOF credit. Source/tool/config files remain unchanged; full runtime product acceptance remains unknown.

## AUDIT-REFERENCE-ALLOWLIST-REASON-TYPE-01

Severity: Medium. Status: open current source-instrument gap; source unchanged.

October9 reference/retention source qualification: Source API rejects a short string rationale. A complete CLI fixture with a missing README link passes when intentional pathPrefix README.md carries reason:{}; the object has no20character string rationale, yet truthiness/undefined length defeats validation before suppression.

Additional source: `scripts/check-reference-integrity.mjs:315-320,338-345,467-469`. Acceptance target: Require a substantive rationale of the declared string type and length before granting exemption, retaining ordinary valid reasons and short/invalid-type rejection. Current source report (`audit/checklist/reviews/coverage-ecosystem-reference-retention-guards-2026-10-09-030.json`, untracked); complete independent controls (`audit/checklist/evidence/coverage-reference-retention-independent-controls-2026-10-09-030.json`, untracked). Current unchanged complete source guards/helpers and isolated inert TypeScript/SQL/JSON/Git fixture text only.42unchanged Node tests and25independent controls passed;8TypeScript parses plus scanner/actual array counts establish source-fixture roles. CLI copies are byte-identical, realpaths normalized and nonempty execution output asserted. Git fixture operations address explicit throwaway roots, scrub inherited GIT variables and use only local quoting config. Actual current source CLI statuses are0,0,0,1,0; repository organization rejects root .pnpm-store and specification validation explicitly skips a retired absent set. No application/fixture module imports, SQL/database/erasure/cleanup, native/provider/network/browser/build/install/production effects or real checkout staging. Actual source copies/parses/hashes/searches grant no semantic EOF credit. Source/tool/config files remain unchanged; full runtime product acceptance remains unknown.

## AUDIT-RETENTION-INVENTORY-COMMENT-CREDIT-01

Severity: Medium. Status: open current source-instrument gap; source unchanged.

October9 reference/retention source qualification: Complete API with valid current schema/inventory anchors rejects a new email-bearing table outside every erasure rule. Adding only a // commented row inside USER_SCOPED_TABLES makes it named/reached and pass. Independently parsed actual array element count is unchanged; no erasure/SQL executes.

Additional source: `scripts/check-retention-graph.mjs:79-117,136-162`. Acceptance target: Bind named inventory entries to actual typed array/object declarations; comment text cannot establish a subject disposition or named graph node. Current source report (`audit/checklist/reviews/coverage-ecosystem-reference-retention-guards-2026-10-09-030.json`, untracked); complete independent controls (`audit/checklist/evidence/coverage-reference-retention-independent-controls-2026-10-09-030.json`, untracked). Current unchanged complete source guards/helpers and isolated inert TypeScript/SQL/JSON/Git fixture text only.42unchanged Node tests and25independent controls passed;8TypeScript parses plus scanner/actual array counts establish source-fixture roles. CLI copies are byte-identical, realpaths normalized and nonempty execution output asserted. Git fixture operations address explicit throwaway roots, scrub inherited GIT variables and use only local quoting config. Actual current source CLI statuses are0,0,0,1,0; repository organization rejects root .pnpm-store and specification validation explicitly skips a retired absent set. No application/fixture module imports, SQL/database/erasure/cleanup, native/provider/network/browser/build/install/production effects or real checkout staging. Actual source copies/parses/hashes/searches grant no semantic EOF credit. Source/tool/config files remain unchanged; full runtime product acceptance remains unknown.

## AUDIT-SPEC-DIFF-TOPLEVEL-TYPE-01

Severity: Low. Status: open current source-instrument gap; source unchanged.

October9 reference/retention source qualification: Complete CLI rejects a null roadmap top level with its descriptive object-validation error. Adding --diff against a valid prior set instead throws TypeError at Object.keys before reporting the collected descriptive error. Both outcomes fail closed; this is an instrument diagnostics/robustness defect, not false product acceptance.

Additional source: `scripts/check-spec-artifacts.mjs:65-69,122-128,176-188`. Acceptance target: Do not diff invalid top-level values before descriptive validation; null/array/nonobject previous and current artifacts retain deterministic scoped diagnostics. Current source report (`audit/checklist/reviews/coverage-ecosystem-reference-retention-guards-2026-10-09-030.json`, untracked); complete independent controls (`audit/checklist/evidence/coverage-reference-retention-independent-controls-2026-10-09-030.json`, untracked). Current unchanged complete source guards/helpers and isolated inert TypeScript/SQL/JSON/Git fixture text only.42unchanged Node tests and25independent controls passed;8TypeScript parses plus scanner/actual array counts establish source-fixture roles. CLI copies are byte-identical, realpaths normalized and nonempty execution output asserted. Git fixture operations address explicit throwaway roots, scrub inherited GIT variables and use only local quoting config. Actual current source CLI statuses are0,0,0,1,0; repository organization rejects root .pnpm-store and specification validation explicitly skips a retired absent set. No application/fixture module imports, SQL/database/erasure/cleanup, native/provider/network/browser/build/install/production effects or real checkout staging. Actual source copies/parses/hashes/searches grant no semantic EOF credit. Source/tool/config files remain unchanged; full runtime product acceptance remains unknown.

## AUDIT-REPO-REQUIRED-DIRECTORY-TYPE-01

Severity: Low. Status: open current source-instrument gap; source unchanged.

October9 reference/retention source qualification: Complete inert Git-root CLI accepts actual required directories and rejects absent docs/agent-context. Replacing only that nested directory with a literal data file makes the same complete CLI pass; independent stat confirms it is not a directory. No real repository path is replaced.

Additional source: `scripts/check-repo-organization.mjs:159-175`. Acceptance target: Verify actual required directory type and supported link policy rather than existence alone; preserve absent-path rejection and real directory acceptance. Current source report (`audit/checklist/reviews/coverage-ecosystem-reference-retention-guards-2026-10-09-030.json`, untracked); complete independent controls (`audit/checklist/evidence/coverage-reference-retention-independent-controls-2026-10-09-030.json`, untracked). Current unchanged complete source guards/helpers and isolated inert TypeScript/SQL/JSON/Git fixture text only.42unchanged Node tests and25independent controls passed;8TypeScript parses plus scanner/actual array counts establish source-fixture roles. CLI copies are byte-identical, realpaths normalized and nonempty execution output asserted. Git fixture operations address explicit throwaway roots, scrub inherited GIT variables and use only local quoting config. Actual current source CLI statuses are0,0,0,1,0; repository organization rejects root .pnpm-store and specification validation explicitly skips a retired absent set. No application/fixture module imports, SQL/database/erasure/cleanup, native/provider/network/browser/build/install/production effects or real checkout staging. Actual source copies/parses/hashes/searches grant no semantic EOF credit. Source/tool/config files remain unchanged; full runtime product acceptance remains unknown.

## AUDIT-RETRY-SEMANTICS-COMMENT-CREDIT-01

Severity: Medium. Status: open current source-instrument gap; source unchanged.

October 9 retry/runbook/registry source qualification: The complete current guard rejects an actual zero maxAttempts and absent classification declarations. An appended // maxAttempts comment overwrites that parsed zero to the required floor while the independently parsed object still has exactly one actual maxAttempts property valued zero. Comment-only classification exports, tool retrySafety/vocabulary and user retry function also pass while their actual AST declarations are absent.

Additional source: `scripts/check-retry-semantics.mjs:30-38,80-88,98-117,127-139`. Acceptance target: Bind policy values, exported classification/type fields, tool safety members and surface evidence to actual source declarations or scoped behavioral evidence; comments cannot replace required live obligations. Current source report (`audit/checklist/reviews/coverage-ecosystem-retry-runbook-registry-guards-2026-10-09-031.json`, untracked); independent controls (`audit/checklist/evidence/coverage-retry-runbook-registry-independent-controls-2026-10-09-031-refined.json`, untracked). Actual current unchanged complete source guards, byte-identical realpath-bound CLI copies and isolated inert TypeScript/JSON/Git fixture text only. Forty existing Node guard tests and thirty-seven independent controls passed; twenty-three TypeScript AST syntax/source-kind checks establish fixture roles. Four individual current source CLIs exited zero. Initial macOS /var-versus-/private temporary-path identity rejection was preserved before any control ran, then the scratch root was normalized; the byte-identity, realpath and nonempty complete CLI assertions remain required. One malformed-root flag refusal is retained as a counterguard. No application/fixture module imports, referenced command execution, SQL/database, Work operation, native/provider/network/browser/build/install/production effects or real checkout staging. Source/tool/config files remain unchanged; these are instrument limits rather than deployed product incidents or runtime acceptance.

## AUDIT-RETRY-REGISTRY-EMPTY-OBLIGATIONS-01

Severity: Medium. Status: open current source-instrument gap.

Rechecked on main (3ccb6f6) on 2026-10-15: still present. Main added context-window checks to `scripts/check-model-registry-integrity.mjs` and moved the free-plan disclosure read in `scripts/check-privacy-claims.mjs` to the shared compliance package, but an emptied registry and an empty cookie page still pass. Line numbers for those files and for `packages/ai/model-registry/scripts/compile.mjs` are main's.

October 9 retry/runbook/registry source qualification: A complete retry CLI accepts a valid-shaped contract with zero policy fields, classification markers, safety vocabulary members and user retry surfaces. A complete registry CLI accepts empty vocabularies and cast roots while an inert app source contains a real unchecked cast. With one declared JSON vocabulary and an actual predicate, an empty JSON member bucket also passes with members zero. Current normal contracts are nonempty; no claim that they are currently erased is made.

Additional source: `scripts/check-retry-semantics.mjs:53-76,87-94,116-123,127-145,148-163; scripts/check-registry-references.mjs:57-65,101-104,167-169,204-219`. Acceptance target: Validate canonical contract population and field shapes against declared owner obligations before accepting a scan; preserve meaningful zero-work refusals and nonempty current owner/counterguard evidence. Current source report (`audit/checklist/reviews/coverage-ecosystem-retry-runbook-registry-guards-2026-10-09-031.json`, untracked); independent controls (`audit/checklist/evidence/coverage-retry-runbook-registry-independent-controls-2026-10-09-031-refined.json`, untracked). Actual current unchanged complete source guards, byte-identical realpath-bound CLI copies and isolated inert TypeScript/JSON/Git fixture text only. Forty existing Node guard tests and thirty-seven independent controls passed; twenty-three TypeScript AST syntax/source-kind checks establish fixture roles. Four individual current source CLIs exited zero. Initial macOS /var-versus-/private temporary-path identity rejection was preserved before any control ran, then the scratch root was normalized; the byte-identity, realpath and nonempty complete CLI assertions remain required. One malformed-root flag refusal is retained as a counterguard. No application/fixture module imports, referenced command execution, SQL/database, Work operation, native/provider/network/browser/build/install/production effects or real checkout staging. Source/tool/config files remain unchanged; these are instrument limits rather than deployed product incidents or runtime acceptance.

October 9 model-population qualification: the complete unchanged compatibility-catalog CLI passes an existing empty model/provider catalog while its three source roots are absent. The complete unchanged registry-integrity CLI passes a private current-registry clone with model/route/harness/capability/limit/pricing maps emptied, reporting0models/0routes. Missing canonical catalog refuses; empty models with current routes or empty routes with current models refuses. Source: `scripts/check-model-catalog-integrity.mjs:124-136,211-251; scripts/check-model-registry-integrity.mjs:76-83,96-282`. This extends the same obligation-population cause and acceptance target with zero new cause. Current original guards pass with401models/509routes and the suite guard refuses zero adapters; separate strict schema/generated-artifact compilation at `packages/ai/model-registry/scripts/compile.mjs:2939-2944` and declared CI steps remain counterguards. No actual catalog/registry erasure, overall-chain malformed-input acceptance or product outage is established. Current source report (`audit/checklist/reviews/coverage-model-contract-guard-source-2026-10-09-041.json`, untracked); independent controls (`audit/checklist/evidence/coverage-model-contract-inert-controls-2026-10-09-041.json`, untracked); current guard/tests (`audit/checklist/evidence/coverage-model-contract-current-source-gates-2026-10-09-041.json`, untracked). All56 authored guard-only tests and four original source CLIs passed. Original fixture-path/probe refusals are retained separately. Source/tool/config remain unchanged; prior Root035 failure and all runtime/requirement acceptance remain open.

October 9 privacy/security/license qualification: An existing empty cookie page bypasses all seven required sentence/backing checks while the remaining baseline disclosure data stays present. An existing empty notice document passes with no attribution obligations. Changed cookie copy, missing signal file, leading denied license and unknown license refuse. Extend the existing nonempty-obligation acceptance target; no current document erasure or product incident claimed. Source: `scripts/check-privacy-claims.mjs:136-137`, `scripts/check-privacy-claims.mjs:167-215`, `scripts/check-licenses.mjs:84-88`, `scripts/check-licenses.mjs:151-159`. Current source report (`audit/checklist/reviews/coverage-privacy-security-claim-guard-source-2026-10-09-042.json`, untracked); independent controls (`audit/checklist/evidence/coverage-privacy-security-claim-inert-controls-2026-10-09-042.json`, untracked); current checker/test outcomes (`audit/checklist/evidence/coverage-privacy-security-claim-current-source-gates-2026-10-09-042.json`, untracked). Zero new cause; current security-checker failure and prior RLS suite failure remain separately open. No source or runtime mutation.

## AUDIT-UNSAFE-RETRY-INERT-SOURCE-CREDIT-01

Severity: Medium. Status: open current source-instrument gap; source unchanged.

October 9 retry/runbook/registry source qualification: The complete CLI rejects missing actual safety and an absent parking token. It accepts a safety property written only in a comment, counts a commented-out executor as one actual Work operation, and accepts a claim file with every bound/unsafe/outcome marker inside comments and zero actual function declarations. AST checks establish inactive source roles without running any executor.

Additional source: `scripts/check-unsafe-retry.mjs:64-85,107-127`. Acceptance target: Count actual executor calls and direct safety arguments, and bind replay/parking evidence to actual claim implementation; source comments must not establish call counts or enforcing branches. Current source report (`audit/checklist/reviews/coverage-ecosystem-retry-runbook-registry-guards-2026-10-09-031.json`, untracked); independent controls (`audit/checklist/evidence/coverage-retry-runbook-registry-independent-controls-2026-10-09-031-refined.json`, untracked). Actual current unchanged complete source guards, byte-identical realpath-bound CLI copies and isolated inert TypeScript/JSON/Git fixture text only. Forty existing Node guard tests and thirty-seven independent controls passed; twenty-three TypeScript AST syntax/source-kind checks establish fixture roles. Four individual current source CLIs exited zero. Initial macOS /var-versus-/private temporary-path identity rejection was preserved before any control ran, then the scratch root was normalized; the byte-identity, realpath and nonempty complete CLI assertions remain required. One malformed-root flag refusal is retained as a counterguard. No application/fixture module imports, referenced command execution, SQL/database, Work operation, native/provider/network/browser/build/install/production effects or real checkout staging. Source/tool/config files remain unchanged; these are instrument limits rather than deployed product incidents or runtime acceptance.

## AUDIT-UNSAFE-RETRY-CALL-ARGUMENT-BINDING-01

Severity: Medium. Status: open current source-instrument gap; source unchanged.

October 9 retry/runbook/registry source qualification: A call whose second argument has only other.retrySafety passes despite no direct retrySafety field. A string containing an opening parenthesis causes the lexical call collector to absorb an unrelated later retrySafety object and accept an actual missing argument field. Conversely, a closing parenthesis string hides a real direct safety field and is falsely rejected. Independent actual AST argument/property boundaries prove each fixture role.

Additional source: `scripts/check-unsafe-retry.mjs:48-57,68-76`. Acceptance target: Parse actual call boundaries and resolve the intended direct argument/property binding, preserving valid shorthand safety and missing-safety rejection; string/comment delimiters and neighboring data cannot alter the safety subject. Current source report (`audit/checklist/reviews/coverage-ecosystem-retry-runbook-registry-guards-2026-10-09-031.json`, untracked); independent controls (`audit/checklist/evidence/coverage-retry-runbook-registry-independent-controls-2026-10-09-031-refined.json`, untracked). Actual current unchanged complete source guards, byte-identical realpath-bound CLI copies and isolated inert TypeScript/JSON/Git fixture text only. Forty existing Node guard tests and thirty-seven independent controls passed; twenty-three TypeScript AST syntax/source-kind checks establish fixture roles. Four individual current source CLIs exited zero. Initial macOS /var-versus-/private temporary-path identity rejection was preserved before any control ran, then the scratch root was normalized; the byte-identity, realpath and nonempty complete CLI assertions remain required. One malformed-root flag refusal is retained as a counterguard. No application/fixture module imports, referenced command execution, SQL/database, Work operation, native/provider/network/browser/build/install/production effects or real checkout staging. Source/tool/config files remain unchanged; these are instrument limits rather than deployed product incidents or runtime acceptance.

## AUDIT-RUNBOOK-COMMAND-TOKENIZATION-01

Severity: Low. Status: open current source-instrument gap.

Rechecked on main (3ccb6f6) on 2026-10-15: still present. Main changed `scripts/check-runbook-commands.mjs` after the 2026-09-27 copy this was found on without changing the cited logic; line numbers for it are main's.

October 9 retry/runbook/registry source qualification: A direct missing node target is rejected, but PROBE_ENV=1 node scripts/missing.mjs resolves to no target and passes. pnpm --filter=@probe/absent ok loses its filter and credits the unrelated root script. A valid existing target quoted as node "scripts/probe.mjs" is falsely treated as a literal quote-bearing missing path. No target command is executed.

Additional source: `scripts/check-runbook-commands.mjs:75-113,225-255`. Acceptance target: Parse supported shell command forms and package filter ownership conservatively; valid quoted paths must resolve and recognized prefixes/options must not discard or misbind repository targets. Current source report (`audit/checklist/reviews/coverage-ecosystem-retry-runbook-registry-guards-2026-10-09-031.json`, untracked); independent controls (`audit/checklist/evidence/coverage-retry-runbook-registry-independent-controls-2026-10-09-031-refined.json`, untracked). Actual current unchanged complete source guards, byte-identical realpath-bound CLI copies and isolated inert TypeScript/JSON/Git fixture text only. Forty existing Node guard tests and thirty-seven independent controls passed; twenty-three TypeScript AST syntax/source-kind checks establish fixture roles. Four individual current source CLIs exited zero. Initial macOS /var-versus-/private temporary-path identity rejection was preserved before any control ran, then the scratch root was normalized; the byte-identity, realpath and nonempty complete CLI assertions remain required. One malformed-root flag refusal is retained as a counterguard. No application/fixture module imports, referenced command execution, SQL/database, Work operation, native/provider/network/browser/build/install/production effects or real checkout staging. Source/tool/config files remain unchanged; these are instrument limits rather than deployed product incidents or runtime acceptance.

## AUDIT-RUNBOOK-GLOB-PARENT-CREDIT-01

Severity: Low. Status: open current source-instrument gap.

Rechecked on main (3ccb6f6) on 2026-10-15: still present. Main changed `scripts/check-runbook-commands.mjs` after the 2026-09-27 copy this was found on without changing the cited logic; line numbers for it are main's.

October 9 retry/runbook/registry source qualification: A current runbook references scripts/missing-*.mjs. The scripts directory exists with only probe.mjs and no independently enumerated matching name, yet the guard passes. An absent glob parent is correctly rejected. This establishes path existence credit only, not an operator command failure.

Additional source: `scripts/check-runbook-commands.mjs:149-155,264-267`. Acceptance target: Require an actual supported glob match with a documented path/type scope, or refuse unsupported glob syntax; an existing parent alone cannot establish a referenced artifact. Current source report (`audit/checklist/reviews/coverage-ecosystem-retry-runbook-registry-guards-2026-10-09-031.json`, untracked); independent controls (`audit/checklist/evidence/coverage-retry-runbook-registry-independent-controls-2026-10-09-031-refined.json`, untracked). Actual current unchanged complete source guards, byte-identical realpath-bound CLI copies and isolated inert TypeScript/JSON/Git fixture text only. Forty existing Node guard tests and thirty-seven independent controls passed; twenty-three TypeScript AST syntax/source-kind checks establish fixture roles. Four individual current source CLIs exited zero. Initial macOS /var-versus-/private temporary-path identity rejection was preserved before any control ran, then the scratch root was normalized; the byte-identity, realpath and nonempty complete CLI assertions remain required. One malformed-root flag refusal is retained as a counterguard. No application/fixture module imports, referenced command execution, SQL/database, Work operation, native/provider/network/browser/build/install/production effects or real checkout staging. Source/tool/config files remain unchanged; these are instrument limits rather than deployed product incidents or runtime acceptance.

## AUDIT-RUNBOOK-NESTED-DISCOVERY-01

Severity: Low. Status: open current source-instrument gap.

Rechecked on main (3ccb6f6) on 2026-10-15: still present. Main changed `scripts/check-runbook-commands.mjs` after the 2026-09-27 copy this was found on without changing the cited logic; line numbers for it are main's.

October 9 retry/runbook/registry source qualification: With a valid top-level runbook present, a nested docs/runbooks/nested/current.md explicitly marked Current and naming a missing script is omitted and the guard passes. Moving the same current body to top-level current.md yields the expected missing-target error. The fixture obligation is current, not an inferred historical archived document.

Additional source: `scripts/check-runbook-commands.mjs:31-41,209-223`. Acceptance target: Define and enforce the complete current runbook inventory recursively or through an authoritative registry; nested current documents must not be silently omitted from all-runbook claims. Current source report (`audit/checklist/reviews/coverage-ecosystem-retry-runbook-registry-guards-2026-10-09-031.json`, untracked); independent controls (`audit/checklist/evidence/coverage-retry-runbook-registry-independent-controls-2026-10-09-031-refined.json`, untracked). Actual current unchanged complete source guards, byte-identical realpath-bound CLI copies and isolated inert TypeScript/JSON/Git fixture text only. Forty existing Node guard tests and thirty-seven independent controls passed; twenty-three TypeScript AST syntax/source-kind checks establish fixture roles. Four individual current source CLIs exited zero. Initial macOS /var-versus-/private temporary-path identity rejection was preserved before any control ran, then the scratch root was normalized; the byte-identity, realpath and nonempty complete CLI assertions remain required. One malformed-root flag refusal is retained as a counterguard. No application/fixture module imports, referenced command execution, SQL/database, Work operation, native/provider/network/browser/build/install/production effects or real checkout staging. Source/tool/config files remain unchanged; these are instrument limits rather than deployed product incidents or runtime acceptance.

## AUDIT-RUNBOOK-INHERITED-SCRIPT-CREDIT-01

Severity: Low. Status: open current source-instrument gap.

Rechecked on main (3ccb6f6) on 2026-10-15: still present. Main changed `scripts/check-runbook-commands.mjs` after the 2026-09-27 copy this was found on without changing the cited logic; line numbers for it are main's.

October 9 retry/runbook/registry source qualification: A package manifest owns only script ok. A runbook instructs pnpm toString; Object.hasOwn(scripts,"toString") is false but the inherited in test is true, so the guard passes. An ordinary nonexistent own script is rejected. No package-manager command was executed.

Additional source: `scripts/check-runbook-commands.mjs:116-146,245-255`. Acceptance target: Validate an own manifest script entry and its supported value type; inherited JavaScript object members cannot establish package scripts. Current source report (`audit/checklist/reviews/coverage-ecosystem-retry-runbook-registry-guards-2026-10-09-031.json`, untracked); independent controls (`audit/checklist/evidence/coverage-retry-runbook-registry-independent-controls-2026-10-09-031-refined.json`, untracked). Actual current unchanged complete source guards, byte-identical realpath-bound CLI copies and isolated inert TypeScript/JSON/Git fixture text only. Forty existing Node guard tests and thirty-seven independent controls passed; twenty-three TypeScript AST syntax/source-kind checks establish fixture roles. Four individual current source CLIs exited zero. Initial macOS /var-versus-/private temporary-path identity rejection was preserved before any control ran, then the scratch root was normalized; the byte-identity, realpath and nonempty complete CLI assertions remain required. One malformed-root flag refusal is retained as a counterguard. No application/fixture module imports, referenced command execution, SQL/database, Work operation, native/provider/network/browser/build/install/production effects or real checkout staging. Source/tool/config files remain unchanged; these are instrument limits rather than deployed product incidents or runtime acceptance.

## AUDIT-REGISTRY-SOURCE-KIND-CREDIT-01

Severity: Medium. Status: open current source-instrument gap.

Rechecked on main (3ccb6f6) on 2026-10-15: still present. Main changed `scripts/check-tool-registry.mjs` after the 2026-09-27 copy this was found on without changing the cited logic; line numbers for it are main's.

October 9 retry/runbook/registry source qualification: A vocabulary/predicate file whose entire source is commented out has zero actual statements but is credited with two members and an exported predicate. A source containing only a commented input as ProbeMode phrase is falsely reported as an unchecked cast, while the corresponding real cast is correctly rejected. Missing vocabulary source and normal valid vocabulary remain counterguards.

Additional source: `scripts/check-registry-references.mjs:67-76,80-95,126-137`. Acceptance target: Read actual array/union/predicate declarations and actual cast expressions, with source kind preserved; comments or quoted marker text cannot supply members, exported admission predicates or unchecked casts. Current source report (`audit/checklist/reviews/coverage-ecosystem-retry-runbook-registry-guards-2026-10-09-031.json`, untracked); independent controls (`audit/checklist/evidence/coverage-retry-runbook-registry-independent-controls-2026-10-09-031-refined.json`, untracked). Actual current unchanged complete source guards, byte-identical realpath-bound CLI copies and isolated inert TypeScript/JSON/Git fixture text only. Forty existing Node guard tests and thirty-seven independent controls passed; twenty-three TypeScript AST syntax/source-kind checks establish fixture roles. Four individual current source CLIs exited zero. Initial macOS /var-versus-/private temporary-path identity rejection was preserved before any control ran, then the scratch root was normalized; the byte-identity, realpath and nonempty complete CLI assertions remain required. One malformed-root flag refusal is retained as a counterguard. No application/fixture module imports, referenced command execution, SQL/database, Work operation, native/provider/network/browser/build/install/production effects or real checkout staging. Source/tool/config files remain unchanged; these are instrument limits rather than deployed product incidents or runtime acceptance.

October 9 Root034 skill/tool source qualification: Tool exports or execution-list names contained only in comments/strings count as real offered names and cause false refusal; complete C18 confirms a comment-only unknown export is refused. A commented or template-literal metadata table placed before the actual table supplies a phantom declaration, accepting an actually undeclared offered tool; C16 confirms complete CLI acceptance. These extend the existing source-kind owner: inert text cannot supply registry declaration/reference nodes. Original vocabulary/cast cases remain independently attributed.

Additional source: `scripts/check-registry-references.mjs:67-76,80-95,126-137; scripts/check-tool-registry.mjs:61-102`. Acceptance target: Preserve actual source kind when resolving registry arrays, exported constants, metadata declarations, predicates and casts; comment/literal examples cannot supply inventory, admission or unsafe-use evidence.

Current source report (`audit/checklist/reviews/coverage-ecosystem-tool-skill-approval-guards-2026-10-09-034.json`, untracked); independent source controls (`audit/checklist/evidence/coverage-skill-tool-registry-independent-challenge-2026-10-09-034.json`, untracked); root adoption checks (`audit/checklist/evidence/coverage-skill-tool-registry-independent-challenge-2026-10-09-034-root-adoption-validation.json`, untracked). Root adopted frozen source/fixture/control receipts after1468 current identity/range/verdict assertions. Sixty distinct independently replayed inert source controls:22 properties satisfied,27 API-or-CLI false acceptances,11 false refusals. Twenty complete byte-identical realpath-bound CLI controls include10false acceptances and2false refusals; initial omitted-owner API cases alone are rejected by empty-owner CLI validation, while fresh conventional-writer companions establish complete CLI acceptance. Seventeen unchanged tests are a subset of the parent30, not47distinct tests. Successful AST syntax parse invocations are226harness plus231independent; not typechecking or runtime proof. Original malformed literal16diagnostics and scratch-root admission failures are retained. Six adverse receipt controls rejected. Only unchanged source guard APIs/CLIs execute; fixtures and application modules remain inert. No actual tool/skill/authority grant, application/native/provider/browser/network/SQL/database/build/install/production effect, source/config/tool edits or checkout staging. Current application correctness and deployed availability remain unknown.

October9 source-guard qualification: Comment-only version vocabulary/constants/references and comment-only cache registries/account/workspace markers satisfy their complete original instruments. This extends the existing actual declaration/reference source-kind owner. Actual current version and authentication owners exist; the cache checker does not establish reset/cancel invocation, and that broader behavior remains a stated acceptance limit. No separate cache-comment ID or actual browser leak is adopted. Source: `scripts/check-version-registry.mjs:32-45,100-114,129-150; scripts/lib/workspace-cache-scope.mjs:18-44; scripts/check-workspace-cache-scope.mjs:44-74`. Actual source reading (`audit/checklist/reviews/coverage-cache-version-workflow-guard-source-2026-10-09-048.json`, untracked); original engine controls (`audit/checklist/evidence/coverage-cache-version-workflow-inert-controls-2026-10-09-048.json`, untracked); valid companions (`audit/checklist/evidence/coverage-cache-version-workflow-valid-companions-2026-10-09-048.json`, untracked); independent challenge (`audit/checklist/evidence/coverage-cache-version-workflow-independent-challenge-2026-10-09-048.json`, untracked). Zero new cause or runtime acceptance.

## AUDIT-REGISTRY-UNTRUSTED-RECORD-CAST-EXEMPTION-01

Severity: Medium. Status: open current source-instrument gap; source unchanged.

October 9 retry/runbook/registry source qualification: The guard rejects a direct input as ProbeMode cast but exempts Object.keys(input) as ProbeMode[] and Object.entries(input) as ProbeMode[] where input is an unconstrained Record<string,unknown> function parameter. AST checks prove a real cast of that input expression, with no canonical vocabulary-backed record owner. The intended canonical-record exception remains separate; no runtime boundary bypass is claimed.

Additional source: `scripts/check-registry-references.mjs:21-22,80-95`. Acceptance target: Restrict a keys/entries exception to an independently resolved record bound to the canonical vocabulary, or validate membership; textual Object.keys/entries alone does not admit externally supplied keys or entry tuples. Current source report (`audit/checklist/reviews/coverage-ecosystem-retry-runbook-registry-guards-2026-10-09-031.json`, untracked); independent controls (`audit/checklist/evidence/coverage-retry-runbook-registry-independent-controls-2026-10-09-031-refined.json`, untracked). Actual current unchanged complete source guards, byte-identical realpath-bound CLI copies and isolated inert TypeScript/JSON/Git fixture text only. Forty existing Node guard tests and thirty-seven independent controls passed; twenty-three TypeScript AST syntax/source-kind checks establish fixture roles. Four individual current source CLIs exited zero. Initial macOS /var-versus-/private temporary-path identity rejection was preserved before any control ran, then the scratch root was normalized; the byte-identity, realpath and nonempty complete CLI assertions remain required. One malformed-root flag refusal is retained as a counterguard. No application/fixture module imports, referenced command execution, SQL/database, Work operation, native/provider/network/browser/build/install/production effects or real checkout staging. Source/tool/config files remain unchanged; these are instrument limits rather than deployed product incidents or runtime acceptance.

## AUDIT-PROJECT-BASELINE-FILEWIDE-EXEMPTION-01

Severity: Medium. Status: open current source-instrument gap.

Rechecked on main (3ccb6f6) on 2026-10-15: still present for the project-context baseline. Main emptied the approval-mode baseline (`AUTO_MODE_BASELINE`) once the scheduled executor stopped pinning `auto`, so the same path-only exemption has no entry there today. Line numbers for `scripts/check-tool-gate-approval-mode.mjs` are main's.

October 9 project/prompt/public-share source qualification: Two independently discovered unscoped queries in the baselined retrieval-index-service.ts file yield two raw helper findings and zero run findings. Identical bodies under an unbaselined path yield two findings. The stated exception names an already-authorised function/callers, but suppression keys only on the file, so future unrelated reads receive the same exemption. Current production exception correctness is not disproved.

Additional source: `scripts/check-project-context-boundary.mjs:18-34`. Acceptance target: Bind the retained exception to its actual query/function and proven authorization path; unrelated reads in the same file must remain governed. Current source report (`audit/checklist/reviews/coverage-ecosystem-project-prompt-share-guards-2026-10-09-032.json`, untracked); independent controls (`audit/checklist/evidence/coverage-project-prompt-share-independent-controls-2026-10-09-032-final.json`, untracked). Thirty-five unchanged source guard tests, thirty-eight independent inert controls and four individual current source CLIs passed. Fifty-one TypeScript AST syntax/source-kind/binding checks establish fixture subjects. Complete CLI copies are byte-identical, realpath-bound and produce nonempty output. Git fixture operations use explicit throwaway roots and scrub inherited GIT variables; no real checkout staging. Imported modules are unchanged source instruments only; no application/fixture modules, actual SQL/database, project prompt/public share mutation, native/provider/network/browser/build/install/production action or runtime product acceptance. Source/config/tool files remain unchanged. Current CLI findings are textual guard evidence, not deployed incidents.

October 9 Root034 source qualification: The approval baseline names the scheduled executor path. Adding a second independently AST-observed unsafe auto call in that same file still yields zero failures with one baselined path, while the direct unsafe unbaselined caller refuses. This repeats the existing source-path-only exception mechanism; its canonical ID is retained and expanded, with no new baseline issue count. The unattended file/table baseline owner remains separately attributed because its key and statement obligations differ.

Additional source: `scripts/check-project-context-boundary.mjs:18-34; scripts/check-tool-gate-approval-mode.mjs:69-93`. Acceptance target: Bind retained source-path exceptions to actual independently identified operations and reject new unrelated obligations in the same file; preserve documented existing exceptions and stale-baseline refusal.

Current source report (`audit/checklist/reviews/coverage-ecosystem-tool-skill-approval-guards-2026-10-09-034.json`, untracked); final independent controls (`audit/checklist/evidence/coverage-tool-approval-containment-independent-controls-2026-10-09-034-refined.json`, untracked). Unchanged complete guard APIs and byte-identical realpath-bound CLIs over isolated inert source under explicit /tmp. Twenty-four distinct final case assertions succeeded, including13false acceptances and2false refusals against advertised properties; success does not mean guard properties held. Twenty-four TypeScript AST syntax/source-kind checks distinguish calls/properties/declarations from comments and literals. Source fixtures and application modules never import or execute; no TypeScript typecheck, actual tool loop, policy, model/provider/native/browser/network/SQL/DB/build/install/production action or checkout staging. Thirty unchanged source-guard tests and four current source CLIs passed. The original same-case successful receipt under macOS os.tmpdir remains preserved; the refined /tmp repeat is not counted as24additional distinct controls. Current production gate/role/cap correctness and tool outcomes remain unknown; no source fix or deployed incident is asserted.

October 9 Root034 skill/tool source qualification: The designated legal skill-tool module receives a whole-file exemption: appending an independently observed shell tool beside the legal skill tool still passes the complete CLI C13. A conventional illegal tool in another skill module refuses, and the sole legal skill tool passes. This repeats the existing path-only exemption mechanism; the legal module whitelist differs from a baseline entry but also fails to bind the permitted operation. Existing project/approval baseline and unattended file/table distinctions remain retained.

Additional source: `scripts/check-project-context-boundary.mjs:18-34; scripts/check-tool-gate-approval-mode.mjs:69-93; scripts/check-skill-authority.mjs:123-136`. Acceptance target: Bind each file exception to its named permitted operation/tool and reject independent additions in the same file; preserve genuine legal tools and explicit retained exceptions.

Current source report (`audit/checklist/reviews/coverage-ecosystem-tool-skill-approval-guards-2026-10-09-034.json`, untracked); independent source controls (`audit/checklist/evidence/coverage-skill-tool-registry-independent-challenge-2026-10-09-034.json`, untracked); root adoption checks (`audit/checklist/evidence/coverage-skill-tool-registry-independent-challenge-2026-10-09-034-root-adoption-validation.json`, untracked). Root adopted frozen source/fixture/control receipts after1468 current identity/range/verdict assertions. Sixty distinct independently replayed inert source controls:22 properties satisfied,27 API-or-CLI false acceptances,11 false refusals. Twenty complete byte-identical realpath-bound CLI controls include10false acceptances and2false refusals; initial omitted-owner API cases alone are rejected by empty-owner CLI validation, while fresh conventional-writer companions establish complete CLI acceptance. Seventeen unchanged tests are a subset of the parent30, not47distinct tests. Successful AST syntax parse invocations are226harness plus231independent; not typechecking or runtime proof. Original malformed literal16diagnostics and scratch-root admission failures are retained. Six adverse receipt controls rejected. Only unchanged source guard APIs/CLIs execute; fixtures and application modules remain inert. No actual tool/skill/authority grant, application/native/provider/browser/network/SQL/database/build/install/production effect, source/config/tool edits or checkout staging. Current application correctness and deployed availability remain unknown.

## AUDIT-PROJECT-CONTEXT-CALL-BINDING-01

Severity: Medium. Status: open current source-instrument gap; source unchanged.

October 9 project/prompt/public-share source qualification: An unchecked loader/render is rejected and a real null refusal before render passes. A const missing=!ctx expression with no conditional refusal passes, as does a null refusal only after rendering. A renderer without any loader is rejected, but an unused independent loader function makes the unscoped render pass. AST/function/order checks establish that the accepted text does not guard that render.

Additional source: `scripts/lib/project-context-boundary.mjs:167-201,203-252`. Acceptance target: Bind loader result, lifecycle/account admission, effective refusal and render argument along the relevant control/data flow; unrelated calls or inert/late tests cannot discharge the obligation. Current source report (`audit/checklist/reviews/coverage-ecosystem-project-prompt-share-guards-2026-10-09-032.json`, untracked); independent controls (`audit/checklist/evidence/coverage-project-prompt-share-independent-controls-2026-10-09-032-final.json`, untracked). Thirty-five unchanged source guard tests, thirty-eight independent inert controls and four individual current source CLIs passed. Fifty-one TypeScript AST syntax/source-kind/binding checks establish fixture subjects. Complete CLI copies are byte-identical, realpath-bound and produce nonempty output. Git fixture operations use explicit throwaway roots and scrub inherited GIT variables; no real checkout staging. Imported modules are unchanged source instruments only; no application/fixture modules, actual SQL/database, project prompt/public share mutation, native/provider/network/browser/build/install/production action or runtime product acceptance. Source/config/tool files remain unchanged. Current CLI findings are textual guard evidence, not deployed incidents.

## AUDIT-PROMPT-LAYER-RESOLVER-TEXT-CREDIT-01

Severity: Medium. Status: open current source-instrument gap; source unchanged.

October 9 project/prompt/public-share source qualification: An unresolved actual system-message object is refused. Adding an unused canonical resolver import makes auditAssembly pass with resolved one while the actual AST has zero calls. A commented import likewise passes with zero actual import declarations. A genuine resolver call and stale/empty-reason refusals remain paired counterguards.

Additional source: `scripts/lib/prompt-layer-assembly.mjs:33-42,78-80`. Acceptance target: Require assembly data to pass through the canonical layer resolver; import/comment/symbol presence without a bound live resolver call must not establish resolution. Current source report (`audit/checklist/reviews/coverage-ecosystem-project-prompt-share-guards-2026-10-09-032.json`, untracked); independent controls (`audit/checklist/evidence/coverage-project-prompt-share-independent-controls-2026-10-09-032-final.json`, untracked). Thirty-five unchanged source guard tests, thirty-eight independent inert controls and four individual current source CLIs passed. Fifty-one TypeScript AST syntax/source-kind/binding checks establish fixture subjects. Complete CLI copies are byte-identical, realpath-bound and produce nonempty output. Git fixture operations use explicit throwaway roots and scrub inherited GIT variables; no real checkout staging. Imported modules are unchanged source instruments only; no application/fixture modules, actual SQL/database, project prompt/public share mutation, native/provider/network/browser/build/install/production action or runtime product acceptance. Source/config/tool files remain unchanged. Current CLI findings are textual guard evidence, not deployed incidents.

## AUDIT-PROMPT-SYSTEM-LITERAL-DISCOVERY-01

Severity: Medium. Status: open current source-instrument gap; source unchanged.

October 9 project/prompt/public-share source qualification: AST-confirmed system-message objects with a quoted role property or more than two hundred characters between role and content are omitted. Separate nearby roleOnly and unrelated content objects are falsely treated as an assembler. The complete empty census CLI correctly fails; these are member-census errors in nonempty scans, not a claim that every empty helper result yields CLI success.

Additional source: `scripts/lib/prompt-layer-assembly.mjs:25-31,66-75`. Acceptance target: Discover actual supported message literals and bind role/content to the same object, preserving quoted keys and content beyond arbitrary lexical windows while excluding unrelated objects/types/comments. Current source report (`audit/checklist/reviews/coverage-ecosystem-project-prompt-share-guards-2026-10-09-032.json`, untracked); independent controls (`audit/checklist/evidence/coverage-project-prompt-share-independent-controls-2026-10-09-032-final.json`, untracked). Thirty-five unchanged source guard tests, thirty-eight independent inert controls and four individual current source CLIs passed. Fifty-one TypeScript AST syntax/source-kind/binding checks establish fixture subjects. Complete CLI copies are byte-identical, realpath-bound and produce nonempty output. Git fixture operations use explicit throwaway roots and scrub inherited GIT variables; no real checkout staging. Imported modules are unchanged source instruments only; no application/fixture modules, actual SQL/database, project prompt/public share mutation, native/provider/network/browser/build/install/production action or runtime product acceptance. Source/config/tool files remain unchanged. Current CLI findings are textual guard evidence, not deployed incidents.

## AUDIT-PROMPT-BASELINE-READ-FAILURE-01

Severity: Medium. Status: open current source-instrument gap; source unchanged.

October 9 project/prompt/public-share source qualification: An isolated Git repository contains a committed published-v1 digest a and current rewritten digest b. Complete CLI under HEAD refuses the rewrite. --base audit-nonexistent-base exits zero and reports nothing published yet because every Git-show error becomes null. A genuine existing commit without a published lock retains its intentional first-publication success.

Additional source: `scripts/lib/prompt-versions-append-only.mjs:12-24; scripts/check-prompt-versions-append-only.mjs:24-32`. Acceptance target: Prove the requested revision exists and distinguish an absent lock at a valid revision from Git/read failures; unavailable baselines must fail closed without relabeling existing publication as absent. Current source report (`audit/checklist/reviews/coverage-ecosystem-project-prompt-share-guards-2026-10-09-032.json`, untracked); independent controls (`audit/checklist/evidence/coverage-project-prompt-share-independent-controls-2026-10-09-032-final.json`, untracked). Thirty-five unchanged source guard tests, thirty-eight independent inert controls and four individual current source CLIs passed. Fifty-one TypeScript AST syntax/source-kind/binding checks establish fixture subjects. Complete CLI copies are byte-identical, realpath-bound and produce nonempty output. Git fixture operations use explicit throwaway roots and scrub inherited GIT variables; no real checkout staging. Imported modules are unchanged source instruments only; no application/fixture modules, actual SQL/database, project prompt/public share mutation, native/provider/network/browser/build/install/production action or runtime product acceptance. Source/config/tool files remain unchanged. Current CLI findings are textual guard evidence, not deployed incidents.

October 9 Root040 UI-gap qualification extends this existing baseline-read failure owner, without creating a second alias: the current tracker guard is given explicit refs/heads/agi-audit-nonexistent-baseline-20261009. A separate scrubbed read-only Git rev-parse --verify probe proves that revision is absent (exit128). The unchanged tracker guard then exits0 and relabels the failure as a new baseline, with341 real current records. An explicit base can therefore lack any before-count comparison while reporting success. Source `scripts/check-ui-gaps.mjs:134-170` treats all nonzero git-show statuses as file absence. The same acceptance target already governs this owner: establish revision identity and distinguish a missing file at a valid revision from Git/read failure. Current normal341-record guard passes, invalid ref syntax refuses in source, and locally absent automatic refs intentionally skip comparisons; no hosted CI outcome or existing product status is inferred. Actual read-only CLI receipts (`audit/checklist/evidence/coverage-ui-gap-current-source-guard-2026-10-09-040.json`, untracked), full source review (`audit/checklist/reviews/coverage-ui-gap-contract-guard-source-2026-10-09-040.json`, untracked). No source/Git/CSV mutation or application runtime ran.

## AUDIT-PROMPT-DIGEST-ARRAY-SHAPE-01

Severity: Low. Status: open current source-instrument gap; source unchanged.

October 9 project/prompt/public-share source qualification: Empty objects and arrays are rejected, but digests:["a"] passes the nonempty object-like check. A complete isolated committed/current array-lock CLI exits zero and reports one published stamp, with array index zero serving as the stamp. The actual current lock has thirteen normal published entries; separate manifest tests and prompt content behavior were not executed.

Additional source: `scripts/lib/prompt-versions-append-only.mjs:26-37`. Acceptance target: Validate a nonarray own-keyed digest map and the authoritative stamp/digest schema before append-only comparison; preserve normal additions and rewrite/removal refusal. Current source report (`audit/checklist/reviews/coverage-ecosystem-project-prompt-share-guards-2026-10-09-032.json`, untracked); independent controls (`audit/checklist/evidence/coverage-project-prompt-share-independent-controls-2026-10-09-032-final.json`, untracked). Thirty-five unchanged source guard tests, thirty-eight independent inert controls and four individual current source CLIs passed. Fifty-one TypeScript AST syntax/source-kind/binding checks establish fixture subjects. Complete CLI copies are byte-identical, realpath-bound and produce nonempty output. Git fixture operations use explicit throwaway roots and scrub inherited GIT variables; no real checkout staging. Imported modules are unchanged source instruments only; no application/fixture modules, actual SQL/database, project prompt/public share mutation, native/provider/network/browser/build/install/production action or runtime product acceptance. Source/config/tool files remain unchanged. Current CLI findings are textual guard evidence, not deployed incidents.

## AUDIT-PUBLIC-SHARE-PUBLISHER-CALL-BINDING-01

Severity: Medium. Status: open current source-instrument gap.

Rechecked on main (3ccb6f6) on 2026-10-15: still present. Main changed `scripts/check-public-share-dlp.mjs` after the 2026-09-27 copy this was found on without changing the cited logic; line numbers for it are main's.

October 9 project/prompt/public-share source qualification: A named exported publisher and actual uninspected route call are refused. An arrow exported publisher or import alias save is omitted and the complete CLI passes with one real writer discovered. A separate local nonpublishing publish function is falsely accused solely because its bare name equals an unrelated writer export. AST and import/function-role checks establish each identity.

Additional source: `scripts/check-public-share-dlp.mjs:77-86,104-118`. Acceptance target: Resolve actual publishing exports, imports/aliases and calls to their owner; supported export forms must be governed and unrelated same-name functions must not inherit another module's publishing obligation. Current source report (`audit/checklist/reviews/coverage-ecosystem-project-prompt-share-guards-2026-10-09-032.json`, untracked); independent controls (`audit/checklist/evidence/coverage-project-prompt-share-independent-controls-2026-10-09-032-final.json`, untracked). Thirty-five unchanged source guard tests, thirty-eight independent inert controls and four individual current source CLIs passed. Fifty-one TypeScript AST syntax/source-kind/binding checks establish fixture subjects. Complete CLI copies are byte-identical, realpath-bound and produce nonempty output. Git fixture operations use explicit throwaway roots and scrub inherited GIT variables; no real checkout staging. Imported modules are unchanged source instruments only; no application/fixture modules, actual SQL/database, project prompt/public share mutation, native/provider/network/browser/build/install/production action or runtime product acceptance. Source/config/tool files remain unchanged. Current CLI findings are textual guard evidence, not deployed incidents.

## AUDIT-PUBLIC-SHARE-TSX-CENSUS-01

Severity: Medium. Status: open current source-instrument gap.

Rechecked on main (3ccb6f6) on 2026-10-15: still present. Main changed `scripts/check-public-share-dlp.mjs` after the 2026-09-27 copy this was found on without changing the cited logic; line numbers for it are main's.

October 9 project/prompt/public-share source qualification: A complete fixture has a legitimate inspected .ts route writer, an uninspected exported .tsx publishing helper and its .ts route caller. The CLI passes and reports only one writer despite two independently present insertion-bearing sources. Ordinary uninspected .ts writers and an empty publisher census are refused. No TSX application module or SQL runs.

Additional source: `scripts/check-public-share-dlp.mjs:26-43`. Acceptance target: Define and enforce the complete production publisher source inventory, including supported .tsx owners, without allowing an unrelated valid writer to hide omitted publishing paths. Current source report (`audit/checklist/reviews/coverage-ecosystem-project-prompt-share-guards-2026-10-09-032.json`, untracked); independent controls (`audit/checklist/evidence/coverage-project-prompt-share-independent-controls-2026-10-09-032-final.json`, untracked). Thirty-five unchanged source guard tests, thirty-eight independent inert controls and four individual current source CLIs passed. Fifty-one TypeScript AST syntax/source-kind/binding checks establish fixture subjects. Complete CLI copies are byte-identical, realpath-bound and produce nonempty output. Git fixture operations use explicit throwaway roots and scrub inherited GIT variables; no real checkout staging. Imported modules are unchanged source instruments only; no application/fixture modules, actual SQL/database, project prompt/public share mutation, native/provider/network/browser/build/install/production action or runtime product acceptance. Source/config/tool files remain unchanged. Current CLI findings are textual guard evidence, not deployed incidents.

## AUDIT-CONFLICT-STAGED-CONTENT-BINDING-01

Severity: Low. Status: open source-instrument gap.

Source: `scripts/check-no-conflict-markers.py:4,79-86,97-107`.

October 9 Root033 current source qualification: An isolated indexed file contains three independently observed markers, while its clean worktree bytes make the complete copied CLI return clean. When current and indexed bytes both contain markers, detection refuses. Fresh CI with aligned bytes remains a counterguard; no fresh-CI bypass is claimed.

Acceptance target: Bind the check to its documented index/commit subject or explicitly enforce the intended worktree scope.

Evidence: current source report (`audit/checklist/reviews/coverage-ecosystem-neutral-idempotency-identifier-guards-2026-10-09-033.json`, untracked); actual controls (`audit/checklist/evidence/coverage-conflict-marker-independent-controls-2026-10-09-033.json`, untracked). Current unchanged source instruments and inert text/Git fixtures only. Forty distinct unchanged tests passed (31 Node and 9 Python); the independent repeat of 20 Node tests is included in those 31, not added to the distinct total. Sixty-eight fixture controls/assertions succeeded: 16 IDE, 7 conflict-marker and 45 independent idempotency/identifier cases. The 45 cases include 10 reproduced false acceptances, 22 working refusals, 34 satisfied advertised properties and one unresolved composite scope; assertion success does not mean all advertised guard properties held. Four current source CLIs exited zero. Fourteen TypeScript AST parses and 171 separate Node ESM syntax checks establish syntax only. No application/fixture module import, actual SQL/DB/migration, native/provider/browser/network/build/install/production behavior or real-checkout staging. The conflict reader-denial case imports only a copied source-guard module. Original failures and negative controls are preserved; no source fix or runtime product acceptance.

## AUDIT-CONFLICT-READER-ERROR-CLEAN-01

Severity: Medium. Status: open source-instrument gap.

Source: `scripts/check-no-conflict-markers.py:67-76,97-111`.

October 9 Root033 current source qualification: The discovered existing nonexcluded marked file normally yields three hits. Injecting only Path.open PermissionError yields zero hits and main prints clean with exit zero. Missing Git still fails closed. No real permission change, current repository read denial or product incident is observed.

Acceptance target: Refuse discovered readable-file scan errors; preserve intentional tracked-absent and nonfile skips and Git enumeration refusal.

Evidence: current source report (`audit/checklist/reviews/coverage-ecosystem-neutral-idempotency-identifier-guards-2026-10-09-033.json`, untracked); actual controls (`audit/checklist/evidence/coverage-conflict-marker-independent-controls-2026-10-09-033.json`, untracked). Current unchanged source instruments and inert text/Git fixtures only. Forty distinct unchanged tests passed (31 Node and 9 Python); the independent repeat of 20 Node tests is included in those 31, not added to the distinct total. Sixty-eight fixture controls/assertions succeeded: 16 IDE, 7 conflict-marker and 45 independent idempotency/identifier cases. The 45 cases include 10 reproduced false acceptances, 22 working refusals, 34 satisfied advertised properties and one unresolved composite scope; assertion success does not mean all advertised guard properties held. Four current source CLIs exited zero. Fourteen TypeScript AST parses and 171 separate Node ESM syntax checks establish syntax only. No application/fixture module import, actual SQL/DB/migration, native/provider/browser/network/build/install/production behavior or real-checkout staging. The conflict reader-denial case imports only a copied source-guard module. Original failures and negative controls are preserved; no source fix or runtime product acceptance.

## AUDIT-TOOL-APPROVAL-POLICY-BINDING-01

Severity: Medium. Status: open current source-instrument gap.

Rechecked on main (3ccb6f6) on 2026-10-15: still present. Main changed `scripts/check-tool-gate-approval-mode.mjs` after the 2026-09-27 copy this was found on without changing the cited logic; line numbers for it are main's.

October 9 Root034 source qualification: A direct auto literal is refused and manual/policy-expression controls pass. An auto constant named approvalMode, an inert loopInputs comment preceding auto, or a comment-only earlier approvalMode property all pass the complete guard. AST observes the actual auto initializer/property independently of comments. Double-quoted manual is falsely refused although AST identifies the same literal value. These are source-predicate results over inert calls, not typechecked or deployed caller acceptance.

Additional source: `scripts/check-tool-gate-approval-mode.mjs:37-59`. Acceptance target: Resolve actual option properties, literal values and policy-producing bindings; unrelated names/comments cannot discharge policy provenance and equivalent manual literals remain accepted.

Current source report (`audit/checklist/reviews/coverage-ecosystem-tool-skill-approval-guards-2026-10-09-034.json`, untracked); final independent controls (`audit/checklist/evidence/coverage-tool-approval-containment-independent-controls-2026-10-09-034-refined.json`, untracked). Unchanged complete guard APIs and byte-identical realpath-bound CLIs over isolated inert source under explicit /tmp. Twenty-four distinct final case assertions succeeded, including13false acceptances and2false refusals against advertised properties; success does not mean guard properties held. Twenty-four TypeScript AST syntax/source-kind checks distinguish calls/properties/declarations from comments and literals. Source fixtures and application modules never import or execute; no TypeScript typecheck, actual tool loop, policy, model/provider/native/browser/network/SQL/DB/build/install/production action or checkout staging. Thirty unchanged source-guard tests and four current source CLIs passed. The original same-case successful receipt under macOS os.tmpdir remains preserved; the refined /tmp repeat is not counted as24additional distinct controls. Current production gate/role/cap correctness and tool outcomes remain unknown; no source fix or deployed incident is asserted.

## AUDIT-TOOL-APPROVAL-DECLARATION-TEXT-EXEMPTION-01

Severity: Medium. Status: open current source-instrument gap.

Rechecked on main (3ccb6f6) on 2026-10-15: still present. Main changed `scripts/check-tool-gate-approval-mode.mjs` after the 2026-09-27 copy this was found on without changing the cited logic; line numbers for it are main's.

October 9 Root034 source qualification: One real auto call is refused. Adding only a comment or an unrelated string spelling function runToolLoop( makes the complete same caller pass. AST verifies one actual call and zero function declarations in both exempting variants. Raw call census stays nonempty. No actual canonical loop declaration/shadowing is the premise.

Additional source: `scripts/check-tool-gate-approval-mode.mjs:44-46`. Acceptance target: Limit declaration exclusion to its actual declaration node and continue checking independent calls; comment/literal declaration text cannot skip a whole entry scan.

Current source report (`audit/checklist/reviews/coverage-ecosystem-tool-skill-approval-guards-2026-10-09-034.json`, untracked); final independent controls (`audit/checklist/evidence/coverage-tool-approval-containment-independent-controls-2026-10-09-034-refined.json`, untracked). Unchanged complete guard APIs and byte-identical realpath-bound CLIs over isolated inert source under explicit /tmp. Twenty-four distinct final case assertions succeeded, including13false acceptances and2false refusals against advertised properties; success does not mean guard properties held. Twenty-four TypeScript AST syntax/source-kind checks distinguish calls/properties/declarations from comments and literals. Source fixtures and application modules never import or execute; no TypeScript typecheck, actual tool loop, policy, model/provider/native/browser/network/SQL/DB/build/install/production action or checkout staging. Thirty unchanged source-guard tests and four current source CLIs passed. The original same-case successful receipt under macOS os.tmpdir remains preserved; the refined /tmp repeat is not counted as24additional distinct controls. Current production gate/role/cap correctness and tool outcomes remain unknown; no source fix or deployed incident is asserted.

## AUDIT-TOOL-RESULT-CAP-CONTENT-BINDING-01

Severity: Medium. Status: open current source-instrument gap; source unchanged.

October 9 Root034 source qualification: Removing all cap text refuses, while a cap call on other data or a comment-only cap call makes uncapped pushed raw content pass. AST observes the pushed content expression and independently distinguishes the unrelated real call from zero actual calls in the comment fixture. No source cap helper or real message data is executed.

Additional source: `scripts/check-tool-gate-result-containment.mjs:61-63`. Acceptance target: Bind each relevant pushed content value to an effective output-cap result; comments and unrelated calls cannot provide containment evidence.

Current source report (`audit/checklist/reviews/coverage-ecosystem-tool-skill-approval-guards-2026-10-09-034.json`, untracked); final independent controls (`audit/checklist/evidence/coverage-tool-approval-containment-independent-controls-2026-10-09-034-refined.json`, untracked). Unchanged complete guard APIs and byte-identical realpath-bound CLIs over isolated inert source under explicit /tmp. Twenty-four distinct final case assertions succeeded, including13false acceptances and2false refusals against advertised properties; success does not mean guard properties held. Twenty-four TypeScript AST syntax/source-kind checks distinguish calls/properties/declarations from comments and literals. Source fixtures and application modules never import or execute; no TypeScript typecheck, actual tool loop, policy, model/provider/native/browser/network/SQL/DB/build/install/production action or checkout staging. Thirty unchanged source-guard tests and four current source CLIs passed. The original same-case successful receipt under macOS os.tmpdir remains preserved; the refined /tmp repeat is not counted as24additional distinct controls. Current production gate/role/cap correctness and tool outcomes remain unknown; no source fix or deployed incident is asserted.

## AUDIT-TOOL-RESULT-ROLE-OBJECT-BINDING-01

Severity: Medium. Status: open current source-instrument gap; source unchanged.

October 9 Root034 source qualification: A direct single-quoted system role and a computed role refuse. A double-quoted system role followed by a separate tool object, or a comment-only earlier tool role inside the system object, both pass. AST observes the actual system role. A valid tool role after500padding characters instead falsely refuses because discovery reads only400characters. These cases test exact object binding and bounded-window loss; no deployed system promotion is observed.

Additional source: `scripts/check-tool-gate-result-containment.mjs:31-36`. Acceptance target: Inspect each actual message object and resolve its own role; adjacent objects/comments cannot supply it and arbitrary character windows cannot erase an existing literal role.

Current source report (`audit/checklist/reviews/coverage-ecosystem-tool-skill-approval-guards-2026-10-09-034.json`, untracked); final independent controls (`audit/checklist/evidence/coverage-tool-approval-containment-independent-controls-2026-10-09-034-refined.json`, untracked). Unchanged complete guard APIs and byte-identical realpath-bound CLIs over isolated inert source under explicit /tmp. Twenty-four distinct final case assertions succeeded, including13false acceptances and2false refusals against advertised properties; success does not mean guard properties held. Twenty-four TypeScript AST syntax/source-kind checks distinguish calls/properties/declarations from comments and literals. Source fixtures and application modules never import or execute; no TypeScript typecheck, actual tool loop, policy, model/provider/native/browser/network/SQL/DB/build/install/production action or checkout staging. Thirty unchanged source-guard tests and four current source CLIs passed. The original same-case successful receipt under macOS os.tmpdir remains preserved; the refined /tmp repeat is not counted as24additional distinct controls. Current production gate/role/cap correctness and tool outcomes remain unknown; no source fix or deployed incident is asserted.

## AUDIT-TOOL-RESULT-WRITE-DISCOVERY-01

Severity: Medium. Status: open current source-instrument gap; source unchanged.

October 9 Root034 source qualification: A system message using spacing before the call parenthesis or an aliased object passes beside one known safe write; AST observes both actual writes. A comment-only safe-looking write also satisfies the CLI census despite zero AST writes. A genuinely absent write is refused by the CLI. Current tool-loop5272–5280 contains a real aliased assistantMessage with a safe assistant role, so current alias omission is confirmed while its actual writer supplies safe-role counterevidence.

Additional source: `scripts/check-tool-gate-result-containment.mjs:26-39,67-73`. Acceptance target: Enumerate actual write call expressions and object/value bindings independent of formatting; preserve zero-census refusal over real nodes and exclude comment-only text.

Current source report (`audit/checklist/reviews/coverage-ecosystem-tool-skill-approval-guards-2026-10-09-034.json`, untracked); final independent controls (`audit/checklist/evidence/coverage-tool-approval-containment-independent-controls-2026-10-09-034-refined.json`, untracked). Unchanged complete guard APIs and byte-identical realpath-bound CLIs over isolated inert source under explicit /tmp. Twenty-four distinct final case assertions succeeded, including13false acceptances and2false refusals against advertised properties; success does not mean guard properties held. Twenty-four TypeScript AST syntax/source-kind checks distinguish calls/properties/declarations from comments and literals. Source fixtures and application modules never import or execute; no TypeScript typecheck, actual tool loop, policy, model/provider/native/browser/network/SQL/DB/build/install/production action or checkout staging. Thirty unchanged source-guard tests and four current source CLIs passed. The original same-case successful receipt under macOS os.tmpdir remains preserved; the refined /tmp repeat is not counted as24additional distinct controls. Current production gate/role/cap correctness and tool outcomes remain unknown; no source fix or deployed incident is asserted.

## AUDIT-SKILL-AUTHORITY-EXPORT-CENSUS-01

Severity: Medium. Status: open current source-instrument gap; source unchanged.

October 9 Root034 skill/tool source qualification: Actual exported arrow, indented function, export-list and default-function writers are omitted by the lexical census. Four initial API fixtures have zero recognized connector-owner symbols and are refused by the complete CLI; fresh C11/C12/C19/C20 keep another conventional mutating export, then the same actual imported writer is missed by the complete CLI with nonempty owners/modules. Missing and genuinely empty owners remain refusing counterguards.

Additional source: `scripts/check-skill-authority.mjs:62-69`. Acceptance target: Resolve actual owner exports and writer bindings independently of formatting/export syntax; unrelated recognized writers cannot hide additional exported authority.

Current source report (`audit/checklist/reviews/coverage-ecosystem-tool-skill-approval-guards-2026-10-09-034.json`, untracked); independent source controls (`audit/checklist/evidence/coverage-skill-tool-registry-independent-challenge-2026-10-09-034.json`, untracked); root adoption checks (`audit/checklist/evidence/coverage-skill-tool-registry-independent-challenge-2026-10-09-034-root-adoption-validation.json`, untracked). Root adopted frozen source/fixture/control receipts after1468 current identity/range/verdict assertions. Sixty distinct independently replayed inert source controls:22 properties satisfied,27 API-or-CLI false acceptances,11 false refusals. Twenty complete byte-identical realpath-bound CLI controls include10false acceptances and2false refusals; initial omitted-owner API cases alone are rejected by empty-owner CLI validation, while fresh conventional-writer companions establish complete CLI acceptance. Seventeen unchanged tests are a subset of the parent30, not47distinct tests. Successful AST syntax parse invocations are226harness plus231independent; not typechecking or runtime proof. Original malformed literal16diagnostics and scratch-root admission failures are retained. Six adverse receipt controls rejected. Only unchanged source guard APIs/CLIs execute; fixtures and application modules remain inert. No actual tool/skill/authority grant, application/native/provider/browser/network/SQL/database/build/install/production effect, source/config/tool edits or checkout staging. Current application correctness and deployed availability remain unknown.

## AUDIT-SKILL-TOOL-DEFINITION-SYNTAX-01

Severity: Medium. Status: open current source-instrument gap; source unchanged.

October 9 Root034 skill/tool source qualification: A conventional single-quoted function tool outside the legal skill module refuses. Actual double-quoted function values or quoted type keys are missed; C03 confirms complete CLI acceptance of the double-quoted tool beside nonempty owner/module census. The conventional legal skill tool passes.

Additional source: `scripts/check-skill-authority.mjs:72-74,123-136`. Acceptance target: Recognize actual tool-definition object properties and literal values independently of quote spelling; distinguish real objects from examples.

Current source report (`audit/checklist/reviews/coverage-ecosystem-tool-skill-approval-guards-2026-10-09-034.json`, untracked); independent source controls (`audit/checklist/evidence/coverage-skill-tool-registry-independent-challenge-2026-10-09-034.json`, untracked); root adoption checks (`audit/checklist/evidence/coverage-skill-tool-registry-independent-challenge-2026-10-09-034-root-adoption-validation.json`, untracked). Root adopted frozen source/fixture/control receipts after1468 current identity/range/verdict assertions. Sixty distinct independently replayed inert source controls:22 properties satisfied,27 API-or-CLI false acceptances,11 false refusals. Twenty complete byte-identical realpath-bound CLI controls include10false acceptances and2false refusals; initial omitted-owner API cases alone are rejected by empty-owner CLI validation, while fresh conventional-writer companions establish complete CLI acceptance. Seventeen unchanged tests are a subset of the parent30, not47distinct tests. Successful AST syntax parse invocations are226harness plus231independent; not typechecking or runtime proof. Original malformed literal16diagnostics and scratch-root admission failures are retained. Six adverse receipt controls rejected. Only unchanged source guard APIs/CLIs execute; fixtures and application modules remain inert. No actual tool/skill/authority grant, application/native/provider/browser/network/SQL/database/build/install/production effect, source/config/tool edits or checkout staging. Current application correctness and deployed availability remain unknown.

## AUDIT-SKILL-AUTHORITY-REFERENCE-BINDING-01

Severity: Medium. Status: open current source-instrument gap; source unchanged.

October 9 Root034 skill/tool source qualification: An owner writer name inside a comment/string or an unrelated same-named local function triggers false refusal without an actual owner import. A comment-only tool example also triggers refusal. C17 confirms complete CLI refusal for documentation-only authority text. Actual imported conventional owner writers and actual conventional illegal tools remain refusing counterguards.

Additional source: `scripts/check-skill-authority.mjs:101-108,123-136`. Acceptance target: Resolve actual imported authority bindings and tool-definition nodes; comments, examples and same-named local functions cannot establish owner authority reach.

Current source report (`audit/checklist/reviews/coverage-ecosystem-tool-skill-approval-guards-2026-10-09-034.json`, untracked); independent source controls (`audit/checklist/evidence/coverage-skill-tool-registry-independent-challenge-2026-10-09-034.json`, untracked); root adoption checks (`audit/checklist/evidence/coverage-skill-tool-registry-independent-challenge-2026-10-09-034-root-adoption-validation.json`, untracked). Root adopted frozen source/fixture/control receipts after1468 current identity/range/verdict assertions. Sixty distinct independently replayed inert source controls:22 properties satisfied,27 API-or-CLI false acceptances,11 false refusals. Twenty complete byte-identical realpath-bound CLI controls include10false acceptances and2false refusals; initial omitted-owner API cases alone are rejected by empty-owner CLI validation, while fresh conventional-writer companions establish complete CLI acceptance. Seventeen unchanged tests are a subset of the parent30, not47distinct tests. Successful AST syntax parse invocations are226harness plus231independent; not typechecking or runtime proof. Original malformed literal16diagnostics and scratch-root admission failures are retained. Six adverse receipt controls rejected. Only unchanged source guard APIs/CLIs execute; fixtures and application modules remain inert. No actual tool/skill/authority grant, application/native/provider/browser/network/SQL/database/build/install/production effect, source/config/tool edits or checkout staging. Current application correctness and deployed availability remain unknown.

## AUDIT-TOOL-OFFERABLE-EXPORT-SYNTAX-01

Severity: Medium. Status: open current source-instrument gap.

Rechecked on main (3ccb6f6) on 2026-10-15: still present. Main changed `scripts/check-tool-registry.mjs` after the 2026-09-27 copy this was found on without changing the cited logic; line numbers for it are main's.

October 9 Root034 skill/tool source qualification: Actual double-quoted, extra-space, typed or export-list tool constants, and double-quoted execution-list members are omitted. A normal unknown exported tool refuses; complete C08 instead accepts the double-quoted unknown offer beside normal metadata and baseline tool inventory. These are source inventory controls rather than executed tool offers.

Additional source: `scripts/check-tool-registry.mjs:61-83`. Acceptance target: Inventory actual exported tool constants and named array/set members with equivalent syntax; omitted names must remain subject to metadata admission.

Current source report (`audit/checklist/reviews/coverage-ecosystem-tool-skill-approval-guards-2026-10-09-034.json`, untracked); independent source controls (`audit/checklist/evidence/coverage-skill-tool-registry-independent-challenge-2026-10-09-034.json`, untracked); root adoption checks (`audit/checklist/evidence/coverage-skill-tool-registry-independent-challenge-2026-10-09-034-root-adoption-validation.json`, untracked). Root adopted frozen source/fixture/control receipts after1468 current identity/range/verdict assertions. Sixty distinct independently replayed inert source controls:22 properties satisfied,27 API-or-CLI false acceptances,11 false refusals. Twenty complete byte-identical realpath-bound CLI controls include10false acceptances and2false refusals; initial omitted-owner API cases alone are rejected by empty-owner CLI validation, while fresh conventional-writer companions establish complete CLI acceptance. Seventeen unchanged tests are a subset of the parent30, not47distinct tests. Successful AST syntax parse invocations are226harness plus231independent; not typechecking or runtime proof. Original malformed literal16diagnostics and scratch-root admission failures are retained. Six adverse receipt controls rejected. Only unchanged source guard APIs/CLIs execute; fixtures and application modules remain inert. No actual tool/skill/authority grant, application/native/provider/browser/network/SQL/database/build/install/production effect, source/config/tool edits or checkout staging. Current application correctness and deployed availability remain unknown.

## AUDIT-TOOL-METADATA-OBJECT-BINDING-01

Severity: Medium. Status: open current source-instrument gap.

Rechecked on main (3ccb6f6) on 2026-10-15: still present. Main changed `scripts/check-tool-registry.mjs` after the 2026-09-27 copy this was found on without changing the cited logic; line numbers for it are main's.

October 9 Root034 skill/tool source qualification: Quoted actual tool keys or quoted required field keys are falsely refused at the API. A required top-level facet absent from the actual entry is instead credited by a comment, unrelated notes string or nested object; C14/C15 confirm complete CLI acceptance with the facet missing. Normal metadata passes and genuinely absent facets/metadata refuse. Entry-shape and facet-shape candidates share this actual metadata-object binding owner.

Additional source: `scripts/check-tool-registry.mjs:86-102,133-138`. Acceptance target: Resolve the real metadata table entries and their own top-level fields, accepting equivalent quoted keys while excluding comments, strings and nested properties from required facets.

Current source report (`audit/checklist/reviews/coverage-ecosystem-tool-skill-approval-guards-2026-10-09-034.json`, untracked); independent source controls (`audit/checklist/evidence/coverage-skill-tool-registry-independent-challenge-2026-10-09-034.json`, untracked); root adoption checks (`audit/checklist/evidence/coverage-skill-tool-registry-independent-challenge-2026-10-09-034-root-adoption-validation.json`, untracked). Root adopted frozen source/fixture/control receipts after1468 current identity/range/verdict assertions. Sixty distinct independently replayed inert source controls:22 properties satisfied,27 API-or-CLI false acceptances,11 false refusals. Twenty complete byte-identical realpath-bound CLI controls include10false acceptances and2false refusals; initial omitted-owner API cases alone are rejected by empty-owner CLI validation, while fresh conventional-writer companions establish complete CLI acceptance. Seventeen unchanged tests are a subset of the parent30, not47distinct tests. Successful AST syntax parse invocations are226harness plus231independent; not typechecking or runtime proof. Original malformed literal16diagnostics and scratch-root admission failures are retained. Six adverse receipt controls rejected. Only unchanged source guard APIs/CLIs execute; fixtures and application modules remain inert. No actual tool/skill/authority grant, application/native/provider/browser/network/SQL/database/build/install/production effect, source/config/tool edits or checkout staging. Current application correctness and deployed availability remain unknown.

## AUDIT-RAW-ERROR-WRAPPER-BINDING-01

Severity: Medium. Status: open source-instrument gap.

Rechecked on main (3ccb6f6) on 2026-10-15: still present. Main changed `scripts/lib/raw-error-to-user.mjs` after the 2026-09-27 copy this was found on without changing the cited logic; line numbers for it are main's.

October 9 Root035 source qualification: An actual raw-error setter refuses and an import of the actual canonical UI toUserMessage passes. A local function named toUserMessage that returns err.message, or a caller-supplied same-named function parameter, also receives wrapper credit. AST witnesses actual local return/parameter and source calls; the helper does not resolve the canonical import/binding. These cases prove insufficient source-wrapper provenance, not a current rendered leak.

Additional source: `scripts/lib/raw-error-to-user.mjs:82-95`. Acceptance target: Resolve actual conversion-wrapper bindings and exclude pass-through or caller-supplied same-named functions from canonical conversion credit.

Current source report (`audit/checklist/reviews/coverage-ecosystem-error-html-rls-write-guards-2026-10-09-035.json`, untracked); actual controls (`audit/checklist/evidence/coverage-raw-error-independent-controls-2026-10-09-035-refined.json`, untracked). Twenty distinct unchanged source-API/complete CLI property controls have11satisfied properties and9false acceptances; fourteen inert TypeScript AST syntax/source-shape checks. The initial successful same-case receipt remains preserved; refined complete CLI controls use three distinct byte-identical realpath trees and add no distinct cases. Independent fixture/pin/verdict metadata109assertions and5rejecting controls passed. Canonical UI error helper and actual flagged Gmail source were read as text, never imported/executed. Fifty-five unchanged authored tests:54passed/1failed; current RLS CLI1 reproduces the failing repository-positive assertion, other3CLIs0. No application/fixture modules, actual error UI/DOM, SQL/database/native/provider/browser/network/build/install/production effects or checkout staging; no source/config/tool changes or runtime incident accepted.

## AUDIT-RAW-ERROR-SOURCE-SHAPE-COVERAGE-01

Severity: Medium. Status: open source-instrument gap.

Rechecked on main (3ccb6f6) on 2026-10-15: still present. Main added mobile sinks, a JSX child check and a timer exclusion, but `failure.message`, computed `err['message']` and `toast['error']`, and quoted `'isError'` keys are still missed. Line numbers for `scripts/lib/raw-error-to-user.mjs` are main's.

October 9 Root035 source qualification: AST-observed Error-typed failure.message, computed err[message] and toast[error] access, and quoted actual isError/content keys are missed while equivalent conventional identifiers refuse. Actual comments/logging remain accepting counterguards; conventional interpolated failure objects refuse. The direct non-prose result-message exclusion is explicitly declared by this helper and retained separately rather than included in the issue.

Additional source: `scripts/lib/raw-error-to-user.mjs:61-79,89-95,124-150`. Acceptance target: Discover actual equivalent error-message/sink/property bindings independent of local spelling and quoted/computed syntax, preserving declared out-of-scope logger and direct-result cases.

Current source report (`audit/checklist/reviews/coverage-ecosystem-error-html-rls-write-guards-2026-10-09-035.json`, untracked); actual controls (`audit/checklist/evidence/coverage-raw-error-independent-controls-2026-10-09-035-refined.json`, untracked). Twenty distinct unchanged source-API/complete CLI property controls have11satisfied properties and9false acceptances; fourteen inert TypeScript AST syntax/source-shape checks. The initial successful same-case receipt remains preserved; refined complete CLI controls use three distinct byte-identical realpath trees and add no distinct cases. Independent fixture/pin/verdict metadata109assertions and5rejecting controls passed. Canonical UI error helper and actual flagged Gmail source were read as text, never imported/executed. Fifty-five unchanged authored tests:54passed/1failed; current RLS CLI1 reproduces the failing repository-positive assertion, other3CLIs0. No application/fixture modules, actual error UI/DOM, SQL/database/native/provider/browser/network/build/install/production effects or checkout staging; no source/config/tool changes or runtime incident accepted.

## AUDIT-RAW-ERROR-BASELINE-COUNT-VALIDATION-01

Severity: Low. Status: open source-instrument gap.

Rechecked on main (3ccb6f6) on 2026-10-15: still present. Main changed `scripts/lib/raw-error-to-user.mjs` and `scripts/check-raw-error-to-user.mjs` after the 2026-09-27 copy this was found on without changing the cited logic; line numbers for them are main's.

October 9 Root035 source qualification: A valid zero allowance refuses one actual finding, retained numeric one passes, and a missing count uses zero. Setting the allowance to the string not-a-count instead makes the API and complete byte-identical CLI accept the same actual raw-error source. Numeric coercion makes the comparison false; CLI still reports one remaining with none new. Each final CLI case has its own source/guard/baseline tree; malformed allowance bytes and exact nonempty outputs are preserved.

Additional source: `scripts/lib/raw-error-to-user.mjs:164-172; scripts/check-raw-error-to-user.mjs:64-80`. Acceptance target: Validate baseline count schema as bounded nonnegative integers before comparing current findings; invalid values must fail closed without weakening genuine retained counts.

Current source report (`audit/checklist/reviews/coverage-ecosystem-error-html-rls-write-guards-2026-10-09-035.json`, untracked); actual controls (`audit/checklist/evidence/coverage-raw-error-independent-controls-2026-10-09-035-refined.json`, untracked). Twenty distinct unchanged source-API/complete CLI property controls have11satisfied properties and9false acceptances; fourteen inert TypeScript AST syntax/source-shape checks. The initial successful same-case receipt remains preserved; refined complete CLI controls use three distinct byte-identical realpath trees and add no distinct cases. Independent fixture/pin/verdict metadata109assertions and5rejecting controls passed. Canonical UI error helper and actual flagged Gmail source were read as text, never imported/executed. Fifty-five unchanged authored tests:54passed/1failed; current RLS CLI1 reproduces the failing repository-positive assertion, other3CLIs0. No application/fixture modules, actual error UI/DOM, SQL/database/native/provider/browser/network/build/install/production effects or checkout staging; no source/config/tool changes or runtime incident accepted.

October9 source-guard qualification: The original theme baseline API refuses numeric ceiling growth but suppresses the same findings when the per-file allowance is a nonnumeric string. Numeric coercion creates the same existing malformed-count cause. Current theme baseline values are numeric; intentional per-file ceilings and113 remaining unpaired source occurrences are retained, without a malformed current-data or contrast incident claim. Source: `scripts/lib/theme-only-text-colours.mjs:41-47; scripts/check-theme-only-text-colours.mjs:61-62`. Actual source reading (`audit/checklist/reviews/coverage-cache-version-workflow-guard-source-2026-10-09-048.json`, untracked); original engine controls (`audit/checklist/evidence/coverage-cache-version-workflow-inert-controls-2026-10-09-048.json`, untracked); valid companions (`audit/checklist/evidence/coverage-cache-version-workflow-valid-companions-2026-10-09-048.json`, untracked); independent challenge (`audit/checklist/evidence/coverage-cache-version-workflow-independent-challenge-2026-10-09-048.json`, untracked). Zero new cause or runtime acceptance.

## AUDIT-GMAIL-RLS-BOUNDARY-REGRESSION-01

Severity: Medium. Status: open current source-contract regression; source unchanged.

October 9 Root035 source qualification: The actual unchanged55-test suite has54pass/1fail: the repository-positive RLS assertion. A separate current RLS CLI run exits1 on gmail-data-policy.ts, which is absent from the actual67-entry allowlist. Current source really imports/defaults/uses getNeonDb and queries web_conversations/cloud_agent_runs. SQL source explicitly binds userId and organizationId for its reads/update, and Gmail admission/route/cache checks are counterevidence to an unscoped-query premise. No database query, caller ownership or deployed policy was exercised; this is a concrete source-contract/test regression, not an established cross-tenant incident.

Additional source: `apps/web/lib/connectors/gmail-data-policy.ts:7,56-83,109-117,154-158; scripts/check-rls-boundary.test.mjs:39-42`. Acceptance target: Restore the current source RLS boundary/test contract while preserving the actual user/org/provenance checks. Resolve the database owner/authorized scoped exception rather than disabling the guard or changing the test expectation.

Current source report (`audit/checklist/reviews/coverage-ecosystem-error-html-rls-write-guards-2026-10-09-035.json`, untracked); actual controls (`audit/checklist/evidence/coverage-error-html-rls-write-current-source-gates-2026-10-09-035.json`, untracked). Twenty distinct unchanged source-API/complete CLI property controls have11satisfied properties and9false acceptances; fourteen inert TypeScript AST syntax/source-shape checks. The initial successful same-case receipt remains preserved; refined complete CLI controls use three distinct byte-identical realpath trees and add no distinct cases. Independent fixture/pin/verdict metadata109assertions and5rejecting controls passed. Canonical UI error helper and actual flagged Gmail source were read as text, never imported/executed. Fifty-five unchanged authored tests:54passed/1failed; current RLS CLI1 reproduces the failing repository-positive assertion, other3CLIs0. No application/fixture modules, actual error UI/DOM, SQL/database/native/provider/browser/network/build/install/production effects or checkout staging; no source/config/tool changes or runtime incident accepted.

October 9 independent RLS/write qualification preserves the existing Gmail source-contract regression, with 55 authored tests / 54 passes / 1 failure and direct RLS source CLI exit 1. The challenge independently validates the preserved receipts and does not add a second Gmail defect or a deployed cross-tenant incident. Root separately read the actual raw and scoped connection-owner signatures through EOF: getNeonDb returns DatabaseAdapter and getUserScopedDb accepts NextRequest and returns Promise<UserScopedDb>. Four same-case fixtures were refined to an awaited scoped call with db destructuring; the original synthetic string/direct-return shapes are retained as limited historical fixtures. These syntax-only witnesses do not validate authentication, factory policy or deployed RLS. Explicit Gmail user/org query predicates remain counterevidence. Evidence: independent RLS/write challenge (`audit/checklist/evidence/coverage-rls-write-independent-challenge-2026-10-09-035.json`, untracked), root adoption qualification (`audit/checklist/evidence/coverage-rls-write-independent-challenge-2026-10-09-035-root-adoption-validation.json`, untracked).

## AUDIT-HTML-SANITIZER-MODULE-CREDIT-01

Severity: Medium. Status: open current source instrument gap reviewed October9,2026; source unchanged.

An imported cleanHtml function that returns its input receives sanitizer credit when another function or a comment in the same defining module contains DOMPurify.sanitize. A declared but nonexported helper is also credited to an import. The AST witnesses distinguish actual bodies, absent exports and comment text. Ordinary imported/direct purifier controls accept, while an isolated pass-through helper and sanitizer-prefix plus dirty suffix refuse. The condition is insufficient source-function/import provenance; no runtime import or sanitizer exploit was executed.

Source: `scripts/lib/raw-html-sinks.mjs:184-192,336-369`. Evidence: independent HTML challenge (`audit/checklist/evidence/coverage-html-independent-challenge-2026-10-09-035.json`, untracked); root adoption qualification (`audit/checklist/evidence/coverage-html-independent-challenge-2026-10-09-035-root-adoption-validation.json`, untracked).

Limits: Fifty distinct inert source API/complete realpath CLI cases:21property-satisfied,24conditional falseacceptances and5scope/manual-trust/census observations. Initial48 and fresh reversed50 replays yield148CLI runs without adding distinct cases. Twenty-five adverse controls and607root identity/source/range/fixture/verdict assertions retained;113final AST syntax witness records are not typechecking or fixture execution. Current real inventory has integer counts; no actual application sanitizer/React/DOM/WebView/frame/browser/native/permissions or deployed exploit is established. Existing55-test suite has54passes/1RLS failure and current sourceCLI codes0/0/1/0; those unchanged failures remain explicit.

Acceptance target: Bind sanitizer approval to the actual exported function and its value flow, excluding unrelated module/comment markers.

## AUDIT-HTML-VALUE-BINDING-01

Severity: Medium. Status: open current source instrument gap reviewed October9,2026; source unchanged.

Caller parameters shadowing the imported DOMPurify name, a cleanHtml function or a safe literal still receive sanitizer/static credit. An overwritten safe literal is resolved from its earlier declaration. A mutated JSX sandbox policy similarly receives its earlier safe token value. Current raw helper rejects genuinely dangerous and unresolved dynamic JSX values, so the existing separate frame-guard dynamic-name finding must not be copied wholesale. These are binding/write tracking conditions in source measurement.

Source: `scripts/lib/raw-html-sinks.mjs:210-253,372-410,440-475`. Evidence: independent HTML challenge (`audit/checklist/evidence/coverage-html-independent-challenge-2026-10-09-035.json`, untracked); root adoption qualification (`audit/checklist/evidence/coverage-html-independent-challenge-2026-10-09-035-root-adoption-validation.json`, untracked).

Limits: Fifty distinct inert source API/complete realpath CLI cases:21property-satisfied,24conditional falseacceptances and5scope/manual-trust/census observations. Initial48 and fresh reversed50 replays yield148CLI runs without adding distinct cases. Twenty-five adverse controls and607root identity/source/range/fixture/verdict assertions retained;113final AST syntax witness records are not typechecking or fixture execution. Current real inventory has integer counts; no actual application sanitizer/React/DOM/WebView/frame/browser/native/permissions or deployed exploit is established. Existing55-test suite has54passes/1RLS failure and current sourceCLI codes0/0/1/0; those unchanged failures remain explicit.

Acceptance target: Resolve the actual lexical binding and relevant writes at each sink and frame policy; preserve refusal for unresolved and dangerous values.

## AUDIT-HTML-STRUCTURAL-TEST-TEXT-01

Severity: Medium. Status: open current source instrument gap reviewed October9,2026; source unchanged.

A configured structural module returning raw is credited when the test contains cleanSvg( and expect( only in a comment or an unused string, with no corresponding AST calls. Missing and marker-free tests refuse. Configured trust of an ordinary pass-through fixture is an explicit manual-trust observation rather than a newly proven sanitizer defect. The current application sanitizeSvg implementation/test was not executed by this challenge.

Source: `scripts/lib/raw-html-sinks.mjs:355-369; scripts/check-raw-html-sinks.mjs:144-154`. Evidence: independent HTML challenge (`audit/checklist/evidence/coverage-html-independent-challenge-2026-10-09-035.json`, untracked); root adoption qualification (`audit/checklist/evidence/coverage-html-independent-challenge-2026-10-09-035-root-adoption-validation.json`, untracked).

Limits: Fifty distinct inert source API/complete realpath CLI cases:21property-satisfied,24conditional falseacceptances and5scope/manual-trust/census observations. Initial48 and fresh reversed50 replays yield148CLI runs without adding distinct cases. Twenty-five adverse controls and607root identity/source/range/fixture/verdict assertions retained;113final AST syntax witness records are not typechecking or fixture execution. Current real inventory has integer counts; no actual application sanitizer/React/DOM/WebView/frame/browser/native/permissions or deployed exploit is established. Existing55-test suite has54passes/1RLS failure and current sourceCLI codes0/0/1/0; those unchanged failures remain explicit.

Acceptance target: Require actual test exercise bound to the configured sanitizer; do not count inert comments/strings as calls or assertions.

## AUDIT-HTML-SINK-SYNTAX-CENSUS-01

Severity: Medium. Status: open current source instrument gap reviewed October9,2026; source unchanged.

Computed innerHTML, insertAdjacentHTML, document.write and srcdoc syntax, a comment-separated assignment and a quoted dangerouslySetInnerHTML property escape the complete source census. Every fixture retains a real independent literal sink anchor; TS/JS/TSX AST witnesses establish nonempty assignments/calls/properties. Ordinary dirty dot forms refuse. Counting an inert string remains source-kind ambiguity because embedded scripts are intentionally scanned; that observation is not promoted as a blanket false-positive defect.

Source: `scripts/check-raw-html-sinks.mjs:43-59,76-103; scripts/lib/raw-html-sinks.mjs:94-154`. Evidence: independent HTML challenge (`audit/checklist/evidence/coverage-html-independent-challenge-2026-10-09-035.json`, untracked); root adoption qualification (`audit/checklist/evidence/coverage-html-independent-challenge-2026-10-09-035-root-adoption-validation.json`, untracked).

Limits: Fifty distinct inert source API/complete realpath CLI cases:21property-satisfied,24conditional falseacceptances and5scope/manual-trust/census observations. Initial48 and fresh reversed50 replays yield148CLI runs without adding distinct cases. Twenty-five adverse controls and607root identity/source/range/fixture/verdict assertions retained;113final AST syntax witness records are not typechecking or fixture execution. Current real inventory has integer counts; no actual application sanitizer/React/DOM/WebView/frame/browser/native/permissions or deployed exploit is established. Existing55-test suite has54passes/1RLS failure and current sourceCLI codes0/0/1/0; those unchanged failures remain explicit.

Acceptance target: Discover equivalent parsed sink nodes across supported TS/JS/TSX syntax while preserving an explicit policy for script-carrying strings.

## AUDIT-HTML-INVENTORY-COUNT-VALIDATION-01

Severity: Low. Status: open current source instrument gap reviewed October9,2026; source unchanged.

Omitted, nonnumeric-string and object count values accept a nonempty dirty sink because both count comparisons are false; CLI totals explicitly contain NaN. Duplicate file/kind entries inflate the displayed accepted census. Numeric strings are currently coerced and recorded as schema observations. Real current inventory uses integer values; numeric0/2 mismatch, short reason and unknown kind countercontrols refuse. This finding concerns validation/accounting of the guard inventory, not a malformed current product sink disposition.

Source: `scripts/check-raw-html-sinks.mjs:63-74,105-133`. Evidence: independent HTML challenge (`audit/checklist/evidence/coverage-html-independent-challenge-2026-10-09-035.json`, untracked); root adoption qualification (`audit/checklist/evidence/coverage-html-independent-challenge-2026-10-09-035-root-adoption-validation.json`, untracked).

Limits: Fifty distinct inert source API/complete realpath CLI cases:21property-satisfied,24conditional falseacceptances and5scope/manual-trust/census observations. Initial48 and fresh reversed50 replays yield148CLI runs without adding distinct cases. Twenty-five adverse controls and607root identity/source/range/fixture/verdict assertions retained;113final AST syntax witness records are not typechecking or fixture execution. Current real inventory has integer counts; no actual application sanitizer/React/DOM/WebView/frame/browser/native/permissions or deployed exploit is established. Existing55-test suite has54passes/1RLS failure and current sourceCLI codes0/0/1/0; those unchanged failures remain explicit.

Acceptance target: Validate finite nonnegative integer counts and unique file/kind identities before comparison and census; preserve deliberate manual trust separately.

## AUDIT-HTML-SCAN-ROOT-READ-FAILURE-01

Severity: Low. Status: open current source instrument gap reviewed October9,2026; source unchanged.

Replacing an expected scan root with inert text produces ENOTDIR, silently skips that root and succeeds over a separate nonempty literal anchor. A discovered broken source symlink produces ENOENT and fails. The scope is present-root directory traversal failure; missing platform roots and declared test/build exclusions are separate supported scope, and actual OS permission denial was not executed.

Source: `scripts/check-raw-html-sinks.mjs:47-60,76-85`. Evidence: independent HTML challenge (`audit/checklist/evidence/coverage-html-independent-challenge-2026-10-09-035.json`, untracked); root adoption qualification (`audit/checklist/evidence/coverage-html-independent-challenge-2026-10-09-035-root-adoption-validation.json`, untracked).

Limits: Fifty distinct inert source API/complete realpath CLI cases:21property-satisfied,24conditional falseacceptances and5scope/manual-trust/census observations. Initial48 and fresh reversed50 replays yield148CLI runs without adding distinct cases. Twenty-five adverse controls and607root identity/source/range/fixture/verdict assertions retained;113final AST syntax witness records are not typechecking or fixture execution. Current real inventory has integer counts; no actual application sanitizer/React/DOM/WebView/frame/browser/native/permissions or deployed exploit is established. Existing55-test suite has54passes/1RLS failure and current sourceCLI codes0/0/1/0; those unchanged failures remain explicit.

Acceptance target: Distinguish intentionally absent roots from present roots whose traversal fails, and report unknown coverage or fail closed for the latter.

## AUDIT-RLS-CONNECTION-REACHABILITY-01

Severity: Medium. Status: open current source instrument gap reviewed October 9, 2026; source unchanged.

Both complete CLIs accept with one real nonempty allowlisted anchor offender. R07 independently parsed computed property cooks to getNeonDb on the imported namespace; R08 has an actual exported wrapper raw-factory call, and its consumer calls that wrapper while querying web_conversations. Same-file full handle token/table co-occurrence is absent for each subject. Counterguards: R01 direct unallowlisted handle/owned table refuses; R05 named-import alias retains the canonical import token and refuses; R06 namespace direct property refuses; R02 scoped source accepts; R04 current authored test intentionally refuses a coincidental feedback identifier; this designed conservative predicate is not promoted as a defect; R11 raw handle only in an unrelated string also conservatively refuses; observed diagnostic overstatement is not automatically a new defect. Group scope: Conditional source-instrument coverage gap. No actual application wrapper, factory call, database connection, deployed BYPASSRLS execution or cross-tenant incident was exercised. Root owns exact canonical dedup/adoption.

Source: `scripts/check-rls-boundary.mjs:17-20,85-96,107-113`. Evidence: independent RLS/write challenge (`audit/checklist/evidence/coverage-rls-write-independent-challenge-2026-10-09-035.json`, untracked); root adoption qualification (`audit/checklist/evidence/coverage-rls-write-independent-challenge-2026-10-09-035-root-adoption-validation.json`, untracked).

Limits: Fifty distinct inert source cases: 21 satisfied properties, 18 conditional false acceptances, 2 conditional false refusals and 9 scope observations. Original 50 complete CLI and 28 API cases plus fresh reversed replays are the same subjects. Four request-shaped fixture refinements add no distinct cases. Current promoted syntax parsing has 396 invocations; 583 includes historical completed repeated-subject validation. Syntax parsing is neither typechecking nor fixture execution. Independent 4,988 normal / 8,230 total checks, 16 rejecting controls, final freeze 2,629 normal / 2,750 total checks with 8 rejecting controls, and 1,032 root metadata checks are preserved. The original setup and validation failures are retained. No actual application/request/authentication/database/RLS/audit-persistence/provider/browser/native/SQL execution, product acceptance or deployed incident is established. The authored source suite remains 55 tests, 54 passed and 1 failed; source CLI exits remain 0/0/1/0. Source, configuration and tools are unchanged.

Acceptance target: Bind table-query discovery to actual connection provenance across the supported lexical and module shapes.

## AUDIT-RLS-TABLE-SOURCE-IDENTITY-01

Severity: Medium. Status: open current source instrument gap reviewed October 9, 2026; source unchanged.

Actual TypeScript query argument AST values both cook to select * from web_conversations, using a Unicode escape or string concatenation. Raw token patterns omit the canonical table and the complete CLI accepts beside its one admitted anchor offender. Counterguards: R01 canonical ordinary table spelling refuses; R03 actual comment-only table is removed and accepts. Group scope: Equivalent static source-string identity only; SQL is inert text, not SQL validation or a database query. No current production occurrence claimed.

Source: `scripts/check-rls-boundary.mjs:19-20,37-42,91-95`. Evidence: independent RLS/write challenge (`audit/checklist/evidence/coverage-rls-write-independent-challenge-2026-10-09-035.json`, untracked); root adoption qualification (`audit/checklist/evidence/coverage-rls-write-independent-challenge-2026-10-09-035-root-adoption-validation.json`, untracked).

Limits: Fifty distinct inert source cases: 21 satisfied properties, 18 conditional false acceptances, 2 conditional false refusals and 9 scope observations. Original 50 complete CLI and 28 API cases plus fresh reversed replays are the same subjects. Four request-shaped fixture refinements add no distinct cases. Current promoted syntax parsing has 396 invocations; 583 includes historical completed repeated-subject validation. Syntax parsing is neither typechecking nor fixture execution. Independent 4,988 normal / 8,230 total checks, 16 rejecting controls, final freeze 2,629 normal / 2,750 total checks with 8 rejecting controls, and 1,032 root metadata checks are preserved. The original setup and validation failures are retained. No actual application/request/authentication/database/RLS/audit-persistence/provider/browser/native/SQL execution, product acceptance or deployed incident is established. The authored source suite remains 55 tests, 54 passed and 1 failed; source CLI exits remain 0/0/1/0. Source, configuration and tools are unchanged.

Acceptance target: Compare owned-table identity in supported static query arguments rather than only their raw source spelling.

## AUDIT-RLS-WAIVER-REASON-SHAPE-01

Severity: Low. Status: open current source instrument gap reviewed October 9, 2026; source unchanged.

An actual two-line reason on the exact subject path passes the complete CLI, although both reason diagnostic and remediation text require a one-line reason. Counterguards: R16 too-short reason refuses; R15 duplicate exact path refuses; R14 stale exact path refuses; R17/R22 unknown keys refuse; R13 honest ordinary waiver accepts. Group scope: Low conditional format-contract limitation only. R19 schemaVersion value acceptance is a separate observation without verified value contract. R20 filewide waiver is explicit current design; no table-level waiver promise was invented.

Source: `scripts/check-rls-boundary.mjs:72-80,132-134`. Evidence: independent RLS/write challenge (`audit/checklist/evidence/coverage-rls-write-independent-challenge-2026-10-09-035.json`, untracked); root adoption qualification (`audit/checklist/evidence/coverage-rls-write-independent-challenge-2026-10-09-035-root-adoption-validation.json`, untracked).

Limits: Fifty distinct inert source cases: 21 satisfied properties, 18 conditional false acceptances, 2 conditional false refusals and 9 scope observations. Original 50 complete CLI and 28 API cases plus fresh reversed replays are the same subjects. Four request-shaped fixture refinements add no distinct cases. Current promoted syntax parsing has 396 invocations; 583 includes historical completed repeated-subject validation. Syntax parsing is neither typechecking nor fixture execution. Independent 4,988 normal / 8,230 total checks, 16 rejecting controls, final freeze 2,629 normal / 2,750 total checks with 8 rejecting controls, and 1,032 root metadata checks are preserved. The original setup and validation failures are retained. No actual application/request/authentication/database/RLS/audit-persistence/provider/browser/native/SQL execution, product acceptance or deployed incident is established. The authored source suite remains 55 tests, 54 passed and 1 failed; source CLI exits remain 0/0/1/0. Source, configuration and tools are unchanged.

Acceptance target: Enforce the stated one-line reason requirement while preserving exact-path, stale-entry, duplicate and unknown-key checks.

## AUDIT-SCRIPT-DB-CLIENT-DISCOVERY-01

Severity: Medium. Status: open current source instrument gap reviewed October 9, 2026; source unchanged.

Actual AST module identities are pg under double-quoted import, double-quoted require and spaced require. Each source retains the actual ordinary db.query update and no audit recording call, yet API and complete CLI accept. Counterguards: W01 ordinary single-quoted pg write refuses; W08 double-quoted Neon module write still refuses; W04/W28 read-only pg/Neon sources accept. Group scope: Conditional source client-discovery gap. Fixtures were syntax parsed only, never resolved/imported/executed. Installed pg availability and database behavior are unknown.

Source: `scripts/check-unaudited-db-writes.mjs:9,64-68`. Evidence: independent RLS/write challenge (`audit/checklist/evidence/coverage-rls-write-independent-challenge-2026-10-09-035.json`, untracked); root adoption qualification (`audit/checklist/evidence/coverage-rls-write-independent-challenge-2026-10-09-035-root-adoption-validation.json`, untracked).

Limits: Fifty distinct inert source cases: 21 satisfied properties, 18 conditional false acceptances, 2 conditional false refusals and 9 scope observations. Original 50 complete CLI and 28 API cases plus fresh reversed replays are the same subjects. Four request-shaped fixture refinements add no distinct cases. Current promoted syntax parsing has 396 invocations; 583 includes historical completed repeated-subject validation. Syntax parsing is neither typechecking nor fixture execution. Independent 4,988 normal / 8,230 total checks, 16 rejecting controls, final freeze 2,629 normal / 2,750 total checks with 8 rejecting controls, and 1,032 root metadata checks are preserved. The original setup and validation failures are retained. No actual application/request/authentication/database/RLS/audit-persistence/provider/browser/native/SQL execution, product acceptance or deployed incident is established. The authored source suite remains 55 tests, 54 passed and 1 failed; source CLI exits remain 0/0/1/0. Source, configuration and tools are unchanged.

Acceptance target: Discover the actual database-client module identity across supported quote and whitespace syntax.

## AUDIT-SCRIPT-DB-WRITE-AUDIT-ATTRIBUTION-01

Severity: Medium. Status: open current source instrument gap reviewed October 9, 2026; source unchanged.

Comments naming each of four audit markers, an unrelated string, an unused ledger variable, a SELECT from an audit table, an INSERT into a different audit-name-suffix table, or an audit INSERT only under literal false all cause API and complete CLI acceptance of the preceding actual mutation. Independent AST distinguishes queries from comments/literals and marks the unreachable audit branch; no sink INSERT exists for the inert/read-only cases. Counterguards: W01 mutation without any marker refuses; W02/W03/W26 actual audit/ledger INSERT source accepts; W23 removed rehearsal name refuses staleness. Group scope: Conditional source attribution/identity gap, not an audit loss or database incident. W22 basename exemption is deliberately scoped observation: actual rehearsal target safety was not read/executed here, so no production waiver incident is inferred.

Source: `scripts/check-unaudited-db-writes.mjs:22-28,64-70`. Evidence: independent RLS/write challenge (`audit/checklist/evidence/coverage-rls-write-independent-challenge-2026-10-09-035.json`, untracked); root adoption qualification (`audit/checklist/evidence/coverage-rls-write-independent-challenge-2026-10-09-035-root-adoption-validation.json`, untracked).

Limits: Fifty distinct inert source cases: 21 satisfied properties, 18 conditional false acceptances, 2 conditional false refusals and 9 scope observations. Original 50 complete CLI and 28 API cases plus fresh reversed replays are the same subjects. Four request-shaped fixture refinements add no distinct cases. Current promoted syntax parsing has 396 invocations; 583 includes historical completed repeated-subject validation. Syntax parsing is neither typechecking nor fixture execution. Independent 4,988 normal / 8,230 total checks, 16 rejecting controls, final freeze 2,629 normal / 2,750 total checks with 8 rejecting controls, and 1,032 root metadata checks are preserved. The original setup and validation failures are retained. No actual application/request/authentication/database/RLS/audit-persistence/provider/browser/native/SQL execution, product acceptance or deployed incident is established. The authored source suite remains 55 tests, 54 passed and 1 failed; source CLI exits remain 0/0/1/0. Source, configuration and tools are unchanged.

Acceptance target: Bind a mutation disposition to the actual audit or migration-ledger recording call and its sink identity; exclude comments, unused markers, read-only audit queries, wrong tables and unreachable recording branches.

## AUDIT-SCRIPT-DB-WRITE-SOURCE-KIND-01

Severity: Medium. Status: open current source instrument gap reviewed October 9, 2026; source unchanged.

W18 concatenation cooks to the ordinary UPDATE query but API/CLI accepts. W19 has only a readonly query and mutation text in a comment yet API/CLI refuses. W27 really includes an audit INSERT argument cooking to security_audit_logs through a Unicode escape but raw sink pattern omits it and API/CLI refuses. Counterguards: W01 ordinary UPDATE discovery refuses correctly; W02 plain actual security_audit_logs INSERT accepts; W20 unused mutation literal is retained as conservative-token observation, not presumed runtime write; W21/check prefix,W24/nested mjs,W25/js are explicit discovery-scope observations with no promised admission verdict. Group scope: Conditional source-call/string identity and refusal precision. SQL remains inert and no audit INSERT or database mutation ran. Current deployed behavior is unknown.

Source: `scripts/check-unaudited-db-writes.mjs:11-28,64-69`. Evidence: independent RLS/write challenge (`audit/checklist/evidence/coverage-rls-write-independent-challenge-2026-10-09-035.json`, untracked); root adoption qualification (`audit/checklist/evidence/coverage-rls-write-independent-challenge-2026-10-09-035-root-adoption-validation.json`, untracked).

Limits: Fifty distinct inert source cases: 21 satisfied properties, 18 conditional false acceptances, 2 conditional false refusals and 9 scope observations. Original 50 complete CLI and 28 API cases plus fresh reversed replays are the same subjects. Four request-shaped fixture refinements add no distinct cases. Current promoted syntax parsing has 396 invocations; 583 includes historical completed repeated-subject validation. Syntax parsing is neither typechecking nor fixture execution. Independent 4,988 normal / 8,230 total checks, 16 rejecting controls, final freeze 2,629 normal / 2,750 total checks with 8 rejecting controls, and 1,032 root metadata checks are preserved. The original setup and validation failures are retained. No actual application/request/authentication/database/RLS/audit-persistence/provider/browser/native/SQL execution, product acceptance or deployed incident is established. The authored source suite remains 55 tests, 54 passed and 1 failed; source CLI exits remain 0/0/1/0. Source, configuration and tools are unchanged.

Acceptance target: Classify supported mutation and audit-recording query arguments using their actual static source value and distinguish executable calls from comments.

## AUDIT-SECURITY-GATE-EXTERNAL-EXCLUSION-CENSUS-01

Severity: Medium. Status: open conditional source-instrument gap reviewed October 9, 2026.

Rechecked on main (3ccb6f6) on 2026-10-15: still present. Main changed `scripts/check-security-gates.mjs` after the 2026-09-27 copy this was found on without changing the cited logic; line numbers for it are main's.

Adding an unregistered literal-true warning step to the already loaded security-scanning gate-owning workflow is accepted by the complete unchanged source CLI. Primary workflow warnings are enumerated, external workflow warnings are not.

Counterguards: An unregistered primary warning refuses, and converting an actually registered external gate to a warning also refuses.

Source: `scripts/check-security-gates.mjs:475-494`. Evidence: eight exact-function controls (`audit/checklist/evidence/coverage-security-ci-inert-controls-2026-10-09-037.json`, untracked), six complete unchanged CLI controls (`audit/checklist/evidence/coverage-security-ci-unchanged-cli-controls-2026-10-09-037.json`, untracked) and actual current guard/test results (`audit/checklist/evidence/coverage-security-ci-current-source-gates-2026-10-09-037.json`, untracked). The six CLI subjects are replays of the eight focused controls, not six additional unique cases.

Limits: Current real repository guard and seven authored tests pass. All workflow run fields in controls are inert data. No application/fixture module, hosted action, container, network, provider, database, build, installation, deployment, protected setting, account permission or production incident was exercised. Desired ruleset files are not proof of applied enforcement. The earlier Root035 RLS guard failure remains separate and unresolved.

Acceptance target: Enumerate exclusions for every declared loaded gate-owning workflow and bind identities to workflow/job/step, preserving existing primary and external gate refusals.

## AUDIT-SECURITY-GATE-JOB-WARNING-01

Severity: Medium. Status: open conditional source-instrument gap reviewed October 9, 2026.

Rechecked on main (3ccb6f6) on 2026-10-15: still present. Main changed `scripts/check-security-gates.mjs` after the 2026-09-27 copy this was found on without changing the cited logic; line numbers for it are main's.

Adding a literal-true continue-on-error flag to the registered primary security job leaves the complete unchanged source CLI accepted because it only checks the selected step. This is a bounded guard input-coverage failure; hosted GitHub evaluation and merge effects remain unknown.

Counterguards: A literal-true warning flag on the registered step refuses. The original checked-in workflow baseline passes without the adverse job mutation.

Source: `scripts/check-security-gates.mjs:456-473`. Evidence: eight exact-function controls (`audit/checklist/evidence/coverage-security-ci-inert-controls-2026-10-09-037.json`, untracked), six complete unchanged CLI controls (`audit/checklist/evidence/coverage-security-ci-unchanged-cli-controls-2026-10-09-037.json`, untracked) and actual current guard/test results (`audit/checklist/evidence/coverage-security-ci-current-source-gates-2026-10-09-037.json`, untracked). The six CLI subjects are replays of the eight focused controls, not six additional unique cases.

Limits: Current real repository guard and seven authored tests pass. All workflow run fields in controls are inert data. No application/fixture module, hosted action, container, network, provider, database, build, installation, deployment, protected setting, account permission or production incident was exercised. Desired ruleset files are not proof of applied enforcement. The earlier Root035 RLS guard failure remains separate and unresolved.

Acceptance target: Qualify both job and step blocking conditions for registered gates; conservatively refuse unsupported warning expressions rather than claiming verified blocking behavior.

## AUDIT-SECURITY-EXCLUSION-OWNER-SHAPE-01

Severity: Low. Status: open conditional source-instrument gap reviewed October 9, 2026.

Rechecked on main (3ccb6f6) on 2026-10-15: still present. Main changed `scripts/check-security-gates.mjs` after the 2026-09-27 copy this was found on without changing the cited logic; line numbers for it are main's.

Replacing the required primary warning exclusion fields with reason=[], owner={} and tracking=true is accepted by the complete unchanged source CLI. Truthiness does not establish a meaningful reason, owner or tracking identifier.

Counterguards: An empty owner string is refused by the exact current predicate. Current registry fields are normal text; no malformed current owner record or hidden incident is claimed.

Source: `scripts/check-security-gates.mjs:489-493`. Evidence: eight exact-function controls (`audit/checklist/evidence/coverage-security-ci-inert-controls-2026-10-09-037.json`, untracked), six complete unchanged CLI controls (`audit/checklist/evidence/coverage-security-ci-unchanged-cli-controls-2026-10-09-037.json`, untracked) and actual current guard/test results (`audit/checklist/evidence/coverage-security-ci-current-source-gates-2026-10-09-037.json`, untracked). The six CLI subjects are replays of the eight focused controls, not six additional unique cases.

Limits: Current real repository guard and seven authored tests pass. All workflow run fields in controls are inert data. No application/fixture module, hosted action, container, network, provider, database, build, installation, deployment, protected setting, account permission or production incident was exercised. Desired ruleset files are not proof of applied enforcement. The earlier Root035 RLS guard failure remains separate and unresolved.

Acceptance target: Validate nonempty meaningful string fields for exclusion reason, owner and tracking and reject nontext data, with current valid exclusions retained.

## AUDIT-SECURITY-CONTROL-INERT-REACHABILITY-01

Severity: Medium. Status: open source-instrument finding reviewed October 9, 2026; source unchanged.

The complete unchanged CLI accepts a discovered purge control when a production route only imports its name and returns a literal. With a namespace import, a comment or returned string containing the control name also accepts. No fixture route/control is executed. This qualifies the instrument claim of a production caller; it does not prove a currently deployed security control is bypassed.

Counterguards: A missing production importer, an unused namespace importer and a test-only importer all refuse. A route that actually calls the named control accepts, and every accepted case reports one real discovered control module/export rather than an empty census.

Evidence: nine complete unchanged CLI controls (`audit/checklist/evidence/coverage-security-control-reachability-inert-controls-2026-10-09-038.json`, untracked), sixteen authored tests and real source guard (`audit/checklist/evidence/coverage-security-control-reachability-current-source-gates-2026-10-09-038.json`, untracked), and actual source report (`audit/checklist/reviews/coverage-security-control-ci-owner-source-2026-10-09-038.json`, untracked). The nine distinct cases comprise five counterguards and four conditional false acceptances across these two owners. Actual current guard passes with 57 control modules, 49 exports and one baseline-accounted uncalled tested control.

Limits: Source guard execution reads private inert text; fixture TypeScript is never imported or executed. No application/native/provider/network/SQL/database/build/install/hosted CI/production action or effective security enforcement is accepted. Named-import and namespace-name heuristics are source references, not proof of invocation. This packet does not replace the unresolved Root035 RLS failure or unrelated lexical guard owners.

Acceptance target: Resolve actual executable value references and calls for the advertised control-caller claim, excluding unused import bindings and inert comments/strings while preserving actual calls, supported re-exports and test-only refusal.

## AUDIT-SECURITY-CONTROL-BASELINE-OWNER-SHAPE-01

Severity: Low. Status: open source-instrument finding reviewed October 9, 2026; source unchanged.

A baseline for the actually discovered orphan purge control with control={} and owner=[] is accepted by the complete unchanged CLI. Truthiness alone cannot name the promised control or responsible file. The checked-in exception uses normal textual fields; this is a conditional malformed-input instrument gap.

Counterguards: An empty owner string refuses, missing metadata is rejected by the passing authored tests, and stale wired exceptions are rejected. No malformed current baseline or hosted/runtime incident is observed.

Evidence: nine complete unchanged CLI controls (`audit/checklist/evidence/coverage-security-control-reachability-inert-controls-2026-10-09-038.json`, untracked), sixteen authored tests and real source guard (`audit/checklist/evidence/coverage-security-control-reachability-current-source-gates-2026-10-09-038.json`, untracked), and actual source report (`audit/checklist/reviews/coverage-security-control-ci-owner-source-2026-10-09-038.json`, untracked). The nine distinct cases comprise five counterguards and four conditional false acceptances across these two owners. Actual current guard passes with 57 control modules, 49 exports and one baseline-accounted uncalled tested control.

Limits: Source guard execution reads private inert text; fixture TypeScript is never imported or executed. No application/native/provider/network/SQL/database/build/install/hosted CI/production action or effective security enforcement is accepted. Named-import and namespace-name heuristics are source references, not proof of invocation. This packet does not replace the unresolved Root035 RLS failure or unrelated lexical guard owners.

Acceptance target: Require meaningful nonempty textual control and responsible-file metadata, validating the owner under the declared source-root policy while retaining missing/stale exception refusals.

## AUDIT-UI-GAP-STATIC-PREMISE-OVERRIDE-01

Severity: Medium. Status: open source-qualified finding reviewed October 9, 2026; source unchanged.

The exact current reconcileCurrentPremises stage overwrites an incoming GAP-004 Open status and unique criteria/evidence with private Done claims. Incoming GAP-004 Open/GAP-005 Blocked states both become Done before the merge checks equality, so that conflict is no longer refused. These are bounded transform controls; current target implementation and a full CSV/CI/hosted import outcome were not tested.

Counterguards: An unregistered ID is preserved. The direct merger correctly refuses original differing statuses; render-only mode does not call overrides or duplicate merge. No checked-in canonical status is declared wrong solely from this source observation.

Evidence: root source review (`audit/checklist/reviews/coverage-audit-import-excel-owner-source-2026-10-09-039.json`, untracked), seven pure-function controls (`audit/checklist/evidence/coverage-audit-import-inert-controls-2026-10-09-039.json`, untracked).

Limits: No complete importer/CSV writer, application/fixture module, native/Rust tests/build, workbook I/O, provider/network, SQL/database, install, Git mutation or production action ran. Source transform controls use exact pure function text and inert values. Installed writer spans are outside-repository dependency evidence with missing archive checksum, excluded from first-party/full-file credit. No observed data loss, current status corruption, approved caller bypass or public Electron runtime acceptance is claimed.

Acceptance target: Keep supplied audit claims and verification provenance independently, require content/current-evidence qualification before status changes, and resolve conflicts before collapsing aliases instead of replacing mutable truth with private importer constants.

## AUDIT-UI-GAP-DUPLICATE-CRITERIA-LOSS-01

Severity: Medium. Status: open source-qualified finding reviewed October 9, 2026; source unchanged.

For same-status GAP-004/GAP-005 records with a unique secondary required detail/title, the exact mergeKnownDuplicate transform removes GAP-005 and retains neither of those fields in the result. It preserves secondary evidence, suggested fix and image, which do not necessarily contain the dropped criterion. This conditional schema-valid stage gap is not a claim that current checked-in duplicate text already differs.

Counterguards: Missing duplicate pairs and differing direct statuses refuse; secondary evidence/recommendation/images and mergedFrom are retained, with image deduplication. No real CSV or importer writer executed.

Evidence: root source review (`audit/checklist/reviews/coverage-audit-import-excel-owner-source-2026-10-09-039.json`, untracked), seven pure-function controls (`audit/checklist/evidence/coverage-audit-import-inert-controls-2026-10-09-039.json`, untracked).

Limits: No complete importer/CSV writer, application/fixture module, native/Rust tests/build, workbook I/O, provider/network, SQL/database, install, Git mutation or production action ran. Source transform controls use exact pure function text and inert values. Installed writer spans are outside-repository dependency evidence with missing archive checksum, excluded from first-party/full-file credit. No observed data loss, current status corruption, approved caller bypass or public Electron runtime acceptance is claimed.

Acceptance target: Require exact requirement/acceptance equivalence or retain all independent secondary clauses and field provenance before removing a duplicate row.

## NATIVE-EXCEL-EDIT-UNATTACHED-SHEETS-01

Severity: High. Status: open source-qualified finding reviewed October 9, 2026; source unchanged.

The retained editor writes source cells and supported edits into a separate Worksheet map, passes an unused workbook parameter to apply_edit, and saves a fresh Workbook without attaching any sheet. The registered native command forwards that path. Current installed writer source starts with an empty vector and creates a blank sheet on save; it creates the output path, so equal readable-source/writable-output paths can replace original content. This is source derivation; no workbook was edited or overwritten.

Counterguards: Unsupported edit variants, path traversal/protected-path/empty input and propagated edit/save errors refuse. The create path explicitly attaches sheets through workbook.add_worksheet. Native startup, caller permissions/approval, dependency archive authenticity, actual compiled linkage and public Electron applicability remain unknown.

Evidence: root source review (`audit/checklist/reviews/coverage-audit-import-excel-owner-source-2026-10-09-039.json`, untracked), original retained candidate (`audit/checklist/reviews/coverage-retained-native-source-2026-10-09-039.json`, untracked). The original qualified Native039 pair remains frozen and its pending relation is resolved into this canonical ID.

Limits: No complete importer/CSV writer, application/fixture module, native/Rust tests/build, workbook I/O, provider/network, SQL/database, install, Git mutation or production action ran. Source transform controls use exact pure function text and inert values. Installed writer spans are outside-repository dependency evidence with missing archive checksum, excluded from first-party/full-file credit. No observed data loss, current status corruption, approved caller bypass or public Electron runtime acceptance is claimed.

Acceptance target: Attach every preserved/edited worksheet to the saved workbook and prove supported edits preserve existing cells/sheets/formulas/metadata before exposing overwrite behavior; preserve unsupported-edit refusal and source/output access controls.

## AUDIT-UI-GAP-MARKDOWN-HASH-ONLY-01

Severity: Low. Status: open source-instrument finding reviewed October 9, 2026; source unchanged.

The complete unchanged checker accepts private Markdown containing only the exact CSV SHA marker while all341 actual tracker rows and their criteria/evidence are absent. It validates CSV identities and SHA presence,without checking the Markdown is the rendered projection. Current checked-in Markdown is not claimed incomplete; this is a conditional malformed generated-input acceptance gap.

Counterguards: Complete current Markdown passes; wrong hash and empty Markdown refuse. All cases use the same copied actual341-row CSV and baseline, and the original tracker/source stay unchanged. No renderer/importer writer or product module executes.

Evidence: four complete unchanged CLI controls (`audit/checklist/evidence/coverage-ui-gap-renderer-guard-inert-controls-2026-10-09-040.json`, untracked) with exits0/0/1/1, current guard and absent-ref proof (`audit/checklist/evidence/coverage-ui-gap-current-source-guard-2026-10-09-040.json`, untracked), and full source report (`audit/checklist/reviews/coverage-ui-gap-contract-guard-source-2026-10-09-040.json`, untracked). Metadata and copied data checks add no semantic reading of the341 CSV records. No importer/renderer write, product/application/fixture module, network/provider/native/SQL/DB/Git mutation/build/install or hosted CI/production acceptance.

Acceptance target: Compare the complete generated Markdown with the canonical renderer output or validate all required row/detail/evidence/lineage content, preserving existing CSV/hash/schema refusals.

## AUDIT-MODEL-IMPROVEMENT-FILE-EXEMPTION-01

Severity: Medium. Status: open current source-instrument gap; source unchanged.

The complete unchanged source checker accepts an exported training-preference control inside the exempt PrivacySection file while the identical active control in DataSection refuses. The exception documented for a removed-control comment is applied at whole-file/pattern scope, so the instrument can falsely report the preference absent. No current product opt-in or training sink is alleged.

Counterguards: Current original source passes2393 modules, the baseline passes, the exact active control in another file refuses, a training export in the exempt file refuses, and missing privacy copy refuses. AST proves the adverse text is an exported variable initializer without running it.

Source: `scripts/check-model-improvement-eligibility.mjs:56-63,92-100`. Acceptance target: Bind the exception to the exact inactive source comment or remove comment matches before scanning executable declarations; preserve other-file controls, export/call patterns, missing claims, nonzero source census and stale-exemption checks. Current full source report (`audit/checklist/reviews/coverage-model-contract-guard-source-2026-10-09-041.json`, untracked); independent controls (`audit/checklist/evidence/coverage-model-contract-inert-controls-2026-10-09-041.json`, untracked); actual current source guard/tests (`audit/checklist/evidence/coverage-model-contract-current-source-gates-2026-10-09-041.json`, untracked).

Limits: The complete original source checker ran on private inert TSX/data roots; two actual TypeScript parser checks establish template and active-export syntax/source roles without executing the fixture. Five eligibility controls preserve the current text claims and distinguish file-specific exemption from all-file/global preference refusal. Current original source is populated and passes; no current training opt-in, customer-content sink or privacy incident is alleged. No source edits, application/fixture/provider/native/network/SQL/DB/build/install/Git mutation or product/runtime acceptance. Prior Root035 failure stays unresolved.

## AUDIT-PRIVACY-CLAIM-INERT-BACKING-01

Severity: Medium. Status: open source/documentation finding.

Rechecked on main (3ccb6f6) on 2026-10-15: still present. Main changed `scripts/check-privacy-claims.mjs` after the 2026-09-27 copy this was found on without changing the cited logic; line numbers for it are main's.

The complete unchanged privacy CLI accepts a fixture whose consent/switch/centre/storage backing is entirely commented out, and separately accepts a null chat notice with only a commented disclosure name. Missing actual backing files and changed published claims refuse. Literal source markers can therefore back the claimed published behavior without executable backing. Current real CLI passes; no live GPC/training/privacy failure is established.

Source: `scripts/check-privacy-claims.mjs:146-152,191-204`. Acceptance target: Resolve executable references and rendered disclosure use for the pinned claims; exclude comments and retain missing-file/copy/marker counterguards.

Actual full source report (`audit/checklist/reviews/coverage-privacy-security-claim-guard-source-2026-10-09-042.json`, untracked), 24 independent controls (`audit/checklist/evidence/coverage-privacy-security-claim-inert-controls-2026-10-09-042.json`, untracked) and 44 authored tests/current source checker exits (`audit/checklist/evidence/coverage-privacy-security-claim-current-source-gates-2026-10-09-042.json`, untracked). The tests passed44/44 with0fail/0skip; individual current checker exits are privacy0/security1/cookie0/license0/selftest0. Controls are13counterguards/11conditional gaps across distinct owners and3AST-only syntax checks. Fresh private roots isolate cases, proof/component/fixture code remains inert, and no application/native/provider/network/SQL/database/build/install/Git/production effects or legal/runtime/product acceptance is claimed. Prior Root035 RLS failure remains unresolved.

## AUDIT-SECURITY-CLAIM-INERT-PROOF-CREDIT-01

Severity: Medium. Status: open source/documentation finding; source unchanged.

The complete unchanged security-claims CLI accepts implementation and named-test references containing only comments and guard/selftest files containing zero bytes. Missing proof/selftest files and an empty proof array refuse. File presence and substring references therefore receive the checker's indexed-and-proved claim without any executable assertion. Current hosted guard/test/proof execution and effective security are unverified.

Source: `scripts/check-security-claims.mjs:121-166,261-265`. Acceptance target: Bind proof references to meaningful executable tests/guard assertions and actual implementation symbols; retain strict reference, entry-shape, missing-proof and selftest refusals.

Actual full source report (`audit/checklist/reviews/coverage-privacy-security-claim-guard-source-2026-10-09-042.json`, untracked), 24 independent controls (`audit/checklist/evidence/coverage-privacy-security-claim-inert-controls-2026-10-09-042.json`, untracked) and 44 authored tests/current source checker exits (`audit/checklist/evidence/coverage-privacy-security-claim-current-source-gates-2026-10-09-042.json`, untracked). The tests passed44/44 with0fail/0skip; individual current checker exits are privacy0/security1/cookie0/license0/selftest0. Controls are13counterguards/11conditional gaps across distinct owners and3AST-only syntax checks. Fresh private roots isolate cases, proof/component/fixture code remains inert, and no application/native/provider/network/SQL/database/build/install/Git/production effects or legal/runtime/product acceptance is claimed. Prior Root035 RLS failure remains unresolved.

## AUDIT-SECURITY-CLAIM-TABLE-CONTENT-UNBOUND-01

Severity: Low. Status: open source/documentation finding; source unchanged.

An unchanged full security-claims CLI accepts changing a fixture table verdict from deny to allow while keeping its two rows and original index/proof references. Table count and connector-ID set checks bind inventory shape rather than cell content or scope values. This is a conditional table/index instrument gap, separate from missing executable proof; no real security verdict mutation is claimed.

Source: `scripts/check-security-claims.mjs:242-245,313-326,346-363`. Acceptance target: Bind falsifiable table criteria and canonical scope values to their current owners and evidence, while preserving row-count/ID checks as inventory controls.

Actual full source report (`audit/checklist/reviews/coverage-privacy-security-claim-guard-source-2026-10-09-042.json`, untracked), 24 independent controls (`audit/checklist/evidence/coverage-privacy-security-claim-inert-controls-2026-10-09-042.json`, untracked) and 44 authored tests/current source checker exits (`audit/checklist/evidence/coverage-privacy-security-claim-current-source-gates-2026-10-09-042.json`, untracked). The tests passed44/44 with0fail/0skip; individual current checker exits are privacy0/security1/cookie0/license0/selftest0. Controls are13counterguards/11conditional gaps across distinct owners and3AST-only syntax checks. Fresh private roots isolate cases, proof/component/fixture code remains inert, and no application/native/provider/network/SQL/database/build/install/Git/production effects or legal/runtime/product acceptance is claimed. Prior Root035 RLS failure remains unresolved.

## AUDIT-LICENSE-EXPRESSION-PREFIX-CREDIT-01

Severity: Medium. Status: open source/documentation finding; source unchanged.

A complete byte-identical original license CLI in a fresh private root exits0 for a notice License value MIT AND AGPL-3.0 while the leading AGPL-3.0 and unknown-token controls exit1. The first-token parser discards the remaining declared expression, including a token in the repository denied set. Current real notices and selftest pass; no actual forbidden port/dependency or legal conclusion is established.

Source: `scripts/check-licenses.mjs:73-78,92-100`. Acceptance target: Parse the complete declared license expression under the repository policy and refuse disallowed/unknown obligations without treating a leading allowed token as the whole declaration.

Actual full source report (`audit/checklist/reviews/coverage-privacy-security-claim-guard-source-2026-10-09-042.json`, untracked), 24 independent controls (`audit/checklist/evidence/coverage-privacy-security-claim-inert-controls-2026-10-09-042.json`, untracked) and 44 authored tests/current source checker exits (`audit/checklist/evidence/coverage-privacy-security-claim-current-source-gates-2026-10-09-042.json`, untracked). The tests passed44/44 with0fail/0skip; individual current checker exits are privacy0/security1/cookie0/license0/selftest0. Controls are13counterguards/11conditional gaps across distinct owners and3AST-only syntax checks. Fresh private roots isolate cases, proof/component/fixture code remains inert, and no application/native/provider/network/SQL/database/build/install/Git/production effects or legal/runtime/product acceptance is claimed. Prior Root035 RLS failure remains unresolved.

## AUDIT-LICENSE-MISSING-FIELD-UPSTREAM-SKIP-01

Severity: Medium. Status: open source/documentation finding; source unchanged.

A complete byte-identical original CLI exits0 for a Port notice block declaring anthropics/claude-code as Upstream when its License field is absent. The actual selftest catches that same denied upstream with MIT present. The early missing-license continue skips the independently denied-upstream policy. Ordinary narrative sections without attribution fields remain outside this finding. No actual prohibited port or legal compliance conclusion is established.

Source: `scripts/check-licenses.mjs:84-90,102-107`. Acceptance target: Identify attribution records from their declared upstream/port fields, require their license field and enforce denied-upstream checks even when another required field is missing.

Actual full source report (`audit/checklist/reviews/coverage-privacy-security-claim-guard-source-2026-10-09-042.json`, untracked), 24 independent controls (`audit/checklist/evidence/coverage-privacy-security-claim-inert-controls-2026-10-09-042.json`, untracked) and 44 authored tests/current source checker exits (`audit/checklist/evidence/coverage-privacy-security-claim-current-source-gates-2026-10-09-042.json`, untracked). The tests passed44/44 with0fail/0skip; individual current checker exits are privacy0/security1/cookie0/license0/selftest0. Controls are13counterguards/11conditional gaps across distinct owners and3AST-only syntax checks. Fresh private roots isolate cases, proof/component/fixture code remains inert, and no application/native/provider/network/SQL/database/build/install/Git/production effects or legal/runtime/product acceptance is claimed. Prior Root035 RLS failure remains unresolved.

## AUDIT-CSP-MODULE-SANDBOX-CREDIT-01

Severity: Medium. Status: open conditional source-instrument finding.

Rechecked on main (3ccb6f6) on 2026-10-15: still present. Main added a check for host sources that admit every host; the module-wide `sandboxed` credit is unchanged. Line numbers for `scripts/check-security-response-headers.mjs` are main's.

An unchanged full header CLI refuses a standalone emitted policy with unsafe-inline, then accepts the same emitted policy when an independent unused literal in that module contains default-src none. The default restriction belongs to a separate policy; module-wide credit does not establish that the unsafe policy is sandboxed. The existing test covers genuine same-policy sandbox literals assembled with join, which remains valid countercoverage. This is a conditional source-instrument gap; no current emitted unsafe policy or live browser exploit is established.

Source: `scripts/check-security-response-headers.mjs:130-134,142-148`. Acceptance target: Bind each script-src allowance to the default-src of the actual same emitted policy while retaining legitimate directive assembly.

Actual full source report (`audit/checklist/reviews/coverage-session-response-header-guard-source-2026-10-09-043.json`, untracked), 28 independently isolated controls (`audit/checklist/evidence/coverage-session-response-header-inert-controls-2026-10-09-043.json`, untracked) and 39 authored guard tests/current source exits (`audit/checklist/evidence/coverage-session-response-header-current-source-gates-2026-10-09-043.json`, untracked). Controls are18counterguards/10conditional gaps. All39 tests pass0fail0skip, and the four current source CLIs pass. Inert source strings never execute/import a fixture or application handler. No HTTP/browser/authentication/upload/provider/native/SQL/database/build/install/production behavior or runtime/product acceptance is established. Current Root042 security-claims failure and prior Root035 RLS failure remain separately unresolved.

## AUDIT-CORS-HEADER-SETTER-CENSUS-01

Severity: Medium. Status: open conditional source-instrument finding.

Rechecked on main (3ccb6f6) on 2026-10-15: still present. Main changed `scripts/check-security-response-headers.mjs` after the 2026-09-27 copy this was found on without changing the cited logic; line numbers for it are main's.

The unchanged full header CLI refuses a session-reading fixture with an object-literal wildcard origin, but admits its counterpart using response.headers.set with the same wildcard while reporting zero wildcard origins. The matcher requires a quoted header key followed by a colon. This proves a conditional source-census omission in a valid setter spelling; HTTP/CORS behavior, current credential exposure and a browser exploit remain unverified.

Source: `scripts/check-security-response-headers.mjs:35-38,157-177`. Acceptance target: Enumerate supported response-header writes independently of object-literal spelling, retaining public noncredentialed wildcard and session-read counterguards.

Actual full source report (`audit/checklist/reviews/coverage-session-response-header-guard-source-2026-10-09-043.json`, untracked), 28 independently isolated controls (`audit/checklist/evidence/coverage-session-response-header-inert-controls-2026-10-09-043.json`, untracked) and 39 authored guard tests/current source exits (`audit/checklist/evidence/coverage-session-response-header-current-source-gates-2026-10-09-043.json`, untracked). Controls are18counterguards/10conditional gaps. All39 tests pass0fail0skip, and the four current source CLIs pass. Inert source strings never execute/import a fixture or application handler. No HTTP/browser/authentication/upload/provider/native/SQL/database/build/install/production behavior or runtime/product acceptance is established. Current Root042 security-claims failure and prior Root035 RLS failure remain separately unresolved.

## AUDIT-SESSION-LIFETIME-INERT-PROOF-CREDIT-01

Severity: Medium. Status: open conditional source-instrument finding; source unchanged.

The complete original exported lifetime engine admits four credential classes when all three bound-source proof modules contain only comments. A separate fixture also replaces the required lifetime gate invocation with a comment and passes. Removing that invocation entirely or removing a bound module refuses. This is source-proof reference credit without an executable bound/call; current authentication, expiry enforcement and provider/session security are not inferred from these inert fixtures.

Source: `scripts/check-session-lifetime-enforcement.mjs:165-179`. Acceptance target: Bind the declared age-bound predicates and their gate calls to executable code and the authenticated credential path; retain missing-module/call and nonempty credential census checks.

Actual full source report (`audit/checklist/reviews/coverage-session-response-header-guard-source-2026-10-09-043.json`, untracked), 28 independently isolated controls (`audit/checklist/evidence/coverage-session-response-header-inert-controls-2026-10-09-043.json`, untracked) and 39 authored guard tests/current source exits (`audit/checklist/evidence/coverage-session-response-header-current-source-gates-2026-10-09-043.json`, untracked). Controls are18counterguards/10conditional gaps. All39 tests pass0fail0skip, and the four current source CLIs pass. Inert source strings never execute/import a fixture or application handler. No HTTP/browser/authentication/upload/provider/native/SQL/database/build/install/production behavior or runtime/product acceptance is established. Current Root042 security-claims failure and prior Root035 RLS failure remain separately unresolved.

## AUDIT-CREDENTIAL-VERIFIER-LOCAL-NAME-EXEMPTION-01

Severity: Medium. Status: open conditional source-instrument finding; source unchanged.

The original lifetime engine keeps its baseline four-class census and admits an additional external.verifySignedLinkToken call when an unused local function has the same name. Global declared-name filtering removes the method name without resolving its receiver or call identity. The four real classified verifier names and zero-census refusal remain counterguards; no existing unbounded mounted credential route or authentication bypass is established.

Source: `scripts/check-session-lifetime-enforcement.mjs:120-132`. Acceptance target: Resolve local wrapper/call identities and receivers before excluding credential verifiers; classify an independent external method despite an unrelated local name.

Actual full source report (`audit/checklist/reviews/coverage-session-response-header-guard-source-2026-10-09-043.json`, untracked), 28 independently isolated controls (`audit/checklist/evidence/coverage-session-response-header-inert-controls-2026-10-09-043.json`, untracked) and 39 authored guard tests/current source exits (`audit/checklist/evidence/coverage-session-response-header-current-source-gates-2026-10-09-043.json`, untracked). Controls are18counterguards/10conditional gaps. All39 tests pass0fail0skip, and the four current source CLIs pass. Inert source strings never execute/import a fixture or application handler. No HTTP/browser/authentication/upload/provider/native/SQL/database/build/install/production behavior or runtime/product acceptance is established. Current Root042 security-claims failure and prior Root035 RLS failure remain separately unresolved.

## AUDIT-UPLOAD-INSPECTION-INERT-CREDIT-01

Severity: Medium. Status: open conditional source-instrument finding.

Rechecked on main (3ccb6f6) on 2026-10-15: still present. Main lets a staged-upload route name several completing files and checks each one with the same textual proof. Line numbers for `scripts/check-upload-inspection-coverage.mjs` are main's.

A complete unchanged upload CLI still counts three byte-ingesting routes and both required deferrals when the scanner module, direct route inspection and both completion inspection names exist only in comments. The unchanged no-scan route, missing scanner and missing completing module controls refuse. Source-name presence receives inspection credit without executable inspection. This is a conditional source guard gap; no actual unsafe upload, MIME/credential scan failure or customer data effect is demonstrated.

Source: `scripts/check-upload-inspection-coverage.mjs:53-60,76-97; scripts/lib/upload-ingest.mjs:20-30`. Acceptance target: Resolve executable byte-inspection calls and scanner predicates on each upload/completion path, preserving stale-deferral, missing-module and uninspected-route refusals.

Actual full source report (`audit/checklist/reviews/coverage-session-response-header-guard-source-2026-10-09-043.json`, untracked), 28 independently isolated controls (`audit/checklist/evidence/coverage-session-response-header-inert-controls-2026-10-09-043.json`, untracked) and 39 authored guard tests/current source exits (`audit/checklist/evidence/coverage-session-response-header-current-source-gates-2026-10-09-043.json`, untracked). Controls are18counterguards/10conditional gaps. All39 tests pass0fail0skip, and the four current source CLIs pass. Inert source strings never execute/import a fixture or application handler. No HTTP/browser/authentication/upload/provider/native/SQL/database/build/install/production behavior or runtime/product acceptance is established. Current Root042 security-claims failure and prior Root035 RLS failure remain separately unresolved.

## AUDIT-UPLOAD-REQUEST-RECEIVER-CENSUS-01

Severity: Medium. Status: open conditional source-instrument finding.

Rechecked on main (3ccb6f6) on 2026-10-15: still present. Main changed `scripts/check-upload-inspection-coverage.mjs` after the 2026-09-27 copy this was found on without changing the cited logic; line numbers for it are main's.

The unchanged full upload CLI admits an additional uninspected route whose Request parameter is named incoming and whose body reads incoming.arrayBuffer. Its baseline recognized request/req routes and both fixed deferrals stay nonempty and still pass. The byte-read matcher binds receiver spelling rather than the route request parameter. Upstream response bytes and request.json exclusions remain intentional countercoverage; no current mounted route omission or unsafe upload is asserted.

Source: `scripts/lib/upload-ingest.mjs:6-17; scripts/check-upload-inspection-coverage.mjs:70-74`. Acceptance target: Resolve the route request parameter and aliases when enumerating caller byte reads, without classifying upstream response traffic as uploads.

Actual full source report (`audit/checklist/reviews/coverage-session-response-header-guard-source-2026-10-09-043.json`, untracked), 28 independently isolated controls (`audit/checklist/evidence/coverage-session-response-header-inert-controls-2026-10-09-043.json`, untracked) and 39 authored guard tests/current source exits (`audit/checklist/evidence/coverage-session-response-header-current-source-gates-2026-10-09-043.json`, untracked). Controls are18counterguards/10conditional gaps. All39 tests pass0fail0skip, and the four current source CLIs pass. Inert source strings never execute/import a fixture or application handler. No HTTP/browser/authentication/upload/provider/native/SQL/database/build/install/production behavior or runtime/product acceptance is established. Current Root042 security-claims failure and prior Root035 RLS failure remain separately unresolved.

## AUDIT-SCANNER-REPORT-SHAPE-CLEAN-CREDIT-01

Severity: Medium. Status: open conditional source-instrument finding.

Rechecked on main (3ccb6f6) on 2026-10-15: still present for Trivy and ZAP; `normalizeTrivyReport` and `normalizeZapReport` read `report?.Results ?? []` and `report?.site ?? []`, so a report without either collection yields zero findings. The Semgrep half found on the 2026-09-27 copy is closed on main: `scripts/check-semgrep-findings.mjs` now requires `results` and `errors` arrays and fails a report that lists scanner errors. Line numbers for `scripts/check-scan-findings.mjs` are main's.

The complete unchanged Trivy and ZAP source gates each admit an unrelated valid JSON object as zero findings when their recognized result collection is missing. Recognized empty collections remain valid; missing files and invalid JSON refuse. This proves a conditional report-contract validation gap, not an observed scanner failure or hosted bypass. No scanner runs.

Source: `scripts/check-scan-findings.mjs:43-47,80-84`. Acceptance target: Require a recognized scanner report contract and applicable error-state validation before awarding clean result credit, retaining legitimate empty findings and independent process-failure counterguards.

Actual full source report (`audit/checklist/reviews/coverage-security-index-supply-guard-source-2026-10-09-044.json`, untracked), 34 independent controls (`audit/checklist/evidence/coverage-security-index-supply-inert-controls-2026-10-09-044.json`, untracked) and current guard outcomes (`audit/checklist/evidence/coverage-security-index-supply-current-source-gates-2026-10-09-044.json`, untracked). Controls are 19 counterguards / 15 conditional gaps. Actual authored guard suite has 41 tests: 40 pass, 1 fail, 0 skip; on the 2026-09-27 copy the supply-chain source CLI also failed on 31 findings under nested checkouts, which main's `git ls-files` inventory no longer reads, while both acceptance allowlists and the search-index source CLI passed. Current Root042 security-claims failure and prior Root035 RLS failure remain unresolved. Source strings and report data do not execute a fixture module, application, scanner, SQL, database, workflow, container, install, browser, provider or production behavior; no runtime/product acceptance.

## AUDIT-SCANNER-UNKNOWN-SEVERITY-DOWNGRADE-01

Severity: Medium. Status: open conditional source-instrument finding.

Rechecked on main (3ccb6f6) on 2026-10-15: still present. Main changed `scripts/check-scan-findings.mjs` after the 2026-09-27 copy this was found on without changing the cited logic; line numbers for it are main's.

The complete unchanged Trivy source gate refuses a recognized unaccepted HIGH vulnerability but admits a nonempty vulnerability collection whose severity is misspelled CRITCAL: unknown severity maps to rank zero and disappears below the HIGH floor. No current scanner emits this synthetic value; this is conditional source input-validation evidence, not a missed real vulnerability or production exposure.

Source: `scripts/check-scan-findings.mjs:34-36,43-53,232-236`. Acceptance target: Reject or explicitly quarantine unrecognized severity values in recognized nonempty finding data instead of silently assigning below-floor severity.

Actual full source report (`audit/checklist/reviews/coverage-security-index-supply-guard-source-2026-10-09-044.json`, untracked), 34 independent controls (`audit/checklist/evidence/coverage-security-index-supply-inert-controls-2026-10-09-044.json`, untracked) and current guard outcomes (`audit/checklist/evidence/coverage-security-index-supply-current-source-gates-2026-10-09-044.json`, untracked). Controls are 19 counterguards / 15 conditional gaps. Actual authored guard suite has 41 tests: 40 pass, 1 fail, 0 skip; on the 2026-09-27 copy the supply-chain source CLI also failed on 31 findings under nested checkouts, which main's `git ls-files` inventory no longer reads, while both acceptance allowlists and the search-index source CLI passed. Current Root042 security-claims failure and prior Root035 RLS failure remain unresolved. Source strings and report data do not execute a fixture module, application, scanner, SQL, database, workflow, container, install, browser, provider or production behavior; no runtime/product acceptance.

## AUDIT-SUPPLY-CHAIN-BASE-ARG-OMISSION-01

Severity: Medium. Status: open conditional source-instrument finding.

Rechecked on main (3ccb6f6) on 2026-10-15: still present. Main changed `scripts/check-supply-chain.mjs` after the 2026-09-27 copy this was found on without changing the cited logic; line numbers for it are main's.

The complete original supply-chain engine refuses a direct moving base image, but omits the same locally available literal when supplied through ARG and an interpolated FROM. Its image census becomes zero while the real frozen-install source census remains nonempty, and the engine passes. Authored pinned-ARG coverage and direct digest/tag checks are retained. No Docker/build/image resolution or external format assumption is exercised; this is conditional source-census evidence.

Source: `scripts/check-supply-chain.mjs:57-69,537-553`. Acceptance target: Resolve locally declared base image arguments or refuse unresolved base-image census before granting image pinning credit, preserving legitimate digest references and bounded resource checks.

Actual full source report (`audit/checklist/reviews/coverage-security-index-supply-guard-source-2026-10-09-044.json`, untracked), 34 independent controls (`audit/checklist/evidence/coverage-security-index-supply-inert-controls-2026-10-09-044.json`, untracked) and current guard outcomes (`audit/checklist/evidence/coverage-security-index-supply-current-source-gates-2026-10-09-044.json`, untracked). Controls are 19 counterguards / 15 conditional gaps. Actual authored guard suite has 41 tests: 40 pass, 1 fail, 0 skip; on the 2026-09-27 copy the supply-chain source CLI also failed on 31 findings under nested checkouts, which main's `git ls-files` inventory no longer reads, while both acceptance allowlists and the search-index source CLI passed. Current Root042 security-claims failure and prior Root035 RLS failure remain unresolved. Source strings and report data do not execute a fixture module, application, scanner, SQL, database, workflow, container, install, browser, provider or production behavior; no runtime/product acceptance.

## AUDIT-SEARCH-INDEX-TRIGGER-BINDING-01

Severity: Medium. Status: open conditional source-instrument finding; source unchanged.

The unchanged complete search-index source guard admits a source-shaped two-kind inventory after both CREATE TRIGGER statements are removed while unused retrieval_track function definitions remain. The guard collects lexical function bodies and infers enqueue/withdraw/refresh coverage without verifying installation. Missing contracts and loader kinds refuse. No DDL, migration, database, query or current missing trigger is executed or alleged.

Source: `scripts/check-search-index-coverage.mjs:126-157; scripts/lib/search-index-coverage.mjs:16-30`. Acceptance target: Resolve the live trigger bindings to tracking function bodies on the relevant source tables before claiming lifecycle coverage; retain append-only migration and valid source-kind constraints.

Actual full source report (`audit/checklist/reviews/coverage-security-index-supply-guard-source-2026-10-09-044.json`, untracked), 34 independent controls (`audit/checklist/evidence/coverage-security-index-supply-inert-controls-2026-10-09-044.json`, untracked) and current guard outcomes (`audit/checklist/evidence/coverage-security-index-supply-current-source-gates-2026-10-09-044.json`, untracked). Controls are 19 counterguards / 15 conditional gaps. Actual authored guard suite has 41 tests: 40 pass, 1 fail, 0 skip; on the 2026-09-27 copy the supply-chain source CLI also failed on 31 findings under nested checkouts, which main's `git ls-files` inventory no longer reads, while both acceptance allowlists and the search-index source CLI passed. Current Root042 security-claims failure and prior Root035 RLS failure remain unresolved. Source strings and report data do not execute a fixture module, application, scanner, SQL, database, workflow, container, install, browser, provider or production behavior; no runtime/product acceptance.

## AUDIT-SEARCH-LIFECYCLE-INERT-PREDICATE-01

Severity: Medium. Status: open conditional source-instrument finding; source unchanged.

The complete unchanged search source guard refuses an artifact loader arm with its lifecycle predicate removed, then admits the same arm when the predicate exists only in a comment. Raw arm.includes grants filtering credit without an executable query condition. Missing source/loader-kind controls still refuse. No actual loader, database withdrawal, stale passage or product access is measured.

Source: `scripts/check-search-index-coverage.mjs:162-171; scripts/lib/search-index-coverage.mjs:81-91`. Acceptance target: Bind lifecycle acceptance to executable query predicates on each actual source-loader arm and preserve intentional valid lifecycle alternatives.

Actual full source report (`audit/checklist/reviews/coverage-security-index-supply-guard-source-2026-10-09-044.json`, untracked), 34 independent controls (`audit/checklist/evidence/coverage-security-index-supply-inert-controls-2026-10-09-044.json`, untracked) and current guard outcomes (`audit/checklist/evidence/coverage-security-index-supply-current-source-gates-2026-10-09-044.json`, untracked). Controls are 19 counterguards / 15 conditional gaps. Actual authored guard suite has 41 tests: 40 pass, 1 fail, 0 skip; on the 2026-09-27 copy the supply-chain source CLI also failed on 31 findings under nested checkouts, which main's `git ls-files` inventory no longer reads, while both acceptance allowlists and the search-index source CLI passed. Current Root042 security-claims failure and prior Root035 RLS failure remain unresolved. Source strings and report data do not execute a fixture module, application, scanner, SQL, database, workflow, container, install, browser, provider or production behavior; no runtime/product acceptance.

## AUDIT-SEARCH-LOADER-SWITCH-REGION-CREDIT-01

Severity: Medium. Status: open conditional source-instrument finding; source unchanged.

The unchanged original search CLI admits an actual artifact loader arm missing its lifecycle predicate when a later unused switch outside that loader supplies a same-named case with the predicate. The fixed 12,000-character region collects case labels across switch boundaries and later duplicate keys overwrite the real arm. A fully removed predicate without that unrelated switch refuses. This is conditional source ownership/region evidence; no runtime loader failure is established.

Source: `scripts/lib/search-index-coverage.mjs:73-91; scripts/check-search-index-coverage.mjs:162-171`. Acceptance target: Resolve the actual loader switch boundaries and each owned case body without later unrelated switch text overwriting the canonical arm.

Actual full source report (`audit/checklist/reviews/coverage-security-index-supply-guard-source-2026-10-09-044.json`, untracked), 34 independent controls (`audit/checklist/evidence/coverage-security-index-supply-inert-controls-2026-10-09-044.json`, untracked) and current guard outcomes (`audit/checklist/evidence/coverage-security-index-supply-current-source-gates-2026-10-09-044.json`, untracked). Controls are 19 counterguards / 15 conditional gaps. Actual authored guard suite has 41 tests: 40 pass, 1 fail, 0 skip; on the 2026-09-27 copy the supply-chain source CLI also failed on 31 findings under nested checkouts, which main's `git ls-files` inventory no longer reads, while both acceptance allowlists and the search-index source CLI passed. Current Root042 security-claims failure and prior Root035 RLS failure remain unresolved. Source strings and report data do not execute a fixture module, application, scanner, SQL, database, workflow, container, install, browser, provider or production behavior; no runtime/product acceptance.

## AUDIT-VISUAL-SINK-FLOW-CENSUS-01

Severity: Medium. Status: open conditional source-instrument finding; source unchanged.

The complete original visual source checker refuses direct same-line frame.dataUrl logging but admits the same value when its logging call spans lines or when a destructured pixel alias is logged. It requires dotted field and sink markers on one physical line rather than following their value. The current shared contract still selects pixel-free telemetry, bounds sampling/buffering and releases blob frames; those real safeguards remain counterevidence. No actual pixel leak, capture, logging or browser flow runs.

Source: `scripts/check-visual-session-telemetry.mjs:122-133`. Acceptance target: Follow owned frame values into supported sinks across lines and aliases, retaining real metadata projection and missing/empty contract refusals.

Actual source report (`audit/checklist/reviews/coverage-voice-stream-metering-guard-source-2026-10-09-045.json`, untracked), 36 independently isolated controls (`audit/checklist/evidence/coverage-voice-stream-metering-inert-controls-2026-10-09-045-refined-wording.json`, untracked) and 29 authored guard tests / four current source CLIs (`audit/checklist/evidence/coverage-voice-stream-metering-current-source-gates-2026-10-09-045.json`, untracked). Controls are 22 counterguards and 14 conditional gaps grouped into ten causes. All 29 authored tests and four CLIs pass. The failed initial scratch census expectation and original completed receipt are preserved. Fresh complete replay leaves all 36 fixtures, expected exits and outcomes unchanged while qualifying the synthetic test marker and unprovided alias import as inert source data. Independent challenge narrows comment-proof exclusion separately from stored mute replay binding. No app/fixture-module/provider/voice/media/camera/stream/SQL/database/browser/native/network/build/install/production behavior or runtime/product acceptance. Prior Root044 supply-chain nested-scope failure, Root042 security-claims failure and Root035 RLS failure remain separately unresolved.

## AUDIT-VOICE-METER-INERT-SETTLEMENT-CREDIT-01

Severity: Medium. Status: open conditional source-instrument finding; source unchanged.

The complete original metering engine refuses a recognized completed settlement missing billedSeconds, then admits that counterpart when billedSeconds exists only in a comment. It also admits both required operation settlements when their complete direct call texts are comments. Nonempty census is retained but its rows are inert. Current quota and valid source inventories pass; no usage settlement, quota arithmetic, SQL, managed billing or voice session is executed.

Source: `scripts/check-voice-session-metering.mjs:69-93,114-127`. Acceptance target: Resolve executable settlement calls and actual usage object properties before granting operation census or summed-field write credit; retain missing quota and failed-field refusals.

Actual source report (`audit/checklist/reviews/coverage-voice-stream-metering-guard-source-2026-10-09-045.json`, untracked), 36 independently isolated controls (`audit/checklist/evidence/coverage-voice-stream-metering-inert-controls-2026-10-09-045-refined-wording.json`, untracked) and 29 authored guard tests / four current source CLIs (`audit/checklist/evidence/coverage-voice-stream-metering-current-source-gates-2026-10-09-045.json`, untracked). Controls are 22 counterguards and 14 conditional gaps grouped into ten causes. All 29 authored tests and four CLIs pass. The failed initial scratch census expectation and original completed receipt are preserved. Fresh complete replay leaves all 36 fixtures, expected exits and outcomes unchanged while qualifying the synthetic test marker and unprovided alias import as inert source data. Independent challenge narrows comment-proof exclusion separately from stored mute replay binding. No app/fixture-module/provider/voice/media/camera/stream/SQL/database/browser/native/network/build/install/production behavior or runtime/product acceptance. Prior Root044 supply-chain nested-scope failure, Root042 security-claims failure and Root035 RLS failure remain separately unresolved.

## AUDIT-VOICE-METER-ALIASED-SETTLEMENT-CENSUS-01

Severity: Medium. Status: open conditional source-instrument finding; source unchanged.

The unchanged complete voice metering engine admits an extra alias-named source call containing a completed usage object without its required field; its finalizeManagedUsageRequest import target ./usage is unprovided inert data, while separate baseline settlements keep both operation classes nonempty. The scanner recognizes only a direct fixed function name followed by an immediate object. No current aliased mounted settlement or undercharged allowance is alleged.

Source: `scripts/check-voice-session-metering.mjs:69-72,110-127`. Acceptance target: Resolve imported aliases and relevant call identity when enumerating settlement writes, retaining baseline nonempty operation census and legitimate failed/refused outcomes.

Actual source report (`audit/checklist/reviews/coverage-voice-stream-metering-guard-source-2026-10-09-045.json`, untracked), 36 independently isolated controls (`audit/checklist/evidence/coverage-voice-stream-metering-inert-controls-2026-10-09-045-refined-wording.json`, untracked) and 29 authored guard tests / four current source CLIs (`audit/checklist/evidence/coverage-voice-stream-metering-current-source-gates-2026-10-09-045.json`, untracked). Controls are 22 counterguards and 14 conditional gaps grouped into ten causes. All 29 authored tests and four CLIs pass. The failed initial scratch census expectation and original completed receipt are preserved. Fresh complete replay leaves all 36 fixtures, expected exits and outcomes unchanged while qualifying the synthetic test marker and unprovided alias import as inert source data. Independent challenge narrows comment-proof exclusion separately from stored mute replay binding. No app/fixture-module/provider/voice/media/camera/stream/SQL/database/browser/native/network/build/install/production behavior or runtime/product acceptance. Prior Root044 supply-chain nested-scope failure, Root042 security-claims failure and Root035 RLS failure remain separately unresolved.

## AUDIT-VOICE-PARITY-INERT-PROOF-CREDIT-01

Severity: Medium. Status: open conditional source-instrument finding; source unchanged.

The complete original parity engine admits one source-shaped session whose disposal calls and pending-mute assignment/reference are solely comments while event cases remain nonempty and both surface vocabularies agree. Removing the corresponding assignment or close-disposal marker entirely refuses. This is conditional executable-proof validation evidence; no current media/resource leak, mounted muted state, web/mobile runtime or provider event runs.

Source: `scripts/check-voice-session-parity.mjs:70-86,119-132`. Acceptance target: Exclude comment-only disposal and pending-mute markers from executable proof on the applicable methods and branches, preserving genuine event parity and missing-surface checks. Stored mute read/send binding remains the separate AUDIT-VOICE-PENDING-MUTE-REPLAY-CREDIT-01 target.

Actual source report (`audit/checklist/reviews/coverage-voice-stream-metering-guard-source-2026-10-09-045.json`, untracked), 36 independently isolated controls (`audit/checklist/evidence/coverage-voice-stream-metering-inert-controls-2026-10-09-045-refined-wording.json`, untracked) and 29 authored guard tests / four current source CLIs (`audit/checklist/evidence/coverage-voice-stream-metering-current-source-gates-2026-10-09-045.json`, untracked). Controls are 22 counterguards and 14 conditional gaps grouped into ten causes. All 29 authored tests and four CLIs pass. The failed initial scratch census expectation and original completed receipt are preserved. Fresh complete replay leaves all 36 fixtures, expected exits and outcomes unchanged while qualifying the synthetic test marker and unprovided alias import as inert source data. Independent challenge narrows comment-proof exclusion separately from stored mute replay binding. No app/fixture-module/provider/voice/media/camera/stream/SQL/database/browser/native/network/build/install/production behavior or runtime/product acceptance. Prior Root044 supply-chain nested-scope failure, Root042 security-claims failure and Root035 RLS failure remain separately unresolved.

## AUDIT-VOICE-CLOSED-DISPOSE-BRANCH-CREDIT-01

Severity: Medium. Status: open conditional source-instrument finding; source unchanged.

The complete unchanged parity engine accepts a session.closed case without disposal when a later session.usage.updated case disposes instead. Its suffix search begins at the closed label and crosses later case boundaries; separate close and fail methods still dispose. No live closed-session resource behavior or current product failure is observed.

Source: `scripts/check-voice-session-parity.mjs:77-87`. Acceptance target: Bind session.closed disposal to its owned executable branch and allowed delegates without borrowing from unrelated subsequent cases.

Actual source report (`audit/checklist/reviews/coverage-voice-stream-metering-guard-source-2026-10-09-045.json`, untracked), 36 independently isolated controls (`audit/checklist/evidence/coverage-voice-stream-metering-inert-controls-2026-10-09-045-refined-wording.json`, untracked) and 29 authored guard tests / four current source CLIs (`audit/checklist/evidence/coverage-voice-stream-metering-current-source-gates-2026-10-09-045.json`, untracked). Controls are 22 counterguards and 14 conditional gaps grouped into ten causes. All 29 authored tests and four CLIs pass. The failed initial scratch census expectation and original completed receipt are preserved. Fresh complete replay leaves all 36 fixtures, expected exits and outcomes unchanged while qualifying the synthetic test marker and unprovided alias import as inert source data. Independent challenge narrows comment-proof exclusion separately from stored mute replay binding. No app/fixture-module/provider/voice/media/camera/stream/SQL/database/browser/native/network/build/install/production behavior or runtime/product acceptance. Prior Root044 supply-chain nested-scope failure, Root042 security-claims failure and Root035 RLS failure remain separately unresolved.

## AUDIT-VOICE-PENDING-MUTE-REPLAY-CREDIT-01

Severity: Medium. Status: open conditional source-instrument finding; source unchanged.

The original full parity engine admits a session retaining a real pendingMuted assignment but replacing its start branch read/send with an unrelated local pendingMuted=null and return. A name anywhere in handleMessage supplies replay credit without reading stored mute or sending it. Removing the storage assignment refuses. This is conditional source-proof evidence; no muted-state incident, media/device or running session is exercised.

Source: `scripts/check-voice-session-parity.mjs:70-74`. Acceptance target: Resolve the stored mute read and applied state on the session-start branch before claiming replay, retaining legitimate delayed application and unstarted-session guards.

Actual source report (`audit/checklist/reviews/coverage-voice-stream-metering-guard-source-2026-10-09-045.json`, untracked), 36 independently isolated controls (`audit/checklist/evidence/coverage-voice-stream-metering-inert-controls-2026-10-09-045-refined-wording.json`, untracked) and 29 authored guard tests / four current source CLIs (`audit/checklist/evidence/coverage-voice-stream-metering-current-source-gates-2026-10-09-045.json`, untracked). Controls are 22 counterguards and 14 conditional gaps grouped into ten causes. All 29 authored tests and four CLIs pass. The failed initial scratch census expectation and original completed receipt are preserved. Fresh complete replay leaves all 36 fixtures, expected exits and outcomes unchanged while qualifying the synthetic test marker and unprovided alias import as inert source data. Independent challenge narrows comment-proof exclusion separately from stored mute replay binding. No app/fixture-module/provider/voice/media/camera/stream/SQL/database/browser/native/network/build/install/production behavior or runtime/product acceptance. Prior Root044 supply-chain nested-scope failure, Root042 security-claims failure and Root035 RLS failure remain separately unresolved.

## AUDIT-STREAM-INERT-TRANSLATION-CREDIT-01

Severity: Medium. Status: open conditional source-instrument finding; source unchanged.

The original complete stream checker admits a translator with its terminal yield replaced only by a comment, a mapper with its usage case replaced only by a comment, and a provider index whose actual stream is null but an unused string names a canonical translator. Removing each marker entirely refuses. Four actual current conformance files import their real translators and contain substantive assertions; their source is preserved as counterevidence. OpenAI intentionally allows trailing usage after stop, so no universal terminal-last rule or actual current translator failure is asserted.

Source: `scripts/check-stream-protocol.mjs:117-129,148-165`. Acceptance target: Bind canonical translation, mapper handling and terminal emission credit to executable owned code while preserving each provider legitimate ordering contract.

Actual source report (`audit/checklist/reviews/coverage-voice-stream-metering-guard-source-2026-10-09-045.json`, untracked), 36 independently isolated controls (`audit/checklist/evidence/coverage-voice-stream-metering-inert-controls-2026-10-09-045-refined-wording.json`, untracked) and 29 authored guard tests / four current source CLIs (`audit/checklist/evidence/coverage-voice-stream-metering-current-source-gates-2026-10-09-045.json`, untracked). Controls are 22 counterguards and 14 conditional gaps grouped into ten causes. All 29 authored tests and four CLIs pass. The failed initial scratch census expectation and original completed receipt are preserved. Fresh complete replay leaves all 36 fixtures, expected exits and outcomes unchanged while qualifying the synthetic test marker and unprovided alias import as inert source data. Independent challenge narrows comment-proof exclusion separately from stored mute replay binding. No app/fixture-module/provider/voice/media/camera/stream/SQL/database/browser/native/network/build/install/production behavior or runtime/product acceptance. Prior Root044 supply-chain nested-scope failure, Root042 security-claims failure and Root035 RLS failure remain separately unresolved.

## AUDIT-STREAM-CONFORMANCE-FILE-CREDIT-01

Severity: Medium. Status: open conditional source-instrument finding; source unchanged.

The complete unchanged stream checker refuses an absent terminal-discipline path but admits an export-only file containing no test or assertion. Its authored synthetic baseline likewise uses that export-only file. All four current provider conformance files are independently reread and contain meaningful translator/ordering/error/refusal assertions; no broad absence of present tests is claimed, and none of those app/provider tests run.

Source: `scripts/check-stream-protocol.mjs:151-155; scripts/check-stream-protocol.test.mjs:76-83`. Acceptance target: Require applicable executable conformance assertions and actual validation evidence rather than test-path existence, retaining real provider-specific terminal discipline.

Actual source report (`audit/checklist/reviews/coverage-voice-stream-metering-guard-source-2026-10-09-045.json`, untracked), 36 independently isolated controls (`audit/checklist/evidence/coverage-voice-stream-metering-inert-controls-2026-10-09-045-refined-wording.json`, untracked) and 29 authored guard tests / four current source CLIs (`audit/checklist/evidence/coverage-voice-stream-metering-current-source-gates-2026-10-09-045.json`, untracked). Controls are 22 counterguards and 14 conditional gaps grouped into ten causes. All 29 authored tests and four CLIs pass. The failed initial scratch census expectation and original completed receipt are preserved. Fresh complete replay leaves all 36 fixtures, expected exits and outcomes unchanged while qualifying the synthetic test marker and unprovided alias import as inert source data. Independent challenge narrows comment-proof exclusion separately from stored mute replay binding. No app/fixture-module/provider/voice/media/camera/stream/SQL/database/browser/native/network/build/install/production behavior or runtime/product acceptance. Prior Root044 supply-chain nested-scope failure, Root042 security-claims failure and Root035 RLS failure remain separately unresolved.

## AUDIT-STREAM-SESSION-ID-EXPRESSION-CREDIT-01

Severity: Medium. Status: open conditional source-instrument finding; source unchanged.

The full unchanged stream checker refuses an explicit random session ID expression, then admits that expression when a comment containing conversationId is appended. A substring search supplies derivation credit without a semantic data dependency. Valid actual-shaped direct and shorthand conversation expressions pass; no current split conversation ledger or actual emitter/provider behavior is executed.

Source: `scripts/check-stream-protocol.mjs:85-105`. Acceptance target: Resolve the emitter session ID actual conversation value and local binding rather than a comment/string substring, preserving legitimate fallback and shorthand expressions.

Actual source report (`audit/checklist/reviews/coverage-voice-stream-metering-guard-source-2026-10-09-045.json`, untracked), 36 independently isolated controls (`audit/checklist/evidence/coverage-voice-stream-metering-inert-controls-2026-10-09-045-refined-wording.json`, untracked) and 29 authored guard tests / four current source CLIs (`audit/checklist/evidence/coverage-voice-stream-metering-current-source-gates-2026-10-09-045.json`, untracked). Controls are 22 counterguards and 14 conditional gaps grouped into ten causes. All 29 authored tests and four CLIs pass. The failed initial scratch census expectation and original completed receipt are preserved. Fresh complete replay leaves all 36 fixtures, expected exits and outcomes unchanged while qualifying the synthetic test marker and unprovided alias import as inert source data. Independent challenge narrows comment-proof exclusion separately from stored mute replay binding. No app/fixture-module/provider/voice/media/camera/stream/SQL/database/browser/native/network/build/install/production behavior or runtime/product acceptance. Prior Root044 supply-chain nested-scope failure, Root042 security-claims failure and Root035 RLS failure remain separately unresolved.

## AUDIT-STREAM-YIELD-OBJECT-CENSUS-01

Severity: Medium. Status: open conditional source-instrument finding; source unchanged.

The complete original stream checker refuses an unrecognized type in a direct yielded object when type is first, but admits the same object when delta precedes type. The matcher only enumerates first-property type literals. Canonical terminal source and test inventory remain nonempty; no actual provider emits the synthetic type and no runtime/client failure is observed.

Source: `scripts/check-stream-protocol.mjs:68-69,138-146`. Acceptance target: Enumerate direct yielded object type properties independently of order and preserve the deliberate exclusion of nested vendor payload types.

Actual source report (`audit/checklist/reviews/coverage-voice-stream-metering-guard-source-2026-10-09-045.json`, untracked), 36 independently isolated controls (`audit/checklist/evidence/coverage-voice-stream-metering-inert-controls-2026-10-09-045-refined-wording.json`, untracked) and 29 authored guard tests / four current source CLIs (`audit/checklist/evidence/coverage-voice-stream-metering-current-source-gates-2026-10-09-045.json`, untracked). Controls are 22 counterguards and 14 conditional gaps grouped into ten causes. All 29 authored tests and four CLIs pass. The failed initial scratch census expectation and original completed receipt are preserved. Fresh complete replay leaves all 36 fixtures, expected exits and outcomes unchanged while qualifying the synthetic test marker and unprovided alias import as inert source data. Independent challenge narrows comment-proof exclusion separately from stored mute replay binding. No app/fixture-module/provider/voice/media/camera/stream/SQL/database/browser/native/network/build/install/production behavior or runtime/product acceptance. Prior Root044 supply-chain nested-scope failure, Root042 security-claims failure and Root035 RLS failure remain separately unresolved.

## AUDIT-TEST-HYGIENE-EXECUTABLE-MASK-01

Severity: Medium. Status: open conditional source-instrument finding.

Rechecked on main (3ccb6f6) on 2026-10-15: still present. Main changed `scripts/check-test-hygiene.mjs` after the 2026-09-27 copy this was found on without changing the cited logic; line numbers for it are main's.

The complete original masking engine omits source-shaped focused/retry calls within executable template substitutions and a separate focused call between two quoted comment delimiters. Direct calls refuse and inert quoted focus text remains excluded. All fixtures are source data, never executed.

Source: `scripts/check-test-hygiene.mjs:84-88,99-113,129-133`. Acceptance target: Preserve executable template substitutions and lex comment delimiters within their actual literal scope; continue excluding inert marker text and refusing direct focused/retry calls.

Actual source report (`audit/checklist/reviews/coverage-test-evidence-instrument-source-2026-10-09-046.json`, untracked), 32 independent controls (`audit/checklist/evidence/coverage-test-evidence-inert-controls-2026-10-09-046.json`, untracked), current guard outcomes (`audit/checklist/evidence/coverage-test-evidence-current-source-gates-2026-10-09-046.json`, untracked) and independent challenge (`audit/checklist/evidence/coverage-test-evidence-independent-challenge-2026-10-09-046.json`, untracked). Controls: 18 counterguards / 14 conditional gaps grouped into eight causes. Original authored source-guard suite: 25 tests, 24 pass, one fail, zero skip. On the 2026-09-27 copy the hygiene and integrity source CLIs failed on 27 and 21 findings under nested checkouts, which main's `git ls-files` inventory no longer reads; the vacuity CLI passed. No source/config/tool edit, app/fixture/spec module execution, coverage/tier/package tests, browser/provider/SQL/native/network/build/install/production or runtime/product acceptance. Prior Root044 supply, Root042 security-claim and Root035 RLS failures remain unresolved.

## AUDIT-TEST-INTEGRITY-CALLBACK-CENSUS-01

Severity: Low. Status: open conditional source-instrument finding.

Rechecked on main (3ccb6f6) on 2026-10-15: still present. Main changed `scripts/check-test-integrity.mjs` after the 2026-09-27 copy this was found on without changing the cited logic; line numbers for it are main's.

The full original scanner reports an assertion-free block or function callback, but omits a syntactically valid expression callback returning undefined and accepts it. This is incomplete callback census, not evidence that any current application test lacks its oracle. The implementation explicitly searches for block bodies; this is a bounded acceptance gap, not a demonstrated violation of a promise to prove every semantic test oracle. Current expression-callback gate requirements remain unknown.

Source: `scripts/check-test-integrity.mjs:155-203,455-463`. Acceptance target: Define the intended callback acceptance scope explicitly; include applicable expression callbacks if the gate requires them. Retain block/function/parameterized callback guards without claiming semantic oracle completeness.

Actual source report (`audit/checklist/reviews/coverage-test-evidence-instrument-source-2026-10-09-046.json`, untracked), 32 independent controls (`audit/checklist/evidence/coverage-test-evidence-inert-controls-2026-10-09-046.json`, untracked), current guard outcomes (`audit/checklist/evidence/coverage-test-evidence-current-source-gates-2026-10-09-046.json`, untracked) and independent challenge (`audit/checklist/evidence/coverage-test-evidence-independent-challenge-2026-10-09-046.json`, untracked). Controls: 18 counterguards / 14 conditional gaps grouped into eight causes. Original authored source-guard suite: 25 tests, 24 pass, one fail, zero skip. On the 2026-09-27 copy the hygiene and integrity source CLIs failed on 27 and 21 findings under nested checkouts, which main's `git ls-files` inventory no longer reads; the vacuity CLI passed. No source/config/tool edit, app/fixture/spec module execution, coverage/tier/package tests, browser/provider/SQL/native/network/build/install/production or runtime/product acceptance. Prior Root044 supply, Root042 security-claim and Root035 RLS failures remain unresolved.

## AUDIT-TEST-INTEGRITY-NONEMPTY-CATCH-01

Severity: Low. Status: open conditional source-instrument finding.

Rechecked on main (3ccb6f6) on 2026-10-15: still present. Main changed `scripts/check-test-integrity.mjs` after the 2026-09-27 copy this was found on without changing the cited logic; line numbers for it are main's.

The complete engine refuses an empty catch around an assertion-bearing try but accepts the same source-shaped try with void error in the catch and no rethrow or alternative failing oracle. A real rethrow is separately accepted. No test fixture or assertion is executed. The implementation explicitly targets empty catch handlers. The broader no-op-handler case is a bounded acceptance gap; semantic catch-oracle completeness is not an established current promise.

Source: `scripts/check-test-integrity.mjs:283-296`. Acceptance target: Keep the present guarantee explicitly bounded to empty catches, or validate applicable nonempty handlers for rethrow or a preserved failing oracle when broader coverage is required. Retain intentional bare try and meaningful error assertions.

Actual source report (`audit/checklist/reviews/coverage-test-evidence-instrument-source-2026-10-09-046.json`, untracked), 32 independent controls (`audit/checklist/evidence/coverage-test-evidence-inert-controls-2026-10-09-046.json`, untracked), current guard outcomes (`audit/checklist/evidence/coverage-test-evidence-current-source-gates-2026-10-09-046.json`, untracked) and independent challenge (`audit/checklist/evidence/coverage-test-evidence-independent-challenge-2026-10-09-046.json`, untracked). Controls: 18 counterguards / 14 conditional gaps grouped into eight causes. Original authored source-guard suite: 25 tests, 24 pass, one fail, zero skip. On the 2026-09-27 copy the hygiene and integrity source CLIs failed on 27 and 21 findings under nested checkouts, which main's `git ls-files` inventory no longer reads; the vacuity CLI passed. No source/config/tool edit, app/fixture/spec module execution, coverage/tier/package tests, browser/provider/SQL/native/network/build/install/production or runtime/product acceptance. Prior Root044 supply, Root042 security-claim and Root035 RLS failures remain unresolved.

## AUDIT-TEST-INTEGRITY-INERT-VACUITY-01

Severity: Medium. Status: open conditional source-instrument finding.

Rechecked on main (3ccb6f6) on 2026-10-15: still present. Main changed `scripts/check-test-integrity.mjs` after the 2026-09-27 copy this was found on without changing the cited logic; line numbers for it are main's.

The complete original raw-source vacuity scan reports a comment-only or quoted expect(true).toBeTruthy example while the actual-shaped callback retains a real assertion. Masked callback analysis still correctly excludes quoted inner test bodies. Instrument false-red property only, no current genuine failures dismissed.

Source: `scripts/check-test-integrity.mjs:421-444`. Acceptance target: Match executable vacuity forms while retaining relevant literal operands and excluding comment/quoted examples; preserve real literal vacuity and self-comparison enforcement.

Actual source report (`audit/checklist/reviews/coverage-test-evidence-instrument-source-2026-10-09-046.json`, untracked), 32 independent controls (`audit/checklist/evidence/coverage-test-evidence-inert-controls-2026-10-09-046.json`, untracked), current guard outcomes (`audit/checklist/evidence/coverage-test-evidence-current-source-gates-2026-10-09-046.json`, untracked) and independent challenge (`audit/checklist/evidence/coverage-test-evidence-independent-challenge-2026-10-09-046.json`, untracked). Controls: 18 counterguards / 14 conditional gaps grouped into eight causes. Original authored source-guard suite: 25 tests, 24 pass, one fail, zero skip. On the 2026-09-27 copy the hygiene and integrity source CLIs failed on 27 and 21 findings under nested checkouts, which main's `git ls-files` inventory no longer reads; the vacuity CLI passed. No source/config/tool edit, app/fixture/spec module execution, coverage/tier/package tests, browser/provider/SQL/native/network/build/install/production or runtime/product acceptance. Prior Root044 supply, Root042 security-claim and Root035 RLS failures remain unresolved.

## AUDIT-TEST-SOURCE-NONEMPTY-CENSUS-01

Severity: Medium. Status: open conditional source-instrument finding.

Rechecked on main (3ccb6f6) on 2026-10-15: still present. Main's integrity guard lists its default scope with `git ls-files` and returns an empty list when that command fails, so an empty default census still passes; the vacuity guard is unchanged. Line numbers for `scripts/check-test-integrity.mjs` are main's.

Both complete original default source CLIs run over a private empty directory, report zero scanned files and exit zero. Current hygiene rejects the empty file census; changed/staged no-change scans may legitimately be empty and must remain distinct. No current repository empty scope or product tests are alleged.

Source: `scripts/check-test-integrity.mjs:473-501; scripts/check-vacuous-e2e.mjs:58-76,108-111`. Acceptance target: Require an intentional nonempty default source census, while preserving legitimately empty changed/staged subsets and clear zero-scope diagnostics.

Actual source report (`audit/checklist/reviews/coverage-test-evidence-instrument-source-2026-10-09-046.json`, untracked), 32 independent controls (`audit/checklist/evidence/coverage-test-evidence-inert-controls-2026-10-09-046.json`, untracked), current guard outcomes (`audit/checklist/evidence/coverage-test-evidence-current-source-gates-2026-10-09-046.json`, untracked) and independent challenge (`audit/checklist/evidence/coverage-test-evidence-independent-challenge-2026-10-09-046.json`, untracked). Controls: 18 counterguards / 14 conditional gaps grouped into eight causes. Original authored source-guard suite: 25 tests, 24 pass, one fail, zero skip. On the 2026-09-27 copy the hygiene and integrity source CLIs failed on 27 and 21 findings under nested checkouts, which main's `git ls-files` inventory no longer reads; the vacuity CLI passed. No source/config/tool edit, app/fixture/spec module execution, coverage/tier/package tests, browser/provider/SQL/native/network/build/install/production or runtime/product acceptance. Prior Root044 supply, Root042 security-claim and Root035 RLS failures remain unresolved.

## AUDIT-E2E-BARE-CALL-CENSUS-01

Severity: Medium. Status: open conditional source-instrument finding; source unchanged.

The complete original source CLI refuses a line-start bare test with conditional skip, but accepts that call following another statement or modified as test.only because no bare line-start test enters its census. The hygiene guard separately catches direct test.only; no composite CI bypass or spec runtime is claimed.

Source: `scripts/check-vacuous-e2e.mjs:27-28,65-75`. Acceptance target: Enumerate applicable actual test calls independent of physical line placement and supported modifiers, preserving annotations and explicit source scope.

Actual source report (`audit/checklist/reviews/coverage-test-evidence-instrument-source-2026-10-09-046.json`, untracked), 32 independent controls (`audit/checklist/evidence/coverage-test-evidence-inert-controls-2026-10-09-046.json`, untracked), current guard outcomes (`audit/checklist/evidence/coverage-test-evidence-current-source-gates-2026-10-09-046.json`, untracked) and independent challenge (`audit/checklist/evidence/coverage-test-evidence-independent-challenge-2026-10-09-046.json`, untracked). Controls: 18 counterguards / 14 conditional gaps grouped into eight causes. Original authored source-guard suite: 25 tests, 24 pass, one fail, zero skip. On the 2026-09-27 copy the hygiene and integrity source CLIs failed on 27 and 21 findings under nested checkouts, which main's `git ls-files` inventory no longer reads; the vacuity CLI passed. No source/config/tool edit, app/fixture/spec module execution, coverage/tier/package tests, browser/provider/SQL/native/network/build/install/production or runtime/product acceptance. Prior Root044 supply, Root042 security-claim and Root035 RLS failures remain unresolved.

## AUDIT-E2E-SKIP-CALLBACK-ATTRIBUTION-01

Severity: Medium. Status: open conditional source-instrument finding; source unchanged.

A private source spec has two callbacks and both conditional skip occurrences in only the first callback; the second retains an unconditional assertion. The complete original guard reports every test can skip itself from aggregate counts. Annotation and direct one-test refusal controls remain intact; no browser/spec execution occurs.

Source: `scripts/check-vacuous-e2e.mjs:65-84`. Acceptance target: Attribute conditional skips to their owning callbacks before claiming every test can skip; preserve real conditional availability cases and annotated exceptions.

Actual source report (`audit/checklist/reviews/coverage-test-evidence-instrument-source-2026-10-09-046.json`, untracked), 32 independent controls (`audit/checklist/evidence/coverage-test-evidence-inert-controls-2026-10-09-046.json`, untracked), current guard outcomes (`audit/checklist/evidence/coverage-test-evidence-current-source-gates-2026-10-09-046.json`, untracked) and independent challenge (`audit/checklist/evidence/coverage-test-evidence-independent-challenge-2026-10-09-046.json`, untracked). Controls: 18 counterguards / 14 conditional gaps grouped into eight causes. Original authored source-guard suite: 25 tests, 24 pass, one fail, zero skip. On the 2026-09-27 copy the hygiene and integrity source CLIs failed on 27 and 21 findings under nested checkouts, which main's `git ls-files` inventory no longer reads; the vacuity CLI passed. No source/config/tool edit, app/fixture/spec module execution, coverage/tier/package tests, browser/provider/SQL/native/network/build/install/production or runtime/product acceptance. Prior Root044 supply, Root042 security-claim and Root035 RLS failures remain unresolved.

## AUDIT-COVERAGE-CONFIG-OWNER-BINDING-01

Severity: Medium. Status: open conditional source-instrument finding; source unchanged.

The complete original parser takes an earlier unrelated package script threshold of 1 instead of scripts.test:coverage floor 75, and an earlier comment project list instead of the actual configuration. Actual runCoverage source consumes these values but is never executed. Existing nonempty/duplicate/null/report/failure/stale checks remain source counterevidence; no current floor or measured coverage success is claimed. Current actual root floor is 75 and the real project owner has no shown mismatch. Later runner/report/failure/nonempty/stale checks remain counterguards, so this parser falsifier does not establish an automatic green coverage bypass.

Source: `scripts/lib/coverage-floors.mjs:1-24; scripts/run-coverage.mjs:16-21,60-64`. Acceptance target: Bind the root floor to scripts.test:coverage and project scope to the actual executable configuration; preserve current nonempty/duplicate/null/report/failure/stale evidence refusals.

Actual source report (`audit/checklist/reviews/coverage-test-evidence-instrument-source-2026-10-09-046.json`, untracked), 32 independent controls (`audit/checklist/evidence/coverage-test-evidence-inert-controls-2026-10-09-046.json`, untracked), current guard outcomes (`audit/checklist/evidence/coverage-test-evidence-current-source-gates-2026-10-09-046.json`, untracked) and independent challenge (`audit/checklist/evidence/coverage-test-evidence-independent-challenge-2026-10-09-046.json`, untracked). Controls: 18 counterguards / 14 conditional gaps grouped into eight causes. Original authored source-guard suite: 25 tests, 24 pass, one fail, zero skip. On the 2026-09-27 copy the hygiene and integrity source CLIs failed on 27 and 21 findings under nested checkouts, which main's `git ls-files` inventory no longer reads; the vacuity CLI passed. No source/config/tool edit, app/fixture/spec module execution, coverage/tier/package tests, browser/provider/SQL/native/network/build/install/production or runtime/product acceptance. Prior Root044 supply, Root042 security-claim and Root035 RLS failures remain unresolved.

## AUDIT-WORKSPACE-POLICY-INERT-ENFORCEMENT-PROOF-01

Severity: Medium. Status: open conditional source-instrument qualification, October 9, 2026.

Rechecked on main (3ccb6f6) on 2026-10-15: still present. Main added a fourth enforcement shape, `evaluateManagedComputeAccess`, matched in raw source text the same way. Line numbers for `scripts/lib/workspace-policy-enforcement.mjs` are main's.

The complete original engine accepts enforcement proof solely in a comment and credits detached act-shaped data without proving gate invocation; route-family comments also qualify publication. Real source-shaped proof, missing proof, excluded storage, all-empty key census and missing served family counterguards remain. Nonfeature identifier semantics are explicitly limited by the current instrument.

Source: `scripts/lib/workspace-policy-enforcement.mjs:80-81,86-95,129-134,174-187,200-207`. Actual source report (`audit/checklist/reviews/coverage-workspace-settings-time-guard-source-2026-10-09-047.json`, untracked); original source guard outcomes (`audit/checklist/evidence/coverage-workspace-settings-time-current-source-gates-2026-10-09-047.json`, untracked); complete original-engine inert controls (`audit/checklist/evidence/coverage-workspace-settings-time-inert-controls-2026-10-09-047.json`, untracked); independent premise challenge (`audit/checklist/evidence/coverage-workspace-settings-time-independent-challenge-2026-10-09-047.json`, untracked).

Controls: policy-inert-comment-proof, policy-uninvoked-act-data, policy-inert-published-family.

Acceptance target: Bind applicable enforcement and published-family proof to executable decision/gate/return ownership while retaining explicit narrow source shapes and missing-proof refusals.

Limits: Inert source fixtures are never executed as application/modules or SQL. Current44 authored source-guard tests and four source CLIs pass. Their green outcomes do not establish production/browser/native/provider/database/scheduler behavior, fixture framework/type validity, a global CI bypass or product acceptance. Earlier Root046 hygiene/integrity, Root044 supply-chain, Root042 security-claim and Root035 RLS failures remain unresolved.

## AUDIT-WORKSPACE-POLICY-PARTIAL-KEY-CENSUS-01

Severity: Low. Status: open conditional source-instrument qualification, October 9, 2026.

Rechecked on main (3ccb6f6) on 2026-10-15: still present. Main changed `scripts/lib/workspace-policy-enforcement.mjs` after the 2026-09-27 copy this was found on without changing the cited logic; line numbers for it are main's.

A contract source containing only the recognized feature vocabulary returns one declared key and no error when that feature marker exists; absent control/code declarations do not invalidate the nonempty census. An entirely empty census refuses. Current actual contract reports 23 keys, and a broader semantic completeness requirement or composite CI bypass is not established.

Source: `scripts/lib/workspace-policy-enforcement.mjs:19-46,156-164`. Actual source report (`audit/checklist/reviews/coverage-workspace-settings-time-guard-source-2026-10-09-047.json`, untracked); original source guard outcomes (`audit/checklist/evidence/coverage-workspace-settings-time-current-source-gates-2026-10-09-047.json`, untracked); complete original-engine inert controls (`audit/checklist/evidence/coverage-workspace-settings-time-inert-controls-2026-10-09-047.json`, untracked); independent premise challenge (`audit/checklist/evidence/coverage-workspace-settings-time-independent-challenge-2026-10-09-047.json`, untracked).

Controls: policy-partial-key-census, policy-zero-key-census.

Acceptance target: Explicitly define required vocabulary-family acceptance; refuse unreadable required declarations if the gate depends on a complete contract census, preserving legitimate schema changes.

Limits: Inert source fixtures are never executed as application/modules or SQL. Current44 authored source-guard tests and four source CLIs pass. Their green outcomes do not establish production/browser/native/provider/database/scheduler behavior, fixture framework/type validity, a global CI bypass or product acceptance. Earlier Root046 hygiene/integrity, Root044 supply-chain, Root042 security-claim and Root035 RLS failures remain unresolved.

## AUDIT-WORK-CLIENT-PERSISTENCE-BINDING-01

Severity: Medium. Status: open conditional source-instrument qualification, October 9, 2026; source unchanged.

A separate recognized preference store keeps the positive census while a double-quoted or aliased zustand Work persistence binding is omitted and the source checker returns zero. Direct whole-store, explicit held-field and wholly empty store census refuse. No browser storage or fixture module executes, and no actual current product store omission is asserted.

Source: `scripts/check-work-client-state.mjs:82-90,109-111`. Actual source report (`audit/checklist/reviews/coverage-workspace-settings-time-guard-source-2026-10-09-047.json`, untracked); original source guard outcomes (`audit/checklist/evidence/coverage-workspace-settings-time-current-source-gates-2026-10-09-047.json`, untracked); complete original-engine inert controls (`audit/checklist/evidence/coverage-workspace-settings-time-inert-controls-2026-10-09-047.json`, untracked); independent premise challenge (`audit/checklist/evidence/coverage-workspace-settings-time-independent-challenge-2026-10-09-047.json`, untracked).

Controls: work-double-quoted-binding, work-aliased-binding, work-whole-store-refusal, work-empty-census.

Acceptance target: Resolve the applicable middleware import and persistence call bindings across supported syntax before claiming scanned stores keep preferences only.

Limits: Inert source fixtures are never executed as application/modules or SQL. Current44 authored source-guard tests and four source CLIs pass. Their green outcomes do not establish production/browser/native/provider/database/scheduler behavior, fixture framework/type validity, a global CI bypass or product acceptance. Earlier Root046 hygiene/integrity, Root044 supply-chain, Root042 security-claim and Root035 RLS failures remain unresolved.

October9 source-guard qualification: The cache sweep census rejects a direct unregistered single-quoted persist store but omits an unregistered store whose name uses double quotes or whose persist callee is aliased. A separate recognized store keeps the scan nonempty. This extends the existing browser persistence source-census binding owner with zero new cause; actual current unswept store or browser persistence is unexecuted. Source: `scripts/lib/workspace-cache-scope.mjs:48-51; scripts/check-workspace-cache-scope.mjs:86-102`. Actual source reading (`audit/checklist/reviews/coverage-cache-version-workflow-guard-source-2026-10-09-048.json`, untracked); original engine controls (`audit/checklist/evidence/coverage-cache-version-workflow-inert-controls-2026-10-09-048.json`, untracked); valid companions (`audit/checklist/evidence/coverage-cache-version-workflow-valid-companions-2026-10-09-048.json`, untracked); independent challenge (`audit/checklist/evidence/coverage-cache-version-workflow-independent-challenge-2026-10-09-048.json`, untracked). Zero new cause or runtime acceptance.

## AUDIT-WORK-CLIENT-PARTIALIZER-OWNERSHIP-01

Severity: Medium. Status: open conditional source-instrument qualification, October 9, 2026; source unchanged.

The selected partialize text block can occur only in a comment, and a real source-shaped partializer spreading the whole state omits literal held-field names. Both pass despite retaining a recognized Work store. Missing partializer and explicit held fields refuse. The fixtures remain inert source; product persistence behavior is unexecuted.

Source: `scripts/check-work-client-state.mjs:47-66,88-100`. Actual source report (`audit/checklist/reviews/coverage-workspace-settings-time-guard-source-2026-10-09-047.json`, untracked); original source guard outcomes (`audit/checklist/evidence/coverage-workspace-settings-time-current-source-gates-2026-10-09-047.json`, untracked); complete original-engine inert controls (`audit/checklist/evidence/coverage-workspace-settings-time-inert-controls-2026-10-09-047.json`, untracked); independent premise challenge (`audit/checklist/evidence/coverage-workspace-settings-time-independent-challenge-2026-10-09-047.json`, untracked).

Controls: work-comment-partializer, work-partializer-spread, work-whole-store-refusal, work-explicit-held-field.

Acceptance target: Bind the partializer to the applicable persist options and qualify its actual returned state, retaining missing-block and explicit held-field refusals.

Limits: Inert source fixtures are never executed as application/modules or SQL. Current44 authored source-guard tests and four source CLIs pass. Their green outcomes do not establish production/browser/native/provider/database/scheduler behavior, fixture framework/type validity, a global CI bypass or product acceptance. Earlier Root046 hygiene/integrity, Root044 supply-chain, Root042 security-claim and Root035 RLS failures remain unresolved.

## AUDIT-WORK-CLIENT-RUN-KEY-FLOW-01

Severity: Medium. Status: open conditional source-instrument qualification, October 9, 2026; source unchanged.

A source-shaped runId-derived key assigned to a variable passes when setItem receives that variable; the same direct runId key refuses. A positive separate preference store prevents an empty census explanation. No localStorage operation executes or current product data leak is claimed.

Source: `scripts/check-work-client-state.mjs:29-30,69-76,103-106`. Actual source report (`audit/checklist/reviews/coverage-workspace-settings-time-guard-source-2026-10-09-047.json`, untracked); original source guard outcomes (`audit/checklist/evidence/coverage-workspace-settings-time-current-source-gates-2026-10-09-047.json`, untracked); complete original-engine inert controls (`audit/checklist/evidence/coverage-workspace-settings-time-inert-controls-2026-10-09-047.json`, untracked); independent premise challenge (`audit/checklist/evidence/coverage-workspace-settings-time-independent-challenge-2026-10-09-047.json`, untracked).

Controls: work-run-key-alias, work-direct-run-key.

Acceptance target: Qualify supported per-run key origins at the storage call or bound the claim to direct argument identifiers, retaining current direct-key refusals.

Limits: Inert source fixtures are never executed as application/modules or SQL. Current44 authored source-guard tests and four source CLIs pass. Their green outcomes do not establish production/browser/native/provider/database/scheduler behavior, fixture framework/type validity, a global CI bypass or product acceptance. Earlier Root046 hygiene/integrity, Root044 supply-chain, Root042 security-claim and Root035 RLS failures remain unresolved.

October9 source-guard qualification: The original cache checker refuses an unswept direct literal key but omits that same literal assigned to a variable used by setItem. This is a bounded new context for the existing storage-key-origin flow owner, whose earlier case follows per-run IDs. Literal-only helper scope is explicit; any broader dynamic-key completeness requirement and current browser incident remain unknown. Source: `scripts/lib/workspace-cache-scope.mjs:54-63; scripts/check-workspace-cache-scope.mjs:104-118`. Actual source reading (`audit/checklist/reviews/coverage-cache-version-workflow-guard-source-2026-10-09-048.json`, untracked); original engine controls (`audit/checklist/evidence/coverage-cache-version-workflow-inert-controls-2026-10-09-048.json`, untracked); valid companions (`audit/checklist/evidence/coverage-cache-version-workflow-valid-companions-2026-10-09-048.json`, untracked); independent challenge (`audit/checklist/evidence/coverage-cache-version-workflow-independent-challenge-2026-10-09-048.json`, untracked). Zero new cause or runtime acceptance. Acceptance target extension: Qualify supported per-run and sweep-required client key origins at storage calls, or explicitly bound the respective source claim to direct literal/identifier forms while retaining direct-key refusals.

## AUDIT-SETTINGS-OUTCOME-VOCABULARY-CENSUS-01

Severity: Medium. Status: open conditional source-instrument qualification, October 9, 2026; source unchanged.

The complete original engine reports no errors for an absent outcome array with otherwise valid scopes, mandates, registry and migration text. A recognized array missing unreadable_value refuses. The real current owner contains all required outcomes, and resolver/application/SQL runtime acceptance is unestablished.

Source: `scripts/check-settings-precedence.mjs:51-56,194-207`. Actual source report (`audit/checklist/reviews/coverage-workspace-settings-time-guard-source-2026-10-09-047.json`, untracked); original source guard outcomes (`audit/checklist/evidence/coverage-workspace-settings-time-current-source-gates-2026-10-09-047.json`, untracked); complete original-engine inert controls (`audit/checklist/evidence/coverage-workspace-settings-time-inert-controls-2026-10-09-047.json`, untracked); independent premise challenge (`audit/checklist/evidence/coverage-workspace-settings-time-independent-challenge-2026-10-09-047.json`, untracked).

Controls: settings-absent-outcome-vocabulary, settings-omitted-required-member, settings-complete-vocabulary.

Acceptance target: Refuse an unreadable required outcome vocabulary before testing membership, preserving current duplicate/invalid scope and missing outcome member guards.

Limits: Inert source fixtures are never executed as application/modules or SQL. Current44 authored source-guard tests and four source CLIs pass. Their green outcomes do not establish production/browser/native/provider/database/scheduler behavior, fixture framework/type validity, a global CI bypass or product acceptance. Earlier Root046 hygiene/integrity, Root044 supply-chain, Root042 security-claim and Root035 RLS failures remain unresolved.

## AUDIT-SETTINGS-INERT-OWNER-EXCLUSION-01

Severity: Medium. Status: open conditional source-instrument qualification, October 9, 2026; source unchanged.

The same private client precedence source that refuses passes when only a comment naming @agiworkforce/types is added. The scanner checks raw substring ownership without proving a canonical resolver binding. Current shared resolver source was actually reread and remains counterevidence against any current missing-owner product claim.

Source: `scripts/check-settings-precedence.mjs:166-180`. Actual source report (`audit/checklist/reviews/coverage-workspace-settings-time-guard-source-2026-10-09-047.json`, untracked); original source guard outcomes (`audit/checklist/evidence/coverage-workspace-settings-time-current-source-gates-2026-10-09-047.json`, untracked); complete original-engine inert controls (`audit/checklist/evidence/coverage-workspace-settings-time-inert-controls-2026-10-09-047.json`, untracked); independent premise challenge (`audit/checklist/evidence/coverage-workspace-settings-time-independent-challenge-2026-10-09-047.json`, untracked).

Controls: settings-inert-owner-marker, settings-private-client-order.

Acceptance target: Bind client precedence exclusion to the applicable canonical resolver dependency/use while retaining legitimate canonical consumers and plain private-order refusals.

Limits: Inert source fixtures are never executed as application/modules or SQL. Current44 authored source-guard tests and four source CLIs pass. Their green outcomes do not establish production/browser/native/provider/database/scheduler behavior, fixture framework/type validity, a global CI bypass or product acceptance. Earlier Root046 hygiene/integrity, Root044 supply-chain, Root042 security-claim and Root035 RLS failures remain unresolved.

## AUDIT-TIME-INERT-ZONE-PROOF-01

Severity: Medium. Status: open conditional source-instrument qualification, October 9, 2026; source unchanged.

Comment-only named module and consumer markers satisfy the complete original DST and presentation source checks while containing no executable implementation. Missing markers, recognized zoneless/empty recurrence, missing timestamp default and the exact forbidden fixed-zone marker refuse. No Intl, timezone calculation, scheduler, SQL or fixture application executes.

Source: `scripts/check-time-semantics.mjs:168-199,253-278`. Actual source report (`audit/checklist/reviews/coverage-workspace-settings-time-guard-source-2026-10-09-047.json`, untracked); original source guard outcomes (`audit/checklist/evidence/coverage-workspace-settings-time-current-source-gates-2026-10-09-047.json`, untracked); complete original-engine inert controls (`audit/checklist/evidence/coverage-workspace-settings-time-inert-controls-2026-10-09-047.json`, untracked); independent premise challenge (`audit/checklist/evidence/coverage-workspace-settings-time-independent-challenge-2026-10-09-047.json`, untracked).

Controls: time-inert-zone-proof, time-missing-zoned-markers, time-fixed-reader-zone.

Acceptance target: Bind applicable zone proof to the named executable implementation and consumer use, preserving current marker-absence and fixed-zone counterguards without claiming runtime DST correctness from source strings.

Limits: Inert source fixtures are never executed as application/modules or SQL. Current44 authored source-guard tests and four source CLIs pass. Their green outcomes do not establish production/browser/native/provider/database/scheduler behavior, fixture framework/type validity, a global CI bypass or product acceptance. Earlier Root046 hygiene/integrity, Root044 supply-chain, Root042 security-claim and Root035 RLS failures remain unresolved.

## AUDIT-VERSION-NEGOTIATED-FLOOR-BINDING-01

Severity: Medium. Status: open conditional source-instrument qualification, October9,2026; source unchanged.

The complete original version engine rejects a negotiated constant without any floor marker but accepts the same artifact with only an unrelated MIN_UNRELATED_VERSION export. The fallback scans the entire carrier and does not bind the floor to the named artifact. Current three negotiated constant entries explicitly name minimum symbols; the fourth negotiated entry is referenced and outside this fallback. No current old-client acceptance incident or negotiation executes.

Source: `scripts/check-version-registry.mjs:151-161`. Actual source report (`audit/checklist/reviews/coverage-cache-version-workflow-guard-source-2026-10-09-048.json`, untracked); original source tests/checks (`audit/checklist/evidence/coverage-cache-version-workflow-current-source-gates-2026-10-09-048.json`, untracked); original33 control properties (`audit/checklist/evidence/coverage-cache-version-workflow-inert-controls-2026-10-09-048.json`, untracked); six fresh valid companions (`audit/checklist/evidence/coverage-cache-version-workflow-valid-companions-2026-10-09-048.json`, untracked); independent syntax qualification (`audit/checklist/evidence/coverage-cache-version-workflow-syntax-qualification-2026-10-09-048.json`, untracked); independent premise challenge (`audit/checklist/evidence/coverage-cache-version-workflow-independent-challenge-2026-10-09-048.json`, untracked).

Controls: version-negotiated-no-floor, version-unrelated-negotiated-floor, version-missing-explicit-floor.

Acceptance target: Bind the minimum/supported version proof to the declared artifact or explicitly require its named minimum carrier, preserving missing-file/explicit-minimum refusals.

Limits: Current27 original tests and five source CLIs pass. Original33 control shapes retain17 source counterguards/16 gaps; malformed YAML/standalone TSX observations are raw-only, with six fresh independently parsed/measured companions repeating existing properties. No application/fixture modules, TypeScript typecheck/framework, rendering/contrast, shell workflow/Cargo/compiler/build/install, native/provider/network/SQL/database/production or full CI acceptance. Earlier hygiene/integrity/supply/security/RLS failures remain unresolved.

## AUDIT-THEME-PAIR-ELEMENT-BINDING-01

Severity: Medium. Status: open conditional source-instrument qualification, October9,2026; source unchanged.

The complete original string engine reports an unpaired light shade when alone and retains the wrong-family refusal, but suppresses it when a dark counterpart belongs to a separate sibling element or only a JSX comment on the same physical line. Its documented same-element intent is measured by a whole-line regex. No rendering, contrast measurement or actual unreadable current element is accepted. Fresh exact syntax-valid TSX wrappers were independently parsed without diagnostics and the complete original engine reproduced sibling/comment acceptance; original standalone raw strings and their parse diagnostics stay preserved. Syntax does not establish framework/type/render/contrast behavior.

Source: `scripts/lib/theme-only-text-colours.mjs:16-24`. Actual source report (`audit/checklist/reviews/coverage-cache-version-workflow-guard-source-2026-10-09-048.json`, untracked); original source tests/checks (`audit/checklist/evidence/coverage-cache-version-workflow-current-source-gates-2026-10-09-048.json`, untracked); original33 control properties (`audit/checklist/evidence/coverage-cache-version-workflow-inert-controls-2026-10-09-048.json`, untracked); six fresh valid companions (`audit/checklist/evidence/coverage-cache-version-workflow-valid-companions-2026-10-09-048.json`, untracked); independent syntax qualification (`audit/checklist/evidence/coverage-cache-version-workflow-syntax-qualification-2026-10-09-048.json`, untracked); independent premise challenge (`audit/checklist/evidence/coverage-cache-version-workflow-independent-challenge-2026-10-09-048.json`, untracked).

Controls: valid-theme-sibling-counterpart, valid-theme-comment-counterpart, theme-unpaired-element, theme-wrong-family-counterpart, valid-theme-paired.

Acceptance target: Scope applicable counterpart proof to actual class tokens on the same element, preserving genuine dark-scoped and paired source cases without treating comment/other-element text as contrast proof.

Limits: Current27 original tests and five source CLIs pass. Original33 control shapes retain17 source counterguards/16 gaps; malformed YAML/standalone TSX observations are raw-only, with six fresh independently parsed/measured companions repeating existing properties. No application/fixture modules, TypeScript typecheck/framework, rendering/contrast, shell workflow/Cargo/compiler/build/install, native/provider/network/SQL/database/production or full CI acceptance. Earlier hygiene/integrity/supply/security/RLS failures remain unresolved.

## AUDIT-WORKFLOW-CARGO-FEATURE-ARGUMENT-CENSUS-01

Severity: Medium. Status: open conditional source-instrument qualification, October9,2026; source unchanged.

The complete original source CLI rejects a double-quoted absent qualified feature while single-quoted and bare spellings of the same inert argument pass with zero qualified references. Pure builtin shlex tokenization yields identical argv for these three forms; no shell workflow or Cargo executes. Equals-form text is also omitted but Cargo interpretation is unknown. Current original CLI checks five references across29 workflows and fourteen crate source records, without proving broader syntax or runtime execution.

Source: `scripts/check-workflow-cargo-features.mjs:69-96`. Actual source report (`audit/checklist/reviews/coverage-cache-version-workflow-guard-source-2026-10-09-048.json`, untracked); original source tests/checks (`audit/checklist/evidence/coverage-cache-version-workflow-current-source-gates-2026-10-09-048.json`, untracked); original33 control properties (`audit/checklist/evidence/coverage-cache-version-workflow-inert-controls-2026-10-09-048.json`, untracked); six fresh valid companions (`audit/checklist/evidence/coverage-cache-version-workflow-valid-companions-2026-10-09-048.json`, untracked); independent syntax qualification (`audit/checklist/evidence/coverage-cache-version-workflow-syntax-qualification-2026-10-09-048.json`, untracked); independent premise challenge (`audit/checklist/evidence/coverage-cache-version-workflow-independent-challenge-2026-10-09-048.json`, untracked).

Controls: workflow-unknown-double-quoted-feature, workflow-unknown-single-quoted-feature, workflow-unknown-bare-feature, workflow-valid-feature.

Acceptance target: Enumerate supported feature arguments after shell-token ownership is established, preserving actual absent-crate/feature refusals and distinguishing unverified argument forms and non-run YAML text.

Limits: Current27 original tests and five source CLIs pass. Original33 control shapes retain17 source counterguards/16 gaps; malformed YAML/standalone TSX observations are raw-only, with six fresh independently parsed/measured companions repeating existing properties. No application/fixture modules, TypeScript typecheck/framework, rendering/contrast, shell workflow/Cargo/compiler/build/install, native/provider/network/SQL/database/production or full CI acceptance. Earlier hygiene/integrity/supply/security/RLS failures remain unresolved.

## AUDIT-UI-BUTTON-CONTROL-CLASSIFICATION-01

Severity: Low. Status: open conditional source-instrument qualification, October 9, 2026; source unchanged.

variantTableFailures treats absence of any module-level disabled word as proof that a size table is presentational. The unchanged original CLI accepts an undersized literal button using its cva table when that word is absent, reporting zero inspected tables; the otherwise comparable sized/undersized disabled-bearing controls pass/refuse. This is conditional guard classification, not an accepted current product target-size incident.

Source: `scripts/check-ui-buttons.mjs:80-113`. Actual source report (`audit/checklist/reviews/coverage-ui-system-source-guards-2026-10-09-050.json`, untracked); current original tests and CLIs (`audit/checklist/evidence/coverage-ui-systems-current-source-gates-2026-10-09-050.json`, untracked); fresh original21 source controls (`audit/checklist/evidence/coverage-ui-systems-inert-controls-2026-10-09-050-003.json`, untracked); independent source-premise challenge (`audit/checklist/evidence/coverage-ui-systems-independent-challenge-2026-10-09-050.json`, untracked).

Controls: button-sized-control, button-undersized-control, button-control-without-disabled-word.

Acceptance target: Bind the table classification to actual rendered control consumers while retaining genuine presentational cva tables and current successful control/callsite checks.

Limits: Actual source reading and bounded source-instrument controls only. No application or fixture modules, TypeScript package/AST guard or test, fixture parser/compiler/typecheck, browser/render/accessibility/contrast, native/provider/network/SQL/database/build/install/production or full CI acceptance. Earlier hygiene/integrity/supply/security/RLS failures remain unresolved. No ignored/unlisted coverage completion claim. First empty-output controls, the later stdout-only validator and a fixed-temp-prefix metadata qualifier are retained uncredited; only fresh exact original guards with canonical paths, source pins, error/signal and diagnostic-channel checks supply control evidence.

## AUDIT-UI-MOTION-SELECTOR-COVERAGE-01

Severity: Low. Status: open conditional source-instrument qualification, October 9, 2026; source unchanged.

The guard unions important property names from any selector whose last token matches one required universal selector. Star-only and panel-narrowed rules pass its blanket-complete claim, although they do not establish the complete unscoped element and pseudo-element selector set. The original complete-selector control passes and missing-property control refuses. No browser or operating-system motion result is accepted.

Source: `scripts/check-ui-motion.mjs:81-118,185-204`. Actual source report (`audit/checklist/reviews/coverage-ui-system-source-guards-2026-10-09-050.json`, untracked); current original tests and CLIs (`audit/checklist/evidence/coverage-ui-systems-current-source-gates-2026-10-09-050.json`, untracked); fresh original21 source controls (`audit/checklist/evidence/coverage-ui-systems-inert-controls-2026-10-09-050-003.json`, untracked); independent source-premise challenge (`audit/checklist/evidence/coverage-ui-systems-independent-challenge-2026-10-09-050.json`, untracked).

Controls: motion-three-selector-coverage, motion-missing-OS-property, motion-star-only-coverage, motion-narrowed-panel-coverage.

Acceptance target: Require the intended OS and in-app selector set with properties bound to each applicable element/pseudo-element selector, preserving genuine equivalent complete rule forms.

Limits: Actual source reading and bounded source-instrument controls only. No application or fixture modules, TypeScript package/AST guard or test, fixture parser/compiler/typecheck, browser/render/accessibility/contrast, native/provider/network/SQL/database/build/install/production or full CI acceptance. Earlier hygiene/integrity/supply/security/RLS failures remain unresolved. No ignored/unlisted coverage completion claim. First empty-output controls, the later stdout-only validator and a fixed-temp-prefix metadata qualifier are retained uncredited; only fresh exact original guards with canonical paths, source pins, error/signal and diagnostic-channel checks supply control evidence.

## AUDIT-UI-ICON-MARKER-SUBJECT-BINDING-01

Severity: Low. Status: open conditional source-instrument qualification, October 9, 2026; source unchanged.

The icon-control branch accepts title= anywhere in raw attributes, including an unrelated data-note string; the emoji branch accepts aria-hidden anywhere in a nearby four-line window, including an unrelated string declaration. Exact original controls refuse an unnamed imported icon button and an unhidden emoji, while those unrelated markers suppress the respective refusal. Both ownership predicates are explicit; this is source proof binding only, with fixture accessibility/render behavior unverified.

Source: `scripts/check-ui-icons.mjs:94-129,132-153`. Actual source report (`audit/checklist/reviews/coverage-ui-system-source-guards-2026-10-09-050.json`, untracked); current original tests and CLIs (`audit/checklist/evidence/coverage-ui-systems-current-source-gates-2026-10-09-050.json`, untracked); fresh original21 source controls (`audit/checklist/evidence/coverage-ui-systems-inert-controls-2026-10-09-050-003.json`, untracked); independent source-premise challenge (`audit/checklist/evidence/coverage-ui-systems-independent-challenge-2026-10-09-050.json`, untracked).

Controls: icon-explicit-name, icon-missing-name, icon-unrelated-title-text, emoji-unhidden, emoji-unrelated-nearby-hidden-text.

Acceptance target: Bind accessible-name evidence to the actual control attribute/content and decoration-hidden evidence to the actual glyph subject, retaining named imported icons and genuine decorative-glyph source cases.

Limits: Actual source reading and bounded source-instrument controls only. No application or fixture modules, TypeScript package/AST guard or test, fixture parser/compiler/typecheck, browser/render/accessibility/contrast, native/provider/network/SQL/database/build/install/production or full CI acceptance. Earlier hygiene/integrity/supply/security/RLS failures remain unresolved. No ignored/unlisted coverage completion claim. First empty-output controls, the later stdout-only validator and a fixed-temp-prefix metadata qualifier are retained uncredited; only fresh exact original guards with canonical paths, source pins, error/signal and diagnostic-channel checks supply control evidence.

## AUDIT-UI-PREFERENCE-INERT-MARKER-PROOF-01

Severity: Low. Status: open conditional source-instrument qualification, October 9, 2026; source unchanged.

The pre-paint check tests raw marker words and the typography preference check tests raw selector/property text. Comment-only pre-paint markers and a commented offered-size selector pass the complete original CLIs; their missing-marker or missing-selector controls refuse. The pre-paint positive marker fixture is also source marker text and supplies no runtime implementation proof. This is conditional implementation-proof strength, not a claim that current theme or font preferences fail.

Source: `scripts/check-ui-theme-tokens.mjs:122-154; scripts/check-ui-typography.mjs:107-124`. Actual source report (`audit/checklist/reviews/coverage-ui-system-source-guards-2026-10-09-050.json`, untracked); current original tests and CLIs (`audit/checklist/evidence/coverage-ui-systems-current-source-gates-2026-10-09-050.json`, untracked); fresh original21 source controls (`audit/checklist/evidence/coverage-ui-systems-inert-controls-2026-10-09-050-003.json`, untracked); independent source-premise challenge (`audit/checklist/evidence/coverage-ui-systems-independent-challenge-2026-10-09-050.json`, untracked).

Controls: theme-prepaint-marker-counter, theme-prepaint-missing-markers, theme-prepaint-comment-only-markers, typography-offered-size-selector, typography-missing-size-selector, typography-commented-size-selector.

Acceptance target: Require active source implementation for configured theme and reading preferences; comment-only marker/selector text must not stand in for executable or applicable rules, while real current implementations and missing-marker refusals remain recognized.

Limits: Actual source reading and bounded source-instrument controls only. No application or fixture modules, TypeScript package/AST guard or test, fixture parser/compiler/typecheck, browser/render/accessibility/contrast, native/provider/network/SQL/database/build/install/production or full CI acceptance. Earlier hygiene/integrity/supply/security/RLS failures remain unresolved. No ignored/unlisted coverage completion claim. First empty-output controls, the later stdout-only validator and a fixed-temp-prefix metadata qualifier are retained uncredited; only fresh exact original guards with canonical paths, source pins, error/signal and diagnostic-channel checks supply control evidence.

## AUDIT-EGRESS-TEMPLATE-TARGET-CENSUS-01

Severity: Medium. Status: open conditional source-instrument finding, October 9, 2026; source unchanged.

Original complete guard refuses fetch(row.endpoint) without vetting, but admits fetch(`https://${row.host}/send`) under the same anchored inert source tree. The helper emits a call with null target for the template, and main skips it before target ownership or vetting checks. No fetch is executed.

Source: `scripts/lib/url-fetch-egress.mjs:98-121; scripts/check-security-egress-inventory.mjs:329-336`. Frozen reading report (`audit/checklist/reviews/coverage-surface-security-source-guards-2026-10-09-051.json`, untracked); independent premise review (`audit/checklist/evidence/coverage-surface-security-independent-challenge-2026-10-09-051.json`, untracked); actual source controls (`audit/checklist/evidence/coverage-surface-security-inert-controls-2026-10-09-051.json`, untracked).

Counterguards: Direct unvetted target refuses; resolved/manual target passes. fetch(new URL(row.endpoint)) refuses. Pure targetIsRepoChosen results for complete constructor expressions do not establish original-main acceptance because its scanner tokenizes a different subject. Tool/shared transport presence checks remain active; inert shared anchors are never claimed implementations. Five original-CLI companions use complete exact authored transport/tool/search/MCP fixture text, decoded as inert literal bytes; the same direct refusal/manual admission/comment credit/template omission/constructor refusal persist. No fixture imports or execution.

Acceptance target: Preserve complete first-argument expressions through call inventory and qualify host-bearing template interpolations before accepting the target, while preserving direct refusal and legitimate repository-owned literals.

Limits: Current source instrument and inert text/value controls only. No application/fixture compilation or execution, provider/network/browser/native/SQL/database/build/install/production or whole CI acceptance; no current product or security incident asserted.

Five complete authored-context original-CLI companions (`audit/checklist/evidence/coverage-root051-egress-authored-context-companions-2026-10-09.json`, untracked) preserve direct/constructor refusals, resolved/manual admission and the template omission without executing fixture modules.

## AUDIT-SURFACE-ROUTE-LITERAL-NAVIGATION-01

Severity: Low. Status: open conditional source-instrument finding, October 9, 2026; source unchanged.

Exact collectRouteLiterals/analyzeRouteNavigation functions return no violation for an unrelated exported string '/forgotten' in another source file. Removing that string or keeping it only in the route's own file returns a violation. The accepted string need not belong to a navigation call.

Source: `scripts/check-surface-invariants.mjs:112-165`. Frozen reading report (`audit/checklist/reviews/coverage-surface-security-source-guards-2026-10-09-051.json`, untracked); independent premise review (`audit/checklist/evidence/coverage-surface-security-independent-challenge-2026-10-09-051.json`, untracked); actual source controls (`audit/checklist/evidence/coverage-surface-security-inert-controls-2026-10-09-051.json`, untracked).

Counterguards: Own-file literal and absent literal refuse. A router.push literal is accepted; grouped/dynamic normalization and declared-screen branches are separately covered by authored tests.

Acceptance target: Bind route references to applicable executable navigation or navigator declarations, or report arbitrary string evidence as unverified navigation.

Limits: Current source instrument and inert text/value controls only. No application/fixture compilation or execution, provider/network/browser/native/SQL/database/build/install/production or whole CI acceptance; no current product or security incident asserted.

## AUDIT-SURFACE-KEYBINDING-DEFAULT-ARITY-01

Severity: Low. Status: open conditional source-instrument finding, October 9, 2026; source unchanged.

Exact requiredArity('optional = 1, required: string') returns0 because the loop breaks at the default parameter. The later required parameter is not examined; consumers use this result for zero-argument keybinding eligibility. This control does not compile a handler or invoke a real command.

Source: `scripts/check-surface-invariants.mjs:453-460; scripts/check-surface-invariants.mjs:486-555`. Frozen reading report (`audit/checklist/reviews/coverage-surface-security-source-guards-2026-10-09-051.json`, untracked); independent premise review (`audit/checklist/evidence/coverage-surface-security-independent-challenge-2026-10-09-051.json`, untracked); actual source controls (`audit/checklist/evidence/coverage-surface-security-inert-controls-2026-10-09-051.json`, untracked).

Counterguards: A first required parameter before a default returns1. A default-only parameter list returns0; authored tests also refuse absent/unknown commands.

Acceptance target: Count later required parameters after initialized parameters when determining zero-argument eligibility, retaining genuinely optional/default/rest-only acceptance.

Limits: Current source instrument and inert text/value controls only. No application/fixture compilation or execution, provider/network/browser/native/SQL/database/build/install/production or whole CI acceptance; no current product or security incident asserted. Exact requiredArity result and source consumer relationship only; no complete command-registration parser/control invocation or actual keybinding execution is established.

Later exact pure collectCommandArities/analyzeKeybindings composition confirms the source classifier result. Six actual composition observations (`audit/checklist/evidence/coverage-root051-keybinding-pure-call-composition-2026-10-09.json`, untracked). No full CLI or VS Code execution.

## AUDIT-MOBILE-COLOR-BADGE-LINE-CREDIT-01

Severity: Low. Status: open conditional source-instrument finding, October 9, 2026; source unchanged.

Original complete guard passes const x=<Badge/>; const style={color:'red'} with an empty baseline, because any <Badge marker on the line suppresses every named-color match. The exempt color need not be a Badge prop. No component renders.

Source: `scripts/check-no-hex-colors-mobile.mjs:95-101`. Frozen reading report (`audit/checklist/reviews/coverage-surface-security-source-guards-2026-10-09-051.json`, untracked); independent premise review (`audit/checklist/evidence/coverage-surface-security-independent-challenge-2026-10-09-051.json`, untracked); actual source controls (`audit/checklist/evidence/coverage-surface-security-inert-controls-2026-10-09-051.json`, untracked).

Counterguards: Original complete guard rejects named color red without a Badge marker. Current Badge color prop is admitted by the exemption; this is source acceptance, not rendered or desired-product proof. Moving the unrelated Badge to a separate line restores the named-color refusal.

Acceptance target: Bind named-color exemption to the allowed Badge attribute/value rather than the complete source line.

Limits: Current source instrument and inert text/value controls only. No application/fixture compilation or execution, provider/network/browser/native/SQL/database/build/install/production or whole CI acceptance; no current product or security incident asserted.

Four named-color branch companions (`audit/checklist/evidence/coverage-root051-named-color-predicate-companions-2026-10-09.json`, untracked) retain no-Badge/separate-line refusals and current Badge prop admission; fixture syntax/render validity remains unknown.

## AUDIT-MOBILE-HYGIENE-UI-EXTENSION-CENSUS-01

Severity: Low. Status: open conditional source-instrument finding, October 9, 2026; source unchanged.

Original complete Mobile hygiene guard refuses a feature/components/Fixture.tsx containing bare fetch(target), but accepts the same source body at Fixture.jsx. The overall walker recognizes .jsx while the feature-components UI selector recognizes only .tsx. No component or fetch executes.

Source: `scripts/check-mobile-hygiene.mjs:8; scripts/check-mobile-hygiene.mjs:133-140; scripts/check-mobile-hygiene.mjs:181-207`. Frozen reading report (`audit/checklist/reviews/coverage-surface-security-source-guards-2026-10-09-051.json`, untracked); independent premise review (`audit/checklist/evidence/coverage-surface-security-independent-challenge-2026-10-09-051.json`, untracked); actual source controls (`audit/checklist/evidence/coverage-surface-security-inert-controls-2026-10-09-051.json`, untracked).

Counterguards: Identical .tsx UI/direct-fetch source refuses. Feature directory/index ownership is supplied in both inert trees, so the difference is the UI source selector.

Acceptance target: Apply the UI architecture ratchet to supported component source extensions or explicitly constrain the eligibility claim, preserving direct-I/O refusal for recognized files.

Limits: Current source instrument and inert text/value controls only. No application/fixture compilation or execution, provider/network/browser/native/SQL/database/build/install/production or whole CI acceptance; no current product or security incident asserted.

## AUDIT-WEB-MODAL-WHOLE-FILE-MARKER-CREDIT-01

Severity: Low. Status: open conditional source-instrument finding, October 9, 2026; source unchanged.

For source text containing a literal aria-modal=true dialog, exact whole-file keyboard predicate returns true for only a // useDialogKeyboard( comment, unused string or call under if(false), and for an unrelated Other function's hook. Scroll-lock predicate returns true for only commented/unused-string/unreachable document.body.style.overflow='hidden'. Current scanner uses these predicates to omit the file from its missing-contract/unlocked census. Thus lexical credit can meet the source ratchet without a bound executable modal effect. Adopt the existing pending Web030 whole-file modal marker owner once, preserving its exact original producer/report. Original Web modal source predicates read raw whole-file text and can credit inert/unrelated markers; its TypeScript AST discovery and React/Vitest suite remain unexecuted. Current surface-invariants production readSource strips comments before menu/dialog checks: the executed raw comment-only controls establish exported-predicate acceptance only and supply zero current Node CLI comment-credit proof. Unrelated executable Radix imports and Escape strings remain distinct module-wide evidence; the intentionally minimal bare executable Escape floor is preserved. No lack-of-full-focus-trap defect is inferred.

Source: `apps/web/shared/components/layout/__tests__/ModalScrollLock.test.tsx:118-120; apps/web/shared/components/layout/__tests__/ModalScrollLock.test.tsx:200-250; scripts/check-surface-invariants.mjs:641-643; scripts/check-surface-invariants.mjs:674-680; scripts/check-surface-invariants.mjs:29-30; scripts/check-surface-invariants.mjs:659; scripts/check-surface-invariants.mjs:683-688; scripts/check-surface-invariants.mjs:696`. Frozen reading report (`audit/checklist/reviews/coverage-surface-security-source-guards-2026-10-09-051.json`, untracked); independent premise review (`audit/checklist/evidence/coverage-surface-security-independent-challenge-2026-10-09-051.json`, untracked); actual source controls (`audit/checklist/evidence/coverage-surface-security-inert-controls-2026-10-09-051.json`, untracked).

Counterguards: No-marker fixture is rejected by both exact predicates; normal hook and normal overflow-assignment strings are credited. Actual shared keyboard and overlay hooks were independently read through EOF and implement focus/Escape/Tab/restore behavior. Existing primitive render/wheel tests and explicit unlocked allowlist/staleness checks are separate meaningful assertions.

Acceptance target: Bind applicable keyboard and scroll-lock proof to the discovered modal/menu's executable control, preserving the guard's stated minimal keyboard floor and existing primitive assertions.

Limits: Only exact two regex predicates were executed on inert text witnesses. Full TypeScript AST claimsModal, source discovery, Vitest/React/DOM/browser/hook execution and fixture syntax/runtime validity were not executed. No current actual modal keyboard/scrolling failure is asserted from these source-control cases. Current source instrument and inert text/value controls only. No application/fixture compilation or execution, provider/network/browser/native/SQL/database/build/install/production or whole CI acceptance; no current product or security incident asserted.

Original producer: coverage-web-remaining-source-2026-10-09-030; original frozen report SHA256 bfdceb01e2dd630347e87e9a6851a7150b377b014693c32fea4eda4aeba62c07. This adopts the existing pending ID once; current Root051 supplies source/caller qualification, zero new unique cause. Raw Node comment controls are exported-predicate-only observations; no original Node CLI comment credit or full focus-trap requirement is asserted.

## AUDIT-CI-OBSERVATION-GREEN-REPORT-01

Severity: Low. Status: open conditional source-reporting finding, October 10, 2026; source unchanged.

Exact original pure attribution and formatting functions return an empty report and 'All gates green' for an absent requested head, empty history or a timed-out-only observed job. When a baseline run exists but its gate observation is absent, an observed current failure receives a regression reason saying the baseline was green. These inert values do not establish live CI execution.

Source: `scripts/ci-failure-attribution.mjs:23-34; scripts/ci-failure-attribution.mjs:54-95`. Frozen source report and embedded actual controls/independent qualifications (`audit/checklist/reviews/coverage-service-governance-source-2026-10-10-052.json`, untracked).

Counterguards: Explicit success observations produce a legitimate empty report. A missing named baseline COMMIT with an observed red gate is explicitly unattributed. Seven meaningful authored tests pass, preserving requested-head anchoring, baseline failure/success and readable attribution. The authored automatic workflow caller requires a completed CI failure on push/main in the same repository; manual dispatch also exists. A timed-out-only inert witness is not proof that this automatic caller ran.

Acceptance target: Carry observation completeness and per-gate conclusions into the reporting result. Require affirmative success evidence before saying green, distinguish absent/unknown/non-success observations, and preserve explicit missing-baseline-commit unattribution.

Owner qualification: One observation-to-green reporting obligation spans the branches. Existing workflow-command credit, source evidence-reference validation and swallowed file-read failure owners do not establish the same CI result-observation cause; bounded conceptual qualification supports a distinct Low source-reporting proposal, without proving global alias absence.

Limits: Original pure functions over inert arrays and seven authored tests only. Network main, tokens, GitHub API, live workflow/CI, deployment consequences and whole CI status remain unverified.

## AUDIT-COMMIT-PATHSPEC-LOCK-OWNERSHIP-01

Severity: Low. Status: open conditional source finding, October 11, 2026; current named source identity qualified.

The 600-iteration mkdir loop installs cleanup only when its own acquisition succeeds. If all attempts fail while another process's lock still exists, the following directory-presence predicate passes and reaches git add/commit without acquisition. This is a conditional serialization defect in the operator helper; no wait, shell, concurrent Git mutation or lost commit was executed or observed.

Source: `scripts/commit-pathspec.sh:32-42`. Frozen source review (`audit/checklist/reviews/coverage-release-dev-operations-source-2026-10-10-053.json`, untracked) and independent source trace (`audit/checklist/evidence/coverage-root053-independent-premise-review-2026-10-11.json`, untracked).

Counterguards and ownership: Successful mkdir installs the EXIT trap and serializes normally. An absent lock after exhaustion refuses. Argument/path checks and post-commit unexpected-file warning remain separate guards.

Acceptance target: Record acquisition independently of directory presence and refuse after exhausted retries.

Limits: Individual source reading and scoped inert predicates/static traces only. Original operational modules, authored suites, application/fixtures, network/browser/native/SQL, production and whole-product acceptance remain unverified.

## AUDIT-R2-CORS-READBACK-POLICY-01

Severity: Low. Status: open conditional source finding, October 11, 2026; current named source identity qualified.

The exact matchesExpected predicate accepts its first rule when origins/count and required methods match, even with missing declared allowed headers or altered exposed ETag/max age. Fourteen inert exact-predicate controls preserve seven counterguards and demonstrate seven accepted policy drifts. Bounded current presign/upload consumer reads establish that method/header contracts exist; they do not establish a deployed policy or browser failure.

Source: `scripts/r2-apply-cors.mjs:9-34,75-85,134-143`. Exact predicate controls (`audit/checklist/evidence/coverage-r2-cors-exact-predicate-controls-2026-10-11.json`, untracked), independent review (`audit/checklist/evidence/coverage-root053-independent-premise-review-2026-10-11.json`, untracked) and frozen source report (`audit/checklist/reviews/coverage-release-dev-operations-source-2026-10-10-053.json`, untracked).

Counterguards and ownership: Missing first rule, missing/extra origins, a wrong origin and missing required methods refuse. PUT failures record failure. The wildcard response-header setter census owner checks a different producer/mechanism and is not duplicated.

Acceptance target: Compare the intended policy fields and successful GET result before verified output; retain existing origin/method guards.

Limits: Individual source reading and scoped inert predicates/static traces only. Original operational modules, authored suites, application/fixtures, network/browser/native/SQL, production and whole-product acceptance remain unverified.

## AUDIT-SKILL-VETTING-SELFTEST-NULL-VERDICT-01

Severity: Low. Status: open conditional source finding, October 11, 2026; current named source identity qualified.

Ordinary processing increments blocked for a null recommendation. With hostile DO_NOT_INSTALL and benign null without error, the later self-test checks only benign error/blocking-set membership, prints passed and exits before the ordinary blocked summary. Eight inert exact-source predicate cases independently qualify this reporting branch. No original gate, scanner, hostile/benign executable fixture or provider ran.

Source: `scripts/scan-skills-with-vetting.mjs:128-141,150-174`. Independent source/predicate review (`audit/checklist/evidence/coverage-skill-vetting-selftest-independent-review-2026-10-11.json`, untracked) and frozen source report (`audit/checklist/reviews/coverage-release-dev-operations-source-2026-10-10-053.json`, untracked).

Counterguards and ownership: Scanner timeout/error and missing recommendation fail ordinary processing; hostile not-blocked and benign DO_NOT_INSTALL/error fail self-test. Seven formal Tool001/002 causes cover different exit/symlink/scoring/namespace/offset/cache mechanisms. Bounded dedup does not prove global alias absence.

Acceptance target: Require an affirmative permitted benign recommendation and retain ordinary verdict-validation failures in self-test outcome.

Limits: Individual source reading and scoped inert predicates/static traces only. Original operational modules, authored suites, application/fixtures, network/browser/native/SQL, production and whole-product acceptance remain unverified.

## AUDIT-WEB-ROUTE-ORACLE-CATCHALL-PREFIX-01

Severity: Low. Status: open conditional source finding, October 11, 2026; current named source identity qualified.

Rechecked on main (3ccb6f6) on 2026-10-15: still present. Main changed `apps/web/__tests__/settings-navigation-loops.test.ts` after the 2026-09-27 copy this was found on without changing the cited logic; line numbers for it are main's.

The routeExists catch-all branch accepts by requested segment count without comparing fixed prefix segments. The current API catch-all filename /api/connectors/directory/[...id] supplies an independent three-segment witness for an unrelated target. This is a test-oracle source mechanism, not a mounted broken redirect, runtime 404 or product navigation result.

Source: `apps/web/__tests__/settings-navigation-loops.test.ts:46-63,109-116,248`. Frozen Web report (`audit/checklist/reviews/coverage-web-settings-auth-source-2026-10-10-035.json`, untracked) and independent premise qualification (`audit/checklist/evidence/coverage-web035-independent-premise-review-2026-10-11.json`, untracked).

Counterguards and ownership: Exact/static membership, ordinary dynamic literal-segment/length matching, shorter-target rejection, nonempty census anchors and cycle detection remain. A similarly named separately declared test helper is not a caller. Existing raw navigation marker/quote/permission text owners have distinct mechanisms.

Acceptance target: Match fixed route segments before accepting catch-all suffixes, with explicit API/page applicability and preserved static/dynamic counterguards.

Limits: Individual source reading and scoped inert predicates/static traces only. Original operational modules, authored suites, application/fixtures, network/browser/native/SQL, production and whole-product acceptance remain unverified.

## TOOL-VETTING-NO-LLM-OFFLINE-DOCUMENTATION-01

Severity: Low. Status: open conditional source finding, October 11, 2026; current named source identity qualified.

README16 describes the no-LLM analyzer set as offline, including the registered supply-chain OSV lookup. The --no-llm flag only disables use_llm; a nonempty uncached extracted dependency list can still reach the OSV HTTP POST branch. The documentation scope is wider than the current implementation. No actual scan, extraction/parser, graph, transfer, OSV request or network incident was executed.

Source: `tools/skill-vetting/README.md:16; tools/skill-vetting/src/skillspector/cli.py:90-104; tools/skill-vetting/src/skillspector/nodes/analyzers/static_patterns_supply_chain.py:774-775,947-962; tools/skill-vetting/src/skillspector/nodes/analyzers/osv_client.py:250-267`. Frozen Tool report (`audit/checklist/reviews/coverage-shared-tool-vetting-resources-source-2026-10-10-003.json`, untracked) and independent current source review (`audit/checklist/evidence/coverage-tool003-independent-premise-review-2026-10-11.json`, untracked).

Counterguards and ownership: No packages and fully cached packages return before HTTP. Network/API failures use static fallback. The flag's own help promises skipping LLM rather than all networking. Declared CI wiring and samples do not prove actual dependency lookup or public-product installation.

Acceptance target: Describe conditional OSV network/cache behavior separately from disabled LLM analysis; require explicit policy if offering an offline mode.

Limits: Individual source reading and scoped inert predicates/static traces only. Original operational modules, authored suites, application/fixtures, network/browser/native/SQL, production and whole-product acceptance remain unverified.

## AUDIT-DPDP-REJECTION-ERROR-BINDING-01

Severity: Low. Status: open conditional source finding, October 11, 2026; current named source identity qualified.

expectReject records pass for any exception, without checking error code, constraint or intended trigger identity. A query throws for a permission, syntax, connection, or unrelated constraint error instead of the intended append-only rule; the helper still records the named negative check as pass.

Source: `scripts/verify-dpdp-schema.mjs:11-17,194-203`. Frozen repository guard report (`audit/checklist/reviews/coverage-repository-guard-configurations-source-2026-10-11-054.json`, untracked) and independent complete-source premise review (`audit/checklist/evidence/coverage-root054-independent-source-premise-review-2026-10-11.json`, untracked).

Counterguards and ownership: Earlier schema/trigger metadata and positive inserts limit some missing-schema premises. The app_rls visibility check proves a readable matching row exists, but not UPDATE/DELETE execution privileges or the source of rejection. The final summary fails if some other recorded check failed; the negative helper itself can still grant false credit. Root's source-specific search of both canonical owners found no equivalent named cause; generic harness and migration owners are not automatically extended.

Acceptance target: Bind each expected rejection to its intended error/constraint or trigger behavior while preserving positive inserts, structural checks and visibility controls.

Severity and limits: Low conditional source instrument/data-flow discrepancy; no runtime or production acceptance. No original operational module, SQL/database role, installer, authored test/fixture, network/browser/native process, production action or product acceptance was executed. No source fix was made.

## AUDIT-DPDP-GRANT-CLEANUP-01

Severity: Medium. Status: open conditional source finding, October 11, 2026; current named source identity qualified.

The GRANT and role/claim setup run before entering the only try/finally, and the broader writes/cleanup have no enclosing rollback/finalizer. Once grant180 completes, an exception at set-role181 or set-config182 leaves control outside try183, so revoke207 is not scheduled by the script. Later sequential cleanup can also stop before client.end.

Source: `scripts/verify-dpdp-schema.mjs:180-207`. Frozen repository guard report (`audit/checklist/reviews/coverage-repository-guard-configurations-source-2026-10-11-054.json`, untracked) and independent complete-source premise review (`audit/checklist/evidence/coverage-root054-independent-source-premise-review-2026-10-11.json`, untracked).

Counterguards and ownership: The finally reliably schedules reset/revoke for failures inside its probe block when its own earlier cleanup queries succeed. The script explicitly revokes the temporary privileges on the normal path. The permission/row state of any actual database and an external cleanup owner are unknown. Root's source-specific search of both canonical owners found no equivalent named cause; generic harness and migration owners are not automatically extended.

Acceptance target: Ensure temporary privilege setup and every failure path are enclosed by cleanup/rollback that restores the intended pre-probe role and privilege state.

Severity and limits: Medium conditional impact: setup failure after a successful shared-role UPDATE/DELETE grant can bypass the script's revoke. Runtime/database state is unknown; the peer's sealed Low recommendation remains historical, with this separate root disposition. No original operational module, SQL/database role, installer, authored test/fixture, network/browser/native process, production action or product acceptance was executed. No source fix was made.

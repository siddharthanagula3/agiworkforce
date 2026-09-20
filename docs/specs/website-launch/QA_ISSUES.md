# Website QA issues

Status: In progress
Owner: Website launch preparation
Last updated: 2026-09-19

This working queue links canonical defect IDs where known; it does not replace ACTIVE_ISSUES.md.

## ENV-DB: local demo runtime unavailable

Task: reopen owner demo history. Environment: configured loopback Postgres, web development.
Reproduction: pg_isready -h 127.0.0.1 -p 5432. Expected: accepting connections.
Actual: no response. Homebrew PostgreSQL service error 2; log reports missing data directory.
Impact: authenticated persistence cannot be established. Severity: launch QA blocker.
Cause: confirmed missing configured directory; reason/data whereabouts unknown.
Affected product files: none yet. Approach: locate existing authorized local dataset, preserve originals.
Acceptance: original demo DB available; read-only schema and account inventory; UI reopening verified.
Production follow-up: separate deployed schema/session verification, never use production as local fallback.

## WEB-014 follow-up: landing skip target missing

Task: bypass public navigation with the keyboard. Requirement: shared SkipLinks target contract.
Environment: localhost:3100, current Next development build, signed out.
Reproduction: load /; Tab once; Enter. Expected: focus moves to main content.
Actual: hash changes to #main-content, focus remains on link; DOM has one main and zero targets.
Evidence: Browser AX and read-only DOM inspection, 2026-09-19. Impact: keyboard users must traverse header.
Severity: P2. Confirmed cause: MarketingLanding existing main omits id and focusability.
Files: features/marketing/components/MarketingLanding.tsx; focused public-navigation browser regression.
Approach: id=main-content and tabIndex=-1 on existing main; no global wrapper or handler.
Acceptance: one target/main, Enter transfers focus, next Tab reaches main link; desktop and mobile widths.
Production follow-up: only verify deployed release identity and minimal keyboard smoke after release.
Jev: landing_keyboard 0.99; page_target 1.00; hash a81a8cc4b0d9871c98ea98a0f1d21ef01a73543257639e8ec414679fa1925326.

Verification: fixed and observed in requested in-app Browser at 1112×748 and 390×844, dark theme.
One main and target; Enter moves focus; next Tab stays in content. Mobile viewport has no horizontal overflow.
Focused lint and formatting passed. Automated regression added/discovered, not replayed through another driver.
No claim of physical-device, screen-reader or touch verification.

## Documentation contract conflict

The requested PROGRESS.md is rejected by existing check:doc-registry's status-document filename rule.
The prescribed working record is retained and the guard failure reported; no guard weakened or allowlisted.
Resolve report location/contract with the owner before an integration-ready commit.

## Environment and documentation resolutions

ENV-DB resolved for fresh local QA: canonical migrations verify and 26 live adapter tests pass.
This is new data, not restored historical demo content. AUTH-HANDOFF passed after user terms acceptance.
The launch package moved to docs/specs/website-launch, an existing permitted location for feature
progress documents. No validation rule was edited.

## Local chat latency checkpoint

User reported slow responses. Cold request17.2s included8.7s Next compilation and a2s workflow
first-event budget fallback. Warm diagnostic request completed in4.1s, with210ms durable first
event and2208ms model stream-start span, no fallback. UI showed the complete expected answer.
This supports startup compilation as the largest observed delay; production latency remains
unverified. Server remains running. No timeout increase, model substitution or safety bypass.

## Catalog latency repair, 2026-09-19

Independent managed-directory, plugin settings, install overrides, authored skills and optional
directory reads now overlap in the canonical skill-catalog service. Shared plugin filtering,
install overrides, draft filtering and merge precedence remain enforced after reads complete.
The deferred-settings regression failed before the change and passed afterward. The final
catalog and request-processor skill-offer suites passed49 tests. Focused ESLint, Prettier and
web typecheck passed. Test fixtures logged unavailable optional database services; these unit
passes do not replace the separately recorded live adapter checks.

Post-change live Luna reply completed correctly without fallback: skill catalog19ms, request
preparation1768ms, provider stream-start1726ms, total4.4s. Prior sample: skill catalog216ms,
preparation1416ms, total4.1s. Single samples with differing cache/load/provider conditions do
not establish an end-to-end improvement. The deterministic regression proves removal of
serial I/O; cold compilation and overall response latency remain open. No timeout, model,
authentication, permission or safety policy changed.

## Project instruction clearing

User task: remove stale project guidance. P1 data-control failure: clearing the Instructions
field produced undefined, omitted from JSON, so the API retained old instructions. Canonical
update contract already supports null. Regression reproduced this serialization failure; fix
sends null and retains existing UI callback conventions.39 project tests pass; Browser save,
clear and reopening verification awaits the requested Browser connection. No original data edited.

## Production-like local runtime setup

Full production build passed. Startup correctly rejected HTTP origins and missing email pepper,
and required Upstash REST. Inspection confirmed the plain Redis limiter is non-atomic and
explicitly development-only, so the production requirement is justified. Do not weaken it or
reconnect shared production cache; provision an isolated production-capable limiter before timing.
Development server restored. Production-like timing remains unverified.

## Project runtime verification and provisioning gap

Browser create/save/reopen/clear/reopen passed for the synthetic project after inserting a local
Free subscription fixture. The original new-account state had no subscription row; project create
returned HTTP400 although the canonical Free plan includes one project. No entitlement checks
were weakened. Keep natural new-account provisioning unresolved; fixture success does not close it.
No payment identifiers, credits, paid quotas or production records changed.

## Temporary default disagreed with composer

Reproduced default-on preference with unchecked Temporary chat. Creation ORed the default with
a boolean pending flag, preventing explicit off. Fixed with nullable override and one policy
resolver used by composer, page and creation. Tests and Browser pass; privacy default restored.
Full live temporary inference/storage verification remains blocked by provider credits.

## Project source revision listing

Browser same-name replacement saved a correct supersedes chain but SourcesPanel prepended the new item, leaving stale current-source cards until reload. After successful upload the panel now reloads the canonical list through its existing loading/error/retry path. A failed list refresh retries the read without repeating the upload. Two regression tests failed before;10 source-panel/modal tests pass after. Browser revision3 showed one source immediately; DB retains3 versions and1 current. Evidence: evidence/project-sources.json.

## Expanded owner-requested inventory, 2026-09-19

Inventory precedes the next repair batch. Repair attempts are capped at three per unresolved issue; then select independent useful work and retain the blocker. Only cheap Luna chat tests are allowed; image/video generation is excluded. Enterprise signup/login and domain validation are authorized for the supplied demo identity; credentials remain outside evidence files.

| Area                        | Evidence / current finding                                                                                                                                                                    | State                                                          | Repair attempts |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | --------------- |
| Project errors              | Owner saw raw HTTP400; current dialog uses shared formatter, which drops the useful HTTP400 explanation into generic fallback. Canonical quota wording needs clearer project-folder language. | First repair                                                   | 0               |
| Account devices             | Settled Account screen shows “An unexpected error occurred” in Linked devices; sessions and recent activity render.                                                                           | Confirmed browser failure; investigate after project messaging | 0               |
| Free enrollment             | Natural account without subscription cannot create its included project; manual tier fixture is not a fix.                                                                                    | Open                                                           | 0               |
| Credits / Usage             | Included allocation and purchased top-up balance are separate; zero purchased balance may be confusing. Paid cap boundary evidence exists.                                                    | Label review pending                                           | 0               |
| Max15×                      | Canonical monthly, weekly, five-hour budgets are15× Pro; separate concurrency/tool/storage limits are not all15×.                                                                             | Execute ratio assertion and record                             | 0               |
| Workspace                   | Max15× correctly shows Team/Enterprise requirement and two-seat Team setup; no loading error after settling.                                                                                  | Personal gate observed; Enterprise pending                     | 0               |
| Enterprise / email / domain | Signup, identity verification, organization membership, domain ownership and billing require separate evidence.                                                                               | Pending                                                        | 0               |
| Notifications               | Browser permission explicitly blocked; off/browser/email/mobile controls render.                                                                                                              | Environment constraint; delivery unverified                    | 0               |
| General / Voice             | Preferences and dictation settings render; voice behavior and read-aloud wording need review.                                                                                                 | Pending functional coverage                                    | 0               |
| Help                        | Settled empty ticket list and documentation/help/contact/bug/releases/status/legal links render.                                                                                              | Destinations and usefulness pending                            | 0               |
| Security / Privacy          | Security settings render; no changes to owner credentials. Prior export and privacy-copy evidence retained.                                                                                   | Enforcement / isolation cases remain pending                   | 0               |
| Layout                      | Settings dialog has no horizontal overflow at1117×837. Two clipped labels are intentional screen-reader text, not defects.                                                                    | Visual/mobile review pending                                   | 0               |
| Other raw errors            | Existing audit-log and avatar tests expect HTTP503/HTTP500 text.                                                                                                                              | Source leads, not yet live defect claims                       | 0               |
| Caching / Billing           | Existing tier-boundary evidence retained; cross-account stale state and Enterprise accounting need targeted checks.                                                                           | Pending                                                        | 0               |

Jev selected shared HTTP400 validation-message handling with existing internal-detail filters (confidence0.98; request393fc2933892984eaa77319b0d4574d582cc2023b7da78d084d62d1dffd9f245). No enforcement changes are part of that repair.

## Project error presentation verified

Repair attempt2 completed: the inline shared ProjectGallery now uses the canonical user-message formatter, matching the separate modal. Browser Free quota rejection displays “Your Free plan includes 1 project folder. Upgrade your plan to add more, or delete an existing folder to make room.” with no HTTP prefix, preserving the draft. Temporary local plan fixture restored to Max15×; credit rows untouched; no project created. Shared formatter continues filtering SQL, stack traces, identifiers and bare reason phrases;500 responses remain generic.65 shared formatter/gallery tests and42 web dialog/entitlement tests pass. Regressions demonstrated the lost explanation and direct raw rendering before repair. This closes presentation, not natural Free enrollment. Jev follow-up canonical_formatter confidence0.86, requestd6b633ef4c98b8c9dfc25a1bf9ee29b278b5672a4ec7e46b57188be45bced895.

## Linked devices verified

One repair attempt: credential-family lookup now compares UUID as text to the canonical text registration link. Actual PostgreSQL query failed before and passes active, revoked, expired, other-user, non-UUID legacy and absent-link cases after. Temporary tables only; transaction rolled back.37 route/panel tests pass. Browser Account shows the correct empty Linked devices state and existing sessions. No session or credential changed. Evidence: evidence/data-controls.json. Jev cast_uuid_to_text confidence0.95, requestad352703f2050264cc94c2cac63fa20918986eeae6b0a978715a0d64c7bff58b.

Max15× comparison recorded in evidence/plan-limits.json: monthly, weekly and five-hour managed usage budgets each equal15× Pro. Prior paid-boundary tests enforce these budgets. Concurrency, storage and tool limits are separate; this is not a guarantee of15× prompt count across differently priced models.

## Natural Free project allowance verified

One repair attempt: project creation now asks the existing canonical entitlement resolver for the effective tier. This includes the Free baseline for accounts without a subscription and eligible organization seats, and removes inactive paid-tier allowances. It does not fabricate a Free subscription. The authorized demo login reproduced the rejection before repair; after repair Browser created its first project and refused the second with the helpful quota message. Local DB confirms one project and no subscription row.46 route/resolver tests and21 sharing/pagination tests pass; five new cases failed before repair. Original account projects/history did not appear in the demo account. Jev canonical_tier confidence1.00, request3fc78fbf794bc8912ad01aff1a8c6ba315ab7dad229c640c2337eb462ec6f86d.

## Enterprise initial verification

Demo password sign-in and local Enterprise workspace creation pass. Personal project disappears when switching to the new workspace. One-seat capacity correctly disables invitations. Invalid and public mailbox SSO domains are rejected; company-domain input normalizes case and requires DNS proof. A real DNS check without the challenge refuses verification; SSO remains inactive.62 identity/domain and115 SSO route/panel tests pass. Successful external IdP SSO remains unverified. No DNS, production billing or external messaging changed. Evidence: evidence/plan-limits.json.

Additional inventory: Security AuditLogPanel directly renders error.message; its existing regression expects HTTP503. General avatar upload renders returned error strings directly, including HTTP500 in the existing test. These are concrete rendering defects; next bounded repair reuses canonical user-error formatting. Enterprise member list currently displays raw user ID for demo owner; usability follow-up, not a tenant-isolation failure.

## Settings error presentation verified by targeted rendering tests

Security activity and avatar upload errors now use canonical user-facing messages, with retry and draft/profile-state behavior preserved. Transport suffixes such as “(HTTP500)” map to helpful status text. A substring bug also classified “Upload failed” as Safari’s “Load failed”; the matcher now respects word boundaries.56 formatter tests and9 actual component tests pass. No claim of live avatar upload against remote storage. Two repair attempts; Jev shared_format confidence1.00, request8a8411ded0971c520b888eb674c4cf7c7e893f1fbaf955885ff3744b0585c0dc.

Enterprise usage inventory: live usage pane shows four0%-used/100%-left bars with no explicit contract allowance. Canonical Enterprise plan is contract-priced/uncapped, and the local fixture has no metered contract. Do not call this proof of full available credit or successful Enterprise metering. Investigate contract-aware presentation and allocation semantics.

## Usage presentation verification

Purchased-credit balance now explicitly says it is separate from the plan allowance. Contract-priced Enterprise settings show contract guidance instead of four misleading100%-left bars, with a link to existing workspace usage.14 usage/failure-state tests pass; Enterprise message observed in Browser. Workspace usage destination is still compiling and not yet accepted as verified. Accounting and enforcement unchanged. Jev purchased confidence0.99 and contract_message confidence1.00; requests23b6080803404cf4c5c4238163e97e4e4d03bc14334ede44962485b93a512935 and92ebbba27aaba107624ce11ecbccf299780ff70463bd6c296c101b6786482d61.

## Help inventory

Browser search returns useful matches but exposes raw Markdown markers. Collection copy labels the article count as collections. Article-title links lead to generic product destinations rather than the full support article. These remain open. Source inspection also found successful delayed search responses can overwrite a changed or cleared query; reproduce before repair. Jev selected the search race first (confidence0.52, requestb68a5a498e4124c27b6f7e48fbd0fd62a65b570efd0f93091e2d17f7a5f48d16). No model inference is needed for Help search.

Help search race repaired in one attempt: two regressions reproduced stale answers after query clear/change; late responses now cannot update state. Readable excerpts and correct article/collection count repaired in one attempt; formatting regression failed before.13 Help tests pass; Browser credits results show semantic emphasis, no Markdown markers, nested paragraphs or horizontal overflow. Full article navigation/content remains open. Jev presentation confidence1.00, request207a9633c5b1dbb361b8db68543349205890e558339cde773b7d8709ed7504cf. Next selected tenant/role isolation, confidence0.98, requestbbc0a60f47de0dd2548f3dc2de1284d881122b962843bf3c0c31c4b74963e61b.

## Enterprise membership authorization

Real PostgreSQL probe found suspended owner retained46 permissions after migration0248 replaced the0234 status filter. One implementation repair adds0272, filtering active membership in permission and role functions and the own-row visibility predicate. Canonical workspace/permission selectors now filter active status; cached positive workspace selection is re-proved. RLS request scope reuses that resolver and refuses invalid/unauthorized explicit scope instead of falling back to Personal.37 focused tests pass; canonical RLS probe now tests active/suspended/deprovisioned states in a rolled-back transaction. Local272 migrations, zero pending/drift. Active has46 permissions; suspended/deprovisioned have0, no role, no read/write access. Production migration remains queued. Evidence: evidence/plan-limits.json.

Browser post-repair workspace check hit a database connection timeout under load24; direct PostgreSQL and loopback WebSocket query succeed (294ms). One UI retry underway; do not classify this as a permission regression or a successful UI verification yet.

Voice inventory:42 preference/capture/notification tests pass, but Browser turning Dictation off leaves the composer microphone enabled. Source confirms no dictationEnabled consumer in composer/useDictation. Existing test verifies only the toggle itself, not enforcement. General read-aloud copy also denies all web conversational voice despite a separately implemented Start voice mode surface; limit copy to describing read-aloud. Investigate preference enforcement first; no microphone/provider request made. Demo dictation preference currently off for this bounded test; restore original on after verification.

Dictation enforcement repaired in one attempt. Two new regressions failed before;46 hook/store/button tests pass after. Late microphone grants are released and cannot overwrite newer capture; canceled transcriptions cannot restore discarded text. Browser disabled state has explanatory label; original Demo dictation on restored. No real audio captured or paid transcription sent.

Notification inventory: channel selects are editable while loading/saving; initial response can overwrite changes, concurrent full-namespace saves can race, and network mutation occurs inside a state updater. Existing successful-save tests do not exercise these conditions. Reproduce before repair. Browser-level push remains explicitly blocked and no notification was sent.

Notifications repaired in one attempt: controls wait for initial preferences, saves occur outside state updaters and cannot overlap, failures restore saved choices and offer explicit load/save retry. Four regressions failed before;41 settings tests pass. Browser Off choice saved and survived reload, then original Browser choice restored with Saved confirmation. No external notification sent. General read-aloud copy now describes only that feature (Jev0.99); notification serialization selected0.97, request897247aff01be28edcd138a71eaf4e28088456f97524617f00c4d8acbd97bd1b.

Layout snapshot1280×720: notification settings screenshot and DOM measurements show no horizontal overflow or clipped controls. This does not verify mobile sizes. Dictation preference is back on; scheduled notification channels remain Off and browser push remains permission-blocked.

Help article access repaired in one attempt: collections/search now open complete canonical articles, unknown slug404,22 focused tests and full web typecheck pass. Voice audio-transcription timing and Enterprise contract usage guidance corrected and Browser verified. Corpus regenerated41docs/215chunks; consistency check and18tests pass. Broader article accuracy remains open.

Workspace inventory: selecting Enterprise leaves Personal marked selected. GET settings/workspaces derives selection from an explicitly personal-scoped adapter, which always returns organizationId=null. This also makes Personal impossible to select back from that menu because it appears selected. Canonical workspace listing omits active membership status. Repair selection resolution independently of account-list scope and filter inactive memberships; Jev1.00 requestc05c7901736aed260d6143571076388bba3da5a266f560d24a14c0e5feab6877.

Workspace selection repaired in one attempt:23 tests, full web typecheck, focused lint and formatting pass. Browser verifies both directions and Enterprise restored. Real listing SQL excludes suspended/deprovisioned memberships; rolled back. Next inventory: workspace transport exposes Request failed(status) on empty/malformed error bodies; global mutation handler already owns toast, so preserve that owner and normalize errors at the existing request boundary.

Help account inventory: sign-in guide mentions sign-in links although current web adapter uses password/email codes; unconditional cross-client sync promise conflicts with canonical release availability. Installation guide claims all unmarked Help features work in every modern browser despite plan, workspace and browser capability gates. Correct these source-proven overclaims; no native-client or email delivery verification inferred.

Privacy inventory: telemetry writes run inside state updater; load/save races and failed opt-out can resume prior consent after reload. Canonical consent module owns pending local opt-out guard; serialized settings save and retry selected by Jev0.91 request9deccca41b3567ae38d74c0a09876e6c290fd5041b030f045e7e2093ffdd2478 after correcting rejected decision-request schema. The earlier Browser download artifact was unavailable for inspection; deterministic attachment-byte verification is recorded below.

Privacy save corrected in one product repair;83 tests pass plus lint/raw-error guard. Browser original telemetry off restored and persists after reload. Failed opt-out remains off locally across stale document/cache consent and offers retry; opt-in takes effect after save. Two test-only type errors corrected, fresh tsc pending.

Enterprise team inventory: independent privileged GET team list checks membership existence without active status; inactive requester could retrieve member profiles despite canonical permission repair. Prioritize this authorization gate over member-name cosmetics. TeamMember contract is active-only, so list must exclude inactive rows rather than label them active. Jev1.00 requestc3190b135d870bf12262c2b2f5d725ab05ed755d2a268fbb6c5d4b32397d3ea6.

Member identity root cause: local profile is missing both name and email; /api/me backfills only a supplied full name, so email-only accounts remain opaque to member lists and email lookup. Extend existing canonical backfill, filling only empty fields from upstream identity. Email must be verified by identity provider before persistence; do not infer it from a supplied form value. Preserve custom display names/existing emails.

Global error inventory: shared React Query mutation notification formatter returns raw message when status field is absent, bypassing existing canonical HTTP/internal-detail formatter. Reproduce against actual MutationCache and replace duplicated selection with canonical toUserMessage; preserve owner-provided onError to avoid duplicate notifications. Jev1.00 request7ee571d4e1fd53a8c06a85306d7bdfeb1fd549e4e02b9281367d8a6baad5f4a4.

Runtime recurrence10:34UTC: active Browser /chat reaches Taking Too Long again, not valid layout evidence. Neon adapter pool checkout times out after10s in terms acceptance; direct local PG healthy with no app DB connections. Earlier restart was only temporary recovery. Canonical factory supports postgres TCP for local DB; Jev1.00 selected native local adapter contract test then one owned restart with process-only provider override, unchanged auth/RLS/timeouts. No production transport change.

Enterprise billing inventory: Change seats always sends Enterprise to Team pricing, missing seat numbers render comma-space, manual recorded numeric allowance is described as unknown in workspace summary. Actual manual subscription portal handling already correctly avoids Stripe. Repair only navigation/copy and unknown values using canonical contract classification; no billing mutation. Jev1.00 request1ba2af2c3d1285e28a22b23004e88365700e3dd156bcab0868e7d89d2024383c.

Billing destination follow-up: contract page is reachable but a successful empty contract response hides the entire section. Make absence explicit for contract-priced workspaces only; preserve denied-access distinction. Footer no-admin-read-path claim contradicts existing member/model/provider analytics; point to workspace usage. No contract creation or purchase.

Approval recovery inventory: failed HTTP or missing authentication may leave cloudApproval decisions selected while retry controls filter selected decisions out. Reproduce with hook and pending-selector regression before repair. No provider call required.

Approval recovery repaired in one attempt.42 focused approval hook/inbox/route tests pass;19 final hook cases include temporary/persisted HTTP/auth failures and explicit retry/denial. Pending controls survive restored projections. No automatic tool execution retry or provider inference. Full web typecheck and final lint running; evidence/data-controls.json.

Workspace usage inventory: server already exposes unsettledRequests/asOf but dashboard omits them and describes in-flight cost as zero. Jev selected canonical response reuse, pending settlement and snapshot presentation, and narrower billing-only Local/BYOK wording (1.00;724de49cb0c5d75b8ea9fa721ea8debc44c80dffa2417bf19f37478845a01c6b). Accounting stays unchanged.

General settings inventory: secondary personalization read silently defaults after failure, risking overwrite by unrelated edits. Autosave overlap/unmount failure handling is a separate pending review. Jev selects existing load guard for both namespaces first (0.94;27aaefb5a5efe56500bc9ebe371cdfb11c471772e1d51db15e1616f850195870). Demo default model selected Luna through UI; no inference.

Settings layout inventory: desktop fixed close button overlaps scrolled dropdown. Measured close y38.6–70.6 inside scroll viewport y22.6–697.4. Shared modal now reserves close-control band above desktop scrolling pane; mobile layout unchanged. Browser geometry validation next. Screen-reader-only description intentionally clipped and is not a defect. Jev reserve1.00 request7f44a9de645c81c78af71c8ba4f3add85674499cba9ab20f955a90dd88299742.

General preferences verified:26 focused tests, lint/typecheck, Browser save/reload/restoration. Shared modal close control remains8px above desktop scrolling viewport;56 tests and Browser geometry pass. No visible horizontal overflow. Usage errors7 tests and canonical billing label5 tests pass. Evidence in data-controls.json and plan-limits.json.

## Release validation findings resolved locally

The final broad web run exposed four deterministic failures in two files. Two auto-title tests still
fed the old message-count fixture after first-message detection moved to the atomic conversation
activation update. Two support-corpus checks correctly rejected a generated artifact that predated
the reviewed Help link changes. The tests now model the current affected-row contract and the corpus
was regenerated by the repository owner command. Focused recovery passes4 files/48 tests, including
direct-project resolution; an independent activation/corpus rerun passes2 files/29 tests. The red
broad-run result remains recorded and is not relabeled green.

The coverage freshness audit found15 stale hashes across13 source dependencies. Selective
revalidation passes191 web files/1780 tests and69 shared-UI files/500 tests; all59 hash references
now match the source bytes. No pending or blocked product case was promoted from hash freshness.
The aggregate affected-validation issue remains open until the final candidate passes every required
repository and CI gate. Production backup configuration, migrations, deployment identity and Luna
smoke are separate release blockers and were not inferred from local evidence.

## Workspace cache isolation

The workspace-switch cleanup retained the previous workspace's effective-policy snapshot and a
pending MCP connector/resource selection. A focused regression failed before repair. The canonical
scope transition now clears both browser-storage entries while retaining account-level model
preferences. Twenty-one Web workspace/cache tests, two Web policy-hook tests and five client-runtime
policy tests pass, together with focused lint and full Web typecheck. This is deterministic local
evidence; it does not infer production-cache or provider behavior.

## Telemetry privacy claims

The public privacy policy, Settings and Help copy overstated the telemetry boundary: browser Sentry
is consent-gated, but configured server and edge reporting does not use that browser choice, and
free-text diagnostic messages can remain after secret masking. Product copy now names those
boundaries and the exact request fields removed before reporting. Focused and broader privacy,
Sentry, Help, legal and public-claim suites passed 291 tests; the support corpus check, focused lint,
Web typecheck, i18n parity, docs:check, residual scans and diff validation passed. External telemetry
delivery remains unexercised.

## Browser notification permission recovery

The Settings notification switch read permission only on mount, so a user who restored site
permission in browser settings remained stuck on a disabled control until reloading. A focused
regression failed before repair. The hook now rechecks permission and the current subscription when
the app regains focus or becomes visible. Five notification/settings files passed 43 tests; focused
lint, diff validation and full Web typecheck passed. External push delivery was not exercised.

## Account export attachment bytes

The earlier Browser check proved only a successful export response because its saved artifact was
not available to inspect. A deterministic route fixture now reads the actual attachment bytes,
decodes the JSON, verifies representative portable profile/device data and checks that fixture
Stripe and live device credentials are absent. Attachment filename, private no-store caching and
complete-status headers also pass. Seven export suites passed 57 tests with focused lint and diff
validation. Separate project-source and media download target bytes remain open.

## Mobile Account session actions

At a measured 390×844 viewport, the Account settings pane was 388px wide while the active-sessions
table was 597px wide. The Revoke/Log out action column sat beyond the initial viewport. One repair
hides Location, Created and Last active as desktop columns below the small breakpoint and presents
those values in a compact detail list under Device, preserving the action column. The new regression
failed before the repair; four Account suites pass 24 tests. Authenticated Browser geometry now
passes at 390×844 and 320×700: table and wrapper widths match, both action buttons remain inside the
viewport, desktop-only columns are hidden, mobile details are visible and document width does not
overflow. The 320px pass exposed a separate recent-activity ellipsis; that row now stacks its full
event, device and timestamp on phones and returns to two columns at the small breakpoint. Four fresh
Account/activity files pass 17 tests, focused lint/format/diff checks pass, and Browser text/geometry
plus visual inspection show the full `Viewed account data ×36` label and timestamp.

## Localhost backend transport mismatch

The local web environment combined a loopback PostgreSQL URL with the Neon WebSocket adapter and
selected the shared remote Upstash key-value service even though local Redis was running. The fresh
runtime reproduced multi-second database spans, remote limiter timeouts and 12–41 second paths under
load. Existing live evidence had already reduced warm page/API timing by selecting native Postgres
and a local key-value path process-by-process. The ignored local env files now persist the canonical
native PostgreSQL and loopback Redis providers. Direct validation passes 41 database tests (13
Neon-only cases skipped), 19 key-value tests and a Redis PONG. Production configuration and remote
state were untouched. The full web process remains stopped after the RAM cleanup, so a new live page
sample and a successful provider-response measurement remain open.

## Project-source and media download bytes

The earlier evidence named these target bytes as unverified even though the current route chain has
deterministic byte-level coverage. Six focused files now pass 46 tests. Project sources return exact
private no-store bytes, enforce active-workspace ownership, force executable document types to opaque
attachments, and the UI never saves an HTTP error body. Project export JSON contains source metadata
and extracted text. Account exports give every media row an authenticated file URL; that target
denies unauthenticated/out-of-workspace access and returns bytes with the stored SHA-256. This closes
the local deterministic limitation without writing owner files or contacting production storage.

## Destructive conversation scope

Settings described archive-all and delete-all as account-wide, while the canonical stats and bulk
routes scope both operations to the active workspace. Help also called recoverable soft deletion
permanent and the Archived chats surface advertised a permanent-delete control that does not exist.
Four focused regressions failed on those claims before repair. Settings rows, confirmations, counts,
Archived chats guidance and both Help articles now name the current workspace and Recently deleted
restoration without claiming a purge schedule or separate permanent erasure.

Authenticated Browser verification showed `All 2 chats in the current workspace`; both destructive
dialogs were cancelled. The rows fit at 390×844 and 320×700 with no document overflow or visible
clipping. A rolled-back PostgreSQL fixture soft-deleted exactly two disposable workspace chats,
preserved the disposable personal chat, matched one disposable account schedule and left no residue.
Nineteen files pass 252 deletion, account, Privacy and Help tests; focused lint, formatting, corpus
drift and diff checks pass. The owner account and owner chats were untouched. Permanent chat erasure
apart from account deletion is still unavailable and remains an explicit DATA-CONTROLS gap.

## Tool-loop latency attribution

Tool-loop routes persisted first-provider-line timing for health and rollout decisions but omitted the
human-readable TTFT event used by the direct stream path. Successful steps now log the actual route,
provider, model, request, operation and attempt, and warn on the existing breach threshold. The event
states that its observation point is the first provider line so tool calls and thinking are not
misreported as visible text. Three focused files pass 19 tests. This closes the local observability
gap; provider credit exhaustion still blocks a fresh successful live response comparison.

## Scheduled account erasure usage-ledger failure

A disposable due account reached the real PostgreSQL erasure path and reproduced a constraint failure:
a personal `organization_usage_ledger` row cannot survive with both `organization_id` and `user_id`
null. The blanket anonymization update therefore stopped account deletion before identity/profile
removal. Its retry message also hid the failing anonymization store behind the intentionally retained
profile row.

The erasure path now deletes personal ledger rows and anonymizes only organization-scoped history.
Retry diagnostics enumerate the actual failed tables, anonymization stores, stored objects and cache
categories. The same live probe now completes, closes the tombstone, removes subject stores,
anonymizes retained financial records and leaves zero fixture residue. Twelve related files pass 193
tests. External identity deletion was replaced by a spy and no object-storage bytes were seeded.

## Browser-first discovery pass, 2026-09-19

This pass followed the owner's revised order: discover and record issues before any further product
repair. It used the Codex in-app Browser against `http://localhost:3100`, the existing signed-in demo
identity and its Enterprise workspace. Desktop, tablet and phone-sized viewports were inspected. No
model request, image/video generation, checkout, invitation, SSO activation, retention sweep,
workspace mutation or application-source repair was made. Existing plan-limit evidence was reused
only after its four canonical billing/usage source hashes still matched current bytes.

| ID                                 | Severity            | Reproduction and observed result                                                                                                                                                                                                                                           | Expected result                                                                                         | State                                                                                          |
| ---------------------------------- | ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| QA-WEB-DEV-ESBUILD-DEADLOCK        | P1 QA blocker       | Two independent read-only navigation runs terminated the Next development server. Both exits end in esbuild `fatal error: all goroutines are asleep - deadlock!`; Browser then receives `ERR_CONNECTION_REFUSED`.                                                          | Normal route compilation must not terminate the QA runtime.                                             | Confirmed twice; no repair attempted.                                                          |
| QA-WEB-ENTERPRISE-AUDIT-AUTH       | P1                  | As the signed-in Enterprise owner, open `/workspace/audit` and wait for loading to settle. The page says “The audit trail could not be loaded”; Browser console records `Authentication required`. Other protected workspace pages load in the same session.               | An authorized owner can read the audit trail, or receives a precise recoverable session-expiry flow.    | Confirmed once after a fresh server restart; no repair attempted.                              |
| QA-WEB-POLICY-CONTRACT-CONFLICT    | P1 investigation    | Overview labels restrictive defaults ENFORCED while Policy says no saved policy means nothing is restricted. The earlier deprovisioning allegation was a misreading: Identity lists mandatory SSO and group entitlements under a separate Not yet available heading.       | Confirm effective runtime policy, then align its presentation.                                          | Policy contradiction observed; runtime cause unconfirmed. Deprovisioning allegation withdrawn. |
| QA-WEB-PUBLIC-ENTERPRISE-OVERCLAIM | Needs qualification | Pricing advertises SSO, SCIM and audit; the local owner audit flow failed. Supporting SSO is distinct from requiring SSO, and Identity does not label deprovisioning unavailable.                                                                                          | Review claims against actual supported controls and environment prerequisites.                          | Previous blanket overclaim conclusion withdrawn; audit failure remains separately open.        |
| QA-WEB-CHAT-FAILED-WITH-ANSWER     | P1                  | Reopen the saved Luna latency conversation. A red “Agent activity failed” block remains directly above the successful `LATENCY_WARM_OK_2026` assistant answer.                                                                                                             | Successful recovery clears or resolves the failed state so the user sees one coherent outcome.          | Confirmed in saved history; no new provider call.                                              |
| QA-WEB-WORK-RAW-PROVIDER-ERROR     | P1                  | Open failed Work item `LATENCYSAVEFIX2026`. The main pane has a friendly unavailable message, but the AGI Work dock exposes raw `provider_billing_exhausted`.                                                                                                              | Internal provider/accounting reason codes are mapped to a consistent user-facing error.                 | Confirmed; no retry or generation.                                                             |
| QA-WEB-STATUS-EXECUTION-BLIND      | P2 investigation    | Status reports Operational with a routing/configuration check that explicitly does not send a model message. Saved history contains provider billing failures.                                                                                                             | Make probe scope clear and assess current execution health accurately.                                  | Limited probe coverage confirmed; a saved failure does not prove a current outage.             |
| QA-WEB-MOBILE-NAV-OFFSCREEN        | P1 responsive       | At 390×844, opening the mobile navigation drawer places New Chat, AGI Code and Search at negative x coordinates while Chat begins on-screen.                                                                                                                               | Primary navigation actions remain visible and reachable without hidden horizontal displacement.         | Confirmed by screenshot and element geometry.                                                  |
| QA-WEB-MOBILE-COMPOSER-OVERLAP     | P1 responsive       | At 360×800, the model name and the Medium reasoning label visually merge; at 390×844 the model label truncates; at 768×1024 the AGI Work dock clips/overlaps composer controls. The document itself has no horizontal overflow, so the fault is inside the control layout. | Labels and controls remain legible and separated at supported widths and dock states.                   | Confirmed at three widths.                                                                     |
| QA-WEB-USAGE-INCOMPLETE-IDENTITY   | P2 investigation    | Usage shows $2.03 and five turns with zero tokens plus raw member/provider identifiers. Record provenance and whether usage is fixture-derived have not been established.                                                                                                  | Explain recorded data accurately and show meaningful identities.                                        | Display observations confirmed; accounting defect unproven.                                    |
| QA-WEB-MODEL-POLICY-NOT-LIVE       | P2                  | `/workspace/models` says its badge is what a member will actually get, then marks entries explicitly labelled `not live` as `AVAILABLE`.                                                                                                                                   | Runtime-ineligible models are not presented as actually available, or the badge is clearly policy-only. | Confirmed on multiple catalog rows.                                                            |
| QA-WEB-CONNECTOR-DIRECTORY-ZERO    | P2                  | Settings Connectors says zero connectors indexed and that the directory is still being indexed while the same view renders many Top Connectors. One Try again leaves the contradictory state.                                                                              | Directory status and rendered catalog agree, with a useful recovery result.                             | Confirmed in two settled observations.                                                         |
| QA-WEB-PROJECTS-SEARCH-NAME        | P2 accessibility    | `/chat/projects` exposes Search projects visually, but the search input has no label, `aria-label`, `name` or `id`; accessibility exposes an unnamed search text field.                                                                                                    | The control has a stable accessible name like Library and Models search.                                | Confirmed by DOM and accessibility tree.                                                       |
| QA-WEB-WORK-DOCK-768               | P2 responsive       | Opening the failed Work item dock at 768×1024 compresses and overlaps the main layout; after closing it, the error line remains visibly truncated on the left.                                                                                                             | Split view and restored single-pane layout preserve readable content.                                   | Confirmed visually; grouped with the composer repair boundary.                                 |
| QA-WEB-BILLING-CONTRACT-CONFLICT   | P2 investigation    | Personal Billing shows an active Enterprise renewal while workspace Billing has no recorded contract. A manual subscription and absent contract can coexist.                                                                                                               | Explain subscription and commercial-contract state consistently.                                        | Presentation review; billing integrity failure not established.                                |
| QA-WEB-WORKSPACE-COPY              | P3                  | `/workspace/sharing` renders “1 member · you are a owner.”                                                                                                                                                                                                                 | Render “you are an owner.”                                                                              | Confirmed.                                                                                     |
| QA-WEB-CHANGELOG-LOCAL-MODELS      | Withdrawn           | Planning source review found the current changelog already describes Desktop as managed cloud. The earlier stale-claim allegation is not reproducible.                                                                                                                     | Preserve accurate current copy.                                                                         | No repair required; prior classification corrected.                                            |

Environment and release prerequisites discovered during the same pass are tracked separately from
product defects:

- The local migration ledger now reports 272 applied, one pending
  (`0273_ediscovery_cascade_delete.sql`) and one checksum drift
  (`0268_conversation_activation.sql`). Prior zero-pending/zero-drift evidence is stale.
- One launch path reports a too-short TOTP encryption key, while the direct `apps/web` launch passes
  that check; the effective environment therefore depends on how the server is started. Both warn
  that local OAuth callbacks target the production host. Error reporting, tracing export, paging,
  status mirroring, transactional email, browser push and support handoff email are not configured
  locally.
- The Enterprise test workspace has no verified SSO domain, no SCIM connection, no saved workspace
  policy, no SIEM destination and no enforced retention sweep. These are configuration/readiness
  gaps; they are not treated as proof that each underlying implementation is defective.
- Provider credits remain exhausted. Existing Free, Basic, Pro, Max 5x and Max 15x quota evidence is
  still source-fresh, including the exact 15× Pro monthly, weekly and five-hour Max 15x budgets, but
  successful paid generation and output persistence were not replayed.

Useful behavior observed without adding new defects: public Pricing fits 360px without document
overflow; Individual and Team/Enterprise cards and the scrollable comparison table remain usable;
security, pricing, help and status responses include CSP, HSTS, frame denial, content-type,
referrer, permissions and cross-origin headers; global conversation search finds and opens saved
matches; Study validation, schedule validation/cancel recovery, Library filters, model search,
project tabs, Help search/article routing, Account sessions, Security, Privacy and responsive Account
actions settle correctly. These passes are retained to avoid replaying unchanged behavior during the
repair phase.

## Planning reconciliation, 2026-09-19

The earlier count of 17 confirmed defects is superseded by the row-specific dispositions above.
The Browser sweep is broad partial discovery, not complete website requirement coverage. In
particular, the changelog allegation and the deprovisioning-unavailable interpretation are withdrawn
based on current source. Model eligibility, connector indexing and process-exit root causes still
require qualification. Preserve original observations and do not count this correction as a product
repair. The phased implementation plan and acceptance gates are in `LAUNCH_PLAN.md`.

## Additional cohort verification, 2026-09-19

`WEB-DRAFT-NAVIGATION-LOSS-2026-09-19` is a confirmed local P1 draft-loss case: enter an unsent new-chat draft, open Projects, then use Browser Back. The composer returns empty. Reproduced twice; canonical diagnosis and repair plan are in `ACTIVE_ISSUES.md`, with the defect registered in `docs/agent-context/known-flaws.md`. No repair attempted during QA. Search shortcut, zero-results guidance, Escape dismissal and return focus passed in the same session; retain those scoped passes. Evidence: `docs/work/checklist-reaudit/current-evidence/browser-draft-search.json`.

`WEB-DRAFT-CLEAR-RESTORE-2026-09-19` is a confirmed local P2: clearing a reloaded unsent draft restores the text with a false send-failure message. Reproduced twice without sending; canonical diagnosis and plan are in `ACTIVE_ISSUES.md`. Evidence and scoped composer passes: `docs/work/checklist-reaudit/current-evidence/browser-composer.json`.

`WEB-MERMAID-ERROR-DOM-LEAK-2026-09-19` (P3): invalid diagrams render a useful fallback but leave body-level error nodes in the accessibility tree after New Chat. `QA-ERASURE-HARNESS-BOUNDARY-2026-09-19` is a separate verification-harness blocker: the existing live erasure test imports `pg` outside its permitted adapter. Both are registered with diagnosis/next actions in `ACTIVE_ISSUES.md`; no repair attempted.

## Free quota speech experiment qualification, 2026-09-19

The existing QWEN-FREE-QUOTA-REMAINING integration work now has direct API evidence for
translation, speech, embeddings and reranking; it does not yet have composer input controls.
The 16-request capability matrix is recorded in evidence/qwen-free-quota.json#capabilityExperiments.
Two provider observations must be addressed before promoting speech as verified:

- Synthetic speech saying “two hundred four” was recognized as “two, paragraph four.”
  Sending the same PCM with a corrected WAV header reproduced it; an independent local
  speech fixture transcribed exactly. Synthesis versus recognition compatibility is
  unresolved. This is a provider quality observation, not a proven application defect.
- The returned speech URL used HTTP and the WAV header declared more frames than the
  actual PCM. HTTPS GET worked without credentials; HEAD returned403. A future playback
  adapter must validate the payload and safely handle duration/link presentation.

The initial reasoning truncation was resolved for its test case by requesting a concise
answer at the same token cap. Do not increase budgets or repeat passing generations to
hide the unresolved speech quality gap. No production code was changed in this matrix.

## Chat/image pack findings, 2026-09-19

The browser-only pack batch is recorded in evidence/qwen-free-quota.json#qaPackBrowserBatch.
Canonical new findings: WEB-MARKDOWN-TABLE-ALIGN-2026-09-19,
WEB-INERT-CODE-ARTIFACT-2026-09-19 and WEB-FREE-MEDIA-LIBRARY-2026-09-19.
Their diagnosis and repair acceptance live in ACTIVE_ISSUES.md. Existing draft-clear restoration,
free-pool label rehydration and narrow composer overlap observations were reused rather than
duplicated. MD09's200-versus240-character output is a model-content miss, not a renderer defect.
Isolated reloads passed; earlier combined-navigation ambiguity is not a confirmed redirect bug.
Speech, embeddings and ranking are excluded by the owner's latest instruction.

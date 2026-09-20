# Production deployment handoff, 2026-09-19

Status: BLOCKED
Owner: Release engineering
Last updated: 2026-09-20

## Scope

Integrate the intended local repository work, validate the exact release commit,
apply required database and production configuration changes through the
repository-owned release path, deploy the website and its required services,
prove `https://agiworkforce.com` serves the resulting commit, and hand the
release to a separate comprehensive production QA session.

## Main push completed, 2026-09-20

A normal `git push origin HEAD:main` with all hooks enabled advanced remote
`main` from `cc85ac9fc1d9d1ea99f7bd55216ced6791a30a70` to `833c6d336`.
The complete operability guard chain passed in the isolated pre-push checkout,
including migration dependencies. This includes the application changes and
production migration evidence. Documentation follow-up reconciles the remaining
production queue; no deployment or new launch approval is claimed.

## Production migrations applied, 2026-09-20

The owner explicitly authorized production migration apply after the blocked main
push. Production branch `br-round-firefly-apm79pdx` in Neon project
`wispy-star-10666975` advanced from 0248 through **0273** using the canonical
runner with `apply --target production --confirm-production`. Source baseline:
`ca20f3add935fcb139ce196ba2986b38d328898f`. All 25 migrations committed;
`verify` reports **273 applied, zero pending, zero checksum drift**. A separate
Neon MCP query independently confirmed the ledger count and maximum sequence.
No applied SQL file was edited. The production high-water mark now records 273;
allowlist entries for these now-applied migrations were removed. All 48 migration
runner, SQL guard and dependency guard tests passed after recording the verified
production state; the migration dependency guard is now green.

Recovery and rehearsal evidence:

- Pre-migration snapshot: `snap-empty-salad-appydyvx`, named
  `pre-migrations-0249-0273-20260920`, created at 2026-09-20T05:47:19Z.
- Private local PostgreSQL17 custom archive:
  `/Users/siddhartha/.local/share/agiworkforce-recovery/20260920-migrations/production-before-0249.dump`.
  Mode 0600 in a 0700 directory; SHA-256
  `21a60d24b7da50489c7d5aba4d5b843d8ab52ce67d52505a4d088947c74e53ec`.
  `pg_dump` succeeded and `pg_restore --file=/dev/null` read the entire archive
  successfully. This validates readability, not a completed archive restore drill.
- Fresh production clone `br-super-union-apo0em76`, named
  `codex-migration-rehearsal-20260920`, applied the same 25 files and passed
  canonical verification. It is retained for inspection; compute auto-suspends
  after 300 seconds. The pre-migration snapshot is retained separately.
- Thirteen read-only checks passed on both clone and production: ledger head,
  activation backfill and timestamps, plugin version backfill, automation event
  non-null IDs, forced RLS and unique index, three permission-based policies,
  inactive member permission denial, feature-flag constraints, nullable audit
  secret, custody trigger and activation index.
- A rolled-back synthetic transaction on the clone verified active-owner access,
  suspended-member denial, direct custody-delete refusal and workspace-cascade
  deletion. No synthetic mutation was run against production.
- The first policy probe named the wrong three policies; after matching the
  actual 0267 definitions, all three passed. No migration was changed to satisfy
  the probe. Sanitized runner logs and probe SQL are retained with the archive.

Jev selected the backup/rehearsal/apply approach with confidence 1.0. The database
recovery safeguards cover this database-only operation. The independent
object-storage backup gap remains open for application promotion; this operation
is neither a production deployment nor a reversal of the historical GLOBAL NO-GO.

## Main push attempt, 2026-09-20

The owner explicitly requested all current changes on `main`. The 74-path working
tree was committed as `1cec706bc`; the live erasure test adapter repair is
`053729ff8`. A normal `git push origin HEAD:main` was attempted with hooks enabled.
The isolated pre-push checkout rejected the direct PostgreSQL import in the live
erasure test; it now uses the canonical data-layer adapter. Subsequent guard runs
also corrected a QA evidence model literal to a catalog reference, used the
user-scoped connection for free-quota workspace policy evaluation, and preserved
real transitive exports in the quota-route test mocks.

Affected verification: 289 tests passed, with one live database test intentionally
skipped unless explicitly configured. The adjusted erasure suites then passed nine
tests (one live skip), and the adjusted quota route passed nine tests. Secret
scanning, pre-commit checks, the boundary guard, model-literal guard and RLS guard
passed. The remaining operability sequence reaches the migration-dependency
blocker; no hook or safety policy was disabled.

A fresh Vercel production environment pull returned empty database URL values, so
it could not establish the database status. A subsequent read-only Neon MCP query
against the production branch confirmed **248 applied migrations, maximum sequence
248**. Migrations 0249 through 0273 were unapplied at that attempt; the later apply is recorded above. The independent
object-backup prerequisite recorded below remains unresolved. Production migrations
were not applied during that earlier attempt. Remote `main` then remained `cc85ac9fc1d9d1ea99f7bd55216ced6791a30a70`;
no production deployment or successful push is claimed.

## Release ledger

| Item                   | Current evidence                                                                                                                                                                                                                             | State                                                                                                                                    |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Local candidate        | `codex/website-launch-preparation-20260919`; integration commit `c4097d64ad20ba65c29e7d337ae5da6814352cde`, corpus/evidence commit `9c465d7c736c5ce47e6537b4a9ea5d9a2a0d7eb8`, pre-push candidate `978cc12daaf244059c3dc243d114d7c9541163e7` | Application changes and migration evidence pushed to main at 833c6d336; all 759 original paths are classified in the inclusion inventory |
| Remote `main`          | `833c6d336`, normal push confirmed on 2026-09-20                                                                                                                                                                                             | Full local pre-push chain passed; exact-SHA CI and deployment still need separate verification                                           |
| Production web         | `/api/version` reports `eb09a3242df1e003d72702ff6b51b5f641412440` in `production`                                                                                                                                                            | Healthy response, but behind both remote and local `main`                                                                                |
| GitHub protection      | Branch protection endpoint returns `404`; repository rulesets list is empty                                                                                                                                                                  | No enforced protected merge process is configured                                                                                        |
| Production deploy path | `.github/workflows/deploy-production.yml`                                                                                                                                                                                                    | Requires successful push-triggered `CI` for the exact `main` SHA and the same-SHA staging verdict                                        |
| Database release path  | staging applies pending migrations; production verifies the ledger before deployment                                                                                                                                                         | Production verified through 0273 on 2026-09-20; zero pending migrations and zero drift                                                   |
| Production smoke       | Not started                                                                                                                                                                                                                                  | Requires the deployed exact SHA; interactive model smoke must use Luna                                                                   |

## Inclusion inventory

The local release candidate reconciles three distinct sets so none is silently
lost:

1. Sixteen local commits already on local `main` but not on `origin/main`.
2. Tracked staged and unstaged edits across CLI, desktop, browser and VS Code
   extensions, mobile, web, shared contracts, documentation, package metadata,
   and repository guards.
3. Untracked implementation, tests, migrations `0267` and `0268`, guard scripts,
   Jev routing support, and temporary audit material.

The first complete status capture contained 108 tracked paths with a net diff,
two partially staged formatting-only paths whose staged and unstaged changes
cancel, and 57 untracked paths. Every path will be classified as included,
repaired before inclusion, or withheld with a reason before the candidate is
pushed. Secrets, local environment files, caches, generated build output, and
temporary audit evidence will not be added merely because they are present.

The final consolidation accounts for every path in
`docs/work/release-inclusion-inventory-2026-09-19.md`: 759 paths, consisting of
614 modifications, 134 additions, and 11 audited deletions. The total includes
the manifest itself, the final secondary-audit comment correction, and the
support-corpus formatter exclusion. No untracked path remains. The deletions are
the unused or self-only abstractions explicitly described below; none was
removed merely to make a check pass. After staging, `git diff --cached --check`
and the repository secret scan passed over 13,324 working-tree files and all 18
credential formats.

The repository-required Jev decision selected `release_branch_pr` with 0.99
confidence. The decision was bounded to the observed facts: `main` has no
branch protection or ruleset, the working tree must be preserved, and the
production workflow accepts only an exact-SHA successful `main` CI run. No
action was delegated to Jev.

## CI/CD evidence

The latest remote `main` CI run is
[35377587072](https://github.com/siddharthanagula3/agiworkforce/actions/runs/35377587072)
for `cc85ac9fc1d9d1ea99f7bd55216ced6791a30a70`; it failed. The failing lanes
include repository guards, JavaScript tests, contracts, security scanning, and
the default-feature Rust lane. Separate required or release-relevant workflows
also failed, including Repo Operability, Priority Level 1, Desktop E2E, and the
offline AI eval harness. These are evidence of the baseline only, not evidence
for the final candidate.

Exact final-SHA workflow names, run URLs, conclusions, deployment IDs, migration
IDs, and production proof will be added here as they become available.

The push of exact candidate `978cc12daaf244059c3dc243d114d7c9541163e7`
ran `check:llm-operability` in the repository's isolated pre-push worktree. All
earlier gates passed through provider-adapter ownership. The run then failed at
`check:migration-dependencies`, which correctly found application references to
unapplied migrations 0249 through 0273 while the production high-water mark is 0248. Husky rejected the push before network transfer; the remote release
branch and pull request therefore do not exist. This is not bypassed or
allowlisted. Promotion can resume only after the backup prerequisite below is
met, production migrations are safely applied and verified, and the recorded
high-water mark advances to 0273.

Local repair loop evidence so far:

- `check:llm-operability` identified and the release repaired a stale generated
  agent-context index, a stale mobile reachability allowlist entry, a local Git
  exclude pattern that hid a tracked checklist, an obsolete CI-guard ownership
  assertion, an incomplete Vitest mock, raw plan-tier comparisons outside the
  canonical billing catalogue, hardcoded invitation-email colours, and Rust
  formatting drift.
- Targeted lifecycle-route tests: 11 passed.
- Targeted billing/document metadata tests: 50 passed.
- Targeted notification/job-handler tests: 34 passed.
- The original full operability chain passed once after those focused repairs.
  A secondary audit then found that `check:migration-dependencies` recognized
  only four of the twenty pending migrations because it depended on optional
  prose in migration headers. The guard now discovers every numbered migration
  above the production high-water mark, including untracked migrations. Its
  self-tests and the five newly CI-wired safety guards pass; the complete chain
  now correctly remains red until production advances from 0248 through 0273.
- Repository-wide type checking initially found three web errors. Two were
  repaired at their canonical type boundaries; an otherwise undefined and
  unused `pullRequestLifecycle` webhook field was a two-line orphan with no
  parser, consumer, test, commit history, or checklist owner and was explicitly
  withheld instead of inventing production behavior. The web typecheck now
  passes, as do 26 billing-catalog tests and 54 focused web tests. A subsequent
  `pnpm typecheck:all` completed with all 62 workspace tasks successful.
- Commit-by-commit secondary review found two defects that the original green
  suites did not exercise. Custodian legal-hold creation now runs the parent and
  child writes in one transaction, with 56 focused retention/erasure tests
  passing. Audit-stream delivery previously signed with `SHA-256(secret)` even
  though the customer was shown `secret`, making independent verification
  impossible. Migration 0269 adds tenant-bound authenticated ciphertext for the
  usable HMAC key; the hash remains only a fingerprint, legacy rows fail closed
  pending rotation, 56 focused SIEM tests pass, and the web typecheck and Neon
  migration guard pass.
- The browser/computer-use secondary review found that the desktop audit trail
  was only an in-process queue despite claiming durable delivery, had no
  production drain caller, and could lose an allowed action when an audit
  ticket was dropped without settlement. The repair adds encrypted SQLite
  outbox migration v82, drop-time failed settlement, stable client event IDs,
  explicit list/ack commands, an account-bound foreground delivery service,
  authenticated server ingestion, and web migration 0270 for per-user
  idempotency. Retried receipts are acknowledged without duplicating the SIEM
  stream, and desktop receipts reuse the canonical device installation ID.
  Evidence so far: 11 Rust audit tests and 6 desktop delivery/device tests pass;
  the affected web route regression suite passes.
- The CLI secondary review repaired repository-trust lookup precedence, made an
  invalid managed policy fail closed instead of silently falling back, rejected
  duplicate conflict resolutions, constrained conflict paths to actual Git
  unmerged files inside the repository, and required separate trusted-workspace
  test execution approval. An unused arbitrary developer-method bridge and its
  self-only tests were withheld rather than exposed as production behavior.
  `cargo test -p agiworkforce-cli --lib` passes: 2,716 passed, 1 ignored.
- An unused trial-entitlement persistence module and its self-only test were
  withheld: checkout never wrote or consumed it. The live canonical checkout
  trial policy remains. Three duplicate `PastChatCitation` declarations were
  replaced with one shared web type, which is rendered by the live message
  surface; web typechecking passes over the resulting consumer graph.
- The feature-flag governance fields added by the local work were accepted by
  the API but discarded by the store and had no database columns. Migration
  0271 now adds checked maturity, release-channel, availability, and owner
  columns; reads, creates, updates, and audit diffs preserve all four. The 28
  focused flag/outcome tests, Neon migration guard, and web typecheck pass.
- The route-audit registry had one undeclared mutating-looking endpoint, one
  stale exemption, and 23 declared gaps. The resumable stream endpoint is now
  explicitly classified as read-only replay, and all 23 governed mutation
  gaps now emit successful-path events for code-session and agent-run
  lifecycle, connector data/tool/permission activity, mobile purchase
  verification, plugin settings and sources, privacy requests, organization
  share grants/revocations, invitation acceptance/decline, and support action
  proposal/confirmation. The support catalog was split from its mutation
  service after secondary verification proved a one-hop audit scan could
  otherwise misclassify a read-only route. The registry contains zero live
  `gap` entries; its guard now pins the required event names for all 23 repaired
  routes. Audit coverage plus focused support tests pass 72/72, the extended
  closed-gap guard plus mobile purchase regression tests pass 48/48, and the
  complete affected-route rerun passes 124/124. One original assertion was
  corrected to distinguish the new audit write from a forbidden duplicate
  credit while retaining the no-double-credit protection.
- Search history now validates bounded integer query inputs and dates, refuses
  deletion when the active workspace cannot be served in-region, and keeps GET,
  POST, and DELETE under the same residency decision. Entitlement resolution,
  search, and residency-focused suites pass 36/36.
- The secondary implementation audit withheld test-only foundation claims that
  had no production consumer: the cache registry/namespace wrapper (none of the
  four named caches used it), model-improvement eligibility, service-network UI
  state, the local-runtime permission bridge, conversation derived-state
  declarations, provider normalization helpers, and denial telemetry helpers.
  The shared surface-capability grant was retained and is now used by the real
  capability-handshake service. Prompt DLP was also withheld because no
  production DLP scanner was registered; the existing production secret gate
  remains active, while upload DLP continues to consume findings from the real
  upload scanner. Focused policy/capability/secret suites and web typechecking
  pass after the cleanup.
- A later operability pass found that persisted past-chat citation metadata had
  no rendered consumer. `MessageBubble` now renders the canonical
  `CitationPastChats` component below project citations, its metadata contract
  names `pastChatSources`, and the message/citation regression suites pass
  111/111. Surface reachability is green for all declared product surfaces.
- The desktop audit outbox initially reached Tauri through the legacy
  production-mock shim. It now uses the hardened IPC wrapper (command
  allowlist, payload validation, rate limiting, and timeout), its focused test
  passes 3/3, and `check:production-mocks` remains at the established 187/187
  import baseline with zero test-double or canned-response findings.
- The post-repair feature baseline, hardcoded-endpoint, billing-plan predicate,
  concept-registry, provider-adapter, connector-scope, Neon migration,
  concurrent-step lease, public-share DLP, unsafe-retry, Work client-state,
  Work ownership-scope, Rust formatting, desktop wiring, and mobile colour
  guards all pass. `check:migration-dependencies` remains intentionally red and
  precisely identifies application references to migrations 0249 through 0273;
  it will not be allowlisted or bypassed and can turn green only after verified
  production application and an updated production migration high-water mark.
- The canonical 654-record audit inventory now contains one `partial` record.
  SCIM pending identities are linked during the authenticated `/api/me`
  handshake under a locked row and rechecked verified-domain boundary; the
  focused service and route suites pass 7/7 and the web typecheck passes.
  `group-and-domain-capture` was stale audit evidence: DNS ownership challenge,
  persistence, cross-organization uniqueness, settings UI, direct-member
  enforcement, and SCIM enforcement already exist, so its record is corrected
  to `built`. `cloud-code-surface` remains partial pending runtime verification.
  The production Vercel inventory names `E2B_API_KEY`, the cutover flag, and
  compute price, but Vercel deliberately omits sensitive values from an
  environment pull, so the local E2B verifier cannot consume the production
  credential. No credential value was printed or persisted.
- Additional concurrent website-launch work was reviewed before inclusion.
  It corrects an absolute CLI-approval marketing claim, makes project source
  downloads reject HTTP error bodies with retryable feedback, aligns bulk-chat
  deletion copy with the existing recoverable deletion lifecycle, and safely
  preserves actionable HTTP 400 project-quota messages while continuing to
  redact machine detail. Focused web tests pass 45/45 and unified-chat tests
  pass 65/65; associated evidence hashes match the reviewed source files.
- Linked-device listing used a valid text cast, but the same UUID-to-text
  comparison defect remained in device heartbeats and both refresh-token
  revocation paths. All three queries now compare the credential-family UUID as
  text, the regression expectations pin that SQL shape, and the focused suites
  pass 47/47.
- Project creation now resolves the effective entitlement through the canonical
  subscription-and-seat resolver. Accounts without a subscription receive the
  Free baseline, inactive paid subscriptions do not retain paid limits,
  eligible organization seats receive their workspace tier, and lookup errors
  fail rather than silently granting access. The route/resolver suites pass
  46/46 and the web typecheck passes.
- Mobile biometric effects now declare their stable gate callback dependency.
  The biometric suite passes 13/13, the mobile release-script suite passes
  51/51, mobile lint passes, and the complete repository lint gate passes all
  60 workspace tasks. A frozen-lockfile install also completed successfully.
- A fresh repository-wide `typecheck:all` completed with all 62 workspace tasks
  successful after the project entitlement repair and again after the settings
  integration below.
- Settings activity and avatar failures now pass through the shared safe error
  formatter, including HTTP status suffixes without misclassifying ordinary
  prose containing “load failed.” Contract-priced usage no longer invents
  percentage allowances and instead points to workspace usage; purchased
  credits are explicitly separated from the plan allowance. Settings-to-page
  navigation exits the settings overlay only for current-page navigation. The
  focused web suites pass 22/22, the formatter suite passes 56/56, and the web
  typecheck passes.
- Help search now aborts and discards stale response bodies when the query is
  replaced or cleared. Its focused suite passes 9/9, and help copy now reports
  the article and collection counts separately.
- The first complete `test:affected` run reached every affected workspace and
  exposed five stale mobile test expectations plus an incomplete Electron test
  harness. Four snapshots were refreshed only after confirming their diffs were
  the intended diagnostics row and accessible 44-point close control; the
  responsive wiring test now guards the new tablet/gesture owners. The Electron
  harness now supplies the display and window methods used by persisted-window
  restoration. The repaired mobile set passes 11/11 and the deep-link suite
  passes 4/4. The full affected gate must be rerun before it can be recorded as
  passing.
- A secondary live workspace-switch check found that the initial cross-workspace
  cache repair used logout-grade cleanup and erased account preferences,
  including the selected Luna model. Workspace cleanup is now separate from
  account/logout cleanup: it cancels old-scope work, removes workspace content,
  clears React Query, and preserves account model/settings state. The focused
  cache, workspace, auth, and real chat-store suites pass 50/50; the real-store
  regression resolves Luna through the generated family registry rather than a
  hardcoded model ID.
- A live data export proved three reviewed sections were always partial because
  their tables deliberately revoke `app_rls`. A narrow service-role reader now
  owns fixed, parameterized, authenticated-user queries for only
  `authentication_attempts`, `product_analytics_events`, and
  `support_handoff_sessions`, validates every row against an export DTO, and
  preserves the revocations. The same inventory check then caught two newly
  introduced user tables absent from the export; `voice_sessions` and
  `automation_audit_events` are now exported through ordinary RLS. The focused
  privacy/export suites pass 31/31 and web typechecking passes.
- Production health was falsely `healthy` when any configured core dependency
  other than Postgres was absent. Environment health now derives from every
  unready dependency classified `core`, while degradable and optional gaps
  remain named without making core health false. The public route now projects
  a safe DTO rather than exposing internal dependency IDs and exact environment
  variable names. Configuration counts represent affected core dependencies,
  not every alternative variable name, and the status-page copy describes the
  complete core configuration check. Health/readiness and authenticated health
  cron suites pass 54/54.
- Shared Library download and mutation failures, settings API-key load
  failures, and workspace spend-limit load/mutation failures no longer render
  raw HTTP status text. Spend-limit loading and failures are now visible and
  retryable instead of disappearing as an empty surface. SSO validation maps
  domain and identity-provider URL failures to user copy, marks and focuses the
  responsible field. The focused Library suite passes 68/68, settings API-key
  tests pass 4/4, workspace spend-limit and SSO tests pass 17/17, and the
  repository raw-error-to-user guard reports zero remaining findings.
- Organization-sharing project and connector selectors now show sanitized,
  retryable load failures instead of empty controls; overview failures are
  sanitized as well. Generated-file preview/download, Library artifact preview,
  chat conversation loading, the chat render boundary, memory mutations, and
  account deletion/cancellation no longer expose raw HTTP, transport, SQL, or
  trace text. Focused evidence: organization sharing 25/25, generated files
  23/23, shared Library 69/69, chat shell 73/73, memory editor 7/7, and account
  deletion/session flows 16/16. Web and unified-chat typechecking pass after
  these repairs; `git diff --check` and the raw-error guard are green.
- Artifact publishing and both shared HTML-preview renderers now pass internal
  failures through the canonical safe-error boundary. Actual-render regressions
  prove HTTP status, SQL text, and trace identifiers are absent while the
  existing publish dismissal and source-view recovery controls remain. The
  focused artifact error suite passes 3/3.
- Cold authenticated account hydration no longer lets an incomplete legacy
  store object suppress the canonical profile name or the identity provider's
  email. A single account-ID-guarded resolver now feeds both the chat footer
  and secondary application shell; it refuses to combine fields from different
  user IDs. The shared-shell actual-render regression and resolver suite pass
  36/36, including the observed `User` placeholder case.
- A live scope switch from Personal while a Personal project URL was open
  correctly denied cross-workspace data but left the browser on the now-invalid
  detail URL and rendered `Project not found`. Scope finalization now cancels
  old work, records and clears the new cache scope, then hard-navigates project,
  conversation, and Cloud Code detail URLs to their safe collection route.
  Settings and collection routes still reload in place. The workspace and
  cache-scope regression set passes 15/15.
- Conversation-list failures were losing their HTTP status before entering the
  canonical safe-error boundary, so an arbitrary 500 response body could reach
  the sidebar. Every conversation CRUD, pagination, detail, and project-list
  HTTP failure now retains its status and suppresses server body text for 5xx
  responses. The regression preserves a previously loaded sidebar while
  showing only the safe 5xx sentence; the combined conversations/workspace
  set passes 42/42.
- Legal holds, workspace roles, connector/model policy, workspace API keys,
  audit streaming, retention policy, offline sync, notebook execution, and the
  billing-portal action now use the canonical safe-error boundary rather than
  rendering caught exception text. The focused workspace, offline, and billing
  suites pass 43/43; repository-wide suites remain pending.
- A live authenticated local Enterprise-project round trip uploaded, previewed,
  and downloaded a clearly synthetic 181-byte text source with identical
  SHA-256 `c14fdfe...`. The first attempt was interrupted by a local
  Turbopack/esbuild crash; after restarting and warming the project route, the
  same round trip completed. This is local integration evidence only, not a
  production smoke result, and the compiler crash remains a harness/runtime
  reliability observation.
- The most recent `test:affected` invocation reached 57 successful of 59
  completed Turbo tasks before the desktop package failed two of 3,457 tests:
  the Electron deep-link delivery case and the danger-mode confirmation case
  each exceeded Vitest's five-second timeout during the saturated parallel run.
  Both files pass together in isolation, 7/7, with the same assertions and no
  retries. The failed Turbo invocation left the web Vitest child tree running;
  release engineering terminated that owned test tree after recording the
  result so it could not contaminate live latency evidence. This is not a
  passing affected gate and will be rerun after the remaining repairs.
- Local browser timing under the orphaned broad test run was invalid evidence:
  the loopback database path was using the Neon WebSocket provider and showed
  repeated ten-second checkout failures. A bounded dev-server restart with a
  runtime-only `AGI_DATABASE_PROVIDER=postgres` override, using the same local
  PostgreSQL URL and no environment-file change, produced a warm Enterprise
  projects reload of 384 ms. The page route completed in 86 ms; conversations
  in 296 ms; policy in 348 ms; database queries were predominantly 0–9 ms.
  `/api/me` remained the slowest warm API at 772 ms and was treated as a
  follow-up candidate rather than assumed to be database time. A second
  runtime-only experiment retained native PostgreSQL and selected the in-memory
  local KV adapter instead of the configured remote KV REST service. With no
  environment-file or remote-state change, warm `/api/me` fell to 129–208 ms,
  `/api/usage` to 41–81 ms, notifications to 38–86 ms, and projects to
  44–102 ms. This isolates the largest local delay to serialized remote-KV
  request-context reads; production cache latency still requires measurement
  after deployment. The remaining identity-provider lookup is about 100 ms
  locally, so the release does not risk changing JIT/SCIM semantics solely to
  optimize this development path.
- Mobile live validation found two independent layout defects. Opening an
  account action from the navigation drawer could leave both the drawer and a
  second modal mounted; the shell now closes the drawer before settings,
  workspace management, feedback, shortcuts, upgrade, search, and destructive
  account overlays. The resulting Settings dialog occupies the 390 px viewport
  without negative offset or clipping. The workspace administration sidebar
  also pushed mobile content below a 986 px static rail. It is now a compact
  44 px disclosure below `md`, retains the full desktop rail at `md` and above,
  closes on navigation or pathname change, and restores focus to its visible
  summary. Focused shell/navigation tests pass 41/41, with an additional live
  390-by-844 verification of the repaired settings overlay. The restrained
  neutral/AGI-blue treatment and compact disclosure follow the repository's
  product experience contract and mobile-layout guidance rather than creating
  a new visual system.
- Connector-list and delegation mutation failures could still expose browser
  wording such as `Failed to fetch`, and the existing guard missed `.ts`,
  multiline expressions, and direct `mutationError.message` sinks. The guard
  now parses TypeScript and TSX syntax, recognizes user-facing state and toast
  sinks, preserves authored domain messages, and reports zero remaining raw
  error flows. The repair also cleared the real findings it exposed in shared
  directory/settings UI, notebook and artifact-index state, billing detail
  loads, video cancellation, and desktop clipboard feedback. Guard self-tests
  pass 16/16, focused web regressions pass 85/85, and affected shared UI suites
  pass 117/117. No findings were baselined or allowlisted.
- The workspace console disclosure was independently exercised after the first
  repair. Route selection initially left native `details` open and continued
  to displace the destination page. The final implementation collapses it both
  on link activation and pathname changes and moves focus to the updated,
  visible summary; the route-change regression is included in the 85-test web
  batch above. A separate 390-by-844 help-page pass found no horizontal
  overflow or clipped main content and kept all 18 collections, 41 articles,
  support actions, and footer accessible.
- A second live settings pass found that the account-deletion row and action
  labels described immediate irreversible deletion even though the API records
  a 24-hour schedule with self-service cancellation. The row now names the
  delay and cancellation window; the confirmation action says `Schedule
deletion` / `Scheduling…`; the destructive-data detail remains explicit.
  The India privacy copy was corrected to match the existing cancellation
  endpoint. The deletion/cache-focused batch passes 6 files and 71 tests.
- The reviewed privacy export returns an account archive across 38 sections,
  not only conversations. Its row now says it downloads account data as JSON
  and warns the user to store the file privately; behavior is unchanged and a
  rendered-copy regression pins the scope.
- Live Security activity exposed internal resource labels, UUIDs, and audit-log
  formatting. The filtered audit route now reuses the canonical server-side
  activity presenter, drops unknown internal rows, and returns only a human
  sentence, a coarse device label, the event filter key, and time. Raw IPs,
  paths, detail objects, resource labels, and resource IDs do not cross the
  response boundary. The route fetches one extra raw row so pagination remains
  available even when a displayed page drops an unknown row. Its route,
  presenter, hook, component, export-copy, and cache-policy batch passes 8
  files and 66 tests.
- Sensitive response caching now has one maintained route inventory, dynamic
  path matching, and a central response boundary that sets `private, no-store`
  without overriding a route-owned public policy. OAuth start/callback,
  account deletion, data export, CSRF, GitHub installation, and the audit-log
  routes are explicitly protected; focused success, error, rate-limit,
  dynamic-route, and public-policy preservation checks pass. The inventory is
  still undergoing a complete authenticated-GET reconciliation before the
  repository-wide gate is rerun.
- Reissuing an Enterprise SSO domain challenge previously replaced the DNS TXT
  value directly from a button click. It now uses the shared confirmation
  surface and states that the current TXT value stops working immediately and
  must be replaced in DNS. Cancelling performs no request; the endpoint and its
  active-connection refusal are unchanged. Both SSO panel suites pass 21/21.
- The complete post-repair focused run passes 216/216 web tests, 4/4 shared-UI
  tests, and 59/59 unified-chat tests. Web, shared-UI, and unified-chat
  typechecking all pass. The authenticated-GET cache guard found the model
  catalogue's explicit `private` 15-second policy as the only intentional
  non-`no-store` case; every standalone authenticated GET outside cron now has
  an explicit response boundary, credentialed API responses handled by the
  common gateway fail safe to `private, no-store`, and cron responses receive
  the same policy from deployment headers. The cache/GitHub callback set passes
  21/21 and the standalone cache guard passes 7/7 after typechecking its
  instrument.
- A machine-readable full web run against the exact staged tree completed
  22,808 tests: 22,748 passed and 55 failed across 18 files. The failures are
  now fully enumerated rather than inferred from truncated terminal output.
  Shared clusters include stale auth/database mocks for `/api/me` and routing
  preferences, source-inventory guards, GitHub webhook source assertions,
  retention-matrix drift, and changed memory/citation result shapes; isolated
  route and component failures are being reproduced independently before
  repair. This run is failure evidence, not a passing gate.
- Independent live verification passed the 390-by-844 Notifications settings
  layout with no pane or document horizontal overflow, and confirmed the
  mobile project action menu remains entirely within the viewport with all six
  actions accessible.
- Independent live verification initially appeared to show inert dictation
  controls, but secondary instrumentation disproved a product-handler failure.
  During active microphone capture, Playwright, coordinate, keyboard, and CDP
  input all produced zero native events anywhere in the renderer, including on
  an unrelated navigation control. A renderer-native `button.click()` reached
  document, strip, and button capture listeners and immediately moved the real
  composer from recording to transcription and then its safe empty-audio
  error. The isolated dictation/store set remains green at 25/25. Physical
  stop/Escape behavior is therefore unverified in this browser harness, not a
  code defect proven by the earlier automation result.
- Opening the API-key creation dialog emitted React's render-phase update error
  through the shared form controller and measured about 540 px wide in a 390
  px viewport, clipping the name input and scope controls. Form validity now
  uses a leaf `useFormState` subscription instead of subscribing the manager
  during controller render. The dialog has an explicit viewport width bound,
  compact mobile padding, shrinkable content, and wrapping actions. The focused
  suite passes 5/5, including clean-console and narrow-width contract checks.
- The scheduled-task picker presented 375 manual models even though only 22
  are Managed Cloud schedule eligible at the broadest plan. UI and server now
  share a schedule-model helper derived from the canonical `web/cloud-chat`
  runtime profile, chat-capable model types, and current subscription tier.
  Create and update enforce that same result server-side. An existing
  ineligible stored value remains visible as a disabled option during edit and
  is allowed only when unchanged. The schedule UI/service/policy/API focused
  batch and API-key batch pass 118/118; the web typecheck passes. No key or
  schedule was created during the live checks.
- Secondary live verification across Free, Basic, Pro, Max 5x, Max 15x, and
  Enterprise then exposed two additional schedule entitlement defects. Free
  showed create/template controls even though the canonical limit is zero, and
  the project-scoped schedule page omitted the caller's tier and therefore
  under-entitled every paid project as Free. The page now derives creation and
  read-only state from `getPlanMaxScheduledTasks`, preserves historical schedule
  viewing while replacing Free mutation entry points with upgrade guidance,
  and passes the real billing tier into the project surface. The create API
  checks a zero plan limit before the workspace feature gate and exposes the
  canonical safe quota message instead of generic `Access denied`. The focused
  schedule/API/project batch passes 63/63; a fresh full web run remains pending.
- The independent cache-isolation audit found four more account/workspace
  cleanup gaps after its first focused 27/27 pass: module-level model-favourite,
  connector-list, and connector-capability caches had no centralized reset;
  the persisted voice-session store was not registered for account cleanup;
  and workspace cleanup omitted sidebar-unread and steps-card keys. Central
  account/workspace cleanup now invokes the scoped invalidators, account cleanup
  resets and clears the voice-session store, and workspace switches preserve
  account preferences while removing workspace-bound keys. Both promise caches
  use generation fencing so an old account's late response cannot repopulate a
  cleared cache. The focused repair set passes 71/71 locally; the independent
  verifier's overlapping set passes 82/82 plus focused ESLint, and live
  Enterprise-to-Personal-to-Enterprise isolation preserved only the correct
  projects. Full web typechecking passes after the repair.
- The fresh complete web rerun after clearing all 18 previously failing files
  is green: 6,905/6,905 suites passed; 22,817 tests passed, five were explicitly
  pending, and zero failed. This machine-readable result covers 22,822 tests in
  `/tmp/agi-web-results-20260919-rerun.json`. Two later live findings were then
  repaired, so their focused evidence is recorded separately and another final
  broad gate remains required for the release commit.
- A direct schedule-page reload briefly presented the Free upgrade gate while
  the billing store was still hydrating, and an earlier transition could pass
  an undefined tier into model normalization. Global and project schedule
  surfaces now render a neutral schedule-access skeleton until billing loading
  finishes and the store is initialized. The six-file schedule/TOTP focused
  batch passes 73/73; independent live reload showed the skeleton, no false
  upgrade CTA, and the resolved Enterprise manager. No schedule was created.
- Live authenticator setup exposed a present but invalid 48-byte
  `TOTP_ENCRYPTION_KEY`: the startup check accepted presence, while the
  encryption boundary later rejected its shape and the UI reduced the failure
  to generic copy. A shared TOTP keysource validator now owns the envelope and
  startup rules, including repeated-character and single-byte constraints.
  Setup configuration failures return a safe 503 and the UI explains that
  authenticator setup is temporarily unavailable without exposing secret or
  environment details. The same independent 73/73 run covers startup,
  envelope, route, and rendered-client behavior. Successful enrollment was not
  initiated during verification.
- Independent live account export completed end to end and produced a 19,583
  byte JSON archive with 36 top-level sections. Its completeness status was
  `complete`; unavailable, truncated, and skipped collections were empty; the
  tested credential-key denylist found no matching paths. The privacy and
  rights pages now describe reviewed export scope and the explicit completeness
  record instead of claiming an open category gap, while naming intentional
  exclusion of live secrets, credential verifiers, and product-internal cost
  ledgers. The rights-request email input now matches the API's 254-character
  boundary. The historical `enterprise_waitlist` purpose ID remains compatible
  with stored consent records, but its copy now states that organization, SSO,
  SCIM, audit export, and retention controls are already live for entitled
  workspaces. Privacy, consent, and waitlist regressions pass 51/51.
- The remaining public waitlist and Enterprise language was reconciled with the
  live product: CTAs now offer a contract-access discussion rather than saying
  Enterprise has not opened, while the consent purpose identifier remains
  stable for stored records. The API docs, web and mobile marketing surfaces,
  desktop and CLI pages, sitemap, privacy pages, FAQ, form success states, and
  platform-availability description use the same distinction. Focused legal,
  consent, marketing-copy, and waitlist verification passes 136/136; a source
  search leaves the retired wording only in negative regression assertions.
- A second machine-readable complete web run then passed all 6,913 suites:
  22,828 tests passed, five were explicitly pending, and zero failed out of
  22,833 total. The result is recorded at
  `/tmp/agi-web-results-20260919-final.json`. This run includes the schedule,
  TOTP, privacy, and cache-isolation repairs, but predates the later waitlist
  wording, chat-persistence optimization, and project-detail resolution fix;
  focused tests cover those deltas and one final complete release-tree run is
  still required.
- Independent local Luna timing separated product admission from provider
  latency. A warm turn spent about 3.5 seconds in the user-message persistence
  request before inference; a retry without that save reached visible content
  in 7.35 seconds, with about 1.8 seconds in authenticated request admission
  and the balance primarily upstream time-to-first-token. The message route
  was performing an unconditional `count(*)` after every user insert only to
  detect the first title. Conversation activation now supplies that decision
  atomically, so later turns skip the count and title work; the count remains a
  compatibility fallback only when migration 0268 is absent. First-message,
  compatibility, and later-message regressions pass.
- Direct project URLs previously rendered a definitive `Project not found`
  result from only the first 50-item list page, and an intermediate repair could
  remain on `Loading project` forever because its effect cancelled its own
  result. The final path waits for account-scoped list hydration, performs one
  canonical `GET /api/projects/:id` detail lookup when the target is absent,
  distinguishes confirmed 404 from a retryable sanitized failure, and inserts
  a remotely resolved project into the shared store without duplication.
  Detail, true-404, failure/retry, organization-share, chat-activation, TOTP,
  and startup-validation regressions pass 48/48; the web typecheck passes.
- Independent mobile Enterprise verification traversed all 14 workspace routes
  at 390 by 844 without horizontal overflow, clipped primary content, or raw
  error text. Separate local performance diagnosis found nine orphaned Next.js
  telemetry/esbuild processes consuming about 0.8 GB after earlier loaded runs;
  only parentless orphan processes were stopped. A clean local billing route
  then reached visible readiness in 1.266 seconds, with organization,
  preferences, and billing requests at 298 ms, 329 ms, and 516 ms. This is
  local toolchain/runtime evidence, not production latency evidence.
- Independent post-repair project/chat verification passes 16/16. An old,
  inaccessible project URL now settles to a final `Project not found` state in
  about three seconds rather than remaining on `Loading project`; a current
  Enterprise project renders its heading and composer. A labeled Luna
  conversation recorded 1,516 ms to create the conversation, 407 ms to persist
  the first user message, and 1.7 ms from that save response to the LLM request.
  The provider then returned `provider_billing_exhausted`; the UI rendered its
  recovery state and did not attempt a substitute provider. The failed
  assistant record persisted in 393 ms. These are local samples, not production
  latency certification or a successful model-response smoke.
- The final complete release-tree web run retained its machine-readable red
  result rather than hiding it: 6,914 suites contained 22,828 passing tests,
  four failures, and five pending tests. The four failures were two legacy
  auto-title assertions that still modeled the retired message-count decision
  and two generated support-corpus drift checks after reviewed Help changes.
  The title tests now model the activation update's affected-row result, the
  corpus was rebuilt through `build:support-corpus` to 41 documents / 215
  chunks, and the activation, corpus, and project-detail rerun passes 4 files /
  48 tests. The original red result remains at
  `/tmp/agi-web-results-20260919-release-final.json` with SHA-256
  `8b4b80a5eafb626d0cacf8d0fa1d877a3589b9aafed4bb9839511a8505806a42`.
- A separate evidence-freshness audit found 15 stale source-hash references
  across 13 dependencies. Every dependency was revalidated before its hash was
  refreshed: the dependency-focused web pass is green at 191 files / 1,780
  tests, and the complete shared UI package is green at 69 files / 500 tests.
  All 59 source/dependency hash references in the four launch evidence files
  now match the current bytes. The evidence retains its limits: no hardware
  audio, downloaded export-byte inspection, provider generation, or production
  behavior is inferred from those deterministic tests.
- The latest repository-wide lint and typecheck gates are green: `pnpm lint`
  completed 60/60 workspace tasks and
  `NODE_OPTIONS=--max-old-space-size=8192 pnpm typecheck:all` completed 62/62.
  Reference integrity now recognizes the two absolute support links; model-ID
  literal and incomplete-mock guards pass after fixture repairs. Every
  post-migration operability guard checked independently is green, including
  feature baseline, endpoints, plan predicates, concepts, adapters, connector
  scopes, concurrent leases, public-share DLP, unsafe retry, Work state/scope,
  Rust formatting, Tauri wiring, and color tokens. The only intentionally red
  operability gate is migration dependency ownership while production remains
  at 0248 and the candidate contains 0249–0273.
- A subsequent complete affected-workspace run is green at 60/60 Turbo tasks.
  Its web lane passed 2,166 files with three skipped and 22,832 tests with five
  skipped; mobile passed 423 suites / 3,850 tests; desktop passed 3,457 tests;
  and unified chat passed 2,035 tests. Priority-level-one and security tiers,
  extension lint, the 25-test webview suite, CLI wrapper tests, and the 14-test
  migration-runner suite also pass. The exact affected build is green at 47/47
  tasks, and Chrome zip plus VS Code VSIX packaging completed successfully.
- The final affected-workspace rerun completed 60/60 Turbo tasks. Its web lane
  passed 2,166 files with three skipped and 22,841 tests with five skipped.
  `test:l1`, `test:security`, extension lint, the 25-file / 221-test webview
  suite, the two CLI wrapper tests, and all 14 migration-runner tests also pass.
  Chrome packaging passed with the repository's checked-in, non-routable CI
  fixtures and verified a Manifest V3 archive with 279 entries; VS Code
  packaging produced the expected 0.3.0 VSIX. No package artifact was added to
  Git.
- A later affected-build invocation with Node's default heap reached 46/47
  tasks, then the web TypeScript phase exhausted its approximately 4 GB heap.
  This matches the repository's documented requirement for an 8 GB heap and is
  not recorded as a pass. A first 8 GB retry was externally terminated before
  diagnostics; the isolated exact web build was then rerun with
  `NODE_OPTIONS=--max-old-space-size=8192` and passed: compilation, TypeScript,
  page-data collection with nine workers, and 381/381 static pages. The only
  output was the two existing nonfatal Turbopack dynamic-filesystem tracing
  warnings in `lib/services/audit-coverage/sweep.ts`.
- To keep final verification trustworthy on a 16 GB host, release engineering
  stopped one stale local Next development tree, two orphaned build helpers,
  and one overlapping repository typecheck process group after that process
  reached about 4.2 GB RSS. No Codex, system, or unrelated user process was
  terminated. The full repository typecheck had already passed 62/62 tasks;
  the interrupted duplicate is not reported as validation evidence. macOS
  subsequently reported 80% memory free with no material repository worker
  left running.
- Rust verification is green for the complete desktop library (5,353 passed,
  31 ignored), the CLI library/binaries/integration/doc tests (2,716 library
  tests passed, one ignored), the remaining non-desktop/non-CLI workspace
  libraries, and the app-server/protocol pair. `cargo fmt --all -- --check`
  passes. The release also found that the documented Clippy command was not
  enforcing ordinary Rust warnings because the desktop root allowed warnings;
  the crate now denies warnings, ten real findings were repaired, and the exact
  `cargo clippy -p agiworkforce-desktop -p agiworkforce-cli --lib -- -D warnings
-D unsafe-code` invocation is green without warnings.
- Independent source verification found seven public-contract defects that the
  prior claim tests shared as premises: Desktop was advertised with Local and
  BYOK despite the public Electron dispatcher rejecting those commands, an AGI
  managed gateway key was called provider BYOK, unreleased surfaces were written
  in the present tense, human support was guaranteed without an operational
  source, and Help overstated its search corpus. Repair covered public pages,
  support sources and its regenerated 41-document / 215-chunk corpus, current
  canonical documentation, and all 12 pricing/auth/v3 locale sets. A second
  pass then caught legacy master-password, SQLCipher, local-SQLite, and Desktop
  BYOK statements in privacy, terms, trust, subprocessors, permissions, and
  translated pricing copy. Those are repaired against the Electron dispatcher,
  CLI OS-keyring implementation, and CLI JSON/JSONL session store. The claim
  guard now inspects those executable owners and every translated pricing file;
  its focused public-claim/SEO/help/connector rerun passes 7 files / 209 tests.
- The final independent read-only pass then found residual current-document
  contradictions rather than accepting the website copy in isolation: README
  and canonical architecture/product/decision documents still described the
  retained Tauri shell as the public Desktop, exposed its Local/MCP capabilities
  as shipped, or implied Basic availability on unpublished clients. Those
  documents now distinguish the public Electron shell, released CLI, and
  retained internal Tauri code. Four obsolete Desktop-reference allowlist
  entries were removed instead of retained as debt. The independent full
  refresh is clean with no actionable claim findings, 41 source fingerprints,
  32 Desktop dispatcher tests, 281 public-claim tests, 305 privacy/legal/support
  tests, 11-locale i18n parity, the complete document check, and residual scans
  passing. It found one stale non-rendered test comment repeating the retired
  local-Mac-model claim; that comment was corrected, its 21-test suite passed,
  and a read-only delta refresh confirmed all other 40 fingerprints unchanged
  and no remaining exact retired phrase. The first release commit's formatting
  hook then changed the privacy-page and generated-corpus bytes. Their prior
  staged blobs were recovered from Git object storage: repository Prettier
  converts the prior privacy source byte-for-byte to the committed source, so
  that delta is proven formatting-only. The corpus was semantically equal but
  failed its byte-level drift guard; it was regenerated canonically to 41
  documents / 215 chunks, and `.prettierignore` now leaves its exact
  generator-owned serialization intact. The 116-test privacy/support set and
  `check:support-corpus` pass. The final independent report is
  `/tmp/agi-public-claims-audit-final-refresh-5.json`, SHA-256
  `50eaceabba18579676887f01d2352bb5d460e0f964324fde044ea24db412135d`;
  its full predecessor is `/tmp/agi-public-claims-audit-final-refresh-2.json`,
  SHA-256
  `fe308995524ccc1acfc4b28fecc228531840efaa9352a6e6d818c5ec329a721d`.
  `docs/specs/website-launch/evidence/public-claims.json` preserves both results
  and their limits: source-claim reconciliation does not prove production
  deployment, provider execution, or browser behavior.

## Production configuration and dependent services

No production configuration mutation has been performed in this release task.

- Vercel project `agiworkforce` (`prj_vDA7A5nZakjYscIsc47JyGqek3Ea`) is linked
  to team `team_QAqU2q6NTV4xxn971rfTy1F4`.
- The production variable inventory contains database, Redis/KV, Clerk, Stripe,
  E2B, managed model-provider, and primary Cloudflare R2 keys. Vercel's CLI
  exports ordinary variables but omits values classified as sensitive, so a
  local environment-doctor run cannot validate those hidden secret values.
  Their runtime behavior must be checked on the deployed artifact.
- Cloudflare account `3c4f35af67459cbabbccb783f232fad9` is reachable through
  the authorized Wrangler session. It currently contains only the primary
  `agiworkforce-media` and `agiworkforce-media-private` buckets.
- The five required `AGI_STORAGE_BACKUP_*` variables are absent and no separate
  backup bucket or independent, scoped credential exists. Reusing the primary
  R2 credential or creating a second same-region bucket would not satisfy the
  repository's independent/cross-region recovery contract. The hourly backup
  route therefore remains a truthful 503 and production promotion is blocked
  until a separate target and credential are provisioned and verified.

## Database and recovery

No production mutation has been performed in this release task.

- Neon project: `wispy-star-10666975`, production branch
  `br-round-firefly-apm79pdx`, PostgreSQL 17.
- Point-in-time history retention reported by Neon: 21,600 seconds.
- Disposable restore drill at `2026-09-19T07:37:44.535Z`: PASS. The five core
  tables were readable with expected row counts and branch
  `br-delicate-art-apx5p39k` was deleted. A branch listing confirmed only the
  production branch remained.
- Production migration ledger before the release repair: 248 applied, 20
  pending, zero drift. Migrations 0269 through 0273 were subsequently added
  to repair the audit-stream signing-key, automation-receipt idempotency, and
  feature-flag governance persistence defects, require active membership for
  organization authorization, and permit e-discovery rows to follow a verified
  organization-erasure cascade, so the candidate now has 25 pending files.
  The final pending range is
  `0249_background_job_worker_fencing_and_cancellation.sql` through
  `0273_ediscovery_cascade_delete.sql`.
- Production-shaped upgrade rehearsal on disposable branch
  `br-floral-moon-apfyzl61`: all 20 migrations applied, `verify` reported 268
  applied / zero pending / zero drift, and the branch was deleted.
- Rehearsal invariants: zero conversations with a user message remained
  unactivated, zero plugin entries lacked a matching version row, all three
  permission-based admin read policies were present, and the conversation
  activation partial index existed.
- The slowest rehearsed migration was 0268 at 351 ms on the current
  production-sized branch. This is evidence for the observed data volume, not
  a universal lock-time guarantee.
- A fresh rehearsal including the three repair migrations ran on disposable
  branch `br-ancient-lake-apnb2oio`, cloned from production. It began at 248
  applied / 23 pending / zero drift; all migrations 0249 through 0271 applied,
  and verification ended at 271 applied / zero pending / zero drift. The
  slowest migration remained 0268 at 368 ms; 0269, 0270, and 0271 completed in
  166 ms, 179 ms, and 177 ms respectively at the observed production data
  volume.
- Post-rehearsal schema evidence: the automation client-event index is unique
  and valid; its table has forced RLS and one policy; no automation row has a
  null client event ID; the encrypted audit-secret column exists and remains
  nullable for legacy rotation; all four feature-governance columns and their
  check constraints exist and validate; no user-authored conversation remains
  unactivated; and no current plugin registry entry lacks its matching version.
  Migration-runner tests pass 14/14 and the Neon migration guard passes 20/20.
- Final production-shaped rehearsal at `2026-09-19T11:31Z` on disposable Neon
  branch `br-odd-math-apyqunik`: initial state 248 applied / 25 pending / zero
  drift; all migrations 0249 through 0273 applied; final verification reported
  273 applied / zero pending / zero drift. The slowest migration was 0268 at
  342 ms on the observed production-sized data. The branch was deleted after
  verification.
- The first 0249–0273 rehearsal exposed one inherited conversation whose first
  user-message timestamp predated its conversation timestamp. That made the
  original 0268 backfill violate its own `activated_at >= created_at`
  invariant even though the migration command succeeded. Because 0268 is not
  applied in production, it was repaired in place to clamp the activation time
  to the conversation creation time, then the complete rehearsal was repeated
  from a fresh production clone.
- Final invariant evidence: zero conversations with user messages remained
  unactivated; zero activation timestamps preceded conversation creation; the
  cleanup partial index exists; zero plugin entries lack their current version;
  all three permission-based admin policies are present; the automation audit
  table has its unique receipt index, forced RLS, one policy, and zero null
  client IDs; the audit-secret ciphertext column exists and remains nullable;
  all four feature-governance columns and four validated checks exist; inactive
  memberships receive zero permissions; both authorization functions carry the
  active-membership predicate; and the e-discovery append-only trigger is
  enabled. A separate transactional proof on the prior disposable clone showed
  direct e-discovery deletion is refused while deletion caused by a parent
  organization cascade succeeds and removes the child row.

## Rollback

The repository-owned web rollback path is the protected manual dispatch in
`.github/workflows/deploy-production.yml`; it resolves and records the previous
healthy Vercel deployment. Database changes are not reverted by Vercel rollback,
so migration compatibility and any forward-repair procedure must be established
before promotion.

## Blockers and required owner action

- The release is not ready for production QA.
- Production object backup needs a separate-region S3-compatible target and an
  independent credential scoped to it. The currently authorized Cloudflare
  session can administer the existing R2 account but does not supply a separate
  failure domain or an independent backup credential. Application promotion
  remains paused until this prerequisite is met. The separately authorized
  database migration completed with database recovery safeguards recorded above.
- Authentication handoff will be requested only if the final production smoke
  reaches a sign-in boundary.

## CI and security repair checkpoint (2026-09-20)

The repair baseline is `94fada312a53fea70519418547494c52d687c7d0` on remote
`main`. The current patch is awaiting commit, push and remote verification.
This checkpoint does not assert a green deployment or change the historical
launch decision.

- Replaced ambiguous regular expressions in plugin version validation, tool
  output parsing, MCP names, environment origins and repository source guards.
  Plugin routes now use the canonical semantic-version validator.
- Crash uploads use an HTTPS-only client with redirects disabled. The targeted
  transport test verifies that an HTTP destination fails before a connection.
  CLI diagnostics no longer interpolate session paths or assertion fixture IDs.
- Repaired JSON import attributes for Node test discovery, semantic warning
  colour usage, and platform-specific Rust lint failures. Windows UI Automation
  retains its existing mutex; an unshared inner Arc was unnecessary.
- Historical audit evidence remains local. Maintained documents identify it as
  local evidence, with paths and fingerprints in the existing coverage record,
  rather than presenting unavailable files as checked-in references.
- Dependency upgrades remove devalue, image-size, extract-zip and stream-json
  advisories. The previous four audit exclusions were removed. Scoped overrides
  use image-size 2.0.4 and Puppeteer browsers 3.2.2; Jayson 5 removes its old
  parser dependency. Stream-json 3.7.0 requires small pnpm patches to Detox and
  Bunyamin's Node stream entrypoints. The repository runs Node 24.
- The auth browser fixture is signed out and cannot create sessions or authorize
  requests. It supplies explicit provider outcomes so accessibility and keyboard
  tests do not depend on a live identity account. Tests select the exact submit
  button, scope alerts to the form, and enter the password step before testing
  its reveal control. Keyboard coverage checks every visible enabled control.
  Cookie-banner tests wait for the actual banner. The enterprise sweep defaults
  to the build under test; production remains available through its explicit URL.

Verified locally: dependency audit reports zero vulnerabilities at every severity
with no advisory exclusions; web typecheck passes; 24 auth and cookie-scroll
browser cases pass; the desktop suite passed 55 cases with one stale greeting
assertion and one pre-existing skipped case, and the corrected greeting case
passes independently. Focused security coverage passes: 36 contract cases,
25 skill cases, 8 concept-guard cases, 17 plugin cases, 41 hash-boundary cases,
16 crash-report cases, 120 CLI session cases, 32 environment-isolation cases,
42 additional plugin/export/prompt-injection cases, 19 auth component cases,
and 27 quota-authorization cases. These groups overlap and are not a unique total.
Upgraded consumers also passed JSONL parsing and malformed-input handling,
trace-file merge, browser-tooling module loading, PowerPoint image export and a
mock-transport Solana RPC. No paid model calls were used for these checks.

GitHub alerts 794, 795, 800, 806 and 807 were classified as false positives with
an evidence comment on each alert, rather than changing the digest algorithms:

- 794 hashes a retrieval idempotency key derived from user ID and retrieval kinds.
- 795 indexes an API key generated with 32 random bytes, not a human password.
- 800 hashes identity into a deterministic rollout bucket, not password storage.
- 806 binds promotional-quota evidence to a provider-issued credential fingerprint.
- 807 hashes ordered export metadata into a chain-of-custody integrity digest.

The authentication helpers implicated by taint propagation return verified actor
identifiers and scopes, not the bearer secrets. Functional and source review are
recorded above; a fresh CodeQL run is still required for the repaired findings.
The initial independent investigation completed; the subsequent independent
review worker hit a usage limit before returning a review. The coordinator
therefore performed the separate parser, transport and consumer review locally.

The six local enterprise accessibility checks and the desktop/CLI library
Clippy command also pass.

Next: finish the staged guard chain, commit with hooks enabled,
push to main, and inspect the resulting CI, CodeQL and dependency alerts. Passing
local checks must not be described as a verified green remote pipeline. The
independent production-backup prerequisite above remains unresolved.

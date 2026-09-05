# Known Flaws And Drift Ledger

Status: Current
Owner: Platform + security
Last updated: 2026-08-30

Use this file to prevent duplicate bug discovery. If an agent finds one of these again, update the row instead of reporting it as new.

## 2026-08-24 Web artifact index wiring, fixed in source; plus three live findings

**Root cause (fixed this PR).** `/chat/artifacts` reads `useArtifactsStore`
(localStorage) plus `GET /api/artifacts/index` (`web_artifact_index`,
migration 0121). That table was written ONLY by `scheduleArtifactIndexing`,
called from
`apps/web/app/api/chat/conversations/[id]/messages/route.ts` gated on
`role === 'assistant'`, but the real chat flow persists assistant turns
through `persistAssistantTurn`
(`apps/web/app/api/llm/v1/chat/completions/lib/assistant-turn-persistence.ts`),
which never called the indexer. Net effect: the index was dead for all real
traffic, and the Artifacts page was localStorage-only, showing empty on a
fresh device. Fixed by invoking the same `scheduleArtifactIndexing` helper
from `persistAssistantTurn` (the single choke point for both streaming
shapes, `buildAdapterStreamResponse` and `buildManagedAgentStream`, so
tool-loop and research-loop turns are covered too), gated on the message
insert actually affecting a row so a conversation-ownership mismatch can
never orphan an index row against `web_artifact_index`'s FK on `message_id`.
Three more real insertion points into `web_messages` with `role = 'assistant'`
were found and wired the same way: the bulk-save route
(`apps/web/app/api/chat/conversations/[id]/messages/bulk/route.ts`, no known
production caller today but a real reachable surface), the desktop/mobile
device-sync push (`apps/web/app/api/chat/sync/route.ts`, real production
traffic from `apps/desktop` and `apps/mobile`), and `forkConversation`
(`apps/web/lib/services/conversation-branch-service.ts`, UI-wired through
`POST /api/chat/conversations/[id]/branches` and the "branch this
conversation" control in `WebChatPage`/`MessageBubble`, the first pass's grep
sweep missed this one because it copies existing rows with `insert ... select`
rather than inserting a literal `'assistant'`, and a branch's copied assistant
messages get fresh `gen_random_uuid()` ids that need their own index rows,
not the source conversation's). All four call sites are fire-and-forget with
swallowed-and-logged errors, matching the existing `scheduleArtifactIndexing`
contract, indexing can never fail, delay, or block the turn, sync response,
or fork request it rides on. `forkConversation` schedules indexing with the
outer (non-transactional) `DatabaseAdapter` only after its transaction
commits, because the `tx` adapter's pooled connection is released back to the
pool the instant the transaction callback returns.

**Residual, by design.** No backfill migration was written. Conversations
whose assistant turns were persisted before this fix stay unindexed until the
conversation is revisited on a device that still has it cached (client-side
derivation reproduces the artifact locally), the account-wide gallery will
not show them from a fresh device until then. `GET /api/artifacts/index` and
the indexer have no lazy-backfill path; if a full backfill is wanted later it
is a new job, not implied by this fix. The localStorage-only fallback also
stays: `/chat/artifacts` still merges `useArtifactsStore` with the index by
design (same derived id), so a device with cached artifacts keeps showing
them even if the index row does not exist yet for some other reason.

**ARTIFACT-SURFACE-NAMING-01, new, decision needed.**
`media_assets.metadata.surface: 'artifact'` (set by `classifyGeneratedFile`,
`apps/web/lib/server/generated-file-persist.ts:94-112`) is a Library-internal
renderer tag for generated files the code-execution/canvas surface classifies
as artifacts. It is unrelated to `web_artifact_index` (this fix), same word,
two disjoint systems that never read each other. See the Open flaws row for
the closing decision.

**Three more findings from today's live visual audit, recorded per the
Critical Rules on unusual product behavior, not fixed this PR, see the Open
flaws rows:**

- A managed-cloud turn tagged `metadata.surface: 'chrome'` (conversation
  `1d2db16c-9e69-4d75-844b-2b9339d02202`) persisted the user's message with no
  assistant reply, and the web transcript showed no failure state at all.
- Production's Connectors settings panel renders "could not be loaded" while
  `GET /api/connectors` returns 200 with 16 available connectors, the client
  is rejecting a payload the server considers valid.
- Every page load fires 404 probes to `/.well-known/nlweb`, `/ask`, and
  `/mcp`, observed on production AND `main`. Grepping the repo for these
  paths found them only in `apps/extension/src/nlweb.ts`'s `probeEndpoint`
  (NLWeb capability detection, run as a content script against whatever
  origin is current), not in any `apps/web` client code. Whoever closes this
  should confirm whether the audit browser had the extension installed
  before assuming the probe lives in `apps/web`.

## 2026-08-22 Workspace policy plane, landed, with three named gaps

Wave 1 of `docs/specs/teams-enterprise.md`. `organization_admin_policies`
was an inert table with zero consumers; it is now read and written by
`/api/settings/organization/policy`, edited in the Team settings section, and
enforced on every managed-compute route through
`buildOrganizationPolicyGateResponse`. Each policy write emits an
`admin_policy_changed` event that reaches `enterprise_audit_events`.

Semantics worth not re-litigating: an organization with NO policy row is
ungoverned, not governed-by-the-column-defaults. Inheriting `0076`'s restrictive
defaults (`allow_managed_compute false`) on absence would have switched managed
compute off for every existing organization the moment this shipped. `PATCH`
therefore merges onto the current effective policy and writes a complete row, so
a one-field patch can never materialize a row that silently disables the rest.

- **ORGPOLICY-01, CLOSED 2026-08-23.** Observed: a real POST to
  `/api/llm/v1/chat/completions` on a seeded Enterprise workspace with
  `allow_managed_compute = false` returned 403 `managed_compute_disabled` with the
  administrator-facing reason, before any provider was contacted. Superseded text:

**Formerly: not verified against a live workspace.** Every layer is
unit-tested (94 tests across the evaluator, gate, gate response, and route) and
the deny path returns a 403 with a stable code, but no managed turn has been
observed being denied against a real Neon organization with a saved policy.
That is the exit criterion this wave set for itself and it is not met. Needs a
seeded org, a member, and a watched request.

- **ORGPOLICY-02, OPEN by design, per-surface sync is not a security boundary.**
  `chat_sync_surfaces` and `allow_*_cloud_sync` resolve from the client-supplied
  `x-agi-surface` hint, so they govern the clients an organization deploys, not
  what an attacker can reach. `surfaceIsSyncable` returns true for `unknown` and
  `api` rather than denying untagged callers. The UI says so in the panel copy.
  `allow_managed_compute` and `allowed_privacy_modes` are the controls that bind
  regardless of client. Do not relabel these as enforcement.
- **ORGPOLICY-03, NEARLY CLOSED 2026-08-23.** `auditExportEnabled` gates
  `GET /api/settings/organization/audit/export` and a refusal is written to the
  trail. `retentionDays` is now enforced too, behind an explicit per-workspace
  opt-in (`retention_enforced`, 0138): the nightly sweep at
  `/api/cron/enforce-workspace-retention` deletes conversations past the window,
  legal holds suspend it, and every run is recorded. The posture badge follows
  the workspace rather than a constant, `stated` until an owner opts in,
  `enforced` after. Still recorded-but-unenforced: `requireLocalToByokPreview`
  alone (Desktop owns that transition; the web endpoint serves the obligation
  but no Desktop client reads it yet), and the policy panel now says so on the
  row itself.

## 2026-08-23 Workspace admin console, landed, with one named gap

Wave 2 of `docs/specs/teams-enterprise.md`. The customer-facing
console lives at `/workspace`; `/admin` remains the platform operator console.

- **CONSOLE-01, CLOSED 2026-08-23.** Rendered as a real owner of a seeded
  Enterprise workspace against a live database, with the posture reading its own
  configuration. All nine admin APIs answered 200. See
  `apps/web/db/neon/verify/README.md` for the setup. Superseded text follows:

**Formerly: never rendered as an actual workspace owner.** All seven
routes, the anonymous gate, the 403 on the posture API, and axe cleanliness
are verified in a real browser against a live Clerk session
(`apps/web/e2e/workspace-console.spec.ts`). What is NOT verified is the
posture dashboard itself: the QA account is on `max_15x`, and workspace
creation correctly refuses with `SUBSCRIPTION_REQUIRED`, so the console has
only ever been observed in its "No workspace selected" state. Needs a seeded
Team or Enterprise workspace. Same blocker as ORGPOLICY-01, one seeded
organization closes both.

- **CONSOLE-02, RESOLVED 2026-08-23, but the trap will catch the next agent.**
  Server-side `auth()` verifies the session's authorized party against
  `CLERK_AUTHORIZED_PARTIES`, which falls back to `NEXT_PUBLIC_APP_URL`'s origin
  (`apps/web/lib/clerk-authorized-parties.ts`). Against a localhost dev server
  that fallback is the PRODUCTION origin, so every protected page redirects to
  sign-in however valid the browser session is. The symptom is indistinguishable
  from broken authentication, and it is why no agent had visually verified any
  authenticated page in this repo before now. Start the dev server with
  `CLERK_AUTHORIZED_PARTIES=http://localhost:3000`.

The `enforcement` field on every posture signal (`enforced` / `stated` /
`unconfigured`) is load-bearing, not decoration. It is what keeps `retentionDays`

- stored and swept by nothing, from rendering beside managed-compute admission
  wearing the same badge. Do not remove it to simplify the type.

## 2026-08-23 SSO enforcement: designed, deliberately not shipped

"SSO required" is the last genuinely ABSENT capability in the workspace posture,
and it is the one place this session declined to ship rather than ship
unverified. The reasoning, so nobody has to reconstruct it:

**The check that is available is weaker than the control it would be labelled
as.** Clerk exposes a user's linked `samlAccounts`, so "this member HAS an SSO
identity on a verified domain of this workspace" is checkable today. What an
enterprise means by "SSO required" is "THIS SESSION arrived through our IdP",
which is a different claim. Shipping the first under the second's name is
exactly the fake-control failure the `enforced` / `stated` badge exists to
prevent, and it would be worse here than elsewhere because a security reviewer
would reasonably stop asking after seeing it.

**An auth boundary that cannot be verified must not ship.** §112 lists SSO
lockout as a P0 failure. Every other control added this session denies a
request; this one denies ACCESS, and getting it wrong locks an organization out
of its own workspace. The live Clerk verification that would prove it needs a
paid plan with enterprise connections, the blocker already recorded for Wave 5.

**The safe design, when that plan exists.** Deny the WORKSPACE, never the login:
a member who authenticates outside the IdP still signs in and lands in personal
scope with no access to what the workspace owns. That removes the lockout class
entirely, because an owner can always reach the console to turn it off, which is
also the "emergency recovery procedure" §19 asks for. Enforce it in
`evaluateActiveWorkspacePolicy` alongside the other resources so it binds on
every surface rather than at the login page.

**SSOENFORCE-01, ABSENT by decision, not oversight.** The posture says "Not
available" and must keep saying so until the session-level check is real and has
been watched working against a live IdP.

## 2026-08-23 Seeding a stale conversation: messages bump the parent

`update_conversation_on_message` sets `web_conversations.updated_at` when a
message is inserted. That is correct, a conversation someone just posted to is
not dormant, and retention runs from last activity, but it silently defeats the
obvious fixture. Seeding three backdated conversations and then adding a message
to each un-stales all three, the sweep finds nothing, and it reads as retention
being broken.

Backdate AFTER seeding messages, not before. The harness at
`apps/web/db/neon/verify/retention-sweep-against-real-rows.ts.txt` does this and
says why.

The same harness is self-seeding on purpose: the sweep consumes what it deletes,
so a test relying on rows seeded elsewhere passes once and reports `nothing_due`
on every run after.

## 2026-08-23 Three denials observed on live requests

Against the seeded Enterprise workspace, with the app talking to a real database:

- chat completions with `allow_managed_compute = false` → 403
  `managed_compute_disabled`
- chat completions naming a blocked catalog model → 403 `model_blocked`
- chat completions with 500c settled against a 1c cap → 402 `over_cap`

None needed provider credentials, because all three fire before any provider is
contacted, which is the property that makes them cheap to regression-test and
is worth preserving if these gates are ever moved.

The order they fire in is itself a finding: managed compute is checked first, so
with it off you never see a model denial however the policy is set. Anyone
testing model governance must enable managed compute first or they will conclude
the model rule does not work.

Managed Cloud chat also requires an `Idempotency-Key` header. A request without
one is refused 400 before either gate, so a probe that omits it proves nothing
about policy.

## 2026-08-23 The console, verified as a real enterprise owner

Seeded workspace, live database through a wsproxy, signed in as the owner. The
console rendered its own configuration and every badge came from a real row:

- Managed cloud compute: Blocked, ENFORCED
- Approved models: 2 rules in force, ENFORCED
- Approved connectors: 2 rules in force, ENFORCED
- Retention: 1 days, enforced, ENFORCED
- Spend limit: $0.01 a month, enforced, ENFORCED
- SIEM streaming: Delivering, ENFORCED
- Deprovision revokes credentials, ENFORCED
- Chat sync surfaces: STATED POSITION (correct: it reads a client hint)
- SSO required: Not available, NOT CONFIGURED (correct: not built)

All nine admin APIs answered 200 as owner. The recommendations panel offered
only actions the workspace could actually take.

**FOUR GATES FIRED CORRECTLY BEFORE IT WOULD RENDER**, and each is worth knowing
because each looks like a bug until you read it:

1. `organizations.billing_plan_tier` does NOT gate entitlement. The plan comes
   from the OWNER'S `subscriptions` row via `resolveOrganizationEntitlementPlan`.
   Setting the org column alone leaves `plan: "free"` and every admin API 403s.
2. A trigger refuses an organization with no `owner` member.
3. `organizations_seats_within_license` refuses more members than
   `licensed_seats`, which defaults to 1.
4. `requireCurrentTermsAcceptance` redirects to the terms page until
   `profiles.terms_version` equals `POLICY_LAST_UPDATED.terms`.

The first is the one that will cost someone a day: provisioning an enterprise
customer by setting the org column looks right and does nothing.

## 2026-08-23 How to actually verify this stack: Docker Postgres, not mocks

Every service test in `apps/web` mocks the database adapter, so a query naming a
column that does not exist, casting wrongly, or violating a constraint passes
happily. Two real defects hid behind that and were found in one afternoon by
running the schema for real.

The recipe, because it is worth repeating:

    docker run -d --name agi-migtest -e POSTGRES_PASSWORD=test \
      -e POSTGRES_DB=agitest -p 55433:5432 postgres:16-alpine

Apply every file in `apps/web/db/neon/*.sql` in order, each wrapped in its own
`BEGIN; SET LOCAL lock_timeout='10s'; ... COMMIT;`, that is exactly what
`scripts/lib/neon-migrations.mjs` does, and applying them WITHOUT the transaction
produces a spurious failure on 0136 (`LOCK TABLE can only be used in transaction
blocks`).

Then drive the services directly: they all take `db: DatabaseAdapter` as their
first parameter, so a thirty-line `pg`-backed adapter is enough to run their real
SQL against the real schema with no app server involved.

Two things this catches that nothing else does: SQL that is wrong against the
actual columns, and grants that contradict the comment above them. It found
0144's missing REVOKE and it found `current_app_user_id()` reads
`request.jwt.claim.sub`, a scalar GUC, rather than the `request.jwt.claims`
JSON blob that a first guess reaches for.

**What it CANNOT do:** run the app itself. The data layer uses
`@neondatabase/serverless`'s WebSocket `Pool`, which cannot reach a plain
Postgres over TCP, and the adapter exposes no `neonConfig.wsProxy` hook. Pointing
`AGI_DATABASE_URL` at a local Postgres gets as far as "account_status lookup
failed after retry; denying request (fail-closed)", the guard behaving
correctly over a transport that cannot connect. Verifying a live denial end to
end needs either a Neon branch or a wsproxy hook in the adapter.

## 2026-08-23 GRANT SELECT does not revoke anything, 0037 grants writes by default

0037 ran `ALTER DEFAULT PRIVILEGES ... GRANT SELECT, INSERT, UPDATE, DELETE ON
TABLES TO app_rls`. Every table created since inherits full DML for the
application role, automatically, whatever a later migration writes.

0138 through 0143 each stated "writable by nobody through the application role"
and each wrote `GRANT SELECT`. That is additive: it granted nothing new and
revoked nothing. All six tables came back `DELETE,INSERT,SELECT,UPDATE` from
`information_schema.role_table_grants`. 0144 revokes them explicitly, the way
0087 already had to for `enterprise_audit_events`.

**It was never exploitable**, and the reason matters: each table has a
`FOR SELECT` policy and no permissive policy for the write verbs, so with RLS
forced an INSERT is refused and an UPDATE matches zero rows. The protection was
real but accidental, it rested on a policy NOT existing rather than a privilege
not being held. Anyone later adding a `FOR ALL` policy for a legitimate read
reason would have silently handed over write access to legal holds, retention
evidence, spend caps, and SIEM configuration.

**How it was found, because the method is the point:** applying all 143
migrations to a throwaway Postgres in Docker and querying the grants. Text
review passed them; `check:neon-migrations` passed them; every unit test passed.
Only running them showed it. Any new migration that says "writable by nobody"
must REVOKE, not GRANT SELECT, and the claim should be checked against
`role_table_grants` rather than against the SQL that was written.

## 2026-08-23 Audit streaming, the cursor rule is the whole design

`organization_audit_destinations` (0143) POSTs new audit events to a customer's
SIEM, drained by cron every ten minutes.

- **A failed delivery HOLDS the cursor.** Events are retried rather than
  dropped. A receiver can deduplicate on the event id; it cannot recover what
  never arrived. Do not "fix" a retry storm by advancing the cursor on failure.
- **The cursor is (created_at, id), never a timestamp alone.** created_at is not
  unique and a burst sharing a millisecond is exactly what a busy workspace
  produces, so a timestamp-only cursor silently skips or repeats those rows.
  The table CHECK refuses half a cursor for the same reason.
- **Drained, never written inline.** Delivering during an audited action would
  couple every policy change to a customer endpoint being up, and slow the
  action being audited. An unreachable SIEM must never stop a policy change.
- **The endpoint is re-validated on EVERY send**, not only when saved: a
  destination saved months ago may point at a hostname that now resolves inward.
  Delivery goes through `pinnedPublicFetch` so a rebind between validation and
  send cannot redirect it.
- **The signature covers the timestamp**, so a captured delivery cannot be
  replayed later with a fresh header. Receivers should reject a timestamp
  outside their tolerance.

A dead endpoint is SKIPPED after `AUDIT_STREAM_FAILURE_CEILING` consecutive
failures, not disabled, an administrator's configuration is not ours to switch
off, and the console shows the failure count so they can see why nothing
arrives.

**AUDITSTREAM-01, CLOSED 2026-08-23.** A signed batch was delivered over real
TLS to a receiver that recomputed the HMAC independently and accepted it, with
the cursor advancing on 2xx, holding on 503, and the same events redelivered on
retry. The receiver is a local TLS server reached through the `fetchImpl` seam,
with the destination pointed at `192.0.2.0/24` so the real egress guard runs
unmodified; delivery to a receiver on the public internet is still unobserved,
and needs an endpoint the founder controls. The same run also proved the guard
refuses a loopback destination.

**The defect it found, cursor precision. FIXED.** `timestamptz` holds
microseconds and a JS `Date` holds milliseconds. `drainAuditDestination` read
the cursor out with `toIso()` and passed it back as a parameter, so a cursor
written from `2026-08-24T00:11:25.812267Z` came back `.812`, strictly BEFORE
the row it was taken from. Every drain re-selected the tail of the batch it had
just delivered and the stream never reached `nothing_due`; a busy workspace
would resend up to a full batch on every cron tick, forever. Both directions
now keep the cursor inside SQL: the write resolves `last_delivered_at` from the
event id, the read joins the destination row. `audit-streaming-service.test.ts`
carries a regression test that fails if any timestamp is passed as a cursor
parameter. Unit tests could not have caught this, they mock the adapter, and a
mock hands back whatever string the test wrote.

## 2026-08-24 The four authenticated Web E2E specs still run nowhere in CI

`web-a11y` (`.github/workflows/ci.yml`) now runs `public-auth-clean.spec.ts`
and `checkout.spec.ts`, both signed-out, no external services. The other four
`apps/web/e2e/*.spec.ts` files are still exercised only by hand:

- `authenticated-flows.spec.ts`, `enterprise-enforcement.spec.ts`, and
  `workspace-console.spec.ts` each mint a real Clerk sign-in ticket via
  `POST https://api.clerk.com/v1/sign_in_tokens` (e.g.
  `apps/web/e2e/workspace-console.spec.ts:27-41`) and throw immediately if
  `CLERK_SECRET_KEY` is not a real Clerk secret, the `web-a11y` job's fixture
  key (`test-clerk-secret-key`) gets a 401 from Clerk's API, not a token. They
  cannot run against fixture credentials; they need a real Clerk secret key
  plus a seeded QA user (`workspace-console.spec.ts` hardcodes
  `QA_USER = 'user_3F8wXtZ4rDJ1SZmfO02Lz3BHj2v'`).
- `enterprise-surface.spec.ts` is a different kind of gap: it needs no
  credential at all, but it defaults to sweeping **production**
  (`ENTERPRISE_SWEEP_BASE_URL ?? 'https://agiworkforce.com'`,
  `apps/web/e2e/enterprise-surface.spec.ts:12`) and is not referenced from any
  workflow file, so nothing runs it, scheduled or otherwise.

See `WEB-E2E-AUTH-SPECS-NOT-IN-CI-01` in Open flaws. Wiring the first three
needs a decision, a CI secret plus a seeded org/QA user, or a scheduled lane
that authenticates against production, not a mechanical change like the
signed-out specs were.

## 2026-08-24 The production deploy cannot authenticate to Vercel

**DEPLOY-01, BLOCKED_BY_HUMAN.** `deploy-production.yml` now clears every gate
it owns and fails on the first step that talks to Vercel:

    vercel pull --yes --environment=production --token=$VERCEL_TOKEN
    Error: Could not retrieve Project Settings.

Everything before it is green, including `Verify the production schema ledger
without mutation`, the 0087 checksum drift that blocked this for the whole of
2026-08-24 is fixed and the gate passes.

The identifiers are NOT the problem. Checked against the Vercel API:
`prj_vDA7A5nZakjYscIsc47JyGqek3Ea` on `team_QAqU2q6NTV4xxn971rfTy1F4`, which is
exactly what `apps/web/.vercel/project.json` records and the only team on the
account. So the failure is one of the three GitHub secrets, `VERCEL_TOKEN`
expired, revoked, or scoped to another account; or `VERCEL_ORG_ID` /
`VERCEL_PROJECT_ID` holding something other than the two ids above.

No run of this workflow has succeeded in its last forty. Production is
therefore being promoted some other way, and the automated path has never
worked. That matters more than the immediate failure: the rollback step, the
serving-path verification, and the migration-state recording all live in this
workflow, so whatever is promoting production today is doing it without them.

An agent cannot fix this, it needs someone to reissue the token in the Vercel
dashboard and update the repository secret.

**Update 2026-08-24.** `.github/workflows/clerk-bot-protection.yml` has failed
7/7 scheduled runs since 2026-08-17 for what is plausibly the same root cause,
unproven: its `inspect-production` job calls
`GET /v10/projects/{id}/env?decrypt=true` with the same `VERCEL_TOKEN`, and
Vercel was returning the `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` entry's `value` as
ciphertext (`decrypted: false`) rather than failing the request outright, a
narrower symptom of a token that cannot decrypt, alongside the pull failure
above. `scripts/check-clerk-bot-protection.mjs` now checks that field before
trusting `value` (only `decrypted === false` is rejected; a plain-type entry
that omits the field entirely, per Vercel's own docs, is trusted as real
plaintext), and for `--target production` it falls back to reading the
publishable key straight off the served production page (it is `NEXT_PUBLIC_`,
so it ships in the client HTML) whenever the Vercel call fails for _any_
reason, ciphertext, a 401/403 from an invalid token, or a network error.
not only the ciphertext case. That means the production check no longer
depends on `VERCEL_TOKEN` working at all: even if DEPLOY-01's token turns out
to be fully dead rather than merely under-scoped, this workflow still resolves
the key from the production page and its 7/7 failure streak is fixed
independently of whoever reissues `VERCEL_TOKEN` for that deploy path. This
does not fix DEPLOY-01 itself, `vercel pull` has no such fallback, and
`--target preview`/`--target development` still depend on a working,
decrypt-capable token with no fallback of their own.

**Update 2026-08-24, later.** Verified live: after the fallback landed
(PR #429, `94fde11b1`) a `workflow_dispatch` of Clerk Bot Protection still
failed, the `production-web` GitHub environment variable
`PRODUCTION_WEB_URL` was the literal placeholder `-`, which wins the
`vars.PRODUCTION_WEB_URL || 'https://agiworkforce.com'` expression in both
`clerk-bot-protection.yml` and `deploy-production.yml`, so the fallback tried
to fetch `-` and the deploy workflow's `verify-deployment.mjs` steps would
have received `-` as the deployment URL the moment `VERCEL_TOKEN` is fixed.
The variable was corrected to `https://agiworkforce.com` the same day and the
next dispatch (run 32745665761) passed, the workflow's first success ever,
confirming sign-up bot protection is enabled (turnstile) on the live
instance.

**Update 2026-08-24, hardening.** The script no longer trusts the env value
verbatim: `resolveProductionWebUrl` treats an empty, unparsable, or
non-`http(s)` `PRODUCTION_WEB_URL` as unset and falls back to the script's
own default origin (`https://agiworkforce.com`), so a junk GitHub environment
variable can be wrong without blinding the check. Covered by `node --test
scripts/check-clerk-bot-protection.test.mjs` (self-tests for `-`, empty, `not
a url`, `ftp://x`) and verified against the live instance with each of those
values.

## 2026-08-24 RLS hid the owner's subscription from every other administrator

**ENTITLEMENT-01, FIXED.** A user who IS an admin of an Enterprise workspace
was shown "You do not administer this workspace", and
`/api/settings/organization/posture` answered `403 SUBSCRIPTION_REQUIRED` with
`currentPlan: "free"`, on a workspace holding a valid enterprise subscription.

`resolveOrganizationEntitlementPlan` resolves from the OWNER's `subscriptions`
row. All ten organization routes called it on `getUserScopedDb`, and
`public.subscriptions` has RLS forced, so a scoped connection sees only the
caller's own row: the join returned NULL and the plan collapsed to `free`.
Confirmed directly against Postgres on BOTH branches of that join, with and
without an organization `stripe_subscription_id`, where the owner resolves
`enterprise` and the admin resolves NULL.

Blast radius was the entire administration surface: posture, policy,
model-policy, connector-policy, spend-limit, legal-holds, usage-analytics,
audit, audit/export, audit/destination. The OWNER was never affected, which is
exactly why it survived: every live verification in this session had been run as
the owner, and an owner can always see their own row.

Fixed by resolving entitlement on the privileged connection. Entitlement is an
organization-level fact rather than the caller's own data, and membership is
still established on the scoped connection first, both call sites pass an
organization id taken from the caller's own membership, and
`requireTeamAdminAccess` asserts membership before asking.

**Why the suite was green.** Unit tests mock the adapter, and a mock always
"sees" the owner's row, so RLS never applies. Worse, the existing E2E asserted
`posture must not serve a non-administrator` → 403 and PASSED, it had encoded
the broken behaviour as the expectation. The new guard is structural: it asserts
the function takes an organization id ALONE, because a `db` parameter is what
lets a scoped adapter back in.

This is the same shape as the 0144 grant defect: protection that reads correctly
until something runs as a real, non-privileged caller.

## 2026-08-24 Six desktop tests fail on a local macOS checkout and pass in CI

**Not a defect, and not worth chasing again.** `cargo test --lib mcp_oauth` and
`core::agi::reflection::tests::test_failure_categorization` fail on a local
macOS working copy with:

    open settings db: "encrypted database key did not match or the file is
    corrupt ... file is not a database"

They fail single-threaded too, so it is not the `std::env::set_var` race the
shape suggests. They fail identically on `origin/main` with and without the
`remote-databases` feature set, so they are not caused by any dependency bump.
And CI's `Rust desktop and CLI (default features)` job passes them, confirmed
green on #427.

The cause is local state: the SQLCipher key is Keychain-backed on macOS and
`~/Library/Application Support/agiworkforce/agiworkforce.db` persists between
runs, so a fresh temp database is opened with a key that does not match it. A
Linux CI runner has neither.

If you see these six locally, they are telling you about your machine. Verify a
desktop change with `cargo check`/`clippy` plus the CI result, not this suite.

**Correction, 2026-08-24: this is not equally true of every test in the six.**
`mcp_oauth`'s `with_temp_settings_db` helper sets `AGIWORKFORCE_APP_DATA_DIR`
to isolate itself, but nothing in the current codebase reads that env var any
more, `lib.rs:41-44` documents its replacement by the `AppDirs`/`OnceLock`
pattern in `sys::utils::app_data_dir()`, and neither that function nor the
`#[cfg(test)]` path in
`data/db/key_management.rs::open_registered_main_database_connection` (line 206) consults it. The env var is dead, which is corroborating evidence for
this section, not a counter-example: the override does nothing, so the test
falls through to real host state exactly as observed.
`core::agi::reflection::tests::test_failure_categorization` is different in
kind: `KnowledgeBase::get_db_path()`
(`apps/desktop/src-tauri/src/core/agi/knowledge.rs:53-56`) has no override
mechanism at all, dead or otherwise, it unconditionally resolves
`dirs::data_dir().join("agiworkforce")`. See
`DESKTOP-KNOWLEDGE-DB-TEST-ISOLATION-01` in Open flaws: unlike the general
"your machine" framing above, this one has a concrete, low-effort fix (route
it through `sys::utils::app_data_dir()` so a test harness can redirect it),
not just an explanation for why CI is fine.

## 2026-08-24 SCIM authentication verified against production

**SCIMAUTH-01, VERIFIED, no defect.** Checked because an unauthenticated
directory-provisioning endpoint would be the worst hole on the enterprise
surface. Observed live on agiworkforce.com: `/api/scim/v2/Users`, `/Groups` and
`/ServiceProviderConfig` all answer 401 with no credential, and 401 to a bogus
bearer token.

The implementation is stronger than a token compare. Every route goes through
`withScim`, which rate-limits and then calls `authenticateScimRequest` BEFORE
the handler, so a handler cannot run unauthenticated. The token is looked up by
prefix with `revoked_at is null and (expires_at is null or expires_at > now())`
in the SQL rather than in JS; the prefix is compared with `timingSafeEqual`; and
the secret is verified with `argon2.verify` against a stored hash, so the
comparison is constant-time by construction and the raw token is never stored.
Every error path returns null or throws 401, including a failed entitlement
lookup, which logs "failing closed" and resolves to an unentitled plan. A
disabled connection returns 403 rather than 401, which is the right distinction.

Recorded so the next audit does not re-derive it. If those files change, re-run
the live check rather than trusting this paragraph.

## 2026-08-24 Three-vendor enterprise comparison, checked live rather than from screenshots

The reference corpus at `/Users/siddhartha/Desktop/references_for_agi` was
captured 2026-08-07 and has no xAI material at all. Checked against live
sources; four capability rows added (CAP-063..066) and CAP-017 restated.

What the corpus did not have, and what changed:

- **Grok was entirely absent.** xAI sells Business at a published per-seat price
  with SOC 2 Type II, RBAC, seat management and consolidated billing, and
  Enterprise adds custom SSO, SCIM, custom RBAC, and an **Enterprise Vault**: a
  data plane isolated from the consumer environment with application-level
  encryption and customer-managed keys. It also documents a **team-wide zero
  data retention** option against a 30-day encrypted default.
- **Claude's live pricing lists two rows the screenshots did not**: IP
  allowlisting and network-level access control, and it words role-based access
  as "fine grained permissioning".
- **All three sell a compliance API**, and OpenAI's is a Compliance Logs
  Platform of immutable time-windowed JSONL aimed at SIEM, eDiscovery and DLP.
  Ours is an on-demand JSONL download. The gap is immutability and coverage,
  not the existence of an export.

Two honest notes on method. openai.com, x.ai and help.openai.com all answer 403
to automated fetches, so the OpenAI and xAI rows rest on the captured
screenshots plus search summaries rather than a primary fetch, treat them as
good but not first-hand, and re-check before quoting one to a customer. And the
comparison is about what can be _sold_: Local and BYOK answer the isolation
question more strongly than any vendor tier by keeping content off our
infrastructure, but that is architecture, not an administrable control, and a
procurement checklist asks for the control.

## 2026-08-24 No Windows or macOS installer exists, and the feature set the Windows job builds could not compile

**DISTRIBUTION-01, ROOT CAUSE FIXED, RELEASE STILL UNPROVEN.**
`build-windows-release.yml:278` builds with `--no-default-features --features
shell,updater,billing,devtools,vad,remote-databases`. That exact set failed
`cargo check` with 20 errors. Every run of the workflow in its visible history
has FAILED, the last attempt on 2026-03-06. The newest release
(`v-desktop-1.2.0`) carries only `.rpm`, `.AppImage`, and `.deb`; there is no
`.exe` and no `.dmg`. Production `/api/download` answers 503 for `windows` and
`mac` and 200 for `linux`, observed 2026-08-24.

The root cause was a split bson: the crate depends on `bson 3` directly while
mongodb's default features select `compat-3-0-0`, which pulls `bson 2`, so every
`Document` crossing the boundary was a different type. Four smaller breaks sat
behind it in code that had therefore never compiled, `bson 3` renamed
`to_bson`/`from_bson`, mysql and postgres wrote `Result<(), Error>` against a
one-argument alias, and redis `mget` called `get`, whose key must be a single
argument. The feature set now compiles and clippy is clean.

What is NOT proven: that the Windows job now produces a signed installer. That
needs a run of the workflow on a Windows runner, which is the next step and has
not happened. Do not describe Windows distribution as fixed until an `.exe` is
attached to a release.

**This also corrects the SUPPLYCHAIN-01 entry below.** Its statement that "every
Windows user is running mongodb and mysql_async" cannot be true of a build that
has never succeeded. The advisories were real; the population was not. Moving to
mongodb 3.8 carries `hickory-proto 0.25.2 -> 0.26.1`, which clears both
hickory advisories outright rather than by suppression.

## 2026-08-23 The Windows release ships remote-databases, and the audit file said it did not

`.cargo/audit.toml` suppressed four vulnerability-class advisories (two
`hickory-proto`, `rsa`, `proc-macro-error2`) on the grounds that
`remote-databases` is "off by default and gated behind a build flag", so "users
who enable it accept these advisories".

`build-windows-release.yml:278` builds the shipped NSIS installer with
`--no-default-features --features shell,updater,billing,devtools,vad,remote-databases`.
Every Windows user is running mongodb and mysql_async. Nobody enabled anything
and nobody accepted anything.

The file's own COVERAGE BOUNDARY note warned about exactly this shape, "the
same shape of reasoning that hid the rustls-webpki line for months under a claim
about Tauri that turned out to be false", and then asserted this one was "true
and checkable". It was checkable. Checking it showed the claim answered the
wrong question: not "is it on by default" but "what ships".

Compounding it, `deny.toml` sets `[graph] all-features = false`, so the blocking
CI advisory step never walks the `remote-databases` edge at all. The suppression
is not what leaves those advisories unenforced; nothing was enforcing them.

**SUPPLYCHAIN-01, OPEN, needs a product decision.** Three ways out, none of
which an agent should pick unilaterally: bump `mongodb` past its `hickory-proto
^0.25` pin, drop `remote-databases` from the Windows build if the desktop app
does not need remote database connectors, or accept the risk explicitly with the
corrected reasoning in front of whoever accepts it. The comment block now states
the truth so the next reader is not misled.

**SUPPLYCHAIN-02, OPEN, noticed alongside.** The same Windows release line
enables `devtools` in the signed production installer. Worth confirming that is
intended rather than inherited.

## 2026-08-23 Spend caps: eventual on purpose, and said so

`organization_spend_limits` (0142) refuses metered turns once a workspace passes
a calendar-month cap it chose to enforce. Four decisions worth not re-opening:

- **Enforcement is EVENTUAL, not exact.** Summing month-to-date spend on every
  turn would put an aggregate scan on the hot path, so the decision is cached
  for `SPEND_CACHE_TTL_MS` and a workspace can overshoot by roughly one window
  of spend. The console says so in those words, and the posture badge repeats
  it. A cap presented as exact when it is not is the same class of lie as a
  retention window nothing sweeps.
- **`notify` never refuses.** It exists so a finance owner can watch a budget
  before deciding to enforce it. The posture reports a notify-only cap as a
  STATED position, not an enforced control.
- **`block` is never a default.** The column default is `off`, and blocking is
  the one mode that stops people working.
- **Ungoverned on failure.** A billing lookup failing is an infrastructure
  fault; refusing every member's work over it is worse than briefly
  overshooting.

The cap and the month-to-date sum are read in ONE query. Two round trips would
double the latency added to every governed turn and could disagree if a write
landed between them. Raising a cap invalidates the cached decision so a
workspace is freed at once rather than a window later.

`spend-limit-coverage.test.ts` asserts every metered route asks, AND that it
asks before reserving credit, a turn a cap will refuse must not spend first and
be refunded.

**SPENDLIMIT-01, CLOSED 2026-08-23.** Observed: with a settled 500-cent turn
seeded and a 1-cent cap set to `block`, a real chat request returned 402
`over_cap`. Note the cache: the decision is held for SPEND_CACHE_TTL_MS, so a
cap lowered under a warm cache does not bite until it expires, which is the
eventual-enforcement behaviour the console describes, seen working.

## 2026-08-23 Connector governance, one enforcement point, on purpose

`organization_connector_policies` (0141) is applied inside
`loadUserConnectorToolCatalog`, where the tool catalog is assembled. That is the
single path chat, scheduled tasks, and cloud agent runs all share, so a blocked
connector is never offered to the model from any of them. Enforcing per caller
would produce a rule that holds in chat and not in a scheduled task, which is
not a control.

- **Filtering IS the enforcement.** A tool the model is never told about cannot
  be called. Do not weaken this to a flag on an offered tool.
- **The workspace policy is applied BEFORE the per-turn `isToolDenied` hook.**
  That hook is a caller's own restriction; the administrator's has to bound what
  a caller can widen. `connector-policy-coverage.test.ts` asserts the ordering.
- **Custom connectors are a separate switch**, and naming one on the approved
  list does not escape it. A custom connector is an arbitrary member-supplied
  MCP endpoint, a different risk from a catalog integration, so "no arbitrary
  endpoints" must not be silently defeatable.
- **Ungoverned on a read failure**, like model policy. Connector governance
  decides which approved integrations staff use; the tenancy layer is what stops
  cross-workspace access and that fails closed. Denying every connector because
  the policy table blipped would break every member's tools for a reason no
  administrator chose.

**CONNECTORPOLICY-01, CLOSED 2026-08-23.** Observed against a real Postgres:
with a verified GitHub installation seeded, `loadUserConnectorToolDefs`, the
one function chat, scheduled tasks, and cloud agent runs all load their catalog
through, offered the `github` connector while the workspace was ungoverned,
did NOT offer it once an administrator's policy row blocked it, offered it
again when the block was lifted, and withheld it again under an allowlist that
omitted it. The harness is `db/neon/verify/connector-policy-live-catalog.ts.txt`.
The first assertion is load-bearing: without proving the connector was there,
"not offered" would be indistinguishable from an empty catalog.

## 2026-08-23 Deprovision: three properties that must not be simplified

`deprovisionMember` (`apps/web/lib/services/deprovision-service.ts`) runs when a
member is removed by hand and when SCIM deactivates or deletes them.

- **Each step is independent.** A Clerk outage must not leave the leaver's
  developer keys live as well, so a failure in one revocation does not abandon
  the rest. What could not be reached is RETURNED, not swallowed: a deprovision
  that silently half-succeeded is worse than one that failed loudly, because an
  administrator believes the person is cut off.
- **A failed session LIST does not report zero.** Reporting zero would read as
  "this user had no sessions", the opposite of the truth.
- **It revokes credentials, never the account.** A member removed from one
  workspace keeps their personal account and signs in again into personal scope.
  Deleting the account is a different, far more destructive act that no
  administrator asked for by removing a member.

The SCIM path never throws: an IdP treats a non-2xx as a failed deprovision and
retries, which would re-run a revoke that already succeeded and report the whole
operation as failed when the membership WAS revoked. Warnings land on the
directory sync event instead.

**DEPROVISION-01, OPEN, never observed against a live IdP.** Eight unit tests
with a stubbed Clerk client. No real session has been watched dying. Needs the
same seeded workspace as CONSOLE-01.

## 2026-08-23 Turbopack dies sweeping many routes in dev

`pnpm dev` panics after roughly twenty sequential cold page compiles:
`turbo-tasks: an internal panic occurred outside the per-task panic boundary`
from `turbo-tasks-backend/src/backend/operation/mod.rs`. It is a Turbopack bug,
not a product one, and it silently turns the rest of a browser sweep into
`ERR_CONNECTION_REFUSED` that reads like dozens of broken pages.

Sweep against a production build (`pnpm build` then `next start`) instead. Two
things it needs that dev does not: `EMAIL_HASH_PEPPER` (the env guard refuses to
boot without it) and `NEXT_PUBLIC_APP_URL=http://localhost:3000` AT BUILD TIME,
since that value is inlined into the client bundle and a production origin there
leaves the browser session unusable by the server.

## 2026-08-23 External sharing, two states, and why not three

`external_sharing_enabled` (0140) refuses NEW anonymous public links on both
paths that mint them: `/api/share` (a chat transcript) and
`/api/artifacts/publish`. `lib/services/__tests__/external-sharing-coverage.test.ts`
reads both sources and also asserts the gate runs BEFORE the write, a gate
after the insert has already published the link.

Two decisions worth not re-litigating:

- **Only new links are refused.** A link published last week stays reachable
  when an administrator switches sharing off today. Revoking published content
  is a different decision with different consequences, a member who shared a
  document with a customer should not have it break because a setting changed.
  The policy copy, the settings panel, and the denial message all say so.
- **There is no "approved domains only" middle state**, and one must not be
  added as a checkbox. A public share link is anonymous; there is no recipient
  identity at fetch time to check a domain against, so the control would decide
  nothing. Domain scoping needs authenticated recipients first, which is a
  different feature.

## 2026-08-23 Model governance, where the check lives is the design

`organization_model_policies` (0139) with one evaluator,
`lib/services/model-policy-evaluator.ts`. Four properties are deliberate:

- **The check runs AFTER auto-routing resolves**, in
  `app/api/llm/v1/chat/completions/lib/request-processor.ts` at the line that
  assigns `chatRequest.model = routeDecision.modelKey`. Checking the REQUESTED
  model would let a blocked model be reached by asking for `auto` and having the
  router pick it, a bypass no amount of picker filtering closes. Do not move
  this check earlier.
- **An empty allowlist means unrestricted, not deny-all.** A row that arrives
  empty must not lock every member out of every model. Denial is something an
  administrator says, never something a blank field implies. Same rule 0076 set
  for the admin policy.
- **A named model outranks a blocked provider.** "No Provider X except this one
  model" is a policy enterprises write, and it cannot be expressed if the
  provider block swallows it. Precedence is specificity-ordered: model rules
  beat provider rules, deny beats allow within each level.
- **The gate acquires its own database handle inside try/catch**
  (`evaluateModelAccessForRequest`). Leaving `getNeonDb()` at the call site turns
  a missing connection string into a 500 on every chat turn, the identical
  mistake that shipped once in the managed-compute gate, and that broke 48 tests
  here before it was caught.

**MODELPOLICY-01, CLOSED 2026-08-23.** All five model-serving routes now ask
the evaluator on the RESOLVED model: chat completions (in the request
processor), embeddings, transcriptions, image generation, and video generation.
`lib/services/__tests__/model-policy-coverage.test.ts` reads the route sources
and fails if a new model-serving route ships without the gate, if the chat check
drifts back above the resolution line, or if a call site passes a
provider-facing `apiModelId` where the catalog id belongs. Do not add a route to
an exemption list there without writing the reason beside it.

**MODELPOLICY-02, CLOSED 2026-08-23.** Observed on a live chat turn: a real
POST naming a blocked catalog model returned 403 with
`"Your workspace administrator has blocked the model ..."` and code
`model_blocked`. The denial fires after model resolution and before any provider
call, which is why it needs no provider credentials to reproduce.

## 2026-08-23 Retention enforcement, the fail-closed rule is load-bearing

`sweepOrganizationRetention` (`apps/web/lib/services/retention-service.ts`)
deletes customer conversations. Three properties are deliberate and must not be
"simplified" away:

- **It fails closed.** If the legal-hold set cannot be read, it deletes nothing
  and records `aborted`. A missed sweep costs a day of retention drift and is
  corrected on the next run; a sweep that deletes records under legal hold
  destroys evidence, cannot be undone, and ends an enterprise relationship. The
  asymmetry is total, so every uncertain path declines to delete.
- **Opt-in, never inherited.** An organization with no policy row, or one that
  has not set `retention_enforced`, is skipped, the cron filters on the column
  AND the service re-checks rather than trusting its caller. Sweeping on the
  strength of the shipped 365-day default would delete data nobody chose to
  delete. `DEFAULT_ENTERPRISE_ADMIN_POLICY.retentionEnforced` is pinned false by
  a test in the contracts package for the same reason.
- **Retention runs from `updated_at`, not `created_at`.** An old conversation
  someone is still working in has not been dormant for the window; deleting it
  reads as data loss rather than as policy.

`legal_holds` and `organization_retention_sweeps` are SELECT-only for `app_rls`
(0138). A hold the held organization can delete is not a hold, and a sweep
record it can edit is not evidence. Writes go through the privileged connection
in a route that has already checked the owner/admin role.

**RETENTION-01, CLOSED 2026-08-23.** Observed against real rows on a seeded
Enterprise workspace: three conversations, two dormant past a 30-day window and
one touched today. The sweep deleted exactly the two, their messages went with
them through the FK cascade, the active one survived, a second sweep reported
`nothing_due`, and the evidence row recorded `deleted` with a count of 2. Under
an organization-wide hold it returns `held` and deletes nothing, then proceeds
once released. Harness kept at
`apps/web/db/neon/verify/retention-sweep-against-real-rows.ts.txt`.

## 2026-08-23 Branch audit: what the ahead/behind counters hide

Audited all 11 remote branches. Two counting methods both give wrong answers on
this repo, and the wrong answer is always "this branch still has unmerged work":

- **Commit ancestry** (`git rev-list origin/main..BRANCH`) is blind to squash
  merges. `security/2026-08-21-findings` read 70 ahead while its tree hash was
  byte-identical to main's (`a6c0e6ddc5ef...`), because PR #416 squashed 70
  commits into `2f6901e3b`.
- **Patch-id** (`git cherry`) is blind to them too, and for the same reason: a
  squash produces one commit whose patch-id matches none of its inputs.
  `fix/process-tree-reap-race` showed all 4 commits "not in main" while its
  merge commit `fc7184ceb` was a plain ancestor.

The authoritative tests, in order: compare tree hashes (`git rev-parse
BRANCH^{tree}`) for whole-branch equality, then check whether the PR's
`mergeCommit` is an ancestor of main. Do not delete or keep a branch on the
GitHub "Ahead" column alone.

Superseded-by-reimplementation is a third case ancestry cannot see at all. Two
branches were closed for it: the argon2 outage fix (`hotfix/argon2-web-only`)
was re-landed as `d4cc8e8e5` with a different mechanism, and the Team seat
reconciliation (`fix/team-seat-reconciliation`) exists in main as
`resolvePurchasedSeatsForOwner` at `app/api/stripe-webhook/lib/seats.ts` rather
than the branch's `lib/server/purchased-seats.ts`.

- **NATIVE-TRACING-GUARD-01, OPEN, deliberate non-adoption.** Main has NO guard
  against the class of failure that took 143 of 196 API routes to HTTP 500 on
  2026-08-07 (a native addon whose `.node` binary the Next tracer cannot infer).
  A good one exists on `hotfix/argon2-native-module-tracing`
  (`scripts/check-native-module-tracing.mjs`, 192 lines, five self-tests). It was
  NOT adopted, because it asserts that BOTH `serverExternalPackages` and
  `outputFileTracingIncludes` are required, and main satisfies only the second.
  yet production is healthy (`/api/me` returns 401, not 500, verified
  2026-08-23). Main's fix `d4cc8e8e5` ships EVERY prebuild via a glob, which
  removes the build-host/runtime arch mismatch that caused the outage without
  needing the package marked external. Adopting the guard therefore requires a
  decision, not a cleanup: either add `argon2` to `serverExternalPackages` (a
  config change to a healthy production app) or relax the guard to accept a
  traced-binaries-only configuration. Do not adopt it unchanged, it fails on
  main as committed.

## 2026-08-21 `apps/extension-vscode` test suite: vacuous tests

An audit of all 95 files under `apps/extension-vscode/src/__tests__` found 141
of 890 passing tests asserting on logic defined inside the test file, so they
cannot fail when production changes. Five files are entirely vacuous
(`codeLensProvider` 35, `workspaceIndexer` 30, `applyEdit` 8,
`codeActionProvider` 6, `hoverProvider` 4); six more are partly vacuous
(`extension` 20/32, `inlineCompletionProvider` 16/17, `security` 9/28, `api`
8/44, `trust-boundary` 7/20, `tierStatus` 2/4). Do not read the suite total as
coverage for those modules.

- **VSCODE-05/VSCODE-06, FIXED.** Both rewrote against production. VSCODE-06
  had asserted a `file_content` tag that exists nowhere in the repo; the real
  construct is `<untrusted_file_reference>` in
  `features/chat-participant/promptReferences.ts`, which owns the webview
  sanitizer layer.
- **`extractCompletionText`, FIXED.** The copy dropped production's
  `maxLength` truncation, leaving `agiWorkforce.inlineCompletions.maxLength`
  with no coverage. Tests now drive `AgiInlineCompletionProvider` itself.
- **`api.test.ts` `withRetry`, `trust-boundary.test.ts` endpoint validation.
  OPEN.** Both copies have drifted from production: the retry copy classifies
  on a `CLIENT:` message prefix that does not exist, and the endpoint copy
  allows a host production rejects while missing two it allows.
- **Remaining vacuous blocks, OPEN.** Before rewriting one, check the
  impersonated mechanism still exists; delete plus a small real test beats a
  faithful port of a fiction.

## 2026-08-20 Security scan of `apps/web/app/api`: remediation ledger

A Claude Security scan of `apps/web/app/api` (medium effort) was stopped by the
founder at roughly half coverage (50 of 103 researcher passes; no breadth sweep
or secrets pass; 9 panel votes). Its raw candidate list lives outside the repo
history in `CLAUDE-SECURITY-20260820-221140/UNVERIFIED-CANDIDATES.md`
(gitignored). Every candidate was then verified by direct code reading and
fixed the same day.

**The fixed entries have been deleted from this file on purpose (2026-08-22).**
They were closed, and leaving them here invited re-testing work that is already
done. `CHANGELOG.md` is the record of what was fixed. What remains below is only
what a future agent still has to think about: an accepted risk and a false
positive. `apps/web/app/api` counts as audited to the coverage stated above, do
not re-scan it hoping to rediscover the closed items.

- **WEB-QR-PAIRING-PHISHABLE-01, ACCEPTED RISK, mitigated in copy.** Inherent
  to QR sign-in designs; the approve page now tells the person exactly what
  approving does and to deny anything they did not start.
- **WEB-TEST-PROVIDER-PROBE-01, FALSE POSITIVE.** The probe is rate-limited,
  kill-switch gated, and spends the same server keys managed chat already does.

Threat-model assumptions the scan recorded without turning into findings were
triaged on 2026-08-20 as well:

- **Stripe webhook metadata trust, NOT A DEFECT.** `subscription.metadata`
  is written only by this server's checkout/top-up/upgrade routes, so once the
  signature verifies it is first-party data.
- **Cron `x-vercel-cron` header, NOT ACTIONABLE.** Not a documented
  authentication signal; the bearer secret plus the new per-client throttle is
  the control.
- **Owner-count invariant, NOT A DEFECT.** Transfer demotes only the
  requester and promotes the successor; the demotion guard's multi-owner
  allowance is compatible with that.

## 2026-08-12 Three rich-format card parsers are still unaudited for content loss

- **WEB-FORMAT-CARD-LOSSY-PARSE, CLOSED 2026-08-24.**
  `apps/web/features/chat/components/cards/` holds four heuristic parsers that
  turn assistant markdown into structured cards. `RecipeCard` was already fixed
  (see below) by the time this row was opened. As of 2026-08-24 the three
  siblings named below have each been audited line by line against the same
  bug class, every branch that reaches a `continue` was traced to confirm it
  either matches nothing worth keeping (an empty line, a table separator) or
  hands its text to `extraSections`/`descLines`/a typed field, and two of the
  three had a real, previously-undetected instance of it, now fixed the same
  way `RecipeCard` was.
- **One was provably lossy and is fixed (pre-existing).** `RecipeCard.parseRecipe`
  set `currentSection = 'other'` on the first unrecognised heading and nothing
  collected that branch, so a trailing "Notes" / "Tips" / "Variations" section
  vanished from the card. Now captured into `extraSections` and rendered.
- **`CalculationCard` had two real drops, now fixed.** `parseCalculation`'s
  `resultMatch` and inline-code-formula regexes are unanchored keyword
  matches: `.match()` returns only the substring from the keyword onward, so
  any prefix on the same line ("Grand total: $45" → "Grand ", or "The
  identity `a+b=c` explains it" → the prose around the backticks) matched
  nothing and was never appended anywhere. Both sites now route their
  unmatched prefix/remainder through a shared `routeLeftover` helper that
  files it into the description or an extra section, the same buckets every
  other unclassified line already used.
- **`ComparisonCard` had two real drops, now fixed.** The pros/cons and
  winner/verdict heading regexes matched on the keyword alone and discarded
  any trailing words on that heading line ("### Pros of running Postgres in
  production" kept only the section toggle, dropping "of running Postgres in
  production"; "## Winner: Postgres, better correctness guarantees overall"
  dropped everything after the keyword). Trailing text on a pros/cons heading
  now lands in an extra section keyed by the full heading; trailing text on a
  winner heading now seeds `winnerReason` (and infers `winner` from it) the
  same way a separate winner-reason line already did.
- **`StepsCard` is clean, audited, not modified.** Every `continue` in
  `parseSteps` is on an anchored, whole-line match (title, step header,
  generic `#{1,6}` heading, or the extra/preamble/detail catch-alls), so there
  is no keyword-in-the-middle regex that can strand a prefix the way
  `CalculationCard`'s did. `clampToSentence`'s truncation of the _displayed_
  preamble is a UI affordance, not a parse loss: the untruncated text is
  always in `parsed.description` and reachable via the paragraph's `title`
  attribute.
- **Verification.** `card-roundtrip.test.tsx` gained regression cases for both
  fixes plus unicode, deeply nested markdown, a missing-result calculation,
  and a 300-line trailing section, run via
  `pnpm --filter @agiworkforce/web exec vitest run features/chat/components/cards/`
  (44/44 passing, all four card files covered).
- **Why a residual parser gap would still be survivable.** `MessageFormatCard`
  is the only sanctioned way to render these: it shows the card by default and
  keeps the exact model markdown behind an "Original response" toggle. Do NOT
  render these cards in place of the prose without that wrapper, that is what
  would make an answer silently lossy.
- **Detection runs only on settled text.** `MessageBubble` computes
  `detectCardType` with `isStreaming` false, because the detector keys on
  structural thresholds (an `## Ingredients` heading, three `Step N:` markers)
  that a partial answer crosses at arbitrary moments, which would flip the
  layout mid-stream.

## 2026-08-12 Managed video generation: provisioned, pending a redeploy

- **The non-obvious second half.** Creating the bucket was not enough. The R2
  API token behind `CLOUDFLARE_R2_ACCESS_KEY_ID`/`_SECRET_ACCESS_KEY` was a
  USER token scoped to `agiworkforce-media` alone, and `getR2Client()`
  (`apps/web/lib/server/object-storage.ts`) builds ONE S3 client for both
  buckets, so a bucket-scoped token fails the private path even when the
  bucket exists. Had the env var been set without rotating the token, the
  composer would have advertised video, called and BILLED the provider, then
  died on the R2 upload. Set storage config and token scope together.
- **Not mintable from any CLI or agent.** Cloudflare excludes API-token
  creation from every OAuth grant: wrangler 4.122 has no `r2` token command
  (`wrangler auth` manages local login profiles only), and both the wrangler
  OAuth token and the official Cloudflare MCP grant return `403 9109` on
  `/accounts/{id}/tokens`, `/user/tokens`, and `.../permission_groups`. The one
  R2 credential endpoint, `POST /accounts/{id}/r2/temp-access-credentials`,
  cannot help: it derives from a `parentAccessKeyId` and so cannot exceed that
  parent's bucket scope, and caps at `ttlSeconds` 604800. Token creation is a
  dashboard action. Do not re-litigate this.
- **What was done.** Bucket `agiworkforce-media-private` created (WNAM,
  Standard, r2.dev public access disabled). A new ACCOUNT-owned R2 token with
  Object Read & Write over both buckets replaced the user token; verified by
  PUT/HEAD/GET/DELETE round-trip against BOTH buckets before any env change.
  `CLOUDFLARE_R2_ACCESS_KEY_ID`, `CLOUDFLARE_R2_SECRET_ACCESS_KEY` rotated and
  `CLOUDFLARE_R2_PRIVATE_BUCKET_NAME=agiworkforce-media-private` added to Vercel
  production. Note Vercel now marks newly-added vars SENSITIVE, so they pull
  back as `[SENSITIVE]` and cannot be round-trip verified from a local pull.
  The old user token `agiworkforce-media-rw` was intentionally left active; it
  can be revoked once a deploy confirms the new one is live.
- **Schema gate: already satisfied.** `isVideoJobStoreReady`'s full predicate
  passes on the Neon endpoint in `.env.local`
  (`ep-little-math-apu2yl8h...neondb`), `video_generation_jobs` plus all five
  functions, `workflow_run_id`, `provider_failure_code`, 7/7 job columns, 6/6
  `profiles` columns, 5/5 `credit_settlement_jobs` columns, `media_assets`.
  CAVEAT: production's `DATABASE_URL` is marked sensitive in Vercel and pulls
  as a placeholder, so that endpoint could not be cross-checked against the
  production value. Treat as strong evidence, not proof.
- **Not a Maps key, while we are here.** `GOOGLE_API_KEY` is a Generative
  Language key. Verified 2026-08-12 against the real value from `.env.local`:
  `generativelanguage.googleapis.com/v1beta/models` returns the Gemini catalog,
  while Maps Static, Geocoding, and Directions all reject it with
  `REQUEST_DENIED / API key is invalid`. The map-search card therefore renders
  from OpenStreetMap and needs no Google credential.
- **Remaining step.** Redeploy production, then confirm with a signed-in
  `GET /api/media/availability` that `video_storage_configured` and
  `video_schema_configured` are both true and video models report `enabled`.

## 2026-08-08 The desktop visual baseline is a different app state, and the threshold hides it

- **DESKTOP-VISUAL-BASELINE-WRONG-STATE, CLOSED 2026-08-17.** Both defects
  below are fixed. The baseline was regenerated from the real CI render
  (`e541e38bc`, 2026-08-08), and `apps/desktop/e2e/utils/visual-diff.ts`
  (`ff2c0811e`, 2026-08-17) now compares against dual thresholds.
  `maximumDiffPixelRatio = 0.005` and `maximumContentDiffPixelRatio = 0.1`.
  with a dedicated test, "The visual budget rejects a render that lost every
  element on the page" (`apps/desktop/e2e/visual-regression.spec.ts:78`),
  proving a wiped page fails the gate. The `visual-regression` project runs in
  `ci.yml`'s `desktop-e2e` job (not the separate, weekly-scheduled
  `e2e-tests.yml` "Desktop E2E Tests" workflow), green on `b67b01e9c` (job
  `97454547859`). Superseded text:

**Formerly: OPEN, blocks every CI run that touches desktop scope.**
`apps/desktop/e2e/visual-regression.spec.ts` failed at 3.13% against a 3.0%
ceiling. Downloading the Playwright artifact and opening the attached diff
showed the two images were not drifted renders of the same screen, they were
DIFFERENT APPLICATION STATES.

- Baseline: full marketing hero ("Beyond one model. Beyond one surface.",
  "Local stays local", "BYOK on Desktop + CLI", "Cloud on every surface")
  plus an in-app sign-in card with a "Sign in to AGI Cloud" button.
- Actual in CI: the fallback card, "In-app sign-in is not configured in this
  build, so AGI Desktop will sign you in through your browser instead." So the
  committed baseline was captured where in-app sign-in WAS configured (a
  developer machine), and CI, which renders the unconfigured fallback, never
  matched it.
- The second finding was the more serious one: a completely different page
  scored 3.13%. Most of the screen is background, so the pixel ratio barely
  moves for a total layout change, and a 3.0% ceiling could not catch a
  full-page regression. The gate read as protection and was not.

## 2026-08-08 Enterprise spend has no instrument, though the config is deliberate

- **BILLING-ENTERPRISE-NO-SPEND-INSTRUMENT, OPEN, observability gap not a
  config error.** Wave 5 reports this as "the one account type with no
  technical spend ceiling is also the one whose price the system does not
  know". The description is accurate; the implied defect is not. Checked the
  source: `managed-usage-policy.ts:100` documents `unlimited: true` as
  "DELIBERATELY uncapped, declared rather than inferred from a zero. Its spend
  governor is the contract, not this table", and
  `MANAGED_USAGE_UNCAPPED_LEDGER_ALLOCATION_CENTS = 100_000_000` is documented
  as "HEADROOM, NOT A PRICE OR A SPEND CEILING ... it exists only so the cents
  ledger has an account to debit against". `monthlyPriceUsd: 0` is correct for
  a contract-priced tier, there is no self-serve price to state.
- **What IS real.** The contract is named as the governor, and nothing measures
  against it. There is no per-account spend report, no threshold, no alert. So
  the true statement is not "enterprise is misconfigured" but "enterprise spend
  is unobserved", an operator cannot answer "is this account above its
  contract?" from anything the system produces.
- **Why the distinction matters for the fix.** Treating it as a config error
  invites capping a tier whose whole point is a negotiated ceiling, which would
  break paying customers. The correct work is an instrument: record contracted
  value per enterprise account and report actual ledger spend against it. That
  needs a place to put the contract value, which does not exist yet, a schema
  decision, not a constant change.
- **Precedent for checking before acting.** An earlier audit in this series
  reported the Team pricing panel as rendering empty; it was a reveal
  transition captured mid-frame. Audit artifacts in this repo have a real
  false-positive rate, and the headline framing is where it shows up.

## 2026-08-05 iOS App Store submission blockers (partly resolved; native billing approved 2026-08-11)

- **MOBILE-IOS-3-1-1-EXTERNAL-LINKS, IMPLEMENTED LOCALLY, external store setup
  remains.** On 2026-08-11 the founder explicitly approved native subscriptions
  and consumable usage top-ups on iOS and Android. The app now uses StoreKit 2 /
  Google Play Billing through `expo-iap`; the server verifies account-bound
  store transactions, grants each receipt idempotently, and consumes Apple
  Server Notifications V2 / authenticated Google Play RTDN for renewals,
  expiry, cancellation, refunds, and refund reversals. Products remain
  deployment-gated and the UI fails closed until exact App Store Connect / Play
  Console products, verification credentials, notification endpoints, and
  migration `0112_mobile_native_iap.sql` are configured. What remains are
  three external destinations reached through `openExternalUrl`:
  (1) `cloud-billing/index.tsx:316` "View invoices" →
  `agiworkforce.com/billing`, rendered only when `!isFreeTier` (free accounts
  get an inert "No invoices yet" row); (2) `PaywallBottomSheet.tsx:253`
  "Contact Sales" → `agiworkforce.com/contact-sales?plan=team|enterprise`;
  (3) `cloud-billing/index.tsx:292` "Workspace administration" →
  `agiworkforce.com/settings/team` for `team_admin` only. Note `FEATURES.billing`
  is `false`, which suppresses the "Manage billing" row but NOT the invoices row.
  Current mitigation for those account/enterprise links is disclosure: all three
  are declared to App Review in `apps/mobile/store-listing/REVIEWER-NOTES-IOS.md`
  and in `LISTING-METADATA-IOS.json` → `pricing.guideline_3_1_1_residual_risk`.
- **MOBILE-STORE-LISTING-DANGLING-REFS, RESOLVED 2026-08-27.** `906fe5cda` deleted
  `REVIEWER-NOTES-IOS.md`, `REVIEWER-NOTES-ANDROID.md`, and
  `FOUNDER-SUBMISSION-CHECKLIST.md` without updating the JSONs that point at
  them. `REVIEWER-NOTES-IOS.md` is re-authored and the
  `FOUNDER-SUBMISSION-CHECKLIST.md` reference is replaced by the tracked risk
  note above. The last dangling pointer,
  `LISTING-METADATA-ANDROID.json:118` → `play_console_review_notes_file`:
  `apps/mobile/store-listing/REVIEWER-NOTES-ANDROID.md`, is satisfied: the
  Android reviewer notes now exist at that path, so no listing JSON points at a
  missing file and `pnpm check:reference-integrity` is green. Only the pointer
  is closed here, the notes' contents were not read, so their accuracy against
  the shipping Android build is unaudited and a re-auditor should confirm those
  claims before submission.
- **MOBILE-STORE-LISTING-NATIVE-BILLING-COPY, OPEN, operator-blocked.** Both listing
  descriptions told the stores the app "opens agiworkforce.com in your browser to
  complete checkout", which the code stopped doing and which is a self-reported
  3.1.1 violation in the App Store description itself. Replaced with "There are
  no in-app purchases in this version." on both surfaces. That remains honest
  for the current unregistered build, but must be replaced with the exact native
  subscription/top-up disclosures and review instructions when the founder
  registers the products and enables `MOBILE_IAP_ENABLED`; do not flip listing
  booleans before the products exist. Also corrected the
  local-model size (catalog `fileSizeBytes` is 2 GiB, listings claimed ~2.4 GB)
  and dropped the Android release note advertising Health Connect, which has zero
  references left in `apps/mobile`.
- **MOBILE-IOS-SCREENSHOTS-INCOMPLETE, OPEN.** `store-listing/screenshots/captures`
  holds only `ios/iphone-17-pro/raw` (1206x2622, 6.3"), and one of the four frames
  is `99-verify-capture-wiring.png`. `scripts/screenshots/pipeline.ts` defines
  `iphone-17-pro-max` (1320x2868) and `ipad-pro-13` (2048x2732) device classes but
  neither has been captured, and `ios.supportsTablet` is `true` so iPad
  screenshots are mandatory. Run the pipeline before submitting.
- **MOBILE-STORE-LISTING-FOUNDER-PHONE, OPEN, founder-blocked.** Literal
  `__FOUNDER_TO_FILL__` remains at `LISTING-METADATA-IOS.json`
  `contact_information.phone` and `app_review_information.review_contact_phone`,
  and `LISTING-METADATA-ANDROID.json:83`. Only the founder has this value; do not
  invent one.

## 2026-08-05 workflow sandbox bundle fragility (unguarded)

- **`apps/web/lib/workflows/cloud-agent-workflow.ts` breaks `pnpm dev` if any
  non-step, module-level export transitively touches a Node module.** The
  Workflow SDK's flow bundle strips `"use step"` bodies and relies on swc
  eliding the then-unreferenced imports; a live (especially exported) non-step
  function keeps its import graph in the sandbox bundle and fails the build
  with `workflow-node-module-error` (10-error failure reproduced and fixed
  2026-08-05 by extracting `settleWorkflowInvocation` to
  `lib/workflows/steps/settle-workflow-invocation.ts`). Nothing in CI builds
  the flow bundle, so the failure only surfaces at `pnpm dev`/`next build`.
  Durable fix (open, no owner yet): a CI step that builds the flow bundle, or
  a lint rule forbidding non-step exports from workflow modules. Until then:
  Node-touching code called from steps belongs in `lib/workflows/steps/`.

## 2026-08-04 desktop V3 orphan inventory (kept, not defects)

Recorded while mounting AGI Code (`CodeWorkspace`) into `DesktopShellV3`. Both
items are deliberate carry-overs, not bugs, logged so the next sweep does not
re-report them as new findings.

- **Orphaned Dispatch/mode i18n keys, kept deliberately.** `sidebar.nav.dispatch`,
  `sidebar.nav.routines`, `sidebar.nav.liveArtifacts`, and the `sidebar.modes.*`
  group exist in all 12 locales of BOTH corpora but no component reads them; the
  only remaining references are mock translation maps in the V3 tests. There is
  no Dispatch subpanel and no unused-key gate in CI, so nothing fails. They are
  left in place rather than deleted: `sidebar.modes.code` is the source the new
  `sidebar.nav.code` translations were copied from, and removing keys is a
  separate reviewed change. Note the corpus split, `apps/desktop/src/i18n/locales/`
  is an UNLOADED legacy copy; the shell resolves through the shared
  `@agiworkforce/i18n` corpus at `packages/ui/i18n/locales/`, and
  `src/i18n/__tests__/v3CorpusCoverage.test.ts` is the guard against adding a key
  to only one of them.
- **Orphaned desktop components, open cleanup track, no owner yet.** A
  basename-reference scan of `apps/desktop/src/features` on 2026-08-04 (353
  non-test `.tsx` files) found 22 with no reference outside their own file,
  including all four survivors of `features/experimental/` (`DockingSystem`,
  `LovableMigrationWizard`, `MessagingPanel`, `ModelComparisonView`) and larger
  surfaces such as `calendar/CalendarWorkspace`, `filesystem/FilesystemWorkspace`,
  `vision/VisionWorkspace`, `research/DeepResearchPage`, and
  `marketplace/MarketplacePage`. The count is scope- and heuristic-dependent (a
  broader exploration pass over non-feature directories put it near 29, and
  basename grep cannot see path-only dynamic imports), so treat 22 as a verified
  floor for `features/` rather than an exact total. `features/experimental` is
  still excluded from `apps/desktop/tsconfig.json`, so none of those four are
  typechecked. Each needs the same mount-or-delete decision AGI Code just got;
  none is scheduled.
- **2026-08-15 addendum, same track, background-tasks is a live producer
  with zero consumers, do not delete.** `App.tsx:687-689` calls
  `initializeBackgroundTaskEventListeners()` (`stores/chat/agentStore.ts:571`)
  on every Tauri session start, continuously writing task events into
  `agentStore`. The only reader, `features/background-tasks/`
  (`BackgroundTasksPanel` / `BackgroundTaskIndicator`), is unmounted.
  re-exported from its own `index.tsx` but imported nowhere else. Deleting the
  UI half without deciding the producer half would leave dead writes with no
  UI, or silently drop task visibility the producer implies exists. Needs the
  same mount-or-delete call as the rest of this track; left alone for now.
- **2026-08-15 addendum, same track, two scheduler Tauri commands orphaned
  by the `useScheduler.ts` deletion.** Removing the legacy job-based scheduler
  UI (`SchedulerPanel.tsx`, `JobCreationDialog.tsx`, `hooks/useScheduler.ts`.
  zero importers outside `apps/desktop/archive/**`, which is excluded from
  build and tests via `vite.config.ts`) orphaned exactly two backend Tauri
  commands: `scheduler_get_job` and `scheduler_get_history`
  (`src-tauri/src/sys/commands/scheduler.rs`, registered in `lib.rs`). The
  other nine scheduler commands stay live via `schedulerStore`. The Rust
  commands were left in place, no Rust code was removed.

## 2026-08-04 WDIO nav-sweep + parity review findings (demo-week audit)

Found by the automated `wdio/specs/nav-click-sweep.spec.ts` click sweep and the
screenshot parity review against ChatGPT/Claude desktop references. The
headline crash (FileTree render loop → max-update-depth → error boundary on
opening the Code panel) is FIXED (`loadDirectory` reads `expandedPaths` through
a ref; regression test `src/features/code/__tests__/FileTree.loadLoop.test.tsx`,
mutation-checked). Suspense `fallback={null}` blank-void panels are FIXED
(shared `panelFallback` spinner in `DesktopShellV3`). Remaining, recorded:

## 2026-08-04 desktop product-bug sweep (pre-release hunt)

Systematic hunt across three bug classes, driven by the memory-store discovery
below. Every entry here was verified on BOTH sides (schema+writer, or
frontend+Rust) before fixing. These were shipping in 1.2.0.

### IPC argument-name / shape mismatches (frontend invoke ≠ Rust command)

The build-time `ipc-check` validates command NAMES but not ARG names, so these
slipped through. Tauri maps a JS arg `fooBar`→Rust `foo_bar`; a mismatch means
the Rust param is never populated and the (often required, non-Option) command
rejects the call. Several were compounded by a swallowing `.catch()` that made
the failure read as success.

### settings_v2 category CHECK mismatch (same class as user_memory below)

### More main-database managers opened with the wrong key (see below for the pattern)

## 2026-08-04 desktop main-database managers opened the encrypted DB unkeyed

Found while driving the real desktop binary through the WDIO native harness
(the full UI/UX test campaign). The main SQLite database is SQLCipher-encrypted
and keyed exclusively through `MainDatabaseAccess` (OS keychain, or the
`*.wdio` bundle's `AGI_DESKTOP_WDIO_DATABASE_KEY` harness key). Several managers
that live INSIDE that same database opened it with the wrong key (or none), so
the file opened but every query failed with SQLCipher's "file is not a
database". Because construction succeeded, the app never fell back to its
degraded state, the feature just failed at every call.

- **Same-class risk, NOT yet changed (only reachable from the 93
  `registeredWithoutReachableCaller` commands in `wiring-allowlist.json`, so no
  user path hits them today):** `core/agi/memory_manager.rs`
  `with_decay_config`/`with_semantic_config`, `core/agent/background_agent.rs`,
  `core/agent/continuous_executor.rs`, `core/agi/outcome_tracker.rs`. If any of
  these is ever wired to a UI surface it must open through `MainDatabaseAccess`,
  not `Connection::open`. `core/embeddings/*` use a separate embeddings DB and
  are out of scope.

## 2026-08-02 developer-surface cloud-loop checkpoint

The source and local-host audit was tracked in the 2026-08-02 developer-surfaces
cloud-loop closure plan (retired 2026-08-08; see git history). This
checkpoint supersedes older claims that the VS Code/CLI protocol was v4 or v5,
that Desktop Managed Cloud was still an unwired "coming soon" shell, or that
the Chrome owner/cancellation pass was still pending.

- **Resolved locally, Chrome account and computer-use ownership:** managed
  history, streams, active pointers, and computer-use runs now belong to the
  exact `{accountId, authIncarnation}` plus tab/window/URL intent that started
  them. Stop, Clear, sign-out, account change, panel teardown, target drift, and
  supersession abort the tracked run and suppress stale broadcasts. The final
  local proof is 100 files / 1,425 tests plus typecheck, lint, production build,
  no-cloud-IPC/no-hex guards, malicious-archive regressions, and an exact-package
  Chromium owner/Stop smoke. The verified CI-fixture ZIP has 267 entries, is
  1,262,049 bytes, and has SHA-256
  `5ffbc4905a4573ed9e38d8a20a0304b72d7c3960d821e41bcaf17eb9382e5494`.
  It was safely extracted and loaded by Chromium, but is deliberately
  non-routable and is not a signed/installed production-store artifact.
  Live Clerk A-to-B, paid gateway, and packaged native-message HMAC remain
  external release gates.
- **Resolved locally, `VSCODE-NATIVE-LOCAL-MODEL-AUTHORITY-01`,
  protocol/authority/cancellation, and package hygiene:** protocol v7 remains
  CLI-owned; native `@agi` resume metadata carries one exact
  thread/model/provider/trust/workspace tuple; catalog-backed and `auto`
  selections resolve without discovery, while unknown local IDs must exactly
  match CLI discovery or fail closed; the resolved local provider is passed to
  `startThread`; and start/resume revalidate model, provider, and trust
  authority. Deferred approvals and deferred app-server admission cannot
  escape Stop/New Chat, and the VSIX excludes test output. The focused
  participant/model-picker regressions pass 39/39, the full unit suite passes
  840/840, and the webview suite passes 63/63. The final inspected VSIX has 17
  entries, is 382,906 bytes, and has SHA-256
  `9a97cee1eded5292f387d2f1aad2cd30b1b15d5a9408a45b0b5038e4d432b054`.
  VS Code 1.131 installed the exact artifact in an isolated profile; extension
  listing and archive-to-installed byte verification passed. No completed
  installed `@agi` request/stream/approval/Stop/resume success is claimed.
  **`VSCODE-CHAT-REQUIRES-CLI-BINARY` remains open:** no
  independently signed public v7 CLI prerequisite, Marketplace release, clean
  update/rollback, or uninstall path is proven.
- **Resolved locally, `VSCODE-PACKAGED-TEST-RUNNER-MAPPING-01`:** the first
  actual-install harness left its compiled tests outside the disposable runner
  extension, which made VS Code report an unmapped `require('vscode')` and
  stall. The runner now copies only the compiled fixture/loader/smoke files
  under its own extension root; a focused copy/mapping regression passes and
  the warning is absent on the next host launch. The locked macOS session still
  prevented that launch from reaching the selected tests; the loopback fixture
  recorded zero model/chat requests, so no native-turn result is claimed.
- **Resolved locally, CLI trust and process-tree cancellation:** headless
  app-server entry uses the project trust gate, first-run/global configuration
  cannot imply repository consent, and active-turn subprocesses use one
  cancellation-aware process-tree supervisor. Full CLI tests pass (library:
  1,795 passed, 1 ignored). Windows `taskkill /T /F` remains unverified on this
  macOS host; Unix descendants that deliberately call `setsid` and partial
  filesystem mutations from interrupted git/worktree operations remain known
  limitations.
- **Resolved locally, `CLI-LMSTUDIO-ENDPOINT-AUTHORITY-01`:** local model
  discovery, availability, and streaming now share one normalized configured
  base instead of allowing a non-default LM Studio endpoint to diverge at turn
  time. The shared chat-completions URL builder is reused and Ollama follows the
  same normalization. One random-port regression proves `GET /v1/models` and
  `POST /v1/chat/completions` reach the configured host; two focused URL
  normalization/safety tests also pass. This is deterministic endpoint-authority
  proof, not a claim that a real LM Studio installation or live provider matrix
  has passed.
- **Resolved locally, CLI artifact identity and channel independence:** typed
  app-server initialize reports the owning CLI version (`1.7.1`) while VS Code
  remains pinned to exact protocol v7. The final local
  `aarch64-apple-darwin` two-binary archive is 10,558,220 bytes with SHA-256
  `c7365dabf23c6a7ab11601219e655ab31ee6a7c05d0f46b1810cb4fc1a2e6b71`.
  Extracted `agi` is 9,321,584 bytes with SHA-256
  `6d9e5c3307e3f4ba2bf9a3906cc053e9e365a09cd1d2958c585fdbd773966adb`;
  the 9,321,600-byte compatibility alias has SHA-256
  `66b32e9b6c3b206373d65d6e01a9e196114ba4f262f8b87dd66b63dc2a767a88`.
  Both arm64 binaries report `agi 1.7.1` and passed the isolated no-credential
  archive smoke. They are ad-hoc/linker signed, have no Team Identifier, and
  are rejected by `spctl`, so this is not signed-release evidence. Npm
  credentials remain isolated from the GitHub archive channel. **Open:** no
  current public signed v7 release is installable; hosted installer/npm
  availability, corrected Homebrew hashes, clean macOS/Linux/Windows
  installation, and upgrade/rollback/uninstall remain unproven.
- **`CLI-SLASH-BEHAVIOR-PARITY-01` (partially resolved 2026-08-05):** `/worktree`
  (git-worktree list/create/remove), `/subagents` (configured subagents with
  model/tools/when-to-use), `/task list` (spawned-subagent task state),
  `/approve` (alias to the approvals/`PermissionStore` surface), `/raw` (raw and
  `--output-format json` rendering of the last response), and `/mcp` mutations
  are now implemented and tested. **Still open:** benchmark-incomplete `/ide`,
  `/plugins`, `/hooks`, `/goal`, `/feedback`, and partial `/permissions`,
  `/vim`, `/reasoning`. Product-lock exclusions remain `/apps` and `/cloud`; do
  not add competitor-branded aliases.
- **Resolved locally, Desktop Managed Cloud ownership and Stop semantics:**
  managed requests, nested work, grants, attachments, folder picks, voice, and
  native computer use are bound to exact account/session generations. Native
  OPA has a single active owner, handles Stop-before-register, awaits shutdown,
  rejects recently completed UUID replay, and the renderer retains authority
  until an exact `true` acknowledgement. Same-account reauthentication rotates
  composer and folder ownership. Local proof includes 2,346 Desktop tests
  passed with 1 skipped, 857 unified-chat tests, 11 focused native cancellation
  tests, typecheck/lint, `cargo check`, a custom-protocol Tauri build, and 2
  native WDIO Cloud entry/chat spec files / 6 tests.
- **Resolved locally, Desktop WDIO host and native-manifest isolation:** the
  harness now waits through the initial `about:blank`, verifies the Tauri asset
  protocol and invoke bridge, selects the real native webview, and passes its
  entry/chat specs. The first successful pre-guard run also exposed that the
  WDIO bundle could rewrite Chrome and Edge's user-global native-messaging
  manifests with a debug-host path. A `wdio` bundle identifier now skips the
  installer before it is called while production identifiers retain normal
  installation. Focused Rust tests pass, and a guarded 6-test rerun left both
  manifest SHA-256 values and mtimes unchanged. Their earlier pre-audit bytes
  were unknowable, so the current files were preserved rather than guessed.
- **Open external/native gates:** a supervised deployed-backend matrix still
  owes real A-to-B account changes, entitlements/quota failures, provider turns,
  microphone/signaling/upload, and Stop during an OS action already in flight.
  Signed/notarized installers, the installed Chrome native host, and Windows
  process-tree behavior are not proven locally. The repaired native WDIO loop
  uses mocked Cloud identity/data and therefore does not satisfy these live
  release gates.
- **Open provenance/parity gate:** the retired reference index (removed
  2026-08-08) pointed at an absent `/Users/siddhartha/Desktop/reference` corpus. The live
  `chatgpt_reference` and `claude_reference` images named by the closure plan are
  now checksummed. The separate dated clean-room bundle at
  `/Users/siddhartha/Desktop/reference-for-apps` is pinned as a requirements
  input, not implementation/release proof; its 1,544 relevant trace rows still
  need AGI dispositions. The separate 20-subcommand and 34-slash benchmark
  tables are now source-traced; that does not disposition the 1,544 feature
  rows. The bundle is a flattened export with broken internal paths,
  inconsistent source/count mappings, no archived source bodies, and no
  license/origin manifest. AGI-owned exact-artifact captures remain incomplete.

## 2026-08-01 verification-battery findings

Found by the full battery recorded in the 2026-08-01 remediation handoff
(retired 2026-08-08; see git history). All four are
pre-existing on `main` unless noted.

- **`DOCS-RESTRUCTURE-PLAN-DELETED-DANGLING-CITATIONS-01` (open):**
  `906fe5cda` deleted `docs/plans/monorepo-restructure-2026-07-08.md` (and
  `docs/plans/rust-engine-extraction-2026-07-09.md`) while `PLAN.md:6`,
  `PLAN.md` ("Active Workstream" wave reference),
  `docs/architecture/overview.md:9`, and a CHANGELOG entry still cite
  them, the active restructure currently has no readable detailed plan
  document. No guardrail catches dangling doc citations.
- **`REPO-CODEOWNERS-TODOMD-GHOST-ENTRY-01` (open, coupled pair):** root
  `TODO.md` no longer exists, but `.github/CODEOWNERS:12` still carries a
  `/TODO.md` entry and `scripts/check-codeowners-contract.mjs:37` still
  REQUIRES it. `check:codeowners` passes only while both halves stay in sync;
  removing either alone turns the guardrail red. Drop the entry from both in
  one change, or restore neither.

## 2026-08-01 desktop IPC deadlock (isolation pattern vs CSP)

- **`DESKTOP-ISOLATION-DEVURL-IPC-DEADLOCK-01` (resolved 2026-08-17, developer
  loop):** the same deadlock hit `pnpm dev` and any build without
  `--features tauri/custom-protocol`, because the frontend is served from
  `http://127.0.0.1:5173` and WKWebView does not deliver the isolation frame's
  `postMessage` (origin `null`) to an http parent. Control measurement: the
  identical frame delivered `__TAURI_ISOLATION_READY__` with a
  `tauri://localhost` parent and delivered nothing from the Vite origin.
  Decision taken: the isolation pattern is release-only. `apps/desktop`'s `dev`
  script now merges `src-tauri/tauri.dev.conf.json`, which patches
  `app.security.pattern` to `brownfield` (with `"options": null`, because the
  CLI merges by JSON Merge Patch and a leftover `options` map fails with
  `invalid type: map, expected unit variant PatternKind::Brownfield`).
  `tauri.conf.json` still ships isolation, so packaged builds and
  `pnpm run test:e2e` are unchanged, and the dev/prod difference is captured in
  this entry. Guarded by
  `apps/desktop/src/__tests__/tauriDevIsolation.test.ts`.
  `apps/desktop/wdio.conf.ts` still hard-fails unless
  `location.protocol === 'tauri:'` so the harness cannot silently mask a
  non-custom-protocol build.
- **`DESKTOP-NATIVE-E2E-NEVER-RAN-01` (resolved as a capability, findings
  open):** no desktop e2e had ever driven the real binary, the Playwright
  suites drive the Vite dev server in a plain browser, and the wdio suite hung
  at startup on a macOS Keychain prompt (fixed by the `*.wdio`-only
  `AGI_DESKTOP_WDIO_DATABASE_KEY` seam) and then on the deadlock above. The
  first honest native run executed all 32 spec files: 3 passed, 29 failed with
  real assertion errors. Notable product findings from it, each still open:
  raw i18n keys rendering as visible UI text (`sidebar.noConversations`,
  `sidebar.showArchived`); cold start exceeding the harness's own
  `SHELL_STARTUP_BUDGET_MS = 30_000` before this fix; the project-memory store
  failing to open under a non-default database key ("file is not a database")
  while the main DB opens fine; and onboarding being one-shot per profile, so
  at most one onboarding-dependent spec can pass per run.
  **Automation gap (confirmed 2026-08-21, still open):** the fix above restores
  the harness's ability to run, but nothing invokes it, `pnpm run test:e2e`,
  `test:e2e:build`, and `test:e2e:only` are absent from every `.github/workflows/*.yml`
  file (verified by grep across all of `.github/`, including the one
  `workflow_dispatch`-enabled e2e workflow). The "first honest native run"
  above was a one-off manual/local invocation, not a recurring CI job; no
  schedule or PR gate repeats it, so the 29 failing specs and any regression
  in the 3 passing ones can silently drift indefinitely.

## 2026-08-01 mobile parity P0 wave

Follow-ups and supersessions from the parity remediation (backlog:
`~/Desktop/mobile-parity-backlog-2026-08-01.md`; P0 slices landed as the
`feat(mobile)`/`fix(mobile)` commits of 2026-08-01).

- **Supersedes `MOBILE-VOICE-CLOUD-TTS-DISABLED`:** the disabled Cloud TTS
  provider option that entry relabeled no longer exists, PAR-M20 removed the
  option, the dead `provider === 'cloud'` branch, and the provider card
  entirely; the engine renders as a caption on the Voice row. The
  `TTSProvider` union in `stores/settingsStore.ts` still includes `'cloud'`
  and persists `ttsProvider` with no remaining runtime reader, inert state; a
  store/contract narrowing is a separate change.
- **`MOBILE-CONTENT-REPORT-NO-INTAKE-ENDPOINT-01` (PARTLY RESOLVED 2026-08-27):**
  the two factual claims this entry rested on, "mobile has no moderation intake
  endpoint" and "no report/moderation/abuse route exists under
  `apps/web/app/api`", are both false now.
  `apps/web/app/api/mobile/content-report/route.ts` is the intake:
  CSRF-checked, rate-limited under the
  `mobile-content-report` bucket, Zod-validated over
  `{reportId, messageId, conversationId, category, contentExcerpt, userNote}`
  with the six-value category enum, inserting into `public.content_reports`
  (`db/neon/0093_content_reports.sql`, triaged by `0124_content_report_triage.sql`)
  `on conflict (client_report_id) do nothing`. The client posts from
  `apps/mobile/services/contentReport.ts:141` (`submitReportToServer`) inside
  `saveContentReport`, which is reached from the UI via
  `src/features/chat/components/ReportFlagButton.tsx:104` rendered by
  `MessageBubble.tsx:920`. So the owed Cloud-mode-only intake exists and a
  signed-in Cloud-mode report does reach the trust-and-safety table.
  Two of the owed pieces are still missing, which is why this is not a full
  close:
  - **Only a signed-in Cloud-mode reporter can file.** Do not read the nullable
    `user_id` column as "anonymous reporting works", the route's own header
    comment says it does, and the code refuses it twice over.
    `route.ts:40` runs `requireCsrfToken` before `auth()` at `:53`, and
    `apps/web/lib/csrf.ts:271` only short-circuits on a _valid_
    `Authorization: Bearer` header; otherwise it needs an `x-csrf-token`
    verified against a session id that, with no `__Host-anon-session-id`
    cookie, is a freshly minted `anon-<uuid>` (`lib/csrf.ts:157`), always a
    403 `CSRF_VALIDATION_FAILED`. The mobile client sends no CSRF header and
    keeps no cookie jar: `apps/mobile/services/api.ts:216-218` sets only
    `Content-Type`, `X-Requested-With`, and `getAuthHeaders()`, which is
    Bearer-or-nothing (`apps/mobile/services/authSession.ts:30-33`), and no
    file under `apps/mobile` references CSRF at all. In Local mode the request
    never leaves the phone regardless: the egress guard throws
    `EgressBlockedError` for our-cloud hosts
    (`apps/mobile/lib/egressGuard.ts:10-23`), which is the intended trust
    boundary and is stated in `contentReport.ts:15-18`. A signed-out or
    Local-mode report is therefore an on-device record plus, at best, the
    mailto hand-off. `app/api/mobile/content-report/__tests__/route.test.ts`
    does not contradict this and must not be cited as if it did: `:13` mocks
    `requireCsrfToken` to resolve `null`, so its `:88`
    "accepts an anonymous report with a null `user_id`" case asserts the
    insert shape, not reachability, and no test covers a request carrying
    neither a bearer token nor a CSRF token.
  - **There is still no flush queue.** `submitReportToServer` swallows every
    failure and `saveContentReport` degrades to `delivery: 'stored-on-device'`
    / `'email-unavailable'`, so a report that fails to POST keeps its MMKV
    copy but is never retried. The persisted `serverAcknowledged` flag already
    exists (`contentReport.ts:51`, set at `:189-190`, written back to MMKV by
    `markServerAcknowledged` at `:213-221`), so the remaining work is a sweep
    over records with `serverAcknowledged === false` on foreground /
    connectivity regain, not a new field.
- **`MOBILE-RGBA-LITERALS-SWEEP-01` (open, tracked exemptions):** the new
  ESLint `no-restricted-syntax` rule banning literal white/black rgba under
  `apps/mobile/src/features/**` carries a `FIXME: PAR-M13-SWEEP` ignore list
  of 10 pre-existing violator files (sidebar ConversationItem/List/TagFilter,
  edge-cases modals, AddCustomConnectorModal, QuickSchedule, ToolTimeline,
  companion ExecutionStream/CompanionDemoWalkthrough/AgentDashboard). Each has
  an obvious token target (`colors.scrim`/`neutralSurface`/`borderLight`).
  `src/features/voice/**` is a permanent, intentional exemption (self-painted
  scrim identical in both themes).

## 2026-07-30 workspace-index boundary update

- **Partially supersedes `DESKTOP-WORKSPACE-INDEXING-UNWIRED-01`:** the orphaned
  `workspace_*` regex symbol/dependency scanner, its duplicate renderer
  clients, and its browser mocks were removed as one vertical slice. It had no
  runtime caller and did not provide parser- or LSP-backed definitions,
  references, or resolved dependencies. Reachable grep/glob search and the
  editor LSP path remain. The separate semantic-embedding index remains open
  and is not authorized to send Local workspace content to a remote provider.

## 2026-07-25 demo-readiness remediation checkpoint

This checkpoint supersedes older rows where the implementation named below has
changed. It does not close the explicitly retained external or architectural
blockers.

- **Supersedes `WEB-CONNECTOR-FLOW-DEADENDS-01`:** GitHub installation ownership
  is no longer inferred from a setup callback alone. The flow is now
  installation → user OAuth → authenticated `/user/installations` ownership
  proof; only rows with `ownership_verified_at` can supply tools. Cookies are
  replay-safe, OAuth access tokens are not stored, conflicting ownership fails
  closed, and legacy unverified rows stay inert. Migration `0072` adds the
  nullable verification marker without backfilling trust. Production still
  requires that migration, the full GitHub App/OAuth environment, configured
  setup/callback URLs, and a supervised real GitHub round-trip.
- **Desktop Cloud implementation is no longer dead code:** the Tauri composition
  root selects `CloudRuntime` for an authenticated Cloud workspace and keeps
  Local/BYOK on `TauriRuntime`. Cloud chat now covers Web-compatible
  conversation/message persistence, streaming tool activity, generated files,
  persisted generated images, model routing, approvals, and the supported
  settings/connector seams. Native UI and automated runtime coverage are green;
  a live authenticated Tauri turn remains an external release check because the
  isolated desktop test app cannot inherit the browser's Clerk session.
- **Still open, enterprise identity/tenancy:** the Team page now manages one
  real owner-scoped workspace over existing AGI accounts with owner/member
  roles and last-owner protection. This is not SSO, SCIM, tenant-wide RLS,
  invitation delivery, licensed-seat enforcement, or multi-organization
  tenancy. Those capabilities remain blocked on an IdP/provider decision,
  existing-data backfill, and a tenant-isolation design; marketing claims are
  not evidence that they work.
  - **Partially superseded for SSO (2026-08-04).** Enterprise SSO is now
    implemented end to end against Clerk enterprise connections: entitlement
    gate (`enterprise_controls`), DNS TXT domain verification, provisioning,
    certificate/metadata rotation, activation mirrored from the provider,
    teardown, admin UI, and docs (SSO doc retired 2026-08-08, migration
    `0083_sso_connections_clerk_link.sql`). SCIM, tenant-wide RLS, invitation
    delivery, licensed seats, and multi-organization tenancy are unchanged by
    this and remain open.
- **BLOCKER, enterprise SSO is unverified against a live Clerk instance
  (2026-08-04):** Clerk enterprise connections require a paid Clerk plan with
  the **Enhanced Authentication** add-on. The repo proves the SDK surface
  exists (`@clerk/backend` 3.4.13 `enterpriseConnections`, full SAML + OIDC
  parameter sets returning `acsUrl`/`spEntityId`/`spMetadataUrl`) but cannot
  prove this deployment's instance is entitled, and no connection has ever been
  created against the real instance. `CLERK_SECRET_KEY` is read ad hoc with no
  env schema. The code degrades honestly, `503 missing_credentials` when the
  key is absent, `503 not_entitled` when Clerk answers 402/403, so there is no
  silent failure, but **the marketing claim "SAML 2.0 and OIDC. Okta, Azure AD,
  Google Workspace" must not be described as verified in production until a
  live connection has been created**. Founder action required: confirm the
  Clerk plan.
- **Design constraint, SSO connections are instance-level (2026-08-04):** this
  deployment does not use Clerk Organizations (tenancy is the app's own
  `organizations`/`organization_members` tables), so enterprise connections are
  created instance-level and route every sign-in on a matching email domain.
  DNS TXT domain verification is therefore a hard security precondition, not a
  formality, and is enforced in the route, in the activation path, and by a
  database check constraint. Adopting Clerk Organizations would let connections
  be scoped by `organizationId` and is the durable fix.

2026-07-21 Chrome extension (apps/extension) DEEP re-audit (4 scoped agents over
the 303KB side_panel.ts / 112KB background.ts / 75KB content.ts that the earlier
"VERIFIED-CLEAN" pass at line ~675 could not read whole). Baseline green
(typecheck, 1109 tests, production build). The deep read surfaced two HIGH
side-panel defects the prior pass missed, both fixed with live-module regression
tests (full suite 71 files / 1117 tests). This SUPERSEDES the unqualified
"VERIFIED-CLEAN" note below for the side-panel surface; options/content/egress
re-audit in progress.

- FIXED EXT-AGENTIC-REPLY-NEVER-RENDERS (HIGH, 2026-07-21, uncommitted): for a
  Managed-Cloud agentic (tool-using) run, the assistant message is created from a
  tool/agent event with empty content + `streaming:true`
  (features/side-panel/chat-state.ts applyCanonicalAgentEvent), and
  `buildBubbleWithTools` (side_panel.ts:3303) only built the `sp-bubble-<id>`
  element `if (textParts.join('').trim())`, so no bubble existed. The answer then
  streamed via the delta else-branch (side_panel.ts:7859) into
  `updateStreamingBubble`, which starts `getElementById(sp-bubble-<id>); if
(!bubble) return;`, a SILENT no-op. The model's reply accumulated in
  msg.content but never painted; the user saw the activity timeline and no answer
  (plain no-tool chats create the message from the first text chunk so a bubble
  exists, which is why casual testing missed it). Root-cause fix: the bubble gate
  is now `shouldRenderTextBubble({text, streaming})` (new pure export in
  chat-state.ts), a streaming message builds its bubble up-front even with
  momentarily-empty text, so the in-place updater always has a target and no
  mid-stream rebuild is needed. Regression: 3 tests in side-panel-chat-state.test.ts
  against the live helper.
- FIXED EXT-PROMPT-SHORTCUT-FAKE-SUCCESS (HIGH, 2026-07-21, uncommitted): a
  shortcut created from the "+ Create shortcut" prompt modal is stored with
  `actions: []` + a `prompt`, but `handleReplayShortcut` (background.ts) forwarded
  only `RUN_PAGE_ACTIONS` with `shortcut.actions`, zero actions ran,
  `result.success` was true, and it showed `showNotification('Shortcut Replayed',
'"…" completed')`. Clicking ▶ Play on a prompt shortcut did nothing on the page
  or in chat yet reported success (fake success on a primary Workflows control);
  `shortcut.prompt`/`startUrl` had no replay consumer. Fix: extracted
  `planShortcutReplay(shortcut)` (pure export in features/background/shortcuts.ts)
  → actions | prompt | empty; the prompt branch runs the saved prompt through the
  chat path (same route executeScheduledTask uses for prompt tasks, capped at the
  shared TASK_PROMPT_MAX_CHARS), the empty branch returns an honest error instead
  of a success notification. Regression: 5 tests in shortcut-replay-plan.test.ts
  against the live decision helper.
- FIXED EXT-CU-USAGE-METER-FAKE-DATA (MED, 2026-07-21, uncommitted): the
  Computer-Use panel usage meter rendered a hardcoded "Steps: 0/20" / 0% bar and
  never moved during a run (features/side-panel/computerUsePanel.ts:591). The
  agent loop already emits usage (agentLoop.ts:444 onUsageUpdate with stepsUsed,
  maxSteps, totalTokens) and the panel already exposes updateUsageMeter, but the
  background runAgentLoop call omitted the onUsageUpdate callback, so live counts
  were never broadcast, the widget presented a placeholder as live data.
  Completed the wiring (not hidden): the background now broadcasts AGI_CU_USAGE
  and the side-panel listener feeds cuPanel.updateUsageMeter (shape-guarded
  against NaN). Initial "0/20" is an honest empty state (0 steps taken; 20 is the
  real default maxSteps). Regression: 2 source-level wiring assertions in
  computer-use-usage-meter.test.ts (established static-invariant pattern for
  cross-context message wiring).
- FIXED EXT-ONBOARDING-NONPRODUCT-DOMAIN (MED, 2026-07-21, uncommitted): the
  onboarding step-0 "Learn more" (prompt-injection safety) opened
  https://agi.build/safety, a non-product domain shown to every new user at the
  exact moment the UI warns about malicious sites; every other product link uses
  agiworkforce.com. Repointed to the real https://agiworkforce.com/security page
  (verified route apps/web/app/security). The other agi.build link
  (agi.build/download at side_panel.ts ~6447) sits inside the dead
  #sp-offline-onboarding block (see tracked residual below) and is never
  clickable, so it is not user-facing.
- FIXED EXT-OPTIONS-CSP-INLINE-STYLE (MED, 2026-07-21, uncommitted, caught by
  the new real-UI smoke): the options-page element helper el() (options.ts:426)
  applied EVERY attribute via setAttribute, including style, so callers passing
  `{ style: 'padding-top:4px' }` (opt-row-hint) / `{ style: 'margin-left:4px' }`
  (danger button) set a style ATTRIBUTE, which the extension CSP `style-src
'self'` (no unsafe-inline) BLOCKS, so the declaration silently never applied
  AND a "CSP directive violated" console error fired on every options render. All
  1119 jsdom unit tests missed it (jsdom does not enforce CSP). Root fix: el()
  now routes style through the CSSOM per-declaration `node.style.setProperty`,
  which CSP does not gate. Empirically settled which technique is safe via a
  per-technique probe in real Chromium: only setAttribute('style') emits a CSP
  error; style.cssText and style.setProperty both emit ZERO. (side_panel.ts's
  own el() already used style.cssText and was therefore safe, no change needed;
  createElementWith has no style callers.) Guarded by e2e/smoke.mjs failing on
  any CSP violation.
- ADDED EXT-REALUI-SMOKE-HARNESS (2026-07-21): the extension had unit/jsdom
  coverage (1119 tests) but no test through the REAL browser UI. Added
  `apps/extension/e2e/smoke.mjs` + `pnpm --filter @agiworkforce/extension
test:e2e` (build + smoke): Playwright launches Chromium with
  --load-extension=dist, waits for the MV3 service worker, opens the side panel
  and options pages at their chrome-extension:// URLs, asserts primary UI markers
  render (sp-messages/sp-composer/sp-input/sp-send; opt-\*), and FAILS on uncaught
  page exceptions or CSP violations (tolerates expected bridge/gateway network
  noise). Playwright + full Chromium were already installed for the web app, so
  no new dependency. This harness is what surfaced EXT-OPTIONS-CSP-INLINE-STYLE.
  Now covers, deterministically across repeated runs: render + no page-exception
  - no-CSP on both pages; side-panel interactions (composer input, drawer
    navigation via the menu button, model-picker open, seeds
    agi_onboarding_completed so the main UI is driven); and a persistence workflow
    (seed agi_site_allowlist, reload, assert refreshAllowlist renders it). Not yet
    CI-wired (needs the full `chromium` channel, not headless-shell); run locally
    as the extension's real-UI check.
- FIXED EXT-CONTENT-SCRIPT-BROKEN-BY-CODE-SPLIT (CRITICAL, 2026-07-21, surfaced
  by the real-UI smoke; initially MIS-diagnosed as a harness limitation, then
  confirmed a real product bug). The built content script (dist/src/content.js)
  began with `import ... from "../assets/filler-*.js"` (also policy/tokens/icons):
  vite.config.ts fed 4 shared entries (background/content/side*panel/options) to one
  Rollup build, which code-splits shared modules into assets/*.js chunks and leaves
  `import` statements in each entry. The manifest declared the content script
  `type:module`, but a page-world content script cannot import non-web-accessible
  chunks (assets/\_ were NOT in web_accessible_resources), so the script fails at
  runtime, the real Chromium load errored `Uncaught SyntaxError: Cannot use import
statement outside a module` and `initialize()` (which registers
  chrome.runtime.onMessage at content.ts:154) never ran. Net effect: EVERY
  content-script feature, job autofill, page-context capture, the in-page panel,
  action recording, NLWeb detection, was DEAD on every page in production. All 1119
  jsdom unit tests missed it because they never load the built module in a browser;
  the well-known Vite-extension pitfall (chromium-extensions group; Jonghakseo/
  fell-lucas boilerplate issues). FIX: build the content script in its own pass as a
  single self-contained IIFE (BUILD_TARGET=content → rollup input:{content},
  format:'iife', inlineDynamicImports, emptyOutDir:false), keep the module-context
  entries (background SW, side-panel/options pages) on normal chunking, and drop
  `type:module` from the content_scripts manifest entry (now classic). `build` runs
  main then content; `dev` builds content once then watches main. VERIFIED in real
  Chromium via e2e/smoke.mjs: content.js has 0 import statements, the content script
  now boots (AGI-Workforce logs + NLWeb detection fire, no import error), and job
  autofill works END TO END, AGI_RUN_AUTOFILL fills first_name="Ada"/email into a
  Greenhouse form served at a mapped http://boards.greenhouse.io URL. Clean build +
  all 4 artifacts + 1119 unit tests still green. The smoke's autofill block is the
  regression guard.
- VSCODE-REALUI-INTEGRATION (2026-07-21): ran the VS Code extension's real
  integration suite in a REAL VS Code Extension Host via @vscode/test-electron
  (`pnpm --filter agi-workforce test:integration` → tsc + esbuild + downloaded
  VS Code 1.129.1 → src/test/suite/extension.smoke.test.ts). 4/4 PASS, host exit
  0: extension activates + is found by id (agiworkforce.agi-workforce), package
  version matches getExtensionVersion(), ALL package.json contributes.commands are
  actually registered (the real "every declared command is wired" check, no dead
  commands), and the newConversation command resolves without throwing. This is
  genuine real-UI verification (real editor host, not the vitest mock), no new
  findings; VSCode #5 already had its attachment-chip HIGH fixed prior session
  (3841bbf09) and 565 unit tests green. Deeper webview/chat-participant flows still
  need a running `agi app-server` (CLI binary on PATH) per
  VSCODE-CHAT-REQUIRES-CLI-BINARY.
- CLI-REALUI-SMOKE (2026-07-21): built the production `agi` binary
  (`cargo build --bin agi`, workspace target/debug/agi, 33s) and exercised its
  real no-API-key command surface end to end via apps/cli/scripts/cli-smoke.mjs:
  `--version` (agi 1.7.1), `--help` (all documented subcommands present:
  exec/app-server/doctor/models/features/login/…), `doctor` (real preflight
  diagnostics, git/sh/node/cargo deps, auth-provider status, macOS Seatbelt
  sandbox, writable config dir; overall Warn only for optional rg + no provider
  auth), `features` (real feature-flag output), and the `app-server` JSON-RPC
  `initialize` handshake → protocolVersion 5 (the IDE/desktop developer-session
  IPC surface, matching app_server_stdio.rs). CLI SMOKE: PASS. Verifies the CLI's
  production build + startup + documented run commands from the shipped binary
  (complements the 1665 lib tests, which don't run the built binary). Full
  interactive TUI keystroke automation still needs a pty harness (deferred); a
  live chat turn needs provider API keys.
- DESKTOP-REALUI-E2E-RUN (2026-07-21): ran the desktop DOM Playwright e2e
  (test:e2e:dom) against a live Vite dev server in Local mode (port 5175,
  VITE_DESKTOP_UI_DEV_LOCAL=1, E2E_MOCK_CLOUD_API=1 E2E_MOCK_LLM=1, no live
  backend/prod DB; IPC-check clean, 515 invoke()s all resolve). smoke project 3/3
  PASS (app launches + renders, nav present, safety landmarks present). settings +
  onboarding + gdpr + integration: 14 passed / 14 skipped / 1 FAILED, then
  root-caused (below). Desktop cargo suite + smoke otherwise green.
- ROOT-CAUSED DESKTOP-GDPR-PRIVACY-PERSIST-01 (2026-07-21, NOT a product bug;
  DOM-mode mock-fidelity + loose test): gdpr.spec.ts:188 "should persist privacy
  preferences across sessions" failed because the DOM-local tauri-mock
  (src/lib/tauri-mock.ts) was STATELESS for every Tauri-IPC-backed setting.
  `set_user_preference` returned undefined (stored nothing) and
  `get_user_preference` returned null unconditionally, so NO native-backed
  setting can survive a page.reload() in DOM-local mode, though the real Tauri app
  persists them via the native SQLite preference store. Traced at runtime: the test
  uses a PAGE-WIDE `[role="switch"]` selector (the Privacy tab itself has zero
  role="switch" elements, its crash-reporting control is `<input type=checkbox>`),
  so `.first()` actually toggles a Capabilities switch (Always-use-Agent-Mode /
  Auto-approve, DesktopCloudSettingsModal.tsx:156/184) that persists via
  set_agent_mode / set_auto_approve_all, also stateless stubs in the mock. So the
  failure is a mock-fidelity limitation plus a mis-scoped test (named "privacy" but
  toggling a capabilities switch and reading aria-checked), NOT a persistence
  defect. PARTIAL FIX applied: made the mock's user_preference commands stateful
  (localStorage-backed, namespaced `agi_mock_pref:<key>`) so preference-backed
  settings (crash-reporting, research mode, instruction files) now survive reload
  in DOM-local mode as they do natively, a genuine fidelity improvement (tauriMock
  - Privacy + InstructionFiles + SettingsPanel unit suites still green). NOT
    chased: making set_agent_mode/set_auto_approve_all stateful (risks other e2e
    default-state assumptions) and rewriting the mis-scoped gdpr test to target the
    real privacy toggle + assert via .checked, a separate desktop test-quality task,
    non-blocking (no product persistence bug). Lesson from
    EXT-CONTENT-SCRIPT-BROKEN-BY-CODE-SPLIT applied: pushed to runtime root-cause
    before classifying, rather than assuming harness.
- CORRECTION: full-read audit found HIGH the self-audit MISSED (2026-07-21): my
  earlier claim that the options-page/background-router and content/autofill
  surfaces had "no new HIGH" was WRONG, it relied on targeted greps. Two full-read
  audit agents (options-bg, content) later delivered reports finding 5 HIGH + many
  MED I missed. LESSON: targeted greps catch dead settings but miss BEHAVIORAL bugs
  that only a full read of a handler + its actual consumers reveals (a logout that
  clears the wrong keys; a picker that resolves the wrong tab). ALL of these HIGH
  are now FIXED (the 2 content HIGH were fixed in a later pass, see below):
  - FIXED EXT-OPTIONS-LOGOUT-NOOP (HIGH, security, 601a26562): options "Log out"
    removed legacy keys nothing writes but never called clearAuthToken()/
    signOutClerk(), the Clerk session survived, panel stayed signed in on a shared
    device. Now calls the real clearAuthToken(). (Self-audit wrongly called
    agi_session/agi_user_id "legacy clears, not dead settings", missing that the
    BUTTON never logs out.)
  - FIXED EXT-OPTIONS-ALLOWLIST-SELF-ORIGIN (HIGH, 601a26562): "add current site"
    resolved to the options page's own chrome-extension:// origin (options opens as
    its own tab), so Add polluted the allowlist and never captured the real site.
    Now queries active tabs across windows for the first http(s) site.
  - FIXED EXT-POLICY-PRIVILEGED-MSG-WEB-REACHABLE (HIGH-ish security; agent MED;
    601a26562): GET_ALL_TABS/CREATE/CLOSE/SWITCH_TAB, GET/SET/CLEAR_COOKIES,
    CHAT_MESSAGE fell to DEFAULT_POLICY (allowlisted-tab) so any allowlisted web
    page's content script could enumerate/close/switch tabs, read/write cookies, or
    start paid chat runs invisibly. Zero senders outside the extension UI → gated
    extension-page-only + regression test. REPLAY_SHORTCUT was left allowlisted-tab
    pending a security-review call; that call is now made (SEC-62): it is
    extension-page-only too, because its prompt branch calls handleChatMessage.
    it IS a CHAT_MESSAGE by proxy, so leaving it open reopened the gate that this
    flaw closed, and its actions branch replays recorded DOM actions against
    whatever tab is active rather than the sender's. LIST_SHORTCUTS hands any
    allowlisted page the shortcut ids, so the two composed into a working bypass.
    Only src/side_panel.ts sends REPLAY_SHORTCUT (plus background's own scheduled-
    task path), so no caller regressed. Pinned by extension-page-only-gate.test.ts
    and policy.test.ts.
  - FIXED EXT-ASHBY-ESCALATION-DROPPED (HIGH, 3c3851ba3): Ashby resume/typeahead
    fields are marked skipped with a reason the engine's file_upload trigger doesn't
    match, and makeEscalationDecision was called 4-arg (empty alwaysEscalate) → zero
    triggers → "no escalation needed", resume never attached. Now passes
    ASHBY_ALWAYS_ESCALATE_KEYS for ashby + regression test.
    Both content HIGH now FIXED (2012ae96f, 4e3a7f156):
  - FIXED EXT-OPENSIDEPANEL-GESTURE-LOST (HIGH, 4e3a7f156): the in-page panel
    footer "Open side panel" (panel.ts:373) sends OPEN_SIDE_PANEL and the button
    did nothing. The content agent blamed an internal `await tabs.query`, but that
    was INACCURATE, background.ts:1134 sets `tabId = sender.tab?.id`, and the
    in-page panel runs in the content-script context (Shadow DOM, not iframe), so
    the OPEN_SIDE_PANEL handler already took the synchronous branch. The REAL cause
    was that sidePanel.open() ran inside handleMessageAsync's `.then()` continuation
    (background.ts:1113), one microtask past the synchronous onMessage gesture
    window Chrome requires. FIX: a synchronous OPEN_SIDE_PANEL fast-path in the
    handleMessage onMessage listener, placed AFTER the allowlist/extension-page/
    DOM-mutation gates and BEFORE the async dispatch, calling sidePanel.open({tabId:
    sender.tab.id}) for a content-script sender (extension-page senders fall through
    to async). Source-level regression test asserts the fast-path exists + is
    correctly ordered (gated, synchronous). CAVEAT: the gesture propagation itself
    is not automatically verified (driving a genuine user-gesture sidePanel.open
    through Playwright is nontrivial); this applies Chrome's documented synchronous
    pattern, which is the root-cause fix, a manual load-unpacked click confirms.
  - FIXED EXT-RECORDING-VALUE-CAPTURE-DEAD (HIGH, 2012ae96f): content.ts
    captureValues was flipped only by SET_RECORDING_VALUE_CAPTURE, which had ZERO
    senders → recorded workflows replayed clicks/scrolls but typed '' for every
    input. The content script's value capture is fully built AND privacy-safe
    (sanitizeRecordedValue redacts password/cc/OTP + scrubs API-key tokens, C-05);
    only the UI toggle was missing. FIX: added a "Capture typed values" toggle to
    the side-panel Recording UI that sends the extension-page-only
    SET_RECORDING_VALUE_CAPTURE (background already forwards it to the content
    script) and syncs the choice to the active tab before recording starts.
    Source-level wiring regression test.
    TRACKED MED/LOW (from both full-read agents; complete-or-remove): task-notif
    toggle only gates the pre-run notice (Completed/Failed fire regardless);
    scheduled prompt-task Managed-Cloud output is dropped (burns a paid turn, no
    consumer); capture_page reports/inflates success with no desktop;
    in-page Console panel permanently empty (dead Refresh/Clear); scroll-hidden FAB
    stays clickable (opacity not visibility); in-page provider pill reads
    never-written agi_default_provider/model (fake label); page-metadata.ts dead
    module (+ SYNC_PAGE_CONTEXT allowlist entry that errors); awaitAshbyFormReady
    never called (Ashby flaky on slow render); pushState hook runs in the isolated
    world (SPA chips stale); jobAutofill.runtime double-click (double-submit risk);
    cookie handlers dead; notif-click ignores source tab; offline message-queue dead
    code; options shortcut row mislabels \_execute_action; + LOWs (disclosure banner
    wiped by response render, LinkedIn nth-of-type selector wrong, agi_recorded_actions
    write no reader, dead fillFields/collectResolvable\* exports).
    EGRESS FULL-READ (2026-07-21, closes the caveat, audit-egress never delivered
    so I did the full read myself): the computer-use/native/cloud-bridge egress
    surface is TRUST-SOUND, no critical/high. Every LIVE content-egress path
    redacts: (1) computer-use, the cloud agent's read_dom/find tools and initial
    context all route through cdp.getPageContent (sanitizePageText + redactSecrets)
    and getFieldValue (password/hidden → placeholder), with a prompt-injection scan
    on read_dom and an UNTRUSTED-content system instruction; agentLoop.ts's own
    header documents that text is redacted upstream and screenshots are NOT (honest,
    not a false claim). (2) in-page panel chat, panel.ts:275 captures
    document.body.innerText through redactSensitiveText(=redactSecrets) + truncate
    before the IN_PAGE_PROMPT, with a visible "sensitive fields redacted" disclosure;
    handleInPagePrompt sends only that prompt + a URL-derived platform systemPrompt,
    no extra raw content. (3) context-handoff, sanitizePageText + an explicit "Send
    redacted context" consent gate + redactionsApplied flag. (4) pairing, localhost
    ALLOWED_BRIDGE_HOSTS only, minimal {extensionId} payload, validated response
    token. (5) managed cloud, cloudAgentClient.callCloud validateGatewayUrl +
    Bearer+CSRF+Idempotency, forwards already-redacted text; screenshots the
    documented allowlist+ask-gated image residual. RESOLVED 2026-07-30: the
    zero-caller native-bridge providerStreamClient, its PAYWALL_HIT-only harness,
    and the unconsumed OPEN_IN_DESKTOP route were deleted. Production managed chat
    continues to surface quota_exceeded through freeTrialClient → handleChatMessage
    → the side-panel quota UI. Other verified-correct: manifest
    command/menu/alarm listeners all live; autofill filler.ts production-grade.
- MOBILE-IOS-BUILD-BLOCKED (2026-07-21): attempted the mobile real-UI path (Maestro
  flow scripts/qa/maestro-dev-smoke.yaml needs the app on an iOS sim). `expo
run:ios` on the iPhone 17 Pro sim FAILED on a React Native codegen/build-order
  issue, "Build input file cannot be found: .../ReactCodegen/safeareacontext/
  safeareacontext-generated.mm" (+ rnworklets) → xcodebuild exit 65; the retry
  stalled. Environmental (needs `expo prebuild --clean` / DerivedData reset), not a
  product bug. Maestro 2.6.1 + Pods + Xcode 26.3 + generated ios/ workspace all
  present, so once the build succeeds the Maestro real-UI smoke is runnable.
  Deferred to a focused mobile session.
- RESOLVED (2026-08-13 re-audit of the 2026-07-21 extension residual set):
  `EXT-SHORTCUT-MODAL-DEAD-INPUTS` and
  `EXT-ONBOARDING-SLASH-FINDER-UNBUILT` were already closed by the 2026-07-25
  checkpoint above. `EXT-DEAD-OFFLINE-ONBOARDING` is now deleted; Chrome chat is
  Managed Cloud-only, and the helper's message-display reset had no live state
  to restore. The remaining LOW bundle is also closed in current code: Computer
  Use consumes live `AGI_CU_USAGE` events; voice uses the shared SVG mic; all
  three tab-group controls read one `GET_TAB_GROUP_STATE` result and mutate one
  shared state; and boot/History restore both use `hydrateStoredChatMessage` for
  agent events, activity, run cursors, approvals, quick mode, and provenance.
  Unpacked-extension interaction proof remains founder item 14, not an open code
  defect.
- RESOLVED `EXT-COMPOSER-SEND-STATE-01` (2026-08-13): textarea input now
  recomputes the visible Send button. Voice transcription emits the same input
  event after writing the transcript, so Send state, sizing, and slash-command
  suggestions cannot remain stale.

2026-07-20 desktop-trust-boundary-01 slice (uncommitted working tree at time of
writing): desktop AGI trust_mode threaded end-to-end (IPC wire enum → Goal →
planner/executors/swarm → router), router fail-closed to Local, redaction
hardening, plus a fix wave. Findings from the fix wave tracked here:

- RESOLVED DESKTOP-CLOUD-GATE-SILENT-REFLIP (HIGH): the premature 2026-07-18
  registry flip was correctly reverted while DCL-4 was unfinished. DCL-4 later
  opened explicit signed-in Desktop Cloud mode and selected the shared
  `CloudRuntime`; on 2026-07-22 the canonical `desktop/cloud-chat` profile was
  deliberately marked `implemented`, with managed text/media harnesses and
  contract tests. Local and BYOK remain separate trust boundaries.
- FIXED DESKTOP-MEMORY-INJECTION-EMPTY (this slice, uncommitted): format_memories
  (memory_integration.rs) matched PascalCase category keys ("Preference", "Fact",
  …) but commit 53d596b22 lowercased MemoryCategory::as_str, so EVERY category
  section was dropped and desktop memory injection silently produced an empty
  block. Now matches lowercase keys, renders PascalCase section labels, and covers
  the skill/summary categories. Tested.
- FIXED MODEL-RETIRE-DRIFT-SONNET46 (this slice, uncommitted): commit 7a78ecbd0
  retired the prior Anthropic balanced-model generation from models.json,
  leaving red tests plus dozens of
  passing-but-stale references. All swept 2026-07-20 across all six surfaces
  together with the latest-family-only catalog waves (see the model-catalog
  CHANGELOG entry): remaining grep hits for any retired ID are exclusively
  INTENTIONAL absence-guard literals (model_catalog.rs onboarding/tui/
  design_system guards, catalog-policy exclusion lists, registry-absence
  asserts) which must keep the historical spelling to do their job.
- FIXED COMPUTERUSE-BYOK-SILENT-EGRESS (HIGH, this slice, uncommitted.
  supersedes the earlier decision-note): the first cut of the OPA executionMode
  wiring consulted the PERSISTED settings provider before the workspace privacy
  mode, so a Local workspace with a stale localStorage provider silently sent
  computer-use screenshots out as 'byok', the exact silent Local-to-cloud
  path the trust rules forbid. Confirmed by two independent adversarial
  verifiers and fixed: privacy mode is now the outer gate (managed maps to
  cloud_managed, local maps to local_only unconditionally; the byok branch is
  removed), a Local-mode cloud pick nulls the provider and toasts instead of
  egressing, the Rust command validates execution-mode/provider coherence
  (chat's pattern), and the OPA OBSERVE step (which runs first each iteration
  and still hardcoded trust None, dead-ending every non-Local task) threads
  the boundary through VisualReasonerConfig. OPEN follow-up
  COMPUTERUSE-BYOK-TASK-CONSENT: task-time BYOK consent flow (fork ceremony)
  so cloud vision picks work from Local mode at all; until then Local-mode
  computer use is local-models-only by design.
- FIXED SWARM-SECOND-IPC-TRUST-GAP (this slice, uncommitted): swarm_execute_goal
  (sys/commands/swarm.rs) was a second live swarm entry point whose request had
  NO trust field, Goal built with trust_mode None regardless of session mode;
  live callers AgentCollaborationPanel.tsx and handlers/commands/agents.ts.
  Field added (same wire deserializer as agi.rs), callers send the privacy-mode
  boundary. Two adjacent dead controls fixed in passing: the swarm slash-command
  sent a bare goal that never matched the request envelope, and SwarmInitRequest
  had snake_case-only fields so panel swarm_init always failed deserialization.
- FIXED DESKTOP-LOCAL-CHAT-EMPTY-HARNESS (2026-08-17): registry runtimeProfiles
  desktop/local-chat had allowedHarnessIds [], so every Auto strategy under a
  Local boundary produced an EMPTY candidate list in `llm_router::candidates`.
  `auto_policy_candidate` returned `Vec::new()` on Unavailable and the
  `is_auto_strategy` early return skips the legacy provider fallback loop. That
  dead-ended every caller that leaves `provider` unset: `agi/planner.rs`,
  `process_reasoning.rs`, the AGI executors and `llm_tools.rs` all pass
  `RoutingStrategy::Auto`, and a goal with no `execution_target` plus an
  unthreaded trust mode fails closed to Local. Fixed on both layers: the catalog
  gained a `local-text` harness group (ollama/chat, lmstudio/chat-completions.
  both already have adapter packages) which desktop/local-chat now admits, and
  `llm_router::runtime_profile_harness_candidates` turns that list into the
  documented fallback order when the canonical Auto policy answers Unavailable.
  The profile stays status "partial" on purpose: a local model's identity comes
  from the user's own runtime, so the registry has no local routes to enumerate
  and `resolve_auto_route` can only ever answer Unavailable here. Every entry is
  still gated by `provider_matches_trust_mode`, so the fallback can never reach
  a BYOK or Managed Cloud provider. Covered by
  routing_logic_tests::local_auto_falls_back_to_the_registry_declared_local_harnesses.
- OPEN MODEL-CATALOG-HELD-VERIFICATIONS (2026-07-20, partially resolved
  2026-07-28): the legacy OpenAI TTS entries are now REMOVED, the current
  catalog-selected OpenAI TTS model's pricing row was verified 2026-07-28
  ($0.60/1M input text, $12/1M output audio) and it
  replaces both. Still held: several NIM open-weight endpoints are served but unpriced; a provider image tier exists but remains unpriced-in-full; and a provider preview announced 2026-07-19 still has no official API id. None added, verify before
  writing. Also NOT live-probed with real keys: the Moonshot flagship, xAI
  reasoning, Mistral medium and small tiers, and the OpenAI transcription model
  (docs-verified only; a live 200 probe is a founder/live-QA item per the
  models-policy lesson).
- OPEN VOICE-TTS-NO-ROUTING-SLOT (2026-07-28, confirmed in source):
  `apps/desktop/src-tauri/src/features/speech/tts.rs` hardcodes both cloud TTS
  defaults rather than reading the catalog, because no `voice_tts` routing slot
  exists and the catalog carries no ElevenLabs provider, so a slot would only
  cover the OpenAI half. This is how the retired ElevenLabs default stayed as the
  ElevenLabs default for 19 days after upstream removed it on 2026-07-09.
  every un-configured ElevenLabs playback was calling a nonexistent model. Fixed
  the ids and added a `tts_defaults_are_not_retired_models` guard; the
  catalog-driven fix is still owed. STT is already correct, it reads the
  `voice_transcription` slot.
- OPEN VOICE-REASONING-TEXT-NOT-STREAMED (2026-07-28, confirmed by live capture):
  the "Thought for Ns" chip can never render on a managed-cloud turn.
  `apps/mobile/src/features/chat/components/MessageBubble.tsx:168` gates it on
  `message.reasoning !== undefined`, but the managed-cloud SSE carries reasoning
  only as token COUNTS, `apps/web/app/api/llm/v1/chat/completions/lib/
stream-transform.ts` handles `reasoningOutputTokens` and never emits a
  reasoning TEXT delta. Proven on device, not inferred: a managed reasoning turn
  with thinking mode ON completed with no chip anywhere above the answer
  (parity-shots-r5/124035-r5-fable5-thinking-no-chip.jpg). This was misdiagnosed
  twice as "the local model does not think", it is a streaming gap, and no
  choice of model fixes it. Blocks reference 05 in
  ~/Desktop/references-2. Fix spans the transform, the client SSE parser and the
  mobile message store, so it is a real slice rather than a patch.
- OPEN VOICE-OVERLAY-ORB-STILL-RADIAL (2026-07-28): the three new voice surfaces
  (onboarding sheet, picker, inline bar) use a linear top-to-bottom orb matching
  the reference; the legacy full-screen `VoiceConversationScreen` still uses a
  radial one, so the app shows two treatments. Converting it needs the orb
  gradient separated from the screen BACKDROP gradient first, both are
  `RadialGradient` in that file and blanket-converting breaks the backdrop
  (tried, reverted, TS2322 on leftover fx/fy).
- OPEN VOICE-REALTIME-FAMILY-ABSENT (2026-07-28): the catalog carries no
  realtime audio models, so the OpenAI voice lineup we expose is REST-only
  (speech + transcription). Blocked on three things, in order: `ModelType` in
  `packages/contracts/types/src/model-catalog.ts` has no `realtime` member, so
  adding one is a schema change across the TS union, the registry schema and
  both generated Rust registries; we ship no duplex audio path (founder-gated
  on a realtime provider plus echo cancellation); and registering them live
  before that would advertise capability we do not have. OpenAI's current full
  and compact realtime text/audio tiers, live-translation tier, and
  streaming-transcription tier were verified on 2026-07-28. Exact identifiers
  and pricing remain owned by the catalog and current provider documentation.
  Several legacy realtime/audio aliases were scheduled to shut down on
  2027-01-20.
- OPEN VOICE-OPENAI-TTS-DEPRECATED-NO-SUCCESSOR (2026-07-28): the
  catalog-selected OpenAI TTS model carries a Deprecated badge on OpenAI's
  model-catalog listing, yet it is the
  ONLY model served on `/v1/audio/speech`, OpenAI's current audio-generation
  model lists that endpoint as "Not supported", the deprecations table names
  no successor, no shutdown
  date is published, and the TTS guide still calls it the newest and most
  reliable TTS model. Marked `deprecated: true` in the catalog (so
  `selectable: false`) but retained, because removing it leaves the OpenAI TTS
  path with no model. The product decision this raises: desktop cloud TTS should
  probably prefer ElevenLabs (the catalog-current ElevenLabs route, not deprecated) or local
  Piper rather than wait for a shutdown date to appear.
- REMEDIATED VOICE-TRANSCRIPTION-UNMETERED (found 2026-07-28, fixed
  2026-08-16, `1e4c47b89`): `apps/web/app/api/llm/v1/audio/transcriptions/route.ts`
  now reserves against the managed usage balance before calling the provider
  (`reserveManagedUsageRequest`, gated by `assertTierUnitAllowance` on the
  `voice_minutes` tier unit) and settles the real cost afterward
  (`finalizeManagedUsageRequest`) from provider-reported tokens,
  provider-reported duration, or a byte-derived estimate when neither is
  present (`settleTranscriptionTokens`). A failed or unreachable provider call
  releases the reservation instead of leaving it dangling
  (`releaseReservation`). Managed-cloud transcription is metered like chat and
  image now, not free at the point of use.
- REMEDIATED DESKTOP-SKILLS-EAGER-INJECTION-01 (found 2026-07-21, fixed
  2026-08-05): desktop chat eagerly injected full skill bodies into the LLM
  context by Jaccard-similarity auto-match, `maybe_inject_matching_skills`
  scored every skill's name+description against the user message and pushed
  `skill.to_context_string()` (full instruction body) into `llm_messages` for the
  top matches, gated only by the default-on `auto_inject_skills` flag plus
  incognito. Desktop now uses the same progressive disclosure as
  `packages/tools/skills` (web) and `CLI-SKILLS-TOOL-01` (CLI): the turn carries
  only a name+description catalog (`SkillTool::catalog_prompt`,
  core/agi/tools/skill_tool.rs), and a body is disclosed ONLY when the model
  calls the read-only `skill` tool with `action=load` and an exact catalog name.
  The tool is registered in `ToolRegistry::register_all_tools`, dispatched by
  `ToolExecutor` (core/llm/tool_executor/skill_tools.rs), and policied Low-risk
  in `ToolExecutionGuard`, before this it was in no catalog and had no policy,
  so it was unreachable dead code. Model-supplied paths never resolve (exact
  names only), unmet bin/env/OS requirements fail closed, workspace-sourced
  bodies need a `.consent` record naming their canonical directory (the CLI's
  AUDIT-FIX H-9 gate), and every loaded body is wrapped in an untrusted
  `skill_result` fence with in-body breakout markers neutralized.
  `auto_inject_skills` / `autoInjectSkills` stays in the IPC contract with a
  redefined meaning (offer the catalog + the tool for this turn; `false`
  withholds both, the existing MCP-bridge callers passing `false` are
  unaffected). Tests: `core::agi::tools::skill_tool::tests` (metadata-only
  catalog, load-by-exact-name, unknown-name/path rejection, requirement and
  consent gates, fence breakout), `sys::commands::chat::tools::tests`
  (catalog + guard-policy wiring), `send_message_setup::tests`.
  Remaining gap, tracked here rather than as a new id: nothing in the desktop UI
  can WRITE a workspace `.consent` record yet (`record_workspace_skills_consent`
  exists but has no Tauri command / UI), and nothing calls `skill_set_workspace`,
  so workspace skills are currently unreachable by design rather than by choice.
  Also unchanged: the frontend persists `autoInjectSkills` but never sends it on
  a chat request, so only the Rust default (on) and the MCP bridge (off) are
  live, part of DESKTOP-SETTINGS-PERSISTED-BUT-UNREAD below.
- OPEN DESKTOP-BILLING-FLOW-INERT-SELECTORS (LOW, 2026-07-21, desktop V3 audit):
  the retention flows PauseFlow.tsx (1/3/6-month duration radios) and
  DowngradeFlow.tsx (target-tier picker) collect a selection that is never applied
  - `handlePause`/`handleDowngrade` only call `openBillingPortal()` (a GENERIC
    Stripe portal), so the chosen duration/tier has no effect on the outcome (the
    user re-picks in the portal). Disclosed in copy ("continues in the Stripe
    billing portal") but the selectors imply a pre-applied choice they don't make.
    CancelFlow's "Quick feedback (optional)" reason was the sibling case and IS now
    fixed, wired to the consent-gated `analytics.track('subscription_cancelled',
{reason})`. Pause/Downgrade need a FOUNDER/Stripe decision: either preconfigure
    the portal via Stripe billing-portal flow deep-link params (e.g.
    `flow_data[subscription_cancel]` / a pause/downgrade flow) so the selection is
    honored, OR remove the selectors and let the portal own the choice. Deferred to
    the founder Stripe track (billing is founder-managed, test-mode restricted keys);
    not gating desktop #1's non-billing surfaces.
- OPEN DESKTOP-SETTINGS-PERSISTED-BUT-UNREAD (2026-07-21, desktop chat+settings
  audit): a cluster of settings that persist (localStorage + Rust
  ExecutionPreferences) but are NEVER read/applied, dead-interface controls. The
  HIGH sibling (Personalization "Response Style") is FIXED (`16a4de4d9`, wired into
  TauriRuntime customInstructions). Remaining:
  • Execution-preference cluster, PARTIALLY FIXED 2026-07-21:
  – max\*timeout\*minutes + enable_timeout_warnings → FIXED. The LIVE global
  TimeoutConfig (timeout_set_config, read by the executor per tasks/types.rs:116
  "overrides the global TIMEOUT_CONFIG.max_duration_secs") is now synced from
  settingsStore.saveSettings + loadSettings via syncExecutionTimeoutToBackend
  (max_duration_secs, enable_warnings), preserving enable_checkpoint_on_timeout.
  settings_save only persisted to disk (unread); this bridges to the live path.
  Also gated the frontend timeout-warning toast (backgroundTaskStore) on the
  setting. Regression test in settingsStore.test.ts.
  – REMAINING [MED/LOW]: enable_checkpointing/checkpoint_interval (:209/:224) and
  auto_resume_on_restart (:247) are NOT covered by TimeoutConfig (semantic
  mismatch: TimeoutConfig.enable_checkpoint_on_timeout = checkpoint-ON-TIMEOUT,
  not periodic-at-interval). DEEPER ROOT CAUSE (traced 2026-07-21, supersedes the
  original "load into TaskConfig" note): the `ContinuousExecutor`/
  ContinuousExecutorConfig (checkpoint_interval, auto_resume_on_restart) is DORMANT
  - `core/agent/mod.rs:41` only re-exports it; it is never instantiated or run by
    any live command (`bg_submit_task` uses a different path; grep finds it only in
    its own module + tests). The LIVE checkpoint system is instead
    `core/agi/checkpoint.rs` (CheckpointConfig.checkpoint_interval_steps, default 5,
    read by checkpoint_manager.rs:171). CORRECTION 2026-07-21 (supersedes the "wire
    to the live agi checkpoint_manager" note above, that was WRONG): the
    CheckpointManager is ALSO DORMANT, `CheckpointManager::new` is never called in
    the live app (referenced only by checkpoint_manager.rs + the core/agi/mod.rs
    re-export). The wired AGICheckpointState (agi_checkpoint\*\* commands, lib.rs:1054)
    uses CheckpointConfig::default() and reads ONLY max_checkpoints_per_task, never
    checkpoint_interval_steps. So BOTH checkpoint subsystems are built-but-dormant:
    checkpoint_interval_steps AND auto_resume_on_restart have ZERO live consumers.
    DISPOSITION (genuine product-direction call, not a snap fix): the settings cannot
    be "wired" without making entire dormant subsystems live. TWO honest options.
    (A) COMPLETE = instantiate + run the continuous-executor/checkpoint-manager in the
    live task pipeline so checkpoint_interval_steps/auto_resume take effect (a large
    feature-integration slice; the code exists, continuous_executor.rs is 1580+ lines
    with tests + a settings UI, which suggests it was INTENDED, not abandoned); or
    (B) REMOVE the three dead controls (Enable Checkpointing switch :209, Checkpoint
    Interval slider :224, Auto-resume toggle :247) from AgentsSettings.tsx + clean the
    orphaned settingsStore fields/setters, if the feature is being dropped. Which one
    depends on whether autonomous/continuous execution is a shipping feature, a
    FOUNDER product decision given the substantial existing investment. Not resolved
    this session (would be a snap call at extreme context). NOT a
    critical/high blocker.
    CONTRAST: terminal_sandbox IS wired (terminal_executor.rs:571 + terminal.rs:265)
    and max-timeout/warnings ARE now wired (ff346b5e0), the live-config-push pattern
    is proven; checkpoint-interval should follow it against the agi checkpoint system.
    • [MED] Prompt Completion toggle (ModelsKeys/index.tsx:488) → hooks/
    useApiPromptCompletion.ts has zero callers and the LIVE composer is the shared
    @agiworkforce/unified-chat package, which never reads promptCompletionEnabled.
    FIX = either build ghost-text into the shared composer (feature work) or remove
    the toggle. Deferred (shared-package feature decision).
    • [MED] Voice Persona, FIXED 2026-07-21: extracted the persona→params mapping
    (was an inline switch in VoicePersonaSelector's preview) to shared
    features/settings/voicePersonaParams.ts, wired useTTS to read the persisted
    persona (previously hardcoded rate/pitch/volume), and deduped the preview +
    storage-key constant onto it. Unit-tested.
- MOBILE (app #3) audit 2026-07-21, primary surfaces (chat/composer/drawer-nav/
  auth/onboarding/model-picker + most settings) all WIRED; 4 findings (0H/1M/3L):
  • [MED] Notification Preferences screen inert → FIXED (`60a54d66c`): the category
  toggles + quiet hours persisted to useNotificationPrefsStore but no live path
  read it. Both firing paths (backgroundFetch agent-approval push +
  notifications.ts foreground handler) now consult a shared notificationAllowed()
  gate (services/notificationGate.ts, lazy-require + fail-open). Regression test.
  • [LOW] FIXED MOBILE-VOICE-CLOUD-TTS-DISABLED (2026-07-21, ba53cefbe): the Cloud
  TTS provider option (settings/voice/index.tsx) stays correctly `disabled` (not
  built on mobile) but its copy was relabeled from the misleading "Requires AGI
  Cloud access." to the honest "Cloud voice isn't available on mobile yet."
  Regression test in voice-settings.test.tsx asserts the honest copy.
  • [LOW] FIXED MOBILE-MODELS-FAVORITES-INERT (2026-07-21, 90592c388): the Favorites
  & Recent rows in app/(app)/models.tsx were plain non-interactive Views that read
  as tappable. Now each row is a Pressable that opens the model picker (same as the
  Active Model row + Browse-all button), so selection routes through the picker's
  existing lock/tier gating rather than a duplicated ungated path. Regression test
  in models-page.test.tsx asserts the rows render as buttons.
  • [LOW] LARGELY FIXED MOBILE-CONNECTORS-501 (re-measured 2026-08-30): the claim
  "only GitHub + custom-MCP work; POST /api/connectors returns 501" is no longer
  accurate. isConnectorOAuthSupported() (lib/connectors/oauth-registry.ts:150) is
  now `getConnectorOAuthProvider(id) !== null || isSelfServiceConnector(id)`, and
  getAvailableConnectorIds() (app/api/connectors/route.ts:84-91) adds every
  self-service endpoint, so 15 of the 27 records in lib/connectors/mcp-endpoints.ts
  (8 `cimd` + 7 `dynamic`) are available with NO operator credentials. POST for
  those answers 409 with an `oauthStartPath` (route.ts:279-295), not 501; mobile
  follows it, connectConnector() returns an authorizeUrl and
  cloud-connectors/index.tsx:697-705 opens the browser. 501 now only remains for a
  connector that is neither operator-mapped nor OAuth-supported.
  Still open: the 12 `preregistered` endpoints need CONNECTOR_OAUTH_PROVIDERS_JSON,
  and 6 of them (asana, dropbox, figma, intercom, square, vercel) refused dynamic
  registration on 2026-08-14 and need AGI's callback allowlisted, see
  docs/work/founder-assistance.md item 25. No live consent round trip has been
  completed yet, so "authorizes end to end" is still unproven by anything but
  mocked tests.
  • NOTE dead code (not a visible control): src/features/sidebar/\*\* (Sidebar/
  ConversationList/etc.) is not mounted anywhere (live nav uses DrawerContent).
  a delete/cleanup concern, not a dead interface.
  • NOTE MOBILE-TEST-INFRA-SECURESTORE (PRE-EXISTING, not a product bug): jest.setup.js
  mocks reanimated/worklets/expo-notifications/webview but NOT expo-secure-store, so
  any suite whose module graph loads a SecureStore-backed store fails to run
  (src/lib/time.test.ts fails on this independently of any change). Fix = add an
  expo-secure-store mock to jest.setup.js (systemic, re-run all 200 suites to verify).
- CLI (app #4) audit 2026-07-21 to 16 findings (7H/4M/5L). Most TUI keybindings,
  REPL shortcuts, and the model/theme/effort/agent pickers are correctly WIRED; the
  findings cluster on ONE root cause + a set of parity commands that don't act.
  • CLI-TUI-OVERLAY-SUBMIT-DROP, ROOT CAUSE FIXED 2026-07-21 (`9ab279e7f`):
  tui_app.rs dispatch collapsed `ViewAction::Submit` into `Close`, dropping every
  overlay's payload. Now added InteractiveView::take_result() (default None) + an
  OverlayResult enum + apply_overlay_result(); the Submit arm applies the committed
  result. /statusline is FULLY wired as the template (overlay seeds from live
  app.statusline_config, save commits back, render_status_bar gates model/tokens/
  cost/branch/mode; current bar preserved via defaults; 2 regression tests). The
  remaining 4 overlays each now just add: an OverlayResult variant + a take_result
  override + an apply_overlay_result arm + BUILD their apply-target (which does NOT
  exist yet): /title = emit a terminal title (no SetTitle/OSC mechanism today),
  /skills-toggle = a persistent enabled-set that skills::discover_skills honors,
  /memories = a MemorySettings consumer, /diff-review = git apply/stage the approved
  hunks (highest risk). The DROP is fixed; each remaining overlay is now a bounded
  per-feature build on the proven pattern. Original detail retained below:
  [was] tui_app.rs:483 collapses `ViewAction::Submit` into `Close`, so EVERY generic
  `active_overlay` discards its save/decision payload. Affected overlays (all say
  "Enter save"/"y approve" but persist nothing): /statusline (StatusLineSetupView),
  /skills-toggle (SkillsToggleView), /memories (MemoriesSettingsView), /title
  (TerminalTitleSetupView), /diff-review (DiffReviewView, real `git diff HEAD`
  gathered but approvals dropped, no apply/stage). [/permissions was in this list.
  RESOLVED 2026-07-21: the TUI opened a FAKE hardcoded "Approve action?" prompt that
  managed nothing; now removed → honest SystemMessage listing the real, working REPL
  /permissions allow|deny|session|remove|reset commands (mirrors /voice's redirect).
  The real AGENT-driven approval overlay (tui_app.rs:555) is untouched. Inline TUI
  rule editing remains a nice-to-have, not a fake interface.]
  REMAINING FIX (5 overlays), ARCHITECTURE (traced 2026-07-21): ViewAction::Submit
  carries only a `usize` cursor (interactive.rs:49), so each overlay's real state
  lives in its concrete struct behind `active_overlay: Box<dyn InteractiveView>`.
  Clean approach: add `fn commit(&mut self) {}` (default no-op) to the InteractiveView
  trait (interactive.rs:57), override it per overlay to persist that overlay's state,
  and change tui_app.rs:483 to `ViewAction::Submit(*) => { ov.commit(); self.
active_overlay = None; }`. Then per overlay BUILD: (a) statusline-config +
  terminal-title, persist into the EXISTING crate::config::CliConfig (config.rs
  already has serde + load_merged():495 + save():569; NO statusline section yet).
  CORRECTION: the statusline read side is NOT render_statusline (claude_parity.rs:798,
  a REPL redirect string), it is render_status_bar (tui_app.rs:1413, a ~120-line
  ALWAYS-VISIBLE chrome fn); gate its model/tokens/cost/branch/mode on the config +
  open the overlay with the LOADED config (not ::default() at tui_app.rs:2881) +
  commit() saves. Cosmetic/low-risk but touches core chrome, test render_status_bar
  carefully. terminal-title adds an OSC-title emit. Do these FIRST as the template;
  (b) memory-settings persistence (memory.rs home); (c) skills-enablement
  persistence + have skills::discover_skills honor it; (d) diff-review = git apply/
  stage the approved hunks (highest risk, real git mutation, gate carefully). Each
  is a mini-feature with its own test. Do NOT add the no-op trait method without at
  least one real override (ponytail: no scaffolding-for-later). A dedicated CLI Rust
  session; not rushed at extreme context. (advisor-confirmed the 483 drop.)
  MATERIAL FINDING (2026-07-21, read render_status_bar in full): the 5 overlays are UI
  MOCKUPS for features never built, NOT features with a merely-dropped save.
  render_status_bar (tui_app.rs:1496-1522) shows mode/access/context%/cost/sandbox/
  effort, NOT model, tokens, or branch, so 3 of statusline's 5 fields (show_model/
  tokens/branch) have NO status-bar content to gate; "completing" = ADDING new gated
  spans with defaults that preserve current chrome (a design task), not wiring a save.
  Same shape: /title needs an OSC-title emit, /memories' MemorySettings has no consumer,
  /skills-toggle is ignored by discover_skills. So "honest-remove" (as done for
  /permissions) only converts fake toggles into "not available" messages the goal also
  dislikes → the real resolution is to BUILD each feature. Dedicated CLI session,
  per-overlay feature + test.
  STATUS: ALL 7 CLI HIGH RESOLVED 2026-07-21, the overlay-Submit-drop cluster is
  fully closed. /background, /permissions, /statusline (+ root-cause `9ab279e7f`),
  /title `e6be74c91`, /skills-toggle `e68822b1a`, /memories `760e881fc`, /diff-review
  `47681b9ec`. Each a real feature on the take_result/OverlayResult/apply_overlay_result
  pattern with regression tests; CLI lib 1665/0. CLI has NO unresolved critical/high
  → meets the proceed-gate. Remaining CLI items are MED/LOW only: the parity commands
  that overstate their verb (/focus /color /heapdump /voice-in-TUI + /stickers
  /thinkback-play /effort-REPL /vim /replay-v0.2, mostly honest "not available"
  messages), tracked, non-blocking.
- VSCODE (app #5) audit 2026-07-21, extension is overwhelmingly wired (67 commands,
  sidebar webview, @agi chat participant; 27 settings at audit time, now 24 after
  removing no-op selectors); 4 findings
  (1H/2M/1L):
  • [HIGH] attachment-chip "X" removal was silently dropped → FIXED (`3841bbf09`):
  the webview posted removePendingAttachment to a real ChatStateManager handler,
  but the Zod gate (WebviewToExtSchema) omitted it, so parseWebviewMessage dropped
  it, the chip vanished client-side while the host kept the file and RE-SENT it
  next turn (silent data-inclusion). Added the schema to the union; regression
  tests now go THROUGH the gate (the prior test bypassed it, fake-green).
  • [MED] FIXED 2026-07-25 VSCODE-PROVIDER-STREAM-UNWIRED:
  `chatCompletion()` now branches on `Config.useProviderStream()` and invokes the
  real account-authenticated `/api/v1/providers/:id/stream` client for cloud-backed
  editor utilities. Device-flow account auth was already wired; the selected catalog
  model now determines the provider, and the independent `providerStreamProvider`
  setting was removed so model/provider pairs cannot drift. The setting and UI copy
  explicitly state that this transport does not affect local `@agi`, sidebar, or
  editor developer sessions. `providerStreamWiring.test.ts` exercises the production
  branch and `configDefaults.test.ts` locks the manifest scope/default.
  • [MED] RESOLVED-BY-REMOVAL VSCODE-VSCODE-LM-FALLBACK-MISSING (2026-07-21, 9041e65e4):
  agiWorkforce.fallbackToVscodeLm was an unread no-op (no vscode.lm path exists), REMOVED
  from package.json contributes + config defaults/getter + parity key-map. A mature product
  shouldn't ship a dead toggle. The vscode.lm fallback is a real unbuilt feature (founder
  decision); the setting returns WITH its implementation. Suite 563 green.
  • [LOW] RESOLVED-BY-REMOVAL VSCODE-AGENT-MAXITERATIONS-UNAPPLIED (2026-07-21, 9041e65e4):
  agiWorkforce.agent.maxIterations was never threaded to the CLI agent loop (unread).
  REMOVED. Completing it is real cross-lane work (extension-TS + shared startTurn contract
  - CLI-Rust agent-loop cap); tracked here, re-added with the wiring. Suite 563 green.
    Provider-stream disposition is now complete: account auth and the production
    branch are wired, the provider derives from the selected catalog model, and the
    feature remains default-off and narrowly scoped to cloud-backed editor utilities.
    VSCode has NO unresolved critical/high from this audit.
- RESOLVED EXT-SIDEPANEL-NO-RENDER-TESTS (2026-07-21, 763b2dd1e + 1c80ad676): DONE.
  Extracted the side-panel DOM helpers (el/formatTime → features/side-panel/dom.ts) and
  the whole message/tool-call/agent-activity render cluster (buildBubble, buildToolCallEl,
  parseToolCalls, buildAgentActivity\*, + the internal helpers + ToolCallBlock, ~377 lines
  → features/side-panel/bubbles.ts) VERBATIM out of the chrome-bootstrapping entry file, so
  the render path is now importable + unit-testable. Added real jsdom render tests
  (side-panel-dom.test.ts: el CSP style→cssText routing + children; side-panel-bubbles.test.ts:
  user/assistant bubbles render + [TOOL:...] fence parses into a tool element, not raw text).
  side_panel.ts dropped ~530 lines; typecheck clean, full suite 1138 passed (zero regressions),
  production build green. Only buildBubbleWithTools + buildToolCallEl are exported/consumed by
  side_panel.ts. Original assessment (kept for history):
  the Chrome
  extension's main UI, `apps/extension/src/side_panel.ts` (~8116 lines, imperative
  DOM), has ZERO render/interaction tests, the 1130 vitest tests are all logic
  (none touch the DOM). The module can't be imported in a test because it runs
  `chrome.runtime.onMessage`/init at module scope (side_panel.ts:137 comment confirms
  "runs at module scope"). The clean component builders `buildBubble`/`buildToolCallEl`/
  `buildAgentActivityStep`/`buildAgentActivityEl`/`buildBubbleWithTools` (3002-3306) are
  module-private + pure (msg→HTMLElement, no module state). PLAN: extract them into
  `src/features/side-panel/bubbles.ts` (existing pattern, `./features/side-panel/markdown`
  already holds sanitizeHtml/renderMarkdown, importable); the cascade also pulls the local
  `el` (2973) + `formatTime` (2998) helpers + renderIcon/icons, move those to a
  `features/side-panel/dom.ts`. Then add jsdom render tests (assert buildBubble renders
  role/text/copy-button for a ChatMessage). Guard: typecheck + all 1130 tests green catch
  mis-wiring, but VERIFY by loading the built extension (chat messages must still render)
  before shipping, that manual step is why this is a dedicated slice, not a safe unattended
  drive-by on a shipping surface. Mobile has the sibling device-gated real-UI gap
  (Maestro/iOS build-blocked). See [[project-6app-sweep-status-2026-07-21]].
- HISTORICAL: SUPERSEDED 2026-08-02, NOTE
  CLI-APPSERVER-INITIALIZE-PROTOCOLVERSION, resolved at its 2026-07-21 checkpoint
  (`87445c264`): `app_server_stdio.rs:56` then asserted protocol 3 while the
  implementation returned protocol 5 and VS Code required at least 5. Current
  proof is the exact protocol-v7 handshake and CLI-version check recorded at the
  top of this ledger. The `2024-11-05` string remains the separate MCP-server
  path, not the developer app-server.
  • NOTE CLI-FLAKY-PATH-SECURITY-TEST (test-infra, PRE-EXISTING): path_security::
  tests::validate_workspace_path_allows_registered_additional_root passes in
  isolation + within its module but intermittently FAILS under full-suite parallel
  execution (shared process-global registered-roots state mutated by a sibling
  test). Not a product bug, not caused by any 2026-07-21 change. Fix = serialize
  the test (e.g. a shared mutex / serial_test) or isolate the global roots state.
  • [HIGH] /background /bg fabricated "Current task moved to background context" (a
  LIE, no backgrounding exists) → FIXED 2026-07-21: both surfaces (tui_app.rs:2948,
  claude_parity.rs:123) now say honestly it isn't available yet + point to /tasks.
  • [MED] OPEN, parity commands that overstate their verb (no infra): /focus (prints
  "controlled via --no-status-bar at startup", no runtime toggle), /color
  (claude_parity.rs:187 "coming through shared settings" placeholder), /heapdump
  ("not enabled in this build"), /voice in TUI (tui_app.rs:2743 lists in palette but
  says run the REPL, voice::run_voice_mode exists, the sync TUI handler can't drive
  the async loop). FIX = implement or make the "Toggle"/verb honest / hide in TUI.
  • [LOW] OPEN: /stickers + /thinkback-play (honest "not installed" no-ops), /effort
  in REPL (claude_parity.rs:788 acknowledges but never applies; TUI /effort DOES
  apply), /vim (startup env only, no live toggle), /replay ships a "coming in v0.2"
  string (tui_app.rs:2409; the `agi session` shell path works). Mostly honest-ish
  unavailable-feature messages, lower priority than the overlay cluster.
- NOTE DESKTOP-DOM-E2E-MODE-DEPENDENCY (2026-07-21, harness, NOT a product bug):
  the desktop Playwright DOM e2e (`test:e2e:dom`, specs in apps/desktop/e2e) has
  NO webServer config, you must start vite yourself on :5175, and the suites
  split by runtime mode, which CANNOT both pass under one server config:
  • DESKTOP-LOCAL suites (v3-smoke, v3-folder-selection, v3-locks, settings, smoke)
  need `VITE_BUILD_TARGET=web VITE_DESKTOP_UI_DEV_LOCAL=1 VITE_DEV_PORT=5175
E2E_MOCK_LLM=1 E2E_MOCK_CLOUD_API=1 vite --port 5175 --strictPort`
  (supportsLocalAppMode=true → folder-selection etc. render). Verified GREEN
  2026-07-21 (v3-smoke 5/5, folder-selection 2/2, settings, smoke).
  • CLOUD suites (chat.spec, v3-agent-activity "Desktop Cloud") need the SAME
  server WITHOUT `VITE_DESKTOP_UI_DEV_LOCAL=1` (supportsLocalAppMode=false →
  initial mode='cloud'); chat.spec passes there (verified GREEN in cloud mode)
  but fails in local mode, and vice-versa for folder-selection. This is a real
  e2e-harness gap: add a `webServer` block (or two projects with per-mode env)
  so a single `playwright test` runs each suite in its correct mode. Attribution
  proven: the 2026-07-21 v3-shell commit (6fa712d7d) touched only toggle/pricing/
  account/cancel, zero overlap with chat-send or the activity spine.
  • REMAINING TRUE OUTLIER: v3-agent-activity.spec.ts:100 ("Desktop Cloud …
  activity spine") fails in BOTH modes (send-message click times out after
  mockCloudChat), it exercises the desktop-cloud path that is INTENTIONALLY
  not-implemented (fail-closed seam). Triage separately; likely needs the cloud
  e2e config + a working mockCloudChat, or is blocked by desktop-cloud-not-impl.
- RESOLVED WEB-CHAT-SYNC-500 (2026-07-21): GET /api/chat/sync?since=<cursor>
  returned HTTP 500 for any signed-in user WITH chat data, degrading cross-device
  artifact/chat sync (client threw "artifact sync pull failed with status 500",
  features/chat/services/artifact-cloud-sync.ts:39). ROOT CAUSE (not a missing
  migration, schema/RLS/role all verified present against the connected Neon):
  the RLS Pool path (node-postgres) returns `timestamptz` columns as JS `Date`,
  but the shared wire schema types created_at/updated_at/deleted_at as
  `z.string()`. handlePull parsed the RAW db rows through
  ChatSyncPullResponseSchema.parse BEFORE JSON serialization, so any non-empty
  page threw "expected string, received date" → caught → 500. Empty pages (new
  users) had no Date to reject, hence the intermittency. The existing contract
  test masked it by mocking ISO-STRING timestamps the live Pool never returns.
  FIX (apps/web/app/api/chat/sync/route.ts): `withIsoTimestamps()` normalizes the
  three timestamp columns to ISO before the parse. Regression: a Date-timestamp
  case added to route.contract.test.ts (proven to 500 without the fix) + a live
  HTTP 200 assertion in e2e/authenticated-flows.spec.ts against the QA user's real
  data (259 messages). Verified: contract 10/10; authenticated e2e green (sync 200).
- RESOLVED WEB-PREEXISTING-TEST-FAILURES-01 (2026-07-21, fixed 15cad0219, all
  3 were test drift, not product bugs; apps/web vitest suite now green). Found
  running the full
  apps/web vitest suite during production-readiness verification: 4129 pass, 4
  fail). All 4 predate the 2026-07-21 web UI-fix pass; one was that pass's own
  label rename (fixed, e0b3fbc22). The other 3 are pre-existing debt, NOT
  regressions (their source files were untouched this session), tracked for a
  follow-up: (a) apps/web/app/pricing/page.test.tsx "payment-safe
  replacement-cycle", the mid-cycle upgrade added previewUpgrade (prior commit
  ff567e07a, a preview then confirm then charge flow) but the test's
  stripe-payments mock + assertions were never updated to that flow; (b)
  features/chat/components/messages/MessageBubble.test.tsx "canonical inline
  agent spine", the agent-activity UI renders as a section aria-labelled
  "Agent activity" while the test still queries a "show agent activity" button
  (stale selector; the UI works); (c) **tests**/web-search-model-coverage.test.ts
  "non-empty roster", the desktop/cloud-chat surface returns 0 selectable
  models for every tier while web/cloud-chat and mobile/cloud-chat pass, so it
  is a desktop-surface catalog mapping gap (related to
  DESKTOP-LOCAL-CHAT-EMPTY-HARNESS), not the latest-family-only retirement. Web
  production build is clean (295 routes, 0 errors/warnings).

2026-07-19 STRENGTHEN pass (founder directive: harden web-search/E2B/tool-loop +
app UI/UX so it "just works", no redo). 5 adversarial audits; confirmed findings
tracked here, fixed in batches. DONE = fixed+tested; OPEN = tracked follow-up.

web-search (DONE, commit 8775cf0ab): untrusted-snippet injection delimiters,
result-count + snippet caps, non-http(s) URL rejection, query-truncation signal.

- OPEN WEBSEARCH-GUARD-NATIVE-NOSEARCH (LOW / NOT CURRENTLY REPRODUCIBLE, verified
  2026-07-21): a native-provider model with capabilities.search:false + tools:true
  accepts web_search:true but silently drops it (the 422 honesty guard at
  request-processor.ts:1557 only covers the generic-fallback + non-stream case, and
  `webSearchNeedsGenericTool` is false for anthropic/google/openai). Scanned the
  47-model catalog: ZERO native-provider models have tools:true + search:false, so
  no current model triggers this, it is latent defense-in-depth, not a live web
  blocker. Fix = extend the guard to reject when NEITHER the native NOR the generic
  search tool will attach; do it in the cross-surface web-search hardening slice
  (shared LLM-API code, not web-only), with a catalog-add regression. Not gating web #1.

tool-loop (DONE, commit 5dc1bc40f): read-only classification prefix-only (was
substring, budget_transfer/create_playlist/delete_query misclassified parallel-
safe), provider-stream arg-JSON cap (256KB) + tool-call-per-step cap (32) +
duplicate tool_call id re-mint.

- DONE TOOLLOOP-NO-INFLIGHT-TIMEOUT (HIGH, commit dc0c6e569): per-tool wall-clock
  bound. `withToolTimeout(run, name, 120_000)` wraps every executeTool; a hung tool
  resolves to an error result (never rejects, never runs to SIGKILL) so the loop
  proceeds and the sandbox is paused/killed on the normal end-of-turn path. Tested.
- DONE TOOLLOOP-UNBOUNDED-FANOUT (MED, commit 5f5273edc): read-only calls run
  through `mapWithConcurrency(readOnly, 4, …)` (in-repo worker pool, order-preserving,
  no new dep) instead of `Promise.all` → outbound fan-out capped at 4 in flight. Tested.
- DONE TOOLLOOP-CONTEXT-GROWTH (MED): the accumulated message thread grew every step
  (large tool results × up to maxSteps) with no trim → a long agentic run overflowed the
  model context window mid-loop. Added trimToolResultHistory (tool-loop.ts): before every
  provider call it bounds total tool-RESULT content to ~200K chars, shrinking the OLDEST
  results to a marker (oldest-first) while keeping the 6 most-recent verbatim, and NEVER
  removing a message (so every assistant tool_call keeps its matching result). Wired into
  the main tool loop AND the research loop (research-loop.ts reuses the same exported
  helper, ponytail). 3 unit tests (no-op under budget, oldest-first + pairing preserved,
  multimodal content left alone); full 281-test lib suite green.

E2B (batch mostly DONE, see per-item status):

- DONE E2B-GATE-BYPASS (HIGH): the execution intercept is now guarded by
  `if (!e2bCutoverEnabled())` (tool-loop.ts:1059, flag-only) before routeExecutionTool,
  so E2B_API_KEY present + AGI_E2B_EXECUTION off can no longer run a model-emitted
  execute_code.
- DONE E2B-PAUSE-BY-LOOKUP-LEAK (HIGH): the executor's pause() now pauses THIS
  executor's own captured live sandboxId (never a Redis re-lookup), so a failed/absent
  session write can't leave the just-created sandbox billing to the backstop.
- DONE E2B-NO-USER-QUOTA (HIGH, commit 9cbe21a6c): scoped sandboxes are tagged with
  userId in metadata; getE2BExecutor counts the user's running+paused sandboxes via the
  list-API metadata filter and refuses (fail-closed) at 5 concurrent per user before
  Sandbox.create. Quota-CHECK failure fails open (100-per-team account cap is the hard
  backstop). Tested (6 cases).
- DONE E2B-KILL-BEFORE-DELETE (MED): killE2BSession kills on the captured id FIRST,
  then clears the Redis mapping in finally → no orphan when kill is skipped/throws.
- DONE E2B-TRANSIENT-RESUME-ORPHAN (MED, verified 2026-09-04): a resume failure now runs
  releaseUnreachableSandbox before creating the replacement, in apps/web/lib/e2b/runtime.ts:
  it settles the stranded sandbox's open billable interval, kills it on its captured id, and
  deletes the Redis mapping, all before createFresh() is called. Tested in runtime.test.ts
  ("kills the sandbox it could not reach before creating the replacement", "settles the
  stranded sandbox open compute interval before replacing it"). The row previously described
  this as deferred; the handle-and-kill was already implemented when checked.
- DONE E2B-NO-ORPHAN-SWEEPER (MED, verified 2026-09-04): apps/web/app/api/cron/reclaim-sandboxes/route.ts
  calls reclaimAbandonedE2BSandboxes (apps/web/lib/e2b/reclaim.ts), which lists every
  running/paused sandbox, kills anything past SANDBOX_MAX_AGE_MS (24h) or whose metadata
  scope no longer matches the live Redis mapping, and meters the closed interval first.
  Registered in vercel.json's crons as `45 5 * * *` (daily). The row previously called this
  deferred on Hobby-plan cron limits; the project is on the Pro plan and the cron is
  already live. Fixed in the same pass: reclaiming an orphaned sandbox (one whose
  metadata scope's Redis mapping already points elsewhere) unconditionally deleted that
  scope's mapping even though it named a different, still-live sandbox; the delete is
  now gated on the mapping still pointing at the sandbox just killed.
- MITIGATED E2B-ABORT-NOT-THREADED (MED): @e2b/code-interpreter's RunCodeOpts exposes
  only timeoutMs/requestTimeoutMs, NO AbortSignal (verified against dist/index.d.ts@2.6.1),
  so there is no clean per-execution abort; force-killing the sandbox on abort would destroy
  conversation state. In-flight code is bounded by three layers instead: runCode's 60s
  execution timeout (SDK default), the 120s withToolTimeout wrapper, and the sandbox
  timeoutMs auto-pause backstop. No hacky abort was added.

web UI/UX (status per item; verified 2026-07-19 vs current code):

- DONE WEBUI-REGEN-DELETE-BEFORE-RESEND (HIGH): both the regenerate and the edit-
  resubmit paths deleted the rolled-back turn (server + local) BEFORE the replacement
  send committed, so a send that bailed pre-commit (expired token) or a mid-loop delete
  throw lost the exchange permanently. Fixed with one shared, ponytail helper
  runReplacingSend (features/chat/lib/replacingSend.ts): sendMessage now returns whether
  it committed the new turn; the helper removes the old turn from the LOCAL transcript
  up-front (clean UI), runs the send, and deletes the old turn's durable SERVER rows
  ONLY after commit, restoring the exact transcript verbatim if the send never commits.
  Worst case degrades from data-loss to at-most-duplicate-row-on-reload (reconciled by
  the post-commit server delete). Both WebChatPage edit (sendContent) and regenerate
  route through it; the now-dead deletePersistedMessagesRef bridge was removed. Tested
  (4 ordering cases in replacingSend.test.ts; 95 chat lib+hook tests green).
- DONE WEBUI-AUTH-SEND-SILENT-LOSS (HIGH): useChatStream.ts sendMessage now
  pre-flights the token in a try/catch (setError + return) BEFORE addMessage, so an
  expired/revoked session shows "Your session has expired" instead of silently eating
  the message. Verified in code (useChatStream.ts ~1608-1619).
- DONE WEBUI-MIDSTREAM-SWITCH-SPINNER (MED): streaming is tracked per-conversation
  (web-chat-store.ts streamingConversationIds; setActiveConversation reconciles
  isLoading off that set; selectIsActiveConversationStreaming). Switching away from a
  streaming conversation no longer strands a perpetual spinner; switching back restores
  it. Verified in code.
- DONE WEBUI-APPROVAL-DOUBLE-SUBMIT (MED): resolveToolApproval now claims the resume
  with an atomic check-and-set (if (turn.resolving) return; turn.resolving = true) at
  the completion point, no await between read and write, so two concurrent completing
  decisions (double-click, or last two calls approved together) dispatch exactly one
  /approve POST instead of two. Tested (concurrency test asserts single resume).
- DONE WEBUI-DELETED-CONV-BLANK-BOUNCE (MED): the loadConversation-failure branch now
  captures the store error (the server's 404/403 message) BEFORE setActiveConversation
  (null) resets it and shows a sonner toast.error alongside the router.replace('/chat'),
  so opening a deleted/forbidden conversation gives feedback instead of a silent bounce
  to a blank surface. Verified by typecheck + chat-route tests; no dedicated render test
  (the WebChatPage integration harness is disproportionate for a 3-line toast).

mobile UI/UX (status per item; verified 2026-07-19 vs current code):

- DONE MOBILEUI-VOICE-NO-REPLY (HIGH): the voice screen's handleSend text path
  (chat/[id].tsx) now honors awaitCompletion, when set (the voice caller passes it), it
  returns sendMessage's own promise (resolves at stream completion) instead of the
  onAccepted early-resolve race, so handleVoiceSendMessage reads the completed reply for
  TTS and hands-free re-arms. Direct port of the already-shipped home-screen text path
  ((tabs)/chat.tsx ~279) and the image path in the same file. Typecheck + voice suites
  green; feeds the unit-tested findNewAssistantResponse. FOLLOW-UP DONE (ponytail): the
  identical non-await accept-race is now the shared resolveOnAcceptedSend helper
  (src/features/chat/utils/sendDispatch.ts), used by both the home and conversation
  screens with 4 unit tests. The awaitCompletion path stays inline per screen, the two
  deliberately differ in rejection routing, so unifying it would change behavior.
- DONE MOBILEUI-RECONNECT-QUEUE-WIPE (MED): reconnect flush now resolves each
  placeholder by (conversationId, queueId) (useNetworkStatus.ts ~70;
  chatMessageStore.ts filters only m.offlineQueueId !== queueId), removing the single
  entry instead of wiping all queued messages. Verified in code.
- DONE MOBILEUI-EDIT-BLOCKED-GLOBAL (MED): editMessage now gates on
  streamingConversations.has(conversationId) (chatExecutionStore.ts ~2732), matching
  retryMessage, so a stream in another conversation no longer blocks editing an idle
  one. Verified in code.
- DONE MOBILEUI-OFFLINE-BADGE-FROZEN (MED): the queued-count badge subscribes to
  offlineQueue change notifications (useNetworkStatus.ts ~111-116; every offlineQueue
  mutation calls persistToStorage → notify), so it updates live on enqueue/drain/clear
  rather than only at mount. Verified in code.

2026-07-19 visual/UX parity audit (web vs Claude, mobile vs ChatGPT, 2 read-only
agents reading the reference screenshots vs component code). Concrete fixes:

- DONE UIWEB-ACTIVITY-CHATGPT-PILL (HIGH, commit 1a75c18d4): the canonical
  AgentActivityTimeline collapsed header showed "Working for 12s" / "Done in 8s · 3
  tools" with green/amber status icons, the ChatGPT "Worked for Xm" pattern the founder
  directive explicitly rejects in favor of Claude's inline timeline. Now builds the
  header from the per-step semantic summaries we already carry (no elapsed clock, no tool
  count) and uses monochrome done/check/thinking icons (text-muted-foreground); errors
  stay destructive-colored. Removed the dead per-second liveNow ticker + nowMs prop +
  duration helpers. Tests assert the semantic phrase + absence of any elapsed pill.
- DONE UIMOBILE-NO-VISIBLE-MESSAGE-ACTIONS (HIGH): mobile assistant messages exposed
  ZERO visible affordances, copy/retry/export/delete were only reachable via a hidden
  400ms long-press sheet and reactions via an undiscoverable double-tap. Added an
  always-visible ChatGPT-style action row (copy / regenerate / 👍 / 👎) under completed
  assistant answers (MessageBubble.tsx), reusing the existing copyToClipboard /
  onRetryMessage / onReaction handlers; the active thumb replaces the old standalone
  reaction badge. Brings mobile to parity with the web MessageBubble action bar. Also
  hardened 3 brittle test lucide mocks to a Proxy (any icon → stub) so future icon adds
  can't break them. 10 MessageBubble tests green.
- DONE mobile home layout (FOUNDER DECISION 2026-07-19 = "bottom-anchor, no cards"): the
  new-chat greeting block was vertically-centered (Claude-style); changed the home
  ScrollView contentContainerStyle justifyContent center→flex-end so the greeting sits low
  just above the composer (ChatGPT-mobile composer-focused feel), still NO suggestion/
  starter cards (honors [[feedback-mobile-home-simple]]). (tabs)/chat.tsx. Layout-only.
- DEFERRED (founder-decision, NOT bugs): mobile header ModeToggle is an intentional
  Local/Cloud trust-boundary divergence; streaming indicator (spinning mark vs caret) is
  an intentional brand choice.
- OPEN (LOW, legacy web path): ToolTimeline (the legacy fallback used only when
  !canonicalActivity) renders a double leading icon on non-file tool steps and a weak
  "Result" affordance vs Claude's chip. Legacy path; low priority, tracked with #26
  ToolTimeline safe-delete.

2026-07-19 desktop-shell visual parity audit (Tauri v3 shell vs Claude; the shared
unified-chat chat renderer was audited separately). Concrete fixes + tracked items:

- DONE UIDESK-EMPTY-STATE-MARKETING-CLUTTER (MED): the desktop new-chat empty state
  (features/chat/BrandedGreeting.tsx) stacked an italic platform slogan ("Beyond one
  model. Beyond one surface…") under the greeting, un-Claude marketing clutter on the
  first screen an investor sees. Removed it; kept the time-aware headline + subline +
  brand glyph (Claude = single centered greeting).
- DONE UIDESK-SIDEBAR-GHOST-NEWCHAT + WORDMARK-GLYPH (MED): the sidebar new-chat control
  was a bordered elevated box (border + surface-elevated bg); switched to Claude's ghost
  row (transparent, borderless, hover-fill). The rail wordmark was plain "AGI" text; now
  anchored by the AgiMark brand glyph (shown collapsed + expanded), matching Claude's
  logo-anchored rail. Both in features/v3/Sidebar.tsx; typecheck clean, no new test fails.
- NOT-A-BUG UIDESK-MODEL-PICKER-OPENS-SETTINGS (audit finding refuted, verified in code):
  the desktop composer ALREADY renders the shared Claude-style inline ModelSelector popover.
  Desktop uses the shared ChatInput (no composerSlot override, grep confirms) which renders
  <ModelSelector> from the shared modelStore, and desktop DOES populate that store
  (App.tsx:692 useChatModelStore.getState().setModels(chatModels)). onModelSelectorClick=
  openSettingsDialog('models-keys') is wired to ModelSelector's SECONDARY onSettingsClick.
  the "manage models/keys" link INSIDE the popover, not the picker trigger (Claude has a
  manage affordance too). So clicking the model control opens the inline popover, not the
  settings dialog. The audit conflated the manage-link with the whole picker. No change
  needed. (Almost built/wired a duplicate, verifying the finding first avoided it.)
- DONE UIDESK-ACCOUNT-MENU-HIJACKS-SIDEBAR (MED): the sidebar no longer unmounts
  Projects+Recents when the avatar is clicked. AccountMenu now renders as a floating
  popover anchored above the footer avatar (position:absolute, bottom:calc(100%+6px),
  surface-elevated card + shadow) with a full-window click-outside backdrop, so the
  conversation list stays put (Claude/web behavior). The Projects/Recents `!showAccountMenu`
  guards were removed. Typecheck clean; render verification blocked by the pre-existing v3
  test failure below (a contained JSX/CSS reposition; AccountMenu itself unchanged).
- OPEN UIDESK-NATIVE-WINDOW-DECORATIONS (LOW): tauri.conf.json decorations:true shows the
  standard OS title strip vs Claude's content-integrated flush header; the custom
  features/layout/TitleBar.tsx is orphaned (never mounted). Window-chrome change, higher
  risk, defer.
- DONE DESKTOP-PRICING-DANGLING-IMPORT (was HIGH prod crash): FIXED without guessing any
  billing value. Investigation showed plan.limits.tokenCredits is DEAD data, the desktop
  only ever calls checkUsageLimit for automations/apiCalls/storage (usageSlice.ts), never
  tokenCredits, and no UI reads the field. So the three crashing
  `tokenCredits: getPlanUsageBudgetCents('basic'|'pro'|'max','monthly')` calls were replaced
  with the file's existing `tokenCredits: 0` convention (the local-only/byok/enterprise
  plans already use 0) and the dangling import removed. Zero behavior change (inert field),
  no invented number. The v3 shell test suites now LOAD and pass (16 tests), which also
  retroactively verifies the account-menu float change (45794e009). Original diagnosis
  below kept for history.
- (history) OPEN → the original DESKTOP-PRICING-DANGLING-
  IMPORT: apps/desktop/src/constants/pricing.ts:1 imports { getPlanUsageBudgetCents } from
  '@agiworkforce/types' and calls it at module-top-level (pricing.ts ~130/156/182 plan
  table `tokenCredits: getPlanUsageBudgetCents(...)`). But that fn NO LONGER EXISTS in the
  types SOURCE, src/billing-catalog.ts exports only getPlanPriceUsd/getPlanPriceCents/
  getPlanPriceInr; getPlanUsageBudgetCents now lives web-server-only in apps/web/lib/
  server/managed-usage-policy.ts. It survives ONLY in the STALE committed dist
  (dist/billing-catalog.js); @agiworkforce/types resolves to ./src (package.json main), so
  the import is `undefined` → "TypeError: getPlanUsageBudgetCents is not a function" at
  module init. This is why BOTH v3 shell suites (DesktopShellV3.test/.integration) fail at
  load, and it is a genuine runtime landmine: any desktop build resolving to src (or a
  rebuilt dist) crashes when pricing.ts initializes. Confirmed via git-stash it predates
  this session. FIX (needs care, billing values): desktop must stop importing a web-
  server-only fn; source the plan `tokenCredits` from a shared/desktop-safe value or drop
  the field if vestigial. NOT guessed here, needs the intended per-plan token-credit
  numbers (founder/billing SSOT), not a hallucinated constant. Blocks all v3-shell render
  tests until fixed. CONFIRMED intentional removal (not an accident to just re-add): the
  budget data source is gone too, src/**tests**/billing-catalog.test.ts:29 asserts the
  plan object does NOT have `monthlyUsageBudgetUsd`, and getPlanUsageBudgetCents now lives
  server-authoritative in web's managed-usage-policy. So this is a client-side MIGRATION
  decision (what should desktop plan.limits.tokenCredits be post-server-authoritative-
  budget?), NOT a restore of the removed fn. Founder/billing call required.
  SEVERITY CONFIRMED = real PROD crash (not test-only): apps/desktop/vite.config.ts has NO
  @agiworkforce/\* resolve alias and the package's exports/main both point to ./src/index.ts,
  so BOTH the production Vite build and the vitest env resolve @agiworkforce/types to source
  (where the fn is absent), the module-init throw ships to prod, it is not a test artifact.
  Corollary: a "fix" that only aliases the test env to ./dist would dishonestly mask the
  prod crash and is NOT acceptable. The only correct fix is the client-side billing
  migration decision above. (Likely unnoticed so far only because there are ZERO current
  users and the pricing/gating path may be lazily imported.)
- DONE DESKTOP-PLANCARD-TIER-MAP-INCOMPLETE (MED, was a real tsc error): PlanCard.tsx's
  TIER_CONTENT was Record<UIPlanTier, TierContent> but missing enterprise/free/max_15x/team
  (the union grew, the map didn't) → desktop tsc error. Fixed WITHOUT inventing product
  copy: TIER_CONTENT is now Partial<Record<...>> and PlanCard null-guards a missing entry
  (returns null). Those tiers are filtered out of PlansModal's VISIBLE_TIERS anyway
  (isPlanSelectableOnSurface(..., 'desktop')), so nothing renders blank. Desktop `tsc`
  --noEmit is now 0 errors (was red all session). max_15x/team card copy, if ever shown on
  desktop, is a founder/product-copy follow-up, not invented here.
- DONE DESKTOP-BASIC-TIER-SURFACE-CONTRADICTION (MED): FOUNDER DECISION 2026-07-19, Basic
  is available on ALL surfaces (config PLAN_SURFACE_VISIBILITY.basic=['web','desktop','mobile']
  was correct; the desktop test + PlanCard comment were stale). Flipped PlansModal.test to
  expect Basic SHOWN on desktop and updated the PlanCard comment; the red test is now green
  (8/8). Also: founder set Basic price to $7/mo (not $8); the catalog already read $7
  (billing-catalog.ts basic.monthlyPriceUsd:7, INR 399), so all DISPLAYS already show $7.
- OPEN (FOUNDER/STRIPE, not code) BASIC-STRIPE-PRICE-7-VS-8: the Basic catalog/display price
  is $7 but the Stripe price OBJECT is $8 (desktop pricing.ts basic_monthly_usd = a test-mode
  $8 price; web checkout uses env-var Stripe IDs STRIPE_PRICE_BASIC_MONTHLY_USD). Whichever
  surface actually charges must point at a $7 Stripe price. Requires creating a $7 Stripe
  price (test + live) and updating the env var / desktop reference, a founder Stripe action
  (code must not create Stripe prices). Desktop IDs are unused reference metadata (checkout
  is web-only), so no desktop charge mismatch; the live risk is web's env-configured price.

2026-07-19 cross-surface parity audit (desktop / CLI / VSCode / Chrome extension.
3 read-only agents, findings verified at cited file:line). These 4 surfaces are NOT
covered by the web/mobile qa-reference doc; the audit hunted concrete demo-blocking
code gaps (not founder-gated / not style):

- DONE DESKTOP-WEBSEARCH-FAKE-AVAILABILITY (HIGH, commit fb62bae3b): the generic
  search*web client tool was gated on capabilities.search (tools.rs required_model*
  capability), so on models without native provider search, toggling web search
  silently did nothing. But search_web is
  backed by the KEYLESS SearchExecutor (Perplexity if configured, else DuckDuckGo +
  Brave-HTML fallback, search_executor.rs run_search_with_app_handle), so it works for
  any tool-capable model. Now only the Anthropic-native web_search server tool is
  search-gated; generic search_web reaches every tool-capable model. 2 Rust tests.
- DONE CLI-TAVILY-GET-NOT-POST (LOW, founder-key-gated): apps/cli
  src/features/exec/tools/web/mod.rs branched the request by provider, Tavily now POSTs
  a JSON body {query, max_results (clamped 0–20), search_depth:"basic"} via the shared
  tavily_search_body helper (verified against docs.tavily.com), while Brave keeps its
  GET+query-params path. Previously both used one GET, so the Tavily branch errored
  whenever TAVILY_API_KEY was set. 2 Rust tests lock the body contract; cargo check +
  module tests green. (The raw-body-to-model note is unchanged; both providers pass
  results through the existing untrusted-content wrapper.)
- CORRECTED VSCODE-BYOK: the earlier "no BYOK UI" finding was PARTLY WRONG (researched
  2026-07-19, founder asked). TRUE provider BYOK (your own Anthropic/OpenAI/Google/xAI/
  DeepSeek/… key, 16 providers) ALREADY WORKS in VSCode: the extension's local chat spawns
  and delegates to the `agi app-server` (localRuntimeClient.ts:593), the same Rust binary as
  the CLI, which supports BYOK via `agi login <provider>` (real per-provider wire routing).
  So keys configured in the CLI are used by VSCode chat automatically, no VSCode key entry
  needed. SEPARATELY, VSCode DOES have a palette command `agi-workforce.setApiKey`
  (commandSetup.ts:335, package.json:112) that stores an AGI-ISSUED api key (sk-agi-…, a
  first-party managed-cloud Bearer), used by inline features + as the getAuthToken
  fallback. The stale utils/api.ts comment ("no UI sets it anymore") was corrected. REMAINING
  GAP (product decision, if desired): no VSCode-NATIVE command to register a THIRD-PARTY
  provider key from inside the editor (today you use the terminal `agi login`). Building one
  = a "Set provider API key" command that writes to the app-server's provider config. Not
  required for BYOK to function; it's an in-editor convenience.
- HISTORICAL: SUPERSEDED 2026-08-02, OPEN
  VSCODE-CHAT-REQUIRES-CLI-BINARY (MED, packaging): both VSCode chat surfaces
  spawn `agi app-server` (localRuntimeClient.ts ~593; default cliPath 'agi'), so on a
  machine without the CLI on PATH every send returns a VISIBLE "local runtime
  unavailable" error (not a hang). The current contract is an explicit,
  separately installed signed CLI prerequisite or `cliPath`; the extension does
  not bundle or download it. The unresolved public distribution gate is tracked
  at the top of this ledger.
- VERIFIED-CLEAN (this audit): Chrome extension (apps/extension), 1105 tests pass,
  the old computer-use allow-all P0 is remediated (policy.ts EXTENSION_PAGE_ONLY +
  default-ON approval gate + origin re-validation), no open BROKEN path or live leak;
  remaining items are product scope (job-autofill-only computer use) or tracked
  low-sev residuals (EXT-MIRROR-TEST-FAKE-COVERAGE-01, EXT-CLOUD-INVITE-RESIDUAL-01).
  Desktop chat/stream/stop/tool-loop/artifacts/code-exec/error-toasts and CLI's six
  capabilities were verified at that checkpoint. HISTORICAL, SUPERSEDED
  2026-08-02: the earlier claim that Desktop Cloud stayed "coming soon" is no
  longer current; Managed Cloud is public alpha and open by default. The current
  deterministic ownership proof and external live gates are recorded at the top
  of this ledger. TOOLLOOP-CONTEXT-GROWTH remains the shared open agentic risk
  from that checkpoint (mid-loop context trim, MED).

2026-07-19 QA-docx systematic cross-reference (backend 470-case + Claude cases +
mobile 400+-case reference docx walked section-by-section vs code, 4 parallel
audit agents). Capability surfaces (search/tools/connectors/MCP/research/files/
E2B/artifacts, model routing/streaming, memory/projects, billing/usage, cross-
surface sync) audited PRODUCTION-GRADE, SSRF guards, server-recomputed
checksums, fail-closed tool approval with server-owned args, atomic usage
reservation, delta-sync CAS all genuinely implemented. Three concrete gaps found
and fixed; two flagged backend items verified INTENTIONAL (no change):

- WEB-CONV-PROJECT-MOVE-OWNERSHIP-01 (Fixed): PUT /api/chat/conversations/[id]
  wrote `projectId` verbatim with no ownership check, a client could tag a
  conversation to a foreign/deleted/nonexistent project UUID (dangling ref).
  Now verifies `user_projects` ownership (is_archived=false) before the move,
  mirroring the create route; clearing (projectId null) still allowed. Tests in
  chat-conversation-single.test.ts.
- WEB-PROJECT-KNOWLEDGE-CAP-SILENT-01 (Fixed): project knowledge retrieval reads
  only the MAX_KNOWLEDGE_FILES (20) most-recent files, but ingest had no cap.
  files 21+ silently vanished from every project turn's context. Ingest now
  enforces the same exported cap (409 conflict, fail-fast before extraction);
  table-missing still maps to the pre-migration 503. Exported MAX_KNOWLEDGE_FILES
  as the shared SSOT. Tests in knowledge-files/**tests**/route.test.ts.
- ERROR-CONFLICT-MESSAGE-SWALLOWED-01 (Fixed, surfaced by the above): the API
  error handler's SAFE_TO_EXPOSE_CODES omitted CONFLICT, so every
  createError.conflict() user-facing message ("already at the file cap", "slug
  already taken", "already a member", "already have a custom connector") was
  flattened to a generic "Conflict". Added CONFLICT to the allow-list (app-
  defined messages, not a SQL/service-leak vector, same rationale as
  VALIDATION_ERROR).
- MOBILE-THUMBS-FEEDBACK-DEAD-CONTROL-01 (Fixed): assistant thumbs rating
  (double-tap) called onReaction, but the chat screen rendered MessageList
  WITHOUT the onReaction prop → a no-op; the badge lived in useRecyclingState so
  it vanished on FlashList row recycle. Now: setMessageReaction persists the
  rating into message.metadata.reaction (survives recycle/reload), MessageBubble
  seeds from that metadata, and Cloud conversations PATCH the SAME
  /messages/[messageId] endpoint the web app uses (cross-surface parity). Tests
  in cloud-message-mutations.test.ts.
- WEB-LEGACY-FINISH-REASON-NONOPENAI (Intentional, NO fix): legacy-web wire
  passes Anthropic/Google `max_tokens`/`refusal`/`stop_sequence` through as
  literal finish_reason instead of OpenAI vocab. Deliberate + test-pinned
  (openai-wire-compat.test.ts asserts literal 'refusal'); AGI's own client
  understands it (CONTINUABLE_FINISH_REASONS includes both). Exposure limited to
  third-party OpenAI-SDK consumers; left as-is per capability-honesty (don't
  fight documented, tested behavior).
- WEB-EFFORT-SILENT-NORMALIZE (Intentional, NO fix): unsupported reasoning effort
  is normalized to model default rather than 400-rejected. Defensible and
  consistent with the mobile client (which drops unsupported effort client-side,
  MOBILE-EFFORT-DROPPED-01).

2026-07-19 QA-parity audit fixes (backend + mobile QA docs vs code). The web
surface audited SOLID for model routing/streaming/tools/connectors; one web + three
mobile concrete gaps fixed:

- `WEB-WEBSEARCH-NONSTREAM-SILENT-01` (Fixed): non-streaming `web_search:true` on a
  generic-fallback provider attached NO search tool (native branch N/A, generic
  fallback needs streaming) and answered without browsing. Now request-processor
  returns 422 `web_search_stream_required` BEFORE reserving credits.
- `MOBILE-EFFORT-DROPPED-01` (HIGH, Fixed): the model picker's reasoning-effort
  selection was silently dropped, effort rode only `if (thinkingEnabled && …)` but
  the effort chips render independently of the (default-off) Thinking toggle, and
  none/minimal were coerced to undefined. New pure `resolveTurnEffort` sends the
  picked effort for `effort_levels` models regardless of Thinking, drops
  unsupported (stale cross-model) values, and forwards none/minimal when supported
  (server accepts any effort string).
- `MOBILE-IMAGEGEN-DEAD-TOGGLE-01` (Fixed): the "Image generation" toggle was dead
  (nothing read `features.imageGen`; also rendered in Local). Now natural-language
  auto-routing to the media route is gated on the toggle (OFF disables it; /image
  still forces it), and the row is Cloud-only.
- `MOBILE-ATTACHMENT-NOVALIDATION-01` (Fixed): attachments were appended with no
  validation and unsupported/oversized files became silent empty stubs. New
  `validateAttachments` (reusing docParser's `isParseableDocument`) rejects
  unsupported types + files > 25 MB up front with a specific Alert, keeping valid
  ones. Each fix has unit tests.

2026-07-19 Mobile GitHub connector connect flow
(`MOBILE-GITHUB-CONNECT-01`, Fixed in repo): tapping GitHub in mobile connectors
showed only a "coming soon" alert. GitHub uses a GitHub-App installation with a
Clerk-cookie web flow (`/api/github/install/start` → GitHub install → callback →
`github_installations`). Rather than reimplement OAuth state/CSRF on the client
(the risky path), mobile now opens that VETTED web flow in a browser
(`expo-web-browser` → `getGitHubInstallWebUrl()`), then refreshes its connector
list on return so the new installation appears (GET /api/connectors derives GitHub
state from `github_installations`). No new server endpoints, no CSRF changes. 1
test on the URL. RESIDUAL: the user completes the install in a web browser session
(signing into the web app there if needed), the standard mobile-reuses-web-OAuth
pattern; a fully native install-start would need a Bearer-auth endpoint + non-cookie
server state (separate slice). Generic OAuth providers still need FOUNDER OAuth-app
registrations.

2026-07-19 Mobile custom remote-MCP connector add
(`MOBILE-CUSTOM-MCP-ADD-01`, Fixed in repo): mobile Cloud connectors could only
list/disconnect and 501 on OAuth, there was NO way to add a connector. Mobile
now has an "Add custom MCP" flow (`AddCustomConnectorModal` + `addCustomConnector`
service) that reuses the SAME server route the web app uses
(`POST /api/connectors/custom`), which validates the HTTPS MCP URL (public host,
no embedded creds) and enforces the per-tier limit, so it needs NO OAuth app
registration and works today; the connector's tools reach models as
`mcp__custom-<shortId>__<tool>`. 4 unit tests (service payload trimming +
https pre-check). RESIDUAL: generic OAuth providers (Slack/Gmail) still 501 (need
FOUNDER OAuth-app registrations); GitHub App-install browser flow on mobile is a
separate slice.

2026-07-19 Custom-connector activity badge and summary
(`CONNECTOR-BADGE-CUSTOM-NAME`, Summary shows real name / badge initial DEFERRED):
a user's custom remote connector executes as `mcp__custom-<shortId>__<tool>`,
where the serverId is an opaque `custom-<hex>` id carrying no human name. The
Claude-style activity feed derived its badge letter and summary label from that
serverId, so EVERY custom connector rendered a wrong "C" badge (from "custom-")
and a leaked-id summary ("Using Custom A1b2c3d4e5 connector"). FIXED (no contract
change): (1) `connectorInitial` (unified-chat `AgentActivityTimeline`) and
`mcpServerLabel` (web `tool-loop.ts`) detect the `custom-` namespace and stop
emitting the misleading id-derived output; (2) the connector's REAL display name
(`user_custom_connectors.name`) is now threaded web-internally, `row.name` →
`catalogToConnectorToolDefs(catalog, row.name)` → `WebMcpToolDef.serverLabel` →
`offeredServerLabel` → `canonicalToolSummary`/`canonicalApprovalSummary`, so the
activity feed reads "Using Notion connector" / "Review Notion action" with the
real name, no versioned-contract change. Named servers unchanged (github →
"Using GitHub connector"). Tests: AgentActivityTimeline connector-badge cases +
`tool-loop.summary.test.ts` (incl. the serverLabel path). RESIDUAL DEFERRED: the
BADGE letter is still the generic "M" for custom connectors, showing the real
INITIAL needs the display name on the versioned agent-event tool schema →
`AgentActivityEntry` (the badge reads `entry.name`, the raw tool id). That event
field is the "new model-emitted field, NOT blind" work under task #25.

2026-07-19 Deployment topology + backend duplication
(`SVC-DEPLOY-TOPOLOGY-VERCEL-SINGLE`, Documented / gateway decision PENDING):
production is ONE Vercel project (Hobby plan) running the Next.js app
(`apps/web`), which serves every live flow, web chat, mobile cloud chat
(`/api/llm/v1/chat/completions`), sync, credits, usage, auth, device-auth,
agents, mcp, models. Data = Neon; auth = Clerk; rate-limit = Upstash serverless
(`@upstash/ratelimit`, free tier, NOT a self-hosted Redis). Domains (all alias
the same deployment): `agiworkforce.com` (primary, also the mobile
`EXPO_PUBLIC_API_URL` base) and `api.agiworkforce.com` (the OpenAI-compatible
`/v1/*` surface, host-rewritten in `next.config.ts` to `/api/llm/v1/*`) are
USED; `chat.agiworkforce.com` has NO code-level host routing (serves the
homepage, not the chat app, unwired vestigial alias, redirect it to `/chat` or
drop it); `agiworkforce.vercel.app` is the platform-default fallback.
The Express api-gateway was DELETED on 2026-08-17 (founder decision). Its REST
routes (chat/sync/credits/llm/usage/models) duplicated the Next.js routes, and
its only live web references (2 `/api/v1/providers` proxy routes and
`lib/mcp-client.ts`) had already been removed as dead code in commit 136285075.
`services/signaling-server` survives and IS deployed, `agiworkforce-signaling.fly.dev`
on Fly.io, because it holds two concurrent WebSocket sockets for mobile-companion
WebRTC pairing, which Vercel serverless structurally cannot host. It is still only
exercised by remote-control/companion, which is flag-gated off (`companion:false`),
so it is not required for the demo. Node is pinned to 22 intentionally everywhere (`engines`, `.nvmrc`,
CI); the Vercel "Node override" matches that pin. A move to 24 must bump all
pins together with a green build, not the Vercel setting alone. NOTE: none of
this ships until `chore/repo-restructure-2026-07` (132 commits ahead of
`origin/main` @ 08f96db) merges to main.

2026-07-19 Mobile live artifact preview (`MOBILE-ARTIFACT-PREVIEW-01`, Fixed in
repo for html/svg): mobile previously showed only a placeholder for previewable
artifacts (HTML/SVG/mermaid), the prior SECURITY NOTE said no sandboxed WebView
existed. Now `SafeArtifactPreview` renders HTML and SVG LIVE in a hardened
WebView: `javaScriptEnabled={false}` (embedded scripts cannot run), no
`onMessage`/`injectedJavaScript` (RN bridge not exposed), a strict CSP
`default-src 'none'; style-src 'unsafe-inline'; img-src data:` (blocks all network
egress), `originWhitelist={[]}` + navigation rejected. The security-critical
document builder is a pure module (`sandboxedArtifactHtml.ts`) with 4 tests
asserting the CSP + no script-src. Mermaid now ALSO renders live via
`buildMermaidPreviewHtml`: a separate, tighter sandbox: JS enabled ONLY to run
the trusted PINNED mermaid CDN (`script-src` limited to that one origin, still NO
RN bridge), the untrusted diagram source injected as a JSON data literal with `<`
escaped to `<` (a security test caught + guards the classic `</script>`
break-out) and rendered with mermaid `securityLevel:'strict'`. RESIDUAL: jsx/tsx
need compilation and keep an honest "source only" note; mermaid fetches the pinned
library from jsDelivr on first render (a minor external dependency for cloud-mode
diagram previews; could be bundled locally later).

2026-07-19 Mobile non-image attachments were reference stubs
(`MOBILE-DOC-ATTACHMENT-STUB-01`, Fixed in repo): a non-image attachment reached
the model as only a `[Attached file: name (mime)]` reference, its CONTENT was
never included (chat was blind to the document). Now wired to REUSE the existing
on-device `parseDocument` (services/docParser.ts, pdf/txt/md/csv/code, already
tested) via a small `services/attachmentContext.ts` helper: supported documents
contribute their real extracted text (capped at 100k chars); unsupported/binary
formats (docx, zip, …) fail closed to an honest reference with NO fabricated
content. 4 unit tests. RESIDUAL: docx and other binary office formats still need a
parser (docParser handles pdf but not docx); images continue to use the existing
OCR (local) / image_url (cloud) paths.

2026-07-19 Mobile Deep Research dispatch (`MOBILE-DEEP-RESEARCH-DISPATCH-01`,
Fixed in repo): mobile Cloud had only a cosmetic `research` ChatMode prompt (no UI
selector, `setChatMode` had zero callers) and sent NO `research` flag, so the
server's Deep Research loop never ran on mobile. Now wired end-to-end, reusing the
existing server support: `FEATURES.research` + `ChatFeatures.research` +
`StreamRequest.research`; `chatExecutionStore` computes `researchEnabled`
(mirroring `webSearchEnabled`, gated on the selected model's `research` AND
`search` capabilities + a paid tier) and sends `research: true`; AddToChatSheet
shows a capability+tier-gated "Deep research" toggle (cloud-only). Server + inline
citation/agent-activity rendering already existed. 3 gating tests + full mobile
suite green. Also fixed a pre-existing stale Qwen Plus generation in a test by
deriving the current catalog entry; it had been failing the
web-search-generic-backend assertion.

2026-07-19 Cross-surface dedup audit outcome (`DEDUP-AUDIT-2026-07-19`): a
reuse-first audit of usage / models / chats / memory / settings across
web/mobile/desktop/CLI/VS Code found that the suspected duplication is LARGELY
ALREADY CONSOLIDATED, model catalog (`@agiworkforce/types` `model-catalog.ts`
`getModelsForTierAndSurface`/`getModelMetadataById`, no hardcoded rosters), sync
reducers (`@agiworkforce/sync` Wave-4), memory engine (`@agiworkforce/agent-core`),
usage contract (`managed-usage-balance.ts`), and settings gating
(`@agiworkforce/sync` `mergeCloudSafeSettings`/`rebase…`, reused by BOTH mobile AND
desktop, the handoff's "Desktop/Web do not share one canonical typed projection"
is STALE for the gating layer) are all shared and reused. INTENTIONAL, do NOT
dedup: desktop Rust `cloud_sync.rs` (cross-language parity via golden fixtures),
desktop `BudgetStatusWidget` (separate local daily-spend IPC), per-surface settings
FIELD projection + per-surface warning thresholds (different denominators/UX),
Local/BYOK/Cloud separation. Remaining TRACKED items (not safe blind merges):
(1) `DEDUP-VSCODE-USAGE-SCHEMA-01` (Low/optional), `apps/extension-vscode/src/
protocol/apiResponses.ts` `TierInfoSchema` re-declares a lenient subset of the
`/api/usage` `ManagedUsageSummaryResponse`; only swap to the shared strict
`parseManagedUsageSummaryResponse` if `/api/usage` is guaranteed to always return
the full shape, else keep lenient. (2) `DEDUP-MEMORY-CATEGORY-3WAY-01` (Medium).
`MemoryCategory` is modeled 3 incompatible ways (`types/memory.ts` 7 literals;
`agent-core/memory.ts` 6, the runtime one; desktop `memoryStore.ts` 4); reconcile
onto one canonical set in `@agiworkforce/types`, needs a product decision on the
set, not a blind merge. Also within-web: `chat-store.ts` + `web-chat-store.ts` each
redeclare `Message`/`Conversation` (possible legacy `web-chat-store`; web owner to
confirm). DONE from this audit: deleted the dead mobile cloud-consolidation branch.

2026-07-19 Mobile cloud auto-memory pre-success + duplication
(`MOBILE-CLOUD-AUTOMEMORY-PRESUCCESS-01`, Fixed in repo): mobile
`chatExecutionStore` fired `consolidateFactsFromTurn` from the user's message
during send-setup, BEFORE the assistant turn succeeded and regardless of outcome,
in BOTH local and cloud modes. For cloud mode this also DUPLICATED the managed
server's own auto-memory (`recordManagedAutoMemoryTurn`, which persists the same
conservative user-authored facts but only on `outcome === 'completed'`, with no
surface gating so it already covers mobile, verified). Fix: a pure
`shouldConsolidateMemoryOnClient({executionMode, isTemporaryChat})` gate now
restricts client consolidation to LOCAL, non-temporary turns; cloud auto-memory
is server-owned (matching web). Regression tests cover the truth table. The
now-unreachable cloud branch of `consolidateFactsFromTurn` (+ its cloud-memory
write path and `executionMode` param) has since been DELETED in the memory dedup
pass, `consolidateFactsFromTurn` is now on-device-only. RESIDUAL: local
consolidation still runs at send-setup rather than on-completion (acceptable.
on-device, user-authored; the handoff only required replacing the cloud branch).

2026-07-19 Per-model tools capability gate for connectors/MCP
(`WEB-TOOLS-MODEL-CAP-GATE-01`, Fixed in repo): the managed completions
streaming path loaded operator MCP tools + per-user connector tools and entered
the agentic tool loop for ANY model, with no check against the selected model's
registry `tools` capability. The two catalog-selectable Perplexity search
models are the only `tools:false` models in the 20
selectable chat models, with a connected connector shipped function-calling
tool definitions to a model that cannot do function calling, so the provider
rejected the whole request. The office-creation, skill, and E2B paths already
4xx for `tools:false`; connectors/MCP did not. `route.ts` now reads
`getModelMetadataById(model).capabilities.tools` and skips MCP + connector tool
loading when it is false, so those models fall through to the standard
single-turn path (search-native models still answer; connectors/MCP are simply
not offered). Verified: a streaming Perplexity search-model request no longer
calls
`loadMcpToolDefs`/`loadUserConnectorToolDefs` and returns 200. RESIDUAL: the
`research` capability flag is decorative server-side, research mode is gated on
`search`, so the xAI, Zhipu, and DeepSeek research-capable entries (`research:true`,
`search:false`) get no research; and the 7 fallback-group chat models
(deepseek×2/qwen×3/grok/glm, `tools:true`/`search:false`) can only web-search
when BOTH the client `generic_web_search` feature flag and server
`PERPLEXITY_API_KEY` are set (tracked, next slices).

2026-07-19 Conversation run concurrency guard (`WEB-RUN-CONCURRENCY-01`, Fixed in
repo): a new managed completion turn for a conversation with a still-active
(`running`/`queued`, not cancelling) run previously created a SECOND parallel
`cloud_agent_runs` row and provider/tool loop, the schema's `conversation_id`
index is non-unique and nothing coordinated it, so two paid runs could bill the
same conversation at once. `beginCloudAgentRun`
(`apps/web/app/api/llm/v1/chat/completions/route.ts`) now calls
`findActiveCloudAgentRunForConversation` before creating a run and returns 409
`conversation_run_in_progress` (refunding the just-made reservation) when the
conversation already has an active run. The guard excludes the caller's own
idempotent retry (`request_id`) and cooperatively-cancelling runs
(`cancellation_requested_at is null`), so a stop-then-send follow-up is never
rejected; approval-resume is unaffected (it re-enters the same run via a separate
route, not `beginCloudAgentRun`). The CLIENT half (slice a2) is now wired: the web
composer keeps the textarea enabled during streaming (type-ahead), queues a
follow-up composed mid-turn, shows it as a pending chip (cancellable), and
auto-sends it when the turn finishes, so the client never fires a second
concurrent turn (the Stop button stays reachable; the previously dead `'queue'`
send-button branch was removed). RESIDUAL: Desktop/Mobile Cloud should consume the
same 409 contract (slice a3); Work/Cowork background-run steering (redirect/steer
into a live run) is deferred. No migration was added: the guard reuses existing
`cloud_agent_runs` columns.

2026-07-18 Website billing/metering truth (`WEB-BILLING-TRUTH-01`, Fixed in
repo; production and founder gates remain): public prices, surface visibility,
capabilities, project/MCP limits, and relative usage labels now come from the
shared billing catalog; exact managed allowances live only in the server-side
usage policy. Public usage routes return only percentages, reset times, and
whether usage remains, and Web, Mobile, and VS Code consumers read that
percentage contract (VS Code via `/api/usage`). Desktop still renders stale exact
token/cost usage and is NOT yet converged, the founder release order puts its
billing convergence after Website and Mobile. Free is paced by one
private daily allowance with a durable atomic reservation before provider
execution, idempotent settlement, and release on completed, failed, cancelled,
and zero-usage requests. Paid upgrades use a Stripe replacement cycle with
time-based proration and pending-payment activation; the canonical paid webhook
carries already-spent subscription and rolling-window usage into the higher
plan rather than resetting it. Paid five-hour, weekly, and flagship-weekly
spend windows warn at 80% and hard-stop at 100%; the financial reservation
serializes per tenant and includes the estimated in-flight request before any
provider call, so concurrent requests cannot use the same remaining allowance.
Project creation/sync and custom MCP discovery
enforce the same Free 1/1, Basic 5/5, Pro and Team 25/25, and Max unlimited
limits. Remaining gates: migration `0065_free_daily_usage_budget.sql` must be
applied after `0064`, then `0066_managed_usage_rolling_caps.sql` must be applied
after `0065` before these reservation paths are deployed; all configured Stripe
Prices and their currency options must be verified; Stripe Customer Portal
subscription changes must be disabled or configured so they cannot bypass the
replacement-cycle upgrade route; production webhook/payment-method/SCA behavior
needs sanctioned non-production and then founder-authorized production QA.
Multi-step managed tool loops now extend the reservation before every provider
turn: `runToolLoop` calls `reserveManagedUsageProviderStep` (SQL
`extend_managed_usage_request_provider_step` in `0066`) before egress on both the
synchronous completions route and the durable cloud-agent workflow, using the
stable global `provider:<step>` key so restart/replay is idempotent, failing
closed when a rolling five-hour / weekly / flagship-week / billing-period limit
is reached, and finalize settles the extended total to actual. RESIDUAL: external
per-call tool fees (generic web search, E2B sandbox execution) are still NOT
included in the managed reservation, so a long tool-heavy loop can exceed the
rolling ceiling by those fees; and the whole path stays inactive until migration
`0066` is applied. No migration, deploy, Stripe setting, or production data was
mutated in this run.

2026-07-19 Commercial + security convergence slice (Fixed in repo; production
and founder gates remain):

- Managed multi-step reservation extension wired into the real tool loop (see
  `WEB-BILLING-TRUTH-01` above). Residual: external tool fees + undeployed `0066`.
- P0 Mobile IAP private-allowance leak was fixed in the former prototype
  (`MOBILE-IAP-ALLOWANCE-LEAK-01`). On 2026-07-30 that unreachable,
  placeholder-backed client/server slice was removed completely; native store
  billing stayed Missing until the founder's 2026-08-11 approval. The new
  implementation is catalog/config-driven with no guessed store IDs and owns
  server verification plus lifecycle notifications; real products and store
  credentials are still an external release prerequisite.
- P0 developer-surface entitlement bypass fixed at the exploit vector
  (`DEV-SURFACE-ENTITLEMENT-BYPASS-01`): the API gateway binds the required
  capability to a TRUSTED, verified-issuer surface class, first-party
  device-authorization tokens ⇒ `developer_surfaces` (Pro+); Clerk app tokens ⇒
  `managed_chat`: stamped `surface:'developer'` at both device-token mint sites
  and enforced in `planGate` + the LLM proxy. RESIDUAL (`DEV-SURFACE-WEB-CLAIM-01`,
  P1): the web `/api/llm/v1/chat/completions` route still classifies Clerk-token
  clients by the caller `x-agi-surface`/`x-client` header (advisory). Developer
  clients (CLI/VS Code) authenticate via first-party device tokens (now gated) or
  the unspoofable chrome-extension origin, so the residual is a Clerk session
  token lacking an issuance-time surface claim; durable fix = a signed surface
  claim in the Clerk JWT template.
- P0 Mobile usage migrated to the percentage-only contract
  (`apps/mobile/services/usage.ts` + the cloud-usage screen): no `$NaN`, no exact
  dollars, validated via `parseManagedUsageSummaryResponse`. The former Mobile
  IAP catalogs were first corrected and gated
  (`MOBILE-IAP-PLACEHOLDER-GATED-01`), then removed on 2026-07-30 because every
  SKU remained a placeholder and no store products existed. Native billing was
  reintroduced on 2026-08-11 only behind exact operator-supplied product maps;
  an unconfigured build remains visibly unavailable rather than representing
  placeholders as purchasable products.
- P1 VS Code usage rewired from the dead `/api/auth/me` (route does not exist in
  `apps/web`) to canonical `/api/usage`, rendering a percentage and dropping the
  exact token/cap client fields, type, sidebar meter, and UI.
- P1 API gateway `/models` tier ladder regenerated from the canonical catalog
  (removed `pro_plus`; accepts free/basic/pro/max/max_15x/team/enterprise via
  `normalizeSubscriptionAccessTier`).
- P1 `MODEL-CATALOG-TIER-POLICY-OWNER-01`: `model-catalog.ts` `TIER_POLICIES` is a
  routing/compat shape (collapses basic→pro, max_15x→max) and is NOT the
  entitlement SSOT, the real money/access gates (image/video/managed) use the
  canonical billing catalog `canUseBillingPlanCapability`. Convergence of this
  second owner (consumed by the capability handshake + Desktop) is deferred:
  risky and Desktop-Rust-unverifiable in this environment. A clarifying comment
  was added at the `TIER_POLICIES` export.
- `PROVIDER-REMOVAL-REPO-WIDE-01` (tracked, NOT in this commit): banned-provider
  and retired-model removal is complete in the authored registry but not
  repo-wide (Desktop Rust/UI transports, a retired image-family alias, CLI Cohere/Together
  discovery mappings, arbitrary custom endpoints). Per the handoff this is an
  isolated follow-up slice (centralized denylist + repo-wide production-reference
  guard) to land after this billing/security commit.

Verification for this slice: focused TS suites pass in-session, web vitest
(tool-loop e2e, managed-usage service + migration-contract, mobile-iap-verify
privacy, route managed-failover), api-gateway vitest (full suite 251 passed),
mobile jest (cloud-usage, IAP flow, paywall, billing-off), VS Code vitest
(tierStatus), with web/mobile/gateway/vscode `tsc --noEmit` clean. NOT run in
this environment: cargo/Rust checks (Desktop/CLI/crates are not buildable here)
and live browser QA (requires the Neon/Clerk/Stripe runtime behind `.env.local`).
No migration, deploy, Stripe setting, or production data was mutated.

2026-07-18 Website Reflect gap (`WEB-REFLECT-01`, Partially remediated):
Website Settings now exposes an on-demand Reflect recap for 30-, 90-, 180-,
and 365-day ranges. The owner-scoped server service requires the account's
Memory and Generate from past chats capabilities, excludes Temporary Chats and
Managed Cloud AGI Work runs, bounds raw-history reads to the 1,000 most recent
eligible conversations, and returns only aggregate activity, broad topic
labels, and four non-scoring observations. It reuses the production
conversation classifier instead of copying keyword rules, never sends chat
content to another model, does not consume model quota, and does not persist a
second recap artifact. The exact conversation total remains distinct from
sampled activity/topic/behavior patterns. Remaining release-order gaps: no
persisted or shareable recap artifact, user feedback loop, cross-device active
time aggregation, or Desktop presentation exists; accounts over the bounded
sample receive sampled day/hour statistics; and a future health-data
integration must be explicitly excluded before Reflect may read it. Continue
Mobile and Desktop work in the founder's order and reuse the managed-cloud
contract and server service instead of adding client-side history analysis.

2026-07-18 Website time-and-focus gap (`WEB-TIME-FOCUS-01`, Partially
remediated): Website Settings now persists one validated `time-focus` account
namespace with an optional visible-use break interval and timezone-aware quiet
hours. The live Website chat consumes that setting: quiet hours show a gentle,
dismissible Continue / Come back later prompt and never lock the user out;
break time advances only while the tab is visible, is isolated by account, and
nudges once per selected threshold per local calendar day. Malformed settings
and blocked browser storage fail closed without interrupting chat. The clock
window evaluator lives in `@agiworkforce/types` and Mobile's existing
device-notification preference store now reuses it instead of maintaining a
second overnight-range algorithm. Remaining release-order gaps: the elapsed
break counter is browser-local rather than aggregated across devices; Mobile's
existing quiet-hours UI is still device-local notification suppression and
does not yet consume the account namespace, selected weekdays, or timezone;
Desktop does not consume these settings; and cross-surface active-time
aggregation does not exist. Website Reflect is tracked separately under
`WEB-REFLECT-01`. Complete those surfaces in the founder's Website, Mobile,
Desktop order without adding another schedule evaluator or turning reminders
into a hard gate.

2026-07-18 Website voice output gap (`WEB-VOICE-OUTPUT-01`, Partially
remediated): Website chat already had real voice-to-text input through its
canonical composer store. Completed assistant responses now add a manual
Read aloud / Stop action backed by the existing browser-native `useTTS` hook.
One controller lives at the message-list owner instead of one per bubble;
switching responses cancels the prior utterance, stale completion events cannot
clear the new one, Markdown is reduced to readable prose, fenced code is not
spoken, and browsers without Speech Synthesis do not show a dead control. This
does not send response text or audio to another provider and does not change
Local/BYOK/Managed routing. Remaining Website release gap: this is not
hands-free or full-duplex voice. Continuous turn-taking, barge-in, a live voice
session/waveform, selectable voices and output devices, and an explicit
server/provider TTS option are still absent. Desktop's separate native voice
and trust-boundary gaps remain tracked under
`DESKTOP-VOICE-CONVERSATIONS-UNWIRED-01`; downstream surfaces must follow the
founder's release order and reuse an appropriate shared contract rather than
copying this Web-only controller.

2026-07-18 Website Skills/Connectors/Plugins directory gap
(`WEB-UNIFIED-DIRECTORY-01`, Partially remediated): the shared
`@agiworkforce/ui` Settings directory is now the single authenticated browse
view for Skills, Connectors, and Plugins. Opening it from any of the three
sections loads the real deployment Skill catalogue, and Website plugin cards
reuse `features/plugins/data/plugins.ts`, the same authored catalogue as the
public SEO/detail pages. Discoverable plugins are a separate adapter collection
from installed plugins, so catalogue previews never render as installed,
enabled, or installable; their cards expose only an honest preview label and
the existing details route. Connector cards continue to reuse the canonical Web
catalogue and suppress local-only entries. Remaining release-order gap: Website
has no tenant-owned plugin installation persistence, package verification,
permission/connector consent transaction, uninstall/rollback path, or working
hosted marketplace API. Do not add an Install control until that server
boundary exists, and do not create another catalogue or directory UI to build
it.

2026-07-18 Managed Cloud Office creation gap (`CLOUD-OFFICE-CREATE-01`,
Partially remediated): Website managed chat now offers one server-owned
`create_office_file` tool for editable DOCX and PPTX output. The browser sends
only a logical enablement flag; the server validates bounded structured tool
arguments, generates the bytes, and reuses the existing tenant-owned generated
file persistence, file-card, and canonical activity paths. A real tool call is
required before running/completed/error activity or an artifact event appears.
Free chat remains eligible when the selected model supports tools; this does
not grant separate Cowork/developer entitlements. Generated DOCX files use an
explicit business-document page/style/numbering preset, and generated PPTX
files use editable 16:9 text, semantic title order, and optional speaker notes.
The production dependency is MIT-licensed and recorded in
`THIRD_PARTY_LICENSES.md`. Remaining release-order gaps: Website does not yet
edit existing Office files or create XLSX workbooks, and Mobile, Desktop,
Chrome, VS Code, and CLI do not yet expose this selection. Those surfaces must
reuse the managed server behavior in the founder's order instead of adding
client generators or another storage pipeline.

2026-07-18 Managed Cloud auto-memory parity (`CLOUD-MEMORY-AUTO-01`, Partially
remediated): Website managed chat now loads bounded owner-scoped account
memories as explicitly untrusted data before prompt accounting, skips that
context for Temporary Chats, and extracts only conservative first-person facts
from the logical Website user message. Standard streaming, non-streaming,
research/tool-loop, and durable AGI Work paths persist at most five facts only
after a completed, durably settled turn. Normalized dedupe and deterministic
IDs make replayed/concurrent auto writes idempotent without a new migration;
failures, cancellations, empty extraction, tenant mismatch, and persistence
outages do not create memory or break chat. The shared extractor remains in
`@agiworkforce/agent-core`. Remaining release-order gap: Mobile Cloud still
runs its client consolidation before provider success and queues random-ID
sync rows, so a failed Mobile turn can learn a fact and can later race the
server-owned fact. Server auto-capture is intentionally Website-only until the
Mobile slice removes that cloud client write; Desktop follows after Mobile.
Local Mobile consolidation remains on-device and must not be removed or routed
to Managed Cloud.

2026-07-18 CLI/app-server and Managed Cloud model-invocable skills gap (`CLI-SKILLS-TOOL-01`,
Remediated): the developer engine no longer places every discovered skill body
in the base system prompt. It exposes a read-only, always-loaded `Skill` tool
that lists metadata and lazy-loads one exact consented skill name; model input
cannot supply a filesystem path. Both flat skill files and canonical
`<name>/SKILL.md` directories are supported. `env_vars` and `tools` /
`required_tools` frontmatter dependencies fail closed without revealing secret
values, skill bodies are fenced as untrusted reference guidance, and the
canonical tool catalog makes the same capability available to stdio and
authenticated WebSocket app-server clients. Managed Cloud now reuses
`packages/tools/skills` for a path-free `skill` function definition, exact
list/load execution, dependency gates, bounded output, and untrusted-body
fencing. Web selection sends only `skill_name`; the server validates it against
the deployment catalog, accounts for server-added prompt/tool material, and
the real Cloud loop emits canonical running/completed/error activity only when
the model calls the tool. An explicit composer selection now forces that one
real Skill call on the first provider step, then restores automatic tool choice,
so a provider cannot silently answer without loading the selected guidance or
get trapped reloading it. The browser body fetch, hidden system injection,
fabricated completed timeline entry, duplicate hard-coded composer roster, and
duplicate slash-menu catalog request were removed. Desktop Cloud and Mobile
Cloud request runtimes forward the same optional exact name without importing
or copying loader mechanics; neither surface should claim a selectable Skill
UI until its host actually supplies that name. This is remediated in code, not
production-deployed; the deployment must expose a non-empty authorized
`SKILLS_LAYERS` catalog for selection to be available.

2026-07-17 Desktop optional-feature build gate: `cargo clippy -p
agiworkforce-desktop --all-targets --all-features -- -D warnings` does not
compile the `remote-databases` feature. The direct `bson = 3.1` dependency is
incompatible with `mongodb = 3.5`'s BSON 2.x types in `nosql_client.rs`; the
MySQL/Postgres validators still supply a second generic argument to the
one-argument application `Result` alias; and `redis_client.rs` calls `get`
with a key slice that Redis 1.1 no longer accepts. Default-feature Desktop
builds and memory tests remain green. Fix the optional adapters together and
restore the all-features lint gate before claiming remote database support.
The default-feature all-targets strict lint is independently blocked by
`tests/mcp_integration_test.rs`, which holds the process-wide `ENV_LOCK`
standard mutex across three awaits; Rust 1.94 rejects that test under
`-D clippy::await-holding-lock`. The supported library build and focused
memory suites pass, but the repository must fix that test synchronization
before treating Desktop all-targets clippy as green.

2026-07-17 free-plan deploy gate: migration
`apps/web/db/neon/0060_free_tier_token_budget.sql` must be applied to production
Neon before deploying the dependent free-plan code. It replaces the public
three-prompt counter with private server-side token accounting and adds the
transactional limits for five free Projects and one custom remote MCP. This is
founder-gated production data-plane work; no agent should deploy this slice or
run production-mutating QA until the founder confirms 0060 was applied.

2026-07-17 Cloud agent run-journal deploy gate: migration
`apps/web/db/neon/0061_cloud_agent_runs.sql` must be applied to production Neon
before deploying the dependent managed agent routes. It creates the
tenant-isolated run/event journal used by Web, Desktop Cloud, and Mobile Cloud
for ordered canonical activity replay, cancellation intent, and run status.
This is founder-gated production data-plane work; no agent should deploy this
slice or run production-mutating QA until the founder confirms 0061 was
applied.

2026-07-17 Cloud agent approval-checkpoint deploy gate: migration
`apps/web/db/neon/0062_cloud_agent_approval_checkpoints.sql` must be applied to
production Neon after 0061 and before deploying the dependent approval-resume
routes. It creates the tenant-owned, row-level-secured checkpoint that stores
the signed continuation request, assistant-message projection, pending tool
calls, and canonical approval-boundary events. This is founder-gated
production data-plane work; no agent should deploy this slice or run
production-mutating QA until the founder confirms 0062 was applied.

2026-07-17 Cloud agent durable-execution deploy gate: migration
`apps/web/db/neon/0063_cloud_agent_execution_operations.sql` must be applied to
production Neon after 0062 and before deploying the durable AGI Work workflow.
It binds a Vercel Workflow run to each tenant-owned Cloud agent run, carries the
completed-step cursor across approval boundaries, and creates the RLS-isolated
provider/tool operation receipts that prevent duplicate paid or mutating side
effects during step retries. This is founder-gated production data-plane work;
no agent should deploy this slice or run production-mutating QA until the
founder confirms 0061, 0062, and 0063 were applied in order.

2026-07-17 Mobile ExecuTorch packaging warning
(`MOBILE-EXECUTORCH-IOS26-ARCHIVE-01`, Medium, Open): measured on Expo 55 /
React Native 0.83.10; `apps/mobile/package.json` now pins Expo ~57.0.12 /
React Native 0.86.2, so the version pairing below is the state at the time of
the finding, not the current stack, and the interaction needs re-measuring on
57 before anyone acts on it. On the measured stack a fresh simulator build
succeeded and installed, but
`react-native-executorch` 0.8.4's phonemis static objects were built for the
iOS 26 simulator while the app deployment target is iOS 17. The upstream
compatibility matrix says both 0.8.x and 0.9.x support Expo 55 / React Native
0.83 and iOS 17; the current upstream release is 0.9.2. Upgrade only as a
dedicated local-model catalog/runtime migration because
`packages/platform/local-llm` intentionally mirrors 0.8.4 model URLs and
constants. Do not claim the W10 physical-device or release-build gate until a
current release build is proven on a real iOS device and this warning is either
eliminated upstream or accepted with reproducible device evidence.

2026-07-17 Cloud agent durability gap (`CLOUD-AGENT-DURABILITY-01`, Critical,
Remediated in code; production activation is gated by migrations 0061-0063): Web,
Desktop Cloud, and Mobile Cloud all reach the real managed tool loop through
`apps/web/app/api/llm/v1/chat/completions`. AGI Work has a bounded
100-step/210-second policy for each durable workflow invocation. Migration 0061
plus `cloud-agent-run-service.ts` now persist the
tenant-owned run state and every canonical activity envelope in monotonic
sequence order; the owner-scoped run endpoint supports cursor reads and
cancellation intent, and the loop checks cancellation before provider/tool
side effects. Web and Desktop Cloud now validate and retain the run
handle/cursor with the assistant turn, follow the owner-scoped journal after an
unexpected transport drop, and send Stop to the real server run. Mobile now
uses the same shared typed run client: pre-handle network failures retain the
idempotent request retry, while post-handle socket/stall failures follow the
exact persisted cursor instead of re-posting tool work; Stop cancels the
server-owned run. The Chrome side panel now sends AGI Work requests, renders
the same validated canonical activity envelopes inline, retains only
display-safe activity plus the run cursor in browser-local history, resumes an
unfinished run from the owner-scoped journal after a port disconnect or side
panel relaunch, and routes Stop to server cancellation. Tool and Research
loops journal public answer deltas while
explicitly excluding private `<thinking>` content; all four clients reconcile
overlap so a chunk rendered immediately before disconnect is not duplicated
during replay. This closes the previous "no durable event cursor" defect for
Web, Desktop, Mobile, and Chrome after 0061 is applied. Web, Desktop, and
Mobile now also persist the run reference plus a versioned approval projection
with the assistant message, restore an approval boundary after app relaunch,
and resume it using only the run ID and the exact decision set. Migration 0062
stores the signed continuation, pending calls, assistant projection, and
contiguous canonical approval-boundary envelopes before any approval is made
visible. The owner-scoped approval route claims that checkpoint under a lease,
rejects stale, partial, or extra decisions, restores signed thinking
server-side, and releases the lease on pre-execution discovery failures.
Message sync is compare-and-swap, so a partial assistant projection can be
completed without overwriting a newer local edit. This removes the former
process-memory approval-registry and approval-relaunch defects after 0062 is
applied.

AGI Work execution is no longer tied to one request in code. `workflow` owns a
replayable stream and breaks the run into bounded 210-second invocations;
provider and tool boundaries claim stable operation keys in the 0063 receipt
journal. Completed operations replay their validated result, expired safe
operations can be leased again, and expired unsafe operations fail closed as
`outcome_unknown` instead of silently repeating an external side effect.
Each AGI Work provider step now also emits one durable, display-safe progress
phase before execution and resolves that same phase after the model chooses
tools, prepares the response, or fails. These summaries are derived only from
observable loop state, never provider scratchpads or private chain-of-thought;
the existing shared Web/Desktop renderer and Mobile renderer keep the run
collapsed inline and progressively disclose phases, tool request/result data,
sources, artifacts, approvals, and compaction entries on demand.
Provider-token usage is rebuilt from completed receipts and settled through the
existing managed-usage idempotency key, so workflow retries and deployments do
not create a second charge. Approval continuation starts a new durable workflow
from the signed server checkpoint and atomically replaces the run's workflow
handle; a failed workflow start releases both the usage reservation and the
approval lease. Web, Desktop, and Mobile suppress replay overlap by canonical
session/turn/sequence identity and follow the owner-scoped journal after a
transport failure. The individual invocation budget remains bounded while the
workflow can continue across invocations, disconnects, and worker restarts.

The run journal now also has a tenant-scoped, cursor-paginated collection
endpoint. It validates state filters and opaque cursors, orders runs by the
stable `(updated_at, id)` tuple, and never queries outside the authenticated
user ID. Mobile's former Desktop-companion `Agents` index has been replaced by
a real Cloud Tasks surface backed by that endpoint, with `All`, `Needs input`,
and `Ready for review` filters, loading/error/empty/refresh/pagination states,
conversation deep links, and an explicit Local-to-Cloud boundary. `dispatch`
remains hidden because its current implementation is still the separate
Desktop WebRTC companion rather than Cloud parent/child decomposition; it must
not be presented as Cloud dispatch until that engine path exists.

Production remains intentionally blocked until migrations 0061-0063 are
applied in order. This closure covers Managed Cloud AGI Work; the separate local
VS Code/CLI process-restart limitation remains tracked below. Verification
lives in `cloud-agent-run-service.test.ts`,
`cloud-agent-execution-service.test.ts`,
`cloud-agent-operation-executor.test.ts`,
`cloud-agent-workflow-{input,stream}.test.ts`,
`start-cloud-agent-workflow.test.ts`, `managed-agent-stream.test.ts`,
`tool-loop.resume.test.ts`, `approve/route.test.ts`, route-level AGI Work
dispatch coverage,
`useChatStream.approval.test.tsx`, unified-chat
`useChat.durableApproval.test.tsx`, Desktop `CloudRuntime.test.ts`, Desktop
`cloudApi.test.ts`, Desktop `cloudToolApproval.test.ts`, Mobile
`streaming-completions-fallback.test.ts`, Mobile
`cloud-sync-engine.test.ts`, and Mobile approval/timeline suites, plus the
previous run-journal and Chrome verification suites. Collection coverage lives
in `managed-cloud-agent-runs-client.test.ts`,
`cloud-agent-run-service.test.ts`, `cloud-tasks-screen.test.tsx`, and
`drawer-content.test.tsx`. A 2026-07-17 iPhone 17 Pro simulator pass verified
the signed-out boundary (Local shell -> Cloud sign-in -> deterministic dismiss
back to Local). The Cloud Tasks row is intentionally absent while Local or
signed out; authenticated list/filters/deep-link verification remains blocked
until the founder applies migrations 0061-0063 and provides a sanctioned QA
account. The same pass observed native invalid-free/duplicate-`RCTSwiftUI`
warnings near an attempted Settings interaction, but the automation target had
a `0x0` frame and no Settings tap was delivered, so no Settings crash is claimed
without a reliable coordinate/human/XCTest reproduction.

2026-07-17 VS Code agent-activity gap (`VSCODE-AGENT-ACTIVITY-01`, Partially
remediated): the Rust developer-session protocol is now version 5 and the real
CLI agent loop emits input-redacted, ordered canonical `turn/agent_event` tool
execution start/end and user-visible progress envelopes on one per-turn
sequence. Both VS Code chat surfaces validate those envelopes instead of
inferring work from prose. Native `@agi` chat shows engine-authored progress;
the custom sidebar renders progress and tool work on one collapsed inline
spine with progressively disclosed detail, structured Request/Response,
failure state, and elapsed time. Progress text is derived from observable run
state and never exposes private chain-of-thought. Tool output is bounded at
16,384 Unicode characters with a visible truncation marker. Remaining parity
gaps: the local app-server does not yet emit canonical source-list, artifact,
or compaction events; its approvals and active turn are still process-memory
state, so an editor/engine restart cannot resume an in-flight tool boundary.
Verification lives in the protocol v5 tests, CLI developer-host/progress/tool-
output tests, and the VS Code runtime, participant, sidebar-manager, webview,
and structural-snapshot suites.

2026-07-15 billing ownership clarification for
`GATEWAY-METERING-IDEMPOTENCY-01`: custom Web research, MCP/E2B tool loops,
and tool-approval resumes now aggregate canonical usage for every provider
call through `managed-usage-accounting-service.ts` and settle once through the
0056 managed-request lifecycle. `research-loop.ts` no longer writes a second
legacy credit delta. `managed-agent-stream.ts` withholds generator-owned
terminal events until settlement and releases reported failures/cancellations
when no provider usage was observed. Focused Web verification: chat/accounting
32 files / 245 tests, Web typecheck, and targeted ESLint. Live Neon migration
and role-policy proof remain pending as recorded in the row below.

2026-07-15 M4 ownership correction for
`DESKTOP-CLOUD-SHARED-PACKAGE-GAPS-01`: the row's historical statement that no
dedicated sync package exists is no longer current. `@agiworkforce/sync` now
owns cross-surface delta apply and its TypeScript/Rust golden fixtures;
`@agiworkforce/artifacts` now owns artifact derivation, publish, state, and
cloud merge/apply. Desktop and Mobile import these owners directly; Services
and Stores retain compatibility re-exports only.

2026-07-15 M5 ownership correction: `packages/services` no longer owns egress
classification, model-switch cache policy, or web-search harness availability.
Those implementations now belong to `@agiworkforce/trust-boundaries`,
`@agiworkforce/routing`, and `@agiworkforce/search`, respectively. Web,
Desktop, and Mobile import the owners directly; Services is a re-export-only
downstream compatibility facade pending M8 removal proof.

2026-07-17 WP4 OpenAI-search correction for
`MOBILE-PRESSABLE-CSSINTEROP-FLEXDIR-01`: the historical statement that current
OpenAI models could not exercise `CollapsibleSources`/`WebSearchResultCard` is
no longer current. Managed Cloud now routes catalog-known OpenAI models through
Responses, injects stable native `web_search`, requests complete source
metadata, and translates activity/citations/results into the canonical stream
consumed by Web, Desktop, and Mobile. The current OpenAI flagship family
publishes `capabilities.search: true`. Provider, wire,
registry, route, and all three client source-card suites pass; live
post-deployment source-card QA remains a manual production check rather than a
code-path blocker.

2026-07-17 WP4 generic-search client correction: `/api/me` now exposes the
boolean `generic_web_search` deployment capability without secret material.
`@agiworkforce/search` owns the model/provider/deployment availability rule.
Web, Desktop Managed Cloud, and Mobile Cloud use it in both the composer and
again at send time; Local keeps its existing on-device/native gate. This removes
the remaining xAI/Qwen/Moonshot/etc. cosmetic/unreachable-search gap. Focused
shared-contract and all three surface regressions pass; live provider-backed
source-card QA remains a manual production check.

2026-07-15 UI control corrections: `UI-WEBSEARCH-TOGGLE-01` is fixed because
`ChatInput` now reads and writes `chatStore.webSearchEnabled`, the same state
the send path consumes; the locked default is off and store regression tests
cover both transitions. `UI-AGENTMODE-DEFAULT-01` is fixed because fresh
conversations resolve to `ask`, automatic editing remains an explicit opt-in,
the reactive control displays the resolved value, and bypass requires a
confirmation dialog. Store and component regression tests pin those safety
properties.

2026-07-15 P3 web-side correction for
`DESKTOP-WEB-UI-PRIMITIVES-DUPLICATED-01`: the row's statement that the
apps/web consumer redirect has not started is no longer current.
`apps/web/components/ui/` no longer exists in the worktree and Web consumes
`@agiworkforce/ui` directly (~128 importing files);
`docs/architecture/overview.md` records the P3 adoption with roughly
eight web-divergent primitives decision-gated. Treat the row's web-side action
as complete apart from those decision-gated primitives; the desktop shim
history recorded in the row remains accurate.

## 2026-08-24 Local production-mode verification is contaminated by .env.local

**WEB-LOCAL-VERIFY-ENV-CONTAMINATION-01.** `next start` (and `next dev`)
auto-loads `apps/web/.env.local` ahead of any other env source, Next.js does
this unconditionally outside `NODE_ENV=test`, with no CLI flag to opt out
short of moving or deleting the file. This week two independent local
`next start` runs of `apps/web/e2e/checkout.spec.ts` came back green while
CI's clean env exposed an empty 500: `rate-limit.ts`'s SEV-WEB-13
module-scope guard refuses to serve a rate-limited route once `next start`
sets `NODE_ENV=production` unless Redis credentials or the guard's preview
exemption are present, and both local runs had real Upstash credentials
sitting in `.env.local` that neither the developer nor the reviewer had to
name to get a pass. CI never had that file and hit the guard honestly; the
fix landed as `VERCEL_ENV=preview` in the `web-a11y` job of `ci.yml`, which
exercises the guard's own preview exemption instead of weakening it or
faking Redis.

**Why this is a durable hazard, not a one-off.** `.env.local` is
git-ignored and machine-local by design, so its exact contents are
invisible to anyone reviewing the verification, including the agent that
ran it. A local "it works" carries silent, unstated assumptions (real
Redis, real Stripe keys, whatever else has accumulated there) that make it
look like a faithful rehearsal of CI when it structurally cannot be one.

**Remedy, in force for this repo now:** a production-mode local
verification must state which env files the server actually loaded, Next
prints an `- Environments: …` line at boot; quote it, and which of the
vars the check depends on were forced via explicit process env (those win
over anything `.env.local` supplies for the same key, so naming them is
what makes the run reproducible). A reviewer must re-derive that the
dependency set is complete rather than trust a green run at face value;
`docs/agent-context/known-flaws.md`'s own guard-can-pass-locally lesson
applies here too, a local pass is not evidence of a clean-env pass.

## Open flaws

95 open rows. Full detail: paths, finding, and the verification that closes each.
Rows are removed outright once closed rather than annotated `Fixed`, so nothing here
is re-tested by someone who mistakes a closed row for an open one; `CHANGELOG.md`
carries what was fixed. One row keeps a fixed-but-not-live status on purpose:
`WEB-USER-SETTINGS-NO-RLS-01` awaits a production migration apply, it is not
verified in the environment that matters yet.

Rows whose Status contains `sweep-quarantine` were found by the repo-wide comment and
documentation audit and are **excluded from that sweep**. In each one the comment or doc
describes intended behaviour the code does not implement, so the comment is evidence, not a
defect. Do not "fix" these by rewriting the comment to match the shipped code, that would
launder a billing, compliance, or entitlement gap into documented behaviour. Resolve the code,
or record an owner decision, and only then update the prose.

For developer surfaces, the 2026-08-02 checkpoint at the top of this file
supersedes historical protocol-v5, bundled-CLI, private-gate, and Desktop
"coming soon" wording embedded in older rows. Those rows may still describe a
valid live-release verification gap, but their old product-state prose is not a
current capability claim.

<!-- prettier-ignore -->
| ID | Severity | Status | Owner | Paths | Finding | Verification |
| --- | --- | --- | --- | --- | --- | --- |
| WEB-CONNECTORS-PANEL-ALL-OR-NOTHING-01 | Medium | FIXED 2026-08-24 in source on `fix/web-connectors-panel-resilience` (commits `a65c1621f`, `6a60c6f93`); NOT YET LIVE. Production stays broken until this ships, which needs `DEPLOY-01` resolved first (`deploy-production.yml` cannot authenticate to Vercel, see "The production deploy cannot authenticate to Vercel" above), and possibly also needs the `github_installations` migration actually applied, unconfirmed which of the two production is missing, and the server fix alone (isUndefinedTable degrade) is sufficient either way once deployed | Web lead | `apps/web/features/settings/components/WebSettingsModal.tsx`, `apps/web/features/settings/components/WebSettingsModal.test.tsx`, `apps/web/app/api/github/installations/route.ts`, `apps/web/app/api/github/installations/route.test.ts`, `apps/web/lib/user-connector-tools.ts`, `packages/ui/ui/src/settings-modal/types.ts`, `packages/ui/ui/src/settings-modal/SettingsModal.tsx`, `packages/ui/ui/src/settings-modal/__tests__/SettingsModal.test.tsx` | Observed live in production, one session: Settings > Connectors called `GET /api/connectors` (200, 16 available connectors), `GET /api/connectors/custom` (200), and `GET /api/github/installations` (500 `{"error":"Failed to fetch installations"}`), and the panel rendered nothing but "Connectors could not be loaded. Check your connection and try again." on every retry, even though two of the three sources were healthy. Client cause: `loadConnectors` (`WebSettingsModal.tsx`) `Promise.all`'d all three requests and threw one `ConnectorLoadError` on any single non-ok response, so the installations failure took the whole panel down with it. Server cause: the installations route's `catch` blanket-converted every `db.query` failure into a 500, unlike its sibling `getUserGithubInstallations` (`lib/user-connector-tools.ts:214-232`), which already treats an undefined-table error as "no installations", the likely production trigger is an unmigrated `github_installations` table. | Two-layer fix. Client: the installations fetch is now judged independently of the other two, on its failure or invalid response it defaults `githubInstallations` to `[]` and sets a new adapter field, `connectorsNotice`, instead of the blocking `connectorsError`; the shared `ConnectorsPanel` (`packages/ui/ui`) renders `connectorsNotice` as a non-blocking banner above the still-functional connector table, while `connectorsError` (unaffected, still blocks, still classifies 401/403 as signed-out) stays reserved for the two calls that actually gate the panel. Server: `GET /api/github/installations` now reuses the same `isUndefinedTable` check as its sibling, returning 200 `{ installations: [] }` for a missing table while a genuinely unexpected db error still 500s. New/updated tests all green locally: `WebSettingsModal.test.tsx` (installations 500 renders the full connector table plus the scoped GitHub notice with no global error; installations 401 does not misreport a signed-out session; a core `/api/connectors` failure still shows the global error), `packages/ui/ui`'s `SettingsModal.test.tsx` (`connectorsNotice` renders alongside the table, not instead of it), and `installations/route.test.ts` (undefined-table degrades to 200 empty; a genuine db error still 500s). `pnpm --filter @agiworkforce/web typecheck` and `pnpm --filter @agiworkforce/ui typecheck` both clean. |
| WEB-LOCAL-VERIFY-ENV-CONTAMINATION-01 | Medium | Open, recorded 2026-08-24 | Web lead | `apps/web/.env.local`, `.github/workflows/ci.yml`, `apps/web/e2e/checkout.spec.ts`, `apps/web/lib/rate-limit.ts` | `next start`/`next dev` auto-load `apps/web/.env.local` ahead of everything else, invisibly supplying whatever real credentials (Upstash, Clerk, …) happen to be sitting in that git-ignored file. Two independent local `next start` runs of `checkout.spec.ts` this week came back green off real Upstash creds in `.env.local` while CI's clean env, no such file exists there, hit `rate-limit.ts`'s SEV-WEB-13 module-scope guard honestly and 500'd; fixed via `VERCEL_ENV=preview` in the `web-a11y` job of `ci.yml`, exercising the guard's own preview exemption. A local green run proves nothing about a clean-env pass unless the env actually loaded is stated. | A production-mode local verification must quote Next's own `- Environments: …` boot line and name which of the vars it depends on were forced via explicit process env (those win over `.env.local` for the same key, which is what makes the run reproducible); the reviewer re-derives that the dependency set is complete rather than trusting a green run at face value. See the narrative entry dated 2026-08-24 above the Open flaws table. |
| WEB-CHAT-CHECKOUT-01 | Low | Tracked (honest-degrade) | Web + billing | `apps/web/features/chat/components/dialogs/UpgradePlanDialog.tsx`, `apps/web/features/chat/pages/WebChatPage.tsx`, `apps/web/app/api/checkout/route.ts` | PA-1 wired the in-chat upgrade dialog's pro/max CTAs to the real Stripe checkout (`upgradeToProPlan`/`upgradeToMaxPlan` → POST `/api/checkout`), replacing the retired managed-cloud waitlist email-capture path. The server route is gated by `STRIPE_CHECKOUT_ENABLED`; when that flag is off (default), `/api/checkout` returns an honest "Paid-plan checkout is not available yet. Local and BYOK are free; managed cloud is in public alpha." which surfaces as an error toast. This is correct/honest (managed-cloud ACCESS is open by default; only the paid capacity UPGRADE needs billing live), not a fake, but a free user clicking Upgrade with the flag off sees an error toast rather than a Stripe redirect. NOTE: managed-cloud ACCESS is NOT gated by this; it is the public-alpha gate in `lib/managed-compute-gate.ts`. | Live e2e (button → Stripe Checkout redirect) is BLOCKED headless, needs credentials: `STRIPE_CHECKOUT_ENABLED=true STRIPE_SECRET_KEY=… NEXT_PUBLIC_APP_URL=… NEON_DATABASE_URL=… pnpm --filter @agiworkforce/web exec playwright test`. Source guards: `marketing-copy-regression.test.ts` (15/15). |
| ORG-ROOT-01 | Low | Guarded | Platform | repo root | Root scratch markdown/images and local generated artifacts were moved, archived, ignored, or untracked; root drift is now checked. | `pnpm check:repo-organization` |
| ORG-TOOL-01 | Medium | Guarded | Platform | `.claude/`, `.codex/`, `.cursor/`, `.opencode/`, `.agents/`, `.mcp.json` | Tool folders/configs are classified; tracked adapter contracts, opencode references, skill metadata, and stale Claude/Codex agent phrases are guarded. | `pnpm check:repo-organization` |
| DOC-DRIFT-01 | Medium | Guarded | Docs | `docs/specs/`, `docs/archive/`, `tasks/research/`, `reports/` | Current docs now live in compact current layers and historical docs are archived; doc metadata/status checks block active-source drift. | `pnpm check:doc-status` |
| BOUNDARY-01 | High | Guarded | Platform | `apps/`, `packages/`, `services/` | Apps must not import other apps; packages must not import apps; services must not import UI packages; workspace deep imports need exports. | `pnpm check:boundaries` |
| PRIVACY-01 | High | Product lock | All surfaces | `apps/*`, `packages/contracts/types`, `crates/*` | Local to BYOK must be an explicit fork with context selection, secret scan, preview, and provider label. | Search `PrivacyMode`; add tests when implementing. |
| DOC-CLAIM-01 | Medium | Guarded | Docs + desktop | `docs/architecture/desktop.md`, `scripts/check-structure-conventions.mjs` | Current docs distinguish the retired Desktop `src/components/UnifiedAgenticChat` folder from the active `src/features/chat/UnifiedAgenticChat` component. | `pnpm check:structure-conventions` |
| NEON-01 | High | Guarded | Backend + web | `apps/web/db/neon/` | Neon is the only managed database path. Legacy migration folders were removed; new schema work must be expressed as ordered SQL in `apps/web/db/neon/` and applied with the Neon workflow. | `pnpm check:neon-migrations` |
| DX-README-01 | Medium | Guarded | Platform | `apps/`, `packages/`, `crates/`, `services/`, app feature roots | Apps, packages, crates, services, and current Web/Mobile/Desktop feature folders require README ownership metadata. | retired 2026-08-08 |
| ORG-GENERATED-01 | Medium | Guarded | Platform | `.playwright-mcp/`, `reports/`, `audit/reports/`, root screenshots | Generated captures and report collections now have tracked-artifact and retention checks. | `pnpm check:generated-artifacts && pnpm check:report-retention` |
| CI-GUARD-01 | Medium | Guarded | Platform | `.github/workflows/` | CI must keep repo-operability, lint, typecheck, test, dependency-audit, Rust audit/clippy, Tauri wiring, release, and explicit Semgrep advisory baselines. | `pnpm check:ci-guardrails` |
| CODEOWNERS-01 | Medium | Guarded | Platform | `.github/CODEOWNERS` | CODEOWNERS is provisional pre-hiring but must cover high-risk paths and state the real-team replacement requirement. | `pnpm check:codeowners` |
| WORKSPACE-SCRIPT-01 | Medium | Guarded | Platform | `package.json`, workspace `package.json` files | Package scripts must not advertise concrete `pnpm --filter` targets that do not exist in the workspace. | `pnpm check:workspace-scripts` |
| CLI-HOOK-01 | High | Guarded | CLI lead | `apps/cli/src/agent/chat.rs`, `apps/cli/src/features/hooks/` | `PreToolUse` block/stop decisions and argument rewrites must be honored by every tool execution path, including task and parallel batches. | `cargo test -p agiworkforce-cli agent::chat::tests --lib` |
| CLI-PERM-01 | High | Guarded | CLI lead | `apps/cli/src/permissions.rs`, `apps/cli/src/features/exec/tools/` | Cached command permissions must evaluate the whole command before program fallbacks, reject unsafe suffixes, and keep session approvals alive in-process. | `cargo test -p agiworkforce-cli permissions::tests --lib` |
| AUTO-ROUTER-MIGRATION-01 | High | Partially fixed (canonical TS/Rust policy; pseudo-model identities removed; ordered fallbacks emitted; Desktop, CLI/VS Code developer-session, and Chrome managed-chat paths migrated) | Platform / routing | `packages/ai/model-registry/catalog/{models.curation,routing-policies,harnesses}.json`, `packages/ai/model-registry/generated/registry.json`, `packages/ai/routing/src/auto.ts`, `packages/contracts/types/src/model-catalog.ts`, `crates/agiworkforce-model-registry`, `crates/agiworkforce-protocol/src/developer_session.rs`, `apps/{desktop,cli,web,mobile,extension-vscode,extension}` | Auto was represented simultaneously as fake model records, hardcoded TypeScript task maps, provider task maps, and Rust strategies. Auto aliases now exist only as routing-profile/picker policy: all four false `managed_cloud` model records were removed from curation and generated compatibility output, the compiler rejects their reintroduction, and Web explicitly classifies profile selections as managed transport without fabricated model metadata. The normalized registry declares quality profiles and per-tier slot admission, separates intrinsic modalities from harness features, and generates equivalent TypeScript and Rust resolvers. Both resolvers now preserve a still-preferred concrete route for prompt-cache continuity, re-route when the task requires it, and emit registry-ordered cross-provider fallbacks. Desktop chat Auto and CLI `--auto` select concrete eligible registry routes instead of sending pseudo-models. The shared CLI/VS Code app-server protocol now carries a typed per-turn routing task; persisted developer sessions retain profile, concrete model, previous task, and immutable trust mode; VS Code classifies every Auto turn through the canonical classifier; the Rust host re-evaluates every typed turn and installs direct fallbacks only for BYOK. The interactive CLI (TUI and classic REPL) now mirrors that path (fixed 2026-07-16): `--auto` launches classify the launch prompt through the CLI's faithful port of the canonical classifier (`apps/cli/src/routing/classify.rs`, taxonomy changes land in `packages/ai/routing/src/classify.ts` first) instead of a hardcoded Coding task, seed the session with the resolved route plus account tier, and every subsequent turn re-classifies and re-resolves with previous-route/previous-task continuity in `AgentSession::send`, Managed turns keep `Provider::ManagedCloud` with no direct upstream fallbacks, BYOK turns install the resolver's fallback chain. Managed execution keeps `Provider::ManagedCloud`, visible provenance, and its AGI-host/JWT boundary; Managed provider failover correctly remains a gateway responsibility rather than leaking upstream IDs into a local direct-provider chain. Chrome migrated (verified 2026-07-16): the typed `CHAT_MESSAGE` carries the visible picker selection plus Quick override and route/task continuity from the side panel through the background worker into the privileged managed handler, every Auto turn classifies through the canonical classifier into the `chrome/managed-chat` managed_cloud runtime profile, unknown selections and unadmitted profiles fail closed, and background chat paths are Managed Cloud only, the desktop bridge carries pairing/automation, never inference, and the stale comments describing a localhost-bridge chat fallback chain were corrected; wire-carriage and cloud-only regression pins added. Migration remains incomplete: Web and Mobile use the canonical resolver but not every entry path supplies previous-route/previous-task continuity; some runtime-profile implementation states lag the verified surface wiring; ; the Managed gateway now executes an advisory header-carried fallback plan (x-agi-fallback-models, validated + tier-rechecked per attempt, pre-first-byte only, never for explicit selections, 2026-07-17) but NO CLIENT EMITS the header yet (follow-up: surfaces forward resolveAutoRoute().fallbacks). Shared UI adapters also still contain profile presentation metadata that must not be mistaken for intrinsic model capability. Until those consumers migrate and provider contract tests prove each harness, execution can still diverge from policy. | Current focused proof: `@agiworkforce/routing` 244/244 plus typecheck/lint; Rust registry Auto 20/20 plus `cargo check`; developer-session protocol 6/6 plus `cargo check`; CLI library 1675 passed, 0 failed, 1 ignored plus `cargo check` (2026-07-16: includes 7 new pins, canonical-taxonomy classifier parity, untyped-turn-not-Coding, and per-turn re-resolution feeding the resolver with continuity); VS Code per-turn routing/chat entry points 30/30 plus typecheck/lint. Earlier catalog, command-registry, Desktop, Web, Mobile, Chrome, and shared-chat evidence remains applicable. Live Managed inference and provider failure rotation are not verified because no production credentials were used. Chrome proof: model-carriage and cloud-only pins in `apps/extension/__tests__/chat-model-carriage.test.ts`; full extension suite 1102/1102 plus typecheck, lint, and check:no-cloud-ipc (2026-07-16). Remaining proof requires continuity state on remaining consumer paths, Managed-gateway fallback execution, per-surface harness admission, and end-to-end provider/tool tests. |
| BYOK-RUST-EGRESS-01 | Medium | Grounded (no live leak) | Desktop trust boundary | `apps/desktop/src/lib/egressGuard.ts`, `apps/desktop/src-tauri/src/{sys/telemetry,sys/account/mod.rs,integrations/sync}` | The TS`guardedFetch`egress chokepoint is fetch-only; the Tauri Rust backend's`reqwest`calls bypass it, the open question (Task #5) was whether Rust account/device calls egress BYOK-sensitive data unconditionally. TRACED all three Rust paths: (1)`sys/telemetry/\*`is LOCAL-ONLY (no network; has redaction); (2)`sys/account/mod.rs`is auth/token/account INFRA to`\_.agiworkforce.com`(SSRF-allowlisted), acceptable in BYOK (account auth ≠ chat data); (3) the real cloud-sync/device client`integrations/sync`(CloudSyncClient.register_device/sync_batch via SyncManager) is DORMANT, declared but never instantiated and not exposed by any`#[tauri::command]`, so it does not egress in practice (separate compile-stub CloudSyncClient lives in `data/cloud_sync.rs`). CONCLUSION: no live Rust BYOK leak, not an active vuln. FIXED the false-assurance docstring (egressGuard now documents its WebView/TS-only scope + that Rust reqwest is out of scope). LATENT: if SyncManager is ever wired up, gate it on `privacyMode==='managed'` + add an inert-outside-managed regression test. | code-traced (no live egress) · egressGuard SCOPE note added |
| OBSERVABILITY-WEB-SENTRY-01 | High | Blocked (decision) | Web + platform | the former sentry module under apps/web/shared/lib (deleted), `apps/web/core/monitoring/system-monitor.ts` | the former sentry module under apps/web/shared/lib (deleted) is a pure NO-OP stub (header "No-op implementations"): `captureError`/`captureMessage` return `''`, `isSentryEnabled()=>false`, the `Sentry` namespace stubs `init`/`captureException`. It is the CENTRAL monitoring sink, `system-monitor.ts` routes `setUser`/`trackEvent`/`captureError`/`flush` through it, so apps/web has NO error aggregation, alerting, or perf/business telemetry; production errors land in console/Pino only (each billing `captureError` IS paired with a `logger.error`, so console still fires; remote aggregation is dead). Vendor already chosen org-wide: DESKTOP ships real `@sentry/react` (`errorTracking.ts`: real `init` gated on `VITE_SENTRY_DSN` + consent + trust-boundary; Rust telemetry gates on `SENTRY_DSN`). Replacing the web stub is mechanical (add `@sentry/nextjs`, `instrumentation-client.ts`, real delegations, 3 consumers light up with zero call-site changes) BUT needs a provisioned web DSN + founder sign-off on (a) cost and (b) PII/trust-boundary policy (the web stub has NO trust-boundary gate today, unlike desktop, add it before enabling). Second stub: `core/ai/tools/tool-invocation-handler.ts` `logTool` no-op (blocked on building the `/api/agents/tool-executions` persistence route). NOT stubs (do not refactor): signaling-server metrics (real Prometheus), desktop telemetry collector, web logger. | DECISION: approve Sentry for apps/web + issue a web DSN + confirm PII/consent gating; then mirror the proven desktop integration. |
| MOB-CLOUD-INVITE-RESIDUAL-01 | Low | Open, legacy naming and dead UI cleanup | Mobile cloud | `apps/mobile/src/features/cloud-bridge/InviteCodeModal.tsx`, `apps/mobile/src/features/waitlist/{CloudWaitlistSheet.tsx,service.ts,store.ts}` | Managed Cloud chat is correctly gated by Clerk sign-in, and the stale Code Sessions and Skills callers were removed on 2026-07-30. The invite/waitlist modal, legacy sheet, and signup/redemption service now have no production UI consumer; only the historically named waitlist store remains live as the signed-in Cloud-entitlement mirror. Remove the dead UI/service and replace that compatibility store with direct auth-derived entitlement state in a focused follow-up. | `rg` must show no production modal/sheet/service consumer; existing `cloud-gate-public-alpha.test.ts` and the full Mobile Jest suite must remain green while entitlement consumers migrate. |
| EXT-CLOUD-INVITE-RESIDUAL-01 | Low | Tracked (mechanism retained, copy corrected) | Extension cloud | `apps/extension/src/features/cloud-bridge/{InviteCodeModal.ts,desktopBridge.ts}`, `apps/extension/src/lib/waitlistService.ts`, `apps/extension/src/side_panel.ts`, `apps/extension/src/features/computer-use/cloudAgentClient.ts` | PA-4 made the extension cloud path honestly public-alpha: the `cloudAgentClient` 403 message + header comment now reflect the kill-switch/paid-tier truth (header `x-agi-managed-compute-beta:1` kept as a documented server NO-OP for backward-compat), and the invite/waitlist modal + drawer button were reframed to sign-in-centric public-alpha copy (invite tab → "Redeem a code" for optional promo credits via `/api/claim-offer`; waitlist tab → optional "Product updates" email opt-in). RESIDUAL (low): (a) `desktopBridge.getCloudUnlockState`/`setCloudUnlocked` (chrome.storage `agi_cloud_unlocked`) are now fully VESTIGIAL, nothing gates `callCloud` on unlock state (only a Clerk token does); `setCloudUnlocked` is still called on code-redeem success but its stored flag has no consumer. Left in place (harmless, and removal is a larger cleanup touching the modal success path + its tests); a future PA-5/cleanup pass can delete the unlock-state module and its `setCloudUnlocked` call. (b) The `/api/waitlist/cloud-managed` endpoint is now used only as an interest/product-updates list, not a gate, copy is correct but the endpoint name still says "waitlist". (c) Live smoke (load-unpacked in Chrome → drawer copy + redeem flow) is unverified headless. | `npx tsc --noEmit` ✅; `pnpm --filter @agiworkforce/extension test` 51 files / 963 tests ✅ incl. new `__tests__/cloud-public-alpha-copy.test.ts` (5); load-unpacked smoke pending. |
| DESK-CLOUD-DCL2-LIVE-VERIFY-01 | Medium | Open | Desktop | `apps/desktop/src/lib/cloudChatPersistence.ts`, `src/__tests__/lib/cloudChatPersistence.test.ts`, `src/__tests__/lib/cloudPersistenceEgress.contract.test.ts` | DCL-2 landed the desktop managed-cloud persistence seam (shared `@agiworkforce/unified-chat` client + absolute `WEB_APP_URL` origin + desktop Clerk token getter + `guardedFetch`) but it is verified ONLY headlessly (typecheck + unit + egress-contract). The seam is kept behind PA-3's coming-soon gate (`appModeStore.setMode('cloud')` refused on the desktop runtime → `privacyMode` never `'managed'` → seam unreachable for users), so there is NO live proof of: (a) a signed-build managed-cloud chat persisting via the shared backend, (b) cross-surface continuity (desktop-created chat appearing on web), (c) signed Tauri build smoke. Desktop copy was deliberately NOT flipped (still "coming soon"). Risk: the live round-trip could fail on token shape, auth header, CORS, or API contract drift that headless tests cannot catch, DCL-4 must run it on a signed build before any copy flip. | Headless: `pnpm --filter @agiworkforce/desktop typecheck` ✅; 36 tests across egress + wiring + contract + PA-3 gate ✅; `cargo check`+`clippy` ✅. BLOCKED (DCL-4): `pnpm --filter @agiworkforce/desktop tauri build` → signed app → sign in → managed chat → `POST/GET <WEB_APP_URL>/api/chat/conversations` round-trip + same-account web continuity. |
| DESKTOP-CLI-HARNESS-FRAGMENTATION-01 | High | Tracked | Desktop + CLI Rust | `apps/desktop/src-tauri/src/{core/agi,core/mcp,core/llm}`, `apps/cli/src/{agent,agents.rs,subagent.rs,subagent_v2.rs}`, `crates/agiworkforce-sandbox-policy` | Full-scope version of `EXEC-POLICY-DUP-01` (that entry covers only command-exec-safety policy; this covers the whole harness). Confirmed via a Goose-harness comparison (`docs/architecture-review/AGI_WORKFORCE_VS_GOOSE_HARNESS.md`): Desktop and CLI share exactly one Cargo path dependency (`agiworkforce-sandbox-policy`), the agent/tool-execution loop, MCP client (~11.5K lines hand-rolled in Desktop's `core/mcp/` vs ~5.7K in CLI), and LLM provider clients are each independently implemented twice, with no shared harness crate. Contrast: Goose's `crates/goose::Agent` is the single core reused as-is by both `goose-cli` (in-process) and `goose-server` (HTTP, called by its Electron UI), one engine, two thin clients. AGI Workforce's fragmentation is also the structural reason `DESKTOP-CHAT-SILENT-FAIL-01`'s agent-mode routing bug could exist at all: with two independent execution engines (`spawn_streaming_chat` vs `spawn_streaming_agent` in Desktop), a mis-set flag can silently pick the wrong one; a single-engine design structurally can't have that failure mode. Also separately: `core/mcp/` (~24K lines total incl. `sys/commands/mcp*.rs`) hand-rolls the MCP wire protocol/transport with zero use of the official `rmcp` SDK, see `docs/architecture-review/BUILD_VS_BUY_OSS_ADOPTION.md` for the adoption plan. | Not yet actioned, this is a consolidation/adoption decision requiring founder sign-off on scope and timeline, not a mechanical fix. See the two architecture-review docs above for the concrete plans. |
| DESKTOP-AGI-LOOP-VERIFICATION-01 | High | Tracked | Desktop Rust + Desktop UI | `apps/desktop/src-tauri/src/core/agi/{core.rs,orchestrator.rs}`, `apps/desktop/src-tauri/src/sys/commands/chat/{agent_mode.rs,send_message_setup.rs,send_message_execution.rs}`, `apps/desktop/src-tauri/src/sys/commands/agi.rs`, `apps/desktop/src/{runtime/TauriRuntime.ts,features/agi/*,features/background-tasks/*,features/chat/index.tsx,stores/chat/agentStore.ts}`, `apps/desktop/e2e/agi-safety.spec.ts` (deleted, commit `5573cbde7`) | Verification-loop audit of the two engines flagged by `DESKTOP-CLI-HARNESS-FRAGMENTATION-01`. (1) Main chat loop (`send_message_execution.rs` `spawn_streaming_chat`/`run_nonstreaming_chat`, the path virtually every chat send hits): tool failures ARE fed back to the LLM as `role:"tool"` messages so it can self-correct, with real caps (`max_streaming_tool_iterations`/`loop_max_secs`; non-streaming `max_tool_iterations=25`), no consecutive-failure-abandon concept, but iteration + wall-clock caps are live by default. (2) `AGICore::achieve_goal` (`core.rs:711-1223`), reached only when `spawn_streaming_agent`/`run_nonstreaming_agent` fire, verified the Goose-comparison doc's claim byte-for-byte against source: `goal_iteration_limit()` caps at 1000 (`core.rs:37-51,720`) AND an absolute 300s wall-clock timeout checked every iteration (`core.rs:721-722,750-766`), both real. Consecutive-failure abandon (`MAX_CONSECUTIVE_FAILURES=3`, `core.rs:726`) is gated behind the reflection engine's own `insight.assessment.goal_achievable==false` verdict (`core.rs:1146-1164`); the non-reflection else-branch (`core.rs:1188-1195`) computes `consecutive_failures` but never checks it, and is dead code in practice because both `AGICore` constructors always build `reflection_engine` as `Some(...)` (`core.rs:200,291`), so plain N-strikes abandonment never fires, only the LLM-judged (potentially optimistic) reflection verdict does. Reachability: this session's `TauriRuntime.ts` fix (commit `d3bf6f2ed`) stopped forwarding the composer's `agentMode` chip value to `enable_agent_mode` at all; confirmed this does NOT orphan `AGICore`, for an explicit model selection, `resolve_request_flags` (`send_message_setup.rs:77-80`) now always resolves `agent_mode=false`, so `AGICore` is reached only through `detect_agent_mode`'s intent heuristic (`agent_mode.rs`) on "auto" model routing plus Accessibility permission plus a working `AutomationService`, narrow but real, unlike the confirmed-orphaned `AgiWorkHome.tsx`. Deleted-test gap: `agi-safety.spec.ts` (removed this session, commit `5573cbde7`) expected a full "AGI Goals" dashboard (iteration counter, timeout warning, abandoned/unachievable status, approve/reject workflow, pause/resume, reflection panel) reached via nav, confirmed via the removal commit's own `git log -S` that this UI never shipped. The individual pieces DO exist and work (`features/agi/{AgentTaskPanel,IterationProgressPanel,AgentTaskMonitor}.tsx`, consuming the real `agi:goal:*`/`agent:plan_update` events `core.rs` emits) but are wired only into the orphaned legacy `features/chat/index.tsx` (via `AppLayout.tsx`/`ChatStream.tsx`) that nothing in `App.tsx` imports, the shipping v3 shell (`DesktopShellV3`) and `ChatInterface` both come from `@agiworkforce/unified-chat`, whose own `ChatStream.tsx` comments `IterationProgressPanel ... → deferred`. So the shipping UI has zero visibility into iteration count, timeout proximity, or abandonment for any agent-mode run a user does trigger. Cancellation is also broken end-to-end for this loop: `AgentOrchestrator::cancel_agent` (`orchestrator.rs:363-394`, exposed as the `cancel_agent`/`orchestrator_cancel_agent` Tauri commands, `sys/commands/agi.rs:472-484,691-703`, called from `stores/chat/agentStore.ts`) only calls `agent.core.stop()`, which sets `AGICore::stop_signal` (`core.rs:1356-1358`), a flag read only by `AGICore::start()`'s separate continuous-loop method (`core.rs:351`), never by `achieve_goal()` (the method actually spawned per-goal by `submit_goal`, `core.rs:416-420`). `achieve_goal()`'s real cancellation hook is `AGICore::cancel_goal(goal_id)` (`core.rs:1364-1394`, sets `cancellation_requested` and aborts the `JoinHandle`), correct and working, but never called by `cancel_agent`. Net effect: "cancelling" an agent marks it Failed in the orchestrator's own bookkeeping while the real spawned `achieve_goal` task keeps running to its own caps (1000 iterations/300s, with real tool side effects) unseen and unstoppable. `AgentOrchestrator::process_instruction`'s separate 120s polling wrapper (`orchestrator.rs:664-727`) has the identical bug: on its own timeout it does `self.agents.lock().await.remove(&agent_id)` without ever calling `cancel_goal`, so a user told "Task execution timed out after 120 seconds" can have a zombie goal still executing tools. Both broken call sites are themselves currently unreachable from the shipping v3 UI, `cancel_agent`'s only caller (`BackgroundTasksPanel.tsx`) is, like `features/agi/*`, wired solely into the orphaned `features/chat/index.tsx` tree, and the v3 "Stop" button (`TauriRuntime.stopGeneration` → `chat_stop_generation`) only touches chat-stream-stop flags with no effect on an agent-mode goal. Not fixed here: this is cancellation/concurrency semantics on a path with no current live UI trigger, and a symptom of the two-engine split already tracked by `DESKTOP-CLI-HARNESS-FRAGMENTATION-01`; needs a decision on whether to fix `cancel_agent`/`process_instruction` to call `cancel_goal` now or fold it into that consolidation. | No automated test covers this (the only e2e spec that tried was deleted as testing UI that never shipped). Manual trace only, re-verify with `rg -n -e stop_signal -e cancel_goal apps/desktop/src-tauri/src/core/agi/core.rs apps/desktop/src-tauri/src/core/agi/orchestrator.rs` and `rg -n -e cancel_agent -e orchestrator_cancel_agent apps/desktop/src` before acting. |
| DESKTOP-CUSTOMIZE-NAV-GAP-01 | Medium | Open | Desktop v3 | `apps/desktop/src/features/v3/Sidebar.tsx`, `apps/desktop/src/i18n/locales/*/v3.json`, `apps/desktop/e2e/v3-reachability.spec.ts` | `sidebar.nav.customize` remains translated, but `navItemsForMode()` exposes no Customize destination and there is no Customize hub under the live v3 shell. The reachability assertion remains `test.fixme`, so the product contract is unresolved rather than implemented. | Decide the intended information architecture: build and route a real Customize surface, or remove the orphaned key and obsolete test. Do not add a dead navigation item. |
| DESKTOP-AGENTMODE-GUARDRAIL-SURFACE-01 | Medium | Partially Fixed (persistence + Plan mode UI; the dead AgentModeSwitcher.tsx was deleted in the W8 sweep 2026-07-15, remaining open item is the Rust-side egress/host-denylist gap) | Desktop Rust + Desktop UI | `apps/desktop/src-tauri/src/sys/commands/tool_confirmation.rs`, `apps/desktop/src-tauri/src/core/llm/tool_executor/mod.rs`, `apps/desktop/src-tauri/src/sys/security/tool_guard.rs`, `apps/desktop/src/{features/governance/SafetyPolicies.tsx,features/chat/AgentModeSwitcher.tsx,lib/egressGuard.ts,stores/settingsStore.ts}` | **UPDATE (same day):** the permissive-on-restart bug and the missing Plan-mode UI (both described below) are FIXED, commit `c51a5e0f1`. `ToolConfirmationState::new_with_db` now loads `agent_mode`/`auto_approve_all` from the `settings_v2` table (`SettingCategory::Security`, same table the rest of the app's security settings use); `set_agent_mode`/`set_auto_approve_all` persist on every change; a missing row/bad value fails closed to `Safe`/`false`, never the compiled `Build` default. `SafetyPolicies.tsx` now models all 4 `AgentMode` variants including `Plan`. A SECOND, independent instance of the same restart-reset bug was found on the frontend during this fix (via the agent's own `advisor()` review, not the original task framing): `settingsStore.ts`'s `loadSettings()` unconditionally pushed its own stale `chatPreferences.agentMode ?? 'build'` default to the backend on every app load, which, since `SafetyPolicies.tsx` writes mode via a direct `invoke('set_agent_mode', ...)` that never updates this Zustand store, would silently clobber whatever the backend had just correctly restored, reproducing the bug via a second path even with the Rust fix in place. Also fixed: `loadSettings()` now hydrates from `get_agent_mode`/`get_auto_approve_all` instead of pushing a default; `saveSettings()` no longer pushes these two fields at all (redundant with the two real write paths, and was the actual clobber vector). 7 new Rust tests (`agent_mode_persistence_tests`) + new frontend tests pinning "backend wins over stale frontend default." `AgentModeSwitcher.tsx` confirmed (via `git log -S`) extracted from the composer toolbar and never re-wired, with a narrower feature set than `SafetyPolicies.tsx` (no auto-approve toggle, no per-tool table), not a clean drop-in swap, left as dead code, not deleted. **STILL OPEN, not touched by this fix:** the egress-guard Rust-tool-executor gap (below) and the `AgentModeSwitcher.tsx` dead-code decision. Original audit follows. Verified the `AgentMode` enum (`Safe`/`Plan`/`Build`\[default\]/`Autopilot`, `tool_confirmation.rs:69-75`) IS live on the real tool-execution path and was NOT disconnected by this session's `d3bf6f2ed` fix, the two "agent mode" concepts are unrelated and were never wired together, so there is no regression here. `ToolExecutor::check_tool_confirmation` (`tool_executor/mod.rs:2053`, reached via `execute_tool_call` → `chat/tools.rs::execute_chat_tool` → `execute_chat_tool_with_timeout` → `execute_tool_calls_batch`, the actual dispatcher for both `spawn_streaming_chat` and `run_nonstreaming_chat`, i.e. the default chat path) calls `request_tool_confirmation`, whose first gate is `is_tool_permitted_for_mode(tool_name, current_mode)` (`tool_confirmation.rs:1100-1125`), real and enforced on every non-Safe-tier tool call. `d3bf6f2ed` only stopped forwarding the AgentControl composer chip's separate `ask`/`auto`/`plan`/`bypass` value onto `enable_agent_mode` (a chat-request flag gating whether `AGICore`/`AgentOrchestrator` runs at all, see `DESKTOP-AGI-LOOP-VERIFICATION-01`); per the commit's own comment that value was a tool-confirmation-permission-style label being wrongly read as an "activate agent mode" switch, and it never touched `ToolConfirmationState::agent_mode`. Gaps found in the `AgentMode` UI surface itself, independent of that fix: (1) `SafetyPolicies.tsx` (`features/governance/SafetyPolicies.tsx:26,55,98`), the only reachable control (Settings → Privacy/Governance), models `AgentMode` as `'safe'` / `'build'` / `'autopilot'` only, `Plan` (a real, coded, gate-affecting variant with its own read-only allowlist, `tool_confirmation.rs:70,197-221`) is absent from every reachable UI. (2) `AgentModeSwitcher.tsx`, the one component that does model all 4 variants correctly, is dead code, not imported outside its own file and tests. (3) `ToolConfirmationState::agent_mode` and `auto_approve_all` are in-memory only (`Arc<Mutex<AgentMode>>`/`AtomicBool`) and are never restored in `new_with_db` (`tool_confirmation.rs:113-125`, which loads only `remembered_choices` from SQLite), both silently reset to their permissive defaults (`Build`, `false`) on every app relaunch with no persistence and no warning. Egress guard: confirmed `apps/desktop/src/lib/egressGuard.ts` is exactly what its own header states, a WebView/TS-layer `fetch()` wrapper covering roughly 8 known frontend call sites (cloud sync, chat persistence, Stripe checkout, account auth, voice transcription, share dialog). It does not and cannot cover Rust-side tool executors (`core/agi/executors/*`, `core/llm/tool_executor`), which issue `reqwest` directly; no equivalent Rust-side "our-cloud host" denylist exists for tool calls. No current executor hardcodes an AGI-Workforce-owned endpoint (verified via grep, only cosmetic git-signature/test-fixture references to `agiworkforce.com`), and generic network tools (`api_call`, `browser_navigate`, etc.) go through `tool_guard.rs`'s `validate_url` plus safety-tier confirmation (unregistered tools default to `RequiresConfirmation`, `tool_guard.rs:2680-2682`) rather than a host denylist, so a Local-mode tool call could in principle be pointed at `agiworkforce.com`/`vercel.app`/etc. by a malicious skill or MCP server, and nothing blocks it by hostname; the only protection is the standard per-call confirmation dialog (which does show the destination) for any tool above Safe tier. | Manual code trace only; no automated test added. Re-verify with `rg -n -e is_tool_permitted_for_mode -e request_tool_confirmation apps/desktop/src-tauri/src/core/llm/tool_executor/mod.rs` and `rg -n AgentMode apps/desktop/src/features/governance/SafetyPolicies.tsx`. |
| DESKTOP-VISUAL-REGRESSION-COVERAGE-01 | Low | Tracked | Desktop v3 | `apps/desktop/e2e/visual-regression.spec.ts`, `apps/desktop/e2e/page-objects/{agiPage,automationPage}.ts` (or equivalent) | While fixing the 7 failing visual-regression tests (root cause: no auth setup, so every screenshot was of the Cloud sign-in page, some pairs coincidentally scored >90% similarity on that shared page, which would have been a false pass), the fix surfaced that the suite's coverage is now honest but redundant: `agiPage.navigateToAGI()`/`automationPage.navigateToAutomation()` target nav items that don't exist in the current v3 sidebar (only artifacts/scheduled/dispatch do), so those two tests re-capture the same default chat screen as the chat-interface test. Separately, theme switching (`settingsPage.themeSelect`) is gated behind `isTauri` in `GeneralTab`, so light/dark theme baselines both capture the same non-Tauri Settings→General screen rather than an actual theme difference. Net: 8 "passing" visual-regression tests currently cover only ~2 distinct real screens (empty-chat, Settings→General) instead of the 6 distinct surfaces their names imply. Not a regression from the fix, the redundancy was already latent, just masked by the sign-in-page false-pass bug. | DECISION: update `agiPage`/`automationPage` navigation helpers to target real current v3 destinations (or remove those 2 tests if no longer meaningful), and either give the Playwright harness a way to exercise theme switching (bypass or stub the `isTauri` gate for this one test) or accept light/dark coverage is Tauri-only and drop it from the web-target suite. `pnpm --filter @agiworkforce/desktop exec playwright test visual-regression.spec.ts` currently green (8/8) but doesn't prove what it appears to. |
| DESKTOP-CHAT-CONVO-ACTIONS-ORPHANED-01 | Medium | Open, decision needed | Desktop TS | `packages/ui/unified-chat/src/{components/ActionBar.tsx,components/MessageBubble.tsx,components/MessageList.tsx,hooks/useChat.ts}` (live, thin), `apps/desktop/src/features/chat/{MessageBubble/*,BranchNavigator.tsx,ShareConversationDialog.tsx,ChatStream.tsx,EditableMessage.tsx,AppLayout.tsx}` + `apps/desktop/src/features/v3/ActiveChat.tsx` (full-featured, dead) | Same dead-code-vs-live-surface pattern as `DESKTOP-V3-COMPOSER-DEADCODE-01`, but for message/conversation actions rather than the composer, and much larger in scope. The LIVE message-rendering path (`DesktopShellV3` → `ChatInterface`/`MessageList`/`MessageBubble`/`ActionBar`, all from `packages/ui/unified-chat`, outside this repo-area's write scope) only implements Copy + a non-functional Retry button (`ActionBar.tsx` renders it and calls `onRetry?.(messageId)`, but `MessageList.tsx` never passes an `onRetry` prop into `MessageBubble`, so every click is a silent no-op, confirmed by reading the prop chain, not yet fixed since it requires editing `packages/ui/unified-chat`, a cross-surface package shared with web/mobile). There is no Regenerate button, no per-message Edit (user messages render with zero action row at all), no per-message Delete, no Branch trigger, no Share, no Export, and no Continue-generation concept anywhere in the live tree, `chat_continue_generation` appears exactly once in the whole frontend, as a bare key in a timeout-lookup table (`apps/desktop/src/utils/ipc.ts:405`), with zero callers and no matching `#[tauri::command]` on the Rust side at all (grepped `apps/desktop/src-tauri/src`, no hits). Meanwhile a FULL, working implementation of nearly all of this already exists but is orphaned dead code: `apps/desktop/src/features/chat/MessageBubble/{MessageBubble.tsx,MessageActions.tsx,MessageContextMenu.tsx,useMessageActions.ts}` has Regenerate/Edit/Delete/Branch wired to real store actions (`editMessage`, `deleteMessage`, `editAndRegenerateFromMessage`, `forkAndRegenerate`, `retryFailedMessage` in `stores/chat/chatStore.ts`, several of which DO call the backend, e.g. `chat_delete_message`), `features/chat/BranchNavigator.tsx` + `forkAndRegenerate` implement real conversation branching, and `features/chat/ShareConversationDialog.tsx` + `Sidebar.tsx`'s export/export-to-PDF/export-to-markdown handlers implement Share/Export, but this entire tree (`features/chat/AppLayout.tsx` and everything under it) has no caller in `App.tsx`; `DesktopShellV3` (default-on via `FeatureFlagName.DESKTOP_CHAT_V3`) never mounts it. A THIRD, separate implementation (`apps/desktop/src/features/v3/ActiveChat.tsx` + `ResponseActionRow.tsx`, exported from `features/v3/index.ts`) also models Regenerate/Branch/React against the v3 store but is likewise never imported by `DesktopShellV3.tsx` (which renders `ChatInterface` from `packages/ui/unified-chat` directly for the chat panel, not `ActiveChat`), also dead. Net: three independent implementations of the same feature set exist at three different completeness levels; only the thinnest (unified-chat's) ships, and it covers roughly 2 of 8 remaining actions (Copy works, Retry is a dead button). Desktop Share additionally has a known live P0 trust-boundary concern per this session's platform-grades notes, do not wire `ShareConversationDialog.tsx` in without a trust-boundary review first. | DECISION NEEDED (same shape as `DESKTOP-V3-COMPOSER-DEADCODE-01`): (a) delete the two dead trees (`features/chat/*` message-action stack, `features/v3/ActiveChat.tsx`+`ResponseActionRow.tsx`) and treat Regenerate/Edit/Delete-message/Branch/Share/Export/Continue as real product gaps to build fresh against `packages/ui/unified-chat`'s `MessageBubble`/`ActionBar` (a `packages/ui/unified-chat` change, cross-surface, needs supervisor sign-off since it also affects web/mobile), or (b) port the working logic from the dead desktop-only trees into `packages/ui/unified-chat` as the deliberate migration target. Either way this is materially larger than a QA fix and needs an explicit scope decision, not silent implementation. Fix the dead `onRetry` wiring in `MessageList.tsx`→`MessageBubble` as a quick win only if/when `packages/ui/unified-chat` is in scope for the assigned agent. |
| DESKTOP-CLOUD-SHARED-PACKAGE-GAPS-01 | Medium | Tracked | Platform / Desktop | `apps/desktop/src/features/{memory,memory-panel,auth,connectors,chat,settings}`, `apps/desktop/src/stores/{memoryStore,projectMemoryStore,authOrchestrator,auth,connectorsStore,projectStore}.ts`, `apps/desktop/src/services/cloudAccountAuth.ts`, `packages/{unified-chat,ui}` | Checked whether desktop's Cloud Mode reuses shared packages for UI/settings/chat/memory/projects/auth/connectors/sync, or duplicates per-surface. More shared than an initial pass suggested (corrected mid-investigation after finding `packages/ui/unified-chat/src/stores/memoryStore.ts` had been missed), verify claims below with a fresh grep before trusting them, this area has already produced one false negative. Confirmed genuinely shared and consumed by desktop: (1) chat, `@agiworkforce/unified-chat`'s `ChatInterface`/`ChatInput`/`MessageList`, confirmed live end-to-end this session; (2) Settings modal shell, `@agiworkforce/ui`'s `SettingsModal`, used by `App.tsx` and `DesktopCloudSettingsModal.tsx`, with desktop-only panels (`AllowedDirectoriesSettings`, `AutomationPermissionsSettings`, `CacheManagement`) correctly rendered inside the shared shell rather than duplicating it; (3) Memory, `apps/desktop/src/features/settings/tabs/Memory.tsx` imports `@agiworkforce/unified-chat`'s `memoryStore`/`MemoryEditor` directly; (4) Connectors, `apps/desktop/src/features/connectors/ConnectorDetailView.tsx` imports `@agiworkforce/unified-chat`'s `connectorPermissionStore`, and `@agiworkforce/ui` has a shared `ConnectorLogo`. Confirmed NOT shared at all: Auth (`features/auth`, `stores/authOrchestrator.ts`, `stores/auth.ts`, `services/cloudAccountAuth.ts`) has zero shared-package logic anywhere under `packages/` (types only), likely legitimate given desktop uses native OAuth + deep-links (`tauri-plugin-deep-link`) vs. web's browser-based Clerk flow, a real platform difference rather than an oversight. No dedicated `sync` package exists; the only sync-named code (`packages/services/src/artifact-sync.ts`) is artifact-specific. UNRESOLVED: desktop ALSO has parallel LOCAL implementations alongside the shared ones for memory (`features/memory/{MemoryViewer,MemoryCard,SaveToMemoryButton,MemorySearch}.tsx` + local `stores/memoryStore.ts`, separate from the unified-chat one) and projects (`features/chat/ProjectsView.tsx`, separate from `packages/ui/unified-chat`'s `ProjectGallery`/`ProjectCard`/`ProjectHeader`/`ProjectStore` and `packages/ui`'s own `ProjectsView`), both local variants are imported from `apps/desktop/src/features/chat/index.tsx`, one of the three dead-code trees the chat-lifecycle QA agent just confirmed contains orphaned implementations (`DESKTOP-CHAT-CONVO-ACTIONS-ORPHANED-01`). Not yet confirmed whether these specific local memory/projects paths are live or dead, plausible they're leftover duplicates from the same legacy shell, but unverified. | Re-verify with the same App.tsx -> DesktopShellV3 -> ChatInterface live-vs-dead trace method used to confirm ChatInput.tsx's liveness this session, applied to features/memory/\* and features/chat/ProjectsView.tsx specifically. |
| DESKTOP-WORKSPACE-INDEXING-UNWIRED-01 | Medium | Partially Fixed (symbol-indexer half CUT 2026-07-30; semantic-embeddings half still open) | Desktop | `apps/desktop/src-tauri/src/core/embeddings/{indexer,chunker,similarity}.rs`, `apps/desktop/src-tauri/src/sys/commands/embeddings.rs`, `apps/desktop/src/api/embeddings.ts` | SPLIT 2026-08-06. (1) Symbol/codebase indexer, CLOSED: the workspace\_\* command family, the core/codebase indexer module, and the api/workspace TS wrapper (all three now DELETED, written without path syntax on purpose, since they no longer resolve) were removed as one vertical slice on 2026-07-30 (see the entry at lines 959-966 of this file and `docs/decisions/2026-07-30-cut-shallow-workspace-index.md`). Those paths no longer exist, so do not go looking for them. (2) Semantic embeddings indexer, STILL OPEN: `index_workspace`, `index_file`, `semantic_search_codebase`, `get_embedding_stats`, and `get_indexing_progress` remain implemented with the TS wrapper `api/embeddings.ts`, which no other file imports, and none of the commands appear in the LLM tool executor or `chat/tools.rs`. Note the SAME embedding stack does have one real consumer elsewhere: `core/embeddings/mod.rs` backs `EmbeddingGenerator`, which project RAG uses. Wire-or-cut applies only to the unreachable workspace-indexing commands, not to `core/embeddings` itself. | Symbol half cut. Embeddings half unfixed: `grep -rl "from.*api/embeddings'" apps/desktop/src` still returns zero hits outside the file's own definition. |
| DESKTOP-GIT-PANEL-UNREACHABLE-01 | Medium | SPLIT 2026-08-09. Slash-panel half CLOSED by the 2026-07-30 archive cut; orphaned-`GitPanel` half STILL OPEN, decision needed | Desktop | `apps/desktop/src/features/git/GitPanel.tsx`, `apps/desktop/src/features/git/index.ts:12`, `apps/desktop/archive/features/chat/DynamicSidecar.tsx:49-50,524` and `apps/desktop/archive/features/chat/InlinePanels/InlinePanelRenderer.tsx` (both ARCHIVED, excluded from the build at `apps/desktop/vite.config.ts:438-441`), `apps/desktop/src-tauri/src/core/agi/tools/mod.rs:2803` | RECONCILED 2026-08-09 against the 2026-07-30 archive cut (see the checkpoint at lines 588-594 of this file, which this row previously contradicted). (1) The `/git <args>` slash-command bug is GONE, not fixed-in-place: `executeGitCommand`, the handlers/commands/system.ts module, features/chat/index.tsx, DynamicSidecar.tsx and InlinePanelRenderer.tsx were all removed from the shipped tree (written without path syntax on purpose, since they no longer resolve there), the last three now live only under `apps/desktop/archive/`, which Vitest and the bundler exclude. `grep -rn executeGitCommand apps/desktop` returns zero hits, so no `/git` command exists to mis-render and the "Unknown panel type: git" box is unreachable. (2) The Rust `git_*` tool defs are still registered (`core/agi/tools/mod.rs:2803` onward, `code_execution`-gated), but the `InlineGitResult` renderer this row credited for displaying them is ALSO archive-only, treat the render half of the agent path as unverified, not as working. (3) STILL OPEN, and now for a simpler reason than the original `openSidecar('git', ...)` analysis: `apps/desktop/src/features/git/` survived the cut with zero live importers, `grep -rn "features/git" apps/desktop/src` returns only its own barrel re-export (`features/git/index.ts:12`), and the sole `GitPanel` consumer is the archived `DynamicSidecar.tsx:49-50,524`. Wire-or-cut the directory; the sidecar/event-branch framing no longer applies. | Old repro retired, it can no longer be run: there is no `/git` command in the shipped composer (`grep -rn executeGitCommand apps/desktop` → 0 hits; `InlinePanelRenderer.tsx` resolves only under `apps/desktop/archive/`). Remaining half verified open: `grep -rn "features/git" apps/desktop/src` → only `features/git/index.ts:12`, its own re-export. |
| DESKTOP-PR-AUTOMATION-DEAD-CODE-01 | Medium | Open, decision needed | Desktop | `apps/desktop/src/api/git.ts:552-608` (`gitGeneratePrDescription`, `gitCreatePr`, `gitCheckPrReadiness`), `apps/desktop/src/api/index.ts:379-381` | Three PR-automation functions are implemented and exported with ZERO call sites outside the barrel re-export and their own test. A later naming-convention refactor renamed them (`checkPRReadiness` -> `gitCheckPrReadiness`) without noticing they were dead, so the rename touched code no product surface reaches. BLOCKED, not merely unwired: `apps/desktop/src/features/git/GitPanel.tsx` is itself exported only from `src/features/git/index.ts:12` with no consumer, so the surface that would host a PR action has no entry point either. This shares the decision in DESKTOP-GIT-PANEL-UNREACHABLE-01, whether desktop wants a git surface at all. Wiring the PR calls into an unreachable panel would close the row without giving any user the feature. Corresponds to settings-07-gap / settings-08-gap in audit/competitive-gap-2026-08-15. | grep for the three identifiers across `apps/desktop/src` returns only git.ts, git.test.ts and the barrel (verified 2026-08-20). |
| WEB-USER-SETTINGS-NO-RLS-01 | Medium | FIXED 2026-08-21 in `0134_user_settings_rls.sql` (pending production apply). Confirmed absent first (`relrowsecurity` false, zero `pg_policies` rows), then a FORCE'd policy added and PROVEN on a branch off production: as `app_rls` with `sub` set, a user saw only their own row, and a cross-user UPDATE matched 0 rows. `app/api/settings/preferences/route.ts` moved off `getNeonDb()` onto `getUserScopedDb()`, the Neon owner role has BYPASSRLS, so the policy would have been decorative otherwise | Web | `apps/web/db/neon/0042_settings_cloud_sync.sql`, `apps/web/db/neon/0028_user_settings.sql`, `apps/web/app/api/settings/preferences/route.ts:38,99` | `public.user_settings` has no RLS policy in any migration, 0037 covers ten other tables and not this one, and the preferences route reads it through `getNeonDb()`, the BYPASSRLS client 0037 itself warns about. Both queries carry a correct `where user_id = $1`, so this is a defence-in-depth gap and NOT a demonstrated leak. The migration comment previously asserted "RLS isolates it", which was never true; corrected 2026-08-20. | Comment corrected and three tests added at `apps/web/__tests__/security/user-settings-isolation.test.ts` pinning the predicate, the corrected comment, and a tripwire that fails when a policy is added so the route move to `getUserScopedDb()` happens in the same change. The real fix needs a branch database, local `DATABASE_URL` points at production. |
| WEB-TELEMETRY-CONSENT-NOT-CROSS-DEVICE-01 | Low | FIXED 2026-08-24 | Web | `apps/web/lib/sentry-shared.ts`, `apps/web/features/settings/sections/PrivacySection.tsx`, `apps/web/instrumentation-client.ts`, `apps/web/app/layout.tsx`, `apps/web/lib/server/telemetry-consent.ts`, `apps/web/lib/server/rls-db.ts` | Telemetry consent lives in TWO places: the synced `privacy` settings namespace, and a localStorage mirror at `agi.privacy.shareTelemetry`. Sentry initialises before React mounts, so `instrumentation-client.ts` can only read the mirror. PrivacySection writes both and reconciles them ON LOAD, so a user who turns telemetry OFF on one device and never opens Settings on a second device still has Sentry initialising there. The consent is honoured, just not until Settings is visited. | FIXED 2026-08-24. The 2026-08-21 RESIDUAL note assumed `app/layout.tsx` was statically rendered and that an auth read would newly force it dynamic; that premise was already wrong, the layout reads `headers()` for the CSP nonce unconditionally, with no Suspense boundary, so every route was already forced dynamic (correction recorded here rather than silently, per this file's own convention). What was actually missing was the per-page-load consent read. Added `readServerTelemetryConsent()` (`lib/server/telemetry-consent.ts`), reading `user_settings` through a new `getCurrentUserRlsDb()` (`lib/server/rls-db.ts`) rather than the BYPASSRLS `getNeonDb()`, so 0134's FORCE policy stays real for this read too, same invariant `app/api/settings/preferences/__tests__/rls-scoped.test.ts` guards. `app/layout.tsx` renders the result onto `<html data-telemetry-consent>`; `instrumentation-client.ts`'s new `shouldInitializeSentry()` (in `lib/sentry-shared.ts`) reads that attribute before deciding whether to init, syncing the localStorage mirror to match so every other `hasTelemetryConsent()` read this session agrees immediately rather than waiting on `TelemetryConsentSync`'s fetch. Signed-out and any DB failure both fail closed, a telemetry read must never default a user into being tracked. Cost stays scoped: only signed-in full page loads pay the extra query, and only that query, no organization resolution, no `assertAccountActive`, both deliberately skipped so a suspended-account check could never break every page's render. `TelemetryConsentSync` is unchanged and stays as defence-in-depth for the case the server-rendered read itself failed closed. Tests: `lib/server/telemetry-consent.test.ts` (signed-in with/without consent, no row, signed out, DB error), `lib/server/rls-db.test.ts` (`getCurrentUserRlsDb`), `app/__tests__/layout.telemetry-consent.test.tsx` (signed-in consent true/false, signed-out, re-render after revoke), `lib/__tests__/sentry-shared.test.ts` (`readDocumentTelemetryConsent`, `shouldInitializeSentry`). Live-verified signed-out only: a booted dev server's first response HTML carries `data-telemetry-consent="false"` for an anonymous request; the signed-in path could not be exercised against a live server in this environment (no working local sign-in fixture, see QA-account known-flaws note) and rests on the unit tests above, honestly short of a live signed-in observation. |
| WEB-API-ROUTES-WITH-NO-CALLER-01 | Low | Open, recorded 2026-08-21 | Web | `apps/web/app/api/*` | Swept all 233 API routes for a caller anywhere in apps, packages, docs or scripts. 39 have no reference in web TS/TSX; most are legitimately external (cron via vercel.json, SCIM from an IdP, IAP and GitHub webhooks, desktop and mobile clients, the public /api/v1 surface). After excluding those, 17 remain with no production caller ANYWHERE, and 8 of those are deliberate 410 Gone tombstones with tests pinning the status (agents/collaboration, agents/log-message, agents/tools, agents/session, agents/communication, completion, mission, usage/deduct), which is correct practice, not a defect. That leaves 9 live routes, ~530 lines, reachable by nobody: billing/analytics, memory/search, me/routing-preferences, settings/test-provider, usage/history, usage/providers, webhook-diagnostic, voice/health, debug/llm-status. | Three of them are plausibly ops endpoints called by monitoring rather than app code (voice/health, debug/llm-status, webhook-diagnostic), confirm and annotate. `me/routing-preferences` corroborates the existing WEB-US-ONLY-ROUTING-NOT-THREADED-01. The rest need a founder decision: wire or delete. NOT removed unilaterally, an endpoint may have a caller outside this repository, and deleting a live route is a breaking change that no test here would catch. |
| WEB-CORE-CHAT-UI-NOT-LOCALISED-01 | Medium | FIXED 2026-08-24, slice 1 (126 keys) + slice 2 (113 keys, after a scanner fix) landed, ratchet baseline at 0 | Web | `packages/ui/i18n/locales/*/`, `packages/ui/unified-chat`, `apps/web/features/chat` | 254 distinct translation keys carry an inline English default and have NO catalogue entry in any of the 12 locales, so those strings render in English whatever language the user picks. Concentrated in exactly the surfaces a user spends all their time in: sidebar 58, model selector 36, composer 34, projects 24, stream 14, message bubble 12, research 11, header 9. `check:i18n-parity` cannot see this, it compares locales to EACH OTHER, and a key absent everywhere is perfectly consistent. Verified no user-visible raw keys: all 149 keys without an inline default DO resolve, so nothing renders as "chat:placeholder". | RATCHET IN PLACE 2026-08-21, LOWERED 2026-08-24: WEB-CORE-CHAT-UI-NOT-LOCALISED-01 slice 1 (sidebar 56, selector 36, composer 34 = 126 keys, using the ratchet's own scan as inventory rather than a manual grep) now has real translations in `chat.json` (`sidebar`, `composer`) and `models.json` (`selector`) across all 12 locales, the correct catalogue location, since both resolve via `useUiTranslation` called with `chat` or `models`, not the unrelated `v3.json` `sidebar` object. `check:i18n-parity` baseline lowered 254 to 104, re-run clean. Verified by rendering `Sidebar`, `SendButton` and `ModelSelector` against the real locale bundles in a non-English locale and asserting the translated text (not the English default) renders, see `packages/ui/ui/src/sidebar/__tests__/Sidebar.i18nCatalogue.test.tsx` and the two `*.i18nCatalogue.test.tsx` files under `packages/ui/unified-chat`. RESOLVED 2026-08-24 (slice 2): the scanner was fixed first, `check:i18n-parity` now resolves each `t()` call's namespace from its `useUiTranslation`/`useTranslation` binding (or an explicit `ns:key` form) instead of matching bare keys against every catalogue, and scans whole file contents instead of `grep -h`, so both blind spots below are closed. Re-run against the tree, the honest inventory was 113, not 104: `bubble` 12, `composer` 2 (incl. `queueHint`), `goalHandoff` 3, `header` 9, `interface` 8, `list` 7, `projects` 2, `research` 11, `sidebar` 4 (incl. `noConversations`), `stats` 11, `stream` 14, `common` 19, `models.selector` 3, `settings.connectors` 1, `settings.modal` 7. All 113 now carry real translations across all 12 locales; `check:i18n-parity` baseline lowered 104 to 0, re-run clean, and verified in both directions with a probe key. Verified by rendering `MessageBubble`, `ConversationStatsPanel` and `Pagination` against the real `es`/`ru`/`pt` catalogue bundles, see `MessageBubble.i18nCatalogue.test.tsx` and `ConversationStatsPanel.i18nCatalogue.test.tsx` under `packages/ui/unified-chat`, and `Pagination.i18nCatalogue.test.tsx` under `packages/ui/ui`. The two blind spots this row previously tracked are now closed, not just described: `sidebar.noConversations` resolves in the `chat` namespace it is actually read from, and `composer.queueHint`'s multi-line `t(` call is visible to the scan. |
| WEB-SYNC-PAGE-OVERSTATES-WHAT-SYNCS-01 | Medium | COPY FIXED 2026-08-21; feature gap open | Web | `apps/web/app/settings/sync/page.tsx`, `apps/web/shared/stores/web-settings-store.ts`, `apps/web/app/i18n/index.ts` | /settings/sync tells the user "Appearance, personalization, notifications, language, and chat preferences sync automatically across Web and Mobile whenever you are signed in, no request or opt-in step." Only TWO of those five are true on web. Mobile does its half properly: `cloudSettingsMapping.ts` projects appearance, personalization and language into the cloud-safe namespaces and PUTs them. Web writes personalization and notifications, and NEVER writes or reads `appearance`, `language` or `chat`, appearance lives in a zustand store persisted to localStorage, and language is cached by i18next LanguageDetector to cookie plus localStorage. So: set a language on mobile and web stays English; set a theme or chat font on web and it never leaves the device. The claim is unqualified and says "automatically". | COPY FIXED: the page now names only personalization and notifications as syncing from web, states plainly that appearance, display language and chat preferences do NOT, and warns that a change made on mobile will not appear here. Four tests check each claim against the code that would provide it, the appearance store being localStorage-backed, the language detector caching to cookie plus localStorage. FEATURE GAP STILL OPEN: making web participate means giving appearance a cloud path it does not have and reading the synced namespaces on load. That is the better fix; the copy change only stops the page promising it. |
| EXT-CRX-KEY-MISSING-BLOCKS-CLERK-SYNC-01 | High | Open, blocked on founder | Extension | `apps/extension/scripts/manifest-config.mjs`, `apps/extension/.env.local` (`CHROME_EXTENSION_PUBLIC_KEY` absent), `apps/extension/src/features/cloud-bridge/clerkAuth.ts` | Without `CHROME_EXTENSION_PUBLIC_KEY` the built manifest carries no `key`, so Chrome rotates the extension ID. Clerk authenticates the extension by that ID through `allowed_origins`, so a rotating ID means the sync-host handshake is rejected: the side panel sits on "Sign in to sync" while the web app reports a live session. `validateReleaseManifest` already requires the key for a production package; the dev path did not, so the failure was silent. | Built manifest inspected 2026-08-20: `host_permissions` and CSP carry the Clerk origin, `key` absent. A build warning now fires when the key is missing and the sync host is remote. Unblocking needs a generated keypair plus `chrome-extension://<id>` in the Clerk instance allowed_origins, founder credentials required. |
| DESKTOP-WORKSPACE-INDEXING-UNWIRED-01 | Medium | Partially Fixed (symbol-indexer half CUT 2026-07-30; semantic-embeddings half still open) | Desktop | `apps/desktop/src-tauri/src/core/embeddings/{indexer,chunker,similarity}.rs`, `apps/desktop/src-tauri/src/sys/commands/embeddings.rs`, `apps/desktop/src/api/embeddings.ts` | SPLIT 2026-08-06. (1) Symbol/codebase indexer, CLOSED: the workspace\_\* command family, the core/codebase indexer module, and the api/workspace TS wrapper (all three now DELETED, written without path syntax on purpose, since they no longer resolve) were removed as one vertical slice on 2026-07-30 (see the entry at lines 959-966 of this file). Those paths no longer exist, so do not go looking for them. (2) Semantic embeddings indexer, STILL OPEN: `index_workspace`, `index_file`, `semantic_search_codebase`, `get_embedding_stats`, and `get_indexing_progress` remain implemented with the TS wrapper `api/embeddings.ts`, which no other file imports, and none of the commands appear in the LLM tool executor or `chat/tools.rs`. Note the SAME embedding stack does have one real consumer elsewhere: `core/embeddings/mod.rs` backs `EmbeddingGenerator`, which project RAG uses. Wire-or-cut applies only to the unreachable workspace-indexing commands, not to `core/embeddings` itself. | Symbol half cut. Embeddings half unfixed: `grep -rl "from.*api/embeddings'" apps/desktop/src` still returns zero hits outside the file's own definition. |
| DESKTOP-GIT-PANEL-UNREACHABLE-01 | Medium | Open, decision needed | Desktop | apps/desktop/src/features/chat/InlinePanels/InlinePanelRenderer.tsx (module removed), `apps/desktop/src/handlers/commands/system.ts:5-46` (`executeGitCommand`), `apps/desktop/src/features/git/GitPanel.tsx`, `apps/desktop/src/features/chat/DynamicSidecar.tsx:521-525`, `apps/desktop/src/stores/ui.ts:717-758` (`setSidecarSectionFromEvent`) | Git has two working paths and one broken one. Working: the agent tool-calling path (`git_status`/`git_diff`/`git_commit`/`git_log`/`git_add`/`git_push`/`git_init`/`git_clone` tool defs in `ToolRegistry::register_all_tools`, gated by `code_execution` capability) renders correctly via `InlineGitResult`. Broken: the direct `/git <args>` slash command (`features/chat/index.tsx:676-677` → `executeGitCommand`) calls the same real git2-backed backend but produces an `InlinePanel` of type `'git'` that has NO case in `InlinePanelRenderer.tsx`, falls through to the "Unknown panel type: git" fallback box, visible to any user who types `/git status`. Also fully orphaned: a complete `GitPanel.tsx` sidecar component is wired into `DynamicSidecar.tsx`'s switch statement (`case 'git'`) but nothing anywhere calls `openSidecar('git', ...)`, and `setSidecarSectionFromEvent` has no `'git'` branch to auto-open it, the component can never be reached by any user action. | Not yet fixed. Repro: type `/git status` in the live composer, observe "Unknown panel type: git". |
| DESKTOP-ARTIFACTS-ENTIRELY-UNWIRED-01 | Critical | Partially Fixed (2026-07-15; persistence/reopen fixed, token streaming open) | Desktop | `apps/desktop/src/runtime/TauriRuntime.ts`, `apps/desktop/src-tauri/src/core/artifacts/store.rs`, `apps/desktop/src-tauri/src/core/llm/tool_executor/artifact_tools.rs`, `apps/desktop/src-tauri/src/core/agi/tools/mod.rs`, `apps/desktop/src-tauri/src/sys/security/tool_guard.rs`, `packages/ui/unified-chat/src/components/{ArtifactRenderer,ArtifactPanel,ChatInterface}.tsx`, `packages/ui/unified-chat/src/lib/runtime.ts`, `apps/desktop/src/features/artifacts/ArtifactPanel.tsx`, `packages/ui/unified-chat/src/components/artifact-components/ReactPreview.tsx`, `packages/ui/unified-chat/src/lib/artifact-sandbox.ts` | Feature-inventory audit (2026-07-03) found the ENTIRE Artifacts/Canvas feature category, a complete, well-built implementation (React component sandbox via Babel-standalone, CSP-hardened HTML/SVG rendering, real `mermaid` npm rendering, document/code-file artifacts, live streaming preview, versioning with rollback, inline editing, copy, download, "download all"), was completely unreachable in the live app: no `'artifact'` Tauri event listener, no LLM-facing trigger, and `ChatInterface.tsx`'s `ArtifactPanel` mount missing `onSaveEdit`/`versions`/`onSelectVersion`. FIX (same day): (1) added an LLM tool call `create_artifact` (mirrors the existing `document_create_word`/`document_create_pdf` pattern in `core/llm/tool_executor/`, registered in `core/agi/tools/mod.rs` + `sys/security/tool_guard.rs` policy), chosen over a fenced-code-block convention because it reuses the existing tool-calling loop verbatim (works identically for native function-calling AND `prompt_tool_injection.rs`'s text-parsed fallback for models without native tool support); (2) the tool handler calls the existing `ArtifactState::create` and emits a new `chat:artifact` Tauri event carrying the artifact in the FRONTEND's `ArtifactType` shape (code/markdown/html/mermaid/react/svg/table/spreadsheet/presentation/document), the backend's coarser persistence `ArtifactType` enum is used only for `ArtifactState` storage, mapped via a documented, intentionally lossy table (e.g. `react`→`Code`, `svg`→`Image`) in `artifact_tools.rs`; (3) `TauriRuntime.ts` now listens for `chat:artifact` (mirrors the `chat:stream-chunk`/`tool:event` pattern) and pushes the already-existing `{ type: 'artifact' }` `StreamChunk`, which `useChat.ts` already correctly turned into `message.artifacts`, this half of the pipe was dead code until now; (4) `ChatInterface.tsx` now passes real `onSaveEdit` (persists via a new `ChatRuntime.updateArtifact`, implemented in `TauriRuntime.ts` on top of the already-registered `artifact_update` command) and `versions`/`onSelectVersion` (via a new `ChatRuntime.getArtifactVersions`, fetching real backend version history through `artifact_get_versions` and using the caller's already-known `Artifact` as the type/title/language template, since the backend can't honestly reconstruct the frontend's richer type). Item 5 (the known-flaws citation of a 100ms streaming-preview poll) turned out to reference the DEAD legacy `apps/desktop/src/features/artifacts/ArtifactPanel.tsx` (wired to the unrelated, also-dead `useArtifactStore`/`ChatStream.tsx` path), the LIVE `packages/ui/unified-chat/src/components/ArtifactPanel.tsx` used by `ChatInterface.tsx` has no polling at all; since `create_artifact` delivers a complete artifact in one tool-call round trip (not incremental token-by-token growth), no polling is needed for this trigger mechanism. REMAINING GAPS (tracked, not blocking): (a) artifacts do not survive a conversation reopen, `TauriRuntime.ts::mapMessage` does not map an `artifacts` field when loading message history from `chat_get_messages`, so `message.artifacts` is only ever populated live during the turn that created it; (b) no true token-level streaming into the artifact panel while the model is still generating (Claude-style live-typing), the tool-call convention only delivers content once the full tool call is parsed; (c) `react`/`svg` backend persistence is lossy (documented in `artifact_tools.rs`) so re-fetching those artifacts' versions after an app restart would show them as `code`/`image` type if `mapMessage` is later extended to reload them. UPDATE 2026-07-15: the durable artifact owner is now the existing `artifacts`/`artifact_versions` store, not a duplicate message blob. Migration v73 adds `artifacts.message_id`; `Artifact::render_type` preserves the exact shared renderer type in the canonical `artifacts.artifact_type` column while the coarse Rust enum remains native-only metadata. `create_artifact` persists version/timestamps, stream-end atomically and idempotently links every artifact to the authorized assistant message, and conversation reload fetches the complete authorized snapshot with exact `react`/`svg`/language/version reconstruction. The old hidden 500-row conversation-reload cap is removed. IPC snapshot rows are runtime-validated: malformed rows are skipped and unknown future renderer types fall back through the validated coarse category. Cancellation now waits for native stream-end (with a 10-second fail-explicit watchdog) so artifacts link before listener teardown. Critical privacy repair: the chat turn passes an explicit `persist_internal_resources` policy into the tool executor; incognito artifacts remain usable in memory for the active UI but write zero artifact, version, or message-link rows, while normal Local/BYOK/Managed conversations keep their existing mode-derived persistence/sync behavior. Atomic validation prevents partial links when a batch contains a missing/conflicting artifact. Edge coverage includes 0/1/500/501 rows, duplicate IDs, malformed legacy metadata, empty/unknown renderer types, fresh-store restart, concurrent creates, cancellation, failed link batches, and multi-version fidelity. Deleted backing files are not applicable because this artifact contract persists inline content rather than filesystem references. UPDATE 2026-07-15 (cross-device ownership and pull ordering): migration v74 adds `artifacts.message_cloud_id`; managed-cloud push serializes only the validated portable UUID and never the local SQLite integer, while Local/BYOK rows retain no cloud owner and do not egress. Linking a cloud artifact before or after its message receives a cloud ID repairs the owner and requeues the artifact; pull resolves an owner only to a live message in the same user and conversation, and message tombstones detach the local link without erasing portable identity. The web sync write uses a `valid_input` CTE to accept `messageId` only when its live source message and parent conversation belong to the authenticated user and submitted conversation; foreign, deleted, and missing owners take the existing non-disclosing conflict path. Parentless artifact deltas now enter a durable user-scoped journal keyed by `(user_id, cloud_id)`, retain only the newest server revision (including tombstones), replay after each conversation page and at sync completion, survive restart, and are deterministically capped per user at 2,000 rows / 64 MiB. Conversation tombstones remove their buffered children; replay cannot cross user, conversation, or Local/Cloud boundaries. Edge coverage includes same-page and later-page owners, record 501, restart between pages, duplicate/reordered revisions, create/tombstone orderings, permanently missing parents, row/byte pruning, malformed identities, late message-ID races, message/conversation tombstones, and idempotent replay. REMAINING PRODUCT GAP: true token-level artifact streaming is still not implemented; `create_artifact` becomes visible only after the complete tool call is parsed. No polling or fake streaming was added. | Verified 2026-07-15: `RUSTFLAGS='-D warnings' cargo test -p agiworkforce-desktop artifact --lib` (70/70), `data::cloud_sync::tests::` (71/71), and `data::db::migrations::tests::` (12/12); Web sync contract/push tests (13/13); Desktop `TauriRuntime.test.ts` (11/11); `@agiworkforce/types` tests (302/302) and `@agiworkforce/unified-chat` tests (624/624). Desktop/types/unified-chat typechecks, lane-owned ESLint/Prettier/rustfmt checks, boundaries, capability boundaries, trust boundaries across all surfaces, module reachability, service-layer, Neon migration, agent-context, repo-organization, structure-convention checks, and scoped `git diff --check` are green. The full web typecheck is blocked outside this lane by `app/api/llm/v1/chat/completions/__tests__/stream-transform.managed-usage.test.ts:57`, whose concurrent test fixture is missing four required `IndicDetectionResult` fields; the lane-owned route/tests pass. `check:llm-failures:changed` remains red on ten unrelated pre-existing/concurrent changed-tree findings outside the artifact files. Live model-driven/signed-Tauri artifact creation, cross-device sync, and reopen were not rerun in this environment; deterministic Rust/IPC/SQL contracts are green. |
| DESKTOP-CLOUD-MODE-SPEC-VS-REALITY-01 | Critical | Open, DCL-1/DCL-2/DCL-3 done; DCL-4 blocked on signed build + live Clerk credentials (2026-07-03) | Desktop | `apps/desktop/src/stores/appModeStore.ts` (`setMode`, `migrate`), `apps/desktop/src/lib/cloudChatPersistence.ts`, `apps/desktop/src/services/cloudChat.ts`, `apps/desktop/src-tauri/src/sys/commands/chat/cloud.rs:59`, `apps/desktop/src-tauri/src/data/cloud_sync.rs`, `apps/desktop/src/lib/cloudSyncTrigger.ts`, `apps/web/app/api/chat/conversations*`, `apps/web/app/api/chat/sync/route.ts`, `apps/web/features/chat/hooks/use-chat-persistence.ts`, `apps/web/lib/cors.ts` | The founder's latest canonical desktop spec states Desktop Cloud Mode "uses the exact same cloud backend... as AGI Web... without any difference in data or experience." `appModeStore.setMode('cloud')` still refuses on every Tauri build (`supportsLocalAppMode` true → "coming soon" toast, no state change; `migrate()` also force-resets any stale persisted `cloud` mode to `local`), so this row is still fully gated as previously recorded. NEW this pass (2026-07-03, tasked to build the seam): found THREE separate, only-partially-overlapping cloud-chat mechanisms in the codebase, not one. (A) The old Supabase-era `cloud_*` Tauri commands (`cloud.rs`) are intentionally fail-closed with `[ERR_CLOUD_NOT_IMPLEMENTED]`; `apps/desktop/src/services/cloudChat.ts` still calls them and `chatStore.ts`'s `isCloudMode()` branches (create/load/rename/delete conversation, load messages) still route there today, dead on arrival, contradicting `cloud.rs`'s own comment that these commands have "no caller." (B) A newer TS-only seam (DCL-1/2, commits `b89ded8fe`/`9c8634f9b`): `packages/ui/unified-chat/src/lib/cloud-chat-persistence-client.ts` + `apps/desktop/src/lib/cloudChatPersistence.ts`, targeting the real `/api/chat/conversations*` Neon-backed REST routes over plain WebView `fetch` (`guardedFetch`), built and unit-tested, but never wired into `chatStore.ts` (so (A)'s dead branches are still the live ones), and has a concrete, empirically-confirmed CORS gap: `curl -X OPTIONS https://agiworkforce.com/api/chat/conversations -H "Origin: https://tauri.localhost" ...` returns 204 with NO `Access-Control-Allow-Origin` header (Next.js's default auto-OPTIONS, not an opt-in CORS response), while the same probe against `/api/me` (which desktop already calls successfully with a Bearer token) correctly reflects `access-control-allow-origin: https://tauri.localhost` via `apps/web/lib/cors.ts`'s `handleCorsPreflightRequest`/`OPTIONS` export. None of `/api/chat/conversations/route.ts`, `[id]/route.ts`, `[id]/messages/route.ts`, or `[id]/messages/bulk/route.ts` export `OPTIONS` or call `lib/cors.ts`, a real WebView `fetch()` from the desktop app's `tauri://localhost`/`https://tauri.localhost` origin to any of them would be blocked by the browser's own CORS preflight before the request body (or the Bearer token) is ever evaluated server-side. CORRECTION (2026-07-03, independently re-verified): the claim above that web itself has no working message-persistence reference is WRONG, it was based on reading the wrong files. `use-chat-persistence.ts`'s `saveMessages()` IS a hardcoded no-op and `WebChatRuntime.ts` genuinely never calls a persist route, both as described, but neither file is in web's live path. Both are consumed only by `apps/web/features/chat/pages/UnifiedChatPage.tsx`, which no `app/**/page.tsx` route renders (`chat-route.test.tsx` asserts the real `/chat` and `/chat/[sessionId]` routes render `WebChatPage.tsx` instead), an orphaned, unrouted duplicate implementation, not production code. The ACTUAL live chat page (`app/chat/page.tsx` → `WebChatPage.tsx:432`) uses `useChatStream()` (`apps/web/lib/hooks/useChatStream.ts`), whose `saveMessageToDb()` (lines 150-230) does a real `POST /api/chat/conversations/${conversationId}/messages` with retry/backoff on 5xx/network errors, called for both the user message (line 341) and completed assistant message (lines 719, 921, 982); the route does a real `insert into web_messages` (`[id]/messages/route.ts:83`). Verified via the real durability suite: `pnpm vitest run lib/hooks/__tests__/useChatStream.save.test.ts` → 10/10 passed (retry, 429 surfacing, network-error recovery, non-retryable 4xx). Conclusion: web's message persistence IS real and working end-to-end for the routed, user-facing surface, `useChatStream.ts`'s `saveMessageToDb()` is the correct reference implementation for desktop to mirror, not `use-chat-persistence.ts`/`WebChatRuntime.ts`. (C) A THIRD, much more mature, independently-discovered mechanism: `apps/desktop/src-tauri/src/data/cloud_sync.rs` (2,820 lines, extensively unit-tested) is a Rust-native (`reqwest`, not WebView, no CORS exposure) local-first delta-sync engine that pushes/pulls conversations+messages+artifacts between local SQLite and a bespoke `POST /api/chat/sync` endpoint (confirmed real: `apps/web/app/api/chat/sync/route.ts` exists) using the same Bearer-token account auth as `/api/me`. It is wired to a real Tauri command (`sync_conversations_to_cloud`) and a real TS trigger (`cloudSyncTrigger.ts`: post-turn debounce, 30s interval, mode-transition hook) that also fans out to `memory_sync`/`projects_sync`/`settings_sync`, but `cloudSyncTrigger`'s gate (`selectPrivacyMode(...) === 'managed'`) is unreachable for the exact same root reason as (A)/(B): `appModeStore.setMode('cloud')` never lets desktop leave Local mode, so `isManagedMode()` is always false and the sync engine never fires despite being fully built and tested. Mechanism (C) is architecturally different from (A)/(B): it is local-first/eventually-consistent (chat still runs against local SQLite + local/BYOK/managed inference; a background job mirrors data to Neon), not a live pass-through where Neon is the source of truth on every send, this may or may not satisfy the founder's "no difference in data or experience" bar, which is a product decision, not a code-verification one. | CORRECTION (2026-07-03): the CORS gap only blocks a WebView `fetch()` (mechanism B as prototyped), it does not apply at all to a Rust-native `reqwest` call, since CORS is a browser-enforced restriction with no meaning to a non-browser HTTP client (exactly why mechanism (C)'s `cloud_sync.rs` has "no CORS exposure"). So the live-pass-through path does NOT actually require a web-side CORS fix: implement (B)'s request shape (mirroring `useChatStream.ts`'s real `saveMessageToDb()`, `POST /api/chat/conversations/{id}/messages` with the Bearer token, retry/backoff on 5xx) via a Rust-side HTTP client in `apps/desktop/src-tauri`/`apps/desktop/src-tauri` (same pattern as `DirectApiProvider`), exposed through a Tauri command, entirely within `apps/desktop`'s write scope. This removes the cross-surface blocker, remaining decision is narrower: (B) live pass-through (Neon is source of truth every send, matches spec literally, now buildable desktop-only) vs (C) reuse the already-built `cloud_sync.rs` local-first engine (less spec-literal but zero new code). Recommend (B) for chat send/persist/reload specifically, since a working reference implementation now exists to mirror exactly; (C) remains valuable as the mechanism for background multi-device delta-sync of history, not mutually exclusive. Whichever is chosen, un-gating `appModeStore.setMode('cloud')` still requires a REAL end-to-end verification with a live Clerk Bearer token, which requires a human with real credentials (or a working device-link sign-in completed via computer-use/browser), no sandboxed session so far has been able to obtain one. Re-verify the gate is still closed with `grep -n "DESKTOP_CLOUD_COMING_SOON" apps/desktop/src/stores/appModeStore.ts`. CORRECTION (2026-07-03, retry pass, desktop-engineer, tasked to wire Cloud Mode chat end-to-end): two more load-bearing facts sharpen the decision further, found by tracing what the live UI actually calls rather than re-reading (A)/(B)/(C) in isolation. First, (A) and (B) above are NOT the live chat surface. `App.tsx` renders `DesktopShellV3` (feature flag `desktop_chat_v3` defaults `enabled: true`) or `ChatInterface` as a fallback, and BOTH are driven by `apps/desktop/src/runtime/TauriRuntime.ts`, whose `sendMessage`/`loadMessages`/`loadConversations` call `chat_send_message`/`chat_get_messages`/`chat_get_conversations` (`apps/desktop/src-tauri/src/sys/commands/chat/{send_message,conversation}.rs`), these persist to local SQLite in every mode via `repository::create_conversation`/`list_messages`, with zero mode-branching. `chatStore.ts`'s `isCloudMode()` branches (which call (A)'s dead `cloud.rs` commands via `apps/desktop/src/services/cloudChat.ts`) are consumed only by the legacy `useChatStore` barrel used for `chatHostBridge`/QuickQuery bookkeeping, not by the live send/receive path. So the earlier recommendation to wire a new Rust `reqwest` client into (A)'s `cloud_*` stub would produce code the live UI never calls, repeating the exact "built but unreachable" pattern this row already documents for (B) and (C). Second, mechanism (C) is further from live than previously recorded: three independent, disconnected gates must ALL close simultaneously before it fires, and none is reachable today. (i) `chatPreferences.chatStorageMode` (gates `sync_conversations_to_cloud` server-side) has a real setter, `useSettingsStore.getState().setChatStorageMode`, but zero UI callers anywhere in `apps/desktop/src`, confirmed by grep; no Settings screen ever invokes it, so a user cannot opt in even if the mode gate were lifted. (ii) the only code path that tags a new conversation `app_mode='cloud'` and marks it for push (`repository::create_conversation_with_mode` plus `cloud_sync::mark_conversation_for_push`, inside `send_message_setup.rs::load_or_create_conversation`) runs ONLY when `chat_send_message` is invoked without a `conversation_id`, but the live `TauriRuntime.ensureBackendConversation` always pre-resolves or creates the conversation via the older, mode-blind `chat_create_conversation` command before ever calling `chat_send_message`, so this branch is dead from the live path; every conversation created through the live UI defaults to `app_mode='local'` regardless of the active app mode. (iii) `cloudSyncTrigger.ts`'s `isManagedMode()` gate (`selectPrivacyMode(...) === 'managed'`) was already known to be unreachable via the `setMode('cloud')` block; re-confirmed unchanged this pass. Net effect: mechanism (C) is not one gate away from working, it needs a UI toggle, a conversation-tagging fix in the live send path, and the mode gate lifted, three separate changes, before any of its already-tested push/pull logic would ever execute for a real user. Also re-confirmed this pass: `apps/web/app/api/chat/sync/route.ts` implements both `GET` (delta pull, cursor-paginated, tombstone-aware) and `POST` (delta push, idempotent upsert), so (C), if fully wired, would satisfy send, persist, and reload without new web-side work. Live end-to-end verification remains infeasible in this sandbox for either path: `apps/web/.env.local` is not readable via the available tools (permission denied), and a repo-wide search found no Clerk test-token minting (`CLERK_TESTING_TOKEN`/`clerkTestingToken`) anywhere in `apps/web`, so there is still no way to mint a real Bearer token here. No code was written this pass, escalated back to supervisor/founder for the architecture decision (direct per-message write into the live `TauriRuntime` surface, versus finishing the three-part wiring of the already-tested local-first `cloud_sync.rs` engine) rather than building further code toward either dead end. RESOLUTION OF THE "ARCHITECTURE DECISION" (2026-07-03): there is no decision to make, one already exists and is locked. `docs/strategy/PUBLIC-ALPHA-CUTOVER.md` defines a staged rollout, DCL-1 through DCL-4, that IS mechanism (B) above: DCL-1 (`b89ded8fe`, done) extracted a shared cloud-persistence client, DCL-2 (`9c8634f9b`, done) wired desktop's seam to it, DCL-3 (trust-boundary/egress-guard work + repurpose the `cloud.rs` placeholder, NOT done) and DCL-4 (cross-surface live proof + copy flip, NOT done, explicitly requires a signed build + real Clerk credentials) remain. Mechanism (C) (`cloud_sync.rs`) is NOT part of this plan at all, an independently-built, untracked parallel effort; do not conflate it with the sanctioned path. **But DCL-1's foundation is broken**: it extracted from `apps/web/features/chat/hooks/use-chat-persistence.ts`, which is dead/unrouted code (see `docs/strategy/PUBLIC-ALPHA-CUTOVER.md`'s 2026-07-03 correction note), the real live reference is `apps/web/lib/hooks/useChatStream.ts`'s `saveMessageToDb()`. So DCL-2's seam, while real and unit-tested, does not actually mirror what web's chat does today. Concrete remaining path: (1) realign DCL-1's extracted client to `useChatStream.ts`'s actual request/retry/backoff shape, desktop-write-scope-compatible, no founder decision needed, just correct the reference; (2) complete DCL-3 (egress guard + cloud.rs repurposing); (3) DCL-4's signed-build + live-credential verification + gate flip is the one step that genuinely cannot be done in an agent sandbox, it needs the founder (or CI with real signing/Clerk secrets) to run it directly. Do not attempt to lift the `PA-3` gate (`appModeStore.setMode('cloud')`) without DCL-4 actually completing, it is a deliberately locked decision (`DESK-CLOUD-COPY-01`, resolved by commit `66ce9c8a1`), not an oversight. DCL-1/DCL-3 EXECUTION UPDATE (2026-07-03, desktop-engineer, execution pass, no architecture decision made or needed): completed the two remaining, non-DCL-4 concrete steps this resolution called for. (1) DCL-1 realignment: `packages/ui/unified-chat/src/lib/cloud-chat-persistence-client.ts` had conversation CRUD (create/get/update/delete/list, extracted from the dead `use-chat-persistence.ts` hook) but literally NO message-save method, that hook's `saveMessages()` is a no-op, so there was nothing to extract for the one operation that actually matters. Added `saveMessage()` mirroring `useChatStream.ts`'s `saveMessageToDb()` exactly: same route, body shape, retry policy (3 attempts, backoff on network/5xx only, no retry on 429/4xx), id-fallback, and error strings. 34 tests added, full package suite green (505/505). Web's live `useChatStream.ts` was deliberately NOT migrated to the shared client (too risky to touch web's live chat path as a side effect of a desktop task), tracked as a follow-up. (2) DCL-3: re-verified and found ~90% already done in `9c8634f9b` (egress guard already blocks Local/BYOK and allows managed-only; contract test already existed; `cloud.rs` already carries an "INTENTIONAL ABSENCE" doc comment), the "NOT done" status in the prior pass was stale. Extended the egress contract test to cover the new `saveMessage` verb. Confirmed `cloud.rs`'s six `cloud_*` commands still have live TS callers (`apps/desktop/src/services/cloudChat.ts` → `chatStore.ts`'s `isCloudMode()` branches) so they were NOT deleted, only left with their existing doc comment. See `docs/strategy/PUBLIC-ALPHA-CUTOVER.md`'s DCL-1/DCL-3 rows for full detail. Remaining: DCL-4 only (cross-surface live proof + copy flip), still requires a signed Tauri build and real Clerk credentials unavailable in any agent sandbox; PA-3 gate confirmed untouched. DCL-1 CREATECONVERSATION REALIGNMENT (2026-07-03, desktop-cloud-qa, tasked to test Desktop Cloud Mode E2E, found the gate closed, escalated to founder, redirected to fix the createConversation gap the prior DCL-1 pass had flagged as a follow-up): `createConversation` now sends `id`/`model`/`projectId` (previously only `title` + a dead `mode` field the real schema doesn't define); `CloudConversation` now maps `model`/`project_id` from the response (previously dropped). Full detail + test counts in `docs/strategy/PUBLIC-ALPHA-CUTOVER.md`'s DCL-1 realignment note. NEW GAP FOUND: `getDesktopCloudChatPersistenceClient()` has ZERO call sites anywhere in `apps/desktop/src` outside its own file, even with the PA-3 gate lifted on a hypothetical signed build, no runtime/store/component ever calls it today. DCL-4 needs this wiring (a `Cloud` branch in `TauriRuntime.ts` or a new `CloudRuntime.ts`) as a separate, not-yet-started code step, independent of the credentials blocker. CREDENTIALS/ENV CHECK (2026-07-03): re-confirmed no safe test path exists to reach Cloud mode on a Tauri build, `runtimeEnvironment.ts` has only `isTauri` and `VITE_DESKTOP_UI_DEV_LOCAL`, and BOTH set `supportsLocalAppMode=true` (the gate's trigger condition), so there is no dev/test flag that lets a desktop build reach `mode==='cloud'`. `apps/web/.env.local` and `apps/desktop/.env.local` remain permission-denied to read in this sandbox; no `CLERK_TESTING_TOKEN`/`clerkTestingToken` exists anywhere in the repo. Did not attempt to obtain live production credentials or add a gate bypass (explicitly out of scope). DCL-4 stays blocked on: (1) the `getDesktopCloudChatPersistenceClient()` wiring gap above, (2) a signed Tauri build, (3) real Clerk credentials, none obtainable in an agent sandbox. CLOUDRUNTIME WIRING (2026-07-03, desktop-cloud-qa, closing gap (1) above per team-lead direction): added `apps/desktop/src/runtime/CloudRuntime.ts`, a `ChatRuntime` implementation (mirrors `WebRuntime.ts`) that is now the first real caller of `getDesktopCloudChatPersistenceClient()`, conversation CRUD + message persistence route through it, streaming reuses the existing `sendCloudMessage` (`apps/desktop/src/api/cloudApi.ts`, already targets the same live endpoint web's `useChatStream.ts` calls). Added a Vite alias for `@agiworkforce/utils/uuidv7` (`apps/desktop/vite.config.ts`) since no prior desktop file imported an `@agiworkforce/utils/*` subpath. `App.tsx`'s runtime selection (`isTauri ? TauriRuntime : WebRuntime`) is intentionally UNCHANGED, `CloudRuntime` is not selected by anything yet; wiring the selection is deferred to whoever completes DCL-4 alongside the PA-3 gate lift, since it can't be verified live without the same signed-build+credentials blocker. Verified: `pnpm --filter @agiworkforce/desktop typecheck` clean; new `CloudRuntime.test.ts` 12/12 (mock-only); targeted suite (`src/runtime`, `cloudChatPersistence`, `cloudPersistenceEgress`) 30/30. Full detail in `docs/strategy/PUBLIC-ALPHA-CUTOVER.md`'s "CloudRuntime wiring" note. PA-3 gate and copy untouched. |
| DESKTOP-VOICE-CONVERSATIONS-UNWIRED-01 | High | Open, corrected + expanded; escalation needed (build-flag AND trust-boundary decision) | Desktop | `apps/desktop/src/features/voice/VoiceMode.tsx`, `apps/desktop/src/stores/settings/voice.ts` (`useVoiceModeStore`), `apps/desktop/src-tauri/src/features/speech/{local_stt,tts,local_tts,barge_in,vad}.rs`, `apps/desktop/src-tauri/Cargo.toml` (`local-whisper` feature), `apps/desktop/src/features/chat/AudioPreview.tsx` | Path correction first: `apps/desktop/src-tauri/` (cited in the original row) does not exist, the real crate root is `apps/desktop/src-tauri/`. Re-verified this session with a live native WDIO run, not just static reads. CONFIRMED as originally described: `VoiceMode.tsx` (full-screen orb overlay, spacebar/tap push-to-talk, transcript + turn history, phase animation, genuinely complete, not a stub) backed by `useVoiceModeStore` (`startListening`/`stopListeningAndProcess`, a real listen→transcribe→LLM→speak loop) has ZERO live render call anywhere in the app (`grep` for `<VoiceMode` / `import.*VoiceMode` from `features/voice/VoiceMode.tsx` finds only the file itself + a test). CORRECTION to the fix path: wiring `VoiceMode.tsx` in as-is would ship a FAKE feature, not a real one, `stopListeningAndProcess` hardcodes `voiceTranscribeBlob(audioData, format, 'local_whisper', 'en')`, and `local-whisper` is an optional Cargo feature (`whisper-rs` dependency) that is NOT in `[features] default = [...]` in `apps/desktop/src-tauri/Cargo.toml` and is not passed by any build script, CI workflow, or `package.json` script (`grep -r "local-whisper"` across the repo returns only the Cargo.toml declaration itself). So in every shipped build, that call always fails server-side with "Local Whisper support not compiled", the orb would render, "listen," and then always error on transcription, which is the exact fake-availability bug class this file tracks. TTS finding stands and was independently re-confirmed real: `SystemTts` (macOS `say` shell-out, `tts.rs`) is real, has no feature-flag gate, and is `TtsConfig::default()`'s provider, it works today with zero setup, but still has no "read aloud" control anywhere in the live `MessageBubble`/`ChatInterface` surface. NEW finding this session, correcting a gap in the original framing: basic voice-TO-TEXT is NOT wholly absent from the live app, `packages/ui/unified-chat/src/components/ChatInput.tsx` (the real, live composer under `DesktopShellV3`→`ChatInterface`) has a real mic button wired to `packages/ui/unified-chat/src/hooks/useVoiceInput.ts`, which uses the browser's native `SpeechRecognition`/`webkitSpeechRecognition` Web Speech API, confirmed LIVE via native WDIO against the actual Tauri WKWebView (not a mock): `webkitSpeechRecognition` is a defined constructor (`typeof window.webkitSpeechRecognition === 'function'`), the mic button renders (`button[aria-label="Voice input"]` present), and clicking it calls `.start()` without a synchronous throw and sustains `aria-label="Stop recording"` (React `state==='listening'`) for 16+ seconds with neither `onerror` nor `onend` firing, consistent with a genuinely active recognition session, not a stub. This is a separate, simpler mechanism from `VoiceMode.tsx`/`useVoiceModeStore` and is NOT full duplex (no TTS reply, no orb), it only dictates into the composer text field, but it is real and reachable today, which the original row's framing (via omission) did not capture. Speaker/output-device selection is still MISSING entirely (zero grep hits for `speaker`/`outputDevice`/`setSinkId`), and Microphone Selection + Voice Selection are each still effectively `partial` per the original finding, now further detailed in `DESKTOP-VOICE-DICTATION-STORE-MISMATCH-01` below. | Not fixed, investigated deeply this session but deliberately NOT wired, because doing so safely is blocked by two things needing a decision above this task's scope, not a quick fix: (1) `local-whisper` is a real Cargo-feature/build-system change (native `whisper-rs`/whisper.cpp linkage, binary size, possibly notarization impact) needed before `VoiceMode.tsx`'s hardcoded STT path can ever succeed; (2) the only currently-functional non-local STT paths (managed cloud `/api/llm/v1/audio/transcriptions`, or BYOK OpenAI Whisper) would require deciding what `VoiceMode`/voice dictation should silently default to for a Local-mode user, CLAUDE.md's Local/BYOK/Cloud trust-boundary rule forbids silently routing Local audio to BYOK or managed cloud, so this is an explicit escalation, not something to pick unilaterally. `SystemTts` "read aloud" was assessed as a small, real, Local-safe candidate increment (no feature flag, no trust-boundary crossing) but wiring it into `MessageBubble.tsx` would require adding a capability through `packages/ui/unified-chat/src/components/ChatInterface.tsx` and/or `packages/ui/unified-chat/src/lib/runtime.ts`, both explicitly out of scope this session (owned by a concurrent Cloud Mode chat-wiring agent), so it was deliberately left undone rather than bypassing the runtime abstraction with a direct Tauri import from a shared package. Live verification performed: native WDIO run against the real `target/debug/agiworkforce-desktop` binary + embedded WKWebView driver (ad hoc scratch spec, deleted after use per repo convention, not committed) confirmed the `webkitSpeechRecognition` findings above. |
| DESKTOP-MISC-CRITICAL-GAPS-01 | Medium | Open, needs fix | Desktop | `apps/desktop/src/features/settings/FontSelector.tsx` (zoom shortcuts), `apps/desktop/src-tauri/src/sys/diagnostics/*`, various | Batch of smaller but real, user-facing findings from the same audit, each independently confirmed: (1) Settings → General → Keybindings displays "Zoom in ⌘=" / "Zoom out ⌘-" / "Reset zoom ⌘0" as if live, but pressing them does nothing, no webview zoom or font-scale logic is wired to them at all, another fake-availability-class bug; (2) Continue Generation has literally zero implementation anywhere in the desktop surface (not even dead code, no UI trigger, store state, runtime method, or Tauri command); (3) High Contrast accessibility mode does not exist anywhere in the codebase (no forced-colors/prefers-contrast media query, no theme option); (4) a complete 937-line `/doctor`-style diagnostics/health-check backend (`sys/diagnostics/{mod,runner,commands}.rs`) has zero frontend entry point, not even hidden/dev-only; (5) Notification Actions (OS action-button click-to-navigate) backend is complete but has zero live callers; (6) Account Switching and Apple Login are both entirely missing (auth store's `signInWithOAuth` is hard-typed to only accept `'github'` or `'google'`); (7) Billing and Subscription Management UI both exist as real implementations but are unreachable from the live app the same way Sign In is (see `DESKTOP-CLOUD-MODE-SPEC-VS-REALITY-01`). | Not yet fixed individually. Each is independently reproducible per the audit's cited evidence; treat as a punch list rather than one fix. |
| DESKTOP-LINUX-PLATFORM-GAP-01 | Medium | Tracked | Desktop | `apps/desktop/src-tauri/src/automation/computer_use/window_manager.rs`, `apps/desktop/src-tauri/Cargo.toml` | Linux has effectively zero platform-specific integration work, unlike macOS/Windows. GNOME, KDE, and Wayland: no code at all (zero grep hits for GSettings/dconf/portal/ashpd, no KIO/org.kde.\*/StatusNotifierItem/zbus, no positive Wayland-targeting code, every Wayland reference in the codebase is a defensive "this will fail on Wayland" note, not support). X11: one real integration point exists (`xdotool` shell-out in `window_manager.rs:648-687`) but it only serves the computer-use safety-gate's active-window lookup, not actual automation, computer-use itself is hard-blocked on all Linux regardless of X11/Wayland. Native file-manager integration (`xdg-open` via `file_open_with_default_app`) is fully implemented but has zero live callers anywhere. Net: the app runs on Linux only via Tauri's generic webkit2gtk/GTK bundling, with no Linux-specific desktop-environment work of any kind. Separately, Windows Jump Lists are also entirely missing despite the `windows` crate already being a dependency. | Read-only sweep; no runtime Linux testing was possible in this environment (macOS dev machine). |
| DESKTOP-PROJECT-ARCHIVE-AND-MEMORY-CATEGORIES-UNWIRED-01 | Low | Partially fixed (this session) | Desktop | `apps/desktop/src/features/v3/{Sidebar.tsx,ProjectRow.tsx}`, `apps/desktop/src/stores/projectStore.ts` (`archiveProject`/`unarchiveProject`), `apps/desktop/src/features/v3/AgiWorkProjects.tsx`, `apps/desktop/src/features/v3/ActiveChat.tsx` (cited file deleted, uncommitted, 2026-07-11; needs re-verification), `apps/desktop/src-tauri/src/sys/commands/memory.rs` (`memory_list_categories`) | Two more complete-but-unreachable features in the established pattern. Archive Projects: this row's original claim ("project cards with no menu/actions beyond New project") undersold the gap, there are actually TWO separate project surfaces. (1) The sidebar's `ProjectRow.tsx` (`features/v3/Sidebar.tsx`'s Projects section) already had a working 3-dot menu (Open/Rename/Delete) but no Archive item, same shape as the conversation-row bug fixed in `DESKTOP-CHAT-CONVO-ACTIONS-PERSIST-01`. FIXED this session: added an Archive `MenuItem` to `ProjectRow.tsx` (reuses the existing `sidebar.actions.archive` i18n key, no new copy), wired to `projectStore.archiveProject` from `Sidebar.tsx`; verified live via `wdio/specs/sidebar-navigation.spec.ts`, archive hides the row immediately and it stays hidden after a full reload (persists through `updateProject`, not just local state). Also added `data-testid="project-row"`/`data-project-id`/`data-project-active` to `ProjectRow.tsx` mirroring `ConversationRow.tsx`'s existing convention, for reliable future testing. Like the conversation archive fix, this is one-way: there is still no UI anywhere to browse/restore archived projects (`unarchiveProject`/`getArchivedProjects` have zero callers). (2) The full-page project panel (`features/v3/AgiWorkProjects.tsx`, opened via the sidebar's "Projects" nav item) is a SEPARATE, still-unfixed gap: its grid cards have literally zero per-card actions, no rename, no delete, no archive, not even a click-to-open menu, just a static card and a global "+ New project" button. This needs a real design decision (hover affordance on a grid card differs from a list row) and more than a quick menu-item addition, so it is intentionally left tracked, not guessed at. Memory Categories: unchanged from the original finding, a real category system (preference/fact/decision/context) exists via `memory_list_categories` and category-aware UI on the dead legacy memory layer, but the LIVE memory surface (Settings → Memory → unified-chat's `MemoryEditor`) uses a completely different, categoryless `MemoryFact` type, the two memory systems are fully separate, not just partially wired. | Sidebar Archive: verified via `pnpm --filter @agiworkforce/desktop typecheck` (PASS) and a real native WebDriver run (`wdio/specs/sidebar-navigation.spec.ts`, 9/9 passing), archive+reload and delete+reload both round-trip through the backend. `AgiWorkProjects.tsx` card actions and archived-project restore UI: not yet fixed. |
| DESKTOP-GIT-AI-FEATURES-UNWIRED-01 | Low | Tracked | Desktop | `apps/desktop/src-tauri/src/features/terminal/ai_assistant.rs` (`smart_commit`), `apps/desktop/src-tauri/src/sys/commands/git.rs` (merge/PR commands), `apps/desktop/src-tauri/src/sys/commands/ai_native.rs` (`ai_analyze_project`) | Extends the existing git findings (`DESKTOP-GIT-PANEL-UNREACHABLE-01`). AI-assisted Commit Message Generation ("Smart Commit"), Merge Assistance (conflict list/resolve/abort/complete, including an LLM-prompt-for-conflict-resolution helper), Pull Request creation (real `gh` CLI shell-out), and Repository Summary (`ai_analyze_project`, walks the tree and produces an AI-generated summary) are all backend-complete but have zero live UI callers AND are not registered as agent tools either, so there is no chat-agent path to any of them, unlike most other "unwired" findings this session which at least remain reachable via generic tool composition. Partial exception: a user can still get an equivalent result by asking the live chat agent to "commit with a good message" or "summarize this repo," since it composes the same outcome from already-working generic tools (`git_commit`, `read`/`grep`/`glob`), just not via a dedicated, purpose-built affordance. Separately found: `code_search`'s own source comments claim to be "`.gitignore`-aware," but no `.gitignore` parsing exists anywhere in the codebase (no `ignore` crate dependency, no `Gitignore::` usage), a misleading-label bug, not just an unwired feature. | Not yet fixed. |
| DESKTOP-ARTIFACT-EDITOR-VS-MONACO-01 | Low | Tracked (deliberate, not a bug) | Desktop | `apps/desktop/src/features/artifacts/InlineArtifactEditor.tsx`, `packages/ui/unified-chat/src/components/ArtifactPanel.tsx`, `apps/desktop/src/features/editor/MonacoEditor.tsx` | Checked against external research recommending Monaco/CodeMirror for code editing. Monaco is already a real, actively-used dependency in this monorepo (`@monaco-editor/react` + `monaco-editor`, both in `apps/desktop/package.json` and `apps/web/package.json`) with a full LSP-backed implementation (`features/editor/MonacoEditor.tsx`: completions, hover, go-to-definition, rename, live diagnostics, format-on-save) used by the older, separate "Canvas" system (`features/canvas/CanvasPanel.tsx`, `stores/editingStore.ts`), not dead/unused. The NEW Artifacts feature's inline editor (`InlineArtifactEditor.tsx`) uses a plain `<textarea>` instead, no line numbers, no live syntax highlighting while typing, no bracket matching, no LSP features. This is confirmed DELIBERATE, not an oversight: `packages/ui/unified-chat/src/components/ArtifactPanel.tsx`'s own code comment states "we deliberately keep the editor minimal, host apps that want a real code editor (Monaco, CodeMirror) can swap `onSaveEdit` for their own modal flow (Round-2 audit P0 #9 final quadrant)." Since Artifacts is being wired up for the first time this session (`DESKTOP-ARTIFACTS-ENTIRELY-UNWIRED-01`), swapping in the already-proven `MonacoEditor.tsx` component once that lands is a low-risk enhancement opportunity, not a fix. | No action needed unless product wants richer Artifact code editing; the infrastructure to do it cheaply already exists and works elsewhere in the same app. |
| DESKTOP-LOCAL-PROVIDER-TRUST-CLASSIFICATION-DRIFT-01 | Medium | Tracked | Platform types | `packages/contracts/types/src/model-catalog.ts` (`LOCAL_PROVIDER_IDS`, `getProviderSurface`), `packages/contracts/types/src/provider.ts` | Found while adding vLLM support (commit `62ac1233a`). `packages/contracts/types/src/model-catalog.ts`'s `LOCAL_PROVIDER_IDS` is hardcoded to `['ollama']` only, never updated when LM Studio/llama.cpp were added (commit `95b15e61b`) or now vLLM. Any caller of `getProviderSurface('lmstudio'\|'llamacpp'\|'vllm')` resolves to `'hidden'` instead of `'local'`. This project treats Local/BYOK/Managed-Cloud as strict, separate trust boundaries (`PRIVACY-01`, `CLOUD-01`), a classifier that doesn't recognize 3 of 4 real local providers as local is a genuine trust-boundary-adjacent gap, not just cosmetic, if anything downstream uses `getProviderSurface` for routing/display decisions (not yet traced which callers exist or what they do with a `'hidden'` result). Separately, `packages/contracts/types/src/provider.ts` has `'lmstudio'` but is still missing `'llamacpp'`, a drift from the original LM Studio/llama.cpp commit that nothing has caught since, confirmed to not affect `apps/desktop` directly (no desktop code imports this file) but may affect other consumers of `@agiworkforce/types`. | Not yet fixed, both are `packages/contracts/types` changes outside individual desktop-engineer scope; needs someone to trace `getProviderSurface`'s actual callers before deciding if this is cosmetic or a real routing bug. |
| DESKTOP-NEWCHAT-DRAFT-NOT-CLEARED-01 | Medium | Tracked | Desktop / unified-chat | `packages/ui/unified-chat/src/components/ChatInput.tsx` (uncontrolled `<textarea ref={textareaRef}>`, no effect keyed on conversation/session change) | Live QA on the v3 Sidebar's New Chat button (`wdio/specs/sidebar-navigation.spec.ts`): typed an unsent draft into the composer, clicked "New chat" (which does create a genuinely new conversation, `chatStore.createConversation` always mints a fresh `crypto.randomUUID()` and `DesktopShellV3.handleNewChat` calls `hostBridge.selectConversation(newId)`), and the composer view swaps to the fresh empty-chat greeting screen, but the textarea's text is NOT cleared; screenshot evidence (`sidebar-03-new-chat.png`) shows "QA draft that should be discarded by New Chat" still sitting in the input, cursor blinking, on top of a genuinely blank new conversation. Root cause (read-only diagnosis; this file is excluded from this session's edit scope, a concurrent agent is actively working the attachment pipeline in `ChatInput.tsx`/`ChatInterface.tsx`/`useChat.ts`): the textarea has no `value=` prop and no controlled React state (`grep` for `useState.*message`/`setMessage` in `ChatInput.tsx` finds none), it's driven entirely by the DOM via `textareaRef`, and the only effect that ever writes `textareaRef.current.value` is the `draftContent` store-populate effect (~line 148-156), which fires when `draftContent` is truthy (e.g. a suggestion chip click), not on conversation/session change. Nothing resets `textareaRef.current.value = ''` when `activeConversationId` changes. Reproduced twice (two full `sidebar-navigation.spec.ts` runs), same result both times. | Not fixed here (excluded file per this session's cross-agent boundary). Needs an effect in `ChatInput.tsx` (or wherever the current conversation id is threaded in) that clears the uncontrolled textarea's DOM value on conversation change. Flag to whichever agent/session owns `ChatInput.tsx` next. |
| DESKTOP-SIDEBAR-PROJECTS-CAP-NO-RECENCY-SORT-01 | Low | Tracked (static finding, not empirically reproduced) | Desktop | `apps/desktop/src/features/v3/Sidebar.tsx` (`visibleProjects = projects.filter((p) => !p.isArchived).slice(0, 6)`) | Code-review finding while instrumenting the sidebar Projects section for live QA (this session's test environment only ever had 0-1 projects at a time, so the boundary condition below was not empirically triggered live). `createProject` (`stores/projectStore.ts`) always appends new projects to the end of the `projects` array; `Sidebar.tsx`'s `visibleProjects` takes the first 6 of that array with no recency re-sort. If a user already has 6+ non-archived projects, creating a 7th will not appear anywhere in the sidebar's Projects section until an older one is archived/deleted, silently invisible, not an error. The full `AgiWorkProjects.tsx` panel has no such cap and would show it, so the project isn't lost, just missing from the quick-access rail. | Not fixed, needs a product decision on the sidebar Projects cap behavior (sort by `updatedAt` like Recents does, or add a "Show all" affordance like the conversation list already has) before changing it; logging instead of guessing at the intended UX. |
| DESKTOP-WDIO-NO-ASSERTIONS-01 | Medium | Tracked (one test fixed, file needs a broader pass) | Desktop / test quality | `apps/desktop/wdio/specs/sidebar-navigation.spec.ts` | Found while driving the Local/Cloud sidebar toggle test per the WebdriverIO-primary methodology: the pre-existing "Local/Cloud toggle" test had zero `expect()` assertions, it only logged observed values, so it reported PASSED unconditionally regardless of actual app behavior. Confirmed empirically: the log-only version matched 0 DOM elements (a stale/collapsed-state selector) and still reported green. This is the same class of failure CLAUDE.md's LLM Failure Prevention Rules call out (swallowed assertions / fake-passing tests). FIXED for this one test: added real assertions (toggle reachable, PA-3 "coming soon" copy actually renders, Cloud never becomes the selected mode), it now correctly fails when the app isn't ready, which surfaced a real timing issue (sidebar not ready within 15s on a cold isolated launch; needs the app's normal warm-up sequence that earlier specs in the file implicitly provide). Only the one Cloud-adjacent test was touched, the rest of `sidebar-navigation.spec.ts` (and its "9/9 passing" claims elsewhere in this ledger, e.g. `DESKTOP-SONNER-TOAST-LIGHT-THEME-ONLY-01`, `DESKTOP-SIDEBAR-COLLAPSE-NOT-PERSISTED-01`) was not audited for the same no-assertion pattern and should not be assumed clean. | Not fully fixed, needs a dedicated pass over every test in this spec file to confirm each has real assertions, plus a fix for the cold-launch 15s sidebar-readiness timing gap the new assertions surfaced. |
| EXT-MIRROR-TEST-FAKE-COVERAGE-01 | Low | Partially fixed (`sidePanelMarkdown.test.ts` redirected; `security-fixes.test.ts` tracked) | Chrome extension tests | `apps/extension/__tests__/security-fixes.test.ts`, `apps/extension/__tests__/sidePanelMarkdown.test.ts` | Both files documented (and intentionally chose) a pattern of reimplementing hand-written mirror functions of the side-panel markdown-rendering logic (`encodeHref`/`encodeText`/`renderLinkMarkdown` in `security-fixes.test.ts`; `sanitiseLinkUrl`/`renderMarkdownLinks` in `sidePanelMarkdown.test.ts`) instead of importing the real `apps/extension/src/features/side-panel/markdown.ts` module, with the stated rationale of avoiding the Chrome API surface. This let a real fix (C-04 href percent-encoding, see `EXT-DUPLICATE-MODULE-FORKS-01`) silently drift out of the live module while both mirror suites kept passing at 100%, because the mirrors matched a since-deleted dead-code fork's behavior rather than the live module's actual behavior, each file's own docstring claim ("if the source logic changes, these tests will catch regressions") was false in this instance. Neither file actually needs to avoid importing DOMPurify-based modules in this vitest+jsdom setup, `side-panel-markdown-live.test.ts` imports the real module with no issue. FIXED: `sidePanelMarkdown.test.ts` (dedicated single-module suite) redirected to import `renderMarkdown` from the live module directly, deleting its local mirror functions; added one C-04 assertion to it. NOT rewritten: `security-fixes.test.ts` is a large, multi-finding regression suite (C-1/C-2/H-1/H-2/H-3/M-1/C-04/CHROME-NEW-005/etc.) where most mirrors cover logic outside this module (message-type guards, URL allowlists), redirecting only its markdown-related `describe` blocks is a smaller, still-non-blocking follow-up. | `__tests__/sidePanelMarkdown.test.ts` (11/11 passing, imports the real module); `__tests__/side-panel-markdown-live.test.ts` (9/9 passing, imports the real module); `security-fixes.test.ts` left unchanged and still passing. |
| DESKTOP-WEB-UI-PRIMITIVES-DUPLICATED-01 | Medium | apps/desktop redirect DONE (shim re-exports, typecheck+tests clean); apps/web redirect still not started | Platform / Desktop + Web | `apps/desktop/src/ui/*`, `apps/web/components/ui/_`, `packages/ui/ui/src/primitives/_`, `packages/ui/ui/src/index.ts`, `packages/ui/ui/src/cn.ts` | FOLLOW-UP SESSION (desktop-engineer, 2026-07-04): did the apps/desktop half of the deferred consumer-redirect pass below. Rather than rewriting all ~312 files that import individual `../ui/X`paths (high blast radius for zero behavior difference), converted each of the 35 shared`apps/desktop/src/ui/{Component}.tsx`files (all except`Toaster.tsx`, which correctly stays per-surface per the boundary rule below) into a thin named re-export shim, e.g. `export { Button, buttonVariants, type ButtonProps } from '@agiworkforce/ui';`, verified export-name parity against`packages/ui/ui/src/index.ts`file-by-file first. This makes`apps/desktop/src/ui/index.ts`'s existing barrel and all 312 direct-path consumers resolve to the canonical `packages/ui`implementation with zero consumer-file edits, while still fully eliminating the duplicated _implementation_ (the actual goal of this row).`AccessibleDialog`gap noted below was already closed before this session (present in`packages/ui`at session start). BUG FOUND AND FIXED while verifying:`packages/ui/ui/src/cn.ts`deliberately used a dependency-free join (no`tailwind-merge`), on the documented assumption that "callers pass non-conflicting classes." That assumption is false in practice, e.g. `ArtifactPanel`'s icon buttons pass `className="h-7 w-7"`to override`Button`'s own `size` default (`h-10 w-10`), relying on `tailwind-merge`'s conflict resolution the way both `apps/web/lib/utils.ts`and`apps/desktop/src/lib/utils.ts`'s own `cn`already do. Without merging, both classes survived in the DOM and CSS _stylesheet order_ (not JS override order) silently decided which won, caught via`ArtifactSidebarParity.test.tsx`'s pre-existing DOM snapshot regressing only after the Button shim landed (confirmed pre-existing pass via `git stash`on a clean tree). Fixed by making`packages/ui/ui/src/cn.ts`use the same`clsx`+`tailwind-merge`stack as both surfaces' own`cn`(added as`packages/ui`dependencies, versions matched to`apps/desktop`/`apps/web`'s existing `^2.1.1`/`^3.5.0`). Re-verified: `pnpm --filter @agiworkforce/ui typecheck`clean,`apps/desktop` `pnpm typecheck`clean,`npx vitest run --exclude "wdio/**"`in`apps/desktop`, 1890/1892 passing (the 1 pre-existing failure,`connectorsStore.test.ts`, reproduces identically on a clean stash of the ui/ changes, unrelated). `apps/web/components/ui/*` was NOT touched this session, its consumer-redirect half of this row remains open (`apps/web`also doesn't yet consume`packages/ui/cn`, so the fix is inert there until it does). This row's original text below is preserved for the drift-resolution rationale, which still applies unchanged. GAP FOUND (this session): of the 37 components that existed in both`apps/desktop/src/ui`and`apps/web/components/ui`, only 35 were ported. `AccessibleDialog`is missing entirely from`packages/ui`(no file, not exported from`index.ts`) with no boundary reason, its body is pure presentation (only depends on `cn`and the already-ported Dialog primitives, differs from the two apps' copies only by the Next.js`'use client'`directive and import-path alias), so this is a genuine oversight the port phase should have caught; add it before the redirect pass.`Toaster`is also absent from`packages/ui`, but that is correctly NOT a gap: `Toaster.tsx`imports a stateful`useToast`hook (desktop's own`../hooks/useToast`, web's own `@/lib/hooks/use-toast`) that is itself per-surface and was not ported, consistent with `packages/ui/ui/src/index.ts`'s documented boundary rule ("PURE UI... anything that imports a store... stays per-surface"). The stateless Toast primitives (`Toast`, `ToastProvider`, `ToastViewport`, etc.) already are ported and exported; only the stateful `Toaster`+ its`useToast`hook correctly remain per-surface. Next engineer: do not port`Toaster`/`useToast`into`packages/ui` without first deciding how to reconcile desktop's and web's different toast-store implementations, that is a real design decision, not a mechanical port. (`EmptyState`is also in`packages/ui`but only exists in`apps/desktop/src/ui`, not `apps/web/components/ui`, not a web/desktop duplicate, so its presence is harmless, not a gap.) DRIFT-RESOLUTION DECISIONS made during the port (recorded so the next engineer does not have to re-diff apps/desktop vs apps/web again, all verified against the real diff this session and confirmed accurate): Button, `default`variant's extra border was dropped, resolved toward web's no-border style, consistent with Card/Select/Spinner in the same batch also resolving toward web. Card, `CardTitle`'s ref type fixed to `HTMLHeadingElement`, matching its rendered `h3`; desktop had drifted to `HTMLParagraphElement`(apparent copy-paste from`CardDescription`). Select, `SelectTrigger`background resolved to web's`bg-background`, matching the convention already used by Input/Textarea; desktop's `bg-popover`was the outlier. Spinner, resolved toward web's version, which adds`role="status"`and a visually-hidden "Loading..." span for screen readers; desktop had dropped both, likely an accidental regression. Progress, resolved toward web, which has real ARIA progressbar attributes (role, aria-valuenow/min/max) and a`max > 0`guard that prevents dividing into`NaN`; desktop had dropped both. Popover, z-index fixed to a token value above Dialog/AlertDialog's modal layer; desktop's earlier migration to a CSS custom-property z-index token had accidentally put Popover below Dialog, inverting the intended stacking order. FormField, kept web's portable `ReturnType<typeof setTimeout>`timer-ref type over desktop's Node-only`NodeJS.Timeout`, and kept web's validate-and-touched gate on the debounced handler over desktop's always-validate variant. SectionErrorBoundary, used web's `process.env.NODE*ENV`dev-mode check; Vite's`import.meta.env.DEV`has no ambient types inside`packages/ui`and would not compile standalone. ResizeHandle, merged rather than picked a side: kept desktop's ref-based fix for a stale-closure bug in the drag handlers, plus a web-side change. Toast, merged desktop's`--z-notification`stacking token (ported with an inline fallback) with a web-side attribute-naming fix. AlertDialog and Dialog, both resolved toward web's newer visual treatment (viewport-height-clamped, glassmorphic content, restored footer divider) since desktop's plain defaults lacked a scroll affordance for tall content, plus a stacking-order fix so these portal-based overlays still layer correctly relative to each other. Checkbox, Switch, ResponsiveContainer, and the remaining common components (Accordion, Alert, Badge, Collapsible, ConfirmDialog, ContextMenu, DropdownMenu, HoverCard, Input, Label, LoadingButton, PromptDialog, ScrollArea, Skeleton, Table, Tabs, Textarea, Tooltip) were classified identical, desktop and web copies differed only in the Next.js`'use client'`directive and the`@/`alias versus relative`cn`import path, and were ported as-is. | `pnpm --filter @agiworkforce/ui typecheck` passes clean (`tsc --noEmit`, no errors), this session. Independently re-diffed `apps/desktop/src/ui`against`apps/web/components/ui`for every one of the 37 shared components and cross-checked each of the 16 files carrying a "Drift resolution" comment in`packages/ui/ui/src/primitives`against that diff, all matched their stated rationale, none were arbitrary. Confirmed`AccessibleDialog`and`Toaster`are both absent from`packages/ui/ui/src`(grep, no hits), then confirmed`useToast`is also absent from`packages/ui/ui/src` (grep, no hits) to distinguish a genuine gap (`AccessibleDialog`, pure and portable) from a correct boundary exclusion (`Toaster`, blocked on its per-surface `useToast`dependency). No consumer imports were changed;`apps/desktop/src/ui/\*`and`apps/web/components/ui/\_`remain in place and still resolve for existing callers. |
| VSCODE-CLOUDONLY-DESC-CONFLICT-01 | Medium | Needs product-direction call | VS Code extension | `apps/extension-vscode/package.json`(top-level`description`, `chatParticipants[0].description`) | Exhaustive QA pass cross-checked the extension's marketplace/chat-participant description against the locked platform fact "description is 'Multi-provider AI coding assistant, 10+ providers', no model version names, fixed from '15+ LLMs' in commit 2b826010." Current HEAD does NOT match: both descriptions read "Multi-provider AI coding assistant for VS Code", the provider-count claim is gone entirely. Root cause traced via `git log -S`and`git show`: commit 2b826010 (May 3) set it to "Multi-provider AI coding assistant, 10+ providers (GPT, Claude, Gemini, and more)" per the locked decision; commit 7c75c22e2 (Jun 13, "cloud-only rebrand + secretless device sign-in") then overwrote both to "for VS Code" as a side effect of turning the extension into what its own commit message calls a "cloud-only client (no BYOK)". That description change directly conflicts with the founder-authoritative per-surface trust-mode matrix (dated roughly Jun 23, i.e. AFTER the rebrand commit, see `project-surface-trust-modes`memory): "VS Code ext: Local yes, BYOK yes, AGI Cloud yes... free wedge lives on Desktop, CLI, VS Code (all three modes each)." The extension today is in a half-migrated state consistent with neither reading:`agi-workforce.setApiKey`/`clearApiKey`commands and the`agiWorkforce.tier`enum's`byok`default are all still present and wired (BYOK was NOT actually removed from the code), yet the description no longer claims multi-provider breadth. Not fixed here: (a) this is VS Code Marketplace-facing metadata, which this role's charter requires escalating rather than unilaterally editing; (b) restoring "10+ providers" verbatim would be straightforward IF the cloud-only rebrand is itself the thing to be reverted/reconciled, but that is a product-direction call (is VS Code cloud-only per 7c75c22e2, or all-three-modes per the later trust-matrix?), not a copy typo. Recommendation: restore the "10+ providers" wording (matches both the locked fact and the surviving BYOK code paths) once the cloud-only-vs-three-modes conflict is resolved for this surface. | `git show 2b826010 -- apps/extension-vscode/package.json`; `git show 7c75c22e2 -- apps/extension-vscode/package.json`; `git log --oneline -S'agi-workforce.setApiKey' -- apps/extension-vscode`confirms BYOK commands still present at HEAD; grep for`setApiKey`/`clearApiKey`/`byok`in`src/`and`package.json`at HEAD. |
| DESKTOP-SINGLE-INSTANCE-MISSING-01 | Medium | Open, decision needed | Desktop Rust / lifecycle | `apps/desktop/src-tauri/Cargo.toml`, `apps/desktop/src-tauri/src/lib.rs`(plugin registration list) | Found while testing Application Lifecycle. No`tauri-plugin-single-instance`is registered (confirmed via`grep`across`Cargo.toml`and`lib.rs`, zero hits). Empirically observed two full`agiworkforce-desktop`processes running concurrently against the same app-data dir and the same encrypted SQLite database during this QA session (one from this agent, one from a concurrently-running teammate's WDIO session) with no OS-level prevention. Two concrete consequences: (1) two live processes can both write to the same SQLCipher-encrypted`agiworkforce.db`at once, `busy_timeout=5000`reduces but does not eliminate contention/corruption risk under concurrent writes; (2) on Windows/Linux (unlike macOS, which the deep-link plugin handles natively via`application:openURLs:`), `tauri-plugin-deep-link`requires`tauri-plugin-single-instance`to forward a deep-link URL to an already-running instance, without it, clicking an`agiworkforce://`link while the app is already open on Windows/Linux will either fail silently or spawn a second, unwanted process. Not fixed here, adding single-instance is a real architectural change (needs to play well with the embedded WDIO webdriver test harness, which currently assumes it can launch a fresh process per test run) and cross-platform verification (this session's environment is macOS-only per the checklist's existing Tier-4 note), so it needs a product/eng decision rather than a same-session mechanical fix. | Confirmed via`grep -rn "single-instance\|single_instance" apps/desktop/src-tauri/Cargo.toml apps/desktop/src-tauri/src/lib.rs`(no hits) and empirical`ps aux`showing two concurrent`agiworkforce-desktop`processes during this session. |
| DESKTOP-MAINTENANCE-MODE-NOT-IMPLEMENTED-01 | Low | Tracked (not-implemented gap, not a regression) | Desktop + Web / lifecycle | n/a (feature absent) | Application Lifecycle QA checklist item "Maintenance mode" has no implementation anywhere in the monorepo, `grep -rn "maintenance.mode\|MAINTENANCE_MODE"`across`apps/desktop`and`apps/web`returns zero hits. There is no backend flag, banner, or blocking overlay for "service under maintenance" on any surface. Not a regression (nothing was ever built and then broken), but flagging since it's an explicit checklist line item, needs a product decision on whether it's in scope for public alpha before being built. | `grep -rn "maintenance.mode\|MAINTENANCE_MODE" apps/desktop apps/web --include="\*.ts" --include="\_.tsx" --include="\*.rs"` (no hits). |
| DESKTOP-ICON-BUTTON-ARIA-LABEL-GAP-01 | Low | Partial, 1 file fixed, broader pattern flagged not counted | Desktop | `apps/desktop/src/features/artifacts/ArtifactToolbar.tsx` (fixed); broader pattern across `apps/desktop/src/features/**` (not exhaustively counted) | Picked up Tier-4 checklist row #37 "UI Components" (Not Started) while blocked on Cloud-mode step-3 direction. `ArtifactToolbar.tsx`'s 3 icon-only `Button`s (Copy/Download/Open-in-panel) had no `aria-label`, each relied solely on a Radix `Tooltip`/`TooltipContent` for its text, which is hover/focus-visible-only and does not reliably give screen readers an accessible name for a button whose only child is an `aria-hidden` icon. Fixed by adding `aria-label` matching each tooltip's text. Tried to quantify the wider pattern with a quick regex script (`<Button ... size="icon" ...>` without `aria-label`/`title` in the tag) across all of `apps/desktop/src`, it flagged 73 instances across ~30 files, but spot-checking disproved it as a reliable count: `features/layout/TitleBar.tsx`'s icon buttons DO have `aria-label` (confirmed by direct reading) and were still flagged as missing, a regex false positive, same class of unreliability as the barrel-file over-approximation found in `DESKTOP-CHAT-LEGACY-ORPHANED-01`'s import-graph script this same session. Not trusting that 73-file count or acting on it. Recommend the next engineer use a real tool (e.g. `eslint-plugin-jsx-a11y`'s `button-has-accessible-name` rule wired into the existing lint config) rather than another regex pass, to get a reliable count and fix list for the remaining icon-only buttons across `features/research/`, `features/calendar/`, `features/canvas/`, `features/notifications/`, `features/cloud/`, `features/artifacts/ArtifactPanel.tsx`, and others that may have genuine gaps. | `pnpm typecheck` clean. `apps/desktop` `npx vitest run src/features/artifacts`, 2/2 passing (no snapshot regression from the added `aria-label` attributes; `ArtifactToolbar.tsx` isn't part of the existing `ArtifactSidebarParity` snapshot tree). Manually re-read `features/layout/TitleBar.tsx` lines 120-150 to confirm the script's false-positive claim before writing this row. |
| DESKTOP-SHORTCUTS-DEFAULTS-DUPLICATE-AND-DISCONNECTED-01 | Medium | Duplicates fixed + regression-tested; disconnection tracked, decision needed | Desktop | `apps/desktop/src/constants/shortcuts.ts` (fixed), `apps/desktop/src/constants/__tests__/shortcuts.test.ts` (new regression test); disconnection spans `apps/desktop/src/features/settings/KeybindingsSettings.tsx`, `apps/desktop/src/stores/shortcutStore.ts`, `apps/desktop/src-tauri/src/sys/commands/shortcuts.rs`, `apps/desktop/src/features/chat/{AppLayout.tsx,KeyboardShortcutsOverlay.tsx}` (all confirmed dead/disconnected) vs. `packages/ui/unified-chat/src/hooks/useKeyboard.ts` (the real live handler) | Picked up Tier-3 checklist row #16 "Keyboard Shortcuts" (Not Started) while blocked on Cloud-mode step-3 direction. TWO findings: (1) FIXED, `constants/shortcuts.ts`'s `DEFAULT_SHORTCUTS` (25 entries) had 2 genuine key-combo collisions, confirmed programmatically (not eyeballed, learning from this session's earlier false-positive lessons): `Cmd+Shift+R` was bound to both `navigate-research` ("Research" nav panel) and `cycle-variant` ("Toggle thinking/reasoning model variant"); `Cmd+Shift+B` was bound to both `build-mode` (Agent mode) and `toggle-sidebar` (Window). Fixed by reassigning `cycle-variant` to `Cmd+Shift+J` and `toggle-sidebar` to `Cmd+Shift+U` (both previously unused combos, verified via the same duplicate-detection check re-run clean afterward). Added `constants/__tests__/shortcuts.test.ts` (new file, no prior test existed for this data) asserting unique key-combo and unique-id invariants; verified it actually catches the regression class (reverted one key locally, confirmed the test fails, then re-applied the fix and confirmed it passes). (2) NOT FIXED, logged as a decision item, while investigating, found the entire `KeybindingsSettings.tsx` (Settings > General tab, confirmed live/rendered via the earlier `settings-tour.spec.ts` sweep) + its backing `stores/shortcutStore.ts` + Rust `shortcuts.rs` + the desktop-local `constants/shortcuts.ts`/`AppLayout.tsx`/`KeyboardShortcutsOverlay.tsx` cluster appears to be DISCONNECTED from the app's real, live keyboard-shortcut behavior. `AppLayout.tsx` (the only file with real dispatch logic consuming `DEFAULT_SHORTCUTS`-style actions, e.g. `Cmd+Shift+R` → `openRightPanel('research')`) has ZERO real importers anywhere (confirmed via precise import-only grep, not comment-matching, which had earlier produced a false "AppLayout is used" signal from two files that only _mention_ it in a comment). The real live chat surface (`DesktopShellV3` → `ChatInterface` from `@agiworkforce/unified-chat`, `enableShortcuts={true}`) uses a completely separate, minimal hook, `packages/ui/unified-chat/src/hooks/useKeyboard.ts`, which implements exactly ONE shortcut (`Cmd+,` → open Settings) and has no awareness of `constants/shortcuts.ts`, `stores/shortcutStore.ts`'s custom-keybinding overrides, or the Rust `shortcuts.rs` HashMap at all. Net effect: a user can open Settings > Keybindings, see 25 shortcuts, customize/reset any of them, and it has zero effect on the live app, the settings panel is fully rendered and interactive but functionally inert for anything beyond what it happens to display. This is the same "confusing/fake control" bug class this project explicitly tracks (cf. fake availability badges, dead settings toggles) but is a large reconnection job (rebuilding ~24 more shortcut handlers into `useKeyboard.ts`, or wiring it to read `stores/shortcutStore.ts`'s persisted overrides), not a small fix, flagging for a product/eng decision (rebuild the connection, or retire/hide the Settings > Keybindings UI until it's real) rather than guessing. Not investigated further: whether `shortcuts_register`'s Tauri OS-level `global_shortcut()` registration (which several of Rust's OWN separate hardcoded defaults use, e.g. `voice_input` = `Cmd+Shift+V`, `new_composer` = `Cmd+Shift+N`) has any real-world side effects from the TS-side `DEFAULT_SHORTCUTS` if `KeybindingsSettings.tsx` ever calls `.register()`/`.registerGlobal()` for them, worth a follow-up check before assuming zero real-world footprint, since Rust's own separate default set (`ShortcutsState::with_defaults()`, 7 entries, different IDs) is a THIRD parallel shortcut system distinct from both `constants/shortcuts.ts` and `packages/ui/unified-chat/src/hooks/useKeyboard.ts`. | Duplicate-combo fix: `node`-based duplicate-detection script re-run clean (0 duplicates, 25 total) after the change; `pnpm typecheck` clean; new `constants/__tests__/shortcuts.test.ts` 2/2 passing; confirmed the test fails on the pre-fix duplicate (reverted `cycle-variant`'s key to `'r'` locally, re-ran, saw the expected failure, then re-applied the fix). Full `apps/desktop` `npx vitest run --exclude "wdio/**"`, 1883/1885 (same 1 pre-existing unrelated `connectorsStore.test.ts` failure, +2 new passing tests from this row, nothing else changed). Disconnection claim: `grep -rn "import.*AppLayout\|from '.*AppLayout'"` across `apps/desktop/src` returns zero hits (real import check, not the comment-matching grep that gave a false live signal earlier); read `packages/ui/unified-chat/src/hooks/useKeyboard.ts` directly, confirmed single `Cmd+,` handler, no store/constants imports. |
| DESKTOP-NOTIFICATIONS-SETTINGS-IGNORED-AND-CENTER-UNREACHABLE-01 | Medium | Toggle-ignored bug fixed + regression-tested; in-app Notification Center unreachability tracked, decision needed | Desktop | `apps/desktop/src/stores/chat/agentWorkflowEvents.ts` (fixed), `apps/desktop/src/stores/chat/__tests__/agentWorkflowEvents.test.ts` (3 new regression tests); unreachable panel spans `apps/desktop/src/features/notifications/{NotificationCenter.tsx,index.ts}`, `apps/desktop/src/features/chat/Sidebar.tsx` (all confirmed dead, only reachable via the already-dead `AppLayout.tsx`) vs. the live `features/v3/Sidebar.tsx`/`DesktopShellV3.tsx`/`TitleBar.tsx` (confirmed zero notification UI anywhere) | Picked up Tier-3 checklist row #18 "Notifications" (Not Started) while blocked on Cloud-mode step-3 direction. TWO findings: (1) FIXED, `sendBackgroundAgentNotification()` (fires the native OS toast for background-agent task completion/failure) sent UNCONDITIONALLY, completely ignoring the real, persisted `desktop_notifications`/`enabled`/`do_not_disturb` settings from Settings > Notifications (`NotificationsSettings.tsx`, confirmed live via the earlier settings-tour sweep), verified by reading the Rust-backed settings shape (`notification_center.rs`'s `NotificationSettings` struct, fields `enabled`/`desktop_notifications`/`do_not_disturb`/etc., persisted via `notification_get_settings`/`notification_set_settings` commands) and confirming zero call sites anywhere in the frontend read `desktop_notifications` before sending. Same "toggle does nothing" bug class as `DESKTOP-SHORTCUTS-DEFAULTS-DUPLICATE-AND-DISCONNECTED-01`'s Settings > Keybindings finding, found independently on a completely different feature area. Fixed by invoking `notification_get_settings` in `sendBackgroundAgentNotification()` and skipping the send when `enabled`/`desktop_notifications` is false or `do_not_disturb` is true (kept scoped to the boolean flags only, did NOT implement the `dnd_start_time`/`dnd_end_time` time-window parsing, which is a separate, more involved feature). Added 3 new tests to `agentWorkflowEvents.test.ts` (mocking `invoke` and `@tauri-apps/plugin-notification`) covering: sends when enabled, skips when `desktop_notifications: false`, skips when `do_not_disturb: true`; verified all 3 actually catch the regression (reverted the fix locally, confirmed all 3 fail with the expected "was called but shouldn't have been" assertion, then restored the fix and confirmed all pass). (2) NOT FIXED, logged as a decision item, the full in-app "Notification Center" panel (`NotificationCenter.tsx`: list, mark-read, delete, backed by a complete Rust CRUD API in `notification_center.rs`) is entirely unreachable from the live app. Its only importer, `features/chat/Sidebar.tsx`, is itself only imported by the already-confirmed-dead `features/chat/AppLayout.tsx` (see `DESKTOP-CHAT-LEGACY-ORPHANED-01`). Confirmed the live v3 UI (`features/v3/Sidebar.tsx`, `DesktopShellV3.tsx`, `features/layout/TitleBar.tsx`) has zero notification bell/badge/center UI of any kind (grepped for "Notification"/"Bell", no hits). Net effect: the backend notification system (list/unread-count/mark-read/delete, all real and working per source trace) has no live UI surface at all, any notifications actually created via `notification_create` would be invisible to the user forever. This is a real, larger feature gap (needs a decision: build a bell/badge into the live v3 Sidebar or TitleBar, which I did NOT attempt, per the "no v3 shell" scope boundary for this session, or formally deprecate the backend system) rather than a small fix, so logging it rather than guessing at a UI placement. | Fix: `pnpm typecheck` clean; `npx vitest run src/stores/chat/__tests__/agentWorkflowEvents.test.ts` 15/15 (12 original + 3 new); confirmed regression-catching by reverting the fix locally (all 3 new tests failed with the expected assertion), then restoring it (all 15 pass again, verified via `git diff` showing the fix intact). Full `apps/desktop` `npx vitest run --exclude "wdio/**"`, 1886/1888 (same 1 pre-existing unrelated `connectorsStore.test.ts` failure, +3 new passing tests, nothing else changed). Unreachability claim: `grep -rn "Notification\|Bell" features/v3/*.tsx features/layout/*.tsx`, zero hits; `grep -rn "from '\.\./notifications'\|from '\./notifications'\|from '@/features/notifications'"` outside `features/notifications/` resolves only to the already-dead `features/chat/Sidebar.tsx`. |
| WEB-SANDBOX-ORIGIN-ENV-01 | Medium | Open | Web lead | infrastructure/sandbox/index.html, apps/web/lib/artifact-sandbox.ts, apps/web/lib/validate-env.ts, apps/web/features/chat/components/SandboxedIframe.tsx | Cross-origin artifact isolation is provisioning-gated: NEXT_PUBLIC_SANDBOX_ORIGIN carries no value in any committed env file (apps/web/.env.example already documents it with guidance and an example per check:env-contract's required-key list) and is unset in the production Vercel project, so consumers still fall back to same-origin srcDoc rendering. NARROWED 2026-08-24, the code-side completion landed: `validateSandboxOriginConfigured()` in apps/web/lib/validate-env.ts now emits a boot-time warning (escalated wording in a production runtime) when it is unset, reaching `validateEnvironment()`'s aggregate the same way every other misconfiguration does; `getSandboxOrigin`/`isSandboxConfigured`/`SandboxedIframe` already had passing unit coverage for both the configured (`https://sandbox.agiworkforce.com`) and unconfigured paths (`apps/web/lib/__tests__/artifact-sandbox.test.ts`, `apps/web/features/chat/components/SandboxedIframe.test.tsx`). What remains is infrastructure-only, not code: the production Vercel project has no value for the var. | Set the env var in the web Vercel project and add a prod smoke check asserting the sandbox-origin handshake succeeds. |
| RUST-AGENTCORE-LIVE-TURN-VERIFY-01 | Medium | Partially verified (2026-07-10), MCP/subagent portion open | Rust platform | crates/agiworkforce-agent-core, apps/cli/src/agent/chat.rs (Session::send + TurnHostAdapter) | Wave 5e1 extracted the CLI turn loop into agiworkforce-agent-core with the CLI adopting it via a verbatim-moved TurnHostAdapter. Strangler is complete (CLI deny(dead_code) passes, no orphans) and the JSONL byte-identity gate passes 2/2, but that gate only exercises complete_first (the demo/fallback ladder + demo-text + empty-tool_calls break). The bulk of TurnHostAdapter (real dispatch/hooks/plan-gate/tool-filters/subagent batch/MCP+team dispatch/sequential-vs-parallel post-hook asymmetry/dialoguer approvals/event routing) is a verbatim move characterized by 11 crate fixtures against a ScriptedHost TEST DOUBLE, NOT byte-verified against a live tool-calling turn. | Confirm with a real CLI tool-calling turn (MCP or subagent) in e2/QA, assert incremental text output, tool firing, approval prompts, and hook ordering match a pre-extraction baseline. Same verification class as the desktop-side swaps (c2/d2/e2). VERIFIED 2026-07-10 (local path): real `agi exec` turns against live Ollama catalog-selected local model produced correct incremental streaming (20+ message_delta events), real tool dispatch (read_file fired and returned file contents), clean JSONL event framing (spawning to finished), and honest auth-error handling, closing the streaming/tool-dispatch/event-framing portion. STILL OPEN: MCP-server-backed and subagent/team-dispatch turns plus hooks/plan-gate ordering (no MCP server configured in the verification environment). |
| WEB-CONNECTORS-NO-RUNTIME-EFFECT-01 | High | Partially Fixed (2026-07-15) | Web lead | apps/web/lib/user-connector-tools.ts, apps/web/lib/mcp-tool-executor.ts, apps/web/app/api/llm/v1/chat/completions/route.ts, apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts, apps/web/lib/github-app.ts, apps/web/app/api/connectors/route.ts | Connector tools are now injected into the authenticated Web tool loop and the manual approval/resume path exists. GitHub App tools are backed by real installation credentials. Operator-managed remote MCP connectors are runtime-validated from `CONNECTOR_MCP_SERVERS_JSON`, require HTTPS, pass DNS-aware egress checks, and remain gated by each user's active `user_connectors` row. General Web MCP servers use the separate remote-only `WEB_MCP_SERVERS_JSON` contract; Web no longer loads dynamic config files or starts stdio MCP processes. Local filesystem, terminal, browser-automation, screen, and localhost connectors remain intentionally unavailable to Managed Web. REMAINING: no operator remote-connector map is configured in production; first-party OAuth/API-key connectors still need per-user credential persistence and real integrations; end-to-end production proof against a deployed scripted MCP server is still missing. | Unit coverage: `apps/web/lib/__tests__/user-connector-tools.test.ts` and `apps/web/lib/__tests__/mcp-tool-executor.test.ts`; Web production build no longer emits the whole-project NFT trace warning. |
| GEMINI-FUNCTIONCALL-THOUGHT-SIGNATURE-01 | Medium | Mitigated (2026-07-10), real-signature continuity open | Web lead | packages/ai/providers/google/src/translate.ts, packages/ai/providers/google/src/stream.ts, packages/ai/provider-protocol/src/openai-wire-compat.ts, apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts | Google's current API strictly validates thought signatures on replayed functionCall parts: any tool-loop continuation turn (assistant functionCall + functionResponse history) without a thoughtSignature 400s with INVALID_ARGUMENT ("Function call is missing a thought_signature in functionCall parts"), found live 2026-07-10 (catalog-selected Google fast model, url_fetch through the agentic loop). Root cause is the Gemini variant of TOOLLOOP-ANTHROPIC-THINKING-CONTINUITY-01: the OpenAI-compatible message thread between loop steps has no slot for Gemini's per-functionCall signature (streamed as part.thoughtSignature; translateGeminiStream/ToolUseBlock never carry it), so the replayed call arrives signature-less. MITIGATION (translate.ts): every replayed tool_use part gets the officially documented injected-call dummy signature "skip_thought_signature_validator" (ai.google.dev/gemini-api/docs/generate-content/thought-signatures), which skips validation at possible cost of some reasoning continuity, honest per Google docs, not a hack. REAL FIX would thread the true signature: capture part.thoughtSignature on functionCall parts in stream.ts, carry it through StreamChunkToolUseStart + a tool-loop side-channel (like stepSink.thinkingBlocks), and replay it on the exact functionCall part, needs a shared-contract change (packages/contracts/types ToolUseBlock), so it is a contracts-owner decision. | Regression tests: packages/ai/providers/google server-side-tool-invocations.test.ts (replayed tool_use part carries the dummy signature; 6 tests). Live verified 2026-07-10: catalog-selected Google fast model with google_search + url_fetch on one request, model called url_fetch, loop executed it, continuation turn accepted (no 400), grounded answer streamed. |
| PROVIDER-ANTHROPIC-PAUSE-TURN-01 | Low | Partially fixed 2026-08-17; residual open | Provider lead | packages/ai/providers/anthropic/src/stream.ts, apps/web/app/api/llm/v1/chat/completions/lib/response-builder.ts, packages/ui/unified-chat/src/lib/continue-generation.ts | Fixed: `mapStopReason` (packages/ai/providers/anthropic/src/stream.ts:12-33) now maps Anthropic's `pause_turn` to a distinct `'pause_turn'` reason instead of falling through to the `'end_turn'` default, and the chat completions response builder (apps/web/app/api/llm/v1/chat/completions/lib/response-builder.ts:410-416) turns that into an honest `502 provider_paused_turn` instead of reporting a paused turn as a clean completion. Residual: no auto-resume. `continue-generation.ts:1` lists `pause_turn` as a `CONTINUABLE_FINISH_REASONS` entry, but that only offers the user a manual Continue button that re-sends a generic continuation instruction as a new turn, not Anthropic's actual resume contract, which needs the paused assistant turn re-sent verbatim so the suspended server tool can resume. No code re-sends the original turn automatically. | packages/ai/providers/anthropic/src/**tests**/stop-reason.test.ts pins the `pause_turn` -> `'pause_turn'` mapping. response-builder's 502 mapping needs a test asserting `pause_turn` produces status 502 / code `provider_paused_turn` (not yet added). Closes fully when a turn paused by a long-running server tool is automatically re-sent and completes, with a live-fixture test proving it. |
| RUST-DEPENDENCY-ADVISORIES-01 | High | Partially fixed (2026-08-07), zero vulnerabilities; nonblocking warning-policy debt remains | Desktop lead + CLI lead | `Cargo.lock`, `deny.toml`, `.github/workflows/ci.yml` | Fresh final-lock evidence: `cargo audit` exited 0 after loading 1,190 advisory-database entries and scanning 1,444 dependencies, reporting zero vulnerabilities. Its only allowed warning is RUSTSEC-2026-0192: `ttf-parser` 0.25.1 is unmaintained through `imageproc`/`ab_glyph` and `lopdf`/`pdf-extract`, with no safe patched release identified. `cargo deny check bans sources licenses` exits 0. `cargo deny check advisories sources` exits 1 only because the current deny policy rejects pre-existing unmaintained/yanked warnings including `async-std`, GTK3, `bincode`, `core2`, `derivative`, `fxhash`, `unic*`, and `yaml-rust`; the sources check itself is green. The CI advisory step remains nonblocking only for this explicit warning-policy debt. No current evidence supports a vulnerability baseline. | Re-run `cargo audit`, `cargo deny check bans sources licenses`, and `cargo deny check advisories sources` against the final lock. Close the warning-policy debt only when the advisories command exits 0 after dependency remediation or an explicit reviewed policy decision; any future vulnerability remains blocking evidence and must not be suppressed. |
| MOBILE-PRIVACY-MANIFEST-LOCKED-COPY-DRIFT-01 | Medium | Open (2026-07-16) | Mobile lead | apps/mobile/store-listing/ios/PrivacyInfo.xcprivacy, apps/mobile/app.config.js | The locked App-Store-review copy of the Apple Privacy Manifest has drifted from the generated truth: it is missing the C56D.1 FileTimestamp required-reason code and the NSPrivacyTrackingDomains key that the prebuild-generated apps/mobile/ios/AGIWorkforce/PrivacyInfo.xcprivacy carries, and its header comment still cites the deleted root ios/ path as the canonical Xcode-consumed copy. The real source of truth (app.config.js privacy-manifest config) is intact and generating correctly, so the shipped app is fine, but the locked review copy its own header says to keep in sync is stale. Reconcile (regenerate the locked copy from a fresh prebuild + fix its header path) before any App Store submission. | Diff apps/mobile/store-listing/ios/PrivacyInfo.xcprivacy against a fresh prebuild's generated manifest; close when byte-consistent (minus documented intentional deltas) and the header cites the generated path. |
| WEB-PROJECT-KNOWLEDGE-MANIFEST-ONLY-01 | Medium | Remediated in code; production activation gated by migration 0064 (2026-07-18) | Web lead | `apps/web/lib/server/project-knowledge-extraction.ts`, `apps/web/app/api/projects/[id]/knowledge-files/route.ts`, `apps/web/lib/services/project-context-service.ts`, `apps/web/db/neon/0064_project_knowledge_extraction.sql` | New project knowledge uploads now resolve only configured R2 public URLs under the exact project prefix, read by object key (not URL), verify byte count, SHA-256, and stored MIME, extract bounded UTF-8 or PDF text server-side, and persist it for managed project chat. The shared attachment owner also classifies generic-MIME text/code uploads by its canonical extension roster, which extraction and preview now reuse. Prompt construction applies a second per-file/total cap and labels the serialized contents untrusted reference data that can never supply instructions. Images and empty/scanned PDFs remain honest metadata-only entries; rows uploaded before 0064 need re-upload or a future backfill. | Focused Web + shared-contract tests: 8 files / 34 tests; full shared types: 15 files / 389 tests; full Web: 348 files / 4,094 tests. Both packages' typecheck/lint, the Web production build, and a generated-PDF Node extraction smoke passed. Build emitted only the documented missing Stripe configuration warnings. Do not deploy this path before applying 0064. |
| WEB-TIER-NAMING-HOBBY-STALE-01 | Medium | Open (2026-07-16) | Web + mobile + CLI + billing leads | apps/mobile/services/api.ts (~207) + apps/mobile/services/streaming.ts (~276), apps/cli/src/lib.rs (~2633) + apps/cli/src/models/streaming.rs, apps/web/app/privacy/page.tsx (~85), apps/web/app/terms/page.tsx (~55), apps/web/app/refund-policy/page.tsx (~32-46), apps/web/app/gallery/GalleryClient.tsx (~152), apps/web/app/api/llm/v1/models/route.ts (~24-38), apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts (~753), packages/contracts/types/src/billing-catalog.ts | Two tier taxonomies diverge and a removed 'Hobby' tier leaks to users. The billing SSOT (billing-catalog.ts) tiers are free/basic/pro/max/enterprise (no 'hobby'; Hobby was removed and Basic is the entry paid tier per the 2026-07 pricing decision), but (a) USER-FACING LEGAL/POLICY copy still names a nonexistent 'Hobby' tier, privacy ("cloud mode (Hobby tier and above)"), terms ("Paid tiers (Hobby and above) are billed in advance"), refund-policy (table rows "Hobby subscription" / "Annual Hobby" / "Hobby credits"); and (b) the MODEL-ACCESS taxonomy in models/route.ts types tier as hobby-or-pro-or-max with getAllowedModelsForTier('hobby'), and GalleryClient.tsx's inline schema lists tier IN (free,hobby,pro,max,enterprise), 'hobby' present, 'basic' absent. So billing-tier vs model-access-tier naming has diverged (basic vs hobby), confusing at minimum and possibly a mapping bug. (c) CROSS-SURFACE PAYWALL PROTOCOL (found 2026-07-16): mobile defaults requiredTier to 'hobby' (services/streaming.ts + api.ts, whose comment also lists a stale 'pro_plus'), and CLI pins requiredTier:'hobby' in the paywall protocol doc plus a passing test (models/streaming.rs), while CLI lib.rs:2633 carries an explicit TODO(openQuestion) block confirming "Hobby has been removed from the canonical tier model (UserTier no longer has a Hobby variant)". So the server↔client paywall contract still speaks a removed tier across surfaces; a client-only rename would desync it, and the CLI block is a documented deliberate-hold. This is a coordinated server+web+mobile+CLI reconciliation, not a copy fix. Fix is NOT a blind rename: (i) legal/policy copy is founder/legal-sensitive, safest is to genericize privacy+terms to "paid tiers" and map the refund-policy rows to the real current tiers; (ii) do NOT rename the model-access 'hobby' key without verifying getAllowedModelsForTier + all callers accept the new key, or documenting the two taxonomies as intentionally distinct. | Reproduce: grep 'Hobby'/'hobby' across apps/web + apps/mobile + apps/cli (legal pages, models/route.ts, gallery schema, mobile requiredTier defaults, CLI paywall protocol + tests). Close when user-facing copy names only current tiers, the server↔client paywall protocol no longer defaults to a removed tier on any surface, and the billing/model-access tier naming is reconciled or explicitly documented as dual. |
| DESKTOP-COMPUTER-USE-FOREGROUND-GATE-01 | High | Open (2026-07-16) | Desktop automation | `apps/desktop/src-tauri/src/automation/computer_use/anthropic_agent.rs`, `apps/desktop/src-tauri/src/automation/computer_use/window_manager.rs` | The computer-use permission gate cannot resolve the live foreground app's bundle ID (platform window detection unbuilt), so it never calls `app_permissions.decide` against the actual foreground window. It blocks any explicitly-Denied app and any configured permission whose bundle ID is on the safety/financial deny-list, then defaults to allow when no configured permission matches, unconfigured apps are not gated per-action. | Build platform foreground-window detection (WindowCoordinator bundle-id resolution) and call the decide path per action; until then do not present per-app automation permissions as a complete enforcement boundary. Code comment at the gate references this row. |
| DESKTOP-SYSTEM-DICTATION-UNWIRED-01 | High | Open; the Electron shell's OS-global dictation accelerator, the configurable native chord and the language threading landed 2026-09-05, system-wide dictation in the native shell stays refused on every OS | Desktop dictation | `apps/desktop/electron/{shortcuts,voiceDictation,garnishCore,tray}.ts`, `apps/desktop/src/lib/{globalVoiceShortcut,voiceLanguage}.ts`, `apps/desktop/src/hooks/useVoiceHotkey.ts`, `apps/desktop/src/stores/settings/voice.ts`, `apps/desktop/src/features/{voice/VoiceInputOverlay,settings/VoiceSettings}.tsx`, `apps/desktop/src-tauri/src/features/speech/dictation/{accelerator,coordinator,hotkey}.rs`, `apps/desktop/src-tauri/src/sys/commands/{voice,voice_global}.rs` | The Electron shell, which is the shipped desktop product, now registers an OS-global dictation accelerator (`voiceShortcut`, default `Alt+Shift+V`) through `globalShortcut`, edited from the tray Shortcuts submenu, reporting a chord taken by another AGI Cloud shortcut or by another application; a press surfaces the focused window or the Quick Ask surface, focuses the composer and toggles the existing capture path, and the intent classifier and computer-use consent gate are untouched. In the native shell the hook's lifecycle defects are fixed (one OS listener per process, one edge pair per hold) and the watched chord is parsed from the same accelerator grammar instead of a hardcoded `Fn`, but `system_dictation_available()` is still a compile-time `false`, so the coordinator refuses every `Global` session and the hook only emits honest `refused` events. What still blocks it: text injection has no target pinning, revalidation, secure-field refusal or clipboard transaction; there is no global capture pipeline, so a chord release cancels rather than transcribes; no dictionary, snippets, correction learning or per-app style exists; and the signed and notarised cross-app release proof needs a build this work cannot produce. The in-app `useVoiceHotkey` remains window-focus-scoped by design. | Do not market or mark the native global toggle available. Close the remaining gates listed in `docs/specs/desktop-global-voice/spec.md`: safe target and injection transaction, the global capture pipeline and its recovery matrix, personalization, and the signed-build cross-app proof, in that order, before `system_dictation_available()` may return true for one OS. |
| PROD-SEARCH-MIGRATION-0045-01 | Medium | Open, needs prod migration | Web lead | apps/web/db/neon/0045\*\*.sql, apps/web/app/api/search/route.ts | The 3-arg user-scoped get\*popular_searches(text,int,int) from migration 0045 was applied to the DEV DB (2026-07-10) but must also be applied to PROD Neon. A code-level graceful fallback (catches SQLSTATE 42883 → returns {searches:[]}) now prevents the 500 that broke the global-search modal, but the popular-searches feature stays empty in any env lacking 0045. | Apply 0045 to prod Neon, then remove reliance on the fallback for that env. |
| DESKTOP-REGENERATE-NO-COMPLETION-01 | Medium | Open, supervised (needs Tauri/WDIO + live model) | Desktop lead | packages/ui/unified-chat/src/hooks/useChat.ts, packages/ui/unified-chat/src/components/ChatInterface.tsx, packages/ui/unified-chat/src/components/MessageList.tsx (+ MessageBubble/ActionBar), dead legacy: apps/desktop/src/features/chat/ChatStream.tsx, apps/desktop/src/features/v3/ActiveChat.tsx | Desktop chat has NO working one-click Regenerate/Retry (web has it, verified live). TWO distinct facts. (1) LIVE PATH: the app mounts the SHARED unified-chat ChatInterface (App.tsx lazy imports @agiworkforce/unified-chat ChatInterface). ChatInterface renders MessageList passing onArtifactClick + onContinueGeneration but NOT onRetry/onRegenerate, and useChat only returns sendMessage/stopGeneration/continueGeneration/isStreaming, there is no regenerate capability at all, so the assistant ActionBar Regenerate is gated off (absent), not broken. True web parity requires a NEW shared runtime.regenerate(conversationId) capability (drop last assistant turn, re-run last user turn) implemented across Local/Cloud/BYOK runtimes, exposed by useChat, and threaded ChatInterface → MessageList → MessageBubble → ActionBar. This touches the send pipeline across all three runtimes and CANNOT be verified without a running Tauri app + a live/local model, so it is supervised, not an autonomous edit. (2) DEAD LEGACY: apps/desktop/src/features/v3/ActiveChat.tsx (zero importers) and apps/desktop/src/features/chat/ChatStream.tsx both contain mis-wired regenerate, ChatStream wires onRegenerate to startEditingMessage(assistantId, assistantContent) (would dump the assistant reply into an edit box) and both route to editAndRegenerateFromMessage/forkAndRegenerate, which only fork+truncate via the conversation_fork Tauri command and NEVER trigger a new completion (composer submit is the sole path to a new assistant message; the code comment "populate the input and allow the user to send" confirms manual-by-design). These stacks are unmounted → not a live bug, but a maintainability/cleanup candidate and a trap for future work. | Reverse-engineered the full live mount chain (App.tsx → shared ChatInterface) + both dead stacks by import-graph tracing (ActiveChat: 0 importers; ChatInterface: the lazy-mounted surface). Fix + verify: add runtime.regenerate across runtimes, wire onRetry through the shared tree, then drive Regenerate on a signed-in/local-model desktop build via WDIO and confirm a fresh streamed completion replaces the prior assistant turn. Separately: delete/quarantine the dead ChatStream/ActiveChat regenerate stacks once confirmed fully unreferenced. REFINED RECIPE (traced web's working impl 2026-07-10): do NOT invent a novel mechanism, PORT web's proven client-side REPLAY pattern. Web (`apps/web/features/chat/lib/regenerateReplay.ts` + WebChatPage) does: (a) `getRegenerateReplayDecision({userMetadata, assistantMetadata})` gates regenerate, blocks skill-guided turns (`sendReplay.hasSkillInstruction`) and legacy tool-assisted turns lacking replay metadata, each with an honest user message; (b) `replayToSendOptions(sendReplay)` recovers the original webSearch/thinking/codeExecution/styleMode toggles from the USER turn's `sendReplay` metadata; (c) truncate messages after that user turn + re-`sendMessage` with the replayed options. Both helper fns are PURE (no DOM/store deps) → extract them to `packages/ui/unified-chat` (shared, zero-dup) so desktop reuses the SAME gating + option-replay. The remaining runtime-specific piece is only the truncate-then-resend persistence (each runtime must drop-after-user-turn consistently so reload doesn't diverge) + the ActionBar wiring, still Tauri/WDIO-verified, but this converts the task from greenfield to "reuse web's helpers + one persistence method per runtime." |
| PROD-ENV-DRIFT-ALERTING-GAP-2026-07-11 | High | Open, Upstash recurrence fixed same day; alerting + env reconciliation pending founder decisions | Web + platform leads | apps/web/lib/rate-limit.ts, apps/web/lib/validate-env.ts, apps/web/instrumentation.ts, Vercel project env | SEV-WEB-13 RECURRED: UPSTASH*REDIS*REST_URL/TOKEN were absent from the Vercel project again (deleted, or never actually applied on 2026-07-06), so every /api/\* route including /api/health returned 500 at module eval on the current prod deploys; incident start is unknowable after the fact because the static /500 page's last-modified only reflects deploy build time, not failure onset. Fixed 2026-07-11: both vars re-added to Production and Preview, same-commit redeploy, recovery verified (models 200, me 401, health executes JSON). SYSTEMIC CLASS still open: validate-env.ts declares criticals (including STRIPE\*SECRET_KEY, STRIPE_WEBHOOK_SECRET, NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY) but instrumentation.ts only logs and never alerts or fails the deploy, and those three Stripe criticals are genuinely absent from Vercel today (a signed-in checkout POST would throw at api/checkout/route.ts:23), the E2B pair (AGI_E2B_EXECUTION, E2B_API_KEY) is absent so feature_flags.code_execution is false on prod (composer Run-code hidden, no code-interpretation tool), and prod runs a Clerk DEVELOPMENT publishable key (live browser console warns about dev keys in production). No uptime monitoring exists on /api/health, so total API outages are silent. Durable guard to add: health-endpoint alerting plus an automated env-drift check comparing Vercel env names against the validate-env criticals list. | curl https://agiworkforce.com/api/health should return JSON, never an HTML 500. Re-verified 2026-07-17: STRIPE_SECRET_KEY + STRIPE_WEBHOOK_SECRET + NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY are still absent from Vercel production (vercel env ls shows only STRIPE_PRICE\*\* + STRIPE\*CHECKOUT_ENABLED), so prod checkout/webhooks remain dead, founder must add live keys. Health SEMANTICS fixed 2026-07-17 (commit 4b883196e): a stripe failure now reports degraded (200) instead of taking the whole platform to unhealthy (503); only database/environment failures 503. After the next main deploy the expected prod state is 200 degraded until the Stripe keys land. vercel env ls names vs apps/web/lib/validate-env.ts criticals; prod browser console for the Clerk dev-keys warning. |
| WEB-CONNECTORS-SSR-HANG-2026-07-11 | Medium | Open, DEV-ONLY, merge guard LIFTED 2026-07-11: full production build succeeds cleanly (~28s, Turbopack compile 11.6s + tsc 16.5s, all 241 pages incl. every /connectors route in the manifest; only pre-existing NFT warning on user-connector-tools.ts). The hang is dev-experience-only. Still worth root-causing for engineering velocity via CPU profiling of the stuck dev next-server, static analysis exhausted. Original diagnosis: COMPILE-phase hang confirmed 2026-07-11 (Turbopack "Compiling /connectors" never completes; ~950 percent CPU is bundler threads); simple-icons 5.2MB barrel import ruled OUT by fix+clean-retest (still an anti-pattern, same pattern in components/marketing/ProviderLogo.tsx); every /connectors-unique file read clean; control test: / responds 2.3s on the same tree so the shared root-layout closure is cleared. NEXT: (1) run a full `next build` to determine whether production builds hang too or this is dev-only DX, if prod builds pass, soften the do-not-merge guard to verify-prod-build-before-merge; (2) CPU-profile the stuck next-server (--cpu-prof) or use Turbopack tracing, static file reading is exhausted | Web lead | apps/web/features/connectors/pages/ConnectorsPage.tsx, apps/web/features/connectors/hooks/use-connectors.ts, apps/web/features/connectors/config/connector-logos.ts, apps/web/features/connectors/data/connectors.ts, apps/web/app/connectors/page.tsx | In the uncommitted connectors rebuild, a single request to /connectors on the local dev server never resolves (curl hung past 240s with zero bytes, both anonymous and signed-in) while other never-compiled routes respond in ~20ms; each repeated probe hangs another worker, so CPU and memory climb cumulatively (observed ~950 percent CPU, stacked hung workers, not one multi-core loop; Node SSR is single-threaded per request). Prod, built from pre-rebuild main, responds 200 in ~0.3s, the regression is exclusively in the uncommitted diff. Static analysis of the 482-line ConnectorsPage diff ruled out obvious render loops (the github-toast useSearchParams effect self-terminates and cannot run during SSR; useConnectors is plain useState+useEffect; filter memos are bounded); best remaining hypothesis is a Turbopack dev-server import-graph pathology introduced via the new use-connectors/connector-logos imports (repo precedent: Turbopack whole-project NFT trace warning on approve/route.ts via user-connector-tools.ts). Next step is a timeboxed bisect: first observe whether Turbopack "compiling /connectors" ever completes on the first hit (splits compile-hang from runtime-SSR-hang), then disable the github-toast effect and the useConnectors swap one at a time with one curl each, killing the server between states. | Repro: start the apps/web dev server, curl --max-time 30 the /connectors route (hangs) vs /library (fast); kill the dev server afterwards or hung workers accumulate. |
| DESKTOP-CONNECTOR-LOCAL-CLOUD-SPLIT-01 | High | Tracked (founder trust-boundary call; wave-2 WP6) | Desktop lead | apps/desktop/src/App.tsx:1638-1653, apps/desktop/src/stores/appModeStore.ts:53, apps/desktop/src/stores/connectorsStore.ts, apps/desktop/src-tauri/src/sys/commands/mcp_oauth.rs, apps/desktop/src/features/settings/DesktopCloudSettingsModal.tsx:19-21 | Desktop's default app mode is Local (appModeStore.ts:53), and Local mode's Connectors panel (ConnectorGallery via stores/connectorsStore.ts) runs an entirely separate, device-local Tauri MCP connector system with its own OAuth token storage, it never reads or writes user_connectors/github_installations, the tables web, mobile, and Desktop's own Cloud/BYOK-mode panel share. A connector (including GitHub) connected from default Desktop Local mode is invisible to every other surface and mode; the reverse is also true. Desktop's Cloud/BYOK-mode panel is correctly wired to the shared tables, the gap is specifically Local mode, which is the default. By-design per the Local/BYOK/Cloud trust-boundary rule, but the founder's connector-sharing requirement carves out no exception for it, resolution is a founder product decision (keep Local device-local plus explicit Cloud-mode sync plus honest UI, vs default desktop to Cloud). | Manual trace, SYNC-AUDITOR report 2026-07-11; see docs/plans/tier-metering-reconciliation-wave2-2026-07-11.md G1. |
| DESKTOP-SETTINGS-SYNC-GAP-01 | High | Tracked (wave-2 WP6) | Desktop lead | apps/desktop/src (repo-wide) | Desktop has zero settings-sync wiring of any kind, in any app mode. Grepped apps/desktop/src for user_settings, CLOUD_SAFE_SETTINGS, and settings/sync, zero matches on all three. Mobile is confirmed genuinely wired (apps/mobile/app/\_layout.tsx:232-236 calls startCloudSyncLoop(), a real 30s interval loop, gated on signed-in). Web benefits implicitly since /api/settings/preferences and /api/settings/sync read/write the same user_settings row. Desktop participates in neither push nor pull, for any of the 8 allowlisted namespaces (appearance, personalization, profile, notifications, language, accessibility, chat, editor). | Manual trace, SYNC-AUDITOR report 2026-07-11; see wave-2 plan G3. |
| CONNECTOR-PERMISSIONS-CLIENT-ONLY-01 | Medium | Tracked (Medium CONFIRMED, no cross-device bypass; wave-2 WP-connectors) | Platform | packages/ui/unified-chat/src/lib/connectorPermissionStore.ts:121-212, apps/web/features/connectors/stores/tool-permissions-store.ts, apps/web/lib/hooks/useChatStream.ts:402-418, apps/web/app/api/llm/v1/chat/completions/route.ts:203, apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:912-1004, apps/web/db/neon/0008_connectors.sql | Per-tool connector permission levels (allow, ask, block) are never read server-side at tool-execution time, confirmed by full trace of tool-loop.ts's resume preamble, which validates only that an approval references a real pending, catalog-offered call (anti-forgery), not any stored policy. Server gating is a single coarse binary (route.ts:203 approvalMode = hasMcpTools ? manual : auto), not per-tool or per-user. connector_tool_permissions (the table built for this) has no live reader or writer: the shared package's cloud branch resolves its DB client from a globalThis global set nowhere outside its own test file (unmigrated Supabase-era leftover, Supabase fully removed); web's live UI uses a separate browser-localStorage-only store. Every surface's permission setting is local-only and invisible elsewhere, with no independent server-side floor. Fail-closed default is ask, so an un-ruled device re-asks a human rather than silently running, NOT confirmed silent-execution, NOT cosmetic. Open amplifier: whether desktop autoApproveTools (AGI Mode) is wired into the approval-resolve path (would make it a real cross-device bypass), unconfirmed, being traced. | Manual trace, SYNC-AUDITOR report 2026-07-11; see wave-2 plan G4. |
| CUSTOM-CONNECTORS-DESKTOP-MOBILE-GAP-01 | Medium | Tracked (wave-2 WP6) | Desktop + Mobile leads | apps/desktop/src/api/cloudConnectors.ts:27-34, apps/mobile/services/connectors.ts | User-added custom remote MCP connectors (/api/connectors/custom, full CRUD on web) are invisible on both Desktop and Mobile. Desktop's CloudConnectorEntry.source type only allows user or github-app, structurally excluding custom. Mobile's connectors service has zero calls to the custom-connector endpoints. A custom connector added on web cannot be seen, used, or removed from either other surface. | Manual trace, SYNC-AUDITOR report 2026-07-11; see wave-2 plan G2. |
| PROD-VERCEL-DEPLOY-TOPOLOGY-01 | High | Open, two founder actions (Vercel Pro upgrade; optionally connect Git) | Platform + founder | vercel.json (crons), Vercel project agiworkforce (prj\*vDA7A5nZakjYscIsc47JyGqek3Ea) | Two prod deploy-topology facts discovered 2026-07-17 while shipping the restructure: (a) the Vercel project has NO connected Git repository (project inspect shows no Git section), pushes to main NEVER auto-deploy despite git.deploymentEnabled in vercel.json; all prod deploys are manual CLI (vercel deploy --prod) from a clean checkout. (b) The account is on the HOBBY plan: cron jobs are capped at daily, and the deploy is REJECTED outright if any cron is more frequent (observed: "Hobby accounts are limited to daily cron jobs" for the \* \* \* \* \* reconcile-credits + run-schedules). Both were downgraded to daily (30 0 and 15 0) to unblock deploys, strictly better than the never-registered status quo, but the schedules feature (user-scheduled tasks) effectively runs at most once daily and credit reconciliation is daily, both product-degrading. FOUNDER ACTIONS: upgrade Vercel to Pro, then restore reconcile-credits + run-schedules to minute-level schedules; optionally connect the GitHub repo in the Vercel dashboard so main pushes deploy automatically (until then, every merge to main requires a manual vercel deploy --prod). | vercel project inspect agiworkforce (no Git section); deploy rejection message in session log 2026-07-17. Close when the plan is Pro, the two crons are minute-level again, and (optionally) Git-connected auto-deploys are verified by a push. |
| COMPLIANCE-LLM-GATE-SURFACE-COVERAGE-01 | High | Open, re-verified and narrowed 2026-08-21 | Platform + compliance | `packages/contracts/compliance/src/llm-gate.ts`, `apps/mobile/services/streaming.ts` | Re-verified. TWO of the original claims are STALE: the docblock naming `apps/web/features/chat/lib/chatClient.ts` and claiming the gate "runs in front of every /api/llm/\* request" no longer exists anywhere in the tree, and web's Article 50(1) posture is not an unenforced gate but a DELIBERATE recorded position, `apps/web/lib/compliance/ai-act.ts` `ARTICLE_50_1_WEB_CARVE_OUT` relies on the obviousness carve-out since 2026-08-14 with `counselReviewed: false`. ONE claim is real and live: the Chinese-HQ named-provider opt-in is enforced on mobile only. | `deepseek`, `moonshot`, `qwen` and `zhipu` are all in models.json and reachable on web; `ensureLlmGateOpen` has exactly one production caller (`apps/mobile/services/streaming.ts:366`); `apps/web` has no ConsentLedger and `CONSENT_PURPOSES` covers only marketing and analytics. No migration is needed, `consent_records.purpose` is text, so closing this is code-only: add per-provider consent purposes, an opt-in sheet in the model picker, and a server-side check on the web send path. NEEDS A DECISION FIRST: enforcing without the sheet blocks paying users mid-flow, and shipping the sheet without enforcement is a fake control. Founder/counsel call on whether web blocks these providers pending consent. |
| MOBILE-PROVIDER-SWITCH-GATE-DIVERGENCE-01 | High | Open, sweep-quarantine (code-wrong) | Mobile + billing | `apps/mobile/src/features/model-picker/tierGuard.ts`, `apps/extension-vscode/src/integrations/providerSwitchGuard.ts`, `packages/contracts/types/src/design-system/user-identity.ts` | `tierGuard.ts:86` sets `PROVIDER_SWITCH_MIN_TIER = 'pro'` while its docstring claims to mirror unified-chat's `selectProviderSwitchGate`. Canonical `canSwitchProviderInThread` admits only `max`/`max_15x`/`enterprise`, `user-identity.test.ts` asserts `pro` and `team` are denied, and the VS Code guard gates at `max` with a comment rejecting "silently loosening to 'pro'". Mobile therefore grants mid-thread provider switching to `pro` and `team` users that web, desktop and VS Code refuse. | Compare `PROVIDER_SWITCH_MIN_TIER` against `canSwitchProviderInThread`. `apps/mobile/__tests__/tier-guard.test.ts` asserts the loose behaviour, so closing requires a paywall decision: either mobile delegates to the canonical predicate and the test is updated, or the divergence is recorded as intended. |
| WEB-US-ONLY-ROUTING-NOT-THREADED-01 | Medium | Open, sweep-quarantine (code-wrong) | Web lead | `apps/web/app/api/me/routing-preferences/route.ts`, `packages/contracts/types/src/model-catalog.ts` | The route comments that lower tiers may store `us_only` but "the router ignores it because `TierPolicy.usOnlyRoutingAvailable` is false". The router ignores it for every tier: `resolveAutoModeModel`'s `usOnly` option is passed only by tests, nothing reads `routing_preferences.us_only` into the resolver, and no UI reads `usOnlyRoutingAvailable`. The stated reason is wrong and the preference is inert. | Grep `usOnly:` outside tests, no production caller. Closes when the preference is threaded into `resolveAutoModeModel`, or the field and its docs are removed. |
| CONTRACTS-TOOL-USE-LADDER-DOC-INVERTED-01 | Low | Open, sweep-quarantine (polarity unresolved) | Platform | `packages/contracts/types/src/model-catalog.ts` | The `allowToolUse` field doc says "(Free=false, lower tiers)" but the `free` tier sets `allowToolUse: true`. The sibling `allowMCP` is documented as "same shape as `allowToolUse`" (a burn-warning policy label such as `'unlimited'`) while `free` sets `'one_custom_remote'`, a quantity. Either Free should not have tool use or the doc is stale; the sweep must not guess. | Read the `free` entry against the two field docs. Closes when an owner states which side is correct. |
| DESKTOP-MEMORY-DECAY-BRIDGE-HARDCODED-01 | Medium | Open, sweep-quarantine (code-wrong) | Desktop | `apps/desktop/src/stores/bridge/stateBridge.ts`, `apps/desktop/src/api/memory.ts` | The bridge header advertises `decayEnabled` as supplied state, but line 319 assigns a literal `false` annotated "updated when getDecayConfig() is called". `getDecayConfig` is never called in this file, and the subscription tick would overwrite a real value if it were. The real API exists at `apps/desktop/src/api/memory.ts:401`. | Grep `getDecayConfig` in `stateBridge.ts`, no call site. Closes when the bridge reads the decay config, or the field is dropped from `AppState.memory`. |
| DESKTOP-KNOWLEDGE-DB-TEST-ISOLATION-01 | Low | Open | Desktop | apps/desktop/src-tauri/src/core/agi/knowledge.rs, apps/desktop/src-tauri/src/sys/commands/mcp_oauth.rs, apps/desktop/src-tauri/src/sys/utils.rs, apps/desktop/src-tauri/src/data/db/key_management.rs | `KnowledgeBase::get_db_path()` (core/agi/knowledge.rs:53-56) has no test-isolation override: it unconditionally resolves `dirs::data_dir()?.join("agiworkforce")`, so `core::agi::reflection::tests::test_failure_categorization` opens the real, Keychain-keyed `knowledge.db` in whatever host app-data directory the machine already has. It fails on a checkout with a leftover `~/Library/Application Support/agiworkforce/knowledge.db` while green on a clean CI runner (see "Six desktop tests fail on a local macOS checkout and pass in CI", corrected 2026-08-24). This is not the same shape as the other five: `sys::commands::mcp_oauth`'s `with_temp_settings_db` test helper (mcp_oauth.rs:2649-2678) sets `AGIWORKFORCE_APP_DATA_DIR`, but nothing reads that env var any more (lib.rs:41-44 documents its replacement by `sys::utils::app_data_dir()`'s `OnceLock`, which falls back to real `dirs::data_local_dir()` in test contexts with no env override either), so mcp_oauth's override is dead code, not a working pattern to copy; both suites hit real host state, just via different missing mechanisms. | Set `AGIWORKFORCE_APP_DATA_DIR` (or call `sys::utils::set_app_data_dir()` with a temp dir) before running `cargo test --lib knowledge` on a machine with a real `knowledge.db`, it still fails. Closes when `get_db_path()` resolves through a test-overridable path (ideally `sys::utils::app_data_dir()`, itself first extended to honor a temp-dir override in `#[cfg(test)]` builds) and the test passes regardless of host state. |
| WEB-E2E-AUTH-SPECS-NOT-IN-CI-01 | Medium | Open, decision needed | Web + platform | `apps/web/e2e/authenticated-flows.spec.ts`, `apps/web/e2e/enterprise-enforcement.spec.ts`, `apps/web/e2e/workspace-console.spec.ts`, `apps/web/e2e/enterprise-surface.spec.ts`, `.github/workflows/ci.yml` | `web-a11y` runs only `public-auth-clean.spec.ts` and `checkout.spec.ts`. The other four `apps/web/e2e/*.spec.ts` files run nowhere in CI, for two different reasons. `authenticated-flows.spec.ts`, `enterprise-enforcement.spec.ts`, and `workspace-console.spec.ts` each call `POST https://api.clerk.com/v1/sign_in_tokens` with `CLERK_SECRET_KEY` to mint a real session (`apps/web/e2e/workspace-console.spec.ts:27-41`) and throw on a non-real key, the job's fixture `test-clerk-secret-key` gets a 401 from Clerk, so these cannot run against fixture credentials; they need a real secret plus a seeded QA user/org (`workspace-console.spec.ts:4` hardcodes `QA_USER`). `enterprise-surface.spec.ts` needs no credential but defaults to sweeping production (`ENTERPRISE_SWEEP_BASE_URL ?? 'https://agiworkforce.com'`, line 12) and is wired into no workflow at all, scheduled or otherwise. | Grep the four spec basenames across `.github/workflows/*.yml`: none appear. Closes with an owner decision: a CI secret plus a seeded org/QA user for the three Clerk-ticket specs, or a scheduled lane authenticated against production; and a scheduled or CI lane (with `ENTERPRISE_SWEEP_BASE_URL` pinned) for the surface sweep. |
| ARTIFACT-SURFACE-NAMING-01 | Low | Open, decision needed | Web + platform | `apps/web/lib/server/generated-file-persist.ts`, `apps/web/db/neon/0121_artifact_index.sql`, `apps/web/app/api/chat/conversations/[id]/messages/lib/index-artifacts.ts` | `classifyGeneratedFile` tags Library-generated files `metadata.surface: 'artifact'` in `media_assets`; `web_artifact_index` (migration 0121) is an unrelated per-message derived-artifact index for `/chat/artifacts`. Same word, two disjoint systems with no shared code path today, a future agent could plausibly query one meaning the other. | Grep both call sites confirms no shared code path. Closes with an owner decision: rename one of the two ('surface' tag vs. artifact index) or add an explicit cross-reference comment at both definitions. |
| CHROME-SURFACE-LOST-TURN-01 | High | Open, needs cross-surface investigation | Web + Extension | `apps/extension/src/features/cloud-bridge/managedRunControl.ts`, `apps/web/app/api/llm/v1/chat/completions/route.ts`, web chat transcript render | A managed-cloud turn tagged `metadata.surface: 'chrome'` (conversation `1d2db16c-9e69-4d75-844b-2b9339d02202`) persisted the user's message with no assistant reply, and the web transcript rendered no failure state, no error, no retry affordance, the turn just silently stops. Observed live during a 2026-08-24 visual audit; root cause not yet isolated. | Reproduce a managed-cloud turn from the Chrome extension surface and confirm a user message with no paired assistant row. Needs the Chrome bridge's send/run-control path, the managed-cloud completion route, and the web transcript's failure-state handling all checked. Closes when the transcript shows an explicit failure/retry state instead of a silent drop. |
| WEB-SEO-PROBE-404-01 | Low | Open, code-fixable, reproduces on main | Extension | `apps/extension/src/nlweb.ts` | Every page load fires 404 probes to `/.well-known/nlweb`, `/ask`, and `/mcp`, reported as coming from a client-side SEO service; grepping the repo for these paths finds them only in `apps/extension/src/nlweb.ts`'s `probeEndpoint` (NLWeb capability detection, a content script that probes whatever origin is current), not in any `apps/web` code. Reproduces on production AND `main`. | Confirm whether the audit browser had the extension installed (that would fully explain "every page load, on main too"). If so, the code fix is caching a negative probe result per origin instead of re-probing on every navigation; the requests are already `.catch()`-swallowed in JS so this is log/network noise, not a functional break. |
| WEB-NONSTREAM-COMPLETIONS-NO-PERSIST-01 | Medium | Open, recorded 2026-08-24 | Web | `apps/web/app/api/llm/v1/chat/completions/lib/response-builder.ts` | The non-streaming completions path (`buildNonStreamResponse`) never persists the assistant turn server-side at all, `web_messages` gets no row for pure API-passthrough consumers (the product UI always sends `stream:true`). Discovered while wiring the artifact index; a different bug class (no persistence, not an indexing gap). Needs a product decision: should non-streaming API turns persist? | Closes when either non-streaming turns persist server-side with a test proving the row lands, or the non-persistence is documented as intended API-passthrough behavior. |
| WEB-SYNC-INDEX-CLIENT-ECHO-01 | Low | Open, recorded 2026-08-24 | Web | `apps/web/app/api/chat/sync/route.ts` | The device-sync artifact-indexing loop passes `conversationId`/`content` from the client-submitted batch map instead of re-reading the applied DB row, so a malformed batch with duplicate ids could index content that differs from what was actually persisted. Tenant-safe (the applied-row guard still holds) but index content can drift from stored content. | Closes when the indexing loop reads `conversationId`/`content` back from the applied rows, with a duplicate-id batch test. |

## Update Rules

- Add a row when a repeated bug class, stale claim, or high-risk open gap is discovered.
- Once a row is closed **and verified in the environment that matters**, delete it
  rather than marking it `Fixed`. A closed row left in an open ledger gets
  re-investigated by the next agent, which is pure waste. `CHANGELOG.md` is the
  record of what was fixed; this file is only what is still true.
- The exception is a fix that is real in source but not yet live, pending a CI
  rerun, a production migration, or a deploy. Keep those, and say what is pending,
  because they are not closed where it counts.
- Prefer owner roles over individual names until the team is hired.

## 2026-08-06 Stream usage accounting divergence between the two response builders

- **Regression ownership is now explicit.**
  `stream-transform-usage.test.ts` feeds a native Anthropic `message_start` plus
  `message_delta` and asserts all five counters passed to `recordModelUsage`.
  The older `stream-transform.byte-parity.test.ts` remains wire-only and must
  not be treated as accounting evidence. The focused command
  `pnpm --filter @agiworkforce/web exec vitest run app/api/llm/v1/chat/completions/__tests__/stream-transform-usage.test.ts`
  passed 9/9 checks on 2026-08-13.
- **Separate metering residual remains open.** This token-accounting patch does
  not close `WEB-BILLING-TRUTH-01`'s existing gap: external per-call fees for
  generic web search and E2B sandbox execution are still excluded from managed
  reservations, so tool-heavy loops can exceed a rolling spend ceiling by
  those fees.

## 2026-08-06 Upload exposure window is bounded by the public R2 bucket

- **WEB-UPLOAD-PUBLIC-BUCKET-01, NEW GENERATED MEDIA + CHAT + PROJECT-KNOWLEDGE
  PATHS PATCHED IN THE CURRENT TREE (2026-08-13); avatar/retention decision
  remains open.** The
  old cost premise was stale: registered chat attachments and project sources
  were already read only through authenticated owner/workspace routes
  (`/api/files/[id]` and
  `/api/projects/[id]/knowledge-files/[fileId]`). The distinct private R2 bucket
  and account-scoped token were also provisioned for video on 2026-08-12.
  Current source now presigns chat attachments and project knowledge into that
  private bucket, returns no public locator, scans the real private bytes before
  registration, stores only opaque keys, and reads/deletes them through their
  existing owner gates. Legacy public rows have an explicit read/delete
  fallback during rollout; new uploads never use it. The Web CSP allows the
  exact validated private-bucket upload origin. New generated images, videos,
  and files now write owner-hashed `private-media/{kind}/...` keys into the
  private bucket and are addressable only through the catalog-backed,
  authenticated `/api/files/{id}` route. Generated-file persistence no longer
  returns an uncataloged raw storage locator when the media table is absent; it
  removes the staged object and reports a storage failure instead.
- **What this closes.** A malicious attachment or project source is no longer
  world-readable between the browser PUT and content inspection. A rejected
  object is deleted from private storage. Account/media deletion follows the
  private locator; database pointers remain on delete failure so a later retry
  cannot lose the only object identity.
- **What remains and must not be blurred into this fix.** Avatar upload still
  presigns directly to the public bucket and persists its permanent URL. It has
  a 5 MiB/image-type admission check but no byte-inspection completion step,
  and replacing an avatar overwrites the only database pointer to the prior
  object. Generated objects written before this change retain their legacy
  public locations until a migration policy is approved. Incomplete private
  presigns create unregistered private objects with no database pointer and
  therefore no account-erasure/retention owner.
- **Exact remaining product/infrastructure decision.** Choose whether avatars
  are intentionally public. If yes, stage them privately, inspect the bytes,
  publish only the accepted image, and delete the previous owned object. If no,
  serve them from an authenticated/signed route. Independently, give presigned
  uploads a pending prefix plus a bounded R2 lifecycle or a durable pending-row
  cleanup job, so clients that never call completion cannot accumulate orphaned
  objects. Decide whether legacy generated public objects are migrated or the
  public bucket/custom domain remains supported. Until that is ratified and
  deployed, do not claim that every upload is private or that every stored byte
  participates in retention/account erasure.
- **Verification is pending by instruction.** This reconciliation was
  source-only while the one-app VS Code runtime was active; focused Web tests,
  a direct private PUT/complete/read/delete flow, and post-deploy acceptance
  still have to run when Web owns the single runtime slot.

## 2026-08-06 Web test suite has parallel-load flakes

- **WEB-TEST-PARALLEL-FLAKE-01, OPEN, low.** Three suites failed once during a
  full `vitest run` and passed individually on immediate re-run, then passed in
  the next full run with no code change:
  `features/chat/components/Composer/ChatComposerNew.test.tsx`,
  `features/chat/components/messages/ChatMessageList.test.tsx`, and
  `lib/server/scim/__tests__/scim-token-service.test.ts`.
  Observed 2026-08-06. Not investigated. Recorded because a flake that only
  appears under parallel load is exactly the kind that gets misattributed to
  whichever change happens to be in flight, as nearly happened here.

  **2026-08-06 addition:** `__tests__/api/stripe-downgrade.test.ts` joined the
  same set, two "Plan Tier Resolution" cases failed once under a full parallel
  run and passed both in isolation (16/16) and on an immediate re-run of the
  whole suite. Same signature as the previously recorded suites: no shared state
  with the change under test, order-dependent only under parallel load.

## 2026-08-06 Unenforced data-retention control removed

## 2026-08-06 Phantom research contract

- **WEB-RESEARCH-QUERY-PHANTOM-TYPE-01.** `packages/contracts/types/src/research.ts:82`
  exports a `ResearchQuery` interface, including `preferredDomains`,
  `excludedDomains`, and `notBefore`, that has **zero consumers anywhere in the
  repo**: no producer, no reader, no test. It describes a search-filtering
  capability that does not exist.
  The 2026-08-06 backlog scored "domain / date / trusted-source filters" as S on
  the strength of those fields existing. That estimate is wrong. The real
  research path (`app/api/llm/v1/chat/completions/lib/research-loop.ts`) does not
  call a search API at all, searches run inside the provider's own native tool
  (`google_search` / `web_search_preview`, injected by `request-processor.ts`),
  so there is no request parameter to attach a domain filter to. Implementing it
  means a synthesis directive PLUS enforcement in `SourceAggregator.add` (a
  directive alone is a request, not a filter), PLUS a UI producing the values,
  PLUS request plumbing. That is M, not S.
  Do not "wire up" the existing fields: nothing reads them, and adding a reader
  without the enforcement half would let a user set an exclusion that silently
  does nothing.

## 2026-08-06 Mobile media generation

## 2026-08-13 Desktop arbitrary-public native egress boundary

- **Residual risk remains explicit.** This closes the static internal-host,
  failed-first-lookup, and redirect-to-internal classes for the converted
  surfaces. It does not pin DNS answers at connect time, so a hostname that
  answers public during validation and private during reqwest's connection
  lookup can still race the boundary. Rust also does not yet have one mandatory
  type across every fixed-provider, account, OAuth, and integration transport.
  A focused Rust compile/test was deliberately not started while Electron owned
  the single live-app/RAM lane; do not mark runtime-verified until that check
  runs.

## 2026-08-30 Full web-product capability audit, 121 verified findings, 22 fixed, 99 open

A capability-by-capability audit of `apps/web` (56 units covering every page,
API route, feature module and the shared `unified-chat`/`ui` packages). Each
finding was produced by reading the implementation, then re-checked by an
independent adversarial pass that refuted anything it could not confirm in
code; only survivors are listed. Severity is the verifier's, not the finder's.

Fixed in this pass, with regression tests, so do NOT re-report: error-boundary
classification and raw-error leakage; the duplicate friendly-error table across
`@agiworkforce/types` and `@agiworkforce/utils`; 166 unreachable modules
deleted (web unreachable debt 167 -> 4); `/api/support/ask` created, making the
whole `lib/support/agent/**` answer engine reachable; bulk-delete confirmation
count and reversibility copy; published artifacts revoked on conversation
delete; continue-generation double billing; voice cancel billing the user and
the mic stream leaking on unmount; stream billing refunding a kept partial
answer on a client abort; `/share/[token]` and `/shared-artifact/[token]`
indexable; marketing sign-out leaving the previous account's storage; sandbox
path confinement for `edit_file`/`read_file`/`list_files`; support-agent
handoff routes and two diagnostic endpoints reachable by any self-service org
admin; SCIM filtered member removal wiping whole groups; Stripe entitlement
granted before payment confirmed; device pairing issuing a ~60s token with no
refresh; TOTP replay and the backup-code read-modify-write race; hardcoded
z-index bypassing the token scale; stale cookie-policy disclosures.

Also fixed after that first sweep, both instances of one class: a Postgres
function declared `returns json`/`returns jsonb` read through `select * from
fn(...)`. Postgres names that single column after the function, so the row is
`{ fn: {...} }` and every field read off the row is `undefined`, silently,
because nothing throws. `/api/claim-offer` therefore failed EVERY valid invite
redemption, and did so after `claim_beta_invite` had already consumed the
invite and written the subscription, so the user lost the code and saw an
error. `/api/user/data` read `delete_user_data` the same way and logged that
the function had "declined erasure" on runs where it had just performed one.
`apps/web/db/neon/scalar-rpc-read-shape.test.ts` now cross-references every
`select * from fn(...)` in `apps/web` against the return type the migrations
declare, and fails any caller that does not read the function-named column.
`process_stripe_event_idempotent` uses `select *` too and is correct, because it
does read that column, the guard checks the misread, not the query shape.

Two findings were checked and are NOT defects, do not "fix" them: image
generation minting a fresh idempotency key per call is correct, because every
call is a user-initiated generation and there is no automatic retry reusing the
operation; and the enterprise NULL-usage-cap 503 is already remediated by
`apps/web/db/neon/0152_restore_null_tolerant_usage_caps.sql`, which is written
but marked NOT YET APPLIED and needs a production apply, not more code.

The rest are open. Each row is file:line plus the failure, so the next pass can
go straight to the code rather than rediscovering it.

### High (33)

- **Org-shared projects render as fully-editable owned projects, but every route beyond list/detail enforces strict ownership and silently 404s**, `apps/web/app/api/projects/[id]/knowledge-files/route.ts`
  - Fails: An org admin shares Project A with the org (default read access). A member opens /chat/projects, sees Project A listed identically to their own projects (no shared indicator, because isOrgShared never reaches the client), clicks in, and lands on the Sources tab: SourcesPanel.tsx's GET call 404s and the panel…
  - Fix: Add `isOrgShared: z.boolean().optional()` to ManagedCloudProjectSchema in packages/contracts/cloud-contracts/src/projects.ts, thread it through toWebProject in apps/web/features/projects/services/managed-cloud-projects.ts, and gate…
- **Sidebar recents list is hard-capped at 50 conversations, pagination is computed but never wired to any UI**, `apps/web/features/chat/pages/WebChatPage.tsx`
  - Fails: An account with more than 50 non-deleted conversations (very plausible for an active daily user) opens /chat. The first GET returns exactly 50 rows ordered `pinned desc, updated_at desc`; every conversation older than the 50th most-recently-touched is now permanently absent from the sidebar (and further squeezed if…
  - Fix: Add an onLoadMore/hasMore prop pair to packages/ui/ui/src/sidebar/Sidebar.tsx (trigger on scroll-to-bottom of the session list or a trailing 'Load more' row), then in WebChatPage.tsx and WebAppShell.tsx destructure…
- **Unsent composer draft is discarded on unmount instead of being parked, and even a parked draft does not survive a reload**, `apps/web/features/chat/components/Composer/ChatComposerNew.tsx`
  - Fails: A user types a long reply in conversation A, then clicks a sidebar link to a conversation they have not opened yet this session (or navigates to any other route and back, or hits refresh). The composer unmounts before `conversationId` ever changes on that instance, so `setDraftContent` is never called and the typed…
  - Fix: In ChatComposerNew.tsx, initialize `message` lazily from the store (`useState(() => useChatStore.getState().getDraftContent(conversationId))`) and add an unmount-time park (a cleanup return from the effect at line 2045, or a…
- **Interrupting (stopping) a streaming artifact permanently discards it, no persistence, no trace**, `apps/web/features/chat/hooks/use-streaming-artifact.ts`
  - Fails: A user asks for an HTML/React artifact, watches it stream into the live preview, and clicks Stop partway through (or the connection drops) before the closing ```arrives. ArtifactsPanel.tsx:479 evaluates`artifacts.length === 0 && !streamingArtifact`and falls back to`ArtifactsEmptyState` ('No artifacts yet') even…
  - Fix: In use-streaming-artifact.ts, when `!isStreaming` fires with a still-open `streaming` entry for this messageId, upsert its last content into `useArtifactsStore` (e.g. `addArtifactForMessage`) with a `metadata.interrupted: true` flag…
- **Two near-simultaneous turns on the same conversation can both start a billed cloud-agent run**, `apps/web/app/api/llm/v1/chat/completions/route.ts`
  - Fails: Two POST /v1/chat/completions requests for the same conversationId but different request_id (a double-tap on Send, a client-side retry after a slow response that the client gives up on while the original request is still processing, or two open tabs on the same conversation) both reach beginCloudAgentRun before…
  - Fix: Add a partial unique index in a new migration: `create unique index cloud_agent_runs_one_active_per_conversation on public.cloud_agent_runs(conversation_id) where conversation_id is not null and state in ('running','queued') and…
- **Auto-route continuity policy is fully enabled but structurally unreachable, every turn re-resolves the model from scratch**, `packages/ai/routing/src/auto.ts`
  - Fails: A user on the default Auto mode has a multi-turn conversation. Turn 1 ("hi") classifies to task type/family A and routes to model X, building a prompt cache. Turn 2 ("write a Python function to...") classifies to a different task type/family, which selects a different `preferredSlots` list and lands on model Y.…
  - Fix: In request-processor.ts, read the conversation's last-routed model/task type (already available where the conversation record is loaded) and pass them as `currentModelKey`/`previousTaskType` into `resolveWebCloudModelRoute`'s…
- **US-only routing preference is persisted but has no caller and no effect on actual routing**, `apps/web/app/api/me/routing-preferences/route.ts`
  - Fails: A user (or a future settings toggle) sets `us_only: true` believing it excludes non-US model providers from their chats. The preference round-trips correctly through GET/PUT and shows as saved, but no chat request is ever routed with `usOnly: true`, so the excluded-provider check in `auto.ts` never engages and…
  - Fix: In `request-processor.ts`, read the caller's `profiles.routing_preferences.us_only` alongside the other profile/subscription reads and pass it as `usOnly` into `resolveWebCloudModelRoute`'s `resolveAutoRoute` call; wire a Settings…
- **Custom Style's writing-sample matching is dead: sampleText is captured, stored, and never sent to the model**, `apps/web/features/chat/stores/style-store.ts`
  - Fails: A user pastes a 300-word writing sample into 'Create Custom Style', leaves the auto-filled instruction 'Match the tone, vocabulary, and sentence structure of my writing sample.', names it and saves. Every subsequent turn, useChatStream.ts unshifts exactly that sentence as the system message -- the model is told to…
  - Fix: In getStyleInstruction() (style-store.ts), when style === 'custom' and a matching custom style is found, append its sampleText (when non-empty) to styleText, e.g. build styleText as [custom.instruction, custom.sampleText ? `Writing…
- **Pull-side conversation reconciliation discards concurrent remote edits to every field, not just the locally-dirty one**, `packages/client/sync/src/conversations.ts`
  - Fails: Device A renames conversation c1 and pushes it (server_version -> 9). Device B independently toggles `pinned` on c1 while offline/before its next push (c1 now marked dirty locally, still holding the OLD title and server_version 1). Device B's next pull returns the delta {title:'New from A', pinned:false,…
  - Fix: In applyConversationDeltas (and the identical pattern in applyMemoryDeltas), stop overwriting the whole record with `existing` on a dirty id. Track, per record, the last-synced server snapshot (already available as the pre-mutation…
- **OpenAI billing-exhaustion codes classified as fallbackable quota_exhausted, not billing_exhausted**, `packages/ai/provider-runtime/src/errors.ts`
  - Fails: An OpenAI-backed managed account exhausts its billing (hits its hard monthly spend limit or has $0 balance). OpenAI's API returns HTTP 429 with `error.type: 'insufficient_quota'` (or 'billing_hard_limit_reached'), which is OpenAI's documented out-of-funds/hard-limit signal, not a short, self-resetting rate window.…
  - Fix: In errors.ts, remove 'insufficient_quota' and 'billing_hard_limit_reached' from QUOTA_EXHAUSTED_CODES (keep only 'quota_exceeded' and 'resource_exhausted' there), and check those two codes inside the status===429 branch before…
- **The package's retry engine is never wired into any provider adapter; Google adapter has zero retry of any kind**, `packages/ai/providers/google/src/index.ts`
  - Fails: A user explicitly selects a Gemini model (not Auto, so processed.fallbackModels is empty per managed-failover.ts's documented contract). The Google API returns a single transient failure -- an ECONNRESET, a 503, or a momentary DNS blip. classifyError marks it retryable:true, but nothing in the pipeline ever…
  - Fix: In packages/ai/providers/google/src/index.ts, wrap the `await fetchFn(url, ...)` call (and the res.ok check) with `withRetry` from `@agiworkforce/provider-runtime`, using `createRetryContext({ model: req.model, signal })` and…
- **Fleet-wide usage reset logs $0 cleared due to RETURNING reading post-update values**, `apps/web/features/admin/services/operator-metrics.ts`
  - Fails: An operator runs the fleet-wide 'Reset all usage' action after previewing '2,431 users, $840.12'. The UPDATE really zeroes out $840.12 of consumed credits across 2,431 accounts, but every row inserted into public.credit_transactions for this action carries amount_cents=0, the POST /api/operator response returns…
  - Fix: In apps/web/features/admin/services/operator-metrics.ts, capture the pre-update credits_used_cents before zeroing it, e.g. rewrite resetAllUsersUsage's query as a CTE that selects the old rows (with FOR UPDATE) and joins them into the…
- **A tool 'Blocked' mid-run stays runnable for the rest of a durable AGI Work/cloud-agent turn**, `apps/web/lib/workflows/cloud-agent-workflow.ts`
  - Fails: A user starts an AGI Work / cloud-agent turn where a connector tool (e.g. a Gmail-send or Slack-post MCP tool) is set to 'Always allow'. The task runs long enough to cross more than one workflow invocation slice, trivial to hit, since each `executeCloudAgentWorkflowInvocation` is capped at `maxDurationMs: 210_000`…
  - Fix: In apps/web/lib/workflows/cloud-agent-workflow.ts, import `loadConnectorToolPermissions` from '@/app/api/llm/v1/chat/completions/lib/connector-tool-permissions' and, inside `executeCloudAgentWorkflowInvocation` (which already has `db`…
- **/api/mcp connect-and-discover route is dead, unwired code that also skips the paid-plan connector gate its sibling route enforces**, `apps/web/app/api/mcp/route.ts`
  - Fails: A free-tier user who already has 1 saved connector (their limit) opens devtools, fetches a CSRF token the app already exposes, and POSTs `{serverName, config:{url,transport}}` straight to /api/mcp for as many different HTTPS MCP servers as they want. Each call returns the full tool/resource/prompt catalog (names,…
  - Fix: Delete apps/web/app/api/mcp/route.ts (and apps/web/**tests**/api/mcp.security.test.ts, which only tests this dead route) since nothing in the product calls it and its functionality is already served, correctly gated, by…
- **Any dropped connection (page reload, tab close, brief network loss) silently cancels an in-progress AGI Work run, contradicting the product's own 'Cancelled = you pressed Stop' claim**, `apps/web/app/api/llm/v1/chat/completions/lib/managed-agent-stream.ts`
  - Fails: A user starts an AGI Work mission with several tool steps. While it is actively running a tool call (state 'running', no approval pending), the user's laptop sleeps, WiFi blips, or they simply refresh the browser tab. The completions route's ReadableStream.cancel() fires, the async generator is torn down mid-loop,…
  - Fix: 1) In packages/ui/unified-chat/src/components/tasks/task-display.ts, extend taskStateLabel (or add a sibling helper used by TasksPage.tsx/TaskDetailPanel.tsx) to render 'Cancelled - connection lost' when `run.cancellationRequestedAt` is…
- **Composer wipes the user's message and attachments before the async send/upload settles, losing them on any failure**, `apps/web/features/chat/components/Composer/ChatComposerNew.tsx`
  - Fails: User types a message, attaches a file whose real bytes disagree with its extension (rejected by lib/security/upload-scan.ts's type-confusion check) or hits a transient network error during the presigned PUT, and presses Send. handleSubmit fires onSend and immediately clears the composer (text + attachments).…
  - Fix: In WebChatPage.tsx, change the normal-send branch's `send` callback to return the outcome instead of firing-and-forgetting: `send: () => sendContent(content, { attachments, meta: resolvedMeta }).then(() => undefined).catch(() =>…
- **Cloud Code agent's composed cancellation signal never reaches the sandbox command call**, `apps/web/lib/services/cloud-code-agent-loop.ts`
  - Fails: A Cloud Code turn issues a long-running shell command (a build, test suite, or an accidental `sleep`). The client disconnects, or the per-turn budget timer in withTurnDeadline fires (CLOUD_CODE_AGENT_TURN_BUDGET_MS derived from a 300s function ceiling). controller.abort() fires and input.signal.aborted becomes…
  - Fix: In apps/web/lib/e2b/types.ts, add `signal?: AbortSignal` to E2BExecutor.runCommand's input. In apps/web/lib/e2b/runtime.ts, forward it: `sandbox.commands.run(command, { ...(cwd?{cwd}:{}), timeoutMs, signal })`. In…
- **Ownership transfer is fully built server-side but has no UI caller anywhere in the product**, `apps/web/app/api/settings/organization/transfer-ownership/route.ts`
  - Fails: An organization owner who wants to hand ownership to a co-founder or successor while remaining in the workspace (e.g. stepping down to admin) has no button anywhere in the product to do it. The only ownership-changing path exposed in the UI is the 'Leave workspace' flow in TeamSection.tsx (lines ~975-1019), which…
  - Fix: In apps/web/features/settings/hooks/use-settings-queries.ts add a `useTransferOwnership` mutation that POSTs { organizationId, toUserId, outgoingOwnerRole } to /api/settings/organization/transfer-ownership, and in…
- **Deleting a directory-sync connection cascades away SCIM records but never revokes the org membership or credentials it granted**, `apps/web/app/api/admin/directory-sync/route.ts`
  - Fails: An org admin (role 'admin' or 'owner' both pass requireDirectorySyncAdmin) clicks 'Remove' on a directory-sync connection in the admin UI (DirectorySyncAdminPage.tsx line 337, which calls DELETE with no confirmation dialog at all). Every SCIM-provisioned user record for that connection disappears, but every one of…
  - Fix: In apps/web/app/api/admin/directory-sync/route.ts DELETE, before deleting the connection row, query `scim_provisioned_users` for `connection_id = $1 and organization_id = $2 and linked_user_id is not null`, and for each linked_user_id…
- **"Never remember" exclusion terms only enforced for auto-captured memories, not manual creates or cross-device sync**, `apps/web/app/api/memory/route.ts`
  - Fails: A user adds 'salary' to Never Remember. They then type 'My salary is $150k' directly into Settings > Memory > Add a new fact (or it arrives via a desktop/mobile sync push). POST /api/memory (or POST /api/memory/sync) saves it unfiltered; it is immediately eligible for loadManagedMemoryContext and gets injected into…
  - Fix: In handleCreateMemory (apps/web/app/api/memory/route.ts), after trimming body.content, call loadMemoryExclusions(db, { userId }) and reject with createError.validation when isMemoryExcluded(trimmed, exclusions) is true (both already…
- **Debounced settings autosave is silently dropped when the user switches settings tabs or closes the modal**, `apps/web/features/settings/sections/GeneralSection.tsx`
  - Fails: User edits their custom instructions or picks a response-style trait in General settings, then within 400ms clicks another settings section (e.g. Account) or closes the settings modal, both ordinary interactions. The pending setTimeout is cleared before it fires, `savePreferenceNamespace` for the…
  - Fix: In GeneralSection.tsx, replace the plain `clearTimeout` cleanup with one that flushes: on unmount, if `dirtyRef.current` is true, cancel the timer and synchronously fire `savePreferenceNamespace` with the latest values (read from refs,…
- **Live-agent chat messaging is fully unwired in the UI on both sides**, `apps/web/features/support/components/SupportHandoffPanel.tsx`
  - Fails: A live handoff session reaches status='connected' (an agent claimed it via direct API call, e.g. curl). The widget tells the user "They can see the whole conversation, so start wherever you like," but the only composer on screen still posts to /api/support/ask (the bot), so nothing the user types ever reaches the…
  - Fix: Add a message-thread view to SupportHandoffPanel.tsx's 'connected' branch that polls GET /api/support/handoff/{sessionId}/messages on the existing pollIntervalMs cadence and posts via POST .../messages from a dedicated input (not the…
- **Consent Centre analytics withdrawal never reaches the analytics gate**, `apps/web/app/privacy/requests/ConsentCentre.tsx`
  - Fails: A user accepts the cookie banner (writes {analytics:true} to localStorage, GA4 loads on every page via AnalyticsConsentGate). They later sign in, open /privacy/requests, and click 'Withdraw consent' on 'Allow aggregated usage analytics' (purpose id 'product_analytics', the same purpose the consent-purposes.ts…
  - Fix: In ConsentCentre.tsx's decide(), when purpose === ANALYTICS_CONSENT_PURPOSE ('product_analytics') from shared/lib/cookie-consent.ts, after the POST succeeds also call writeCookiePreferences({ necessary: true, analytics: granted })…
- **Self-leave never deprovisions the departing member, shared connectors and live credentials stay usable by the org**, `apps/web/app/api/settings/organization/leave/route.ts`
  - Fails: A member shares a personal connector (e.g. a custom MCP server backed by their own API token) with the org via POST /api/settings/organization/shared/connectors/[connectorId], then later voluntarily leaves via DELETE /api/settings/organization/leave (the 'Leave workspace' button in TeamSection.tsx). Their…
  - Fix: In apps/web/app/api/settings/organization/leave/route.ts, import deprovisionMember from '@/lib/services/deprovision-service' and clerkClient from '@clerk/nextjs/server'. After `const result = await leaveOrganization(db, {...})`…
- **Takedown control and privacy erasure/request queue are fully built server-side but have zero UI, one panel even tells the admin to use a control that doesn't exist**, `apps/web/features/admin/components/ContentReportQueuePanel.tsx`
  - Fails: A trust-and-safety admin reviews a copyright/DMCA content report in the queue, reads the panel's own instruction to "use the takedown control with the share link," and there is no such control anywhere in the product, the only way to actually unpublish the reported content is to hand-craft an authenticated HTTP…
  - Fix: In apps/web/features/admin/components/, add a TakedownPanel (token/URL lookup via GET /api/admin/takedown, confirm, then POST) and a PrivacyRequestsPanel (list GET /api/admin/privacy/requests, plus a form for POST…
- **Stale credit-reservation recovery is starved by a daily cron when the design requires per-minute cadence**, `vercel.json`
  - Fails: A managed usage request (an in-flight AI turn) is killed mid-flight -- serverless timeout, provider disconnect, deploy, crash -- while its credit reservation sits in `reserving`/`reserved`/`provider_started` with a short lease (`lease_expires_at`). The one function that releases such a leaked reservation,…
  - Fix: In vercel.json, change the `/api/cron/reconcile-credits` cron schedule from `30 0 * * *` to a sub-hourly expression such as `*/5 * * * *`, matching the cadence the migration's comment documents and that…
- **The only automated outage-paging cron runs once a day, leaving a ~24h blind spot**, `vercel.json`
  - Fails: The database or Stripe goes unavailable at 07:00, right after the 06:15 probe reported healthy. runHealthChecks() would mark the platform 'unhealthy' and pageOnCall()/sendSupportEmail() would fire -- but nothing invokes runHealthChecks() again until 06:15 the next day, so a total platform outage that starts minutes…
  - Fix: In vercel.json, change the `/api/cron/health-probe` cron schedule from `15 6 * * *` to a frequent cadence such as `*/5 * * * *`, so a critical outage is paged within minutes instead of up to a day later.
- **app/api/download/route.ts defaults the standard-desktop GitHub repo to a name that disagrees with every other release route**, `apps/web/app/api/download/route.ts`
  - Fails: With `DESKTOP_GITHUB_REPO` unset (the variable is only a 'warning'-tier var in lib/validate-env.ts, not required), a user opens /download. DesktopDownloadAvailability.tsx calls GET /api/releases/latest/linux-x86_64, which queries repo `siddharthanagula3/agiworkforce` (the correct/canonical repo) and finds a signed…
  - Fix: In apps/web/app/api/download/route.ts, delete the local REPO_OWNER/REPO_NAME constants and call `resolveDesktopReleaseRepository()` from '@/lib/releases/github-desktop-releases' to get `{ owner, repo }` for the non-cloud…
- **pr_review_enabled has no writer anywhere in the app, the entire PR-review webhook pipeline is permanently dead**, `apps/web/app/api/github/webhook/route.ts`
  - Fails: A user connects GitHub, completes OAuth ownership verification, and mentions "@agi-workforce" on a PR, exactly the flow the connector catalog advertises (`capabilitySummary: 'pull request diffs, issue comments, and PR reviews'` in features/connectors/data/connectors.ts). The webhook fires, finds the installation…
  - Fix: Add a PATCH handler to apps/web/app/api/github/installations/route.ts that updates `pr_review_enabled` (and optionally `review_model`) on github_installations scoped by `installation_id` and `user_id`, guarded the same way DELETE is…
- **Disconnecting GitHub only deletes AGI's own DB row, the GitHub App installation itself is never revoked**, `apps/web/app/api/github/installations/route.ts`
  - Fails: A user clicks "Disconnect" on the GitHub row in Settings. The row disappears and the UI reports GitHub as not connected. On GitHub's side, the App installation is untouched: it still holds whatever repo/org permissions were granted (contents, pull requests, issues, etc.), still appears installed in the user's…
  - Fix: In the DELETE handler (installations/route.ts), before deleting the row, call `DELETE https://api.github.com/app/installations/{installationId}` using a JWT from `getGitHubAppJwt()` in lib/github-app.ts (treat a 404 as…
- **DialogContent clips dialog body with no scroll path on short/mobile viewports**, `apps/web/features/chat/components/dialogs/KeyboardShortcutsDialog.tsx`
  - Fails: On a viewport under roughly 700-750px tall (e.g. 375x667 iPhone SE, or any short browser window/split-screen), opening Keyboard Shortcuts stacks a DialogHeader + 4 category groups (8 shortcut rows, headers, separators) + a tip box, roughly 850-900px of content, inside a DialogContent capped at…
  - Fix: In KeyboardShortcutsDialog.tsx, wrap the shortcuts list and tip content (current direct DialogContent children after DialogHeader) in a single scrollable div, e.g. change DialogContent to className="flex max-h-[85vh] flex-col…
- **Image generation route echoes raw upstream provider error text straight into the chat UI, bypassing the app's own error classification**, `apps/web/app/api/media/image/generate/route.ts`
  - Fails: A user asks for an image edit with an unsupported combination (e.g. an aspect ratio OpenAI's gpt-image API rejects for that operation, or an org that hasn't completed API verification for that model). OpenAI/Google returns a 400 with an internal-sounding message such as "Your organization must be verified to use…
  - Fix: In apps/web/app/api/media/image/generate/route.ts, change the default assignment at line 1449 from `let friendlyMessage = `Provider ${provider} failed: ${errorMessage}`;` to a generic non-provider-naming fallback, e.g. `let…
- **SURFACE_STATUS.cli still says "Coming soon" although the CLI has shipped and is live-downloadable**, `apps/web/lib/marketing-constants.ts`
  - Fails: A visitor loads the homepage; the AGI CLI card reads 'macOS · Linux · Windows' with a 'Coming soon' badge, so they leave thinking no CLI exists yet, while /download#cli-downloads (one click away, and the exact page app/cli/page.tsx's own CTA points to) is already serving five real, signed, cosign-verifiable…
  - Fix: In lib/marketing-constants.ts, change `cli: COMING_SOON_LABEL` to a real shipped-status string built the same way `desktop: 'Linux assets · v1.2.0'` is (e.g. reflect the live v-cli- release: 'macOS, Linux & Windows archives · v1.0.0').…

### Medium (54)

- **Global search has no request cancellation, a slow, older keystroke's response can overwrite a newer/cleared query's state**, `apps/web/features/chat/components/dialogs/GlobalSearchDialog.tsx`
  - Fails: User types "invoice" (fetch A starts), then clears the box to empty before A resolves. The `query.trim()===''` branch of the debounce effect (line 145-149) immediately runs `setResults([]); setStats(null)`, switching the panel to the "Start typing to search" / recent-searches view. Fetch A then resolves and…
  - Fix: In global-search-service.ts, add an optional `signal?: AbortSignal` parameter to `search()` and pass it into the `fetch(...)` call at line 139. In GlobalSearchDialog.tsx, hold an AbortController in a ref, call `.abort()` on it at the…
- **Autotag API surface (classify/batch/conversations) has no caller anywhere in the web app**, `apps/web/app/api/autotag/classify/route.ts`
  - Fails: A user can never see a conversation's auto-classified topic tag or filter their conversation list by tag in the web app: the full stack (auth, CSRF, rate limiting, per-org tenant scoping, `conversation_tags` persistence) is implemented and unit-tested, but zero UI path triggers classification, batch tag lookup, or…
  - Fix: Either wire a UI consumer (e.g. call `POST /api/autotag/classify` after a conversation's first exchange and render the tag via `getConversationTopicPresentation` in ConversationListItem, and call `/api/autotag/conversations` from a…
- **In-transcript message search jumps to the wrong row (off-by-one against the virtualized list)**, `apps/web/features/chat/components/messages/ChatMessageList.tsx`
  - Fails: User opens search (Cmd/Ctrl+F) in a conversation, types a query that matches an early message, and presses Enter or clicks the next/prev arrows. `goToMatch(0)` calls `scrollToRow({ index: 0 })`, which scrolls to the bare top-spacer placeholder row (no message content at all) instead of the first matching message.…
  - Fix: In apps/web/features/chat/components/messages/ChatMessageList.tsx, change goToMatch's scrollToRow call to target `index: rowIndex + 1` (or store `index + 1` when building `searchMatches`), matching the +1 top-spacer offset…
- **Duplicate project drops icon, accent color, provider mode, allowed surfaces, and default model even though those are persisted, user-settable fields**, `apps/web/app/api/projects/[id]/duplicate/route.ts`
  - Fails: A user sets a project's default model to a specific pinned model and picks an accent color/icon via a non-web surface (mobile/desktop, or a future web control), then clicks Duplicate in the web ProjectSettingsDialog. The new project silently reverts to the default model, no icon, no accent color, and ManagedGateway…
  - Fix: In apps/web/app/api/projects/[id]/duplicate/route.ts, extend the INSERT's column list and values to also copy source['icon_emoji'], source['accent_color'], source['default_provider_mode'], source['allowed_surfaces'], and…
- **Web projects list is fetched once with limit:100 and never paginates, silently hiding projects beyond the 100 most recently updated for unlimited-tier accounts**, `apps/web/features/projects/hooks/use-managed-cloud-projects.ts`
  - Fails: An account on an unlimited-projects tier creates 130 projects over time. On /chat/projects, only the 100 most recently updated (order by updated_at desc, route.ts:63) ever load; the other 30 are not shown, there is no 'load more' control, no count of total projects, and no search -- those projects are effectively…
  - Fix: In apps/web/features/projects/hooks/use-managed-cloud-projects.ts, have hydrateManagedCloudProjectStore (or the hook) loop `listProjects({ limit: 100, offset })` accumulating pages until a page returns fewer than 100 projects, or add a…
- **Dead ConversationListItem component duplicates the live sidebar's conversation-row behavior and is never rendered**, the since-deleted apps/web/features/chat/components/Sidebar/ConversationListItem.tsx (RESOLVED: removed in f829e76c8.)
  - Fails: A future change to conversation-row behavior (e.g. a new bulk action, a fixed authz check, an accessibility fix) applied to ConversationListItem.tsx has no effect on the product, since nothing renders it, the file only exists to be discovered, half-trusted, and edited by mistake in place of the actual live component.
  - Fix: Delete apps/web/features/chat/components/Sidebar/ConversationListItem.tsx and its re-export in apps/web/features/chat/components/Sidebar/index.ts (and the matching **tests** file), since the shared @agiworkforce/ui <Sidebar> is the sole…
- **Publish always uploads the current/latest artifact content, silently ignoring the older version the user is viewing**, `apps/web/features/chat/components/artifacts/ArtifactsPanel.tsx`
  - Fails: A user pages back through an artifact's version history with the `<` chip (viewing 'v1/3' on screen, code and preview both showing the old revision), then clicks Publish intending to share what's on screen. The service actually POSTs the latest v3 content to `/api/artifacts/publish`; the user gets a 'Published'…
  - Fix: Change the `publishArtifact` prop type to `(content: string) => Promise<PublishResult>`, have `ArtifactPreview.handlePublish` pass `activeContent`, and have `makePublishHandler` in ArtifactsPanel.tsx build the…
- **Artifact cloud-sync conflicts are resolved silently in the server's favor with no user notification, and the losing local edit is never retried**, `apps/web/features/chat/stores/artifacts-store.ts`
  - Fails: The same account is open on two devices (or two tabs); both hold an artifact and one restores/edits it first and syncs. The second device's next sync push for its own edit is rejected as a conflict: the small sync indicator keeps reading 'Synced', the artifact tab/list quietly starts showing the other device's…
  - Fix: In artifacts-store.ts, extend `cloudSyncStatus`/`cloudSyncError` (or add a per-artifact `conflictedIds` set) so `applyArtifactPushResult`'s conflict branch records which artifact ids lost a push, and surface that in ArtifactsPanel.tsx…
- **Deleting/restoring an item before paging forward silently skips one Library item**, `packages/ui/unified-chat/src/components/library/LibraryView.tsx`
  - Fails: A user has 30 generated files. They load the first page (offset 0, limit 24, next_offset=24), delete file #5 (soft delete succeeds), then click 'Show more'. The client requests offset=24 again, but the underlying ordered set now has only 29 non-deleted rows, so what used to be row #25 has shifted to position #24…
  - Fix: In each of the three setPage calls in packages/ui/unified-chat/src/components/library/LibraryView.tsx (handleDelete line 389, handleRestore line 365, handlePermanentDelete line 414), also decrement the tracked offset: `nextOffset:…
- **Lease-expiry cleanup finalizes a schedule run as timed out without ever notifying the user**, `apps/web/lib/services/schedule-service.ts`
  - Fails: A scheduled run's Node process is killed mid-execution (function OOM, deploy restart, an uncaught exception outside the try/catch in runClaimedSchedule/executeScheduledAgent, or the run simply outlives its 45s DB lease because a wave was cut short by the 55s sweep budget). The run row is left status='running' with…
  - Fix: In apps/web/lib/services/schedule-service.ts, inside processDueScheduleRuns()'s expired.map(...) block (around line 1205-1213), after finalizeScheduleRun resolves call `await announceScheduleRun(claim, 'timeout')` for that claim,…
- **Share-payload path-redaction targets a field shape that is never populated, so tool-call local-path scrubbing is dead and bypassable**, `apps/web/app/api/share/route.ts`
  - Fails: An authenticated user (or any client scripting the documented POST /api/share body) includes `tool_calls: [{ tool_name: 'bash', display_args: '/Users/alice/Documents/taxes/return.pdf' }]` in a message. sanitizeMessages() only ever inspects the non-existent top-level `msg['display_args']`, so the nested value passes…
  - Fix: In app/api/share/route.ts, change sanitizeMessages() to also map over `msg['tool_calls']` (when it is an array) and apply the same local-path regex to each entry's `display_args` string, producing a new `tool_calls` array in the…
- **No way to cancel a running command or in-flight agent turn from the UI**, `apps/web/features/code/CloudCodePage.tsx`
  - Fails: A user starts an agent turn with a bad or expensive goal (e.g. one that triggers a long build/test loop). The turn can legitimately run for up to 300 seconds (agent/route.ts:42) or a command up to CLOUD_CODE_COMMAND_DEADLINE_MS. The only UI control available while it runs is 'Close session', which force-kills the…
  - Fix: In CloudCodePage.tsx, create an AbortController before calling api.run/api.startAgentTurn/api.decideApproval, store it in a ref, pass its signal through, and render a Cancel button next to the running/agent-busy spinner that calls…
- **Session-busy race leaves a cloud_code_agent_turns row stuck at state='running' forever**, `apps/web/lib/services/cloud-code-agent-service.ts`
  - Fails: Two requests race on the same Code session (e.g. two browser tabs, or an approval decision submitted at the same moment a fresh agent turn starts): one wins claimCloudCodeSessionForRun and runs; the other's turn row was already written as `state='running'` (by the insert in startCloudCodeAgentTurn, or the UPDATE in…
  - Fix: In executePersistedAgentTurn, when claimCloudCodeSessionForRun returns null, update the turn row to state='failed' (with stop_reason='error' and an explanatory error_message) scoped by turnId+userId before throwing…
- **Public model catalog endpoint returns deprecated/coming-soon models with no field to distinguish them, unlike the sibling models endpoint**, `apps/web/app/api/models/route.ts`
  - Fails: Any caller of the public, unauthenticated `GET /api/models` (external integrator, or the repo's own e2e test at `apps/web/e2e/enterprise-enforcement.spec.ts:199` which picks an arbitrary id from this list) can receive a `coming_soon` catalog entry, with full pricing/capability data and no…
  - Fix: In `apps/web/app/api/models/route.ts`, filter `listCanonicalModels()` to `isModelLive(model)` (from `@agiworkforce/types`, model-catalog.ts:1401-1403) before mapping, matching what `getPickerModelsForRuntimeProfile` already does for the…
- **Settings > Sync page hardcodes 'Live' status pills disconnected from the app's actual sync health**, `apps/web/app/settings/sync/page.tsx`
  - Fails: A user's cloud sync starts failing repeatedly (expired auth, network partition, server 5xx) so `cloudSyncStatus` sits at 'error' with exponential backoff. The user, suspicious their chat history isn't syncing across devices, opens Settings > Sync specifically to check, the only page whose stated purpose is showing…
  - Fix: Convert apps/web/app/settings/sync/page.tsx to a client component that reads `cloudSyncStatus`/`cloudSyncError` from `useArtifactsStore` (already exported and consumed by ArtifactsPanel.tsx) and derive each pill's label/color from that…
- **Cloud artifact sync resets to cursor 0 and wipes the artifact store on every conversation navigation**, `apps/web/features/chat/hooks/use-artifact-cloud-sync.ts`
  - Fails: A user with an account-wide artifact history switches from conversation A to conversation B. WebChatPage unmounts and remounts: `clearCloudArtifacts()` empties the entire cross-device Artifacts gallery (which, per index-artifacts.ts's own docstring, is meant to be account-wide, not per-conversation), then the hook…
  - Fix: Move the sync loop (cursor state, interval, and cloud-artifact cache) out of a per-page-mounted hook and into a module-level/provider-scoped owner that persists across `[sessionId]` navigations (e.g. hosted in ChatStreamRuntimeProvider…
- **BYOK env-key status list shows every provider as "Not set" when the status fetch fails**, `apps/web/app/settings/byok/EnvKeyStatusList.tsx`
  - Fails: The env-key-status route can legitimately return non-200 (e.g. the rate limiter's 429, proven reachable by apps/web/**tests**/api/byok-env-key-status.security.test.ts:320-330) or the fetch can hit a transient network error. When that happens, EnvKeyStatusList's catch swallows it, `statuses` stays an empty Map, and…
  - Fix: In EnvKeyStatusList.tsx, add a `hasError` state set to `true` in the catch block (and cleared at the start of each fetch attempt); in the row render, when `hasError` is true, render a distinct 'Couldn't check' badge (not `StatusBadge`)…
- **The BYOK settings page and its provider-test endpoint are unreachable from the product**, `apps/web/features/settings/lib/web-settings-sections.ts`
  - Fails: A self-hosted operator sets ANTHROPIC_API_KEY and opens Settings looking for the BYOK status the /byok marketing page promises ('The settings screen reports whether a variable is present'). Nothing in the Settings modal navigation (WebSettingsModal) links to it, so unless they already know to type /settings/byok…
  - Fix: Add a web-visible 'byok' key to WEB_SETTINGS_CONTENT_SECTIONS in apps/web/features/settings/lib/web-settings-sections.ts and register it in WebSettingsModal.tsx's sectionContent map pointing at the existing…
- **Goodwill credit grant skips the styled destructive-action confirmation used for every other billing mutation**, `apps/web/features/admin/pages/OperatorDashboardPage.tsx`
  - Fails: An operator clicks 'Grant credit', the amount prompt defaults to '10', they meant to type 100 but a stray keystroke or muscle memory submits the default, and the grant lands with zero severity-styled confirmation step to catch the mistake before the POST fires, unlike resetUsage, which would have shown a styled…
  - Fix: In apps/web/features/admin/pages/OperatorDashboardPage.tsx, after computing `dollars` and `reason` in grantCredits, call `confirmDestructive({ title: 'Grant credit to ' + label + '?', description: 'This adds ' +…
- **ToolTimeline's memo comparator drops statusPhrase, so live status text freezes during a running tool call**, `apps/web/features/chat/components/messages/ToolTimeline.tsx`
  - Fails: An MCP tool call stays in status 'running' across two or more x_tool_status SSE events that only change status_phrase (e.g. "Reading page 1…" then "Reading page 2…"), with args/parallelGroup/error/result/requiresApproval/toolCallId unchanged in between. The outer MessageBubble/ChatMessageList re-renders correctly…
  - Fix: In apps/web/features/chat/components/messages/ToolTimeline.tsx, add `p.statusPhrase !== n.statusPhrase` to the per-tool field comparison inside the `MemoizedToolTimeline` comparator (alongside the existing `p.result !== n.result` etc.…
- **A failed tool-approval resume leaves cloudApproval metadata stale, silently emptying the Approvals inbox for a still-pending request**, `apps/web/lib/hooks/useChatStream.ts`
  - Fails: User has one pending tool approval, clicks Approve/Reject, and the resume POST to /api/llm/v1/chat/completions/approve fails (500, quota, transient network error, any non-ok response). The tool card correctly reverts to 'awaiting_approval' inline in the conversation, but the ApprovalInbox popover (badge + list,…
  - Fix: In apps/web/lib/hooks/useChatStream.ts, inside the ChatApiError branch of useResolveToolApproval's catch block (around line 2465), before returning: clear the decisions for calls reset in the loop…
- **Org connector policy is never checked before a member connects, authorizes, or creates a connector, only when tools are later read for a chat turn**, `apps/web/app/api/connectors/custom/route.ts`
  - Fails: An org admin sets allowCustomConnectors=false in Workspace > Connectors ('Switching this off blocks all of them' per the UI copy at WorkspaceConnectorPolicy.tsx:147-150), or blocks a specific catalog connector (e.g. 'notion') via blockedConnectors. A member still POSTs to /api/connectors/custom with an arbitrary…
  - Fix: In app/api/connectors/custom/route.ts handlePost, after resolving the subscription/db, resolve the caller's organizationId and call the same evaluateConnectorAccess({..., isCustom: true}) check used in lib/user-connector-tools.ts before…
- **Two full voice-recording implementations are exported but never wired to any route**, the since-deleted apps/web/features/chat/hooks/use-voice-recording.ts (RESOLVED: removed in f829e76c8.)
  - Fails: An engineer fixing a voice bug (permission handling, pause/resume, cleanup) naturally opens features/chat/hooks/use-voice-recording.ts or features/chat/components/VoiceInputButton.tsx per this task's own SCOPE listing, ships a fix there, and nothing changes in the product because neither file is on the render path…
  - Fix: Delete features/chat/hooks/use-voice-recording.ts and features/chat/components/VoiceInputButton.tsx along with their exports in features/chat/hooks/index.ts and features/chat/components/index.ts; keep only the…
- **'Archived' is a fully modeled task state (schema, filter, badge color, marketing copy) with zero code path anywhere that ever sets it**, `packages/ui/unified-chat/src/components/tasks/task-display.ts`
  - Fails: A user reads the AGI Work page's promise that they can archive old runs to declutter their Active list, or simply expects the 'All' vs 'Active' filter split to be meaningful. No control anywhere in the product ever produces an archived run, so the filter distinction and the documented row are permanently inert --…
  - Fix: Add `archiveCloudAgentRun(db, { userId, runId })` to apps/web/lib/services/cloud-agent-run-service.ts (parallel to requestCloudAgentRunCancellation, restricted to TERMINAL_STATES rows), wire it into a new authenticated+CSRF-checked…
- **TaskDetailPanel's full-screen mobile overlay has no dialog semantics, focus trap, or Escape-to-close, unlike the sibling WorkSessionPanel in the same codebase**, `packages/ui/unified-chat/src/components/tasks/TaskDetailPanel.tsx`
  - Fails: A screen-reader or keyboard-only user on a narrow viewport opens a task's detail panel from /tasks. It is announced as a generic labeled region, not a dialog; there is no way to close it with Escape; tabbing is not confined to the panel even though it visually covers everything else; and the previously focused…
  - Fix: In TaskDetailPanel.tsx, add `role="dialog"` and `aria-modal="true"` to the `<aside>` at line 308-310, import `useEffect`/`useRef` from 'react', add a `closeButtonRef` on the close Button (line ~349-357) with a `useEffect` that focuses…
- **Installed-plugin panels show "Enabled" even after the plugin is deprecated and server-gated off**, `apps/web/features/settings/components/WebSettingsModal.tsx`
  - Fails: A user installs and enables a web-installable pack (e.g. research-pack). An operator later deprecates it with a migration that (per the `plugin_registry_entries_web_pack_is_embedded` CHECK in db/neon/0109_web_plugin_installations.sql, which forbids `web_installable=true` on any non-`published` row) must set both…
  - Fix: In WebSettingsModal.tsx's `loadPlugins` mapping (around line 880), add `live: plugin.status === 'published' && plugin.webInstallable` to each installed entry (reusing the same rule as `isPluginEntryWebInstallable`). Add `live?: boolean`…
- **Plugin install/uninstall/enable-toggle write path (the actual installations capability) has zero test coverage**, `apps/web/lib/services/plugin-installation-service.ts`
  - Fails: Nothing in CI would catch a regression in the untested functions today. For example, `setWebPluginEnabled`'s isolation currently rests entirely on its own `where user_id = $1 and plugin_id = $2` clause (plugin-installation-service.ts:76-77) rather than RLS, because these routes use `getNeonDb()`, the…
  - Fix: Add cases to plugin-installation-service.test.ts for installWebPlugin (returns null for a non-web-installable or missing plugin id; upserts installed_version and forces enabled=true on a re-install), setWebPluginEnabled and…
- **Generated-file harvest silently drops files beyond the per-turn cap without counting them as failed**, `apps/web/lib/e2b/generated-files.ts`
  - Fails: A sandbox execution turn (e.g. a data-processing script) writes 12 new output files. Only files[0..7] are attempted; suppose 2 of those fail persistence (failedCount becomes 2). The 4 files beyond the MAX_FILES_PER_TURN=8 cap are dropped with zero accounting, not attached, not counted. tool-loop.ts's…
  - Fix: In apps/web/lib/e2b/generated-files.ts, seed the counter with the dropped total when capping: replace `let failedCount = 0;` with `let failedCount = Math.max(0, changed.length - MAX_FILES_PER_TURN);` right after the existing `if…
- **Deep-research url_fetch calls never receive the client's AbortSignal, so cancel doesn't stop an in-flight fetch**, `apps/web/app/api/llm/v1/chat/completions/lib/research-loop.ts`
  - Fails: User starts a Deep Research run; a gathering round issues a url_fetch on a slow page; user clicks Stop. `flushCancellationIfRequested()` is only checked before/after each fetch call (research-loop.ts:1206, 1249, 1372 etc.), so the in-flight `await executeUrlFetch(...)` keeps running, the outbound connection stays…
  - Fix: In research-loop.ts, change the call at line 1226 to `const outcome = await executeUrlFetch(call.args, { maxContentChars: RESEARCH_FETCH_MAX_CONTENT_CHARS, signal: options.signal });` so the same AbortSignal that already cancels…
- **SourceAggregator never upgrades a URL-fallback citation title to the real page title from a later url_fetch**, `apps/web/app/api/llm/v1/chat/completions/lib/research-loop.ts`
  - Fails: A gathering round's provider-native search returns a result whose title is blank (common for some search backends/redirect links), so `sources.add({ url, title: '' })` stores the raw URL as the display title. A later round calls url_fetch on that same URL (the tool's own description tells the model to do exactly…
  - Fix: In research-loop.ts, change line 476 to detect the URL-fallback case explicitly, e.g. `if ((!existing.title || existing.title === existing.url) && typeof entry.title === 'string' && entry.title) existing.title = entry.title;` so a later…
- **Web Push deep link to a specific run is dead, the client never reads the `run` query param the service worker builds**, `apps/web/public/sw.js`
  - Fails: A user gets a push notification 'Agent run finished' / 'Approval needed' while the AGI tab is closed, clicks it, and is taken to `/tasks?run=<id>`. The Tasks page renders its default 'Active' filtered list with no run selected/opened/scrolled-to, the user must manually scan the list (which is paginated 25 at a…
  - Fix: In apps/web/features/tasks/components/TasksPage.tsx, read `useSearchParams().get('run')` and pass it as an `initialRunId` prop to `SharedTasksPage`; in packages/ui/unified-chat/src/components/tasks/TasksPage.tsx, accept that prop and…
- **In-app notification store (read/unread, persistent, actionable) has zero UI consumers, alerts written to it, including a billing block, are never shown**, `apps/web/shared/stores/notification-store.ts`
  - Fails: A user on a plan-gated feature hits a 402. They see a one-line toast ('Payment required - please upgrade your plan') that auto-dismisses; the richer 'Upgrade Required' notification with the Upgrade Now button that the code explicitly built for this moment is written to a store no component ever mounts, so it is…
  - Fix: Either add a notification-bell UI (e.g. in shared/components/layout/Header.tsx or WebAppShell.tsx) that renders `useNotifications()`/`useUnreadCount()`/`useNotificationUIState()` and wires…
- **Clarify card's Send/Skip buttons give no busy state while the response request is in flight**, `apps/web/features/chat/components/messages/cards/ClarifyCard.tsx`
  - Fails: A user answers the clarifying question and clicks 'Send answers'. For the whole round trip to POST /api/interactive-cards/respond (network + DB read/write), the button stays fully clickable with no spinner, disabled state, or aria-busy, visually indistinguishable from before the click. A user who does not see…
  - Fix: Change `onRespond` in InteractiveCardBlock.tsx (SingleCard, around line 93) to return the promise from `respondToInteractiveCard` instead of discarding it with `void`, and in ClarifyCard.tsx add a local `submitting` state that…
- **Releasing a legal hold skips the confirmation pattern used for every other consequential action in the same console**, `apps/web/features/workspace-console/components/WorkspaceDataControls.tsx`
  - Fails: An admin scanning the legal-hold list misclicks 'Release hold' on an active hold. The hold is released with no confirmation. WorkspaceDataControls.tsx's own copy states the stakes: 'A hold suspends retention for its subject. Held conversations survive the sweep however old they are.' Once released, the next…
  - Fix: In WorkspaceDataControls.tsx, replace the direct `onRelease` call with a pending-confirmation state (mirroring TeamSection.tsx's `pendingAction` + AlertDialog) so 'Release hold' opens a confirm dialog naming the hold and its subject…
- **user_memories.pinned is fully modeled end to end but has no UI control anywhere**, `packages/ui/unified-chat/src/components/MemoryEditor.tsx`
  - Fails: A user cannot pin an important fact from the web app in any way. Even a fact the sync protocol or another client marked pinned displays identically to every other fact in the list, the ordering priority the backend computes is invisible and unreachable from the UI.
  - Fix: Add pinned to MemoryFact in packages/ui/unified-chat/src/stores/memoryStore.ts, populate it in hydrateFromServer's merge, add a togglePin(id) action that calls PUT /api/memory/{id} with { pinned: !current }, and render a pin toggle…
- **/session-expired recovery page is fully unreachable dead code**, `apps/web/app/session-expired/page.tsx`
  - Fails: The dedicated 'Your session expired' recovery screen (with its own explanation copy and a hardened same-origin redirectTo sanitizer in SessionExpiredActions.tsx) never renders for any real user in any flow -- a user whose session actually expires is either silently redirected to /login by the middleware or shown a…
  - Fix: Either wire an actual caller to it -- e.g. have proxy.ts's buildSignedOutRedirect distinguish 'no cookie ever' from 'cookie present but rejected by clerkAwareProxy' and send the latter to /session-expired instead of /login, or have…
- **Account-wide quota/credit-exhaustion errors render as a one-off inline chat turn instead of a composer-attached banner**, `apps/web/features/chat/components/messages/ChatMessageList.tsx`
  - Fails: A user on a paid plan exhausts their rolling 5-hour or billing-period credit budget. The chat shows a card replacing that one assistant turn, explaining the block, but nothing is attached to the composer. The user scrolls past it (or it scrolls out of view as the conversation continues), sees an empty composer…
  - Fix: In lib/hooks/useChatStream.ts, when `resolveQuotaPaywallSlot` resolves for scope kinds that are account-wide (billing_period/rolling_window/rate_limit), write the result into a composer-level store (e.g. useBillingStore) instead of…
- **Stale-reservation recovery cron runs once a day though the mechanism was designed to run every minute, leaving interrupted turns falsely counted against a user's rolling quota for up to 24 hours**, `vercel.json`
  - Fails: A user's turn is interrupted before `finalizeManagedUsageRequest` runs, client disconnects, function timeout, unhandled exception between reserve and finalize. The reservation's deduction transaction stays counted in `getRollingUsage`'s 5-hour/7-day sums. Every further send in that window re-checks the same…
  - Fix: In vercel.json, change the `/api/cron/reconcile-credits` cron entry's `schedule` from `30 0 * * *` to a sub-hourly cadence (e.g. `*/5 * * * *`), matching the cadence assumption baked into `recover_stale_managed_usage_requests` and…
- **Namespace-scoped settings PUT has no concurrency check, so two tabs/devices editing the same namespace silently lose one edit**, `apps/web/app/api/settings/preferences/route.ts`
  - Fails: A user has Settings > General (or Notifications, Privacy, etc.) open in two browser tabs (or two devices) signed into the same account. Tab A changes one field and its debounced/explicit save fires. Tab B, still holding the pre-change snapshot, later changes a different field in the same namespace and saves its own…
  - Fix: In route.ts's handlePut, thread a `baseVersion`/`server_version` (as sync/route.ts already does) through the namespace PUT and reject with the current value on mismatch instead of unconditionally overwriting; or change the client…
- **Enabling 2FA and regenerating backup codes are never written to the audit log**, `apps/web/app/api/settings/2fa/verify/route.ts`
  - Fails: A user (or an attacker who has taken over the account and enrolls their own authenticator, or strips backup codes by regenerating them) enables 2FA or regenerates backup codes; the account's own audit trail, the thing an owner or admin would review to detect account takeover, shows nothing for either action,…
  - Fix: Add `'two_factor_enabled'` and `'backup_codes_regenerated'` to `AuditEventType` in lib/security-audit.ts, add matching cases in `inferResourceType`, and call `recordAuditEvent({ userId, eventType: 'two_factor_enabled', request, detail:…
- **Account activity feed (GET /api/settings/activity) has no UI caller anywhere**, `apps/web/features/settings/hooks/use-settings-queries.ts`
  - Fails: A fully implemented, rate-limited, tested backend capability (recent login/settings-change/api-call activity, distinct from the audit log) is unreachable, a user can never view it in the product, even though the route, its query schema, and its response mapping are all live and correct.
  - Fix: Either render a `RecentActivityPanel` backed by `useUserActivity` inside SecuritySection.tsx (or AccountSection.tsx) alongside AuditLogPanel, or remove the orphaned hook and route if the product intentionally consolidated activity into…
- **Direct team-add endpoint is an authenticated, platform-wide account-existence oracle**, `apps/web/app/api/settings/team/route.ts`
  - Fails: An attacker signs up for a self-serve Team-plan workspace (any account can become its owner/admin), then repeatedly POSTs to /api/settings/team with { organizationId, email }. For an address with an AGI account, the response is a 409/201 outcome branch; for one without, it is the distinct 400 'No AGI account uses…
  - Fix: In apps/web/app/api/settings/team/route.ts handleAddMember, stop asserting account existence in the response: when targetProfile is not found, return the same generic 'use the invitation link flow' guidance without stating whether an…
- **/api/download-beta is fully implemented (auth + active-subscription gate + file/redirect) but has no caller anywhere in the codebase**, `apps/web/app/api/download-beta/route.ts`
  - Fails: No end user can ever reach this endpoint through the product: there is no button, link, or client fetch anywhere in apps/web (or any other app) that calls GET /api/download-beta. The subscription check, the DB query, the redirect-allowlist logic, and the local-file-serving fallback are all unreachable, so a…
  - Fix: Either wire a real caller, add a Download button on the page that represents an active-subscriber beta channel (e.g. gated inside /beta or /billing) that links to /api/download-beta?platform=..., or delete…
- **Device-pairing POST bypasses the app's CSRF gate and its own coverage guard**, `apps/web/app/api/pair/initiate/route.ts`
  - Fails: A signed-in victim visits an attacker-controlled page containing `<form action="https://agiworkforce.com/api/pair/initiate" method="POST" enctype="text/plain">` with a body crafted to parse as JSON. The browser attaches the Clerk session cookie on the cross-site form submission (a plain HTML form POST is not gated…
  - Fix: In apps/web/app/api/pair/initiate/route.ts: import `requireCsrfToken` from '@/lib/csrf' and call `const csrfError = await requireCsrfToken(request, userId); if (csrfError) return csrfError as NextResponse;` immediately after the…
- **Export format picker exposes no selected-state ARIA**, `apps/web/features/chat/components/dialogs/EnhancedExportDialog.tsx`
  - Fails: A screen-reader user tabbing through the five export-format buttons hears only 'Markdown, button' / 'PDF, button' / 'Word Document, button' / etc. with no indication of which one is currently selected, so they cannot confirm what format Export will actually produce without sighted verification of the border color…
  - Fix: In EnhancedExportDialog.tsx, add `aria-pressed={selectedFormat === format.id}` to the format `<button>` at line 197, matching CreateProjectDialog.tsx:194.
- **control-plane/status is a fully built, DB-querying route with zero callers and zero tests**, `apps/web/app/api/control-plane/status/route.ts`
  - Fails: The route builds `SurfaceRow`/`ProviderRow`/`ActivityRow` data (heartbeats, running/pending/completed agent counts, three outbound HEAD probes to anthropic.com/openai.com/generativelanguage.googleapis.com, and a 10-row recent-activity join) behind Clerk auth and a Neon round trip on every invocation, but no UI,…
  - Fix: Delete apps/web/app/api/control-plane/status/route.ts (and its OPTIONS handler) since nothing in the repo calls it and it has no test coverage to protect; if a control-plane UI is genuinely planned, that PR should re-add the route…
- **Multi-file generated-content fetch effect refetches all still-pending files every time one resolves**, `apps/web/features/chat/components/messages/MessageBubble.tsx`
  - Fails: A message with 2+ generated text files (e.g. a tool run that returns multiple code/CSV outputs) renders. Effect run #1 fetches A, B, C concurrently. When A resolves first, setGeneratedTextContent updates state, which (a) reruns the cleanup, setting the run #1 closure's `cancelled=true`, silently discarding B and…
  - Fix: In MessageBubble.tsx, replace the `generatedTextContent` read used for the pending-check with a ref that tracks already-requested file ids (e.g. `const requestedFileIdsRef = useRef(new Set<string>())`), add each file's id to that ref…
- **Video-generation status polling loop has no cancellation and keeps running after the chat page unmounts**, `apps/web/lib/hooks/useMediaGeneration.ts`
  - Fails: A user starts (or reloads onto) a conversation containing a queued/processing video job, which auto-resumes a watch window per WebChatPage.tsx:2739-2758. If they then navigate away from /chat entirely (e.g. to /settings), WebChatRoot's dynamic-imported WebChatPage unmounts, but the `for(;;)` loop in watchVideo…
  - Fix: Thread an AbortSignal through watchVideo/getVideoStatus (add `signal` param to getVideoStatus in media-api-service.ts and pass it through the fetch), have watchVideo exit the loop when the signal aborts, and in WebChatPage.tsx create…
- **jsPDF and docx are statically imported into the always-mounted export dialog, bundling both into the core /chat route chunk**, `apps/web/features/chat/services/document-export-service.ts`
  - Fails: Every user who opens any chat conversation downloads jsPDF's and docx's full JS into the /chat chunk on first load, inflating time-to-interactive for the core product surface, even though PDF/DOCX export is an opt-in action reached only via Export in the conversation menu.
  - Fix: In document-export-service.ts, remove the top-level `import jsPDF from 'jspdf'` and `import { Document, Packer, ... } from 'docx'`, and instead do `const { default: jsPDF } = await import('jspdf')` inside downloadAsPDF and `const {…
- **Send-message queue in useChat is structurally a no-op, nothing is ever actually queued**, `packages/ui/unified-chat/src/hooks/useChat.ts`
  - Fails: The queue is imported from @agiworkforce/client-runtime with real priority lanes ('now'/'next'/'later'), a per-surface localStorage adapter, and a QueueFullError/lane-cap check, machinery that only makes sense for "type ahead while the agent is busy" queuing. In production that path is unreachable from both ends:…
  - Fix: In packages/ui/unified-chat/src/hooks/useChat.ts, remove the dead round-trip: drop the `enqueuePrompt`/`queue.dequeue()`/`QueueFullError` block at lines 932-943 and use `content` directly, and drop the now-unused `sendQueueRef`,…
- **Modal dialogs claim aria-modal but never trap or restore keyboard focus**, `packages/ui/unified-chat/src/components/KeyboardShortcutsDialog.tsx`
  - Fails: A keyboard-only or screen-reader user opens the keyboard-shortcuts dialog, the search overlay, the command palette, settings, or the BYOK handoff dialog and presses Tab repeatedly: focus walks off the last focusable control in the dialog and back into the conversation/sidebar behind it, which is still fully…
  - Fix: Add one shared hook, e.g. packages/ui/unified-chat/src/hooks/useFocusTrap.ts, that on mount stores `document.activeElement`, moves focus into the dialog (first focusable element or a designated initial-focus ref), attaches a keydown…
- **BYOK key status silently renders "Not set" when the status fetch fails**, `apps/web/app/settings/byok/EnvKeyStatusList.tsx`
  - Fails: A user with BYOK provider keys already configured opens Settings > BYOK while offline, on a flaky connection, or during any transient 5xx from /api/byok/env-key-status. Every provider row flips from 'Checking...' straight to 'Not set' (never an error or 'unknown' state), which is indistinguishable from actually…
  - Fix: In EnvKeyStatusList.tsx, add `const [error, setError] = useState(false)`, set it `true` in the catch block instead of the empty body, and in the badge render branch check `error` before falling back to `Boolean(isSet)`, render a third…
- **cloud-managed waitlist 'rank' is the table's total row count, identical for every caller, not the caller's actual position**, `apps/web/app/api/waitlist/cloud-managed/route.ts`
  - Fails: User A joins the waitlist as the very first entry and is told '#1 in line'. Immediately after, 500 more people join. User A calls the endpoint again (or any new joiner calls it) and both User A and the newest joiner are told the identical rank, because the query counts every row in the table at query time…
  - Fix: In apps/web/app/api/waitlist/cloud-managed/route.ts, replace the query at line 70-73 with one scoped to the row just upserted, e.g. `select count(\*) - 1 as rank from cloud_managed_waitlist where joined_at <= (select joined_at from…
- **Marketing footer's "Web" surface link points to /apps (the connectors marketplace), not the web app**, `apps/web/features/marketing/components/MarketingFooter.tsx`
  - Fails: A visitor on any marketing page opens the site-wide footer's Surfaces column expecting Web / Desktop / Mobile / CLI / Chrome / VS Code to each open that surface's product page, the way Desktop, Mobile, CLI, Chrome, and VS Code do. Clicking 'Web' sends them to /apps instead, which, signed out, shows a sign-in gate…
  - Fix: In features/marketing/components/MarketingFooter.tsx, change the SURFACES entry at line 33 from `{ href: '/apps', label: 'Web' }` to either drop the mislabeled row or repoint it at the actual web-chat entry used elsewhere on the site…

### Low (12)

- **Code-block copy button swallows clipboard failures instead of using the repo's existing safe-clipboard fallback**, `packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx`
  - Fails: In any context where `navigator.clipboard` is undefined or `writeText` rejects (denied Permissions-Policy in an embedding/microfrontend iframe, browser without Clipboard API support, or a permission prompt the user dismisses), the `await` throws inside CodeBlock's async handler with no catch: the promise rejects…
  - Fix: In packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx, wrap the `navigator.clipboard.writeText(codeString)` call in a try/catch and only call `setCopied(true)` on success (leaving the button in its default 'Copy' state…
- **ThinkingBlock derives its aria-labelledby id from a content prefix, producing duplicate DOM ids across messages**, `apps/web/features/chat/components/ThinkingBlock.tsx`
  - Fails: Any two ThinkingBlock instances rendered at the same time whose visible text shares the same first 8 non-whitespace characters, trivially true while a block is still empty at the very start of streaming (content='' for both → id='thinking-header-'), and routinely true for completed blocks since LLM…
  - Fix: In apps/web/features/chat/components/ThinkingBlock.tsx, replace the content-derived headerId with React's `useId()` (or accept a `segmentId`/`messageId` prop from the callers in MessageBubble.tsx that already have a stable id for each…
- **Empty-state copy claims uploads are never cataloged, but the Uploaded filter is fully wired to real upload rows**, `packages/ui/unified-chat/src/components/library/LibraryView.tsx`
  - Fails: A user attaches an image to a chat message. The completion route inserts a media_assets row with metadata.origin='upload', so the file is now genuinely cataloged in the Library. If that user later opens /chat/library, clicks the 'Uploaded' filter chip, and also has an active kind/surface/search filter that this…
  - Fix: In packages/ui/unified-chat/src/components/library/LibraryView.tsx's EmptyState, replace the origin==='uploaded' branch (line 918) with copy that matches actual behavior, e.g. 'No uploaded files match your filters yet, files you attach…
- **ModeSelector (team/engineer/research/race/solo Chat Mode picker) is exported but never rendered anywhere**, the since-deleted apps/web/features/chat/components/Tools/ModeSelector.tsx (RESOLVED: removed in f829e76c8.)
  - Fails: No user can ever reach team/engineer/research/race/solo mode selection through this control, it renders nowhere, so any product intent behind those five modes is invisible in the shipped app.
  - Fix: Delete `ModeSelector.tsx`, its export in `Tools/index.ts`, and the unused `ChatMode` type/`mode?` field in `features/chat/types/index.ts`, or mount it in the composer if the five-mode concept is still intended to ship.
- **Custom Style has no edit affordance: updateCustomStyle is exported but never called**, `apps/web/features/chat/stores/style-store.ts`
  - Fails: A user creates a custom style with a typo or wrong wording in the instruction/sample text. There is no way to fix it in place -- the only remedy is Delete followed by Create from scratch, retyping the name, sample text, and instruction, and losing the original id/createdAt.
  - Fix: Add an edit affordance in StyleSelector.tsx: clicking a custom style's row (outside the delete icon) opens the create-form pre-populated with that style's name/sampleText/instruction, and Save calls updateCustomStyle(id, {...}) instead…
- **apps/web/lib/ai-sdk/ is a complete, unreferenced duplicate provider-dispatch implementation**, the since-deleted apps/web/lib/ai-sdk/stream-handler.ts (RESOLVED: removed in f829e76c8.)
  - Fails: None at runtime -- the module is unreachable, so it cannot misbehave in production. The risk is maintenance: a future change to real provider/failover behavior (e.g. adding a provider, or fixing the billing-classification issue above) has no reason to touch this parallel implementation, so it silently drifts and…
  - Fix: Delete apps/web/lib/ai-sdk/providers.ts, stream-handler.ts, event-adapter.ts, managed-provider-mode-gate.ts and their **tests** counterparts; if a future route is meant to use the AI-SDK-based path, import and call…
- **Skill body detail route (/api/skills/[name]) has zero callers anywhere in the product**, `apps/web/app/api/skills/[name]/route.ts`
  - Fails: A developer maintains this endpoint (adds fields, fixes bugs, keeps its test green) believing it backs a 'view skill body before download' UI, but no such UI exists and none is ever built against it, the endpoint is pure unexercised surface area that can silently drift from the download route's behavior (e.g. it…
  - Fix: Delete apps/web/app/api/skills/[name]/route.ts (and its dedicated assertions in apps/web/**tests**/api/skills.security.test.ts) since /download already covers the only real client need, or wire an actual caller (e.g. an…
- **Presign route returns an attachmentId that no caller ever reads**, `apps/web/app/api/uploads/presign/route.ts`
  - Fails: No functional failure, the generated UUID is computed and serialized on every presign call and then discarded by every caller, so it can never be used to correlate a presign with its later `/complete` call or to pre-allocate the asset id.
  - Fix: Remove the `attachmentId: randomUUID(),` line from the response object in apps/web/app/api/uploads/presign/route.ts and drop the now-unused `randomUUID` import.
- **Legacy Runway/Google-Veo video status branch is unreachable dead code that always returns a misleading 403**, `apps/web/app/api/media/video/status/route.ts`
  - Fails: Any caller that still supplies a `runway_...`/`google_...` task_id (a stale bookmark, cached client state from before the durable-job migration, or a script hitting the API directly) receives a 403 'You do not have permission to check this task', which reads as an ownership/authz failure rather than 'this legacy…
  - Fix: Delete the legacy branch in apps/web/app/api/media/video/status/route.ts (parseTaskId, RunwayTaskStatusResponse/GoogleOperationResponse types, getRunwayStatus, getGoogleVeoStatus, and the routing block at 343-406 for non-UUID task_id),…
- **Workspace billing page tells admins per-member/per-model usage has 'no admin read path' and links Usage to the wrong (personal) page**, `apps/web/features/workspace-console/components/WorkspaceBillingSummary.tsx`
  - Fails: An owner/admin reading the workspace Billing page is told the per-member/per-model cost breakdown they need for a budget review doesn't exist yet, and clicking the page's own 'Usage' link takes them to their personal usage/quota bars instead of the workspace usage page that already has it, so they may never…
  - Fix: In WorkspaceBillingSummary.tsx, change the 'Usage' Link's href from '/settings/usage' to '/workspace/usage', and delete the now-false closing paragraph (lines 153-156) claiming no admin read path exists.
- **Raw subscription status enum ('past_due', 'incomplete_expired', etc.) is rendered to users with no humanization, showing literal underscores**, `apps/web/features/settings/sections/BillingSection.tsx`
  - Fails: A subscriber whose card was declined and who is in the payment-failure grace period opens Settings > Billing to see what is happening with their account. The one status indicator on the page, the Status row this codebase relies on to communicate the grace period, reads 'Past_due', a raw enum leak that looks like…
  - Fix: In BillingSection.tsx, add a small status-label map (e.g. `{ past_due: 'Past due', incomplete_expired: 'Incomplete', unpaid: 'Unpaid', trialing: 'Trial', canceled: 'Canceled', active: 'Active' }`) and render…
- **Offline message-sync queue is globally mounted but nothing ever enqueues into it**, `apps/web/lib/offline/offlineQueue.ts`
  - Fails: A user sends a chat message while offline. The composer's send call fails and is handled by the generic chat-error path (an inline 'Error:' bubble asking them to manually retry); no message is added to the offline queue. When connectivity returns, nothing auto-resends, the queue-driven 'synced' / 'pending'…
  - Fix: In lib/hooks/useChatStream.ts's network-failure branch of handleStreamError (or the fetch call that throws), call `queueMessage(...)` from lib/offline/offlineQueue.ts with the pending content before falling back to the generic error…

2026-08-30 Colour tokens carried two roles at once (`WEB-CONTRAST-DUAL-ROLE-01`,
High, Fixed): a live axe sweep across light/dark x 5 accents found the same
structural fault in three token families - one variable served both text and
solid-fill roles, so each theme failed whichever role it was not tuned for.
Measured before: `--destructive` 3.55:1 as text and 3.76:1 under white on a
fill in light, 2.10:1 as text in dark (124 text call sites); no single value
satisfies both roles in dark, so the token had to split. The accent fill had no
paired foreground at all - white read 2.97:1 on amber and 2.54-3.20:1 on every
dark swatch. `--muted-foreground` is tuned to 4.96:1 but 75 call sites diluted
it with an opacity modifier, reaching 2.31:1 at /60. Fixed by adding
`--destructive-text`, `--settings-destructive-text` and
`--accent-swatch-*-on`, repointing 112 `text-danger`, 20 settings-token and 9
accent-fill call sites, dropping the opacity modifiers (the two deliberate `/0`
hover-reveals kept), and darkening green-600/emerald-500 action buttons that
carried white. Verified live: 24/24 theme x accent x route combinations clean,
up from 12/24. Guarded by 14 new token assertions in
`apps/web/shared/components/__tests__/theme-contrast.test.ts`, each confirmed
to fail on the pre-fix values. `apps/desktop` keeps its own duplicate of these
tokens and still carries the unsplit `text-destructive` call sites; the new
tokens are defined there so the shared components render correctly, but its own
76 files were left alone as out of scope.

2026-08-30 Responsive and dialog slices measured clean, two instruments
corrected (`WEB-QA-INSTRUMENT-02`, Info, Fixed): the responsive sweep reports
0/45 horizontal overflows at 375/768/1440, and both settings dialogs pass all
eight focus properties (modal, named, focus moved in, trapped, background
inert, Escape closes, focus restored). Neither result was trustworthy as first
measured. Five routes (`/connectors`, `/skills`, `/settings/general`,
`/settings/billing`, `/settings/security`) render as a modal over `/chat`, so
`finalUrl` alone could not distinguish an open modal from a closed one - the
sweep now records `dialogPresent` and `dialogOverflowBy`, confirming all 15
modal measurements had the dialog open and neither the dialog nor the page
overflowed. The dialog probe reported `backgroundInert=false` on both dialogs;
the only element failing its check was a `<script>` tag, which exposes nothing
to assistive tech, so the probe now skips non-rendering tags. The
`#main-content` aria-hidden fix was already correct.

2026-08-30 Exhaustive interaction audit, round one (`WEB-UI-INTERACTION-01`,
High, Fixed): a six-lens fan-out (38 agents, 29 confirmed / 3 refuted) plus a
new real-browser interaction crawler produced the following, all fixed.

Token roles, 5th and 6th instances of one variable serving two jobs: 26 call
sites painted text with `--settings-destructive-foreground`, which resolves
near-white because it is the colour for text ON a red fill - measured ~1.04:1
on a light card, including the "Deletion is not recoverable" warning on the
workspace policy page. `--teal` likewise served text, a dot fill and a 12%
tint at once (3.97:1 as text), and `--amber` aliased the accent fill rather
than its text variant. Added `--chat-accent-text`/`--teal-text`, repointed 26
destructive, 41 `text-[var(--chat-accent-primary)]`, 13 inline accent-as-text
and 5 white-on-accent-fill call sites. One usage (AccountSection.tsx:457) is
correctly on a fill and was left alone.

Misleading empty states: ArchivedChatsSection, DeletedChatsSection and
SharedLinksSection each rendered "No archived chats" / "No deleted chats" /
"No shared links" when the fetch had failed, contradicting the error banner
directly above and telling the user their data was empty when it was
unreadable. Each now renders a distinct could-not-load state.

Unconfirmed destructive action: WorkspaceDataControls released a legal hold -
which un-preserves records held for litigation or a regulatory request - on a
single click. `confirmingRelease` was named for a confirmation but only drove
the spinner. Now a two-step arm/confirm with an explicit warning and a "Keep
hold" escape.

Wrong tenant scope: DirectorySyncAdminPage issued three GETs with no
`organizationId`, unlike its sibling `<SSOPanel organizationId=...>` on the
same page, so any admin of two or more workspaces saw the directory-sync
section fail permanently and indistinguishably from "nothing configured". Now
scoped via query param on GETs and body on POST/PATCH, matching the handlers.

WCAG 2.2 SC 2.5.8 target size: 9 controls under 24x24, including
`/chat/library`'s destructive Delete buttons at 55x16 and the sidebar's
20x20 icon buttons. All raised; the composer disclaimer and cookie-banner
links are the genuine "Inline" exception and are now marked
`data-inline-link` at the source rather than inferred from DOM shape.

Guards added: `apps/web/shared/components/__tests__/destructive-token-roles.test.ts`
(fails on any reintroduced text/fill role swap, confirmed red on a reverted
line) and `apps/web/e2e/qa-08-target-size.spec.ts`.

Instrument correction (7th of the audit): the interaction crawler reported
"Organize chats" as a dead control and five nav buttons as non-navigating.
Both were false. "Collapse sidebar" persists to localStorage, so every control
tested after it was judged against a collapsed sidebar. Re-tested with storage
cleared per control, the menu opens and every nav button routes correctly. The
crawler now clears persisted UI state between controls and counts a portalled
menu as feedback.

2026-08-30 Load-failure copy blamed the user's network for server faults
(`WEB-LOAD-ERROR-COPY-01`, Low, Fixed): the Connectors, Skills and Plugins
panels in the settings modal each rendered "…could not be loaded. Check your
connection and try again." for every non-auth failure, including a 5xx. That
sends a user to diagnose a network that is not broken. All three now share one
`loadFailureMessage` helper that distinguishes an expired session, a server
error (5xx), a rejected request (other 4xx) and an actual network failure;
Connectors previously had its own parallel ternary and now delegates to the
same helper. The four existing tests asserted the old generic string and were
updated to the corrected copy, plus a new test that renders a 500 and a 400 and
asserts the two messages differ and neither mentions the connection.

2026-08-30 "New project" meant two different things (`WEB-NEW-PROJECT-INTENT-01`,
Medium, Fixed): the sidebar is rendered by two shells. Under WebChatPage the
"New project" button opens the create dialog; under WebAppShell (every non-chat
surface: /tasks, /skills, /plugins, /connectors) the same button only ran
`router.push('/chat/projects')`, so the user asked to create a project and
landed on a list with no dialog and no form. The shell now carries the intent as
`/chat/projects?new=1` and the projects page opens its own CreateProjectDialog
for it; verified live from /tasks, which now lands on the dialog titled "Create
project". Guarded by `features/chat/pages/__tests__/project-create-intent.test.tsx`.

2026-08-30 Cancelled requests logged as errors (`WEB-ABORT-NOISE-01`, Low,
Fixed): `use-settings-queries.ts` logged "[SettingsQuery] API keys error: signal
is aborted without reason" whenever the API-keys query was superseded or its
component unmounted. A caller abort is normal cancellation, not a failure - the
same file already suppresses signed-out noise for this reason. A genuine
timeout still logs and still surfaces to the user.

2026-08-30 More WCAG 2.2 SC 2.5.8 target sizes (`WEB-TARGET-SIZE-02`, Low,
Fixed): the /plugins CTA link (whole-paragraph, so not the Inline exception),
every skill "Download" link in the settings modal, and every connector-name
button in the connector list were 16-20px tall. All raised to a 24px minimum;
qa-08 now passes across /chat, /chat/projects, /chat/library, /tasks, /skills,
/plugins and /connectors.

Instrument correction (8th of the audit): the interaction crawler reported 14
click timeouts on /skills, reading as dead controls. /skills renders the
settings modal over /chat, so every control it enumerated was behind the
dialog overlay and correctly click-blocked - the modal doing its job. The
crawler now scopes enumeration to the open dialog when one is present, and
skips sr-only skip links (offscreen until focused, so a blind click always
times out). After the fix the same crawl reports 0 dead and 0 click errors, and
exercises the modal's own sections instead. A separate "dead" report for "New
project" on /tasks was a real defect but not the one reported: the control
worked, it just did the wrong thing.

2026-08-30 Wave-two audit fan-out: 50 agents, 38 confirmed, 5 refuted
(`WEB-AUDIT-WAVE2-01`, High, In progress). Lens counts: destructive-confirmation
10, keyboard-focus 7, hidden-unreachable-ui 6, ui-consistency 5,
long-content-overflow 4, layout-shift 3, duplicate-requests 3.

Destructive actions without confirmation (10 found): every one fired its
mutation straight from onClick. Rather than ten bespoke dialogs, added one
shared `useConfirmAction` primitive in
`packages/ui/ui/src/primitives/ConfirmAction.tsx`, built on the AlertDialog the
account-deletion flow already uses, so the confirm surface is consistent and a
call site costs a few lines. Wired so far: SSO connection Remove (a hard
DELETE that cuts off every member signing in through it), "Log out of all
devices", per-row session Revoke, and linked-device Unlink. Still to wire:
DirectorySync Remove and Revoke, KnowledgeFiles delete, ShareConversationDialog
"Revoke link", WorkspaceSpendLimit "Remove limit", MemoryEditor per-fact delete
(its adjacent "Clear all" already confirms, so the single-fact delete is
inconsistent as well as unguarded).

Four existing tests clicked those buttons and asserted the mutation fired
immediately. They now click through the dialog, which additionally asserts the
confirmation exists - removing it would fail them on the missing dialog text.

Not yet addressed from this wave: 7 keyboard findings (the shared
`ui/src/sidebar/Menu.tsx` and `AnchoredComposerMenu` render role="menu" without
arrow-key handling, so several call sites share one root cause), 6 orphaned
routes (/beta, /founder, /payment-failure, /settings/byok, /settings/sync,
/operator - all real pages with zero inbound navigation; /payment-failure is
notable because neither Stripe checkout flow sets it as cancel_url, so no real
payment failure ever reaches it), 5 consistency findings, 4 overflow, 3 layout
shift, 3 duplicate-request findings.

2026-08-30 All ten unconfirmed destructive actions wired, plus the shared menu
keyboard pattern (`WEB-AUDIT-WAVE2-02`, High, Fixed).

Every one of the ten destructive actions now routes through the shared
`useConfirmAction` primitive: SSO connection Remove, "Log out of all devices",
per-row session Revoke, linked-device Unlink, DirectorySync connection Remove,
SCIM token Revoke, project knowledge-file Remove, share-link Revoke,
workspace spend-limit Remove, and MemoryEditor per-fact Delete (whose adjacent
"Clear all" already confirmed, so the single-fact path was inconsistent as well
as unguarded). Each dialog names the actual consequence rather than asking
"are you sure" - what stops working, who loses access, and whether it can be
undone.

Seven existing tests clicked those controls and asserted the mutation fired
immediately; they now click through the dialog. The share-link test was
strengthened further: its confirm button carries the same label as its trigger,
so asserting only the label would have let the test pass by clicking the
trigger twice - it now asserts the dialog title and clicks inside the
alertdialog.

`packages/ui/ui/src/sidebar/Menu.tsx` rendered `role="menu"`/`role="menuitem"`
with Escape and outside-click only: no focus into the menu on open, no
Arrow/Home/End movement between items, and Escape stranded focus on <body>.
That is the shared primitive behind several of the wave-two keyboard findings.
It now implements the WAI-ARIA menu pattern - focus moves to the first item on
open, ArrowUp/ArrowDown wrap, Home/End jump, Tab closes, and Escape returns
focus to the trigger. Guarded by `src/sidebar/__tests__/Menu.keyboard.test.tsx`,
confirmed red when the panel key handler is removed.

Still open from wave two: the remaining keyboard findings that do not route
through this primitive (AnchoredComposerMenu, ProjectCard, the project-detail
menu, Header's Products disclosure, UserProfile popover, ProjectGallery emoji
picker), 6 orphaned routes, 5 consistency, 4 overflow, 3 layout-shift and 3
duplicate-request findings.

2026-08-30 A passing unit test hid a broken keyboard fix
(`WEB-MENU-KEYBOARD-02`, Medium, Fixed): the WAI-ARIA menu pattern added to
`packages/ui/ui/src/sidebar/Menu.tsx` passed its jsdom test and did not work in
a real browser. Driving it live showed focus landing correctly on the first
menu item, then ArrowDown moving focus to a conversation title in the sidebar -
outside the open menu entirely. The surrounding sidebar runs its own arrow-key
list navigation on a document listener and consumed the event before the
panel's React handler saw it. jsdom has no competing listener, so the unit test
could never catch it. Key handling now runs on a document listener in the
CAPTURE phase with stopPropagation, so the open menu wins; the React panel
handler was removed as dead code. Verified live: ArrowDown/ArrowUp stay inside
the panel and wrap, Escape closes and returns focus to the trigger. Guarded by
`apps/web/e2e/qa-09-menu-keyboard.spec.ts` - a live spec, because the unit test
provably cannot cover this failure mode.

2026-08-30 A failed payment was invisible, and its explainer unreachable
(`WEB-PAST-DUE-SILENT-01`, Medium, Fixed): `invoice.payment_failed` and
`checkout.session.async_payment_failed` set the subscription to `past_due`
server-side, but `BillingSection` never rendered the subscription status, so a
user whose card was declined saw a normal-looking billing panel. Separately,
`/payment-failure` - a complete page explaining declines, expiry and issuer
flags - had zero inbound links. The wave-two finding proposed wiring it to
Stripe's `cancel_url`, which would have been wrong: `cancel_url` fires when the
user backs out of checkout, so that would tell people their payment failed when
they merely clicked back. The honest connection is the real failure state, so
BillingSection now renders a past_due/unpaid alert linking to the explainer.
Guarded in `BillingSection.test.tsx`, confirmed red when the notice is removed.

2026-08-30 The cookie banner made the account menu unclickable
(`WEB-COOKIE-BANNER-BLOCKS-SIDEBAR-01`, High, Fixed): the banner's wrapper is
`fixed bottom-0 left-0 right-0 p-4 z-50` while its card is centred at
`max-w-7xl`, so on a wide viewport the wrapper's empty padding covered the
sidebar footer. `document.elementFromPoint` at the centre of the "Account menu"
button returned the banner wrapper, and Playwright's click timed out: until a
user dismissed the cookie banner they could not open their account menu at all.
Found only by driving the browser - no static lens would surface it. Fixed by
making the wrapper and its centring container `pointer-events-none` and the
card `pointer-events-auto`. Guarded by
`apps/web/e2e/qa-10-overlay-blocking.spec.ts`, which asserts the named critical
controls are the top element at their own centre and that the account menu
actually opens; confirmed red when the fix is reverted, naming the exact
overlay.

A broader "nothing covers anything" sweep was written first and discarded: it
reported nested conversation rows and the offscreen skip link as covered, and
those are not defects. The guard asserts the specific controls instead rather
than shipping a check whose output cannot be trusted.

2026-08-30 Menu keyboard pattern extended to every popup
(`WEB-MENU-KEYBOARD-03`, Medium, Fixed): a live sweep of all eight reachable
popup triggers found ProjectCard's "Project options" opening a role="menu" that
took no focus and ignored Escape. The keyboard contract was extracted from
`Menu.tsx` into `packages/ui/ui/src/primitives/useMenuKeyboard.ts` (capture
phase, for the reason in WEB-MENU-KEYBOARD-02) and ProjectCard now uses it.

`AnchoredComposerMenu` - the positioning primitive behind nine composer popups
including the response-style and project pickers - rendered a bare div with no
role, no name, no focus management and no Escape. It is mixed content
(headings, presets, nested edit buttons), so role="menu" would be wrong: a
menuitem cannot contain other interactive elements. It is now a non-modal
`role="dialog"` with a required `label`, focus moved in on open, and Escape
closing and restoring focus to the anchor. All nine call sites were given real
names. Live re-verification: 8/8 popups now take focus and close on Escape.

2026-08-30 Long user content and a cross-viewport overlay sweep
(`WEB-LONG-CONTENT-01`, Low, Fixed): fixed four places where user-supplied
strings could push layout - the shared-session header (title and "Open in AGI"
were plain flex siblings, so a long title pushed the link off), shared-session
message bodies and moderation-queue excerpts (`whitespace-pre-wrap` with no
`break-words`, so an unbroken 180-character token overflowed), and the
project knowledge-file row (a `flex: 1` child with no `minWidth: 0`, which
refuses to shrink below its content, pushing the size and delete controls out
of the row instead of ellipsing). Guarded by
`apps/web/e2e/qa-11-long-content.spec.ts`, which injects a 180-char word and a
long URL into every user-supplied string on the page at 375px and 1440px and
asserts the document never scrolls horizontally. The spec carries two
anti-vacuity checks: it asserts the injection actually found strings to stress,
and the overflow assertion was proved to bite by appending a 5000px canary
(it reported 4625px of overflow, then passed again once removed).

The overlay-blocking check from WEB-COOKIE-BANNER-BLOCKS-SIDEBAR-01 was run
across 4 viewports x 4 routes. It surfaced no further defects: the
`/connectors` hits are a modal backdrop correctly blocking the page behind it,
the "Skip to main content" hits are a link that is deliberately offscreen until
focused, and the remainder were an artefact of walking up to a fixed ancestor
rather than reporting the true top element. Two things were checked rather than
assumed - the cookie banner is fully dismissible at 375px (all four buttons
on-screen and clickable), and `RACEPROBE1787997510` is a conversation title in
the account's own test data, not shipped markup.

2026-08-30 Layout shift measured, not assumed; skills catalogue deduped
(`WEB-DUPLICATE-FETCH-01`, Low, Fixed).

Layout shift: measured with a real PerformanceObserver across five routes.
CLS is 0.0072-0.0255 everywhere, well inside the 0.1 "good" threshold, and no
single shift exceeded 0.01. The three wave-two layout-shift findings are
theoretically sound but produce no measurable shift on these routes, so they
are recorded rather than "fixed" - a media element without intrinsic
dimensions only shifts when such content actually arrives mid-stream.

Duplicate requests: the first measurement grouped by pathname and made
`/api/settings/preferences` look like 7 identical calls. With the query string
included they are distinct namespaces, so that was an instrument artefact and
no fix was warranted. The real duplicate was `/api/skills`, fetched 4x on
/connectors and 2x on /chat because `useSkillsList` (composer) and
`WebSettingsModal.loadSkills` each fetched independently, and /connectors
renders the modal over /chat. Added
`apps/web/features/skills/services/skills-catalog.ts`: one in-flight promise
shared by both, with a 30s TTL and invalidation on SKILL_CATALOG_CHANGED_EVENT.
`/api/skills` no longer appears in the duplicate list on any route.

Two things the refactor got wrong and had to be corrected before landing:
caching the promise indefinitely would have frozen the catalogue for the whole
session (hence the TTL), and routing through a shared loader initially dropped
the HTTP status, silently regressing the honest 5xx-vs-network error copy added
earlier the same day. The loader now throws a status-carrying
`SkillsCatalogError` and `loadFailureMessage` reads a status off any error
shape. Two settings-modal tests failed on the shared module cache leaking
between them; they now reset it in beforeEach, which is the isolation a
module-level cache requires.

2026-08-30 Orphaned settings pages, and six iterations of test drift
(`WEB-ORPHAN-ROUTES-01`, Medium, Fixed).

Drove all six wave-two orphaned routes live. Three were real defects, three
were not: `/beta` and `/founder` are marketing pages where direct-link-only
distribution is defensible, and `/operator` correctly gates a non-admin account
(HTTP 200 with 404 content - a soft-404, worth noting but the gate works).
`/settings/byok` ("API keys (BYOK)", 7 controls) and `/settings/sync` ("Sync",
6 controls) are real settings pages with no rail entry and no inbound link:
only a typed URL reached them. BYOK matters most - it is the product's headline
differentiator and had no route from inside settings. Both are now linked from
the section that owns the topic (Capabilities and General), verified live to
land on the right page.

Guarded by `apps/web/app/settings/__tests__/settings-routes-reachable.test.ts`,
which enumerates every `app/settings/*/page.tsx` and requires a rail key, a URL
link, or a `<SettingsSectionLink section="...">`. Writing it surfaced a seventh
route the static lens missed, `/settings/profile` - but that turned out to be a
five-line redirect to `/settings/general`, a legacy-URL alias that should NOT
be linked. The guard now skips redirect-only pages. Confirmed red when the BYOK
link is removed.

Test drift found while running the full suite: four accent-token tests and two
projects-page tests had been failing since earlier iterations today. Both were
caused by my own changes - adding `--chat-accent-on-primary` to the
`html[data-accent=...]` blocks (the test pinned the exact CSS text) and adding
`useSearchParams` for the ?new=1 create intent (the test's next/navigation mock
lacked the export). I had been running `vitest run features` and not `app`, so
neither surfaced for several iterations. Both are now fixed, and the accent test
additionally asserts every swatch defines its paired `-on` foreground. Full web
suite: 4919 passed, 1 skipped.

2026-08-30 Shared formatters pinned en-US; fresh re-crawl 41/41
(`WEB-FORMATTER-LOCALE-01`, Medium, Fixed).

The wave-two consistency finding said 40 ad-hoc `toLocaleString()` call sites
should route through the canonical helpers in
`packages/platform/utils/src/format.ts`. Checking the helpers first showed they
themselves pin 'en-US' in all four formatters - `formatDate`, `formatDateTime`,
`formatCurrency` and `formatNumber` - so following that recommendation would
have spread a locale bug to every screen instead of fixing it. `formatNumber`'s
own doc comment already claimed "locale-specific thousands separators" while
hardcoding en-US. All four now default to the viewer's locale and take an
optional explicit one, which is also what makes them testable:
`src/__tests__/format.locale.test.ts` asserts de-DE and en-US render
differently and that the default matches the runtime locale. The 40-site
consolidation is now safe to do but was not attempted in this pass.

Fresh full re-crawl of 41 routes across four slices: 38 reported clean and all
three flags resolved to non-defects on re-run. `/settings/memory` reported
blank(20) once and renders 2744 characters with 127 controls on every retry -
the sweep had measured before the modal mounted.
`/settings/notifications` reported 429s, which are this harness's own traffic
against the shared rate-limit bucket. `/chat/library`'s two 404s are an
orphaned file blob in the account's data; the UI degrades correctly around it
(onPreviewError -> fallback, verified earlier), so it is a data-integrity note
rather than a UI defect.

One unified-chat test failed once and passed on re-run; the failing name was
not captured, so it is recorded as a flake rather than chased.

2026-08-30 Convergence pass: every guard green, one new defect found
(`WEB-CONVERGENCE-01`, Info).

Ran all eight guard specs together against the live product. qa-05 responsive:
45/45 measurements, zero page overflow, zero dialog overflow, and all 15 modal
routes confirmed to have actually opened their dialog. qa-06 dialogs, qa-08
target size, qa-09 menu keyboard, qa-10 overlay blocking and qa-11 long content
all pass. qa-07 interaction crawl over /chat, /chat/projects and /tasks: 48
controls, 0 dead, 0 real console errors (all 65 were 429s from the crawl's own
reload-per-control traffic against the shared rate-limit bucket).

The crawl found one defect the live target-size sweep structurally cannot see:
the sidebar's empty-state call to action ("No conversations yet" -> "Start a
new chat") was a bare text button under 24px. qa-08 never renders it because it
only appears when the account has no conversations, and the QA account has 26;
the crawl reached it by filtering the list empty. This is a general coverage
limit worth stating plainly - the live sweeps only measure the states this
account's data produces, so empty, error and loading states are invisible to
them. Fixed, and guarded at the component level in
`Sidebar.emptyState.test.tsx`, which renders the empty sidebar deterministically
rather than hoping a live run reaches that state. Confirmed red when the
min-height is removed.

2026-08-30 Loading screens were silent, unthemed and ignored reduced motion
(`WEB-LOADING-STATE-A11Y-01`, Medium, Fixed): 23 route-level `loading.tsx`
files rendered a bare spinning div. None carried `role="status"`, a live region
or any label, so a screen-reader user navigating to those pages heard nothing
while they loaded. Five pinned `border-zinc-700 border-t-blue-500`, ignoring
both the theme and the user's accent colour, and only three of nineteen
spinners repo-wide honoured `prefers-reduced-motion` (WCAG 2.3.3). All 23 now
expose a live region with a label, use theme tokens, and stop animating under
reduced motion. Guarded by `apps/web/app/__tests__/loading-states.test.ts`,
confirmed red when a single file's status role is removed - it names the file.

The guard caught two files the sweep's regex missed (`app/loading.tsx`,
`app/download/loading.tsx`) and also over-reported one: the root screen shows a
visible "Loading…" label rather than an `sr-only` one, which is not worse, so
the assertion now accepts either.

Near-miss worth recording: the wave-two finding said there was no shared
spinner component. There is - `packages/ui/ui/src/primitives/Spinner.tsx`, with
`role="status"` and an sr-only label already correct. I created a "new" one at
that exact path without checking, overwriting it; `git checkout` restored it.
The real finding is not "no shared component" but "19 places ignore the one
that exists". Its appearance was left alone because its only three consumers
are in `apps/desktop`, which is out of scope and which I cannot verify
visually; it gained only the reduced-motion class, which is a pure improvement.

Test-suite health: three packages/ui/ui dialog tests (5-6s each) failed once
and passed on re-run, as did one unified-chat test earlier. Recorded as flakes
rather than chased, but that is now four intermittent failures in a day.

Operational note (same day): running `vitest run app` while five Sonnet-5
agents drove Playwright browsers produced 8 failures across unrelated areas
(org membership, installers, pricing routing), each taking 5-12 seconds - the
shape of a timeout, not an assertion. Load average was 24.4 with 23 Playwright
processes and 4 Chromium instances alive. These are starvation artefacts and
must be re-run under quiet conditions before being believed; the earlier
"flakes" recorded in this file may share the same cause, since they were also
long-running tests during periods of concurrent browser work.

2026-08-30 Cross-surface accent token break, and a database guard tests never had
(`WEB-SHARED-TOKEN-DESKTOP-01`, High, Fixed).

A peer session's guard sweep caught a real regression of mine. Splitting the
accent token into fill/text/on-fill roles, I added `--chat-accent-on-primary`
to the SHARED stylesheet `packages/ui/design-tokens/src/chat.css` but not
`--chat-accent-primary-text`, while sweeping 36 shared-package call sites onto
the latter. Desktop loads that stylesheet and would have rendered all 36 with
no colour. Now defined in all three scopes with per-scope values, because the
fill does not clear AA as text on every background: #a8502f in the light
default (#da7756 is 3.11:1 on white, this is 5.45:1), #da7756 unchanged in
`.dark` (already 6.75:1), #0961bb in the cool light theme (#0b84ff is 3.65:1
on white, this is 6.11:1). check:css-tokens now passes across all 4 surfaces.

Found while fixing it: `--chat-accent-primary-contrast` already existed for the
"text on the accent fill" role and is #ffffff in all three scopes, which is
3.11:1 on the terracotta fill. Its 14 call sites are all in apps/desktop, so it
was left alone and reported to that session rather than changed unverifiably -
but it duplicates `--chat-accent-on-primary` and one of the two should win.

The peer's second guard failure, check:structure-conventions ENOENT on
`e2e/agent-chat-composer-sweep.spec.ts`, was not a registration problem:
nothing registers it. Those files are written and deleted by the Sonnet-5
subagents driving browsers, and the guard read one between enumerate and open.
It passes cleanly; it will flap while those agents run.

Acting on the same session's tip that desktop tests were reading the real
application database through an isolation variable nobody read: the web
equivalent existed as a risk. `getNeonDb()` builds its client from
AGI_DATABASE_URL ?? DATABASE_URL with no test-mode guard, and
`apps/web/test/setup.ts` neutralised neither, so a developer with the app's env
loaded had one unmocked query between a unit test and production data. The
setup now points both at an unroutable host. Running with that in place:
app/api 2118 passed, lib+db 4715 passed - so nothing was actually reaching the
database, the exposure was latent rather than live, and any future test that
forgets to mock now fails loudly instead of touching real data.

A first pass at this looked much worse - 20+ environment variables appeared to
be set by tests and read by nothing - but that was a regex that could not see
template-literal access like process.env[`CONNECTOR_OAUTH_${provider}_ID`].
Every one of them is read. Only the database gap was real.

2026-08-30 Sonnet-5 agents driving real browsers: four slices, zero findings
(`WEB-SONNET-BROWSER-AUDIT-01`, Info).

The user asked why the audit was not using computer use in Chrome with
Sonnet-5. Testing rather than restating the docs: `request_access` for Chrome
answers that "browser applications can only ever be granted in 'read' mode, so
you cannot use them to interact with websites", and directs to the Claude in
Chrome extension MCP, which is not connected in this session (no
mcp**claude-in-chrome**\* tools exist). Computer use can therefore see the
screen but not click. Playwright remains the only real browser control
available here.

What had genuinely been missed is that Sonnet-5 was only doing static code
analysis while I drove the browser myself. Five Sonnet-5 agents were given
their own Playwright harnesses and slices: composer, the settings modal rail
section by section, projects and library, empty and error states reached by
filtering lists, and keyboard-only navigation. Each was told to reproduce a
finding twice before reporting it, and given the false-positive traps this
audit has already hit (modal backdrops, offscreen skip links, its own 429s,
portalled menus).

Four completed with ZERO findings across /chat, /chat/projects, /chat/library,
/tasks, /settings/general, /settings/connections and /settings/skills at both
1440x900 and 375x812. That is worth weighing properly: their self-reported
"controls exercised" numbers are low (7 to 20), but the transcripts show 1018
tool calls and 878 bash invocations between them, so the slices were driven
hard and the empty result is a real signal rather than a shallow pass. The
fifth (projects and library) was still running.

2026-08-30 Opacity on the accent text token put five live labels under AA
(`WEB-ACCENT-TEXT-OPACITY-01`, Medium, Fixed): a peer session measuring the
desktop side warned that #1c150b at /70 drops to 3.62:1 on the terracotta fill.
Checking the same on my own sweep found five live-text uses of
`--chat-accent-primary-text` carrying an opacity modifier. Composited against
the light surface (#a8502f on #f9f8f6): /80 is 3.54:1, /70 is 2.98:1, /60 is
2.49:1; dark (#da7756 on black) survives /80 at 4.52:1 but fails /70 at 3.66:1.
None are disabled controls, so WCAG 1.4.3 applies in full, and the /60 case is
an icon that fails even the 3:1 non-text bar. Sites: AgentControl.tsx:154 and
ModelSelector.tsx:325, 326, 330, 845. Opacity removed from all five - the token
is already the de-emphasised accent, so diluting it further repeats the
`text-muted-foreground/60` mistake fixed earlier the same day.

Correction to advice I gave that peer: I suggested consolidating
`--chat-accent-primary-contrast` and `--chat-accent-on-primary` since they name
the same role. That would have broken the three call sites that were already
correct. The contrast token sits on TWO backgrounds and white is right on one
of them - 4.63:1 on the secondary accent #21808d and 5.04:1 on the cool
#0a6ed1, against 3.11:1 on the primary #da7756. The peer mapped all 14 sites to
their actual background rather than swapping by name, and two of those were
inline-style ternaries invisible to a class-string scan. The lesson is that a
token's name is not evidence of the background it renders against.

`chat.css` now also defines `--chat-accent-on-secondary` with the real value,
with `--chat-accent-primary-contrast` aliasing it, so the honest name exists
without touching desktop files while that session has work in flight.

2026-08-30 Sonnet-5 browser agents: 2 confirmed, 1 of them wrong on review
(`WEB-SONNET-BROWSER-AUDIT-02`, Medium).

The five-agent browser run finished: 7 agents, 1077 tool calls, two findings
that a second agent reproduced independently. One was real; the other was
carefully measured and wrongly framed, which is worth recording because the
verification step did not catch it.

REAL, project detail menu had no keyboard contract. `app/chat/projects/[id]`
renders the same role="menu" with the same items as ProjectCard on the list
page, but was dismissed by a `mousedown` listener alone: no Escape, no focus
into the menu, no arrows. The list page received `useMenuKeyboard`; the detail
page was missed. Fixed with the same hook and verified live - focus lands on a
menuitem, Escape closes and returns focus to "Project options". Guarded by a
second case in `apps/web/e2e/qa-09-menu-keyboard.spec.ts`.

NOT A DEFECT, the cookie banner "covering" the project card at 375px. Both the
finder and its verifier measured correctly (card bbox inside the consent band,
`locator.click()` timing out with the consent subtree intercepting) and
concluded the earlier pointer-events fix was incomplete. It is not. Measuring
what actually sits at that point: the intercepting element is
`P.pr-10 text-sm text-muted-foreground` inside a card painted rgb(255,255,255)
at opacity 1 - the banner's own visible body text. A cookie banner overlaying
content until dismissed is normal, and its four buttons were separately
verified reachable and clickable at 375px. The earlier fix addressed a
different thing: the wrapper's TRANSPARENT padding swallowing clicks over the
sidebar, which is invisible blocking. The distinguishing question is whether
the intercepting element is painted or transparent, and neither agent asked it

- "Playwright reports interception" is equally true of a legitimate banner.
  Worth adding to the false-positive list given to future browser agents.

2026-08-30 Data-truth lens: does the UI match the server it renders from
(`WEB-DATA-TRUTH-01`, Info, no defects found).

Every earlier pass asked whether the UI was accessible, errored, broke at a
breakpoint, was reachable, or confirmed destructive actions. None asked whether
what it displays is TRUE. Applying the lesson from the cookie-banner false
positive - a second pass only adds information if it changes the question, not
just the reasoner - this pass compared rendered state against the API payloads
captured on the same page load.

Both surfaces checked are accurate. `/api/projects` returned 1 project and the
gallery rendered exactly 1 card with the matching name.
`/api/chat/conversations` returned 50 and the sidebar's three group headers
claim 26 + 10 + 14, which is exactly 50.

Recorded because it nearly became a phantom finding. The first measurement read
"group headers claim 50 conversations, only 26 rows rendered", which is the
shape of a real data-correctness defect. It is collapsed groups: the two
smaller groups carry aria-expanded="false" and render no rows, while their
headers correctly report the group's size. The counts are right and the
rendering is right. A follow-up attempt to expand them failed to find the
headers by accessible name (the label and the count are separate elements), so
the second measurement did not disprove the first either - only reading
aria-expanded and the API total together settled it.

## 2026-09-04 A canceled enterprise contract's `ended_at` never clears on

resubscribe (`BILLING-ENTERPRISE-CONTRACT-ENDED-AT-STICKY`, Medium, fixed 2026-09-04: the contract upsert now clears `ended_at` whenever the synced subscription is live and only keeps it for a canceled or expired one)

`syncEnterpriseContractFromSubscription`
(`apps/web/lib/services/enterprise-billing-service.ts:264-326`) upserts
`organization_billing_contracts` on `customer.subscription.created` /
`.updated`, keyed on `organization_id`. The `on conflict` `set` list updates
`stripe_subscription_id`, seats, dates and cadence from the new subscription,
but never assigns `ended_at`. Once a contract's `ended_at` is set by
`cancelEnterpriseContract` (the `set ended_at = $2 where ... and ended_at is
null` at line ~536), creating a brand new active subscription for the same
organization leaves the stale `ended_at` in place forever, even though
`stripe_subscription_id` now points at a live, paying subscription.

Both `readOrganizationCollectionState`
(`apps/web/lib/services/enterprise-collection-state.ts:74-89`, the read-only
billing gate) and `readActiveMeteredContracts`
(`apps/web/lib/services/enterprise-usage-metering.ts:130-140`, the overage
cron) filter `where ended_at is null`. With the stale timestamp still set,
both silently stop applying to that organization: the billing gate can never
reach `read_only` again and the overage cron never re-examines the contract,
with no error surfaced anywhere.

Reproduced 2026-09-04 in test mode while verifying enterprise-billing runbook
section 10 item 9 and item 10 (`docs/runbooks/enterprise-billing.md`): org
`df7a9e66-f5bc-4329-9eb4-920264f1a9ba`'s contract had `ended_at` set from an
earlier cancel-and-verify pass; creating subscription `sub_1UBsOv0zEfO6BZMhTsYaXlTT`
for the same org updated `stripe_subscription_id` but left `ended_at` at the
old cancellation timestamp. Worked around for that verification by directly
nulling `ended_at` in the database rather than through the webhook path (the
row is left with `ended_at` null, matching the subscription's real active
state). Fix belongs in the same upsert: clear `ended_at` to `null` whenever
`customer.subscription.created`/`.updated` reports a non-canceled status for
the organization's current subscription.

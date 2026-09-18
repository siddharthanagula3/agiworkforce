# Break-glass production access

Status: Current
Owner: Repository maintainers
Last updated: 2026-09-17

## Why this exists

Until this runbook, `/security` and `/trust` both said the same true thing:
production database credentials existed, the operator held them, and there was
no just-in-time approval, no scope, no expiry and no audit trail over them.
Every action the application takes on a tenant's behalf was audited; the one
path with the most authority was not.

The mechanism is `apps/web/lib/server/support-access-service.ts` and migration
`apps/web/db/neon/0225_support_access_grants.sql`. This document is the part
that is a process rather than code, plus the two things a reviewer always asks:
how an operator's access ends when they leave, and what stops a production
tenant being assembled by hand in the database.

## The rule

**Holding credentials is not access.** Reading one workspace's data as an
operator requires an approved, unexpired grant naming that workspace and the
scope of the read. There is no exception for an incident: an incident is the
case the eight-hour ceiling and the one-hour default were sized for.

## Requesting and approving

1. The operator who needs the access calls
   `POST /api/admin/support-access` with `action: "request"`, the workspace id,
   the scopes (`conversations`, `files`, `projects`, `connectors`, `billing`,
   `audit_logs`, `workspace_settings`), the ticket, and a reason of at least 20
   characters. The workspace's owners and admins can read that reason, so write
   it for them.
2. A **different** platform operator calls the same route with
   `action: "approve"` and the grant id. The requester approving their own
   request is refused twice over: in `approveSupportAccess`, and by the
   `support_access_grants_needs_a_second_approver` check constraint, so the
   property holds even for a write made directly against the database.
3. The grant expires on its own. `ttlMs` may shorten the window; nothing can
   lengthen it past eight hours, because `support_access_grants_is_time_boxed`
   is a constraint rather than a code path.
4. `action: "revoke"` ends a grant early, and `action: "deny"` closes a request
   that should not have been made. Both are recorded.

## What is recorded, and what a customer can check

Every transition, every read taken under a grant, and **every read refused for
want of one** is appended to `support_access_events`. That table is append-only
three ways:

- the application role holds no `INSERT`, `UPDATE` or `DELETE` privilege;
- a trigger refuses `UPDATE` and `DELETE` for every role, including the owner
  connection an operator holds;
- each row carries the hash of the previous row for that workspace, so a row
  removed or rewritten through a direct connection that disabled the trigger
  still leaves a break.

`GET /api/admin/support-access?action=verify&organizationId=…` recomputes the
chain and names the first entry that does not reconcile. A workspace's owners
and admins read their own grants and their own events directly through row-level
security, so the record is not one we can edit and screenshot for them.

## Keys, and why support cannot read around this

A workspace with a customer-managed key is opaque to us without its own KMS
answering (`apps/web/lib/crypto/cmek.ts`). A workspace on the platform key used
to be the bypass, because the operator holds the platform root. Two changes
close it:

- `resolveOrganizationKeyRing` takes a principal. A `support` principal is
  gated on `assertSupportAccess` for **both** key sources, and a deployment that
  wires no gate refuses support resolution outright rather than serving the
  platform key.
- With `AGI_PLATFORM_KEY_PROVIDER` set to a KMS provider, the environment holds
  only a wrapped platform data key and enveloped secrets
  (`apps/web/lib/crypto/platform-keys.ts`). Unsealing is a call the KMS records
  in a trail we do not write.

`platformKeyPosture()` reports which of the two the deployment is actually in.
Do not claim the second on a public page while the first is configured.

## Employee offboarding from production

Run all of these on the last working day, in this order. Each is a step whose
result is visible to somebody other than the person doing it.

1. **Revoke live grants.** `GET /api/admin/support-access?status=approved`,
   then `action: "revoke"` on anything the departing operator requested.
2. **Remove them from the operator allowlist.** `AGI_PLATFORM_ADMIN_USER_IDS`
   in the production environment. Until this is done they can still request a
   grant, and a second approver might approve it out of habit.
3. **Remove their database credentials.** Both the Neon role and any local
   connection string. A grant is the authorisation; the credential is the
   capability, and offboarding has to take both.
4. **Remove their KMS access.** The IAM principal that can call
   `Decrypt`/`GenerateDataKey` on the platform key, and any grant on a
   customer's key.
5. **Rotate what they could read.** Anything in step 3 or 4 they held long
   enough to copy: the platform data key (`AGI_PLATFORM_DATA_KEY`) through a
   rotation window, and the deployment secrets they could read from the
   environment.
6. **Record it.** File the offboarding under the same ticket the access was
   granted against, and note the date each step completed. A reviewer asks for
   this list with dates, not for an assurance that it happened.

## No production tenant is provisioned by hand

Creating or altering a tenant directly in the database is not a shortcut, it is
an unaudited write with no second approver, and it produces a workspace whose
shape no code path can reproduce. Provisioning runs through the org-creation,
SSO and SCIM flows, which are reproducible and leave an audit event.

If a tenant genuinely cannot be created through those flows, that is a defect in
them; fix the flow. If a manual write is unavoidable before that fix lands, it
requires a break-glass grant covering `workspace_settings` on that workspace,
the ticket in the grant reason, and an entry in the same trail as every other
break-glass action, so it is visible in exactly the place a reviewer already
looks, rather than only in a shell history.

## Rehearsal

Twice a year, and after any change to the tables above:

1. Request a grant against a scratch workspace and have a second operator
   approve it. Confirm `expires_at` is set and no longer than asked for.
2. Attempt a support read after it expires. Confirm the refusal, then confirm a
   `refused` row exists for it.
3. Run the verify endpoint. Confirm `intact: true`.
4. On a throwaway Neon branch only, delete one event row with the trigger
   disabled and re-run verify. Confirm it reports the break and names the entry.
   Never do this against production data.

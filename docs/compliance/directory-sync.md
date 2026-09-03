# Enterprise Directory Sync (SCIM 2.0)

Status: Current
Owner: Platform lead
Last updated: 2026-08-05
Purpose: the shipped behaviour of the SCIM 2.0 service provider behind the Enterprise page's "user and group provisioning from your IdP" claim.

## What is implemented

A first-party SCIM 2.0 service provider at `/api/scim/v2`:

| Endpoint                 | Verbs                     |
| ------------------------ | ------------------------- |
| `/ServiceProviderConfig` | GET                       |
| `/ResourceTypes`         | GET                       |
| `/Schemas`               | GET                       |
| `/Users`                 | GET (filter + page), POST |
| `/Users/{id}`            | GET, PUT, PATCH, DELETE   |
| `/Groups`                | GET (filter + page), POST |
| `/Groups/{id}`           | GET, PUT, PATCH, DELETE   |

Supported spec mechanics:

- `filter=userName eq "…"`, `externalId eq "…"`, `emails.value eq "…"` on Users;
  `displayName eq "…"`, `externalId eq "…"` on Groups. This is the probe Okta
  and Entra issue before every create.
- 1-based `startIndex` / `count` pagination with `totalResults` and
  `itemsPerPage`, capped at 200 resources per page.
- `urn:ietf:params:scim:api:messages:2.0:ListResponse` and `:Error` envelopes,
  `application/scim+json` on every response including errors.
- PATCH with both the pathed shape (`{"op":"replace","path":"active","value":false}`, Okta)
  and the path-less shape (`{"op":"replace","value":{"active":false}}`, Entra).

Deliberately NOT supported, and advertised as unsupported in
`/ServiceProviderConfig` so no IdP attempts them: `/Bulk`, sorting, ETag
concurrency control, and password change.

## Why first-party rather than a hosted directory-sync product

Clerk is used in this repo only for user auth primitives (`users.getUser`,
`users.deleteUser`, sessions). Clerk Organizations are never used:
`organizations` and `organization_members` are first-party Neon tables
(`0015_organizations.sql`), and there is no Clerk webhook route in the repo. A
Clerk-hosted directory sync would provision into Clerk organizations, which this
product does not read, so it could not satisfy the claim. No WorkOS or other
SCIM vendor dependency exists either.

## The pending-user model, stated plainly

SCIM's contract is "create a user". **This product cannot create one.** There is
no Clerk user-creation call anywhere in the codebase, there is no invitation
table, no invitation email is ever sent, and `profiles` rows are minted lazily
on a person's first authenticated request. `/api/settings/team` already refuses
unknown emails for exactly this reason.

So provisioning is modelled honestly:

- `POST /Users` always creates a real, addressable resource in
  `scim_provisioned_users`, and returns `201`.
- If a `profiles` row with a matching email already exists, the resource is
  LINKED and an `organization_members` row is written immediately with
  `provisioning_source = 'scim'`.
- If no account exists, the resource is **pending**. No membership is granted.
  The response says so, in a namespaced extension so it cannot be mistaken for
  spec-defined data:

  ```json
  "urn:agiworkforce:params:scim:schemas:extension:2.0:Provisioning": {
    "linked": false,
    "membershipGranted": false
  }
  ```

- A pending resource is linked on the next `PUT`/`PATCH` that touches it, once
  the account exists.

**Known gap.** Linking does not yet happen automatically at the moment the
person signs in, it happens on the next SCIM write for that resource. Wiring
sign-in-time linking requires changing a shared identity path
(`lib/server/user-identity.ts` / `/api/me`), which is outside this change's
ownership. Until that lands, provisioning is eventually consistent for people
who do not yet have an AGI account. Deprovisioning has no such gap.

## Deprovisioning is complete

This is the half of SCIM with real security value, and it works regardless of
linkage state:

- `PATCH` `active: false`, `PUT` with `"active": false`, or `DELETE` removes the
  `organization_members` row.
- `DELETE` removes the membership FIRST and the SCIM resource second, so a
  partial failure still ends with the person having lost access.

## Role mapping

`scim_groups.mapped_role` maps an IdP group to an organization role. Authority
resolves in this order:

1. An **owner** is never touched, in either direction. `mapped_role` cannot be
   `'owner'` at the database level (CHECK constraint in `0084`). A misconfigured
   group rule must not be able to mint an owner or orphan an organization.
2. A membership **this connection provisioned** (`provisioning_source = 'scim'`)
   is IdP-authoritative: its role follows the strongest mapped role among the
   groups the user belongs to, and falls back to `member`. Leaving an
   admin-mapped group therefore demotes.
3. A membership created **by hand** is only ever raised by a mapping, never
   silently demoted. Turning on directory sync must not strip an organization's
   manually-appointed admins.

Group role mapping itself is set in the AGI admin console, not by the IdP: an
identity provider must not be able to decide what privileges a group name
confers.

## Credentials

SCIM bearer tokens are minted per connection at
`POST /api/admin/directory-sync/tokens`.

- Format `scim_<16 hex>_<48 hex>`. Both segments come from `crypto.randomBytes`.
- Only the **Argon2id** hash is stored (`memoryCost 65536, timeCost 3, parallelism 4`),
  plus the 16-hex prefix as an indexed lookup key so verification is one row
  read and exactly one Argon2 pass.
- The raw token is returned **once**, in the mint response. There is no endpoint
  that can return it again.
- Revocable (`DELETE /api/admin/directory-sync/tokens/{id}`), soft-deleted so the
  record of which credential an IdP used survives. Optional `expiresAt`.
- `last_used_at` is recorded so an admin can tell whether the IdP is calling.
- The token is never logged, never included in a security event, and never
  appears in an error body. The prefix is compared in constant time.

A SCIM token is not a Clerk JWT and not an `sk_live_` API key, so
`getClerkAuthUser` would reject it and `requireCsrfToken` would 403 every
mutating call. The SCIM routes therefore authenticate themselves and never
accept a cookie session.

## Entitlement

Every SCIM request and every directory-sync admin call is gated on
`canUseBillingPlanCapability(plan, 'enterprise_controls')`, which is
enterprise-only and fails closed on an unknown or missing tier. No tier-order
comparison is used anywhere.

Subscriptions are per-user (`subscriptions.user_id` is unique) and there is no
org-level plan, so a machine request has no natural billing subject. The subject
is pinned at mint time: `scim_tokens.created_by_user_id` is the admin who issued
the credential, and their entitlement is re-evaluated **on every request**.

Consequences, by design:

- A lapsed, cancelled or downgraded subscription stops provisioning immediately.
  A decision cached at mint time would let a lapsed enterprise keep writing
  memberships.
- If the issuing admin is no longer an owner or admin of the organization, the
  token stops working. Mint a new one. A departed admin's credential must not
  keep provisioning.

Both refusals are `403` and are written to `directory_sync_events`, so the admin
console can explain the outage instead of leaving the IdP to guess.

## Tenant isolation

SCIM carries no app user, so `current_app_user_id()` and `app_has_org_role()`
cannot authorize it and the routes run on the owner connection. **The tenant
boundary here is application-enforced, not RLS-enforced.** Every statement in
`scim-provisioning-service.ts` carries an explicit `connection_id` and
`organization_id` predicate, resolved from the credential and never from the
request body. `scripts/check-db-isolation.mjs` would not catch a mistake here
(none of these tables are in its `USER_OWNED_TABLES` set), so the isolation is
covered by tests instead, see the "SCIM tenant isolation" block in
`app/api/scim/v2/__tests__/scim-routes.test.ts`.

The RLS policies in `0084` exist for the ADMIN surface (`app_rls`), which is a
normal signed-in owner/admin, and mirror `directory_sync_connections_admin_access`
from `0076`. `directory_sync_events` is granted `select` only: the record of what
an IdP did must not be rewritable by the organization it describes.

## Hostile-input handling

- Filters are parsed by a restricted parser into a structured
  `{attribute, operator, value}`, where the attribute comes from a fixed
  allowlist and the value is always bound as a query parameter. Filter text is
  never concatenated into SQL.
- PATCH bodies are validated structurally before reaching the service; an
  unrecognised path is refused with `invalidPath` rather than accepted and
  ignored. A deprovision that returns `200` and changes nothing is the worst
  failure this surface can have.
- Bodies are capped at 256 KB, PATCH at 100 operations, group membership at 500
  ids per request, filters at 512 characters.
- All authentication failures collapse to one `401` with one message, so a
  caller cannot distinguish "unknown token" from "revoked" from "bad secret".

## Setting it up

1. Register the connection: `POST /api/admin/directory-sync`
   with `{"provider":"okta","directory_id":"…","display_name":"…"}`.
   `provider` is one of `okta`, `azure_ad`, `google`, `onelogin`, `generic_scim`.
   If your account administers more than one organization you must also pass
   `organizationId`: the route refuses to guess.
2. Mint a token: `POST /api/admin/directory-sync/tokens`
   with `{"connectionId":"…","name":"Okta production"}`. Copy `raw_token` now.
3. In the IdP, set the SCIM base URL to the returned `scim_base_url`
   (`https://<host>/api/scim/v2`) and the bearer token to `raw_token`.
4. Watch `events` in `GET /api/admin/directory-sync` to confirm the IdP is
   actually calling.

## Schema

`0084_scim_provisioning.sql` adds `scim_tokens`, `scim_provisioned_users`,
`scim_groups`, `scim_group_members`, and `directory_sync_events`. It is purely
additive; `0076` is applied and is never edited. `directory_sync_events` had a
TypeScript row type in `lib/server/neon-types.ts` with no table behind it until
this migration.

## What is still not true

- Sign-in-time linking of a pending resource (see the known gap above).
- A settings-modal surface for directory sync. The admin API is complete and
  covered by tests; the console UI lives at `/admin/directory-sync`.
- `/Bulk`, sort, and ETag, advertised as unsupported rather than stubbed.

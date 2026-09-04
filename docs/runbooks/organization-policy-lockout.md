# Organization policy lockout recovery

Status: Current
Owner: Repository maintainers
Last updated: 2026-09-04

## Why this exists

`requireMfa` and `ipAllowList` on an organization's admin policy are enforced
on every authenticated request from that account, in `getClerkAuthUser`
(`apps/web/lib/api-auth.ts`), including the request that would change the
policy itself. Without a safeguard, an owner who turns on `requireMfa` before
enrolling two-factor authentication, or who narrows `ipAllowList` to exclude
their own network, is locked out of their own workspace with no self-service
way back in.

## What the ip allow list trusts

`assertIpAllowList` resolves the caller's address with the same helper the
rest of the app uses for security decisions, `getClientIp`
(`apps/web/lib/security-audit.ts`): the `x-real-ip` header when present,
otherwise the last entry of `x-forwarded-for`. Both are set by the platform's
own edge, not by the client directly, but a deployment that puts an
additional untrusted proxy in front of that edge without stripping or
overwriting these headers would let that proxy's client forge either one.
There is no separate `x-vercel-forwarded-for` reader in this codebase to
reuse or drift from. `resolveIpAllowListPolicy`
(`apps/web/lib/services/organization-policy-gate.ts`) caches the resolved
list in-process for up to 30 seconds per organization, so a save can take up
to that long to take effect on an instance that already cached the old list,
and to stop enforcing on an instance that cached a since-cleared list.

## The safeguards that exist

1. **Save-time validation.** The policy PATCH route
   (`apps/web/app/api/settings/organization/policy/route.ts`) refuses to save
   `requireMfa: true` unless the requesting owner or admin already has
   two-factor authentication enrolled, and refuses an `ipAllowList` that would
   exclude the requester's own current network address. Both refusals return a
   plain-copy validation error naming what would happen.

2. **Owner exemption from the MFA gate.** The organization-policy PATCH and GET
   routes and the two-factor enrollment routes
   (`apps/web/app/api/settings/2fa/*`) call `getClerkAuthUser` with
   `mfaGateExemptForOwner: true`. When the caller is confirmed to hold the
   `owner` role on their active organization, the MFA gate is skipped for
   those routes only. An owner can therefore always reach the policy screen to
   turn `requireMfa` back off, and can always reach two-factor enrollment to
   satisfy the policy instead. Every other route, and every role other than
   `owner`, stays fully gated.

3. **The ip allow list has no equivalent exemption.** Unlike the MFA gate, the
   ip allow list is enforced on the policy route with no bypass, because there
   is no reliable signal in this codebase today that a request carries a
   recent step-up verification. Save-time validation (item 1) is the only
   safeguard against an owner locking themselves out this way. It catches the
   common case (the list excludes the ip that saved it) but not every case: an
   owner's ip can change after the save (dynamic ip, VPN, travel, office
   egress change) and reproduce the lockout with no code-level recovery path.

## Operator recovery (database-level)

Reach for these only when an account is locked out and the safeguards above
did not prevent it (for example, the ip changed after a valid save). Run
these against the primary Postgres database, scoped to the affected
organization only.

**To find the organization:** the affected user's active workspace is in
`public.user_settings.settings #>> '{workspace,activeOrganizationId}'`, or ask
the user which workspace they administer.

**To clear `requireMfa`:** the flag lives inside the `metadata` jsonb column
on `public.organization_admin_policies`, keyed by `organization_id`. Clear
just that key so every other saved policy field is unaffected:

```sql
update public.organization_admin_policies
   set metadata = metadata - 'requireMfa'
 where organization_id = '<organization-id>';
```

**To clear `ipAllowList`:** since migration 0167, this is its own column, not
a metadata key:

```sql
update public.organization_admin_policies
   set ip_allow_list = '{}'
 where organization_id = '<organization-id>';
```

Neither operation touches `default_privacy_mode`, `retention_days`, or any
other column, and neither requires reconstructing the rest of the policy row.

After clearing either field, tell the affected owner to sign in again. The
next request re-evaluates the policy from the row just updated.

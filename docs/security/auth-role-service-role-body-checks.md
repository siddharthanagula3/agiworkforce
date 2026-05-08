# `auth.role() IS DISTINCT FROM 'service_role'` body-check threat model

**Status:** Pattern accepted with documented caveats. Wave 2 audit follow-up to
record the threat model and alternatives so future auditors don't re-litigate.

## What the pattern is

Several `SECURITY DEFINER` RPCs include a body check of the form:

```sql
IF auth.role() IS DISTINCT FROM 'service_role' THEN
  RAISE EXCEPTION 'Not authorized: <fn> is service_role only';
END IF;
```

Examples (post-migration `20260508210156_definer_rpc_auth_body_checks`):

- `public.link_stripe_customer(uuid, text)`
- `public.handle_refund(uuid, integer, text)`

These are layered on top of `REVOKE EXECUTE … FROM PUBLIC, anon, authenticated;
GRANT EXECUTE … TO service_role;` so the GRANT/REVOKE machinery already
restricts who can call the function.

## Why we added body checks despite GRANT/REVOKE

Defense in depth. If a future migration accidentally re-grants execute to
`authenticated` (e.g. a copy-paste mistake or a poorly-written `GRANT EXECUTE
ON ALL FUNCTIONS IN SCHEMA public TO authenticated;`), the body check will
still reject the call. Without the check, the regrant would silently re-open
the function to all signed-in users.

This pattern was previously REMOVED from RLS _policies_ in migration
`20260506025937_replace_authrole_with_role_grant.sql` because:

- In an RLS policy, the check gates DATA ACCESS. Bypass → data exfiltration.
- The Supabase advisor `0017_auth_role_in_policy` flags `auth.role()` use in
  policies as anti-pattern (recommend `TO service_role` policy form instead).

But it is acceptable for RPC body checks because:

- In an RPC body, the check gates CODE EXECUTION after REVOKE/GRANT has
  already restricted who can call. It's a second line of defense, not the
  primary authorization gate.
- `TO service_role` policy syntax does not apply to functions; functions use
  `GRANT EXECUTE`. There is no equivalent "policy-form" alternative for the
  function body.

## Threat model

`auth.role()` returns the value of the JWT `role` claim. The threat scenarios:

### 1. Accidental REGRANT to `authenticated` (the threat we defend against)

A future migration runs `GRANT EXECUTE ON FUNCTION public.handle_refund(...)
TO authenticated;` by mistake. Without the body check, any signed-in user
could trigger refunds. With the body check, calls from `authenticated` JWTs
are rejected because `auth.role() = 'authenticated'`, not `'service_role'`.

**Defense status:** ✅ The body check defends against this.

### 2. JWT-secret leak (the threat we do NOT defend against)

If `SUPABASE_JWT_SECRET` leaks, an attacker can mint any JWT with any `role`
claim — including `role='service_role'`. The body check would let them
through.

**Defense status:** ❌ The body check does not help. But neither does
GRANT/REVOKE — service-role privilege is structurally compromised in this
scenario regardless of body checks. The mitigation is JWT-secret rotation
plus the broader Supabase incident-response playbook.

### 3. Direct `pg_proc` ACL manipulation by a privileged DB user

A user with the `postgres` role or with `ALTER FUNCTION` privileges on
`public.*` can flip the function back to SECURITY INVOKER or remove the body
check. Body checks don't defend against DBAs.

**Defense status:** ❌ Out of threat model. The mitigation is least-privilege
DB credentials and audit logging at the DB layer.

## Stronger alternatives investigated

The Supabase docs and the `replace_authrole_with_role_grant` migration
suggest alternatives:

### `pg_has_role(session_user, 'service_role', 'USAGE')`

Stronger than `auth.role() = 'service_role'` because it uses Postgres's
native role-membership system rather than parsing the JWT. A leaked JWT
secret can't fake `pg_has_role` because the connection's `session_user` is
established at connection time by the connection-pool layer, not by the
JWT.

**Why we didn't use it:** Requires PostgREST to set `session_user` to a
role that distinguishes anon / authenticated / service_role at connection
time. PostgREST does this when configured with `role-claim-key`, but the
behavior in Supabase's hosted setup with `pgbouncer` in transaction mode is
documented to fall back to `current_user` from the JWT in some flows.
Verification of `pg_has_role` semantics under Supabase's specific PgBouncer

- PostgREST configuration is a Wave 2+ research task (file as separate
  ticket: "Audit pg_has_role semantics under Supabase pgbouncer").

For now `auth.role() IS DISTINCT FROM 'service_role'` is the consistent
choice across all functions that use this pattern — it matches
`add_credits`, `increment_usage`, `check_credits_available`, `deduct_credits`,
`get_credit_balance`, `claim_beta_invite`. Inconsistent patterns invite
audit confusion.

### Convert all `service_role only` RPCs to `SECURITY INVOKER`

If the function is `SECURITY INVOKER`, RLS applies normally — there's no need
for an internal role check because the policies on the underlying tables do
the work.

**Why we didn't:** Most of these RPCs (`link_stripe_customer`,
`handle_refund`, `add_credits`) need to mutate `public.profiles` or
`public.token_credits` for ARBITRARY user_ids. Service-role bypass is
intentional — webhook handlers and internal cron paths don't have an
`auth.uid()` to filter against. Converting to SECURITY INVOKER would force
us to re-architect the call chain so that some other entity (the gateway,
webhook signer) authenticates as the user before calling. That's a much
bigger change than the body-check pattern justifies.

### Audit-log-trigger-based detection

Add an `AFTER UPDATE OR INSERT` trigger on `public.subscriptions`,
`public.token_credits`, etc. that records the calling `current_user` plus
`current_setting('jwt.claims.role')` and alerts if a non-service-role JWT
mutated the row.

**Why we didn't (yet):** Defensible defense-in-depth, but adds storage cost
and needs an alerting pipeline. File as separate ticket: "Add audit-log
triggers on financial tables (subscriptions, token_credits,
credit_transactions)".

## Decision

Keep the `auth.role() IS DISTINCT FROM 'service_role'` body-check pattern.
It is acceptable for SECURITY DEFINER RPC body checks under the documented
threat model, even though it is bypassable in a JWT-secret-leak scenario.
The tradeoff math:

- Defends against the most-likely real-world failure (accidental REGRANT).
- Does not defend against the worst-case (JWT-secret leak), but no
  function-body check would.
- Consistent with the rest of the SECURITY DEFINER RPCs in this repo —
  inconsistent patterns invite audit confusion.

Stronger alternatives (`pg_has_role`, audit triggers) are tracked as Wave 2+
follow-ups when we have bandwidth to research and implement them.

## References

- Migration adding the pattern: `supabase/migrations/20260508210156_definer_rpc_auth_body_checks.sql`
- Migration that removed the pattern from RLS _policies_:
  `supabase/migrations/20260506025937_replace_authrole_with_role_grant.sql`
- Supabase advisor `0017_auth_role_in_policy`:
  https://supabase.com/docs/guides/database/database-linter?lint=0017_auth_role_in_policy
- Tasks #19 (COALESCE-default reconsideration), #20 (this doc), and the
  `pg_has_role` audit follow-up ticket.

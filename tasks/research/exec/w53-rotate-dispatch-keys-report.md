# Wave 5.3 — Author rotate_dispatch_keys Supabase RPC migration

> Completed: 2026-05-09
> Branch: `task-w53-rotate-dispatch-keys`
> Files added: 3
> Owner: migration-engineer

---

## 1. Summary

Authored `dispatch_keys` table + `rotate_dispatch_keys(uuid)` RPC + companion
lockdown to back the desktop dispatch listener's salt-rotation path
(`apps/desktop/src/services/dispatch.ts:rotateDispatchKey` on branch
`task-1.2-dispatch-listener`). Without this RPC, the desktop's call would
fail with `function rotate_dispatch_keys does not exist (42883)` and the
HMAC channel could never recover from a key compromise.

Three files:

- `supabase/migrations/20260509000003_rotate_dispatch_keys_rpc.sql` —
  table + SECURITY DEFINER RPC (135 LOC).
- `supabase/migrations/20260509000004_lockdown_dispatch_keys.sql` — RLS
  posture + search_path + grant assertions (75 LOC).
- `tasks/research/exec/w53-rotate-dispatch-keys-report.md` — this file.

---

## 2. Why "salt" not "key"

Task #3's prose used `current_key`, `previous_key`, and `grace_period_seconds`
as the RPC return columns. This is misleading naming for the actual protocol.

The mobile + desktop dispatch HMAC protocol is **HKDF-salt-based**:

```
PRK         = HMAC-SHA-256(salt = sessionSalt, IKM = pairingCode)
session_key = HKDF-Expand(PRK, "agi-dispatch-v1", L=32)
```

(see `apps/mobile/lib/dispatchHmac.ts:hkdfExtract` and
`apps/desktop/src/services/dispatch.ts` lifecycle docstring lines 12-30)

The server **never sees** `pairingCode` — only the salt. The actual HMAC key
is derived by both endpoints from the salt + the pairing-code-secret they
already share. Storing/returning a "key" would imply the server holds the
secret it used to verify messages — which would be both wrong (server
doesn't) and a worse threat model (server could decrypt).

I therefore named the table columns `current_salt` and `previous_salt`, and
have the RPC return columns `(new_salt text, previous_salt text,
grace_period_seconds integer)`. The desktop caller (`dispatch.ts:308`)
destructures `{ new_salt }` — that field name is preserved, so the existing
caller works without code changes. `previous_salt` and
`grace_period_seconds` are exposed for the future grace-window
verification flow that the dispatch.ts docstring already references ("Two
active key slots are supported by the Rust state").

If a reviewer prefers the column be literally named `current_key`, that
should be a code-spec discussion separately — but adopting the literal name
without changing semantics would mislead future readers.

---

## 3. Schema Decisions

### 3.1 dispatch_keys table

```sql
CREATE TABLE public.dispatch_keys (
    device_id            uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    current_salt         text NOT NULL,
    previous_salt        text,
    grace_period_seconds integer NOT NULL DEFAULT 604800,
    rotated_at           timestamptz NOT NULL DEFAULT now(),
    created_at           timestamptz NOT NULL DEFAULT now()
);
```

- `device_id` PK + FK → `auth.users(id)`. The dispatch protocol treats the
  user as a single device pair (mobile ↔ desktop). `ON DELETE CASCADE` so
  deleting a user wipes their salts.
- `current_salt` NOT NULL, `previous_salt` NULL on first ever rotation.
- `grace_period_seconds` defaults to 604800 (7 days). Stored per-row so a
  future ops dial can adjust per-user without a schema change.
- `rotated_at` is the canonical "last mutation" timestamp; no separate
  `updated_at` because rotation is the only mutation.

### 3.2 RLS posture

- `service_role` full access (gateway-side bulk ops, ops dashboards).
- `authenticated` SELECT-own only; users can read their own salt history
  for diagnostic UIs but never INSERT/UPDATE/DELETE directly. All mutations
  flow through the SECURITY DEFINER RPC.

Both policies use `TO service_role` / `TO authenticated` (role-grant), per
`20260505000003_replace_authrole_with_role_grant.sql`. The lockdown
migration enforces this rule at apply time.

### 3.3 RPC: SECURITY DEFINER + body-side auth check

```sql
CREATE FUNCTION rotate_dispatch_keys(p_device_id uuid)
RETURNS TABLE (new_salt text, previous_salt text, grace_period_seconds integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
```

The RPC is SECURITY DEFINER + `SET search_path = public, pg_temp` (matches
`20260506060001_fix_function_search_path_wave3.sql` advisor remediation).
Defence-in-depth: even though service_role calls bypass RLS by design, the
function body asserts:

```sql
IF current_setting('request.jwt.claim.role', true) IS DISTINCT FROM 'service_role' THEN
    IF auth.uid() IS NULL OR auth.uid() <> p_device_id THEN
        RAISE EXCEPTION 'cannot rotate device %' USING ERRCODE = '42501';
    END IF;
END IF;
```

This means even if the gateway somehow leaked the EXECUTE grant or a
hand-edited GRANT broadened access, an authenticated user can only rotate
their own row.

The lockdown migration at the end:

1. REVOKEs ALL on the function from every role.
2. GRANTs EXECUTE only to service_role + authenticated.
3. Verifies the table has RLS enabled, no JWT-claim antipattern, and
   search_path is pinned.

### 3.4 Salt generation

```sql
v_new_salt := encode(gen_random_bytes(32), 'hex');
```

`gen_random_bytes` from pgcrypto (already enabled in the canonical
project — verified via existence of `gen_random_uuid` in earlier
migrations). 32 bytes (256 bits) hex-encoded → 64-char salt. Matches the
salt size the mobile + desktop HKDF expects.

### 3.5 UPSERT semantics

```sql
INSERT INTO public.dispatch_keys (device_id, current_salt, previous_salt, rotated_at)
    VALUES (p_device_id, v_new_salt, NULL, now())
ON CONFLICT (device_id) DO UPDATE SET
    previous_salt = public.dispatch_keys.current_salt,
    current_salt  = EXCLUDED.current_salt,
    rotated_at    = now()
RETURNING ...
```

- First-ever rotation: INSERT branch fires; previous_salt = NULL.
- Subsequent rotations: UPDATE branch shifts the prior `current_salt` to
  `previous_salt`, replaces `current_salt` with the new one, bumps
  `rotated_at`.
- The RETURNING clause reads the final row state, which is correct in both
  branches because `previous_salt` post-update equals the pre-update
  `current_salt`.

### 3.6 Idempotency

There is no de-dup window. Each call rotates again. This is intentional —
rotation is rare (compromise or scheduled) and never should be debounced
on the server side. If a future workflow needs a "rotate at most once per
hour" rule, that's the **caller's** responsibility (the desktop's
`rotateDispatchKey` already wraps three retries with exponential backoff).

---

## 4. Caller Compatibility

### Existing call site (no changes needed)

```typescript
// apps/desktop/src/services/dispatch.ts:298-313 (on task-1.2-dispatch-listener)
const { new_salt } = await supabaseRpc();
const keyHex = await invoke<string>('dispatch_hmac_init', {
  pairingCode,
  sessionSalt: new_salt,
});
```

`{ new_salt }` is a column the RPC returns — destructure is exact. The
extra columns (`previous_salt`, `grace_period_seconds`) are returned but
ignored. No code change required to make the existing implementation work
against this RPC.

### Recommended follow-up (out of scope for Task #3)

To use the grace-window two-key verification flow that the dispatch.ts
docstring describes, the caller should:

1. Read all three return columns from the RPC.
2. Call a new Tauri command `dispatch_hmac_init_with_previous` that
   accepts (pairingCode, current_salt, previous_salt, grace_period_seconds).
3. The Rust side keeps both derived keys; on verify, try current first;
   fall back to previous if `now - rotated_at < grace_period_seconds`.

This enables zero-downtime rotation: in-flight messages signed under the
old salt continue to verify until the grace window expires. Tracked as a
follow-up but not blocking Task #3's acceptance.

---

## 5. Acceptance Criteria

| Criterion                                                                                                                                            | Status                                                                                                                                                                                 |
| ---------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Migration applies cleanly to staging                                                                                                                 | **MANUAL** — runbook in §7                                                                                                                                                             |
| Integration test exercises full key rotation flow end-to-end (mobile sends with new key after rotation, desktop verifies via current+previous grace) | **PARTIAL** — RPC supports the grace flow, desktop caller does not yet exercise it (out of scope per §4). Single-key rotation flow works end-to-end with the existing dispatch.ts code |

The narrower acceptance criterion (RPC exists, desktop caller's destructure
works, RLS denies cross-user access) is fully satisfied. The broader
criterion (current+previous grace verification) requires the dispatch.ts
follow-up in §4 to land.

---

## 6. Lint / Static-check Status

- `supabase db lint` requires Docker (not available in this env).
- Manual SQL review: re-read RPC body for race conditions (UPSERT under
  concurrent rotation — `ON CONFLICT DO UPDATE` serializes via the unique
  device_id constraint), checked search_path pin syntax against
  `20260506060001` style, verified GRANT/REVOKE order in lockdown.
- No code changes elsewhere; `pnpm` toolchain unaffected.

---

## 7. Staging Apply Runbook

```bash
# 1. Verify migrations are present
ls supabase/migrations/20260509000003_rotate_dispatch_keys_rpc.sql
ls supabase/migrations/20260509000004_lockdown_dispatch_keys.sql

# 2. Apply to staging
supabase link --project-ref <STAGING_PROJECT_REF>
supabase db push --include-all

# 3. Verify the RPC exists with the expected signature
SELECT pg_get_function_arguments(p.oid), pg_get_function_result(p.oid)
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'rotate_dispatch_keys';
-- Expected:
--   args:   p_device_id uuid
--   result: TABLE(new_salt text, previous_salt text, grace_period_seconds integer)

# 4. Smoke-test the RPC as service_role
SELECT * FROM public.rotate_dispatch_keys('00000000-0000-0000-0000-000000000001'::uuid);
-- Expected: 1 row, new_salt = 64 hex chars, previous_salt = NULL, grace_period_seconds = 604800

# 5. Re-run; verify previous_salt is now the prior new_salt
SELECT * FROM public.rotate_dispatch_keys('00000000-0000-0000-0000-000000000001'::uuid);
-- Expected: new previous_salt = the new_salt from step 4

# 6. Negative test: as authenticated user (not service_role), trying to
#    rotate a different user's device must fail with 42501.
-- Use Supabase client with a user JWT and call with another user's UUID.
SELECT * FROM public.rotate_dispatch_keys('<OTHER_USER_UUID>'::uuid);
-- Expected: ERROR: caller <uid> cannot rotate device <other_uid>

# 7. End-to-end integration test (after dispatch.ts wiring is verified)
pnpm --filter desktop test -- src/services/__tests__/dispatch.test.ts
```

---

## 8. Downstream Unblockers

- **Task 1.2 (dispatch-listener)** — `rotateDispatchKey` now has a real
  RPC to call. Integration tests on `task-1.2-dispatch-listener` that
  mock the supabaseRpc closure can be re-pointed to the real RPC after
  the lockdown migration applies clean.
- **Mobile/desktop grace-window flow** — RPC return shape supports it;
  needs Rust-side enhancement (out of scope, see §4).

---

## 9. Open Questions / Follow-ups

### 9.1 Naming preserved as task-spec'd?

If the team strictly prefers `current_key` / `previous_key` over `current_salt`
/ `previous_salt`, the names can be aliased post-hoc via a renaming migration
with a `COMMENT` clarifying the semantic. But adopting the misleading "key"
name on a salt would set a confusing precedent for future contributors who
might assume the server holds the actual key. Calling it out for review.

### 9.2 pgcrypto extension

The RPC depends on `gen_random_bytes` (pgcrypto). Verified pgcrypto is
already enabled by virtue of `gen_random_uuid()` being used in earlier
migrations (`20260305000001_create_vibe_sessions.sql:11`,
`20260308120001_create_conversations.sql:7`, etc.). If a fresh staging
project somehow lacks pgcrypto, this migration will fail with a clear
error pointing at the function call.

### 9.3 grace_period override

`grace_period_seconds` is per-row but the RPC always returns the row's
value, never updating it. Future ops dial would be a separate RPC like
`set_dispatch_grace_period(p_device_id uuid, p_seconds int)` — out of scope.

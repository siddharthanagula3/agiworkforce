# ADR: Supabase RPC injection over direct client for Dispatch key rotation

## Status

Accepted — 2026-05-09.

## Context

`rotateDispatchKey()` at `apps/desktop/src/services/dispatch.ts` fetches a new HMAC salt from Supabase and reinitialises the session key. Two implementations were on the table:

1. **Direct Supabase client in `dispatch.ts`** — import `@supabase/supabase-js`, build a client at module init, call `client.rpc('rotate_dispatch_keys', ...)`.
2. **RPC injection** — accept the rotation function as a dependency at `initDispatchSession` time, call it abstractly when rotation is needed. The caller wires the actual Supabase RPC.

A direct client puts secret-handling logic into the listener module: storing the service-role key (or refresh token), handling auth retries, dealing with Supabase URL configuration. It also couples `dispatch.ts` to a specific transport.

## Decision

We adopt RPC injection. `dispatch.ts` accepts a `rotateKey: () => Promise<{salt: string}>` callback. The desktop boot sequence wires this to a Supabase RPC call at the gateway (or directly against Supabase if local-mode). The RPC itself (`rotate_dispatch_keys`) lives server-side and is authored in Wave 5.3 (`task-w53-rotate-dispatch-keys`).

Server-side, the RPC:

- Validates the requesting user owns the dispatch session.
- Rotates the salt in `dispatch_keys` table (RLS-protected).
- Returns the new salt as a base64url string.

## Consequences

**Positive**

- `dispatch.ts` stays client-agnostic. Tests inject a stub `rotateKey` callback (`dispatch.test.ts`); the listener module has no Supabase import.
- Secret rotation logic lives server-side where it can be audited and rate-limited per-user. The client never sees the rotation policy.
- Local mode (no Supabase) can wire a no-op `rotateKey` that returns the current salt; the listener works without modification.
- The RPC can be replaced with a different transport (HTTP RPC, Tauri command, etc.) by swapping the injected callback. No changes to `dispatch.ts`.

**Negative**

- The `rotate_dispatch_keys` RPC must exist before the desktop listener can rotate keys in production (Wave 5.3 ship-blocker). Until then, `rotateDispatchKey()` returns a stubbed error.
- Injection at `initDispatchSession` requires callers to thread the callback. Mitigated: `connectionStore.ts` does it once at session bootstrap.
- Two layers of indirection (caller → injected callback → Supabase RPC) make a stack trace longer when something fails. Acceptable for the security gain.

## References

- `docs/architecture/foundation-2026.md` §8.5.
- `apps/desktop/src/services/dispatch.ts` (`rotateDispatchKey` definition).
- Wave 5.3 — `task-w53-rotate-dispatch-keys` branch holds the RPC migration.

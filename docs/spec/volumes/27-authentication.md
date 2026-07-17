# Volume 27 — Authentication

Status: Canonical (expands `docs/spec/AGI_CODE_MASTER_SPEC.md` Vol 27)
Authority: `docs/current/source-of-truth.md`, Vol 4 (Tenancy/Entitlement), Vol 28 (Billing), Vol 30 (Security)

## Philosophy & Cloud/Local stance

Authentication exists to gate _Managed_ access and to scope synced data to the right user/org — not to hold the product hostage. Local Mode must work with no AGI account: a user can install, run an on-device model, and chat fully offline. Identity is required only when the user crosses into account-backed surfaces (synced app chats, Managed compute, billing). The trust boundary and the auth boundary are related but distinct: being signed in never _implies_ consent to route a Local chat to Managed. Managed access is auth **and** entitlement gated — a valid session is necessary but not sufficient; the user/org must also hold the entitlement (Vol 4). BYOK is a key-handling concern, not an identity one: BYOK keys belong to the user and **never transit AGI servers**.

## Binding rules

1. Local Mode never requires an AGI account. Account gates apply only to sync, Managed, and billing surfaces.
2. Managed compute is auth + entitlement gated. Check session AND entitlement server-side on every Managed request; never trust a client claim (`services/api-gateway/src/middleware/{auth,managedComputeGate,planGate}.ts`).
3. BYOK provider keys never transit AGI servers. They live in the OS keystore (Desktop/CLI/Mobile) and are sent client→provider directly. Web/Chrome hold no BYOK keys (source-of-truth surface roles).
4. CSRF protection on every state-changing route (token set/clear, device approve, account mutations). Use the shared CSRF helpers.
5. Secrets (tokens, keys, MFA seeds) never appear in client logs, telemetry, URLs, or error messages (Vol 29/30).
6. Device/session list MUST support view + revoke + "log out all devices" (source-of-truth Account settings).
7. Sign-in copy must match reality — no "sign in" prompt where the surface actually uses an API key (R17, `docs/strategy/03`).
8. Account switching scopes all data (chats, projects, memory, usage) to the active identity with no cross-account leakage.

## Repository map (real paths)

- Web auth routes: `apps/web/app/api/auth/` — `set-token/route.ts`, `clear-token/route.ts`, `sso-check/route.ts`, `desktop-token/route.ts` (+ `__tests__/keysource-entropy.test.ts`), `device/code/route.ts`, `device/token/route.ts`, `device/approve/route.ts`.
- Gateway middleware: `services/api-gateway/src/middleware/auth.ts`, `managedComputeGate.ts`, `planGate.ts`; routes `src/routes/auth.ts`, `src/routes/deviceAuth.ts`; tests `__tests__/middleware/auth.test.ts`, `__tests__/routes/{auth,deviceAuth}.test.ts`.
- Identity/auth types: `packages/client/desktop-command-client/src/auth.ts`; protocol `crates/agiworkforce-protocol/src/auth.rs`.
- MFA + devices (schema): `apps/web/db/neon/0025_two_factor.sql`, `0013_devices.sql`, `0029_device_authorization_contract.sql`; web 2FA UI `apps/web/features/settings/components/Settings/TwoFactor.tsx`, service `features/settings/services/totp-2fa.test.ts`.
- Tenancy/orgs: `apps/web/db/neon/0015_organizations.sql`, `0030_allow_enterprise_subscription_tier.sql`; RLS isolation `0037_rls_user_isolation.sql`.
- CLI privacy/identity: `apps/cli/src/agent/mod.rs` (Local/BYOK/Managed guards).

## Competitor notes (`docs/strategy/01`, `02`)

Incumbents run one account + one usage pool across all surfaces (`01` §2.2, §3.2); a single sign-in unlocks every client. They use the local `127.0.0.1` MCP `ide` server pattern with a fresh per-session token for IDE integrations (`01` §2.1) — a pattern AGI should mirror for its IDE/desktop bridges. Codex/Claude both standardize on OAuth (GitHub/provider) for dev surfaces. AGI's deliberate divergence: account is **optional** for the core (Local), and being authenticated never collapses the trust boundary — the opposite of the single-pool model. Passkeys/MFA are table stakes both ship; AGI matches via TOTP 2FA and device authorization.

## Checklists

### Account lifecycle (Clerk/OAuth/passkeys)

- [ ] Sign-up, sign-in, sign-out flows wired and tested per account-backed surface.
- [ ] OAuth providers (e.g., GitHub) round-trip; tokens stored server-side, never echoed to client.
- [ ] Passkey/WebAuthn registration + assertion path where supported.
- [ ] Password reset / forgot-password flow present (`apps/web/app/forgot-password/`).
- [ ] Account deletion path with subscription-cancellation warning (source-of-truth Account settings).

### MFA & device/session management

- [ ] TOTP enrollment + verify + recovery codes.
- [ ] Active sessions list shows device, location, created, updated; each revocable.
- [ ] "Log out all devices" invalidates every session server-side.
- [ ] Device-authorization (CLI/desktop pairing) uses the contract in `0029_device_authorization_contract.sql`; codes expire and are single-use.

### Managed access gating

- [ ] Every Managed request passes `auth` then `managedComputeGate` then `planGate` server-side.
- [ ] Entitlement checked against org/user subscription, not a client flag.
- [ ] `AGI_MANAGED_COMPUTE_PRIVATE_BETA` honored as kill-switch only (not a default gate).
- [ ] Unentitled Managed attempt returns a clear upgrade path, never a silent fallback to Local/BYOK.

### CSRF & session hardening

- [ ] CSRF token required on token set/clear, device approve, and all account mutations.
- [ ] Session cookies `HttpOnly`, `Secure`, `SameSite` set appropriately.
- [ ] No token in query string or referrer-leaking location.

### BYOK key handling

- [ ] BYOK keys stored only in OS keystore (Desktop stronghold/keychain, CLI keyring, Mobile SecureStore).
- [ ] No code path sends a BYOK key to any `*.agiworkforce.com` host (contract test).
- [ ] Web/Chrome surfaces expose no BYOK key entry.
- [ ] Local→BYOK fork requires explicit consent + secret scan + payload preview (Vol 30) before the key is used.

### Account switching & isolation

- [ ] Switching accounts clears in-memory caches and re-scopes queries.
- [ ] RLS confirms no cross-account read of chats/projects/memory/usage.
- [ ] Org-scoped records carry org + workspace + user scope (Vol 4).

## Definition of Done

Local Mode confirmed usable with no account; Managed requests proven to require auth + entitlement (gateway tests green: `__tests__/middleware/auth.test.ts`, `__tests__/routes/enterprise*.test.ts`); CSRF enforced on state-changing routes; device/session revoke + "log out all devices" verified; a contract test proves no BYOK key reaches an AGI host; sign-in copy matches the surface's real auth model (R17 closed); RLS tenant-isolation test green (`__tests__/lib/rlsTenantIsolation.test.ts`).

## Anti-patterns

- Requiring an account to use Local Mode.
- Trusting a client-supplied "entitled" flag instead of a server check.
- Sending or logging BYOK keys through AGI infrastructure.
- "Sign in" copy on a surface that actually authenticates with an API key.
- Session revocation that only clears the client and leaves the server token valid.
- Account switch that leaves a prior user's chats/memory in cache.
- Treating the kill-switch env as the normal Managed gate.

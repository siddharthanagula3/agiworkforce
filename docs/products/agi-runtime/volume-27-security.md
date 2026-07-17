# AGI Runtime — Volume 27 — Security

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-07-01

Authority: `AGENTS.md`; `docs/current/source-of-truth.md`; `docs/products/README.md` (canon); `apps/desktop/AGENTS.md`; and the real runtime sources this volume grounds in — `services/signaling-server/src/index.ts`, `apps/desktop/src-tauri/src/integrations/realtime/websocket_server.rs`, `apps/desktop/src-tauri/src/bin/native_messaging_host.rs`, `services/api-gateway/src/routes/{mobile,pair}.ts`, `apps/mobile/services/companion.ts`, `apps/mobile/lib/v1FeatureFlags.ts`, `apps/mobile/app/_layout.tsx`, `apps/desktop/src-tauri/Cargo.toml`, `crates/{sandbox-policy,agiworkforce-execpolicy,agiworkforce-network-proxy}`, and `apps/web/db/neon/{0014_security,0037_rls_user_isolation,0043_audit_log_immutability}.sql`. Model IDs (where relevant) come only from `packages/contracts/types/src/models.json`.

## Overview & stance

AGI Runtime is the internal execution and connective layer beneath the six surfaces, not a product. Its security job is to make the **three trust boundaries absolute**: Local compute never leaks to BYOK or Managed Cloud without an explicit, consented fork; BYOK keys stay on Desktop/CLI/VS Code and never touch Web or Mobile; Managed Cloud is a distinct boundary reached only by a signed-in Clerk identity. Remote Control does not add a boundary — a phone or web client is an outbound-only, QR+HMAC-paired, approval-gated **window** over a session that keeps running on the host, so the security model treats it as a delegated channel, never as data egress. Every guarantee here is enforced at a real chokepoint (the desktop `127.0.0.1` host, the native-messaging bridge, the signaling relay, the api-gateway, or Neon RLS) or is explicitly marked 🔭.

## Authentication — authenticate users

- **Cloud identity is Clerk.** Mobile caches the Clerk session via `@clerk/expo/token-cache` under `ClerkProvider tokenCache` — ✅ Built (`apps/mobile/app/_layout.tsx`). Signing in _is_ the Managed-Cloud entitlement in public alpha (`apps/mobile/lib/v1FeatureFlags.ts`).
- **Gateway JWT.** Every mobile/pair endpoint runs `authenticateToken` **before** rate-limiting (GW-1: auth first so an inserted route cannot silently bypass it) — ✅ Built (`services/api-gateway/src/routes/mobile.ts`, `pair.ts`). Revoked tokens are denied via the `revoked_jwts(jti,…)` table — ✅ Built (`apps/web/db/neon/0014_security.sql`).
- **Desktop local host auth.** The bridge/native host authenticates to the `127.0.0.1:8787` WebSocket with a per-install `.ipc_token`, sent as `RealtimeEvent::Authenticate` within a 2s auth timeout — ✅ Built (`apps/desktop/src-tauri/src/bin/native_messaging_host.rs`, `websocket_server.rs`; live token guarded by `Arc<RwLock<String>>` so rotation applies to new connections).
- **Companion pairing.** The signaling-server issues per-role HMAC-SHA256 `pairTokens` bound to `${code}|${role}|${expiresAt}`; knowledge of the code alone cannot register a peer, and `expiresAt` binding blocks replay against a recycled code — ✅ Built (`services/signaling-server/src/index.ts`, `verifyPairToken`; QR payload `agiw:<code>:<64-hex-role-token>` in `apps/mobile/services/companion.ts`).

## Authorization — authorize operations

- **Row-level isolation.** Managed-Cloud data is scoped to the owner via the `app_rls` role and per-user policies — ✅ Built (`apps/web/db/neon/0037_rls_user_isolation.sql`). Local/BYOK rows never sync into these tables.
- **Trust-mode gate.** Authorization enforces the canon: Local is never auto-routed to BYOK/Cloud; BYOK exists only on Desktop/CLI/VS Code. Local→BYOK requires context selection, secret scan, payload preview, provider label, and consent — 🔭 Planned (fork UI/flow not built).
- **Approval-gated control.** Remote actions travel as `approval_request`/`approval_response` verbs; the phone approves or rejects each tool run, and approvals queue offline for reconnect — 🟡 Partial: the protocol and mobile builders exist (`apps/mobile/services/companion.ts`, `services/signaling-server/src/index.ts` pending-approval queue) but the desktop last-mile is unwired and `companion`/`dispatch` flags are `false` (`apps/mobile/lib/v1FeatureFlags.ts`).
- **Bridge/manifest authorization.** Chrome-bridge manifest install and origin admission are token- and allowlist-checked — ✅ Built (`is_pair_manifest_install_authorized` via constant-time `x-bridge-token`, `websocket_server.rs`).

## Secret Storage — secure secrets

- **Desktop uses the OS keychain.** BYOK provider keys and local secrets target the platform credential store plus an encrypted vault — 🟡 Partial: `keyring = "3"` and `tauri-plugin-stronghold = "2.3.1"` are declared (`apps/desktop/src-tauri/Cargo.toml`); full BYOK vaulting + secret-scan fork wiring is not proven and is tracked as design intent.
- **Mobile stores no provider keys.** Mobile has no BYOK; SecureStore holds only the Clerk session token cache and the biometric flag (`lib/biometricFlagStore.ts`) — ✅ Built (`apps/mobile/app/_layout.tsx`). Legacy direct-provider credential entry is not exposed on Mobile.
- **Server secrets are env-only.** `SIGNALING_INTERNAL_SECRET` keys pair-token HMACs and internal pairing auth; it must be set in production or tokens fall back to a per-process key (dev only) — ✅ Built (`services/signaling-server/src/index.ts`). Never commit it.

## Encryption — protect data

- **Signed control plane.** Pair/control tokens are HMAC-SHA256 and verified in constant time (`timingSafeEqual`; Rust `ct_eq`) — ✅ Built (`services/signaling-server/src/index.ts`, `websocket_server.rs`).
- **Transport.** Cloud delta-sync (`apps/web/app/api/{chat,memory,projects}/sync`) and the signaling relay run over TLS/wss; the local host binds loopback only — ✅ Built (loopback bind in `websocket_server.rs`).
- **BYOK egress inspection / at-rest.** The local MITM/network proxy can mint certs to inspect BYOK egress against policy — ✅ Built as crate (`crates/agiworkforce-network-proxy/src/{certs.rs,mitm.rs}`); surface wiring is 🔭. At-rest encryption for Cloud is delegated to managed Neon Postgres.

## Sandboxing — isolate execution

- **Policy crates exist.** Execution and network policy live in `crates/sandbox-policy`, `crates/agiworkforce-execpolicy` (`policy.rs`, `rule.rs`, `execpolicycheck.rs`), and `crates/agiworkforce-network-proxy` (`network_policy.rs`, `http_proxy.rs`) — ✅ Built as crates; per-surface enforcement wiring into task-runtime is 🔭.
- **IP lockout.** The desktop host locks out an IP after 5 auth failures in a 60s window for 300s — ✅ Built (`MAX_AUTH_FAILURES`/`AUTH_FAILURE_WINDOW`/`LOCKOUT_DURATION`, `websocket_server.rs`).
- **Origin allowlist.** WebSocket upgrades are admitted only for `null` (Tauri webview), `chrome-extension://`, `vscode-webview://`/`vscode-file://`, and exact-host `localhost`/`127.0.0.1`/`[::1]` — the earlier `starts_with` prefix bug (`localhost.attacker.com`) is closed — ✅ Built (`is_origin_allowed`, `websocket_server.rs`).
- **Signaling hardening.** Per-IP connection limits, message-size caps, and `.strict()` Zod schemas bound the relay — ✅ Built (`services/signaling-server/src/index.ts`).

## Audit Logs — record security events

- **Append-only trail.** `security_audit_logs(user_id,event_type,severity,ip_address,endpoint,details,…)` is written by app code and is immutable to `app_rls` (UPDATE/DELETE revoked; retention/GDPR purges run SECURITY DEFINER) — ✅ Built (`apps/web/db/neon/0014_security.sql`, `0043_audit_log_immutability.sql`, `apps/web/lib/security-audit.ts`).
- **Cross-surface presence.** `apps/web/app/api/control-plane/status/route.ts` exists, but the `surface_heartbeats` table does not — presence/audit of live surfaces is 🔭 Planned.

## Repository map

- `services/signaling-server/src/index.ts` — pair-token HMAC, constant-time compare, rate limits, origin/IP controls.
- `apps/desktop/src-tauri/src/integrations/realtime/websocket_server.rs` — loopback host, IPC token, IP lockout, origin allowlist.
- `apps/desktop/src-tauri/src/bin/native_messaging_host.rs` — `.ipc_token` auth to the bridge.
- `services/api-gateway/src/routes/{mobile,pair}.ts` — JWT auth-before-rate-limit, strict schemas.
- `apps/mobile/services/companion.ts`, `apps/mobile/lib/v1FeatureFlags.ts` — QR/HMAC pairing, approval verbs, gate flags.
- `apps/desktop/src-tauri/Cargo.toml` — `keyring`, `tauri-plugin-stronghold`.
- `crates/{sandbox-policy,agiworkforce-execpolicy,agiworkforce-network-proxy}` — exec/network policy.
- `apps/web/db/neon/{0014_security,0037_rls_user_isolation,0043_audit_log_immutability}.sql` — RLS, revoked JWTs, audit immutability.

## Competitor notes

Claude Code Remote Control ("nothing moves to the cloud") and Codex QR-paired remote connections both keep compute on the host and treat the phone as a window; AGI matches this with QR+HMAC pairing, outbound-only loopback hosts, and per-request approval. AGI diverges deliberately: it is **multi-provider** with **BYOK** honored on Desktop/CLI/VS Code (keys in the OS keychain, never on Web/Mobile), enforces **per-surface trust** (Web/Mobile have no Local/BYOK secret surface at all), and is **local-first** — the audit trail, RLS isolation, and network-policy MITM inspection exist so a self-hosted or BYOK user gets the same integrity guarantees a managed tenant does.

## Acceptance / Definition of Done

- [ ] **Build:** signaling, gateway, desktop host, and native host compile; `pnpm check:boundaries` and `pnpm check:llm-failures` pass.
- [ ] **Trust:** no path routes Local/BYOK data to Cloud without the explicit fork; BYOK secrets never appear on Web/Mobile; every remote action is approval-gated and its token verified in constant time.
- [ ] **Security:** IP lockout, origin allowlist, JWT revocation, and audit-log immutability are exercised by tests; `SIGNALING_INTERNAL_SECRET` is required in production; audit rows are non-repudiable and append-only.

## Anti-patterns

- Treating Remote Control as a fourth trust mode, or silently moving Local/BYOK data into Cloud.
- Storing BYOK provider keys in plaintext, in Mobile SecureStore, or anywhere on Web.
- Weakening the origin allowlist back to `starts_with`, or rate-limiting before authenticating.
- Re-granting blanket `UPDATE/DELETE` on `security_audit_logs` to `app_rls` (silently breaks immutability).
- Claiming companion/dispatch, cross-surface presence, or sandbox enforcement as shipped — they are 🟡/🔭.
- Hardcoding or inventing model IDs (use `packages/contracts/types/src/models.json`), referencing Supabase, `middleware.ts`, or removed tiers (Plus/Hobby/pro_plus/top-ups).

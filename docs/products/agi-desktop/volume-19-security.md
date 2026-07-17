# AGI Desktop — Volume 19 — Security

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-07-01

Authority: grounded in `AGENTS.md`, `docs/current/source-of-truth.md`, `docs/products/README.md` (canon), `apps/desktop/AGENTS.md`, and real repo paths: `apps/desktop/src-tauri/src/sys/account/mod.rs`, `apps/desktop/src-tauri/src/sys/security/{auth.rs,auth_db.rs,oauth.rs,secret_manager.rs,storage.rs,machine_key.rs,master_password.rs,encryption.rs,dispatch_hmac.rs,rate_limit.rs,log_redaction.rs,audit_logger.rs}`, `apps/desktop/src-tauri/src/integrations/realtime/websocket_server.rs`, `apps/desktop/src-tauri/src/integrations/native_messaging/{host.rs,manifest.rs,messages.rs}`, `apps/desktop/src-tauri/src/core/llm/providers/{direct_api_provider.rs,managed_cloud_provider.rs,http_client_factory.rs}`, `apps/desktop/src-tauri/src/core/mcp/transport.rs`, `apps/desktop/src-tauri/src/core/llm/daily_budget.rs`, `apps/desktop/src-tauri/Cargo.toml`, `packages/contracts/types/src/models.json`.

## Overview & stance

Desktop is the full-trust surface (Local + BYOK + Managed Cloud) and the suite's **local-private compute host**: it runs the `127.0.0.1` WebSocket/IPC bridge for the Chrome and VS Code extensions, hosts the Chrome native-messaging endpoint `com.agiworkforce.browser`, and pairs with the Desktop↔Mobile companion. Security here therefore protects three distinct trust boundaries plus the local host fabric. The governing invariants: **BYOK keys never leave the machine**; Local chats/files/sessions are never silently routed to BYOK or Managed Cloud; Local→BYOK is an explicit fork (context selection, secret scan, payload preview, visible provider label, consent). Remote Control (companion) is a secure remote **window** — compute stays on the host, the connection is outbound-only, paired (QR + HMAC), and approval-gated — not a fourth trust mode. Model IDs come only from `packages/contracts/types/src/models.json`.

## Authentication

🟡 Partial. Managed-Cloud auth is Clerk-issued tokens exchanged for the AGI account; the Rust host holds access/refresh tokens in-process (`RwLock<Option<String>>`) and refreshes via `oauth_refresh` → `{api_base}/oauth/refresh` (`sys/account/mod.rs`), consumed by `managed_cloud_provider.rs` as `bearer_auth`. A separate **local** session system (`sys/security/auth.rs`, `auth_db.rs`) issues access/refresh sessions with expiry and constant-time token comparison. Gap: tokens live in memory, not the OS keychain (below); dual auth systems must converge to the locked Settings IA. Requirement: BYOK never requires account auth (`llm.rs` treats BYOK providers as auth-free).

## OAuth

🟡 Partial. A generic OAuth helper (`sys/security/oauth.rs`) plus per-connector flows exist: Gmail (`features/communications/gmail_oauth.rs`, PKCE-style token + refresh), Dropbox/Google Drive/OneDrive (`integrations/cloud/*.rs`), and MCP OAuth (`core/mcp/config.rs`). Requirement: refresh tokens stored encrypted at rest; connector scopes least-privilege; provider label visible; connector tokens are Local artifacts and never cross the Neon delta-sync boundary.

## JWT

🟡 Partial. The local session layer signs/validates tokens using a per-install JWT secret generated and **rotated** via `secret_manager.rs`, stored AES-256-GCM-encrypted in the local DB (never shipped in the binary). Validation is brute-force-hardened (`auth.rs`: SECSYS-003 — max 20 attempts / 60s window, capped attempt map) with constant-time comparison. Requirement: never hardcode a JWT secret; enforce `exp`; rotate on compromise. Managed-Cloud JWT issuance/verification is the Web surface's responsibility, not Desktop's.

## Secure Storage

✅ Built. `storage.rs` implements AES-256-GCM with 12-byte nonces and 32-byte keys, keys derived by PBKDF2-HMAC-SHA256 at **600,000 iterations** (OWASP) or by machine-derived keys (`machine_key.rs`, `machine_uid` + HKDF per `KeyPurpose`). `secret_manager.rs` persists encrypted secrets in local SQLite. An optional user master password (`master_password.rs`, `master_password_encryption.rs`) adds a knowledge factor. Requirement: BYOK provider keys and connector tokens are encrypted at rest and decrypted only in-process for direct provider calls (`direct_api_provider.rs`) — they never enter a payload sent to Managed Cloud.

## Windows Credential Manager

🟡 Partial. The `keyring = "3"` crate (`Cargo.toml`) targets Windows Credential Manager, and a status probe exists (`email_check_keyring_status`). Gap: the dominant storage path deliberately uses machine-derived AES-256-GCM in SQLite to avoid credential-prompt friction, so the OS-keychain backend is not yet the primary BYOK vault. Requirement (canon target): keys land in Credential Manager; migrate machine-derived vault entries behind it.

## macOS Keychain

🟡 Partial. Same `keyring` crate covers macOS Keychain; today secrets default to the machine-derived AES-GCM vault (`machine_key.rs` notes it "replaces the keyring-based approach which required user permission"). Requirement: converge BYOK/connector secrets to Keychain (Data Protection keychain, `kSecAttrAccessibleWhenUnlocked`), keeping machine-derived encryption only as a documented fallback.

## Linux Secret Service

🟡 Partial. `keyring` covers the freedesktop Secret Service (libsecret / D-Bus); no Secret Service-specific integration is wired beyond the crate. Requirement: use Secret Service where a keyring daemon is present, fall back to the encrypted SQLite vault when headless, and never write plaintext secrets to disk or dotfiles.

## Encryption

✅ Built. Symmetric secrets use AES-256-GCM (`storage.rs`, `encryption.rs`); key derivation uses PBKDF2-HMAC-SHA256 (600k) and HKDF-SHA256 (`machine_key.rs`, `dispatch_hmac.rs`). Requirement: authenticated encryption only (no unauthenticated modes), unique nonces per message, no home-grown ciphers, and no secret material in logs (`log_redaction.rs`, `env_filter.rs`).

## Device Trust

🟡 Partial. Machine identity is derived from `machine_uid` (`machine_key.rs`) and binds the local encryption vault to the device. Companion/remote pairing establishes a per-session shared secret via HKDF-SHA256 from a QR pairing code (`dispatch_hmac.rs`). Gap: no OS attestation (Secure Enclave / TPM) and the companion panel is experimental (control events re-emitted with no listener; screen-share via `getDisplayMedia`) — 🟡. Requirement: pairing is user-approved, revocable, and time-bounded; unpaired devices cannot drive a session.

## Certificate Pinning

🔭 Planned. Outbound HTTPS uses reqwest over rustls with native roots and an optional custom CA (`http_client_factory.rs`); no key/cert pinning exists yet. MCP transport may bypass TLS verification **only** for `127.0.0.1`/`::1` in debug builds — remote invalid certs are rejected (`core/mcp/transport.rs`). Requirement: pin the Managed-Cloud/API and updater endpoints (SPKI pin set with backup pins + rotation) before GA; never `danger_accept_invalid_certs` for any non-loopback host.

## Rate Limits

✅ Built. A generic sliding-window `RateLimiter` (`sys/security/rate_limit.rs`, default 100 req / 60s, bounded ring buffer) plus token-validation limits (`auth.rs`) protect local endpoints. The bridge tracks auth failures per IP: **5 failures / 60s → 300s lockout** (`websocket_server.rs`). Requirement: every IPC/bridge/remote entry point is rate-limited; limits are per-identity where possible, memory-bounded, and logged.

## Abuse Prevention

✅ Built (multi-layer). The bridge enforces an **origin allow-list** (chrome-extension://, vscode-webview://, loopback only), a 2s auth timeout, constant-time bridge-token compare (`ct_eq`), rotatable tokens (`bridge_rotate_token`), and IP lockout (`websocket_server.rs`). Native-messaging manifests scope `allowed_origins` to the paired extension ID (`native_messaging/manifest.rs`). Tool/command execution passes prompt-injection, command-validator, tool-guard, DM-protection, sandbox, and approval-workflow checks with audit logging (`sys/security/{prompt_injection,command_validator,tool_guard,dm_protection,sandbox,approval_workflow,audit_logger}.rs`). BYOK spend is capped by a daily budget to prevent key-bleed (`core/llm/daily_budget.rs`). **HMAC companion control**: every mobile→desktop control message is HMAC-SHA256-signed over a canonical envelope, verified with timestamp window (±30s) and a 60s sliding nonce cache for replay defense, constant-time compared (`subtle::ConstantTimeEq`); unsigned messages are rejected after `DISPATCH_HMAC_REQUIRED_AFTER` (`dispatch_hmac.rs`).

## Repository map

- `apps/desktop/src-tauri/src/sys/account/mod.rs` — Managed-Cloud token store + refresh.
- `apps/desktop/src-tauri/src/sys/security/{auth.rs,auth_db.rs}` — local sessions, validation rate limit.
- `apps/desktop/src-tauri/src/sys/security/{oauth.rs}`, `features/communications/gmail_oauth.rs`, `integrations/cloud/*.rs` — OAuth flows.
- `apps/desktop/src-tauri/src/sys/security/{secret_manager.rs,storage.rs,machine_key.rs,master_password.rs,encryption.rs}` — secret storage & crypto.
- `apps/desktop/src-tauri/src/sys/security/{dispatch_hmac.rs,rate_limit.rs,audit_logger.rs,log_redaction.rs}` — companion HMAC, rate limits, audit.
- `apps/desktop/src-tauri/src/integrations/realtime/websocket_server.rs` — bridge tokens, origin allow-list, IP lockout.
- `apps/desktop/src-tauri/src/integrations/native_messaging/*.rs` — Chrome host, scoped manifests.
- `apps/desktop/src-tauri/src/core/llm/providers/{direct_api_provider.rs,managed_cloud_provider.rs,http_client_factory.rs}`, `core/mcp/transport.rs` — provider auth, TLS.
- `apps/desktop/src-tauri/Cargo.toml` — `keyring`, `aes-gcm`, `pbkdf2`, `hmac`, `sha2`.

## Competitor notes

Claude Desktop, ChatGPT desktop, and Codex authenticate to a single hosted account and hold no user provider keys. AGI's deliberate divergence: **multi-provider BYOK on Desktop only**, with keys encrypted on-device and sent **directly** to the provider — never proxied through AGI Cloud — plus a Local mode that touches no network auth at all. Remote Control mirrors Claude Code Remote Control / Codex remote connections ("nothing moves to the cloud"): outbound-only, QR+HMAC-paired, approval-gated, compute pinned to the host. Per-surface trust means the same secret never spans two boundaries.

## Acceptance / Definition of Done

Production-ready when every trust boundary is enforced in code and covered by tests, secrets are keychain-backed, and pinning is live for Cloud/updater endpoints.

- [ ] Build: `cargo check -p agiworkforce-desktop` and security unit tests (HMAC verify, nonce replay, rate-limit, origin allow-list) pass.
- [ ] Trust: BYOK keys are encrypted at rest, decrypted only in-process, and never appear in a Managed-Cloud payload; Local→BYOK requires the explicit fork gate; Local rows never enter Neon delta-sync.
- [ ] Security: bridge tokens rotatable + constant-time compared + IP-locked-out; companion control HMAC-verified with replay defense; TLS pinning enabled for non-loopback endpoints; no plaintext secrets in logs or disk.

## Anti-patterns

- Routing BYOK keys, Local chats, or Local files through Managed Cloud, or skipping the Local→BYOK fork gate.
- Storing provider keys or tokens in plaintext, in the binary, in dotfiles, or in synced rows.
- `danger_accept_invalid_certs` for any non-loopback host, or shipping without endpoint pinning while claiming it done.
- Accepting unsigned/replayed companion control messages, or a bridge connection from a non-allow-listed origin.
- Hardcoding a model ID instead of reading `packages/contracts/types/src/models.json`; inventing routes, env vars, or INR prices for Pro/Max.
- Referencing Supabase or `middleware.ts`, or reintroducing removed tiers ("Plus"/`pro_plus`/"Hobby") or credit top-ups.
- Claiming keychain-backed storage, certificate pinning, or a shipped companion as ✅ when the repo shows 🟡/🔭.

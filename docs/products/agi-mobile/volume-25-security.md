# AGI Mobile — Volume 25 — Security

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-06-30

Authority: `AGENTS.md` (repo root), `apps/mobile/AGENTS.md`, `docs/current/source-of-truth.md`, `docs/products/README.md`, and the real implementation: `apps/mobile/lib/{secureStorage.ts,mmkv.ts,pinning.ts,biometricFlagStore.ts,deviceId.ts,v1FeatureFlags.ts}`, `apps/mobile/storage/db.ts`, `apps/mobile/services/{secureFetch.ts,authSession.ts,remoteChatGate.ts,dsarExport.ts}`, `apps/mobile/src/integrations/clerk.ts`, `apps/mobile/src/features/auth/hooks/useBiometricGate.ts`, `apps/mobile/src/features/settings/{cloud-privacy,data-controls,safety-security}/`, `apps/mobile/app.config.js`, and `packages/types/src/models.json`.

## Overview & stance

This volume covers the security posture of AGI Mobile: identity, biometric app-lock, encryption at rest, credential storage, device trust, network pinning, and privacy controls. Mobile exposes exactly **two** trust modes — **Local** (a small on-device LLM, free, account-less) and **Managed Cloud** (public alpha, open by default). **Mobile has no BYOK and no provider-API-key entry anywhere.** On mobile, "Provider Configuration" means on-device model management, not keys.

Trust shape drives every requirement here. Local data — chats, memory, projects, files, model weights — lives on the device encrypted at rest and is **never** auto-routed off-device. Authentication and the network surface exist only to govern the **Cloud** boundary; an account is required for Cloud and nothing else. Local Mode must be fully usable with zero sign-in. Remote Control (a phone acting as a secure window over a host session) is **not** a fourth trust mode and is feature-flagged off today.

## Authentication — identity verification

✅ Built — Cloud identity is Clerk + Neon + Stripe; no Supabase. `apps/mobile/src/integrations/clerk.ts` bridges the native Clerk session's `getToken()` (with a `skipCache` force-refresh) to non-React callers, and `apps/mobile/services/authSession.ts` exposes `getAuthHeaders`/`refreshAuthSession` for the 401-retry path. The signed-in entitlement **is** the Managed-Cloud gate in public alpha; `apps/mobile/services/remoteChatGate.ts` fails closed when `FEATURES.cloudChat` is off. Requirements: every Cloud request carries a fresh Clerk Bearer token; Local Mode performs no identity check; there is **no demo bypass**. Full auth flow is specified in Volume 03.

## Biometrics — secure auth

✅ Built — `apps/mobile/src/features/auth/hooks/useBiometricGate.ts` + `apps/mobile/lib/biometricFlagStore.ts`. The opt-in lock flag lives in SecureStore (`WHEN_UNLOCKED_THIS_DEVICE_ONLY`), **not** MMKV, so extracting the MMKV key cannot disable the gate (LOW-MOB-1). The gate is **fail-closed**: the in-memory `enabled` field starts `true`, so any UI before hydration treats the device as locked (H-10); a SecureStore read error keeps it locked; missing/unenrolled biometrics fall back to the OS passcode, never auto-unlock. It re-locks on background→active and must engage **before** the auth store loads any session. `NSFaceIDUsageDescription` is set in `apps/mobile/app.config.js`. Testable: a wiped/failed flag read must leave the app locked, not open.

## Encryption — data protection

✅ Built — two encrypted-at-rest stores, both keyed from the platform CSPRNG, both with keys held only in the OS keychain. SQLite uses SQLCipher: `apps/mobile/storage/db.ts` derives a 256-bit key via `Crypto.getRandomBytesAsync(32)`, applies `PRAGMA key`, runs migrations transactionally, and supports `rekeyDb` with a key-rollback guard so a failed rekey can't brick the DB. MMKV at-rest encryption (`apps/mobile/lib/mmkv.ts`) generates a true 256-bit key (`generateMmkvEncryptionKey`, replacing the weaker dual-UUID scheme — CRIT-MOB-02) and degrades to a safe "not initialised" no-op proxy until `initMmkvEncryption()` resolves. Requirements: no plaintext user content on disk; keys never leave the keychain; encryption init must complete before any store read. 🔭 Planned: in-transit E2E payload encryption for cross-device delta-sync beyond TLS.

## Secure Storage — credential storage

✅ Built — `apps/mobile/lib/secureStorage.ts` wraps `expo-secure-store` (iOS Keychain / Android Keystore-backed EncryptedSharedPreferences) with `WHEN_UNLOCKED_THIS_DEVICE_ONLY`, so secrets are excluded from iCloud/Google backup and unreadable while the device is locked. It returns the write promise so Zustand persist can propagate failures (MOB-3), and treats Before-First-Unlock read failures as "no session" rather than crashing (MOB-4). Clerk session tokens, the MMKV key, the SQLCipher key, the biometric flag, and the device ID all live here. Hard requirement: **tokens and keys live only in SecureStore** — never in MMKV, SQLite, AsyncStorage, or logs. Because there is no BYOK on mobile, there are **no provider API keys** to store.

## Device Trust — trusted devices

🟡 Partial — `apps/mobile/lib/deviceId.ts` mints a stable per-device UUID in SecureStore, and authenticated device records are created on the account only after `isClerkSignedIn && isInitialized` (MOB-1), never for Local-only users. The Desktop↔Mobile companion / Remote-Control fabric exists but is **gated off**: `FEATURES.companion = false` in `apps/mobile/lib/v1FeatureFlags.ts`, and it is not wired to task execution. Per canon, Remote Control is a secure outbound-only window (QR + HMAC pairing, approval-gated, compute stays on the host) — **not** a trust mode that moves Local data to Cloud. 🔭 Planned: a user-facing trusted-device list with naming and per-device remote revocation, and the approval-gated pairing UI behind the companion flag.

## Certificate Pinning — network security

🟡 Partial — the chokepoint exists and is wired, but enforcement is off pending ops-provisioned pins. `apps/mobile/services/secureFetch.ts` is the single outbound-HTTPS gate so coverage can't drift; `apps/mobile/lib/pinning.ts` holds the per-host SPKI-SHA256 table, the capture runbook, and `PINNING_ENFORCED = false`. The pins are still `PLACEHOLDER_REPLACE_BEFORE_LAUNCH_*`, so `app.config.js` carries no `NSPinnedDomains` yet (grep confirms zero), and the startup check **warns** rather than throwing (a placeholder can never match a real cert, so behaviour stays fail-closed at the network layer without bricking launch — P0-FIX 2026-05-29). Gaps to close before public launch: capture real leaf+intermediate SPKI hashes, populate `PINS_BY_HOST` and `NSPinnedDomains`/Android `network_security_config.xml`, flip `PINNING_ENFORCED = true`, and pass `check:tls-pins`. Until then, platform TLS chain validation still protects all traffic.

## Privacy Controls — user data ownership

✅ Built — `apps/mobile/src/features/settings/{cloud-privacy,data-controls,safety-security}/` separate Cloud-scoped privacy (retention, telemetry opt-out info, policy link) from Local data controls; `apps/mobile/services/dsarExport.ts` produces a device-side DSAR export of SQLCipher conversations/memory/instructions/settings plus the compliance ledger — explicitly **excluding** model weights, telemetry, and (non-existent) provider keys. `app.config.js` declares the iOS `privacyManifests` (`NSPrivacyAccessedAPITypes`, `NSPrivacyCollectedDataTypes`) and per-permission usage strings. Requirements: Local export/delete never touches the network; Cloud account deletion runs the full cloud-scoped teardown (Volume 03) while preserving Local data; permission prompts use accurate purpose strings.

## Repository map

- `apps/mobile/lib/{secureStorage.ts,mmkv.ts,pinning.ts,biometricFlagStore.ts,deviceId.ts,v1FeatureFlags.ts}` — keychain adapter, encrypted MMKV, pin table, biometric flag, device ID, feature flags.
- `apps/mobile/storage/db.ts` — SQLCipher key management, encrypted SQLite, rekey.
- `apps/mobile/services/{secureFetch.ts,authSession.ts,remoteChatGate.ts,dsarExport.ts}` — outbound chokepoint, token facade, Cloud gate, DSAR export.
- `apps/mobile/src/integrations/clerk.ts` — Clerk client + token bridge.
- `apps/mobile/src/features/auth/hooks/useBiometricGate.ts` — biometric app-lock.
- `apps/mobile/src/features/settings/{cloud-privacy,data-controls,safety-security,permissions}/` — privacy + security UI.
- `apps/mobile/app.config.js` — Face ID/permission strings, privacy manifests, (future) `NSPinnedDomains`.

## Competitor notes

ChatGPT and Claude mobile gate the whole app behind a cloud account and ship Face ID/passcode app-lock plus standard keychain token storage and TLS. AGI matches the biometric lock and OS-keychain credential storage but deliberately diverges: an **account-less, fully on-device Local mode** with encrypted SQLCipher + MMKV at rest; **per-surface trust** where the account gate applies only to the Cloud boundary; **no BYOK on mobile**, so there are zero provider keys to store or leak; and a Remote-Control model that keeps compute on the host instead of treating the phone as a thin cloud client. Pinning is centralized through one chokepoint rather than scattered per-request.

## Acceptance / Definition of Done

Production-ready when: all secrets live only in SecureStore; SQLCipher and MMKV are encrypted with CSPRNG 256-bit keys; the biometric gate is opt-in and fail-closed across pre-hydration and read-failure paths; real SPKI pins are provisioned and `PINNING_ENFORCED = true` with `check:tls-pins` green; DSAR export and Local delete never touch the network; and Cloud teardown preserves Local data.

- [ ] Build: `pnpm --filter @agiworkforce/mobile typecheck` and `test` pass; encryption init completes before any store read.
- [ ] Trust: no BYOK/API-key affordance anywhere; `remoteChatGate` fails closed when Cloud is off; companion/Remote-Control stays gated until pairing is approval-gated and host-bound.
- [ ] Security: tokens/keys only in SecureStore; biometric gate fail-closed; pins provisioned + enforced before public launch; no `pk_test` Clerk key in a store build.

## Anti-patterns

- Adding any BYOK / provider-API-key entry to mobile, or storing provider keys at all.
- Auto-sending Local chats/files to Cloud without explicit reviewed transfer.
- Storing tokens or encryption keys in MMKV/SQLite/AsyncStorage/logs instead of SecureStore.
- Flipping `PINNING_ENFORCED` true while placeholder pins remain, or making the biometric gate fail-open.
- Faking a "trusted devices" / Remote-Control manager that does not exist (label 🟡/🔭).
- Hardcoding or inventing model IDs (read `packages/types/src/models.json`), inventing INR prices, or referencing Supabase, "Plus", `pro_plus`, or "Hobby".

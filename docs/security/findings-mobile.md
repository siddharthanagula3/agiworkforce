# Mobile Security Findings — apps/mobile

**Scope**: `apps/mobile/` — Expo 55 + React Native 0.84.1
**Audit date**: 2026-05-04
**Method**: Static analysis only

## Severity Rubric

| Level    | Definition                                                                                    |
| -------- | --------------------------------------------------------------------------------------------- |
| CRITICAL | Exploitable without authentication; data loss or RCE possible at scale                        |
| HIGH     | Exploitable by an authenticated attacker or network-adjacent actor; significant data exposure |
| MEDIUM   | Requires specific conditions; degrades security posture materially                            |
| LOW      | Defense-in-depth gap; no direct exploit path identified                                       |
| INFO     | Observation; no immediate risk                                                                |

---

## [SEV-MOB-01] CRITICAL → **VERIFIED FIXED**

**File**: `apps/mobile/hooks/useBiometricGate.ts:62-68`

The audit flagged a fail-open in the catch block. Current code at lines 62-68 correctly does `setIsUnlocked(false); return false;` with comment "fail CLOSED on any error". Confirmed fixed.

---

## [SEV-MOB-02] HIGH — Dispatch control messages have no per-message authentication (no HMAC, no nonce, no replay protection)

**Files**: `apps/mobile/stores/connectionStore.ts:676-707`, `services/dispatchRealtime.ts:60-115`

Once WebRTC/signaling session established, all control messages (`dispatch_task`, `approval_response`, `emergency_stop`, `agent_command`) are plain JSON with no integrity check. Pairing code used only during session negotiation — after that, any party with relay access can inject/replay.

Three attack surfaces:

1. **Signaling relay injection** — when WebRTC P2P fails, all messages relay through `wss://signaling.agiworkforce.com` (`connectionStore.ts:705`). Compromised relay can inject `approval_response` approving destructive desktop tool calls.
2. **Replay** — `dispatch_task` payload `{messageId, text, sentAt}`. `sentAt` never validated against server-enforced window. Recorded payload can re-execute task indefinitely.
3. **Realtime channel injection** — `dispatchRealtime.ts:106-115` accepts `dispatch_agent_state` rows from Supabase Realtime and directly calls `useAgentStore.setState({pendingApprovals})`. If RLS absent (see MOB-03), attacker writes rows replacing pending approvals.

**Edge cases**: relay operator forwards an `approval_response` 30 seconds after recording it; user signs in on a different network where TURN relay is used.

**Fix**: Sign each control message with HMAC-SHA256 derived from session key (established at pairing time); include sequence number/nonce. Reject replays on both endpoints. **Escalate to Dispatch protocol owner** before implementing.

---

## [SEV-MOB-03] HIGH — Supabase Realtime RLS on Dispatch tables cannot be confirmed from mobile code

**Files**: `apps/mobile/services/dispatchRealtime.ts:60-88`, `services/heartbeat.ts:28-41`

Mobile subscribes to `dispatch_messages`, `dispatch_agent_state`, `surface_heartbeats` with client-side `filter: 'user_id=eq.<userId>'`. Supabase Realtime applies these server-side, but RLS policies on tables are the actual security boundary.

`heartbeat.ts:28` uses `supabase as any` with `// surface_heartbeats is not in the generated DB types yet` — strong signal it was added outside standard migration review.

**Independent verification (this auditor)**: `supabase/migrations/20260324000001_create_dispatch_tables.sql` lines 47-66, 100-162, 184-205 — RLS IS properly configured with `auth.uid() = user_id` on dispatch_threads, dispatch_messages, dispatch_agent_state. **However** `surface_heartbeats` table is NOT in the migrations directory. Confirm RLS exists.

**Fix**: Add migration enabling RLS + `auth.uid() = user_id` policy on `surface_heartbeats`.

---

## [SEV-MOB-04] HIGH — Messaging platform API keys persisted to MMKV alongside non-sensitive state

**Files**: `apps/mobile/stores/messagingStore.ts:171-175`, `stores/integrationStore.ts:346-351`

Both stores persist full `platforms[]` to MMKV including `config: Record<string, string>` containing raw API keys / bot tokens (Telegram bot token, Slack OAuth, Discord webhook).

MMKV encrypted at rest via OS Keychain (`WHEN_UNLOCKED_THIS_DEVICE_ONLY`). But:

- File encrypted but key requires unlocked device — threat model includes unlocked-device access
- Telegram bot tokens long-lived, hard to revoke
- Slack OAuth tokens grant message send/receive

**Fix**: Exclude `config` fields from `partialize` selectors. Store individually in `expo-secure-store` keyed by `messaging_token_<platformId>`.

---

## [SEV-MOB-05] HIGH — Three screens pass server-supplied URL to `Linking.openURL` without scheme validation

**Files**: `apps/mobile/app/(app)/usage.tsx:388-391`, `(tabs)/settings.tsx:241`, `profile/index.tsx:110`

```ts
const data = await api.post<{ url: string }>('/api/portal');
if (data.url) await Linking.openURL(data.url);
```

If backend response tampered with (compromised backend, MITM, or web JWT bypass per WEB-XCUT-01), URL can be `intent://` (Android — launches arbitrary activities), `agiworkforce://` (internal route hijack), `file:///...`, `sms:+1?body=...`.

**Edge cases**: MITM injects `agiworkforce://oauth-callback?code=phishing` — if app implements OAuth deep-link handler, attacker controls callback.

**Fix**:

```ts
if (!data.url.startsWith('https://')) {
  await Linking.openURL('https://agiworkforce.com/billing');
  return;
}
```

Pattern already correct in `OAuthButtons.tsx:58-70`.

---

## [SEV-MOB-06] MEDIUM — No TLS certificate pinning for Dispatch signaling or production API

**Files**: `apps/mobile/stores/connectionStore.ts:457-461`, `lib/constants.ts:14`

All HTTPS/WSS rely on system cert store. Enterprise-managed devices (MDM-enrolled) can install trusted root CA for transparent MITM of `wss://signaling.agiworkforce.com` and `https://agiworkforce.com`.

**Fix (post-MVP)**: `react-native-ssl-pinning` with SHA-256 pins. **Escalate to platform team** (native module change).

---

## [SEV-MOB-07] MEDIUM — `CitationChip` opens AI-supplied URLs without scheme validation

**File**: `apps/mobile/components/chat/CitationChip.tsx:13-18`

Opens any URL from `message.citations` (LLM-generated). Prompt injection emits `url: "sms:+19005551234?body=malicious"` → click-to-action. `CollapsibleSources.tsx:24-30` already correctly validates.

**Fix**: Apply `isValidExternalUrl` check before `Linking.openURL`.

---

## [SEV-MOB-08] MEDIUM — Pairing code length validation inconsistent across 3 sites

**Files**: `apps/mobile/app/_layout.tsx:233` (exact 8), `services/companion.ts:32-35` (6-12), `stores/connectionStore.ts:141-147` (no constraint)

6-char alphanumeric = 36^6 ≈ 2.2B brute-force space — feasible if rate-limited weakly. Inconsistency = split security model.

**Fix**: Standardize on exactly 8 alphanumeric chars everywhere.

---

## [SEV-MOB-09] MEDIUM — Biometric lock defaults to `off`; Dispatch unprotected without opt-in

**File**: `apps/mobile/stores/settingsStore.ts:97`

`biometricLockEnabled: false`. Unlocked phone = full Dispatch access (tasks, approvals, history, emergency stop). Inconsistent with Dispatch's high blast radius.

**Fix**: Surface biometric-lock enrollment prompt during pairing flow. Consider per-feature biometric prompt for Dispatch (independent of global lock).

---

## [SEV-MOB-10] MEDIUM — `EXPO_PUBLIC_DEEPGRAM_API_KEY` baked into production bundle

**File**: `apps/mobile/lib/constants.ts:12`

`EXPO_PUBLIC_*` inlined at build time → readable via `react-native-decompiler`/`apktool`/Frida. Code comment at `VoiceInputButton.tsx:26` says correct prod behavior is empty + server-side Whisper fallback.

**Fix**: Remove from production builds. STT routes through server-side Whisper. Or fetch short-TTL Deepgram temporary auth token from backend per recording session.

---

## [SEV-MOB-11] MEDIUM — `agiworkforce://reset-password` deep link has no handler; Android scheme interception risk

**File**: `apps/mobile/stores/authStore.ts:170`

`resetPassword` redirects to `agiworkforce://reset-password`. `_layout.tsx:213-239` only handles `agiworkforce://pair/...`. Reset emails open the app and silently discard the token. On Android, custom URL schemes are NOT exclusive — any other app can register `agiworkforce://` and intercept reset tokens.

**Fix**: Add `agiworkforce://reset-password` handler parsing `access_token`/`refresh_token` and calling `supabase.auth.setSession()`. Long-term: migrate to Universal Link `https://agiworkforce.com/reset-password` (requires `apple-app-site-association` + Associated Domains entitlement — escalate).

---

## [SEV-MOB-12] MEDIUM — WebRTC ICE uses Google public STUN only; no TURN

**File**: `apps/mobile/stores/connectionStore.ts:268-273`

Symmetric NAT defeats P2P → relay through signaling server (plaintext). TURN would provide DTLS E2EE through relay. STUN to Google leaks public IP per session.

**Fix**: Self-hosted TURN on Fly.io with shared-secret auth. Escalate to platform team.

---

## [SEV-MOB-13] LOW — `disableDeviceFallback: false` allows PIN bypass

**File**: `apps/mobile/hooks/useBiometricGate.ts:29`

PIN-knowing adversary (shoulder-surfed) bypasses biometric gate. Correct UX for lockout scenarios. `LAPolicy.deviceOwnerAuthentication` limitation.

**Fix**: For high-risk approvals (destructive file ops), use `LAPolicy.deviceOwnerAuthenticationWithBiometrics` (no PIN fallback). Document model.

---

## [SEV-MOB-14] LOW — Message IDs use `Math.random()` (non-CSPRNG)

**Files**: `apps/mobile/stores/dispatchStore.ts:57-58`, `stores/chatStore.ts:114-115`

`dispatch-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`. Used for de-duplication in `dispatchRealtime.ts:78-79`. `deviceId.ts` correctly uses `Crypto.randomUUID()`.

**Fix**: Replace with `Crypto.randomUUID()` from `expo-crypto`.

---

## [SEV-MOB-15] LOW — Hardcoded version `'0.1.0'` in Dispatch metadata

**File**: `apps/mobile/stores/connectionStore.ts:464`

Desktop always sees mobile as 0.1.0. Violates "read versions from `package.json`/`expo-constants`" convention.

**Fix**: `Constants.expoConfig?.version ?? '0.0.0'`.

---

## [SEV-MOB-16] LOW — Android `READ_EXTERNAL_STORAGE` deprecated for Android 13+

**File**: `apps/mobile/app.json:61`

Deprecated in API 33; ignored. Play Store requires `READ_MEDIA_IMAGES`.

**Fix**: Replace `READ_EXTERNAL_STORAGE` with `READ_MEDIA_IMAGES`.

---

## [SEV-MOB-17] LOW — No jailbreak/root detection for high-risk Dispatch

Jailbroken iOS bypasses Keychain access control (without Secure Enclave). Frida hooks intercept WebRTC, auto-approve tool calls.

**Fix (post-MVP, P1)**: Jailbreak detection library; warning banner on Dispatch active on jailbroken device.

---

## [SEV-MOB-18] LOW — Background fetch `startOnBoot: true` — silent network calls after device reboot

**File**: `apps/mobile/services/backgroundFetch.ts:103-106`

`stopOnTerminate: false` + `startOnBoot: true` → agent-status background task fires after reboot, calls `/api/mobile/agent-status` with user JWT. Privacy concern; must be disclosed in Privacy Policy. `?.` guard pattern (`useSettingsStore.getState?.()`) could silently disable check if store not initialized in background context.

**Fix**: Confirm store initializes in background context; disclose in privacy policy.

---

## [SEV-MOB-19] INFO — Real Supabase production anon key in `.env`

`.env:2`. Gitignored. Anon key by design public per Supabase model. Risk only materializes with RLS gaps (MOB-03).

---

## [SEV-MOB-20] INFO — Dispatch thread persists 500 messages including desktop file paths

**File**: `apps/mobile/stores/dispatchStore.ts:130-133`

500 messages in MMKV with `taskResult.location`/`fileName`/`summary`. Forensic device exam = persistent log of desktop activity.

**Fix**: Shorter retention window (50-100); document policy.

---

## Verified Fixed

| Prior Ref                             | File                         | Fix Applied                                                  |
| ------------------------------------- | ---------------------------- | ------------------------------------------------------------ |
| MOB-01 (CRITICAL biometric fail-open) | `useBiometricGate.ts:62-68`  | Catch block now `setIsUnlocked(false)` — fail closed         |
| MOB-2                                 | `app/_layout.tsx:209-235`    | Deep link validates scheme + hostname + pairing code format  |
| MOB-3                                 | `lib/secureStorage.ts:33-64` | `setItem` returns promise; write failures propagate          |
| MOB-4                                 | `lib/secureStorage.ts:37-46` | `getItem` catches Before-First-Unlock errors                 |
| CRIT-005                              | `services/supabase.ts:29-34` | Auth token read failures don't fall back to unencrypted MMKV |

---

## Top 5 Action Items

1. **[SEV-MOB-11]** Add `agiworkforce://reset-password` handler now (JS-only); escalate Universal Links. Currently password reset is silently broken on mobile + reset tokens interceptable on Android.
2. **[SEV-MOB-05]** 2-line scheme check before `Linking.openURL` in `usage.tsx`, `settings.tsx`, `profile/index.tsx`.
3. **[SEV-MOB-04]** Strip `config` fields from `partialize` selectors in messagingStore + integrationStore. Store tokens in `expo-secure-store`.
4. **[SEV-MOB-03]** Audit/add RLS on `surface_heartbeats`. Confirm dispatch\_\* RLS exists (verified by independent auditor — does).
5. **[SEV-MOB-02]** HMAC-sign Dispatch control messages + replay window. Multi-surface protocol change — escalate.

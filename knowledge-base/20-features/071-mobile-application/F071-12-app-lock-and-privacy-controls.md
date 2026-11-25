---
id: "F071-12"
type: "feature"
title: "App lock and privacy controls"
aliases: ["App Lock", "Biometric lock", "Face ID lock", "Privacy cover", "Safety & Security", "Permissions", "Reset app lock and sign out", "Reduce sensitive content"]
area: "71 Mobile application"
available_on: ["mobile"]
implementation: {web: "n/a", desktop: "n/a", mobile: "built", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "not seen by a person", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S71.32"]
depends_on: ["surface:mobile", "mode:local", "mode:cloud", "SYS-security-and-privacy", "SYS-authentication-and-identity", "SYS-shared-ui-and-design", "store:secure-storage-biometric-flag", "file:apps/mobile/lib/biometricFlagStore.ts"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F071-12 App lock and privacy controls

AGI Mobile can require Face ID, a fingerprint or the device passcode when it opens or returns from the background, and it covers the screen while away so the app switcher shows nothing. Settings also lists camera, photos and microphone permissions. A separate switch filters sensitive content.

Area: [71. Mobile application](README.md). Requirement items: [S71.32](../../10-requirements/capabilities/071-mobile-application.md#s7132).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | does not apply | does not apply | n/a |
| Desktop | does not apply | does not apply | n/a |
| Mobile | built | built | not seen by a person |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Locks the whole app behind the device unlock, covers the screen whenever the app is not in front (when App Lock is on), and lets the person review OS permissions (apps/mobile/src/features/auth/hooks/useBiometricGate.ts; apps/mobile/app/_layout.tsx:1020-1026; apps/mobile/src/features/settings/permissions/registry.ts).

**Why it exists.** The brief requires biometric app lock, a privacy cover on app switch and OS permission management (doc: knowledge-base/data/area-briefs/071-mobile-application.md S71.32).

**Who uses it.** Any Mobile user who shares or may lose a phone; shown to Cloud users as a one-time offer.

**Problems it solves**

- Someone holding the unlocked phone cannot read chats.
- The app switcher snapshot does not show a conversation.
- A person who cannot unlock can reset the lock.

**Use cases**

- Turn on App Lock in Settings.
- Return from another app and unlock with Face ID.
- Forgotten or broken biometrics: use 'Reset app lock and sign out'.
- Open Permissions and send the device to system settings to allow the camera.

## 2. User experience

**Where to find it**

- Mobile: Settings, 'Safety & Security' with rows 'Reduce sensitive content', 'App Lock', 'Permissions', and 'Account security' in Cloud mode (apps/mobile/src/features/settings/safety-security/index.tsx:78-127).
- Permissions list: Microphone, Speech Recognition, Camera, Photos & Files, Notifications, Calendar, Reminders, Face ID (apps/mobile/src/features/settings/permissions/registry.ts:165-242).

**Before you start**

- A device lock (passcode, Face ID, Touch ID, fingerprint or screen lock) set up in system settings (apps/mobile/src/features/settings/safety-security/index.tsx:37-44).
- The one-time offer needs a signed-in, Cloud-unlocked account with biometrics enrolled (apps/mobile/src/features/auth/components/AppLockOffer.tsx:49-70).

**Screens and controls**

- Switch 'App Lock' with the platform wording, for example 'Require Face ID, Touch ID, or passcode to open AGI.' (apps/mobile/src/features/auth/services/appLockWording.ts:11-13).
- Lock overlay: 'Locked', 'Authenticate to continue', 'Unlock', and 'Can't unlock? Reset app lock and sign out' (apps/mobile/src/features/auth/components/AppLockOverlay.tsx:42-75).
- Cover: a plain screen while the app is away (AppLockOverlay.tsx:31-38).
- Permissions screen titled 'Permissions' with per-permission detail pages.

**Journey**

1. Open Settings, Safety & Security, switch App Lock on.
2. The device prompt 'Turn On AGI App Lock' appears; on success the flag is saved.
3. Leave the app: a cover hides the screen at once.
4. Return: after more than 1.5 seconds away or a trip to the background, the prompt 'Unlock AGI Mobile' appears.
5. On success the app shows as you left it; on failure it stays locked.

**What the person sees and gets**

- Alerts 'Set up a device lock first', 'App lock was not turned on', 'Could not update lock' (safety-security/index.tsx:39-56, 69).
- Reset alert 'Reset app lock and sign out?' with 'Reset and sign out' (apps/mobile/app/_layout.tsx:565-586).

**Settings**

- App Lock flag stored in secure storage (apps/mobile/lib/biometricFlagStore.ts).
- Reduce sensitive content (content filter, not a privacy control).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- App Lock switch asks the device lock first and refuses when none is set (apps/mobile/src/features/settings/safety-security/index.tsx:37-72).
- The gate covers the app when it leaves the front, fails closed, and prompts only when the app is in front again (apps/mobile/src/features/auth/hooks/useBiometricGate.ts:119-150).
- A 1.5 second grace stops a prompt loop while the system unlock sheet is on screen (useBiometricGate.ts:15-19, 133-141).
- A failed or errored check keeps the app locked (useBiometricGate.ts:93-96).
- Without enrolled biometrics, authentication still runs with the device passcode fallback (useBiometricGate.ts:61-75).
- The overlay is drawn in the root layout above the navigator, without unmounting it (apps/mobile/app/_layout.tsx:1020-1026).
- Reset: from the overlay, clears auth session and the lock flag, keeping local chats (apps/mobile/app/_layout.tsx:565-586).
- One-time App Lock offer to eligible Cloud users, remembered with a 'prompted' flag (apps/mobile/src/features/auth/components/AppLockOffer.tsx:49-125; apps/mobile/lib/biometricFlagStore.ts).
- Permissions screen and per-permission detail pages with OS status and a link to system settings (apps/mobile/src/features/settings/permissions/index.tsx:180; apps/mobile/src/features/settings/permissions/Detail.tsx:33).
- Reduce sensitive content: forced on in minor mode and the switch is disabled (apps/mobile/src/features/settings/safety-security/index.tsx:46-65, 82-94).

**Incomplete**

- The cover and lock apply only when App Lock is on; the gate effect exits when the flag is off (apps/mobile/src/features/auth/hooks/useBiometricGate.ts:119-125).
- Android recents screenshot handling: the cover is a view drawn when the app state changes; no secure-window flag was found (searched native and app.config.js) [inferred].

**Present but disconnected or switched off**

- none found in the code

**Not available**

- Other apps: n/a for this feature (Mobile only).

## 4. Required behaviour

**Established requirements**

- Mobile-only privacy controls exist: biometric app lock, privacy cover on app switch, and OS permission management. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S71.32)
- Security behaviour fails closed; nothing silently weakens trust boundaries. (source: AGENTS.md section 6)
- Local chats stay on the device unless the person chooses AGI Cloud. (source: apps/mobile/src/features/settings/safety-security/index.tsx (screen text 'Device boundary'))

**Acceptance criteria**

1. Turning on App Lock with no device lock shows 'Set up a device lock first' and the switch stays off.
2. With App Lock on, going to the app switcher shows the cover, not the chat.
3. Returning after a real switch asks for the device unlock; a short peek under 1.5 seconds does not.
4. Cancelling or failing the prompt leaves the lock screen.
5. The reset control signs out and turns App Lock off, and local chats remain.
6. Permissions shows OS status for camera, photos and microphone and links to system settings.
7. In minor mode, Reduce sensitive content is on and disabled.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- App Lock works in Local mode too because the gate lives in the root layout and uses no account [inferred from apps/mobile/app/_layout.tsx:1020-1026].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Decide whether the cover should also apply when App Lock is off, since the brief names the cover as a separate control.
- [proposed] Confirm Android recents behaviour on a real device.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| hook | useBiometricGate | `apps/mobile/src/features/auth/hooks/useBiometricGate.ts` | Lock state, cover, grace time, authenticate. |
| store | Biometric flag store | `apps/mobile/lib/biometricFlagStore.ts` | Reads and writes the flag in secure storage. |
| component | AppLockOverlay | `apps/mobile/src/features/auth/components/AppLockOverlay.tsx` | Locked screen and cover. |
| component | AppLockOffer | `apps/mobile/src/features/auth/components/AppLockOffer.tsx` | One-time offer. |
| service | appLockWording | `apps/mobile/src/features/auth/services/appLockWording.ts` | Platform wording. |
| screen | Root layout | `apps/mobile/app/_layout.tsx` | Mounts gate, overlay and reset action (lines 565-586, 1020-1026). |
| screen | Safety & Security | `apps/mobile/src/features/settings/safety-security/index.tsx` | App Lock, Permissions and content filter rows. |
| screen | Permissions list | `apps/mobile/src/features/settings/permissions/index.tsx` | Permission rows. |
| screen | Permission detail | `apps/mobile/src/features/settings/permissions/Detail.tsx` | OS status and open system settings. |
| config | Permission registry | `apps/mobile/src/features/settings/permissions/registry.ts` | Defines each permission entry. |
| screen | Settings route | `apps/mobile/app/(app)/settings/safety-security.tsx` | Route file. |
| store | Settings store | `apps/mobile/stores/settingsStore.ts` | reduceSensitiveContent. |
| service | Auth session clear | `apps/mobile/src/features/auth` | clearAuthSession used by reset (imported in _layout.tsx). |
| test | BiometricGate test | `apps/mobile/__tests__/BiometricGate.test.tsx` | Gate behaviour. |
| test | RootLayoutAppLock test | `apps/mobile/__tests__/RootLayoutAppLock.test.tsx` | Overlay and reset. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person flips App Lock; the app checks the enrolled security level and runs the device prompt. | device | apps/mobile/src/features/settings/safety-security/index.tsx:37-72 |
| The flag is written to secure storage (this device only, when unlocked). | device | apps/mobile/lib/biometricFlagStore.ts (setEnabled) |
| App state changes drive cover and lock; returning triggers authenticateAsync. | device | apps/mobile/src/features/auth/hooks/useBiometricGate.ts:119-165 |
| App initialisation waits for unlock. | device | apps/mobile/app/_layout.tsx:604-609 |
| Reset clears the cloud session and flag. | device and our servers | apps/mobile/app/_layout.tsx:565-586 (sign-out contact with the server not traced) |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| App Lock flag and 'prompted' flag | Secure storage keys agi_biometric_lock_enabled_v1 and agi_biometric_lock_prompted_v1, this-device-only | No | Cleared by reset (clearBiometricFlag) |
| Biometric data | Never read by the app; the OS holds it | No | n/a |

**Models and providers.** No model or provider is involved.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | none found in the code; App Lock works without an account. The offer needs a signed-in Cloud account. |
| Permissions | OS biometric or device lock; the Permissions page shows Face ID among others (apps/mobile/src/features/settings/permissions/registry.ts:232). |
| Subscription | none found in the code. |
| Limits and metering | 1.5 second re-lock grace (useBiometricGate.ts:19). No attempt limits in the app; the OS enforces them. |
| Feature flags | App Lock stored flag. A development-only bypass exists for visual QA (useBiometricGate.ts:22-24). |
| Model compatibility | none found in the code. |
| Provider restrictions | none found in the code. |
| Local mode | Fully available in Local mode. Reduce sensitive content filters 'in Local and Cloud chats' (safety-security/index.tsx:93). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Storage flag not yet read | Gate counts as locked until hydrated (fail closed). | useBiometricGate.ts:171-178 |
| Flag read fails | Treated as enabled. | apps/mobile/lib/biometricFlagStore.ts (hydrate catch) |
| No device lock | Alert and switch stays off. | safety-security/index.tsx:39-43 |
| Authentication cancelled or failed | Stays locked; Unlock button available. | useBiometricGate.ts:93-96; AppLockOverlay.tsx:57-65 |
| Secure storage unavailable on save | 'Could not update lock'. | safety-security/index.tsx:54-56 |
| Unlock sheet taking the app inactive | Authentication outcome rules, not the app-state change. | useBiometricGate.ts:126-141 |
| Quick switch under 1.5 seconds without reaching the background | No re-lock. | useBiometricGate.ts:15-19, 143-155 |
| Accessibility | Overlay is an accessibility modal labelled 'AGI Mobile is locked'; the cover is hidden from accessibility. | AppLockOverlay.tsx:34-50 |
| Android recents snapshot | unknown | no secure-window code found |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/mobile/__tests__/BiometricGate.test.tsx`: Gate states and prompts (by name)
- `apps/mobile/__tests__/RootLayoutAppLock.test.tsx`: Overlay, reset
- `apps/mobile/__tests__/AppLockOverlay.test.tsx`: Overlay view
- `apps/mobile/__tests__/AppLockOffer.test.tsx`: One-time offer
- `apps/mobile/__tests__/AppLockWording.test.ts`: Platform wording
- `apps/mobile/__tests__/biometric-flag-store.test.ts`: Flag store
- `apps/mobile/__tests__/SafetySecurity.test.tsx`: Safety & Security screen
- `apps/mobile/__tests__/PermissionsSpeechAndFaceId.test.tsx`: Speech and Face ID permission rows
- `apps/mobile/__tests__/PermissionDetailOsTruth.test.tsx`: OS truth on detail pages
- `apps/mobile/src/features/settings/permissions/__tests__/PermissionStatusLabel.test.tsx`: Permission status labels

**Test scenarios**

- **Turn on without a device lock**
  1. Remove the device passcode.
  2. Switch App Lock on.
  - Expected: 'Set up a device lock first'; switch stays off.
- **Cover in switcher**
  1. Turn App Lock on.
  2. Open the app switcher.
  - Expected: AGI card shows a plain cover.
- **Short peek**
  1. Swipe to the switcher and back within a second.
  - Expected: No prompt.
- **Failed unlock**
  1. Return after more than a few seconds.
  2. Cancel the prompt.
  - Expected: Locked screen remains.
- **Reset**
  1. On the lock screen tap the reset link and confirm.
  - Expected: Signed out, App Lock off, local chats still there.
- **Permissions**
  1. Open Permissions, tap Camera, deny in system settings.
  - Expected: Status reflects the OS truth.

**Where to look when it fails**

- Warnings '[biometric] Authentication error, staying locked:', '[biometricFlag] SecureStore read failed:', '[RootLayout] App lock reset failed:'.
- Secure storage keys named above.

**Hands-on test plans**

- Mobile: [70-qa/test-plans/mobile/071-mobile-application.md](../../70-qa/test-plans/mobile/071-mobile-application.md)

## 10. Gaps and dependencies

- **The privacy cover works only while App Lock is on; the brief lists it as a separate control.** Affects: Users who do not use App Lock. Evidence: apps/mobile/src/features/auth/hooks/useBiometricGate.ts:119-125. Work needed: Decide whether to cover without App Lock.
- **Android recents behaviour is not established.** Affects: Android users. Evidence: No secure-window flag found. Work needed: Verify on a device, then add a secure flag if needed.
- **The brief's code references (index.tsx:99, 28; _layout.tsx:726) do not point at the gate code; lines moved.** Affects: Documentation. Evidence: apps/mobile/app/_layout.tsx:604-609 shows unrelated code. Work needed: Refresh references.
- **Draft names the screen 'Safety and Security'; the label is 'Safety & Security'.** Affects: Documentation. Evidence: safety-security/index.tsx:78. Work needed: Use the exact label.

**Depends on**

- surface:mobile
- mode:local
- mode:cloud
- SYS-security-and-privacy
- SYS-authentication-and-identity
- SYS-shared-ui-and-design
- store:secure-storage-biometric-flag
- file:apps/mobile/lib/biometricFlagStore.ts

## Unknown

- Android recents screenshot behaviour.
- Whether the offer wording and timing match product intent.
- What the server does on sign-out during reset.
- Whether iPad switcher peeks always report an inactive state.
- Tests were not read line by line.

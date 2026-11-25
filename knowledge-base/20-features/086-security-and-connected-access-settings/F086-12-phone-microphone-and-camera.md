---
id: "F086-12"
type: "feature"
title: "Phone microphone and camera"
aliases: ["Phone microphone and camera", "Mobile permissions", "App Permissions", "Permission detail", "S86.20", "S86.21"]
area: "86 Security and connected-access settings"
available_on: ["mobile"]
implementation: {web: "n/a", desktop: "n/a", mobile: "built", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "not seen by a person", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S86.20", "S86.21"]
depends_on: ["surface:mobile", "mode:local", "mode:cloud", "SYS-voice-and-media", "SYS-local-inference", "SYS-security-and-privacy", "SYS-execution-boundaries", "store:permissionsStore", "file:apps/mobile/src/features/settings/permissions/registry.ts", "file:apps/mobile/src/features/settings/permissions/Detail.tsx", "F086-11"]
basis: "code inspection"
second_reader: "9 of 11 sampled statements were correct; the others were corrected on this page"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F086-12 Phone microphone and camera

On the phone, Settings, Permissions shows whether AGI may use the microphone and the camera, reading the answer from the operating system. If not yet asked, the person can trigger the system prompt; if denied, an Open Settings button leads to the device settings. AGI cannot change device permissions itself.

Area: [86. Security and connected-access settings](README.md). Requirement items: [S86.20](../../10-requirements/capabilities/086-security-and-connected-access-settings.md#s8620), [S86.21](../../10-requirements/capabilities/086-security-and-connected-access-settings.md#s8621).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | does not apply | does not apply | n/a |
| Desktop | does not apply | does not apply | n/a |
| Mobile | partly built (this page lists unfinished parts) | built | not seen by a person |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Lists device permissions with their current level and opens a detail screen per permission that reads the system status, offers the system request when undecided and sends the person to device Settings otherwise (apps/mobile/src/features/settings/permissions/Detail.tsx:50-107, 154-167; registry.ts:51-79).

**Why it exists.** A person must be able to see and change what the app can use. The operating system owns the decision; AGI shows the truth and a path to change it.

**Who uses it.** Every phone user, especially those using voice input or document scanning.

**Problems it solves**

- Voice or camera does nothing and the person does not know why.
- Not knowing what is allowed.
- Stale status after changing it in device Settings.

**Use cases**

- Check the microphone is allowed before dictating.
- Allow the camera so a document can be scanned.
- After denying by mistake, tap Open Settings and re-enable.
- Return from device Settings and see the new status.

## 2. User experience

**Where to find it**

- Phone: Settings, then the 'Device' group, then 'Permissions' (also reachable from Safety & Security and Capabilities), then 'Microphone' or 'Camera'. The row sits in the Device group directly above and separate from the 'Safety & Security' row, not nested under it; the list screen title is 'Permissions' with an 'App Permissions' header (apps/mobile/src/features/settings/index.tsx:668-735; apps/mobile/src/features/settings/permissions/index.tsx:180-191; safety-security/index.tsx).
- Other apps: not applicable; Desktop shows Microphone in its system permission rows under F086-11 (packages/contracts/local-runtime/src/desktop-privacy.ts:3).

**Before you start**

- The phone app. No sign-in or plan requirement found in the permissions code.
- iOS also lists Speech Recognition, Photos & Files, Reminders and Face ID; Notifications and Calendar on both platforms (registry.ts:251-259). Device-dependent rows (those with an isAvailable check, such as Face ID) are hidden until the device reports them available (permissions/index.tsx:25-27, 123-125, 137-150).

**Screens and controls**

- List row per permission: label, access level label (Never, Ask, While using, Always), accessibility text '<label> permission. Access level: <level>. Tap to manage.' (index.tsx:49; types.ts:20-25; registry.ts:276-284).
- Detail: title, headline (Access Granted, Not Requested, Access Denied), description ('Used for voice input and audio recording.' or 'Used for photo capture and document scanning.'), explanation, one action button, note 'AGI can’t change device permissions for you.' (Detail.tsx:154-167, 254-322; types.ts:27-37; registry.ts:163-189).
- The list screen carries a help link to https://agiworkforce.com/help?q=permissions+microphone+camera (permissions/index.tsx:20).

**Journey**

1. Open Settings, Device, Permissions.
2. Tap Microphone or Camera.
3. Read the status.
4. If 'Not Requested', tap 'Allow Microphone' or 'Allow Camera' and answer the system prompt.
5. If denied, tap 'Open Settings' and change it in the device settings.
6. Return to the app; the status refreshes on its own.

**What the person sees and gets**

- Headline and colour change when granted (Detail.tsx:222-235).
- Read failure text: 'Could not read this permission from your device. The status shown may be out of date.' (Detail.tsx:27-28, 71-72).
- Request failure text: 'Your device could not process the request. Try again, or open Settings.' (Detail.tsx:29-30, 102-103).
- Alert 'Could not open Settings' if the OS settings page cannot open (Detail.tsx:32-36).

**Settings**

- The decision itself lives in device Settings; the app stores only the last observed status (apps/mobile/stores/permissionsStore.ts:9-13, 42-61).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Status is read when the screen gains focus and again whenever the app returns to the foreground (Detail.tsx:56-84).
- The list screen also re-reads every permission on focus and on app foreground return (permissions/index.tsx:117-165, AppState listener at ~161).
- Microphone status uses the camera module's microphone permission calls; camera status uses its camera permission calls (registry.ts:51-59, 71-79).
- Unrecognised status values are shown as denied; only 'granted' counts as allowed (registry.ts:45-49, 272-274).
- A request is possible only while undecided; otherwise the button opens device Settings (Detail.tsx:155-167).
- A repeat press while a request is running is ignored (Detail.tsx:94-96).
- Last observed status is saved with persisted storage (permissionsStore.ts:42-61).
- iOS usage descriptions for the camera and microphone are declared in the app config (apps/mobile/app.config.js:75-76, 170-173). The microphone string says it is used for 'voice input and real-time voice conversations with AI' (app.config.js:171-172), so the microphone gates real-time voice, which is server-backed, not only on-device dictation.

**Incomplete**

- The draft cited detail.tsx; the file is Detail.tsx.
- The OS 'restricted' state (parental or device policy) is not told apart from 'denied' (registry.ts:45-49 maps every non-granted, non-undetermined value to denied).
- Access-level wording (Never, Ask, While using) does not map exactly to what the OS offers; 'Ask' is shown for an unasked permission (registry.ts:276-284).

**Present but disconnected or switched off**

- none found in the code

**Not available**

- Android shows no Speech Recognition, Photos, Reminders or Face ID row (registry.ts:251-259).
- Other apps: not applicable.

## 4. Required behaviour

**Established requirements**

- The user can see and change whether AGI may use the microphone. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S86.20)
- The user can see and change whether AGI may use the camera. (source: S86.21 (same brief))
- Status is read when the screen opens and again each time the app returns to the foreground. (source: apps/mobile/src/features/settings/permissions/Detail.tsx:60-84)
- Status is the operating system's answer. (source: apps/mobile/src/features/settings/permissions/registry.ts:51-57, 71-77)
- A failed read shows a permission read failure message. (source: apps/mobile/src/features/settings/permissions/Detail.tsx:71-72)
- Dictation requests microphone permission and handles the native state. (source: doc: docs/product/requirements.md (row M-VOICE-002, line 1001))

**Acceptance criteria**

1. Opening Microphone shows the current OS state: granted, denied or not requested.
2. With an undecided state, the button asks for the permission; with a denial, it opens device Settings.
3. After changing the permission in device Settings and returning, the screen shows the new state without a restart.
4. If the OS call fails, the failure message appears and the button works again.
5. Opening an unknown permission route shows 'Unknown permission type.'
6. The permission list shows Microphone and Camera on iOS and Android.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- [inferred] Because the app stores only the last observed status, a stale value can show in the list until the list refreshes; this caveat is weak, since the list screen re-reads every permission on focus and on foreground return (permissions/index.tsx:117-165).
- [inferred] The feature is device-only and needs no account or plan.

**Proposed improvements** (suggestions, not requirements)

- [proposed] Show 'Restricted by your device' separately from denied.
- [proposed] Say on the Microphone screen that on-device speech recognition on iOS also needs the Speech Recognition permission.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| screen | PermissionsScreen | `apps/mobile/src/features/settings/permissions/index.tsx` | List of permissions, level labels. |
| screen | PermissionDetailScreen | `apps/mobile/src/features/settings/permissions/Detail.tsx` | Status read, request, open Settings. |
| config | PERMISSION_REGISTRY | `apps/mobile/src/features/settings/permissions/registry.ts` | Per permission label, description, status and request calls. |
| config | permission types and labels | `apps/mobile/src/features/settings/permissions/types.ts` | Status and level vocabulary. |
| store | permissionsStore | `apps/mobile/stores/permissionsStore.ts` | Persisted last observed status. |
| screen | route settings/permissions | `apps/mobile/app/(app)/settings/permissions/index.tsx` | Route for the list. |
| screen | route settings/permissions/[permission] | `apps/mobile/app/(app)/settings/permissions/[permission].tsx` | Route for the detail. |
| config | app config usage strings | `apps/mobile/app.config.js` | Camera and microphone purpose text and plugin config. |
| integration | expo-camera | `apps/mobile/src/features/settings/permissions/registry.ts` | Reads and requests microphone and camera permission. |
| service | settings entry | `apps/mobile/src/features/settings/index.tsx` | Settings row 'Permissions' in the Device group. |
| service | screen titles | `apps/mobile/src/features/settings/screenTitles.ts` | Permissions titles. |
| test | PermissionsScreen snapshot | `apps/mobile/src/features/settings/permissions/__tests__/PermissionsScreen.snapshot.test.tsx` | List, detail, stale status, request failure. |
| test | PermissionStatusLabel | `apps/mobile/src/features/settings/permissions/__tests__/PermissionStatusLabel.test.tsx` | Level labels. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The person opens the detail screen; the status is read from the operating system. | device | Detail.tsx:56-75; registry.ts:51-54, 71-74 |
| The status is shown and saved as the last observed value. | device | Detail.tsx:68-69; permissionsStore.ts:42-61 |
| If undecided, the person taps the button and the system shows its own prompt. | device | Detail.tsx:94-107; registry.ts:56-59, 76-79 |
| If decided, the button opens the device settings page. | device | Detail.tsx:32-36, 270 |
| Returning to the foreground triggers a new read. | device | Detail.tsx:76-79 |
| The list screen re-reads every permission on focus and on foreground return. | device | permissions/index.tsx:117-165 |
| The help link on the list screen opens https://agiworkforce.com/help?q=permissions+microphone+camera outside the app. | outside service | permissions/index.tsx:20 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Last observed status per permission | store:permissionsStore (persisted device storage) | No; device only | Kept until app data is cleared |
| The real permission | Operating system | Not by AGI | Controlled by the person in device Settings |

**Models and providers.** No model or provider takes part in the permission check. The permission gates voice input and photo capture whichever model or local inference engine is used. The microphone purpose text covers 'voice input and real-time voice conversations with AI' (app.config.js:171-172), so the permission also enables real-time voice, a server-backed feature. Which speech engine handles audio is outside this feature.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | No sign-in needed; nothing in the permissions code reads the account. |
| Permissions | The operating system holds the permission; AGI cannot change it (Detail.tsx:312-318). |
| Subscription | none found in the code. |
| Limits and metering | none found in the code. |
| Feature flags | none found in the code. |
| Model compatibility | Not applicable. |
| Provider restrictions | none found in the code. |
| Local mode | Works the same in Local mode; the permission check stays on the device and no paid plan or sign-in is involved. This applies only to the check, not to what the permission enables (for example real-time voice, which is server-backed). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| loading | Starts from the last observed status, then updates after the read. | Detail.tsx:50-52 |
| read failure | Alert text 'Could not read this permission...'. | Detail.tsx:27-28, 71-72, 270-282 |
| request in progress | Button text 'Asking for <label> access…', disabled and dimmed. | Detail.tsx:159-163, 267-269 |
| request failure | Alert text; control re-enabled. | Detail.tsx:102-106 |
| settings cannot open | Alert 'Could not open Settings'. | Detail.tsx:32-36 |
| unknown permission | 'Unknown permission type.' with a back arrow. | Detail.tsx:109-150 |
| foreground return | Status read again; late results from an older read are ignored. | Detail.tsx:60-79 |
| accessibility | Summary and button have labels; failure uses alert role. | Detail.tsx:210-212, 262-266, 285-288 |
| restricted by device policy | Shown as denied. | registry.ts:45-49 |
| device-dependent permission unavailable | The list hides any kind with an isAvailable check (such as Face ID) until the device reports it available. | permissions/index.tsx:25-27, 123-125, 137-150 |
| offline | Not affected; all permission calls are on device. Only the help link needs a network. | Detail.tsx and registry.ts make only on-device permission calls; no network call found; help link at permissions/index.tsx:20 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/mobile/src/features/settings/permissions/__tests__/PermissionsScreen.snapshot.test.tsx`: Native-backed list, camera detail, unknown route fails closed, stale-status message on read failure, request failure re-enables the control.
- `apps/mobile/src/features/settings/permissions/__tests__/PermissionStatusLabel.test.tsx`: Ask versus Never labels, per-kind overrides, no Location row.

**Test scenarios**

- **Undecided microphone**
  1. On a fresh install open Settings, Permissions, Microphone.
  2. Tap Allow Microphone and accept.
  - Expected: Headline becomes Access Granted.
- **Denied camera**
  1. Deny the camera in the system prompt.
  2. Reopen Camera.
  - Expected: 'Access Denied' and an 'Open Settings' button.
- **Change in device Settings**
  1. Tap Open Settings.
  2. Enable the permission.
  3. Return to AGI.
  - Expected: Status updates without leaving the screen.
- **Read failure**
  1. Make the permission read fail in a test.
  - Expected: Failure message shown; status marked possibly out of date.
- **Local mode**
  1. Switch to Local mode.
  2. Open Microphone.
  - Expected: Same behaviour; no sign-in prompt.

**Where to look when it fails**

- Alert text 'Could not read this permission from your device.'
- permissionsStore persisted value (MMKV).
- Device log for expo-camera permission calls.

**Hands-on test plans**

- Mobile: [70-qa/test-plans/mobile/086-security-and-connected-access-settings.md](../../70-qa/test-plans/mobile/086-security-and-connected-access-settings.md)

## 10. Gaps and dependencies

- **Restricted state is shown as denied.** Affects: Phone users with managed devices.. Evidence: registry.ts:45-49. Work needed: Map restricted separately and explain.
- **Draft cited detail.tsx; the real file is Detail.tsx, with different line numbers.** Affects: Documentation.. Evidence: apps/mobile/src/features/settings/permissions/Detail.tsx. Work needed: Use corrected paths.
- **No evidence that the voice feature handles a denied microphone with a guiding message outside Settings.** Affects: Phone voice users.. Evidence: not opened. Work needed: Check the voice path.

**Depends on**

- surface:mobile
- mode:local
- mode:cloud
- SYS-voice-and-media
- SYS-local-inference
- SYS-security-and-privacy
- SYS-execution-boundaries
- store:permissionsStore
- file:apps/mobile/src/features/settings/permissions/registry.ts
- file:apps/mobile/src/features/settings/permissions/Detail.tsx
- F086-11

## Unknown

- How the voice and scan features react when the permission is denied.
- Whether iOS and Android show different headline text for the same status.
- Whether the list screen refreshes on foreground return: it does (permissions/index.tsx:117-165, AppState listener at ~161); only the detail was fully read by the first pass.
- Display name of the Settings parent row (Safety and security) in the shipped UI: the row is labelled 'Safety & Security', and the Permissions row sits in the separate Device group (settings/index.tsx:668-735).
- Android specifics of the permission request flow.
- Whether the Photos row's label is 'Photos & Files' (not verified).

## Second reader's check

A second reader checked 11 statements of this page against the code: 9 correct, 2 wrong or partly wrong, 0 could not be checked. The statements found wrong were corrected on this page; they are listed here for the record.

- **Partly wrong (section 2/3):** "Phone: Settings, Safety and security, 'Permissions' (index.tsx:180-191; settings/index.tsx:727)." The code shows: In the main Settings list the 'Permissions' row sits in the 'Device' group, directly above and separate from the 'Safety & Security' row (settings/index.tsx:723-735). The Permissions screen's back link goes to safety-security and safety-security/index.tsx also links to it, so it is reachable from there, but it is not nested under it. The row label is 'Safety & Security'; the list screen title is 'Permissions' with a 'App Permissions' header. (apps/mobile/src/features/settings/index.tsx:668-735; permissions/index.tsx:~177; safety-security/index.tsx). **Corrected:** Open Settings, then Device, then 'Permissions' (also reachable from Safety & Security and Capabilities), then Microphone or Camera.
- **Partly wrong (section 3):** "iOS also lists Speech Recognition, Photos & Files, Reminders and Face ID; Notifications and Calendar on both platforms (registry.ts:251-259)." The code shows: PERMISSION_KINDS matches that platform split, but the list screen hides any kind that has an isAvailable check until it reports available (e.g. Face ID on devices without it). The Photos row's label is not verified as 'Photos & Files'. (registry.ts:251-259; permissions/index.tsx:25-27, 123-125, 137-150). **Corrected:** Add that device-dependent rows (those with isAvailable, such as Face ID) are hidden until the device reports them available.

**Facts the page missed**

- The list screen also re-reads every permission on focus and on app foreground return (permissions/index.tsx:117-165, AppState listener at ~161), so the page's Unknown item 'whether the list refreshes on foreground return' is answerable: it does. The inferred stale-status caveat is therefore weaker than stated.
- The microphone iOS purpose string says it is used for 'voice input and real-time voice conversations with AI' (app.config.js:171-172), so the microphone gates real-time voice, which is a server-backed feature, not only on-device dictation. The page's 'nothing leaves the device' applies only to the permission check, not to what the permission enables.
- The list screen carries a help link to https://agiworkforce.com/help?q=permissions+microphone+camera (permissions/index.tsx:20), a network-opening path not mentioned in sections 6 or 8.

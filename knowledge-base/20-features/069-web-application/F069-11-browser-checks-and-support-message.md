---
id: "F069-11"
type: "feature"
title: "Browser checks and support message"
aliases: ["Browser checks and support message", "Unsupported browser notice", "Browser capability detection", "S69.18", "S69.19"]
area: "69 Web application"
available_on: ["web"]
implementation: {web: "built", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "not seen by a person", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S69.18", "S69.19"]
depends_on: ["surface:web", "file:apps/web/lib/browser-support.ts", "file:apps/web/app/layout.tsx", "file:apps/web/features/chat/components/Composer/VoiceInputButton.tsx", "file:apps/web/features/notifications/lib/web-push-client.ts", "F069-08", "SYS-voice-and-media", "SYS-shared-ui-and-design", "SYS-security-and-privacy"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F069-11 Browser checks and support message

The web app checks that the browser has the features it needs. An inline script shows a notice on old browsers, a no-script notice covers disabled JavaScript, and single features (voice, web push, screen capture) check their own APIs and explain or hide when missing. The notice names Chrome, Edge, Firefox or Safari.

Area: [69. Web application](README.md). Requirement items: [S69.18](../../10-requirements/capabilities/069-web-application.md#s6918), [S69.19](../../10-requirements/capabilities/069-web-application.md#s6919).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | does not apply | does not apply | n/a |
| Mobile | does not apply | does not apply | n/a |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Tells the user clearly when the browser cannot run the app or a feature, instead of failing silently (apps/web/lib/browser-support.ts:1-11; apps/web/app/layout.tsx:142-161).

**Why it exists.** S69.18 and S69.19: check before using a browser API; explain what to use instead.

**Who uses it.** Visitors on old browsers, with JavaScript off, or on browsers missing microphone, push or capture APIs.

**Problems it solves**

- Blank page on an old browser.
- Dead microphone button.
- A switch that cannot work.

**Use cases**

- Old browser shows 'This browser is too old to run AGI...'.
- JavaScript off shows 'AGI needs JavaScript...'.
- Click the mic where unsupported and see a hint.

## 2. User experience

**Where to find it**

- Every page: banner at the very top (role alert) and a noscript paragraph (apps/web/app/layout.tsx:142-161).
- Chat composer microphone button hint: 'Voice input is not supported in this browser. Try Chrome or Edge.' for 3 seconds (apps/web/features/chat/components/Composer/VoiceInputButton.tsx:10-16,50-54).
- Settings, Notifications: text 'Browser push is unavailable here.' (apps/web/features/notifications/components/WebPushToggle.tsx).
- Feedback dialog: capture control only if the screen capture call exists (apps/web/features/chat/components/Composer/ComposerFeedbackDialog.tsx:94-96).

**Before you start**

- none

**Screens and controls**

- Banner text: 'This browser is too old to run AGI. Open it in a current version of Chrome, Edge, Firefox or Safari.' (apps/web/lib/browser-support.ts:9).
- No-script text: 'AGI needs JavaScript. Turn it on, or open AGI in a current version of Chrome, Edge, Firefox or Safari.' (browser-support.ts:11).
- Mic button with label 'Voice input not supported in this browser' (VoiceInputButton.tsx:12).

**Journey**

1. Page loads; the inline script tests Object.hasOwn, structuredClone, Array.prototype.at, fetch and a lookbehind regular expression.
2. If any is missing, the hidden banner is revealed.
3. With JavaScript off, the noscript text shows instead.
4. A feature that needs an API tests it itself and shows its own hint or hides.

**What the person sees and gets**

- Banner styled with a plain border and background, not red: classes border-b border-border bg-background (apps/web/app/layout.tsx:147).

**Settings**

- none found in the code

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Inline check script and banner (browser-support.ts:7-11; layout.tsx:142-153).
- Noscript notice (layout.tsx:154-158).
- Voice button detects getUserMedia and shows the hint (VoiceInputButton.tsx:24-30,50-54).
- Web push support check (apps/web/features/notifications/lib/web-push-client.ts:34-41).
- Feedback dialog screen capture gate (ComposerFeedbackDialog.tsx:94-96).

**Incomplete**

- The banner does not stop the page; a very old browser may fail to run the script at all [inferred].
- Notice text names only four browsers and gives no version numbers.

**Present but disconnected or switched off**

- none found in the code

**Not available**

- A full-page unsupported-browser route: not found; only the banner exists. Other apps n/a.

## 4. Required behaviour

**Established requirements**

- Before using a browser API the app checks support and disables or explains the feature instead of failing. (source: S69.18 (brief))
- A browser that cannot run the app gets a clear explanation with what to use instead. (source: S69.19 (brief))

**Acceptance criteria**

1. Removing structuredClone in a test browser reveals the banner.
2. With all APIs present the banner stays hidden.
3. Disabling JavaScript shows the no-script text.
4. The mic hint appears for about 3 seconds where getUserMedia is missing.
5. Notifications row shows 'Browser push is unavailable here.' where push is unsupported.
6. Screen capture option is absent when getDisplayMedia is missing.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- [inferred] The banner is the 'banner' form of S69.19; no dedicated page exists.

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add a test that runs the script in a stubbed old browser.
- [proposed] Include a link or version hint in the banner.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| config | browser-support | `apps/web/lib/browser-support.ts` | Supported browser list, notices, check script |
| screen | Root layout | `apps/web/app/layout.tsx` | Hidden banner, script, noscript |
| component | VoiceInputButton | `apps/web/features/chat/components/Composer/VoiceInputButton.tsx` | Mic support check and hint |
| component | ChatComposerNew | `apps/web/features/chat/components/Composer/ChatComposerNew.tsx` | Mounts the voice button (line 60) |
| service | web-push-client isWebPushSupported | `apps/web/features/notifications/lib/web-push-client.ts` | Push support gate |
| hook | useWebPushToggle | `apps/web/features/notifications/components/WebPushToggle.tsx` | Unsupported state text |
| component | ComposerFeedbackDialog | `apps/web/features/chat/components/Composer/ComposerFeedbackDialog.tsx` | Screen capture only if supported |
| hook | useDictation | `apps/web/features/chat/hooks/use-dictation.ts` | Dictation controller (permission handling not read) |
| store | voice-input-store | `apps/web/features/chat/stores/voice-input-store.ts` | Microphone permission state per the brief (not read) |
| component | BrowserNotificationStatus | `apps/web/features/notifications/components/BrowserNotificationStatus.tsx` | Shows 'Unavailable' when Notification is missing |
| test | published-safety-claims test | `apps/web/app/__tests__/published-safety-claims.test.ts` | Imports SUPPORTED_BROWSERS and notice text (line 21) |
| test | web-push-client test | `apps/web/features/notifications/lib/__tests__/web-push-client.test.ts` | Support detection cases |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Server renders layout with the hidden banner and an inline script carrying the page nonce. | our servers | apps/web/app/layout.tsx:142-153 |
| The browser runs the script before the app loads and reveals the banner if a feature is missing. | device | apps/web/lib/browser-support.ts:11 |
| Feature components test their APIs on mount or click. | device | VoiceInputButton.tsx:24-45; web-push-client.ts:34-41 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| none | nothing is stored | No | Not applicable |

**Models and providers.** None. Voice transcription, when supported, uses a path described in SYS-voice-and-media; not traced here.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | none found in the code |
| Permissions | Microphone and notification permission are separate browser prompts handled by their features. |
| Subscription | none found in the code |
| Limits and metering | none found in the code |
| Feature flags | none found in the code |
| Model compatibility | none found in the code |
| Provider restrictions | Voice hint recommends Chrome or Edge (VoiceInputButton.tsx:14). |
| Local mode | Checks run on the device with no server call, so they work in any mode. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Old browser | Banner revealed | browser-support.ts:11 |
| JavaScript off | Noscript text | layout.tsx:154-158 |
| Mic unsupported | Hint on click or hover, hidden after 3 s | VoiceInputButton.tsx:50-54,70-95 |
| Script throws | Treated as not supported (try/catch sets ok false) | browser-support.ts:11 |
| Hint timer on unmount | not handled in the code (timeout not cleared) | VoiceInputButton.tsx:51-52 |
| Accessibility | Banner has role alert; hint text is plain | layout.tsx:145 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/__tests__/published-safety-claims.test.ts`: Imports the supported browser list and notice text (import at line 21; what it asserts was not read)
- `apps/web/features/notifications/lib/__tests__/web-push-client.test.ts`: Push support detection

**Test scenarios**

- **Old browser**
  1. In devtools delete structuredClone before load.
  2. Reload.
  - Expected: Banner visible with the four browser names.
- **No JavaScript**
  1. Disable JavaScript.
  2. Load the site.
  - Expected: No-script text shows.
- **Mic missing**
  1. Remove navigator.mediaDevices.
  2. Click the mic.
  - Expected: Hint for about 3 seconds.
- **Push missing**
  1. Open Settings, Notifications in a browser with no PushManager.
  - Expected: 'Browser push is unavailable here.'
- **Capture missing**
  1. Remove getDisplayMedia.
  2. Open the feedback dialog.
  - Expected: No screen capture option.

**Where to look when it fails**

- Element id unsupported-browser-notice (hidden attribute).
- Browser console for script errors.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/069-web-application.md](../../70-qa/test-plans/web/069-web-application.md)

## 10. Gaps and dependencies

- **No test found that runs the check script.** Affects: Old-browser users. Evidence: search of tests for the notice id: only published-safety-claims imports the text. Work needed: Add a unit test for the script.
- **Hint timeout not cleaned up.** Affects: Voice users. Evidence: VoiceInputButton.tsx:51-52. Work needed: Clear on unmount.
- **Microphone permission recovery text is part of S69.08, not covered here.** Affects: Voice users. Evidence: brief S69.08. Work needed: Covered by another feature page.

**Depends on**

- surface:web
- file:apps/web/lib/browser-support.ts
- file:apps/web/app/layout.tsx
- file:apps/web/features/chat/components/Composer/VoiceInputButton.tsx
- file:apps/web/features/notifications/lib/web-push-client.ts
- F069-08
- SYS-voice-and-media
- SYS-shared-ui-and-design
- SYS-security-and-privacy

## Unknown

- What published-safety-claims.test.ts asserts about the notice.
- Microphone permission recovery flow (S69.08) was not traced.
- Exact set of browsers that fail the lookbehind check.
- Whether other features check their own APIs (clipboard, drag-drop) beyond the four named.

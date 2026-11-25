---
id: "F014-05"
type: "feature"
title: "Screenshot and window capture"
aliases: ["Screenshot capture (S14.06)", "Window capture (S14.07)", "Screenshot to Chat", "Window to Chat", "Take a screenshot (Chrome)"]
area: "14 Attachment intake components"
available_on: ["desktop", "chrome"]
implementation: {web: "missing", desktop: "built", mobile: "n/a", cli: "missing", vscode: "missing", chrome: "built"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "not seen by a person"}
requirement_items: ["S14.06", "S14.07"]
depends_on: ["SYS-execution-boundaries", "SYS-security-and-privacy", "SYS-files-artifacts-and-storage", "SYS-agents-tools-and-automation", "F014-02", "F014-01", "surface:desktop", "surface:chrome", "surface:web", "mode:cloud", "mode:local", "file:apps/desktop/electron/screenshot.ts"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F014-05 Screenshot and window capture

On the desktop app a shortcut, menu item or tray item captures the screen or the window in front of the app and pastes it into the composer. The Chrome side panel's 'Take a screenshot' captures the visible tab. Plain-browser web, the CLI and VS Code have no capture control.

Area: [14. Attachment intake components](README.md). Requirement items: [S14.06](../../10-requirements/capabilities/014-attachment-intake-components.md#s1406), [S14.07](../../10-requirements/capabilities/014-attachment-intake-components.md#s1407).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | not built **(disagrees with the ledger on whether it exists)** | built | not seen by a person |
| Desktop | partly built (this page lists unfinished parts) | built | not seen by a person |
| Mobile | does not apply | does not apply | n/a |
| CLI | not built | not built | n/a |
| VS Code | not built | not built | n/a |
| Chrome | partly built (this page lists unfinished parts) | built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Desktop: captures the screen (hiding this app first) or another app's front window, puts the PNG on the clipboard, pastes it into the focused composer, then takes it back off the clipboard (apps/desktop/electron/screenshot.ts:109-244). Chrome: captures the visible tab as PNG and admits it as an attachment (side_panel.ts:14635-14670; background.ts:5610-5660).

**Why it exists.** Showing the assistant what is on screen is the fastest way to ask about it. Brief items S14.06 and S14.07 (doc: knowledge-base/data/area-briefs/014-attachment-intake-components.md).

**Who uses it.** Desktop users asking about an app or window; Chrome users asking about a page.

**Problems it solves**

- No saving a screenshot file first.
- The screen is not left on the clipboard (screenshot.ts:92-105).
- Paste goes only to the right conversation (screenshot.ts:61-107).

**Use cases**

- Press the screenshot shortcut to ask about an error dialog.
- Use the tray item 'Window to Chat' to capture one app window.
- In Chrome, take a screenshot of the visible tab.

## 2. User experience

**Where to find it**

- Desktop app menu 'Screenshot to Chat' (apps/desktop/electron/appMenu.ts:190); tray items 'Screenshot to Chat' and 'Window to Chat' (garnishCore.ts:89-90; tray.ts:180-189); global shortcuts, defaults CommandOrControl+Shift+2 for screen and CommandOrControl+Shift+1 for window, chosen from lists in Settings (packages/contracts/local-runtime/src/host-bridge.ts:164-165; main.ts:1984-1985).
- Chrome: '+' menu then 'Take a screenshot' (side_panel.ts:14635).
- Window capture is not in the app menu, only tray and shortcut (appMenu.ts has no window item).

**Before you start**

- Desktop: macOS Screen & System Audio Recording permission and a relaunch after granting (screenshot.ts:39-53,220).
- Chrome: Cloud chat ready and canUploadFiles (side_panel.ts:10006-10017); the visible tab must be capturable.
- Window capture needs another app's window in front (screenshot.ts:158-160).

**Screens and controls**

- Shortcuts, menu and tray items.
- OS notifications for results.
- Chrome menu item and chip.

**Journey**

1. Press the shortcut (desktop).
2. The app window hides (screen capture only).
3. The capture is pasted into the composer as an image chip.
4. The app window returns; earlier clipboard text is restored.
5. Type the question and send.

**What the person sees and gets**

- Failure notifications: 'Screenshot failed', 'Window capture failed', 'Screenshot copied to clipboard' (screenshot.ts:137,159,220).
- First-time dialog 'Screen recording permission needed' (screenshot.ts:46).
- Chrome: 'This page could not be captured. Try again on a regular website tab.' (locale spAttachmentCaptureFailed).

**Settings**

- Settings > shortcuts for screenshot and window capture (main.ts:1984-1985; garnishCore.ts:124-125).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Desktop screen capture: hides Quick Ask and the main window, waits 300 ms, captures the display near the cursor, writes PNG to clipboard, pastes only into the same trusted page and conversation, restores text (screenshot.ts:190-244,13-15).
- Desktop window capture: front window of another app via desktopCapturer type window (screenshot.ts:142-188; main.ts:1938).
- One capture at a time (screenshot.ts:146).
- Clipboard take-back only if the clipboard still holds the capture, so later copies are not overwritten (screenshot.ts:92-105).
- Chrome: CAPTURE_SCREENSHOT message to the background, captureVisibleTab, tab-change checks, then admitted as 'Screenshot' (background.ts:5610-5670; side_panel.ts:14640-14660).

**Incomplete**

- Only prior clipboard text is restored; a prior image on the clipboard is lost (screenshot.ts:150,194 readText only).
- Desktop error messages go to OS notifications, not the chat (screenshot.ts:32-37).

**Present but disconnected or switched off**

- A plain-browser screenshot control exists in the shared AttachmentMenu (gated on canTakeScreenshot, AttachmentMenu.tsx:601,689,723) but no app mounts it; the web composer has no screenshot row. getDisplayMedia is used only there and in the feedback dialog (ComposerFeedbackDialog.tsx:54).

**Not available**

- Web in a plain browser: no capture control (brief says built; code does not show one).
- CLI and VS Code: none.
- Chrome: only the visible tab, no window or full-screen capture.

## 4. Required behaviour

**Established requirements**

- A composer control captures the screen and attaches the screenshot (S14.06); the user can attach a capture of a single window (S14.07). Brief status: desktop and Chrome done, CLI and VS Code missing. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S14.06, S14.07)
- If the composer is not ready the image stays on the clipboard and the person is told to paste it. (source: apps/desktop/electron/screenshot.ts:130-140)
- Screenshots and local workspace context sent to a provider need the person's awareness. (source: doc: docs/product/requirements.md:777)

**Acceptance criteria**

1. Pressing the screenshot shortcut hides the app, captures the screen and shows one image chip in the composer.
2. After success the clipboard holds the earlier text again within about a second.
3. Pressing the window shortcut with another app in front attaches that window.
4. With no screen permission the notification says to check Screen & System Audio Recording and relaunch.
5. If the composer is not ready a notification says to paste the image; the image remains on the clipboard.
6. Chrome 'Take a screenshot' adds a 'Screenshot' chip; on a restricted page it shows the capture-failed notice.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The capture inherits the composer's attach rules (restricted free model, local model block) because it is pasted [inferred from webContents.paste at screenshot.ts:132].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Restore a previous clipboard image as well as text.
- [proposed] Show failures inside the app, not only as notifications.
- [proposed] Update the brief: web in a plain browser has no capture.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | captureToChat / captureWindowToChat | `apps/desktop/electron/screenshot.ts` | Capture, clipboard, paste, take-back, notifications. |
| service | composerFocus | `apps/desktop/electron/composerFocus.ts` | focusPageComposer before paste. |
| config | Garnish shortcuts | `apps/desktop/electron/garnishCore.ts` | Shortcut keys and labels. |
| config | Host shortcut choices | `packages/contracts/local-runtime/src/host-bridge.ts` | Allowed chords and defaults. |
| service | shortcuts registration | `apps/desktop/electron/shortcuts.ts` | Binds onScreenshot and onWindowShot. |
| component | Application menu | `apps/desktop/electron/appMenu.ts` | 'Screenshot to Chat' item. |
| component | Tray menu | `apps/desktop/electron/tray.ts` | Screenshot and window items. |
| service | main wiring | `apps/desktop/electron/main.ts` | garnishHandlers onScreenshot and onWindowShot (1937-1938). |
| service | clipboardService readImagePng | `apps/desktop/electron/runtime/clipboardService.ts` | Reads the clipboard image for the take-back check. |
| service | permissionPolicy showsTrustedPage | `apps/desktop/electron/permissionPolicy.ts` | Only the product page receives the paste. |
| component | ChatComposerNew paste | `apps/web/features/chat/components/Composer/ChatComposerNew.tsx` | Receives the pasted image through handlePaste. |
| component | Chrome screenshot item | `apps/extension/src/side_panel.ts` | Menu item and admission. |
| service | Chrome CAPTURE_SCREENSHOT | `apps/extension/src/background.ts` | captureVisibleTab with tab checks. |
| config | Chrome message policy | `apps/extension/src/background/policy.ts` | Allows the message from allowlisted tabs. |
| component | AttachmentMenu (unmounted) | `packages/ui/unified-chat/src/components/AttachmentMenu.tsx` | Shared screen-capture control gated on canTakeScreenshot. |
| config | Platform capabilities | `packages/contracts/types/src/capabilities.ts` | canTakeScreenshot true only for the desktop block. |
| test | screenshot tests | `apps/desktop/electron/__tests__/screenshot.test.ts` | Clipboard take-back and destination checks. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Shortcut, menu or tray fires captureToChat; it reads the current clipboard text and records the paste destination (the trusted product page). | device | screenshot.ts:190-200 |
| App windows hide, 300 ms pass, the display near the cursor is captured as a PNG. | device | screenshot.ts:205-224 |
| PNG written to clipboard; window shown and focused; composer focused; webContents.paste() sends it to the composer paste handler, which runs normal attachment admission. | device | screenshot.ts:80-90,109-140; ChatComposerNew.tsx:2372 |
| After 1000 ms the capture is removed from the clipboard if still there and prior text is restored. | device | screenshot.ts:13-15,92-105 |
| The attached image uploads on send like any attachment. | our servers | WebChatPage.tsx:2685 |
| Chrome: side panel asks the background; captureVisibleTab returns a PNG data URL; admitted and uploaded to the managed upload client. | device and our servers | background.ts:5653; side_panel.ts:10269 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Capture PNG on the OS clipboard | system clipboard, briefly | no (unless a clipboard sync tool does) | removed after paste if unchanged (screenshot.ts:92-105); left in place when the person must paste (screenshot.ts:137) |
| Chrome screenshot data URL | side panel memory then upload | on send | abort on chip removal (side_panel.ts:10312-10320) |

**Models and providers.** Capture needs no provider. The image goes to whichever model answers the turn; a local on-device model on web cannot read attachments (inference.ts:131).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Desktop capture needs none itself; upload on send needs the same as any attachment. Chrome needs Cloud sign-in. |
| Permissions | macOS screen recording permission; the app explains it once per run (screenshot.ts:39-53). Chrome needs tab access; otherwise 'screenshot tab access required' (background.ts:5663-5668). |
| Subscription | Plan gates: none found in the capture code. |
| Limits and metering | Chrome image limits apply on admission (side_panel.ts:10185-10225). Desktop: attach limits apply after paste. Metering of captures: none found. |
| Feature flags | Shortcut preferences in host preferences (main.ts:1984-1985). canTakeScreenshot capability is desktop only (capabilities.ts:94). |
| Model compatibility | Image-capable model needed to read it. |
| Provider restrictions | none found in the code. |
| Local mode | Capture is on the device. On web with a local model the pasted image blocks send (ChatComposerNew.tsx:5333). Desktop local-model behaviour beyond that: unknown. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| No screen permission | Notification names the permission and relaunch. | screenshot.ts:216-221 |
| Capture already running | A second request is ignored. | screenshot.ts:146,191 |
| Composer not ready or chat changed | Notification to paste; image stays on clipboard. | screenshot.ts:130-140 |
| Chat window closed | Notification 'Screenshot copied' with the image on the clipboard. | screenshot.ts:113-114 |
| No other window in front | 'Window capture failed - No other app window is in front to capture.' | screenshot.ts:159 |
| User copied something after paste | Clipboard left alone. | screenshot.test.ts:203-217 |
| Chrome tab changed during capture | Capture withheld with an error. | background.ts:5654-5660 |
| Chrome gate closed | Menu click returns silently without a notice. | side_panel.ts:14641-14642 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/desktop/electron/__tests__/screenshot.test.ts`: take-back from clipboard, prior text restored, left only when told, no pasting into another conversation or untrusted page, no overwriting later copies
- `apps/extension/__tests__/background-screenshot-capture.test.ts`: captures the page that asked, refuses other tabs, withholds when tab changed
- `apps/extension/__tests__/side_panel-attachment-caps.test.ts`: actionable screenshot failure notice (line 387)
- `packages/ui/unified-chat/src/components/__tests__/ChatInput.screenshotOwnership.test.tsx`: shared component screenshot ownership (title only read)

**Test scenarios**

- **Desktop screen capture**
  1. Copy some text.
  2. Press the screenshot shortcut.
  3. Wait one second.
  4. Paste in a text editor.
  - Expected: Image chip in the composer; the copied text is back on the clipboard.
- **Window capture**
  1. Bring another app forward.
  2. Choose 'Window to Chat' from the tray.
  - Expected: That window's image attaches.
- **Permission denied (macOS)**
  1. Revoke screen recording.
  2. Press the shortcut.
  - Expected: Permission dialog once, then 'Screenshot failed' notification.
- **Composer busy**
  1. Open a page that is not the chat.
  2. Press the shortcut.
  - Expected: Notification to paste; image on clipboard.
- **Chrome capture**
  1. Open a normal website.
  2. Choose Take a screenshot.
  - Expected: A Screenshot chip uploads.

**Where to look when it fails**

- Desktop console '[screenshot] capture failed:' and '[screenshot] window capture failed:'.
- Chrome response error text 'The tab changed while the screenshot was taken.'
- Notification titles listed above.

**Hands-on test plans**

- Desktop: [70-qa/test-plans/desktop/014-attachment-intake-components.md](../../70-qa/test-plans/desktop/014-attachment-intake-components.md)
- Chrome: [70-qa/test-plans/chrome/014-attachment-intake-components.md](../../70-qa/test-plans/chrome/014-attachment-intake-components.md)

## 10. Gaps and dependencies

- **Web in a plain browser has no capture although the brief says built** Affects: Web. Evidence: no capture row in ComposerPlusMenu; getDisplayMedia only in unmounted AttachmentMenu. Work needed: Correct the brief or add a control.
- **Previous clipboard image not restored** Affects: Desktop. Evidence: screenshot.ts:150,194. Work needed: Save and restore non-text clipboard.
- **Failures shown only as OS notifications** Affects: Desktop. Evidence: screenshot.ts:32-37. Work needed: Also show a notice in the composer.
- **Chrome intake gate returns without a message** Affects: Chrome. Evidence: side_panel.ts:14641-14642. Work needed: Show the uploads-off notice.
- **No capture in CLI or VS Code** Affects: CLI, VS Code. Evidence: brief. Work needed: Product decision.
- Not built on: Web, CLI, VS Code (from the capability ledger).

**Depends on**

- SYS-execution-boundaries
- SYS-security-and-privacy
- SYS-files-artifacts-and-storage
- SYS-agents-tools-and-automation
- F014-02
- F014-01
- surface:desktop
- surface:chrome
- surface:web
- mode:cloud
- mode:local
- file:apps/desktop/electron/screenshot.ts

## Unknown

- Windows and Linux behaviour of the capture (macOS permission code only was read).
- Whether the brief's web 'done' refers to desktop-hosted web.
- How a local on-device model on desktop treats the pasted image.
- Default chord shown in Settings versus first list entry (only the lists were read).

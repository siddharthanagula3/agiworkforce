---
id: "F109-02"
type: "feature"
title: "Screen and window capture to chat (desktop shortcuts)"
aliases: ["Screenshot to Chat", "Window to Chat", "Screenshot-to-chat shortcut (S109.09)", "Window-to-chat shortcut (S109.10)", "captureToChat", "captureWindowToChat", "capture_page (Chrome)"]
area: "109 Optional native and ambient extensions"
available_on: ["desktop", "chrome"]
implementation: {web: "n/a", desktop: "built", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "built"}
verification: {web: "n/a", desktop: "not seen by a person", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "not seen by a person"}
requirement_items: ["S109.09", "S109.10"]
depends_on: ["surface:desktop", "surface:chrome", "file:apps/desktop/electron/screenshot.ts", "file:apps/desktop/electron/browserHandoff.ts", "file:apps/extension/manifest.json", "SYS-files-artifacts-and-storage", "SYS-chat-turn-pipeline", "SYS-execution-boundaries", "F109-01"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F109-02 Screen and window capture to chat (desktop shortcuts)

On AGI Desktop, one global key captures the whole display under the pointer and another captures the app window in front. The picture is put on the clipboard and pasted into the main chat composer, then the old clipboard is restored. In Chrome, a separate key sends the visible tab to Desktop's chat.

Area: [109. Optional native and ambient extensions](README.md). Requirement items: [S109.09](../../10-requirements/capabilities/109-optional-native-and-ambient-extensions.md#s10909), [S109.10](../../10-requirements/capabilities/109-optional-native-and-ambient-extensions.md#s10910).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | does not apply | does not apply | n/a |
| Desktop | partly built (this page lists unfinished parts) | built | not seen by a person |
| Mobile | does not apply | does not apply | n/a |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | partly built (this page lists unfinished parts) | built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Desktop captures a screen or one other app's window with Electron's capturer, copies the PNG to the clipboard, focuses the main chat composer and pastes (apps/desktop/electron/screenshot.ts:142-244). Chrome's 'capture_page' key sends the visible tab picture to Desktop, which pastes it the same way (apps/extension/src/background.ts:7764-7821; apps/desktop/electron/browserHandoff.ts:33-60).

**Why it exists.** The brief requires a shortcut that captures the screen, or one chosen window, and attaches it to an AGI chat (doc: knowledge-base/data/area-briefs/109-optional-native-and-ambient-extensions.md S109.09, S109.10).

**Who uses it.** Desktop users asking AGI about what is on screen; Chrome users with Desktop paired who want a page picture in a Desktop chat.

**Problems it solves**

- Taking a screenshot, saving it and attaching it by hand.
- Capturing one window rather than the whole screen.
- Leaving a screen picture on the clipboard where every app can read it.

**Use cases**

- Press the Screenshot key while reading an error and ask AGI to explain it.
- Press the Window key while a design tool is in front to send only that window.
- In Chrome press the capture key to hand the page to the Desktop chat.
- Capture while Quick Ask is up: the panel is hidden first so it is not in the picture.

## 2. User experience

**Where to find it**

- Desktop: global keys, defaults 'CommandOrControl+Shift+2' (Screenshot to Chat) and 'CommandOrControl+Shift+1' (Window to Chat) (packages/contracts/local-runtime/src/host-bridge.ts:161-168); also the menu items in the tray (F109-01) and an app-menu entry (apps/desktop/electron/appMenu.ts, not read in detail).
- Settings rows 'Screenshot to chat shortcut' and 'Window to chat shortcut' (apps/web/features/desktop-host/components/DesktopSettingsSection.tsx:92-120).
- Chrome: command 'capture_page', suggested Alt+Shift+Y, Command+Shift+Y on Mac, description from locale string commandCapturePage (apps/extension/manifest.json:75-80).
- Web, mobile, CLI, VS Code: not present.

**Before you start**

- Desktop: a main window showing the trusted product page with a chat composer.
- macOS: Screen & System Audio Recording permission (apps/desktop/electron/screenshot.ts:39-52).
- Window capture: computer-use helper support, which is macOS only (apps/desktop/electron/runtime/computerUseService.ts:226-235,392-400).
- Chrome: Desktop running and paired, and the page's site approved (apps/extension/src/background.ts:7765-7785).

**Screens and controls**

- Shortcut keys; tray items 'Screenshot to Chat' and 'Window to Chat'.
- Notifications: 'Screenshot copied', 'Screenshot copied to clipboard', 'Screenshot failed', 'Window capture failed' (screenshot.ts:114,136,218,159).
- Dialog 'Screen recording permission needed' on first denied attempt (screenshot.ts:45-51).

**Journey**

1. Press the key.
2. Desktop hides Quick Ask and the main window (screen capture only), waits 300 ms, captures the display under the cursor (screenshot.ts:205-213).
3. The PNG goes on the clipboard; the main window is shown and focused, the composer is focused and the image pasted (screenshot.ts:109-140).
4. One second later the clipboard is put back: prior text restored, or cleared (screenshot.ts:92-107,235-238).
5. The main window is shown again if it was visible before (screenshot.ts:239-241).

**What the person sees and gets**

- The image appears as an attachment in the composer.
- If the chat window is closed: 'The chat window is closed, so the image is on your clipboard.' (screenshot.ts:114).
- If the composer is not ready or the chat changed: image stays on the clipboard with a notification asking the user to paste (screenshot.ts:135-138).
- Window capture without another front window: 'No other app window is in front to capture.' (screenshot.ts:159).

**Settings**

- screenshotShortcut and windowShotShortcut (garnishCore.ts:46-53).
- Chrome: key can be changed in the browser's shortcut settings; labels in apps/extension/src/features/options/keyboard-shortcut-rows.ts:19.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Whole-display capture picks the display under the cursor and its matching source (apps/desktop/electron/screenshot.ts:209-215; garnishCore.ts:226-236).
- A second press during a capture is ignored by a shared 'capturing' flag (screenshot.ts:25,146,191).
- The paste target is the chat page that was open at press time; if the page changed or is not the trusted product page nothing is pasted (screenshot.ts:59-72,126-134).
- The clipboard is restored only if it still holds the capture, so text the user copied since is kept (screenshot.ts:92-107).
- Chrome path validates a PNG signature on Desktop and pastes it with the same clipboard take-back (apps/desktop/electron/browser/bridgeServer.ts:581-591,720-723; browserHandoff.ts:24-31).

**Incomplete**

- Window to Chat works only where the computer-use helper exists; on Windows and Linux frontWindowIdOutside returns null, so the user always sees 'No other app window is in front to capture.' (computerUseService.ts:226-235,392-394; screenshot.ts:157-161).
- The brief says 'one chosen window' but the code captures the window in front outside AGI; no picker (screenshot.ts:157; apps/desktop/electron/main.ts:1938).
- If the paste fails the picture stays on the clipboard until the user pastes; it is not taken back (screenshot.ts:182-185).

**Present but disconnected or switched off**

- None found.

**Not available**

- Mobile, web, CLI, VS Code: not present.
- Chrome whole-screen capture: the Chrome key captures the visible tab only (apps/extension/src/background.ts:7792).

## 4. Required behaviour

**Established requirements**

- A shortcut captures the screen and attaches it to an AGI chat. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S109.09)
- A shortcut captures one chosen window, not the whole screen, into an AGI chat. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S109.10)
- A shortcut takes only a chord the shell offers; Screenshot on the paste chord captured the screen at every paste, which is why choices are restricted. (source: doc: docs/decisions/wire-or-cut.md:737)

**Acceptance criteria**

1. Press the Screenshot key with the main chat open: the image is in the composer and the clipboard text from before is back within about two seconds.
2. Press the Window key with another app in front: only that window appears.
3. Press either key twice quickly: only one capture runs.
4. Close the main window and press Screenshot: a notification says the image is on the clipboard.
5. On macOS with permission denied: the 'Screen recording permission needed' dialog appears once and a failure notice follows.
6. Copy new text after the paste: it is not overwritten by the restore.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Attachment rules of the composer (size, type, whether Local mode accepts images) apply after paste but were not traced [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Offer Window to Chat on Windows and Linux or hide the item there.
- [proposed] Offer a window picker if 'chosen window' must mean choice.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | captureToChat | `apps/desktop/electron/screenshot.ts` | Whole-screen capture, paste, clipboard restore. |
| service | captureWindowToChat | `apps/desktop/electron/screenshot.ts` | Front-window capture. |
| service | putCaptureOnClipboard / takeCaptureBackFromClipboard | `apps/desktop/electron/screenshot.ts` | Clipboard write and fingerprint check before restore. |
| service | frontWindowIdOutside | `apps/desktop/electron/runtime/computerUseService.ts` | Asks the macOS helper which other window is in front. |
| other | front action in helper | `apps/desktop/electron/native/macos/agi-input.swift` | Returns the front window id, excluding AGI's own process (lines 217-245, 286-287). |
| service | focusPageComposer | `apps/desktop/electron/composerFocus.ts` | Focuses the composer before paste. |
| service | pickSourceForDisplay | `apps/desktop/electron/garnishCore.ts` | Chooses the capturer source for the display. |
| service | registerGarnishShortcuts | `apps/desktop/electron/shortcuts.ts` | Registers the two keys. |
| config | HOST_SHORTCUT_CHOICES | `packages/contracts/local-runtime/src/host-bridge.ts` | Defaults and offered chords. |
| service | deliverBrowserHandoff | `apps/desktop/electron/browserHandoff.ts` | Pastes a Chrome page capture into the main chat. |
| endpoint | native bridge page-capture message | `apps/desktop/electron/browser/bridgeServer.ts` | Receives the Chrome PNG on the local bridge, validates it, calls deliverToChat (lines 581-591, 720-723). |
| service | captureCurrentPage | `apps/extension/src/background.ts` | Chrome 'capture_page' handler (lines 7758-7821). |
| config | commands.capture_page | `apps/extension/manifest.json` | Declares the Chrome key (lines 75-80). |
| component | DesktopSettingsSection shortcut rows | `apps/web/features/desktop-host/components/DesktopSettingsSection.tsx` | Lets the user choose the keys. |
| test | screenshot tests | `apps/desktop/electron/__tests__/screenshot.test.ts` | Clipboard take-back and paste target rules. |
| test | browser handoff tests | `apps/desktop/electron/__tests__/browserHandoff.test.ts` | Chrome page capture paste. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Global key fires; handler calls captureToChat or captureWindowToChat. | device | apps/desktop/electron/main.ts:1937-1938 |
| Windows are hidden and Electron's capturer reads the screen or window as a PNG. | device | apps/desktop/electron/screenshot.ts:163-166,209-213 |
| PNG goes to the system clipboard; composer focused; paste; clipboard restored. | device | apps/desktop/electron/screenshot.ts:176-177,92-107 |
| Later, when the user sends the chat, the image goes with the message to whatever mode the chat uses. | device and our servers | SYS-chat-turn-pipeline; not traced for images here [inferred] |
| Chrome path: the key captures the visible tab, sends it over the local bridge to Desktop, and Desktop pastes it. | device | apps/extension/src/background.ts:7792-7807; apps/desktop/electron/browser/bridgeServer.ts:720-723 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Capture PNG | System clipboard for about one second; then in the composer attachment state | Not synced by this feature; becomes part of the chat if sent | Taken off the clipboard after the paste (screenshot.ts:92-107). Not written to disk by this code. |

**Models and providers.** No model is called by the capture. Image understanding happens when the chat is sent, using the chat's selected model and provider (SYS-chat-turn-pipeline); whether the model accepts images is unknown here.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | The paste only goes to a trusted product page; that page requires sign-in (apps/web/app/quick-ask/layout.tsx:15-23 for Quick Ask; main chat page not traced). |
| Permissions | macOS Screen & System Audio Recording (screenshot.ts:39-52); macOS helper for window capture; Chrome: paired Desktop and approved site (background.ts:7765-7785). |
| Subscription | none found in the code for the capture itself; chat sending is governed by SYS-subscriptions-entitlements-and-usage. |
| Limits and metering | none found in the code for the capture. Chrome capture counts an action in local stats (apps/extension/src/background.ts:7803-7815). |
| Feature flags | none found |
| Model compatibility | unknown: depends on whether the chat model accepts images. |
| Provider restrictions | none found |
| Local mode | Capture and paste run fully on the device with no network. Sending the image inside a Local-mode chat was not traced: unknown. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Capture already running | Second press ignored | screenshot.ts:146,191 |
| No screen source or empty picture | 'Screenshot failed' with a permission hint on macOS | screenshot.ts:216-224 |
| No other window in front | 'No other app window is in front to capture.' | screenshot.ts:158-161 |
| Main window closed | Image left on the clipboard with a notification | screenshot.ts:113-116 |
| Chat changed during capture | No paste; notification asks for manual paste | screenshot.ts:126-139 |
| Error thrown | Failure notice; capture still taken back from the clipboard | screenshot.ts:178-186,229-238 |
| Chrome: Desktop not connected | Notification that the capture was not delivered | apps/extension/src/background.ts:7765-7768 |
| Chrome: tab changed | Notification PAGE_CAPTURE_TAB_CHANGED_MESSAGE | apps/extension/src/background.ts:7794-7797 |
| Screen reader | not handled in the code beyond notifications | apps/desktop/electron/screenshot.ts |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/desktop/electron/__tests__/screenshot.test.ts`: Clipboard take-back, prior text restore, paste into the right chat only, user copy not overwritten.
- `apps/desktop/electron/__tests__/browserHandoff.test.ts`: Delivering a Chrome page capture into the chat window.
- `apps/desktop/electron/__tests__/garnishCore.test.ts`: Source picking and shortcut rules.
- `apps/extension/__tests__/page-capture-delivery.test.ts`: Chrome page capture delivery to Desktop.
- `apps/extension/__tests__/background-screenshot-capture.test.ts`: unknown: file exists, contents not read.

**Test scenarios**

- **Screen to chat**
  1. Open a chat in Desktop.
  2. Copy some text.
  3. Press the Screenshot key.
  - Expected: Image attached in the composer; clipboard shows the copied text again.
- **Window to chat**
  1. Put another app in front.
  2. Press the Window key.
  - Expected: Only that window's picture is attached.
- **Window key off macOS**
  1. On Windows or Linux press the Window key.
  - Expected: Notification says no other app window is in front (current behaviour).
- **Closed main window**
  1. Close the main window, press Screenshot.
  - Expected: Notification says the image is on the clipboard.
- **Chrome capture**
  1. Pair Chrome with Desktop, approve a site, press the Chrome capture key.
  - Expected: Picture appears in the Desktop chat composer.

**Where to look when it fails**

- Console lines '[screenshot] capture failed', '[screenshot] window capture failed', '[screenshot] the capture could not be taken back off the clipboard'.
- Chrome errors from the bridge: 'The captured page was not a PNG image.', 'No chat is open in Desktop.' (bridgeServer.ts:584,588; browserHandoff.ts:52-56).

**Hands-on test plans**

- Desktop: [70-qa/test-plans/desktop/109-optional-native-and-ambient-extensions.md](../../70-qa/test-plans/desktop/109-optional-native-and-ambient-extensions.md)
- Chrome: [70-qa/test-plans/chrome/109-optional-native-and-ambient-extensions.md](../../70-qa/test-plans/chrome/109-optional-native-and-ambient-extensions.md)

## 10. Gaps and dependencies

- **Window to Chat is macOS-only in practice** Affects: Desktop on Windows and Linux. Evidence: apps/desktop/electron/runtime/computerUseService.ts:226-235,392-394. Work needed: Implement a window source lookup or hide the control and say so in settings.
- **No window picker; the brief wording is 'one chosen window'** Affects: Desktop users. Evidence: apps/desktop/electron/screenshot.ts:157. Work needed: Product decision: front-window is acceptable or add a picker.
- **Chrome key captures the visible tab, not the screen, and needs paired Desktop** Affects: Chrome users without Desktop. Evidence: apps/extension/src/background.ts:7765,7792. Work needed: Document or add a stand-alone path.
- **No run record of any capture on a real machine** Affects: all. Evidence: no verification file found. Work needed: Drive the app and record results.

**Depends on**

- surface:desktop
- surface:chrome
- file:apps/desktop/electron/screenshot.ts
- file:apps/desktop/electron/browserHandoff.ts
- file:apps/extension/manifest.json
- SYS-files-artifacts-and-storage
- SYS-chat-turn-pipeline
- SYS-execution-boundaries
- F109-01

## Unknown

- Local route path of the desktop bridge for the Chrome message.
- Whether the composer accepts the pasted image in every mode and plan.
- Contents of apps/extension/__tests__/background-screenshot-capture.test.ts.
- How the appMenu.ts screenshot entry (brief cites :108) behaves; not read.

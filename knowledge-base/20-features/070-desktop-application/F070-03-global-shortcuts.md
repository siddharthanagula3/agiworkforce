---
id: "F070-03"
type: "feature"
title: "Global shortcuts"
aliases: ["Global shortcut", "Quick Ask", "Quick composer", "Garnish shortcuts", "Stop Agents", "Dictation shortcut", "S70.05", "S70.06"]
area: "70 Desktop application"
available_on: ["desktop"]
implementation: {web: "n/a", desktop: "built", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "not seen by a person", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S70.05", "S70.06"]
depends_on: ["surface:desktop", "file:apps/desktop/electron/shortcuts.ts", "file:apps/desktop/electron/quickAsk.ts", "F070-02", "F070-05", "SYS-chat-turn-pipeline", "SYS-voice-and-media", "SYS-shared-ui-and-design"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F070-03 Global shortcuts

Six system-wide keys (Quick Ask, New Chat Window, Screenshot to Chat, Window to Chat, Dictation, Stop Agents) work while another app is in front. Quick Ask opens a small floating panel that shows the compact chat page. Conflicts are reported; Stop Agents can never be turned off.

Area: [70. Desktop application](README.md). Requirement items: [S70.05](../../10-requirements/capabilities/070-desktop-application.md#s7005), [S70.06](../../10-requirements/capabilities/070-desktop-application.md#s7006).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | does not apply | does not apply | n/a |
| Desktop | built | built | not seen by a person |
| Mobile | does not apply | does not apply | n/a |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Registers OS-level shortcuts, reports taken, duplicate and malformed keys, lets the user choose presets or off, and opens a 480 by 620 pixel always-on-top panel on the Quick Ask key. (shortcuts.ts:92-116, quickAsk.ts:6-7, :52-80)

**Why it exists.** The brief wants system-wide shortcuts that are configurable and report conflicts, and a small composer over any app (S70.05, S70.06). Stop Agents is the key that halts a screen-controlling agent from any app (garnishCore.ts:95-103).

**Who uses it.** Desktop users who want to ask or capture without switching windows.

**Problems it solves**

- Starting a chat needs no window switch.
- A key already held by another app is not silently broken; the user sees the reason (shortcuts.ts:45-63).
- A web settings page cannot register an arbitrary system key; only offered presets are accepted (garnishCore.ts:192-199).

**Use cases**

- Press the Quick Ask key in a browser, type a question and press Enter.
- Press the screenshot key to attach the screen (see F070-05).
- Change the Quick Ask key in Settings to another preset.
- Press Stop Agents to stop running turns.

## 2. User experience

**Where to find it**

- Desktop only. Settings page rows 'Quick Ask shortcut', 'New chat shortcut', 'Screenshot to chat shortcut', 'Window to chat shortcut', 'Voice shortcut', 'Stop agents shortcut' (DesktopSettingsSection.tsx:92-115).
- Tray submenu 'Shortcuts' with radio choices (tray.ts:198-201). File > Quick Ask and the Dock menu 'Quick Ask' (appMenu.ts:182-187, :621).

**Before you start**

- Desktop app running (the main process registers the keys even with no window; unregistered at will-quit, main.ts:2763).
- Page must be reachable for the panel to show content (quickAsk.ts:124).

**Screens and controls**

- Default chords are the first preset of each list: Quick Ask Alt+Shift+Space, New Chat Alt+Shift+N, Screenshot CommandOrControl+Shift+2, Window shot CommandOrControl+Shift+1, Voice Alt+Shift+V, Stop CommandOrControl+Alt+. (host-bridge.ts:161-168).
- Select boxes list the presets, the current value if unusual and 'none' for keys that may be off (DesktopSettingsSection.tsx:158-166).
- Quick Ask panel: frameless, not resizable, always on top across workspaces, hides on blur or Escape (quickAsk.ts:53-90).

**Journey**

1. Press the Quick Ask key. The panel is created if needed, placed in the upper centre of the display under the cursor and focused (quickAsk.ts:139-162).
2. Type a prompt and press Enter in the compact chat page (apps/web/app/quick-ask/page.tsx:6-8).
3. If the page navigates anywhere outside /quick-ask (a full conversation, upgrade page or settings), the panel hides and the main window opens that route (quickAsk.ts:29-41, :97-114).
4. Press Escape or click another window: the panel hides (quickAsk.ts:81-89).
5. To change a key, choose a preset in Settings or in the tray Shortcuts submenu (tray.ts:73-102).

**What the person sees and gets**

- Notification 'Shortcut unavailable' with the key and reason, shown once per registration pass (shortcuts.ts:34, :52-63).
- Settings notes: 'Already used by another Desktop shortcut.', 'Already used by another app.', 'Not a shortcut this computer can register.' (DesktopSettingsSection.tsx:150-154).
- Tray heading shows the reason after the label (tray.ts:104-108).
- Stop Agents shows a notification 'Agents stopped', 'Screen control is yours' or 'Nothing to stop' (main.ts:1804-1820).

**Settings**

- Six shortcut preferences, saved durably (shortcuts.ts:156).
- Dictation into other apps: macOS only preference dictateIntoFocusedApp, default off (main.ts:1984, garnishCore.ts:572).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Registration with status registered, taken, duplicate, malformed or off (shortcuts.ts:74-90).
- Duplicate detection sees through modifier spelling and order (garnishCore.ts:148-182).
- Stop Agents claims its chord first and cannot be set to none; a change that leaves it unregistered is rolled back with a message (shortcuts.ts:130-169, garnishCore.ts:105-107).
- The page may only choose presets, keep the current chord, or turn off a key that may be off (garnishCore.ts:192-199, main.ts:2163-2172).
- Quick Ask panel is warmed up 5 seconds after launch and reloaded if the first load failed (main.ts:402, :2701, quickAsk.ts:91-96, :152-156).
- Hand-off of non-Quick-Ask routes to the main window (quickAsk.ts:97-114, main.ts:2692).
- Voice key dictates into the app, or into another app on macOS when enabled (main.ts:1921-1930).

**Incomplete**

- The notification shows only once per pass; later conflicts in the same session are logged only (shortcuts.ts:52-57). This matches the brief's 'warning once'.
- Whether Quick Ask needs a signed-in session or shows sign-in inside the panel is not established; the panel hands sign-in URLs to the main window via the policy (quickAsk.ts:79).

**Present but disconnected or switched off**

- Brief S70.20 says cross-application dictation is not applicable anywhere, but code for it exists (dictationElsewhere.ts, main.ts:1893-1930). Whether it is shipped is unknown; it is off by default.

**Not available**

- Custom chords outside presets from the settings page are refused (main.ts:2163-2172).
- Shortcuts on web, mobile, CLI, VS Code, Chrome: not applicable.

## 4. Required behaviour

**Established requirements**

- System-wide shortcuts (Quick Ask, screenshot, voice) work while another app is focused, are configurable and report conflicts. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S70.05)
- A global shortcut opens a small composer over any app where the user can type and send a prompt. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S70.06)
- A key that another app holds is reported as taken; the same key twice is reported as duplicate. (source: task Should list; shortcuts.ts:83-89)
- Stop Agents can never be set off; the change is rolled back if it would leave no stop key. (source: task Should list; shortcuts.ts:150-169)
- A prompt needing a full conversation, an upgrade page or settings opens in the main window. (source: task Should list; quickAsk.ts:43-50 comment)
- The voice press must reach the main window even when Quick Ask is up or the window is hidden. (source: doc: docs/decisions/wire-or-cut.md (Voice shortcut row))

**Acceptance criteria**

1. Press each default chord from another app: the matching action runs.
2. Pick a chord already used by another app: Settings shows 'Already used by another app.' and one notification appears.
3. Pick the same chord for two Desktop shortcuts: the later one shows 'Already used by another Desktop shortcut.'
4. Try to set Stop Agents to none: refused with the Stop Agents message.
5. In Quick Ask open a link to the upgrade or settings page: the panel hides and the main window opens it.
6. Press Escape or click away: the panel hides.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Because chords are registered only while the app runs, they do not work after quit [inferred from main.ts:2763].
- Prompts sent from Quick Ask follow the same chat pipeline as the main window since it is the same web chat root in compact mode [inferred from apps/web/app/quick-ask/page.tsx:7].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Show the conflict notification each time a chord fails after the user changes it, not only once per pass.
- [proposed] Add a test of the voice press with Quick Ask open.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | shortcuts | `apps/desktop/electron/shortcuts.ts` | Registers, reports and changes global shortcuts (shortcuts.ts:92-169). |
| service | garnishCore shortcut rules | `apps/desktop/electron/garnishCore.ts` | Labels, duplicate detection, always-on key, page write rule (garnishCore.ts:86-199). |
| config | HOST_SHORTCUT_CHOICES | `packages/contracts/local-runtime/src/host-bridge.ts` | Defaults and presets for every shortcut (host-bridge.ts:161-182). |
| service | quickAsk | `apps/desktop/electron/quickAsk.ts` | Panel creation, positioning, hide rules, hand-off (quickAsk.ts:52-193). |
| screen | Quick Ask page | `apps/web/app/quick-ask/page.tsx` | Renders the compact chat root shown in the panel (page.tsx:6-8). |
| service | main garnish wiring | `apps/desktop/electron/main.ts` | Handlers, applyGarnishShortcuts, writeHostPreferences (main.ts:1932-1966, :2159-2180). |
| service | stopAgentsFromShortcut | `apps/desktop/electron/main.ts` | Stops running turns and shows the result notification (main.ts:1804-1820). |
| service | dictation entry | `apps/desktop/electron/dictationElsewhere.ts` | Voice key behaviour over other apps (main.ts:1893-1930). |
| component | DesktopSettingsSection | `apps/web/features/desktop-host/components/DesktopSettingsSection.tsx` | Shortcut select boxes and status notes (DesktopSettingsSection.tsx:150-166, :286-325). |
| service | tray shortcut submenu | `apps/desktop/electron/tray.ts` | Shortcuts radio list and refusal notification (tray.ts:73-119). |
| store | settingsStore | `apps/desktop/electron/settingsStore.ts` | Persists shortcut preferences durably (shortcuts.ts:156). |
| test | shortcuts test | `apps/desktop/electron/__tests__/shortcuts.test.ts` | Registration, conflicts, rollback. |
| test | quickAsk test | `apps/desktop/electron/__tests__/quickAsk.test.ts` | Panel route, reload, hand-off. |
| test | garnishCore test | `apps/desktop/electron/__tests__/garnishCore.test.ts` | Shortcut and preference normalisation. |
| test | HostShortcuts test | `apps/web/features/desktop-host/__tests__/HostShortcuts.test.tsx` | Shortcut UI on the page side. |
| test | QuickAskRoute test | `apps/web/app/quick-ask/QuickAskRoute.test.tsx` | The Quick Ask route. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| At ready, main registers the six chords with the OS. | device | main.ts:2629, shortcuts.ts:92-116 |
| A chord press runs the matching handler even with no window. | device | main.ts:1932-1948 |
| Quick Ask loads the compact chat page from the cloud origin into a sandboxed window using the shared session partition. | our servers | quickAsk.ts:9-10, :67-74, :124 |
| The typed prompt is sent by the chat page to the chat service like any chat message. | our servers | apps/web/app/quick-ask/page.tsx:7 renders WebChatRoot; request path itself belongs to SYS-chat-turn-pipeline |
| A settings change goes from the page over the bridge to writeHostPreferences, which validates and re-registers. | device | main.ts:2159-2180, shortcuts.ts:150-169 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Six shortcut strings | desktop settings file in user data | no sync found | Kept until changed or app data cleared; empty string means off. |
| Quick Ask prompt and reply | the chat history of the account (same pipeline as the main window) [inferred] | yes through the account [inferred] | unknown |

**Models and providers.** The panel uses the same chat page, so the model and provider choice, mode (Local, own key, Cloud) and routing are those of the chat pipeline, not of this feature (SYS-chat-turn-pipeline, SYS-model-catalog-and-routing). Which model Quick Ask uses by default is unknown.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Shortcuts register without an account. The Quick Ask page is a product page; a sign-in navigation is handed off (quickAsk.ts:79, windowPolicy.ts:103). Exact signed-out view unknown. |
| Permissions | On macOS some chords or capture need OS permissions; Quick Ask itself needs none. Dictation into other apps needs Accessibility (computerUseService.ts:329-337). |
| Subscription | none found in the shortcut code; chat usage inside Quick Ask follows the chat pipeline. |
| Limits and metering | Chat usage from Quick Ask is metered by the chat pipeline [inferred]; the shortcut code has no limit. |
| Feature flags | none found in the code |
| Model compatibility | Any model the chat page offers [inferred]. |
| Provider restrictions | none found in the shortcut code. |
| Local mode | The chord, panel and conflict handling run on the device with no plan. The panel's content is a cloud-hosted page, so a Local-model turn from Quick Ask is not established. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Chord taken | Status 'taken', console warn, one notification. | shortcuts.ts:52-63, :89 |
| Duplicate | Later key in claim order gets 'duplicate'; Stop claims first. | garnishCore.ts:168-182 |
| Malformed | Not registered; reason shown. | shortcuts.ts:83-85 |
| Stop change refused | Old chords restored; message tells whether the old one was kept. | shortcuts.ts:136-169 |
| Quick Ask load failed | Reloaded on the next raise; aborted loads are ignored. | quickAsk.ts:91-96, :152-156 |
| Panel blur | Hides when it loses focus. | quickAsk.ts:81-83 |
| Offline | Panel shows a failed load until next raise; no dedicated screen. | quickAsk.ts:93-95 |
| Settings write refused | Error message shown on the settings page. | main.ts:2163-2172, DesktopSettingsSection.tsx:262-264 |
| Accessibility | not handled in the code in the files read | not handled in the code |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/desktop/electron/__tests__/shortcuts.test.ts`: Claiming chords, taken, duplicate, malformed, stop rollback.
- `apps/desktop/electron/__tests__/quickAsk.test.ts`: Compact route, reload after failed load, hand-off to main window.
- `apps/desktop/electron/__tests__/garnishCore.test.ts`: Shortcut normalisation and rules.
- `apps/desktop/electron/__tests__/tray.test.ts`: Tray shortcut submenu behaviour.
- `apps/web/features/desktop-host/__tests__/HostShortcuts.test.tsx`: Page shortcut UI.
- `apps/web/app/quick-ask/QuickAskRoute.test.tsx`: Quick Ask route rendering.

**Test scenarios**

- **Quick Ask from another app**
  1. Focus a browser.
  2. Press the Quick Ask key.
  3. Type a prompt and press Enter.
  - Expected: The panel appears centred in the upper part of the display; the prompt is sent; Escape hides it.
- **Hand-off to main window**
  1. Open Quick Ask.
  2. Trigger a link to Settings or an upgrade page.
  - Expected: Panel hides; main window opens that route.
- **Conflict**
  1. Hold a chord in another app.
  2. Choose it for Quick Ask in Settings.
  - Expected: Status note 'Already used by another app.' and one notification.
- **Stop can't be off**
  1. Try to choose none for Stop agents.
  - Expected: Refused with the Stop Agents message.
- **Duplicate**
  1. Set Quick Ask and New chat to the same chord.
  - Expected: One key shows 'Already used by another Desktop shortcut.'

**Where to look when it fails**

- Console: '[shortcuts] could not register the <label> shortcut' (shortcuts.ts:53-55).
- Settings error text from writeHostPreferences.
- No run results recorded in files read.

**Hands-on test plans**

- Desktop: [70-qa/test-plans/desktop/070-desktop-application.md](../../70-qa/test-plans/desktop/070-desktop-application.md)

## 10. Gaps and dependencies

- **Brief says custom shortcuts can be set; the page may only pick presets or off.** Affects: Desktop users wanting other chords. Evidence: garnishCore.ts:192-199, main.ts:2163-2172. Work needed: Decide whether a native capture-a-chord control is wanted.
- **Quick Ask model and mode behaviour is not established.** Affects: Testers and billing review. Evidence: quick-ask page renders WebChatRoot only. Work needed: Read WebChatRoot compact mode and chat hooks.
- **Brief S70.20 says cross-app dictation is not applicable, but code exists.** Affects: Docs accuracy. Evidence: main.ts:1893-1930. Work needed: Reconcile brief with code and ship state.

**Depends on**

- surface:desktop
- file:apps/desktop/electron/shortcuts.ts
- file:apps/desktop/electron/quickAsk.ts
- F070-02
- F070-05
- SYS-chat-turn-pipeline
- SYS-voice-and-media
- SYS-shared-ui-and-design

## Unknown

- Which model and mode Quick Ask uses by default.
- What an unsigned-in user sees in the panel.
- Whether cross-app dictation is shipped (S70.20 conflict).
- Behaviour of chords on Linux Wayland sessions.
- Whether the Quick Ask chat history appears in the main window list [inferred yes, not verified].

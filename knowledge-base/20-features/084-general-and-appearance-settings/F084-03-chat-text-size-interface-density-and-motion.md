---
id: "F084-03"
type: "feature"
title: "Chat text size, interface density and motion"
aliases: ["Chat text size", "Interface density", "Reduced motion", "Motion", "S84.05", "S84.06", "S84.07", "data-chat-text-size", "data-motion", "ui.reduced-motion"]
area: "84 General and appearance settings"
available_on: ["web", "desktop", "cli", "chrome"]
implementation: {web: "partial", desktop: "partial", mobile: "missing", cli: "built", vscode: "n/a", chrome: "partial"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "n/a", cli: "not seen by a person", vscode: "n/a", chrome: "not seen by a person"}
requirement_items: ["S84.05", "S84.06", "S84.07"]
depends_on: ["surface:web", "surface:desktop", "surface:cli", "surface:chrome", "surface:mobile", "SYS-shared-ui-and-design", "SYS-sync-and-continuity", "table:user_settings", "store:agiworkforce-web-settings", "api:PUT /api/settings/preferences", "F084-01", "F084-04"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F084-03 Chat text size, interface density and motion

Web and Desktop let a person set chat text to Small, Default or Large and set Motion to System or Reduced. The CLI has a reduced-motion setting and plain mode. Chrome honours the device setting only. Interface density has no control or code anywhere. Mobile follows the device by decision.

Area: [84. General and appearance settings](README.md). Requirement items: [S84.05](../../10-requirements/capabilities/084-general-and-appearance-settings.md#s8405), [S84.06](../../10-requirements/capabilities/084-general-and-appearance-settings.md#s8406), [S84.07](../../10-requirements/capabilities/084-general-and-appearance-settings.md#s8407).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built | partly built | not seen by a person |
| Desktop | partly built | partly built | not seen by a person |
| Mobile | not built | not built | n/a |
| CLI | partly built (this page lists unfinished parts) | built | not seen by a person |
| VS Code | does not apply | does not apply | n/a |
| Chrome | partly built | partly built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Text size changes message and code text in chat. Motion reduces animation in the interface and replies. Density is meant to switch compact or comfortable spacing but does not exist.

**Why it exists.** Readability and motion sensitivity. The brief lists text size, density and reduced motion as controls (S84.05 to S84.07). Chat font, contrast and motion are on the Appearance page in the requirements (doc: docs/product/requirements.md section 16.1).

**Who uses it.** People with low vision, motion sensitivity or a preference for denser text.

**Problems it solves**

- Small text in long chats.
- Animations that cause discomfort.
- A terminal spinner that is noisy for a screen reader (apps/cli/src/output.rs:19-25).

**Use cases**

- A Web user sets Chat text size to Large for long reading.
- A person who is motion-sensitive sets Motion to Reduced without changing the whole computer.
- A CLI user sets ui.reduced-motion true.
- A Chrome user with the operating system set to reduce motion gets calm scrolling in Options.

## 2. User experience

**Where to find it**

- Web and Desktop: Settings, Appearance, row 'Chat text size' (a drop-down with Small, Default, Large) and row 'Motion' (buttons System, Reduced) (apps/web/features/settings/sections/AppearanceSection.tsx:116-150, 210-228).
- CLI: config key reduced-motion or ui.reduced-motion (apps/cli/src/config.rs:1572-1578), or plain mode (flag --plain or environment AGI_PLAIN, apps/cli/src/output.rs:30-52).
- Chrome: no control; the pages follow the device preference (apps/extension/src/side_panel.ts:4622; apps/extension/src/options.ts:246, 1214-1218).
- Mobile: no control. The decision says text size and reduced motion follow the device (doc: docs/decisions/2026-11-13-founder-decisions.md D-2026-11-13-04; docs/decisions/2026-09-27-founder-decisions.md S84.05, S84.07).
- Density: none.

**Before you start**

- None.

**Screens and controls**

- Chat text size: a drop-down labelled 'Chat text size' (AppearanceSection.tsx:215-225).
- Motion: two buttons 'System' and 'Reduced' with the hint 'Less animation in replies and the interface. System follows your device.' (AppearanceSection.tsx:126-148).
- There is no 'Full motion' option, on purpose (AppearancePreferences.tsx:45-48).

**Journey**

1. Open Settings, Appearance.
2. Choose a text size or a motion value.
3. The change shows at once: text resizes; animations drop to near zero.
4. It is saved on the device and, when signed in on Web, to the account.

**What the person sees and gets**

- The current value is shown in the control.
- Text in messages and code blocks changes size.
- Sync alert with Retry if the account write fails (SettingsPreferenceRow.tsx:8-26).

**Settings**

- chatTextSize: 'small' | 'default' | 'large' and motion: 'system' | 'reduced' in the web store (web-settings-store.ts:9, 36, 119-120).
- Account keys textSize and motion in appearance (appearance-namespace.ts:39-40, 114-115).
- CLI ui.reduced_motion (config.rs:155).
- Related: Contrast and Chat font rows (AppearanceSection.tsx:155-208).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web: the text size is set as data-chat-text-size on <html>; default removes it (apps/web/shared/components/AppearancePreferences.tsx:17-21). Rules in globals.css change the size of prose and code blocks (apps/web/app/globals.css:932-935, 965-972).
- Web: motion 'reduced' sets data-motion=reduced; System removes it (AppearancePreferences.tsx:49-53). One blanket rule shrinks animation and transition time and turns off smooth scrolling (apps/web/app/globals.css:1928-1935). Several media queries answer the device setting separately (globals.css comment at lines 1920-1927).
- Web: both values are in the account namespace and sync (appearance-namespace.ts:114-115, 143-147).
- CLI: reduced motion or plain mode holds the spinner and shimmer still (apps/cli/src/tui/tui_app.rs:7122-7124; apps/cli/src/tui/motion.rs:10-14).
- Chrome: the side panel and Options style sheets have prefers-reduced-motion rules, and Options scrolls without animation when the device asks (apps/extension/src/side_panel.ts:4622; apps/extension/src/options.ts:246, 1214-1218).

**Incomplete**

- Chrome has no in-app motion control, and no text size control.
- Desktop uses the same hosted screen; no separate check was made.

**Present but disconnected or switched off**

- nothing found

**Not available**

- Interface density (compact or comfortable): no control and no code found on Web, Desktop, Mobile or Chrome. I read AppearanceSection.tsx in full and it has no density row.
- Mobile: no text size or motion control in Appearance (apps/mobile/src/features/settings/appearance/index.tsx shows only theme). By decision, follows the device. Whether the app honours the device text scale and reduce-motion setting was not checked.
- CLI and VS Code: no text size control found. VS Code motion: none found.

## 4. Required behaviour

**Established requirements**

- The user can change the chat text size and it applies across messages. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S84.05)
- The user can switch interface density (compact or comfortable). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S84.06)
- The user can reduce animation, in-app or by honouring the OS preference. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S84.07)
- Mobile follows the device for text size and reduced motion. (source: docs/decisions/2026-09-27-founder-decisions.md (S84.05, S84.07) and docs/decisions/2026-11-13-founder-decisions.md D-2026-11-13-04)
- There is deliberately no option to force full motion over a device reduced-motion request. (source: apps/web/shared/components/AppearancePreferences.tsx:45-48)
- Chat text size and code wrapping live on Appearance (owner decision 2026-11-19). (source: docs/decisions/wire-or-cut.md (row 'Default model, reasoning effort, text size, code wrapping, shortcuts'))

**Acceptance criteria**

1. Choosing Large raises prose and code font size in messages; Default removes data-chat-text-size.
2. Choosing Reduced sets data-motion and animations finish almost instantly.
3. With the operating system set to reduce motion and Motion on System, animations are reduced.
4. Reload keeps both settings.
5. In the CLI, setting ui.reduced-motion true holds the spinner still.
6. A second Web browser signed in shows the same text size and motion.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Density has no owner or design yet [inferred from missing code]. If the product keeps it in scope it needs a design decision first.

**Proposed improvements** (suggestions, not requirements)

- [proposed] Decide to drop S84.06 from scope, or specify compact and comfortable values.
- [proposed] Add a Chrome motion note stating it follows the device.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | ChatTextSizeRow / MotionRow | `apps/web/features/settings/sections/AppearanceSection.tsx` | Web and Desktop controls |
| component | AppearancePreferences | `apps/web/shared/components/AppearancePreferences.tsx` | Stamps data-chat-text-size and data-motion on <html> |
| store | useSettingsStore | `apps/web/shared/stores/web-settings-store.ts` | Persists chatTextSize and motion |
| other | Text size and motion CSS | `apps/web/app/globals.css` | Rules at lines 932-935, 965-972 and 1920-1935 |
| component | CloudSettingsSync | `apps/web/features/settings/components/CloudSettingsSync.tsx` | Saves both values to the account |
| service | appearance-namespace | `apps/web/features/settings/lib/appearance-namespace.ts` | textSize and motion keys; invalid values ignored |
| component | SettingsPreferenceRow | `apps/web/features/settings/components/SettingsPreferenceRow.tsx` | Row layout and sync alert |
| config | ui.reduced_motion | `apps/cli/src/config.rs` | CLI setting (field line 155, set at lines 1572-1578) |
| service | motion module | `apps/cli/src/tui/motion.rs` | Holds the reduced flag |
| service | plain output | `apps/cli/src/output.rs` | Plain mode: no colour, no animation (lines 19-52) |
| service | TUI start-up | `apps/cli/src/tui/tui_app.rs` | Sets reduced motion from config or plain mode (lines 7122-7124) |
| other | Side panel motion CSS | `apps/extension/src/side_panel.ts` | prefers-reduced-motion rule at line 4622 |
| other | Options motion CSS and scroll | `apps/extension/src/options.ts` | Lines 246 and 1214-1218 |
| endpoint | api:PUT /api/settings/preferences | `apps/web/app/api/settings/preferences/route.ts` | Account write |
| table | public.user_settings | `apps/web/app/api/settings/preferences/route.ts` | Account store |
| test | MotionPreferenceWired.test | `apps/web/features/settings/sections/__tests__/MotionPreferenceWired.test.tsx` | Proves the attribute and the rules exist |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person chooses a value; the store updates and the effect sets or removes the attribute on <html>. | device | AppearanceSection.tsx:218, 137; AppearancePreferences.tsx:17-21, 49-53 |
| The browser applies the matching CSS rules at once. | device | apps/web/app/globals.css:932-935, 1928-1935 |
| Signed-in Web sends changed keys to the account after 400 ms. | device and our servers | CloudSettingsSync.tsx:259-298 |
| CLI: at start the TUI reads the config and plain mode and sets the reduced flag. | device | apps/cli/src/tui/tui_app.rs:7122-7124 |
| Chrome: the browser matches the device media query; no stored value. | device | apps/extension/src/side_panel.ts:4622 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Web chatTextSize and motion | localStorage 'agiworkforce-web-settings' | Yes, to account namespace 'appearance' (textSize, motion) | Kept until changed or browser data cleared |
| CLI reduced_motion | CLI config file ([ui] reduced_motion) | No | Kept in the file |

**Models and providers.** No model or provider takes part.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Not needed for the device value. Account sync needs sign-in on Web. |
| Permissions | none found in the code. |
| Subscription | No plan limit seen; no entitlement check in the rows. |
| Limits and metering | Settings endpoints are rate limited (preferences/route.ts:136, 180). Nothing metered. |
| Feature flags | none found in the code. |
| Model compatibility | Not related to any model. |
| Provider restrictions | none found in the code. |
| Local mode | Works with no sign-in and no payment on Web and Desktop (device store) and in the CLI. Mobile has no control; it follows the device. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Default text size | No attribute is set; base style stands. | AppearancePreferences.tsx:19 |
| Device asks for reduced motion, Motion is System | Media queries reduce motion; the in-app attribute is absent. | apps/web/app/globals.css:1920-1927 (comment), 1928 |
| Spinner under reduced motion | Slowed, not stopped, so a wait still reads as a wait. | apps/web/app/globals.css:1936-1940 |
| Invalid account value | Ignored per field. | appearance-namespace.ts:93-97, 143-147 |
| Account save fails | Alert with Retry; device keeps the choice. | SettingsPreferenceRow.tsx:8-26 |
| Invalid CLI value | Error 'reduced-motion must be true or false'. | apps/cli/src/config.rs:1572-1578 |
| Screen reader (CLI) | Screen reader mode and plain mode remove colour and animation. | apps/cli/src/config.rs:162-165; apps/cli/src/output.rs:19-25 |
| Offline, cancel, timeout | not handled in the code beyond the failed-save alert. | CloudSettingsSync.tsx:182-186 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/shared/components/AppearancePreferences.test.tsx`: Text size attribute for small and large, cleared on default; data-motion stamped and cleared.
- `apps/web/features/settings/sections/__tests__/MotionPreferenceWired.test.tsx`: data-motion set for Reduced; System hands control back; style sheet rules answer the attribute; no way to force motion.
- `apps/web/features/settings/sections/AppearanceSection.test.tsx`: The Motion preference is offered with the other appearance controls; the section lists the appearance controls.
- `apps/cli/src/config.rs`: In-file tests at about lines 3470-3610 set and save reduced_motion and check it survives a merge.
- `apps/web/features/settings/lib/__tests__/appearance-namespace.test.ts`: Invalid values for each control are ignored.

**Test scenarios**

- **Large text**
  1. Open a chat with code.
  2. Settings, Appearance, Chat text size, Large.
  - Expected: Message and code text grow; <html> has data-chat-text-size=large; Default removes it.
- **Reduced motion in app**
  1. Set Motion to Reduced.
  - Expected: <html> has data-motion=reduced; transitions are near zero length; smooth scroll is off.
- **Device preference**
  1. Turn on the operating system reduce-motion setting.
  2. Leave Motion on System, reload.
  - Expected: Animations are reduced through the media queries.
- **CLI**
  1. Run the CLI config command with reduced-motion true.
  2. Open the TUI and start a turn.
  - Expected: The spinner stays still.
- **Absent controls**
  1. Open Mobile Appearance and Chrome Options.
  - Expected: No text size, density or motion control is present; behaviour follows the device.

**Where to look when it fails**

- Inspect <html> attributes data-chat-text-size and data-motion.
- Check appearance.textSize and appearance.motion in public.user_settings.
- CLI error text 'reduced-motion must be true or false'.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/084-general-and-appearance-settings.md](../../70-qa/test-plans/web/084-general-and-appearance-settings.md)
- Desktop: [70-qa/test-plans/desktop/084-general-and-appearance-settings.md](../../70-qa/test-plans/desktop/084-general-and-appearance-settings.md)
- CLI: [70-qa/test-plans/cli/084-general-and-appearance-settings.md](../../70-qa/test-plans/cli/084-general-and-appearance-settings.md)
- Chrome: [70-qa/test-plans/chrome/084-general-and-appearance-settings.md](../../70-qa/test-plans/chrome/084-general-and-appearance-settings.md)

## 10. Gaps and dependencies

- **Interface density has no control or code on any app.** Affects: Web, Desktop, Mobile, Chrome. Evidence: Brief S84.06 status missing; no density row in AppearanceSection.tsx. Work needed: Decide scope; if kept, design values and add the setting and style rules.
- **Mobile has no text size or motion control, only the device settings, and the code was not checked to confirm it honours them.** Affects: Mobile. Evidence: appearance/index.tsx has only theme; decision doc says follow the device. Work needed: Verify device text scale and reduce-motion handling on Mobile.
- **Chrome has no text size control.** Affects: Chrome. Evidence: Options Appearance holds only Theme (appearance-section.ts:36-70). Work needed: Add or record as not planned.
- **The requirements page lists Contrast and Chat font beside these, but the brief does not track them.** Affects: Web. Evidence: docs/product/requirements.md section 16.1; AppearanceSection.tsx:155-208. Work needed: Add brief items for Contrast and Chat font.
- Not built on: Mobile (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- surface:cli
- surface:chrome
- surface:mobile
- SYS-shared-ui-and-design
- SYS-sync-and-continuity
- table:user_settings
- store:agiworkforce-web-settings
- api:PUT /api/settings/preferences
- F084-01
- F084-04

## Unknown

- Whether Mobile honours device text scale and reduce-motion across its screens (not checked).
- Whether the Chrome side panel has any text size setting beyond browser zoom (not found).
- Whether VS Code has any motion handling (no setting found; webview CSS not searched in full).
- How Desktop handles this on first launch beyond the hosted page.

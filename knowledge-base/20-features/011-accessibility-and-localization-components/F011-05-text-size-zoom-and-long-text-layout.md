---
id: "F011-05"
type: "feature"
title: "Text size, zoom and long-text layout"
aliases: ["Text resizing (S11.12)", "Browser-zoom reflow (S11.13)", "Long-label and translated-copy layouts (S11.27)", "Chat text size", "maxFontSizeMultiplier"]
area: "11 Accessibility and localization components"
available_on: ["web", "desktop", "mobile", "cli", "vscode", "chrome"]
implementation: {web: "partial", desktop: "partial", mobile: "partial", cli: "built", vscode: "partial", chrome: "partial"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S11.12", "S11.13", "S11.27"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:vscode", "surface:chrome", "file:apps/web/shared/components/AppearancePreferences.tsx", "file:apps/web/shared/stores/web-settings-store.ts", "SYS-sync-and-continuity", "SYS-shared-ui-and-design"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F011-05 Text size, zoom and long-text layout

Keeps text readable at larger sizes: a Chat text size setting on web, device text size on Mobile, browser zoom reflow to one column on web, and long or translated labels that wrap or truncate. Web, Desktop and Mobile are partial and unverified at 200 and 400 percent; the CLI and Chrome are marked done.

Area: [11. Accessibility and localization components](README.md). Requirement items: [S11.12](../../10-requirements/capabilities/011-accessibility-and-localization-components.md#s1112), [S11.13](../../10-requirements/capabilities/011-accessibility-and-localization-components.md#s1113), [S11.27](../../10-requirements/capabilities/011-accessibility-and-localization-components.md#s1127).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built | partly built | not seen by a person |
| Desktop | partly built | partly built | not seen by a person |
| Mobile | partly built | partly built | not seen by a person |
| CLI | built | built | not seen by a person |
| VS Code | partly built | partly built | not seen by a person |
| Chrome | partly built | partly built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Lets people enlarge text (app setting, browser zoom, OS text size) without clipping. The web shell switches to a drawer layout on narrow viewports, which is what 400% zoom produces. Mobile caps scaling at set multipliers and stacks rows when text is large.

**Why it exists.** Low-vision users need larger text, and translated strings are longer than English.

**Who uses it.** Low-vision users and people using translated interfaces, on all apps.

**Problems it solves**

- Clipped or overlapping text at large sizes.
- Horizontal scrolling at high zoom.
- Long German or Arabic labels breaking layout.

**Use cases**

- Set Chat text size to Large on web.
- Zoom the browser to 400 percent and use the app in one column.
- Raise phone text size and read settings rows stacked.
- Read a long label truncated cleanly in the Chrome model button.

## 2. User experience

**Where to find it**

- Web and Desktop: Settings, Appearance, row 'Chat text size' with options Small, Default, Large (apps/web/features/settings/sections/AppearanceSection.tsx:211-229).
- Browser zoom: browser feature; layout tiers in apps/web/shared/components/layout/app-shell-layout.ts:20-40.
- Mobile: no in-app text size setting; follows the device Text Size (doc: docs/decisions/2026-11-13-founder-decisions.md:80-82).
- VS Code: text follows the editor font size (webviewContent.ts:230-236).
- Chrome: side panel text truncation and wrapping (apps/extension/src/side_panel.ts).

**Before you start**

- Web: signed-in settings page; browser zoom needs nothing.
- Mobile: change the OS text size.

**Screens and controls**

- Select 'Chat text size' (Small, Default, Large) on web.
- Browser zoom keys.
- Compact shell: 'Open navigation' control opens a drawer under 768 px width (app-shell-layout.ts:6-7,24-26; WebAppShell.tsx:685-695).

**Journey**

1. Open Settings, Appearance.
2. Choose Large.
3. The root element gets data-chat-text-size='large' and prose grows to 17px (AppearancePreferences.tsx:19-22; globals.css:935-937).
4. For zoom: press the browser zoom shortcut up to 400 percent; viewport width in CSS pixels falls below 768 and the drawer layout appears [inferred from the breakpoints].

**What the person sees and gets**

- Larger chat prose and code text.
- Single column shell with drawer navigation.

**Settings**

- chatTextSize: small, default, large (apps/web/shared/stores/web-settings-store.ts:9,119,141).
- Synced with other Appearance settings through the account preferences client (apps/web/features/settings/components/CloudSettingsSync.tsx:99-130).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web chatTextSize writes data-chat-text-size on the html element; CSS sets prose to 13.5px (small) or 17px (large) and code blocks likewise (apps/web/shared/components/AppearancePreferences.tsx:19-22; apps/web/app/globals.css:932-937,965-971).
- Web shell resolves compact (<768), tablet (768-1023) and regular (>=1024) layouts with drawer, rail or persistent sidebar (apps/web/shared/components/layout/app-shell-layout.ts:6-40).
- Mobile: settings rows cap font multiplier at 2 or 1.9 and stack rows at 1.5 or more (apps/mobile/src/features/settings/index.tsx:226; apps/mobile/src/ui/theme/tokens.ts:93,96; apps/mobile/src/features/settings/personalization/index.tsx:152-153).
- Mobile test forbids font sizes derived from viewport width (apps/mobile/src/ui/theme/__tests__/accessibilityPreferenceCoverage.test.ts:112-140).
- CLI: truncates by display columns using clip_cols, truncate_cols, display_width (apps/cli/src/tui/tui_app.rs:32).
- Chrome: model name truncates instead of cutting a word, tested (apps/extension/__tests__/side-panel-a11y.test.ts:72-83); overflow-wrap rules (apps/extension/src/features/side-panel/schedulesSection.ts:283-287).
- VS Code text scales from the editor font (webviewContent.ts:230-236) and uses overflow-wrap and ellipsis in 33 places (counted).

**Incomplete**

- Chat text size offers three steps, and the largest prose is 17px, which is about 125 percent of 13.5 and not an established 200 percent (globals.css:935-937). Whether browser or OS text size scales those px sizes is not established.
- No recorded test at 200 percent text or 400 percent zoom; the brief marks web, desktop and Chrome unverified for S11.13.
- Translated-copy layout (S11.27) is unverified on web, desktop, mobile and VS Code.
- Brief conflict: S11.27 header says Chrome done but S11.12 and S11.13 say unverified; the draft task also notes a conflict.

**Present but disconnected or switched off**

- None found.

**Not available**

- Mobile has no in-app text size control (by decision).
- CLI has no zoom concept; terminal font is the terminal's.

## 4. Required behaviour

**Established requirements**

- Text scales with the user's text-size setting (browser, OS or app) up to at least 200% without being cut off. (source: brief S11.12 Should)
- At high browser zoom (400%) the layout reflows to one column with no horizontal scrolling. (source: brief S11.13 Should)
- Long labels and longer translated strings wrap or truncate cleanly without overlapping or clipping controls. (source: brief S11.27 Should)
- Mobile apps follow the device for text size and reduced motion. (source: doc: docs/decisions/2026-11-13-founder-decisions.md:80-82)
- Core flows are exercised at desktop and narrow widths and zoom before release. (source: doc: docs/product/experience-contract.md:796)

**Acceptance criteria**

1. At 200 percent browser text zoom no web chat text is clipped.
2. At 400 percent browser zoom (320 CSS px wide) the web shell shows the drawer layout and no horizontal scrollbar appears on the page.
3. Setting Chat text size to Large visibly enlarges assistant prose and code.
4. At the largest device text size on a phone, settings rows stack and no label is cut off.
5. A long translated label wraps or truncates with an ellipsis and does not overlap its control.
6. In the CLI a long line is clipped to terminal width without breaking wide characters.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The brief's 200 percent target applies to the OS or browser setting, not only the in-app setting [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Express prose sizes in rem so browser text size scales them.
- [proposed] Add a Playwright check at 320 px width and at a larger root font size.
- [proposed] Pseudo-localize with long strings in tests.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | AppearancePreferences | `apps/web/shared/components/AppearancePreferences.tsx` | Writes data-chat-text-size and related attributes (lines 19-22). |
| component | AppearanceSection | `apps/web/features/settings/sections/AppearanceSection.tsx` | Chat text size select (lines 211-229). |
| store | web-settings-store | `apps/web/shared/stores/web-settings-store.ts` | chatTextSize state, type and setter (lines 9,53,119,141). |
| component | CloudSettingsSync | `apps/web/features/settings/components/CloudSettingsSync.tsx` | Includes chatTextSize and motion in synced appearance settings. |
| config | globals.css text size rules | `apps/web/app/globals.css` | Prose and code sizes per setting (932-971); narrow breakpoints (1004,1018). |
| service | app-shell-layout | `apps/web/shared/components/layout/app-shell-layout.ts` | Tier breakpoints 768 and 1024. |
| component | WebAppShell | `apps/web/shared/components/layout/WebAppShell.tsx` | Drawer for compact viewports (lines 185-195,685-695). |
| component | GeneralSection | `apps/web/features/settings/sections/GeneralSection.tsx` | Brief cites it for text size (line 1186); Appearance rows live in AppearanceSection. |
| component | Mobile settings index | `apps/mobile/src/features/settings/index.tsx` | maxFontSizeMultiplier on rows (226,249,282). |
| config | Mobile type tokens | `apps/mobile/src/ui/theme/tokens.ts` | STACKED_ROW_TEXT_SCALE 1.5 and ROW_LABEL_TEXT_SCALE_LIMIT 1.9 (93,96). |
| component | Mobile personalization | `apps/mobile/src/features/settings/personalization/index.tsx` | Uses fontScale to stack rows (152-153,480). |
| component | Mobile ChatsListScreen | `apps/mobile/src/features/chat/ChatsListScreen.tsx` | Brief cites it for text resizing; the line cited is navigation code, so its text-size handling is unconfirmed. |
| config | VS Code type tokens | `apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts` | Sizes derived from --vscode-font-size (230-236). |
| component | Chrome side panel | `apps/extension/src/side_panel.ts` | Model button truncation and wrap rules. |
| component | CLI TUI | `apps/cli/src/tui/tui_app.rs` | Column clipping helpers (line 32). |
| test | accessibilityPreferenceCoverage.test | `apps/mobile/src/ui/theme/__tests__/accessibilityPreferenceCoverage.test.ts` | No viewport-derived font sizes. |
| test | side-panel-a11y.test | `apps/extension/__tests__/side-panel-a11y.test.ts` | Model name truncation at side-panel widths. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person picks a size; the store updates and the effect sets an attribute on the html element. | device | AppearancePreferences.tsx:19-22; AppearanceSection.tsx:213-219 |
| CSS rules for that attribute change prose and code sizes. | device | globals.css:932-937 |
| The setting is saved locally by the persisted store and sent to the account preferences endpoint when signed in. | device and our servers | web-settings-store.ts:117; CloudSettingsSync.tsx:99-130 (path constant MANAGED_CLOUD_SETTINGS_PREFERENCES_PATH, apps/web/app/settings/_lib/preferences-client.ts:116,200) |
| Zoom or OS text size is applied by the browser or OS; the layout reads window width. | device | app-shell-layout.ts:24-26,56-60 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| chatTextSize value in the Appearance namespace. | browser local storage via zustand persist and the account preferences store | yes, when signed in | kept with the account preferences; deletion rules not read |

**Models and providers.** No model or provider takes part.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | The setting works signed-out locally; syncing needs sign-in (CloudSettingsSync uses the session). |
| Permissions | None found in the code. |
| Subscription | None found in the code: text size is not gated. |
| Limits and metering | None found in the code. |
| Feature flags | None found in the code. |
| Model compatibility | Not applicable. |
| Provider restrictions | None found in the code. |
| Local mode | Works in Local mode: the attribute and CSS are on the device. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Default size | No attribute set; base rules apply. | AppearancePreferences.tsx:19-22 |
| Signed out | Local persisted store only [inferred]. | CloudSettingsSync.tsx uses useSession |
| Print | Print scope rules exist; size handling for print not audited. | globals.css:1895-1920 |
| Very large device text on phone | Stacked rows and capped multipliers. | apps/mobile/src/ui/theme/tokens.ts:93,96 |
| Narrow window | Drawer layout under 768 px. | app-shell-layout.ts:24-26 |
| Translated long strings | not verified in the code or tests for web, desktop, mobile and VS Code. | brief S11.27 lists these apps as unverified; no test found |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/mobile/src/ui/theme/__tests__/accessibilityPreferenceCoverage.test.ts`: Type size is independent of window width; reduced motion and high contrast coverage.
- `apps/extension/__tests__/side-panel-a11y.test.ts`: Chrome model name truncation at side-panel widths.
- `apps/web/features/settings/sections/AppearanceSection.test.tsx`: Appearance section controls (file exists; contents not read in detail).
- `apps/web/shared/components/layout/WebAppShell.test.tsx`: Shell behaviour (file exists; references shortcut label).

**Test scenarios**

- **In-app size**
  1. Open Settings, Appearance, set Chat text size to Large.
  2. Open a conversation with prose and code.
  - Expected: Prose is 17px and code scales; Small gives 13.5px.
- **400 percent zoom**
  1. Open web chat at 1280 px wide.
  2. Zoom to 400 percent.
  3. Scroll the page.
  - Expected: Drawer layout, one column, no page-level horizontal scroll.
- **200 percent browser text**
  1. Set the browser default font size to double, reload.
  - Expected: Record whether chat prose scales (px sizes may not).
- **Phone text size**
  1. Set the largest device text size, open Settings.
  - Expected: Rows stack; no clipped label.
- **Long translated label**
  1. Switch language to one with long words, open the Chrome model button and settings rows.
  - Expected: Wrap or ellipsis, no overlap.

**Where to look when it fails**

- DevTools: html[data-chat-text-size] attribute.
- Responsive mode at 320 px.
- Mobile: Accessibility Inspector Dynamic Type.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/011-accessibility-and-localization-components.md](../../70-qa/test-plans/web/011-accessibility-and-localization-components.md)
- Desktop: [70-qa/test-plans/desktop/011-accessibility-and-localization-components.md](../../70-qa/test-plans/desktop/011-accessibility-and-localization-components.md)
- Mobile: [70-qa/test-plans/mobile/011-accessibility-and-localization-components.md](../../70-qa/test-plans/mobile/011-accessibility-and-localization-components.md)
- CLI: [70-qa/test-plans/cli/011-accessibility-and-localization-components.md](../../70-qa/test-plans/cli/011-accessibility-and-localization-components.md)
- VS Code: [70-qa/test-plans/vscode/011-accessibility-and-localization-components.md](../../70-qa/test-plans/vscode/011-accessibility-and-localization-components.md)
- Chrome: [70-qa/test-plans/chrome/011-accessibility-and-localization-components.md](../../70-qa/test-plans/chrome/011-accessibility-and-localization-components.md)

## 10. Gaps and dependencies

- **No evidence the web text size reaches 200 percent; Large is 17px and px sizes may ignore browser font size.** Affects: Web and Desktop low-vision users.. Evidence: apps/web/app/globals.css:932-937. Work needed: Test and, if needed, convert to relative units.
- **400 percent reflow unverified on Chrome, web and desktop at the page level.** Affects: Web, Desktop, Chrome.. Evidence: brief S11.13. Work needed: Run an automated reflow check.
- **Translated-copy layout unverified on four apps.** Affects: Non-English users.. Evidence: brief S11.27. Work needed: Pseudo-locale test.
- **Brief evidence is stale or mismatched (GeneralSection.tsx:1186, ChatsListScreen.tsx:476).** Affects: Auditors.. Evidence: cited lines are not text size code.. Work needed: Re-cite.
- **VS Code and Chrome ignore any in-app text size.** Affects: VS Code and Chrome users.. Evidence: No setting found; VS Code follows editor font.. Work needed: None required if intended; confirm.

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:vscode
- surface:chrome
- file:apps/web/shared/components/AppearancePreferences.tsx
- file:apps/web/shared/stores/web-settings-store.ts
- SYS-sync-and-continuity
- SYS-shared-ui-and-design

## Unknown

- Whether the Tauri Desktop build has its own text size setting.
- Where the CLI keeps its terminal width assumptions.
- How Chrome and VS Code behave at 200 percent text.
- Which preferences endpoint path the constant resolves to (not opened).

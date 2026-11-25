---
id: "F006-08"
type: "feature"
title: "Motion and reduced motion"
aliases: ["Motion and reduced motion", "Reduce motion", "Motion setting", "prefers-reduced-motion", "ui.reduced_motion", "reduced-motion", "S6.30", "S6.31", "Durations and easing"]
area: "6 Visual foundations and spacing conventions"
available_on: ["web", "desktop", "mobile", "cli", "vscode", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "built", vscode: "built", chrome: "built"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S6.30", "S6.31"]
depends_on: ["SYS-shared-ui-and-design", "SYS-sync-and-continuity", "SYS-api-and-contracts", "SYS-data-model-and-migrations", "file:packages/ui/design-tokens/src/foundation.css", "file:apps/web/app/globals.css", "api:PUT /api/settings/preferences", "table:user_settings", "store:agiworkforce-web-settings", "surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:vscode", "surface:chrome"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F006-08 Motion and reduced motion

Named animation speeds and curves (instant 90ms, quick 160ms, moved 260ms, reveal 700ms) shared by the apps, plus a way to calm motion. Web has a Motion setting (System or Reduced). Mobile, VS Code and Chrome follow the device setting. The CLI has a config key and also stops motion in plain mode.

Area: [6. Visual foundations and spacing conventions](README.md). Requirement items: [S6.30](../../10-requirements/capabilities/006-visual-foundations-and-spacing-conventions.md#s630), [S6.31](../../10-requirements/capabilities/006-visual-foundations-and-spacing-conventions.md#s631).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built (this page lists unfinished parts) | built | not seen by a person |
| Desktop | partly built (this page lists unfinished parts) | built | not seen by a person |
| Mobile | partly built (this page lists unfinished parts) | built | not seen by a person |
| CLI | built | built | not seen by a person |
| VS Code | partly built (this page lists unfinished parts) | built | not seen by a person |
| Chrome | partly built (this page lists unfinished parts) | built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** It defines named durations and easing curves so animations feel the same everywhere, and it stops or slows looping and travelling motion when the person asks for less. (packages/ui/design-tokens/src/foundation.css:341-356)

**Why it exists.** Animation can cause discomfort and can make a hurried flow feel slow. Named values stop random timings. A switch that is decorative is a known failure, so web uses one blanket rule that catches every animation. (apps/web/app/globals.css:1913-1927)

**Who uses it.** People who are sensitive to motion, anyone who prefers a calm interface, and engineers adding animations.

**Problems it solves**

- Dizziness or distraction from looping animations.
- Animations that escape the reduced-motion switch because someone forgot a variant.
- A frozen spinner that looks like a hung screen (design intent: slow it instead). (globals.css:1929-1938)

**Use cases**

- A Web user chooses Reduced in Settings, Appearance, Motion and the sidebar mark stops shining.
- A phone user turns on Reduce Motion in iOS and the AGI mark stays still.
- A CLI user sets ui.reduced_motion true and the spinner becomes a dot.
- A screen-reader or script user runs the CLI with --plain and the spinner is a still dot.

## 2. User experience

**Where to find it**

- Web (and Desktop, which shows the hosted web app): Settings > Appearance > Motion, two buttons System and Reduced. (apps/web/features/settings/sections/AppearanceSection.tsx:116-145)
- Mobile: no in-app control; follows the device setting. (apps/mobile/src/ui/theme/useReduceMotion.ts:60-85)
- CLI: config key reduced-motion (also ui.reduced-motion, ui.reduced_motion), or plain output. (apps/cli/src/config.rs:1464-1465,1572-1577; apps/cli/src/lib.rs:5949-5950)
- VS Code: follows the OS setting only. (webviewContent.ts:2774-2781)
- Chrome: follows the OS setting only (side panel and options page). (apps/extension/src/side_panel.ts:4619; options.ts:246)

**Before you start**

- Web: none for the local choice; saved to your account only when signed in. (apps/web/features/settings/components/CloudSettingsSync.tsx:193-194)

**Screens and controls**

- Web: row labelled Motion with hint 'Less animation in replies and the interface. System follows your device.' and buttons System and Reduced (aria-labels 'System motion', 'Reduced motion'; aria-pressed shows the choice). (AppearanceSection.tsx:116-145)

**Journey**

1. Open Settings, then Appearance.
2. Find the Motion row.
3. Press Reduced.
4. The page gets data-motion=reduced and animation and transition time drops to 0.01ms.
5. Press System to hand control back to the device setting.

**What the person sees and gets**

- Animations stop travelling or looping at once. There is no separate confirmation message; if cloud save fails a notice 'This device keeps your choice' with a retry button shows. (features/settings/components/SettingsPreferenceRow.tsx:8-25)

**Settings**

- Web store key 'motion' in browser storage 'agiworkforce-web-settings'. (shared/stores/web-settings-store.ts:54,120,210)
- CLI config key reduced-motion.
- Mobile, VS Code, Chrome: device accessibility setting.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web/Desktop: duration and curve tokens (instant 90, quick 160, moved 260, reveal 700, mark-flow 4200; curves standard, exit, spring, reveal) and Tailwind names. (foundation.css:345-356; tailwind.css:70-78)
- Web: OS reduced-motion blanket rule sets animation and transition near zero and scroll behaviour to auto. (globals.css:1373-1388)
- Web: in-app Motion setting stamps data-motion=reduced on the page, and a blanket rule matches it. (AppearancePreferences.tsx:44-52; globals.css:1928-1935)
- Web: there is deliberately no 'full motion' option. (AppearancePreferences.tsx:44-47 comment)
- Web: Motion setting syncs to the signed-in account in the appearance preference namespace. (features/settings/lib/appearance-namespace.ts:18-27; app/settings/_lib/preferences-client.ts:321-340)
- Shared brand mark: the shine animation and ribbon are hidden under OS reduced motion. (foundation.css:585-592)
- Mobile: useReduceMotion reads the OS setting and follows live changes. (apps/mobile/src/ui/theme/useReduceMotion.ts)
- Mobile: AGI mark skips its animation when reduce motion is on. (apps/mobile/components/ui/AgiMark.tsx:67,82-94)
- Mobile: motion tokens (90, 160, 260, 700 plus pulse, ambient, orbit) and curve table. (tokens.ts:127-142)
- CLI: spinner becomes a still dot and shimmer text is plain when reduced. (apps/cli/src/tui/tui_app.rs:2124-2129; tui/shimmer.rs:26-28; tui/motion.rs:6)
- CLI: reduced is on if plain output or ui.reduced_motion is true. (tui_app.rs:7122-7124)
- VS Code: OS rule clamps animation and transition to 0.01ms. (webviewContent.ts:2774-2781)
- Chrome: OS rule in tokens.ts, side_panel.ts and options.ts, and options scroll jump uses auto. (tokens.ts:9; side_panel.ts:4619-4627; options.ts:246-252,1213-1218)
- Repo guard checks the stylesheets answer both OS and in-app motion preferences. (scripts/check-ui-motion.mjs:1-30)

**Incomplete**

- Web in-app Reduced does not slow spinners. The in-app rule sets duration 0.01ms and one iteration with no spinner exception, so a spinner would look frozen. (globals.css:1928-1935) [inferred from CSS, not run]
- Web OS rule slows .animate-spin to 3s, but without !important, while the blanket rule above uses !important, so the slowdown may not apply. The desktop Tauri stylesheet uses !important for it. (globals.css:1373-1388,1939-1942; apps/desktop/src/styles/globals.css:1305-1325) [inferred]
- Mobile has no in-app control for motion. (no match in apps/mobile for a motion setting)

**Present but disconnected or switched off**

- Desktop Tauri build has its own .reduce-motion class rule (internal build). (apps/desktop/src/styles/globals.css:585-589)

**Not available**

- Mobile, VS Code and Chrome have no in-app Motion control.
- CLI plain-mode trigger is --plain, AGI_PLAIN or screen reader mode, not a non-terminal check. (apps/cli/src/output.rs:52-60; lib.rs:5949-5950)

## 4. Required behaviour

**Established requirements**

- Animations and transitions use named durations and easing curves. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S6.30)
- When the user asks for reduced motion (OS setting or in-app), looping and travelling animation stops or is replaced with a gentle equivalent. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S6.31)
- Routine controls are never slower than the moved duration; 700ms is only for one-time reveals. (source: (packages/ui/design-tokens/src/foundation.css:341-351 comment))

**Acceptance criteria**

1. Web: pressing Reduced adds data-motion=reduced to the html element and removes it on System.
2. Web: with Reduced on, no looping animation keeps travelling (shine, typing dots).
3. Web: with Reduced on, a loading spinner is still visibly in progress (slowed, not frozen) -- see gap.
4. Mobile: turning on Reduce Motion in the device settings makes the AGI mark static without restarting the app.
5. CLI: setting reduced-motion true makes the spinner show a dot.
6. VS Code and Chrome: with the OS setting on, animations run for 0.01ms.
7. pnpm check:ui-motion passes.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- A slowed spinner is the intended reduced-motion answer on every surface (web comment says so; CLI uses a still dot instead). [inferred]

**Proposed improvements** (suggestions, not requirements)

- [proposed] Make the web spinner slowdown win over the blanket rule (for example with !important as desktop does) and apply it to the in-app Reduced setting too.
- [proposed] Add an in-app Motion control to Mobile, matching web, with the OS setting still honoured.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| config | duration and curve tokens | `packages/ui/design-tokens/src/foundation.css` | Named durations (345-352) and curves (353-356); brand shine reduced-motion rule (585-592). |
| config | Tailwind motion names | `packages/ui/design-tokens/src/tailwind.css` | Maps transition-duration-* and ease-* names (70-78). |
| component | AppearanceSection MotionRow | `apps/web/features/settings/sections/AppearanceSection.tsx` | Motion row with System and Reduced buttons (116-145). |
| component | AppearancePreferences | `apps/web/shared/components/AppearancePreferences.tsx` | Writes data-motion on the html element. |
| store | web settings store | `apps/web/shared/stores/web-settings-store.ts` | Holds motion (default system), persisted under agiworkforce-web-settings. |
| config | web stylesheet motion rules | `apps/web/app/globals.css` | OS rule (1373), in-app rule (1928), spinner slowdown (1939). |
| component | CloudSettingsSync | `apps/web/features/settings/components/CloudSettingsSync.tsx` | Pushes and pulls appearance settings including motion for signed-in users. |
| endpoint | preferences route | `apps/web/app/api/settings/preferences/route.ts` | GET and PUT /api/settings/preferences, stores settings JSON. |
| table | user_settings | `apps/web/db/neon/0042_settings_cloud_sync.sql` | Table holding the settings JSON per user (migration adds sync columns). |
| hook | useReduceMotion | `apps/mobile/src/ui/theme/useReduceMotion.ts` | Shared OS reduce-motion store for mobile. |
| component | Mobile AgiMark | `apps/mobile/components/ui/AgiMark.tsx` | Static mark when reduce motion is on. |
| config | mobile motion tokens | `apps/mobile/src/ui/theme/tokens.ts` | motion and motionCurves tables (127-142). |
| service | CLI motion flag | `apps/cli/src/tui/motion.rs` | Global reduced flag, still spinner glyph, shimmer sweep time. |
| component | CLI shimmer | `apps/cli/src/tui/shimmer.rs` | Plain text when reduced (26-28). |
| component | CLI spinner and startup | `apps/cli/src/tui/tui_app.rs` | spinner_frame (2124-2129) and set_reduced at start (7122-7124). |
| config | CLI config key | `apps/cli/src/config.rs` | ui.reduced_motion get and set (1464, 1572). |
| service | CLI plain output | `apps/cli/src/output.rs` | plain_output and AGI_PLAIN detection (41-60). |
| component | VS Code sidebar styles | `apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts` | OS reduced-motion rule (2774-2781). |
| component | Chrome token CSS | `apps/extension/src/tokens.ts` | Loading mark animation off under reduced motion (9). |
| component | Chrome side panel and options styles | `apps/extension/src/side_panel.ts` | OS rule at 4619-4627; options.ts has the same at 246. |
| command | check:ui-motion guard | `scripts/check-ui-motion.mjs` | Checks stylesheets answer OS and in-app motion preferences. |
| config | Desktop Tauri stylesheet | `apps/desktop/src/styles/globals.css` | OS rule with spinner slowdown (1305-1325); internal build. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Web: the person presses Reduced; the store saves motion and AppearancePreferences sets data-motion on html. | device | AppearanceSection.tsx:133-141; AppearancePreferences.tsx:48-52 |
| The stylesheet rule matching data-motion sets near-zero animation and transition time. | device | globals.css:1928-1935 |
| If signed in, CloudSettingsSync sends the change to the server and later restores it on other devices. | device and our servers | CloudSettingsSync.tsx:165-185,193-194; preferences-client.ts:321-340 |
| The server stores it in the user's settings row; the route needs a CSRF token and uses a per-user database scope. | our servers | apps/web/app/api/settings/preferences/route.ts:11,14,64-125 |
| Mobile and the extensions ask the operating system; no server. | device | useReduceMotion.ts:60-85; webviewContent.ts:2774 |
| CLI reads the config at start and sets the global reduced flag. | device | tui_app.rs:7122-7124 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Web motion preference ('system' or 'reduced') | Browser localStorage key agiworkforce-web-settings; and for signed-in users the user_settings row, appearance namespace | Yes when signed in (appearance namespace); local only otherwise | Kept until changed; cleared when browser storage is cleared (local copy) |
| CLI ui.reduced_motion | CLI config.toml in the config folder | No | Kept until edited |

**Models and providers.** No model or provider takes part.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Web local choice needs no account; account sync needs sign-in. (CloudSettingsSync.tsx:193-194) CLI, Mobile, VS Code, Chrome need none for this feature. |
| Permissions | None found in the code (the save route needs a signed-in session and CSRF token). |
| Subscription | None found in the code; no plan gates motion settings. |
| Limits and metering | The preferences route has a rate limit wrapper (withRateLimit). (route.ts:10) Exact limits unknown. |
| Feature flags | None found in the code. |
| Model compatibility | Not applicable. |
| Provider restrictions | Not applicable. |
| Local mode | Works fully on the device in Local mode; the account sync step is optional and only for signed-in web users. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Cloud save fails (web) | A red notice says the device keeps your choice, with a retry button. | features/settings/components/SettingsPreferenceRow.tsx:8-25 |
| OS asks for reduced motion and web is on System | The OS rule applies. | globals.css:1373 |
| OS asks for reduced motion and user wants motion | No way to force full motion by design. | AppearancePreferences.tsx:44-47 |
| Mobile read of setting fails | Treated as off (motion allowed). | useReduceMotion.ts:20-26 |
| Mobile remount while setting is read | Keeps last known value to avoid a flash of full animation. | useReduceMotion.ts:68-71 |
| CLI plain output | Reduced motion forced on. | tui_app.rs:7122-7124 |
| Offline, timeout, cancel | not handled in the code for the motion control itself beyond the local fallback above. | AppearanceSection.tsx:116-145 (no such handling) |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/settings/sections/__tests__/MotionPreferenceWired.test.tsx`: data-motion is stamped on Reduced, cleared on System, stylesheet has rules for it, no way to force motion on.
- `apps/web/e2e/public-reduced-motion.spec.ts`: Reduced motion shrinks real geometry transitions and normal mode keeps them (browser test).
- `apps/desktop/src/__tests__/reducedMotionPolicy.test.ts`: Desktop Tauri stylesheet has a blanket reduced-motion rule and a slowed spinner.
- `apps/web/shared/components/AppearancePreferences.test.tsx`: Appearance attributes (code theme, text size, wrap); motion not seen in the opened lines.
- `apps/mobile/__tests__/ReduceMotionPreference.test.tsx`: Mobile hook follows the OS event and shares one subscription.
- `apps/mobile/src/ui/theme/__tests__/accessibilityPreferenceCoverage.test.ts`: Source scan that animated mobile code reads useReduceMotion.
- `scripts/check-ui-motion.test.mjs`: The motion guard script.
- `apps/web/app/__tests__/loading-states.test.ts`: Spinners expose a label and honour reduced motion.

**Test scenarios**

- **Web Reduced setting**
  1. Open Web, Settings, Appearance.
  2. Press Reduced under Motion.
  3. Inspect the html element.
  - Expected: data-motion=reduced is present and the sidebar mark does not shine.
- **Web spinner under Reduced**
  1. Set Motion to Reduced.
  2. Trigger a loading state that shows a spinner.
  - Expected: The spinner should still show progress (slowed). If it is frozen, the gap is confirmed.
- **Account sync**
  1. Sign in on two browsers.
  2. Set Reduced on the first.
  3. Reload the second.
  - Expected: The second shows Reduced selected.
- **Mobile OS setting**
  1. On a phone turn on Reduce Motion in system settings.
  2. Open the app on a screen with the AGI mark.
  - Expected: The mark is static; turning the setting off restores the animation.
- **CLI config**
  1. Set the reduced-motion config key to true (exact command form unknown).
  2. Start the TUI and send a prompt.
  - Expected: The spinner shows a dot.
- **Chrome and VS Code**
  1. Turn on the OS reduce motion setting.
  2. Open the side panel and the VS Code sidebar.
  - Expected: No looping spinner animation runs at full speed.

**Where to look when it fails**

- Check the html element for data-motion.
- Run pnpm check:ui-motion.
- Read the cloud save notice and the network response of PUT /api/settings/preferences.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/006-visual-foundations-and-spacing-conventions.md](../../70-qa/test-plans/web/006-visual-foundations-and-spacing-conventions.md)
- Desktop: [70-qa/test-plans/desktop/006-visual-foundations-and-spacing-conventions.md](../../70-qa/test-plans/desktop/006-visual-foundations-and-spacing-conventions.md)
- Mobile: [70-qa/test-plans/mobile/006-visual-foundations-and-spacing-conventions.md](../../70-qa/test-plans/mobile/006-visual-foundations-and-spacing-conventions.md)
- CLI: [70-qa/test-plans/cli/006-visual-foundations-and-spacing-conventions.md](../../70-qa/test-plans/cli/006-visual-foundations-and-spacing-conventions.md)
- VS Code: [70-qa/test-plans/vscode/006-visual-foundations-and-spacing-conventions.md](../../70-qa/test-plans/vscode/006-visual-foundations-and-spacing-conventions.md)
- Chrome: [70-qa/test-plans/chrome/006-visual-foundations-and-spacing-conventions.md](../../70-qa/test-plans/chrome/006-visual-foundations-and-spacing-conventions.md)

## 10. Gaps and dependencies

- **Web spinner may be frozen under in-app Reduced and may not slow under the OS rule.** Affects: Web and Desktop users who ask for reduced motion.. Evidence: globals.css:1373-1388,1928-1942 vs apps/desktop/src/styles/globals.css:1318-1324. Work needed: Run the real page, confirm, then make the spinner rule win (important) and cover both OS and in-app cases with a test.
- **No in-app motion control on Mobile, VS Code or Chrome.** Affects: Users who want less motion in one app only.. Evidence: No motion setting found in those apps. Work needed: Decide if needed; add a setting and test.
- **CLI reduced motion uses a still dot, while web wants a slowed spinner.** Affects: CLI users.. Evidence: tui/motion.rs:6. Work needed: None required if accepted; document the difference.
- **CLI --plain and AGI_PLAIN switch reduced motion on without a separate message.** Affects: CLI users.. Evidence: tui_app.rs:7122-7124. Work needed: Consider documenting in help text.

**Depends on**

- SYS-shared-ui-and-design
- SYS-sync-and-continuity
- SYS-api-and-contracts
- SYS-data-model-and-migrations
- file:packages/ui/design-tokens/src/foundation.css
- file:apps/web/app/globals.css
- api:PUT /api/settings/preferences
- table:user_settings
- store:agiworkforce-web-settings
- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:vscode
- surface:chrome

## Unknown

- Whether the web spinner slowdown actually applies (cascade reasoning only, not run).
- Exact CLI command to set the key from the shell.
- Whether Electron Desktop adds its own motion rules.
- Rate limit values on the preferences route.
- Which Chrome in-app panels animate beyond the blanket OS rule.

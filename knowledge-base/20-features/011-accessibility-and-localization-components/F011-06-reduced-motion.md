---
id: "F011-06"
type: "feature"
title: "Reduced motion"
aliases: ["Reduced motion (S11.14)", "Motion setting", "prefers-reduced-motion", "data-motion", "useReduceMotion", "CLI reduced_motion"]
area: "11 Accessibility and localization components"
available_on: ["web", "desktop", "mobile", "cli", "vscode", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "built", vscode: "built", chrome: "built"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S11.14"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:vscode", "surface:chrome", "file:apps/web/shared/components/AppearancePreferences.tsx", "file:apps/mobile/src/ui/theme/useReduceMotion.ts", "SYS-sync-and-continuity", "SYS-shared-ui-and-design"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F011-06 Reduced motion

Stops or softens looping and moving animation when the operating system asks for less motion. Web and Desktop also have an in-app Motion setting that can only reduce motion. Mobile reads the device setting and listens for changes. VS Code and Chrome follow the OS. The CLI uses plain mode or a reduced-motion config.

Area: [11. Accessibility and localization components](README.md). Requirement items: [S11.14](../../10-requirements/capabilities/011-accessibility-and-localization-components.md#s1114).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | partly built (this page lists unfinished parts) | built | not seen by a person |
| CLI | partly built (this page lists unfinished parts) | built | not seen by a person |
| VS Code | partly built (this page lists unfinished parts) | built | not seen by a person |
| Chrome | partly built (this page lists unfinished parts) | built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Collapses animation and transition durations, stops infinite loops, replaces moving spinners, and lets the person choose Reduced in the app even when the OS says nothing.

**Why it exists.** Moving and looping animation can cause dizziness and distraction. The code comment states overriding an OS reduced-motion request is the one harmful direction, so there is no 'full motion' option.

**Who uses it.** People with vestibular conditions, distraction sensitivity, or who prefer calm interfaces.

**Problems it solves**

- Spinners and pulses that never stop.
- Smooth scroll jumps.
- Animations added later that escape a per-class rule.

**Use cases**

- Turn on OS Reduce Motion and open web chat.
- Set Settings, Appearance, Motion to Reduced without changing the OS.
- On the phone, toggle Reduce Motion and see toasts stop animating.
- Run the CLI with plain mode to remove spinners.

## 2. User experience

**Where to find it**

- Web and Desktop: Settings, Appearance, row 'Motion' with buttons 'System' and 'Reduced' and hint 'Less animation in replies and the interface. System follows your device.' (apps/web/features/settings/sections/AppearanceSection.tsx:115-140).
- Mobile: device Settings, Accessibility, Reduce Motion (no in-app control; doc: docs/decisions/2026-11-13-founder-decisions.md:80-82).
- CLI: --plain flag, AGI_PLAIN, or ui.reduced_motion in config (apps/cli/src/lib.rs:439-440; apps/cli/src/config.rs:155).
- VS Code and Chrome: OS setting only.

**Before you start**

- None for the OS path; Motion row needs the web settings page.

**Screens and controls**

- Motion group with two buttons using aria-pressed and names 'System motion' and 'Reduced motion' (AppearanceSection.tsx:130-137).

**Journey**

1. Choose Reduced (or set the OS option).
2. The html element gets data-motion='reduced' (AppearancePreferences.tsx:48-50).
3. One blanket CSS rule shrinks durations to 0.01ms and iteration to 1 (globals.css:1935-1946).
4. Spinners slow rather than freeze: animate-spin runs at 3s under the OS media query (globals.css:1949-1953).

**What the person sees and gets**

- Animations visibly stop or jump to end state.
- Setting persists and syncs.

**Settings**

- motion: system or reduced (web-settings-store.ts:36,120,142).
- ui.reduced_motion in CLI config (config.rs:155,1572-1575).
- --plain / AGI_PLAIN / --screen-reader on the CLI.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web: in-app Motion stored as 'system' or 'reduced'; only 'reduced' sets data-motion; deliberately no full-motion option (apps/web/shared/components/AppearancePreferences.tsx:44-50; web-settings-store.ts:36).
- Web CSS: one blanket rule for data-motion='reduced' plus separate prefers-reduced-motion blocks (apps/web/app/globals.css:1935-1946,1949-1953).
- Web e2e checks public stylesheet geometry transitions under reduced motion (apps/web/e2e/public-reduced-motion.spec.ts:10-33).
- Shared hook useReducedMotion reads the media query and listens for changes (packages/ui/unified-chat/src/hooks/useReducedMotion.ts).
- Desktop Tauri stylesheet has three prefers-reduced-motion blocks and a test that requires broad rules (apps/desktop/src/styles/globals.css:474,509,1305; apps/desktop/src/__tests__/reducedMotionPolicy.test.ts); Electron shows hosted web.
- Mobile: store reads AccessibilityInfo.isReduceMotionEnabled once at first subscribe and listens for 'reduceMotionChanged'; keeps the last value on unmount (apps/mobile/src/ui/theme/useReduceMotion.ts:20-82); used by Toast, ImageFullScreen, ShimmerText, AgiMark; a test forbids opting out and requires core Animated surfaces to read it (accessibilityPreferenceCoverage.test.ts:70-86).
- CLI: plain output or ui.reduced_motion = true sets motion::set_reduced; plain mode swaps the spinner for text printed once (apps/cli/src/tui/tui_app.rs:7122-7124; apps/cli/src/tui/motion.rs:9-15; apps/cli/src/output.rs:244-248).
- VS Code webview: prefers-reduced-motion block collapses durations (webviewContent.ts:2774-2781).
- Chrome side panel: same rule (apps/extension/src/side_panel.ts:4618-4631).

**Incomplete**

- VS Code, Chrome and Mobile do not offer the in-app Motion setting; they follow the OS only (by decision for Mobile).
- CLI does not read an OS setting; it needs the flag, environment variable or config.
- Web keeps spinning at 3s rather than stopping (by design comment).

**Present but disconnected or switched off**

- None found.

**Not available**

- In-app motion option on Mobile, VS Code and Chrome.

## 4. Required behaviour

**Established requirements**

- With the OS or app reduced-motion preference on, looping and travelling animation stops or is replaced. (source: brief S11.14 Should)
- The in-app setting can only reduce motion, never add it, because an override of an OS request is treated as harmful. (source: code comment, apps/web/shared/components/AppearancePreferences.tsx:44-47 and task brief)
- On mobile the preference is read once at start and updated when the OS changes it. (source: task brief; code apps/mobile/src/ui/theme/useReduceMotion.ts:49-60)
- Mobile apps follow the device for reduced motion. (source: doc: docs/decisions/2026-11-13-founder-decisions.md:80-82)
- The CLI plain mode removes animation. (source: brief S11.14 note; code apps/cli/src/output.rs:244-248)

**Acceptance criteria**

1. With OS reduce motion on, web chat shows no infinite animation; spinners are slow or static.
2. Choosing Motion: Reduced on web sets data-motion='reduced' on html and shrinks transitions.
3. There is no way in the web UI to force full motion when the OS asks for reduced.
4. On iOS or Android, flipping Reduce Motion while the app runs updates toasts and shimmer without restart.
5. CLI --plain shows no spinner frames; ui.reduced_motion=true uses the still spinner glyph.
6. VS Code and Chrome panels respect the OS media query.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Desktop users get web's Motion row via the hosted app [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add an e2e test that runs a signed-in chat page under reduced motion and asserts no running infinite animations.
- [proposed] Let the CLI read common OS or terminal hints.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | AppearancePreferences | `apps/web/shared/components/AppearancePreferences.tsx` | Sets data-motion (lines 44-50). |
| component | MotionRow | `apps/web/features/settings/sections/AppearanceSection.tsx` | System and Reduced buttons (lines 115-140). |
| store | web-settings-store | `apps/web/shared/stores/web-settings-store.ts` | motion state and setMotion (36,54,120,142). |
| component | CloudSettingsSync | `apps/web/features/settings/components/CloudSettingsSync.tsx` | Syncs motion with appearance settings. |
| config | web globals.css motion rules | `apps/web/app/globals.css` | Blanket reduced rule and spinner slowdown (1935-1953). |
| hook | useReducedMotion (shared) | `packages/ui/unified-chat/src/hooks/useReducedMotion.ts` | Media-query hook for components. |
| hook | usePrefersReducedMotion (web support) | `apps/web/features/support/hooks/usePrefersReducedMotion.ts` | Another web hook for the support area. |
| config | Desktop globals.css | `apps/desktop/src/styles/globals.css` | Reduced motion blocks (474,509,1305). |
| hook | useReduceMotion (mobile) | `apps/mobile/src/ui/theme/useReduceMotion.ts` | External store over AccessibilityInfo. |
| component | Mobile Toast | `apps/mobile/src/shared/components/Toast.tsx` | Reads the preference. |
| component | Mobile ImageFullScreen | `apps/mobile/src/features/chat/components/ImageFullScreen.tsx` | Reads the preference. |
| component | Mobile ShimmerText and AgiMark | `apps/mobile/components/ui/ShimmerText.tsx` | Animated text and mark read the preference; sibling AgiMark.tsx. |
| component | Mobile OfflineBanner | `apps/mobile/src/features/edge-cases/components/OfflineBanner.tsx` | Brief cites it for S11.14; the file shows the live region and no reduce-motion hook. |
| service | CLI motion | `apps/cli/src/tui/motion.rs` | REDUCED flag, still spinner glyph. |
| service | CLI plain output | `apps/cli/src/output.rs` | set_plain_output; announced-once spinner. |
| config | CLI ui config | `apps/cli/src/config.rs` | ui.reduced_motion and ui.screen_reader (155,163,1572). |
| config | VS Code reduced motion CSS | `apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts` | Media query block (2774-2781). |
| config | Chrome reduced motion CSS | `apps/extension/src/side_panel.ts` | Media query block (4618-4631). |
| test | accessibilityPreferenceCoverage.test | `apps/mobile/src/ui/theme/__tests__/accessibilityPreferenceCoverage.test.ts` | Reduced motion coverage rules. |
| test | ReduceMotionPreference.test | `apps/mobile/__tests__/ReduceMotionPreference.test.tsx` | Hook behaviour test. |
| test | reducedMotionPolicy.test | `apps/desktop/src/__tests__/reducedMotionPolicy.test.ts` | Desktop stylesheet policy. |
| test | public-reduced-motion.spec | `apps/web/e2e/public-reduced-motion.spec.ts` | Browser test for the public stylesheet. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Web: the person chooses Reduced; the store updates; an effect sets data-motion on html. | device | AppearanceSection.tsx:135-137; AppearancePreferences.tsx:48-50 |
| CSS reads data-motion or the OS media query and shortens animation and transition time. | device | apps/web/app/globals.css:1935-1946 |
| The motion value is saved locally and, when signed in, synced to account preferences. | device and our servers | CloudSettingsSync.tsx:99-130 |
| Mobile asks the OS once and subscribes to changes; components re-render on change. | device | apps/mobile/src/ui/theme/useReduceMotion.ts:49-60 |
| CLI decides at start-up from flag, environment or config and publishes it to the motion module. | device | apps/cli/src/lib.rs:5949-5951; tui_app.rs:7122-7124 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| motion preference ('system' or 'reduced'). | web persisted store, account preferences; CLI config file | web yes when signed in; mobile no (device setting only) | kept with settings; deletion not read |

**Models and providers.** No model or provider takes part.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Works signed-out; syncing across devices needs sign-in. |
| Permissions | None found; mobile reads a system accessibility value without a permission prompt [inferred]. |
| Subscription | None found in the code: not gated. |
| Limits and metering | None found in the code. |
| Feature flags | CLI: --plain, AGI_PLAIN, AGI_SCREEN_READER, ui.reduced_motion, ui.screen_reader (names only). |
| Model compatibility | Not applicable. |
| Provider restrictions | None found in the code. |
| Local mode | Works in Local mode: everything is on the device. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| OS async read pending (mobile) | Keeps the last known value; an event that arrives first wins over the late read. | useReduceMotion.ts:46-60,66-69 |
| Read fails (mobile) | Returns false (full motion). | useReduceMotion.ts:20-26 |
| No matchMedia | Hook returns false without error. | packages/ui/unified-chat/src/hooks/useReducedMotion.ts:7 |
| User wants full motion against OS request | Not offered by design. | AppearancePreferences.tsx:44-47 |
| Spinner under reduced motion (web OS media) | Slowed to 3s rather than frozen. | globals.css:1949-1953 |
| Plain CLI | Spinner replaced by one printed line. | apps/cli/src/output.rs:247-248 |
| Offline, retry, timeout | not handled in the code; not relevant to this feature. | none found in the files opened |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/mobile/src/ui/theme/__tests__/accessibilityPreferenceCoverage.test.ts`: No ReduceMotion.Never opt-outs; core Animated surfaces read useReduceMotion.
- `apps/mobile/__tests__/ReduceMotionPreference.test.tsx`: The mobile preference hook (file exists; content not read in detail).
- `apps/mobile/__tests__/Toast.test.tsx`: Toast with reduce motion and announcements.
- `apps/desktop/src/__tests__/reducedMotionPolicy.test.ts`: Desktop stylesheet reduced-motion blocks policy.
- `apps/web/e2e/public-reduced-motion.spec.ts`: Public stylesheet reduces real transitions but keeps normal-mode transitions.
- `apps/web/features/settings/sections/AppearanceSection.test.tsx`: Appearance section (file exists; content not read in detail).
- `apps/cli/src/output.rs`: Rust tests in the file for plain output, NO_COLOR and screen-reader detection.

**Test scenarios**

- **OS setting on web**
  1. Enable reduce motion in the OS.
  2. Open web chat, send a message.
  - Expected: Typing and thinking animation is near-static; spinner slow.
- **In-app Reduced**
  1. Settings, Appearance, Motion: Reduced.
  2. Inspect html.
  - Expected: data-motion='reduced' present; transitions 0.01ms.
- **No full-motion override**
  1. With OS reduce on, open the Motion row.
  - Expected: Only System and Reduced are offered.
- **Mobile live change**
  1. Open the app, toggle device Reduce Motion, trigger a toast.
  - Expected: Toast animation changes without restarting.
- **CLI plain**
  1. Run the CLI with --plain and start a turn.
  - Expected: No spinner frames; text lines only.

**Where to look when it fails**

- DevTools: computed animation-duration.
- Mobile test spies on AccessibilityInfo.
- CLI: config show for reduced motion line (config.rs:1352).

**Hands-on test plans**

- Web: [70-qa/test-plans/web/011-accessibility-and-localization-components.md](../../70-qa/test-plans/web/011-accessibility-and-localization-components.md)
- Desktop: [70-qa/test-plans/desktop/011-accessibility-and-localization-components.md](../../70-qa/test-plans/desktop/011-accessibility-and-localization-components.md)
- Mobile: [70-qa/test-plans/mobile/011-accessibility-and-localization-components.md](../../70-qa/test-plans/mobile/011-accessibility-and-localization-components.md)
- CLI: [70-qa/test-plans/cli/011-accessibility-and-localization-components.md](../../70-qa/test-plans/cli/011-accessibility-and-localization-components.md)
- VS Code: [70-qa/test-plans/vscode/011-accessibility-and-localization-components.md](../../70-qa/test-plans/vscode/011-accessibility-and-localization-components.md)
- Chrome: [70-qa/test-plans/chrome/011-accessibility-and-localization-components.md](../../70-qa/test-plans/chrome/011-accessibility-and-localization-components.md)

## 10. Gaps and dependencies

- **No in-app motion option on VS Code and Chrome.** Affects: VS Code and Chrome users whose OS setting is not applied inside the webview.. Evidence: Only media queries found (webviewContent.ts:2774; side_panel.ts:4622).. Work needed: Confirm the webview inherits the OS setting; add a setting only if required.
- **CLI does not read any OS reduced-motion signal.** Affects: CLI users who rely on OS settings.. Evidence: apps/cli/src/lib.rs:5949-5951 uses flag, environment and config only.. Work needed: Document or add detection.
- **Brief cites OfflineBanner for reduced motion but it has no hook.** Affects: Auditors.. Evidence: apps/mobile/src/features/edge-cases/components/OfflineBanner.tsx has no useReduceMotion use.. Work needed: Re-cite; check its animation if any.
- **No recorded run of the reduced-motion tests.** Affects: All.. Evidence: No result file found.. Work needed: Run and record.
- **Two web reduced-motion hooks exist (shared and support).** Affects: Maintenance.. Evidence: packages/ui/unified-chat/src/hooks/useReducedMotion.ts and apps/web/features/support/hooks/usePrefersReducedMotion.ts. Work needed: [proposed] Use one.

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:vscode
- surface:chrome
- file:apps/web/shared/components/AppearancePreferences.tsx
- file:apps/mobile/src/ui/theme/useReduceMotion.ts
- SYS-sync-and-continuity
- SYS-shared-ui-and-design

## Unknown

- Whether VS Code and Chrome webviews inherit the OS reduce-motion media query in every host.
- Whether Desktop Tauri has an in-app Motion setting.
- Whether all web animations are covered by the blanket rule (JS-driven animation is not covered by CSS).
- Contents of ReduceMotionPreference.test.tsx.

---
id: "AREA-011"
type: "area"
title: "Accessibility and localization components"
features: ["F011-01", "F011-02", "F011-03", "F011-04", "F011-05", "F011-06", "F011-07", "F011-08", "F011-09", "F011-10", "F011-11", "F011-12"]
basis: "code inspection"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# 11. Accessibility and localization components

This area makes the six apps usable by people who use a keyboard only, a screen reader, a magnifier or large text, reduced motion, or a language other than English. It also covers the small shared helpers that format money, dates, shortcut keys and chart descriptions for every surface. A person gets controls that have readable names, focus that moves sensibly, finished replies announced without spam, and text that reads right in their language.

**Who uses it.** Every user on every app. No plan gate was seen in the files read. Developers change the shared components under packages/ui and packages/ui/unified-chat. The CLI output mode is used by people who run the terminal tool with a screen reader or set NO_COLOR.

## Features in this area

| ID | Feature | Web | Desktop | Mobile | CLI | VS Code | Chrome |
|---|---|---|---|---|---|---|---|
| [F011-01](F011-01-screen-reader-names-labels-and-headings.md) | Screen-reader names, labels and headings | partly | partly | built | n/a | built | partly |
| [F011-02](F011-02-keyboard-operation-of-menus-dialogs-and-focus.md) | Keyboard operation of menus, dialogs and focus | built | built | partly | built | built | built |
| [F011-03](F011-03-touch-and-drag-alternatives.md) | Touch and drag alternatives | built | built | n/a | n/a | built | built |
| [F011-04](F011-04-screen-reader-announcements-for-finished-work-and.md) | Screen-reader announcements for finished work and streaming replies | built | built | partly | n/a | partly | partly |
| [F011-05](F011-05-text-size-zoom-and-long-text-layout.md) | Text size, zoom and long-text layout | partly | partly | partly | built | partly | partly |
| [F011-06](F011-06-reduced-motion.md) | Reduced motion | built | built | built | built | built | built |
| [F011-07](F011-07-voice-captions-and-transcripts.md) | Voice captions and transcripts | built | built | built | built | n/a | n/a |
| [F011-08](F011-08-chart-descriptions-and-data-tables.md) | Chart descriptions and data tables | partly | partly | n/a | n/a | n/a | n/a |
| [F011-09](F011-09-right-to-left-and-mixed-direction-text-and-typing.md) | Right-to-left and mixed-direction text, and typing with input methods | built | built | partly | n/a | partly | partly |
| [F011-10](F011-10-languages-and-translated-messages.md) | Languages and translated messages | built | built | partly | no | built | built |
| [F011-11](F011-11-locale-aware-dates-numbers-and-money.md) | Locale-aware dates, numbers and money | built | built | built | partly | built | partly |
| [F011-12](F011-12-plain-terminal-output.md) | Plain terminal output | n/a | n/a | n/a | built | n/a | n/a |

Requirement items for this area: [10-requirements/capabilities/011-accessibility-and-localization-components.md](../../10-requirements/capabilities/011-accessibility-and-localization-components.md).

## How this area works in the code

1. **Settings turn on appearance choices.** The web app reads its appearance settings (text size, code wrap, accent, high contrast, motion, font) and writes them as attributes on the html element. CSS reads those attributes. Reduced motion is set as data-motion='reduced'. There is no option to force full motion. (`apps/web/shared/components/AppearancePreferences.tsx:8-15`, `apps/web/shared/components/AppearancePreferences.tsx:45-53`, `apps/web/app/globals.css:1928-1935`)
2. **Reduced motion on mobile.** The mobile hook reads the OS reduced-motion flag once, listens for changes, and keeps the last value while the async re-read runs so a new screen does not play a full animation. (`apps/mobile/src/ui/theme/useReduceMotion.ts:20-26`, `apps/mobile/src/ui/theme/useReduceMotion.ts:44-56`, `apps/mobile/src/ui/theme/useReduceMotion.ts:58-64`)
3. **Keyboard behaviour for menus and dialogs.** Shared hooks listen in the capture phase so their Escape and arrow handling runs before surrounding listeners. Menus move focus between items and return it to the trigger. Dialogs move focus in on open, keep Tab inside, and restore focus to the opener on close. (`packages/ui/ui/src/primitives/useMenuKeyboard.ts:17-60`, `packages/ui/ui/src/primitives/useDialogKeyboard.ts:29-80`)
4. **Streaming reply announcements.** While a reply streams, a timer every 2 seconds takes the text that arrived since the last tick, cut at the last space, strips Markdown symbols, and writes it into a visually hidden polite live region. When streaming ends, the leftover tail is announced once. The message bubble wraps its body in this announcer. (`packages/ui/unified-chat/src/components/markdown/StreamAnnouncer.tsx:3`, `packages/ui/unified-chat/src/components/markdown/StreamAnnouncer.tsx:7-13`, `packages/ui/unified-chat/src/components/markdown/StreamAnnouncer.tsx:33-74`, `packages/ui/unified-chat/src/components/markdown/StreamAnnouncer.tsx:97-105`, `apps/web/features/chat/components/messages/MessageBubble.tsx:2914-2926`)
5. **Chart description and table.** The chart builds a plain-text summary from its data (lowest and highest points, pie shares). The summary is linked to the chart with aria-describedby in a visually hidden paragraph. A details disclosure holds the data as a table. The PNG download button has a name that includes the chart title. (`packages/ui/unified-chat/src/components/artifact-components/chart-spec.ts:127-141`, `packages/ui/unified-chat/src/components/artifact-components/ChartArtifact.tsx:114`, `packages/ui/unified-chat/src/components/artifact-components/ChartArtifact.tsx:134-136`, `packages/ui/unified-chat/src/components/artifact-components/ChartArtifact.tsx:169`, `packages/ui/unified-chat/src/components/artifact-components/ChartArtifact.tsx:211-215`)
6. **Voice captions.** The captions panel shows lines labelled You or Assistant with a waiting message when empty. It sets aria-live to off, so the transcript carries the spoken words and the panel does not repeat them. (`apps/web/features/chat/components/Voice/VoiceCaptions.tsx:18-31`, `apps/web/features/chat/components/Voice/VoiceCaptions.tsx:22-25`)
7. **Language start-up and direction on web.** The web app reads the language from a cookie or local storage before setup, then sets the language. When the language changes it sets the html lang and dir attributes from the language table, so right-to-left languages flip the page. (`apps/web/app/i18n/index.ts:21-38`, `apps/web/app/i18n/index.ts:43-70`, `apps/web/app/i18n/index.ts:72-83`)
8. **Language and direction on mobile.** The mobile app picks a language from the device, or the stored preference (device or a language code). Right-to-left is applied to the native layout with a forced layout direction, which only takes effect when the value changes. (`apps/mobile/src/i18n/index.ts:26-27`, `apps/mobile/src/i18n/index.ts:29-43`, `apps/mobile/src/i18n/index.ts:49-63`, `apps/mobile/src/i18n/index.ts:77-101`)
9. **Money formatting.** Amounts are stored as minor units (for example cents). The shared helper finds the currency's digits, divides, and formats with the device locale. A fallback prints two digits and the code if the currency is not recognised. (`packages/contracts/types/src/money-format.ts:1-12`, `packages/contracts/types/src/money-format.ts:14-31`)
10. **CLI plain mode.** At start-up the CLI sets a global plain flag from the --plain option, the AGI_PLAIN environment variable, or screen reader mode. Colour helpers return no colour when plain mode or NO_COLOR is set. (`apps/cli/src/lib.rs:439-440`, `apps/cli/src/lib.rs:5949-5950`, `apps/cli/src/output.rs:41-59`, `apps/cli/src/output.rs:90-100`)

## Files to know

| File | Role |
|---|---|
| `packages/ui/ui/src/primitives/useDialogKeyboard.ts` | Shared hook for dialog focus-in, Tab trap, Escape close and focus return. |
| `packages/ui/ui/src/primitives/useMenuKeyboard.ts` | Shared hook for menu arrow keys, Home and End, Escape, and focus return. |
| `packages/ui/unified-chat/src/components/markdown/StreamAnnouncer.tsx` | Calm announcements of streamed reply text (every 2 seconds, whole words) in a polite live region. |
| `packages/ui/unified-chat/src/components/artifact-components/ChartArtifact.tsx` | Chart with its text summary, PNG download, and the View chart data table (shared by web and desktop). |
| `apps/web/shared/components/AppearancePreferences.tsx` | Writes appearance settings, including the reduced-motion override, to html attributes. |
| `apps/mobile/src/ui/theme/useReduceMotion.ts` | Mobile hook that reads and follows the OS reduced-motion setting. |
| `apps/web/app/i18n/index.ts` | Web language set-up: reads the stored choice, loads locales, sets html lang and dir. |
| `apps/mobile/src/i18n/index.ts` | Mobile language set-up: device language, stored preference, and native right-to-left switch. |
| `packages/contracts/types/src/money-format.ts` | Shared money formatting from minor units with the right currency digits. |
| `packages/ui/ui/src/platformKeys.ts` | Returns the Cmd or Ctrl label for shortcut hints based on the platform. |
| `apps/web/features/chat/components/Voice/VoiceCaptions.tsx` | Live caption lines for voice conversations, kept silent for screen readers. |
| `apps/cli/src/output.rs` | CLI colour and plain-mode policy, with NO_COLOR and AGI_PLAIN handling. |

## What is stored

- Web language choice (key agiworkforce-language): Browser cookie and local storage, read and written by the i18next setup (apps/web/app/i18n/index.ts:21, 59-60; cookie lasts one year, path /).
- Mobile language preference (key agiworkforce-language, value device or a language code): Device storage through the app's mmkvStorage helper (apps/mobile/src/i18n/index.ts:18, 52, 85).
- Web appearance settings (text size, code wrap, accent, high contrast, motion, font): Read from the web settings store (apps/web/shared/components/AppearancePreferences.tsx:9-15). Where the store persists them was not opened (see not_sure).
- Appearance values as html attributes (data-chat-text-size, data-motion, data-contrast, data-accent, data-chat-font): Set on the document element at run time only, not stored (apps/web/shared/components/AppearancePreferences.tsx:17-59).
- Streamed-text announcement progress: In memory in the announcer's refs; not stored (packages/ui/unified-chat/src/components/markdown/StreamAnnouncer.tsx:39-41).
- Mobile reduced-motion value: In memory in a module store; kept after unmount so the next mount does not animate (apps/mobile/src/ui/theme/useReduceMotion.ts:12-18, 58-64).
- CLI plain-mode flag: Process-wide flag in memory, set at start (apps/cli/src/output.rs:20-53). Nothing written to disk seen.

## Switches

Plan gates, flags and settings that turn parts of this area on or off.

- **In-app motion setting (reduced or system)**: Reduced sets data-motion='reduced' on html, which turns off most animation. There is no full-motion option. (Read in apps/web/shared/components/AppearancePreferences.tsx:49-53; the CSS is apps/web/app/globals.css:1928-1935.)
- **OS reduced-motion preference**: Mobile stops looping animation when the OS asks for less motion. Web spinners slow to 3s under prefers-reduced-motion. (apps/mobile/src/ui/theme/useReduceMotion.ts:22; apps/web/app/globals.css:1936-1944.)
- **Chart animation**: Charts draw with animation only when reduced motion is off. (packages/ui/unified-chat/src/components/artifact-components/ChartArtifact.tsx:206 (animate={!reducedMotion}).)
- **Chat text size, code block wrap, high contrast, accent, font**: Change text size, wrapping, contrast, accent colour and font. (apps/web/shared/components/AppearancePreferences.tsx:17-59.)
- **App language feature flag (appLanguage)**: When off, mobile stays on the default language and ignores stored choices. (apps/mobile/src/i18n/index.ts:30 and :50 and :78 (FEATURES.appLanguage from @/lib/v1FeatureFlags; the flag value was not opened).)
- **--plain CLI option**: Turns off colour, animation and redraws for the whole run. (apps/cli/src/lib.rs:439-440 and :5949-5950.)
- **AGI_PLAIN environment variable**: Any non-empty value turns plain mode on. (apps/cli/src/output.rs:56-59.)
- **NO_COLOR environment variable**: Any value turns off colour only (not plain mode). (apps/cli/src/output.rs:99-100.)
- **Screen reader mode (CLI)**: Turns on plain output and a label on lines. (apps/cli/src/lib.rs:442 and :5950; output.rs:62-82.)
- **Announce interval for streamed text**: Sets how often streamed text is announced (default 2000 ms). (packages/ui/unified-chat/src/components/markdown/StreamAnnouncer.tsx:3 and :36.)

## Shared between apps

Shared across web, desktop and the unified chat surfaces: packages/ui/ui/src/primitives/useMenuKeyboard.ts and useDialogKeyboard.ts; packages/ui/unified-chat StreamAnnouncer, ChartArtifact, chart-spec and the message bubble (used by web and desktop through the unified chat package); packages/ui/ui/src/platformKeys.ts; packages/contracts/types/src/money-format.ts (used by web and desktop pricing and billing); packages/ui/unified-chat/src/composer-editor/ime-composition.ts, re-exported from packages/ui/ui. Per app: mobile has its own reduced-motion hook (apps/mobile/src/ui/theme/useReduceMotion.ts) and its own i18n set-up (apps/mobile/src/i18n/index.ts); web has its own i18n set-up (apps/web/app/i18n/index.ts) and appearance component; the CLI has its own Rust output policy (apps/cli/src/output.rs); VS Code and the Chrome extension have their own webview and side-panel code that the brief cites (apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts and apps/extension/src/side_panel.ts), which were not read in depth.

## Looks wrong in the code

From reading only; not confirmed in the running app. Each line is also in the gap register.

- Brief says S11.18 (data-table alternative for charts) is missing on web and desktop, but the shared chart component has a View chart data disclosure with a table. The status looks stale, or the table is not reachable in some case that was not checked. (packages/ui/unified-chat/src/components/artifact-components/ChartArtifact.tsx:211-215)
- In-app reduced-motion rule sets animation to 0.01ms with !important on every element, including spinners. The comment next to the spinner rule says a spinner should be slowed, not frozen, and the 3s slow-down only applies under the OS preference because it is not !important. So in-app reduced motion effectively stops spinners, which contradicts the comment. (apps/web/app/globals.css:1928-1935 and apps/web/app/globals.css:1936-1944)
- Brief's Should for S11.22 and S11.23 says 'the user's locale' and 'the user's number format'. Money uses the device locale (undefined locale), not the language the user picked in the app, so a user who picks a different app language may see different money formats. (packages/contracts/types/src/money-format.ts:23-26)
- Brief's citations for S11.07 and S11.08 point at ChatMessageList.tsx:1029 and :1071, which are inside a virtual list row and a top-spacer element, not the announcer. The real announcer uses are in the message bubble (apps/web/features/chat/components/messages/MessageBubble.tsx:2914) and the shared bubble (packages/ui/unified-chat/src/components/MessageBubble.tsx:825). The live status region is at apps/web/features/chat/components/messages/ChatMessageList.tsx:2089. (apps/web/features/chat/components/messages/ChatMessageList.tsx:1029 and :1071)
- Brief lists S11.27 with Chrome as done while its header lists it as unverified, and S11.25 and S11.08 as missing on mobile. Those statuses are not consistent inside the brief. (Brief item S11.27 (status line) and brief items S11.08 and S11.25)
- Mobile announces only the start and end of a reply, not streamed text. This matches the brief's 'missing' status, but it means mobile does not have the streaming behaviour of S11.08. (apps/mobile/src/features/chat/components/MessageList.tsx:245-256)

## Not established

- Where the web appearance settings (including motion) are stored and how the motion control is shown to users. The brief cites apps/web/features/settings/sections/GeneralSection.tsx:1091, which was not opened; apps/web/features/settings/sections/AppearanceSection.test.tsx mentions setMotion.
- The value of the mobile appLanguage feature flag (apps/mobile/src/lib/v1FeatureFlags was not opened).
- Whether native mobile right-to-left takes effect without a restart (forceRTL behaviour was not checked against the React Native docs).
- Web settings store file (apps/web/shared/stores/web-settings-store) was not opened, so its persistence is unknown.
- Desktop, VS Code and Chrome: most cited lines were not opened (for example apps/extension/src/side_panel.ts and apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts), so their statuses rest on the brief.
- Mobile and CLI error-message translation status (S11.25) and the mobile text-size path (apps/mobile/src/features/settings/index.tsx:191) were not read.
- Voice caption and transcript paths for web (WebChatPage.tsx) and mobile (LiveVoiceBar.tsx) were not opened.
- The composer input-method handling in apps/web/features/chat/components/Composer/ChatComposerNew.tsx was not read; only the shared re-export of ime-composition.ts was opened.
- No tests were run (the instruction for this task was read-only, with no builds or tests).
- The user's request mentioned testing on localhost one surface at a time; this task was code reading only, so no testing was done and nothing in the project was changed.

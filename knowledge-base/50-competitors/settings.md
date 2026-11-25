---
id: "COMP-settings"
type: "competitor-trace"
title: "Settings"
competitor_evidence_reviewed: "2026-11-22"
basis: "official competitor pages saved 2026-11-22; AGI status from code inspection"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Settings: competitors to requirements

Settings competitor evidence reviewed 2026-11-22 for general, appearance, language, data controls and shortcuts. AGI's web, desktop and mobile settings are mostly built by code reading. Only theme and archive were seen working by a person (web). Main gaps: only English and Spanish selectable, no time zone, no chat-history import, no editable shortcuts on mobile, no local-data wipe on desktop, and VS Code and Chrome lag the other apps.

**How the products divide this topic.** Claude (support.claude.com) documents Settings > Appearance (color mode, chat font), a profile-menu Language choice, Settings > Privacy (export, shared chats) and Delete account. Claude Code (code.claude.com) is the separate coding tool: /config, /theme, /keybindings, language and reduced-motion keys, screen reader mode. Where its app is Desktop's Code tab, theme colors come from a mod, so it connects to the chat app only there. ChatGPT (help.openai.com) documents Settings > General (theme, accent, language, text size on Windows), Data controls (improve the model, export, archive all, delete all), Notifications and Delete account. Codex (learn.chatgpt.com) is the separate coding tool: Settings has a keyboard shortcut editor, Appearance with theme sharing, archived chats, follow-up behavior and import from other coding tools. Plan limits seen: Claude export is for Free, Pro, Max and Ultra; Team and Enterprise members need an owner switch; Claude dictation languages are beta; ChatGPT export and delete-account are not self-service in Business or Enterprise; ChatGPT improve-the-model default is on for Free, Plus and Pro. No Claude chat page in the catalogue documents rebinding chat shortcuts, a text-size setting, or an accent color. Evidence date for all competitor claims: 2026-11-22. AGI statuses come from code reading (ledger areas 84, 85, 11 and the comparison CSVs), not from running the apps. Several comparison rows have no list_id; those are named by their feature text.

Each capability below is traced: competitor evidence, AGI requirement, current implementation, gap, acceptance criteria, verification. Competitor behaviour comes only from the cited pages, reviewed 2026-11-22.

| ID | Capability | Claude | ChatGPT | AGI today | Verified |
|---|---|---|---|---|---|
| [CAP-settings-01](#cap-settings-01) | Color theme (light, dark, system) | yes | yes | built | seen working by a person |
| [CAP-settings-02](#cap-settings-02) | Accent color | unknown | yes | partly built | code inspected only |
| [CAP-settings-03](#cap-settings-03) | Chat font and dyslexia-friendly font | yes | unknown | partly built | code inspected only |
| [CAP-settings-04](#cap-settings-04) | Text size and zoom | unknown | partly | partly built | code inspected only |
| [CAP-settings-05](#cap-settings-05) | Reduced motion | yes | partly | built | code inspected only |
| [CAP-settings-06](#cap-settings-06) | Code theme, color-blind themes and custom themes | yes | yes | partly built | code inspected only |
| [CAP-settings-07](#cap-settings-07) | Interface language | yes | yes | partly built | code inspected only |
| [CAP-settings-08](#cap-settings-08) | Language follows device by default | unknown | yes | built | code inspected only |
| [CAP-settings-09](#cap-settings-09) | Dictation and speech-input language | yes | partly | built | seen failing by a person |
| [CAP-settings-10](#cap-settings-10) | Response language setting | yes | unknown | partly built | not verified |
| [CAP-settings-11](#cap-settings-11) | Time zone | yes | unknown | not built | not verified |
| [CAP-settings-12](#cap-settings-12) | Keyboard shortcut customization | yes | yes | partly built | code inspected only |
| [CAP-settings-13](#cap-settings-13) | Shortcut list overlay | partly | yes | built | code inspected only |
| [CAP-settings-14](#cap-settings-14) | Global quick-access shortcut (desktop) | yes | yes | partly built | code inspected only |
| [CAP-settings-15](#cap-settings-15) | Open Settings shortcut | unknown | yes | partly built | code inspected only |
| [CAP-settings-16](#cap-settings-16) | Notification settings | partly | yes | partly built | code inspected only |
| [CAP-settings-17](#cap-settings-17) | Composer and response behavior defaults | partly | yes | built | code inspected only |
| [CAP-settings-18](#cap-settings-18) | Help improve the models (training choice) | partly | yes | built | code inspected only |
| [CAP-settings-19](#cap-settings-19) | Voice and audio recording sharing choice | yes | yes | built | code inspected only |
| [CAP-settings-20](#cap-settings-20) | Export your data | yes | yes | built | not verified |
| [CAP-settings-21](#cap-settings-21) | Archived chats management | unknown | yes | partly built | seen working by a person |
| [CAP-settings-22](#cap-settings-22) | Archive all and delete all chats | unknown | yes | built | code inspected only |
| [CAP-settings-23](#cap-settings-23) | Shared links management | yes | yes | built | seen working by a person |
| [CAP-settings-24](#cap-settings-24) | Temporary or incognito chat | yes | yes | partly built | code inspected only |
| [CAP-settings-25](#cap-settings-25) | Delete account | yes | yes | partly built | not verified |
| [CAP-settings-26](#cap-settings-26) | Import from another assistant | partly | partly | partly built | code inspected only |
| [CAP-settings-27](#cap-settings-27) | Clear local data | unknown | yes | partly built | code inspected only |
| [CAP-settings-28](#cap-settings-28) | Screen reader and accessible output mode | yes | unknown | built | code inspected only |
| [CAP-settings-29](#cap-settings-29) | Launch at login and desktop startup | unknown | unknown | built | code inspected only |

## CAP-settings-01 Color theme (light, dark, system)

The user picks light, dark or follow-the-system, and it applies at once and persists.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/8887527-customizing-your-appearance-settings](https://support.claude.com/en/articles/8887527-customizing-your-appearance-settings): Settings > Appearance (or General in the older layout) offers Light, Match System and Dark under Color mode. Apps: web, desktop.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/11958281-updating-your-visual-experience-on-chatgpt](https://help.openai.com/en/articles/11958281-updating-your-visual-experience-on-chatgpt): Appearance: System, Light, Dark in Settings > General (web, Windows) or Appearance/Theme on mobile; a per-device preference that does not sync across platforms. Plans: All plans. Apps: web, desktop, ios, android.

**AGI requirement** (stated requirement; source: docs/product/definition.md line 279 and requirements.md line 1269 (Appearance page, owner decision 2026-11-19)). Every app offers light, dark and system theme; the choice applies immediately and persists. Appearance is its own settings page.

**With different models, providers and the one subscription.** Local, device-only preference. Independent of model, provider and plan; works the same in Local mode and when signed out of paid features. Needs no subscription check.

**Current implementation, as this trace read it on 2026-11-24: built.** web, desktop, mobile, CLI and Chrome done; VS Code follows the editor theme (no own setting found). The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S84.03
- Comparison list ids: none matched; rows without an id: comparison-web 'Appearance: Light, Dark, System theme' (no list_id); comparison-mobile 'Light, dark or system theme' (no list_id); comparison-chrome 'Appearance theme setting' (no list_id)
- Code: `apps/web/features/settings/sections/AppearanceSection.tsx`; `apps/mobile/src/features/settings/appearance/index.tsx`; `apps/extension/src/features/options/appearance-section.ts`; `apps/cli/src/tui/tui_app.rs`

**Gap.** None known on web. The web scorecards note the artifact preview stays light in dark mode and a terms toast looks wrong in dark.

**Acceptance criteria**

1. Choose Dark; the whole app turns dark without reload and stays dark after reload.
2. Choose System; change the OS theme; the app follows.
3. Check the same on desktop, mobile, Chrome side panel and CLI.

**Verification: seen working by a person.** web scorecards W-1, W-4, W-13: Settings > Appearance System/Light/Dark switched and persisted across tabs. Other apps: code inspected only.

## CAP-settings-02 Accent color

The user picks an accent color that recolors bubbles and buttons.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: unknown**
  - no page found in the saved documentation
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/11958281-updating-your-visual-experience-on-chatgpt](https://help.openai.com/en/articles/11958281-updating-your-visual-experience-on-chatgpt): Accent color picker: Blue, Green, Yellow, Pink, Orange, Purple or neutral Black/White; saved to account; no custom colors. Plans: All plans. Apps: web, desktop, ios, android.

**AGI requirement** (stated requirement; source: docs/product/definition.md line 279 (Appearance must include accent colour)). Offer an accent color where the design system allows it, saved to the account.

**With different models, providers and the one subscription.** Pure UI preference; no model or plan dependence; works in Local mode.

**Current implementation, as this trace read it on 2026-11-24: partly built.** web, desktop, mobile done; CLI, VS Code, Chrome missing. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S84.04
- Comparison list ids: none matched; rows without an id: comparison-web 'Accent color' (no list_id); comparison-mobile 'Accent colour of the app' (no list_id)
- Code: `apps/web/features/settings/sections/AppearanceSection.tsx:92`; `apps/mobile/src/features/settings/accent-color/index.tsx:24`

**Gap.** CLI, VS Code and Chrome have no accent choice. Whether they must is not decided.

**Acceptance criteria**

1. Pick each accent; buttons and user bubbles recolor.
2. Reload; the accent persists; sign in on a second device; confirm whether it syncs as the page states.
3. Contrast of text on every accent passes WCAG AA.

**Verification: code inspected only.** No scorecard checks accent.

## CAP-settings-03 Chat font and dyslexia-friendly font

The user changes the chat font, including a dyslexia-friendly option.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/8887527-customizing-your-appearance-settings](https://support.claude.com/en/articles/8887527-customizing-your-appearance-settings): Chat font options are Default, Match System and Dyslexic Friendly. Apps: web, desktop.
- **ChatGPT: unknown**
  - no page found in the saved documentation

**AGI requirement** (stated requirement; source: docs/product/definition.md line 279 (chat font)). Offer a chat font choice including a dyslexia-friendly face on every app that renders chat.

**With different models, providers and the one subscription.** Local rendering only; model and plan independent.

**Current implementation, as this trace read it on 2026-11-24: partly built.** web and desktop done; mobile missing (comparison M57); VS Code has font family and size settings. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: M57; rows without an id: comparison-web 'Chat font choice'; comparison-web 'Dyslexia-friendly chat font'
- Code: `apps/web/features/settings/sections/AppearanceSection.tsx:181-210`

**Gap.** Mobile has no font choice or dyslexia-friendly face.

**Acceptance criteria**

1. Pick the dyslexia-friendly font; messages, composer and code areas change as intended and persist.
2. Repeat on mobile once built.

**Verification: code inspected only.** No scorecard covers font.

## CAP-settings-04 Text size and zoom

The user enlarges the interface or chat text.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: unknown**
  - no page found in the saved documentation
- **ChatGPT: partly**
  - [https://help.openai.com/en/articles/11958281-updating-your-visual-experience-on-chatgpt](https://help.openai.com/en/articles/11958281-updating-your-visual-experience-on-chatgpt): Settings > General > Text size with plus, minus and Reset zooms the whole Windows app; web uses browser zoom and mobile uses device settings. Apps: desktop (Windows).

**AGI requirement** (stated requirement; source: docs/product/definition.md line 279 (chat text size); ledger S11.12 states the 200% check). Chat text size is a setting; text must scale to at least 200% without clipping.

**With different models, providers and the one subscription.** Local; model independent.

**Current implementation, as this trace read it on 2026-11-24: partly built.** web and desktop done; mobile follows system text size; Chrome missing/unverified. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S11.12, S11.13, S84.05
- Comparison list ids: none matched; rows without an id: comparison-web 'Chat text size'; comparison-desktop 'Text size zoom for the whole app'
- Code: `apps/web/features/settings/sections/GeneralSection.tsx:1186`; `apps/web/shared/components/AppearancePreferences.tsx:8`; `apps/mobile/src/shared/hooks/useLargeTextRows.ts:5`

**Gap.** Chrome extension has no text size control. The web comparison marks both leaders as No for a text-size setting, which differs from the Windows help page; AGI is ahead of Claude on this by the catalogue.

**Acceptance criteria**

1. Set the largest chat text size; messages grow and nothing is cut off.
2. At 200% browser zoom the settings pages stay usable.
3. Mobile: raise the OS text size; chat rows stay readable.

**Verification: code inspected only.** Scorecards check light/dark and 390 px width only, not text size.

## CAP-settings-05 Reduced motion

The user reduces or removes animation, in app or by the OS setting.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude Code: yes**
  - [https://code.claude.com/docs/en/settings-reference.md](https://code.claude.com/docs/en/settings-reference.md): prefersReducedMotion (/config Reduce motion) reduces or removes spinner, shimmer and flash animations. Apps: cli.
- **Codex: partly**
  - [https://learn.chatgpt.com/docs/pets.md](https://learn.chatgpt.com/docs/pets.md): Pets show a still frame when OS reduced motion is on. Apps: desktop.
  - [https://learn.chatgpt.com/docs/config-file/config-advanced.md](https://learn.chatgpt.com/docs/config-file/config-advanced.md): TUI option to toggle ASCII animations. Apps: cli, ide, desktop.

**AGI requirement** (stated requirement; source: docs/product/definition.md line 279 (motion); experience-contract W23 (reduced motion check)). Honour the OS reduced-motion setting and offer an in-app switch on every app.

**With different models, providers and the one subscription.** Local; no model or plan link.

**Current implementation, as this trace read it on 2026-11-24: built.** web, desktop, mobile, CLI, VS Code, Chrome done. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S11.14, S84.07
- Comparison list ids: none matched; rows without an id: comparison-web 'Motion: reduce animation'; comparison-cli 'Reduce motion setting'
- Code: `apps/web/features/settings/sections/AppearanceSection.tsx:120-150`; `apps/cli/src/output.rs:29`; `apps/mobile/src/ui/theme/useReduceMotion.ts:22`

**Gap.** none known

**Acceptance criteria**

1. Turn on the OS reduce-motion setting; streaming shimmer and transitions stop in each app.
2. Turn on the in-app switch with OS off; same result.

**Verification: code inspected only.** No scorecard checks motion.

## CAP-settings-06 Code theme, color-blind themes and custom themes

Syntax-highlight themes, color-blind-friendly presets and user-made or shared themes.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude Code: yes**
  - [https://code.claude.com/docs/en/terminal-config.md](https://code.claude.com/docs/en/terminal-config.md): Presets dark, light, daltonized and ANSI variants; custom JSON themes in ~/.claude/themes, hot-reloaded; plugins can add themes. Apps: cli.
- **Codex: yes**
  - [https://learn.chatgpt.com/docs/reference/settings.md](https://learn.chatgpt.com/docs/reference/settings.md): Appearance: pick base theme, adjust accent, background and foreground, set UI and code fonts, share a custom theme. Apps: desktop.
  - [https://learn.chatgpt.com/docs/cli-customization.md](https://learn.chatgpt.com/docs/cli-customization.md): /theme picker and custom .tmTheme themes for syntax highlighting. Apps: cli.

**AGI requirement** (stated requirement; source: docs/product/definition.md line 279 (code wrapping and code theme)). Offer a code theme and line wrapping choice in chat; on the CLI offer color-blind-safe themes.

**With different models, providers and the one subscription.** Local; independent of model and plan. Custom or shared themes would need a decision on sharing (see owner choices).

**Current implementation, as this trace read it on 2026-11-24: partly built.** web and desktop have code theme and wrap; mobile and Chrome missing; CLI has /theme and presets (partial). The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S84.08, S84.09
- Comparison list ids: C533, CP299, CP50, WP257
- Code: `apps/web/features/settings/sections/AppearanceSection.tsx:235-262`; `apps/cli/src/tui/terminal_palette.rs:133`; `apps/cli/src/config.rs:142`

**Gap.** No custom-theme files, no theme sharing, no plugin themes; mobile and Chrome lack code theme.

**Acceptance criteria**

1. Change code theme; an open code block restyles.
2. Toggle wrap; long lines wrap or scroll.
3. CLI: pick a color-blind preset; diffs stay distinguishable without color alone.

**Verification: code inspected only.** Not covered by scorecards.

## CAP-settings-07 Interface language

The user picks the display language and the UI switches at once.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/10769299-how-to-use-claude-in-your-preferred-language](https://support.claude.com/en/articles/10769299-how-to-use-claude-in-your-preferred-language): Display languages: English, French, German, Hindi, Indonesian, Italian, Japanese, Korean, Brazilian Portuguese, Latin American Spanish, Spain Spanish; Profile icon > Language changes it immediately; Claude still answers in whatever language you write. Plans: All plans. Apps: web, desktop.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/8357869-how-to-change-your-language-setting-in-chatgpt](https://help.openai.com/en/articles/8357869-how-to-change-your-language-setting-in-chatgpt): About 60 interface languages; Settings > General > Language on web; Sidebar > profile > App > Language on mobile; login required. Apps: web, ios, android.

**AGI requirement** (stated requirement; source: docs/decisions/2026-09-15-founder-decisions.md D-2026-09-15-03; docs/product/definition.md (account menu includes language)). Account menu has Language. Offer English plus only languages that are complete and reviewed; hide incomplete ones; every client follows the account language with English as fallback; one shared catalogue.

**With different models, providers and the one subscription.** UI language is separate from model reply language. Works in Local mode with bundled strings; no plan gate.

**Current implementation, as this trace read it on 2026-11-24: partly built.** web and desktop have a selector (English and Spanish only); mobile and Chrome selector missing; CLI and VS Code missing. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S11.25, S84.01
- Comparison list ids: DP24, M58, MP43, WP114, WP252, X22
- Code: `packages/ui/i18n/src/languages.ts:20 (SELECTABLE_LANGUAGE_CODES = en, es)`; `apps/web/features/settings/components/LanguageSelector.tsx:5`

**Gap.** Selectable languages are English and Spanish; leaders offer 11 to about 60. This follows the owner decision but is a competitive gap. Desktop menus and tray stay English (electronLanguages: en). Mobile and Chrome offer no selector.

**Acceptance criteria**

1. Choose Spanish in the account menu; the whole screen is Spanish with no mixed English in settings.
2. Language persists after reload and on a second device.
3. A language missing review does not appear in the list.
4. Desktop menu bar follows the choice once supported.

**Verification: code inspected only.** Scorecards do not test language switching.

## CAP-settings-08 Language follows device by default

The app picks the language from the browser or device, and the user can override it.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: unknown**
  - no page found in the saved documentation
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/8357869-how-to-change-your-language-setting-in-chatgpt](https://help.openai.com/en/articles/8357869-how-to-change-your-language-setting-in-chatgpt): ChatGPT auto-detects browser or device language for supported languages; logged-in users can override. Apps: web, ios, android.

**AGI requirement** (inferred; source: competitor parity; consistent with D-2026-09-15-03 fallback to English). First launch uses the device language if supported, else English; the account choice overrides it.

**With different models, providers and the one subscription.** Local logic; works signed out and in Local mode.

**Current implementation, as this trace read it on 2026-11-24: built.** web done by code reading; other apps unknown. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: none matched; rows without an id: comparison-web 'Interface language follows the browser or device' (no list_id)
- Code: `apps/web/app/i18n/index.ts:45-57`

**Gap.** Not checked on desktop, mobile, CLI, VS Code, Chrome.

**Acceptance criteria**

1. Set browser to Spanish, open signed out; UI is Spanish.
2. Set an unsupported language; UI is English.
3. Account choice wins over device on next sign-in.

**Verification: code inspected only.** comparison-web row; no run.

## CAP-settings-09 Dictation and speech-input language

The user picks the language used for voice typing.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude and Claude Code: yes**
  - [https://support.claude.com/en/articles/10065434-use-dictation-on-claude-mobile](https://support.claude.com/en/articles/10065434-use-dictation-on-claude-mobile): Initials > Speech Input Language; dictation supports 12 languages, non-English in beta. Plans: All plans. Apps: ios, android.
  - [https://code.claude.com/docs/en/voice-dictation.md](https://code.claude.com/docs/en/voice-dictation.md): Claude Code dictation uses the language setting and supports 20 languages. Apps: cli.
- **ChatGPT: partly**
  - [https://help.openai.com/en/articles/12168547-voice-dictation-faq](https://help.openai.com/en/articles/12168547-voice-dictation-faq): Page covers dictation data controls; a language choice is not shown in the catalogue line.

**AGI requirement** (inferred; source: competitor parity). Dictation language is selectable where dictation exists.

**With different models, providers and the one subscription.** Local speech models handle it in Local mode; hosted speech needs the subscription allowance and must say so.

**Current implementation, as this trace read it on 2026-11-24: built.** web, mobile, CLI have a dictation language; CLI marked partial. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: CP51; rows without an id: comparison-web 'Dictation language'; comparison-mobile 'Speech input language'
- Code: `apps/web/features/settings/sections/VoiceSection.tsx:184-192`; `apps/mobile/src/features/settings/voice-language/index.tsx:224`; `apps/cli/src/voice_languages.rs:8`

**Gap.** CLI list is partial. Voice mode languages on web are partial (WP118, WP253).

**Acceptance criteria**

1. Pick a non-English dictation language; spoken sample appears in that language.
2. Setting persists.

**Verification: seen failing by a person.** web problems W-10: dictation transcript of a fake recording was not English; marked unclear, possibly the test audio, not proof of a product fault.

## CAP-settings-10 Response language setting

The user fixes the language the assistant replies in.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude Code: yes**
  - [https://code.claude.com/docs/en/settings-reference.md](https://code.claude.com/docs/en/settings-reference.md): language makes Claude reply in any named language and also sets dictation and session-title language. Apps: cli.
- **ChatGPT: unknown**
  - no page found in the saved documentation

**AGI requirement** (inferred; source: competitor parity (Claude Code only)). Offer a reply-language preference that works with every model.

**With different models, providers and the one subscription.** Implemented as an instruction sent to any model, so provider agnostic; weak local models may ignore it, so the label must not promise it.

**Current implementation, as this trace read it on 2026-11-24: partly built.** web and mobile have response language in Personalization; CLI missing (C91). The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S85.03
- Comparison list ids: C91; rows without an id: comparison-web 'Response length, technical level, formatting and reply language'
- Code: `apps/web/features/settings/sections/PersonalizationSection.tsx:405-440`; `apps/mobile/src/features/settings/personalization/index.tsx:574`

**Gap.** CLI has no reply-language setting.

**Acceptance criteria**

1. Set reply language to Spanish; a new English question gets a Spanish answer on at least two different models.
2. Clear it; replies follow the question language.

**Verification: not verified.** No person-run check.

## CAP-settings-11 Time zone

The user sets the time zone used for displayed times.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude Code: yes**
  - [https://code.claude.com/docs/en/settings-reference.md](https://code.claude.com/docs/en/settings-reference.md): timeZone shows interface times in an IANA zone instead of system time; settings-file only. Apps: cli.
- **ChatGPT: unknown**
  - no page found in the saved documentation

**AGI requirement** (proposed; source: ledger S84.02 lists it as Should; no project document requires it). Schedules and reminders show an explicit zone and can be changed.

**With different models, providers and the one subscription.** Local setting; scheduled jobs on our servers need the stored zone.

**Current implementation, as this trace read it on 2026-11-24: not built.** Ledger says not applicable anywhere. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S11.22, S84.02
- Comparison list ids: none matched
- Code: `agiworkforce-QA/tools/area-briefs/084-general-and-appearance-settings.md` (not found)

**Gap.** No time zone setting; locale-aware dates exist (S11.22) except CLI.

**Acceptance criteria**

1. A scheduled task shows its time in the chosen zone.
2. Changing zone updates all displayed times.

**Verification: not verified.** none

## CAP-settings-12 Keyboard shortcut customization

The user views, rebinds, unbinds and resets shortcuts.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude Code: yes**
  - [https://code.claude.com/docs/en/keybindings.md](https://code.claude.com/docs/en/keybindings.md): /keybindings opens ~/.claude/keybindings.json; hot-reloaded; about 28 contexts; chords; null unbinds; some keys such as Ctrl+C are reserved. Apps: cli.
- **Codex: yes**
  - [https://learn.chatgpt.com/docs/reference/settings.md](https://learn.chatgpt.com/docs/reference/settings.md): Keyboard Shortcuts editor with search by command name or by pressing a key; review, rebind and reset. Apps: desktop.

**AGI requirement** (inferred; source: competitor parity; ledger S84.15). Users can view and rebind shortcuts, reset to defaults, and see conflicts; reserved keys stay fixed.

**With different models, providers and the one subscription.** Local only; no model or plan link.

**Current implementation, as this trace read it on 2026-11-24: partly built.** web, desktop, CLI, VS Code, Chrome done per ledger; mobile not applicable; CLI cannot unbind with null (C604). The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S11.26, S84.15
- Comparison list ids: C604; rows without an id: comparison-web 'Editable keyboard shortcuts with Restore defaults'
- Code: `apps/web/features/chat/components/dialogs/KeyboardShortcutsDialog.tsx:34`; `apps/cli/src/keybindings.rs:117`; `apps/desktop/electron/settingsStore.ts:30`; `apps/extension-vscode/package.json:1485`

**Gap.** CLI: no null-unbind. The web comparison says no Claude chat page documents rebinding.

**Acceptance criteria**

1. Rebind a command; it works; Restore defaults reverts it.
2. Bind a taken key; a conflict message appears.
3. Hints show Cmd on Apple and Ctrl elsewhere.

**Verification: code inspected only.** Not in scorecards.

## CAP-settings-13 Shortcut list overlay

A key opens a list of available shortcuts.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: partly**
  - [https://support.claude.com/en/articles/16923645-get-started-with-claude-docs](https://support.claude.com/en/articles/16923645-get-started-with-claude-docs): In Claude Docs, Cmd/Ctrl+/ or ? opens a shortcut list. Apps: web, desktop.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/6825453-chatgpt-release-notes](https://help.openai.com/en/articles/6825453-chatgpt-release-notes): Aug 3, 2023 release: Cmd/Ctrl+/ lists shortcuts; Cmd/Ctrl+Shift+; copies the last code block. Plans: Plus. Apps: web.

**AGI requirement** (inferred; source: competitor parity). Cmd or Ctrl plus slash opens the shortcut list in web and desktop.

**With different models, providers and the one subscription.** Local; none.

**Current implementation, as this trace read it on 2026-11-24: built.** web and desktop done. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S84.15
- Comparison list ids: none matched; rows without an id: comparison-web 'Keyboard shortcut list (Cmd+/)'
- Code: `packages/ui/unified-chat/src/lib/shortcutRegistry.ts:48-229`

**Gap.** Document, slide and design editor shortcuts missing (W138).

**Acceptance criteria**

1. Press Cmd/Ctrl+/; the list opens and closes with Escape.
2. List matches the real bindings.

**Verification: code inspected only.** none

## CAP-settings-14 Global quick-access shortcut (desktop)

A system-wide key opens a quick entry window.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/12626668-use-quick-entry-with-claude-desktop-on-mac](https://support.claude.com/en/articles/12626668-use-quick-entry-with-claude-desktop-on-mac): Settings > Desktop app: Double-tap Option, Option+Space or custom shortcut; voice shortcut Caps Lock, custom or disabled. Plans: Free through Enterprise. Apps: desktop (Mac).
- **Codex: yes**
  - [https://learn.chatgpt.com/docs/pets.md](https://learn.chatgpt.com/docs/pets.md): Global shortcut to show pet and focus Quick Chat, default Option+Space on macOS, rebindable under Keyboard shortcuts. Apps: desktop.

**AGI requirement** (stated requirement; source: docs/product/definition.md line 406 (desktop settings include quick access shortcut and voice shortcut)). Desktop has a configurable global quick-chat shortcut and voice shortcut.

**With different models, providers and the one subscription.** Quick chat uses the user's current model route; in Local mode it must stay on-device and show the label.

**Current implementation, as this trace read it on 2026-11-24: partly built.** desktop partial; Chrome done for companion window. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S84.22
- Comparison list ids: DP113, DP125
- Code: `apps/desktop/electron/appMenu.ts:100`; `apps/desktop/electron/settingsStore.ts:30`

**Gap.** Custom combinations are only partial (DP125).

**Acceptance criteria**

1. Set a custom combo; it opens quick chat from another app.
2. Disable it; it stops.
3. Conflicting combo is refused with a message.

**Verification: code inspected only.** none

## CAP-settings-15 Open Settings shortcut

A key combination opens Settings.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: unknown**
  - no page found in the saved documentation
- **Codex: yes**
  - [https://learn.chatgpt.com/docs/reference/settings.md](https://learn.chatgpt.com/docs/reference/settings.md): Settings opens from the app menu or Cmd+, / Ctrl+,. Apps: desktop.

**AGI requirement** (inferred; source: competitor parity). Desktop opens Settings with the platform shortcut.

**With different models, providers and the one subscription.** Local; none.

**Current implementation, as this trace read it on 2026-11-24: partly built.** desktop done; web missing (W336). The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: W336; rows without an id: comparison-desktop 'Keyboard shortcuts for Settings (Cmd+,) and sidebar toggle'
- Code: `apps/desktop/electron/appMenu.ts:120`

**Gap.** Web has no open-settings shortcut.

**Acceptance criteria**

1. Press the shortcut on desktop; Settings opens.
2. Same on web once added.

**Verification: code inspected only.** none

## CAP-settings-16 Notification settings

The user picks push, email or in-app delivery for notifications, and gets alerts when a reply or task finishes.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude and Claude Code: partly**
  - [https://support.claude.com/en/articles/12012173-get-started-with-claude-in-chrome](https://support.claude.com/en/articles/12012173-get-started-with-claude-in-chrome): Chrome tasks notify on completion or when permission is needed. Plans: Paid plans. Apps: chrome.
  - [https://code.claude.com/docs/en/accessibility.md](https://code.claude.com/docs/en/accessibility.md): Screen reader mode rings the terminal bell on reply end or prompt. Apps: cli.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/10291617-scheduled-tasks-in-chatgpt](https://help.openai.com/en/articles/10291617-scheduled-tasks-in-chatgpt): Settings > Notifications selects Push, Email or both; web needs browser permission. Apps: web, ios, android.
  - [https://help.openai.com/en/articles/9703738-chatgpt-macos-app-release-notes](https://help.openai.com/en/articles/9703738-chatgpt-macos-app-release-notes): Mac app notifies when a reply finishes in the background. Apps: desktop.

**AGI requirement** (stated requirement; source: docs/product/definition.md (General settings include notifications)). General settings include notifications by channel and category, with quiet hours.

**With different models, providers and the one subscription.** Local notifications work in Local mode; push and email need our servers and must say so.

**Current implementation, as this trace read it on 2026-11-24: partly built.** web, desktop, mobile done; quiet hours done on web, desktop, mobile; VS Code and Chrome missing; CLI notifies on turn end (partial). The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S84.18, S84.19
- Comparison list ids: CP301
- Code: `apps/web/features/settings/sections/NotificationsSection.tsx:38`; `apps/mobile/src/features/settings/notifications/index.tsx:186`

**Gap.** No channel choice in VS Code and Chrome.

**Acceptance criteria**

1. Turn off email for a category; none arrives.
2. Set quiet hours; a finished task inside them is held.
3. Denied browser permission shows a clear state.

**Verification: code inspected only.** Not in scorecards.

## CAP-settings-17 Composer and response behavior defaults

General settings for send key, follow-up behavior, prompt suggestions and default model, effort and mode.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude Code: partly**
  - [https://code.claude.com/docs/en/settings-reference.md](https://code.claude.com/docs/en/settings-reference.md): promptSuggestionEnabled toggles grayed-out predicted prompts; needs a Claude account with telemetry on. Apps: cli.
- **Codex: yes**
  - [https://learn.chatgpt.com/docs/reference/settings.md](https://learn.chatgpt.com/docs/reference/settings.md): Follow-up behavior chooses whether a message sent during a run steers it or waits. Apps: desktop.
  - [https://help.openai.com/en/articles/20001601-composer-predictions-in-codex](https://help.openai.com/en/articles/20001601-composer-predictions-in-codex): Show predictions toggle in Codex Settings > General > Composer; on by default for eligible adult personal Pro users. Plans: Pro. Apps: desktop.

**AGI requirement** (stated requirement; source: docs/product/definition.md (General settings: response/completion/code settings)). General settings include response, completion and code settings; the user can set default model, effort and mode.

**With different models, providers and the one subscription.** Default model comes from the shared catalogue and plan entitlements; if the default is not allowed on the plan or provider, fall back with a visible notice. Local mode defaults to a local model.

**Current implementation, as this trace read it on 2026-11-24: built.** default model, effort and mode done on all six apps; send-key done on web and desktop only. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S84.10, S84.11, S84.12, S84.14
- Comparison list ids: none matched
- Code: `apps/web/features/settings/sections/GeneralSection.tsx:925`; `apps/cli/src/lib.rs:1195`; `apps/extension-vscode/package.json:997`

**Gap.** Send-key missing on CLI, VS Code, Chrome; startup destination, default workspace and layout reset missing (S84.13, S84.20, S84.24).

**Acceptance criteria**

1. Set a default model; a new chat starts on it.
2. Set Enter to newline; Cmd/Ctrl+Enter sends.
3. With a plan that lacks the chosen model, a notice appears.

**Verification: code inspected only.** Scorecards W-6 saw the model picker work; defaults not tested.

## CAP-settings-18 Help improve the models (training choice)

A toggle for whether chats may be used to improve models.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: partly**
  - [https://support.claude.com/en/articles/8325621-i-would-like-to-input-sensitive-data-into-my-chats-with-claude-who-can-view-my-conversations](https://support.claude.com/en/articles/8325621-i-would-like-to-input-sensitive-data-into-my-chats-with-claude-who-can-view-my-conversations): When chats help improve Claude the data is de-linked from user ID and filtered; incognito chats are never used. Plans: Free, Pro, Max, Ultra. Apps: web.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/7730893-data-controls-in-chatgpt](https://help.openai.com/en/articles/7730893-data-controls-in-chatgpt): Improve the model for everyone is on by default for Free, Plus and Pro personal workspaces; turning it off keeps history; applies across web and mobile. Plans: Free, Plus, Pro. Apps: web, ios, android.
  - [https://help.openai.com/en/articles/5722486-how-your-data-is-used-to-improve-model-performance](https://help.openai.com/en/articles/5722486-how-your-data-is-used-to-improve-model-performance): Thumbs feedback can still send the whole conversation. Plans: Free, Plus, Pro. Apps: web, ios, android.

**AGI requirement** (stated requirement; source: docs/product/definition.md line 283; requirements.md line 503 (provider retention/training terms disclosed)). Privacy settings include help improve AGI; training terms of each provider route are shown from verified metadata.

**With different models, providers and the one subscription.** Applies to hosted routes; Local mode never sends content, so the toggle must say it does not apply. For BYOK the provider's own terms apply and must be named.

**Current implementation, as this trace read it on 2026-11-24: built.** web, desktop, mobile done; CLI, VS Code, Chrome not applicable per ledger. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S85.12, S85.13
- Comparison list ids: none matched; rows without an id: comparison-web 'Help improve the models with your chats'; comparison-mobile 'Allow chats to be used to improve the models'
- Code: `apps/web/features/settings/sections/PrivacySection.tsx:70-90`; `apps/mobile/src/features/settings/cloud-privacy/ProviderTrainingOptOutGroup.tsx:41` (not found)

**Gap.** Feedback-data choice (S85.13) is marked not applicable; confirm that thumbs feedback sends no conversation without a visible choice.

**Acceptance criteria**

1. Toggle off; a side-call is not flagged for training (see side-call-training-policy).
2. State survives reload and shows per surface.
3. Local chat shows that nothing leaves the device.

**Verification: code inspected only.** none

## CAP-settings-19 Voice and audio recording sharing choice

Separate opt-in for sharing audio or video recordings for training.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/9450526-export-your-claude-data](https://support.claude.com/en/articles/9450526-export-your-claude-data): Exports include voice recordings the user shared with Anthropic. Plans: Free, Pro, Max, Ultra. Apps: web, desktop.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/20001274-chatgpt-voice](https://help.openai.com/en/articles/20001274-chatgpt-voice): Free, Plus and Pro may turn on Include your audio/video recordings under Improve the model for everyone. Plans: Free, Plus, Pro. Apps: web, ios, android.

**AGI requirement** (inferred; source: competitor parity). Recording sharing is an opt-in separate from text training.

**With different models, providers and the one subscription.** Local dictation never uploads; hosted speech states retention.

**Current implementation, as this trace read it on 2026-11-24: built.** web (Better than leaders per comparison), mobile done. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S85.15
- Comparison list ids: none matched; rows without an id: comparison-web 'Share voice recordings for training (opt-in)'; comparison-mobile 'Allow voice recordings to be used to improve the models'
- Code: `apps/web/features/settings/sections/PrivacySection.tsx:80-92`

**Gap.** Voice recording retention view or delete is marked not applicable (S85.15).

**Acceptance criteria**

1. Default is off; turning it on needs a clear explanation.
2. Turning it off stops sharing.

**Verification: code inspected only.** none

## CAP-settings-20 Export your data

The user requests a download of account data.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/9450526-export-your-claude-data](https://support.claude.com/en/articles/9450526-export-your-claude-data): Settings > Privacy > Export data on web or Desktop; emailed link expires after 24 hours and may work once; not from iOS or Android; no original uploaded files. Plans: Free, Pro, Max, Ultra; Team and Enterprise need an owner switch. Apps: web, desktop.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/7260999-exporting-your-chatgpt-history-and-data](https://help.openai.com/en/articles/7260999-exporting-your-chatgpt-history-and-data): Settings > Data controls > Export on web, iOS or Android; link valid 24 hours; can take up to 7 days. Plans: Free, Go, Plus, Pro, eligible Edu. Apps: web, ios, android.

**AGI requirement** (stated requirement; source: docs/product/definition.md line 283; experience-contract.md W21). Privacy settings include data export covering chats, memory, files and settings; file references must retrieve real bytes.

**With different models, providers and the one subscription.** Exports data held on our servers; Local-only data stays on device and needs its own device export. Not tied to model.

**Current implementation, as this trace read it on 2026-11-24: built.** web, desktop, mobile, CLI done; Chrome missing. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S85.20
- Comparison list ids: WP225, WP238; rows without an id: comparison-web 'Export your data'; comparison-mobile 'Export data'
- Code: `apps/web/features/settings/components/DataExportRow.tsx:205`; `apps/web/app/api/user/export/route.ts:133`; `apps/mobile/services/cloudDataExport.ts:28`; `apps/cli/src/cloud/data_export.rs:52`

**Gap.** Organization-wide owner export is partial (WP238); Chrome missing.

**Acceptance criteria**

1. Request export; a link arrives and the archive opens.
2. The archive lists chats, memory, settings and retrievable files.
3. A second request while one is pending is handled clearly.

**Verification: not verified.** No scorecard or defect row covers export.

## CAP-settings-21 Archived chats management

List archived chats, restore, delete.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: unknown**
  - no page found in the saved documentation
- **ChatGPT and Codex: yes**
  - [https://help.openai.com/en/articles/10056348-finding-your-chats-projects-and-files-in-chatgpt](https://help.openai.com/en/articles/10056348-finding-your-chats-projects-and-files-in-chatgpt): Archived chats are listed under Settings > Data controls and appear in search. Plans: All plans. Apps: web, ios, android.
  - [https://learn.chatgpt.com/docs/reference/settings.md](https://learn.chatgpt.com/docs/reference/settings.md): Codex desktop Archived chats section with Unarchive. Apps: desktop.

**AGI requirement** (stated requirement; source: AGENTS.md section 9 (chats are archived or moved to Recently deleted)). Users can list, restore and delete archived chats; archive replaces destructive delete where possible.

**With different models, providers and the one subscription.** Local chats are managed on device; cloud chats on our servers; no cross-boundary move.

**Current implementation, as this trace read it on 2026-11-24: partly built.** web, desktop, mobile, CLI, VS Code done; Chrome missing. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S85.17
- Comparison list ids: none matched; rows without an id: comparison-web 'Archived chats: restore'
- Code: `apps/web/features/settings/sections/ArchivedChatsSection.tsx:110`; `apps/mobile/app/(app)/settings/archived-chats.tsx:128`

**Gap.** Chrome missing.

**Acceptance criteria**

1. Archive a chat; see it in the archived list; restore it to the sidebar.
2. The state survives reload.

**Verification: seen working by a person.** web scorecard W-13 (Free and Premium): archive, Archived list, restore worked and persisted after reload.

## CAP-settings-22 Archive all and delete all chats

One action archives or deletes every chat after confirmation.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: unknown**
  - no page found in the saved documentation
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/8809935-deleting-and-archiving-chats-in-chatgpt](https://help.openai.com/en/articles/8809935-deleting-and-archiving-chats-in-chatgpt): Settings > Data controls has Archive all chats and Delete all chats including project chats; deleting all cannot be undone. Apps: web, ios, android.

**AGI requirement** (stated requirement; source: AGENTS.md section 9 (irreversible actions ask first and name the consequence)). Delete-all names the consequence and whether it can be recovered; it uses the confirm pattern.

**With different models, providers and the one subscription.** Applies to the chats stored on our servers or device; copy must say which.

**Current implementation, as this trace read it on 2026-11-24: built.** web, desktop, mobile done; CLI and Chrome missing. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S85.18
- Comparison list ids: none matched; rows without an id: comparison-web 'Archive all chats and delete all chats'; comparison-mobile 'Delete all chats or history'
- Code: `apps/web/features/settings/sections/PrivacySection.tsx:303`; `apps/web/app/api/chat/conversations/bulk/route.ts:53`

**Gap.** none known beyond CLI and Chrome.

**Acceptance criteria**

1. The dialog states whether deletion is recoverable.
2. After confirming, the list is empty after reload.
3. Cancelling leaves everything.

**Verification: code inspected only.** W-13 stopped at the single-chat delete confirm dialog; delete-all not run.

## CAP-settings-23 Shared links management

List chats shared by link and revoke them.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/10593882-share-and-unshare-chats](https://support.claude.com/en/articles/10593882-share-and-unshare-chats): Settings > Privacy > Shared chats lists title, date and link with an Unshare button. Plans: Free, Pro, Max, Ultra. Apps: web.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/8798634-managing-data-sharing-and-privacy-in-chatgpt-business](https://help.openai.com/en/articles/8798634-managing-data-sharing-and-privacy-in-chatgpt-business): Settings, Data controls, Shared links, Manage, then Delete shared link. Apps: web.

**AGI requirement** (stated requirement; source: docs/product/definition.md line 283 (shared chats)). Privacy settings list shared chats and let the user revoke each.

**With different models, providers and the one subscription.** Shares only server-held chats; a Local chat cannot be shared without an explicit fork.

**Current implementation, as this trace read it on 2026-11-24: built.** web, desktop, mobile, CLI done; VS Code and Chrome missing. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S85.19
- Comparison list ids: none matched
- Code: `apps/web/features/settings/sections/SharedLinksSection.tsx:82`; `apps/mobile/app/(app)/settings/shared-links.tsx:82`

**Gap.** none known on the main apps.

**Acceptance criteria**

1. A shared chat appears in the list.
2. Revoke; the link then shows not found to a signed-out viewer.

**Verification: seen working by a person.** web scorecard W-14: share, stranger view and revoke worked; the list in Settings was not separately checked.

## CAP-settings-24 Temporary or incognito chat

A chat not saved to history, memory or training.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/11817273-use-claude-s-chat-search-and-memory-to-build-on-previous-context](https://support.claude.com/en/articles/11817273-use-claude-s-chat-search-and-memory-to-build-on-previous-context): Ghost icon on a new non-project chat opens a temporary chat not saved to history or memory; on Team and Enterprise it still appears in exports and retention. Plans: All plans. Apps: web, desktop, ios, android.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/8914046-temporary-chat-in-chatgpt](https://help.openai.com/en/articles/8914046-temporary-chat-in-chatgpt): Not saved to history, not used for model improvement, no memories; a copy may be kept up to 30 days for safety. Apps: web, ios, android.

**AGI requirement** (stated requirement; source: docs/product/requirements.md line 417 (temporary/private chat); experience-contract.md memory incognito exclusion). Temporary chat is available and can be the default; the copy states any retention.

**With different models, providers and the one subscription.** On hosted routes state the provider's retention; Local mode keeps nothing off device.

**Current implementation, as this trace read it on 2026-11-24: partly built.** web, desktop, mobile, CLI done; VS Code and Chrome missing. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S85.16
- Comparison list ids: none matched; rows without an id: comparison-desktop 'Temporary chat toggle'
- Code: `apps/web/lib/hooks/useChatStream.ts:3364`; `apps/cli/src/config.rs:1105`

**Gap.** VS Code and Chrome missing.

**Acceptance criteria**

1. Temporary chat does not appear in history after leaving it.
2. No memory is written from it.

**Verification: code inspected only.** none

## CAP-settings-25 Delete account

The user deletes the account and its data from settings.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/9028421-delete-your-claude-account](https://support.claude.com/en/articles/9028421-delete-your-claude-account): Settings > Account > Delete account on web, Settings > Profile on iOS, Profile > Account Actions on Android; irreversible. Apps: web, ios, android.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/7730893-data-controls-in-chatgpt](https://help.openai.com/en/articles/7730893-data-controls-in-chatgpt): Self-service deletion is permanent; unavailable in managed workspaces. Plans: Free, Go, Plus, Pro. Apps: web, ios, android.

**AGI requirement** (stated requirement; source: docs/product/definition.md line 281; AGENTS.md section 9). Account settings include delete account with a warning on subscription cancellation and what is lost.

**With different models, providers and the one subscription.** Must cancel or warn about the one AGI Subscription and credits; local on-device data handling must be stated.

**Current implementation, as this trace read it on 2026-11-24: partly built.** web, desktop, mobile done; CLI and Chrome missing. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S85.26
- Comparison list ids: none matched; rows without an id: comparison-web 'Delete account from Settings'
- Code: `apps/web/features/settings/sections/AccountSection.tsx:448`; `apps/web/app/api/user/delete-account/route.ts:416`

**Gap.** none known on main apps.

**Acceptance criteria**

1. Dialog names what is lost, including subscription and credits.
2. Cancel leaves the account intact.
3. After deletion sign-in fails.

**Verification: not verified.** Destructive; no person run.

## CAP-settings-26 Import from another assistant

Bring memory, settings or history from another assistant.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude and Claude Code: partly**
  - [https://support.claude.com/en/articles/11817273-use-claude-s-chat-search-and-memory-to-build-on-previous-context](https://support.claude.com/en/articles/11817273-use-claude-s-chat-search-and-memory-to-build-on-previous-context): Memory can be imported from other AI assistants or exported (experimental). Apps: web, desktop, ios, android.
  - [https://code.claude.com/docs/en/cli-reference.md](https://code.claude.com/docs/en/cli-reference.md): claude import brings configuration from other coding agents, with dry-run. Apps: cli.
- **Codex: partly**
  - [https://learn.chatgpt.com/docs/whats-new.md](https://learn.chatgpt.com/docs/whats-new.md): Desktop Settings > Import brings instructions, settings, skills, plugins, projects and recent work from Claude Code, Claude Cowork or Cursor. Apps: desktop, cli.

**AGI requirement** (stated requirement; source: docs/product/definition.md line 283). Privacy settings include import memory from other AI providers.

**With different models, providers and the one subscription.** Import is provider neutral; imported content counts under the same storage limits.

**Current implementation, as this trace read it on 2026-11-24: partly built.** memory import done on web, desktop, mobile, CLI; chat-history import missing everywhere. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S85.21, S85.22
- Comparison list ids: none matched
- Code: `apps/web/features/settings/components/ImportMemoryDialog.tsx:84`; `apps/web/app/api/memory/import/route.ts:184`

**Gap.** No chat-history import; no settings or skills import for AGI CLI.

**Acceptance criteria**

1. Import a memory file; entries appear and are deletable.
2. A bad file shows a clear error and changes nothing.

**Verification: code inspected only.** none

## CAP-settings-27 Clear local data

Wipe data kept on this device from inside the app.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: unknown**
  - no page found in the saved documentation
- **Codex: yes**
  - [https://learn.chatgpt.com/docs/browser.md](https://learn.chatgpt.com/docs/browser.md): Settings > Browser: clear browsing data by time range and type, download folder, history. Apps: desktop.

**AGI requirement** (proposed; source: ledger S85.23; AGENTS.md section 9 on Trash). Users can clear on-device chats, cache and settings; a removed file goes to the OS Trash first.

**With different models, providers and the one subscription.** Central to Local mode where chats live on device; must not touch server copies and say so.

**Current implementation, as this trace read it on 2026-11-24: partly built.** mobile done; desktop, CLI, VS Code missing. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S85.23, S85.24
- Comparison list ids: none matched
- Code: `apps/mobile/app/(app)/settings/storage.tsx:173`

**Gap.** Desktop has no local wipe despite storing local sessions.

**Acceptance criteria**

1. Clear local data; local chats are gone, server chats remain.
2. The dialog names what is lost.

**Verification: code inspected only.** none

## CAP-settings-28 Screen reader and accessible output mode

A plain, linear output mode for screen readers.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude Code: yes**
  - [https://code.claude.com/docs/en/accessibility.md](https://code.claude.com/docs/en/accessibility.md): Opt-in mode replaces the boxed terminal UI with plain labeled text; --ax-screen-reader flag beats env var beats setting; tables read as sentences; bell on completion. Apps: cli.
- **ChatGPT: unknown**
  - no page found in the saved documentation

**AGI requirement** (inferred; source: competitor parity; experience-contract W23). CLI offers a plain mode for screen readers and honours NO_COLOR; app screens keep accessible names and focus.

**With different models, providers and the one subscription.** Local; none.

**Current implementation, as this trace read it on 2026-11-24: built.** CLI done; other apps follow ledger S11.01 to S11.09 (web, desktop unverified on control labels). The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S11.01, S11.28
- Comparison list ids: none matched
- Code: `apps/cli/src/lib.rs:4887`; `apps/cli/src/output.rs:43`

**Gap.** Control labels unverified on web, desktop, Chrome.

**Acceptance criteria**

1. Run the CLI in plain mode; no box drawing or spinners.
2. A screen reader reads an approval prompt fully.

**Verification: code inspected only.** none

## CAP-settings-29 Launch at login and desktop startup

Desktop starts at login.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: unknown**
  - no page found in the saved documentation
- **ChatGPT: unknown**
  - no page found in the saved documentation

**AGI requirement** (stated requirement; source: docs/product/definition.md line 406). Desktop settings include run on startup.

**With different models, providers and the one subscription.** Local; none.

**Current implementation, as this trace read it on 2026-11-24: built.** desktop done. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S84.21
- Comparison list ids: none matched
- Code: `apps/desktop/electron/launchAtLogin.ts:15`

**Gap.** none known

**Acceptance criteria**

1. Turn on; after reboot the app starts.
2. Turn off; it does not.

**Verification: code inspected only.** none

## Unresolved product choices

Decisions this topic needs from the owner. Nothing here has been decided.

- How many interface languages to offer. D-2026-09-15-03 allows only complete and reviewed languages; leaders offer 11 to about 60, and only English and Spanish are selectable now.
- Whether to match the dyslexia-friendly font on mobile, which only Claude documents.
- Whether to build theme sharing and custom theme files, which only the coding tools (Claude Code, Codex) document.
- Whether time zone, interface density, sound effects, startup destination, default workspace and layout reset (all Should items with no leader evidence) are worth building.
- Whether chat-history import from other assistants is wanted; no leader chat product documents it in the catalogue.
- Whether accent color and text size are needed on CLI, VS Code and Chrome.
- Whether the Reduce sensitive content switch (ChatGPT Settings > Safety) belongs in this topic or in safety; AGI already has one on web and mobile.

## Could not establish

- Whether Claude chat has an accent color, a text-size setting, shortcut rebinding or a reply-language setting: no catalogue line shows them, so has is unknown.
- Whether ChatGPT has a dyslexia-friendly font or a color-blind mode: not in the catalogue.
- Claude's 'Help improve Claude' toggle location and default were not read from a saved settings page; only the data-protection page was used.
- ChatGPT's Delete all chats copy and archive behavior on mobile were read from catalogue lines only.
- No scorecard or defect row covers export, delete account, language switching, accent, font, text size, reduced motion or shortcuts; those are code-read only.
- Statuses for desktop, mobile, CLI, VS Code and Chrome come from code reading; no person-run evidence exists for them in the supplied files.
- Code line numbers are copied from the ledger and comparison files; only that the files exist was spot-checked.
- Comparison rows without a list_id cannot be cited by id.

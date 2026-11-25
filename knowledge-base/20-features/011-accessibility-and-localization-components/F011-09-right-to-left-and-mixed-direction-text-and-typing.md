---
id: "F011-09"
type: "feature"
title: "Right-to-left and mixed-direction text, and typing with input methods"
aliases: ["Right-to-left layout", "RTL", "Mixed direction text", "dir=auto", "IME composition", "Input method composition", "Enter during composition", "S11.19", "S11.20", "S11.21"]
area: "11 Accessibility and localization components"
available_on: ["web", "desktop", "mobile", "vscode", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "partial", cli: "n/a", vscode: "partial", chrome: "partial"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "n/a", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S11.19", "S11.20", "S11.21"]
depends_on: ["SYS-shared-ui-and-design", "SYS-chat-turn-pipeline", "surface:web", "surface:desktop", "surface:mobile", "surface:vscode", "surface:chrome", "file:packages/ui/i18n/src/languages.ts", "file:packages/ui/ui/src/lib/ime-composition.ts", "F011-10"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F011-09 Right-to-left and mixed-direction text, and typing with input methods

Web sets the page direction from the language table and lets message text and the composer pick their own direction. Mobile sets native layout direction. Enter is ignored while an input method is composing on Web, VS Code and Chrome; Mobile's composer never sends on Enter. Today only English and Spanish are selectable, so no right-to-left language can be chosen.

Area: [11. Accessibility and localization components](README.md). Requirement items: [S11.19](../../10-requirements/capabilities/011-accessibility-and-localization-components.md#s1119), [S11.20](../../10-requirements/capabilities/011-accessibility-and-localization-components.md#s1120), [S11.21](../../10-requirements/capabilities/011-accessibility-and-localization-components.md#s1121).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built (this page lists unfinished parts) | built | not seen by a person |
| Desktop | partly built (this page lists unfinished parts) | built | not seen by a person |
| Mobile | partly built | partly built | not seen by a person |
| CLI | does not apply | does not apply | n/a |
| VS Code | partly built | partly built | not seen by a person |
| Chrome | partly built | partly built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Mirrors the layout for right-to-left languages, aligns each message by its own text direction, and stops Enter from sending while an input method (Japanese, Chinese, Korean) is confirming characters.

**Why it exists.** Arabic and Hebrew readers need correct direction; Japanese, Chinese and Korean typists would otherwise send half-typed messages (brief S11.19-S11.21).

**Who uses it.** Users of right-to-left languages and of input methods, on every typing surface.

**Problems it solves**

- Arabic text laid out left to right.
- Half-composed text sent by the Enter that confirms a candidate.
- Mixed-language drafts aligned the wrong way.

**Use cases**

- A user switches the display language to a right-to-left language and the page flips (when such a language becomes selectable).
- A Japanese typist presses Enter to confirm characters and nothing is sent.
- A user pastes Arabic into the composer and it aligns right.
- A VS Code user types Korean in the sidebar chat.

## 2. User experience

**Where to find it**

- Web and Desktop (hosted web app): Settings, General, row 'Display Language' (apps/web/features/settings/sections/GeneralSection.tsx:524-537) with a select labelled 'Display language' (apps/web/features/settings/components/LanguageSelector.tsx:19).
- Mobile: Settings, General, screen titled 'App language', hidden unless the appLanguage flag is on (apps/mobile/src/features/settings/general/AppLanguageScreen.tsx:22, :58; apps/mobile/lib/v1FeatureFlags.ts:36).
- Composer and message text: no control; automatic.
- VS Code sidebar chat and Chrome side panel composers: automatic Enter handling.

**Before you start**

- A selectable right-to-left language: none today, the selectable list is English and Spanish (packages/ui/i18n/src/languages.ts:25-34).
- An input method installed on the device for composition.

**Screens and controls**

- Display language select (Web).
- App language picker with 'Language of the app' card and device option (Mobile, flag off).
- Composer textarea with dir=auto (Web).

**Journey**

1. Open Settings, General, Display Language.
2. Choose a language; the document lang and dir attributes change.
3. Type or paste mixed text; each message block aligns by its own first strong character.
4. Type with an input method; press Enter to confirm characters; the message is not sent; press Enter again to send.

**What the person sees and gets**

- Document dir attribute becomes rtl or ltr (apps/web/app/i18n/index.ts:72-76).
- Mobile reloads the app when the layout direction must change (apps/mobile/app/_layout.tsx:591-596).
- The draft stays in the field when composition Enter is ignored (ChatComposerNew.imeComposition.test.tsx:91).

**Settings**

- Language preference stored under key agiworkforce-language in a cookie and browser storage on Web (apps/web/app/i18n/index.ts:18, :60-64); stored in encrypted device storage on Mobile (apps/mobile/src/i18n/index.ts:17, :80-88).
- 'Send with Enter' setting changes whether plain Enter sends (ChatComposerNew.tsx:4640-4648).
- Response language setting (Personalization) is separate: it changes the answer language, not the direction (apps/web/features/settings/sections/PersonalizationSection.tsx:430-441).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web sets document lang and dir from the language table on every language change (apps/web/app/i18n/index.ts:72-83); the language table marks Arabic rtl (packages/ui/i18n/src/languages.ts:13).
- Web message body and trailing prose and the composer textarea carry dir=auto (apps/web/features/chat/components/messages/MessageBubble.tsx:2839, :3212; apps/web/features/chat/components/Composer/ComposerInput.tsx:137).
- Web composer ignores Enter while composing, using a shared helper that checks isComposing or key code 229 (packages/ui/ui/src/lib/ime-composition.ts:1-12; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:4579, :4636-4648).
- Chrome side panel and VS Code webview use the same two checks on composer, slash and mention menus (apps/extension/src/side_panel.ts:12264, :14242, :14520, :14574; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:5876, :6791, :7243, :7368).
- Mobile allows and swaps left and right in RTL, applies force direction on language change, and the app config enables native RTL (apps/mobile/src/i18n/index.ts:21-22, :96-101; apps/mobile/__tests__/rtl-native-config.test.ts).
- Mobile composer is a multiline input that inserts a newline on Enter, sending only by button, so Enter cannot send mid-composition [inferred] (apps/mobile/src/features/chat/components/ChatInput.tsx:2120-2126).

**Incomplete**

- Only English and Spanish are selectable; Arabic is in the table but hidden, so the mirror path cannot be reached by a user today (packages/ui/i18n/src/languages.ts:25-34; doc: docs/decisions/2026-09-15-founder-decisions.md D-2026-09-15-03).
- dir=auto sits on the whole message container, not per paragraph; whether each paragraph of mixed text picks its own direction is not shown in code (MessageBubble.tsx:2839; no dir attribute found in packages/ui/unified-chat/src/components/markdown).
- The test for message direction reads source text instead of rendering (apps/web/features/chat/components/messages/__tests__/MessageDirection.test.tsx:5-14).
- Mobile message text has no direction handling found beyond native defaults (no dir or writingDirection code found).

**Present but disconnected or switched off**

- Mobile app language feature is off (FEATURES.appLanguage false), so the device language is ignored and English is used (apps/mobile/lib/v1FeatureFlags.ts:36; apps/mobile/src/i18n/index.ts:29-35).
- Direction code for other languages is loaded but not selectable (languages.ts:25-34).

**Not available**

- Chrome side panel: no document direction setting or dir attribute found (apps/extension/src/side_panel.ts has none).
- VS Code webview: no dir attribute found (webviewContent.ts).
- CLI: not applicable.

## 4. Required behaviour

**Established requirements**

- In a right-to-left language the whole layout mirrors correctly (direction set and logical start/end spacing). Web, desktop, mobile done; Chrome missing. (source: brief S11.19)
- Messages mixing left-to-right and right-to-left text render each paragraph in its own direction (dir=auto). Web and desktop done; mobile unverified; VS Code and Chrome missing. (source: brief S11.20)
- Typing with an input method never sends the message when Enter confirms a composition. Done on web, desktop, mobile, VS Code, Chrome. (source: brief S11.21)
- Offer English plus only languages that are complete and reviewed; hide incomplete languages; more languages are model-translated then human-reviewed before they become selectable. (source: doc: docs/decisions/2026-09-15-founder-decisions.md (D-2026-09-15-03))

**Acceptance criteria**

1. After choosing each selectable language, document.lang equals the code and document.dir equals the table's direction.
2. Switching back to English resets dir to ltr.
3. Pasting Arabic into the web composer aligns the draft to the right without changing the page direction.
4. Keydown Enter with isComposing true or key code 229 in the web composer does not submit and keeps the draft; the next plain Enter submits.
5. The same Enter checks hold in the Chrome side panel and the VS Code sidebar.
6. On Mobile, Enter in the composer inserts a newline and does not send.
7. On Mobile with a right-to-left language chosen, the app restarts once and the layout is mirrored.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Desktop gets Web behaviour via the hosted web app [inferred].
- No acceptance check for a user-reachable right-to-left language is possible until one is selectable [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add dir=auto to each rendered paragraph, or confirm the container behaviour with a rendered test.
- [proposed] Add direction handling to the VS Code and Chrome surfaces.
- [proposed] Verify RTL on Mobile with a real device before turning appLanguage on.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| config | SUPPORTED_LANGUAGES and SELECTABLE_LANGUAGE_CODES | `packages/ui/i18n/src/languages.ts` | Language table with rtl flag; only en and es selectable |
| service | web i18n init and applyDocumentLanguage | `apps/web/app/i18n/index.ts` | Sets lang and dir on the document |
| component | LanguageSelector | `apps/web/features/settings/components/LanguageSelector.tsx` | Display language select |
| component | DisplayLanguageRow | `apps/web/features/settings/sections/GeneralSection.tsx` | Settings row 'Display Language' |
| component | ComposerInput | `apps/web/features/chat/components/Composer/ComposerInput.tsx` | Textarea with dir=auto |
| component | MessageBubble (web) | `apps/web/features/chat/components/messages/MessageBubble.tsx` | dir=auto on message body and trailing prose |
| component | ChatComposerNew keydown handler | `apps/web/features/chat/components/Composer/ChatComposerNew.tsx` | Skips send, menus and shortcuts while composing |
| service | isImeComposingKey | `packages/ui/ui/src/lib/ime-composition.ts` | Shared check: isComposing or key code 229 |
| service | composer-editor ime re-export | `packages/ui/unified-chat/src/composer-editor/ime-composition.ts` | Re-exports the helper for the shared composer |
| service | mobile i18n layout direction | `apps/mobile/src/i18n/index.ts` | allowRTL, swapLeftAndRightInRTL, applyLayoutDirection |
| component | AppLanguageScreen | `apps/mobile/src/features/settings/general/AppLanguageScreen.tsx` | Mobile language picker, behind a flag |
| config | FEATURES.appLanguage | `apps/mobile/lib/v1FeatureFlags.ts` | Turns mobile language choice on or off (off) |
| component | RootLayout language restore | `apps/mobile/app/_layout.tsx` | Restores language and reloads when direction changes |
| component | ChatInput (mobile) | `apps/mobile/src/features/chat/components/ChatInput.tsx` | Multiline input, send by button |
| component | Chrome side panel composer | `apps/extension/src/side_panel.ts` | IME checks on Enter, slash and mention menus |
| component | VS Code sidebar webview | `apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts` | IME checks on keydown handlers |
| test | document-direction test | `apps/web/app/i18n/document-direction.test.ts` | lang and dir for every supported language |
| test | imeComposition test | `apps/web/features/chat/components/Composer/ChatComposerNew.imeComposition.test.tsx` | Composition Enter does not send |
| test | ime-composition unit test | `packages/ui/ui/src/lib/ime-composition.test.ts` | Helper truth table |
| test | MessageDirection test | `apps/web/features/chat/components/messages/__tests__/MessageDirection.test.tsx` | Source-text check for dir=auto |
| test | rtl-native-config test | `apps/mobile/__tests__/rtl-native-config.test.ts` | Native RTL plugin config |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The user picks a language; the i18n library switches catalogs. | device | apps/web/features/settings/components/LanguageSelector.tsx:10-16 |
| A language-changed listener writes lang and dir on the document element. | device | apps/web/app/i18n/index.ts:72-83 |
| Mobile: the preference is saved to device storage and the native layout direction is forced; if it changed, the app reloads. | device | apps/mobile/src/i18n/index.ts:77-90; apps/mobile/app/_layout.tsx:591-596 |
| While typing, the browser reports composition on each keydown; the handler returns early when composing. | device | ChatComposerNew.tsx:4579-4660 |
| Each rendered message block resolves its own direction from text through dir=auto. | device | MessageBubble.tsx:2839 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Language preference | Web cookie and local storage key agiworkforce-language; Mobile encrypted storage key agiworkforce-language | Not synced to the account in the code seen; the decision doc says clients follow the account language where supported (unknown if implemented) | Cookie max age one year (apps/web/app/i18n/index.ts:60-64) |

**Models and providers.** None. Direction and composition handling are local UI code. The 'Response language' setting does affect the model's reply language but is separate (PersonalizationSection.tsx:430-441).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | none found in the code for direction or composition handling. |
| Permissions | none found in the code. |
| Subscription | none found in the code. |
| Limits and metering | none found in the code. |
| Feature flags | Mobile FEATURES.appLanguage is false (apps/mobile/lib/v1FeatureFlags.ts:36). Selectable language list is fixed in packages/ui/i18n/src/languages.ts:25. |
| Model compatibility | Model independent. |
| Provider restrictions | none found in the code. |
| Local mode | Fully on device; Local mode changes nothing. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Language change on Web | dir and lang update at once; default language returns dir to ltr | document-direction.test.ts:8-23 |
| Language cache unreadable | Mobile falls back to the device preference; storage errors are caught | apps/mobile/src/i18n/index.ts:46-58 |
| Mobile direction changed | One app reload; if reload fails the app continues and logs | apps/mobile/app/_layout.tsx:593-598 |
| IME keydown without isComposing (WebKit) | Key code 229 is the fallback marker | packages/ui/ui/src/lib/ime-composition.ts:1-2 |
| Enter right after composition ends | Sends | ChatComposerNew.imeComposition.test.tsx:77 |
| Slash or mention menu open during composition | Menu does not take Enter | ChatComposerNew.tsx:4582, :4593 |
| Right-to-left text in code blocks or tables | not handled in the code (not looked up beyond message containers) | no dir handling found in packages/ui/unified-chat/src/components/markdown |
| Chrome and VS Code direction | not handled in the code | no dir attribute found in side_panel.ts or webviewContent.ts |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/i18n/document-direction.test.ts`: lang and dir for every supported language and the return to ltr
- `apps/web/features/chat/components/Composer/ChatComposerNew.imeComposition.test.tsx`: No send on key code 229, on isComposing, send after composition, draft kept
- `packages/ui/ui/src/lib/ime-composition.test.ts`: The shared composition helper
- `apps/web/features/chat/components/messages/__tests__/MessageDirection.test.tsx`: MessageBubble source has dir=auto and logical alignment
- `apps/web/features/chat/components/Composer/__tests__/ComposerInput.test.tsx`: Composer input attributes (dir)
- `apps/extension/__tests__/composer-menu-ime.test.ts`: Slash and mention menu handlers contain the composition check
- `apps/mobile/__tests__/rtl-native-config.test.ts`: expo-localization plugin supportsRTL true, forcesRTL false
- `apps/mobile/__tests__/mobile-i18n.test.ts`: Mobile language selection, storage and direction (opened header only)
- `apps/mobile/__tests__/AppLanguageSettings.test.tsx`: Mobile language settings screen

**Test scenarios**

- **Document direction**
  1. On Web choose Spanish then English in Settings
  2. Inspect the html element
  - Expected: lang es then en, dir ltr both times
- **Right-to-left page**
  1. In a test build, make an rtl language selectable
  2. Select it
  - Expected: html dir rtl; sidebar and menus mirror
- **IME Enter**
  1. Enable a Japanese input method
  2. Type 'nihongo', press Space, press Enter to confirm
  - Expected: No send; draft stays; second Enter sends
- **Mixed text**
  1. Paste a draft starting with Arabic into the web composer
  2. Send, then read the message
  - Expected: Draft and message align right; an English-first message aligns left
- **Chrome and VS Code IME**
  1. Repeat IME Enter in the Chrome side panel and VS Code sidebar
  - Expected: No send mid-composition
- **Mobile Enter**
  1. Type in the mobile composer and press the keyboard Enter key
  - Expected: A newline is inserted; send needs the send button

**Where to look when it fails**

- html element lang and dir attributes
- Console warning '[RootLayout] app language direction reload failed' on Mobile
- Console warning '[i18n] language preference was not saved' on Mobile

**Hands-on test plans**

- Web: [70-qa/test-plans/web/011-accessibility-and-localization-components.md](../../70-qa/test-plans/web/011-accessibility-and-localization-components.md)
- Desktop: [70-qa/test-plans/desktop/011-accessibility-and-localization-components.md](../../70-qa/test-plans/desktop/011-accessibility-and-localization-components.md)
- Mobile: [70-qa/test-plans/mobile/011-accessibility-and-localization-components.md](../../70-qa/test-plans/mobile/011-accessibility-and-localization-components.md)
- VS Code: [70-qa/test-plans/vscode/011-accessibility-and-localization-components.md](../../70-qa/test-plans/vscode/011-accessibility-and-localization-components.md)
- Chrome: [70-qa/test-plans/chrome/011-accessibility-and-localization-components.md](../../70-qa/test-plans/chrome/011-accessibility-and-localization-components.md)

## 10. Gaps and dependencies

- **No right-to-left language is selectable, so S11.19 cannot be reached by a user** Affects: All apps that use the shared language list. Evidence: packages/ui/i18n/src/languages.ts:25-34. Work needed: Complete and review a right-to-left catalog, then add its code to the selectable list per the decision
- **dir=auto is on the message container, not on each paragraph** Affects: Web and Desktop users with mixed-direction messages. Evidence: MessageBubble.tsx:2839, :3212; no dir in markdown folder. Work needed: Verify in a browser; add per-block direction if needed
- **Mobile language choice is off and mixed-direction text is unverified** Affects: Mobile users. Evidence: apps/mobile/lib/v1FeatureFlags.ts:36. Work needed: Enable after catalogs are ready; test on device
- **VS Code and Chrome have no direction handling** Affects: VS Code and Chrome right-to-left users. Evidence: No dir attribute in webviewContent.ts or side_panel.ts. Work needed: Add dir=auto on composer and message blocks
- **Direction test is a source-text check** Affects: Test confidence. Evidence: MessageDirection.test.tsx:5-14. Work needed: Add a rendered test with mixed text
- **Brief citations for S11.19 point to citation helper code in MarkdownContent.tsx (:290, :345) that has nothing to do with direction** Affects: Engineers. Evidence: packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx:280-350. Work needed: Refresh brief citations

**Depends on**

- SYS-shared-ui-and-design
- SYS-chat-turn-pipeline
- surface:web
- surface:desktop
- surface:mobile
- surface:vscode
- surface:chrome
- file:packages/ui/i18n/src/languages.ts
- file:packages/ui/ui/src/lib/ime-composition.ts
- F011-10

## Unknown

- Whether dir=auto on a container gives per-paragraph direction in a real browser for multi-paragraph messages.
- Whether the Electron Desktop window loads the language from the account rather than local storage.
- Whether VS Code or Chrome need direction handling inside their webview CSS.
- How Mobile renders mixed-direction message text on a device (brief says unverified).
- Whether account-level language sync exists (the decision says clients follow it).

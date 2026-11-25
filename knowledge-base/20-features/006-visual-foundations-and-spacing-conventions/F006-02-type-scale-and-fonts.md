---
id: "F006-02"
type: "feature"
title: "Type scale and fonts"
aliases: ["Type scale and fonts", "Typography", "Chat font", "Chat text size", "Font families", "Heading scale", "Caption floor", "Line height", "Code font", "Transcript font"]
area: "6 Visual foundations and spacing conventions"
available_on: ["web", "desktop", "mobile", "cli", "vscode", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "built", vscode: "built", chrome: "built"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S6.07", "S6.08", "S6.09", "S6.10", "S6.11", "S6.12"]
depends_on: ["SYS-shared-ui-and-design", "SYS-sync-and-continuity", "surface:web", "surface:desktop", "surface:mobile", "surface:vscode", "surface:chrome", "surface:cli", "mode:local", "F006-01"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F006-02 Type scale and fonts

One declared set of fonts, heading sizes, body size, a 12px floor for small text, a code size and a line height per text role. Web lets people pick a chat font and text size. Mobile follows the phone's text size and has code and transcript font choices. VS Code follows the editor font.

Area: [6. Visual foundations and spacing conventions](README.md). Requirement items: [S6.07](../../10-requirements/capabilities/006-visual-foundations-and-spacing-conventions.md#s607), [S6.08](../../10-requirements/capabilities/006-visual-foundations-and-spacing-conventions.md#s608), [S6.09](../../10-requirements/capabilities/006-visual-foundations-and-spacing-conventions.md#s609), [S6.10](../../10-requirements/capabilities/006-visual-foundations-and-spacing-conventions.md#s610), [S6.11](../../10-requirements/capabilities/006-visual-foundations-and-spacing-conventions.md#s611), [S6.12](../../10-requirements/capabilities/006-visual-foundations-and-spacing-conventions.md#s612).

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

**What it does.** Declares sans, serif and monospace families once (packages/ui/design-tokens/src/chat.css:28-42) and a type scale of display, h1 to h5, body, body-small, label, caption, metadata and code, each with its own line height (packages/ui/design-tokens/src/foundation.css:368-424). Web maps these to Tailwind text-* utilities (packages/ui/design-tokens/src/tailwind.css:7-60).

**Why it exists.** So text looks the same across screens, stays readable (small text never below 12px) and can be changed by people who need larger or friendlier type. The 2026-11-19 requirements list Chat font and Chat text size as Appearance settings (doc: docs/product/requirements.md, Appearance settings).

**Who uses it.** Readers of long chats, people with low vision or dyslexia, developers reading code.

**Problems it solves**

- Tiny captions that fail readability
- Code and prose sharing one font
- A font choice that falls back silently
- Text that jumps in size between screens

**Use cases**

- A person on web picks Dyslexic friendly under Chat font.
- A person on web sets Chat text size to Large for a long reading session.
- A mobile user raises the phone's text size and the app follows it.
- A VS Code user changes the editor font size and the sidebar follows.

## 2. User experience

**Where to find it**

- Web: Settings > Appearance > 'Chat font' (Default, Sans, Serif, Dyslexic friendly) and 'Chat text size' (Small, Default, Large) (apps/web/features/settings/sections/AppearanceSection.tsx:190-225 region, :215).
- Desktop: the same hosted web page (doc: AGENTS.md section 5).
- Mobile: the app follows the phone's text size (apps/mobile/src/shared/components/TextScaleBoundary.tsx); the code settings screen has 'Code font' and 'Transcript font' rows (apps/mobile/src/features/settings/code/index.tsx:203,216). Which menu row opens that screen is unknown.
- CLI: no text-size control; the terminal's own font applies (none found in the code).
- VS Code: no AGI control; sizes derive from --vscode-font-size and --vscode-editor-font-family (webviewContent.ts:227-246).
- Chrome: no font control found; side panel sizes are fixed in side_panel.css:44-62.

**Before you start**

- None; no account, plan or sign-in is needed.

**Screens and controls**

- Web Chat font: a select; hint 'Applies to message text. Code always stays monospace.'
- Web Chat text size: a select Small, Default, Large.
- Mobile Code font and Transcript font rows (code/index.tsx:203,216).
- Web hint copy and options come straight from AppearanceSection.tsx.

**Journey**

1. Open Settings > Appearance on web.
2. Pick a Chat font and/or Chat text size.
3. Message text in chats changes at once; code blocks keep the monospace font but follow the size step.
4. Reload; the choice is kept.

**What the person sees and gets**

- Immediate change in chat prose and code blocks.
- Dyslexic friendly loads a self-hosted face (AppearanceSection.tsx comment, files under apps/web/public/fonts/opendyslexic).
- Account sync errors show the shared notice 'This device keeps your choice.' (SettingsPreferenceRow.tsx:8-26).

**Settings**

- data-chat-text-size and data-chat-font attributes on the html element (apps/web/shared/components/AppearancePreferences.tsx:15-20,42-46).
- Store fields chatTextSize and chatFont (apps/web/shared/stores/web-settings-store.ts:119,121).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web loads Geist, Geist Mono, JetBrains Mono and Newsreader through next/font (apps/web/app/layout.tsx:2) and exposes them as --font-* variables; chat.css lists system and emoji fallbacks (chat.css:28-42).
- Type roles with size and line height: display 1.75rem, h1 1.5rem, h2 1.25rem, h3 1.125rem, h4 1rem, h5 0.875rem, body 1rem at 1.6, body-small 0.875rem, caption 0.75rem, metadata 0.75rem, code 0.8125rem (foundation.css:368-424).
- Web Chat text size: Small sets prose 13.5px and code 12px, Large 17px and 14.5px; Default sets no attribute (globals.css:932-937, 965-975).
- Web Chat font: serif, sans and dyslexic rules on .prose; code is pinned to monospace (globals.css:948-962).
- Web code blocks use 13px at line-height 1.5 (globals.css:904-921).
- Mobile typeScale: caption 14, footnote 14, subhead 14, body 15, callout 16, headline 17, title3 20, title2 22, title1 28, largeTitle 34, display 48 (apps/mobile/src/ui/theme/tokens.ts, typeScale); Text component variants with mono variant using the chosen code font (apps/mobile/components/ui/Text.tsx); text scale taken from the OS (TextScaleBoundary.tsx).
- VS Code: body and code sizes follow host font settings; small text is at least 12px via max(12px, size-1) (webviewContent.ts:233-244).
- Chrome: body 14px, caption and label inherit body-small 14px, code font JetBrains Mono then system monospaces (apps/extension/src/side_panel.css:44-62).
- CLI: code uses the terminal's monospace font by nature; heading styles keyed by level (apps/cli/src/tui/markdown_renderer.rs:209-222).

**Incomplete**

- Two stacks for serif and display both point at Newsreader (chat.css:31-39) so 'editorial' and 'display' are not distinct [inferred].
- Web type-scale chat heading 3 uses a literal 1.0625rem rather than the h3 token (chat.css, --chat-type-heading-3-size).
- Chrome's side panel sets its own sans stack in a rule rather than a token (side_panel.ts:2068).

**Present but disconnected or switched off**

- Web next-themes and Chat font controls depend on the hosted page; the Tauri desktop loads the stylesheet without next/font and relies on literal family names (chat.css comment before :28).

**Not available**

- Chat text size and Chat font controls on mobile, CLI, VS Code and Chrome.
- Mobile has no in-app text-size control; it follows the OS only (no matching control found in apps/mobile/src/features/settings).

## 4. Required behaviour

**Established requirements**

- Each surface declares its UI, editorial and monospace families once and loads the faces it names. (source: S6.07 (brief))
- Headings use one defined heading scale pairing size, weight and line height. (source: S6.08 (brief))
- Body text uses a defined base size and small variant and respects the user's text-size preference where offered. (source: S6.09 (brief))
- Captions and metadata use a named small-text role no smaller than 12px that keeps AA contrast. (source: S6.10 (brief))
- Code and technical text use a declared monospace family and a size distinct from body. (source: S6.11 (brief))
- Line height is defined per text role, not set ad hoc. (source: S6.12 (brief))
- Chat font and Chat text size are Appearance settings. (source: docs/product/requirements.md (Appearance settings))

**Acceptance criteria**

1. Selecting Serif under Chat font changes message prose but not code blocks on web.
2. Selecting Large under Chat text size makes prose 17px and code 14.5px on web; Small makes them 13.5px and 12px.
3. No text role in foundation.css is below 0.75rem (12px).
4. Choosing Dyslexic friendly renders a face from the site's own fonts, with no external request blocked by the policy.
5. On mobile with the OS at a larger text size, chat and settings text grow, and headers cap at a scale of 2 (tokens.ts HEADER_TEXT_SCALE_LIMIT).
6. In VS Code, raising the editor font size grows sidebar body and code text.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Mobile caption of 14 exceeds the 12px floor, so the floor holds there [inferred from typeScale].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Offer the same text-size choice on mobile in-app, or document that OS scaling is the intended control.
- [proposed] Route chat heading 3 through the h3 token.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| config | type tokens | `packages/ui/design-tokens/src/foundation.css` | --type-* size, height, weight and tracking roles (:368-424) |
| config | font stacks | `packages/ui/design-tokens/src/chat.css` | --chat-font-sans, serif, display, greeting, mono with emoji fallbacks (:28-42) |
| config | Tailwind text utilities | `packages/ui/design-tokens/src/tailwind.css` | Maps text-display to text-metadata onto the type roles (:7-60) |
| config | font loading | `apps/web/app/layout.tsx` | next/font loads Geist, Geist Mono, JetBrains Mono and Newsreader (:2) |
| config | web chat text and font rules | `apps/web/app/globals.css` | data-chat-text-size and data-chat-font rules (:932-975) and code block size (:904-921) |
| component | AppearanceSection | `apps/web/features/settings/sections/AppearanceSection.tsx` | Chat font and Chat text size selects |
| component | AppearancePreferences | `apps/web/shared/components/AppearancePreferences.tsx` | Stamps data-chat-font and data-chat-text-size |
| store | web settings store | `apps/web/shared/stores/web-settings-store.ts` | chatFont, chatTextSize persisted (localStorage agiworkforce-web-settings) |
| component | CloudSettingsSync | `apps/web/features/settings/components/CloudSettingsSync.tsx` | Syncs font and size to the account when signed in |
| config | self-hosted dyslexic font | `apps/web/public/fonts/opendyslexic` | Font files for Dyslexic friendly |
| config | mobile type scale | `apps/mobile/src/ui/theme/tokens.ts` | typeScale, text scale limits, codeFontChoices |
| component | mobile Text | `apps/mobile/components/ui/Text.tsx` | Variants default, heading, subheading, caption, mono; scale and font contexts |
| component | TextScaleBoundary | `apps/mobile/src/shared/components/TextScaleBoundary.tsx` | Provides OS fontScale to Text |
| screen | mobile code settings | `apps/mobile/src/features/settings/code/index.tsx` | Code font and Transcript font rows |
| config | mobile fonts | `apps/mobile/tailwind.config.js` | Font families (:31-33) |
| component | VS Code type tokens | `apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts` | Sizes from --vscode-font-size with 12px floor (:227-246) |
| config | Chrome side panel type tokens | `apps/extension/src/side_panel.css` | --type-* roles and code family (:44-62) |
| component | CLI markdown renderer | `apps/cli/src/tui/markdown_renderer.rs` | Heading and code styles for terminal output (:209-222) |
| test | theme-contrast test | `apps/web/shared/components/__tests__/theme-contrast.test.ts` | Checks font stacks match the token module and caption contrast |
| test | mobile accessibility coverage test | `apps/mobile/src/ui/theme/__tests__/accessibilityPreferenceCoverage.test.ts` | Type size is not derived from window width (:107-118) |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person picks Chat font or Chat text size; the store value changes. | device | apps/web/features/settings/sections/AppearanceSection.tsx:197,219; web-settings-store.ts:141,143 |
| AppearancePreferences sets data-chat-font and data-chat-text-size on the html element; CSS rules restyle .prose and code blocks. | device | AppearancePreferences.tsx:15-20,42-46; globals.css:932-975 |
| When signed in, the values sync to the account. | our servers | CloudSettingsSync.tsx:73-75; apps/web/app/api/settings/preferences/route.ts:253 |
| Mobile reads the OS font scale and passes it through TextScaleContext. | device | apps/mobile/src/shared/components/TextScaleBoundary.tsx:5-8 |
| VS Code derives sizes from host CSS variables at render time. | device | apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:233-244 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| chatFont and chatTextSize | Browser localStorage and, when signed in, public.user_settings | Yes when signed in | Local copy until browser data cleared; account copy retention unknown |
| Mobile code font and transcript font | On device (store in apps/mobile/src/features/settings/code/store.ts) | Not found | Unknown |

**Models and providers.** No model or provider takes part.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | None needed; syncing on web needs sign-in. |
| Permissions | none found in the code |
| Subscription | none found in the code |
| Limits and metering | none found in the code |
| Feature flags | none found in the code |
| Model compatibility | Not model dependent. |
| Provider restrictions | none found in the code |
| Local mode | Works on device with no sign-in or payment; the font files are shipped with the app (web next/font and public/fonts). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Font file missing or blocked | Stacks fall through to system faces then emoji faces; Dyslexic is self-hosted because a CDN font used to be blocked by the policy | chat.css:28-42; globals.css:940-947 comment |
| Default text size | No attribute is set so base rules apply | AppearancePreferences.tsx:15 |
| Chat font on code | Code, pre, kbd and samp pinned to monospace | globals.css:961-963 |
| Very large OS text on mobile | Header scale capped at 2; settings rows capped at 1.9; stacked rows at 1.5 | apps/mobile/src/ui/theme/tokens.ts (HEADER_TEXT_SCALE_LIMIT, ROW_LABEL_TEXT_SCALE_LIMIT, STACKED_ROW_TEXT_SCALE) |
| Phone input focus (web) | Inputs forced to at least 16px on touch screens to avoid page zoom | apps/web/app/globals.css:1086-1090 |
| Loading, error, offline | not handled in the code beyond the shared sync notice | none found beyond apps/web/features/settings/components/SettingsPreferenceRow.tsx:8-26 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/shared/components/__tests__/theme-contrast.test.ts`: Font stacks kept in step with the token module; caption and label contrast
- `apps/web/features/settings/sections/AppearanceSection.test.tsx`: Appearance page lists its controls; titles read, detail of font tests not read
- `apps/mobile/src/ui/theme/__tests__/accessibilityPreferenceCoverage.test.ts`: Type size not derived from window width
- `apps/mobile/__tests__/mobile-shell-chrome.test.ts`: Cited by the brief for the caption floor; contents not read

**Test scenarios**

- **Serif chat font**
  1. Settings > Appearance > Chat font > Serif
  2. Open a chat with a code block
  - Expected: Prose is serif, code stays monospace
- **Large text**
  1. Chat text size > Large
  2. Inspect prose and code block font size
  - Expected: Prose 17px, code 14.5px
- **Caption floor**
  1. Search computed styles for text under 12px on web and Chrome side panel
  - Expected: None found
- **Mobile OS scale**
  1. Set phone text size to largest
  2. Open Settings and a chat
  - Expected: Text grows; header and rows stay within their caps
- **VS Code font follow**
  1. Change editor font size
  2. Reopen the sidebar
  - Expected: Body and code text change; small text stays 12px or larger

**Where to look when it fails**

- Check html attributes data-chat-font and data-chat-text-size.
- Network panel for blocked font requests.
- Mobile: Text scale value in TextScaleContext.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/006-visual-foundations-and-spacing-conventions.md](../../70-qa/test-plans/web/006-visual-foundations-and-spacing-conventions.md)
- Desktop: [70-qa/test-plans/desktop/006-visual-foundations-and-spacing-conventions.md](../../70-qa/test-plans/desktop/006-visual-foundations-and-spacing-conventions.md)
- Mobile: [70-qa/test-plans/mobile/006-visual-foundations-and-spacing-conventions.md](../../70-qa/test-plans/mobile/006-visual-foundations-and-spacing-conventions.md)
- CLI: [70-qa/test-plans/cli/006-visual-foundations-and-spacing-conventions.md](../../70-qa/test-plans/cli/006-visual-foundations-and-spacing-conventions.md)
- VS Code: [70-qa/test-plans/vscode/006-visual-foundations-and-spacing-conventions.md](../../70-qa/test-plans/vscode/006-visual-foundations-and-spacing-conventions.md)
- Chrome: [70-qa/test-plans/chrome/006-visual-foundations-and-spacing-conventions.md](../../70-qa/test-plans/chrome/006-visual-foundations-and-spacing-conventions.md)

## 10. Gaps and dependencies

- **No in-app text-size or chat font control on mobile, VS Code, Chrome or CLI** Affects: Those four apps. Evidence: Only AppearanceSection.tsx (web) has the controls; mobile follows OS (TextScaleBoundary.tsx). Work needed: Decide if parity is required (doc: docs/product/requirements.md lists them for web Appearance) and add or record the difference
- **Chat heading 3 size is a literal** Affects: Web, desktop. Evidence: chat.css --chat-type-heading-3-size 1.0625rem. Work needed: Use the h3 token
- **Chrome side panel sets sizes at 14px in its own stylesheet instead of the shared type tokens** Affects: Chrome. Evidence: apps/extension/src/side_panel.css:44-62. Work needed: Consume the shared roles or document the reason

**Depends on**

- SYS-shared-ui-and-design
- SYS-sync-and-continuity
- surface:web
- surface:desktop
- surface:mobile
- surface:vscode
- surface:chrome
- surface:cli
- mode:local
- F006-01

## Unknown

- Which mobile menu row opens the code settings screen holding Code font and Transcript font.
- Whether CLI sets any heading size other than bold and colour (not a font size in a terminal).
- Whether the web Chat text size reaches every .prose body, including artifacts; the CSS comment says it does but I did not test.
- Chrome and VS Code font family declaration lines the brief cites (side_panel.ts:1063, webviewContent.ts:135) did not match what I read; I did not locate their current lines.
- Whether Mobile text.tsx caption variant (text-sm) maps to 14 exactly: I did not open the Tailwind scale.

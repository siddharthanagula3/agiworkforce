---
id: "F101-07"
type: "feature"
title: "Design tokens, UI primitives, text and Markdown"
aliases: ["Shared design tokens", "@agiworkforce/design-tokens", "@agiworkforce/ui primitives", "Shared localisation catalogue", "@agiworkforce/i18n", "Mobile primitive layer (Text, Button, PressableBox)", "check:css-tokens", "check:mobile-primitives", "Shared Markdown helpers (unified-chat, markdown-source)", "S101.28 to S101.33"]
area: "101 Shared package boundaries"
available_on: []
implementation: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S101.28", "S101.29", "S101.30", "S101.31", "S101.32", "S101.33"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:vscode", "surface:chrome", "file:packages/ui/design-tokens/src/index.ts", "file:packages/ui/i18n/src/index.ts", "file:scripts/check-css-tokens.mjs", "SYS-shared-ui-and-design", "SYS-security-and-privacy", "mode:local"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F101-07 Design tokens, UI primitives, text and Markdown

One package owns colours, radii, type and motion values for every screen. A shared web component library, a shared string catalogue and a mobile primitive layer sit on top. Each surface renders Markdown itself with some shared helpers. Guards fail the build when a screen uses an unknown token or a raw mobile control.

Area: [101. Shared package boundaries](README.md). Requirement items: [S101.28](../../10-requirements/capabilities/101-shared-package-boundaries.md#s10128), [S101.29](../../10-requirements/capabilities/101-shared-package-boundaries.md#s10129), [S101.30](../../10-requirements/capabilities/101-shared-package-boundaries.md#s10130), [S101.31](../../10-requirements/capabilities/101-shared-package-boundaries.md#s10131), [S101.32](../../10-requirements/capabilities/101-shared-package-boundaries.md#s10132), [S101.33](../../10-requirements/capabilities/101-shared-package-boundaries.md#s10133).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | does not apply | does not apply | n/a |
| Desktop | does not apply | does not apply | n/a |
| Mobile | does not apply | does not apply | n/a |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Gives the six apps one source for visual values (colour, corner radius, type, motion), one catalogue of translated strings, a shared web component library for Web and Desktop, a native component layer for Mobile, and shared Markdown helper code (fence classification, math and task-list plugins, source normalisation) that each surface plugs into its own renderer. Guards in scripts/ enforce the rules (packages/ui/design-tokens/package.json; packages/ui/ui/package.json; packages/ui/i18n/package.json; scripts/check-css-tokens.mjs; scripts/check-mobile-primitives.mjs).

**Why it exists.** The product competes with Claude and ChatGPT, so chat must look and read the same on every app. A private copy of a colour or string drifts. The design-tokens package describes itself as 'the only sanctioned source of color, spacing and type values' (packages/ui/design-tokens/package.json:4). AGENTS.md section 4 forbids hardcoding design values (doc: AGENTS.md).

**Who uses it.** Engineers who build screens on any app; testers who compare a screen with the design; people using the apps, who see consistent text, colour and corners.

**Problems it solves**

- Colour or radius drift between Web, Chrome side panel, VS Code panel and Mobile.
- A stylesheet referring to a custom property nobody defined, which leaves the element unstyled (scripts/check-css-tokens.mjs).
- Mobile touch targets built from raw platform controls that skip theme, type scale and accessibility role (scripts/check-mobile-primitives.mjs:3-8).
- Translated strings that exist in one language but not in another (scripts/check-i18n-parity.mjs).

**Use cases**

- An engineer changes a brand colour once in packages/ui/design-tokens and Web, Chrome, VS Code and Mobile pick it up.
- A tester opens a Markdown answer in the Chrome side panel and in the VS Code panel and checks that code fences, task lists and math render the same way.
- A person switches the app language on Mobile and every screen reads in that language.
- An engineer adds a Mobile button and must use the Button or PressableBox primitive or the guard fails.

## 2. User experience

**Where to find it**

- No single screen. It shows in every screen of every app.
- Mobile language choice: screen file apps/mobile/src/features/settings/general/AppLanguageScreen.tsx (visible label unknown; not opened).
- Mobile theme and accent choices: apps/mobile/__tests__/ThemePrefs.test.tsx and AccentSwatches.test.ts exist; the visible labels were not read, so unknown.
- CLI: none of these (Rust terminal app; brief says none).

**Before you start**

- None for the person. For an engineer: run pnpm check:css-tokens, pnpm check:mobile-primitives and pnpm check:i18n-parity (package.json:145,175,424).

**Screens and controls**

- Web and Desktop (hosted web): components from @agiworkforce/ui, for example Button, Dialog, Sheet, Switch, Tabs, Tooltip, ConfirmAction (packages/ui/ui/src/primitives/).
- Mobile: Text, Button, PressableBox, Card, Input, Switch, Badge, Skeleton, Separator (apps/mobile/components/ui/).
- Chrome side panel and options page: its own DOM helpers plus tokens from getExtensionTokensCss (apps/extension/src/tokens.ts:1-30; apps/extension/src/features/side-panel/dom.ts).
- VS Code panel: its own HTML built in webviewContent.ts, with agiVsCodeCssVars as the fallback behind host theme variables (apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:191).

**Journey**

1. 1. A person opens an app. The app loads its stylesheet or token map from the design-token package.
2. 2. Screens draw from shared primitives (Web, Desktop, Mobile) or from the surface's own controls (Chrome, VS Code).
3. 3. Text comes from the shared catalogue through i18next (Web, Desktop, Mobile), through the shared VS Code catalogue (VS Code), or through the browser extension message file (Chrome).
4. 4. An assistant answer is turned into the surface's own display by that surface's Markdown renderer.
5. 5. For an engineer: the guards run in the guard chain and fail on a broken token, raw control or missing translation (package.json:397).

**What the person sees and gets**

- Visual: the same colours, corner radii and type scale on each surface.
- Engineer: guard output, for example 'CSS token check FAILED' or 'Mobile primitive check failed' with a file and line (scripts/check-css-tokens.mjs; scripts/check-mobile-primitives.mjs:75-96).

**Settings**

- Mobile app language and theme preferences (apps/mobile/src/i18n/index.ts:13-14 storage key agiworkforce-language; apps/mobile/src/ui/theme/tokens.ts accent and high-contrast sets).
- Desktop and Web language is remembered in browser storage under the key agiworkforce-language (apps/desktop/src/i18n/index.ts:21-25).
- VS Code language follows the editor display language (apps/extension-vscode/src/l10n/index.ts:resolveLocale; fallback to English).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- The design-token package exports TypeScript maps and three stylesheets (chat, foundation, tailwind) (packages/ui/design-tokens/package.json:8-13). It exports palette, radii, motion, typography, mobile colours, extension and VS Code variable maps and a cssVarsToString helper (packages/ui/design-tokens/src/index.ts:155,326,427,465,714,971,1074,1107).
- Mobile takes its colour sets from the package (agiMobileColors, high-contrast sets, accent swatches, radii) rather than keeping its own palette (apps/mobile/src/ui/theme/tokens.ts:1-12), and its Tailwind config reads the brand scale and radii from the package (apps/mobile/tailwind.config.js:1). This is newer than the brief, which says mobile keeps its own palette.
- Chrome builds its CSS variables from agiExtensionCssVars (apps/extension/src/tokens.ts:1); VS Code uses agiVsCodeCssVars as the fallback behind host variables (apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:191). All five GUI apps list @agiworkforce/design-tokens as a dependency (apps/web/package.json:37; apps/desktop/package.json:68; apps/mobile/package.json:64; apps/extension/package.json:47; apps/extension-vscode/package.json:1591).
- check:css-tokens reads four surfaces (desktop, web, chrome, vscode), checks every var() reference resolves to a declared token, bans raw z-index in portal overlays, bans literal colour fallbacks in web token references, flags unused web theme colours, and checks the radius and motion ladders map to the corner and duration tokens (scripts/check-css-tokens.mjs:9-47,171-445).
- The shared web library @agiworkforce/ui has about 45 primitives (Button, Dialog, Select, Sheet, Tabs, Tooltip, ConfirmAction and more) and is a dependency of Web and Desktop only (packages/ui/ui/src/primitives/; apps/web/package.json:55; apps/desktop/package.json:80).
- The mobile primitive layer exists in apps/mobile/components/ui (Text, Button, PressableBox, Card, Input, Switch, Badge, Skeleton, Separator, and others). The guard scans every .tsx under apps/mobile outside that folder for raw Text, Pressable or Touchable imports from react-native (scripts/check-mobile-primitives.mjs:17-60).
- The baseline of raw-control modules holds 9 entries today (scripts/config/mobile-primitives-baseline.json), counted by reading the file. The brief says 10; the file is the newer source. The baseline can only shrink: a new offender or a stale entry fails the guard (scripts/check-mobile-primitives.mjs:84-107).
- One string catalogue package serves Web, Desktop and Mobile through i18next with 12 locales (ar, de, en, es, fr, hi, it, ja, ko, pt, ru, zh) and namespaces (auth, chat, common, errors, models, pricing, settings, v3, vscode) (packages/ui/i18n/locales/; apps/desktop/src/i18n/index.ts:1-8; apps/mobile/src/i18n/index.ts:13-20). check:i18n-parity compares every locale with English, including plural forms (scripts/check-i18n-parity.mjs:1-60).
- VS Code now loads its messages through the shared package: it imports VSCODE_CATALOGS from @agiworkforce/i18n/vscode, which reads each locale's vscode.json (apps/extension-vscode/src/l10n/index.ts:3; packages/ui/i18n/src/vscode.ts:1-30). The brief says VS Code keeps its own locale files; the code shows the files live in the shared package.
- Shared Markdown helpers exist: markdown-it plugins for math and task lists, fence classification, citation markers and highlight-language resolution in @agiworkforce/unified-chat, and normalizeMarkdownSource in @agiworkforce/utils. Chrome and VS Code both import them (apps/extension/src/features/side-panel/markdown.ts:3-18; apps/extension-vscode/src/webview/render.ts:1-13). Mobile imports the same unified-chat helpers into its own renderer (apps/mobile/src/features/chat/components/MessageContentRenderer.tsx:1-40).

**Incomplete**

- @agiworkforce/ui is not used by Chrome or VS Code, which build their own controls (apps/extension/package.json and apps/extension-vscode/package.json list no @agiworkforce/ui dependency; brief S101.30).
- Chrome does not use the shared catalogue. Its strings come from the browser extension message file, read through chrome.i18n (apps/extension/src/i18n.ts:1-20).
- Markdown rendering is not one implementation. Web uses MarkdownContent in unified-chat, Chrome and VS Code use markdown-it with their own wiring and sanitiser setup, and Mobile uses its own block and inline renderer (packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx; apps/extension/src/features/side-panel/markdown.ts; apps/extension-vscode/src/webview/render.ts; apps/mobile/src/features/chat/components/MessageContentRenderer.tsx). The brief marks S101.32 done; shared helpers exist but rendering is per surface.
- Nine Mobile modules still import raw Text, Pressable or Touchable controls (scripts/config/mobile-primitives-baseline.json). The guard comment says some also draw raw Text, alias the import or pass Pressable as a value (brief S101.31 unfinished note).
- Mobile is not read by check:css-tokens (the guard lists four surfaces, scripts/check-css-tokens.mjs:11-47). Mobile colour discipline uses a separate guard, check:no-hex-mobile (package.json:397; scripts/check-no-hex-colors-mobile.mjs), which was not read in full.

**Present but disconnected or switched off**

- Mobile language selection is switched by a feature flag: getDeviceLanguage returns the default language when FEATURES.appLanguage is off (apps/mobile/src/i18n/index.ts:28-30). The flag value was not established.

**Not available**

- CLI: no design tokens, shared primitives or shared catalogue (Rust terminal app; brief).
- Chrome: no shared string catalogue and no shared primitives.
- Per-surface renderer declaration (S101.33): the brief marks it not applicable; no code was found that declares which block kinds each renderer supports (not searched exhaustively, so treat as unknown).

## 4. Required behaviour

**Established requirements**

- Every GUI surface takes colours, radii and type from one shared token package. (source: S101.29)
- Every web-rendered surface builds UI from one shared primitive library. (source: S101.30)
- Each native surface has its own primitive layer that screens use instead of raw platform controls. (source: S101.31)
- Every UI surface draws its strings from one shared localisation catalogue. (source: S101.28)
- Markdown and content transformations run through one shared implementation on every surface. (source: S101.32)
- Each surface has a renderer for the shared content model that declares which block kinds it renders and degrades the rest (brief status: not applicable). (source: S101.33)
- No hardcoded design values; design values belong to the token package. (source: doc: AGENTS.md section 4)
- One design system; do not invent stacks. (source: doc: AGENTS.md section 10)

**Acceptance criteria**

1. pnpm check:css-tokens passes: every var(--x) in Web, Desktop renderer, Chrome and VS Code sources resolves to a declared token.
2. pnpm check:mobile-primitives passes, and the baseline file has no entry for a module that no longer imports a raw control.
3. pnpm check:i18n-parity passes: every locale has the same keys as English.
4. A new Mobile screen imports Text, Button or PressableBox from apps/mobile/components/ui and the guard stays green.
5. A fenced code block, a task list and a math expression render in the Chrome side panel and the VS Code panel with the same classification (shared assistant-fence helper).
6. Changing a colour value in packages/ui/design-tokens changes Web, Chrome, VS Code and Mobile output with no per-app edit.
7. Switching the VS Code display language to a supported locale shows translated strings; an unsupported locale falls back to English.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- [inferred] Because Desktop is the hosted web app, a token or primitive change reaches the Desktop window only through Web, although the Tauri renderer in apps/desktop/src is also scanned by the token guard.
- [inferred] Chrome and VS Code have no shared string catalogue requirement yet met for Chrome; the brief lists Chrome as using neither.

**Proposed improvements** (suggestions, not requirements)

- [proposed] Move Chrome strings onto the shared catalogue, or record in the guard why browser-extension message files are the exception.
- [proposed] Add Mobile to check:css-tokens or document that check:no-hex-mobile is its equivalent.
- [proposed] Declare for each surface which Markdown block kinds it renders and what it shows for the rest, and test it.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | @agiworkforce/design-tokens | `packages/ui/design-tokens/src/index.ts` | Palette, radii, motion, typography, mobile colours, extension and VS Code variable maps. |
| config | Token stylesheets | `packages/ui/design-tokens/src/foundation.css` | Primitive hue and corner/duration tokens; chat.css and tailwind.css sit beside it. |
| component | @agiworkforce/ui primitives | `packages/ui/ui/src/primitives/index.ts` | Shared web building blocks (Button, Dialog, Sheet, Select and more) for Web and Desktop. |
| component | Mobile primitive layer | `apps/mobile/components/ui/PressableBox.tsx` | Wraps Pressable with pressed state; Text, Button and others sit in the same folder. |
| config | Mobile tokens | `apps/mobile/src/ui/theme/tokens.ts` | Re-exports package colours, accents and high-contrast sets for Mobile. |
| config | Mobile Tailwind config | `apps/mobile/tailwind.config.js` | Reads brand scale and radii from the token package. |
| config | Chrome tokens | `apps/extension/src/tokens.ts` | Builds CSS variable text from agiExtensionCssVars. |
| component | VS Code webview content | `apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts` | Panel HTML and CSS; injects agiVsCodeCssVars as fallback. |
| service | @agiworkforce/i18n | `packages/ui/i18n/src/index.ts` | Languages, namespaces, resources and base i18next options. |
| config | Locale files | `packages/ui/i18n/locales/en/common.json` | English reference catalogue; 11 other locales sit beside it. |
| service | VS Code catalogues | `packages/ui/i18n/src/vscode.ts` | Imports each locale's vscode.json and exports VSCODE_CATALOGS. |
| service | VS Code l10n | `apps/extension-vscode/src/l10n/index.ts` | Resolves the locale from the editor language and fills message templates. |
| service | Desktop i18n init | `apps/desktop/src/i18n/index.ts` | i18next setup using the shared options, with language detection. |
| service | Mobile i18n init | `apps/mobile/src/i18n/index.ts` | i18next setup, device language, RTL handling and a stored language choice. |
| service | Chrome i18n | `apps/extension/src/i18n.ts` | Reads messages through chrome.i18n from the extension message file. |
| component | Web Markdown component | `packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx` | Web Markdown renderer built on shared helpers. |
| component | Chrome Markdown renderer | `apps/extension/src/features/side-panel/markdown.ts` | markdown-it plus DOMPurify rendering for the side panel. |
| component | VS Code Markdown renderer | `apps/extension-vscode/src/webview/render.ts` | markdown-it rendering for the panel with shared math, task-list and fence helpers. |
| component | Mobile message renderer | `apps/mobile/src/features/chat/components/MessageContentRenderer.tsx` | Native Markdown block renderer using shared unified-chat helpers. |
| service | markdown-source helper | `packages/platform/utils/src/markdownSource.ts` | normalizeMarkdownSource and fence-source helper shared by Chrome and VS Code. |
| command | check:css-tokens | `scripts/check-css-tokens.mjs` | Token resolvability, z-index, ladder and unused-colour guard. |
| command | check:mobile-primitives | `scripts/check-mobile-primitives.mjs` | Raw react-native control guard with shrink-only baseline. |
| config | Mobile primitives baseline | `scripts/config/mobile-primitives-baseline.json` | The nine modules still importing raw controls. |
| command | check:i18n-parity | `scripts/check-i18n-parity.mjs` | Compares every locale with English, including plural forms. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| At build time each surface imports tokens: Web and Desktop load the three stylesheets and Tailwind theme; Mobile imports TypeScript colour maps; Chrome and VS Code turn token maps into CSS variable text with cssVarsToString. | device | packages/ui/design-tokens/src/index.ts:1107; apps/extension/src/tokens.ts:1-30; apps/mobile/src/ui/theme/tokens.ts:1-12 |
| At runtime a screen draws with primitives. Mobile Text and PressableBox come from apps/mobile/components/ui; Web and Desktop use @agiworkforce/ui. | device | apps/mobile/components/ui/PressableBox.tsx; packages/ui/ui/package.json:11-30 |
| i18next on Web, Desktop and Mobile resolves strings from bundled resources for the stored or detected language; VS Code picks a catalogue from the editor language; Chrome calls chrome.i18n. | device | apps/desktop/src/i18n/index.ts:14-25; apps/mobile/src/i18n/index.ts:13-30; apps/extension-vscode/src/l10n/index.ts; apps/extension/src/i18n.ts:9-11 |
| An assistant answer arrives as text from the model or Cloud route. Each surface runs its own Markdown pipeline on the device to draw it. | device | apps/extension/src/features/side-panel/markdown.ts:1-30; apps/extension-vscode/src/webview/render.ts:218 |
| In CI and locally, guard scripts read the working tree and fail on violations. | device | scripts/check-css-tokens.mjs:76-95; package.json:397 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Chosen app language | Browser local storage under agiworkforce-language on Desktop and Web renderer; mobile key storage (MMKV) for Mobile | not found in the code for these files; unknown whether synced | Stays until the person clears site data or the app data (apps/desktop/src/i18n/index.ts:22-25; apps/mobile/src/i18n/index.ts:4,13) |
| Theme and accent preference on Mobile | Mobile device store (exact store not opened) | unknown | unknown |

**Models and providers.** None. Tokens, primitives, strings and Markdown rendering do not call a model or provider. The text they draw comes from a model in Local, own-key or Cloud mode, but this feature does not choose it. Model names shown in the interface come from the catalogue (doc: AGENTS.md section 4).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | none found in the code. The tokens, primitives and catalogue need no sign-in. |
| Permissions | none found in the code. |
| Subscription | none found in the code. No plan or entitlement check appears in the token, primitive, catalogue or Markdown helper packages (packages/ui/design-tokens, packages/ui/i18n). |
| Limits and metering | none found in the code. |
| Feature flags | Mobile app language is behind FEATURES.appLanguage (apps/mobile/src/i18n/index.ts:28-30). No flag found for tokens or primitives. |
| Model compatibility | Not model dependent. Markdown renders any text a model returns. |
| Provider restrictions | none found in the code. |
| Local mode | Fully available in Local mode on every app: all rendering, tokens and strings run on the device and need no payment or server call [inferred from the packages having no network code; packages/ui/design-tokens/src/index.ts is pure data and functions]. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Unsupported language | VS Code falls back to English (apps/extension-vscode/src/l10n/index.ts resolveLocale). Web and Desktop use i18next fallbackLng English (packages/ui/i18n/src/index.ts baseInitOptions). | packages/ui/i18n/src/index.ts; apps/extension-vscode/src/l10n/index.ts |
| Right-to-left languages | Desktop sets document direction from the language; Mobile enables RTL swap. | apps/desktop/src/i18n/index.ts:30-37; apps/mobile/src/i18n/index.ts:22-23 |
| Missing translation key | Desktop swallows missing keys with an empty handler; check:i18n-parity is meant to prevent them. | apps/desktop/src/i18n/index.ts:20; scripts/check-i18n-parity.mjs |
| Light, dark, high-contrast | Mobile picks colour set from mode, system scheme and a high-contrast switch; Chrome serves light and dark maps, including an automatic prefers-color-scheme variant. | apps/mobile/src/ui/theme/tokens.ts:36-45; apps/extension/src/tokens.ts:23-35 |
| Host theme in VS Code | Host --vscode- variables are used first; the package map is the fallback; a test forbids mixing host and fixed colours in one rule. | apps/extension-vscode/src/__tests__/panelPaletteConsistency.test.ts:1-40 |
| Reduced motion | Chrome loading mark disables its animation under prefers-reduced-motion. Other surfaces: not checked. | apps/extension/src/tokens.ts:3-9 |
| Offline, retry, cancel, timeout | not handled in the code (nothing here makes network calls). | packages/ui/design-tokens/src/index.ts |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `scripts/check-mobile-primitives.test.mjs`: The raw-primitive guard (script test run by pnpm check:mobile-primitives).
- `scripts/check-i18n-parity.test.mjs`: The locale parity guard.
- `apps/web/shared/components/__tests__/theme-contrast.test.ts`: Brand scale mirror in the token package equals foundation.css, both directions, plus contrast (doc comment at packages/ui/design-tokens/src/index.ts:78-90).
- `apps/extension-vscode/src/__tests__/panelPaletteConsistency.test.ts`: VS Code panel never mixes host and fixed colours in one rule.
- `apps/extension-vscode/src/__tests__/l10n.test.ts`: VS Code message lookup (file exists; contents not read).
- `apps/extension/__tests__/i18n.test.ts`: Chrome message lookup (file exists; contents not read).
- `apps/mobile/__tests__/mobile-i18n.test.ts`: Mobile i18n setup (file exists; contents not read).
- `apps/mobile/__tests__/AccentSwatches.test.ts`: Mobile accent swatches (file exists; contents not read).
- `apps/extension/__tests__/side-panel-markdown-parity.test.ts`: Chrome side-panel Markdown parity (file exists; contents not read); sibling tests sidePanelMarkdown, side-panel-markdown-fence, answer-markdown.
- `packages/ui/unified-chat/src/components/markdown/MarkdownContent.render.test.tsx`: Web Markdown rendering (file exists; contents not read).
- `apps/mobile/src/features/chat/components/__tests__/MessageContentRenderer.richMarkdown.test.tsx`: Mobile rich Markdown rendering (file exists; contents not read).
- `packages/ui/ui/src/primitives/__tests__/Button.test.tsx`: Shared Button primitive; sibling tests exist for Dialog, Sheet, Select-like primitives.
- `apps/extension-vscode/src/__tests__/pathLinkRendering.webview.test.ts`: VS Code webview link rendering.

**Test scenarios**

- **Token guard catches an unknown variable**
  1. Add var(--no-such-token) to a Web component in a scratch branch.
  2. Run pnpm check:css-tokens.
  - Expected: The guard fails and names the file, line and the missing token.
- **Mobile raw control rejected**
  1. In a scratch branch, import Pressable from react-native in a new Mobile .tsx screen.
  2. Run pnpm check:mobile-primitives.
  - Expected: Failure message tells you to use Text, Button or PressableBox from apps/mobile/components/ui/.
- **Baseline shrinks**
  1. Move one baseline module onto PressableBox.
  2. Run the guard without editing the baseline file.
  - Expected: The guard fails until the entry is deleted from the baseline (list only shrinks).
- **Same answer, three surfaces**
  1. Send a prompt that returns a fenced code block, a task list and a math line.
  2. View the answer in Web, the Chrome side panel and the VS Code panel.
  - Expected: Fence type, task checkboxes and math all show on each surface; differences are limited to surface styling.
- **Language switch**
  1. On Mobile, open the language setting and pick a non-English language.
  2. Revisit chat and settings screens.
  - Expected: Strings change; right-to-left languages mirror layout.
- **Missing translation**
  1. Delete one key from a non-English common.json.
  2. Run pnpm check:i18n-parity.
  - Expected: The guard fails and names the locale and key.

**Where to look when it fails**

- Guard output lines beginning 'CSS token check FAILED', 'Mobile primitive check failed' and 'check-i18n-parity'.
- Mobile: the stored language key agiworkforce-language and FEATURES.appLanguage.
- Chrome: a blank string usually means the key is missing from the message file (chrome.i18n.getMessage returns an empty string; apps/extension/src/i18n.ts:9-11).
- No test results were found recorded in files; nothing is claimed as passing.

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **Chrome and VS Code do not use the shared primitive library, and Chrome does not use the shared catalogue.** Affects: Chrome and VS Code users and engineers. Evidence: apps/extension/package.json and apps/extension-vscode/package.json have no @agiworkforce/ui; apps/extension/src/i18n.ts reads chrome.i18n. Work needed: Decide whether the extensions adopt shared primitives or the brief records them as exceptions; move or mirror Chrome strings.
- **Nine Mobile modules still import raw Text or touchable controls.** Affects: Mobile. Evidence: scripts/config/mobile-primitives-baseline.json. Work needed: Move each module onto the primitives, with a visual check where the Text primitive adds NativeWind classes (brief S101.31).
- **Markdown rendering is one shared helper set but three to four separate renderers; the brief marks it done.** Affects: Web, Chrome, VS Code, Mobile. Evidence: apps/extension/src/features/side-panel/markdown.ts; apps/extension-vscode/src/webview/render.ts; apps/mobile/src/features/chat/components/MessageContentRenderer.tsx. Work needed: Agree what 'one shared implementation' means, then test the same fixtures against each renderer.
- **Mobile is outside check:css-tokens.** Affects: Mobile. Evidence: scripts/check-css-tokens.mjs:11-47 lists desktop, web, chrome, vscode. Work needed: Confirm check:no-hex-mobile covers the same risk, or extend the guard.
- **No declaration of which block kinds each renderer supports (S101.33 marked not applicable).** Affects: All renderers. Evidence: brief S101.33; no declaration file found. Work needed: Add a per-surface block-kind table and a guard, or confirm the existing content-block guard covers it (scripts/check-content-blocks.mjs, not read).
- **The brief text is behind the code in three places: Mobile colours, VS Code catalogue and the baseline count (10 vs 9).** Affects: Anyone relying on the brief. Evidence: apps/mobile/src/ui/theme/tokens.ts:1-12; apps/extension-vscode/src/l10n/index.ts:3; scripts/config/mobile-primitives-baseline.json. Work needed: Update the brief rows to match the code.

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:vscode
- surface:chrome
- file:packages/ui/design-tokens/src/index.ts
- file:packages/ui/i18n/src/index.ts
- file:scripts/check-css-tokens.mjs
- SYS-shared-ui-and-design
- SYS-security-and-privacy
- mode:local

## Unknown

- Whether the web app's i18n init (imported by apps/web/app/Providers.tsx) reads the shared package; only the package dependency and the Providers import were seen.
- Value of FEATURES.appLanguage on Mobile.
- Whether language and theme choices sync across devices.
- Visible labels of the Mobile language and theme settings.
- Whether the VS Code webview shows any per-surface block-kind degrade message.
- Contents of the listed tests that were only located, not read.
- Whether check:no-hex-mobile covers the same ground as check:css-tokens for Mobile.

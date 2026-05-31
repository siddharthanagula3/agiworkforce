# Source-Based Frontend Reference Comparison and Recommended Plan

Date: 2026-05-15

Repo: `/Users/siddhartha/Desktop/agiworkforce`

Reference set: `/Users/siddhartha/Desktop/reference/ui`

## Scope

This report compares the six AGI Workforce frontend surfaces against the verified local reference UI images, using source code as the primary evidence.

The earlier live screenshot captures are intentionally ignored. The local reference image set was previously verified: 219 images checked, 0 decode failures, 0 wrong-screen captures.

This report is not a pixel-perfect visual QA result. It is a source-level product/frontend audit intended to answer:

1. Which AGI surfaces already match the reference products structurally.
2. Where the surfaces diverge in implementation, tokens, interaction patterns, and platform conventions.
3. What the best technical plan is for making the frontend coherent across all six surfaces.

Review frame:

- Local reference images in `~/Desktop/reference/ui`.
- Source code in the six app surfaces.
- Vercel Web Interface Guidelines, fetched from `https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md`, used as a review rubric for accessibility, focus states, animation, typography, theming, and interaction quality.

## Executive Recommendation

The best path is not to redesign all six surfaces independently.

Use `packages/unified-chat` as the canonical chat UX for React DOM surfaces, especially desktop and web. Then define a shared cross-platform chat contract and token system that mobile, Chrome extension, VS Code extension, and CLI can adapt natively.

In practical terms:

1. Keep platform shells native.
2. Share product taxonomy, model-picker taxonomy, composer capabilities, attachment/tool menus, token names, icon rules, and accessibility rules.
3. Reuse actual React DOM components only where that is technically natural: desktop and web.
4. Do not force React DOM into mobile, CLI, or VS Code. Those should implement the same contract in platform-native UI.

My recommended brand direction:

- Use the desktop/shared chat language as the base: neutral/warm surfaces, restrained contrast, teal primary action/accent, terra-cotta as a secondary or warning/accent.
- Retire the Chrome purple/indigo language as a primary identity.
- Reduce the web marketing amber/near-black treatment so it does not feel like a separate product.
- Keep the AI chat surfaces quiet, dense, and operational. The references are utilitarian tools, not landing pages.

## Surfaces Reviewed

| Surface           | Primary source                           | Closest reference groups                                                            | Current fit                                |
| ----------------- | ---------------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------ |
| Desktop app       | `apps/desktop`, `packages/unified-chat`  | `claude/claude-desktop`, `chatgpt-desktop`, `codex-desktop`, Claude artifacts/tools | High                                       |
| Web app           | `apps/web/features/chat`, `apps/web/app` | Claude web chat/artifacts, ChatGPT desktop, Gemini, Perplexity                      | Medium-low                                 |
| Mobile app        | `apps/mobile`                            | No exact mobile baseline; compared to desktop/web chat patterns                     | Medium-high as adaptation                  |
| Chrome extension  | `apps/extension`                         | `claude/claude-chrome-extension`, `perplexity/perplexity-comet-browser-assistant`   | Medium for features, low-medium for polish |
| VS Code extension | `apps/extension-vscode`                  | `claude/claude-vscode-extension`                                                    | Medium-low                                 |
| CLI/TUI           | `apps/cli`                               | `codex-cli`, `claude-code`, `gemini-cli`                                            | High                                       |

## Architecture Map

| Surface           | Rendering stack                                | Shared chat reuse                                                             | Main technical issue                                        |
| ----------------- | ---------------------------------------------- | ----------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Desktop           | Tauri + React/Vite                             | Uses `@agiworkforce/unified-chat`                                             | Good base, host settings still separate                     |
| Web               | Next.js + React                                | Depends on `@agiworkforce/unified-chat`, but `/chat` uses separate components | Duplication and visual drift                                |
| Mobile            | Expo React Native                              | Does not reuse DOM components                                                 | Needs shared taxonomy/token adapter                         |
| Chrome extension  | MV3 side panel/in-page DOM built by TypeScript | No shared UI reuse                                                            | Large monolithic inline DOM/CSS and divergent icons/tokens  |
| VS Code extension | Static webview HTML/CSS/JS string              | No shared UI reuse                                                            | Hardcoded product colors instead of VS Code theme variables |
| CLI/TUI           | Rust Ratatui                                   | N/A                                                                           | Strong, mostly needs copy/snapshot cleanup                  |

Important feasibility note: web already has `@agiworkforce/unified-chat` in `apps/web/package.json`, so web convergence can be direct. The likely integration work is runtime wiring, style containment, and peer dependency cleanup, not introducing a new package.

Potential package issue: `packages/unified-chat/package.json` peers `framer-motion` as `^11.0.0`, while web currently depends on `framer-motion` `^12.38.0`. If web uses the package directly, update the peer range deliberately, for example `^11.0.0 || ^12.0.0`, after checking compatibility.

## Cross-Surface Findings

### P0. There is no single source of truth for chat UX

Evidence:

- Desktop imports `ChatInterface` from `@agiworkforce/unified-chat` in `apps/desktop/src/App.tsx:85`.
- Desktop renders the shared chat surface in `apps/desktop/src/App.tsx:1278`.
- Web chat imports its own `ChatSidebar`, `MessageListNew`, and `ChatComposerNew` in `apps/web/features/chat/pages/WebChatPage.tsx:10`.
- Web chat renders its own layout in `apps/web/features/chat/pages/WebChatPage.tsx:268`.
- Mobile has its own composer in `apps/mobile/components/chat/ChatInput.tsx:1`.
- Chrome extension builds a large custom side panel in `apps/extension/src/side_panel.ts:349`.
- VS Code extension builds static webview HTML/CSS/JS in `apps/extension-vscode/src/providers/sidebar/webviewContent.ts:1`.
- CLI is a separate Ratatui app in `apps/cli`.

Impact:

- Every new UI feature has to be reinterpreted six times.
- Reference parity will drift even if individual surfaces are polished.
- Web and desktop can disagree on basic product behavior such as composer layout, model selector hierarchy, sidebars, empty states, and tool menus.

Recommendation:

- Treat `packages/unified-chat` as the canonical React DOM chat implementation.
- Extract a platform-neutral chat UX contract from it: nav labels, composer slots, model selector taxonomy, attachment/tool actions, agent mode states, artifact sidecar model, empty states, and token names.
- React DOM surfaces should reuse the package directly. Native surfaces should implement adapters.

### P0. Design tokens are fragmented

Evidence:

- Unified chat defines warm light/dark CSS vars in `packages/unified-chat/src/styles/globals.css:8` and `packages/unified-chat/src/styles/globals.css:40`.
- Desktop duplicates the same chat vars in `apps/desktop/src/styles/globals.css:296` and `apps/desktop/src/styles/globals.css:358`.
- Web has older chat vars in `apps/web/app/globals.css:527` and `apps/web/app/globals.css:638`, plus separate AGI marketing vars in `apps/web/app/globals.css:1575`.
- Mobile declares matching desktop colors in `apps/mobile/lib/theme.ts:1`, with terra-cotta and teal at `apps/mobile/lib/theme.ts:8`.
- Chrome side panel uses purple/indigo accents like `#4338ca`, `#6366f1`, and `#8b5cf6` in `apps/extension/src/side_panel.ts:384` and related rules.
- Chrome in-page panel uses another purple gradient in `apps/extension/src/inPagePanel/panelStyles.ts:36`.
- VS Code hardcodes AGI colors in `apps/extension-vscode/src/providers/sidebar/webviewContent.ts:75`.

Impact:

- The product reads as several unrelated apps.
- The extension looks closer to a generic purple AI plugin than to AGI Workforce.
- Web marketing looks like a separate brand from the desktop app.
- VS Code can clash with user themes because the webview is not theme-native.

Recommendation:

- Create a single semantic token layer. The implementation can be a new package, for example `packages/design-tokens`, or a stricter expansion of `packages/unified-chat/src/lib/tokens.ts`.
- Use semantic names, not surface-specific names: `surface.base`, `surface.raised`, `text.primary`, `text.muted`, `border.subtle`, `accent.primary`, `accent.secondary`, `danger`, `warning`, `success`, `focus.ring`, `composer.bg`, `sidebar.bg`, `artifact.bg`.
- Generate or manually map these tokens to:
  - CSS variables for web/desktop/unified-chat.
  - React Native theme values for mobile.
  - Chrome extension CSS variables.
  - VS Code theme-variable fallbacks.
  - Ratatui color constants.

Best color decision:

- Base on the desktop/shared chat palette because it already covers desktop, unified-chat, mobile, and VS Code direction.
- Use teal as primary product/action accent.
- Use terra-cotta for secondary brand accent, warnings, upgrade/paywall, or destructive-adjacent states.
- Remove purple/indigo as a primary extension identity.
- Treat web amber as marketing accent only if it is explicitly reconciled with app tokens.

### P1. Web is the highest-value first repair

Evidence:

- `apps/web/package.json` already depends on `@agiworkforce/unified-chat`.
- `apps/web/features/chat/pages/WebChatPage.tsx:10` still imports separate web chat components.
- `apps/web/features/chat/components/Composer/ChatComposerNew.tsx:623` implements a custom overflow menu.
- `apps/web/features/chat/components/Composer/ChatComposerNew.tsx:736` implements text-heavy Search, Think, and Research toggles.
- `apps/web/app/page.tsx:76` builds a marketing-first hero.
- `apps/web/app/page.tsx:86` uses competitor-led copy.
- `apps/web/components/layout/Header.tsx:49` and `apps/web/components/marketing/MarketingFooter.tsx:41` use `agi-chrome-band`, but `apps/web/app/globals.css` does not define that class.
- `apps/web/app/globals.css:1697` and `apps/web/app/globals.css:1767` use viewport-scaled `clamp(...)` hero typography.
- `apps/web/app/globals.css:1699` and `apps/web/app/globals.css:1769` use negative letter spacing.
- `apps/web/app/globals.css:1149` uses `transition: all`, which the Web Interface Guidelines flag.

Impact:

- Web is both the public product surface and a duplicated chat implementation.
- It is the place where brand mismatch is most visible.
- Leaving web separate creates long-term implementation drag because web and desktop are both React DOM.

Recommendation:

- Make web the first implementation target after token decisions.
- First perform a small correctness pass:
  - Remove or define `agi-chrome-band`.
  - Replace viewport-scaled hero text with fixed responsive steps.
  - Reset negative letter spacing to 0.
  - Replace `transition: all` with explicit properties.
  - Make hero/product copy product-first.
- Then converge `/chat` onto `packages/unified-chat`, or at minimum extract the shared sidebar/composer/model-picker behavior into the package and consume it from both desktop and web.

Best technical path:

- Build a web host wrapper around `ChatInterface`, using the existing web runtime/store bridge.
- Keep the old web chat behind a temporary route or feature flag only while parity is being checked.
- Do not do a visual-only restyle of `ChatComposerNew`; that would preserve the duplicate architecture.

### P1. Chrome extension has feature parity but weak production polish

Evidence:

- `apps/extension/src/side_panel.ts:349` starts a large inline CSS block.
- `apps/extension/src/side_panel.ts:353` sets the side panel dark purple/indigo language.
- `apps/extension/src/side_panel.ts:1259` defines a custom model picker.
- `apps/extension/src/side_panel.ts:2050` uses an emoji header logo.
- `apps/extension/src/side_panel.ts:2258` uses emoji/text icons for summarize, history, delete, clear, settings, console, mic, group, shortcuts, tools, screenshot, and file controls.
- `apps/extension/src/side_panel.ts:3134` builds the composer toolbar with text and emoji controls.
- `apps/extension/src/inPagePanel/launcher.ts:140` uses a lightning-symbol text glyph as the launcher text.
- `apps/extension/src/inPagePanel/panelStyles.ts:13` defines a separate light in-page panel that does not match the dark side panel.
- `apps/extension/src/side_panel.ts:766`, `apps/extension/src/side_panel.ts:857`, `apps/extension/src/side_panel.ts:1052`, and related rules use `outline: none`; focus replacement should be audited and normalized.

Impact:

- The extension has the right product primitives but looks less mature than Claude and Comet references.
- Emoji controls do not match the rest of the product or the reference extension UI.
- Side panel and in-page assistant feel like different products.
- Inline monolithic CSS/DOM makes it harder to enforce token and accessibility consistency.

Recommendation:

- Keep the extension as vanilla DOM for now. A React rewrite is too large for the first pass.
- Split `side_panel.ts` into smaller modules:
  - token/style generation
  - header
  - conversation list/messages
  - composer
  - attachment menu
  - model picker
  - workflow/tool panels
  - settings/auth
- Replace emoji/text symbols with an inline SVG icon map or generated icon sprite. Avoid adding heavy runtime dependencies unless the extension build already supports them cleanly.
- Use shared semantic CSS vars and one visual language for side panel and in-page panel.
- Add consistent `aria-label`, `:focus-visible`, and keyboard handling for custom controls.

### P1. VS Code extension should become theme-native

Evidence:

- `apps/extension-vscode/src/providers/sidebar/webviewContent.ts:34` says the webview is tailored to AGI tokens, not VS Code variables.
- `apps/extension-vscode/src/providers/sidebar/webviewContent.ts:75` hardcodes dark/teal/terra-cotta colors.
- `apps/extension-vscode/src/providers/sidebar/webviewContent.ts:281`, `apps/extension-vscode/src/providers/sidebar/webviewContent.ts:329`, and `apps/extension-vscode/src/providers/sidebar/webviewContent.ts:353` use `outline: none`.
- `apps/extension-vscode/src/providers/sidebar/webviewContent.ts:631` renders the model selector as a plain HTML `select`.
- `apps/extension-vscode/src/providers/chatEditorPanel.ts:96` reuses the same content for editor panels.

Impact:

- The extension may clash with light/high-contrast/custom VS Code themes.
- The model/mode control is below the quality bar set by the Claude VS Code references.
- Focus styling needs to be visibly platform-consistent.

Recommendation:

- Use VS Code variables as first-class tokens:
  - `--vscode-sideBar-background`
  - `--vscode-foreground`
  - `--vscode-descriptionForeground`
  - `--vscode-input-background`
  - `--vscode-input-foreground`
  - `--vscode-input-border`
  - `--vscode-button-background`
  - `--vscode-button-foreground`
  - `--vscode-focusBorder`
  - `--vscode-list-hoverBackground`
- Use AGI colors only as small accents or fallbacks.
- Replace the plain model select with a compact custom control that includes provider, mode, effort, and context indicators, but still looks like VS Code.
- Keep the static webview approach if it stays secure and easy to ship. The issue is not that it is static; the issue is token and control quality.

### P2. Mobile is structurally good but needs downstream alignment

Evidence:

- `apps/mobile/lib/theme.ts:1` states that tokens match desktop.
- `apps/mobile/app/(app)/(tabs)/_layout.tsx:3` hides the tab navigator and uses an app-level drawer.
- `apps/mobile/app/(app)/(tabs)/chat.tsx:215` uses a native header with menu and new-chat actions.
- `apps/mobile/components/drawer/DrawerContent.tsx:26` defines Chat, Skills, Projects, Dispatch, Connectors, and Settings.
- `apps/mobile/components/chat/ChatInput.tsx:196` supports offline queue state.
- `apps/mobile/components/chat/ChatInput.tsx:231` renders a native bottom composer.
- `apps/mobile/components/chat/AddToChatSheet.tsx:93` documents the add-to-chat sheet structure.
- `apps/mobile/components/model-picker/ModelPickerSheet.tsx:261` uses bottom sheets for model search, favorites, providers, auto modes, and paywall.
- `apps/mobile/components/chat/MessageBubble.tsx:53` explicitly targets a ChatGPT/Claude-like layout.

Impact:

- Mobile appears thoughtfully designed, but it cannot be validated against exact local mobile reference images because none are present.
- If tokens and taxonomy are finalized elsewhere first, mobile can align without architectural churn.

Recommendation:

- Do not redesign mobile first.
- After the shared token/taxonomy decision, update mobile names, colors, control grouping, and sheet hierarchy to match the canonical chat UX.
- Preserve native patterns: drawer, bottom sheets, haptics, offline queue, voice, and safe-area handling.

### P2. CLI/TUI should mostly be preserved

Evidence:

- `apps/cli/src/tui/tui_app.rs:436` renders a header with product, model, provider, branch, context, and tokens.
- `apps/cli/src/tui/tui_app.rs:503` renders the empty state.
- `apps/cli/src/tui/widgets/model_picker.rs:1` documents a mature provider/model/effort picker.
- `apps/cli/src/tui/widgets/model_picker.rs:238` renders the model picker overlay.
- `apps/cli/src/tui/bottom_pane/chat_composer.rs:1` documents a mature composer with attachments, mentions, slash commands, paste handling, voice, and queued submit behavior.
- `apps/cli/src/tui/bottom_pane/footer.rs:587` renders passive footer/status lines and collaboration mode.
- `apps/cli/src/tui/cost_hud.rs:1` documents the cost/context HUD.
- `apps/cli/src/lib.rs:98` describes the CLI as a "Claude Code competitor".
- Snapshot files under `apps/cli/src/tui/**/snapshots` still include `codex_tui__...` filenames.

Impact:

- CLI is already close to Codex/Claude/Gemini CLI references.
- The main problems are brand/copy hygiene, not architecture.

Recommendation:

- Leave CLI behavior mostly intact.
- Later, change public copy from competitor positioning to product-first positioning.
- Clean snapshot/test naming only when doing CLI test maintenance, because snapshot churn can be noisy.

## Surface-by-Surface Technical Comparison

### Desktop

Reference parity: high.

Strengths:

- Uses shared `ChatInterface`.
- Left sidebar taxonomy matches Claude/ChatGPT/Codex patterns.
- Bottom composer has plus, model, voice, attachments, send/stop.
- Attachment menu supports the expected AI-workflow primitives.
- Model selector has provider grouping and Pro+ gating.
- Right artifact panel maps well to Claude artifact references.

Technical risks:

- Settings are host-owned. `packages/unified-chat/src/components/SettingsModal.tsx:4` dispatches a host action and returns `null`.
- Desktop duplicates chat CSS vars that also exist in the package.
- Old desktop components still exist, so edits should verify actual runtime ownership.

Recommended action:

- Treat desktop as the baseline for the React chat surface.
- Move reusable tokens/contract out of desktop-specific CSS.
- Keep desktop changes minimal until web is aligned.

### Web

Reference parity: medium-low.

Strengths:

- It already has the dependency needed for shared chat convergence.
- Existing composer has many advanced controls.
- Header has some correct accessibility labels.

Technical risks:

- Duplicated chat shell.
- Marketing and app visual languages diverge.
- Undefined `agi-chrome-band`.
- Typography and transition rules violate the current UI review frame.
- Text-heavy toggles and colorful chips can feel busier than the reference tools.

Recommended action:

- Fix obvious CSS/copy issues first.
- Migrate `/chat` to `packages/unified-chat` or use shared subcomponents directly.
- Make the marketing first viewport product-led and visually connected to the app.

### Mobile

Reference parity: medium-high as an adaptation.

Strengths:

- Native drawer and bottom-sheet architecture.
- Good offline, voice, attachment, model picker, and message state coverage.
- Does not try to copy desktop pixels onto a phone.

Technical risks:

- No exact local mobile reference images.
- Independent taxonomy and theme can drift from the canonical chat UX.

Recommended action:

- Keep architecture.
- Align tokens/copy/control grouping after web/desktop contract is settled.

### Chrome Extension

Reference parity: medium for features, low-medium for polish.

Strengths:

- Has side panel, page context, screenshot/file attach, model picker, workflows, quick actions, and in-page assistant.
- In-page panel already includes several `aria-label` attributes.

Technical risks:

- Monolithic `side_panel.ts`.
- Emoji controls.
- Purple/indigo token system.
- Side panel and in-page panel do not match.
- Focus styling needs normalization.

Recommended action:

- Modularize without a full framework rewrite.
- Replace icons and tokens.
- Make the extension feel like the same product as desktop/web.

### VS Code Extension

Reference parity: medium-low.

Strengths:

- Reuses one webview implementation for sidebar and editor panels.
- Static HTML can remain secure and lightweight.
- Existing message sanitization is a positive architecture choice.

Technical risks:

- Hardcoded colors instead of theme variables.
- Plain select for model choice.
- Focus styling needs visible replacement when outlines are removed.

Recommended action:

- Make the webview theme-native first.
- Upgrade controls second.
- Preserve the secure/static architecture.

### CLI/TUI

Reference parity: high.

Strengths:

- Mature model picker.
- Mature composer.
- Strong status/footer/cost context.
- Good match to CLI reference groups.

Technical risks:

- Public copy still positions against Claude.
- Snapshot corpus still exposes Codex lineage.

Recommended action:

- Preserve.
- Clean copy later.

## Recommended Implementation Plan

### Phase 0: Lock decisions before editing UI broadly

Goal: prevent a seventh design system from appearing.

Decisions to make:

1. Canonical product palette.
2. Whether `packages/unified-chat` becomes mandatory for React DOM chat surfaces.
3. Whether Chrome remains vanilla DOM for the first pass.
4. How much VS Code should use AGI colors versus VS Code theme variables.

My recommended decisions:

- Canonical palette: desktop/shared warm-neutral + teal primary + terra-cotta secondary.
- React DOM: desktop and web should use `packages/unified-chat`.
- Chrome: keep vanilla DOM, modularize and token-align.
- VS Code: use VS Code variables first, AGI colors as accents/fallbacks only.

### Phase 1: Create the shared frontend contract

Deliverables:

- Shared token map, either in a new `packages/design-tokens` package or expanded from `packages/unified-chat/src/lib/tokens.ts`.
- CSS variable output for web/desktop/unified-chat.
- React Native token adapter for mobile.
- Chrome CSS variable map.
- VS Code variable map with AGI fallbacks.
- Documented chat UX contract:
  - sidebar sections
  - composer slots
  - attachment/tool menu items
  - model picker grouping
  - agent/research/thinking states
  - artifact sidecar behavior
  - empty states
  - keyboard/focus expectations

Acceptance criteria:

- No surface invents primary brand colors independently.
- Common action names match across surfaces.
- Composer capabilities are described once and implemented per platform.

### Phase 2: Web correctness and convergence

Deliverables:

- Remove or define `agi-chrome-band`.
- Fix hero typography: no viewport-scaled font sizes, no negative letter spacing.
- Replace `transition: all`.
- Make marketing copy product-first.
- Create a web route or feature flag using `packages/unified-chat`.
- Resolve any peer dependency mismatch, especially `framer-motion`.
- Decide what happens to `ChatComposerNew`, `ChatSidebar`, and `MessageListNew`: delete, deprecate, or convert into package internals.

Acceptance criteria:

- Web and desktop share the same chat shell or same shared chat subcomponents.
- Web marketing and `/chat` use one coherent token family.
- Source no longer has undefined layout classes around header/footer.

### Phase 3: Desktop hardening

Deliverables:

- Move duplicated chat vars toward shared tokens.
- Clarify settings bridge ownership.
- Mark old desktop chat components as deprecated or remove them only after confirming they are unused.

Acceptance criteria:

- Desktop remains visually stable.
- Shared chat changes do not regress desktop.

### Phase 4: Chrome extension polish

Deliverables:

- Split `side_panel.ts` into maintainable modules.
- Introduce extension token CSS variables.
- Replace emoji/text icons with SVG/icon sprite controls.
- Align side panel and in-page panel styling.
- Normalize `aria-label`, keyboard handlers, and `:focus-visible`.
- Compact model picker, attach menu, and tool controls to match reference density.

Acceptance criteria:

- No emoji is used as a primary production control icon.
- Side panel and in-page assistant clearly belong to the same product.
- Custom controls have keyboard and focus behavior.

### Phase 5: VS Code native pass

Deliverables:

- Replace hardcoded background/text/border/control colors with VS Code variables.
- Add AGI accent fallbacks only where appropriate.
- Replace plain model select with a compact model/mode/effort control.
- Add visible focus replacements anywhere `outline: none` is used.

Acceptance criteria:

- The extension respects dark, light, and high-contrast VS Code themes.
- Model/mode control quality is closer to Claude VS Code references.

### Phase 6: Mobile alignment

Deliverables:

- Map mobile theme to shared tokens.
- Align drawer labels, model grouping, composer action names, add-to-chat sheet order, and paywall language.
- Keep native drawer/bottom-sheet/offline/voice architecture.

Acceptance criteria:

- Mobile reads as AGI Workforce without copying desktop layout.
- No mobile-specific naming drift for shared concepts.

### Phase 7: CLI cleanup

Deliverables:

- Replace competitor-led public CLI copy.
- Clean Codex snapshot names/strings when convenient.
- Keep TUI behavior intact unless there is a specific reference mismatch.

Acceptance criteria:

- CLI remains stable.
- Copy is product-first.

## Tradeoffs

### Direct web adoption of `packages/unified-chat`

Pros:

- Largest reduction in drift.
- Fastest path to desktop/web consistency.
- Uses an existing dependency.
- Makes future chat UX changes cheaper.

Cons:

- Requires runtime/store bridge work.
- May require package peer dependency cleanup.
- Existing web-only chat features must be reconciled, not blindly dropped.

Recommendation: do this.

### Visual-only web restyle

Pros:

- Faster first screenshot improvement.
- Lower initial integration risk.

Cons:

- Keeps duplicate architecture.
- Does not solve long-term drift.
- Every future feature still needs duplicate implementation.

Recommendation: avoid except for small correctness fixes.

### React rewrite of Chrome extension

Pros:

- Easier component reuse if done fully.
- Better long-term maintainability if extension becomes large.

Cons:

- Large blast radius.
- Build/bundle/content-security constraints.
- Delays the visible polish pass.

Recommendation: do not start here. Modularize vanilla DOM first.

### VS Code custom branded UI versus native UI

Branded UI pros:

- Stronger AGI identity.

Branded UI cons:

- Worse fit with user themes.
- Lower trust inside developer tools.
- More accessibility/theme edge cases.

Recommendation: VS Code should be native first, branded second.

## What Not To Do

- Do not chase pixel-perfect parity across desktop, mobile, extension, VS Code, and CLI. Match product structure and interaction quality, then adapt to platform.
- Do not redesign CLI first. It is already one of the best-aligned surfaces.
- Do not add a new visual language for web while trying to fix drift.
- Do not rewrite Chrome in React as the first step.
- Do not use the old accidental live screenshots as evidence.
- Do not start broad UI edits before deciding the canonical token system.

## Highest-Confidence First PRs

1. Web correctness PR:
   - Remove/define `agi-chrome-band`.
   - Fix hero typography and `transition: all`.
   - Change competitor-led hero/help copy to product-first copy.

2. Token contract PR:
   - Centralize semantic tokens.
   - Wire desktop/unified-chat/web to the same names.
   - Add extension/mobile/VS Code mapping docs or adapters.

3. Web unified-chat prototype PR:
   - Mount `ChatInterface` in web behind a route or feature flag.
   - Wire the web runtime/store bridge.
   - Resolve peer dependency issues.
   - Compare feature coverage against `ChatComposerNew`.

4. Chrome polish PR:
   - Replace emoji icons.
   - Introduce extension CSS vars.
   - Align side panel and in-page panel.
   - Add focus/keyboard/accessibility cleanup.

5. VS Code native-theme PR:
   - Swap hardcoded colors for VS Code variables.
   - Upgrade model/mode controls.

6. Mobile alignment PR:
   - Apply shared tokens and taxonomy.
   - Preserve native interaction architecture.

7. CLI copy PR:
   - Replace "Claude Code competitor" phrasing.
   - Clean snapshots when appropriate.

## Final Position

The project should converge around a platform-native shell plus shared chat contract architecture.

Desktop already proves that `packages/unified-chat` can carry the main product experience. Web should join it first because it is React DOM and already depends on the package. Chrome and VS Code should not be forced into that component system, but they should stop inventing their own tokens, icons, and control taxonomy. Mobile should remain native and align after the canonical contract is stable. CLI should be protected from unnecessary churn.

The best near-term sequence is:

1. Decide canonical tokens.
2. Fix web correctness issues.
3. Move web chat toward `packages/unified-chat`.
4. Token/icon polish Chrome.
5. Make VS Code theme-native.
6. Align mobile.
7. Clean CLI copy.

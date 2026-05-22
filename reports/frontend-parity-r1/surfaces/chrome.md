# Chrome Extension current state

**Frontend tree root**: `apps/extension/src/`
**Approximate component count / file count**: 36 source files (no component framework — vanilla TS DOM construction); 3 UI surfaces (popup, side panel, in-page overlay)

---

## Per-category inventory

#### 1. APP SHELL

HAS:

- Popup (380×480px): status card, 2×2 quick-action grid, stats row (tabs / actions / session timer), in-page panel toggle, desktop pairing section, current-page info row
- Side panel (full-height Chrome side panel API): dark-themed shell (`#0f0f14`), header with logo + model badge + icon buttons, two-tab nav (Chat / Workflows), messages area, composer shell, blocked-site state
- In-page overlay panel: 380px right-anchored slide-in via Shadow DOM, header + actions row + response area + composer + "Open in side panel" footer link
- Connection status card with 3 states (connected/reconnecting/disconnected) + animated pulse dot + reconnect button

#### 2. ONBOARDING / AUTH

PARTIAL:

- Side panel has an API key input bar (`#sp-auth-bar`, `#sp-auth-input`, `#sp-auth-save-btn`) stored in `chrome.storage.session` (CRIT-004: deliberately not persisted to local)
- Popup has desktop pairing flow (pair / unpair / fingerprint display, 4-phase state machine: idle/requesting/paired/error)
- No OAuth flow, no mode/profile selection, no splash screen, no post-signin permissions overview

#### 3. EMPTY STATE

PARTIAL:

- Side panel has `#sp-empty` + `#sp-empty-headline` ("What can I help with?" variant per design-spec §8)
- Inline prompt chips (`#sp-prompt-chips`) shown on empty state: quick-action pills for page-aware shortcuts
- Blocked-site state (`#sp-blocked`) with shield icon, title, description — shown when extension cannot run on restricted pages
- No illustration, no model badge in empty state

#### 4. COMPOSER

HAS:

- Rounded composer shell (`#sp-composer-shell`) with textarea + circular send button
- Attach button (`+`) with dropdown menu (`#sp-attach-menu`): image file upload, screenshot capture (Camera icon)
- Attachment preview bar with thumbnail chips + remove button per attachment
- Voice input via Web Speech API (`side_panel/voice.ts`): click-to-record, pulsing red dot while listening, appends transcript to textarea
- AI Tools button opens `#sp-tools-dropdown` listing discovered WebMCP tools with name + description
- Shortcuts button opens `#sp-shortcuts-dropdown` with save-shortcut input + list of saved shortcuts
- Context chip (`#sp-composer-bar`): persistent hostname chip showing active tab; green when context captured, click to toggle
- Extended thinking toggle (`sp-thinking-toggle`) in composer bottom bar
- Textarea auto-resize (max 120px), Enter-to-send, Shift+Enter for newline
- Model selector button in header (`#sp-model-selector-btn`) opens grouped picker dropdown

MISSING: slash command palette, @ mentions, citations toggle, web search mode toggle, plan-mode toggle

#### 5. CHAT / MESSAGES

HAS:

- User bubbles (right-aligned, teal tint) + assistant bubbles (left-aligned, dark background, border)
- Markdown rendering in assistant bubbles: bold, italic, code, pre, lists, headings, blockquote, hr, links (`side_panel/markdown.ts`)
- Streaming cursor blink animation (`.sp-cursor`)
- Thinking/loading dots (3-dot bounce animation, `.sp-thinking`)
- Inline tool-call UI (`.tool-call` / `.tool-call__bar` / `.tool-call__body`): status chips (running/success/error with icon color), expandable JSON body, chevron rotate on expand, multi-step vertical guideline (`.tool-call-stack`)
- Timestamps per message (`.sp-timestamp`)
- Conversation history: save/load up to 50 messages from `chrome.storage.local`; `conversation-history.ts` supports named entries with CRUD
- Clear chat button

MISSING: copy/rate/regenerate/branch actions per message, scroll-to-bottom FAB, comparison A/B layout, web search result cards with favicons, inline citations/sources

#### 6. ARTIFACTS / SIDEBAR

MISSING: no artifact sidebar, no split-pane viewer, no artifact types (HTML/code/image). In-page overlay shows plain text responses only; side panel renders markdown but no artifact panel.

#### 7. PROJECTS / SPACES

MISSING: not applicable to browser extension surface. Side panel has conversation history list (named conversations with CRUD) but no projects/spaces concept.

#### 8. CONNECTORS / TOOLS / SKILLS

PARTIAL:

- WebMCP tool discovery: `webmcp.ts` detects tools declared on the active page, surfaces them in `#sp-tools-dropdown` in composer
- NLWeb detection: `nlweb.ts` detects NLWeb-compatible pages, forwarded to desktop via bridge
- Job autofill connectors: LinkedIn (`autofill/linkedin.ts`) + Lever (`autofill/lever.ts`) + generic Greenhouse/Workday (`jobAutofill.ts`)
- Platform-specific prompts (`platform-prompts.ts`): 10 platforms (Slack, Gmail, Google Calendar, Google Docs, GitHub, Notion, Linear, Figma, Atlassian, Microsoft Teams) — injected as system context
- No connector gallery/directory UI, no per-permission toggles, no OAuth grant modal

#### 9. SETTINGS

PARTIAL:

- Side panel settings gear button reveals `#sp-settings-bar` inline: bridge URL input + Apply button
- Popup: version display, tier badge, in-page panel toggle, desktop pairing section
- No dedicated settings page, no appearance/theme/shortcuts/notifications sections

#### 10. PROFILE / USER POPOVER

PARTIAL:

- Popup shows tier badge (`#userTier`, `.tier-badge`) from `chrome.storage.local agi_user_tier` — hidden when no tier cached
- Tier labels: Free / Hobby / Pro / Pro+ / Max / Local / BYOK
- Paywall card shown in popup on `PAYWALL_HIT` message: feature label, required tier, upgrade CTA link, dismiss button — built with static DOM (no innerHTML, no XSS risk)
- No full profile popover, no account info row, no log out action, no zoom/font controls

#### 11. MODEL / MODE FEATURES

HAS:

- Grouped model picker in side panel header: `auto` (Best) + all models from `getCoreManualModelOptions()`, grouped by provider (13 provider groups: anthropic, openai, google, deepseek, xai, perplexity, qwen, moonshot, zhipu, ollama, lmstudio, custom-openai-compatible, agi-cloud)
- Provider badge and capability tier label per model option
- Extended thinking toggle (boolean; forwarded to desktop bridge as `extended_thinking: true`)
- Model badge in header updates on selection; persisted to `chrome.storage.local agi_default_model`

MISSING: reasoning effort slider (low/med/high), plan-mode toggle, quick-mode modal, region/routing toggles, per-mode model changed banner

#### 12. PRICING / UPGRADE

PARTIAL:

- Paywall card in popup on `PAYWALL_HIT`: inline upgrade CTA with UTM params (`from=ext-paywall&tier=...&feature=...`) pointing to agiworkforce.com/pricing
- Paywall feature labels: video_generation, opus_4_7, gpt_5_5, computer_use, deep_research, image_quota, token_cap, mcp, web_search
- No plans modal, no usage-limit warning banners in side panel, no credit balance display

#### 13. ADMIN / ENTERPRISE

N/A: browser extension surface has no admin/enterprise UI.

#### 14. MOBILE / COMPACT MODE

N/A: Chrome extension is a desktop browser surface. Popup is 380×480px fixed; side panel fills Chrome's side panel width.

#### 15. AGENTIC / COMPUTER USE

PARTIAL:

- `browserTool.ts` maps 16 Computer Use action shapes (`ComputerUseAction`) + 15 Browser Use action shapes (`BrowserAction`) onto content-script `RunPageAction` machinery
- Background service worker executes page actions: click, double-click, right-click, type, scroll, drag-drop, hover, focus, blur, select-option, check, uncheck, click-at-coordinates, execute-script, wait-for-selector, get-accessibility-tree, build-accessibility-tree
- Action recording: START_RECORDING / STOP_RECORDING / GET_RECORDED_ACTIONS message types
- Scheduled tasks: hourly/daily/weekly/monthly via Chrome alarms (`background/tasks.ts`)
- Shortcuts: save named action sequences, replay, delete (`background/shortcuts.ts`)
- Console log capture from page injected via `injected.js`
- Tab management: create/close/switch/group tabs

MISSING: approval prompts (Ask vs Act UX), status bar with current action, action log/replay visible in side panel UI, sandbox/permissions mode cycle, bypass-permissions warning banners — all actions execute without per-action user confirmation (P2 open finding: `autoSubmit: true` controllable via message payload)

#### 16. BROWSER EXTENSION UX

HAS:

- **Popup**: connection status (connected/reconnecting/disconnected), desktop pairing (pair/unpair/fingerprint), in-page panel toggle, version + tier badge, stats grid (tabs/actions/session), quick-action buttons (Open Chat, Capture, Refresh, Group Tab)
- **Side panel**: dark-mode full-height chat UI; Chat tab + Workflows tab; composer with attach + voice + tools + shortcuts + context chip + thinking toggle; model picker with provider grouping; conversation history sidebar; console log viewer (`#sp-console-panel`); blocked-site state
- **In-page overlay**: 380px right-anchored Shadow DOM panel; page-aware quick-action chips (platform-detected actions: summarize, extract emails/links, translate, etc.); free-form composer; streaming response area; disclosure banner (first use, redaction notice); "Open in side panel" footer; SPA navigation awareness (popstate + history.pushState monkey-patch)
- **Hotkeys**: Cmd/Ctrl+Shift+A (popup), Cmd/Ctrl+Shift+C (capture) via `background/shortcuts.ts`
- **Provider display**: active model/provider shown as pill in in-page overlay header, badge in side panel header
- **Restricted-page handling**: blocked state shown when extension cannot inject into chrome:// / CWS pages

MISSING: model picker in in-page overlay (only shows current model label, no picker), quick-mode modal, more-options menu (side panel has settings gear only), YouTube-style rich in-page summarize panel (current in-page panel is generic, not platform-customized beyond quick-action chips)

#### 17. VSCODE EXTENSION UX

N/A: this is the Chrome extension surface.

#### 18. CLI / TUI UX

N/A: this is the Chrome extension surface.

---

## Component reuse opportunities

- **Model data**: imports `getCoreManualModelOptions`, `getModelMetadataById`, `PROVIDER_DISPLAY`, `CAPABILITY_LABEL` from `@agiworkforce/types` — correctly using shared package, not hardcoded
- **Queue/send**: uses `@agiworkforce/runtime` `QueueFullError`
- **Markdown**: `side_panel/markdown.ts` is a one-off implementation (marked + DOMPurify). Could be replaced with `packages/chat`'s shared markdown renderer once that package stabilizes for non-React contexts
- **Tool-call UI**: `.tool-call` inline rendering is a local implementation — the shared `packages/unified-chat` `InlineToolCall` component (per launch-readiness wave 1) exists but is React-based; the extension is vanilla TS so reuse requires either a web-component wrapper or a second extraction of the rendering logic
- **Design tokens**: side panel uses CSS custom properties `--agi-ext-accent: #21808d` and `--agi-ext-accent-secondary: #da7756` inline — correctly matching `packages/design-tokens`; popup.html uses hardcoded `#667eea/#764ba2` gradient (old brand colors, not reconciled to teal/terracotta tokens)

---

## Known gaps the surface owner already knows about

1. `nativeMessaging` permission declared but `com.agiworkforce.browser.json` host manifest absent from repo — native messaging to desktop broken until host manifest is installed (P2 open finding)
2. `autoSubmit: true` controllable via message payload without per-action user confirmation — agentic actions execute silently (P2 open finding)
3. CSP `'unsafe-inline'` style — Shadow DOM panelStyles uses inline style string injection, deferred UI refactor (P2 open finding)
4. Popup uses old brand gradient (`#667eea`/`#764ba2`) instead of design-token teal/terracotta — visual inconsistency with other surfaces
5. In-page overlay has no model picker — shows current model label only; user cannot switch models without opening side panel

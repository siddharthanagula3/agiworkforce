# Chrome Extension UI/UX Gap Audit — 2026-05-05

## Surface

- App path: `apps/extension/`
- Refs studied: 11 screenshots from `claude/claude-chrome-extension/` (7) + `perplexity/perplexity-comet-browser-assistant/` (4)
- Engineer: chrome-ext-engineer

## A. Current state inventory

1. **Popup** (`src/popup.html`, `src/popup.ts`) — 380 px wide, purple gradient header, white card body. Shows desktop bridge connection status (connected / reconnecting / disconnected), quick-action grid (Open Chat, Capture, Refresh, Group Tab), stats row (Tabs / Actions / Session), current page info (Tab ID, URL, Version). No model selector, no auth entry, no agent controls.

2. **Side panel** (`src/side_panel.html`, `src/side_panel.ts:1–2642`) — Full-height dark panel (`#0f0f14`). Header with logo, title, model-badge, model-selector dropdown, connection status pill, settings icon. Tab bar (Chat / Workflows). Chat: empty-state with icon + hint + command chips, message bubbles (user right / assistant left), markdown renderer, streaming cursor, thinking dots. Composer: textarea + send button + context toolbar (`Add page context`, shortcuts, AI-tools dropdown). Auth bar (BYOK API key entry). Settings bar (hidden by default). Workflows tab: shortcuts list (replay/delete), scheduled tasks (toggle/delete/create form), macro recorder with action counter.

3. **Floating FAB overlay** (`src/content.ts:1848–1904`) — Purple gradient 48 px circle injected bottom-right of every http/https page via shadow DOM. Clicking opens the side panel. Tooltip says "Ask AGI Workforce". No page-aware actions.

4. **Platform-specific prompts** (`src/platform-prompts.ts`) — System-prompt snippets injected per hostname: Slack, Gmail, Google Calendar, Google Docs, GitHub, Notion, Linear, Figma.

5. **Job autofill modules** (`src/autofill/linkedin.ts`, `src/autofill/lever.ts`, `src/jobAutofill.ts`) — LinkedIn and Lever form-fill via content script; no dedicated autofill UI surface.

6. **Content script** (`src/content.ts`) — Captures page context, element info, console logs (allowlisted origins only), WebMCP tool discovery, right-click context menu ("Ask AGI Workforce", "Capture Element", "Get Element Info", "Discover WebMCP tools").

7. **Background SW** (`src/background.ts`) — Native messaging bridge (port 8787), tab group management, screenshot capture, context menu registration, side-panel lifecycle, WebMCP tool registry.

---

## B. Pattern audit

### 1. Sidebar empty state

- Reference: `claude-chrome-extension/01_sidebar-extension_empty-state_paid-plan-required-banner.png` — Very sparse; black panel, model chip top-left, "How can I help you today?" placeholder, permission dropdown bottom-left, + and send buttons. Paid-plan banner at bottom.
- Reference: `perplexity-comet-browser-assistant/01_comet_sidebar-assistant-empty-state-claude-sonnet.png` — Centered logo + "Assistant" wordmark, page tab chip at bottom-left, model selector bottom-center, mic + waveform buttons.
- Ours: `src/side_panel.ts:270–288` — Emoji icon (`#sp-empty-icon`), title, hint text, row of clickable command chips. Dark panel.
- Gap: Our empty state shows command chips (a discovery mechanism refs lack), but lacks a prominent logo/wordmark centered on the canvas. The Comet "page tab chip" context indicator is missing; Comet's mic is missing; Comet shows the model in the composer bar not in a header badge.
- Verdict: ADJUST
- Impact: 2
- Effort: S
- Priority: P2

### 2. Action permission dropdown (Ask vs Act)

- Reference: `claude-chrome-extension/02_sidebar-extension_action-permission-dropdown_ask-vs-act.png` — Bottom-left of composer: "Ask before acting" (checked) / "Act without asking" — text + icon, modal-style menu.
- Reference: `claude-chrome-extension/07_sidebar-extension_quick-mode-active_haiku-act-without-asking.png` — Quick mode sets "Act without asking" and highlights a bolt icon.
- Ours: no per-session permission dropdown. The side panel has no ask/act gating control. Desktop is the brain; the extension does not execute agentic actions autonomously — it forwards requests to port 8787.
- Gap: We have no ask/act distinction because we don't run agentic actions locally. This is architecturally correct but means automation transparency is absent. If the desktop ever exposes "confirmation required" mode, there is no UI to expose it from the panel.
- Verdict: ADD (future, when desktop exposes approval mode) — defer
- Impact: 3
- Effort: M
- Priority: P2

### 3. Quick mode / speed mode

- Reference: `claude-chrome-extension/06_sidebar-extension_quick-mode-modal_model-options.png` — Modal over sidebar: "Quick mode is experimental", "Enable with Haiku 4.5", "Enable with Opus 4.6 (fast mode) — billed at premium rate". Go back button.
- Reference: `claude-chrome-extension/07_sidebar-extension_quick-mode-active_haiku-act-without-asking.png` — Bolt icon highlighted in header when active.
- Ours: `src/side_panel.ts:905–916` — Simple model selector dropdown, no "quick mode" concept or speed/capability trade-off framing. Models include Auto, Claude variants, GPT, Gemini, DeepSeek, Sonar, Grok, Mistral, Ollama.
- Gap: We surface more models than Claude's extension (11 vs 3), which is a differentiator, but we have no speed/capability framing or visual mode indicator. Users cannot see at a glance what cost/speed trade-off the current model implies.
- Verdict: ADJUST — add model description sub-labels (e.g. "Fastest", "Balanced", "Most capable") to dropdown items
- Impact: 3
- Effort: S
- Priority: P1

### 4. Attachment menu (screenshot + image)

- Reference: `claude-chrome-extension/03_sidebar-extension_attachment-menu_screenshot-image-options.png` — Plus button in composer opens two-item menu: "Take a screenshot" + "Add an image". Short labels, icon-prefixed.
- Reference: `perplexity-comet-browser-assistant/02_comet_sidebar-plus-menu-upload-cloud-screenshot-browser-control.png` — Four items: Upload files or images (with retention note), Add files from cloud (chevron), Screenshot, Control browser.
- Ours: `src/side_panel.ts:2193–2216` — Context toolbar (`#sp-toolbar`) has `Add page context` and shortcuts/tools dropdown. The plus (+) icon in the composer row opens `sp-shortcuts-dropdown` (saved prompts), not an attachment/file menu. Screenshot capture is only in the popup (`captureBtn`), not in the side panel composer.
- Gap: No attachment menu in the side panel. Screenshot, image upload, cloud file attach are all absent from the panel composer. The popup-only capture flow is not discoverable during a chat session.
- Verdict: ADD — plus menu in side panel composer with Screenshot + Add image (cloud upload is a phase-2 concern)
- Impact: 4
- Effort: M
- Priority: P1

### 5. Model selector dropdown with provider icons and descriptions

- Reference: `claude-chrome-extension/05_sidebar-extension_model-selector-dropdown_opus-sonnet-haiku.png` — Three items with name + one-liner description (e.g. "Most capable for ambitious work"). No icons. Checkmark on selected.
- Reference: `perplexity-comet-browser-assistant/03_comet_sidebar-model-selector-best-gpt-claude-thinking.png` — Five items: Best / Sonar / GPT-5.4 / Gemini 3.1 Pro / Claude Sonnet 4.6, each with provider icon + name. Thinking toggle at bottom of list, currently selected shown in composer bar with badge.
- Ours: `src/side_panel.ts:44–70` — ~13 models, no provider icons, no description subtexts, no thinking toggle. Badge in header shows short label. Dropdown anchors from header not from composer.
- Gap: Missing provider icons beside each model name; missing description sub-labels; no "Thinking" mode toggle. Multi-provider breadth is a core differentiator — making provider identity visible is high leverage.
- Verdict: ADJUST — add 16 px provider icons + 1-line descriptions to model dropdown; add "Thinking" toggle for models that support it (route to desktop bridge with `extended_thinking` flag)
- Impact: 5
- Effort: M
- Priority: P0

### 6. More options menu (Convert to task / Settings / Language)

- Reference: `claude-chrome-extension/04_sidebar-extension_more-options-menu_task-settings-language.png` — Three-dot button in header opens: "Convert to task" (clock icon), "Settings" (gear), "Language" (globe with chevron).
- Ours: `src/side_panel.ts:244–255` — Header right has `.sp-icon-btn` buttons; the settings icon toggles `#sp-settings-bar` (API key entry + model). No "convert to task" or language option.
- Gap: No per-chat "Convert to task" (i.e. save current thread as a named workflow/shortcut). Language setting is absent. The Workflows tab has a task scheduler but no quick-convert from a chat thread.
- Verdict: ADJUST — add "Save as shortcut" action to the three-dot menu that feeds the existing Workflows tab shortcut store; language setting is low-priority for MVP
- Impact: 2
- Effort: S
- Priority: P2

### 7. Page-context indicator in composer bar

- Reference: `perplexity-comet-browser-assistant/01_comet_sidebar-assistant-empty-state-claude-sonnet.png` — Comet shows a "New Tab" page chip at bottom-left of panel, always visible, as page context anchor.
- Ours: `src/side_panel.ts:1504–1515` — `contextBtn` in `#sp-toolbar` ("Add page context") becomes green ("Page context attached") when active; it's a toolbar button above the input, not a persistent bottom-bar chip.
- Gap: The page context state is invisible until user scrolls up to the toolbar. No persistent chip shows which page the conversation is anchored to. Platform-aware context (Slack, Gmail, etc.) is assembled server-side but not surfaced to the user as an indicator.
- Verdict: ADJUST — move page-context chip into composer bar bottom-left (always visible, showing hostname); green = active, grey = inactive; one click to toggle
- Impact: 3
- Effort: S
- Priority: P1

### 8. Floating panel on host pages (YouTube-style contextual actions)

- Reference: `perplexity-comet-browser-assistant/04_comet_youtube-floating-panel-summarize-extract-scroll.png` — Comet injects a compact panel bottom-right of YouTube with three quick-action pills: "Summarize this video", "Extract key takeaways", "Scroll to the next interesting moment".
- Ours: `src/content.ts:1848–1904` — FAB overlay (48 px bolt circle) is injected on every page. It only opens the side panel; no page-aware quick actions. No platform-specific floating panels.
- Gap: The FAB is generic; no context-aware action pills for high-value pages (YouTube, GitHub PR, LinkedIn job listing). Platform prompts exist server-side but are not surfaced as floating shortcuts.
- Verdict: ADD — for platform-matched pages (from `platform-prompts.ts`) replace or augment FAB with 2–3 contextual action pills (e.g. "Summarize page", "Draft reply" on Gmail). Keep generic FAB for unmatched pages.
- Impact: 4
- Effort: L
- Priority: P1

### 9. BYOK / API key entry UX

- Reference: Claude ext requires paid plan banner visible in all screenshots (01, 03, 04, 05, 07). No BYOK option shown — it's gated to Anthropic subscription.
- Ours: `src/side_panel.ts:746–783` — `#sp-auth-bar` is a raw text input ("Enter API key") + Save button shown when no key is present. Functional but unpolished.
- Gap: The raw monospace input with no label hierarchy, no placeholder hint on which provider the key belongs to, no "use desktop connection instead" fallback hint. Users with the desktop app connected don't need a key but the auth bar still appears.
- Verdict: ADJUST — show auth bar only when desktop bridge is disconnected AND no key is saved; when connected, hide auth bar and show "Using desktop provider" status text
- Impact: 3
- Effort: S
- Priority: P1

### 10. Connection status surface and bridge indicator

- Reference: No explicit bridge status in Claude or Comet refs (they are cloud-only).
- Ours: `src/side_panel.ts:786–815` — `#sp-status-pill` (connected green / disconnected red) in header. Popup has a richer connection card. Side panel pill is 10 px font, hard to notice.
- Gap: The pill is present but the "disconnected" state gives no actionable recovery step from inside the panel. Clicking the pill or a nearby button should trigger reconnection or open popup for troubleshooting.
- Verdict: ADJUST — make disconnected pill clickable; on click, show inline tooltip: "Desktop app not detected. Open popup to reconnect."
- Impact: 2
- Effort: S
- Priority: P2

### 11. Autofill UI surface (LinkedIn / Lever)

- Reference: No reference has an autofill UI — this is a pure AGI Workforce differentiator.
- Ours: `src/autofill/linkedin.ts`, `src/autofill/lever.ts` — Form-fill logic exists; triggered via background message. No visible affordance in side panel or floating overlay that tells user autofill is available.
- Gap: Users on LinkedIn/Lever job pages get no visible signal that autofill is available. No "Fill this form" button in the floating overlay or sidebar.
- Verdict: ADD — on LinkedIn/Lever job pages, add a "Autofill application" pill to the floating overlay (or platform-contextual panel per pattern 8)
- Impact: 4
- Effort: M
- Priority: P1

### 12. Voice input

- Reference: `perplexity-comet-browser-assistant/01_comet_sidebar-assistant-empty-state-claude-sonnet.png` — Mic icon in composer bar (bottom-right of text field). Waveform animation button visible.
- Ours: `src/side_panel.ts:451–461` — `.sp-mic-pulse` CSS class and `isRecording` state exist; mic button is wired in the toolbar (`sp-toolbar`). The waveform icon is present.
- Gap: Voice input is implemented at the code level but mic is in the toolbar above the input (not in the composer bar inline with text). Discoverability is low. No transcription status indicator.
- Verdict: ADJUST — move mic button inline into the input row (right of textarea, left of send); add waveform animation on active recording
- Impact: 2
- Effort: S
- Priority: P2

### 13. Paid-plan / sign-in banner

- Reference: `claude-chrome-extension/01_sidebar-extension_empty-state_paid-plan-required-banner.png` — Black sticky banner at bottom of panel: "Claude in Chrome requires a paid plan" with "Upgrade plan" link.
- Ours: No such banner. BYOK is free; desktop-bridge connection is free. Auth bar appears only when no key is configured.
- Gap: No banner needed — BYOK + Local LLM access is a key differentiator. This is a deliberate absence, not a gap. However, when a user is on BYOK and has exhausted credits or entered an invalid key, there is no in-panel error banner beyond the chat error bubble.
- Verdict: REMOVE / N/A (intentional) — ensure API-key errors surface as a banner with actionable text ("Invalid key — update in Settings") rather than only as a chat error bubble
- Impact: 2
- Effort: S
- Priority: P2

---

## C. Top 10 priority gaps (ranked, P0 first then Impact/Effort)

1. **Multi-provider model selector with icons + descriptions + thinking toggle** — Ref: `05_sidebar-extension_model-selector-dropdown_opus-sonnet-haiku.png` + `03_comet_sidebar-model-selector-best-gpt-claude-thinking.png` — Ours: `src/side_panel.ts:905–916` — Add 16 px provider icons, 1-line description sub-labels, and a "Thinking" toggle for supported models routed to desktop bridge — P0 (Impact 5, Effort M)

2. **Attachment menu in side panel composer** — Ref: `03_sidebar-extension_attachment-menu_screenshot-image-options.png` + `02_comet_sidebar-plus-menu-upload-cloud-screenshot-browser-control.png` — Ours: no plus menu in panel — Add plus menu with Screenshot + Add image items; wire Screenshot to existing `CAPTURE_SCREENSHOT` background message — P1 (Impact 4, Effort M)

3. **Platform-contextual floating action pills (YouTube, Gmail, LinkedIn, etc.)** — Ref: `04_comet_youtube-floating-panel-summarize-extract-scroll.png` — Ours: `src/content.ts:1848–1904` (generic FAB only) — Replace/augment FAB on `platform-prompts.ts` domains with 2–3 inline contextual quick-action pills — P1 (Impact 4, Effort L)

4. **Autofill availability affordance on LinkedIn/Lever** — Ref: (no ref — AGI differentiator) — Ours: `src/autofill/linkedin.ts`, `src/autofill/lever.ts` (no UI signal) — Add "Autofill application" pill to floating overlay on LinkedIn/Lever job pages — P1 (Impact 4, Effort M)

5. **Page-context chip in composer bar (persistent, always visible)** — Ref: `01_comet_sidebar-assistant-empty-state-claude-sonnet.png` — Ours: `src/side_panel.ts:1504–1515` (hidden toolbar button) — Move hostname chip into composer bar bottom-left; green when active, grey when inactive — P1 (Impact 3, Effort S)

6. **Auth bar conditioned on bridge disconnect + key absence** — Ref: (our differentiator — no equivalent in refs) — Ours: `src/side_panel.ts:746–783` (always visible when no key) — Hide auth bar when desktop bridge is connected; show "Using desktop provider" instead — P1 (Impact 3, Effort S)

7. **Model dropdown description sub-labels (speed/capability framing)** — Ref: `05_sidebar-extension_model-selector-dropdown_opus-sonnet-haiku.png` — Ours: `src/side_panel.ts:44–70` (no sub-labels) — Add one-line capability descriptions to each model option in the dropdown — P1 (Impact 3, Effort S)

8. **Mic button moved inline into composer input row** — Ref: `01_comet_sidebar-assistant-empty-state-claude-sonnet.png` — Ours: `src/side_panel.ts:2193–2216` (toolbar above input) — Relocate mic inline with textarea; add waveform on active — P2 (Impact 2, Effort S)

9. **Disconnected status pill with actionable recovery hint** — Ref: (no direct ref) — Ours: `src/side_panel.ts:786–815` — Make pill clickable; show inline tooltip with recovery instruction — P2 (Impact 2, Effort S)

10. **"Save as shortcut" in three-dot more-options menu** — Ref: `04_sidebar-extension_more-options-menu_task-settings-language.png` — Ours: `src/side_panel.ts:244–255` (no convert-to-task) — Add "Save as shortcut" item feeding existing Workflows shortcut store — P2 (Impact 2, Effort S)

---

## D. Anti-patterns from refs we should NOT copy

1. **Paid-plan lock-out banner** (`01_sidebar-extension_empty-state_paid-plan-required-banner.png`) — Claude blocks the entire extension behind a subscription. AGI Workforce's BYOK + Local LLM must remain fully usable for free users. Never gate the panel behind a plan check.

2. **Three-model-only selector** (`05_sidebar-extension_model-selector-dropdown_opus-sonnet-haiku.png`) — Claude limits the extension to Opus / Sonnet / Haiku. Our 10+ provider breadth is a core differentiator. Do not simplify to a short list to mimic competitor aesthetics.

3. **"Quick mode is experimental" friction modal** (`06_sidebar-extension_quick-mode-modal_model-options.png`) — Claude adds a warning dialog before enabling speed mode. This adds a click to a common action. If we add model speed framing, surface it as a badge change in the dropdown, not a blocking modal.

4. **Cloud-only attachment assumption** (`02_comet_sidebar-plus-menu-upload-cloud-screenshot-browser-control.png`) — Comet's "Add files from cloud" implies Google Drive / cloud integration. Our desktop-bridge architecture means file access routes through the desktop app; do not promise cloud file picker on the extension surface before the desktop connector is ready.

5. **Anthropic-only model branding** — Both refs use only their own brand colors/icons. We must show neutral provider icons (OpenAI, Google, Anthropic, Mistral, etc.) without visual hierarchy that implies one provider is primary.

---

## E. Open product questions (need user decision)

1. **Thinking toggle placement** — Should the "Thinking" toggle live inside the model dropdown (Comet pattern) or as a separate toolbar pill? The dropdown approach is compact but merges model choice and reasoning choice.

2. **Cloud file attach scope** — Do we expose "Add files from cloud" in the plus menu now (routing through the desktop bridge) or defer until a dedicated cloud connector is shipped?

3. **Floating panel opt-in vs always-on** — Should the contextual action pills (YouTube, Gmail, etc.) appear automatically on matching pages, or should the user opt in per-domain (privacy/annoyance concern on high-value sites like banking or healthcare)?

4. **Autofill trigger UX** — Should the "Autofill application" affordance be a floating pill on the page or a banner inside the side panel when a LinkedIn/Lever job page is detected?

5. **Permission/approval mode** — Does the product roadmap include exposing desktop-side "ask before acting" approval control through the extension UI? If yes, the ask/act dropdown should be a P0 addition with the next desktop protocol update.

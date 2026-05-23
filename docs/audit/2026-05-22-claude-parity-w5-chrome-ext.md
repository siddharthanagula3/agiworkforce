# R26-PARITY W5: Chrome Extension — Claude vs AGI Parity Audit

**Date:** 2026-05-22
**Lane:** R26-PARITY Chrome Extension
**Auditor:** chrome-ext-engineer (automated)
**Images reviewed:** 18 (7 root + 11 from 2026-05-15 subdirectory)
**AGI source:** `apps/extension/` v1.2.0

---

## 1. What Claude's Chrome Extension Actually Is

Claude ships a full Chrome side-panel extension ("Claude in Chrome"), **not** a popup-only companion. It is a cloud-hosted LLM interface bolted to the browser — the exact inverse architecture of AGI's extension. Key observations from screenshots:

| Attribute               | Claude                                                                                                            |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Architecture            | Cloud SaaS — LLM calls go to Anthropic's servers, no local desktop bridge                                         |
| Auth requirement        | Paid plan required for browser computer-use ("Claude in Chrome requires a paid plan")                             |
| Connection model        | Claude Desktop app pairs to the extension via a pairing page (`/pairing.html`) to grant browser-automation rights |
| Permitted/blocked sites | Explicit per-site permission grant; hardcoded blocked list for sensitive URLs (`/blocked.html`)                   |
| Permissions model       | Per-action consent: "Allow this action / Decline / Always allow on this site" prompt shown inline                 |
| Task/workflow model     | First-class "Tasks" concept — tasks run in background, user receives completion notifications                     |
| Shortcuts               | Named `/shortcut` prompts with a `Create shortcut` modal (Name + Prompt + Start URL + Schedule toggle)            |
| Recording               | Voice workflow recording via microphone — speech-to-text for narration                                            |
| Model picker            | 3-tier: Opus 4.6 / Sonnet 4.6 (default) / Haiku 4.5; "Quick mode" flag for Haiku/fast-Opus                        |
| Action permission mode  | "Ask before acting" (default) vs "Act without asking" toggle on every session                                     |
| Options page            | Full settings page: Notifications, Microphone, Approved Sites, Shortcuts, Options, Log out                        |
| Batch step UI           | Inline "Batch N/M actions" progress cards with expand/collapse inside the side panel chat                         |

---

## 2. Image Inventory

| File                                                                  | What Claude shows                                                                                                                                                                                                                                                                                                                                                              |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `01_sidebar-extension_empty-state_paid-plan-required-banner.png`      | Side panel empty state on YouTube. Banner: "Claude in Chrome requires a paid plan — Upgrade plan". Model = Sonnet 4.6. Input placeholder: "Type / for commands". Permission toggle at bottom: "Ask before acting".                                                                                                                                                             |
| `02_sidebar-extension_action-permission-dropdown_ask-vs-act.png`      | Permission mode dropdown: "Ask before acting" (checked) and "Act without asking". Rendered in side panel bottom bar.                                                                                                                                                                                                                                                           |
| `03_sidebar-extension_attachment-menu_screenshot-image-options.png`   | Attachment menu: "Take a screenshot" and "Add an image". Side panel has yellow dashed active-context border. Paid plan banner still present.                                                                                                                                                                                                                                   |
| `04_sidebar-extension_more-options-menu_task-settings-language.png`   | Three-dot menu: "Convert to task", "Settings", "Language". Paid banner visible.                                                                                                                                                                                                                                                                                                |
| `05_sidebar-extension_model-selector-dropdown_opus-sonnet-haiku.png`  | Model picker: Opus 4.6 ("Most capable for ambitious work"), Sonnet 4.6 ("Most efficient for everyday tasks" — selected), Haiku 4.5 ("Fastest for quick answers"). Paid banner + input placeholder "Type / for commands".                                                                                                                                                       |
| `06_sidebar-extension_quick-mode-modal_model-options.png`             | "Quick mode is experimental" modal with caution copy. Buttons: "Enable with Haiku 4.5", "Enable with Opus 4.6 (fast mode)" (billed at extra usage), "Go back".                                                                                                                                                                                                                 |
| `07_sidebar-extension_quick-mode-active_haiku-act-without-asking.png` | Quick mode active: Haiku 4.5 selected, orange/red lightning-bolt badge on the speed button. "Act without asking" now shown in permission bar.                                                                                                                                                                                                                                  |
| `2026-05-15/401_claude-chrome_side-panel-first-open.png`              | Side panel just opened on example.com. Minimal header: "Claude" + Sonnet 4.6 badge + pin/close. No chat yet. Bottom: composer with "How can I help you?" placeholder.                                                                                                                                                                                                          |
| `2026-05-15/402_claude-chrome_side-panel-login-or-connected.png`      | Three-dot menu open showing "Convert to task / Settings / Language" — same UI on desktop Chrome (Mac).                                                                                                                                                                                                                                                                         |
| `2026-05-15/403_claude-chrome_pairing-prompt.png`                     | `chrome-extension://.../pairing.html`: "Claude Desktop wants to connect. Name this browser so you can identify it later." Input placeholder: e.g. "Work laptop", "Personal Chrome". Buttons: Ignore / Connect. Side panel visible alongside.                                                                                                                                   |
| `2026-05-15/404_claude-chrome_permissions-page.png`                   | Options page (`#permissions`): Notifications section (task completion notifications toggle enabled), Microphone section ("Allow Microphone Access" button), "Your approved sites" list (shows sebastien-lempens.com with Revoke). Left sidebar: Permissions (active) / Shortcuts / Options / Log out.                                                                          |
| `2026-05-15/406_claude-chrome_site-permission-action-prompt.png`      | Mid-task permission prompt: "New permissions required — Claude wants to read page content on: example.net. Allow this action / Decline / Always allow actions on this site (browse, click, type)". Warning footnote: "Claude will not purchase items, create accounts, or bypass captchas without input." Active batch progress shown above (Batch 1/2, Batch 1/1, Batch 2/2). |
| `2026-05-15/409_claude-chrome_blocked-sensitive-site.png`             | Blocked page: `chrome-extension://.../blocked.html`. Left area shows: "The content on this page isn't available when Claude is active for safety reasons." Side panel shows shield icon + "Can't access this page — Claude cannot assist with the content on this page."                                                                                                       |
| `2026-05-15/413_claude-chrome_shortcuts-list.png`                     | Options page Shortcuts tab. Left column: options sidebar. Main area: "Shortcuts — Type / in the chat to use shortcuts or run them on schedule". Example shortcut "/apply" shown with a prompt preview card. "Create shortcut" button top-right. Active task running in side panel alongside.                                                                                   |
| `2026-05-15/414_claude-chrome_record-workflow-entry.png`              | "Create shortcut" modal: Name field (`/task-name`), Prompt textarea ("Enter your prompt text…"), Start from URL field (`https://example.com`), Schedule toggle (off). Cancel / Create shortcut buttons.                                                                                                                                                                        |
| `2026-05-15/415_claude-chrome_record-workflow-mic-permission.png`     | Chrome mic permission dialog: "Claude wants to — Use available microphones (2) — Siddhartha iPhone 13 Pro Max — Allow while visiting the site / Allow this time / Never allow". Shown on the Options > Permissions page which has "Requesting…" state on the microphone button.                                                                                                |
| `2026-05-15/416_claude-chrome_reconnect-page.png`                     | Claude sign-in / reconnect page (`claude.ai/login`): "Think fast, build faster — Brainstorm in chat, build in Cowork — and runs multiple tasks at once". Continue with Google / Continue with email. Download desktop app button.                                                                                                                                              |
| `2026-05-15/417_claude-chrome_options-page.png`                       | Full Options page (`#permissions`) same as 404 but with mic shown as "Requesting…". Approved sites section shows sebastien-lempens.com, last used date, Revoke button.                                                                                                                                                                                                         |

---

## 3. Parity Scorecard

Legend: **AHEAD** = AGI leads, **PARITY** = roughly equal, **BEHIND** = Claude leads, **N/A** = not applicable to our architecture.

| Feature                                    | Claude                                                                                    | AGI                                                                                                                                    | Status | Notes                                                                                                        |
| ------------------------------------------ | ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------ |
| **Side panel with chat**                   | Yes — full cloud LLM chat                                                                 | Yes — `src/side_panel.ts` streaming via desktop bridge                                                                                 | PARITY | Both have markdown render, streaming cursor, message history                                                 |
| **Model picker in side panel**             | Yes — 3 named tiers (Opus/Sonnet/Haiku)                                                   | Yes — full multi-provider grouped picker (`SIDE_PANEL_MODEL_OPTIONS`, `side_panel.ts:173`)                                             | AHEAD  | AGI exposes 13+ providers; Claude locks to Anthropic models only                                             |
| **"Act without asking" / autonomy toggle** | Yes — prominent per-session toggle at bottom of side panel                                | No                                                                                                                                     | BEHIND | AGI has no equivalent permission/autonomy toggle                                                             |
| **Per-site action permission prompt**      | Yes — per-action "Allow / Decline / Always allow on site"                                 | Yes — `SITE_ALLOWLIST_KEY` per-origin allowlist managed in popup                                                                       | BEHIND | Claude shows inline mid-task prompts; AGI manages only via popup, not inline                                 |
| **Blocked / restricted-site state**        | Yes — dedicated `/blocked.html` + shield UI in side panel (`409`)                         | Yes — `#sp-blocked` CSS block + `.visible` class in `side_panel.ts:484`                                                                | PARITY | Both have a blocked-site view; Claude's is full-tab, AGI's is in-panel only                                  |
| **Desktop app pairing**                    | Yes — `chrome-extension://.../pairing.html` with browser naming (`403`)                   | Yes — `src/features/native-bridge/pairing.ts` + popup pairing UI                                                                       | PARITY | Different UX (Claude uses a full tab; AGI uses popup section)                                                |
| **Task / workflow concept**                | Yes — "Convert to task" in three-dot menu; background tasks with notifications            | No                                                                                                                                     | BEHIND | AGI has no "task" entity; automation runs are one-shot                                                       |
| **Named shortcuts (/slash commands)**      | Yes — full shortcuts management page with Create/edit/schedule (`413`, `414`)             | Yes — `#sp-shortcuts-dropdown` + save shortcut UI in `side_panel.ts:824`                                                               | PARITY | Both have named prompts; Claude adds a dedicated Options page tab and scheduling toggle                      |
| **Shortcut scheduling**                    | Yes — toggle in Create shortcut modal (`414`)                                             | No                                                                                                                                     | BEHIND | AGI shortcuts have no schedule/cron support                                                                  |
| **Screenshot / image attachment**          | Yes — "Take a screenshot / Add an image" in attachment menu (`03`)                        | Yes — `pendingAttachments` array, attach menu `#sp-attach-menu` in `side_panel.ts:1047`                                                | PARITY | Both support screenshot + image upload                                                                       |
| **Voice / microphone input**               | Yes — speech-to-text for workflow recording with OS mic permission dialog (`415`)         | Yes — `setupVoiceInput` in `src/features/side-panel/voice.ts`; mic pulse indicator in CSS                                              | PARITY | Both have voice; Claude's is branded as "workflow recording", AGI's is live STT input                        |
| **Paid plan gate / paywall UI**            | Yes — persistent banner + Upgrade CTA (`01`, `03`, `04`, `05`)                            | Yes — `showPaywallCard()` in `src/popup.ts:481`; `PAYWALL_HIT` message type                                                            | PARITY | Different triggers: Claude gates at plan level; AGI gates at feature level with tier labels                  |
| **Quick mode / speed mode**                | Yes — experimental "Quick mode" with Haiku/fast-Opus options, caveat modal (`06`, `07`)   | No equivalent concept                                                                                                                  | BEHIND | AGI has no "quick mode" or latency-optimised preset                                                          |
| **Options / settings page**                | Yes — full `chrome-extension://.../options.html` with 3 sections + log out (`404`, `417`) | No dedicated options page                                                                                                              | BEHIND | AGI settings live in popup; no dedicated full-tab options page                                               |
| **Notification setting**                   | Yes — "Task completion notifications" toggle in Options (`404`)                           | Yes — `notifications` permission in `manifest.json:17`                                                                                 | PARITY | Both request notifications; Claude exposes a user toggle                                                     |
| **Approved sites management**              | Yes — list with per-origin Revoke in Options Permissions section (`417`)                  | Yes — `allowlistList` + `allowlistToggleBtn` in popup (`popup.ts:716`)                                                                 | PARITY | Both manage per-origin allow lists; Claude also shows in the Options page, AGI only in popup                 |
| **Language selector**                      | Yes — "Language" in three-dot menu (`04`)                                                 | No                                                                                                                                     | BEHIND | AGI has no in-extension language switch                                                                      |
| **Platform-specific assistant prompts**    | No equivalent seen                                                                        | Yes — `src/features/content/platform-prompts.ts` covers Slack/Gmail/Calendar/Docs/GitHub/Notion/Linear/Figma/Jira/Teams (10 platforms) | AHEAD  | AGI auto-injects page-context prompts for 10 platforms — Claude shows no equivalent                          |
| **Job autofill (LinkedIn/Lever)**          | No equivalent seen                                                                        | Yes — `src/features/content/autofill/linkedin.ts`, `lever.ts` with layered selector fallback                                           | AHEAD  | AGI uniquely automates job application forms — zero Claude equivalent                                        |
| **In-page floating panel**                 | No equivalent seen                                                                        | Yes — `src/features/content/in-page-panel/` (launcher, panel, pageActions, setup)                                                      | AHEAD  | AGI injects a resizable floating panel directly into the page DOM                                            |
| **Tab grouping**                           | No equivalent seen                                                                        | Yes — `ADD_TAB_TO_GROUP` message, `tabGroups` permission in manifest                                                                   | AHEAD  | AGI can group browser tabs via Chrome's Tab Groups API                                                       |
| **Session timer**                          | No equivalent seen                                                                        | Yes — `startSessionTimer()` in `popup.ts:295`; displays elapsed session time                                                           | AHEAD  | AGI popup shows elapsed session time                                                                         |
| **Multi-provider bridge**                  | No — only Anthropic cloud                                                                 | Yes — SSE bridge to desktop port 8787; desktop handles all providers                                                                   | AHEAD  | AGI's extension is provider-agnostic; any provider the desktop supports is usable                            |
| **Conversation history**                   | Yes — implicit in cloud session                                                           | Yes — `saveConversation/listConversations/deleteConversation` in `side_panel.ts:26`; 50-msg local store                                | PARITY | Both persist history; AGI uses `chrome.storage.local`, Claude uses cloud                                     |
| **Memory editor**                          | No browser-visible memory management                                                      | Yes — full CRUD memory editor in popup (`popup.ts:816`); LIST/ADD/UPDATE/DELETE via background                                         | AHEAD  | AGI exposes editable memory store in the popup — Claude has no equivalent in the extension                   |
| **Connection status indicator**            | No visible disconnect indicator                                                           | Yes — `#sp-status-pill` (connected/disconnected) in side panel; `statusCard` in popup                                                  | AHEAD  | AGI surfaces desktop bridge connectivity to the user; relevant because Claude doesn't need it (cloud)        |
| **Inline tool-call UI**                    | Yes — "Batch N/M actions" cards with expand/collapse in side panel (`406`, `413`)         | Yes — `.tool-call` / `.tool-call-stack` with expand/collapse chevron in `side_panel.ts:629`                                            | PARITY | Both show step-by-step tool execution inline                                                                 |
| **Batch action progress**                  | Yes — "Batch 1/2 actions — Stopped on error" with step detail (`406`)                     | Partial — tool call stack shows steps but no aggregate "Batch N/M" counter                                                             | BEHIND | Claude has clearer batch progress with error states; AGI has individual tool call items but no batch summary |
| **Omnibox / action button**                | Default action = popup + Cmd+Shift+A, Cmd+Shift+C                                         | Same — `commands` in `manifest.json:57`                                                                                                | PARITY | Identical hotkey design                                                                                      |
| **NLWeb / MCP discovery**                  | No equivalent seen                                                                        | Yes — `src/features/content/nlweb.ts`, `webmcp.ts`; `discoveredTools` array surfaced in side panel                                     | AHEAD  | AGI discovers and exposes WebMCP/NLWeb tools from the page                                                   |
| **Console log viewer**                     | No equivalent seen                                                                        | Yes — `#sp-console-panel` with log/warn/error/info/debug levels in `side_panel.ts:774`                                                 | AHEAD  | AGI embeds a developer console log viewer inside the side panel                                              |
| **Extended thinking toggle**               | No                                                                                        | Yes — `thinkingEnabled` field in context, forwarded to desktop as `extended_thinking: true`                                            | AHEAD  | AGI surfaces extended thinking control per-message                                                           |
| **CSP hardening**                          | Not auditable from screenshots                                                            | Full M-08 hardening: `default-src 'self'`, `connect-src` allowlist, `base-uri 'self'`, Constructable Stylesheets                       | AHEAD  | AGI's manifest has documented M-08 hardening with annotated rationale                                        |

---

## 4. User-Flow Reality Check

"Does the code exist?" and "Does it actually work for a real user on a real site?" are different questions. This section reasons from source to answer the second for each claimed capability.

---

### Native messaging bridge to desktop (port 8787) — live or just config?

**Verdict: Structurally live; functionally dependent on the desktop app being running.**

The bridge is not just config. `background.ts:383` calls `chrome.runtime.connectNative('com.agiworkforce.browser')` at service-worker startup, performs a two-step handshake (connect → ping, `background.ts:405–419`), and only transitions `connectionStatus` to `'connected'` after the ping succeeds. On disconnect it schedules exponential-backoff reconnects (base 1 s, max 30 s, 8 attempts, `background.ts:311–356`). A `state.isNativeConnected` flag gates every bridge-destined message; requests queued while disconnected are drained on reconnect (`background.ts:428–440`). The bridge URL defaults to `http://localhost:8787` via `DEFAULT_AGI_BRIDGE_URL` from `background/policy.ts`, overridable via `chrome.storage.local.agi_bridge_url`.

**What a user actually experiences without the desktop app running:** The popup shows "Disconnected" with a "Reconnect" button visible. The side panel renders the chat UI but any chat message falls through to the HTTP-fetch path at `background.ts:2900`; if that also fails (no desktop) it falls through to native messaging again, which rejects. The user sees an error bubble in the side panel. There is a secondary SSE provider-stream path (`background.ts:2838`) that can work without the desktop if the user has set `agi_use_provider_stream = true` and has a Supabase JWT in session storage — but this is off by default and requires server infrastructure.

**Gap:** There is no "desktop not running" first-run onboarding screen. A user who installs the extension without the desktop app open gets a disconnected state with no actionable guidance. Claude's extension degrades gracefully to the cloud; AGI's degradation is a hard error.

---

### LinkedIn / Lever autofill — real fills or stub?

**Verdict: Production-quality LinkedIn and Lever fills; not a stub.**

`src/features/content/autofill/filler.ts` implements `setNativeValue()` (`filler.ts:68`) using `Object.getOwnPropertyDescriptor` on the native prototype to bypass React's synthetic event system — the correct pattern for React-controlled inputs on both LinkedIn and Lever. `filler.ts:44` sanitizes every profile value: strips control characters, loops HTML-tag stripping to handle nested patterns like `<<script>`, and enforces a 2000-char cap before filling.

`src/features/content/autofill/linkedin.ts` defines layered selector arrays per field (e.g. `firstName`: `input[name="firstName"]` → `input[id*="first-name"]` → `input[aria-label*="First name" i]` → placeholder fallback, `linkedin.ts:22–30`). `lever.ts` extends this with Lever's `artdeco-text-input` patterns and a `detectLeverCustomFields()` function for ATS-specific custom questions.

**What a user actually experiences on LinkedIn Easy Apply today:** The autofill fires when the content script detects a LinkedIn/Lever page via `src/features/content/autofill/detector.ts`. If the user has a stored autofill profile (migrated from `chrome.storage.sync` to `chrome.storage.local` at startup, `background.ts:378`), fields are filled reactively. Custom fields on Lever ATS forms use a best-effort description-match fallback if a registered selector fails.

**Known limitation:** LinkedIn's DOM changes frequently. The selector arrays use `i` flag for case-insensitive `aria-label` matching which provides resilience, but DOM-structure changes (React version bumps on LinkedIn's side) can break individual fields until selectors are updated. There is no automated regression test against the live LinkedIn DOM.

---

### Platform-specific prompts (Slack/Gmail/etc.) — actually inject and respond?

**Verdict: Fully wired and live; prompts fire on every chat message sent from a matching domain.**

`background.ts:2786–2796` calls `getPlatformPrompt(tabUrl)` before building the messages array for every `CHAT_MESSAGE`. If the active tab's hostname matches a registered domain, the platform prompt is prepended as a `{ role: 'system', content: ... }` message. This happens server-side in the message array — not in the DOM — so it works regardless of whether the user has the in-page panel or side panel open.

`src/features/content/platform-prompts.ts` covers 10 domains: Slack, Gmail, Google Calendar, Google Docs, GitHub, Notion, Linear, Figma, Atlassian (Jira+Confluence), Microsoft Teams. Each prompt includes DOM selectors, keyboard shortcuts, and domain-specific navigation patterns so the LLM can give grounded, actionable answers (e.g. `.c-message` containers on Slack, `.jobs-easy-apply-form-section__grouping` for LinkedIn).

**What a user actually experiences:** Opening the side panel on GitHub and asking "how do I open a PR?" gets a response that knows about the `.` shortcut to open github.dev, the T file-finder, and the PR tab structure — because the system prompt was injected. On Gmail, asking "summarize unread messages" gets a response aware of `.zA` email row containers and J/K navigation.

**Caveat:** The prompts are static strings defined at build time. They do not reflect real-time DOM state; they tell the model _how_ the site works, not _what is currently on the page_. The page context snapshot (sent separately as `pageContext` in the chat message) covers live DOM content.

---

### Popup model picker — reads from canonical models.json?

**Verdict: Yes, strictly canonical; no hardcoded model IDs.**

`side_panel.ts:4–11` imports `getCoreManualModelOptions`, `normalizeModelId`, `getModelMetadataById`, `PROVIDER_DISPLAY`, `CAPABILITY_LABEL` from `@agiworkforce/types` — the package that owns `packages/types/src/models.json`. `side_panel.ts:173–181` builds `SIDE_PANEL_MODEL_OPTIONS` by calling `getCoreManualModelOptions()` at module load time and mapping each entry through `getModelMetadataById` for provider and quality-tier metadata. There are no hardcoded model-ID strings in `side_panel.ts` or `popup.ts`.

The `auto` option (`side_panel.ts:174`) maps to `getDefaultModelFor('extension')` via `background.ts:26` at message-send time, so even the default model routes through the canonical catalog rather than a literal string.

**What a user actually experiences:** The model dropdown in the side panel reflects whatever models are in `packages/types/src/models.json` at build time. Adding a new model to the catalog automatically appears in the picker on the next extension build with no extension-code changes required.

---

### Permissions UX — requests minimum required permissions?

**Verdict: Permissions are reasonable but broader than minimum; one permission is over-granted for the v1 scope.**

`manifest.json:8–20` requests: `activeTab`, `tabs`, `storage`, `nativeMessaging`, `alarms`, `contextMenus`, `sidePanel`, `scripting`, `cookies`, `notifications`, `tabGroups`.

- `activeTab`, `tabs`, `storage`, `nativeMessaging`, `sidePanel`, `scripting`, `notifications`: all actively used.
- `alarms`: used by `background/tasks.ts` for scheduled task execution — legitimately needed.
- `contextMenus`: used to register right-click capture actions — legitimately needed.
- `tabGroups`: used by `ADD_TAB_TO_GROUP` handler — legitimately needed.
- **`cookies`**: Listed in manifest but there is no `chrome.cookies` API call visible in the source tree. This is a medium-risk over-grant — cookie access is one of the most sensitive permissions and its absence from any code path suggests it was added speculatively. It should be audited and removed if not needed.

Host permissions are scoped to `localhost/*` and `127.0.0.1/*` only — intentionally minimal for the local bridge. No `<all_urls>` host permission is claimed in the manifest; the content script `matches` field uses `http://*/*` and `https://*/*` which grants content-script injection but not cookie or XHR access to arbitrary origins.

The content script runs at `document_idle` with `all_frames: false` — does not inject into iframes.

---

### Side panel — actually renders a chat UI or empty shell?

**Verdict: Fully rendered, production-quality chat UI with streaming, markdown, voice, model picker, shortcuts, and workflows tab.**

`side_panel.ts` builds the entire DOM programmatically using `el()` calls at lines `2926–3907`. The DOM is never an empty shell — on `DOMContentLoaded`, `initializeSidePanel()` constructs: header with model badge (`sp-model-badge`), settings bar, console panel, auth bar (API key input), tab bar (Chat / Workflows), message area with empty state, toolbar (context chip, thinking toggle, voice button), composer shell with attach menu, and a full workflows panel with shortcuts list and scheduled tasks list.

Streaming is wired: `background.ts` broadcasts `CHAT_CHUNK` messages; `side_panel.ts` handles them via `chrome.runtime.onMessage.addListener`, updates the streaming message bubble in place, and shows a blinking cursor (`sp-cursor::after`, `side_panel.ts:620`). Markdown rendering uses DOMPurify + marked (`sanitizeHtml` + `renderMarkdown` from `features/side-panel/markdown.ts`). Voice input uses the Web Speech API (`setupVoiceInput` from `features/side-panel/voice.ts`).

Conversation history persists across side-panel open/close cycles via `chrome.storage.local` (50-message cap, `side_panel.ts:219`). The Workflows tab renders saved shortcuts with replay/delete buttons and scheduled tasks with enable/disable toggles and a create-new-task form.

**What a user actually experiences:** Opening the side panel on any http/https page shows a fully functional dark-mode chat interface. The chat, model picker, shortcuts, workflow recording, and voice input are all live — not behind feature flags, not stubbed.

---

### Summary verdict table

| Capability                              | Claimed | Actually live | Caveats                                                       |
| --------------------------------------- | ------- | ------------- | ------------------------------------------------------------- |
| Bridge to desktop port 8787             | Yes     | Yes           | Requires desktop app running; no first-run offline onboarding |
| LinkedIn/Lever autofill                 | Yes     | Yes           | Selector staleness risk as LinkedIn DOM evolves               |
| Platform-specific prompts (10 sites)    | Yes     | Yes           | Static build-time prompts; not real-time DOM                  |
| Model picker from canonical models.json | Yes     | Yes           | Fully canonical; no hardcoded IDs                             |
| Minimum permissions                     | Mostly  | Mostly        | `cookies` permission over-granted, no callers found           |
| Side panel chat UI                      | Yes     | Yes           | Full streaming, markdown, voice, shortcuts, workflows         |

---

## 5. Where AGI Leads

**Important framing:** Claude for Chrome is explicitly experimental and paid-plan-gated ("Claude in Chrome requires a paid plan" — `01_sidebar-extension_empty-state_paid-plan-required-banner.png`). It is a cloud LLM front-end bolted to Chrome. AGI's extension is architecturally different — a local automation bridge — and several of our advantages are structural: Claude has no plausible path to them without rebuilding its product from scratch.

These are features Claude's extension demonstrably does not have:

1. **Multi-provider local bridge** (`src/features/native-bridge/index.ts`) — Claude is locked to Anthropic cloud; AGI routes through the desktop to any provider (Anthropic, OpenAI, Google, DeepSeek, xAI, Perplexity, Qwen, Moonshot, Zhipu, Ollama, LM Studio). Free-to-use providers + local models = no per-message cost for the extension.

2. **Job autofill** (`src/features/content/autofill/linkedin.ts`, `lever.ts`) — No equivalent in Claude. AGI auto-fills LinkedIn and Lever application forms using layered selector fallback. Unique feature for power users.

3. **Platform-specific context prompts** (`src/features/content/platform-prompts.ts`) — AGI auto-injects optimised assistant instructions on Slack, Gmail, Google Calendar, Google Docs, GitHub, Notion, Linear, Figma, Atlassian, and Microsoft Teams (10 platforms). Claude shows no equivalent.

4. **In-page floating panel** (`src/features/content/in-page-panel/`) — AGI injects a resizable panel directly into the page DOM. Claude's interaction is exclusively via the browser side panel.

5. **Memory CRUD editor in popup** (`popup.ts:816`) — Users can add, edit, and delete memory items inline in the extension popup. Claude has no visible extension-level memory management.

6. **Tab grouping** (`tabGroups` permission + `ADD_TAB_TO_GROUP`) — Claude has no tab organization feature.

7. **Developer console log viewer** (`#sp-console-panel`) — Useful for power users and developers; Claude has no equivalent.

8. **NLWeb / WebMCP tool discovery** (`src/features/content/nlweb.ts`, `webmcp.ts`) — AGI discovers tools advertised by web pages using NLWeb/MCP protocols; Claude shows no equivalent.

9. **Extended thinking per-message toggle** (`thinkingEnabled` in `SharedSidePanelContext`) — AGI allows users to enable extended thinking mode on a per-message basis.

10. **Session timer** — AGI popup shows elapsed session time; useful for billing-aware users.

---

## 5. Recommendations

### P0 — Blocking gaps (must close before launch parity claim)

**R26-PARITY-CHROME-01 (P0): "Act / Ask" autonomy toggle in side panel**
Claude's most prominent UX differentiator in the extension is the per-session "Ask before acting / Act without asking" toggle at the bottom of every chat. Without this, AGI has no explicit user control over whether automation runs unilaterally.

- Implement as a toggle in `#sp-composer-bar` or a bottom bar above the composer.
- Wire to a `agi_action_mode` key in `chrome.storage.local` consumed by `background.ts` action dispatch.
- Citation: `02_sidebar-extension_action-permission-dropdown_ask-vs-act.png`, `07_sidebar-extension_quick-mode-active_haiku-act-without-asking.png`

**R26-PARITY-CHROME-02 (P0): Inline per-action permission prompt during tasks**
Claude shows a mid-task "New permissions required — Allow / Decline / Always allow on this site" card inside the side panel while an automation is running. AGI's allowlist is only manageable at popup-open time, not inline during a running task.

- Add a `PERMISSION_REQUIRED` message type from background that renders an inline consent card in the side panel.
- Citation: `2026-05-15/406_claude-chrome_site-permission-action-prompt.png`

### P1 — High-value gaps (target R26)

**R26-PARITY-CHROME-02b (P1): First-run offline / desktop-not-running onboarding**
The User-Flow Reality Check established that when the desktop app is not running, the extension's side panel and popup show a disconnected state with no actionable guidance. A new user who installs the extension without the desktop app gets a hard error with no explanation. Claude for Chrome degrades gracefully to the cloud; this is a discoverability cliff for AGI.

- Add a `DISCONNECTED` empty-state view in the side panel that explains "Open the AGI desktop app to connect" with a download link.
- Mirror this in the popup status card (currently only shows "Disconnected" with a Reconnect button, `popup.ts:186`).

**R26-PARITY-CHROME-03 (P1): Named tasks concept**
Claude converts a chat into a "Task" that runs in the background with completion notifications. AGI's automations are fire-and-forget. Tasks would enable long-running jobs and notification-on-done UX.

- Add a "Convert to task" action in the three-dot menu of `#sp-header` (matching Claude's `04_sidebar-extension_more-options-menu_task-settings-language.png`).
- Backed by `src/features/background/tasks.ts` which already exists — wire a UI surface to it.

**R26-PARITY-CHROME-04 (P1): Batch N/M progress counter**
Claude shows "Batch 2/3 actions — Stopped on error" summary cards with per-step expand. AGI shows individual tool-call rows but no aggregate batch counter or error-stopped state.

- Add batch grouping to the tool-call rendering path in `side_panel.ts`.
- Citation: `2026-05-15/406_claude-chrome_site-permission-action-prompt.png`, `2026-05-15/413_claude-chrome_shortcuts-list.png`

**R26-PARITY-CHROME-05 (P1): Dedicated Options page**
Claude has `chrome-extension://.../options.html` with Permissions / Shortcuts / Options / Log out sections. AGI has no full-tab settings page — everything is in the popup which is space-constrained.

- Create `src/options.html` + `src/options.ts` linked from manifest `"options_page"`.
- Migrate allowlist management and shortcut management out of popup into options page.

**R26-PARITY-CHROME-05b (P1): Remove over-granted `cookies` permission**
The User-Flow Reality Check found that `cookies` is listed in `manifest.json:17` but no `chrome.cookies` API calls appear anywhere in the extension source tree. Cookie access is among Chrome's most sensitive granted permissions and will trigger a prominent warning on Chrome Web Store review.

- Grep `chrome.cookies` across all source files to confirm no callers.
- If confirmed unused, remove `"cookies"` from `manifest.json` permissions array.
- This is a security hardening gap, not a parity gap, but it blocks CWS submission.

**R26-PARITY-CHROME-06 (P1): Quick mode / latency preset**
Claude's "Quick mode" (Haiku + Act without asking) is a one-tap way to switch to a fast, autonomous configuration. This reduces friction for repetitive tasks.

- Add a speed/fast-mode toggle in the model picker or as a dedicated button in `#sp-header-right`.
- Citation: `06_sidebar-extension_quick-mode-modal_model-options.png`, `07_sidebar-extension_quick-mode-active_haiku-act-without-asking.png`

### P2 — Polish / nice-to-have

**R26-PARITY-CHROME-07 (P2): Shortcut scheduling toggle**
Claude's "Create shortcut" modal has a Schedule toggle to run prompts on a cron-like schedule. AGI shortcuts are manual-only.

- Add a schedule field to the shortcut save UI in `#sp-save-shortcut-row` (currently in `side_panel.ts:875`).
- Wire to `chrome.alarms` API (already listed in `manifest.json:12`).
- Citation: `2026-05-15/414_claude-chrome_record-workflow-entry.png`

**R26-PARITY-CHROME-08 (P2): Language selector in three-dot menu**
Claude exposes a language picker under "Language" in the three-dot menu. AGI has no equivalent.

- Add a language preference (stored in `chrome.storage.local`) to the settings UX.
- Citation: `04_sidebar-extension_more-options-menu_task-settings-language.png`

**R26-PARITY-CHROME-09 (P2): Blocked site full-tab overlay**
Claude redirects blocked pages to a branded `blocked.html` that also blanks the page content. AGI's `#sp-blocked` shows only in the side panel; the page itself remains visible.

- Low priority — AGI's approach (side-panel-only block) is arguably less disruptive to the user's browsing.

---

## 6. Summary

Claude's Chrome extension is a full LLM chat client (cloud-backed) with strong workflow-automation UX: per-action consent, background tasks, shortcut scheduling, a dedicated settings page, and a quick-mode preset. AGI's extension is architecturally distinct — it is a bridge to a local desktop LLM, provider-agnostic, with job autofill, platform-context injection, in-page panel, and memory management features that Claude does not have.

**AGI is ahead** in: multi-provider support, local execution cost, platform-context awareness (10 platforms), job autofill, in-page panel injection, memory CRUD, tab grouping, NLWeb/MCP tool discovery, console log viewer, and extended thinking toggle.

**Claude is ahead** in: autonomy/consent UX (ask vs act toggle, inline permission prompts), background tasks with notifications, shortcut scheduling, dedicated settings page, quick-mode preset, batch progress counters, and language selection.

The P0 and P1 gaps (autonomy toggle, inline permission prompts, tasks, batch counters, options page, quick mode) represent the most user-visible deficiencies relative to Claude's extension today.

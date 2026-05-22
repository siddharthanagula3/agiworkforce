# GAP-EXT-CHROME — `apps/extension/` vs Anthropic "Claude in Chrome"

**Scope:** `apps/extension/` (MV3 v1.2.0; 22 source files / ~14,050 LOC; 15 tests).
**Reference SSOT:** `tasks/research/anthropic-claude-suite-may-2026.md` §7 (Claude Chrome ext) + `tasks/research/ui-05-claude-extensions.md` §A (UI patterns) + `tasks/research/deep/u5-utils-misc-subdirs.md` §4 (`claudeInChrome/` 7-file native-host inventory).
**Method:** read every source file, manifest, native-host template, INSTALL doc; grep for missing surfaces.
**Date:** 2026-05-08.

Anthropic "Claude in Chrome" is an MV3 side-panel browser agent on every paid plan. Native messaging host `com.anthropic.claude_code_browser_extension` is installed by the desktop CLI into the per-browser `NativeMessagingHosts/` dir for **7 Chromium variants** (Chrome, Brave, Arc, Chromium, Edge, Vivaldi, Opera — `u5-utils-misc-subdirs.md:152`, `setupPortable.ts:55-91`). Reads/clicks/fills/screenshots, multi-tab, **DOM + console + network**, records/replays workflows, schedules recurring tasks, voice mode (microphone optional). Two permission modes: `Ask before acting` (default — proposes plan, per-site allow rules persist) and `Act without asking` (free agentic exec). Sensitive actions (purchases, payments, financial) **always** require explicit per-action approval irrespective of mode. **Quick mode** (lightning-bolt header icon) is an experimental modal opt-in: bundles fastest model (Haiku 4.5) + auto-act flip into one preset; on Pro+/Max can also pick `Opus 4.6 (fast mode)` at premium rate. Patched to v1.0.70 May 6 2026 to fix **ClaudeBleed** (LayerX disclosure — shared-origin trust let any sibling extension issue commands; bypass via `Act without asking` still demonstrated). MCP catalog (per `prompt.ts:38-46` in the codex-rs reference, `setup.ts:1` imports `BROWSER_TOOLS` from `@ant/claude-for-chrome-mcp`): `tabs_context_mcp`, `tabs_create_mcp`, `tabs_close_mcp`, `read_console_messages` (regex filter), `read_network_requests`, `javascript_tool` (eval), `gif_creator` (multi-step recording), `read_page`, `get_page_text`, `find`, `form_input`, `file_upload`, `navigate`, `screenshot`, plus shortcuts/window-resize. Two transport modes: **native-messaging stdio** (default; 4-byte little-endian length prefix, 1MB max) + **WebSocket bridge** (gated `tengu_copper_bridge` flag — `wss://bridge.claudeusercontent.com`) for non-Chrome browsers. Not in scope of Anthropic ext: file-system access (Cowork has it), arbitrary-tab access without grouping, persistent cross-account sync (claude.ai account is implicit auth via session cookie).

---

## Have

- MV3 v1.2.0 manifest with `sidePanel`, `nativeMessaging`, `activeTab`, `tabs`, `cookies`, `notifications`, `tabGroups`, `alarms`, `scripting`, `storage`, `contextMenus` permissions (`manifest.json:8-20`).
- Side-panel rendering at `src/side_panel.html` + `side_panel.ts` (3,434 LOC) — chat surface with model picker, attachment bar, slash commands, context chip, Workflows tab.
- Toolbar popup at `src/popup.html` + `popup.ts` (588 LOC) — connection status, screenshot, tab-group, tier badge, paywall card.
- Native-messaging client to host `com.agiworkforce.browser` (`background.ts:106` `NATIVE_HOST_NAME`, full reconnect/backoff/handshake/permission-error halting at `:380-416`).
- Native-host template + INSTALL doc covering macOS, Linux, Windows registry — `native-host/INSTALL.md`, `com.agiworkforce.browser.json.template` (one origin, `<EXTENSION_ID_PLACEHOLDER>`).
- Tab management: `GET_ALL_TABS`, `CREATE_TAB`, `CLOSE_TAB`, `SWITCH_TAB` (`background.ts:1543-1622`), `tabGroups` API with auto-group `AGI Workforce` colour blue (`:452-466`).
- DOM-read: `GET_PAGE_INFO`, `GET_TEXT`, `GET_ATTRIBUTE`, `GET_FORMS`, `BUILD_ACCESSIBILITY_TREE` (`content.ts:246,231-249,1490`).
- DOM-mutation: `CLICK`, `DOUBLE_CLICK`, `RIGHT_CLICK`, `TYPE`, `SET_ATTRIBUTE`, `SELECT_OPTION`, `CHECK`/`UNCHECK`, `FOCUS`/`BLUR`, `HOVER`, `SCROLL`, `DRAG_DROP`, `CLICK_AT_COORDINATES`, `EXECUTE_SCRIPT`, `WAIT_FOR_SELECTOR`, `FILL_FORM`, `SUBMIT_FORM` (`content.ts:200-322`).
- Multi-step automation: `RUN_PAGE_ACTIONS` action-batch executor (`content.ts:593`).
- Workflow record-replay: `START_RECORDING`/`STOP_RECORDING`/`GET_RECORDED_ACTIONS` + `SAVE_SHORTCUT`/`LIST_SHORTCUTS`/`DELETE_SHORTCUT`/`REPLAY_SHORTCUT` (`background.ts:1235-1257`, `content.ts:1668-1707`). Persisted to `chrome.storage.local.agi_saved_shortcuts`, max 50 (`background.ts:115-117`).
- Recurring schedules: `CREATE/LIST/UPDATE/DELETE_SCHEDULED_TASK` with `chrome.alarms` periodic firing at hourly/daily/weekly/monthly cadence (`background.ts:556-695`); cap 50 tasks; survives MV3 SW restart via `restoreScheduledTaskAlarms()`.
- Console-read: `GET_CONSOLE_LOGS`/`CLEAR_CONSOLE_LOGS` via patched `console.*` ring buffer (200 entries / 1000 chars each — `content.ts:1753-1795`). Allowlist-gated (`patchConsoleIfAllowlisted` `:1734`).
- Cookie read/write/clear: `GET_COOKIES`, `SET_COOKIE`, `CLEAR_COOKIES` with explicit `BLOCKED_COOKIE_DOMAINS` blocklist of 27+ regex patterns (banks, gov, GitHub, Slack, Notion, supabase, agiworkforce — `background.ts:1363-1426`).
- Screenshot: `chrome.tabs.captureVisibleTab` PNG/JPEG via `CAPTURE_SCREENSHOT` (`background.ts:985-1028`); also via `Cmd+Shift+C` chord (`manifest.json:64-70`, `background.ts:2034-2042`).
- Per-site allowlist: `chrome.storage.local.agi_site_allowlist` gates message acceptance and console-patching, not just cookies (`background.ts:713-749`, `content.ts:1734-1750`).
- Cross-tab DOM mutation block: `DOM_MUTATION_MESSAGE_TYPES` (`background.ts:771-806`) plus `senderTabAllowedToMutate` enforcement (`:808-814`).
- Streaming chat (provider stream → bridge → native-messaging fallback chain in `handleChatMessage` `background.ts:2492-2776`); SSE buffer-aware so split TCP segments don't drop deltas.
- API-gateway integration: `agi_use_provider_stream` toggle, `agi_gateway_url` allowlist-validated against `*.agiworkforce.com` HTTPS-only (`:2216-2236`), Supabase JWT in `chrome.storage.session.agi_supabase_jwt`.
- 30-min `/api/me` tier refresh alarm + `agi_user_tier` cache → tier badge in popup (`background.ts:2380-2392`).
- Paywall card UI in popup (`PAYWALL_HIT` runtime broadcast → `showPaywallCard` plain-DOM construction `popup.ts:473-541`).
- WebMCP discovery: `discoverDeclarativeTools` (HTML `<form tool-name="…">` elements) + `discoverImperativeTools` via `window.__webmcp_test__` / global registry (`webmcp.ts:64-208`); MutationObserver-based `WEBMCP_TOOLS_CHANGED` broadcast.
- NLWeb auto-discovery (`nlweb.ts:316`) — meta tags + `/.well-known/nlweb` probe with SSRF-blocking validator (`background.ts:2094-2132`).
- 8 context-menu items: `Ask`, `Explain`, `Translate`, `Summarize page`, `Capture Element`, `Get Element Info`, `Discover AI Tools`, `Add Tab to Group` (`background.ts:1860-1870`).
- 6 slash commands inside side-panel composer: `/summarize` `/explain` `/translate` `/extract` `/code` `/tldr` (`side_panel.ts:1699-1755`).
- Page-aware action chips (in-page overlay panel): generic Summarize/KeyPoints/Q&A/Translate, plus YouTube watch (Summarize video, Key timestamps, Q&A) and GitHub PR (Explain diff, Review comments, PR summary) variants (`inPagePanel/pageActions.ts`).
- 8 platform-aware system prompts (Slack/Gmail/Calendar/Docs/GitHub/Notion/Linear/Figma) injected ahead of user message (`platform-prompts.ts`).
- In-page floating chat overlay (FAB launcher + 380-px slide-in panel) with persistent position via `agi_panel_launcher_pos`, scroll-hide, Shadow-DOM isolated, keyboard-Escape close, redact-CC-numbers + redact-password-lines before prompt build (`inPagePanel/{launcher,panel,pageActions,setup,panelStyles}.ts`).
- Voice input: Web Speech API `SpeechRecognition`/`webkitSpeechRecognition` with mic-pulse animation in side panel (`side_panel.ts:1638-1697`).
- Job-application autofill (LinkedIn + Lever detector/filler — `autofill/{detector,filler,lever,linkedin}.ts` 1,457 LOC) — non-Anthropic feature; AGI-specific differentiator.
- Page-context fingerprint dedup (5s window) before pushing to native (`background.ts:1679-1689`).
- 13-provider model picker grouped by provider with capability tier sub-labels and Extended Thinking toggle (`side_panel.ts:165-194,2153-2232`).
- Markdown renderer (in-house regex) + DOMPurify hardening with `target=_blank` ⇒ `rel=noopener noreferrer` enforced via `afterSanitizeAttributes` hook (`side_panel.ts:1349-1488`).
- Bridge-URL validation: only `localhost` / `127.0.0.1` / `[::1]` accepted (`background.ts:2138-2162`).
- Chat-fence prompt-injection mitigation: per-request 16-hex random nonce on the `<page_context_…>` delimiter (`:2548-2553`).
- Page-text extraction security hardening: `innerText` not `outerHTML` so `<script>`, `<style>`, comments, hidden DOM are excluded (`content.ts:69-95`).
- Service-worker keep-alive at `0.5 min` chrome.alarm (Chrome silently bumps to 1 min).

---

## Partial

### Side-panel UX (≈ 70 % of Claude parity)

**Have:** Side-panel docks via Chrome's first-party panel; chat composer at bottom; model picker top-left; conversation persistence (`agi_side_panel_messages`, max 50); slash-command chips on empty state; voice mic; settings bar with bridge URL; tabs `Chat` / `Workflows`.
**Gap vs Claude (`ui-05-claude-extensions.md` §A.5):** No persistent paid-plan / capability banner above composer; no `Convert to task` kebab item that wraps the active conversation as a recurring schedule (Claude C-04); no language picker submenu; no `Type / for commands` rotating empty-state placeholder; the composer footer pill is a static `Best (auto)` model badge, not the action-permission pill (see Missing §1). Two tabs (Chat/Workflows) are AGI-specific — Claude has no Workflows tab; recordings live behind the kebab.
**Effort:** 3 days to add persistent capability banner, language submenu, `/` placeholder rotation, and `Convert to task` kebab item that prefills the New-Task form with the current conversation prompt.

### Per-site permissions (≈ 50 %)

**Have:** `chrome.storage.local.agi_site_allowlist` gates **all** message acceptance + console patching + cookie domains. User must add a site explicitly before automation works.
**Gap vs Claude:** No per-site allow-rules persistence keyed by **plan name** (Claude proposes a plan citing the sites it'll touch; user approves; the rule sticks for that plan-shape). No ApprovedSitesUI in popup (the allowlist is set silently from somewhere else; no docs in the popup explain how the user adds a site). No "this site can read/write" disclosure popover.
**Effort:** 4 days for plan-shape + per-rule allow with TTL; 1 day for popup ApprovedSites UI + onboarding.

### Page-text reading (≈ 80 %)

**Have:** `extractPageHtmlSafely` returns `body.innerText` truncated to 100KB chars; metadata via `page-metadata.ts`; selected-text capture; accessibility tree builder.
**Gap vs Claude:** No `read_page` semantic-extract that mirrors Claude's structured DOM-with-roles output (returns ARIA nodes alongside text); no `find` regex/text search that returns occurrences; `get_page_text` collapses to `innerText` only — Claude's variant returns Markdown-rendered text preserving headings/lists.
**Effort:** 2 days for Markdown-pass + ARIA-roles wrapping; 1 day for `find`-with-occurrences.

### Console reading (≈ 75 %)

**Have:** `patchConsole` ring buffer 200 entries, level + message + timestamp; `GET_CONSOLE_LOGS` + `CLEAR_CONSOLE_LOGS`.
**Gap vs Claude:** No regex pattern filter at read-time (Claude's `read_console_messages` accepts a regex; ours dumps the entire buffer); no JS error-event listener (only `console.*` patches — uncaught `ErrorEvent` / `unhandledrejection` is dropped); no source-location capture.
**Effort:** 1 day for regex filter; 1 day for `error`/`unhandledrejection` listeners with stacktrace.

### Quick actions (≈ 65 %)

**Have:** 6 slash commands in side-panel composer; 4 generic action chips on in-page overlay; YouTube watch + GitHub PR custom chips.
**Gap vs Claude:** No "suggested prompts based on the current page" surfaced inside the side panel's empty state (Claude shows context-aware suggestions in C-01 — e.g. on YouTube it shows `Summarize this video`); no `gif_creator` multi-step recording chip (one-click "demonstrate this then save").
**Effort:** 1 day for context-aware suggestions; 4 days for `gif_creator`-style guided demonstration → shortcut.

### Workflow record/replay (≈ 80 %)

**Have:** Module-level `_userRecordedActions` buffer in content script captures click/type/scroll/navigate; `chrome.storage.local.agi_recorded_actions` persistence; `RUN_PAGE_ACTIONS` replay; per-shortcut Save dialog in Workflows tab; visible recording indicator (`showRecordingIndicator`).
**Gap vs Claude:** No GIF or video export of recordings (Claude `gif_creator` produces a shareable artifact); no "edit recorded steps" UI between Stop and Save (you can only discard or save verbatim); no cross-tab recording (a click on Tab A then click on Tab B fails because the content script per tab has separate buffers); no "send recording to a colleague" share affordance.
**Effort:** 5 days for cross-tab recording session ID; 4 days for GIF export via `MediaRecorder` of `chrome.tabs.captureVisibleTab` series; 3 days for inline step-editor.

### Recurring schedules (≈ 90 %)

**Have:** `ScheduledTask` with `hourly`/`daily`/`weekly`/`monthly` cadence, prompt OR shortcutId, `chrome.alarms` periodic, lastRun timestamp, restore-on-SW-restart, 50-task cap, prompt-length cap 10,000 chars. Toggle on/off per task in Workflows panel.
**Gap vs Claude:** No `Convert to task` from active conversation (the only path is `+ New Task` → manually re-enter prompt). Claude's "Convert to task" wraps the entire conversation history. No cron-style custom expression (only the 4 fixed cadences).
**Effort:** 1 day for `Convert to task` action (read last user message, prefill form, focus name input); 2 days for cron-expression scheduleType + parser.

### Native messaging host (≈ 35 %)

**Have:** `com.agiworkforce.browser` JSON template at `native-host/com.agiworkforce.browser.json.template`; INSTALL.md covers macOS / Linux / Windows registry registration; `_host_permissions_note` documents fixed `localhost/*` 127.0.0.1 fallback.
**Gap vs Anthropic CLI auto-install (`u5-utils-misc-subdirs.md:152`, `setupPortable.ts:55-91`):** **No Brave / Arc / Chromium / Edge / Vivaldi / Opera manifest paths documented in INSTALL.md** — only Chrome and Chromium for macOS, Chrome and Chromium for Linux. Anthropic's CLI writes to **all 7 supported Chromium browser data dirs** automatically. No `setupPortable.ts`-style discovery that scans every browser × every profile (`Default`, `Profile *`) for the extension `Extensions/<id>/` directory. No automatic registry write for non-Chrome browsers on Windows. No first-install reconnect to `https://clau.de/chrome/reconnect`. No WebSocket bridge fallback (`wss://bridge.…`) — we have HTTP bridge to `localhost:8787` only. No PID-based version locking (`tengu_pid_based_version_locking`, `nativeInstaller/pidLock.ts:46`) so two CLI processes can race on the same manifest file.
**Effort:** 6 days for installer auto-write to 7 Chromium variants × per-profile detection + Windows registry writes; 3 days for WebSocket bridge transport mode + URL-validation; 1 day for first-install reconnect URL.

### Slash + at commands (≈ 50 %)

**Have:** 6 slash commands in side-panel composer (`/summarize`, etc.); slash-cmd chips in empty state.
**Gap vs Claude (`/model`, `/clear` visible in V-09 history but presumed in Chrome ext too):** No `/model` mid-conversation switch (must close kebab, click model selector); no `/clear` slash command (must click trash icon); no `@` context picker (mention a tab, mention a saved screenshot); no slash-command autocomplete dropdown when typing `/` (we render chips on empty state only).
**Effort:** 2 days for `/`-autocomplete dropdown; 2 days for `@tab` + `@image` context picker; 0.5 day for `/model`/`/clear` parser branches.

---

## Missing

### 1. Side-panel **action-permission pill** (Ask vs Act mode)

Anthropic's most diagnostic UX (C-02): a low-emphasis pill in the bottom-left of the composer reading `Ask before acting v` / `Act without asking v` with the corresponding glyph (hand-stop / fast-forward `>>`). Opening the menu shows two rows with one-line subtitles, the selected one carries a blue check. Selection mirrored on the trigger so the composer footer always shows the live permission stance. **Missing entirely** in `apps/extension/`. We have an allowlist gate at the per-site level, but no plan-vs-execute confirmation gate. **The single biggest design lesson from `ui-05-claude-extensions.md` §A.2.** Effort: 6 days (state model + gate insertion before each `RUN_PAGE_ACTIONS` action; UI pill; persistence; default `ask`).

### 2. **Quick mode** (lightning-bolt icon) experimental modal opt-in

Anthropic's C-06 + C-07 modal: title `Quick mode is experimental`; body warning to monitor closely + avoid sensitive workflows; two CTAs `Enable with Haiku 4.5` (white) / `Enable with Opus 4.6 (fast mode)` (dark, premium-billed); footer rate-limit copy. Active state: bolt fills orange, model auto-flips to chosen fast model, action-permission pill auto-flips to `Act without asking`. Missing entirely. Effort: 4 days (modal + bundled state flip + premium-billing API call + post-onboarding tooltip).

### 3. **Sensitive-action always-approve list**

Per `anthropic-claude-suite-may-2026.md` §7.3 final paragraph: "Regardless of mode, certain sensitive actions (purchases, sharing files, making payments, accessing financial data) **always** require explicit per-action approval." That carve-out is hard-coded into Claude's action gate independent of `Ask`/`Act` selection. **Missing.** We block cookies on financial domains via `BLOCKED_COOKIE_DOMAINS` regex (`background.ts:1363-1426`) but there is no equivalent action-class filter for click/type events that would land on a payment-button selector. Effort: 4 days (action-class classifier — selector heuristics + URL/origin combinator + LLM-side hint + always-approve modal).

### 4. **Network reading** — `read_network_requests`

Claude's MCP catalog (`u5-utils-misc-subdirs.md:160`) exposes `read_network_requests`, returning Fetch/XHR records with method/URL/status/duration/payload. Implementation typically uses `chrome.devtools.network` on installed devtools or a `Performance` + `PerformanceResourceTiming` sweep + a `fetch`/`XMLHttpRequest` proxy installed at `document_start`. **Missing.** We grep zero hits for `chrome.webRequest`, `chrome.devtools.network`, `XMLHttpRequest.prototype` patches, `PerformanceResourceTiming`, or any equivalent. Effort: 5 days (content-script `fetch`/`XHR` patches with same allowlist gate as console-patching + ring-buffer + regex filter at read).

### 5. **`gif_creator` multi-step recording**

Claude's `gif_creator` MCP tool produces a shareable GIF/MP4 of the demonstration with overlaid action labels — used in marketing + as a "send your colleague this workflow" affordance. Missing. Effort: 5 days (`MediaRecorder` over `chrome.tabs.captureVisibleTab` series + per-frame label burn-in + `chrome.downloads.download` save).

### 6. **`file_upload` MCP tool**

Claude's catalog includes `file_upload` (programmatic file selection on `<input type=file>` elements). Our composer's `+` menu has only **screenshot + add-image**, no general file upload (mirrors Claude's restriction in C-03 — but Claude does expose `file_upload` to Claude itself for autofill). We have `AUTO_FILL_JOB_APPLICATION` for the resume field via the Lever/LinkedIn modules but no general drop-target programmatic upload. Effort: 2 days (synthetic `DataTransfer` + `dispatchEvent` through scripting API).

### 7. **Voice mode** end-to-end (microphone permission + LLM TTS reply)

Anthropic ships voice mode (mar-2026 update per `anthropic-claude-suite-may-2026.md` §7.6). Microphone permission is an **optional** install-time scope. `manifest.json` does **not** request `audioCapture` or `mediaDevices`. We have **input-only** voice via Web Speech API `SpeechRecognition` (`side_panel.ts:1638-1697`) — the response is text-only, no TTS playback. Missing: declared microphone permission, ChatGPT-style continuous voice mode, ElevenLabs/native TTS for assistant turns. Effort: 4 days (manifest scope + getUserMedia + push-to-talk UI + TTS endpoint or Web Speech `speechSynthesis`).

### 8. **Native-host installer for 7 Chromium variants**

Per `u5-utils-misc-subdirs.md:152` Anthropic's CLI writes the manifest into Chrome, Brave, Arc, Chromium, Edge, Vivaldi, Opera per-browser data dirs and per-user-profile (`Default`, `Profile *`). Our INSTALL.md covers Chrome+Chromium only on macOS+Linux and Chrome on Windows. **Missing 5 browsers × auto-install entirely.** Effort: 6 days (port `setupPortable.ts` table + per-OS dir resolver + Windows reg-add per browser + extension-detect scan).

### 9. **WebSocket bridge transport (`wss://bridge.…`)**

Anthropic's `mcpServer.ts:51-72` provides a WebSocket fallback for non-Chrome browsers and remote dev environments — gated `tengu_copper_bridge` flag. We have HTTP bridge to `localhost:8787` only — no WebSocket and no remote bridge. Effort: 3 days (bridge URL config validation + WS client + reconnect/backoff parity).

### 10. **First-install reconnect deep-link (`clau.de/chrome/reconnect`)**

Anthropic opens this URL in the user's default Chrome when the manifest is freshly written AND the extension is detected installed (`u5-utils-misc-subdirs.md:172`). We have no equivalent — install requires a manual extension reload. Effort: 0.5 day.

### 11. **Claude account sync** (cross-device conversation continuity)

Anthropic Chrome ext "syncs to claude.ai when started from the same account" (`anthropic-claude-suite-may-2026.md:435`). Missing. We persist conversations to `chrome.storage.local` only — no Supabase upload, no Realtime, no cross-device. Effort: 5 days (Supabase JWT → upload conversations table; Realtime subscription for cross-device echoes; merge logic).

### 12. **Subscription gating for Hobby+ features**

Anthropic Chrome ext is **paid-plan only** (banner in C-04, C-05, C-07: "Claude in Chrome requires a paid plan"). We have a paywall card (`PAYWALL_HIT` broadcast → `popup.ts:473-541`) but the underlying gate is server-side and doesn't enforce on the extension surfaces. No persistent capability banner inside the side panel for unentitled users. Effort: 1 day for persistent banner; gate enforcement is server-side and out-of-scope here.

### 13. **`shortcuts_execute` / `shortcuts_list` MCP tools**

Anthropic's per-prompt tool catalog includes `shortcuts_execute` and `shortcuts_list` for surface keyboard chords. Our extension has saved shortcuts (workflow recordings) but no MCP-callable `shortcuts_*` interface. Effort: 1 day (wrap `LIST_SHORTCUTS` + `REPLAY_SHORTCUT` as MCP-shaped responses).

### 14. **`resize_window` MCP tool**

Claude exposes `resize_window` to programmatically resize browser windows. We have no equivalent (`chrome.windows.update` API is available but unused). Effort: 0.5 day (wire `chrome.windows.update({ width, height })`).

### 15. **`switch_browser`** (multi-browser orchestration)

Claude's catalog includes `switch_browser` for cross-browser handoff. AGI-N/A unless we ship the WebSocket bridge first; effort folded into §9.

### 16. **`get_page_text` returning Markdown-rendered**

Claude returns Markdown so the LLM gets headings/lists structure. We return whitespace-collapsed `innerText`. Effort: 2 days (HTML→Markdown via Turndown + heading-only retention).

### 17. **Per-site usage analytics / "this site visited 3 times" surface**

Anthropic surfaces site-level visit counts in the suggested-prompts experience. Missing in our extension. Effort: 2 days (storage histogram + display in popup).

### 18. **Multi-tab recording session**

Recording today is tied to one content script (one tab). Claude's recorder spans tabs; clicking a link to open a new tab continues the recording in the new tab. **Missing.** Effort: 5 days (background-coordinated session ID, `chrome.tabs.onCreated` handoff, content-script join via `chrome.runtime.sendMessage` rendezvous).

### 19. **Conversation history surface in side panel**

`ui-05-claude-extensions.md §A.10`: Chrome ext has only `+` new-chat — no recents drawer is visible in 7 frames; **inferred** to live behind the kebab (Claude's `Convert to task`, `⚙ Settings`, `🌐 Language`). We have **no conversation list** at all — switching to a new chat just erases history (`chrome.storage.local.agi_side_panel_messages` is single-conversation). Effort: 3 days (multi-conversation index + sidebar drawer + click-to-resume).

### 20. **Language picker submenu (kebab `🌐 Language >`)**

Anthropic's C-04 kebab includes a language selector with a chevron-driven submenu. We have none. Effort: 1 day (i18n stub + selector).

### 21. **Microphone permission scope declaration**

`manifest.json` lacks `permissions:["audioCapture"]` AND lacks any `host_permissions` for `https://*` mic-capable contexts. The Web Speech API `SpeechRecognition` works in the side panel because it's a permission-dialog UX, but a declared scope is more user-visible. Missing. Effort: 0.5 day.

---

## Per-axis percentage

| Axis                                                                                           | Coverage | Notes                                                                                                                                                            |
| ---------------------------------------------------------------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Browser automation (DOM read/click/type/scroll/select/check/drag/navigate/screenshot)          | **88 %** | All canonical mutation+read types shipped (`content.ts:200-322`). Gap: no `read_network_requests`, no `gif_creator`.                                             |
| Page reads (innerText, accessibility tree, metadata, forms)                                    | **80 %** | Solid `innerText`+a11y; gap: Markdown-formatted `get_page_text`, regex `find`.                                                                                   |
| Console (level + ring buffer + regex filter + uncaught errors)                                 | **65 %** | Buffer + level capture; gap: regex filter, error/rejection events, source location.                                                                              |
| Network (Fetch/XHR record + filter)                                                            | **0 %**  | Entirely missing.                                                                                                                                                |
| Workflow record/replay (per-tab + cross-tab + GIF export + edit)                               | **45 %** | Per-tab record + replay + save shortcut; gap: cross-tab session, GIF export, step editor.                                                                        |
| Permissions (Ask vs Act + per-site rules + sensitive-always-approve + permission UI)           | **30 %** | Per-site allowlist + cross-tab block + cookie blocklist; gap: action-permission pill, sensitive-actions classifier, plan-shape rules, in-popup ApprovedSites UI. |
| Quick mode (bolt icon + experimental modal + bundled state flip)                               | **0 %**  | Not implemented.                                                                                                                                                 |
| Voice (mic permission + STT + TTS + continuous voice mode)                                     | **35 %** | Web Speech STT input only; gap: mic permission scope, TTS playback, continuous mode.                                                                             |
| Sync (Claude-account → conversations sync to claude.ai)                                        | **0 %**  | Local-only `chrome.storage.local`; gap: Supabase upload + Realtime.                                                                                              |
| Recurring schedules                                                                            | **90 %** | All 4 cadences + alarm restore; gap: `Convert to task` shortcut + cron-expression.                                                                               |
| Native-host installer (Chromium variants × profiles, manifest auto-write, registry, reconnect) | **35 %** | Template + 1-OS doc; gap: 6 browsers, auto-discovery, reconnect URL, WS bridge, PID-lock.                                                                        |

---

## Surface percentage

**Overall coverage: ≈ 60 %** (DOM-read+mutation feature parity is high but the most important Claude-specific UX — permission pill, sensitive-actions list, Quick mode, network reading, multi-browser native-host installer, account sync — is wholly or mostly missing).

---

## Effort to reach 100 % (days)

| Workstream                                                                                                 | Days            | Owner                |
| ---------------------------------------------------------------------------------------------------------- | --------------- | -------------------- |
| Action-permission pill (Ask vs Act) + sensitive-actions classifier                                         | 10              | Frontend + state     |
| Quick mode (modal + bundle + premium-billing call)                                                         | 4               | Frontend + billing   |
| Network reading (`fetch`/XHR proxy + ring buffer + regex filter)                                           | 5               | Content script       |
| GIF creator (MediaRecorder + `captureVisibleTab` series + label burn-in)                                   | 5               | Content + bg         |
| Native-host installer for 7 Chromium variants × per-profile auto-discovery + Windows reg                   | 6               | Desktop CLI          |
| WebSocket bridge transport (`wss://bridge.…` parity)                                                       | 3               | Background           |
| First-install reconnect URL + multi-tab recording session                                                  | 5.5             | Background + content |
| Claude-account sync via Supabase Realtime conversations                                                    | 5               | Background + RPC     |
| Multi-conversation history drawer + `Convert to task` shortcut                                             | 4               | Side panel           |
| Voice end-to-end (mic scope + TTS playback + continuous mode)                                              | 4               | Side panel           |
| Misc (Markdown `get_page_text`, language submenu, ApprovedSites UI, cron, regex `find`, suggested-prompts) | 10              | Side panel + popup   |
| **Total**                                                                                                  | **≈ 61.5 days** | one engineer         |

If parallelised across 3 engineers (Native-host CLI, Side-panel + Popup, Content-script + Background) the critical path is **≈ 21 working days** (4 weeks) with the action-permission pill + sensitive-actions classifier on the longest fork.

---

## Key files referenced (absolute paths)

- `/Users/siddhartha/Desktop/agiworkforce/apps/extension/manifest.json`
- `/Users/siddhartha/Desktop/agiworkforce/apps/extension/src/background.ts` (2,936 LOC)
- `/Users/siddhartha/Desktop/agiworkforce/apps/extension/src/content.ts` (2,063 LOC)
- `/Users/siddhartha/Desktop/agiworkforce/apps/extension/src/side_panel.ts` (3,434 LOC)
- `/Users/siddhartha/Desktop/agiworkforce/apps/extension/src/popup.ts` (588 LOC)
- `/Users/siddhartha/Desktop/agiworkforce/apps/extension/src/inPagePanel/{launcher,panel,pageActions,setup,panelStyles}.ts`
- `/Users/siddhartha/Desktop/agiworkforce/apps/extension/src/autofill/{detector,filler,lever,linkedin}.ts`
- `/Users/siddhartha/Desktop/agiworkforce/apps/extension/src/{webmcp,nlweb,page-metadata,platform-prompts,providerStreamClient,types,utils}.ts`
- `/Users/siddhartha/Desktop/agiworkforce/apps/extension/native-host/{INSTALL.md,com.agiworkforce.browser.json.template}`
- `/Users/siddhartha/Desktop/agiworkforce/tasks/research/anthropic-claude-suite-may-2026.md` §7
- `/Users/siddhartha/Desktop/agiworkforce/tasks/research/ui-05-claude-extensions.md` §A
- `/Users/siddhartha/Desktop/agiworkforce/tasks/research/deep/u5-utils-misc-subdirs.md` §4

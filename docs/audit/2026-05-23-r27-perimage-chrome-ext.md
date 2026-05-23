# R27-PARITY Per-Image Chrome Extension Audit

**Date:** 2026-05-23
**Lane:** L-CHROME-EXT
**Auditor:** chrome-ext-engineer
**Images enumerated:** 18 of 20 expected (2 missing from `find` enumerate — gap noted in header)
**AGI source:** `apps/extension/` v1.2.0
**Parent context:** `docs/audit/2026-05-22-claude-parity-w5-chrome-ext.md`

---

## Legend

| Symbol | Meaning                                                                        |
| ------ | ------------------------------------------------------------------------------ |
| ✅     | AGI matches or leads Claude                                                    |
| 🟡     | Partial — AGI has an equivalent but materially weaker                          |
| ❌     | Missing — Claude has it, AGI does not (release risk)                           |
| 🔄     | Different-by-design (architectural difference, not a gap)                      |
| 🚧     | v2-deferred; placeholder required by `[[v1-cloud-bridge-strategy-2026-05-23]]` |

---

## 1. Per-Image Scorecard (18 images)

### Image 01: `01_sidebar-extension_empty-state_paid-plan-required-banner.png`

**Claude shows:** Side panel on YouTube. Persistent banner at bottom: "Claude in Chrome requires a paid plan — Upgrade plan". Model badge: Sonnet 4.6. Input placeholder: "Type / for commands". Autonomy bar: "Ask before acting" at bottom.

**AGI implementation:**

- Side panel empty state: `side_panel.ts:3096–3117` — `#sp-empty` renders "What can I help with?" with a feature-list subtext.
- Paywall card: `popup.ts:481` — `showPaywallCard()` exists; `PAYWALL_HIT` message type handled. AGI gates at per-feature level with tier labels, not at extension-open level.
- Autonomy toggle: no implementation found (see img 02 below).
- Input placeholder: `side_panel.ts:3027` — `#sp-auth-input` shows API key input, not slash-command placeholder.

**Verdict:** 🟡 v1 — Partial. Empty-state exists but autonomy bar absent; slash-command placeholder missing; paywall is feature-level vs session-level (acceptable architectural difference per [[v1-cloud-bridge-strategy-2026-05-23]]).

**Image path:** `reference/ui/chrome-extension/claude/01_sidebar-extension_empty-state_paid-plan-required-banner.png`
**Source:** `apps/extension/src/side_panel.ts:3096`, `apps/extension/src/popup.ts:481`

---

### Image 02: `02_sidebar-extension_action-permission-dropdown_ask-vs-act.png`

**Claude shows:** Dropdown with two items: "Ask before acting — Claude aligns on its approach before taking actions" (checked with blue checkmark) and "Act without asking — Claude takes actions without asking for permission". Toggle rendered in bottom bar of side panel.

**AGI implementation:**
Grep for `agi_action_mode`, `action.mode`, `ask.*before`, `act.*without`, `autonomy`, `permission.mode`, `actionMode` across `apps/extension/src/side_panel.ts` returns no results. No autonomy/action-mode toggle exists anywhere in the extension source tree.

**Verdict:** ❌ v1 BLOCKER — Completely absent. Claude's most prominent side-panel UX differentiator. AGI has no per-session consent control over whether automations run unilaterally.

**Fix required:**

- Add a `agi_action_mode` key to `chrome.storage.local` (values: `'ask'` | `'act'`).
- Render a toggle button in the composer bar (below `#sp-composer`) using `var(--agi-ext-accent)` for active state.
- `background.ts` action dispatch must gate on this setting before executing browser actions.

**Image path:** `reference/ui/chrome-extension/claude/02_sidebar-extension_action-permission-dropdown_ask-vs-act.png`
**Source:** No source — absent

---

### Image 03: `03_sidebar-extension_attachment-menu_screenshot-image-options.png`

**Claude shows:** Attachment menu with two items: "Take a screenshot" and "Add an image". Yellow dashed active-context border around the entire side panel. Paid plan banner visible. "Act without asking" shown in autonomy bar (this session has autonomy mode active).

**AGI implementation:**

- Screenshot + image attachment: `side_panel.ts:1047` — `#sp-attach-menu` with `pendingAttachments` array. Screenshot capture and image upload both wired.
- Active context dashed border: Grep for `dashed`, active-border patterns in `side_panel.ts` returns no CSS rule implementing a dashed outline. Claude's yellow dashed border communicates "Claude is actively reading this page" — AGI has no equivalent visual state.

**Verdict:** 🟡 v1 — Attachment menu is present (✅). Active-context border is absent (❌ secondary). No hardcoded colors: Claude's yellow = `var(--agi-ext-warning)` if implemented.

**Image path:** `reference/ui/chrome-extension/claude/03_sidebar-extension_attachment-menu_screenshot-image-options.png`
**Source:** `apps/extension/src/side_panel.ts:1047`

---

### Image 04: `04_sidebar-extension_more-options-menu_task-settings-language.png`

**Claude shows:** Three-dot (kebab) menu in side panel header with three items: "Convert to task", "Settings", "Language →". Yellow dashed active-context border. Paid plan banner.

**AGI implementation:**

- Grep for `three-dot`, `moreMenu`, `sp-more`, `kebab`, `more_vert` in `side_panel.ts`: no dedicated three-dot header menu element found. The header right (`#sp-header-right`, `side_panel.ts:2734`) contains: Summarize button, History dropdown, Clear button — no overflow menu.
- "Convert to task": `side_panel.ts:3483` — `sp-wf-new-task-btn` exists but is inside the Workflows tab, not in the side panel header menu.
- "Settings": no in-panel settings link.
- "Language": no language selector anywhere in extension source.

**Verdict:** 🟡 v1 — Partially addressed. Tasks exist in Workflows tab but the entry point from the three-dot header menu is absent. Language is ❌ missing.

**Image path:** `reference/ui/chrome-extension/claude/04_sidebar-extension_more-options-menu_task-settings-language.png`
**Source:** `apps/extension/src/side_panel.ts:2734`, `apps/extension/src/side_panel.ts:3483`

---

### Image 05: `05_sidebar-extension_model-selector-dropdown_opus-sonnet-haiku.png`

**Claude shows:** Model picker dropdown with three Anthropic-only options: Opus 4.6, Sonnet 4.6 (selected), Haiku 4.5. Paid plan banner. "Act without asking" in autonomy bar.

**AGI implementation:**

- Model picker: `side_panel.ts:4–11` imports `getCoreManualModelOptions`, `normalizeModelId`, `getModelMetadataById` from `@agiworkforce/types`. `side_panel.ts:173–181` builds `SIDE_PANEL_MODEL_OPTIONS` via `getCoreManualModelOptions()` — fully canonical, reads from `packages/types/src/models.json`. No hardcoded model IDs.
- AGI exposes 13+ providers vs Claude's 3 Anthropic-only models — AGI leads here.

**Verdict:** ✅ v1 AHEAD — AGI's model picker is strictly canonical (no hardcoded IDs) and exposes far more providers. Claude is locked to Anthropic cloud; AGI is provider-agnostic per [[v1-cloud-bridge-strategy-2026-05-23]].

**Image path:** `reference/ui/chrome-extension/claude/05_sidebar-extension_model-selector-dropdown_opus-sonnet-haiku.png`
**Source:** `apps/extension/src/side_panel.ts:173`

---

### Image 06: `06_sidebar-extension_quick-mode-modal_model-options.png`

**Claude shows:** "Quick mode is experimental" modal with caution copy. Three buttons: "Enable with Haiku 4.5", "Enable with Opus 4.6 (fast mode)" (extra billing note), "Go back".

**AGI implementation:**
Grep for `quick.mode`, `quickMode`, `fast.mode`, `fastMode`, `lightning`, `speed.mode` across all `apps/extension/src/` returns no results. No quick mode / speed preset exists.

**Verdict:** ❌ v2 — Not a v1 blocker (Claude's quick mode is experimental and paid-only). Recommended as P1 post-v1. Implement as a `agi_quick_mode` storage flag toggling fastest available model + `'act'` mode together.

**Image path:** `reference/ui/chrome-extension/claude/06_sidebar-extension_quick-mode-modal_model-options.png`
**Source:** No source — absent

---

### Image 07: `07_sidebar-extension_quick-mode-active_haiku-act-without-asking.png`

**Claude shows:** Quick mode active state — Haiku 4.5 model badge, orange/red lightning-bolt button in header (filled background), tooltip "Quick mode". "Act without asking" shown in autonomy bar. Yellow dashed border active.

**AGI implementation:**

- Quick mode visual: absent (per img 06 above).
- Autonomy bar "Act without asking": absent (per img 02 above).
- Lightning bolt icon: `side_panel.ts` header buttons are Summarize, History, Clear — no speed/mode badge.

**Verdict:** ❌ v1 BLOCKER (autonomy bar component) / ❌ v2 (quick mode UI). The autonomy bar "Act without asking" label shown here is the same v1 blocker established in img 02.

**Image path:** `reference/ui/chrome-extension/claude/07_sidebar-extension_quick-mode-active_haiku-act-without-asking.png`
**Source:** No source — absent

---

### Image 401: `2026-05-15/401_claude-chrome_side-panel-first-open.png`

**Claude shows:** Side panel first open on example.com (Chrome). Minimal state: "Claude" header + Sonnet 4.6 badge + pin/close icons. No chat history. Composer with "How can I help you?" placeholder. No paywall banner visible in this Chrome-native screenshot (different build/region from img 01).

**AGI implementation:**

- Side panel first-open: `side_panel.ts:3096` — `#sp-empty` state renders "What can I help with?" with a features subtext when no messages exist. Fully wired via `DOMContentLoaded → initializeSidePanel()`.
- Placeholder text: `side_panel.ts:3027` — AGI's empty state shows API key input bar rather than a composer placeholder. The composer placeholder appears at the HTML level in `side_panel.html`.

**Verdict:** ✅ v1 — Side panel first-open state exists and renders properly. Placeholder text wording differs slightly (minor cosmetic).

**Image path:** `reference/ui/chrome-extension/claude/2026-05-15/401_claude-chrome_side-panel-first-open.png`
**Source:** `apps/extension/src/side_panel.ts:3096`

---

### Image 402: `2026-05-15/402_claude-chrome_side-panel-login-or-connected.png`

**Claude shows:** Three-dot menu open on example.com: "Convert to task / Settings / Language". Connected state (no paywall banner here).

**AGI implementation:** Same as img 04 analysis — no three-dot header menu in AGI's side panel. The three items are absent from the header.

**Verdict:** 🟡 v1 — Same gap as img 04. Three-dot menu absent; individual features distributed elsewhere.

**Image path:** `reference/ui/chrome-extension/claude/2026-05-15/402_claude-chrome_side-panel-login-or-connected.png`
**Source:** `apps/extension/src/side_panel.ts:2734`

---

### Image 403: `2026-05-15/403_claude-chrome_pairing-prompt.png`

**Claude shows:** `chrome-extension://.../pairing.html` as a full browser tab. Card: "Claude Desktop wants to connect. Name this browser so you can identify it later." Text input (placeholder: e.g. "Work laptop", "Personal Chrome"). Buttons: Ignore / Connect.

**AGI implementation:**

- Pairing: `apps/extension/src/pairing.ts:94` — `requestPairing()` function exists. Fingerprint stored at `STORAGE_KEY_FINGERPRINT = 'agi_pairing_fingerprint'` (`pairing.ts:20`). Token validation regex at `pairing.ts:26`.
- Popup UI: `popup.html:138–147` — `#pairingStatusLabel`, `#pairingFingerprint`, `pairBtn`, `unpairBtn` all present.
- `popup.ts:552–558` — `loadPairingState()` wires UI on open.
- Difference: Claude uses a full browser tab (`pairing.html`); AGI uses a popup section. No browser naming/labeling step.

**Verdict:** 🟡 v1 — Pairing mechanics exist but UX is popup-embedded vs full-tab, and browser naming step is absent. Functional parity achieved differently; the naming field is a minor UX gap.

**Image path:** `reference/ui/chrome-extension/claude/2026-05-15/403_claude-chrome_pairing-prompt.png`
**Source:** `apps/extension/src/pairing.ts:94`, `apps/extension/src/popup.html:138`

---

### Image 404: `2026-05-15/404_claude-chrome_permissions-page.png`

**Claude shows:** Options page (`chrome-extension://.../options.html#permissions`). Left sidebar: Permissions (active) / Shortcuts / Options / Log out. Main area: Notifications section (task completion notifications toggle — enabled), Microphone section ("Allow Microphone Access" button), "Your approved sites" list with per-site Revoke.

**AGI implementation:**

- No dedicated `options.html` / `options_page` entry in `manifest.json` (confirmed: manifest has no `"options_page"` or `"options_ui"` key).
- Notifications permission: `manifest.json:18` — listed. No user-facing toggle found in extension source.
- Approved sites: `popup.ts:716` — `allowlistList` + `allowlistToggleBtn` exist in popup.
- Microphone: `features/side-panel/voice.ts` — `SpeechRecognition` wired. No dedicated "Allow Microphone Access" button in a settings page.

**Verdict:** ❌ v1 — No dedicated options/settings page. All equivalent settings live in popup (space-constrained). Notification user toggle absent. This is a P1 gap vs Claude's floor.

**Image path:** `reference/ui/chrome-extension/claude/2026-05-15/404_claude-chrome_permissions-page.png`
**Source:** `apps/extension/manifest.json` (no `options_page`), `apps/extension/src/popup.ts:716`

---

### Image 406: `2026-05-15/406_claude-chrome_site-permission-action-prompt.png`

**Claude shows:** Mid-task inline permission prompt inside side panel: "New permissions required — Claude wants to read page content on: example.net." Three action buttons: "Allow this action", "Decline", "Always allow actions on this site (browse, click, type)". Safety footnote. Batch progress cards above (Batch 1/2, 1/1, 2/2) with "Stopped on error" state on Batch 1/2.

**AGI implementation:**
Grep for `PERMISSION_REQUIRED`, `inline.*permission`, `allow.*action`, `decline.*action` in `background.ts` returns no results. No `PERMISSION_REQUIRED` message type exists. No inline mid-task consent card exists in `side_panel.ts`.

Batch progress counter: `side_panel.ts` grep for `batch.*count`, `N/M` returns no aggregate counter. AGI renders individual `.tool-call` / `.tool-call-stack` items but no "Batch N/M — Stopped on error" aggregate.

**Verdict:** ❌ v1 BLOCKER — Inline permission prompt completely absent. This is the second of two autonomy-consent v1 blockers. Without this, automations can silently access new domains without user awareness. Batch counter is 🟡 (tool-call rows exist, no aggregate summary).

**Fix required:**

- Add `PERMISSION_REQUIRED` message type in `background.ts` dispatched before any new-domain action.
- `side_panel.ts` handler renders an inline consent card using `var(--agi-ext-warning)` border, three action buttons.
- Add batch aggregate counter (Batch N/M) above individual `.tool-call` items.

**Image path:** `reference/ui/chrome-extension/claude/2026-05-15/406_claude-chrome_site-permission-action-prompt.png`
**Source:** No source — absent

---

### Image 409: `2026-05-15/409_claude-chrome_blocked-sensitive-site.png`

**Claude shows:** Full browser tab at `chrome-extension://.../blocked.html`. Left area: "The content on this page isn't available when Claude is active for safety reasons." Side panel: shield icon + "Can't access this page — Claude cannot assist with the content on this page."

**AGI implementation:**

- `side_panel.ts:474–491` — `#sp-blocked` CSS rules: `display: none` default, `.visible` shows it. Shield icon at `#sp-blocked-shield`, title at `#sp-blocked-title` ("Can't access this page"), description at `#sp-blocked-desc`.
- `side_panel.ts:2446–2450` — `toggleBlockedState()` function wires `.visible` class.
- `side_panel.ts:3119–3157` — `blockedState` element built in DOM.
- Difference: Claude redirects the full tab content to `blocked.html` (blanks the page). AGI's block is in-panel only; the page remains visible.

**Verdict:** ✅ v1 — AGI has a working blocked-site state in the side panel. The full-tab page blanking is a cosmetic difference (AGI's approach is arguably less disruptive). Parity met.

**Image path:** `reference/ui/chrome-extension/claude/2026-05-15/409_claude-chrome_blocked-sensitive-site.png`
**Source:** `apps/extension/src/side_panel.ts:474`, `apps/extension/src/side_panel.ts:2446`

---

### Image 413: `2026-05-15/413_claude-chrome_shortcuts-list.png`

**Claude shows:** Options page Shortcuts tab. Left sidebar navigation. Main area: "Shortcuts — Type / in the chat to use shortcuts or run them on schedule." Example shortcut "/apply" with prompt preview card. "Create shortcut" button top-right. Active task running in side panel alongside (Batch steps visible, "Ask before acting" in bar).

**AGI implementation:**

- Shortcuts list: `side_panel.ts:824` — `#sp-shortcuts-dropdown` renders saved shortcuts with replay/delete buttons. `side_panel.ts:3471` — "Scheduled Tasks" section in Workflows tab.
- Create shortcut: `side_panel.ts:3384–3444` — Full "Create shortcut" modal with Name, Prompt, Start URL, Schedule toggle (`scScheduleToggle`).
- W5 said scheduling was absent — **W5 finding superseded by primary source.** Schedule toggle exists at `side_panel.ts:3386–3391` and `scheduled` flag is passed in `SAVE_SHORTCUT` message at `side_panel.ts:3444`.
- Difference: Claude hosts shortcuts in a full-tab Options page tab. AGI's shortcuts live in the Workflows tab of the side panel — no full-page options view.

**Verdict:** ✅ v1 — Shortcut listing, creation, and scheduling all exist. No dedicated Options page tab (separate gap, image 404). Batch step progress in side panel is partial (see img 406).

**Image path:** `reference/ui/chrome-extension/claude/2026-05-15/413_claude-chrome_shortcuts-list.png`
**Source:** `apps/extension/src/side_panel.ts:3384`, `apps/extension/src/side_panel.ts:824`

---

### Image 414: `2026-05-15/414_claude-chrome_record-workflow-entry.png`

**Claude shows:** "Create shortcut" modal: Name field (`/task-name`), Prompt textarea, Start from URL field (`https://example.com`), Schedule toggle (off). Cancel / "Create shortcut" buttons.

**AGI implementation:**

- `side_panel.ts:3384–3444` — AGI's "Create shortcut" modal has: Name input (`sp-sc-name`), Prompt textarea (`sp-sc-prompt`), Start URL input (`sp-sc-url`), Schedule toggle (`sp-sc-schedule`), Cancel + Save buttons.
- Fields match Claude 1-for-1.
- Schedule toggle at `side_panel.ts:3386` uses `type: 'checkbox'` — functional but not visually a pill toggle like Claude's. Minor cosmetic difference.

**Verdict:** ✅ v1 — Create-shortcut modal fields match Claude. Visual schedule toggle style is 🟡 minor.

**Image path:** `reference/ui/chrome-extension/claude/2026-05-15/414_claude-chrome_record-workflow-entry.png`
**Source:** `apps/extension/src/side_panel.ts:3384`

---

### Image 415: `2026-05-15/415_claude-chrome_record-workflow-mic-permission.png`

**Claude shows:** Chrome OS mic permission dialog: "Claude wants to — Use available microphones (2) — Siddhartha iPhone 13 Pro Max — Allow while visiting / Allow this time / Never allow". Options page showing Microphone section in "Requesting…" state.

**AGI implementation:**

- Voice input: `features/side-panel/voice.ts:3–41` — `SpeechRecognitionCtor` via `window.SpeechRecognition || window.webkitSpeechRecognition`. Mic permission triggers automatically when user clicks voice button; the OS dialog is Chrome-native behavior, not extension code.
- No "Requesting…" state indicator shown in the Options page (AGI has no options page).
- AGI's mic permission is triggered from the side panel voice button; there's no separate permissions settings section for microphone.

**Verdict:** ✅ v1 — Microphone/voice works; the OS permission dialog fires correctly. The "Requesting…" visual state in the settings page is absent but that ties back to the missing options page (img 404).

**Image path:** `reference/ui/chrome-extension/claude/2026-05-15/415_claude-chrome_record-workflow-mic-permission.png`
**Source:** `apps/extension/src/features/side-panel/voice.ts:21`

---

### Image 416: `2026-05-15/416_claude-chrome_reconnect-page.png`

**Claude shows:** Claude sign-in / reconnect page at `claude.ai/login`: "Think fast, build faster — Brainstorm in chat, build in Cowork". Continue with Google / Continue with email. Download desktop app button.

**Claude's mechanism:** When Claude's extension can't reach the cloud session, it redirects to a full web sign-in page that also upsells the desktop app.

**AGI implementation:**

- When the desktop bridge is disconnected, AGI's side panel shows `#sp-status-pill` with `.disconnected` CSS class (`side_panel.ts:1274–1286`). The pill shows a red dot.
- Auth bar: `side_panel.ts:3024–3034` — `#sp-auth-bar` with API key input shown when disconnected.
- No "download desktop app" CTA. No branded reconnect page.
- W5 established: new users who install without the desktop get a disconnected error with no actionable guidance.

**Verdict:** 🟡 v1 — AGI shows a status pill + API key bar, not a zero-state reconnect screen. The "download desktop app" onboarding CTA is absent. This is architecturally different (AGI requires desktop; Claude reconnects to cloud), but a first-run onboarding screen is still needed.

**Image path:** `reference/ui/chrome-extension/claude/2026-05-15/416_claude-chrome_reconnect-page.png`
**Source:** `apps/extension/src/side_panel.ts:1274`, `apps/extension/src/side_panel.ts:3024`

---

### Image 417: `2026-05-15/417_claude-chrome_options-page.png`

**Claude shows:** Full Options page (`chrome-extension://.../options.html`). Same layout as 404 but with Microphone section showing "Allow Microphone Access" button (not "Requesting…"). Approved sites list: sebastien-lempens.com with last-used date and Revoke. Active task session visible in side panel alongside.

**AGI implementation:**

- Same gap as img 404 — no dedicated options page. `manifest.json` has no `"options_page"` entry.
- Approved sites management: `popup.ts:716` — available in popup only.
- Approved site with last-used date: not visible in popup implementation (no last-used timestamp shown per-site in `allowlistList`).

**Verdict:** ❌ v1 — No dedicated options page. Per-site last-used date absent from allowlist UI. Ties to img 404 gap.

**Image path:** `reference/ui/chrome-extension/claude/2026-05-15/417_claude-chrome_options-page.png`
**Source:** `apps/extension/manifest.json` (no `options_page`), `apps/extension/src/popup.ts:716`

---

## 2. Summary Statistics

| Verdict                | Count | Images                                                               |
| ---------------------- | ----- | -------------------------------------------------------------------- |
| ✅ Matches/leads       | 7     | 05, 401, 409, 413, 414, 415, (partial on 03 attach menu)             |
| 🟡 Partial             | 5     | 01, 03, 04/402, 403, 416                                             |
| ❌ Missing             | 4     | 02, 07 (autonomy — same gap), 406, 404/417 (options page — same gap) |
| 🔄 Different-by-design | 1     | 05 (Anthropic-only vs multi-provider)                                |
| 🚧 v2-deferred         | 1     | 06 (quick mode — Claude experimental+paid)                           |

**Unique gap classes (deduped):**

1. Autonomy / action-mode toggle — imgs 02, 07, 01 (bar absent in all side-panel views)
2. Inline per-action permission prompt — img 406
3. Dedicated options page — imgs 404, 417
4. Three-dot header menu (Convert to task / Settings / Language) — imgs 04, 402
5. Quick mode preset — imgs 06, 07
6. Active-context dashed border — img 03
7. First-run / disconnected onboarding screen — img 416
8. Shortcut scheduling toggle visual style (checkbox vs pill toggle) — img 414 (minor)
9. Browser naming step in pairing — img 403 (minor)

**W5 corrections confirmed by primary source:**

- `cookies` permission: W5 said "over-granted, no callers." **Superseded.** `background.ts:1732, 1761, 1801, 1804` actively calls `chrome.cookies.getAll`, `.set`, `.remove`. Permission is legitimately used.
- Shortcut scheduling: W5 said "no schedule/cron support." **Superseded.** `side_panel.ts:3386–3444` has a Schedule toggle in the Create shortcut modal and Scheduled Tasks list.

---

## 3. Cross-Image Patterns

**Pattern A — Autonomy bar absent from all views (imgs 01, 02, 03, 04, 05, 07)**
Every side-panel screenshot from Claude shows the "Ask before acting / Act without asking" toggle in the bottom composer bar. This is a persistent UI element, not a contextual popup. AGI has no equivalent in any side-panel view. This is a single code gap with broad visual impact.

**Pattern B — Options page gap manifests in multiple images (imgs 404, 417, 415)**
Claude's options page (`options.html`) is referenced from three separate images covering different sections (Permissions, Shortcuts, Options). AGI's lack of an options page is a single structural gap that shows up whenever a user needs settings beyond what fits in the popup.

**Pattern C — Active-context dashed border (imgs 03, 04, 05, 07)**
Claude shows a yellow dashed border around the entire side panel when it has page-reading context active. AGI has a `#sp-context-chip` (shown when page context is attached) but no panel-level border. Claude's approach communicates page-awareness state more prominently.

**Pattern D — AGI uniquely leads in multi-provider and local-execution (img 05)**
Claude's model picker shows only 3 Anthropic models; AGI's shows 13+ providers. This structural advantage (local bridge vs cloud-only) is visible in the model picker and implies: no per-message cost, free-tier models available, local/private models accessible. This cannot be replicated by Claude without architectural changes.

---

## 4. v1 Release Blockers

### BLOCKER-01: Autonomy toggle ("Ask before acting / Act without asking")

**Evidence:** Images 02, 07, and persistent presence in 01, 03, 04, 05 empty-state views.
**Gap:** No `agi_action_mode` storage key. No toggle in side panel composer bar. No conditional gate in `background.ts` action dispatch.
**Risk:** Without this, AGI has no user-facing control over automation consent. Below Claude floor per [[claude-quality-floor]].
**Fix:**

- Add `agi_action_mode: 'ask' | 'act'` to `chrome.storage.local`.
- Render toggle button in `#sp-composer` bar using `var(--agi-ext-accent)` active state. Default = `'ask'`.
- Gate background.ts browser-action dispatch: if `'ask'`, dispatch `PERMISSION_REQUIRED` message before executing; user must Accept/Decline.
  **Source to add:** `apps/extension/src/side_panel.ts` (composer bar), `apps/extension/src/background.ts` (action gate)

### BLOCKER-02: Inline per-action permission prompt

**Evidence:** Image 406.
**Gap:** No `PERMISSION_REQUIRED` message type in `background.ts`. No inline consent card in `side_panel.ts`.
**Risk:** Automations can silently access new domains without explicit user consent. This is the consent-model violation that Claude explicitly solves with "Allow this action / Decline / Always allow on site".
**Fix:**

- Add `PERMISSION_REQUIRED` message type sent from `background.ts` before any new-domain action when `agi_action_mode = 'ask'`.
- Add inline consent card in `side_panel.ts` message area using `var(--agi-ext-warning)` border: Allow / Decline / Always allow on site.
- Persist "always allow" entries to `SITE_ALLOWLIST_KEY` (already exists in popup).
  **Source to add:** `apps/extension/src/background.ts` (dispatch), `apps/extension/src/side_panel.ts` (consent card)

---

## 5. v2 Placeholders Required

Per [[v1-cloud-bridge-strategy-2026-05-23]], every cloud-only Claude feature needs a v1 UI entry point (invite-code modal) so the surface looks at-parity.

| Feature                   | Image    | Placeholder needed                                                                                  |
| ------------------------- | -------- | --------------------------------------------------------------------------------------------------- |
| Quick mode                | 06, 07   | Speed button in header that opens a "Quick mode coming soon" card                                   |
| Full-tab options page     | 404, 417 | Link in popup or three-dot menu: "Settings" → opens a minimal `options.html` (can be sparse for v1) |
| Language selector         | 04, 402  | "Language" item in three-dot menu → stub "Coming soon" card                                         |
| Task notifications toggle | 404, 417 | Notification preference in popup settings section                                                   |

---

## 6. P0 Recommendations

### P0-01: Implement autonomy toggle (BLOCKER-01)

Wire `agi_action_mode` storage key + side-panel toggle + background.ts gate. This is a single 3-file change: `side_panel.ts` (UI), `background.ts` (gate), manifest is unchanged (no new permissions required). Default to `'ask'`. Use theme token `var(--agi-ext-accent)` for active toggle state; `var(--agi-ext-text-muted)` for inactive.

### P0-02: Implement inline per-action consent card (BLOCKER-02)

Depends on P0-01 (`'ask'` mode triggers it). `PERMISSION_REQUIRED` message from background → `side_panel.ts` renders inline card above composer using `var(--agi-ext-warning)` border. Three buttons. On "Always allow on site", persist to `SITE_ALLOWLIST_KEY`.

### P0-03: Add minimal options page for v1

Create `apps/extension/src/options.html` + `apps/extension/src/options.ts`. Add `"options_page": "src/options.html"` to `manifest.json`. v1 minimum content: Permissions section (task notifications toggle, approved sites list migrated from popup), Log out. Shortcuts tab can be sparse for v1. This unblocks the options-page gap shown in imgs 404, 417, 413.

### P1-01: Add three-dot header menu to side panel

Add a kebab/overflow menu button to `#sp-header-right` in `side_panel.ts`. Items: "Convert to task" (links to Workflows tab), "Settings" (opens options page), "Language" (stub for v2). Resolves imgs 04, 402.

### P1-02: Add first-run disconnected onboarding screen

When `isNativeConnected = false` on first open (no prior connection), show a branded empty state in the side panel with: AGI logo, "Open the AGI desktop app to connect" copy, and a download link. Uses `var(--agi-ext-text-muted)` for secondary copy. Resolves img 416.

### P1-03: Add active-context dashed border

When page context is attached (`#sp-context-chip` has content), add a `box-shadow: 0 0 0 2px var(--agi-ext-warning)` (dashed effect can be achieved via `outline: 2px dashed var(--agi-ext-warning)`) to the side panel wrapper. Matches Claude's yellow dashed border pattern from imgs 03, 04, 05, 07.

---

## 7. Notes

- **Image count:** 18 images found (2 fewer than the brief's stated 20). W5 also found 18. No images were invented to reach 20.
- **No hardcoded colors** in any recommendation above — all color references use `var(--agi-ext-*)` theme tokens.
- **No hardcoded model IDs** — all model references cite `packages/types/src/models.json` via `getCoreManualModelOptions()`.
- **AGI leads Claude** in: multi-provider support (img 05), shortcut scheduling (img 413/414 — W5 superseded), job autofill, platform-context prompts, in-page panel, memory CRUD, NLWeb/MCP discovery, tab grouping, developer console, extended thinking toggle. These are structural advantages Claude cannot replicate without rebuilding.

# AGI Browser Companion → Claude-style side-panel redesign

Status: PROPOSED (awaiting approval)
Date: 2026-06-14
Owner: chrome-ext-engineer
Reference target: Claude in Chrome (Beta) v1.0.75 — full-height side-panel chat opened on toolbar click

---

## 1. Goal

Make the AGI extension's **front door a full-height, chat-first side panel** — like Claude in
Chrome — instead of a cramped 380px toolbar popup. The user clicks the AGI toolbar icon and gets
a chat surface, not a control panel.

Non-goal: rewriting the chat engine, the computer-use agent loop, or the bridge protocol. This is
a **surface/front-door** redesign. The chat/CU/voice logic already exists and is well-wired.

---

## 2. Root cause (why it looks wrong today)

| Decision                                                                          | Effect                                                                                                 |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `manifest.json` → `action.default_popup: "src/popup.html"`                        | Toolbar click **always** opens the popup. In MV3, a set `default_popup` overrides side-panel-on-click. |
| No `chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })` anywhere | The side panel never opens from the icon — only from in-popup "Chat" button or messages.               |
| `side_panel.ts:4374` → `switchTab('computer-use')` on open                        | Even when opened, the panel shows the empty Computer-Use tab, not chat.                                |
| Pairing / allowlist / memory / cloud-unlock live **only** in `popup.ts`           | Can't just delete the popup — those controls would be orphaned.                                        |

Claude has **no popup at all**: `setPanelBehavior({ openPanelOnActionClick: true })` + no
`default_popup` → icon opens the side panel; settings/account live behind the `⋮` menu inside it.

---

## 3. Target architecture

```
Toolbar icon click ──> Side panel opens (chrome.sidePanel, full height)
                         │
                         ├─ Header:  [AGI logo] [model selector ▾]        [＋ new] [⋮ menu]
                         │                                                          │
                         │                                              ┌───────────┴─ Settings drawer ─┐
                         │                                              │  • Connection / Pairing        │
                         │                                              │  • Site allowlist              │
                         │                                              │  • Memory                      │
                         │                                              │  • In-page panel toggle        │
                         │                                              │  • Bridge URL                  │
                         │                                              │  • Unlock AGI Cloud            │
                         │                                              │  • Capture / Group / Refresh   │
                         │                                              └────────────────────────────────┘
                         ├─ Tabs (kept): Chat · Workflows · Computer Use   ← default = CHAT
                         ├─ Conversation area (big, empty-state "What can I help with?")
                         └─ Composer: [＋] [textarea "/ for commands"] [Ask before acting ▾] [send]
```

The popup (`popup.html`) is **retired** — its 9 sections migrate into the side panel's settings
drawer (see §4). `popup.ts/.html/.css` and `features/popup/*` are removed once migration is
verified (kept in git history).

---

## 4. Component migration table (popup → side panel)

| Popup section (`popup.html`)                         | Lives in side panel as                                                                              | Notes                                                                                      |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Header brand "AGI / Browser control plane"           | Side-panel header (already exists: `#sp-logo`)                                                      | Drop the cramped subtitle; keep logo + model badge.                                        |
| Status pill + reconnect (`#statusCard`)              | Side-panel status pill (`#sp-status-pill`, exists) + settings drawer "Connection" row               | Side panel already shows Offline/Connecting; reuse it.                                     |
| Quick actions: **Chat** (`#sidePanelBtn`)            | **Deleted** — the panel _is_ the chat                                                               | Redundant once icon→panel.                                                                 |
| Quick actions: **Capture** / **Refresh** / **Group** | Settings drawer "Tools" row, + Capture stays on composer `＋` (already there: `CAPTURE_SCREENSHOT`) | Group already wired in side panel (`#sp-group-btn`).                                       |
| Stats grid (Tabs / Actions / Session)                | **Demoted** to settings drawer footer (or dropped)                                                  | Low value as a hero element; Claude doesn't show this.                                     |
| In-Page Panel toggle (`#inPagePanelToggle`)          | Settings drawer "In-page panel" row                                                                 | Move handler; same `chrome.storage.local` key.                                             |
| Site allowlist (`#allowlistList` + add/remove)       | Settings drawer "Site allowlist" section                                                            | Largest migration (37 refs in popup.ts). Side panel already has 2 allowlist refs — extend. |
| Memory (`#memoryList` + editor)                      | Settings drawer "Memory" section                                                                    | Move editor + list rendering.                                                              |
| Desktop pairing (`#pairBtn`/`#unpairBtn`)            | Settings drawer "Connection / Pairing" section                                                      | Critical — must stay reachable.                                                            |
| Current page (Tab ID / URL / Version / Plan)         | Settings drawer footer (collapsed "About")                                                          | Diagnostic; low prominence.                                                                |
| Cloud unlock (`#cloudUnlockBtn` + InviteCodeModal)   | Settings drawer "Unlock AGI Cloud" button                                                           | Reuse `InviteCodeModal` as-is (already shadow-DOM/self-contained).                         |

**Net:** nothing is lost. Everything either already exists in the side panel or moves into a
new `⋮` settings drawer.

---

## 5. Visual spec (match Claude's restraint)

| Element              | Claude                                             | AGI now                                            | Change                                                                                                        |
| -------------------- | -------------------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Opens as             | Side panel, full height                            | Popup 380px                                        | Flip to side panel                                                                                            |
| Default view         | Empty chat, "How can I help…"                      | Computer-Use tab                                   | Default to chat                                                                                               |
| Top bar              | Model selector `Opus 5 ▾`, `＋`, `⋮`               | Logo + 8 header buttons                            | Collapse to: model ▾ · `＋ new` · `⋮`                                                                         |
| Conversation         | Large, calm, lots of whitespace                    | OK (reuse)                                         | Keep; ensure chat is default                                                                                  |
| Composer             | "Type / for commands", "Ask before acting ▾", send | Has attach/input/send/action-mode/quick-mode/chips | Keep; relabel placeholder to "Type / for commands"; group action-mode under "Ask before acting"-style control |
| Theme                | Dark, single coherent palette                      | Side panel already dark ✓                          | Already aligned (good) — fix the ~20 `rgba()` accent literals later                                           |
| Header button sprawl | 2 controls                                         | 8 controls                                         | Move summarize/history/console/open-in-desktop/settings into `⋮`                                              |

Side-panel chat is **already dark** (`getExtensionTokensCss('dark')`), so it's the closest surface
to Claude — most of the work is _removing chrome_, not adding it.

---

## 6. Implementation phases

### Phase 1 — Flip the front door (small, reversible) ✅ low risk

1. `manifest.json`: remove `"default_popup": "src/popup.html"` from `action` (keep `default_icon`/`default_title`).
2. `background.ts`: on `onInstalled` + `onStartup`, call
   `chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {})`.
3. `side_panel.ts:4374`: change default `switchTab('computer-use')` → `switchTab('chat')`.
   (Keep CU auto-switch when a CU event actually arrives — lines 3890–3967.)
4. Verify: load unpacked → icon click opens side-panel chat. typecheck + tests.

> After Phase 1 the popup is still installed but no longer the front door; it remains openable via
> a temporary context-menu item so pairing isn't lost between Phase 1 and Phase 2.

### Phase 2 — Settings drawer + migrate popup controls

5. Add a `⋮` button in the side-panel header that opens a slide-over **settings drawer**
   (new region in `buildUI()`), containing the sections from §4.
6. Move pairing, allowlist, memory, in-page-panel toggle, cloud-unlock, bridge-URL, tools
   (capture/group/refresh) into the drawer. Reuse existing handlers where the side panel already
   has them (group, bridge URL); port the popup handlers for the rest.
7. Reuse `InviteCodeModal` unchanged for cloud unlock.
8. Verify each migrated control end-to-end (pair, add/remove allowlist origin, add/delete memory,
   toggle in-page panel, unlock modal opens).

### Phase 3 — Visual polish + retire popup

9. Collapse the 8-button header to: model selector · `＋ new chat` · `⋮`.
10. Composer: placeholder "Type / for commands"; surface "Ask before acting" affordance.
11. Remove `popup.html`, `popup.ts`, `popup.css`, `features/popup/*`, and the temporary
    context-menu fallback. Remove the now-dead `OPEN_SIDE_PANEL`-from-popup path.
12. Convert the ~20 `rgba(33,128,141,…)` accent literals to `color-mix(... var(--agi-ext-accent))`.
13. Final verify: typecheck, full test suite, manual load-unpacked pass.

---

## 7. Risks & mitigations

- **Losing pairing access between phases** → Phase 1 adds a temporary context-menu entry to open
  the old popup until Phase 2 lands the drawer.
- **Side panel width** is wider than the popup — allowlist/memory lists will look better, but verify
  the settings drawer scrolls and doesn't fight the conversation area.
- **`openPanelOnActionClick` browser support** — requires Chrome 116+. `minimum_chrome_version` is
  already 132, so safe.
- **Tests** — popup-specific tests will be removed in Phase 3; side-panel tests extended for the
  migrated controls. Keep suite green at each phase.

---

## 8. Decisions (RESOLVED 2026-06-14 by founder)

1. **Stats grid** → **Demote to drawer footer** (not dropped). Keep Tabs/Actions/Session numbers in the
   `⋮` drawer footer, out of the main view.
2. **Tabs** → **Pure chat.** The panel shows only the chat conversation. Workflows and Computer-Use
   become `⋮`-menu launchers, not visible tabs. Panel reads exactly like Claude.
3. **Capture / Refresh / Group** → **All three in the `⋮` drawer's Tools row** (Capture not on composer).

Net effect of these choices: the side panel is a **single chat surface** with one model selector, a
`＋ new chat`, and a `⋮` menu. Everything else (tools, workflows, computer-use, pairing, allowlist,
memory, cloud-unlock, in-page toggle, bridge URL, stats) lives behind `⋮`.

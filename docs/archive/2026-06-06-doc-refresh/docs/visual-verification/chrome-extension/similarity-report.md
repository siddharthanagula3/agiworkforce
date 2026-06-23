# Chrome Extension — 80% Similarity Acceptance Test

Status: Round 21 baseline
Owner: Platform lead
Last updated: 2026-05-22
Reference set: 5 most-recent screenshots from `~/Desktop/reference/ui/chrome-extension/{claude,claude/2026-05-15,perplexity-comet}/`

## Reference screenshots selected (5)

1. `claude/2026-05-15/401_claude-chrome_side-panel-first-open.png` — side-panel first-open empty state
2. `claude/2026-05-15/404_claude-chrome_permissions-page.png` — permissions / site-allowlist page
3. `claude/2026-05-15/413_claude-chrome_shortcuts-list.png` — shortcuts list in side panel
4. `claude/2026-05-15/417_claude-chrome_options-page.png` — options/settings page
5. `claude/05_sidebar-extension_model-selector-dropdown_opus-sonnet-haiku.png` — side-panel model-selector dropdown

## User-visible element checklist

| #   | Element                                                     | Reference present                     | AGI Workforce equivalent                                                                                      | Status |
| --- | ----------------------------------------------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------ |
| 1   | Browser action / toolbar icon + popup                       | yes (img 1; claude 02)                | `apps/extension/src/popup.html` + `popup.ts` + manifest action                                                | ✅     |
| 2   | Popup header w/ wordmark + status pill                      | yes (popup screens)                   | `apps/extension/src/popup.html` `.header` + `.status-pill` (R20 compact pill parity)                          | ✅     |
| 3   | Popup quick-actions grid (Chat / Capture / Refresh / Group) | yes (popup screens)                   | `apps/extension/src/popup.html` `.actions` w/ 4 buttons                                                       | ✅     |
| 4   | Site allowlist (current origin + list)                      | yes (img 2)                           | `apps/extension/src/popup.html` `.allowlist-section` + `popup.ts initAllowlistUI` (R20-R21)                   | ✅     |
| 5   | Memory editor (cross-conversation facts)                    | yes (popup options imply)             | `apps/extension/src/popup.html` `.memory-section` + `popup.ts initMemoryUI` (R21 lane 6)                      | ✅     |
| 6   | Pairing prompt (desktop connect)                            | yes (claude 2026-05-15 403)           | `apps/extension/src/popup.ts` pairing UI + `apps/extension/src/features/native-bridge/pairing.ts`             | ✅     |
| 7   | Side-panel chat empty state                                 | yes (img 1)                           | `apps/extension/src/side_panel.html` + `side_panel.ts`                                                        | ✅     |
| 8   | Side-panel composer w/ multiline input                      | yes (claude 01)                       | `apps/extension/src/side_panel.ts` composer rendering                                                         | ✅     |
| 9   | Composer attachment / + menu                                | yes (claude 03)                       | `apps/extension/src/side_panel.ts` `#sp-attachment-bar` + plus-menu                                           | ✅     |
| 10  | Composer model selector dropdown                            | yes (img 5)                           | `apps/extension/src/side_panel.ts` `#sp-model-badge` + model menu (reads models.json)                         | ✅     |
| 11  | Composer voice input mic                                    | yes (claude composer screens)         | `apps/extension/src/features/side-panel/voice.ts` + `setupVoiceInput`                                         | ✅     |
| 12  | Composer more-options menu (task / settings / language)     | yes (claude 04)                       | `apps/extension/src/side_panel.ts` overflow menu + side_panel.css                                             | ✅     |
| 13  | Action / permission dropdown (ask vs act)                   | yes (claude 02)                       | `apps/extension/src/background/policy.ts` + side-panel action-mode chip                                       | ✅     |
| 14  | Quick-mode (Haiku act-without-asking) modal                 | yes (claude 06-07)                    | `apps/extension/src/side_panel.ts` quick-mode toggle + memory of last quick-mode                              | ✅     |
| 15  | Permissions page (site allowlist as full options page)      | yes (img 2)                           | `apps/extension/src/popup.html` allowlist section + chrome.runtime.openOptionsPage flow                       | ⚠      |
| 16  | Shortcuts list (in side panel)                              | yes (img 3)                           | `apps/extension/src/side_panel.ts` `.sp-shortcuts-wrapper` + `#sp-shortcuts-dropdown`                         | ✅     |
| 17  | Save-shortcut input (create new)                            | yes (img 3 implies)                   | `apps/extension/src/side_panel.ts` `.sp-save-shortcut-row` + save button                                      | ✅     |
| 18  | Conversation history (list + load)                          | yes (comet 04 implied)                | `apps/extension/src/features/background/conversation-history.ts` + `listConversations` rendered in side panel | ✅     |
| 19  | Capture page screenshot                                     | yes (claude 03 screenshot option)     | `apps/extension/src/popup.ts` `handleCapturePage` + `apps/extension/src/side_panel.ts capturePageContext`     | ✅     |
| 20  | Blocked sensitive-site banner                               | yes (claude 409)                      | `apps/extension/src/background/policy.ts` blocks list + content-script banner                                 | ✅     |
| 21  | Record-workflow entry                                       | yes (claude 414)                      | not present — no record-workflow UI in popup or side panel                                                    | ❌     |
| 22  | Record-workflow microphone permission prompt                | yes (claude 415)                      | not present (follows from row 21)                                                                             | ❌     |
| 23  | Reconnect / paired-disconnect state                         | yes (claude 416)                      | `apps/extension/src/popup.html` `#reconnectBtn` + status-pill states                                          | ✅     |
| 24  | Options page (full-width settings editor)                   | yes (img 4)                           | partial — popup currently doubles as options; no dedicated `apps/extension/src/options.html`                  | ⚠      |
| 25  | Side-panel slash-commands (`/explain`, `/summarize`, etc.)  | yes (claude 04 menu)                  | `apps/extension/src/side_panel.ts` slash commands w/ captureContext                                           | ✅     |
| 26  | In-page floating panel (Comet-style)                        | yes (comet 04 youtube floating panel) | `apps/extension/src/inPagePanel/**` + `IN_PAGE_PANEL_ENABLED_KEY` toggle                                      | ✅     |
| 27  | Privacy-mode toggle                                         | yes (settings IA implied)             | `apps/extension/src/popup.ts formatPrivacyModeLabel` + privacy chip                                           | ✅     |
| 28  | Job autofill (LinkedIn etc.)                                | yes (third-party parity)              | `apps/extension/src/jobAutofill.ts` + `autofill/linkedin.ts`                                                  | ✅     |

| Total elements | 28 | 24 ✅ + 2 ⚠ + 2 ❌ | **86%** strict (24/28) |

## Score: 86%

Pass: ✅ ≥80% threshold met.

- ✅ Pass: 24 items covered with equivalent UI
- ⚠ Partial: 2 items (permissions full options page lives inside popup section instead of a dedicated options-page surface; options page reuses popup HTML)
- ❌ Miss: 2 items (record-workflow entry; mic permission prompt for record-workflow)

## Closure rounds needed

Chrome extension comfortably clears 80% — better than R20 pre-estimate of 50-60%. R20-R21 lanes shipped status pill compact + allowlist + memory editor (lane 6) which moved several rows from ⚠/❌ to ✅. Closure items for R22+:

- Row 21-22 — implement record-workflow flow: side-panel entry + `chrome.permissions.request({ permissions: ['microphone'] })` + background recorder writing to MCP. Two screens (entry + mic prompt) ship together.
- Row 15 — split allowlist into a dedicated permissions page in `apps/extension/src/options.html` (today's popup section is fine but the reference shows a wider page).
- Row 24 — ship dedicated `apps/extension/src/options.html` (Chrome calls `chrome.runtime.openOptionsPage` and currently falls through to popup).

## Notes

- R21 lane 6 (popup memory editor) is reflected directly in row 5 — `apps/extension/src/popup.html .memory-section` + `popup.ts initMemoryUI` are live with R21 (2026-05-22) annotations in the source.
- R21 lane 6's "host-adopt shared memory primitive" pattern means the memory editor is wired to the cross-surface memory store, not extension-local — matches Claude's behavior.
- Reference set is current as of 2026-05-15 (claude dated subdir + claude undated, all <2 weeks old).
- The R20 estimate of 50-60% reflected an earlier state where allowlist + memory editor were both missing; with R20-R21 work landed, true score is 86%.
- Visual diff harness: Chrome extension snapshots use static HTML extraction; `round-17-static-html.snap` is the AGI baseline. Future diffs render popup + side panel DOM and compare structure.

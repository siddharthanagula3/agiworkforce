---
id: "F040-07"
type: "feature"
title: "Per-conversation override"
aliases: ["Conversation overrides", "S40.19", "Response style for this chat", "Output style --session", "chatStyleByConversation", "selectionsByConversation"]
area: "40 Instructions, preferences, and personal style"
available_on: ["web", "desktop", "mobile", "cli"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "built", vscode: "missing", chrome: "missing"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S40.19"]
depends_on: ["SYS-chat-turn-pipeline", "SYS-memory-projects-and-context", "SYS-sync-and-continuity", "SYS-shared-ui-and-design", "F040-09", "surface:web", "surface:desktop", "surface:mobile", "surface:cli", "mode:local", "mode:own-key", "mode:cloud"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F040-07 Per-conversation override

Lets a person pick a response style for one chat only, without changing their saved defaults. Web and Desktop store a per-chat style and length choice; Mobile stores a per-chat style; the CLI has a session-only switch. VS Code and Chrome have no per-chat choice.

Area: [40. Instructions, preferences, and personal style](README.md). Requirement items: [S40.19](../../10-requirements/capabilities/040-instructions-preferences-and-personal-style.md#s4019).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | built | built | not seen by a person |
| CLI | built | built | not seen by a person |
| VS Code | not built | not built | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Lets the person choose a response style (and, on Web and Desktop, a response length) that applies only to the open conversation. The saved defaults in Settings stay as they are. The choice is looked up again when the person returns to that chat.

**Why it exists.** The brief item S40.19 says: 'For one conversation the user can override their standing style/instructions without changing their defaults.' People want a formal answer in one chat and a short answer in another without editing Settings each time. [inferred]

**Who uses it.** Anyone chatting on Web, Desktop (which shows the hosted web app), Mobile or the CLI. [inferred from (doc: AGENTS.md section 5) and the brief status]

**Problems it solves**

- Avoids editing global personalization for a one-off need.
- Keeps a style choice attached to the chat it was made for, so a later chat starts clean.
- A choice made before the first message is carried onto the new chat once it gets an id.

**Use cases**

- Ask for a Concise style in one research chat while Settings stay at Default.
- Pick Formal for a chat that drafts a letter.
- In the CLI, run /output-style concise --session to try a style without changing the saved default.

## 2. User experience

**Where to find it**

- Web and Desktop: the Style button (aria-label 'Response style') in the chat composer footer; its menu is titled 'Response Style' with a 'Response Length' row (StyleSelector.tsx:186-221; ComposerFooter.tsx:1431-1433). It is hidden in the code composer (CodeComposer.tsx:2158).
- Mobile: the 'Choose style' row in the Add-to-chat sheet opens a sheet headed 'Choose Style' (AddToChatSheet.tsx:1334-1342; StyleSelector.tsx:144).
- CLI: the /output-style slash command with --session (claude_parity.rs:1297-1361).
- VS Code and Chrome: no per-chat control found.

**Before you start**

- Web and Desktop: an open chat composer. No account check was found in the style code, so the menu works signed out, but account sync needs sign-in (style-store.ts:229-248) [inferred].
- Mobile: the chat screen with the Add-to-chat sheet.
- CLI: a running session.

**Screens and controls**

- Web: five preset rows (Default, Concise, Explanatory, Learning, Formal), three length buttons (Brief, Default, Thorough), then custom styles (StyleSelector.tsx:30-36, 223-338; style-store.ts:343-345).
- Mobile: five rows (Normal, Concise, Explanatory, Learning, Formal), no length control (StyleSelector.tsx:17-24).
- CLI: /output-style <name> --session; /output-style with no argument lists styles.

**Journey**

1. Open a chat (or the empty new-chat screen).
2. Open the style control.
3. Pick a preset or custom style (Web also a length).
4. The menu closes and the button shows the chosen style label on Web.
5. Send a message; the style text is added to that turn as a system instruction.
6. Open another chat; it shows its own stored choice or the default.
7. Return to the first chat; the choice is restored.

**What the person sees and gets**

- Web: the Style button turns accented and shows the style name when style or length is not default (StyleSelector.tsx:95, 186-202).
- Mobile: the row value shows the current style name (AddToChatSheet.tsx:1336); the sheet marks the selected option (StyleSelector.tsx:171).
- CLI: 'Output style: <name> for this session only; your saved default is unchanged.' (claude_parity.rs:1346-1350).

**Settings**

- Web Settings > Personalization: 'Reset response style' also clears every per-chat selection (PersonalizationSection.tsx:367-371; style-store.ts:225-227).
- CLI: ui.output_style in config holds the saved default that --session leaves alone (config.rs:136, 1195-1198).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web: one selection record per conversation key, rebound when the open chat changes (style-store.ts:157-165; ChatComposerNew.tsx:1857-1860).
- Web: the pending choice made before a chat has an id is moved to the new id (style-store.ts:167-176; WebChatPage.tsx:1972-1982).
- Web: a default-valued selection is not stored, so records stay small (style-store.ts:61-78).
- Web: deleting a custom style removes every conversation record that used it (style-store.ts:208-219).
- Web: the per-conversation map is saved in the browser store 'agi-response-style' (style-store.ts:252-258).
- Mobile: per-conversation style map, bind and adopt actions, and removal for cloud conversations on account teardown (chatViewStore.ts:443-489, 546-553).
- Mobile: the chosen style becomes a system message on new turns and on continue-generation (chatExecutionStore.ts:1189-1195, 2776-2785, 5121-5126).
- CLI: --session changes the style for the running session without writing config (claude_parity.rs:1330-1352; claude_parity.rs:1363-1369).
- CLI: the active style is saved with the managed session and restored on resume (agent/mod.rs:2078-2080, 2681).

**Incomplete**

- Web and Mobile per-chat choices live only on the device; only custom style definitions sync to the account (style-store.ts:305-312). Another device opens the same chat at the default. [inferred from the payload]
- CLI --session is per session, not per named conversation; whether a resumed session keeps the session-only style or the saved one is covered by the managed-session field above and was not run (agent/mod.rs:2078).
- Web: deleting a custom style also drops the length choice of the affected chats because the whole record is removed (style-store.ts:210-214).

**Present but disconnected or switched off**

- The Web style menu is not shown in the code composer (CodeComposer.tsx:2158).
- Web hasn't a visible 'Default' reset per chat other than selecting Default/Default length (the record is then dropped, style-store.ts:75-77).

**Not available**

- VS Code: the output style choice is one global value in extension storage, not per conversation (outputStyles.ts:85, 122; ChatStateManager.ts:1654).
- Chrome extension: no style control found by searching apps/extension/src for style-store, outputStyle and responseStyle.
- Per-chat override of custom instructions or personalization traits (not only style): no code found on any app.

## 4. Required behaviour

**Established requirements**

- For one conversation the user can override their standing style/instructions without changing their defaults. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S40.19)
- Brief status: Web, Desktop, Mobile, CLI done; VS Code and Chrome missing. (source: S40.19 (brief))
- The public Desktop shows the hosted web app, so a Desktop change in apps/desktop/src does not reach the window. (source: doc: AGENTS.md section 5)
- Styles and response length sync to the user_settings namespace 'response-style'; localStorage stays as an offline cache. (source: doc: docs/decisions/wire-or-cut.md (row 'Styles and response length sync'))

**Acceptance criteria**

1. On Web, choose Concise in chat A, open chat B: B shows Default and A still shows Concise on return.
2. On Web, choose a style on the empty new-chat screen and send: the new chat keeps that style.
3. Changing the per-chat style does not change any value in Settings > Personalization.
4. On Mobile, choose Formal in chat A; chat B stays Normal; restart the app and A is still Formal.
5. In the CLI, /output-style concise --session leaves ui.output_style unchanged on disk.
6. Deleting a custom style that a chat used returns that chat to Default on Web.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The override should reach every model route the app can use (Local, own key, Cloud); on Web it is sent as a system message client-side so it does not depend on the route (useChatStream.ts:4465-4541).
- A chat's override should not leak into another account on the same device; Mobile clears cloud conversation entries on teardown (chatViewStore.ts:546-553).

**Proposed improvements** (suggestions, not requirements)

- [proposed] Sync the per-conversation choice with the conversation record so a second device opens the chat with the same style.
- [proposed] Add a per-chat override to VS Code and the Chrome extension.
- [proposed] When a custom style is deleted, keep the chat's length choice.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| store | useStyleStore (style-store) | `apps/web/features/chat/stores/style-store.ts` | Holds the current selection, selectionsByConversation, bindConversation and adoptSelection, and builds the style instruction text. |
| component | StyleSelector | `apps/web/features/chat/components/Composer/StyleSelector.tsx` | Web composer menu where the person picks style and length. |
| component | ComposerFooter | `apps/web/features/chat/components/Composer/ComposerFooter.tsx` | Mounts StyleSelector when showStyleSelector is true. |
| component | ChatComposerNew | `apps/web/features/chat/components/Composer/ChatComposerNew.tsx` | Binds the store to the open conversation key and attaches getStyleInstruction to each send. |
| screen | WebChatPage | `apps/web/features/chat/pages/WebChatPage.tsx` | Calls adoptSelection to move the pending choice to the new conversation id. |
| hook | useChatStream | `apps/web/lib/hooks/useChatStream.ts` | Adds the style instruction as a system message for Cloud and for the local-model path. |
| component | PersonalizationSection | `apps/web/features/settings/sections/PersonalizationSection.tsx` | Reset response style clears all per-chat overrides. |
| store | chatViewStore | `apps/mobile/stores/chat/chatViewStore.ts` | Mobile chatStyle, chatStyleByConversation, setChatStyle, bindStyleConversation, adoptStyleSelection, persisted in MMKV. |
| store | chatExecutionStore | `apps/mobile/stores/chat/chatExecutionStore.ts` | Turns the style into a system message for send and continue; adopts the new-chat key. |
| component | Mobile StyleSelector | `apps/mobile/src/features/chat/components/StyleSelector.tsx` | Bottom sheet listing the five styles. |
| component | AddToChatSheet | `apps/mobile/src/features/chat/components/AddToChatSheet.tsx` | Hosts the 'Choose style' row. |
| screen | Mobile chat routes | `apps/mobile/app/(app)/chat/[id].tsx` | Binds the style to the open conversation id (line 290); the new-chat tab binds NEW_CHAT_STYLE_KEY in app/(app)/(tabs)/chat.tsx:241. |
| command | /output-style handler | `apps/cli/src/claude_parity.rs` | handle_output_style, --session option, output_style_arg_persists. |
| service | AgentSession.apply_output_style | `apps/cli/src/agent/mod.rs` | Swaps the style block in the system message; restores the style on resume. |
| command | TUI /output-style | `apps/cli/src/tui/tui_app.rs` | Terminal UI route that calls the handler and saves only plain selections. |
| config | ui.output_style | `apps/cli/src/config.rs` | Saved default for the CLI style. |
| component | VS Code chooseOutputStyle | `apps/extension-vscode/src/features/sidebar-webview/outputStyles.ts` | Global (not per chat) style choice, for comparison. |
| test | StyleSelector web test | `apps/web/features/chat/components/Composer/StyleSelector.test.tsx` | Covers the web menu, trigger state and Learning style. |
| test | useChatStream.style test | `apps/web/lib/hooks/useChatStream.style.test.ts` | Covers the system message that carries the style. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person picks a style in the composer; the store writes the choice under the conversation key and drops it if it equals the default. | device | style-store.ts:138-149, 61-78 |
| Switching chats rebinds the store so the style and length shown are the stored record for that chat or the default. | device | style-store.ts:157-165; ChatComposerNew.tsx:1857-1860 |
| A choice made before the chat exists is stored under a pending key and moved to the real id when the chat is created. | device | style-store.ts:167-176; WebChatPage.tsx:1972-1982 |
| On send, getStyleInstruction builds one text from the preset or custom style, the length, and the optional writing sample, with a short preamble saying it overrides saved style. | device | style-store.ts:319-381; ChatComposerNew.tsx:3923, 4553 |
| The text is placed first as a system message in the request to our chat endpoint (Cloud) or into the local-model system blocks (Local). | device and our servers | useChatStream.ts:4465-4541 |
| Mobile: the style is picked from a fixed prompt table and unshifted as a system message for local and cloud turns. | device | chatExecutionStore.ts:1189-1195, 1276-1284, 2776-2785 |
| CLI: --session swaps the style block inside the first system message and does not write config. | device | agent/mod.rs:1828-1844; claude_parity.rs:1330-1352 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Web per-conversation selections (style, length, custom style id) | Browser localStorage key 'agi-response-style' (store:agi-response-style) | No; only customStyles are saved to the account (style-store.ts:305-312) | Kept until cleared; removed by Reset response style or when the custom style is deleted (style-store.ts:208-227) |
| Mobile per-conversation style map | MMKV store 'chat-view-store' (store:chat-view-store) | No sync code found | Cloud conversation entries are removed on account teardown (chatViewStore.ts:546-553) |
| CLI active style name | Managed session record and, for a plain selection, project config ui.output_style | Session record may sync with managed sessions; unknown | Session-only choice is not written to config (claude_parity.rs:1363-1369) |

**Models and providers.** The override is plain instruction text, so any model on any route can receive it. Nothing in the style code checks the model or provider (style-store.ts:365-381). On Mobile and Web it is added by the client before the request; the server was not shown to treat it specially.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | No account check found in the Web style store; account sync needs sign-in and a failed read leaves the local copy in use (style-store.ts:229-240). Mobile and CLI session-only choice need no account in the code opened. |
| Permissions | none found in the code |
| Subscription | none found in the code. No plan or entitlement check was found in the style code on any app. |
| Limits and metering | none found in the code. The style text adds a few tokens to each turn, so it counts as input like any system text [inferred]. |
| Feature flags | Web: the selector can be hidden through showStyleSelector (ComposerFooter.tsx:828, 854). No other flag found. |
| Model compatibility | Any model; the instruction is plain text. |
| Provider restrictions | none found in the code |
| Local mode | Web: the style instruction is added to local-model system blocks, so the override works with an on-device model (useChatStream.ts:4473-4489). Mobile: the same prompt builder serves local turns (chatExecutionStore.ts:2776-2785). CLI: the session-only style works in every privacy mode; only account preferences are limited to Managed Cloud (claude_parity.rs:1400-1407). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Offline or signed out (Web) | The per-chat choice works from local storage; account read failure returns early and keeps the cache. | style-store.ts:229-240 |
| Unknown or retired style value in stored data | Retired Web presets map to a current one or Default; unknown values become Default. | style-store.ts:28-39, 259-276 |
| Custom style deleted while a chat uses it | Web removes that chat's record, so it returns to Default and default length. | style-store.ts:208-219 |
| Custom style id missing at send time | Style text is empty; only length text is sent. | style-store.ts:371-380 |
| Style chosen before the chat exists | Moved to the new conversation id; if the new id already has a record, that record wins. | style-store.ts:173 |
| Signed-out or account switch on Mobile | Cloud conversation style entries are removed. | chatViewStore.ts:546-553 |
| Accessibility | Web: trigger has aria-label 'Response style', length buttons use aria-pressed. Mobile: options labelled '<name> style, selected'. | StyleSelector.tsx:195-196, 258-265; mobile StyleSelector.tsx:171 |
| Retry, timeout, cancel | not handled in the code (the override is a local state change with no network step). | style-store.ts:138-149 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/chat/components/Composer/StyleSelector.test.tsx`: Trigger accent state, Learning style selection and instruction, edit form.
- `apps/web/lib/hooks/useChatStream.style.test.ts`: Style instruction is sent as a leading system message and wins over the older style mode hint.
- `apps/mobile/__tests__/StyleSelector.test.tsx`: Mobile sheet options, selection writes chatStore, wide-window layout. Its title says '4 style options' but it checks four of five (stale title).
- `apps/mobile/__tests__/chatStore.test.ts`: Uses adoptStyleSelection at line 601.
- `apps/mobile/stores/chat/__tests__/chat-sources.test.ts`: Uses adoptStyleSelection at line 32.
- `apps/mobile/__tests__/cloud-account-teardown.test.ts`: Cloud conversation style entries removed, local ones kept (lines 689-711).
- `apps/cli/src/tui/tui_app.rs`: Inline test output_style_slash_uses_the_shared_grammar_and_persists_only_a_plain_selection (line 10243).
- `apps/cli/src/claude_parity.rs`: Inline test an_output_style_is_selected_whatever_case_it_is_typed_in (line 3192).

**Test scenarios**

- **Web per-chat style isolation**
  1. Sign in on Web, open chat A, set Style to Concise and Length to Brief.
  2. Open new chat B.
  3. Check the Style button, then return to A.
  - Expected: B shows Style (default), A shows Concise and Brief again; Settings > Personalization is unchanged.
- **Pending choice moves to the new chat**
  1. On the empty new-chat screen choose Formal.
  2. Send a first message.
  3. Open the Style menu in the new chat.
  - Expected: The new chat shows Formal selected.
- **Delete custom style used by a chat**
  1. Create a custom style, use it in chat A.
  2. Delete the style from the menu and confirm.
  3. Return to chat A.
  - Expected: Chat A shows Default style and default length.
- **Mobile persistence**
  1. Open a chat, Add to chat > Choose style > Formal.
  2. Close the app and reopen the same chat.
  - Expected: Style row still shows Formal; a different chat shows Normal.
- **CLI session-only**
  1. Run /output-style concise --session.
  2. Check the project config file for ui.output_style.
  3. Run /output-style with no argument.
  - Expected: Config is unchanged; the overview marks concise active.

**Where to look when it fails**

- Web: browser localStorage key agi-response-style; network call PUT /api/settings/preferences with namespace response-style.
- Mobile: MMKV store chat-view-store, field chatStyleByConversation.
- CLI: message 'Output style unchanged' or 'No output style named' from handle_output_style; 'Failed to persist output style' from the TUI route.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/040-instructions-preferences-and-personal-style.md](../../70-qa/test-plans/web/040-instructions-preferences-and-personal-style.md)
- Desktop: [70-qa/test-plans/desktop/040-instructions-preferences-and-personal-style.md](../../70-qa/test-plans/desktop/040-instructions-preferences-and-personal-style.md)
- Mobile: [70-qa/test-plans/mobile/040-instructions-preferences-and-personal-style.md](../../70-qa/test-plans/mobile/040-instructions-preferences-and-personal-style.md)
- CLI: [70-qa/test-plans/cli/040-instructions-preferences-and-personal-style.md](../../70-qa/test-plans/cli/040-instructions-preferences-and-personal-style.md)

## 10. Gaps and dependencies

- **Per-conversation choices are not synced across devices.** Affects: Web, Desktop and Mobile users with more than one device. Evidence: style-store.ts:255-258 persists locally; style-store.ts:305-312 syncs only customStyles; no Mobile sync code found. Work needed: Store the override with the conversation record or in the account settings and read it on open.
- **VS Code and Chrome have no per-chat style override.** Affects: VS Code and Chrome users. Evidence: outputStyles.ts:85, 122 stores one global choice; no Chrome code found. Work needed: Add a per-thread or per-tab choice.
- **Deleting a custom style also drops the length choice of chats that used it.** Affects: Web and Desktop users. Evidence: style-store.ts:210-214. Work needed: Reset only the style field and keep the length.
- **Mobile has no response-length override and no custom styles.** Affects: Mobile users. Evidence: chatViewStore.ts:14, 64-66 hold style only. Work needed: Add length and custom style support if parity is wanted.
- **Mobile test title says 4 options while 5 exist.** Affects: Test maintainers. Evidence: apps/mobile/__tests__/StyleSelector.test.tsx:100-107. Work needed: Fix the test to assert all five options.
- Not built on: VS Code, Chrome (from the capability ledger).

**Depends on**

- SYS-chat-turn-pipeline
- SYS-memory-projects-and-context
- SYS-sync-and-continuity
- SYS-shared-ui-and-design
- F040-09
- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- mode:local
- mode:own-key
- mode:cloud

## Unknown

- Whether the server changes or trims a client-sent system style message was not traced.
- Whether the CLI keeps a session-only style when a session is resumed was not run.
- Whether Desktop's Tauri code has any per-chat style path: only a settings search entry 'Response style' was found (apps/desktop/src/features/settings/settingsSearchIndex.ts:55).
- Whether Chrome has any style control: searches found none, but the whole extension was not read.

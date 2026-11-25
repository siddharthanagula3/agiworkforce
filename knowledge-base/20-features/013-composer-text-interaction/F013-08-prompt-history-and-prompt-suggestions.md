---
id: "F013-08"
type: "feature"
title: "Prompt history and prompt suggestions"
aliases: ["Prompt history", "history.txt", "Up arrow recall", "Follow-up suggestions", "Related questions", "Show follow-up suggestions in chats", "Suggested follow-ups"]
area: "13 Composer text interaction"
available_on: ["web", "desktop", "mobile", "cli", "vscode"]
implementation: {web: "partial", desktop: "partial", mobile: "partial", cli: "partial", vscode: "built", chrome: "missing"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "n/a", cli: "not seen by a person", vscode: "not seen by a person", chrome: "n/a"}
requirement_items: ["S13.19", "S13.20"]
depends_on: ["surface:cli", "surface:web", "surface:desktop", "surface:mobile", "surface:vscode", "mode:cloud", "SYS-chat-turn-pipeline", "SYS-model-catalog-and-routing", "SYS-subscriptions-entitlements-and-usage", "api:POST /api/chat/conversations/{id}/messages/{messageId}/follow-ups"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F013-08 Prompt history and prompt suggestions

CLI recalls earlier prompts with Up and Down and keeps them in history.txt. Suggestions are three follow-up questions shown after a reply: Web and Desktop show them after searched or research turns when the setting is on, Mobile shows them in Cloud chats, VS Code offers three fixed prompts in its native chat panel.

Area: [13. Composer text interaction](README.md). Requirement items: [S13.19](../../10-requirements/capabilities/013-composer-text-interaction.md#s1319), [S13.20](../../10-requirements/capabilities/013-composer-text-interaction.md#s1320).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built | partly built | not seen by a person |
| Desktop | partly built | partly built | not seen by a person |
| Mobile | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| CLI | partly built | partly built | not seen by a person |
| VS Code | built | built | not seen by a person |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Lets a terminal user step back through sent prompts and forward again, restoring the unfinished draft at the end, and offers clickable follow-up questions after an answer.

**Why it exists.** Retyping long prompts is slow; the leaders show related questions after answers. Suggestions are a fast way to continue (brief S13.19, S13.20).

**Who uses it.** CLI users for history; chat users on Web, Desktop, Mobile and the VS Code chat panel for suggestions.

**Problems it solves**

- Retyping a prompt
- Not knowing what to ask next

**Use cases**

- In the CLI press Up twice to rerun an older prompt with a change.
- Press Down past the newest prompt to get back the half-typed text.
- After a web-searched answer click a suggested question to ask it.
- On Mobile in a Cloud chat tap a suggestion chip.

## 2. User experience

**Where to find it**

- CLI: the TUI composer, keys Up and Down (apps/cli/src/tui/tui_app.rs:4184,4196); the line REPL also uses history.txt (apps/cli/src/repl/mod.rs:236).
- Web and Desktop: pills under the last reply, group named 'Follow-up suggestions' with a 'Hide' button (apps/web/features/chat/components/FollowUpSuggestions.tsx).
- Web and Desktop setting: 'Show follow-up suggestions in chats' (apps/web/features/settings/sections/GeneralSection.tsx:631).
- Mobile: chips under the last Cloud answer (apps/mobile/app/(app)/chat/[id].tsx:2597).
- VS Code: follow-up buttons in the native chat panel: Explain the selected code, Fix issues in the selection, Generate tests (apps/extension-vscode/src/features/chat-participant/chatParticipant.ts:685).

**Before you start**

- CLI: a config directory for history.txt (apps/cli/src/tui/prompt_history.rs:17).
- Web: signed in, saved non-temporary chat, answer longer than 20 characters, no failed turn, setting on (ChatMessageList.tsx:1466-1473).
- Mobile: Cloud mode, non-temporary, finished answer (apps/mobile/app/(app)/chat/[id].tsx:1368-1376).

**Screens and controls**

- CLI Up and Down; status notice 'draft available · Up restores it' (tui_app.rs:4363).
- Web pills with an arrow icon on hover and a 'Hide' button labelled 'Hide suggestions'.
- Settings switch row in the General section.

**Journey**

1. CLI: type a prompt, send; it is appended to history.txt (prompt_history.rs:46).
2. Press Up on an empty or first line; the newest prompt appears, the current text is saved as the draft (prompt_history.rs:66-78).
3. Press Up again for older ones; Down for newer; Down past the newest restores the saved text (prompt_history.rs:80-90).
4. Web: after an answer finishes, the page asks the server for three questions (use-generated-follow-ups.ts) and shows them; click one to send it.
5. Click Hide to dismiss until the next answer.

**What the person sees and gets**

- CLI replaces the composer text with the recalled prompt.
- Web sends the clicked question straight away as the next message (FollowUpSuggestions.tsx onClick calls onSelect).
- When generation fails the web falls back to a keyword matcher (FollowUpSuggestions.tsx:80).

**Settings**

- Web: followUpSuggestionsEnabled, default true in the store (apps/web/shared/stores/web-settings-store.ts:135), synced with account settings (apps/web/features/settings/components/CloudSettingsSync.tsx:75).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- CLI: history loads from history.txt, appends each new prompt, Up older, Down newer, draft restored (prompt_history.rs:15-90; tui_app.rs:4184-4196).
- CLI Up first tries moving inside a multi-line draft, then the parked draft, then history, and only then scrolls the chat (tui_app.rs:4178-4200).
- Web server route generates exactly three questions, caches them on the message, returns none for temporary chats (apps/web/app/api/chat/conversations/[id]/messages/[messageId]/follow-ups/route.ts:47; generate-follow-ups.ts:24).
- Generation is admitted as a utility route, reserves usage under the feature name follow_up_suggestions and settles after (generate-follow-ups.ts:124,158,225).
- Mobile suggestions are mounted and call the same endpoint, with a keyword fallback (mobile chat/[id].tsx:2597; followUps.ts:1).
- VS Code native chat participant offers three fixed follow-ups (chatParticipant.ts:685-696).

**Incomplete**

- Web and Desktop: the ChatMessageList prop default constant FOLLOW_UP_SUGGESTIONS_ENABLED_DEFAULT is false (ChatMessageList.tsx:1104) and no caller passes it, so suggestions appear only after a turn that searched or ran research (ChatMessageList.tsx:1431-1437,1468). The brief says to flip the constant (brief S13.20).
- CLI has no history search key; the brief asks for one (brief S13.19); none found in tui_app.rs or prompt_history.rs.
- CLI shell lines starting with ! are recorded too (tui_app.rs:7384).

**Present but disconnected or switched off**

- Web keyword-matcher suggestions for turns that did not search are switched off by the false default (ChatMessageList.tsx:1104).

**Not available**

- Chrome and CLI have no prompt suggestions (no code found).
- Mobile and Chrome have no prompt history of their own (none found).
- VS Code suggestions are not model generated; they are three fixed prompts.

## 4. Required behaviour

**Established requirements**

- In the terminal, Up/Down (and a search key) recall previously sent prompts into the composer. (source: brief S13.19)
- The product offers prompt suggestions that the user can pick to fill or send the next message. (source: brief S13.20)
- Switch-on step for Web and Desktop is to change the default constant to true. (source: brief S13.20 Unfinished)

**Acceptance criteria**

1. CLI: send three prompts, restart, press Up; the last prompt returns.
2. CLI: type half a line, press Up then Down; the half line returns.
3. Web with the setting on, after a web-searched answer three questions appear and one click sends it.
4. Web with the setting off, no suggestions appear.
5. Web temporary chat shows no generated suggestions.
6. Mobile Cloud chat shows chips after a finished answer and none in a temporary chat.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Suggestions should respect the account usage limits since each set spends a background usage reservation (generate-follow-ups.ts:158) [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add a reverse search key to the CLI.
- [proposed] Decide one default across Web, Desktop and Mobile and show Mobile the same settings toggle.
- [proposed] Skip server generation for chats answered on the device.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| other | PromptHistory | `apps/cli/src/tui/prompt_history.rs` | File-backed history with older, newer and draft restore. |
| component | TUI key handling | `apps/cli/src/tui/tui_app.rs` | Up and Down routing, record on send, parked draft. |
| other | REPL history | `apps/cli/src/repl/mod.rs` | Line REPL loads the same history.txt. |
| component | FollowUpSuggestions (web) | `apps/web/features/chat/components/FollowUpSuggestions.tsx` | Pills, Hide, keyword fallback. |
| hook | useGeneratedFollowUps | `apps/web/features/chat/hooks/use-generated-follow-ups.ts` | Asks the server once per turn. |
| component | ChatMessageList gate | `apps/web/features/chat/components/messages/ChatMessageList.tsx` | Default constant, setting and searched-turn rule. |
| endpoint | POST follow-ups | `apps/web/app/api/chat/conversations/[id]/messages/[messageId]/follow-ups/route.ts` | Generate or return cached suggestions. |
| service | generateFollowUpSuggestions | `apps/web/app/api/chat/conversations/[id]/messages/lib/generate-follow-ups.ts` | Utility route admission, usage reservation, sanitising. |
| config | followUpSuggestionsEnabled | `apps/web/shared/stores/web-settings-store.ts` | Setting, default true. |
| component | FollowUpSuggestionsRow setting | `apps/web/features/settings/sections/GeneralSection.tsx` | The switch labelled 'Show follow-up suggestions in chats'. |
| component | FollowUpSuggestions (mobile) | `apps/mobile/src/features/chat/components/FollowUpSuggestions.tsx` | Chips with cached, fetched and fallback sets. |
| service | fetchFollowUpSuggestions | `apps/mobile/src/features/chat/services/followUps.ts` | Calls the follow-ups endpoint. |
| other | followupProvider | `apps/extension-vscode/src/features/chat-participant/chatParticipant.ts` | Three fixed follow-ups. |
| table | web_messages.metadata followUpSuggestions | `apps/web/app/api/chat/conversations/[id]/messages/[messageId]/follow-ups/route.ts` | Cache of the set on the answering message. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| CLI records each sent prompt into history.txt and loads it at start. | device | prompt_history.rs:15-60; tui_app.rs:7384,7410 |
| Web page asks the server for suggestions for the last answer once per turn. | device and our servers | use-generated-follow-ups.ts:36-46 |
| Server admits a utility model route, reserves usage, asks the model for three short questions, cleans them. | our servers | generate-follow-ups.ts:124-225 |
| The model call goes to the routed provider chosen by the utility admission. | outside service | generate-follow-ups.ts:200 (buildServerProviderAdapter stream) |
| Set is cached in message metadata; reload reads it. | our servers | follow-ups/route.ts:100-112 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| CLI prompt history | history.txt in the CLI config directory | No | Appended; no pruning rule read (unknown) |
| Three suggestion strings | web_messages.metadata followUpSuggestions | Yes with the chat | Kept with the message |

**Models and providers.** The question writer is a utility route picked server-side, not the user's selected model (generate-follow-ups.ts:124). Output capped by a small token limit constant and three suggestions (generate-follow-ups.ts:24,28).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | CLI history needs none. Web suggestions need a signed-in saved chat; the route runs under the user's scoped database (follow-ups/route.ts:23). |
| Permissions | none found beyond conversation ownership. |
| Subscription | Each generation reserves background usage under the feature follow_up_suggestions against the plan; a refused reservation returns no suggestions (generate-follow-ups.ts:158-185). |
| Limits and metering | Rate limited under 'chat-message' (route.ts:27); three suggestions of up to 100 characters; once per turn, cached. |
| Feature flags | Setting followUpSuggestionsEnabled; code constant false (ChatMessageList.tsx:1104). |
| Model compatibility | Any chat; no per-model rule found. |
| Provider restrictions | Utility route admission may refuse (generate-follow-ups.ts:134). |
| Local mode | CLI history is local. For chats answered by an on-device model the web hook does not check for local models before calling the server (use-generated-follow-ups.ts:36); whether that sends local answer text to our server is not established (unknown). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading | Web hides the row while the request is pending. | ChatMessageList.tsx:2013 |
| Error | A failed request is swallowed and the keyword matcher shows instead. | use-generated-follow-ups.ts:55-58 |
| Empty history | Up returns nothing and the chat scrolls instead. | prompt_history.rs:68; tui_app.rs:4187 |
| Typing | Pills fade and ignore pointer while the user types. | FollowUpSuggestions.tsx:107 |
| Temporary chat | Server returns an empty list. | follow-ups/route.ts:47 |
| Search unavailable | Suggestions that ask for web search are removed. | FollowUpSuggestions.tsx:84 |
| Offline or timeout | not handled in the code beyond the swallowed error. | searched use-generated-follow-ups.ts: the catch block only falls back to the keyword matcher |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/chat/components/FollowUpSuggestions.test.tsx`: Keyword matcher rules (titles read: empty, 20 character threshold, code, bug, list patterns).
- `apps/web/app/api/chat/conversations/[id]/messages/[messageId]/follow-ups/route.test.ts`: Generates once for a searched turn, also for a non-searched turn, serves cache, caches result.
- `apps/web/app/api/chat/conversations/[id]/messages/lib/generate-follow-ups.test.ts`: Reserves before the provider and settles after; refused admission and budget never reach the provider.
- `packages/ui/unified-chat/src/lib/follow-ups.test.ts`: Shared matcher (file exists; titles not read).
- `apps/mobile/src/features/chat/components/__tests__/FollowUpSuggestions.test.tsx`: First three shown, asks on tap, nothing on failure, waits for server sync.
- `apps/cli/src/tui/tui_app.rs`: In-file tests use an in-memory history; no named test for Up and Down order was read.

**Test scenarios**

- **CLI recall**
  1. Send prompts one, two.
  2. Type draft text.
  3. Press Up twice, Down twice.
  - Expected: Two then one appear; second Down returns the draft text.
- **CLI persistence**
  1. Send a prompt, quit, restart, press Up.
  - Expected: The prompt returns from history.txt.
- **Web searched turn**
  1. Turn on the setting.
  2. Ask a question that triggers web search.
  3. Wait for the answer.
  - Expected: Up to three pills and Hide appear; click sends it.
- **Web plain turn**
  1. Same but a question with no search.
  - Expected: No pills today because the constant is false.
- **Temporary chat**
  1. Open a temporary chat, finish an answer.
  - Expected: No generated suggestions.

**Where to look when it fails**

- Logger line '[follow-ups] usage reservation refused' and 'reservation release failed' (generate-follow-ups.ts).
- web_messages.metadata.followUpSuggestions for a message.
- history.txt in the CLI config directory.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/013-composer-text-interaction.md](../../70-qa/test-plans/web/013-composer-text-interaction.md)
- Desktop: [70-qa/test-plans/desktop/013-composer-text-interaction.md](../../70-qa/test-plans/desktop/013-composer-text-interaction.md)
- Mobile: [70-qa/test-plans/mobile/013-composer-text-interaction.md](../../70-qa/test-plans/mobile/013-composer-text-interaction.md)
- CLI: [70-qa/test-plans/cli/013-composer-text-interaction.md](../../70-qa/test-plans/cli/013-composer-text-interaction.md)
- VS Code: [70-qa/test-plans/vscode/013-composer-text-interaction.md](../../70-qa/test-plans/vscode/013-composer-text-interaction.md)

## 10. Gaps and dependencies

- **Web and Desktop suggestions only show after searched or research turns because the default constant is false.** Affects: Web, Desktop. Evidence: ChatMessageList.tsx:1104,1468. Work needed: Flip the constant per the brief after deciding cost and quota effect.
- **CLI history has no search key.** Affects: CLI. Evidence: brief S13.19; none found in tui_app.rs. Work needed: Add reverse search.
- **Chrome and CLI show no suggestions.** Affects: Chrome, CLI. Evidence: no code found. Work needed: Add or decide to leave out.
- **Mobile has suggestions but no setting to turn them off, unlike Web.** Affects: Mobile. Evidence: no setting reference found in apps/mobile. Work needed: Add the same toggle.
- **Brief is out of date: it says Mobile is missing.** Affects: Documentation. Evidence: apps/mobile/app/(app)/chat/[id].tsx:2597. Work needed: Correct brief S13.20.
- Not built on: Chrome (from the capability ledger).

**Depends on**

- surface:cli
- surface:web
- surface:desktop
- surface:mobile
- surface:vscode
- mode:cloud
- SYS-chat-turn-pipeline
- SYS-model-catalog-and-routing
- SYS-subscriptions-entitlements-and-usage
- api:POST /api/chat/conversations/{id}/messages/{messageId}/follow-ups

## Unknown

- Which provider and model the utility route picks in production.
- Whether history.txt has a size cap.
- Whether web follow-ups for an on-device chat send text to our server.
- Whether the Desktop app changes the suggestion default (it shows the hosted web app, so the same code applies).

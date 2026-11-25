---
id: "F012-04"
type: "feature"
title: "Task shortcuts and mode explanation"
aliases: ["Task shortcuts", "Mode explanation", "Chat | Work switch", "Slash commands", "Page actions", "Task chips"]
area: "12 New-chat experience"
available_on: ["web", "desktop", "mobile", "cli", "vscode", "chrome"]
implementation: {web: "partial", desktop: "partial", mobile: "built", cli: "built", vscode: "built", chrome: "built"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S12.05", "S12.21"]
depends_on: ["SYS-chat-turn-pipeline", "SYS-agents-tools-and-automation", "SYS-model-catalog-and-routing", "SYS-subscriptions-entitlements-and-usage", "SYS-shared-ui-and-design", "surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:vscode", "surface:chrome", "F012-05"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F012-04 Task shortcuts and mode explanation

One-step ways to set up the next message and explanations of the modes. Web and Desktop have the Chat | Work switch with hover explanations and a slash menu with descriptions and examples. CLI explains each permission mode. Chrome has page action chips. Mobile has no task chips file; modes sit in the Add to chat sheet.

Area: [12. New-chat experience](README.md). Requirement items: [S12.05](../../10-requirements/capabilities/012-new-chat-experience.md#s1205), [S12.21](../../10-requirements/capabilities/012-new-chat-experience.md#s1221).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built | partly built | not seen by a person |
| Desktop | partly built | partly built | not seen by a person |
| Mobile | partly built (this page lists unfinished parts) | built | not seen by a person |
| CLI | partly built (this page lists unfinished parts) | built | not seen by a person |
| VS Code | partly built (this page lists unfinished parts) | built | not seen by a person |
| Chrome | built | built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Lets a person pick a kind of work before sending, and tells them what each mode does.

**Why it exists.** People do not know what the modes mean until told (brief S12.05, S12.21).

**Who uses it.** New and returning users on every app.

**Problems it solves**

- Choosing between a quick answer and multi-step work.
- Learning slash commands.
- Starting a page task in Chrome.

**Use cases**

- Type / on web and read '/search - Search the web, for example /search latest AI news'.
- Hover the 'Work' segment and read its explanation.
- In CLI press the mode key and read the one-line description.
- On a web page click 'Summarize' in the in-page panel.

## 2. User experience

**Where to find it**

- Web and Desktop (Electron): segmented control 'Chat' | 'Work' on the composer; slash menu by typing / (ChatComposerNew.tsx:6169-6200; SlashCommandMenu.tsx).
- Mobile: Add to chat sheet rows (Create image, Create video, Web search, Deep research, Study and learn) and the Work switch (AddToChatSheet.tsx:927-1260; chat.tsx:941).
- CLI: key hint 'to change how much AGI does alone' and /plan; mode text shown on change (tui_app.rs:2721-2723,5429).
- VS Code: Action sheet item 'Mode: <label>' with description 'Set agent operating mode' (core/commandSetup.ts, openActionSheet).
- Chrome: in-page panel action chips (pageActions.ts:31-135; panel.ts:536).

**Before you start**

- Work needs the canUseAgiWork capability and a non-free-trial session (ChatComposerNew.tsx:1062-1066).
- Slash commands may need capabilities such as canUseBrowserAutomation (slashCommands.ts:55-62).

**Screens and controls**

- Web Work segment hover text: 'Work: multi-step tasks with tools, files, and reviewable deliverables'; Chat: 'Chat: quick questions and conversation' (ChatComposerNew.tsx:326-329).
- Work placeholder 'Describe a multi-step task and what it should deliver' (ChatComposerNew.tsx:339-342).
- Slash menu entries /search, /think, /image, /code, /browser, /terminal, /database with description and example (slashCommands.ts:30-80).
- CLI mode text: Chat, Plan, AcceptEdits, BypassPermissions, FullAuto each with a sentence (tui_app.rs:5429-5441).
- Chrome chips: Summarize, Key points, Q&A, Translate; YouTube and GitHub pull request variants.

**Journey**

1. Open a new chat.
2. Pick the mode or type /.
3. Read the explanation (hover, menu row, status text).
4. Type the message and send; the mode applies as configured.

**What the person sees and gets**

- Segment highlight and changed placeholder (web).
- Notice when a slash command is unavailable, e.g. '/search needs a model that can search the web...' (ChatComposerNew.tsx:3195-3203).
- System message with mode label and description (CLI).

**Settings**

- Web general settings has a Chat/Work select (apps/web/features/settings/sections/GeneralSection.tsx near 600).
- CLI key bindings for mode cycle.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web Chat | Work switch with titles and placeholder (ChatComposerNew.tsx:326-342,6169-6200).
- Web slash commands with descriptions and examples (slashCommands.ts:30-80; SlashCommandMenu.tsx:194-206).
- CLI mode descriptions (tui_app.rs:5429-5441) and start-screen hint (tui_app.rs:2714-2735).
- Chrome page-aware chips run a prompt with the page text (panel.ts:536-546).
- Mobile Work switch handler routes signed-out users to sign-in (chat.tsx:941-947).

**Incomplete**

- Web: explanation exists only as hover titles and menu text, not a dedicated section with examples per mode.
- Mobile: the brief cites TaskChips.tsx, which does not exist (find returned nothing); founder decision removed mode lines and example tasks from the mobile empty screen (doc: docs/decisions/2026-11-10-founder-decisions.md D-2026-11-10-01).
- VS Code: mode label is in a Quick Pick, not on the empty chat.

**Present but disconnected or switched off**

- Tauri EmptyChat starter cards (internal code).

**Not available**

- Shortcut chips on the web new-chat screen: none found.
- Task shortcuts on CLI beyond slash commands.

## 4. Required behaviour

**Established requirements**

- The new-chat screen offers one-tap task-category shortcuts such as write, research, image that set up the next message. (source: brief S12.05)
- The new-chat screen explains the available modes with examples. (source: brief S12.21)
- Mobile new chat shows no line describing the mode and no example tasks. (source: doc: docs/decisions/2026-11-10-founder-decisions.md D-2026-11-10-01)
- Shared category chips are filtered by active runtime capability rather than advertising unavailable modes. (source: doc: docs/decisions/wire-or-cut.md:155)

**Acceptance criteria**

1. Hovering Work on web shows its explanation.
2. Typing / on web lists commands with description and example.
3. /search on a model without search shows the notice and does not send.
4. CLI mode change prints label and description.
5. Chrome on a YouTube watch page shows YouTube chips, on a GitHub pull request shows PR chips, elsewhere the four generic chips.
6. A signed-out mobile tap on Work opens sign-in.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Shortcut should change only the next message [inferred from brief wording; not confirmed in web code, only mobile resetMediaChoice after send (chat.tsx:571)].

**Proposed improvements** (suggestions, not requirements)

- [proposed] A single shared mode-explanation component fed by the capability list.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | ChatComposerNew mode switch | `apps/web/features/chat/components/Composer/ChatComposerNew.tsx` | Chat / Work segmented control, titles, placeholders. |
| config | BUILT_IN_SLASH_COMMANDS | `packages/ui/unified-chat/src/lib/slashCommands.ts` | Slash command definitions with description and example. |
| component | SlashCommandMenu | `apps/web/features/chat/components/Composer/SlashCommandMenu.tsx` | Renders command rows. |
| component | AgiWorkIntroDialog | `apps/web/features/chat/components/AgiWorkIntroDialog.tsx` | Intro dialog shown in Work mode on the empty chat. |
| hook | useNewChatEntry | `apps/web/features/chat/hooks/use-new-chat.ts` | Applies deep-link mode and draft once. |
| service | new-chat-entry | `apps/web/features/chat/lib/new-chat-entry.ts` | Builds and parses /chat?q=&from=&mode= links. |
| component | Mobile AddToChatSheet | `apps/mobile/src/features/chat/components/AddToChatSheet.tsx` | Mode rows and toggles. |
| screen | Mobile chat tab | `apps/mobile/app/(app)/(tabs)/chat.tsx` | handleTapWorkMode and media sends. |
| command | CLI mode_description | `apps/cli/src/tui/tui_app.rs` | Sentence for each interaction mode. |
| command | VS Code openActionSheet | `apps/extension-vscode/src/core/commandSetup.ts` | Quick Pick with Mode item. |
| component | Chrome pageActions | `apps/extension/src/features/content/in-page-panel/pageActions.ts` | Chip definitions per page type. |
| component | Chrome in-page panel | `apps/extension/src/features/content/in-page-panel/panel.ts` | Builds chips and runs the prompt. |
| component | Tauri EmptyChat | `apps/desktop/src/features/v3/EmptyChat.tsx` | Starter cards (internal). |
| test | SlashCommandMenu test | `apps/web/features/chat/components/Composer/SlashCommandMenu.test.tsx` | Menu behaviour. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Mode changes are stored as composer toggles in the web chat store on the device. | device | ChatComposerNew.tsx:1112; use-new-chat.ts:30 |
| On send, the composer passes workMode to the send path; Work is forced back to chat if the account is not entitled. | device | ChatComposerNew.tsx:3913,4545 |
| The turn runs through the chat pipeline on our servers or on the chosen route. | our servers | not traced; see SYS-chat-turn-pipeline |
| Chrome chip click builds a prompt from visible page text and sends it through the in-page prompt port to the extension. | device and our servers | panel.ts:536-546 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Composer toggles (work mode, search, research) | Web chat store, memory; pending slot for a new chat | Not found | Reset on clear (ChatComposerNew.tsx:2292 setComposerToggles after send) |

**Models and providers.** Search and think commands depend on model capability flags (ChatComposerNew.tsx:3190-3215); Auto model hands over search where configured.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Work needs an entitled signed-in account; slash commands search/think/image work for signed-in web chat. |
| Permissions | canUseAgiWork (web), canUseBrowserAutomation, canUseTerminal, canUseLocalDatabase for those commands. |
| Subscription | Work gated by capability decision or billing plan capability 'agi_work' (ChatComposerNew.tsx:1062-1066). Plan names not listed here. |
| Limits and metering | none found for the switch itself. |
| Feature flags | Mobile FEATURES.research, FEATURES.webSearch, FEATURES.imageGen, FEATURES.videoGen. |
| Model compatibility | /search needs a search-capable model or Auto; /think needs a reasoning model or Auto. |
| Provider restrictions | Search routing depends on provider route (doc: AGENTS.md section 4). |
| Local mode | Mobile Local hides Web search, Deep research and media rows (AddToChatSheet.tsx:230-342 require cloud). CLI Local keeps mode text and omits /image (tui_app.rs:1094-1100). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Unavailable command | Notice text and nothing is sent. | ChatComposerNew.tsx:3195-3215 |
| Not entitled for Work | Work segment hidden; mode forced to chat. | ChatComposerNew.tsx:6169; 3913 |
| Turn active | Segment disabled. | ChatComposerNew.tsx:6182 |
| Signed out (Mobile Work tap) | Starts sign-in flow. | chat.tsx:941-945 |
| Page text over limit (Chrome) | Text truncated with a notice. | pageActions.ts:20-23,150 |
| Offline / timeout | not handled in the code read. | not found |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `packages/ui/unified-chat/src/lib/__tests__/slashCommands.test.ts`: Slash command filtering (name suggests; body not opened).
- `apps/web/features/chat/components/Composer/SlashCommandMenu.test.tsx`: Menu rendering (body not opened).
- `apps/web/features/chat/components/Composer/ChatComposerNew.chatSlashCommands.test.tsx`: Composer slash handling (body not opened).
- `apps/mobile/__tests__/ChatTabModeToggle.test.tsx`: Mobile mode toggle (body not opened).
- `apps/extension/__tests__/inPagePanel.test.ts`: In-page panel; matched pageActions search; body not opened.
- `apps/web/app/chat/__tests__/NewChatDeepLink.test.tsx`: /chat and /agi-work open a new chat, Work switched on for the Work path.

**Test scenarios**

- **Work explanation**
  1. Open web chat with a Work-entitled account.
  2. Hover Work.
  - Expected: Title text describes multi-step tasks.
- **Slash search unavailable**
  1. Select a model without search.
  2. Type /search news and Enter.
  - Expected: Notice appears, no message sent.
- **Free-trial user**
  1. Use the guest or free-trial chat.
  - Expected: No Work segment.
- **CLI mode text**
  1. Run the CLI.
  2. Press the mode key.
  - Expected: Message with mode label and description.
- **Chrome chips**
  1. Open a GitHub pull request page.
  2. Open the in-page panel.
  - Expected: PR-specific chips.

**Where to look when it fails**

- Web: composer notice text; capability decision via useCapabilityDecision.
- Chrome: panel prompt port errors in the extension console.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/012-new-chat-experience.md](../../70-qa/test-plans/web/012-new-chat-experience.md)
- Desktop: [70-qa/test-plans/desktop/012-new-chat-experience.md](../../70-qa/test-plans/desktop/012-new-chat-experience.md)
- Mobile: [70-qa/test-plans/mobile/012-new-chat-experience.md](../../70-qa/test-plans/mobile/012-new-chat-experience.md)
- CLI: [70-qa/test-plans/cli/012-new-chat-experience.md](../../70-qa/test-plans/cli/012-new-chat-experience.md)
- VS Code: [70-qa/test-plans/vscode/012-new-chat-experience.md](../../70-qa/test-plans/vscode/012-new-chat-experience.md)
- Chrome: [70-qa/test-plans/chrome/012-new-chat-experience.md](../../70-qa/test-plans/chrome/012-new-chat-experience.md)

## 10. Gaps and dependencies

- **No dedicated mode explanation with examples on Web/Desktop new-chat screen** Affects: Web, Desktop. Evidence: Only titles (ChatComposerNew.tsx:326-329) and slash examples (slashCommands.ts). Work needed: Decide whether titles suffice; add if not.
- **Mobile TaskChips file does not exist** Affects: Mobile. Evidence: find over apps/mobile for TaskChips* returned nothing. Work needed: Correct brief; record that mobile intentionally has none (D-2026-11-10-01).
- **'Next message only' behaviour unproven on Web** Affects: Web, Desktop. Evidence: toggles cleared on clear (ChatComposerNew.tsx:2292) but mode persistence after send not traced. Work needed: Trace and test.
- **No task shortcuts on VS Code and CLI empty screens** Affects: CLI, VS Code. Evidence: tui_app.rs start panel; webviewContent.ts:172. Work needed: Owner decision.

**Depends on**

- SYS-chat-turn-pipeline
- SYS-agents-tools-and-automation
- SYS-model-catalog-and-routing
- SYS-subscriptions-entitlements-and-usage
- SYS-shared-ui-and-design
- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:vscode
- surface:chrome
- F012-05

## Unknown

- Whether the mode persists after send on web.
- Contents of the listed test files not opened.
- VS Code Mode quick pick description beyond 'Set agent operating mode'.
- Chrome message strings for brief lines messages.json:1278-2428 not opened.

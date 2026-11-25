---
id: "F040-02"
type: "feature"
title: "Response style presets (per chat)"
aliases: ["Response style", "Style selector", "Style presets", "Tone presets", "Output style (CLI)", "Style Preset (Mobile)", "Chat style", "S40.05", "S40.08", "S40.23", "S40.24", "S40.25", "S40.26"]
area: "40 Instructions, preferences, and personal style"
available_on: ["web", "desktop", "mobile", "cli", "vscode"]
implementation: {web: "built", desktop: "built", mobile: "partial", cli: "built", vscode: "partial", chrome: "missing"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S40.05", "S40.08", "S40.23", "S40.24", "S40.25", "S40.26"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:vscode", "mode:cloud", "mode:local", "api:PUT /api/settings/preferences", "table:user_settings", "table:user_projects", "store:agi-response-style", "SYS-chat-turn-pipeline", "SYS-shared-ui-and-design", "F040-01", "F040-03", "F040-05", "file:packages/contracts/types/src/response-style-preferences.ts"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F040-02 Response style presets (per chat)

Pick one named style that governs replies: Default, Concise, Explanatory, Learning or Formal. On Web and Mobile it can be set per chat in the composer and as an account default in Personalization, with a reset button. The CLI has its own output styles (default, proactive, concise, explanatory, learning, study).

Area: [40. Instructions, preferences, and personal style](README.md). Requirement items: [S40.05](../../10-requirements/capabilities/040-instructions-preferences-and-personal-style.md#s4005), [S40.08](../../10-requirements/capabilities/040-instructions-preferences-and-personal-style.md#s4008), [S40.23](../../10-requirements/capabilities/040-instructions-preferences-and-personal-style.md#s4023), [S40.24](../../10-requirements/capabilities/040-instructions-preferences-and-personal-style.md#s4024), [S40.25](../../10-requirements/capabilities/040-instructions-preferences-and-personal-style.md#s4025), [S40.26](../../10-requirements/capabilities/040-instructions-preferences-and-personal-style.md#s4026).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | built (this page lists unfinished parts) | partly built | not seen by a person |
| CLI | built | built | not seen by a person |
| VS Code | partly built | partly built | not seen by a person |
| Chrome | not built **(disagrees with the ledger on whether it exists)** | partly built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Maps a preset id to one sentence of guidance that is added to the prompt (packages/contracts/types/src/response-style-preferences.ts:47-54). The account default is saved in the 'personalization' namespace; a per-chat choice in the composer overrides it for that conversation (apps/web/features/chat/stores/style-store.ts:319-381).

**Why it exists.** So the person can change the voice of replies quickly, in one tap, without writing instructions.

**Who uses it.** Anyone who wants shorter, teaching, explaining or formal answers. The Learning preset targets students; the CLI styles target developers.

**Problems it solves**

- Replies too long or too chatty.
- Need for step-by-step teaching with check-in questions.
- Need to switch voice for one chat without changing the account default.

**Use cases**

- Student picks Learning in the composer to be taught step by step with a check question.
- Lawyer sets account default Formal in Personalization.
- Developer runs /output-style concise --session in the CLI for one session.
- Person presses 'Reset response style' to go back to defaults.

## 2. User experience

**Where to find it**

- Web and Desktop (Electron shows the hosted web app): the composer style chip opens a menu titled 'Response style' with Default, Concise, Explanatory, Learning, Formal (apps/web/features/chat/components/Composer/StyleSelector.tsx:30-36,195-214). Account default: Settings, Personalization, 'Style and tone', select 'Response style' (PersonalizationSection.tsx:394-402).
- Mobile: chat style sheet with Normal, Concise, Explanatory, Learning, Formal (apps/mobile/src/features/chat/components/StyleSelector.tsx:17-23); account default under Personalization, chips 'Style Preset' (index.tsx:594-603). The draft/brief claim that Mobile has no Learning preset is wrong: Learning exists in both places (StyleSelector.tsx:21; constants.ts:12-15).
- CLI: /output-style [name] with built-ins default, proactive, concise, explanatory, learning, study; /output-style new and delete for your own (apps/cli/src/claude_parity.rs:1297-1367; output_styles.rs:96-105). Account style via /personalize set style <value>.
- VS Code: command 'Code: Personalization', item 'Style' (apps/extension-vscode/src/features/personalization/personalization.ts:144-157). No per-chat style found.
- Chrome: no style control found.

**Before you start**

- Web per-chat choice needs no paid plan; saving the account default needs sign-in.
- CLI account style needs Managed mode; CLI output styles work in every mode (they are files and config on the device, output_styles.rs:3-6).

**Screens and controls**

- Web composer menu: five rows with a short description each (for example Learning: 'Step by step, with check-ins'), a 'Response length' group, custom style list with edit and delete.
- Web Personalization: 'Reset response style' button (PersonalizationSection.tsx:472-479).
- Mobile Personalization: 'Reset response style' button (index.tsx:652-663); the reset takes effect after Save and also puts the chat style back to normal (index.tsx:449-452).
- CLI: slash commands; '*' marks the active style in the list (claude_parity.rs:1411-1415).

**Journey**

1. Open the composer style menu (Web) or style sheet (Mobile).
2. Choose a preset; the menu closes.
3. Send a message; the preset text is added to the request.
4. To fall back to the account style, pick Default (Web) or Normal (Mobile).
5. To reset the account style, press 'Reset response style' on Web (applies at once with toast 'Response style is back to the defaults.') or on Mobile and Save.

**What the person sees and gets**

- Web chip shows the active style name; chip is painted active only when not on Default (StyleSelector.test.tsx:29-62).
- Toast 'Response style is back to the defaults.' on Web reset (PersonalizationSection.tsx:371).
- CLI: 'Output style: <name> (applies on next turn)' or '... for this session only; your saved default is unchanged.' (claude_parity.rs:1352-1362).

**Settings**

- Namespace 'personalization' key style (account default).
- localStorage 'agi-response-style' holds per-conversation selections (style-store.ts:252-258).
- CLI config.toml [ui] output_style (output_styles.rs:5-6; apps/cli/src/config.rs:136).
- Per-project switch 'Use your response style' (F040-05).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web: five presets, selection stored per conversation, selecting a preset clears any custom style (style-store.ts:178), sent as a system message with an override preamble (style-store.ts:319-381; ChatComposerNew.tsx:3923,4553; useChatStream.ts:4533-4535).
- Web: Learning sends 'Teach step by step... end each step with a short question' text (response-style-preferences.ts:51-52) and a test checks it (StyleSelector.test.tsx:179-189).
- Web: account default style becomes a line in the <response_style> block on the server (response-style-preferences.ts:198-200; user-identity.ts:285).
- Web: Reset response style sets the account fields to defaults and clears per-conversation choices (PersonalizationSection.tsx:367-372; style-store.ts:225-227). Custom styles are not removed by the reset.
- Mobile: per-chat style sent as a system prompt with the guidance text (chatExecutionStore.ts:1187-1195,1276-1285,2778-2784); account default in Personalization.
- CLI: six built-in styles plus user .md styles in the config directory; the chosen style is appended to the system message (output_styles.rs:96-151; agent/mod.rs:1828-1846); /output-style shows the 'In effect' overview (claude_parity.rs:1378-1405).
- CLI /personalize accepts style values default, concise, explanatory, learning, formal (personalization.rs:50-55; test response_style_accepts_learning).
- VS Code: Style item writes the account style (personalization.ts:144-157).

**Incomplete**

- CLI built-in 'learning' is a coding-oriented style ('completes changes and adds one optional learning exercise') and 'study' is the teaching style; the account style value 'learning' set through /personalize is the shared one-line guidance (output_styles.rs:55-62,83-91).
- No per-chat style in VS Code or Chrome (no code found).
- CLI has no 'formal' output style (output_styles.rs:96-105) although the account style list has it.

**Present but disconnected or switched off**

- AgentSession.apply_output_style carries #[allow(dead_code)] but is called from the CLI command handler (agent/mod.rs:1827-1828; claude_parity.rs:1352).

**Not available**

- Per-chat style in VS Code and Chrome.
- A Learning-specific quiz or check-in beyond the prompt wording: the preset is instruction text only.

## 4. Required behaviour

**Established requirements**

- The user can choose the response style they want and replies follow that one choice. (source: brief S40.05)
- Named tone presets exist and one chosen preset governs replies. (source: brief S40.08)
- One action returns style preferences to defaults. (source: brief S40.23)
- An explanatory style explains reasoning and context. (source: brief S40.24)
- A learning style teaches, quizzes, step by step, and replies actually follow it. (source: brief S40.25)
- A concise style gives short, direct replies. (source: brief S40.26)

**Acceptance criteria**

1. Choosing Learning in the Web composer adds the step-by-step text to the next request for that conversation only.
2. Choosing Default returns to the account style.
3. A new conversation starts on Default (per-conversation key).
4. Reset response style on Web sets all style fields to Default, Not set and 'Match my message'.
5. Mobile reset has no effect until Save is pressed.
6. CLI /output-style concise --session leaves the saved default unchanged.
7. An unknown CLI style name is refused and the old style stays.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- A per-chat choice should win over the saved account style; the override preamble states it (style-store.ts:319-320).
- Both Web and Mobile should offer the same five presets [inferred from the shared RESPONSE_STYLES list].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add 'formal' to the CLI built-ins or document that account style covers it.
- [proposed] Add a per-chat style item to VS Code and Chrome.
- [proposed] Make Reset response style also clear custom-style selection and tell the person what it does not remove.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | StyleSelector (web) | `apps/web/features/chat/components/Composer/StyleSelector.tsx` | Composer menu of presets, length and custom styles. |
| store | useStyleStore | `apps/web/features/chat/stores/style-store.ts` | Per-conversation style and length, custom styles, reset, instruction text. |
| component | ChatComposerNew | `apps/web/features/chat/components/Composer/ChatComposerNew.tsx` | Builds styleInstruction for each send. |
| hook | useChatStream | `apps/web/lib/hooks/useChatStream.ts` | Adds the style instruction as a system message for cloud and local turns. |
| config | response-style-preferences | `packages/contracts/types/src/response-style-preferences.ts` | Shared preset list, guidance text, normalizer and prompt lines. |
| service | formatResponseStyleLines | `apps/web/lib/server/user-identity.ts` | Turns the account style into the <response_style> block. |
| component | PersonalizationSection (style part) | `apps/web/features/settings/sections/PersonalizationSection.tsx` | Account default select and Reset button. |
| component | StyleSelector (mobile) | `apps/mobile/src/features/chat/components/StyleSelector.tsx` | Mobile per-chat style sheet. |
| store | chatViewStore | `apps/mobile/stores/chat/chatViewStore.ts` | Stores chatStyle and chatStyleByConversation. |
| service | CHAT_STYLE_PROMPTS | `apps/mobile/stores/chat/chatExecutionStore.ts` | Turns the chosen style into a system prompt. |
| config | PERSONALIZATION_STYLES | `apps/mobile/src/features/settings/personalization/constants.ts` | Mobile account preset list. |
| screen | Personalization (mobile) | `apps/mobile/src/features/settings/personalization/index.tsx` | Account default chips and Reset response style. |
| service | output_styles | `apps/cli/src/output_styles.rs` | CLI built-in and user-file styles, create and delete. |
| command | /output-style | `apps/cli/src/claude_parity.rs` | List, switch, create and delete styles; 'In effect' overview. |
| service | AgentSession.apply_output_style | `apps/cli/src/agent/mod.rs` | Appends the style prompt to the system message. |
| command | /personalize | `apps/cli/src/cloud/personalization.rs` | Sets the account style value. |
| command | agi-workforce.personalize | `apps/extension-vscode/src/features/personalization/personalization.ts` | VS Code Style item. |
| schema | 0310 project account personalization | `apps/web/db/neon/0310_project_account_personalization.sql` | uses_account_style column that lets a project ignore the account style. |
| test | StyleSelector.test.tsx | `apps/web/features/chat/components/Composer/StyleSelector.test.tsx` | Web composer menu tests including Learning. |
| test | StyleSelector.test.tsx (mobile) | `apps/mobile/__tests__/StyleSelector.test.tsx` | Mobile sheet tests. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person picks a preset; the store saves it under the conversation key in localStorage. | device | style-store.ts:135-157,178,252-258 |
| On send, getStyleInstruction composes the preamble and style text; useChatStream puts it first in the message list as a system message. | device | ChatComposerNew.tsx:3923; useChatStream.ts:4533-4535 |
| The server adds the account style lines in the <response_style> block unless the project turned account style off. | our servers | user-identity.ts:267-286 |
| Model provider answers following both texts. | outside service | [inferred] SYS-chat-turn-pipeline |
| Local-model turn on Web or Electron: the same style text is placed in system blocks for the on-device model. | device | useChatStream.ts:4473-4490 |
| CLI: style prompt is appended to the system message on the device; no server involved. | device | agent/mod.rs:1828-1846 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Per-conversation style and length selections | Browser localStorage key agi-response-style (Web) or chatViewStore (Mobile) | No: only custom styles sync (style-store.ts:255-258,300-317) | Default selections are dropped from storage (withSelection, style-store.ts:69-78) |
| Account default style | user_settings namespace 'personalization' | Yes | Reset writes defaults |
| CLI user styles | <config dir>/output-styles/<name>.md and config.toml | No | delete removes the file with remove_file, no Trash (output_styles.rs:241-260) |

**Models and providers.** Preset text is plain instruction and is the same for any model or provider [inferred]. No model identifiers are used in the preset code.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Per-chat choice needs none on Web or Mobile; account default and reset need sign-in. CLI output styles need none. |
| Permissions | none found in the code. |
| Subscription | none found in the code for style presets. |
| Limits and metering | none found in the code for presets; guidance text adds a few prompt tokens [inferred]. |
| Feature flags | Per-project uses_account_style; per-request personalization:false (temporary chat). |
| Model compatibility | Not model specific [inferred]. |
| Provider restrictions | none found in the code. |
| Local mode | Web and Mobile per-chat style and Mobile account style work on the device. Web account style for a local model comes from our server through /api/memory/local-context [inferred from turn-context-service.ts:424-436; the style lines are inside the preamble]. CLI output styles work fully offline; CLI account style (/personalize) is refused outside Managed mode. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Retired preset names | Old values 'detailed', 'technical', 'creative' are mapped to current ones when read. | style-store.ts:28-39 |
| Unknown stored style | Falls back to Default. | response-style-preferences.ts:129-133 |
| Reset on Mobile before Save | Nothing is applied; Save is enabled by the reset; leaving asks to discard. | index.tsx:394-401,403-410; Personalization.test.tsx:273 |
| Deleted custom style in use | Conversations using it return to Default. | style-store.ts:208-222 |
| CLI deleted active style | Session returns to default style. | claude_parity.rs:1322-1326 |
| Unknown CLI style or option | Refused with the old style kept. | claude_parity.rs:1338-1364 |
| Offline | Per-chat style works offline; saving the account default fails with the Web error state. | PersonalizationSection.tsx:313-318 |
| Accessibility | Web group labelled 'Response style'; Mobile options have labels like 'Concise style'. | StyleSelector.tsx:195; index.tsx:597 |
| Timeout, cancel, retry | not handled in the code for the style menu itself. | StyleSelector.tsx (no such path found) |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/chat/components/Composer/StyleSelector.test.tsx`: Chip colours, custom style edit form, Learning preset is listed and sends check-in text.
- `apps/web/features/chat/stores/style-store.writing-sample.test.ts`: Instruction composition and sample fencing.
- `apps/web/features/chat/stores/style-store.account-sync.test.ts`: Custom style sync to the account.
- `apps/web/lib/preferences/__tests__/response-style-preferences.test.ts`: Normalising and prompt lines for style fields.
- `apps/mobile/__tests__/StyleSelector.test.tsx`: Mobile sheet: options, Learning and Formal selection.
- `apps/mobile/__tests__/personalization-block.test.ts`: Preset text in the Mobile block, including learning.
- `apps/cli/src/output_styles.rs`: Inline tests: built-ins, resolve, delete, names with spaces.
- `apps/cli/src/cloud/personalization.rs`: Inline test that style 'learning' is accepted.

**Test scenarios**

- **Per-chat Learning**
  1. Open a new Web chat.
  2. Pick Learning in the style menu.
  3. Ask to explain a topic.
  - Expected: Reply teaches in steps and ends a step with a check question; another chat is still on Default.
- **Web reset**
  1. Set Response style Formal and Response length Longer in Personalization.
  2. Press 'Reset response style'.
  - Expected: Selects show Default, Default, Not set, Match my message; toast appears; stays after reload.
- **Mobile reset needs Save**
  1. Set style Concise, Save.
  2. Open Personalization, press Reset response style, press back.
  - Expected: A discard prompt appears; stored style is still Concise until Save.
- **CLI session style**
  1. Run /output-style concise --session.
  2. Run /output-style.
  - Expected: Overview marks concise active; saved default unchanged.
- **Project opts out**
  1. In a Web project turn off 'Use your response style'.
  2. Set account style Formal.
  3. Chat in the project.
  - Expected: No <response_style> block from the account is sent.

**Where to look when it fails**

- Chat setup personalization field (request-processor.ts:2355-2361).
- localStorage key agi-response-style.
- CLI: /output-style overview shows origin of the active style.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/040-instructions-preferences-and-personal-style.md](../../70-qa/test-plans/web/040-instructions-preferences-and-personal-style.md)
- Desktop: [70-qa/test-plans/desktop/040-instructions-preferences-and-personal-style.md](../../70-qa/test-plans/desktop/040-instructions-preferences-and-personal-style.md)
- Mobile: [70-qa/test-plans/mobile/040-instructions-preferences-and-personal-style.md](../../70-qa/test-plans/mobile/040-instructions-preferences-and-personal-style.md)
- CLI: [70-qa/test-plans/cli/040-instructions-preferences-and-personal-style.md](../../70-qa/test-plans/cli/040-instructions-preferences-and-personal-style.md)
- VS Code: [70-qa/test-plans/vscode/040-instructions-preferences-and-personal-style.md](../../70-qa/test-plans/vscode/040-instructions-preferences-and-personal-style.md)

## 10. Gaps and dependencies

- **Brief says Mobile lacks the Learning preset; code has it.** Affects: Testers using the brief. Evidence: apps/mobile/src/features/chat/components/StyleSelector.tsx:21. Work needed: Correct the brief S40.25 status.
- **Brief says VS Code and Chrome have the Explanatory and Concise styles and the Style reset; only VS Code's account Style item was found, with no reset.** Affects: VS Code, Chrome. Evidence: personalization.ts:144-157; no reset item. Work needed: Add a reset item or correct the brief.
- **No formal style among CLI output styles.** Affects: CLI users. Evidence: output_styles.rs:96-105. Work needed: Decide parity with the shared five presets.
- **CLI style delete is permanent without Trash.** Affects: CLI users with own style files. Evidence: output_styles.rs:259; AGENTS.md section 9 says removed files go to Trash first [proposed to check]. Work needed: Confirm the rule applies to user-created files and route through Trash if so.
- **Reset on Web does not remove custom styles and does not tell the person.** Affects: Web users. Evidence: style-store.ts:225-227. Work needed: State what is kept.
- Not built on: Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:vscode
- mode:cloud
- mode:local
- api:PUT /api/settings/preferences
- table:user_settings
- table:user_projects
- store:agi-response-style
- SYS-chat-turn-pipeline
- SYS-shared-ui-and-design
- F040-01
- F040-03
- F040-05
- file:packages/contracts/types/src/response-style-preferences.ts

## Unknown

- Whether Desktop Electron has any style code other than the hosted web app: not found.
- Whether the Chrome extension chat reads any style: no code found.
- How the CLI managed turn orders the output style and server account style when both are set.
- Whether the CLI built-in 'learning' output style satisfies S40.25 for non-coding use.

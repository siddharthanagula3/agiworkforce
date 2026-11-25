---
id: "F110-07"
type: "feature"
title: "Skills and routines from a finished task"
aliases: ["Save as skill", "Save plugin", "Plugin draft card", "draft_plugin tool", "/save-skill", "/create-skill", "/save-routine", "/schedule", "/routines", "Run this on a schedule", "Completed task to reusable Skill (S110.14)", "Completed task to scheduled routine (S110.15)", "Custom assistant to Plugin migration (S110.16)", "cron_create"]
area: "110 Cross-product experiences to include in the product map"
available_on: ["web", "desktop", "cli"]
implementation: {web: "partial", desktop: "partial", mobile: "missing", cli: "partial", vscode: "missing", chrome: "missing"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "n/a", cli: "not seen by a person", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S110.14", "S110.15", "S110.16"]
depends_on: ["surface:web", "surface:desktop", "surface:cli", "mode:cloud", "mode:own-key", "mode:local", "SYS-connectors-plugins-and-skills", "SYS-chat-turn-pipeline", "SYS-subscriptions-entitlements-and-usage", "SYS-agents-tools-and-automation", "table:user_skills", "table:scheduled_tasks", "api:POST /api/skills", "api:POST /api/plugins/authored", "api:POST /api/schedules", "file:apps/web/lib/server/tools/plugin-draft-tool.ts"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F110-07 Skills and routines from a finished task

After finishing work in chat, a person can turn it into a reusable skill (web, desktop, CLI) or a scheduled routine (web menu, CLI). On web and desktop the model writes a draft card with Save buttons; nothing is stored until the person saves. Turning a custom assistant into a plugin does not exist in any app.

Area: [110. Cross-product experiences to include in the product map](README.md). Requirement items: [S110.14](../../10-requirements/capabilities/110-cross-product-experiences-to-include-in-the-product-map.md#s11014), [S110.15](../../10-requirements/capabilities/110-cross-product-experiences-to-include-in-the-product-map.md#s11015), [S110.16](../../10-requirements/capabilities/110-cross-product-experiences-to-include-in-the-product-map.md#s11016).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built | partly built | not seen by a person |
| Desktop | partly built | partly built | not seen by a person |
| Mobile | not built | not built | n/a |
| CLI | partly built | partly built | not seen by a person |
| VS Code | not built | not built | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Lets a person capture a task they just finished as something reusable. On web and desktop the model proposes a plugin or skill in a draft card, and the person saves it into their Skills. On web the message menu can also open the Schedules form with the earlier prompt filled in. On the CLI, slash commands tell the agent to write a SKILL.md file or to create a hosted schedule.

**Why it exists.** Claude and ChatGPT let people keep a good workflow instead of retyping it. The brief lists the Should lines as: after a task the user saves it as a Skill that appears in Skills; after a task the user turns it into a scheduled routine; the user converts a custom assistant into a plugin (doc: knowledge-base/data/area-briefs/110-cross-product-experiences-to-include-in-the-product-map.md, S110.14, S110.15, S110.16).

**Who uses it.** Web and desktop chat users on an account that may author skills; CLI users; people with a plan that allows scheduled tasks (routines).

**Problems it solves**

- Retyping the same instructions for repeat work
- Keeping a working method in a form the model loads later
- Running the same task on a clock without opening the app

**Use cases**

- After a research chat, press Save as skill in the message menu, review the draft card, press Save as a skill.
- Ask in chat to turn the work into a plugin with two skills, then press Save plugin.
- On the web, choose Run this on a schedule on an answer and finish the Schedules form.
- In the CLI after a fix, type /save-routine every weekday at 9 and approve the cron_create call.

## 2. User experience

**Where to find it**

- Web and desktop (the desktop window shows the hosted web app, AGENTS.md section 5): the three-dots menu on an assistant message has 'Save as skill' and 'Run this on a schedule' (apps/web/features/chat/components/messages/MessageBubble.tsx:4050-4060). The draft card appears under the assistant reply (MessageBubble.tsx:2956).
- Web and desktop: saved skills open at Settings > Skills; a saved plugin opens at Settings > Plugins through the Open link on the card (PluginDraftCard.tsx:64-68).
- CLI: slash commands /save-skill, /create-skill, /save-routine, /schedule (alias /routines) (apps/cli/src/claude_parity.rs:319-322; crates/agiworkforce-command-registry/src/lib.rs:512-531).
- Mobile, VS Code, Chrome: not found. No draft tool, menu item or slash command was found in apps/mobile/src, apps/extension-vscode/src or apps/extension/src (search returned nothing).

**Before you start**

- Web and desktop: signed in; a model that can call tools; not a temporary chat; streaming on; skill authoring not switched off with AGI_USER_SKILL_AUTHORING=0; the workspace allows the plugins and skills features (request-processor.ts:1219-1235, 5588-5597; user-skill-authoring.ts:5-12).
- Web schedule menu item: plan whose scheduled-task allowance is not 0 (ChatMessageList.tsx:1450-1451; billing-catalog.ts:593, 610, 627 are 0 for local-only, byok and free).
- CLI routine: the session must be in Managed (Cloud) mode and signed in, because cron_create goes through SchedulesClient::connect (apps/cli/src/schedules.rs:230-235; apps/cli/src/cloud/client.rs:368-372).

**Screens and controls**

- Draft card: label 'Plugin draft', skill list, buttons 'Save plugin' and (only when the draft has exactly one skill) 'Save as a skill', note 'Not saved yet. Nothing changes until you save it.' (PluginDraftCard.tsx:28-36, 126-155).
- After save the card shows 'Saved as a plugin. Its skills are on in your chats.' or 'Saved as a skill. It is on in your chats.' plus an Open link (PluginDraftCard.tsx:34-35, 114-124).
- Message menu items 'Save as skill' and 'Run this on a schedule' (MessageBubble.tsx:4050-4060).

**Journey**

1. Web/desktop skill: finish a task in chat.
2. Open the message menu and choose 'Save as skill'. This sends the fixed prompt 'Turn the work we just finished in this chat into a reusable skill I can use again.' (save-as-skill.ts:14-15; ChatMessageList.tsx:1440-1446). Or just ask for a plugin or skill in words that match the build/create/make/write/draft/design/turn/update/change/edit plus plugin/skill pattern (plugin-draft-tool.ts:21-22).
3. The server offers the draft_plugin tool for that turn only (request-processor.ts:1237-1252). The model calls it with a name, description and skills.
4. The server checks the arguments and each skill (executePluginDraftTool) and returns the draft to the client (plugin-draft-tool.ts:107-143).
5. The card shows. The person presses Save plugin (POST /api/plugins/authored) or Save as a skill (POST /api/skills) (PluginDraftCard.tsx:47-54).
6. The card shows the saved line and Open link.
7. Web routine: choose 'Run this on a schedule'. The browser goes to /chat/schedules?fromPrompt=<the prompt before that reply> (WebChatPage.tsx:2347-2349; schedule-from-turn.ts:7, 21) and the Schedules page reads the prompt (SchedulesPageWithProjects.tsx:37).
8. CLI skill: type /save-skill [name]; the command sends a prompt asking the agent to write .agiworkforce/skills/<name>/SKILL.md and show it (claude_parity.rs:891-899).
9. CLI routine: type /save-routine [schedule]; the prompt asks the agent to write a standalone prompt and call cron_create (claude_parity.rs:901-908), which asks for approval when confirmation is on and then creates the schedule through /api/schedules (task_registry/mod.rs:22-62).

**What the person sees and gets**

- Save failure shows 'This draft could not be saved. Try again.' or the server message (PluginDraftCard.tsx:33, 60, 85).
- Invalid draft: the tool result tells the model what to fix, for example 'The draft cannot be saved yet: ...' (plugin-draft-tool.ts:129-136).
- CLI: the created schedule id is printed by print_tool_status (task_registry/mod.rs:49); a non-Managed session gets the NotManaged message (schedules.rs:41-44).
- Tool name for the draft is draft_plugin (packages/contracts/cloud-contracts/src/plugin-marketplaces.ts:340).

**Settings**

- Environment switch AGI_USER_SKILL_AUTHORING (set to 0 to turn authoring off; read in user-skill-authoring.ts:5-12; checked in app/api/skills/route.ts:212).
- Plan limit: maxScheduledTasks per plan in packages/contracts/types/src/billing-catalog.ts (0 for local-only, byok, free at lines 593, 610, 627; 3 for basic at 644; 5 for pro at 663; 15 for the max plan default at 572; 25 for max_15x at 683; 10 for team at 701; custom for enterprise at 723).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web and desktop: the draft_plugin tool is offered per turn when the message matches the intent pattern and every gate passes (apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1219-1252, 5588-5597).
- Web and desktop: the card saves a plugin to /api/plugins/authored or a one-skill draft to /api/skills (apps/web/features/chat/components/PluginDraftCard.tsx:47-69).
- Web and desktop: the card is limited to surfaces web and desktop (apps/web/lib/server/tools/plugin-draft-tool.ts:43-46).
- Web and desktop: the 'Save as skill' menu item is shown only when the account may author skills and the chat is not temporary (ChatMessageList.tsx:1436-1446; MessageBubble.tsx:4056-4060).
- Web and desktop: 'Run this on a schedule' opens the Schedules page with the earlier prompt in the URL (WebChatPage.tsx:2347-2349). A create_schedule tool also exists for chat requests that sound like schedules (apps/web/lib/server/tools/schedule-tool.ts:16-29; request-processor.ts:5580-5584).
- CLI: /save-skill, /create-skill and /save-routine send prompts; /schedule and /routines are refused with a message outside Managed mode (apps/cli/src/claude_parity.rs:319-327).
- CLI: cron_create, cron_list and cron_delete exist and use the hosted /api/schedules records (apps/cli/src/features/exec/tools/task_registry/mod.rs:22; apps/cli/src/schedules.rs:16).

**Incomplete**

- The web 'Run this on a schedule' item opens a form with the prompt filled in; it does not create the routine by itself [inferred from the fromPrompt link and the draftPrompt read at SchedulesPageWithProjects.tsx:37]. I did not open the form code to confirm every field.
- The card's 'Save as a skill' appears only for a draft with exactly one skill (PluginDraftCard.tsx:140).
- The brief marks web S110.15 as missing and desktop S110.15 as missing; the code shows a web menu path, so the brief is out of date for web and desktop (doc: knowledge-base/data/area-briefs/110-cross-product-experiences-to-include-in-the-product-map.md, S110.15 versus MessageBubble.tsx:4050-4054).

**Present but disconnected or switched off**

- Skill authoring is off when AGI_USER_SKILL_AUTHORING is 0 (user-skill-authoring.ts:5-12).
- The schedule menu item is hidden on plans whose scheduled-task allowance is 0 (ChatMessageList.tsx:1450-1451).
- CLI routines are refused in Local and BYOK sessions (schedules.rs:230-234).

**Not available**

- S110.16 Custom assistant to Plugin: no code found on any app. A repo search of apps/web/features, apps/web/lib, apps/web/app, apps/mobile/src and packages/contracts for 'custom assistant' style conversion returned only an unrelated memory-import test.
- Mobile, VS Code and Chrome have no save-as-skill or save-as-routine entry (search of apps/mobile/src, apps/extension-vscode/src, apps/extension/src found none).
- Mobile has a Schedules screen (apps/mobile/app/(app)/schedules/create.tsx) but no 'from a finished chat' entry was found.

## 4. Required behaviour

**Established requirements**

- After a task completes, the user saves it as a reusable Skill that appears in their Skills and can be invoked later. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S110.14)
- After a task completes, the user turns it into a scheduled routine that later runs the same work on its schedule. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S110.15)
- The user converts an existing custom assistant into a plugin with instructions, knowledge and tools carried over, and installs or shares it. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S110.16)
- Nothing is saved until the user presses a save button. (source: apps/web/features/chat/components/PluginDraftCard.tsx:36, 79-89)
- The draft card is offered only on web and desktop. (source: apps/web/lib/server/tools/plugin-draft-tool.ts:43-46)

**Acceptance criteria**

1. On web, with skill authoring on, an answer's menu shows 'Save as skill'; choosing it makes a draft card with a 'Save plugin' button and, for one skill, a 'Save as a skill' button.
2. Pressing 'Save as a skill' creates the skill, shows 'Saved as a skill. It is on in your chats.', and the skill is listed in Settings > Skills.
3. Before any button is pressed, no skill or plugin exists for that draft.
4. With AGI_USER_SKILL_AUTHORING=0 the menu item and the card are not offered and POST /api/skills is refused with 'Skill authoring is not available.'.
5. In a temporary chat the 'Save as skill' menu item is absent.
6. On a free account the 'Run this on a schedule' menu item is absent; on a plan with a nonzero allowance it opens /chat/schedules with the prompt filled in.
7. In the CLI in Managed mode, /save-routine leads to a cron_create call that creates a schedule; in Local or BYOK mode the call is refused with the not-managed message.
8. A failed save shows 'This draft could not be saved. Try again.' and the draft stays unsaved.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- A routine made from a finished task should store a prompt that works without the chat; the CLI prompt says so explicitly (claude_parity.rs:901-908) [inferred as the requirement for web too].
- Plugin conversion should carry instructions, knowledge and tools, per the brief; no field model for an old custom assistant was found, so its source data is unknown.

**Proposed improvements** (suggestions, not requirements)

- [proposed] Show the saved skill's name in the card and link to it in Settings > Skills (the card already links by name for skills).
- [proposed] Let the draft card also save a routine, so web matches the CLI's one-step routine creation.
- [proposed] Add a draft-card equivalent on mobile, VS Code and Chrome, or record a decision that they stay out, as the VS Code and Chrome decisions record other omissions (doc: docs/decisions/2026-09-27-founder-decisions.md:362, 391).

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | plugin-draft-tool | `apps/web/lib/server/tools/plugin-draft-tool.ts` | Defines the draft_plugin tool, the intent pattern, the web/desktop surface list and argument validation. |
| service | applyPluginDraftToolCapability | `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts` | Adds the draft tool to a turn when every gate passes (lines 1219-1252, 5588-5597). |
| component | PluginDraftCard | `apps/web/features/chat/components/PluginDraftCard.tsx` | Draft card with Save plugin and Save as a skill buttons and the saved or failed states. |
| component | MessageBubble menu items | `apps/web/features/chat/components/messages/MessageBubble.tsx` | Hosts 'Save as skill', 'Run this on a schedule' and the TurnPluginDraftCard (lines 2956, 4050-4060). |
| hook | useSaveAsSkill / SaveAsSkillProvider | `apps/web/features/skills/components/save-as-skill.ts` | Provides the Save as skill action, the fixed prompt and the authoring capability check. |
| component | ChatMessageList wiring | `apps/web/features/chat/components/messages/ChatMessageList.tsx` | Decides whether Save as skill and schedule actions are available (lines 1436-1462). |
| hook | schedule-from-turn | `apps/web/features/schedules/components/schedule-from-turn.ts` | Builds the /chat/schedules?fromPrompt= link and finds the prompt before a reply. |
| screen | SchedulesPageWithProjects | `apps/web/features/schedules/components/SchedulesPageWithProjects.tsx` | Reads the fromPrompt draft prompt (line 37). |
| service | schedule-tool (create_schedule) | `apps/web/lib/server/tools/schedule-tool.ts` | Chat tool that creates a scheduled task from a request. |
| service | user-skill-authoring | `apps/web/lib/services/user-skill-authoring.ts` | AGI_USER_SKILL_AUTHORING switch. |
| endpoint | POST /api/skills | `apps/web/app/api/skills/route.ts` | Creates a user skill; checks CSRF, rate limit, the authoring switch and the skills workspace gate (lines 206-222). |
| endpoint | POST /api/plugins/authored | `apps/web/app/api/plugins/authored/route.ts` | Saves a drafted plugin; tested in apps/web/app/api/plugins/authored/__tests__/route.test.ts. |
| endpoint | GET /api/chat/conversations/[id]/plugin-drafts/[toolCallId] | `apps/web/app/api/chat/conversations/[id]/plugin-drafts/[toolCallId]/route.ts` | Reloads a stored draft for a card after a page reload. |
| table | user_skills | `apps/web/db/neon/0157_user_skills.sql` | Stores saved user skills. |
| table | scheduled_tasks | `apps/web/db/neon` | Stores schedules; created with 'create table if not exists public.scheduled_tasks' in a migration file in this folder (exact file not recorded). |
| schema | PluginDraft / PLUGIN_DRAFT_TOOL_NAME | `packages/contracts/cloud-contracts/src/plugin-marketplaces.ts` | Shared draft shape and tool name (line 340). |
| command | /save-skill, /create-skill, /save-routine, /schedule | `apps/cli/src/claude_parity.rs` | Slash commands and prompt builders (lines 319-327, 891-908, 1098-1115). |
| config | Slash command registry | `crates/agiworkforce-command-registry/src/lib.rs` | Registers save-skill, save-routine, schedule with alias routines (lines 512-531). |
| service | cron_create tool | `apps/cli/src/features/exec/tools/task_registry/mod.rs` | Creates a hosted schedule from the CLI agent with optional approval (line 22). |
| service | SchedulesClient | `apps/cli/src/schedules.rs` | Calls /api/schedules; refuses non-Managed sessions (lines 16, 230-245). |
| config | maxScheduledTasks per plan | `packages/contracts/types/src/billing-catalog.ts` | Plan allowance for scheduled tasks (lines 572-723; getPlanMaxScheduledTasks at 816). |
| test | plugin-draft-tool tests | `apps/web/lib/server/tools/plugin-draft-tool.test.ts` | Covers the draft tool. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person asks for a skill/plugin or picks 'Save as skill'; the browser sends a streaming chat request. | device and our servers | ChatMessageList.tsx:1444; request-processor.ts:1219-1235 |
| The server checks surface, tool-capable model, streaming, non-temporary chat, skill authoring switch and workspace gates, then adds draft_plugin to the model request. | our servers | request-processor.ts:1237-1252, 5588-5597 |
| The chosen model (platform route or the user's own key) writes the draft by calling the tool; the server validates it and returns it to the client. | outside service | plugin-draft-tool.ts:107-143 (validation on our servers); the model call itself goes to the model provider [inferred from the chat-completions route] |
| The card renders from the tool result; the person presses Save, the browser posts to /api/plugins/authored or /api/skills. | device and our servers | PluginDraftCard.tsx:47-54 |
| The server stores the skill (table user_skills) and the card shows the saved state. | our servers | apps/web/app/api/skills/route.ts:206-222; apps/web/db/neon/0157_user_skills.sql |
| Web routine: the browser navigates to the Schedules page with the prompt in the URL; the person finishes and saves the schedule. | device and our servers | WebChatPage.tsx:2347-2349; SchedulesPageWithProjects.tsx:37 |
| CLI: the prompt goes to the active model; the agent writes SKILL.md in the project folder, or calls cron_create, which posts to /api/schedules. | device and our servers | claude_parity.rs:891-908; task_registry/mod.rs:22-62 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Saved skill (name, description, instructions) | table user_skills on our servers | Yes, it is an account record read on every web or desktop chat | Kept until the user removes it in Settings; deletion rules not opened |
| Draft card content | Tool result stored with the conversation, read back by the plugin-drafts route | With the conversation | Follows the conversation; temporary chats keep nothing (ChatMessageList.tsx:1436-1438) |
| CLI skill file | File .agiworkforce/skills/<name>/SKILL.md in the project folder on the device | No | User-owned file |
| Schedule record | table scheduled_tasks on our servers | Yes, shared by web, mobile and CLI (schedules.rs:3 comment) | Until the user deletes it |

**Models and providers.** The draft is written by whichever model serves the turn; the server only requires a tool-capable model (request-processor.ts:1219-1235). No model name is fixed in the feature. Routines run later through the scheduled-agent executor on our servers (apps/web/lib/triggers/trigger-fire.ts:150 shows the executor used for triggered runs; the clock-run path was not opened).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Web and desktop: signed in. CLI routine: signed in and Managed mode (schedules.rs:230-235). CLI skill file: no account needed [inferred; the command only sends a prompt]. |
| Permissions | POST /api/skills requires CSRF and passes the workspace feature gate for 'skills'; the draft offer also needs the 'plugins' gate (skills/route.ts:206-222; request-processor.ts:5590-5596). CLI cron_create asks for approval when confirmation is on (task_registry/mod.rs:40-44). |
| Subscription | Scheduled routines are limited by plan allowance maxScheduledTasks (billing-catalog.ts:572-723). No plan rule for skill authoring itself was found in the files read. |
| Limits and metering | Scheduled task count per plan; skill body, name and description length limits come from @agiworkforce/skills constants (plugin-draft-tool.ts:9-13); max skills per plugin PLUGIN_DIRECTORY_MAX_SKILLS_PER_INSTALL (plugin-draft-tool.ts:17). Usage metering of the draft turn follows normal chat accounting [inferred]. |
| Feature flags | AGI_USER_SKILL_AUTHORING (off when 0). |
| Model compatibility | Requires a model that supports tools (toolsCapable) and streaming (request-processor.ts:1219-1235). A model without tools gets no draft card. |
| Provider restrictions | None found in the draft code; the tool is added regardless of provider once the model is tool-capable. |
| Local mode | Web and desktop draft card runs through the server chat route, so it is not part of on-device inference; whether the Electron app's Local mode reaches this route was not established (unknown). CLI Local mode: /save-skill works by writing a local file; /save-routine and /schedule are refused (claude_parity.rs:322-327; schedules.rs:230-234). Local mode needs no paid plan for the skill file. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Saving | Buttons disabled and a spinner labelled Saving shows. | PluginDraftCard.tsx:75-89, 131, 137 |
| Save error | Red alert text under the card; draft stays unsaved and can be retried. | PluginDraftCard.tsx:33, 85, 157-161 |
| Draft cannot be loaded after reload | Copy: 'This draft could not be loaded. Ask for it again to see it.' | PluginDraftCard.tsx:37-38 |
| Invalid tool arguments or skill problems | Tool returns an error telling the model what to fix and to call again. | plugin-draft-tool.ts:111-136 |
| Temporary chat | No Save as skill item and no draft tool. | ChatMessageList.tsx:1436-1438; request-processor.ts:1231 |
| Authoring switched off | Skills API answers not found 'Skill authoring is not available.' | user-skill-authoring.ts:8-17 |
| Plan with no scheduled tasks | Schedule menu item hidden. | ChatMessageList.tsx:1450-1451 |
| CLI not in Managed mode | /schedule, /routines refuse with the not-managed text; cron_create returns a failed tool result. | claude_parity.rs:322-327; schedules.rs:41-44, 230-234 |
| Offline, cancel, timeout | not handled in the code for the card beyond the generic save error; no separate offline state found. | PluginDraftCard.tsx:79-89 |
| Accessibility | Card is a group with an aria-label, saved status uses role status, errors use role alert, buttons grow to 44px on coarse pointers. | PluginDraftCard.tsx:72, 92-95, 115, 158 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/lib/server/tools/plugin-draft-tool.test.ts`: Draft tool definition and validation.
- `apps/web/features/chat/components/messages/MessageBubble.pluginDraft.test.tsx`: Draft card rendering in a message.
- `apps/web/features/skills/components/save-as-skill.test.ts`: Save as skill action and prompt.
- `apps/web/app/api/chat/conversations/[id]/plugin-drafts/[toolCallId]/route.test.ts`: Stored draft read route.
- `apps/web/app/api/plugins/authored/__tests__/route.test.ts`: Saving an authored plugin.
- `apps/web/features/schedules/components/schedule-from-turn.test.ts`: Prompt-before-reply and schedule link.
- `apps/cli/src/claude_parity.rs`: Unit test schedule_walks_through_routines_and_event_triggers near line 4074 checks the /schedule prompt mentions cron_create.

**Test scenarios**

- **Save a skill from a finished chat**
  1. Sign in on web with skill authoring on.
  2. Finish a short task.
  3. Menu > Save as skill.
  4. Press Save as a skill on the card.
  5. Open Settings > Skills.
  - Expected: The skill is listed and the card says it is on in your chats.
- **Nothing saved without a press**
  1. Request a draft.
  2. Leave the card unsaved.
  3. Check Settings > Skills.
  - Expected: No new skill exists and the card says 'Not saved yet.'
- **Authoring switched off**
  1. Run the server with AGI_USER_SKILL_AUTHORING=0.
  2. Open a finished answer's menu.
  - Expected: No Save as skill item; POST /api/skills answers 'Skill authoring is not available.'
- **Schedule from an answer on a free account and a paid account**
  1. Open the menu on a free account.
  2. Repeat on an account with a nonzero scheduled-task allowance and choose Run this on a schedule.
  - Expected: Free: no item. Paid: Schedules page opens with the earlier prompt filled in.
- **CLI routine in Managed and Local modes**
  1. In Managed mode run /save-routine daily at 8 and approve cron_create.
  2. Repeat in Local mode.
  - Expected: Managed: a schedule id is printed. Local: the tool result says the session is not managed.

**Where to look when it fails**

- Server log and tool result text beginning 'draft_plugin was called with invalid arguments' or 'The draft cannot be saved yet' (plugin-draft-tool.ts:113-135).
- HTTP 404 'Skill authoring is not available.' from /api/skills.
- Rows in tables user_skills and scheduled_tasks.
- CLI: ScheduleError::NotManaged text (schedules.rs:41-44).

**Hands-on test plans**

- Web: [70-qa/test-plans/web/110-cross-product-experiences-to-include-in-the-product-map.md](../../70-qa/test-plans/web/110-cross-product-experiences-to-include-in-the-product-map.md)
- Desktop: [70-qa/test-plans/desktop/110-cross-product-experiences-to-include-in-the-product-map.md](../../70-qa/test-plans/desktop/110-cross-product-experiences-to-include-in-the-product-map.md)
- CLI: [70-qa/test-plans/cli/110-cross-product-experiences-to-include-in-the-product-map.md](../../70-qa/test-plans/cli/110-cross-product-experiences-to-include-in-the-product-map.md)

## 10. Gaps and dependencies

- **Plugin conversion from a custom assistant does not exist.** Affects: All six apps. Evidence: No code found (searches listed above); brief S110.16 all missing. Work needed: Define what a custom assistant is in the data model, then build a converter and a save path to the plugin store.
- **No save-as-skill or routine entry on mobile, VS Code or Chrome.** Affects: Mobile, VS Code, Chrome. Evidence: No matches in apps/mobile/src, apps/extension-vscode/src, apps/extension/src. Work needed: Decide per app (some may stay out by decision) and add an entry that opens the shared skills save path.
- **Web and desktop routine path ends at a prefilled form, not a created routine; the brief says missing.** Affects: Web, desktop. Evidence: schedule-from-turn.ts:21; brief S110.15. Work needed: Update the brief to partial and decide whether one-step creation is required.
- **The CLI skill and routine commands are prompts only; success depends on the model following them.** Affects: CLI. Evidence: claude_parity.rs:891-908. Work needed: Add a test that drives the command end to end, or a deterministic writer.
- **Draft card Save as a skill is hidden for multi-skill drafts.** Affects: Web, desktop. Evidence: PluginDraftCard.tsx:140. Work needed: Confirm this is intended; a plugin save is the only path for several skills.
- Not built on: Mobile, VS Code, Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- surface:cli
- mode:cloud
- mode:own-key
- mode:local
- SYS-connectors-plugins-and-skills
- SYS-chat-turn-pipeline
- SYS-subscriptions-entitlements-and-usage
- SYS-agents-tools-and-automation
- table:user_skills
- table:scheduled_tasks
- api:POST /api/skills
- api:POST /api/plugins/authored
- api:POST /api/schedules
- file:apps/web/lib/server/tools/plugin-draft-tool.ts

## Unknown

- Whether Electron Local mode (on-device inference) can produce a draft card; the draft tool is added in the server chat-completions route and the Local path was not traced.
- Exact fields and behaviour of the Schedules form when opened with fromPrompt (form code not opened).
- Deletion and retention rules for user_skills rows.
- How saved skills are invoked later on each app (invocation path not opened).
- Whether the brief's 'desktop done' for S110.14 means only the hosted web app inside Electron; AGENTS.md section 5 implies it.
- Name of the migration file that creates scheduled_tasks.

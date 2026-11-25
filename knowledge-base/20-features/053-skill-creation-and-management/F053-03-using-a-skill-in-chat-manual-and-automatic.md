---
id: "F053-03"
type: "feature"
title: "Using a skill in chat (manual and automatic)"
aliases: ["Use a skill", "Manual invocation", "Automatic skill matching", "Skill picker", "Slash skill", "Items S53.08, S53.17, S53.18"]
area: "53 Skill creation and management"
available_on: ["web", "desktop", "mobile", "cli", "vscode", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "built", vscode: "partial", chrome: "partial"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S53.08", "S53.17", "S53.18"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:chrome", "surface:cli", "surface:vscode", "mode:cloud", "mode:local", "api:POST /api/llm/v1/chat/completions", "table:user_skills", "F053-01", "F053-02", "F053-04", "SYS-chat-turn-pipeline", "SYS-agents-tools-and-automation", "SYS-model-catalog-and-routing", "SYS-connectors-plugins-and-skills", "SYS-execution-boundaries"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F053-03 Using a skill in chat (manual and automatic)

Lets a person pick one skill for a message (slash menu, plus menu, mention, mobile Use in chat, Chrome Skills menu, CLI slash command) or lets the assistant load a matching skill itself. The server checks the name, the model's tool support and the skill's needs, then the model loads the skill text through a skill tool.

Area: [53. Skill creation and management](README.md). Requirement items: [S53.08](../../10-requirements/capabilities/053-skill-creation-and-management.md#s5308), [S53.17](../../10-requirements/capabilities/053-skill-creation-and-management.md#s5317), [S53.18](../../10-requirements/capabilities/053-skill-creation-and-management.md#s5318).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | built | built | not seen by a person |
| CLI | built | built | not seen by a person |
| VS Code | partly built | partly built | not seen by a person |
| Chrome | partly built | partly built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Gets a skill's instructions into one chat turn, either because the person chose it or because its description matches the request. Skill text is loaded on demand, not pasted into every prompt.

**Why it exists.** Skills only help when they are used at the right moment without crowding the prompt. Manual pick gives control; automatic matching saves effort.

**Who uses it.** Chat users on web, desktop (hosted web), mobile, Chrome and API callers; developers on the CLI and in VS Code.

**Problems it solves**

- Repeating the same instructions every chat
- Not knowing a useful skill exists
- Prompt size growth from listing every skill in full

**Use cases**

- A person types '/' on web and picks a release-notes skill for one message.
- A person writes 'summarise this contract' and the assistant is offered a matching skill.
- A mobile user taps 'Use in chat' on an installed skill.
- A developer types /my-skill in the CLI and the skill text is loaded for the turn.

## 2. User experience

**Where to find it**

- Web and Desktop composer: slash menu groups 'Skills' and 'Your skills' (apps/web/features/chat/components/Composer/SlashCommandMenu.tsx:90-92, 218-263); plus menu row 'Skills' with a list of the person's own skills and 'Manage skills' (apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx:1248-1377); a mentions list titled 'Skills' (apps/web/features/chat/components/Composer/ChatComposerNew.tsx:5565-5577); detail view button 'Try in chat' (packages/ui/ui/src/directory/SkillDetailView.tsx:241-248).
- Mobile: 'Use in chat' on an installed skill row (apps/mobile/src/features/skills/SkillsScreen.tsx:381-390); an '@' mention palette in the chat input (apps/mobile/src/features/chat/components/ChatInput.tsx:1771).
- Chrome: attach menu row 'Skills' then pick a skill (apps/extension/src/side_panel.ts:15112-15190).
- CLI: type /<skill-name> (apps/cli/src/command_registry.rs:171-181).
- VS Code: skills reach the app-server slash expansion (apps/cli/src/app_server/surfaces.rs:1551-1569); the VS Code chat picker UI was not found (see unknowns).

**Before you start**

- A tool-capable model: the server refuses a skill pick otherwise (apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:5405-5420).
- Mobile: Cloud mode and signed in, and the skill must be installed (apps/mobile/src/features/skills/SkillsScreen.tsx:665-668; apps/mobile/app/(app)/(tabs)/chat.tsx:541).
- The skill must be switched on and not a draft.

**Screens and controls**

- Web chip showing '/<name>' with a remove button labelled 'Remove <name> skill' (apps/web/features/chat/components/Composer/ChatComposerNew.tsx:5155-5163).
- Slash menu rows show the description plus a note 'Needs <tools>' (apps/web/features/chat/components/Composer/SlashCommandMenu.tsx:95-97, 218-228).
- Mobile mention palette with up to 4 included skills, each button 'Use the <title or name> skill' (apps/mobile/src/features/skills/SkillMentionPalette.tsx; apps/mobile/src/features/skills/skillRequirements.ts:42-56).
- Chrome chip with hint 'Skill for this message' and a remove button (apps/extension/_locales/en/messages.json, spSkillChipHint).

**Journey**

1. Pick a skill; a chip with its name appears.
2. Type the message and send.
3. The pick travels as skill_name with the chat request (apps/web/lib/hooks/useChatStream.ts:4643).
4. The server checks the name, the model and the needs; on success the model calls the skill tool with action 'load'.
5. The reply uses the skill; the pick clears after the send (apps/web/features/chat/components/Composer/ChatComposerNew.tsx:2157).
6. With no pick, the server may offer matching skills; the model decides whether to load one.

**What the person sees and gets**

- Refusals show as errors: 'The selected skill is not available.' (422 skill_not_found), 'The selected model cannot load skills. Choose a tool-capable model.' (422 skill_model_unsupported), 'The <name> skill needs these turned on first: ...' (422 skill_requirements_unmet) (apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1055-1057, 5412-5415; apps/web/lib/services/skill-catalog-service.ts:128-146).
- A tool activity line for the skill load appears in the chat (apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:1062, 1207).
- Web mentions list text: 'Loading skills…', 'Skills are temporarily unavailable.', 'No matching skills.' (apps/web/features/chat/components/Composer/ChatComposerNew.tsx:5570-5576).

**Settings**

- Web composer turns on the Office file toggle automatically when the picked skill needs it (apps/web/features/chat/components/Composer/ChatComposerNew.tsx:363-365, 3016-3031).
- Mobile turns on code execution for the turn when the skill needs it and the plan allows it (apps/mobile/src/features/skills/skillRequirements.ts:23-40).
- Skills can be restricted for an agent by its configuration (agentAllowsSkill, apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:5377).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web: three pickers feed one selectedSkillName that is sent as skill_name (apps/web/features/chat/components/Composer/ChatComposerNew.tsx:1126-1128, 1666, 3678).
- Server validation and forced skill load for a pick (apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:824-840, 1047-1071, 5383-5440).
- Requirement check before the model runs (apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:5497-5516).
- Skill tool with actions list, load and read; files fetched on demand; scripts copied to the code sandbox when code execution is offered (packages/tools/skills/src/tool.ts:74-110; apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:2409-2480; apps/web/lib/e2b/skill-staging.ts:80-95).
- Automatic offer: personal skills first, then plugin skills within an 8,000 character budget, then the best relevance matches (minimum score 0.15, at most 3, at least 2 shared words) (apps/web/app/api/llm/v1/chat/completions/lib/skill-offer.ts:10-40; packages/tools/skills/src/relevance.ts:3-13).
- Mobile manual pick and send (apps/mobile/app/(app)/(tabs)/chat.tsx:363, 541, 796; apps/mobile/stores/chat/chatExecutionStore.ts:3452).
- Chrome manual pick reaches the server as skill_name (apps/extension/src/features/cloud-bridge/freeTrialClient.ts:1602; apps/extension/src/features/cloud-bridge/managedChatHandler.ts:303).
- CLI: slash expansion loads the skill text with the user's request (apps/cli/src/command_registry.rs:171-181; apps/cli/src/skills.rs:1469-1494); the skill tool lists or loads (apps/cli/src/features/exec/tools/mod.rs:446-503); the full catalogue of names and descriptions is in the system prompt (apps/cli/src/skills.rs:1252-1277; apps/cli/src/agent/prompt.rs:404).

**Incomplete**

- Web toggle map holds only the Office tool, so a skill that needs code execution does not turn it on in the web composer; mobile does turn it on. The branch for code execution in enableSkillRequirements can never run (apps/web/features/chat/components/Composer/ChatComposerNew.tsx:363-365, 3016-3031).
- The web requirement note shows only tools; connectors needed are not in the slash note (apps/web/features/chat/components/Composer/SlashCommandMenu.tsx:95-97).
- Plus menu lists only non-built-in skills (apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx:1248-1251); built-in skills are reached through the slash and mention lists.

**Present but disconnected or switched off**

- CLI relevance scoring (score_skill, match_skills_scored, extract_skill_mentions for $name or @name) has no caller outside skills.rs; the file is marked allow(dead_code) (apps/cli/src/skills.rs:20, 1074-1200). CLI 'automatic' means the catalogue is in the prompt and the model chooses.
- Implicit offer is skipped for surfaces vscode, cli and api (apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1073, 1088).

**Not available**

- Mobile Local mode: no skill pick (apps/mobile/app/(app)/(tabs)/chat.tsx:541; test apps/mobile/src/features/chat/components/__tests__/ChatInput.skillMention.test.tsx:251).
- CLI skill tool has no 'read' action; list and load only (apps/cli/src/skills.rs:1456-1458).
- Chrome menu cannot pick built-in skills (apps/extension/src/features/cloud-bridge/skillsClient.ts:45).

## 4. Required behaviour

**Established requirements**

- The product tells users how and when a skill is invoked: slash name, button or automatic matching (S53.08). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S53.08)
- A user can explicitly pick a skill for a message and the model then uses it (S53.17). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S53.17)
- Without being asked, the product loads a skill whose description matches the request (S53.18). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S53.18)
- Skills are invoked from the slash menu or plus menu. (source: doc: docs/product/requirements.md (section 19))
- Invocations use installed content and the allowed runtime, and unavailable runtimes are explained. (source: doc: docs/product/experience-contract.md:788)
- The server refuses an unknown skill name with 'The selected skill is not available.' (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S53.17)

**Acceptance criteria**

1. Picking a skill and sending posts skill_name and the reply shows a skill load activity.
2. An unknown or switched-off skill name returns 422 skill_not_found.
3. A model without tool support returns 422 skill_model_unsupported when a skill is picked, and an unpicked turn simply gets no offer.
4. A skill that needs a tool that is not offered returns 422 skill_requirements_unmet naming the tool.
5. A personal skill is offered automatically before built-in matches.
6. On the VS Code, CLI and API surfaces the server adds no automatic offer.
7. Mobile in Local mode shows no mention palette and sends no skill name.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- [inferred] Automatic offering on Chrome is active because the exclusion list names only vscode, cli and api (apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1073); not confirmed by a run.
- [inferred] A pick forces the skill tool as the first tool call (tool_choice set to the skill tool, request-processor.ts:1065-1069).

**Proposed improvements** (suggestions, not requirements)

- [proposed] Turn on code execution from a skill pick on web as mobile does.
- [proposed] Show required connectors in the slash menu note.
- [proposed] Let Chrome list built-in skills.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | SlashCommandMenu | `apps/web/features/chat/components/Composer/SlashCommandMenu.tsx` | Groups skills, shows 'Needs' notes, reports the pick (lines 90-308). |
| component | ComposerPlusMenu skills submenu | `apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx` | Own skills list and 'Manage skills' (lines 1248-1377). |
| component | ChatComposerNew | `apps/web/features/chat/components/Composer/ChatComposerNew.tsx` | Holds selectedSkillName, mentions, chip, requirement toggles, send (lines 1126, 3016-3040, 3381, 5155, 5565). |
| hook | useSkillsList | `apps/web/features/chat/hooks/use-skills-list.ts` | Loads included skills for the composer (lines 23-50). |
| hook | useChatStream | `apps/web/lib/hooks/useChatStream.ts` | Sends skill_name in the request body (line 4643). |
| endpoint | POST /api/llm/v1/chat/completions | `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts` | Validates skill_name, applies selection or implicit offer, checks requirements (lines 824, 1047-1109, 5365-5516). |
| service | skill-offer | `apps/web/app/api/llm/v1/chat/completions/lib/skill-offer.ts` | Chooses which skills to offer without a pick (lines 10-40). |
| service | relevance matcher | `packages/tools/skills/src/relevance.ts` | Scores description match (lines 3-13, 142). |
| service | skill tool | `packages/tools/skills/src/tool.ts` | Tool definition, prompt catalogue, requirement check, load and read (lines 74-193, 454). |
| service | tool-loop skill execution | `apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts` | Runs the skill tool for built-in, plugin-directory and personal skills (lines 2253-2480). |
| service | skill-staging | `apps/web/lib/e2b/skill-staging.ts` | Copies skill scripts into the code sandbox (lines 11, 80-95). |
| service | selectedSkillRequirementFailure | `apps/web/lib/services/skill-catalog-service.ts` | Builds the requirements-unmet refusal (lines 119-146). |
| store | mobile skill selection store | `apps/mobile/src/features/skills/selectionStore.ts` | Holds the picked skill per account owner. |
| component | SkillMentionPalette | `apps/mobile/src/features/skills/SkillMentionPalette.tsx` | Mobile '@' palette. |
| hook | mobile skillRequirements | `apps/mobile/src/features/skills/skillRequirements.ts` | Turns on code execution and filters mentions (lines 15-56). |
| store | chatExecutionStore | `apps/mobile/stores/chat/chatExecutionStore.ts` | Adds skill_name to the request (line 3452). |
| component | Chrome skills menu | `apps/extension/src/side_panel.ts` | Menu, chip and payload (lines 8863, 15112-15190). |
| service | Chrome freeTrialClient | `apps/extension/src/features/cloud-bridge/freeTrialClient.ts` | Sends skill_name (line 1602). |
| service | CLI dynamic slash expansion | `apps/cli/src/command_registry.rs` | Maps /<skill> to the skill prompt (lines 168-181). |
| service | CLI skill tool | `apps/cli/src/features/exec/tools/mod.rs` | list and load for the model (lines 446-503). |
| service | app server expand_prompt_command | `apps/cli/src/app_server/surfaces.rs` | Expands slash skills for VS Code (lines 1551-1569). |
| test | request-processor.skill.test.ts | `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.skill.test.ts` | Pick handling tests. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The person picks a skill; the client stores its name for one send. | device | apps/web/features/chat/components/Composer/ChatComposerNew.tsx:1126-1128, 3381-3395 |
| The chat request carries skill_name (1 to 200 characters, no slashes or control characters). | device and our servers | apps/web/lib/hooks/useChatStream.ts:4643; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:824-840 |
| The server loads the account's selectable catalogue (built-in switched on, plugin-directory, personal), filters by agent rules, refuses a model without tool support, and refuses an unknown name. | our servers | apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:5365-5436; apps/web/lib/services/skill-catalog-service.ts:597-627 |
| The server adds a system message listing skills with the pick marked, offers the skill tool and forces it as the first call. | our servers | apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1060-1070; packages/tools/skills/src/tool.ts:127-160 |
| The server checks the skill's needed tools and connectors against the tools offered this turn and refuses with 422 if some are missing. | our servers | apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:5497-5516 |
| With no pick and a tool-capable model on web, desktop, mobile or Chrome, the server adds matching skills (when the workspace allows skills) and offers the skill tool without forcing it. | our servers | apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1082-1109, 5440-5455 |
| The model calls the skill tool; the server finds the skill (built-in, plugin-directory or personal), returns the text wrapped as untrusted guidance, and stages scripts in the code sandbox if code execution is on. | our servers | apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:2409-2480; apps/web/lib/e2b/skill-staging.ts:80-95 |
| CLI: the skill text is read from disk and added to the turn; the model runs on the user's chosen route. | device | apps/cli/src/skills.rs:1469-1494; apps/cli/src/features/exec/tools/mod.rs:460-503 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Selected skill name for one turn | Client composer state; request body (apps/web/features/chat/components/Composer/ChatComposerNew.tsx:2157) | Sent with the turn; not stored by the skill code | Cleared after send; chat history keeps the reply |
| Skill text loaded during a turn | Turn context only | Part of the conversation transcript as a tool result [inferred] | As the chat is kept or deleted |
| Staged skill files | Code sandbox for that turn (apps/web/lib/e2b/skill-staging.ts:11, 80-95) | Not synced | Up to 4 MB staged per turn; later turns must load the skill again (skill-staging.ts note text) |

**Models and providers.** The pick needs a model with tool support; the server refuses a pick otherwise and skips the automatic offer (apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1088, 5405-5420). Which provider answers is chosen by the normal routing, not by skills. The CLI sends the skill text to whichever route the session uses (Local, own key or Managed Cloud).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Web, mobile, Chrome: signed in. CLI: none for local skills. |
| Permissions | The automatic offer needs the workspace Skills feature on (apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:5440). I did not find the same check on the explicit pick path (5383-5436); see unknowns. Agent configuration can restrict skills (request-processor.ts:5377). |
| Subscription | No plan rule found in the pick or offer code. Doc: Skills stay available in Free chat (doc: docs/product/definition.md:383; code message apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:4412). Chrome, CLI and VS Code capability rows: unknown. |
| Limits and metering | Offer budget 8,000 characters of always-listed catalogue entries (skill-offer.ts:10); at most 3 relevance matches; skill output limit 100,000 bytes (packages/tools/skills/src/tool.ts:4); scripts staged up to 4 MB (skill-staging.ts:11). The turn is metered as a normal chat turn; no separate skill meter found. |
| Feature flags | Surface exclusion list for the automatic offer (request-processor.ts:1073); FEATURES.skills on mobile. |
| Model compatibility | Requires tool support (see above). |
| Provider restrictions | None found in the skill code. |
| Local mode | Mobile Local mode: skills not available. CLI: works on local skill files with any route. Web and Desktop: hosted web app, so skills run through the managed server path. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Unknown or off skill | 422 skill_not_found with 'The selected skill is not available.' | apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1050-1058 |
| Catalogue unavailable | 503 skill_catalog_unavailable. | apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:5389-5402 |
| Model without tools | 422 skill_model_unsupported. | apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:5405-5420 |
| Requirements missing | 422 skill_requirements_unmet naming the missing tools or connectors. | apps/web/lib/services/skill-catalog-service.ts:128-146 |
| Skill scripts but no code execution | The load result carries a note that scripts need code execution. | apps/web/lib/e2b/skill-staging.ts:26-30, 80-86 |
| CLI missing env var, tool or connection | Load is refused with the reasons. | apps/cli/src/skills.rs:1410-1440 |
| Skill removed after pick (mobile) | Uninstalling clears the selection; selection is cleared when the account changes. | apps/mobile/src/features/skills/SkillsScreen.tsx:684-714; apps/mobile/app/(app)/(tabs)/chat.tsx:363-376 |
| Retry after failed send (mobile) | Retry keeps the skill name for the turn. | apps/mobile/stores/chat/chatExecutionStore.ts:5608-5669 |
| Cancel, timeout, offline | not handled in skill-specific code; the normal chat stream handling applies. | apps/web/lib/hooks/useChatStream.ts |
| Accessibility | Chip remove button has an aria label; mention list uses listbox and option roles. | apps/web/features/chat/components/Composer/ChatComposerNew.tsx:5163, 5565-5580 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.skill.test.ts`: Pick handling in the request processor.
- `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.skill-offer.test.ts`: Implicit offer rules.
- `apps/web/app/api/llm/v1/chat/completions/lib/skill-offer.test.ts`: Always-listed budget and matching.
- `apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.skill.test.ts`: Skill tool execution in the tool loop.
- `packages/tools/skills/src/__tests__/relevance.test.ts`: Relevance scoring.
- `packages/tools/skills/src/__tests__/tool.test.ts`: Skill tool actions and requirement checks.
- `apps/web/lib/hooks/useChatStream.skill.test.ts`: Client sends the skill name.
- `packages/ui/unified-chat/src/components/__tests__/ChatInput.skillSuggestions.test.tsx`: Shared chat input skill suggestions.
- `apps/mobile/src/features/chat/components/__tests__/ChatInput.skillMention.test.tsx`: Mobile mention palette, code-run toggle, Local mode.
- `apps/mobile/__tests__/skillSelectionStore.test.ts`: Mobile selection store.
- `apps/extension/__tests__/skills-client.test.ts`: Chrome own-skills list and skill name rules.
- `apps/web/e2e/qa-01-skill-invocation.spec.ts`: A browser and API run spec for invoking a skill; no result recorded here.
- `apps/cli/src/skills.rs`: In-file tests for the skill tool, requirement refusal and scoring.

**Test scenarios**

- **Manual pick on web**
  1. Type / in the composer and pick a skill.
  2. Send a message.
  3. Watch the reply.
  - Expected: A skill load step shows and the reply follows the skill.
- **Unavailable pick**
  1. Send a request with skill_name set to a name that is switched off.
  - Expected: 422 skill_not_found with the message 'The selected skill is not available.'
- **Non-tool model**
  1. Choose a model without tool support and pick a skill.
  - Expected: 422 skill_model_unsupported.
- **Automatic offer**
  1. Create a personal skill with a clear description.
  2. Send a request matching it without picking.
  - Expected: Server log '[skills] offered relevance-matched skills without an explicit selection' and the model may load it.
- **CLI slash**
  1. Create a skill folder with SKILL.md.
  2. Type /<name> with a request.
  - Expected: The skill text and 'The user invoked the /<name> skill.' are added to the turn.
- **Mobile Local mode**
  1. Type @ in the Local mode chat input.
  - Expected: No palette and no skills request.

**Where to look when it fails**

- Log line '[skills] offered relevance-matched skills without an explicit selection' (apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:5449-5453).
- Error codes skill_not_found, skill_model_unsupported, skill_requirements_unmet, skill_catalog_unavailable.
- Skill tool result codes such as skill_dependencies_unavailable (packages/tools/skills/src/tool.ts:44-52).

**Hands-on test plans**

- Web: [70-qa/test-plans/web/053-skill-creation-and-management.md](../../70-qa/test-plans/web/053-skill-creation-and-management.md)
- Desktop: [70-qa/test-plans/desktop/053-skill-creation-and-management.md](../../70-qa/test-plans/desktop/053-skill-creation-and-management.md)
- Mobile: [70-qa/test-plans/mobile/053-skill-creation-and-management.md](../../70-qa/test-plans/mobile/053-skill-creation-and-management.md)
- CLI: [70-qa/test-plans/cli/053-skill-creation-and-management.md](../../70-qa/test-plans/cli/053-skill-creation-and-management.md)
- VS Code: [70-qa/test-plans/vscode/053-skill-creation-and-management.md](../../70-qa/test-plans/vscode/053-skill-creation-and-management.md)
- Chrome: [70-qa/test-plans/chrome/053-skill-creation-and-management.md](../../70-qa/test-plans/chrome/053-skill-creation-and-management.md)

## 10. Gaps and dependencies

- **Web does not enable code execution for a skill that needs it; mobile does.** Affects: Web and Desktop users of skills with scripts. Evidence: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:363-365, 3016-3031 versus apps/mobile/src/features/skills/skillRequirements.ts:23-40. Work needed: Add the code-run tool to the web toggle map.
- **CLI scoring and mention code is unused, and the CLI skill tool has no read action for bundled files.** Affects: CLI users. Evidence: apps/cli/src/skills.rs:20, 1074-1200, 1456-1458. Work needed: Wire or remove the scorer; add a file read action.
- **The workspace Skills switch is checked for the automatic offer but I found no check on an explicit pick.** Affects: Workspaces that turned Skills off. Evidence: apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:5383-5440 [inferred]. Work needed: Confirm and, if needed, gate the explicit pick.
- **VS Code has no chat skill picker found; only slash text and the CLI path.** Affects: VS Code users. Evidence: apps/cli/src/app_server/surfaces.rs:1551-1569. Work needed: Add a picker or document the slash path.
- **The brief's mention of 'a requirement note before send' is met only for tools in the slash list; connectors are caught by the server after send.** Affects: Web users. Evidence: apps/web/features/chat/components/Composer/SlashCommandMenu.tsx:95-97; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:5497. Work needed: Show connector needs before send.
- **The brief says mobile has no skill detail and that Chrome has no picker; both exist.** Affects: Documentation. Evidence: apps/mobile/src/features/skills/SkillDetailScreen.tsx; apps/extension/src/side_panel.ts:15112. Work needed: Correct the brief and docs/product/surface-feature-matrix.md:368-369.

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:chrome
- surface:cli
- surface:vscode
- mode:cloud
- mode:local
- api:POST /api/llm/v1/chat/completions
- table:user_skills
- F053-01
- F053-02
- F053-04
- SYS-chat-turn-pipeline
- SYS-agents-tools-and-automation
- SYS-model-catalog-and-routing
- SYS-connectors-plugins-and-skills
- SYS-execution-boundaries

## Unknown

- Whether the explicit pick is blocked when the workspace turned Skills off (no check found in the pick block).
- Whether the Chrome extension's request identifies the chrome surface so the automatic offer applies (header code not read).
- How VS Code lets a person choose a skill in chat; only the slash expansion path was found.
- Whether the CLI TUI palette runs /<skill> through command_registry.rs:171 (caller in the TUI not traced).

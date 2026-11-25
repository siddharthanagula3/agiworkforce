---
id: "F052-05"
type: "feature"
title: "Instructions, starters and examples"
aliases: ["Instructions", "System prompt", "Conversation starters", "Output examples", "Sample prompts", "Suggested use cases", "S52.10", "S52.11", "S52.12", "S52.25", "S52.26"]
area: "52 Custom-assistant builder"
available_on: ["web", "desktop", "mobile", "cli"]
implementation: {web: "partial", desktop: "partial", mobile: "partial", cli: "partial", vscode: "missing", chrome: "missing"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "not seen by a person", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S52.10", "S52.11", "S52.12", "S52.25", "S52.26"]
depends_on: ["surface:web", "surface:mobile", "surface:cli", "surface:desktop", "mode:cloud", "mode:own-key", "table:user_agents", "SYS-chat-turn-pipeline", "SYS-model-catalog-and-routing", "SYS-memory-projects-and-context", "F052-02", "F052-06"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F052-05 Instructions, starters and examples

The instructions that shape every chat with an assistant, plus output examples and up to six conversation starters. Instructions and examples are stored and sent to the model on web and mobile. Starters are stored and edited but never shown to people in any chat code found. Suggested use cases do not exist.

Area: [52. Custom-assistant builder](README.md). Requirement items: [S52.10](../../10-requirements/capabilities/052-custom-assistant-builder.md#s5210), [S52.11](../../10-requirements/capabilities/052-custom-assistant-builder.md#s5211), [S52.12](../../10-requirements/capabilities/052-custom-assistant-builder.md#s5212), [S52.25](../../10-requirements/capabilities/052-custom-assistant-builder.md#s5225), [S52.26](../../10-requirements/capabilities/052-custom-assistant-builder.md#s5226).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| Desktop | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| Mobile | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| CLI | partly built | partly built | not seen by a person |
| VS Code | not built | not built | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Instructions become part of the system prompt of every turn run as the agent. Output examples tell the model the shape of answers. Starters are meant to be click-to-begin prompts. The CLI uses the Markdown body of the agent file as the system prompt.

**Why it exists.** S52.10 instructions, S52.11 starters, S52.12 suggested use cases, S52.25 sample prompts, S52.26 output-format examples (doc: knowledge-base/data/area-briefs/052-custom-assistant-builder.md).

**Who uses it.** Builders who want consistent behaviour; chatters who need hints for what to ask.

**Problems it solves**

- Repeating the same setup text in each chat.
- Getting answers in a stable format.
- Helping new users start a conversation with an assistant.

**Use cases**

- A support assistant carries rules about tone and escalation in its instructions.
- A report assistant carries two sample answers so output keeps one layout.
- A coding agent in the CLI uses its file body as a system message.
- A built-in coding partner carries four starter prompts (packages/contracts/cloud-contracts/src/agent-catalog.ts:17-45).

## 2. User experience

**Where to find it**

- Web: editor section 'Instructions' with 'What should this agent do, and how?', 'Output examples' and 'Conversation starters' (apps/web/features/agents/components/AgentConfigForm.tsx:450-496).
- Mobile: section 'Behaviour' with 'Instructions', 'Output examples' and a starters list with 'Add starter' and per-row remove buttons (apps/mobile/src/features/agents/components/AgentConfigSections.tsx:160-205, 290-312).
- Tauri desktop: 'System Prompt' field (apps/desktop/src/features/settings/CustomAgentEditor.tsx:327-340).
- CLI: /agents set <name> prompt <text> replaces the body (agents.rs:1188-1240).
- Where starters are shown to a chatting person: none found.

**Before you start**

- An agent the person owns.

**Screens and controls**

- Web instructions textarea, 8 rows, max 32,000, placeholder 'Describe its role, the steps it follows, and what it should avoid.' (AgentConfigForm.tsx:454-465).
- Web output examples textarea, 4 rows, max 8,000, help 'A sample answer or two in the shape you want. The agent follows their format.' (AgentConfigForm.tsx:466-480).
- Web starters: one input per starter 'Conversation starter <n>' with placeholder 'Add a starter', up to 6, each up to 200 characters (AgentConfigForm.tsx:481-495).
- Mobile starter input label 'Conversation starter' placeholder 'Something a person might ask first' (AgentConfigSections.tsx:191-195).

**Journey**

1. Open the editor.
2. Write instructions.
3. Optionally paste sample answers into 'Output examples'.
4. Add starters one per line.
5. Save the draft; publish so teammates get the change (publish panel).
6. Start a chat: the model receives the instructions and examples with each turn.

**What the person sees and gets**

- No visible starter chips appear when chatting; chat answers follow the instructions.
- CLI: the agent system prompt appears as a system message wrapped in an agent_system_prompt tag (agents.rs:133-143).

**Settings**

- none found beyond the fields themselves.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Instructions and examples are included in the system prompt through agentSystemPrompt (apps/web/lib/agents/agent-turn-config.ts:111-134).
- The chat request processor loads the agent for a conversation and applies its config (apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:3896-3914).
- Limits enforced in schema and migration (agents.ts:17-21, 94-98; 0370_user_agents.sql:52-55).
- CLI system prompt injection from the file body (agents.rs:98-148).
- Built-in catalog entries carry instructions and starters (agent-catalog.ts).

**Incomplete**

- Starters are saved but no code that shows them in a chat was found: the only places that read conversationStarters are the form fields, the draft defaults, the service mapping and the catalog (grep over apps and packages, excluding tests). agentSystemPrompt does not use them either (agent-turn-config.ts:111-134).
- Web starters input silently truncates a typed value to 200 characters (AgentConfigForm.tsx:363-365).

**Present but disconnected or switched off**

- Conversation starters: edited and stored, not displayed to chatting people (see above).

**Not available**

- Suggested use cases (S52.12): no field, form or storage.
- Sample prompts as a separate thing from starters (S52.25): no separate field; starters may serve this purpose but that is not established.
- CLI starters and output examples: not in the agent file format (agents.rs:25-48).
- Tauri desktop output examples and starters: none found.

## 4. Required behaviour

**Established requirements**

- An assistant has instructions that shape every conversation it runs. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S52.10)
- An assistant shows starter prompts a user can click to begin a conversation. (source: S52.11 (doc: same brief))
- An assistant lists suggested use cases so users know when to pick it. (source: S52.12 (doc: same brief))
- An assistant carries sample prompts shown to users. (source: S52.25 (doc: same brief))
- An assistant carries output-format examples it follows. (source: S52.26 (doc: same brief))
- Instructions up to 32000, examples up to 8000, up to 6 starters of 200 characters. (source: packages/contracts/cloud-contracts/src/agents.ts:17-21)
- The CLI adds the body as a system message in an agent_system_prompt tag. (source: apps/cli/src/agents.rs:133-143)

**Acceptance criteria**

1. A chat started from an agent with instructions follows them (visible in a manual check of tone or format).
2. With output examples set, answers follow the shape; with them empty the system prompt has no examples section.
3. An instruction of 32,001 characters is refused by the API.
4. A seventh starter is refused by the API and not offered by the form.
5. Starters, once built, appear as clickable chips in a new empty chat with the agent and fill the composer or send on click [proposed].
6. CLI: /agents set demo prompt <text> replaces the body and keeps the frontmatter.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Reference-file text is also in the system prompt and is told to be treated as material, not instructions (agent-turn-config.ts:120-131); instructions rank above files [inferred].
- Starters should be taken from the published copy for teammates, as the rest of the config is [inferred from effectiveAgentConfig].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Render starters in the web and mobile chat empty state for agent chats.
- [proposed] Add suggested use cases as a field or derive them from starters.
- [proposed] Allow starters and examples in the CLI file format.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | AgentConfigForm Instructions section | `apps/web/features/agents/components/AgentConfigForm.tsx` | Instructions, examples, starters inputs. |
| component | AgentConfigSections Behaviour | `apps/mobile/src/features/agents/components/AgentConfigSections.tsx` | Mobile instructions, examples and starters. |
| schema | AgentConfigSchema instructions, outputExamples, conversationStarters | `packages/contracts/cloud-contracts/src/agents.ts` | Limits lines 17-21, 94-98. |
| service | agentSystemPrompt | `apps/web/lib/agents/agent-turn-config.ts` | Builds the system prompt (line 111). |
| service | applyAgentTurnConfig | `apps/web/lib/agents/agent-turn-config.ts` | Applies model, tools and prompt to a request (line 193). |
| service | request-processor agent load | `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts` | Loads the conversation's agent per turn (lines 3896-3914). |
| table | user_agents instructions columns | `apps/web/db/neon/0370_user_agents.sql` | instructions, output_examples, conversation_starters with CHECKs (lines 52-55). |
| other | agent catalog | `packages/contracts/cloud-contracts/src/agent-catalog.ts` | Built-in instructions and starters. |
| command | apply_to_session | `apps/cli/src/agents.rs` | CLI prompt injection (line 98). |
| command | set_agent_field prompt | `apps/cli/src/agents.rs` | CLI body replace (line 1188). |
| component | CustomAgentEditor System Prompt | `apps/desktop/src/features/settings/CustomAgentEditor.tsx` | Tauri body field. |
| test | agent-turn-config tests | `apps/web/lib/agents/__tests__/agent-turn-config.test.ts` | Prompt, tools and model application. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The person saves instructions, examples and starters in the draft. | device and our servers | AgentEditorPage.tsx:212-237; custom-agent-service.ts:339-415 |
| A chat is created with agent_id set on the conversation. | our servers | custom-agent-service.ts createAgentConversation (starts line 721) |
| On each turn the request processor loads the agent (the working copy for the owner, the published copy for others), refuses paused, retired or over-limit agents, and builds the system prompt. | our servers | request-processor.ts:3896-3914; agent-turn-config.ts:57-134 |
| The prompt goes to the chosen model through the chat pipeline. | outside service | SYS-chat-turn-pipeline; provider call not read in detail |
| CLI loads the agent file and pushes the body as a system message. | device | agents.rs:98-148 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| instructions, output_examples, conversation_starters | user_agents row; published copy in user_agent_versions | All Cloud apps; teammates read the published copy. | Versions are kept per publish; deleted with the agent. |
| CLI agent body | Markdown file | No. | Until the file is deleted. |

**Models and providers.** The agent can pin a model that wins only when the chat is on Auto; a model picked in the chat wins (apps/web/lib/agents/agent-turn-config.ts:175-182; AgentConfigForm.tsx help text near line 520). Instructions are sent to whichever provider the chat uses. In the CLI the session's provider receives the body.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Web and mobile: signed in. CLI: none for the file. |
| Permissions | Owner edits; teammates run the published copy. |
| Subscription | none found in the code specific to instructions; Cloud chat turns are metered by the chat pipeline (not read). |
| Limits and metering | 32,000, 8,000, 6 and 200 characters as above; per-agent daily message cap and monthly credit cap enforced before each turn (agent-turn-config.ts:81-100). |
| Feature flags | none found. |
| Model compatibility | Instruction text is model-neutral; effort levels depend on the pinned model (agents.ts:66-87). |
| Provider restrictions | none found in the code. |
| Local mode | CLI with a local model: body is injected as a system message [inferred]. Mobile and web Local mode do not run agents (Cloud gate, mobile). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Over limit value | Browser maxLength prevents typing past the limit; the API refuses a bigger body. | AgentConfigForm.tsx:459, 471, 488; agent-route.ts:48-52 |
| Empty instructions | Allowed; the prompt then holds only the name and purpose line. | agent-turn-config.ts:111-118 |
| Agent paused or retired | Turn refused with a message naming the agent. | agent-turn-config.ts:33-41, 73-80 |
| Agent deleted or unshared mid-chat | Message 'The agent this chat runs as is no longer shared with you or was deleted. Start a new chat to continue.' | agent-turn-config.ts:65-72 |
| Starters with blank entries | Blank entries are filtered out when saving. | AgentConfigForm.tsx:365 |
| Starter display | not handled in the code (no consumer found). | grep result described above |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/lib/agents/__tests__/agent-turn-config.test.ts`: Instructions added to the request, tools turned off, model pinned over Auto, system prompt names the agent, paused and retired refusals.
- `apps/web/lib/agents/__tests__/agent-fixtures.ts`: Fixture agent with a starter value (support file).
- `apps/web/features/agents/__tests__/AgentEditorPage.test.tsx`: Editor behaviours; no starter-specific test title seen.
- `packages/contracts/cloud-contracts/src/__tests__/agent-catalog.test.ts`: Built-in entries shape.
- `apps/cli/src/agents.rs`: Inline tests including apply_to_session (line 2321).
- `apps/web/db/neon/user-agents-migration.test.ts`: Migration limits.

**Test scenarios**

- **Instructions effect**
  1. Create an agent with instruction 'Answer only in two sentences.'
  2. Chat and ask a broad question.
  - Expected: Answer is two sentences.
- **Output example**
  1. Add an example answer with a table.
  2. Chat and ask a similar question.
  - Expected: Answer follows the table shape.
- **Starter limit**
  1. Add six starters on web.
  2. Look for a seventh input.
  - Expected: No seventh input appears.
- **Starter display check**
  1. Save two starters.
  2. Open a new chat with the agent.
  - Expected: Currently no starter chips appear (gap).
- **CLI prompt**
  1. Run /agents set demo prompt You answer in French.
  2. Run the CLI with --agent demo.
  - Expected: Answers in French; system message carries the agent_system_prompt tag.

**Where to look when it fails**

- Refusal codes agent_unavailable, agent_paused, agent_retired, agent_turn_limit, agent_credit_limit in the chat response (agent-turn-config.ts:17-22; request-processor.ts:3899-3910).
- HTTP 429 for turn limit, 409 for the others (request-processor.ts:3910).

**Hands-on test plans**

- CLI: [70-qa/test-plans/cli/052-custom-assistant-builder.md](../../70-qa/test-plans/cli/052-custom-assistant-builder.md)
- No hands-on plan yet for Web, Desktop, Mobile: the ledger marks this area as not built there, so the plan builder made none. Use the scenarios above.

## 10. Gaps and dependencies

- **Conversation starters are never shown to people chatting.** Affects: Web and mobile chat users and builders who fill them in.. Evidence: No consumer of conversationStarters outside the form, service and catalog; agentSystemPrompt ignores them.. Work needed: Render starters in the agent chat empty state on web and mobile.
- **No suggested use cases field.** Affects: All apps.. Evidence: S52.12; no field in agents.ts.. Work needed: Define the field or fold into starters.
- **No CLI starters or examples.** Affects: CLI.. Evidence: agents.rs:25-48 struct lacks them.. Work needed: Extend the file format.
- **Brief marks instructions missing on web and mobile though built.** Affects: Planning.. Evidence: S52.10 status line.. Work needed: Correct the brief.
- Not built on: VS Code, Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:mobile
- surface:cli
- surface:desktop
- mode:cloud
- mode:own-key
- table:user_agents
- SYS-chat-turn-pipeline
- SYS-model-catalog-and-routing
- SYS-memory-projects-and-context
- F052-02
- F052-06

## Unknown

- Whether any chat UI in web or mobile reads starters through a path the grep missed (grep covered .ts and .tsx under apps and packages).
- How starters from the published copy reach teammates (no display).
- Whether sample prompts are meant to equal starters.
- Exact model-call path after the system prompt is built.
- How the Electron desktop handles agent chats.

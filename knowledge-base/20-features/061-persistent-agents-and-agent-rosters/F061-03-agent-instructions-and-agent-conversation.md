---
id: "F061-03"
type: "feature"
title: "Agent instructions and agent conversation"
aliases: ["Agent instructions", "Agent conversation", "Chat with an agent", "--agent", "/agents <name>", "agent_system_prompt", "Chat button", "Conversation starters", "S61.05", "S61.13"]
area: "61 Persistent agents and agent rosters"
available_on: ["web", "mobile", "cli"]
implementation: {web: "built", desktop: "missing", mobile: "built", cli: "built", vscode: "missing", chrome: "missing"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "not seen by a person", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S61.05", "S61.13"]
depends_on: ["surface:cli", "surface:web", "surface:mobile", "mode:local", "mode:own-key", "mode:cloud", "file:apps/cli/src/agents.rs", "file:apps/web/lib/agents/agent-turn-config.ts", "api:POST /api/custom-agents/{id}/conversations", "api:POST /api/llm/v1/chat/completions", "table:web_conversations", "SYS-chat-turn-pipeline", "SYS-model-catalog-and-routing", "SYS-security-and-privacy", "F061-02"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F061-03 Agent instructions and agent conversation

Gives each agent its own instructions and lets a person talk to it. In the CLI, activating an agent switches the current session and adds its instructions as a system message. On web and mobile Cloud, Chat opens a new conversation tied to the agent, and the server adds the instructions each turn.

Area: [61. Persistent agents and agent rosters](README.md). Requirement items: [S61.05](../../10-requirements/capabilities/061-persistent-agents-and-agent-rosters.md#s6105), [S61.13](../../10-requirements/capabilities/061-persistent-agents-and-agent-rosters.md#s6113).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| Desktop | not built | not built | n/a |
| Mobile | built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| CLI | built | built | not seen by a person |
| VS Code | not built | not built | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Stores an agent's instructions and applies them to a chat. CLI: the session becomes that agent (no separate thread). Cloud: each chat is a conversation row linked to the agent and every turn is run as that agent.

**Why it exists.** So one assistant can behave as a reviewer, a tutor or a writing editor with stable rules, as S61.05 and S61.13 require (doc: knowledge-base/data/area-briefs/061-persistent-agents-and-agent-rosters.md).

**Who uses it.** CLI users who start with --agent or the picker; web and mobile Cloud users who press Chat on an agent.

**Problems it solves**

- Repeating the same instructions in every chat.
- Keeping a specialist's rules separate from the general assistant.
- Starting a chat from conversation starters.

**Use cases**

- Run agi --agent reviewer to start reviewing as that agent.
- In a running CLI session, pick an agent in /agents and keep chatting with history intact.
- On web, press Chat on an agent and use one of its starters.
- On mobile, start a chat with a built-in By AGI agent such as the coding partner.

## 2. User experience

**Where to find it**

- CLI flag --agent <AGENT> (apps/cli/src/lib.rs:424-426); picker via /agents; quick form /agents <name> (apps/cli/src/tui/tui_app.rs:6143-6165).
- Web: Chat button on each Agents row (apps/web/features/agents/components/AgentsPage.tsx:52-62).
- Mobile: Chat button on each row (apps/mobile/src/features/agents/AgentsScreen.tsx:240, 304).
- Other apps: none found.

**Before you start**

- CLI: an agent file named exactly as asked (case-insensitive for --agent and /agents <name>).
- Web and mobile: signed in; mobile in Cloud mode; the agent must be active, not paused or retired (apps/web/lib/agents/agent-turn-config.ts:33-44).

**Screens and controls**

- CLI instructions are the markdown body of the agent file, or /agents set <name> prompt <text> (apps/cli/src/agents.rs:1198-1203).
- Web editor field 'What should this agent do, and how?' and 'Output examples' (apps/web/features/agents/components/AgentConfigForm.tsx:455-467); conversation starters (line 486).
- Mobile editor sections Behaviour with Instructions and Output examples (apps/mobile/src/features/agents/components/AgentConfigSections.tsx:290-302).

**Journey**

1. CLI: start agi --agent reviewer or choose the agent in /agents.
2. The definition is applied to the session: model switch, tool lists, MCP list, max turns, permission mode, spend cap, then the instructions are appended as a system message (apps/cli/src/agents.rs:98-146).
3. The chat shows 'Agent `name` activated' with the model if the agent sets one.
4. Continue chatting; history before activation stays (apps/cli/src/agents.rs:88-96 doc comment).
5. Web: press Chat; a conversation is created with agent_id; the opening chat loads, and each message is processed with the agent's settings.

**What the person sees and gets**

- CLI startup flag prints 'Agent 'name' loaded.' or, when missing, 'Warning: agent 'x' not found. Continuing without agent.' (apps/cli/src/lib.rs:8651-8661; apps/cli/src/tui/tui_app.rs:6953-6957).
- CLI picker or quick form: 'Agent `name` activated' plus ' (model: ...)' if a model is set (apps/cli/src/tui/tui_app.rs:6153-6160).
- CLI unknown agent in plain REPL: 'Agent `x` not found. Use `/agents` to list available agents.' (apps/cli/src/repl/mod.rs:620-624).
- If the agent asks for a looser permission mode: 'Agent `x` asks for <mode> but this session runs in <mode>; the session keeps <mode>.' (apps/cli/src/agents.rs:165-170).
- Cloud refusals: '<name> is paused. Its owner can resume it from Agents.' or 'is retired, so it no longer takes new work.' (apps/web/lib/agents/agent-turn-config.ts:33-43).

**Settings**

- Model and effort overrides on the agent (CLI model field; Cloud model and effort).
- Cloud: web search, code execution and image generation toggles (see F061-04).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- CLI apply_to_session sets model, tool allowlist, disallowed tools, MCP server list, max turns, permission mode and spend cap, then adds the agent_system_prompt system message, without clearing history (apps/cli/src/agents.rs:98-146).
- CLI permission mode can only keep or tighten the session's mode; a looser request is ignored with a message (apps/cli/src/agents.rs:150-194).
- CLI --agent applies at startup in interactive and non-interactive paths (apps/cli/src/lib.rs:6324, 9213; apps/cli/src/repl/mod.rs:118-130; apps/cli/src/tui/tui_app.rs:6951-6957).
- Cloud: POST /api/custom-agents/{id}/conversations creates a conversation with agent_id; refuses paused or retired agents (apps/web/app/api/custom-agents/[id]/conversations/route.ts:13-24; custom-agent-service.ts:721-734).
- Cloud: when a chat completion arrives for a conversation with agent_id, the server loads the agent config, may refuse, changes the model if the agent has one, applies tool policy and prepends a system message with the agent's name, description, instructions, output examples and reference files (apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:3896-3914, 4079; apps/web/lib/agents/agent-turn-config.ts:111-217).
- Non-owners run the last published version, not the owner's draft (custom-agent-service.ts:146-149).

**Incomplete**

- CLI has no separate conversation per agent; the one session is switched into the agent. Activating a second agent adds a second system message and the first agent's instructions stay in history (apps/cli/src/agents.rs:98-146) [inferred from not clearing messages].
- CLI --agent-id is parsed but unused, so binding to an agent thread id does nothing (apps/cli/src/lib.rs:429-430).
- Agent model override in the CLI is dropped with only an error line if switching fails (apps/cli/src/agents.rs:99-110).

**Present but disconnected or switched off**

- Cloud agent turn config is applied only for conversations that have agent_id; a plain chat ignores agents (apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:3896).

**Not available**

- VS Code and Chrome: no agent conversation found.
- Internal Tauri desktop: the custom agent list edits files but no code was found that starts a chat as the agent (apps/desktop/src/stores/customAgentsStore.ts has list, save, delete only).

## 4. Required behaviour

**Established requirements**

- Each agent has its own instructions that shape its behaviour when used. (source: S61.05)
- The user can open a conversation with a specific agent that answers as that agent. (source: S61.13)
- A repository file may only keep or tighten the session permission mode. (source: apps/cli/src/agents.rs:148-150 (doc comment) and tests at apps/cli/src/agents.rs:2384-2450)
- Agent instructions arrive wrapped in an agent_system_prompt tag. (source: apps/cli/src/agents.rs:138)
- Reference files an agent carries are material, never instructions. (source: apps/web/lib/agents/agent-turn-config.ts:122)

**Acceptance criteria**

1. agi --agent reviewer with an existing reviewer file prints that the agent loaded and the system message carries the body in an agent_system_prompt tag.
2. agi --agent missing prints the not-found warning and continues without an agent.
3. Activating an agent mid-chat keeps earlier messages.
4. An agent with permissionMode bypass-permissions in a default session leaves the session in default and prints the 'asks for' message.
5. On web, Chat on a paused agent is disabled and a direct API call returns a conflict with the paused message.
6. A chat started from an agent answers following its instructions and, if the agent has a model, uses it when the chat asked for Auto.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- A tester can see which agent a chat is running as in the transcript or header [inferred; web chat header not opened].
- Per-agent separate threads in the CLI are required by S61.13 but not built [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Give the CLI an optional separate session per agent, bound by --agent-id.
- [proposed] Remove an earlier agent's system message when another is activated, or tell the person both apply.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | AgentDefinition::apply_to_session | `apps/cli/src/agents.rs` | Applies a definition to a live CLI session (lines 98-146). |
| command | --agent flag | `apps/cli/src/lib.rs` | Declares --agent and --agent-id (424-430); apply_named_agent at 8651. |
| command | quick-invoke and picker activation | `apps/cli/src/tui/tui_app.rs` | Activation messages (5011-5026, 6143-6165) and startup (6951). |
| command | REPL AgentInvoke | `apps/cli/src/repl/mod.rs` | Plain REPL activation (lines 600-625). |
| service | loadAgentTurnConfig and applyAgentTurnConfig | `apps/web/lib/agents/agent-turn-config.ts` | Loads config, refuses paused, retired or limited agents, builds the system prompt. |
| service | chat completion request processor | `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts` | Reads conversation agent_id and applies the agent turn config (3896-3928, 4079). |
| endpoint | POST /api/custom-agents/{id}/conversations | `apps/web/app/api/custom-agents/[id]/conversations/route.ts` | Starts an agent conversation. |
| table | web_conversations.agent_id | `apps/web/db/neon/0370_user_agents.sql` | Links a conversation to an agent (lines 136-141). |
| component | AgentConfigForm | `apps/web/features/agents/components/AgentConfigForm.tsx` | Instructions, examples and starters inputs. |
| screen | mobile AgentsScreen | `apps/mobile/src/features/agents/AgentsScreen.tsx` | Chat buttons that start conversations. |
| service | startAgentConversation | `apps/mobile/src/features/agents/service.ts` | Calls the conversations endpoint (line 163). |
| config | built-in catalog agents | `packages/contracts/cloud-contracts/src/agent-catalog.ts` | Starter instructions and conversation starters. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| CLI: the definition is read from its file and applied to the in-memory session; the system message is pushed to the message list. | device | apps/cli/src/agents.rs:98-146 |
| CLI: the next turn sends the messages to the session's provider and model route. | outside service | apps/cli/src/agents.rs:98-110 (switch_model); route chosen by the session (SYS-chat-turn-pipeline) |
| Cloud: Chat calls the conversations endpoint, which inserts a web_conversations row with agent_id. | our servers | apps/web/lib/services/custom-agent-service.ts:721-734 |
| Cloud: each turn, the server loads the agent, checks status and limits, applies model, tool policy, effort and prepends the system prompt, then calls the routed model. | our servers | apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:3896-3928, 4079; apps/web/lib/agents/agent-turn-config.ts:57-217 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| CLI session messages including the agent system message | CLI session store (not traced here) | unknown | unknown |
| Cloud conversation with agent_id | web_conversations | Yes through the web and mobile APIs | If the agent is deleted agent_id is set to null and the chat stops running as the agent (apps/web/db/neon/0370_user_agents.sql:136-137; AgentManagePanel.tsx:238-243) |

**Models and providers.** The agent's model field switches the CLI session model (apps/cli/src/agents.rs:98-110). In Cloud, the agent's model replaces the request model only when the chat chose Auto or nothing (apps/web/lib/agents/agent-turn-config.ts:175-182). Provider routing stays in the chat pipeline (SYS-model-catalog-and-routing).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | CLI: none for loading the agent; the model route needs whatever the session needs. Cloud: signed-in account. |
| Permissions | CLI: the agent can tighten but never loosen the session permission mode (apps/cli/src/agents.rs:150-194). Cloud: non-owners run the published version only (custom-agent-service.ts:146-149); agents shared with a person are readable by them. |
| Subscription | No agent-specific plan check found. Turns are metered by the normal chat pipeline; monthly credit caps are covered in F061-04. |
| Limits and metering | CLI: maxTurns and maxBudgetUsd from the file apply to the session. Cloud: daily turn and monthly credit limits refuse the turn (agent-turn-config.ts:74-103). |
| Feature flags | none found in the code. |
| Model compatibility | Cloud agent models must exist in the catalog (custom-agent-service.ts:180-188). Effort is matched to the nearest level the model supports (packages/contracts/cloud-contracts/src/agents.ts:46-70). |
| Provider restrictions | none found in the agent code; CLI session privacy mode governs egress (apps/cli/src/subagent.rs:41-47). |
| Local mode | CLI in Local mode works: the agent applies to the local session and the turn goes to the on-device route. Cloud agent chats run on our servers and are not available in Local mode. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Agent not found (CLI --agent) | Warning printed, session continues without an agent. | apps/cli/src/lib.rs:8656-8661 |
| Model override fails | 'Agent `x` model override ignored: <error>' on stderr; other fields still apply. | apps/cli/src/agents.rs:99-107 |
| Empty instructions | No system message is added. | apps/cli/src/agents.rs:134-143 |
| Listed skill not installed | Skipped silently at run time. | apps/cli/src/agents.rs:67-85 |
| Agent deleted or unshared during a Cloud chat | Turn refused: 'The agent this chat runs as is no longer shared with you or was deleted. Start a new chat to continue.' | apps/web/lib/agents/agent-turn-config.ts:62-72 |
| Paused or retired | Turn refused with agent_paused or agent_retired. | apps/web/lib/agents/agent-turn-config.ts:17-22, 74-83 |
| Cancel or timeout | not handled by this feature; turn cancel belongs to the chat pipeline. | not found in the agent files |
| Terminal text injection in names | CLI sanitizes names in messages with sanitize_terminal_text. | apps/cli/src/agents.rs:101-103 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/cli/src/agents.rs (inline tests)`: apply_to_session sets model and tools, with model override, never raises permission mode, may keep or lower it, cannot lift a managed cap.
- `apps/web/lib/agents/__tests__/agent-turn-config.test.ts`: Turn config logic (contents not opened).
- `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.chat-system-prompt.test.ts`: Chat system prompt building; name matches the agent prompt feature (contents not opened).
- `apps/web/app/api/custom-agents/[id]/conversations/route.test.ts`: Conversation start route (contents not opened).
- `apps/cli/src/tui/widgets/agent_picker.rs (inline tests)`: Enter on a global row invokes that exact file.

**Test scenarios**

- **CLI activate keeps history**
  1. Start agi and send one message.
  2. Open /agents and activate reviewer.
  3. Ask a follow up.
  - Expected: Chat shows 'Agent `reviewer` activated'; earlier messages remain; reply follows the agent's body.
- **Loosening refused**
  1. Create an agent with permissionMode bypass-permissions.
  2. Start agi in default mode with --agent.
  - Expected: A line says the agent asks for bypass-permissions but the session keeps default.
- **Missing agent flag**
  1. Run agi --agent doesnotexist.
  - Expected: Warning 'agent 'doesnotexist' not found. Continuing without agent.' and a normal session.
- **Cloud chat as agent**
  1. Create and publish an agent that always answers in rhymes.
  2. Press Chat as a second workspace member.
  3. Send a message.
  - Expected: The answer follows the published instructions.
- **Paused mid-chat**
  1. Owner pauses the agent.
  2. Member sends another message in the open chat.
  - Expected: The turn is refused with the paused message.

**Where to look when it fails**

- CLI stderr lines starting 'Agent' and 'Warning: agent'.
- Cloud refusal codes agent_unavailable, agent_paused, agent_retired, agent_turn_limit, agent_credit_limit (apps/web/lib/agents/agent-turn-config.ts:17-22).
- Table web_conversations column agent_id.

**Hands-on test plans**

- Mobile: [70-qa/test-plans/mobile/061-persistent-agents-and-agent-rosters.md](../../70-qa/test-plans/mobile/061-persistent-agents-and-agent-rosters.md)
- CLI: [70-qa/test-plans/cli/061-persistent-agents-and-agent-rosters.md](../../70-qa/test-plans/cli/061-persistent-agents-and-agent-rosters.md)
- No hands-on plan yet for Web: the ledger marks this area as not built there, so the plan builder made none. Use the scenarios above.

## 10. Gaps and dependencies

- **CLI has one switched session, no separate per-agent thread; --agent-id does nothing.** Affects: CLI users.. Evidence: apps/cli/src/agents.rs:88-96; apps/cli/src/lib.rs:429-430. Work needed: Bind a thread per agent or drop the flag.
- **A previously activated agent's system message stays when another is activated.** Affects: CLI users who switch agents mid-session.. Evidence: apps/cli/src/agents.rs:98-146 (messages are only pushed). Work needed: Replace or label the prior agent message.
- **No agent chat in Chrome, VS Code or the Tauri desktop.** Affects: Those users.. Evidence: No code found. Work needed: Decide per surface.
- **Brief marks web and mobile conversation as missing; code has it.** Affects: Documentation.. Evidence: apps/web/app/api/custom-agents/[id]/conversations/route.ts. Work needed: Update brief; verify in a running app.
- Not built on: Desktop, VS Code, Chrome (from the capability ledger).

**Depends on**

- surface:cli
- surface:web
- surface:mobile
- mode:local
- mode:own-key
- mode:cloud
- file:apps/cli/src/agents.rs
- file:apps/web/lib/agents/agent-turn-config.ts
- api:POST /api/custom-agents/{id}/conversations
- api:POST /api/llm/v1/chat/completions
- table:web_conversations
- SYS-chat-turn-pipeline
- SYS-model-catalog-and-routing
- SYS-security-and-privacy
- F061-02

## Unknown

- Whether the Cloud chat screen shows the agent name or icon in its header; the chat UI files were not opened.
- Where CLI session history is stored and whether an agent system message is persisted on resume.
- What --agent-id was meant to do; only the help text 'Resume or bind to a specific agent thread id.' exists.
- Contents of the listed tests.

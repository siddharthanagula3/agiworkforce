---
id: "F052-03"
type: "feature"
title: "Guided builder, live preview and tool testing"
aliases: ["Guided builder", "Conversational builder", "Live preview", "Test chat", "Tool testing", "S52.03", "S52.05", "S52.24"]
area: "52 Custom-assistant builder"
available_on: ["cli"]
implementation: {web: "missing", desktop: "missing", mobile: "missing", cli: "partial", vscode: "missing", chrome: "missing"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S52.03", "S52.05", "S52.24"]
depends_on: ["surface:web", "surface:cli", "surface:mobile", "mode:cloud", "mode:own-key", "mode:local", "SYS-chat-turn-pipeline", "SYS-model-catalog-and-routing", "SYS-agents-tools-and-automation", "SYS-connectors-plugins-and-skills", "F052-02", "F052-05"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F052-03 Guided builder, live preview and tool testing

Intended: build an assistant by chatting with a builder, try it in a preview that uses unsaved changes, and test each tool. None of these exist in the code read. The nearest things are a one-shot model draft in the CLI and a web Chat button that is disabled while edits are unsaved.

Area: [52. Custom-assistant builder](README.md). Requirement items: [S52.03](../../10-requirements/capabilities/052-custom-assistant-builder.md#s5203), [S52.05](../../10-requirements/capabilities/052-custom-assistant-builder.md#s5205), [S52.24](../../10-requirements/capabilities/052-custom-assistant-builder.md#s5224).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | not built | not built | n/a |
| Desktop | not built | not built | n/a |
| Mobile | not built | not built | n/a |
| CLI | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| VS Code | not built | not built | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Would let a person describe an assistant in chat so the builder fills the fields, try the assistant before saving, and run a single tool to see its result. Today none of this is built; this page records what is missing and what stands in for it.

**Why it exists.** S52.03, S52.05 and S52.24 require a guided conversational builder, a live test pane that reflects unsaved changes, and tool testing with the result shown (doc: knowledge-base/data/area-briefs/052-custom-assistant-builder.md).

**Who uses it.** People who build assistants and are not sure of the right wording or tools.

**Problems it solves**

- Blank-form paralysis when writing instructions.
- Saving, chatting, finding a flaw and editing again in a long loop.
- Not knowing whether a tool or connector works before sharing the assistant.

**Use cases**

- Describe a support assistant in chat and see the fields fill.
- Type a test message to the half-edited assistant and read the answer before saving.
- Press 'test' on a web-search or connector tool and read what it returns.

## 2. User experience

**Where to find it**

- None of the three controls exists on any app.
- Stand-in 1, CLI: /agents create <description words> (apps/cli/src/agents.rs:692-740, 777).
- Stand-in 2, web editor: the 'Chat' button starts a real conversation with the saved agent and is disabled while the draft has unsaved changes (apps/web/features/agents/components/AgentEditorPage.tsx:401-411).
- Stand-in 3, mobile editor: 'Chat with <name>' appears for a saved active agent (apps/mobile/src/features/agents/AgentEditorScreen.tsx:123-129).

**Before you start**

- A saved agent for any of the stand-ins that chat; a model session for the CLI draft.

**Screens and controls**

- Web 'Chat' button in the editor header, label 'Chat' (AgentEditorPage.tsx:401-411).
- Web Sessions tab lists conversations that ran as this agent (AgentEditorPage.tsx:43-47; AgentActivityPanel in AgentManagePanel.tsx).
- Mobile 'Chat with <name>' button.
- CLI text prompt: 'Describe what this agent should do and when it should be used' (agents.rs, AGENT_DESCRIPTION_HELP, line near 645).

**Journey**

1. Web stand-in: save the draft, then press 'Chat', then edit and save again, then start a new chat.
2. CLI stand-in: type /agents create <words>, read the file, edit with /agents set or by hand.

**What the person sees and gets**

- CLI: 'Generating agent configuration...' while waiting (agents.rs, GENERATING_AGENT_CONFIGURATION).
- CLI result: file path and the read-before-use warning (agents.rs:718-736).
- Web: a new conversation page /chat/<id> after pressing Chat (AgentEditorPage.tsx:239-249).

**Settings**

- none found for a builder, preview or tool test.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- CLI one-shot draft from words with a system prompt that treats the request as data, a timeout, a parser that refuses incomplete replies, and a write to the project or global agents folder (apps/cli/src/agents.rs:777-852).
- Web and mobile Chat start a real conversation that runs as the saved agent (apps/web/app/api/custom-agents/[id]/conversations/route.ts:13-25).

**Incomplete**

- The CLI draft is a single request and reply, not a guided chat (agents.rs:777-808).
- The preview stand-in on web cannot reflect unsaved changes: Chat is disabled while the draft differs from the saved copy (AgentEditorPage.tsx:405).

**Present but disconnected or switched off**

- nothing found

**Not available**

- Conversational builder on web, desktop, mobile, VS Code, Chrome: none found.
- Live preview pane reflecting unsaved changes on every app: none found.
- Tool or action testing from the builder on every app: none found. The editor tabs are Agent, Sessions and Deployments only (AgentEditorPage.tsx:43-47).

## 4. Required behaviour

**Established requirements**

- A user can build an assistant by chatting with a builder that fills in its configuration. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S52.03)
- While configuring, the user can try it in a preview or test chat that reflects unsaved changes. (source: S52.05 (doc: same brief))
- A builder can test an assistant's tools or actions and see the result. (source: S52.24 (doc: same brief))
- Brief status: missing on all six apps (CLI status for S52.05 is blank in the brief). (source: status lines of S52.03, S52.05, S52.24)
- Execution boundaries must be explicit: what runs on device, on our servers or outside services. (source: product context given for this task)

**Acceptance criteria**

1. Not testable today because the feature does not exist; each of these should be added to the test plan when built.
2. A builder chat fills at least name, description and instructions and shows them in the form before saving.
3. The preview answers using the unsaved instructions, not the saved ones.
4. The preview does not count against the saved agent's daily turn limit unless that is stated [proposed].
5. A tool test shows the tool result or the error text.
6. Local mode builders send nothing to Cloud [proposed, from the trust-boundary rule in AGENTS.md section 6].

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- A builder chat is a model turn and therefore billed like any Cloud turn on web and mobile [inferred from the chat pipeline].
- A preview needs the draft sent with the turn instead of an agent id, because the server loads config by id (apps/web/lib/agents/agent-turn-config.ts:57-105) [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Reuse the CLI draft prompt as the first step of a web builder.
- [proposed] Add a Preview tab beside Agent, Sessions and Deployments that posts the unsaved draft.
- [proposed] Add a Test button per connector or skill selection row.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| command | AgentRequest::parse and create | `apps/cli/src/agents.rs` | CLI draft from words (parse near line 692, create near line 718). |
| command | draft_agent | `apps/cli/src/agents.rs` | Model call, line 777. |
| command | parse_agent_draft | `apps/cli/src/agents.rs` | Validates the model reply, line 810. |
| command | DraftSource::from_session | `apps/cli/src/agents.rs` | Keeps the draft inside the session privacy boundary, line 752. |
| component | AgentEditorPage chat button | `apps/web/features/agents/components/AgentEditorPage.tsx` | Starts a real chat; disabled while dirty. |
| endpoint | POST /api/custom-agents/[id]/conversations | `apps/web/app/api/custom-agents/[id]/conversations/route.ts` | Creates the conversation that runs as the agent. |
| service | loadAgentTurnConfig | `apps/web/lib/agents/agent-turn-config.ts` | Loads the saved or published config for a turn (line 57); no unsaved-draft path. |
| screen | AgentEditorScreen chat button | `apps/mobile/src/features/agents/AgentEditorScreen.tsx` | Mobile 'Chat with <name>'. |
| component | AgentActivityPanel | `apps/web/features/agents/components/AgentManagePanel.tsx` | Sessions tab content. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| CLI sends the typed description to the session's model inside an <agent_request> wrapper. | outside service | apps/cli/src/agents.rs:777-795 |
| The reply is cut to the JSON object, checked for name, description and instructions, and limited to 300 characters of description and 12000 of instructions. | device | agents.rs:810-844 and constants near line 655 |
| The file is written to the project or global agents folder. | device | agents.rs:845-852 |
| Web Chat creates a conversation row tagged with the agent id; later turns load the saved agent. | our servers | custom-agent-service.ts createAgentConversation (starts line 721); request-processor.ts:3896-3914 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Drafted agent file | Markdown on disk | No sync found. | Until deleted. |
| Agent conversation | table web_conversations with agent_id | Cloud apps | Follows chat retention; unknown details. |

**Models and providers.** The CLI draft uses the session's own provider and model; it fails if the privacy boundary check fails (agents.rs:752-760). No other builder model is configured.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | CLI draft: whatever the session needs. Chat stand-ins: signed-in Cloud account. |
| Permissions | Chat requires the agent be readable and active (conversations/route.ts:18-20). |
| Subscription | none found in the code for a builder; the Cloud chat turn is metered by the chat pipeline (SYS-chat-turn-pipeline), details not read. |
| Limits and metering | CLI draft capped at DRAFT_REPLY_TOKENS 4096 tokens and a timeout (agents.rs, constants near line 655). |
| Feature flags | none found. |
| Model compatibility | Any model that can return a JSON object for the CLI draft; failure is reported, not hidden. |
| Provider restrictions | Draft stays with the session provider. |
| Local mode | CLI draft works with a local session model if one is configured [inferred]. No builder, preview or tool test exists on mobile or desktop. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Draft model not available or times out | Returns 'Could not draft that agent: ...' and the blank template command. | agents.rs:738-740 |
| Model reply not JSON | Refused: 'the model did not return an agent definition'. | agents.rs:810-820 |
| Description outside the interactive prompt | Points to the blank template command. | agents.rs:608-612 |
| Web preview of unsaved changes | not handled in the code: Chat is disabled while dirty. | AgentEditorPage.tsx:405 |
| Tool test | not handled in the code. | editor tabs list AgentEditorPage.tsx:43-47 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/cli/src/agents.rs`: Inline tests: create with words is a description and a single name is a template (line 1948), no name asks for a description (1964), description outside the prompt points at template (1973), drafted frontmatter stays one line per field (1980), incomplete draft refused (2018).
- `apps/web/features/agents/__tests__/AgentEditorPage.test.tsx`: Editor shell only; no preview tests.

**Test scenarios**

- **CLI draft happy path**
  1. Run /agents create an agent that explains database indexes to beginners.
  - Expected: Created agent file, description line and read-before-use warning.
- **CLI draft refused**
  1. Run the same with a session that has no usable model.
  - Expected: 'Could not draft that agent' and the template command.
- **Web chat while dirty**
  1. Open an agent, change instructions without saving.
  - Expected: Chat button disabled; after Save draft it becomes enabled.
- **Absence check**
  1. Open the web editor tabs and mobile editor.
  - Expected: No builder chat, preview or tool test control (current state).

**Where to look when it fails**

- CLI error text from draft_failure (agents.rs:738).
- Privacy boundary error from validate_privacy_boundary via DraftSource::from_session (agents.rs:752).

**Hands-on test plans**

- CLI: [70-qa/test-plans/cli/052-custom-assistant-builder.md](../../70-qa/test-plans/cli/052-custom-assistant-builder.md)

## 10. Gaps and dependencies

- **No guided conversational builder.** Affects: All apps.. Evidence: S52.03 status missing on all apps; no code found.. Work needed: Design the builder turn, its model route and billing, and the form fill contract.
- **No live preview with unsaved changes.** Affects: All apps; web users are blocked from chatting while dirty.. Evidence: AgentEditorPage.tsx:405; agent-turn-config.ts:57 loads by id.. Work needed: Accept a draft config for a preview turn with clear metering.
- **No tool or action testing.** Affects: All apps.. Evidence: S52.24 missing; editor tab list.. Work needed: Per-tool test endpoint with permission and result display.
- **CLI draft is not interactive.** Affects: CLI users.. Evidence: agents.rs:777-808. Work needed: Optional follow-up questions.
- Not built on: Web, Desktop, Mobile, VS Code, Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:cli
- surface:mobile
- mode:cloud
- mode:own-key
- mode:local
- SYS-chat-turn-pipeline
- SYS-model-catalog-and-routing
- SYS-agents-tools-and-automation
- SYS-connectors-plugins-and-skills
- F052-02
- F052-05

## Unknown

- Whether any other app has a builder under a name not searched.
- How the CLI interactive layer calls AgentRequest::create (tui_app.rs:3663 and claude_parity.rs:188 cited by the brief were not opened).
- Cost accounting of a future preview.
- The exact value of DRAFT_TIMEOUT in seconds (a duration constant was seen, number not re-checked).
- Whether VS Code has any agent builder (grep found none).

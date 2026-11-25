---
id: "F004-11"
type: "feature"
title: "Agents (custom assistants)"
aliases: ["Agents", "Custom agents", "Custom assistants (S4.33)", "Assistant builder (S4.34)", "user_agents", "/chat/agents"]
area: "4 Signed-in application destinations"
available_on: ["web", "desktop", "mobile"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "missing", vscode: "missing", chrome: "missing"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "not seen by a person", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S4.33", "S4.34"]
depends_on: ["surface:web", "surface:mobile", "surface:cli", "api:GET /api/custom-agents", "api:POST /api/custom-agents", "table:user_agents", "SYS-model-catalog-and-routing", "SYS-memory-projects-and-context", "SYS-connectors-plugins-and-skills", "F004-12"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F004-11 Agents (custom assistants)

Agents are the person's own assistants with their own instructions, conversation starters, model, tools, files and limits. On the web a list page and an editor create, edit, publish, share and delete them through /api/custom-agents; the phone has screens too. The CLI's agents are a different thing: local files.

Area: [4. Signed-in application destinations](README.md). Requirement items: [S4.33](../../10-requirements/capabilities/004-signed-in-application-destinations.md#s433), [S4.34](../../10-requirements/capabilities/004-signed-in-application-destinations.md#s434).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| Desktop | built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| Mobile | built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| CLI | not built **(disagrees with the ledger on whether it exists)** | built | not seen by a person |
| VS Code | not built | not built | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Lets a person define an assistant once (name, description, instructions, starters, model, web search, code execution, image generation, connectors, skills, limits) and chat with it later. (apps/web/features/agents/components/AgentConfigForm.tsx:392)

**Why it exists.** To match custom GPTs and Gems in the leaders' products. (doc: knowledge-base/data/area-briefs/004-signed-in-application-destinations.md S4.33)

**Who uses it.** Signed-in people who repeat the same kind of task; teams who share an agent.

**Problems it solves**

- Retyping instructions each chat.
- Sharing a vetted assistant with colleagues.

**Use cases**

- Create a 'Meeting notes' agent with starters and no web search.
- Import a Claude Code agent file.
- Share an agent with a workspace.
- Delete an agent no longer needed.

## 2. User experience

**Where to find it**

- Web: /chat/agents list titled 'Agents', 'New agent' and 'Import' buttons; /chat/agents/new and /chat/agents/<id> editor (apps/web/features/agents/components/AgentsPage.tsx:188); nav entry /chat/agents (apps/web/shared/components/layout/app-nav-items.ts:175).
- Desktop: through the hosted web app (doc: AGENTS.md section 5).
- Mobile: Agents in the drawer under the folded menu (apps/mobile/src/features/drawer/components/DrawerContent.tsx:140) with routes /(app)/agents and /(app)/agents/[id] (apps/mobile/app/(app)/agents/index.tsx).
- CLI: local agent definition files via /agents in the session and discover_agents (apps/cli/src/agents.rs:258); not the cloud agents.
- VS Code and Chrome: none found.

**Before you start**

- Signed in. No plan check found.

**Screens and controls**

- List: heading 'Agents', text 'Assistants with their own instructions, tools and files.', empty state 'No agents yet' with 'Create an agent'; per row 'Edit <name>' and 'Chat with <name>' (apps/web/features/agents/components/AgentsPage.tsx:158).
- Editor: description 'What it does, in one line', Icon, Colour, instructions, 'Conversation starters' (up to 6), model, 'Web search', 'Code execution', 'Image generation', 'Websites', 'Connectors', skills and daily limits with 'No limit' placeholders (apps/web/features/agents/components/AgentConfigForm.tsx:392).
- Manage panel: transfer ownership, retire, delete ('Delete agent') (apps/web/features/agents/components/AgentManagePanel.tsx:239).
- Panels for knowledge files, publish, deployments.

**Journey**

1. Open Agents; press 'New agent'.
2. Fill in name, instructions, starters, model and tools.
3. Save; the agent appears in the list.
4. Press 'Chat with <name>' to use it, or edit, publish or share.
5. To remove, open Manage and Delete; the confirm says it is deleted for everyone and cannot be recovered.

**What the person sees and gets**

- 'Loading agents' skeleton; error with 'Try again'; import errors; delete confirmation text.

**Settings**

- Daily turn limit and monthly credit limit per agent (apps/web/lib/services/custom-agent-service.ts:50).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web list and editor pages (apps/web/app/chat/agents/page.tsx:1).
- API: list, create, get, update, delete, import, export, publish, status, share, files, versions, restore, usage, activity, conversations, transfer under /api/custom-agents (apps/web/app/api/custom-agents).
- Mobile service mirrors the same contract: list, get, create, import, update, files, share, usage, versions (apps/mobile/src/features/agents/service.ts:1).
- Starter cap AGENT_STARTERS_MAX is 6 (packages/contracts/cloud-contracts/src/agents.ts:20).

**Incomplete**

- Brief marks web, desktop, mobile missing for the manager and everyone missing for the builder; the code has web pages, an editor and mobile screens, so the brief is out of date.
- CLI 'agents' are local markdown definitions (.agiworkforce/agents) that do not call /api/custom-agents; they are sub-agent definitions for the terminal (apps/cli/src/agents.rs:252).

**Present but disconnected or switched off**

- nothing found

**Not available**

- VS Code and Chrome: no agent manager found.
- Mobile editor feature parity with web not compared; unknown.

## 4. Required behaviour

**Established requirements**

- A signed-in destination lists custom assistants and lets the user open, create, edit and delete them. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S4.33)
- A builder defines name, instructions, knowledge, tools, starters, previews and saves. (source: S4.34 (same brief))
- Deleting asks first and names the consequence. (source: (doc: AGENTS.md section 9))
- The product is model agnostic; agent model choice must come from the catalog. (source: (doc: AGENTS.md section 4))

**Acceptance criteria**

1. New agent saves and appears in the list.
2. More than 6 conversation starters are refused.
3. Edit changes persist after reload.
4. Delete asks first, then the agent disappears for everyone it was shared with.
5. A non-owner sees shared agents separately and cannot delete.
6. The mobile list shows the same agents as web for one account.
7. An invalid agent request returns a validation error, not a crash.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Model on an agent should be on the person's plan when chatting; not verified. [inferred]

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add a CLI command listing cloud agents so S4.33 covers the terminal.
- [proposed] Update the brief rows for S4.33 and S4.34 to built on web and mobile.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| screen | AgentsPage | `apps/web/features/agents/components/AgentsPage.tsx` | List with import and new. |
| screen | AgentEditorPage | `apps/web/features/agents/components/AgentEditorPage.tsx` | Create and edit. |
| component | AgentConfigForm | `apps/web/features/agents/components/AgentConfigForm.tsx` | Fields and tool toggles. |
| component | AgentManagePanel | `apps/web/features/agents/components/AgentManagePanel.tsx` | Transfer, retire, delete. |
| component | AgentKnowledgePanel | `apps/web/features/agents/components/AgentKnowledgePanel.tsx` | Files. |
| component | AgentPublishPanel | `apps/web/features/agents/components/AgentPublishPanel.tsx` | Publish and sharing. |
| endpoint | GET/POST /api/custom-agents | `apps/web/app/api/custom-agents/route.ts` | List and create. |
| endpoint | /api/custom-agents/[id] | `apps/web/app/api/custom-agents/[id]/route.ts` | Read, update, delete. |
| service | custom-agent-service | `apps/web/lib/services/custom-agent-service.ts` | Rows, defaults, limits. |
| service | agent-route | `apps/web/lib/agents/agent-route.ts` | CSRF, rate limit, body validation. |
| table | user_agents | `apps/web/lib/services/custom-agent-service.ts` | Agent records. |
| table | user_agent_access / user_agent_files | `apps/web/lib/services/custom-agent-service.ts` | Sharing and knowledge files. |
| schema | agents contract | `packages/contracts/cloud-contracts/src/agents.ts` | Request and response schemas, AGENT_STARTERS_MAX. |
| screen | AgentsScreen / AgentEditorScreen | `apps/mobile/src/features/agents/AgentsScreen.tsx` | Mobile list and editor. |
| service | mobile agents service | `apps/mobile/src/features/agents/service.ts` | Mobile API calls. |
| command | CLI agent definitions | `apps/cli/src/agents.rs` | Local markdown agents and /agents commands. |
| config | app-nav-items | `apps/web/shared/components/layout/app-nav-items.ts` | Nav entry for /chat/agents. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Page loads GET /api/custom-agents; server reads rows for the user and organization. | our servers | apps/web/app/api/custom-agents/route.ts:17 |
| Save posts a validated body to create; server inserts and returns the agent. | our servers | apps/web/app/api/custom-agents/route.ts:30 |
| Chatting with the agent runs a normal chat turn with the agent's instructions, model and tools. | our servers | [inferred] agent conversations route exists (apps/web/app/api/custom-agents/[id]/conversations/route.ts) |
| Delete removes the agent row. | our servers | apps/web/lib/services/custom-agent-service.ts:443 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Agent definition, versions, files, access | tables user_agents, user_agent_access, user_agent_files | Read by web and mobile from the same API | Delete removes the agent, its versions, files and sharing for everyone; chats stay (apps/web/features/agents/components/AgentManagePanel.tsx:241) |
| CLI local agent files | ~/.agiworkforce/agents and project .agiworkforce/agents (apps/cli/src/agents.rs:252) | No | Files on disk |

**Models and providers.** An agent stores a model selection or 'chooses model per chat' (packages/contracts/cloud-contracts/src/agents.ts:61); effort options come from the catalog. CLI drafting uses the session's model so a draft stays inside the session boundary (apps/cli/src/agents.rs:741).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed in on web and mobile; CLI local agents need no account. |
| Permissions | Owner can edit, publish, delete; others see shared agents; CSRF and rate limit on writes (apps/web/lib/agents/agent-route.ts:41). |
| Subscription | none found in the code for create, edit or delete. |
| Limits and metering | Starters 6; optional daily turn and monthly credit limits per agent (apps/web/lib/services/custom-agent-service.ts:50). |
| Feature flags | none found in the code |
| Model compatibility | Model validated by contract and catalog; effort levels depend on the model (packages/contracts/cloud-contracts/src/agents.ts:66). |
| Provider restrictions | none found in the code |
| Local mode | Cloud agents need our servers and an account, so they are unavailable in Local mode. CLI local agent files work without sign-in. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading | Skeleton rows labelled 'Loading agents'. | apps/web/features/agents/components/AgentsPage.tsx:194 |
| Error | Alert plus 'Try again'. | apps/web/features/agents/components/AgentsPage.tsx:201 |
| Empty | 'No agents yet' with 'Create an agent'. | apps/web/features/agents/components/AgentsPage.tsx:211 |
| Invalid id | Not found for non-UUID ids. | apps/web/lib/agents/agent-route.ts:24 |
| Import | Button disabled and busy while importing. | apps/web/features/agents/components/AgentsPage.tsx:173 |
| Delete | Confirm 'Delete <name>?' with consequences; retire offered as alternative. | apps/web/features/agents/components/AgentManagePanel.tsx:239 |
| Starters full | Adding beyond the max is ignored by the draft helper. | packages/contracts/cloud-contracts/src/agent-drafts.ts:98 |
| Offline | not handled in the code I read. | not found |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/agents/__tests__/AgentsPage.test.tsx`: List page.
- `apps/web/features/agents/__tests__/AgentEditorPage.test.tsx`: Editor page.
- `apps/web/features/agents/__tests__/AgentKnowledgePanel.test.tsx`: Knowledge files.
- `apps/web/features/agents/__tests__/AgentPublishPanel.test.tsx`: Publish.
- `apps/web/app/api/custom-agents/route.test.ts`: List and create route.
- `apps/web/app/api/custom-agents/[id]/route.test.ts`: Item route.
- `packages/contracts/cloud-contracts/src/__tests__/agent-drafts.test.ts`: Starter cap and drafts.
- `apps/mobile/src/features/agents/__tests__`: Mobile agents (files not listed).
- `apps/cli/src/agents.rs`: Inline tests from line 1701 (content not read).

**Test scenarios**

- **Create**
  1. Open /chat/agents, New agent, fill fields, save.
  - Expected: Agent listed; reload keeps it.
- **Starter cap**
  1. Add 7 starters.
  - Expected: Only 6 accepted.
- **Delete**
  1. Open Manage, Delete agent, confirm.
  - Expected: Agent gone from web and mobile lists.
- **Cross-app**
  1. Create on web, open Agents on the phone.
  - Expected: Same agent appears.
- **Import**
  1. Import a markdown agent file.
  - Expected: Agent created or a readable error.

**Where to look when it fails**

- Routes under /api/custom-agents; table user_agents.
- Validation error 'Invalid agent request' with issues.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/004-signed-in-application-destinations.md](../../70-qa/test-plans/web/004-signed-in-application-destinations.md)
- Desktop: [70-qa/test-plans/desktop/004-signed-in-application-destinations.md](../../70-qa/test-plans/desktop/004-signed-in-application-destinations.md)
- Mobile: [70-qa/test-plans/mobile/004-signed-in-application-destinations.md](../../70-qa/test-plans/mobile/004-signed-in-application-destinations.md)

## 10. Gaps and dependencies

- **Brief says web, desktop and mobile missing; code has them.** Affects: Documentation. Evidence: apps/web/app/chat/agents/page.tsx; apps/mobile/app/(app)/agents/index.tsx. Work needed: Update brief S4.33 and S4.34.
- **CLI has no cloud agent manager; its agents are local files with a different model.** Affects: CLI users. Evidence: apps/cli/src/agents.rs:252. Work needed: Name the difference in help or add cloud agent commands.
- **No agents on VS Code and Chrome.** Affects: those apps. Evidence: none found. Work needed: Decide scope.
- **No subscription rule for agents found; whether Free may create is unknown.** Affects: Free plan. Evidence: apps/web/lib/services/custom-agent-service.ts. Work needed: Confirm product rule and entitlement check.
- Not built on: CLI, VS Code, Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:mobile
- surface:cli
- api:GET /api/custom-agents
- api:POST /api/custom-agents
- table:user_agents
- SYS-model-catalog-and-routing
- SYS-memory-projects-and-context
- SYS-connectors-plugins-and-skills
- F004-12

## Unknown

- Whether mobile editor reaches parity with the web editor.
- Whether agents are plan gated anywhere in chat time.
- How a chat with an agent applies its instructions (chat pipeline not read).
- Whether the Tauri desktop has its own Agents page.
- CLI inline test contents.
- How import from Claude Code files is validated.

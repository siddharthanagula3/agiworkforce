---
id: "F052-01"
type: "feature"
title: "Assistant list and manage"
aliases: ["Agents page", "Your agents", "Shared with you", "Custom Agents (desktop settings)", "/agents command", "S52.01 Assistant manager", "custom assistant list"]
area: "52 Custom-assistant builder"
available_on: ["web", "desktop", "mobile", "cli"]
implementation: {web: "built", desktop: "partial", mobile: "built", cli: "built", vscode: "missing", chrome: "missing"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "not seen by a person", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S52.01"]
depends_on: ["surface:web", "surface:mobile", "surface:desktop", "surface:cli", "mode:cloud", "mode:local", "table:user_agents", "api:GET /api/custom-agents", "api:DELETE /api/custom-agents/[id]", "SYS-authentication-and-identity", "SYS-authorization-and-workspaces", "SYS-data-model-and-migrations", "SYS-api-and-contracts", "file:packages/contracts/cloud-contracts/src/agents.ts"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F052-01 Assistant list and manage

The list of a person's custom assistants, called Agents in the product. Web and mobile show a Cloud list with Edit and Chat. The CLI lists agent files on disk with show, delete and rename. The Tauri desktop settings list agent files. The brief says web, desktop and mobile are missing; the code says otherwise.

Area: [52. Custom-assistant builder](README.md). Requirement items: [S52.01](../../10-requirements/capabilities/052-custom-assistant-builder.md#s5201).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| Desktop | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| Mobile | built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| CLI | built | built | not seen by a person |
| VS Code | not built | not built | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Shows every custom assistant a person can use in one place and lets them open, edit, chat with or remove each. On web and mobile the list comes from the managed cloud API and splits into the person's own agents and agents shared with them. In the CLI and the Tauri desktop settings the list is the set of agent Markdown files on the device.

**Why it exists.** Brief item S52.01 says a user sees their custom assistants in one place and can open, edit or remove each (doc: knowledge-base/data/area-briefs/052-custom-assistant-builder.md). Without a list a person cannot find or reuse what they built.

**Who uses it.** Web and mobile: signed-in people on Cloud, including teammates who were shared an agent. CLI and Tauri desktop: developers who keep agent files on their machine.

**Problems it solves**

- Finding an assistant built earlier without searching chat history.
- Telling owned agents from agents someone shared (apps/web/features/agents/components/AgentsPage.tsx:154-155).
- Seeing at a glance whether an agent is a draft, shared, paused or retired (apps/web/features/agents/lib/agent-display.ts:14-31).
- Removing an assistant that is no longer wanted.

**Use cases**

- A person opens Agents on web, sees 'Your agents' and 'Shared with you', and presses Chat on a row to start a conversation that runs as that agent.
- A mobile user opens Agents, filters by segment and starts a chat with a built-in agent from the 'By' catalog group.
- A developer types /agents in the CLI to see project and global agent files, then /agents show <name> for detail.
- A developer deletes an old agent file with /agents delete <name> --yes.

## 2. User experience

**Where to find it**

- Web: left navigation item 'Agents', route /chat/agents (apps/web/shared/components/layout/app-nav-items.ts:172-177; apps/web/features/agents/lib/agent-display.ts:3).
- Mobile: route app/(app)/agents, screen titled 'Agents' (apps/mobile/app/(app)/agents/index.tsx:4; apps/mobile/src/features/agents/AgentsScreen.tsx:493-506).
- Desktop (Tauri build only): Settings, Agents section, block titled 'Custom Agents' (apps/desktop/src/features/settings/AgentsSettings.tsx:94; apps/desktop/src/features/settings/CustomAgentsList.tsx:225).
- Desktop (public Electron window): shows the hosted web app, so the web Agents page is what appears [inferred from AGENTS.md section 5]; apps/web/features/desktop-host/lib/adjacent-chat.ts:26 lists /chat/agents as a chat section path.
- CLI: /agents, /agents list, /agents show <name>, /agents path <name>, /agents validate, /agents history, /agents delete <name> --yes, /agents rename <name> <new-name> (apps/cli/src/agents.rs:580-660).
- VS Code and Chrome: none found; no agent list code in apps/extension or apps/extension-vscode matched the agent API paths or the two agent folder names.

**Before you start**

- Web and mobile: a signed-in account; mobile also needs Cloud mode, otherwise a gate screen says 'Agents run in AGI Cloud; switching won’t upload your local chats.' (apps/mobile/src/features/agents/AgentsScreen.tsx:504-512; apps/mobile/src/shared/hooks/useCloudFeatureAccess.ts:24-30).
- Tauri desktop and CLI: no account; a readable agent folder on the device.

**Screens and controls**

- Web header: title 'Agents', text 'Assistants with their own instructions, tools and files.', buttons 'Import' and 'New agent' (AgentsPage.tsx:162-189).
- Web row: avatar, name, description, state line, button 'Edit' (owner only) and button 'Chat' (disabled unless the agent is active) (AgentsPage.tsx:22-65).
- Web sections 'Your agents' and 'Shared with you' (AgentsPage.tsx:219-230).
- Web delete is not on the list; it is the 'Delete agent' button in the editor's manage panel (apps/web/features/agents/components/AgentManagePanel.tsx:345-348).
- Mobile: segment bar, section headers, rows with 'Chat', 'New' button labelled 'Create an agent' for accessibility, 'Import from file' button, and a 'Report or hide' action on shared rows (AgentsScreen.tsx:165, 304-316, 510-545).
- Tauri desktop: cards with pencil 'Edit agent' and trash 'Delete agent' icons shown on hover, 'Refresh agents' icon, 'Create Agent' button, and a storage-hint box naming ~/.claude/agents/ and .claude/agents/ (CustomAgentsList.tsx:38-58, 241-252, 287-312).
- CLI: text output only.

**Journey**

1. Web: open Agents from the left navigation.
2. The page shows a loading status, then the two sections.
3. Press 'Edit' to open /chat/agents/<id>, or 'Chat' to create a conversation and land on /chat/<conversationId> (AgentsPage.tsx:125-137).
4. To remove an agent, open it, find 'Delete agent' in the manage panel and confirm the dialog that names what is lost (AgentManagePanel.tsx:237-252).
5. CLI: type /agents; read the list; type /agents delete <name>; read the warning; repeat with --yes to delete.

**What the person sees and gets**

- Web loading: status region labelled 'Loading agents' with two skeleton rows (AgentsPage.tsx:194).
- Web error: red message plus 'Try again' (AgentsPage.tsx:198-206).
- Web empty: 'No agents yet' with 'Create an agent' link (AgentsPage.tsx:207-216).
- Web chat failure: toast 'A chat with <name> could not be started.' (AgentsPage.tsx:132).
- CLI delete first run: 'This deletes <path> and cannot be undone. Run /agents delete <name> --yes to confirm.' (agents.rs:1147-1160).
- CLI success: 'Deleted agent `<name>` (<path>).'

**Settings**

- Web: none for the list itself; the nav item can be hidden (hideable: true) (app-nav-items.ts:172-177).
- Mobile: the chosen segment is remembered (apps/mobile/src/features/agents/__tests__/AgentsScreens.test.tsx:266 test title).
- CLI: AGIWORKFORCE_HOME can relocate the config folder that holds global agents (apps/cli/src/config.rs:480-484).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web list page with owned and shared sections, loading, error, empty and chat states (apps/web/features/agents/components/AgentsPage.tsx:96-236).
- Web list API: GET /api/custom-agents returns up to 500 rows ordered owned first, retired last (apps/web/app/api/custom-agents/route.ts:21-30; apps/web/lib/services/custom-agent-service.ts:281).
- Web delete through DELETE /api/custom-agents/[id], owner only, with a confirm dialog (apps/web/app/api/custom-agents/[id]/route.ts:49-56; AgentManagePanel.tsx:237).
- Mobile list, segments, built-in catalog group, chat start, import, report and hide (apps/mobile/src/features/agents/AgentsScreen.tsx).
- CLI list, show, path, validate, history, delete, rename (apps/cli/src/agents.rs:580-660, 1147, 1165).
- Tauri desktop list, edit and delete of agent files through registered commands (apps/desktop/src-tauri/src/lib.rs:1219; apps/desktop/src/stores/customAgentsStore.ts).

**Incomplete**

- Web has no delete control on the list row itself (AgentsPage.tsx:43-62).
- Tauri desktop delete says only 'This cannot be undone.' and removes the file with no Trash step (CustomAgentsList.tsx:119; apps/desktop/src-tauri/src/sys/commands/custom_agents.rs:284). AGENTS.md section 9 asks that a removed file go to the operating system Trash first.
- CLI delete uses remove_file with no Trash step (apps/cli/src/agents.rs:1147-1160).
- Web server delete is a hard row delete with cascade (apps/web/lib/services/custom-agent-service.ts:437); the UI warns it cannot be recovered and suggests Retire instead (AgentManagePanel.tsx:239-241).
- Limits by plan on the number of agents: none found in the code.

**Present but disconnected or switched off**

- Tauri desktop agent files: the code comment says nothing in the desktop app runs a custom agent; only the CLI loader reads the files (apps/desktop/src-tauri/src/sys/commands/custom_agents.rs:200-205). The list screen is also in the Tauri code, which AGENTS.md section 5 says does not reach the public Electron window.
- Desktop agent files are written to .claude/agents folders (custom_agents.rs:120-126) while the CLI /agents delete, rename and set only edit files under .agiworkforce/agents and its config folder agents folder (agents.rs:1129-1145); a desktop-made agent is therefore listed by the CLI but refused for edit with 'comes from ..., which this command does not edit' [inferred from the two code paths].

**Not available**

- VS Code: no agent list found.
- Chrome: no agent list found.
- Mobile in Local mode: gated; Cloud agents are not read (AgentsScreens.test.tsx:180 test title 'gates Local Mode without reading Cloud agents').

## 4. Required behaviour

**Established requirements**

- A user sees their custom assistants in one place and can open, edit or remove each. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S52.01)
- Brief status: web, desktop, mobile, VS Code, Chrome missing; CLI done. The code shows web and mobile built and desktop built only in the Tauri build. (source: S52.01 status line against code (apps/web/features/agents/components/AgentsPage.tsx; apps/mobile/src/features/agents/AgentsScreen.tsx))
- A removed file goes to the operating system Trash first; an irreversible action asks first and names the consequence. (source: doc: AGENTS.md section 9)
- Every subscription capability on every app connects to one AGI Subscription system; local work on device needs no paid subscription. (source: product context given for this task)

**Acceptance criteria**

1. Web: with no agents, /chat/agents shows 'No agents yet' and a 'Create an agent' link.
2. Web: with one owned and one shared agent, the page shows 'Your agents' and 'Shared with you' and only the owned row has 'Edit'.
3. Web: a paused agent's 'Chat' button is disabled.
4. Web: an API failure shows the message and 'Try again' reloads the list.
5. CLI: /agents delete <name> without --yes deletes nothing and prints the cannot-be-undone warning.
6. CLI: /agents rename a b moves the file to b.md and rewrites the name field.
7. Mobile in Local mode: the Agents screen shows the Cloud gate and sends no list request.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Every app that offers agents should show the same state words (Draft, Only you, Shared with workspace, Paused, Retired) [inferred from the shared contract helper agentStateLabel in packages/contracts/cloud-contracts/src/agent-drafts.ts and its web copy].
- Deleting an agent from any surface should go through a confirmation that names the loss [inferred from AGENTS.md section 9].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Move deleted agent files to the Trash in the CLI and Tauri desktop.
- [proposed] Add a delete or retire action on the web list row.
- [proposed] Make the CLI and desktop use one folder pair so a desktop-made agent can be edited by the CLI.
- [proposed] Update the brief status for web, mobile and desktop.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| screen | AgentsPage | `apps/web/features/agents/components/AgentsPage.tsx` | Web Agents list with Import, New agent, Edit, Chat. |
| service | agentsApi | `apps/web/features/agents/services/agents-client.ts` | Web client for every custom-agents endpoint, adds auth and CSRF headers. |
| other | agent-display helpers | `apps/web/features/agents/lib/agent-display.ts` | AGENTS_HREF, state label, can-chat rule. |
| endpoint | GET/POST /api/custom-agents | `apps/web/app/api/custom-agents/route.ts` | List and create. |
| endpoint | GET/PATCH/DELETE /api/custom-agents/[id] | `apps/web/app/api/custom-agents/[id]/route.ts` | Read, edit and delete one agent. |
| service | custom-agent-service | `apps/web/lib/services/custom-agent-service.ts` | SQL for list, read, delete, ownership checks. |
| component | AgentManagePanel | `apps/web/features/agents/components/AgentManagePanel.tsx` | Pause, retire, transfer and Delete agent with confirm dialogs. |
| config | nav item agents | `apps/web/shared/components/layout/app-nav-items.ts` | Left navigation entry 'Agents' at /chat/agents. |
| screen | AgentsScreen | `apps/mobile/src/features/agents/AgentsScreen.tsx` | Mobile list, segments, catalog, Cloud gate. |
| service | mobile agents service | `apps/mobile/src/features/agents/service.ts` | Mobile calls to the same endpoints. |
| hook | useCloudFeatureAccess | `apps/mobile/src/shared/hooks/useCloudFeatureAccess.ts` | Requires signed in and Cloud mode. |
| component | CustomAgentsList | `apps/desktop/src/features/settings/CustomAgentsList.tsx` | Tauri desktop list of agent files. |
| store | useCustomAgentsStore | `apps/desktop/src/stores/customAgentsStore.ts` | Calls list, save and delete Tauri commands. |
| command | list_custom_agents / delete_custom_agent | `apps/desktop/src-tauri/src/sys/commands/custom_agents.rs` | Reads and removes .md files in ~/.claude/agents and .claude/agents. |
| command | render_agents_command | `apps/cli/src/agents.rs` | CLI /agents verbs (starts line 580). |
| command | delete_agent / rename_agent | `apps/cli/src/agents.rs` | CLI delete (line 1147) and rename (line 1165). |
| table | user_agents | `apps/web/db/neon/0370_user_agents.sql` | Stores agent rows with row-level security. |
| schema | ManagedCloudAgentSchema | `packages/contracts/cloud-contracts/src/agents.ts` | Shared shape of a listed agent (line 127). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Web page requests GET /api/custom-agents with a bearer token. | device and our servers | apps/web/features/agents/services/agents-client.ts:111-112 |
| The route applies the chat-conversation rate limit (60 per minute), opens a user-scoped database connection and lists rows the person owns plus rows of other people in the same workspace. | our servers | apps/web/lib/agents/agent-route.ts:32-38; apps/web/lib/rate-limit.ts:282-286; apps/web/lib/services/custom-agent-service.ts:281-296 |
| For a teammate's agent the service returns only the last published copy; an agent never published is dropped from that person's list. | our servers | apps/web/lib/services/custom-agent-service.ts:146-150 (effectiveAgentConfig) |
| The browser validates the response against the shared schema and draws the sections. | device | apps/web/features/agents/services/agents-client.ts:73-80 |
| CLI /agents reads Markdown files from the global and trusted-project agent folders and prints the list; nothing leaves the device. | device | apps/cli/src/agents.rs:258-320, 580-585 |
| Tauri desktop settings call list_custom_agents, which reads the two .claude/agents folders. | device | apps/desktop/src/stores/customAgentsStore.ts (fetchAgents); apps/desktop/src-tauri/src/sys/commands/custom_agents.rs:179 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Agent row (name, description, icon, colour, instructions, status, visibility, published version) | table user_agents in the Neon database (apps/web/db/neon/0370_user_agents.sql:44-80) | Shared by every Cloud app that reads the endpoint; no device cache found. | Owner delete removes the row and its versions and files; the UI says it cannot be recovered (AgentManagePanel.tsx:239-241). Account and workspace erasure also touch it (apps/web/lib/server/account-erasure.ts, listed by grep; details unknown). |
| Agent file on device | Markdown file in .agiworkforce/agents or the CLI config folder agents; .claude/agents for the Tauri desktop | No sync found. | Deleted permanently by remove_file; no Trash step. |

**Models and providers.** Listing and deleting call no model. Model choice only matters when a chat starts (see F052-02 and F052-05).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Web and mobile need a signed-in account. The CLI and Tauri desktop file list needs none (agents.rs and custom_agents.rs read local folders). |
| Permissions | Only the owner sees 'Edit' and may delete; teammates get a read-only editor and a Chat button (AgentsPage.tsx:44-50; AgentEditorPage.tsx:184). Server checks ownership with requireOwnedAgent (custom-agent-service.ts:321). Row-level security policies exist on user_agents (0370_user_agents.sql:170-186). |
| Subscription | none found in the code: no plan check on the agents routes (apps/web/app/api/custom-agents/route.ts uses only rate limit and CSRF). |
| Limits and metering | 60 conversation operations per minute per the chat-conversation limit; list limited to 500 rows (custom-agent-service.ts:281-296). Count of agents per plan: none found. |
| Feature flags | The nav entry is hideable by the person; no feature flag found. |
| Model compatibility | Not applicable to listing. |
| Provider restrictions | none found in the code. |
| Local mode | Mobile: Local mode shows the Cloud gate and lists nothing. CLI and Tauri desktop: list local files with no account. Web has no Local mode for this page: it reads the Cloud database. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading | Web: skeleton in a status region 'Loading agents'. Mobile: LoadingRows. Tauri: pulse card, refresh icon spins. | AgentsPage.tsx:194; AgentsScreen.tsx:534; CustomAgentsList.tsx:264-269 |
| Empty | Web 'No agents yet'; mobile 'No agents here yet'; Tauri 'No custom agents yet'. | AgentsPage.tsx:209; AgentsScreen.tsx:587; CustomAgentsList.tsx:145 |
| Error and retry | Web message with 'Try again'; mobile ErrorBanner with retry; Tauri red banner and 'Refresh agents'. | AgentsPage.tsx:198-206; AgentsScreen.tsx:530; CustomAgentsList.tsx:257-261 |
| Paused or retired agent | Chat button disabled; state label shows Paused or Retired. | agent-display.ts:10-21 |
| Shared agent never published | Hidden from the teammate. | custom-agent-service.ts:146-150 |
| Offline | not handled in the code beyond the generic error and retry. | AgentsPage.tsx:112-118 |
| Cancel | Web list load is cancelled on unmount with a flag. | AgentsPage.tsx:104-123 |
| Accessibility | Rows carry aria-labels 'Edit <name>' and 'Chat with <name>'; coarse-pointer minimum height 44 px classes; mobile rows carry accessibility labels. | AgentsPage.tsx:46-56; AgentsScreen.tsx:270 |
| Account change on mobile | Responses from a previous account are ignored by an account epoch check in the editor hook. | apps/mobile/src/features/agents/useAgentEditor.ts:48-60 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/agents/__tests__/AgentsPage.test.tsx`: Owned versus shared sections, grid layout, starting a chat, paused agent has no chat, empty and retry states, import.
- `apps/web/app/api/custom-agents/route.test.ts`: GET list uncached, limited read, POST create path, invalid body.
- `apps/web/app/api/custom-agents/[id]/route.test.ts`: Single agent routes (test titles not read).
- `apps/web/e2e/agents-pages.spec.ts`: /chat/agents settles on the list or the first-agent prompt with a way to make one.
- `apps/mobile/src/features/agents/__tests__/AgentsScreens.test.tsx`: Grouping, catalog group, Local Mode gate, segments, list and chat start, empty state, report and hide.
- `apps/mobile/src/features/agents/__tests__/service.test.ts`: List parsing, delete refusal message.
- `apps/desktop/src/stores/__tests__/customAgentsStore.test.ts`: Load, save then reload, delete then reload through the Tauri wrapper.
- `apps/cli/src/agents.rs`: Inline Rust tests for parsing, listing, discovery and templates (tests start near line 1700).

**Test scenarios**

- **Web empty list**
  1. Sign in with an account that has no agents.
  2. Open /chat/agents.
  - Expected: 'No agents yet' and a 'Create an agent' link to /chat/agents/new.
- **Web shared agent**
  1. Owner publishes and shares an agent to the workspace.
  2. Teammate opens Agents.
  - Expected: Agent appears under 'Shared with you' with 'Shared by <owner>', no 'Edit', and a working 'Chat'.
- **List failure**
  1. Block the network request to /api/custom-agents.
  2. Open Agents.
  3. Restore the network and press 'Try again'.
  - Expected: Error with message then the list loads.
- **CLI delete guard**
  1. Create a project agent with /agents create demo.
  2. Run /agents delete demo.
  3. Run /agents delete demo --yes.
  - Expected: First run deletes nothing and warns; second removes the file.
- **Mobile Local mode**
  1. Switch the mobile app to Local mode.
  2. Open Agents.
  - Expected: Gate text about AGI Cloud and no agent request is sent.
- **Desktop and CLI folders**
  1. In the Tauri build create an agent in Settings, Agents.
  2. In the CLI run /agents show <name> then /agents delete <name> --yes.
  - Expected: Shown by CLI; delete refused because the file is outside the CLI-owned folders (current behaviour per code reading; not run).

**Where to look when it fails**

- Web API errors carry error.message in the body (agents-client.ts:49-59); AgentRequestError name.
- Rate limit refusal on the chat-conversation bucket.
- Table user_agents and user_agent_versions in the Neon database.
- CLI: /agents validate reports duplicates and bad modes (agents.rs:958).
- Tauri: tracing line 'Custom agent ... saved to' (custom_agents.rs:276).

**Hands-on test plans**

- CLI: [70-qa/test-plans/cli/052-custom-assistant-builder.md](../../70-qa/test-plans/cli/052-custom-assistant-builder.md)
- No hands-on plan yet for Web, Desktop, Mobile: the ledger marks this area as not built there, so the plan builder made none. Use the scenarios above.

## 10. Gaps and dependencies

- **Brief marks web, mobile and desktop manager as missing although code exists.** Affects: Anyone planning from the brief; web, mobile, desktop.. Evidence: S52.01 status line versus AgentsPage.tsx and AgentsScreen.tsx. Work needed: Correct the brief statuses after a human check of the running apps.
- **No Trash step before removing agent files.** Affects: CLI and Tauri desktop users.. Evidence: apps/cli/src/agents.rs:1147-1160; apps/desktop/src-tauri/src/sys/commands/custom_agents.rs:284-300; doc: AGENTS.md section 9. Work needed: Send the file to the operating system Trash, or archive it.
- **Desktop and CLI use different agent folders for editing.** Affects: Developers who use both.. Evidence: custom_agents.rs:120-126 versus agents.rs:1129-1145. Work needed: Pick one write location and make both tools edit it.
- **No agent list on VS Code or Chrome.** Affects: VS Code and Chrome users.. Evidence: No matching code found in apps/extension-vscode or apps/extension.. Work needed: Decide whether those surfaces need a list; if so build it on the shared contract.
- **Tauri desktop agent files are not run by the desktop app.** Affects: Tauri desktop users.. Evidence: custom_agents.rs:200-205 comment. Work needed: Either run them or hide the screen.
- **No Delete on the web list row.** Affects: Web users.. Evidence: AgentsPage.tsx:43-62. Work needed: Optional row action; product decision.
- Not built on: VS Code, Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:mobile
- surface:desktop
- surface:cli
- mode:cloud
- mode:local
- table:user_agents
- api:GET /api/custom-agents
- api:DELETE /api/custom-agents/[id]
- SYS-authentication-and-identity
- SYS-authorization-and-workspaces
- SYS-data-model-and-migrations
- SYS-api-and-contracts
- file:packages/contracts/cloud-contracts/src/agents.ts

## Unknown

- Whether the Electron desktop shows /chat/agents exactly as web (only adjacent-chat.ts:26 read).
- Which plan limits, if any, apply to the number of agents.
- How the web list page behaves when the account has more than 500 agents beyond the SQL limit.
- CLI dispatch site for /agents in the interactive app (brief cites claude_parity.rs:188 and tui_app.rs:3663; not opened).
- Whether mobile has a first-class delete confirm label (AgentManageSections.tsx not read).

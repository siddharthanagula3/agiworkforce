---
id: "F052-12"
type: "feature"
title: "Copy, move and retire"
aliases: ["Copy, move and retire", "Duplicate or fork", "Export or migration", "Deprecation notice", "Replacement-assistant link", "Pause", "Retire", "Transfer ownership", "Import", "Export as Claude Code agent", "S52.38", "S52.39", "S52.40", "S52.41"]
area: "52 Custom-assistant builder"
available_on: ["web", "desktop", "mobile", "cli"]
implementation: {web: "partial", desktop: "partial", mobile: "partial", cli: "partial", vscode: "missing", chrome: "missing"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S52.38", "S52.39", "S52.40", "S52.41"]
depends_on: ["surface:web", "surface:mobile", "surface:cli", "surface:desktop", "mode:cloud", "mode:local", "table:user_agents", "table:user_agent_versions", "table:user_agent_access", "table:user_agent_files", "table:web_conversations", "table:scheduled_tasks", "api:POST /api/custom-agents/import", "api:GET /api/custom-agents/[id]/export", "api:POST /api/custom-agents/[id]/transfer", "api:POST /api/custom-agents/[id]/status", "SYS-data-model-and-migrations", "SYS-authorization-and-workspaces", "SYS-files-artifacts-and-storage"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F052-12 Copy, move and retire

Lets an owner export an agent as a Markdown file, import one, hand it to another workspace member, pause it, retire it or delete it. Web and Mobile have these against our servers. There is no duplicate button, no deprecation notice and no replacement link. Export and import drop most settings.

Area: [52. Custom-assistant builder](README.md). Requirement items: [S52.38](../../10-requirements/capabilities/052-custom-assistant-builder.md#s5238), [S52.39](../../10-requirements/capabilities/052-custom-assistant-builder.md#s5239), [S52.40](../../10-requirements/capabilities/052-custom-assistant-builder.md#s5240), [S52.41](../../10-requirements/capabilities/052-custom-assistant-builder.md#s5241).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| Desktop | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| Mobile | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| CLI | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| VS Code | not built | not built | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Export downloads a Claude Code style agent file. Import turns such a file into a new draft. Transfer hands ownership to a workspace member. Pause stops new chats until resumed; retire stops them and hides the agent from recipients but keeps history; delete removes it (apps/web/lib/agents/agent-markdown.ts:84-172; custom-agent-service.ts:418-447, 602-618).

**Why it exists.** Builders move agents between products and people, and need a safe way to stop one without losing history (brief S52.38 to S52.41; migration comment about retired keeping the agent and history read-only, 0370_user_agents.sql:20-22).

**Who uses it.** Owners. Recipients feel pause and retire.

**Problems it solves**

- Starting from an existing Claude Code agent file.
- Taking an agent to another tool.
- Handing an agent to a colleague who is taking over.
- Stopping an agent without deleting its chats.

**Use cases**

- Import a coworker's subagent Markdown file as a draft.
- Export an agent to keep a backup or use in the CLI.
- Transfer ownership when the builder leaves a team.
- Retire an old agent while its chats stay readable.

## 2. User experience

**Where to find it**

- Web list header: buttons 'Import' and 'New agent' (apps/web/features/agents/components/AgentsPage.tsx:177-190).
- Web agent page, Agent tab, section 'Manage': 'Pause' or 'Resume' or 'Bring back', 'Retire', 'Export as Claude Code agent', 'Transfer ownership' select with 'Transfer', and 'Delete agent' (apps/web/features/agents/components/AgentManagePanel.tsx:263-352).
- Mobile: list 'Import from file'; agent screen 'Manage' with 'Pause agent' or 'Resume agent', 'Export as Markdown', 'Transfer ownership', 'Retire agent', 'Delete agent' (apps/mobile/src/features/agents/AgentsScreen.tsx:543; AgentManageSections.tsx:572-625).
- CLI: /agents rename, /agents delete <name> --yes; agent files are plain Markdown a person can copy (apps/cli/src/agents.rs:1147-1186). The CLI reads ~/.claude/agents so a Claude Code file works [doc: agents.rs:258-268].
- Desktop Tauri: Custom Agents list can edit and delete files (apps/desktop/src/features/settings/CustomAgentsList.tsx).
- VS Code, Chrome: not found.

**Before you start**

- Signed in; Mobile in Cloud mode.
- Owner for everything except chatting; transfer needs a workspace and the target a member (service:602-618).
- Export route works for anyone who can read the agent (export route:13-27) but the Web button sits in the owner-only panel (AgentEditorPage.tsx:451-458).

**Screens and controls**

- Retire confirmation 'Retire <name>?' with button 'Retire agent' (AgentManagePanel.tsx:206-215).
- Transfer confirmation "Make <name> the owner?" with button 'Transfer ownership' (AgentManagePanel.tsx:216-235).
- Delete confirmation 'Delete <name>?' saying versions, files and sharing are deleted for everyone and cannot be recovered, with button 'Delete agent' (AgentManagePanel.tsx:237-254).
- Help line 'Paused agents take no new chats or runs. Export makes a Markdown agent file.' (AgentManagePanel.tsx:309-311).
- Import file picker accepts .md and text/markdown (AgentsPage.tsx:15, 168-176).
- Mobile confirmations via confirmIrreversible for Retire, Transfer, Delete (AgentManageSections.tsx:510-557).

**Journey**

1. Import: Agents, press 'Import', choose a .md file; toast 'Imported <name> as a draft.' and the draft opens.
2. Export: open an agent, Manage, 'Export as Claude Code agent'; a <slug>.md file downloads.
3. Pause: press 'Pause'; the row shows 'Paused' and Chat is disabled; 'Resume' brings it back.
4. Retire: press 'Retire', read the consequence, confirm; recipients lose it; 'Bring back' restores.
5. Transfer: choose a workspace member, press 'Transfer', confirm; the page reloads without owner controls.
6. Delete: press 'Delete agent' and confirm.

**What the person sees and gets**

- Toasts: 'Imported <name> as a draft.', 'That file could not be imported.', '<name> now owns <agent>.', 'Deleted <name>.', failure texts such as 'The agent could not be paused.' (AgentsPage.tsx:144-147; AgentManagePanel.tsx:203-261).
- Chat refusal text: '<name> is paused. Its owner can resume it from Agents.' and '<name> is retired, so it no longer takes new work. Its history stays readable.' (apps/web/lib/agents/agent-turn-config.ts:33-41).
- State labels 'Paused' and 'Retired' (agent-display.ts:20-21).
- Import errors such as 'The file needs a name in its frontmatter, as a Claude Code agent has.' (agent-markdown.ts:152-154).

**Settings**

- Status values active, paused, retired (packages/contracts/cloud-contracts/src/agents.ts:11).
- Import size limit equals the largest export plus 48,000 characters of metadata (agents.ts:242-251).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Export: GET /api/custom-agents/[id]/export returns Markdown with frontmatter name, description, model (or inherit), effort, color, skills and the instructions plus an '## Output examples' section (apps/web/app/api/custom-agents/[id]/export/route.ts:13-27; agent-markdown.ts:84-104).
- Import: POST /api/custom-agents/import parses the frontmatter and body, validates, creates a new private draft (import/route.ts:17-34; agent-markdown.ts:143-172).
- Import keeps only name, description, instructions, examples, model (when in the catalog), skills, colour and effort; the file's other keys are dropped (agent-markdown.ts:159-171; test 'imports a hand-written Claude Code agent and drops what it cannot honour').
- Transfer: POST /api/custom-agents/[id]/transfer calls a database function that moves the owner only to a member of the same workspace, moves the files and removes the new owner's access row; an audit event 'agent_ownership_transferred' is recorded (transfer/route.ts:17-29; service:602-618; 0370_user_agents.sql:287-334).
- Pause and retire: POST /api/custom-agents/[id]/status sets status with timestamps (status/route.ts; service:418-435). Paused and retired agents refuse new conversations (conversations/route.ts:18-20) and chat turns (agent-turn-config.ts:73-80, request-processor.ts:3902-3915) and scheduled runs (scheduled-agent-executor.ts:919-921). Retired agents are hidden from recipients by the database policy (0370_user_agents.sql:189-191) and cannot be edited (service:333-337).
- Delete: DELETE /api/custom-agents/[id] hard-deletes the row; conversations and schedules keep existing with agent_id set to null (service:437-447; 0370_user_agents.sql:137, 144).
- Mobile has import, export (share sheet), transfer, pause or resume, retire and delete (service.ts:54-77, 116-118, 177-181; AgentManageSections.tsx:497-625).
- CLI: /agents rename and /agents delete <name> --yes (confirmation names the file and says it cannot be undone) (agents.rs:1147-1186).
- Desktop Tauri: save and delete agent files (custom_agents.rs:260-304).

**Incomplete**

- Export and import lose settings: the file has no web search, code execution, image generation, connectors, website lists, limits, icon, starters or reference files, so an import yields a default agent with all three tool switches on (agent-markdown.ts:84-104, 159-171; service:34-52) [inferred]. An agent file from the CLI that restricts tools through 'tools' or 'disallowedTools' therefore imports with no restriction.
- Export from the web button is owner-only, yet the route serves any reader; a recipient can export the published copy by calling the route directly [inferred].
- Mobile and Web transfer pick only from the first 100 workspace members (share route:46-51).
- Brief marks export 'missing' for Web, Mobile, VS Code, Chrome and gives no status for CLI and desktop.

**Present but disconnected or switched off**

- Brief marks all four items 'missing' on every app; Web and Mobile code exist for export, import, transfer, pause and retire.

**Not available**

- Duplicate or fork of an existing agent: no code found. Mobile can create one copy of a built-in agent from the first-party list (apps/mobile/src/features/agents/service.ts:168-175; packages/contracts/cloud-contracts/src/agent-catalog.ts:143-165), which is a template copy, not a fork of the person's agent.
- Deprecation notice text or replacement-agent link: no field in AgentConfigSchema or the table; status has only active, paused, retired (agents.ts:11; 0370_user_agents.sql:44-76).
- Export and import in VS Code and Chrome; CLI import command (the CLI reads files from folders instead).
- Recycle bin or undelete for a deleted agent: delete is permanent after the confirmation (service:437-447).

## 4. Required behaviour

**Established requirements**

- A user can duplicate or fork an assistant to make their own copy. (source: brief S52.38)
- A user can export an assistant or migrate assistants in from or out to another product. (source: brief S52.39)
- An assistant can show a deprecation notice to its users. (source: brief S52.40)
- A deprecated assistant can point users to a replacement assistant. (source: brief S52.41)
- An action a user cannot undo asks first and names the consequence; permanent removal happens only from an explicit user action that names what is lost. (source: doc: AGENTS.md section 9)
- Custom GPTs are a migration source; investigate migration rather than freezing an old GPT-builder design. (source: doc: docs/product/competitive-guidance.md:179)
- Compatibility loaders may read supported .agents and .claude agent definitions through one precedence-aware loader; compatibility does not authorize moving, deleting or rewriting another tool's files. (source: doc: docs/product/definition.md:122)

**Acceptance criteria**

1. Export an agent and import the file: the new draft has the same name, description, instructions, examples, model, skills, colour and effort.
2. Import a file with no name: refused with the name message and nothing created.
3. Pause an agent: new chat attempt shows the paused message; resume: chat works again.
4. Retire an agent: a shared teammate no longer sees it; owner sees it as Retired and can bring it back.
5. Transfer to a non-member: refused with 'The agent can only move to another member of the workspace it belongs to.'
6. Transfer to a member: new owner can edit; former owner is read-only.
7. Delete asks first and names versions, files and sharing; chats stay but stop running as the agent.
8. Duplicate: a copy appears as a private draft (not implemented).

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Round trip through export and import should keep every setting that matters for safety, or warn about what was dropped [inferred from the lossy conversion].
- A deprecation notice and replacement link would belong on the agent row and in the retired refusal message [inferred].
- Duplicate can be built on createAgent with the owner's config [inferred from service:339-384].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Warn on import which fields were dropped and default tool switches to off when a file names a tool list.
- [proposed] Add 'Duplicate' that copies the working copy as a private draft.
- [proposed] Add 'deprecationNote' and 'replacementAgentId' fields shown in the retired and paused refusal text and on the row.
- [proposed] Move deleted agents to a recently-deleted holding state before permanent removal, in line with AGENTS.md section 9 for archived chats.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | agentToSubagentMarkdown / agentFromSubagentMarkdown | `apps/web/lib/agents/agent-markdown.ts` | Export and import conversion (lines 84-172). |
| endpoint | api:GET /api/custom-agents/[id]/export | `apps/web/app/api/custom-agents/[id]/export/route.ts` | Downloads Markdown (attachment). |
| endpoint | api:POST /api/custom-agents/import | `apps/web/app/api/custom-agents/import/route.ts` | Creates a draft from Markdown (line 36 exports POST). |
| endpoint | api:POST /api/custom-agents/[id]/transfer | `apps/web/app/api/custom-agents/[id]/transfer/route.ts` | Hands over ownership and writes an audit event. |
| endpoint | api:POST /api/custom-agents/[id]/status | `apps/web/app/api/custom-agents/[id]/status/route.ts` | Pause, resume, retire, bring back. |
| endpoint | api:DELETE /api/custom-agents/[id] | `apps/web/app/api/custom-agents/[id]/route.ts` | Permanent delete (lines 49-56). |
| service | setAgentStatus / transferAgent / deleteAgent | `apps/web/lib/services/custom-agent-service.ts` | Status, ownership and delete logic (lines 418-447, 602-618). |
| service | agentUnavailableReason / loadAgentTurnConfig | `apps/web/lib/agents/agent-turn-config.ts` | Paused and retired refusal texts and checks (lines 33-80). |
| endpoint | api:POST /api/custom-agents/[id]/conversations | `apps/web/app/api/custom-agents/[id]/conversations/route.ts` | Refuses a new chat with a paused or retired agent (lines 18-20). |
| service | scheduled agent executor | `apps/web/lib/services/scheduled-agent-executor.ts` | Stops routines of an unavailable agent (lines 919-921). |
| config | app_transfer_user_agent | `apps/web/db/neon/0370_user_agents.sql` | Database function that moves an agent inside its workspace (lines 287-334). |
| table | table:user_agents (status, paused_at, retired_at) | `apps/web/db/neon/0370_user_agents.sql` | Status columns and checks (lines 63, 66-67, 74-75). |
| component | AgentManagePanel | `apps/web/features/agents/components/AgentManagePanel.tsx` | Web Manage section with confirmations (lines 159-352). |
| component | AgentsPage (Import) | `apps/web/features/agents/components/AgentsPage.tsx` | Web import button and file handling (lines 139-152). |
| component | AgentManageSections (Mobile) | `apps/mobile/src/features/agents/components/AgentManageSections.tsx` | Mobile Manage section (lines 486-625). |
| service | agents service (Mobile) | `apps/mobile/src/features/agents/service.ts` | importAgentMarkdown, exportAgentMarkdown, transferAgent, setAgentStatus, deleteAgent. |
| schema | AgentStatusRequestSchema / AgentTransferRequestSchema / AgentImportRequestSchema | `packages/contracts/cloud-contracts/src/agents.ts` | Wire shapes (lines 152, 196, 242). |
| schema | AGENT_CATALOG and agentCatalogCreateRequest | `packages/contracts/cloud-contracts/src/agent-catalog.ts` | First-party templates that Mobile can copy once into the person's agents (lines 17, 143-165). |
| command | rename_agent / delete_agent | `apps/cli/src/agents.rs` | CLI rename and delete of agent files (lines 1147-1186). |
| command | delete_custom_agent / save_custom_agent | `apps/desktop/src-tauri/src/sys/commands/custom_agents.rs` | Desktop file save and delete (lines 260-304). |
| component | CustomAgentsList | `apps/desktop/src/features/settings/CustomAgentsList.tsx` | Desktop list with edit and delete. |
| service | workspace audit events | `apps/web/app/api/custom-agents/[id]/transfer/route.ts` | Records 'agent_ownership_transferred' (lines 24-28). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Export: the server reads the agent, picks the viewer's copy (owner draft or recipient's published), builds Markdown and returns it as a download. | our servers | export/route.ts:13-27; service:146-149 |
| Import: the browser reads the file text and posts it; the server parses frontmatter, rejects bad files, creates a private draft in the current workspace. | device and our servers | AgentsPage.tsx:139-152; import/route.ts:17-34 |
| Status change: owner posts the new status; the server updates status and timestamp; later chats and routines check status first. | our servers | service:418-435; agent-turn-config.ts:73-80 |
| Transfer: the server checks ownership then calls the database function that checks workspace membership and moves the row and files. | our servers | service:602-618; 0370_user_agents.sql:287-334 |
| Delete: the server removes the row; foreign keys cascade versions, access and files and null the agent id on conversations and schedules. | our servers | service:437-447; 0370_user_agents.sql:97, 108, 119, 137, 144 |
| CLI and desktop file actions read or write Markdown files on disk. | device | apps/cli/src/agents.rs:1147-1186; custom_agents.rs:260-304 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Exported Markdown file | Downloaded to the person's device (Mobile uses the share sheet) | No | Person's control; contains instructions, which may be private |
| Imported agent | table:user_agents | Same database | Until deleted |
| Deleted agent | Rows removed from user_agents, user_agent_versions, user_agent_access, user_agent_files | Not applicable | Permanent; no holding state found |
| Transfer audit event | Workspace audit log (store not opened) | unknown | unknown |

**Models and providers.** Export writes the pinned model id or 'inherit'; import accepts a model only if it exists in the catalog, otherwise the model is left empty (agent-markdown.ts:115-120). No provider is called during copy, move or retire.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed in on Web or Mobile; CLI and desktop file actions need no account. |
| Permissions | Owner only for status, transfer, delete and the Manage panel; any reader can call export; any signed-in user can import into their own workspace (routes cited above). Transfer target must be in the same workspace (0370_user_agents.sql:312-318). |
| Subscription | No plan gate found. |
| Limits and metering | Import body limit about 88,000 characters (agents.ts:242-251: 32,000 + 8,000 + 48,000); rate limit class 'chat-conversation'; paused and retired agents consume nothing because turns are refused first. |
| Feature flags | none found in the code |
| Model compatibility | Import drops a model id that is not in the catalog (agent-markdown.ts:115-120). |
| Provider restrictions | none found in the code |
| Local mode | Web and Mobile copy, move and retire work only in Cloud (Mobile Local mode is gated). CLI and desktop file agents are on the device; copy is a file copy and works without a subscription [inferred]. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Import bad file | Error toast 'That file could not be imported.' or the specific message; nothing created. | AgentsPage.tsx:146-147; import/route.ts:25-27; agent-markdown.test.ts |
| Two '## Output examples' headings | Import refused with a message rather than dropping text. | agent-markdown.ts:66-70 |
| Import pending | Import button shows a spinner and is disabled. | AgentsPage.tsx:177-186 |
| Pause | Chat disabled; teammates see 'Paused'; schedules for it refuse to run. | agent-display.ts:10-12; scheduled-agent-executor.ts:921 |
| Retire | Not editable; hidden from recipients; owner can bring back. | service:333-337; 0370 policy |
| Transfer to a non-member | Validation error with the workspace message. | service:613-617 |
| Personal agent transfer | Database function returns false (no workspace), so the same message appears [inferred]. | 0370_user_agents.sql:306-308 |
| Transfer success | Page reloads read-only for the former owner. | AgentManagePanel.tsx:229-231; AgentEditorPage.tsx:457 |
| Delete | Chats stay but stop running as the agent; the next turn says the agent is no longer available. | 0370_user_agents.sql:137; agent-turn-config.ts:65-72 |
| Offline or timeout | not handled in the code beyond error toasts. | AgentManagePanel.tsx:192-201 |
| Accessibility | Buttons are labelled; confirmation dialogs name consequence; hidden file input is aria-hidden with a visible Import button. | AgentsPage.tsx:168-186; AgentManagePanel.tsx:206-254 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/lib/agents/__tests__/agent-markdown.test.ts`: Export format, round trip, import of a hand-written Claude Code file (drops what it cannot honour), name required, effort both ways, heading edge cases, largest export fits import limit.
- `apps/web/app/api/custom-agents/[id]/export/route.test.ts`: Downloaded file imports back to the same agent; refusal; 404.
- `apps/web/app/api/custom-agents/import/route.test.ts`: Creates an agent from an exported file; refuses a non-agent file.
- `apps/web/app/api/custom-agents/[id]/transfer/route.test.ts`: Hands over and audits; nothing recorded on failure; refuses missing owner.
- `apps/web/app/api/custom-agents/[id]/status/route.test.ts`: Pause through the write path; invalid status refused.
- `apps/web/lib/agents/__tests__/agent-turn-config.test.ts`: Paused or retired refused before any model call.
- `apps/web/features/agents/__tests__/AgentsPage.test.tsx`: Import a Claude Code file and open the draft; no chat for paused agent.
- `apps/web/features/agents/__tests__/AgentEditorPage.test.tsx`: Delete asks and names what is lost.
- `apps/web/db/neon/user-agents-migration.test.ts`: Transfer only inside the workspace; conversations and schedules survive agent delete.
- `apps/mobile/src/features/agents/__tests__/service.test.ts`: Import, status change, transfer, delete refusal message.
- `apps/mobile/src/features/agents/__tests__/AgentsScreens.test.tsx`: Pause and resume keeps unsaved edits.
- `apps/desktop/src/stores/__tests__/customAgentsStore.test.ts`: Desktop save and delete through commands.

**Test scenarios**

- **Export then import**
  1. Export an agent with a model, skills and examples.
  2. Import the file.
  - Expected: New draft matches those fields; tool switches are defaults (all on).
- **Import a restrictive CLI agent**
  1. Take a CLI agent file with tools limited to read tools.
  2. Import it on Web and check Model and tools.
  - Expected: Current behaviour: tool switches are on (restriction not carried). Record as a defect against the safety expectation.
- **Pause blocks chats and routines**
  1. Pause an agent that has a schedule.
  2. Try Chat and wait for the next run.
  - Expected: Chat shows the paused message; the routine fails with the paused message.
- **Retire hides from teammates**
  1. Share and publish an agent.
  2. Retire it.
  3. Teammate refreshes Agents.
  - Expected: It is gone for the teammate; owner sees Retired and 'Bring back'.
- **Transfer**
  1. Owner transfers to member B.
  2. B opens the agent; the former owner opens it.
  - Expected: B can edit; former owner is read-only.
- **Delete keeps chats**
  1. Delete an agent that has chats.
  2. Open an old chat and send a message.
  - Expected: Chat stays; the turn is refused with the no longer shared or deleted message.

**Where to look when it fails**

- 409 conflict for paused or retired chats; code agent_paused or agent_retired in the chat response.
- Validation messages from import (AgentMarkdownError).
- Tables user_agents (status), user_agent_access, scheduled_tasks.agent_id.
- Audit event types agent_ownership_transferred.

**Hands-on test plans**

- CLI: [70-qa/test-plans/cli/052-custom-assistant-builder.md](../../70-qa/test-plans/cli/052-custom-assistant-builder.md)
- No hands-on plan yet for Web, Desktop, Mobile: the ledger marks this area as not built there, so the plan builder made none. Use the scenarios above.

## 10. Gaps and dependencies

- **No duplicate or fork of an agent.** Affects: Web, Mobile, CLI, desktop. Evidence: No code found; brief S52.38. Work needed: Add a copy action over createAgent.
- **No deprecation notice or replacement link; status has no text field.** Affects: Recipients of retired or paused agents. Evidence: agents.ts:11; agent-turn-config.ts:33-41. Work needed: Add fields, show in refusal and list, test.
- **Export and import drop tool switches, connectors, limits, website rules, icon and starters; import defaults all tools on.** Affects: Anyone moving agents, including CLI to Web. Evidence: agent-markdown.ts:84-104, 159-171. Work needed: Carry or warn; default tools off when a file lists tools.
- **Import and export missing on VS Code and Chrome; CLI has no import command.** Affects: Those apps. Evidence: No code found. Work needed: Decide scope.
- **Permanent delete on CLI, desktop file and Web has no holding area.** Affects: All owners. Evidence: service:437-447; agents.rs:1147-1163; custom_agents.rs:284-304. Work needed: Review against AGENTS.md section 9 on agent-removed data; the confirmations name the loss, so only an undo window is missing.
- **Brief marks all items missing though Web and Mobile code exist.** Affects: Planning. Evidence: S52.38-S52.41. Work needed: Update the brief.
- Not built on: VS Code, Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:mobile
- surface:cli
- surface:desktop
- mode:cloud
- mode:local
- table:user_agents
- table:user_agent_versions
- table:user_agent_access
- table:user_agent_files
- table:web_conversations
- table:scheduled_tasks
- api:POST /api/custom-agents/import
- api:GET /api/custom-agents/[id]/export
- api:POST /api/custom-agents/[id]/transfer
- api:POST /api/custom-agents/[id]/status
- SYS-data-model-and-migrations
- SYS-authorization-and-workspaces
- SYS-files-artifacts-and-storage

## Unknown

- Where workspace audit events are stored.
- Whether a retired agent's files and versions are cleaned up by a job; none found.
- How the public Electron desktop shows import and export; Electron code not opened.
- Whether Claude Code agent files with extra keys such as tools should be mapped to switches; no product statement found.

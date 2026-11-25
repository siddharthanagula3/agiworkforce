---
id: "F061-02"
type: "feature"
title: "Create and manage agents"
aliases: ["Create and manage agents", "/agents create", "/agents set", "/agents rename", "/agents delete", "New agent", "Publish", "Versions", "Retire", "Transfer ownership", "Pause", "Import and Export agent", "S61.02", "S61.21", "S61.23", "S61.24", "S61.19"]
area: "61 Persistent agents and agent rosters"
available_on: ["web", "desktop", "mobile", "cli"]
implementation: {web: "built", desktop: "partial", mobile: "built", cli: "partial", vscode: "missing", chrome: "missing"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "not seen by a person", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S61.02", "S61.21", "S61.23", "S61.24"]
depends_on: ["surface:cli", "surface:web", "surface:mobile", "surface:desktop", "mode:local", "mode:cloud", "file:apps/cli/src/agents.rs", "file:apps/web/lib/services/custom-agent-service.ts", "api:POST /api/custom-agents", "api:PATCH /api/custom-agents/{id}", "api:POST /api/custom-agents/{id}/publish", "api:POST /api/custom-agents/{id}/status", "table:user_agents", "table:user_agent_versions", "SYS-model-catalog-and-routing", "SYS-data-model-and-migrations", "SYS-authorization-and-workspaces", "F061-01"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F061-02 Create and manage agents

Lets a person make, edit, rename, delete and retire agents. CLI: markdown files managed with /agents subcommands, no versioning. Web and mobile Cloud: editor with draft, publish, version restore, pause, retire, transfer and delete. Duplication of a person's own agent was not found anywhere.

Area: [61. Persistent agents and agent rosters](README.md). Requirement items: [S61.02](../../10-requirements/capabilities/061-persistent-agents-and-agent-rosters.md#s6102), [S61.21](../../10-requirements/capabilities/061-persistent-agents-and-agent-rosters.md#s6121), [S61.23](../../10-requirements/capabilities/061-persistent-agents-and-agent-rosters.md#s6123), [S61.24](../../10-requirements/capabilities/061-persistent-agents-and-agent-rosters.md#s6124).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| Desktop | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| Mobile | built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| CLI | partly built | partly built | not seen by a person |
| VS Code | not built | not built | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Creates an agent, changes its fields, renames, pauses, retires, transfers or deletes it. CLI agents are files on disk. Cloud agents are database rows with a draft, numbered published versions and sharing.

**Why it exists.** Agents are saved assets that a person tunes over time. The brief requires create (S61.02), versioned configuration (S61.21), duplication (S61.23) and retirement or transfer with history (S61.24) (doc: knowledge-base/data/area-briefs/061-persistent-agents-and-agent-rosters.md).

**Who uses it.** CLI developers who keep agent files; web and mobile Cloud users and workspace owners who build and share agents.

**Problems it solves**

- Starting an agent from a blank file or a plain-words description.
- Changing one field without hand-editing a file.
- Keeping earlier versions and restoring one on web and mobile.
- Taking an agent out of use without losing its history.
- Handing an agent to another workspace member.

**Use cases**

- Run /agents create reviewer to get a template file.
- Describe an agent in words at the interactive prompt and let the model draft it.
- On web, edit the draft, press Publish, share with the workspace, later Restore version 2.
- On mobile, retire an agent that is no longer needed and bring it back later.

## 2. User experience

**Where to find it**

- CLI: /agents create, set, rename, delete, validate, history (apps/cli/src/agents.rs:580-657; help text lines 857-872).
- Web: Agents page buttons 'New agent' and 'Import' (apps/web/features/agents/components/AgentsPage.tsx:179-190); editor at /chat/agents/<id> and /chat/agents/new (apps/web/app/chat/agents/new/page.tsx; apps/web/app/chat/agents/[id]/page.tsx).
- Web editor panels: Manage (Pause, Retire, Export as Claude Code agent, Transfer ownership, Delete agent), Publish, Sharing, Versions (apps/web/features/agents/components/AgentManagePanel.tsx; AgentPublishPanel.tsx).
- Mobile: Agents screen button 'New', 'Import from file'; editor sections Identity, Behaviour, Model and tools, Connectors and skills, Knowledge, Publish, Sharing, Activity, Manage (apps/mobile/src/features/agents/components/AgentConfigSections.tsx:229-373; AgentManageSections.tsx:136-613).
- Internal Tauri desktop: Settings > Agents > custom agents with edit and delete (apps/desktop/src/features/settings/CustomAgentsList.tsx:40-51).
- Chrome and VS Code: no agent management found.

**Before you start**

- CLI: a writable current directory for project agents, or the config directory for --global.
- Web and mobile: signed in; mobile also needs Cloud mode.
- Sharing needs the agent to be created in a workspace and published first (apps/web/lib/services/custom-agent-service.ts:561-580).
- Transfer needs the new owner to be a member of the same workspace (apps/web/lib/services/custom-agent-service.ts:602-618).

**Screens and controls**

- CLI create: /agents create <name> [--global] writes a template; /agents create <words describing the agent> asks the model to draft it (apps/cli/src/agents.rs:610-632, 686-716).
- CLI help line texts: 'Create new agent', 'Describe what this agent should do and when it should be used' (apps/cli/src/agents.rs:659, 672-684).
- CLI /agents set <name> <field> <value> with fields description, model, color, tools, disallowedTools, skills, maxTurns, maxBudgetUsd, permissionMode, prompt (apps/cli/src/agents.rs:1116-1127).
- CLI /agents delete <name> --yes; without --yes it warns (apps/cli/src/agents.rs:1147-1157).
- Web editor: Name, Description, Icon, Colour, 'What should this agent do, and how?', Output examples, conversation starters, Preferred model, Reasoning effort, toggles, 'Messages a day, per person', 'Credits a month, across everyone' (apps/web/features/agents/components/AgentConfigForm.tsx:370-634); buttons 'Create agent' and 'Save draft' (AgentEditorPage.tsx:312).
- Web Manage: Pause, Resume or Bring back, Retire, 'Export as Claude Code agent', 'Transfer ownership' select with Transfer button, Delete agent (AgentManagePanel.tsx:260-350).
- Web Publish: field 'What changed (optional)', buttons Publish or 'Publish changes'; versions list with 'Restore version N' (AgentPublishPanel.tsx:153-346).

**Journey**

1. CLI: run /agents create reviewer. The file reviewer.md is written with starter frontmatter (maxTurns 20, permissionMode default) (apps/cli/src/agents.rs:1076-1090).
2. Edit the file or run /agents set reviewer description "Reviews diffs".
3. Run /agents validate to check it.
4. Web: press New agent, fill Name and Instructions, press Create agent, edit later and press Save draft.
5. Web: press Publish with an optional note; a numbered version is stored. Restore an older version into the draft and publish again.
6. Web: Retire shows a confirmation naming the consequence; Delete shows a second confirmation that it cannot be recovered.

**What the person sees and gets**

- CLI create success: 'Created <scope> agent `name` at <path>' (apps/cli/src/agents.rs:622-626).
- CLI create refusal: '<path> already exists' and 'agent name must contain at least one letter or number' (apps/cli/src/agents.rs:1066-1081).
- CLI delete warning: 'This deletes <path> and cannot be undone. Run /agents delete <name> --yes to confirm.' (apps/cli/src/agents.rs:1152-1156).
- CLI set rejects a change that would leave the file unreadable and restores the original (apps/cli/src/agents.rs:1275-1286).
- Web retire dialog: 'Nobody can start a chat with it or run its routines ... you can bring it back from here at any time.' (AgentManagePanel.tsx:208-216).
- Web delete dialog says versions, files and sharing are deleted for everyone and cannot be recovered (AgentManagePanel.tsx:238-243).

**Settings**

- CLI scope flag --global or -g (apps/cli/src/agents.rs:552-557).
- Cloud visibility: private, people or workspace (packages/contracts/cloud-contracts/src/agents.ts:11).
- Cloud status: active, paused, retired (packages/contracts/cloud-contracts/src/agents.ts:10).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- CLI create template, set a field, rename, delete with --yes, validate, history (apps/cli/src/agents.rs:580-657, 1054-1240, 1349-1389).
- CLI model-drafted agent: the session's own model writes name, description and instructions as JSON; the result is saved and the person is told to read the file (apps/cli/src/agents.rs:718-745, 777-845).
- CLI only edits agents inside the project or global agents directory; others are refused (apps/cli/src/agents.rs:1129-1145).
- Cloud create, patch draft, delete (apps/web/lib/services/custom-agent-service.ts:339-447; apps/web/app/api/custom-agents/[id]/route.ts:58-60).
- Cloud publish creates version N+1 and refuses when nothing changed (custom-agent-service.ts:449-491).
- Cloud restore copies a published version into the draft (custom-agent-service.ts:533-551).
- Cloud pause, resume, retire through POST status; retired agents refuse edits (custom-agent-service.ts:333-337, 418-435).
- Cloud transfer through a database function; target must be a workspace member (custom-agent-service.ts:602-618; apps/web/db/neon/0370_user_agents.sql:287).
- Import and export of Claude Code style markdown agent files (apps/web/app/api/custom-agents/import/route.ts; apps/web/app/api/custom-agents/[id]/export/route.ts; apps/web/lib/agents/agent-markdown.ts).
- Mobile has the same actions through service.ts (apps/mobile/src/features/agents/service.ts:49-130).
- Internal Tauri desktop saves and deletes agent files the CLI reads (apps/desktop/src-tauri/src/sys/commands/custom_agents.rs:11-25, 260-284).

**Incomplete**

- CLI delete removes the file permanently with std::fs::remove_file; no Trash, no archive (apps/cli/src/agents.rs:1159). AGENTS.md section 9 requires removed files to go to Trash first.
- CLI /agents set cannot set mcpServers; the editable list has 10 fields without it (apps/cli/src/agents.rs:1116-1127) although the frontmatter parser reads mcpServers (line 1500).
- CLI rename keeps the file but the description or the history log still names the old agent; the history log matches by name (apps/cli/src/subagent_audit.rs:98-117) [inferred].
- Cloud delete is permanent for everyone, guarded by a confirmation dialog (AgentManagePanel.tsx:230-262).

**Present but disconnected or switched off**

- CLI --agent-id option is parsed into options.agent_id but no consumer was found (apps/cli/src/lib.rs:429-430; apps/cli/src/cli_options.rs:64, 180).

**Not available**

- Versioning in the CLI: none; files have no history (brief S61.21).
- Duplicate an agent: no duplicate action found for a person's own agent on web, mobile, CLI or Tauri desktop. The By AGI catalog copies a built-in starter into the person's list, which is a template, not duplication (packages/contracts/cloud-contracts/src/agent-catalog.ts:145-166).
- Retire or transfer in the CLI: none.
- Chrome and VS Code management: none found.

## 4. Required behaviour

**Established requirements**

- The user can create a persistent agent that is saved and appears in the roster. (source: S61.02)
- Changes to an agent's configuration are versioned and can be reviewed or restored. (source: S61.21)
- The user can duplicate an agent as a starting point. (source: S61.23)
- The user can retire an agent or transfer its ownership, keeping its history. (source: S61.24)
- The user can pause or disable an agent so it stops acting until re-enabled. (source: S61.19)
- An action a user cannot undo asks first and names the consequence; an agent never destroys user data on its own; removed files go to the OS Trash first. (source: AGENTS.md section 9)

**Acceptance criteria**

1. /agents create reviewer writes reviewer.md with maxTurns 20 and permissionMode default and prints its path.
2. Running create again for the same name fails with 'already exists'; a name of only symbols fails with the letters-or-numbers message.
3. /agents delete reviewer without --yes deletes nothing and prints the warning.
4. /agents set reviewer color teal fails and lists the 8 colours; the file is unchanged.
5. On web, Publish with no changes since the last version is refused with 'There are no changes to publish.'
6. On web, Restore version N puts that version's content into the draft and does not change published_version until Publish.
7. A retired agent cannot be edited until brought back, and Chat is disabled on it.
8. Transfer to a person outside the workspace fails with 'The agent can only move to another member of the workspace it belongs to.'

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- CLI delete should move the file to the Trash, to meet AGENTS.md section 9 [inferred].
- Duplicate should copy a person's own agent as a new draft with a new name [inferred from S61.23].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add /agents duplicate <name> [new-name] in the CLI and a Duplicate button on web and mobile.
- [proposed] Keep a git-style history for CLI agent files, or tell people to use their repository.
- [proposed] Add mcpServers to the settable CLI fields.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | CLI agent management | `apps/cli/src/agents.rs` | create, set, rename, delete, validate, history, draft (lines 580-1400). |
| service | CLI agent history | `apps/cli/src/subagent_audit.rs` | Writes and reads subagents.jsonl for /agents history. |
| command | /agents routing | `apps/cli/src/tui/tui_app.rs` | Routes create and drafting (RunAgentDraft) at lines 5476, 6131-6165, 7647. |
| service | custom-agent-service | `apps/web/lib/services/custom-agent-service.ts` | createAgent, updateAgentDraft, setAgentStatus, deleteAgent, publishAgent, restoreAgentVersion, shareAgent, transferAgent. |
| endpoint | POST /api/custom-agents | `apps/web/app/api/custom-agents/route.ts` | Create. |
| endpoint | GET PATCH DELETE /api/custom-agents/{id} | `apps/web/app/api/custom-agents/[id]/route.ts` | Read, update draft, delete. |
| endpoint | POST /api/custom-agents/{id}/status | `apps/web/app/api/custom-agents/[id]/status/route.ts` | Pause, resume, retire. |
| endpoint | POST /api/custom-agents/{id}/publish | `apps/web/app/api/custom-agents/[id]/publish/route.ts` | Publish a version. |
| endpoint | GET /api/custom-agents/{id}/versions | `apps/web/app/api/custom-agents/[id]/versions/route.ts` | List versions (route listed in the test folder; handler not opened). |
| endpoint | POST /api/custom-agents/{id}/restore | `apps/web/app/api/custom-agents/[id]/restore/route.ts` | Restore a version into the draft. |
| endpoint | POST /api/custom-agents/{id}/transfer | `apps/web/app/api/custom-agents/[id]/transfer/route.ts` | Transfer ownership. |
| endpoint | POST /api/custom-agents/import and GET /{id}/export | `apps/web/app/api/custom-agents/import/route.ts` | Markdown import and export (export route in [id]/export). |
| service | agent-markdown | `apps/web/lib/agents/agent-markdown.ts` | Converts Cloud agents to and from Claude Code agent markdown; maps colours. |
| schema | Agent request schemas | `packages/contracts/cloud-contracts/src/agents.ts` | Create, update, status, publish, restore, share, transfer request shapes and limits. |
| table | user_agent_versions | `apps/web/db/neon/0370_user_agents.sql` | Numbered published configs (line 95). |
| component | AgentEditorPage | `apps/web/features/agents/components/AgentEditorPage.tsx` | Web editor shell. |
| component | AgentManagePanel | `apps/web/features/agents/components/AgentManagePanel.tsx` | Pause, retire, transfer, delete, export. |
| component | AgentPublishPanel | `apps/web/features/agents/components/AgentPublishPanel.tsx` | Publish, share, versions. |
| screen | AgentEditorScreen | `apps/mobile/src/features/agents/AgentEditorScreen.tsx` | Mobile editor. |
| component | AgentManageSections | `apps/mobile/src/features/agents/components/AgentManageSections.tsx` | Mobile publish, restore, sharing, retire, transfer, delete. |
| command | custom_agents Tauri commands | `apps/desktop/src-tauri/src/sys/commands/custom_agents.rs` | Save and delete agent files for internal desktop. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| CLI create: slugify the name, create the directory, refuse if the file exists, write frontmatter and body. | device | apps/cli/src/agents.rs:1062-1090, 1092-1108 |
| CLI drafting: validates the session's privacy boundary, sends the description inside <agent_request> to the session's own model with a 90 second timeout, parses JSON, saves the file. | outside service | apps/cli/src/agents.rs:746-760, 777-845, 664-668 |
| CLI set and rename: read file, replace one frontmatter line, write, re-parse; roll back on failure. | device | apps/cli/src/agents.rs:1165-1286 |
| Web save: PATCH validates the model against the catalog and updates the draft columns, only for the owner and not when retired. | our servers | apps/web/lib/services/custom-agent-service.ts:180-188, 333-337, 386-416 |
| Web publish: inside one transaction, compares draft with last published, inserts the next version row, sets published_version. | our servers | apps/web/lib/services/custom-agent-service.ts:449-491 |
| Web write calls require a CSRF token and pass through the rate limiter. | our servers | apps/web/lib/agents/agent-route.ts:44-50 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| CLI agent file | agent directories on disk | No | Permanent delete via remove_file (apps/cli/src/agents.rs:1159) |
| Cloud draft in user_agents and published copies in user_agent_versions | Postgres | Yes across web and mobile through the API | Retire keeps; delete cascades (apps/web/db/neon/0370_user_agents.sql:95-130) [inferred from foreign keys not fully read] |

**Models and providers.** CLI drafting uses the session's current provider and model so a draft never leaves the session's privacy boundary (apps/cli/src/agents.rs:741-760). Cloud validates the stored model against the model catalog (apps/web/lib/services/custom-agent-service.ts:180-188). No provider is named in the feature itself.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | CLI file management: none required. Cloud: signed-in account; mobile also Cloud mode. |
| Permissions | Only the owner edits, publishes, shares, transfers or deletes (apps/web/lib/services/custom-agent-service.ts:321-331). A retired agent cannot be edited (line 333-337). CLI edits only files in the project or global agents directory (apps/cli/src/agents.rs:1129-1145). |
| Subscription | No plan check found in the Cloud agent management routes. CLI: none found in the code. |
| Limits and metering | Name 80, description 300, instructions 32,000, output examples 8,000 characters; up to 6 starters (packages/contracts/cloud-contracts/src/agents.ts:13-22). Versions list is capped at 200 (custom-agent-service.ts:497-505). |
| Feature flags | none found in the code. |
| Model compatibility | Cloud rejects a model that is not in the catalog with 'Pick a model from the list.' (custom-agent-service.ts:180-188). CLI stores any text; an unusable model is ignored at activation with a message. |
| Provider restrictions | none found in the code for management. |
| Local mode | CLI file management works fully offline and in Local mode; drafting from words needs the session's model, which in Local mode is the on-device route. Cloud agent management is Cloud only. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Create when file exists | Fails with '<path> already exists'. | apps/cli/src/agents.rs:1079-1081 |
| Draft model times out or returns bad JSON | Message 'Could not draft that agent: ...' plus the blank template command. | apps/cli/src/agents.rs:738-744, 810-843 |
| Drafted instructions too long | Refused above 12,000 characters. | apps/cli/src/agents.rs:665, 835-837 |
| Set would break the file | Change is rolled back with 'That change would leave the agent unreadable'. | apps/cli/src/agents.rs:1275-1286 |
| Agent from a plugin or Claude folder | Not edited by these commands: 'comes from <path>, which this command does not edit.' | apps/cli/src/agents.rs:1129-1145 |
| Publish race | A unique violation returns 'Another publish of this agent just finished. Try again.' | apps/web/lib/services/custom-agent-service.ts:474-483 |
| Share before publish or in a personal space | Refused with a plain message. | apps/web/lib/services/custom-agent-service.ts:569-578 |
| Busy action in the web Manage panel | All buttons are disabled while one runs; failures show a toast. | apps/web/features/agents/components/AgentManagePanel.tsx:192-206 |
| Offline or retry | not handled in the code beyond error toasts and Try again on the list. | apps/web/features/agents/components/AgentManagePanel.tsx:192-206 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/cli/src/agents.rs (inline tests from line 1700)`: Template creation with slug, description versus name routing, drafted agent keeps one line per frontmatter field, bad drafts refused, validation of duplicates and bad modes, deterministic ordering.
- `apps/web/lib/agents/__tests__/custom-agent-service.test.ts`: Cloud agent service (contents not opened).
- `apps/web/lib/agents/__tests__/agent-markdown.test.ts`: Markdown import and export (contents not opened).
- `apps/web/app/api/custom-agents/[id]/publish/route.test.ts`: Publish route (contents not opened); sibling tests exist for status, restore, transfer, share, versions, export, import.
- apps/web/db/neon/__tests__/user-agents-migration.test.ts (not found) (not found): Migration 0370 (location by listing; contents not opened).
- `apps/web/features/agents/__tests__/AgentEditorPage.test.tsx`: Web editor (contents not opened).
- `apps/mobile/src/features/agents/__tests__/service.test.ts`: Mobile agent service (contents not opened).
- `apps/desktop/src/stores/__tests__/customAgentsStore.test.ts`: Tauri custom agents store (contents not opened).

**Test scenarios**

- **CLI create, edit, delete**
  1. Run /agents create reviewer.
  2. Run /agents set reviewer color blue.
  3. Run /agents delete reviewer, then again with --yes.
  - Expected: File created; colour line updated; first delete only warns; second deletes the file permanently.
- **CLI drafting from words**
  1. In an interactive session run /agents create an agent that reviews pull requests for security problems.
  2. Open the saved file.
  - Expected: A file exists with a kebab-case name, a one sentence description and instructions; the output says to read the file before use.
- **Web publish and restore**
  1. Create an agent, press Publish.
  2. Change the instructions, publish again.
  3. Restore version 1, check the draft, publish.
  - Expected: Versions 1, 2 and 3 appear; the draft shows the version 1 text after restore; hasUnpublishedChanges is true until publish.
- **Retire and bring back**
  1. Retire an agent on web.
  2. Try Chat and Edit.
  3. Press Bring back.
  - Expected: Chat disabled and edits refused while retired; both work again after Bring back.
- **Transfer**
  1. In a workspace, owner transfers an agent to a member.
  2. Open as the new owner.
  - Expected: The new owner sees Edit and Manage; the former owner keeps only the access sharing gives.

**Where to look when it fails**

- CLI: /agents validate output lines; /agents history <name> reads ~/.agiworkforce subagents.jsonl (apps/cli/src/subagent_audit.rs:120-122).
- Web error text: 'Only the agent's owner can change it.', 'This agent is retired. Bring it back before changing it.' (custom-agent-service.ts:326-336).
- Tables: user_agents, user_agent_versions, user_agent_access.

**Hands-on test plans**

- Mobile: [70-qa/test-plans/mobile/061-persistent-agents-and-agent-rosters.md](../../70-qa/test-plans/mobile/061-persistent-agents-and-agent-rosters.md)
- CLI: [70-qa/test-plans/cli/061-persistent-agents-and-agent-rosters.md](../../70-qa/test-plans/cli/061-persistent-agents-and-agent-rosters.md)
- No hands-on plan yet for Web, Desktop: the ledger marks this area as not built there, so the plan builder made none. Use the scenarios above.

## 10. Gaps and dependencies

- **No duplicate action for a person's own agent.** Affects: CLI, web, mobile, desktop users.. Evidence: No match in apps/web/features/agents, apps/mobile/src/features/agents or apps/cli/src/agents.rs for duplicate or clone. Work needed: Add duplicate for CLI files and Cloud rows.
- **CLI delete bypasses the Trash.** Affects: CLI users.. Evidence: apps/cli/src/agents.rs:1159; AGENTS.md section 9. Work needed: Move to the OS Trash through the shared helper before removal.
- **CLI agents have no versioning, retirement or transfer.** Affects: CLI users.. Evidence: brief S61.21, S61.24; no such subcommand in MANAGEMENT_SUBCOMMANDS (apps/cli/src/agents.rs:564-568). Work needed: Decide whether git history is enough or add archive and restore.
- **--agent-id is accepted but unused.** Affects: CLI scripts that pass it.. Evidence: apps/cli/src/lib.rs:429-430; no reader in apps/cli/src. Work needed: Connect it to a thread binding or remove it.
- **Brief marks web, desktop, mobile management as missing; code has it.** Affects: Documentation.. Evidence: apps/web/lib/services/custom-agent-service.ts; apps/mobile/src/features/agents/service.ts. Work needed: Update brief; verify in running apps.
- **No management in Chrome or VS Code.** Affects: Those users.. Evidence: No agent management code found in apps/extension/src or apps/extension-vscode/src. Work needed: Decide scope.
- Not built on: VS Code, Chrome (from the capability ledger).

**Depends on**

- surface:cli
- surface:web
- surface:mobile
- surface:desktop
- mode:local
- mode:cloud
- file:apps/cli/src/agents.rs
- file:apps/web/lib/services/custom-agent-service.ts
- api:POST /api/custom-agents
- api:PATCH /api/custom-agents/{id}
- api:POST /api/custom-agents/{id}/publish
- api:POST /api/custom-agents/{id}/status
- table:user_agents
- table:user_agent_versions
- SYS-model-catalog-and-routing
- SYS-data-model-and-migrations
- SYS-authorization-and-workspaces
- F061-01

## Unknown

- Handler of GET /api/custom-agents/{id}/versions and share routes were not opened; only their folders and test files were listed.
- Whether database cascades on delete match the dialog text; foreign keys beyond line 144 of 0370_user_agents.sql were not fully read.
- Whether the Tauri desktop editor is reachable in any shipped build.
- What the contents of the listed tests assert.

---
id: "F061-01"
type: "feature"
title: "Agent roster and identity"
aliases: ["Agent roster", "Agents list", "Agent picker", "/agents", "Your agents", "Shared with you", "Custom agents", "Subagents (CLI /subagents)", "Agent identity (name, colour, icon)", "S61.01", "S61.03", "S61.04"]
area: "61 Persistent agents and agent rosters"
available_on: ["web", "desktop", "mobile", "cli"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "built", vscode: "missing", chrome: "missing"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "not seen by a person", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S61.01", "S61.03", "S61.04"]
depends_on: ["surface:cli", "surface:web", "surface:mobile", "surface:desktop", "mode:local", "mode:cloud", "file:apps/cli/src/agents.rs", "file:apps/cli/src/tui/widgets/agent_picker.rs", "file:apps/web/lib/services/custom-agent-service.ts", "file:packages/contracts/cloud-contracts/src/agents.ts", "api:GET /api/custom-agents", "table:user_agents", "SYS-authentication-and-identity", "SYS-api-and-contracts", "SYS-shared-ui-and-design", "F061-02"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F061-01 Agent roster and identity

Shows every saved agent by name, role description and look. In the CLI it is a file-based list and a picker overlay (name drawn in one of 8 colours). On web and mobile Cloud it is a server-backed Agents page with an icon and accent colour. The brief calls web and mobile missing; the code contradicts that.

Area: [61. Persistent agents and agent rosters](README.md). Requirement items: [S61.01](../../10-requirements/capabilities/061-persistent-agents-and-agent-rosters.md#s6101), [S61.03](../../10-requirements/capabilities/061-persistent-agents-and-agent-rosters.md#s6103), [S61.04](../../10-requirements/capabilities/061-persistent-agents-and-agent-rosters.md#s6104).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| Desktop | built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| Mobile | built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| CLI | built | built | not seen by a person |
| VS Code | not built | not built | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Lists the agents a person can use, each with a name, a one-line role (description) and a visual identity, and lets them read the full definition. Two separate systems exist. CLI agents are markdown files found on disk. Cloud agents are database rows listed by the web Agents page and the mobile Agents screen.

**Why it exists.** So a person can see what specialist assistants they have and pick one without remembering file names or ids. The brief item S61.01 requires a roster by name, S61.03 a name and avatar, S61.04 a role description the user can write and read back (doc: knowledge-base/data/area-briefs/061-persistent-agents-and-agent-rosters.md).

**Who uses it.** CLI users who keep reusable agent files per project or per machine; web and mobile Cloud users who build or receive shared agents; workspace members who see agents shared with them.

**Problems it solves**

- Finding the right agent among many without opening files.
- Telling agents apart at a glance by colour or icon.
- Seeing which agents are mine and which were shared with me.
- Reading an agent's full definition before using it.

**Use cases**

- In the CLI, type /agents, filter the overlay by typing a word after pressing /, then Enter to switch the session to that agent.
- In the CLI, run /agents show reviewer to print the full definition and the file path.
- On the web Agents page, open Your agents and press Chat on an agent.
- On mobile in Cloud mode, open Agents from Customize and use the All, Yours, By AGI and Shared segments.

## 2. User experience

**Where to find it**

- CLI: slash command /agents (alias /agent) opens the picker overlay titled 'Agents' (apps/cli/src/repl/slash_commands.rs:71; apps/cli/src/tui/tui_app.rs:6137; apps/cli/src/tui/widgets/agent_picker.rs:28).
- CLI text forms: /agents list, /agents show <name>, /agents path <name> (apps/cli/src/agents.rs:580-640).
- Web: route /chat/agents, nav item id 'agents' (apps/web/shared/components/layout/app-nav-items.ts:171-176; apps/web/app/chat/agents/page.tsx). Page heading 'Agents' (apps/web/features/agents/components/AgentsPage.tsx:162).
- Mobile: route /(app)/agents, reached from the Customize screen card titled 'Agents' (apps/mobile/src/features/customize/CustomizeScreen.tsx:65-68; apps/mobile/app/(app)/agents/index.tsx).
- Public Desktop (Electron) shows the hosted web app, so it reaches the same web page (doc: AGENTS.md section 5) [inferred for this page].
- Internal Tauri desktop: Settings > Agents shows a custom agents list with empty text 'No custom agents yet' (apps/desktop/src/features/settings/CustomAgentsList.tsx:145; apps/desktop/src/features/settings/AgentsSettings.tsx).
- VS Code and Chrome extension: no roster found (grep of apps/extension-vscode/src and apps/extension/src found only subagent task display and a marketplace count in VS Code).

**Before you start**

- CLI: none beyond the agent files existing; project agents load only when the workspace is trusted to supply configuration (apps/cli/src/agents.rs:270-274).
- Web: signed in; the list call runs under the user's scoped database (apps/web/lib/agents/agent-route.ts:35-40).
- Mobile: signed in and the app in Cloud mode (apps/mobile/src/shared/hooks/useCloudFeatureAccess.ts:35-40).

**Screens and controls**

- CLI picker: title 'Agents', search box with placeholder 'type to filter agents...' (focus it by pressing /), list rows with name, description and [scope], a detail line with model, tools, max_turns and skills (apps/cli/src/tui/widgets/agent_picker.rs:28-33, 304-350, 386).
- CLI picker empty text: 'No agents found. Create one with: /agents create <name>'; no match text 'No agents match filter.'; missing description shows '(no description)' (apps/cli/src/tui/widgets/agent_picker.rs:30-32).
- Keys: Up and Down move, Enter activates, Esc closes (apps/cli/src/tui/widgets/agent_picker.rs:374-415).
- Web page: buttons Import and New agent; sections 'Your agents' and 'Shared with you'; each row has the icon avatar, name, description, a state label, Edit (owners only) and Chat (apps/web/features/agents/components/AgentsPage.tsx:25-66, 150-236).
- Web empty state: 'No agents yet' with button 'Create an agent'; loading state labelled 'Loading agents'; error with 'Try again' (apps/web/features/agents/components/AgentsPage.tsx:193-216).
- Mobile: segments All, Yours, By AGI, Shared; sections Your agents, Shared with you, Retired; New button, Import from file, row button Chat; empty title 'No agents here yet' (apps/mobile/src/features/agents/AgentsScreen.tsx:60-102, 506-591).

**Journey**

1. CLI: type /agents. The picker loads agents from disk (apps/cli/src/tui/widgets/agent_picker.rs:57-64).
2. Optionally press / and type part of a name or description; the list filters on both (apps/cli/src/tui/widgets/agent_picker.rs:83-103).
3. Move with the arrow keys and press Enter; the session switches to that agent and the chat says 'Agent `name` activated' (apps/cli/src/tui/tui_app.rs:5011-5026).
4. Web: open Agents in the nav, read the list, press Chat on a row; a new conversation tied to the agent opens (apps/web/app/api/custom-agents/[id]/conversations/route.ts:13-24).
5. Mobile: open Customize, then Agents, pick a segment and press Chat.

**What the person sees and gets**

- CLI /agents list prints a table with name, color, scope, model and description (apps/cli/src/agents.rs:874-911).
- CLI /agents show prints scope, path, description, model, color, max_turns, spend cap, permission_mode, skills, tools and the prompt body (apps/cli/src/agents.rs:913-956).
- If the file was removed after the picker opened, the chat says 'The selected agent at <path> is no longer available.' (apps/cli/src/tui/tui_app.rs:5028-5034).
- Web row state label: Paused, Retired, Shared by <name>, Shared with you, Draft, Only you, Shared with workspace, Shared with people, optionally with ' · Unpublished changes' (packages/contracts/cloud-contracts/src/agent-drafts.ts:50-65).

**Settings**

- CLI agent directories: ~/.agiworkforce/agents, ~/.claude/agents, project .agiworkforce/agents and .claude/agents (apps/cli/src/agents.rs:244-269).
- CLI colour field: one of red, blue, green, yellow, purple, orange, pink, cyan (apps/cli/src/agents.rs:19-21).
- Web and mobile: icon and accent colour chosen in the editor, each as a lowercase identifier (packages/contracts/cloud-contracts/src/agents.ts:34-35, 82-83).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- CLI roster: discovery from user and project directories, user definition wins on a name clash, project agents only in a trusted workspace (apps/cli/src/agents.rs:258-352).
- CLI picker overlay with filter on name and description, keyboard navigation, empty states and scope tag (apps/cli/src/tui/widgets/agent_picker.rs:28-33, 83-103, 228-300, 374-415).
- CLI name drawn in the agent colour on non-highlighted rows through ui_agent (apps/cli/src/tui/widgets/agent_picker.rs:285-297; apps/cli/src/tui/terminal_palette.rs:214).
- CLI scope labels are three values: global, claude-global and project (apps/cli/src/agents.rs:1296-1313). The brief and draft name only project and global.
- CLI /agents show and /agents path print the definition and file path (apps/cli/src/agents.rs:588-607).
- Web Agents page lists owned and shared Cloud agents with icon, accent colour, name, description and state label (apps/web/features/agents/components/AgentsPage.tsx:25-66; apps/web/lib/services/custom-agent-service.ts:281-297).
- Cloud list API GET /api/custom-agents returns up to 500 agents, own first, retired last (apps/web/lib/services/custom-agent-service.ts:281-297; apps/web/app/api/custom-agents/route.ts:20-29).
- Mobile Agents screen lists the same agents with segments and a built-in By AGI group of six starter agents (apps/mobile/src/features/agents/AgentsScreen.tsx:60-102; packages/contracts/cloud-contracts/src/agent-catalog.ts:19-122).
- Internal Tauri desktop lists, saves and deletes file-based agents through Tauri commands list_custom_agents, save_custom_agent, delete_custom_agent (apps/desktop/src-tauri/src/lib.rs:1219-1221; apps/desktop/src/stores/customAgentsStore.ts:24-62).

**Incomplete**

- CLI 'avatar' is a colour on the name, not an image; there is no picture avatar (apps/cli/src/agents.rs:42-46).
- CLI highlighted picker row is drawn in the accent style, so the agent colour is not visible on the selected row (apps/cli/src/tui/widgets/agent_picker.rs:268-283).
- CLI /agents list prints the colour as a word, not in colour (apps/cli/src/agents.rs:874-911).
- A colour outside the 8 allowed is silently treated as none in lists and reported only by /agents validate (apps/cli/src/agents.rs:42-46, 958-1010).
- Roster has no presence indicator (working, idle, offline) for saved agents; the CLI /team command shows teammate states only inside a team (apps/cli/src/teams.rs:817-870).

**Present but disconnected or switched off**

- format_agent_list (a second list formatter with [project] or [global] tags) is exported but the slash command renders through format_agents_overview; no caller outside its own tests was found in the files read (apps/cli/src/agents.rs:1590-1650) [inferred from the grep of agents.rs callers].
- Internal Tauri desktop agent UI does not reach the public Electron window (doc: AGENTS.md section 5).

**Not available**

- Chrome extension: no agent roster found.
- VS Code extension: no agent roster found; only a read-only subagent task group and a marketplace Agents count (apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:560; apps/extension-vscode/src/features/surfaces/accountMarketplace.ts:125).
- Cloud agents on the CLI: the CLI does not list Cloud agents; the only bridge found is markdown import and export on web and mobile (apps/web/app/api/custom-agents/import/route.ts; apps/web/app/api/custom-agents/[id]/export/route.ts).
- Brief says web, desktop and mobile are missing; code contradicts it for web and mobile (apps/web/app/chat/agents/page.tsx; apps/mobile/app/(app)/agents/index.tsx). Code outranks the brief (doc: AGENTS.md section 2).

## 4. Required behaviour

**Established requirements**

- The user sees a roster of persistent agents, each listed by name. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S61.01)
- Each agent has a user-set name and an avatar shown wherever it appears. (source: S61.03)
- Each agent carries a role description the user can write and read back. (source: S61.04)
- Only 8 colours are allowed on CLI agents and the picker prints exact empty-state sentences. (source: apps/cli/src/agents.rs:19-21; apps/cli/src/tui/widgets/agent_picker.rs:30-32)
- Agent behaviour must match the leaders and one design system (doc: AGENTS.md section 10). (source: AGENTS.md section 10)

**Acceptance criteria**

1. In the CLI, /agents with no argument opens an overlay titled Agents listing every discovered agent with its [scope] tag.
2. With no agent files, the overlay shows 'No agents found. Create one with: /agents create <name>'.
3. After pressing / and typing text that matches nothing, the overlay shows 'No agents match filter.'
4. An agent whose file has no description shows '(no description)'.
5. An agent with color: green shows its name in green on a non-selected row; an invalid colour shows no colour.
6. Enter on a row whose file was deleted shows 'The selected agent at <path> is no longer available.'
7. On the web Agents page, an owner sees Edit and Chat on their agents; a shared agent shows Chat only; a paused or retired agent has Chat disabled.
8. On mobile in Local or BYOK mode the Agents screen asks the person to continue to Cloud instead of listing agents [inferred from the access hook].

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The roster should list CLI and Cloud agents in one place or say clearly which system a list shows [inferred].
- The CLI picker should keep the agent colour visible on the selected row [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add a roster to Chrome and VS Code that reads Cloud agents, with Cloud mode and sign-in.
- [proposed] Show a coloured marker in the CLI list output when colour is set.
- [proposed] Unify scope labels in docs: global, claude-global, project.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | agents module | `apps/cli/src/agents.rs` | Agent definition struct, discovery, frontmatter parser, /agents text commands, formatting. |
| component | AgentPickerState and render | `apps/cli/src/tui/widgets/agent_picker.rs` | Picker overlay, filter, keys, empty states, scope tag, detail line. |
| command | /agents handler | `apps/cli/src/tui/tui_app.rs` | Opens picker, routes management subcommands, quick-invoke by name, handles picker selection (lines 4997-5040, 6131-6165). |
| command | slash command parse | `apps/cli/src/repl/slash_commands.rs` | Maps /agents and /agent to activation or management output (line 71). |
| config | agent colour palette | `apps/cli/src/tui/terminal_palette.rs` | ui_agent maps the 8 colour names to terminal colours (line 214). |
| component | AgentsPage | `apps/web/features/agents/components/AgentsPage.tsx` | Web roster page with Your agents and Shared with you sections. |
| component | AgentAvatar | `apps/web/features/agents/components/AgentAvatar.tsx` | Draws icon on accent colour for web. |
| endpoint | GET and POST /api/custom-agents | `apps/web/app/api/custom-agents/route.ts` | Lists and creates Cloud agents. |
| service | custom-agent-service | `apps/web/lib/services/custom-agent-service.ts` | Row to API shape, list query, viewer-specific published config. |
| table | user_agents | `apps/web/db/neon/0370_user_agents.sql` | Stores Cloud agents (table at line 44). |
| schema | ManagedCloudAgentSchema and AgentConfigSchema | `packages/contracts/cloud-contracts/src/agents.ts` | Shared shape of an agent, name 80 chars, description 300 chars, icon and accent identifiers. |
| service | agentStateLabel | `packages/contracts/cloud-contracts/src/agent-drafts.ts` | State text shown on rows. |
| screen | AgentsScreen | `apps/mobile/src/features/agents/AgentsScreen.tsx` | Mobile roster with segments, import, chat. |
| service | mobile agents service | `apps/mobile/src/features/agents/service.ts` | HTTP calls to /api/custom-agents. |
| hook | useCloudFeatureAccess | `apps/mobile/src/shared/hooks/useCloudFeatureAccess.ts` | Requires sign-in and Cloud app mode. |
| config | built-in agent catalog | `packages/contracts/cloud-contracts/src/agent-catalog.ts` | Six By AGI starter agents copied into a person's own list. |
| screen | CustomAgentsList (Tauri) | `apps/desktop/src/features/settings/CustomAgentsList.tsx` | Internal desktop list of file-based agents. |
| command | custom_agents commands | `apps/desktop/src-tauri/src/sys/commands/custom_agents.rs` | list_custom_agents, save_custom_agent, delete_custom_agent. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| CLI: the picker calls discover_agents, which reads markdown files from user and trusted project directories and installed plugin paths. | device | apps/cli/src/agents.rs:258-352; apps/cli/src/tui/widgets/agent_picker.rs:57-64 |
| CLI: typing filters the in-memory list by lower-cased name and description. | device | apps/cli/src/tui/widgets/agent_picker.rs:83-103 |
| Web: the Agents page calls GET /api/custom-agents with a rate limit and a user-scoped database connection; rows join the published version. | our servers | apps/web/app/api/custom-agents/route.ts:20-29; apps/web/lib/agents/agent-route.ts:35-40; apps/web/lib/services/custom-agent-service.ts:281-297 |
| Web: a non-owner sees the last published config of an agent, never the owner's draft. | our servers | apps/web/lib/services/custom-agent-service.ts:146-149 |
| Mobile: the screen calls the same API through the shared api client once the app is in Cloud mode and signed in. | device and our servers | apps/mobile/src/features/agents/service.ts:39-42; apps/mobile/src/shared/hooks/useCloudFeatureAccess.ts:35-40 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| CLI agent definition (markdown file with frontmatter and body) | ~/.agiworkforce/agents, ~/.claude/agents, project .agiworkforce/agents or .claude/agents | No sync found; plain files on the device | Kept until the person deletes the file; CLI delete is permanent (apps/cli/src/agents.rs:1147-1163) |
| Cloud agent row, versions, access, files | Postgres tables user_agents, user_agent_versions, user_agent_access, user_agent_files | Server is the source of truth; web and mobile read it | Retire keeps everything; delete removes the agent and its versions and files (apps/web/features/agents/components/AgentManagePanel.tsx:223-240) |

**Models and providers.** Listing and viewing involve no model call. Model choice appears only as a stored field (model) on a definition. Provider routing is not part of this feature (see SYS-model-catalog-and-routing).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | CLI file roster: no account required by the agents code (none found in the code). Web and mobile Cloud roster: signed-in account, user-scoped database (apps/web/lib/agents/agent-route.ts:35-40). |
| Permissions | Owner sees and edits drafts; other members see only the published version of shared agents (apps/web/lib/services/custom-agent-service.ts:146-149). CLI project agents load only when the workspace allows repository configuration (apps/cli/src/agents.rs:270-274). |
| Subscription | No plan check found in the Cloud agent routes (apps/web/app/api/custom-agents/route.ts). CLI roster: none found in the code. |
| Limits and metering | List limited to 500 rows (apps/web/lib/services/custom-agent-service.ts:292). Requests are rate limited under the chat-conversation bucket (apps/web/lib/agents/agent-route.ts:35-37). The model-facing CLI catalog lists at most 200 agents and about 18 KB (apps/cli/src/agents.rs:500-535). |
| Feature flags | none found in the code for the roster itself. |
| Model compatibility | Roster is model independent. A definition may name a model that the catalog no longer has; the CLI prints 'model override ignored' at activation (apps/cli/src/agents.rs:98-110). |
| Provider restrictions | none found in the code for listing. |
| Local mode | CLI: the roster reads local files and works offline and in Local mode. Mobile: Cloud agents need Cloud mode, so in Local mode the Agents screen is gated (apps/mobile/src/shared/hooks/useCloudFeatureAccess.ts:35-40). Local inference does not need a paid plan for the CLI file roster. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Empty roster (CLI) | Picker shows the exact empty sentence; /agents list prints 'none discovered' with the two directories. | apps/cli/src/tui/widgets/agent_picker.rs:30; apps/cli/src/agents.rs:874-885 |
| Filter with no hit (CLI) | Shows 'No agents match filter.' and Enter does nothing. | apps/cli/src/tui/widgets/agent_picker.rs:31, 397-407 |
| Same name in user and project | The user's agent wins; the project one is ignored and a warning is logged. | apps/cli/src/agents.rs:331-352 |
| File removed before Enter (CLI) | Chat message says the agent is no longer available. | apps/cli/src/tui/tui_app.rs:5028-5034 |
| Loading (web) | Skeleton rows with role=status label 'Loading agents'. | apps/web/features/agents/components/AgentsPage.tsx:193-197 |
| Error (web) | Alert text and a 'Try again' button. | apps/web/features/agents/components/AgentsPage.tsx:198-208 |
| Paused or retired agent | Chat button disabled; label Paused or Retired. | apps/web/features/agents/lib/agent-display.ts:10-12; packages/contracts/cloud-contracts/src/agent-drafts.ts:50-56 |
| Offline | not handled in the code for the CLI roster (it is local). Web and mobile offline handling for this list: not checked beyond the error state. | apps/web/features/agents/components/AgentsPage.tsx:198-208 |
| Accessibility | Web rows carry aria-labels 'Edit <name>' and 'Chat with <name>'; the CLI picker sanitizes terminal text in names and descriptions. | apps/web/features/agents/components/AgentsPage.tsx:46-56; apps/cli/src/tui/widgets/agent_picker.rs:262-266 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/cli/src/agents.rs (inline tests from line 1700)`: Management verbs routing, list and detail formatting, frontmatter parsing, discovery, untrusted project supplies no agents, user agent beats project namesake, scope label, selected path resolves to that file.
- `apps/cli/src/tui/widgets/agent_picker.rs (inline tests from line 434)`: Picker default hidden, filter by name and description, cursor navigation and clamping, empty states, overlay chrome, Esc closes, Enter invokes the selected file, typing in search.
- `apps/web/features/agents/__tests__/AgentsPage.test.tsx`: Web Agents page (contents not opened; name only).
- `apps/web/app/api/custom-agents/route.test.ts`: List and create route (contents not opened).
- `apps/mobile/src/features/agents/__tests__/AgentsScreens.test.tsx`: Mobile Agents screens (contents not opened).
- `packages/contracts/cloud-contracts/src/__tests__/agent-catalog.test.ts`: Built-in agent catalog (contents not opened).
- `apps/web/e2e/agents-pages.spec.ts`: Browser spec for the agents pages (contents not opened).

**Test scenarios**

- **CLI picker with three agents**
  1. Create three agent files with different colours in ~/.agiworkforce/agents.
  2. Start agi and type /agents.
  3. Press / and type part of one name.
  4. Press Enter.
  - Expected: List shows three rows with scope tags; filter narrows to the match; Enter prints 'Agent `name` activated'.
- **CLI empty roster**
  1. Use a clean home with no agent files and a trusted project without agents.
  2. Type /agents.
  - Expected: Overlay shows 'No agents found. Create one with: /agents create <name>'.
- **Name clash**
  1. Put an agent named reviewer in the global folder and another named reviewer in the trusted project.
  2. Run /agents list.
  - Expected: Only the global reviewer appears.
- **Web roster as owner and as member**
  1. Sign in as an owner with one agent and a second user with a shared published agent.
  2. Open /chat/agents for each.
  - Expected: Owner sees it under Your agents with Edit and Chat; the member sees it under Shared with you with Chat only and the 'Shared by <name>' label.
- **Mobile in Local mode**
  1. Open the mobile app in Local mode.
  2. Go to Customize then Agents.
  - Expected: A prompt to continue to Cloud appears instead of the list [inferred from the gate].

**Where to look when it fails**

- CLI: run /agents validate to list duplicate names, bad colours and unknown permission modes (apps/cli/src/agents.rs:958-1037).
- CLI: tracing warning 'ignoring project agent that collides with your own agent' (apps/cli/src/agents.rs:337-342).
- Web: error names agent_unavailable and not found come from createError.notFound in agent-route.ts (apps/web/lib/agents/agent-route.ts:22-26).
- Tables to inspect: user_agents, user_agent_versions.

**Hands-on test plans**

- Mobile: [70-qa/test-plans/mobile/061-persistent-agents-and-agent-rosters.md](../../70-qa/test-plans/mobile/061-persistent-agents-and-agent-rosters.md)
- CLI: [70-qa/test-plans/cli/061-persistent-agents-and-agent-rosters.md](../../70-qa/test-plans/cli/061-persistent-agents-and-agent-rosters.md)
- No hands-on plan yet for Web, Desktop: the ledger marks this area as not built there, so the plan builder made none. Use the scenarios above.

## 10. Gaps and dependencies

- **Brief says web, desktop and mobile have no roster; code has one on web and mobile.** Affects: Documentation accuracy for all six apps.. Evidence: apps/web/app/chat/agents/page.tsx; apps/mobile/app/(app)/agents/index.tsx; brief S61.01. Work needed: Correct the brief statuses; verify the pages in a running build.
- **No roster in the Chrome extension or VS Code extension.** Affects: Chrome and VS Code users.. Evidence: grep of apps/extension/src and apps/extension-vscode/src found no agent list. Work needed: Design and build a Cloud-agent list on both surfaces.
- **CLI and Cloud agents are separate lists with no shared view.** Affects: People who use both CLI and web.. Evidence: apps/cli/src/agents.rs (files only); apps/web/lib/services/custom-agent-service.ts (database only). Work needed: Decide whether CLI should read Cloud agents; keep trust boundaries (AGENTS.md section 6).
- **No presence indicator for saved agents (S61.11).** Affects: All apps.. Evidence: brief S61.11; no presence field in AgentDefinition or ManagedCloudAgentSchema. Work needed: Define presence from running chats, routines or runs.
- **Selected CLI row hides the agent colour; no picture avatar in CLI.** Affects: CLI users.. Evidence: apps/cli/src/tui/widgets/agent_picker.rs:268-283. Work needed: Keep the colour marker on the selected row.
- Not built on: VS Code, Chrome (from the capability ledger).

**Depends on**

- surface:cli
- surface:web
- surface:mobile
- surface:desktop
- mode:local
- mode:cloud
- file:apps/cli/src/agents.rs
- file:apps/cli/src/tui/widgets/agent_picker.rs
- file:apps/web/lib/services/custom-agent-service.ts
- file:packages/contracts/cloud-contracts/src/agents.ts
- api:GET /api/custom-agents
- table:user_agents
- SYS-authentication-and-identity
- SYS-api-and-contracts
- SYS-shared-ui-and-design
- F061-02

## Unknown

- Whether the public Electron Desktop navigates to /chat/agents; only AGENTS.md section 5 supports it and no Electron file was opened.
- Contents of the web and mobile agent tests and the agents-pages e2e spec; none were read.
- Whether any owner-less or org-less personal agent list differs on mobile beyond the segments seen.
- Whether format_agent_list has any live caller outside tests.

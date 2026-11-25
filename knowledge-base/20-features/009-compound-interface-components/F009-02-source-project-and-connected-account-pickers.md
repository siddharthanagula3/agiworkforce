---
id: "F009-02"
type: "feature"
title: "Source, project and connected-account pickers"
aliases: ["Source picker", "Sources for this run", "Add a source", "Project picker", "Project or folder", "Project selector bar (mobile)", "Connected-account picker", "Connected account rows", "S9.03", "S9.04", "S9.06"]
area: "9 Compound interface components"
available_on: ["web", "desktop", "mobile", "cli", "vscode", "chrome"]
implementation: {web: "partial", desktop: "partial", mobile: "partial", cli: "partial", vscode: "partial", chrome: "partial"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S9.03", "S9.04", "S9.06"]
depends_on: ["SYS-connectors-plugins-and-skills", "SYS-memory-projects-and-context", "SYS-chat-turn-pipeline", "SYS-authentication-and-identity", "SYS-subscriptions-entitlements-and-usage", "surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:vscode", "surface:chrome", "api:GET /api/connectors/{connectorId}/accounts", "table:connector_oauth_grants", "store:agiWorkforce.activeCloudProject"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F009-02 Source, project and connected-account pickers

Lets a person narrow what an answer may use and where it runs. Web research offers a source chooser at plan approval; each app has a way to pick a project; connectors show their linked accounts. In the code the account list is display only, so no account can be picked yet.

Area: [9. Compound interface components](README.md). Requirement items: [S9.03](../../10-requirements/capabilities/009-compound-interface-components.md#s903), [S9.04](../../10-requirements/capabilities/009-compound-interface-components.md#s904), [S9.06](../../10-requirements/capabilities/009-compound-interface-components.md#s906).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built | partly built | not seen by a person |
| Desktop | partly built | partly built | not seen by a person |
| Mobile | partly built | partly built | not seen by a person |
| CLI | partly built | partly built | not seen by a person |
| VS Code | partly built | partly built | not seen by a person |
| Chrome | partly built | partly built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Source picker: during a deep research run on Web (and Desktop, which shows the web app), the person can add sites to include, sites to exclude, their files, or a connected app, as chips under 'Sources for this run'. Project picker: sets the project a chat runs in. Connected-account list: shows the accounts linked to a connector.

**Why it exists.** People want answers drawn only from chosen places, chats filed in the right project, and clarity on which account a connector uses (brief S9.03, S9.04, S9.06).

**Who uses it.** Paid users of research and AGI Work on Web/Desktop; project users on all six apps; connector users on Web and Mobile.

**Problems it solves**

- Research that wanders over the whole web when the user wants two sites.
- Chats landing in no project, losing instructions and knowledge files.
- Not knowing which account a connector is linked to.

**Use cases**

- At research plan approval add 'Only this site' nature.com and 'My files', then start the run.
- On Web click 'Project or folder' in the work bar and choose a project.
- On Mobile tap 'No project' above the chat and pick a project; an existing chat moves into it.
- In VS Code pick a project in the Projects view to apply its instructions to turns in this workspace.

## 2. User experience

**Where to find it**

- Web/Desktop source picker: inside the research activity row when it awaits approval (apps/web/features/chat/components/research/ResearchActivity.tsx:459, :690-691).
- Web/Desktop project picker: work bar button labelled 'Project' or 'Project or folder' in AGI Work mode, menu titled 'Project or folder' (apps/web/features/chat/components/Composer/ChatComposerNew.tsx:7043-7165).
- Mobile: pill 'No project' or 'Active project: <name>' above the chat (apps/mobile/src/features/chat/components/ProjectSelectorBar.tsx:224).
- CLI: commands 'agi projects list/show/link', and -C/--repo for the folder (apps/cli/src/lib.rs:1287, :3821, :421).
- VS Code: Projects tree and the project detail quick pick; applying a project stores it for this workspace (apps/extension-vscode/src/features/projects/projectActions.ts:380).
- Chrome: project chip #sp-project-chip in the side panel (apps/extension/src/side_panel.ts:2051).
- Connected account: connector detail on Web ('Connected account' heading) and Mobile (rows labelled 'Account') (apps/web/features/connectors/components/ConnectorAccountSummary.tsx:89; apps/mobile/src/features/settings/cloud-connectors/ConnectorAccountSummary.tsx:34).

**Before you start**

- Source picker: a research run that stops for plan approval, and a surface that can start the run (apps/web/features/chat/components/research/ResearchActivity.tsx:459; test ResearchActivity.sources.test.tsx:101-121).
- Web project picker: AGI Work mode, or a project already selected on a plan without that capability (ChatComposerNew.tsx:7043-7046).
- Mobile project bar: at least one project; otherwise the bar is not drawn (ProjectSelectorBar.tsx:177).
- Connected account: the connector must be connected.

**Screens and controls**

- Source chips with remove button labelled 'Remove <label> from this research run', a kind select 'What kind of source to add' with 'Only this site', 'Never this site', 'My files', 'Connected app', a field 'Site to add' (placeholder 'nature.com, who.int'), a select 'Which connected app to read from' ('Choose an app'), and an Add button (ResearchActivity.tsx:199-204, :737-790).
- Web project menu: 'Search projects...' field, project rows with a check on the active one, 'Choose a different folder' (desktop only), 'Create new project', 'View all projects' (ChatComposerNew.tsx:7165-7250).
- Mobile project sheet: slide-up list with 'Clear project' and an item 'No project' (ProjectSelectorBar.tsx:361, :386).
- Account rows: label 'Account' (Mobile) or heading 'Connected account' (Web) with the account label or 'The provider did not share the account name', and 'Needs reconnecting'.

**Journey**

1. Research: start a research run; the plan waits for approval; the text 'Searching the whole web. Add a source to narrow it.' shows; add chips; the heading changes to 'Sources for this run'; approve; the run sends research_sources to the server.
2. Project (Web): open the picker, type to filter, click a project; the folder selection is cleared because a chat has a project or a folder, not both.
3. Project (Mobile): tap the pill, tap a project; with an existing chat the app moves the chat on the server and undoes the pick with an alert if that fails.
4. Project (VS Code): choose Apply in the project detail; choosing the active project again clears it.
5. Account: open the connector; rows load, with Retry on failure.

**What the person sees and gets**

- Chips appear and can be removed one by one; the same source cannot be added twice (test ResearchActivity.sources.test.tsx:201).
- Invalid site text keeps Add disabled and sets aria-invalid on the field (ResearchActivity.tsx:417-422, :770).
- VS Code messages: 'turns in this workspace now apply "<project>" and its instructions.' (projectActions.ts:405).
- Mobile alert 'Could not move chat to project' with 'The change has been undone.' (ProjectSelectorBar.tsx:131-139).

**Settings**

- Project instructions (up to 8,000 characters are kept in VS Code) (apps/extension-vscode/src/features/projects/activeProject.ts:4).
- Project default model offered after applying a project in VS Code (projectActions.ts:408-417).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web/Desktop research source chooser; sources travel as research_sources with files, allow_domains, deny_domains and connectors, and the server reads them (apps/web/lib/hooks/useChatStream.ts:4601-4613; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:727, :5272-5273, :6959-6964).
- Web project picker with search, create and view-all (ChatComposerNew.tsx:7165-7250).
- Mobile project sheet that moves an existing chat (ProjectSelectorBar.tsx:128-140; test apps/mobile/__tests__/ProjectSelectorBarMove.test.tsx).
- CLI links a directory to an account project (apps/cli/src/lib.rs:3821-3835).
- VS Code applies or clears an active project per workspace (projectActions.ts:380-417).
- Chrome keeps an active project (apps/extension/src/side_panel.ts:544).

**Incomplete**

- Account display exists on Web and Mobile but no control to choose between accounts (apps/mobile/src/features/settings/cloud-connectors/ConnectorAccountSummary.tsx:32-60; apps/web/features/connectors/components/ConnectorAccountSummary.tsx:109-130).
- The source chooser appears only when a research plan waits for approval, not before the first question (ResearchActivity.tsx:459).

**Present but disconnected or switched off**

- The connector account contract carries isDefault and scope, but no code opened lets a task pick a non-default account (packages/contracts/cloud-contracts/src/connectors.ts:309-319).

**Not available**

- Source picker on Mobile, CLI, VS Code, Chrome (brief S9.03 and audit/partial/009-compound-interface-components.md).
- Interactive project picker in the CLI: project choice is by command, not a list in the terminal UI (apps/cli/src/lib.rs:1287-1330).
- Account chooser on Web, Desktop, Mobile, CLI: none found. The brief marks Mobile and CLI 'done' but the code opened shows only a read-only list; no CLI account code was found in apps/cli/src/cloud/connectors.rs.

## 4. Required behaviour

**Established requirements**

- Before or while asking, the user can choose which sources (specific sites, files, connected apps) the answer may draw on. (source: brief S9.03)
- When a connector has more than one linked account, the user can pick which account a task or chat uses. (source: brief S9.04)
- The user can pick one of their projects so the chat or task runs in that project. (source: brief S9.06)
- Source picker is still open work on Mobile, CLI, VS Code and Chrome (wave 3). (source: doc: audit/partial/009-compound-interface-components.md)
- The source list only draws on what the person chose (first-draft requirement, matches how the server receives allow, deny, files and connectors). (source: apps/web/lib/hooks/useChatStream.ts:4601-4613)

**Acceptance criteria**

1. At plan approval with no chips the text 'Searching the whole web. Add a source to narrow it.' is shown; after adding one it reads 'Sources for this run'.
2. Adding 'nature.com, who.int' creates two chips; an invalid token leaves Add disabled.
3. Removing a chip removes only that source.
4. The request to the chat endpoint contains research_sources with the chosen entries and nothing the person did not add.
5. Choosing a project on Web clears any chosen local folder.
6. On Mobile a failed project move shows the alert and the previous project stays.
7. For a connector with two accounts, the person can choose one and the choice is used (not met today).

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- An empty project list should say so on Mobile, as Web does with 'No projects yet' [inferred from ProjectSelectorBar.tsx:177 versus ChatComposerNew.tsx:7178].
- If account choice is built, it should reuse accountKey and isDefault from the contract [inferred from connectors.ts:309-319].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Offer the source chooser in the composer before sending, not only at plan approval.
- [proposed] Add a default-account selector on connector detail for Web and Mobile.
- [proposed] Add an interactive project list to the CLI TUI.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | ResearchActivity (source chips and add form) | `apps/web/features/chat/components/research/ResearchActivity.tsx` | Source picker shown while the plan awaits approval. |
| service | research-run-controls | `apps/web/features/chat/components/research/research-run-controls.ts` | Source helpers (addResearchSource, researchDomainRules); file name from the research folder listing, exports not opened. |
| hook | useChatStream research_sources | `apps/web/lib/hooks/useChatStream.ts` | Builds research_sources for the request. |
| endpoint | POST chat completions research_sources | `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts` | Validates and applies allow, deny, files and connector sources. |
| component | Project picker in ChatComposerNew | `apps/web/features/chat/components/Composer/ChatComposerNew.tsx` | Work-bar project button and AnchoredComposerMenu with search. |
| component | ProjectSelectorBar | `apps/mobile/src/features/chat/components/ProjectSelectorBar.tsx` | Mobile pill and sheet; moves the conversation. |
| store | useProjectStore / useCloudProjectStore | `apps/mobile/src/features/chat/components/ProjectSelectorBar.tsx` | Local and cloud project lists and active ids (imported there). |
| command | agi projects (list, show, link) | `apps/cli/src/lib.rs` | Project commands; Link writes the project id into the directory registry. |
| store | ProjectRegistry | `apps/cli/src/project_registry.rs` | Stores directory to account project link in projects.json. |
| service | applyProjectToChat | `apps/extension-vscode/src/features/projects/projectActions.ts` | Sets or clears the active project for the workspace. |
| store | activeProject | `apps/extension-vscode/src/features/projects/activeProject.ts` | Persists the active project in workspace state (key agiWorkforce.activeCloudProject). |
| service | projectsClient (Chrome) | `apps/extension/src/features/cloud-bridge/projectsClient.ts` | Reads account projects for the side panel. |
| component | Web ConnectorAccountSummary | `apps/web/features/connectors/components/ConnectorAccountSummary.tsx` | Shows connected accounts; hidden when none. |
| component | Mobile ConnectorAccountRows | `apps/mobile/src/features/settings/cloud-connectors/ConnectorAccountSummary.tsx` | Shows 'Account' rows with retry. |
| endpoint | GET /api/connectors/{connectorId}/accounts | `apps/web/app/api/connectors/[connectorId]/accounts/route.ts` | Lists accounts of one connector. |
| schema | ConnectorAccountSchema | `packages/contracts/cloud-contracts/src/connectors.ts` | Account shape: accountKey, label, scope, isDefault, needsReauthorization. |
| table | connector_oauth_grants | `apps/web/lib/connectors/oauth-store.ts` | Stores account_key, account_label, account_scope, is_default per grant. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person adds source chips; they live in component state until the plan is approved. | device | apps/web/features/chat/components/research/ResearchActivity.tsx:407-455 |
| Approval sends the run with research_sources (files flag, allowed and denied domains, connector ids). | our servers | apps/web/lib/hooks/useChatStream.ts:4601-4613; apps/web/features/chat/pages/WebChatPage.tsx:6274-6285 |
| The server validates and applies the sources when it researches the question; searches run on outside search services. | our servers | apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:5272-5273, :6959-6964 |
| Project pick on Web calls onSelectProject; the chat is created or saved in that project. | device and our servers | ChatComposerNew.tsx:2780-2787 |
| Mobile moves an existing conversation to a project through moveConversationToProject, then sets the active id. | device and our servers | apps/mobile/src/features/chat/components/ProjectSelectorBar.tsx:125-140 |
| CLI link writes the project id against the current directory on disk after refreshing projects from the account. | device and our servers | apps/cli/src/lib.rs:3821-3834 |
| Account list: the app calls the connector accounts endpoint and shows labels. | our servers | apps/web/features/connectors/components/ConnectorAccountSummary.tsx:25-45 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Research source chips | Component state, then the research run config | Sent with the request; kept in runConfig for retry (apps/web/features/chat/pages/WebChatPage.tsx:6018) | unknown |
| Active project (Mobile) | Mobile project stores; conversation projectId on the server | Yes for cloud projects | unknown |
| Active project (VS Code) | store:agiWorkforce.activeCloudProject in VS Code workspace state | no | Cleared by choosing the project again |
| Directory to project link (CLI) | ~/.agiworkforce/projects.json (apps/cli/src/project_registry.rs:42-44) | no | unknown |
| Active project (Chrome) | Extension storage key agi_active_project | no | unknown |

**Models and providers.** No model is chosen here. Research source limits are enforced by the managed chat endpoint; which model and search provider answer is decided by the routing of that run and was not traced (SYS-chat-turn-pipeline). In VS Code a project can carry a default model, and the user may switch to it after applying a project (projectActions.ts:408-417).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Source picker and project cloud lists need a signed-in account. Connector accounts need an account with the connector connected. |
| Permissions | Connector choices in the source form list only connectors the account has connected (ResearchActivity.tsx:407-410; test ResearchActivity.sources.test.tsx:221). Web project picker shows the person's own projects. |
| Subscription | Web project picker is shown with AGI Work mode, which needs the canUseAgiWork capability (ChatComposerNew.tsx:1062-1067). Research plan gating itself was not traced. VS Code and Chrome project clients report plan_required and policy_blocked errors (apps/extension/src/features/cloud-bridge/projectsClient.ts:28-33). |
| Limits and metering | Research runs show a cost estimate and search counts (ResearchActivity.tsx:370-400); sources do not have a separate limit found in the code opened. VS Code truncates project instructions to 8,000 characters. |
| Feature flags | none found in the code for the source picker. |
| Model compatibility | none found in the code. |
| Provider restrictions | Connector sources depend on the connector's provider being connected. |
| Local mode | Local-only chats on Web refuse a project: a notice 'Switch to a cloud model' appears when a local model is combined with a project (ChatComposerNew.tsx:5290-5309). CLI project links are only used for managed turns (apps/cli/src/lib.rs:3844). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Empty (no source) | Searches the whole web; text says so. | ResearchActivity.tsx:690 |
| Empty (no connectors) | No connected-app option offered. | apps/web/features/chat/components/research/ResearchActivity.sources.test.tsx:221 |
| Duplicate source | Not added twice. | ResearchActivity.sources.test.tsx:201 |
| Empty (projects, Web) | 'No projects yet' or 'No projects found'. | ChatComposerNew.tsx:7178 |
| Empty (projects, Mobile) | The whole bar is hidden; no message. | ProjectSelectorBar.tsx:177 |
| Error (project move, Mobile) | Alert and undo. | ProjectSelectorBar.tsx:131-139 |
| Loading/error (accounts) | Web shows 'Reading the connected account' then message with Retry; Mobile shows a row that retries on tap. | apps/web/features/connectors/components/ConnectorAccountSummary.tsx:92-117; apps/mobile/.../ConnectorAccountSummary.tsx:12-13, :41-51 |
| Reauthorization | Account row says 'Needs reconnecting'. | apps/mobile/.../ConnectorAccountSummary.tsx:14 |
| Offline / timeout | not handled in the code beyond the error states above. | not handled in the code |
| Accessibility | Chip remove buttons and fields have aria-labels; Mobile pill labels read 'Active project: <name>. Tap to change'. | ResearchActivity.tsx:737-790; ProjectSelectorBar.tsx:195 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/chat/components/research/ResearchActivity.sources.test.tsx`: Domain parsing, Add disabled on bad input, picker shown only awaiting approval, add and remove chips, no duplicates, no connector option when none connected.
- `apps/mobile/__tests__/ProjectSelectorBarMove.test.tsx`: Mobile project selector moving a conversation (file exists; cases not itemised).
- `apps/extension-vscode/src/__tests__/projectsView.test.ts`: VS Code project view (not itemised).

**Test scenarios**

- **Narrow research to one site**
  1. Start research on Web with a paid plan.
  2. At approval choose 'Only this site' and enter a domain, click Add, approve.
  3. Inspect the request body.
  - Expected: research_sources.allow_domains has only that domain.
- **Exclude a site**
  1. Choose 'Never this site' and add a domain.
  - Expected: deny_domains holds it; chip text reads 'Never <domain>'.
- **Project switch on Mobile**
  1. Open a chat with at least one project available.
  2. Tap the pill and pick a project; repeat with the network off.
  - Expected: Online: chat moves. Offline: alert 'Could not move chat to project' and the previous project remains.
- **CLI link**
  1. Run agi projects link <project> in a folder.
  2. Start a managed turn in that folder.
  - Expected: Confirmation line names the project; turns use its instructions.
- **Multiple accounts**
  1. Connect two accounts to one connector (if the provider allows).
  2. Open the connector detail.
  - Expected: Both accounts are listed; no control to choose between them (current behaviour).

**Where to look when it fails**

- Network request body field research_sources in the chat completions call.
- Mobile: alert text 'Could not move chat to project'.
- CLI: 'No project <x> in your AGI account'.
- Web connectors: GET /api/connectors/{id}/accounts response; error text 'The connected account could not be read.'
- Table connector_oauth_grants (is_default, account_key).

**Hands-on test plans**

- Web: [70-qa/test-plans/web/009-compound-interface-components.md](../../70-qa/test-plans/web/009-compound-interface-components.md)
- Desktop: [70-qa/test-plans/desktop/009-compound-interface-components.md](../../70-qa/test-plans/desktop/009-compound-interface-components.md)
- Mobile: [70-qa/test-plans/mobile/009-compound-interface-components.md](../../70-qa/test-plans/mobile/009-compound-interface-components.md)
- CLI: [70-qa/test-plans/cli/009-compound-interface-components.md](../../70-qa/test-plans/cli/009-compound-interface-components.md)
- VS Code: [70-qa/test-plans/vscode/009-compound-interface-components.md](../../70-qa/test-plans/vscode/009-compound-interface-components.md)
- Chrome: [70-qa/test-plans/chrome/009-compound-interface-components.md](../../70-qa/test-plans/chrome/009-compound-interface-components.md)

## 10. Gaps and dependencies

- **No way to pick among linked connector accounts.** Affects: Web, Desktop, Mobile, CLI. Evidence: apps/mobile/src/features/settings/cloud-connectors/ConnectorAccountSummary.tsx:32-60 has no press handler on rows; brief S9.04 marks Mobile and CLI done. Work needed: Build a selector bound to accountKey and the default flag, and make the chat or task use it; correct the brief status.
- **Source picker missing on Mobile, CLI, VS Code, Chrome and only offered at plan approval on Web.** Affects: Mobile, CLI, VS Code, Chrome users doing research. Evidence: audit/partial/009-compound-interface-components.md (S9.03). Work needed: Decide per surface; add the picker or document Web-only.
- **Mobile project bar disappears when the account has no projects.** Affects: Mobile users. Evidence: ProjectSelectorBar.tsx:177. Work needed: Show an empty message with a way to create a project.
- **CLI has no interactive project list.** Affects: CLI users. Evidence: apps/cli/src/lib.rs:1287-1330. Work needed: Add a picker in the TUI or accept command-only as the design.

**Depends on**

- SYS-connectors-plugins-and-skills
- SYS-memory-projects-and-context
- SYS-chat-turn-pipeline
- SYS-authentication-and-identity
- SYS-subscriptions-entitlements-and-usage
- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:vscode
- surface:chrome
- api:GET /api/connectors/{connectorId}/accounts
- table:connector_oauth_grants
- store:agiWorkforce.activeCloudProject

## Unknown

- Which plan gates deep research and so the source picker.
- Whether Desktop (Tauri retained build) has any separate source picker; the public Desktop shows the web app (doc: AGENTS.md section 5).
- How a connector task chooses an account at run time (default only, or other).
- Whether Chrome project selection is a picker list or only an active-project chip; side_panel.ts was only grepped.
- Mobile project sheet: whether it has a search box.

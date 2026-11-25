---
id: "F073-10"
type: "feature"
title: "Project instructions, skills and MCP servers"
aliases: ["Project instructions", "Instruction files", "Show Instructions", "Context panel instructions", "Skills, MCP servers and plugins management", "Show Skills", "Show MCP Servers", "Show Plugins", "S73.22", "S73.23"]
area: "73 VS Code and IDE extension"
available_on: ["vscode"]
implementation: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "built", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "not seen by a person", chrome: "n/a"}
requirement_items: ["S73.22", "S73.23"]
depends_on: ["surface:vscode", "surface:cli", "mode:local", "mode:own-key", "mode:cloud", "SYS-connectors-plugins-and-skills", "SYS-memory-projects-and-context", "SYS-agents-tools-and-automation", "SYS-security-and-privacy", "file:packages/contracts/types/src/project-instructions.ts", "file:apps/cli/src/compaction.rs", "F073-12"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F073-10 Project instructions, skills and MCP servers

In VS Code, AGI Code shows which project instruction files apply (AGENTS.md, CLAUDE.md, .agiworkforce/instructions.md) and custom instructions, and lets the person view, add, test, turn off or remove skills, MCP servers and plugins through quick-pick commands run by the AGI CLI. VS Code only.

Area: [73. VS Code and IDE extension](README.md). Requirement items: [S73.22](../../10-requirements/capabilities/073-vs-code-and-ide-extension.md#s7322), [S73.23](../../10-requirements/capabilities/073-vs-code-and-ide-extension.md#s7323).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | does not apply | does not apply | n/a |
| Desktop | does not apply | does not apply | n/a |
| Mobile | does not apply | does not apply | n/a |
| CLI | does not apply | does not apply | n/a |
| VS Code | built | built | not seen by a person |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Shows instruction sources in the Context panel and in 'Code: Show Instructions', and provides Command Palette surfaces to manage skills, MCP servers and plugins, with confirmation before removal.

**Why it exists.** The brief says project instruction files apply to turns in the session folder and can be viewed (S73.22), and that MCP servers, skills and plugins can be viewed and managed (S73.23). The product says CLI and VS Code must show the same discovered inventory (doc: docs/product/definition.md:122).

**Who uses it.** Developers who give the assistant repository rules or extra tools.

**Problems it solves**

- Not knowing which rules the assistant follows
- Editing tool configuration by hand
- Removing a tool by mistake

**Use cases**

- Open the Context panel to confirm AGENTS.md is loaded.
- Run 'Code: Show Skills' and turn a skill off.
- Run 'Code: Show MCP Servers', test a server connection and remove one after confirmation.

## 2. User experience

**Where to find it**

- Context panel tree group 'Instructions' (apps/extension-vscode/src/features/trees/contextPanelProvider.ts:229-300).
- Command Palette: 'Code: Show Instructions' (package.json:793-795), 'Code: Show Skills' (package.json:753-755), 'Code: Show Plugins' (package.json:773-775), 'Code: Browse AGI Cloud Marketplace' (package.json:778-780), 'Code: Show MCP Servers' (package.json:783-785), 'Code: Show Hooks'.
- Settings panel capability lists (apps/extension-vscode/src/features/surfaces/capabilityManagement.ts:891-960).

**Before you start**

- A working AGI CLI; the surfaces call it through CliCapabilityAdapter (apps/extension-vscode/src/features/surfaces/cliCapabilities.ts:260).
- An open workspace folder for project files.
- Removal and install actions appear only when the CLI offers installs (capabilityManagement.ts:221, 288).

**Screens and controls**

- Context tree items: 'Custom instructions' (host default or workspace override), one item per project file marked 'Runtime source' or 'Runtime source · preview truncated', or 'No active instructions' (contextPanelProvider.ts:229-300).
- Quick pick 'Code, Instructions' listing the files the CLI loads (apps/extension-vscode/src/features/surfaces/index.ts:357-380).
- Quick pick 'Code, Skills' with rows 'Create a skill', 'Install a skill', 'Allow this folder’s project skills' and per-skill turn on or off and remove buttons (capabilityManagement.ts:220-300).
- Quick pick for MCP servers with status, transport and scope, 'Test connection' and remove (capabilityManagement.ts:770-870).
- Modal 'Remove the skill “<name>”?' with 'Its folder is deleted from your skills, and it stops loading in every workspace. This cannot be undone.' (capabilityManagement.ts:291-294).

**Journey**

1. 1. Open the Context panel or run 'Code: Show Instructions'.
2. 2. Read the listed files; select one to open it in the editor.
3. 3. For tools, run 'Code: Show Skills', 'Show MCP Servers' or 'Show Plugins'.
4. 4. Pick an item to see its actions; use the toggle, test or remove button.
5. 5. For removal, read the modal and confirm 'Remove'; cancel does nothing.
6. 6. The list reloads after each action.

**What the person sees and gets**

- Instruction files with truncation marker text '[...truncated, file is N chars, showing first 8192]' inside previews (packages/contracts/types/src/project-instructions.ts:25-28).
- 'The CLI loads no instruction files in this workspace.' when empty (surfaces/index.ts:361-366).
- Status labels for MCP servers and 'Missing <tools>, so it will not load' for skills (capabilityManagement.ts:213-218).

**Settings**

- Custom instructions: host default and workspace override, each up to 8,000 characters (apps/extension-vscode/src/features/instructions/customInstructions.ts:13-14, 43-44).
- Project skills need a per-folder consent action (capabilityManagement.ts:245-256).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Extension-side loader reads up to two files from the active workspace folder in the order AGENTS.md, CLAUDE.md, .agiworkforce/instructions.md, skips empty or unreadable files, and cuts each to 8,192 characters with a note (apps/extension-vscode/src/data/projectInstructions.ts:18-35; packages/contracts/types/src/project-instructions.ts:1-28).
- The Context panel uses that loader for its preview (contextPanelProvider.ts:188-200, 247-300).
- 'Code: Show Instructions' asks the CLI for the files a turn loads and lists them (surfaces/index.ts:357-380).
- The CLI loader walks from the folder up to the project root, includes a global instructions file, follows safe links, skips credential files and enforces a token budget (apps/cli/src/compaction.rs:172-217; MAX_INSTRUCTION_TOKENS at compaction.rs:11).
- Skill, MCP and plugin management through CliCapabilityAdapter with confirmation for remove, replace and consent (capabilityManagement.ts:180-198, 560-575, 770-870).
- The extension turn prelude adds only custom instructions and the active cloud project, not the repository files (customInstructions.ts:88-110) [inferred: the CLI loads the files itself].

**Incomplete**

- The extension preview and the CLI loader differ: preview reads two files in the one folder with an 8,192 character cut; the CLI walks upward with a token budget. 'Show Instructions' shows the CLI's list, the Context panel shows the extension's copy (contextPanelProvider.ts:188; compaction.rs:172).
- The extension loader does not check Workspace Trust before reading, so the Context panel shows project files in an untrusted folder (apps/extension-vscode/src/data/projectInstructions.ts:18-35) [inferred: display only].
- Removal of a skill deletes its folder; whether it goes to the OS Trash first (as AGENTS.md section 9 requires for agent removals) was not traced in the CLI (capabilityManagement.ts:292-294).

**Present but disconnected or switched off**

- Install and remove rows are hidden when the CLI does not offer installs (capabilityManagement.ts:221, 288).

**Not available**

- Other apps have their own surfaces; this feature page covers VS Code only.

## 4. Required behaviour

**Established requirements**

- Project instruction files (AGENTS.md, CLAUDE.md, .agiworkforce/instructions.md) apply to turns in the session folder and can be viewed from the extension. (source: S73.22)
- The user can view and manage MCP servers, skills and plugins from the extension. (source: S73.23)
- CLI and VS Code must show the same discovered inventory for the same trusted workspace; compatibility never authorizes moving or deleting another tool's files. (source: doc: docs/product/definition.md:122)
- An action the user cannot undo asks first and names the consequence. (source: AGENTS.md section 9 (repository rule))

**Acceptance criteria**

1. With AGENTS.md and CLAUDE.md both present, the Context panel lists both as 'Runtime source'.
2. With all three files present, the extension preview lists only the first two, and 'Code: Show Instructions' lists what the CLI loads.
3. A file over 8,192 characters is marked truncated in the Context panel.
4. An empty instruction file is not listed.
5. 'Code: Show Skills' removal shows the irreversible modal and Cancel keeps the skill.
6. Removing an MCP server asks first and says chats stop using its tools.
7. A skill missing a required tool shows a warning line.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The panel and 'Show Instructions' should agree for the same folder [inferred from definition.md:122].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Build the Context panel list from the same CLI response as 'Show Instructions' and delete the extension-side copy.
- [proposed] Send removed skill folders to the OS Trash before deleting.
- [proposed] Show the instruction budget and which file was cut.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| schema | PROJECT_INSTRUCTION_FILES and limits | `packages/contracts/types/src/project-instructions.ts` | Files, order, cap of 2 sources, 8,192 char cut, projectInstruction(). |
| service | loadProjectInstructionSources | `apps/extension-vscode/src/data/projectInstructions.ts` | Extension-side reader. |
| component | ContextPanelProvider | `apps/extension-vscode/src/features/trees/contextPanelProvider.ts` | Instruction items in the Context tree. |
| service | customInstructions | `apps/extension-vscode/src/features/instructions/customInstructions.ts` | Host and workspace custom instructions, turn prelude, snapshot. |
| service | openInstructionsSurface | `apps/extension-vscode/src/features/surfaces/index.ts` | Line 357; lists CLI-loaded files. |
| service | CliCapabilityAdapter | `apps/extension-vscode/src/features/surfaces/cliCapabilities.ts` | Line 260; calls the CLI for skills, MCP, plugins, hooks. |
| component | manageSkills | `apps/extension-vscode/src/features/surfaces/capabilityManagement.ts` | Line 220; skill list, toggle, create, install, remove. |
| component | manageMcpServers and testMcpServer | `apps/extension-vscode/src/features/surfaces/capabilityManagement.ts` | Lines 770 and 721; list, test, add, remove, login. |
| component | managePlugins | `apps/extension-vscode/src/features/surfaces/capabilityManagement.ts` | Line 418; list, toggle, install, remove. |
| service | confirmRemoval | `apps/extension-vscode/src/features/surfaces/capabilityManagement.ts` | Line 180; modal with consequence text. |
| command | showSkills, showPlugins, showMcpServers, showInstructions | `apps/extension-vscode/src/core/commandSetup.ts` | Registered at lines 2668, 2672, 2678, 2690. |
| service | CLI instruction loader | `apps/cli/src/compaction.rs` | instruction_sources (line 172), token budget (line 11), file names (line 23). |
| service | CLI instructions endpoint | `apps/cli/src/app_server/surfaces.rs` | context_instructions (line 72); skills catalog (list_skills). |
| service | Safe project file reader | `apps/cli/src/project_text.rs` | Follows in-project links, refuses credential files, 1 MiB cap. |
| service | Web cloud-code instruction reader | `apps/web/lib/services/cloud-code-project-instructions.ts` | Uses the same shared file list for cloud code sessions. |
| config | Command declarations | `apps/extension-vscode/package.json` | Lines 753, 773, 778, 783, 793. |
| test | customInstructions.test | `apps/extension-vscode/src/__tests__/customInstructions.test.ts` | Custom instruction rules and snapshot with project sources. |
| test | settingsPanelLocalCapabilities.test | `apps/extension-vscode/src/__tests__/settingsPanelLocalCapabilities.test.ts` | Settings panel capabilities (not opened). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The Context panel asks the extension loader to read instruction files in the active folder through the VS Code file system. | device | apps/extension-vscode/src/data/projectInstructions.ts:18-35 |
| 'Show Instructions' and the capability surfaces call the local AGI CLI app-server over its typed protocol. | device | apps/extension-vscode/src/features/surfaces/index.ts:357-359; doc: docs/product/definition.md:509-513 |
| The CLI reads instruction files, skills and MCP configuration from disk and applies them to turns. | device | apps/cli/src/compaction.rs:172-217; apps/cli/src/app_server/surfaces.rs:72-100 |
| MCP servers may reach outside services over HTTP, SSE or a local command when tested or used; which servers is the person's choice. | outside service | apps/extension-vscode/src/features/surfaces/capabilityManagement.ts:595-650 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Instruction files | Repository on disk | No product sync from this feature | Owned by the repository; the extension never writes them |
| Custom instructions (host and workspace) | VS Code global state and workspace state keys agiWorkforce.customInstructions.host and .workspace | No | Until edited |
| Skills, MCP entries, plugins | AGI CLI settings and skills folders; MCP env values and headers are entered with password input and saved by the CLI (capabilityManagement.ts:287-298) | unknown | Removal deletes the entry or folder after confirmation |

**Models and providers.** Instructions and tools are added to turns by the CLI runtime for whatever model runs. This feature calls no model itself.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Instruction viewing and tool management need no account in the extension code; some MCP servers need their own login (capabilityManagement.ts:853). |
| Permissions | Project skills load only after consent for the folder (capabilityManagement.ts:245-256). MCP policy refusals show as server detail text (capabilityManagement.ts:848-852). |
| Subscription | none found in the code for viewing or managing. Account skills exist as an origin in the CLI (surfaces.rs skill_scope), plan rules not traced. |
| Limits and metering | 8,192 chars per file in the extension preview; CLI budget in tokens (compaction.rs:11); custom instructions 8,000 chars (customInstructions.ts:13). |
| Feature flags | Capability offers such as 'installs' come from the CLI (capabilityManagement.ts:221). |
| Model compatibility | Not model dependent; skills may require tools (capabilityManagement.ts:213-218). |
| Provider restrictions | none found in the code. |
| Local mode | Everything here runs against the local CLI and files; no cloud call is needed to view or manage them. MCP servers the person adds may call out. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| No folder open | The extension loader returns an empty list. | projectInstructions.ts:19-20 |
| Unreadable or empty file | Skipped silently. | projectInstructions.ts:25-33; project-instructions.ts:22 |
| CLI unavailable | The surface shows the adapter's reason as a warning. | surfaces/index.ts:357-360 |
| Loader error in Context panel | Snapshot cleared and the panel offers 'Configure' for custom instructions. | contextPanelProvider.ts:188-200, 229-246 |
| Skill missing a tool or variable | Warning line says it will not load. | capabilityManagement.ts:213-218 |
| Remove cancelled | Nothing deleted. | capabilityManagement.ts:180-188 |
| Untrusted workspace | CLI not started, so CLI-backed surfaces are unavailable; the extension file preview still reads files [inferred]. | package.json:54-56; localRuntimeClient.ts:2543 |
| Remote window | Files and CLI are on the remote host. | package.json:19-21 |
| Accessibility | Context tree items set accessibilityInformation (contextPanelProvider.ts:107-125). | contextPanelProvider.ts:107-125 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/extension-vscode/src/__tests__/customInstructions.test.ts`: Host and workspace instructions, bounded prelude, escaped delimiter, snapshot with runtime-discovered project sources.
- `apps/extension-vscode/src/__tests__/settingsLocalCapabilities.webview.test.ts`: Settings webview capability lists (not opened).
- `apps/extension-vscode/src/__tests__/settingsPanelLocalCapabilities.test.ts`: Settings panel capability handling (not opened).
- `apps/desktop/src/features/settings/__tests__/InstructionFilesSettings.test.tsx`: A desktop surface using the same shared file list (not opened).

**Test scenarios**

- **Two-file cap**
  1. Create AGENTS.md, CLAUDE.md and .agiworkforce/instructions.md in a folder.
  2. Open the Context panel.
  3. Run 'Code: Show Instructions'.
  - Expected: The panel lists two files; Show Instructions lists what the CLI loads. Compare and note any difference.
- **Long file**
  1. Put a file over 8,192 characters in AGENTS.md.
  2. Open the Context panel.
  - Expected: Item says 'preview truncated'; hover shows the truncation note.
- **Remove a skill**
  1. Install a user skill.
  2. Run 'Code: Show Skills' and choose remove.
  3. Cancel, then repeat and confirm.
  - Expected: Cancel keeps it; confirm deletes it after the irreversible warning.
- **Test an MCP server**
  1. Add a local MCP server.
  2. Choose Test connection.
  - Expected: A status result is shown; errors name the cause.
- **Untrusted folder**
  1. Open a folder in Restricted Mode.
  2. Run 'Code: Show Skills'.
  - Expected: A message that the runtime is unavailable; record what the Context panel shows.

**Where to look when it fails**

- Warning text from the adapter reason.
- CLI logs on the host (location unknown).
- Context panel 'No active instructions' item.

**Hands-on test plans**

- VS Code: [70-qa/test-plans/vscode/073-vs-code-and-ide-extension.md](../../70-qa/test-plans/vscode/073-vs-code-and-ide-extension.md)

## 10. Gaps and dependencies

- **The extension keeps its own loader (two files, 8,192 chars) while the CLI loads by a different rule; the panel can disagree with what turns use.** Affects: VS Code users and testers. Evidence: apps/extension-vscode/src/data/projectInstructions.ts:18-35 vs apps/cli/src/compaction.rs:172-217. Work needed: Use the CLI response in the panel or share one rule.
- **Product says CLI and VS Code show the same inventory; no test compares them.** Affects: VS Code and CLI users. Evidence: doc: docs/product/definition.md:122. Work needed: Add a parity test.
- **Skill removal is irreversible in the UI; Trash handling not confirmed.** Affects: VS Code users. Evidence: apps/extension-vscode/src/features/surfaces/capabilityManagement.ts:291-295. Work needed: Confirm CLI behaviour and move to Trash if needed.
- **No test found for manageSkills, manageMcpServers or managePlugins flows.** Affects: Testers. Evidence: no test file by those names in src/__tests__. Work needed: Add tests for confirm and cancel.

**Depends on**

- surface:vscode
- surface:cli
- mode:local
- mode:own-key
- mode:cloud
- SYS-connectors-plugins-and-skills
- SYS-memory-projects-and-context
- SYS-agents-tools-and-automation
- SYS-security-and-privacy
- file:packages/contracts/types/src/project-instructions.ts
- file:apps/cli/src/compaction.rs
- F073-12

## Unknown

- Whether the CLI moves removed skill folders to Trash.
- Whether account-scoped skills depend on a plan.
- Where CLI logs for capability calls are written.
- Contents of the two settings capability tests.
- Whether the Context panel or only the CLI decides what a turn really loads in every case.

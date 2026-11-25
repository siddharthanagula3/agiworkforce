---
id: "F057-02"
type: "feature"
title: "Your files: find, read, write and edit"
aliases: ["File search", "search_files", "open_file", "device_find_files", "device_search_text", "File read", "read_file", "device_read_file", "File write", "write_file", "device_write_file", "File edit", "edit_file", "device_edit_file", "Patch tool", "S57.04", "S57.05", "S57.06", "S57.12"]
area: "57 Tool catalog and invocation experience"
available_on: ["web", "desktop", "mobile", "cli", "vscode", "chrome"]
implementation: {web: "partial", desktop: "built", mobile: "partial", cli: "built", vscode: "built", chrome: "partial"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S57.04", "S57.05", "S57.06", "S57.12"]
depends_on: ["SYS-agents-tools-and-automation", "SYS-files-artifacts-and-storage", "SYS-execution-boundaries", "SYS-security-and-privacy", "SYS-authorization-and-workspaces", "surface:desktop", "surface:web", "surface:mobile", "surface:cli", "surface:vscode", "surface:chrome", "mode:cloud", "mode:local", "file:packages/contracts/local-runtime/src/device-steps.ts"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F057-02 Your files: find, read, write and edit

The assistant can find, read, write and edit files. On Desktop it works inside a folder the person granted, through device steps. In the CLI and VS Code it works in the project folder. On Web, Mobile and Chrome it works in a cloud sandbox that is switched off today. Web also searches the person's uploaded files.

Area: [57. Tool catalog and invocation experience](README.md). Requirement items: [S57.04](../../10-requirements/capabilities/057-tool-catalog-and-invocation-experience.md#s5704), [S57.05](../../10-requirements/capabilities/057-tool-catalog-and-invocation-experience.md#s5705), [S57.06](../../10-requirements/capabilities/057-tool-catalog-and-invocation-experience.md#s5706), [S57.12](../../10-requirements/capabilities/057-tool-catalog-and-invocation-experience.md#s5712).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built | partly built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | partly built | partly built | not seen by a person |
| CLI | built | built | not seen by a person |
| VS Code | built | built | not seen by a person |
| Chrome | partly built | partly built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Provides four jobs. Search: find files by name or by text. Read: return a file's text. Write: create or replace a file. Edit: replace one exact passage without rewriting the file. There are three families: server file search over uploaded files and project knowledge (search_files, open_file), device steps on the Desktop's granted folders (device_*), CLI tools (read_file, write_file, edit_file, glob, grep), and cloud sandbox tools (read_file, write_file, edit_file, list_files) that need the sandbox switch. (apps/web/lib/server/tools/file-search-tool.ts:64) (packages/contracts/local-runtime/src/device-steps.ts:131-165) (apps/web/lib/e2b/execution-tools.ts:14-19)

**Why it exists.** Work on documents and code needs the assistant to touch real files, with the person in control of which folder it may reach. (doc: docs/product/definition.md)

**Who uses it.** Desktop users with a granted folder, developers in the CLI and VS Code, Web users asking about files they uploaded, and later Web, Mobile and Chrome users once the sandbox is on.

**Problems it solves**

- Copying file text into chat by hand
- Rewriting a whole file for a one-line change
- Letting an assistant roam over the whole disk

**Use cases**

- Ask Desktop to find every invoice file in a granted folder.
- Ask the CLI to fix a bug; it reads the file and edits one passage.
- Ask Web which of the uploaded contracts mentions a notice period.
- Ask the assistant to save generated notes as a text file in the granted folder.

## 2. User experience

**Where to find it**

- Desktop: grant a folder in the desktop host; file steps then appear as tool cards in chat (apps/web/features/desktop-host/lib/device-steps.ts:427).
- Web: uploaded files and project knowledge are searched automatically by search_files and open_file (apps/web/lib/server/tools/file-search-tool.ts:64).
- CLI: tools read_file, write_file, edit_file, glob, grep_files in the terminal UI (apps/cli/src/platform/runtime/tool_catalog.rs:226-228).
- VS Code: tool call rows and file change review in the sidebar (apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:3301-3327).
- Web, Mobile, Chrome: sandbox file tools; no visible control until the switch is on (apps/web/lib/e2b/gate.ts:16-30).

**Before you start**

- Desktop: a folder granted by the person; without one, workspace steps are not offered (packages/contracts/local-runtime/src/device-steps.ts:562-571).
- Desktop: the filesystem.read or filesystem.write capability granted (packages/contracts/local-runtime/src/device-steps.ts:131-165).
- Web, Mobile, Chrome sandbox tools: environment flag AGI_E2B_EXECUTION=1 and E2B_API_KEY and a priceable sandbox rate card (apps/web/lib/e2b/gate.ts:20-27).
- CLI: a trusted workspace folder; workspace policy file may deny or ask (apps/cli/src/features/exec/tools/mod.rs:573-633).

**Screens and controls**

- Folder grant dialog on Desktop (permission prompt text: 'The agent wants to read the contents of files in this folder.') (apps/desktop/electron/runtime/dispatcher.ts:675-678).
- Write prompt text: 'The agent wants to create or change files in this folder.' (apps/desktop/electron/runtime/dispatcher.ts:683-686).
- Edit prompt text: 'The agent wants to change part of a file in this folder.' (apps/desktop/electron/runtime/dispatcher.ts:687-690).
- Tool cards with file name icon and diff for edits (apps/web/features/chat/components/messages/ToolTimeline.tsx:~455-475) (packages/ui/unified-chat/src/components/ToolCallCard.tsx).
- CLI approval overlay for edits and commands (apps/cli/src/tui/widgets/approval_overlay.rs).

**Journey**

1. Person asks about a file or a change.
2. Desktop: the cloud turn hands a device step back to the machine; the model first lists or finds the file, then reads it (apps/web/lib/device-steps/device-tools.ts).
3. The Desktop runtime checks the grant and may prompt, then reads, writes or edits inside the granted folder.
4. The result goes back to the model and shows on the card (edits show a diff).
5. The model continues or explains an error.
6. CLI: the same loop runs locally with the CLI's own approval prompts.

**What the person sees and gets**

- Card with file name, running and finished state, diff for edits.
- Write or edit failure text such as 'old_text was not found in <path>.' (sandbox) (apps/web/lib/e2b/execution-tools.ts:~335).
- CLI refuses a write that adds merge conflict markers or redaction placeholders (apps/cli/src/features/exec/tools/file_ops/mod.rs:445-480).
- Search results with file names and excerpts.

**Settings**

- Granted folders on Desktop.
- Workspace policy file .agiworkforce/policy.toml in the CLI (apps/cli/src/features/exec/tools/mod.rs:574).
- Settings > Capabilities: cloud code execution switch (also gates sandbox file tools) (apps/web/lib/server/code-execution-policy.ts:6-7).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Desktop device steps for read, list, write, edit, find (glob), search text (grep) in granted folders (packages/contracts/local-runtime/src/device-steps.ts:131-165) executed by the privileged runtime (apps/desktop/electron/runtime/dispatcher.ts:2337-2377).
- Edit requires one exact match unless replaceAll is set (packages/contracts/local-runtime/src/device-steps.ts:151-154).
- Server search_files (up to 8 results, 2 per file, 800 character excerpts) and open_file (up to 60,000 characters) over uploaded files and project knowledge (apps/web/lib/server/tools/file-search-tool.ts:46-53).
- Temporary chats do not search files (apps/web/lib/server/tools/file-search-tool.ts:51).
- CLI read, write, edit, multiedit, glob, grep with saved-permission and policy gates (apps/cli/src/features/exec/tools/mod.rs:573-700).
- Sandbox tools exist and are tested: write_file, read_file (200,000 byte cap), list_files, create_folder, edit_file (must match once) (apps/web/lib/e2b/execution-tools.ts:30, :63-175, :330-360).
- Paths in the sandbox must be workspace-relative with no '..' (apps/web/lib/e2b/execution-tools.ts:49-57).

**Incomplete**

- Sandbox file tools on Web, Mobile and Chrome and API are partial because the production switch is not set (brief S57.05, S57.06, S57.12).

**Present but disconnected or switched off**

- Sandbox file tools: turn offer uses e2bProvisioningReady (needs flag, key and priced compute) (apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:5929); a tool call without the flag returns 'Tool <name> is not available.' marked unavailable (apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:2801-2809).

**Not available**

- Device (folder) steps for Web in a plain browser, Mobile, CLI-less Chrome and extensions: the declaration is only believed from desktop and mobile shells (apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:3706-3714) (apps/web/lib/device-steps/device-tools.ts:20-26).
- Folder steps on Mobile: the phone declares only phone steps (calendar, reminders) (apps/web/lib/device-steps/device-tools.ts:24-26).

## 4. Required behaviour

**Established requirements**

- File-search tool returns matching paths or snippets for the user's files (S57.04). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S57.04)
- File-read tool reads a file in a sandbox or on the user's machine (S57.05). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S57.05)
- File-write creates or overwrites a named file (S57.06). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S57.06)
- Patch/edit changes part of a file rather than rewriting it (S57.12). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S57.12)
- An agent never destroys user data; overwritten files go to Trash first and code gets a checkpoint. (source: doc: AGENTS.md section 9)
- Local, BYOK and Managed Cloud are separate trust boundaries; nothing routes silently. (source: doc: docs/product/definition.md)

**Acceptance criteria**

1. With no granted folder on Desktop, no workspace file tool is offered to the model.
2. Desktop read of a file inside the grant returns text; a path outside the grant is refused.
3. Edit with text that matches twice fails with a message unless replaceAll is set.
4. Web sandbox call with the flag unset returns the not-available message and the model says so.
5. Web search_files returns at most 8 excerpts and at most 2 per file.
6. A sandbox path starting with '/' or containing '..' is refused.
7. In the CLI, a write that would add conflict markers is refused.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Desktop file writes should keep the 'previous versions to Trash' rule from AGENTS.md section 9; the dispatcher code for it was not read (unknown).
- Chrome and Mobile would use the same sandbox tools as Web through the completions endpoint [inferred from brief and shared endpoint].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Set the sandbox switch and key in production, then run the live check in the code view named in the brief.
- [proposed] Add a visible 'Files' state on Web/Mobile/Chrome that says the sandbox is off when it is off.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| schema | device step definitions | `packages/contracts/local-runtime/src/device-steps.ts` | Names, capabilities, scope and descriptions of device_read_file, write, edit, find, search; offer rules. |
| service | device tool builder | `apps/web/lib/device-steps/device-tools.ts` | Turns a host declaration into the tool list with folder choices. |
| service | device step executor (web side) | `apps/web/features/desktop-host/lib/device-steps.ts` | Carries out a step through the desktop bridge and shapes the answer. |
| service | desktop dispatcher | `apps/desktop/electron/runtime/dispatcher.ts` | Maps commands to capabilities and prompts, runs file_read_text, file_write_text, file_edit_text, file_glob, file_grep (2337-2377). |
| service | desktop filesystem service | `apps/desktop/electron/runtime/filesystemService.ts` | The read, write, edit, glob and grep operations. |
| service | desktop path guard | `apps/desktop/electron/runtime/pathGuard.ts` | Keeps paths inside the granted folder [inferred from name]. |
| service | server file search | `apps/web/lib/server/tools/file-search-tool.ts` | search_files and open_file over uploaded files and project knowledge. |
| config | file tool names | `apps/web/lib/server/tools/file-tool-names.ts` | Names search_files and open_file. |
| service | sandbox execution tools | `apps/web/lib/e2b/execution-tools.ts` | write_file, read_file, list_files, create_folder, edit_file schemas and router. |
| config | sandbox gate | `apps/web/lib/e2b/gate.ts` | AGI_E2B_EXECUTION, E2B_API_KEY and pricing checks. |
| service | code execution policy | `apps/web/lib/server/code-execution-policy.ts` | Per-account switch cloudCodeExecution in user settings. |
| service | tool loop | `apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts` | Routes device calls (7660-7800), sandbox calls (2798-2850), audit (3505-3560). |
| service | CLI tool dispatcher | `apps/cli/src/features/exec/tools/mod.rs` | Permission, policy and approval for file tools. |
| service | CLI file operations | `apps/cli/src/features/exec/tools/file_ops/mod.rs` | File reading and edit safety checks. |
| service | CLI tool catalog | `apps/cli/src/platform/runtime/tool_catalog.rs` | Names, aliases, capability labels for file tools. |
| component | ToolCallCard | `packages/ui/unified-chat/src/components/ToolCallCard.tsx` | Shared card with diff view. |
| component | ToolTimeline | `apps/web/features/chat/components/messages/ToolTimeline.tsx` | File icon and tool detail on Web and Desktop. |
| service | VS Code chat state | `apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts` | Tracks file write attempts and confirmation (3301-3327). |
| table | user_settings | `apps/web/lib/server/code-execution-policy.ts` | Holds capabilities.cloudCodeExecution for the account. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The Desktop shell declares its granted folders and capabilities in a request header; only the desktop and mobile surfaces are believed. | device | apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:3706-3714 |
| The server offers only the device tools the declaration allows (no folder, no workspace tools). | our servers | packages/contracts/local-runtime/src/device-steps.ts:562-571 |
| The model calls a device tool; the server plans the step, pauses the turn and sends x_device_step_request back to the app. | our servers | apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:7660-7700; apps/web/lib/hooks/useChatStream.ts:3555 |
| The Desktop runtime checks the capability, may prompt, and performs the read, write, edit, glob or grep inside the folder. | device | apps/desktop/electron/runtime/dispatcher.ts:665-700, :2337-2377 |
| The result (up to 24,000 characters) returns to the server and the turn resumes. | device and our servers | packages/contracts/local-runtime/src/device-steps.ts:427 |
| Sandbox path: tool call goes to a cloud sandbox from an outside provider after the policy and switch checks. | outside service | apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:2798-2850 |
| CLI path: the CLI reads or edits files on the person's machine after permission checks. | device | apps/cli/src/features/exec/tools/mod.rs:573-700 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Files in the granted folder | the person's disk | not synced | as the person keeps them; Trash behaviour for overwrite unknown |
| Sandbox workspace files | cloud sandbox session | no | ends with the session; reclaim code exists (apps/web/lib/e2b/reclaim.ts), details unknown |
| Tool audit event (tool name and status, not content) | audit events | server | unknown (apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:3519-3545) |

**Models and providers.** Device tools are model-agnostic function tools. The sandbox tools replace provider-native code tools so any model can use them (apps/web/lib/e2b/execution-tools.ts:1-9). The sandbox itself is an outside provider; its name is hidden from users by a redaction function (apps/web/lib/e2b/execution-tools.ts:278-284).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Web, Mobile, Chrome sandbox and Desktop device steps ride a cloud turn, so a signed-in account is required. CLI and VS Code file tools run locally; sign-in need depends on the model route (unknown). |
| Permissions | Desktop: filesystem.read and filesystem.write capabilities plus per-command prompts and workspace containment (apps/desktop/electron/runtime/dispatcher.ts:665-690). Workspace admins can switch device capabilities off (apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:3714). |
| Subscription | Sandbox and compute are metered by a compute rate card (apps/web/lib/e2b/compute-metering.ts); plan names for access: none found in the files read. Device steps: none found in the code. |
| Limits and metering | Sandbox read cap 200,000 bytes; output cap 100,000 bytes returned with the full text kept up to 900,000 characters (apps/web/lib/e2b/types.ts:117-120). Device step result up to 24,000 characters. search_files 8 results. |
| Feature flags | AGI_E2B_EXECUTION (must be 1), E2B_API_KEY, AGI_MANAGED_COMPUTE_PRIVATE_BETA (on when unset) (apps/web/lib/e2b/gate.ts:8-14, :20-27; brief S57.05). |
| Model compatibility | Sandbox tools need a tool-capable, streaming turn (apps/web/lib/e2b/execution-tools.ts:258-266). |
| Provider restrictions | Sandbox: any provider routes to it; else provider-native code tools only for three providers (apps/web/lib/e2b/execution-tools.ts:216-235). |
| Local mode | CLI Local mode: file tools run on the device. Desktop and Mobile on-device models: tool use not established (unknown). Mobile code and files are Cloud only (apps/mobile/src/features/settings/capabilities/index.tsx:~160 'Cloud only'). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| No folder granted | Workspace tools are not offered; a step that still arrives is refused. | packages/contracts/local-runtime/src/device-steps.ts:562-571 |
| Sandbox switch off | 'Tool <name> is not available.' returned to the model as unavailable. | apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:2801-2809 |
| Account switched off code execution | Message tells the model to say the setting is off and where to turn it on. | apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:2830-2842 |
| Edit old text missing or repeated | Error to the model with a hint to add context. | apps/web/lib/e2b/execution-tools.ts:~335-350 |
| File too large to read | Error with the byte limit. | apps/web/lib/e2b/execution-tools.ts:195-205 |
| Temporary chat | search_files says it does not search files. | apps/web/lib/server/tools/file-search-tool.ts:51 |
| File still being read | 'This file is still being read... Try again in a moment.' | apps/web/lib/server/tools/file-search-tool.ts:~56 |
| Cancel and offline | Device step wait and cancel: not read; unknown. | unknown |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `packages/contracts/local-runtime/src/__tests__/device-steps.test.ts`: Step definitions and argument limits.
- `apps/web/lib/device-steps/__tests__/device-tools.test.ts`: Which tools are offered for a declaration.
- `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.device-tools.test.ts`: Header declaration trust per surface.
- `apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.device-step.test.ts`: Handing a device step back.
- `apps/desktop/electron/__tests__/dispatcher.test.ts`: Command to capability mapping and prompts.
- `apps/desktop/electron/__tests__/filesystemService.test.ts`: File operations.
- `apps/web/lib/e2b/__tests__/execution-tools.test.ts`: Sandbox tools and path confinement.
- `apps/web/lib/e2b/__tests__/gate.test.ts`: Sandbox switch logic.
- `apps/web/lib/server/tools/file-search-tool.test.ts`: Server file search.
- `packages/ui/unified-chat/src/components/__tests__/ToolCallCard.fileDiff.test.tsx`: Diff card.

**Test scenarios**

- **Desktop edit**
  1. On Desktop grant a folder with a text file.
  2. Ask to change one word.
  3. Approve the prompt.
  - Expected: A card shows the diff and the file changes on disk.
- **Outside the grant**
  1. Ask Desktop to read a file outside the folder.
  - Expected: The step is refused and the model explains.
- **Web sandbox off**
  1. On Web ask to write a file in the sandbox.
  - Expected: Not-available message; the model says files cannot be written yet.
- **Uploaded file search**
  1. On Web upload a file, start a new chat, ask about its content.
  - Expected: search_files card shows excerpts with the file name.
- **Duplicate passage**
  1. In the CLI ask to edit text that appears twice.
  - Expected: Edit fails and the model adds context.

**Where to look when it fails**

- Tool audit events with event type tool_executed or computer_use_action (apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:3500-3545).
- Message 'Tool <name> is not available.' points at the sandbox flag.
- Dispatcher prompt reason strings.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/057-tool-catalog-and-invocation-experience.md](../../70-qa/test-plans/web/057-tool-catalog-and-invocation-experience.md)
- Desktop: [70-qa/test-plans/desktop/057-tool-catalog-and-invocation-experience.md](../../70-qa/test-plans/desktop/057-tool-catalog-and-invocation-experience.md)
- Mobile: [70-qa/test-plans/mobile/057-tool-catalog-and-invocation-experience.md](../../70-qa/test-plans/mobile/057-tool-catalog-and-invocation-experience.md)
- CLI: [70-qa/test-plans/cli/057-tool-catalog-and-invocation-experience.md](../../70-qa/test-plans/cli/057-tool-catalog-and-invocation-experience.md)
- VS Code: [70-qa/test-plans/vscode/057-tool-catalog-and-invocation-experience.md](../../70-qa/test-plans/vscode/057-tool-catalog-and-invocation-experience.md)
- Chrome: [70-qa/test-plans/chrome/057-tool-catalog-and-invocation-experience.md](../../70-qa/test-plans/chrome/057-tool-catalog-and-invocation-experience.md)

## 10. Gaps and dependencies

- **Sandbox file tools are off in production so Web, Mobile, Chrome and API cannot read, write or edit files.** Affects: Web, Mobile, Chrome, API. Evidence: brief S57.05/S57.06/S57.12 Unfinished; apps/web/lib/e2b/gate.ts:20-27. Work needed: Set AGI_E2B_EXECUTION=1 and E2B_API_KEY, confirm compute price, redeploy, live check.
- **Brief says dispatcher.ts:724 and similar; the file has moved and cites are stale.** Affects: Documentation. Evidence: apps/desktop/electron/runtime/dispatcher.ts:665-700 and 2337. Work needed: Update brief references.
- **Trash-before-overwrite on Desktop writes was not verified.** Affects: Desktop. Evidence: AGENTS.md section 9 requires it; writeTextFile read not done. Work needed: Read filesystemService.ts writeTextFile and add a test if missing.

**Depends on**

- SYS-agents-tools-and-automation
- SYS-files-artifacts-and-storage
- SYS-execution-boundaries
- SYS-security-and-privacy
- SYS-authorization-and-workspaces
- surface:desktop
- surface:web
- surface:mobile
- surface:cli
- surface:vscode
- surface:chrome
- mode:cloud
- mode:local
- file:packages/contracts/local-runtime/src/device-steps.ts

## Unknown

- Whether Desktop overwrites go to Trash first.
- Exact timeout for device steps waiting on the desktop.
- Plan names that unlock sandbox compute.
- Whether a Mobile or Chrome app shows any sign that the sandbox is off.
- How VS Code diff review ties to file writes beyond ChatStateManager.ts:3301-3327.

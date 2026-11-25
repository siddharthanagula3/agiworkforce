---
id: "F070-06"
type: "feature"
title: "Local folders and files"
aliases: ["Approved folders", "Workspace roots", "Local access", "Attach from a local folder", "Local filesystem search", "Local filesystem editing", "Persistent folder access", "Native file picker", "S70.11", "S70.12", "S70.13", "S70.14"]
area: "70 Desktop application"
available_on: ["desktop"]
implementation: {web: "n/a", desktop: "built", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "not seen by a person", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S70.11", "S70.12", "S70.13", "S70.14"]
depends_on: ["surface:desktop", "file:apps/desktop/electron/runtime/workspaceStore.ts", "file:apps/desktop/electron/runtime/filesystemService.ts", "store:desktop-workspaces.json", "store:desktop-permissions.json", "api:POST /api/llm/v1/chat/completions", "SYS-files-artifacts-and-storage", "SYS-execution-boundaries", "SYS-security-and-privacy", "SYS-agents-tools-and-automation", "SYS-authorization-and-workspaces"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F070-06 Local folders and files

The desktop app lets the user approve folders through the operating system folder dialog. Approved folders are saved across launches and can be revoked. The assistant can list, search names and contents, read, create and change files inside them after a native permission prompt.

Area: [70. Desktop application](README.md). Requirement items: [S70.11](../../10-requirements/capabilities/070-desktop-application.md#s7011), [S70.12](../../10-requirements/capabilities/070-desktop-application.md#s7012), [S70.13](../../10-requirements/capabilities/070-desktop-application.md#s7013), [S70.14](../../10-requirements/capabilities/070-desktop-application.md#s7014).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | does not apply | does not apply | n/a |
| Desktop | built | built | not seen by a person |
| Mobile | does not apply | does not apply | n/a |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Keeps a list of approved folders, lets the user attach files from them, and runs file steps (list, read, name search, text search, write, edit, delete) inside them for the person or a cloud turn. (workspaceStore.ts:100-242, dispatcher.ts:2312-2380)

**Why it exists.** Briefs S70.11 to S70.14. The cloud cannot reach the disk, so the device does the file work under permission prompts (device-steps.ts header comment).

**Who uses it.** Desktop users who want the assistant to work with local documents or code.

**Problems it solves**

- Attach local files without uploading whole folders.
- Find files by name or content.
- Let the assistant edit files without giving it the whole disk.

**Use cases**

- Attach a file from a local folder in the composer.
- Ask 'find invoices in this folder'.
- Ask the assistant to edit a Markdown file; approve the write prompt.
- Revoke a folder in Settings when a project ends.

## 2. User experience

**Where to find it**

- Desktop only. Composer attach picker offers a local folder: dialog titled 'Attach from a local folder' (LocalFolderAttachDialog.tsx:25). Settings > Capabilities > 'Local access' section with 'Folders', 'Commands', 'Permissions' (LocalAccessSection.tsx:37-58). File > 'Open Folder' (appMenu.ts:174-178).

**Before you start**

- Desktop app (the page must run in the shell).
- A folder that is not the system, the whole home folder, or where sign-ins and keys are kept (workspaceStore.ts:151-157).

**Screens and controls**

- Button 'Choose a folder' in the attach dialog; button 'Add a folder' in Local access (LocalFolderAttachDialog.tsx:368, LocalAccessSection.tsx:55).
- Search field 'Search this folder' with placeholder 'Search names and text'; headings 'Matching names' and 'Matching text'; 'Clear search' (LocalFolderAttachDialog.tsx:34-39).
- Folder chips with a remove control and a reveal action; permissions list with 'Withdraw' (LocalAccessSection.tsx:58-64).
- Native permission dialog for read or write per folder; 'always' grants are saved for non-high-risk capabilities (permissionCore.ts:57-71).

**Journey**

1. Open the attach picker and choose a local folder; the OS folder dialog opens (dispatcher.ts:1387-1411).
2. The folder is checked, saved and shown as a chip (workspaceStore.ts:145-172).
3. Browse or search the folder; results list names and matching text lines.
4. Choose a file: it is read and attached (LocalFolderAttachDialog.tsx:229-243).
5. Ask the assistant to change a file; the first write asks for permission for that folder; the edit then runs and any replaced file's earlier copy goes to the Trash (main.ts:2674, filesystemService.ts:614-650).
6. Revoke the folder in Local access: work running in it is stopped after a prompt, the folder is removed and all grants on it are withdrawn (dispatcher.ts:2316-2321, workspaceStore.ts:224-236).

**What the person sees and gets**

- 'That folder was not approved.' 'That folder was not removed.' 'Approved folders could not be read.' (LocalAccessSection.tsx:51-53).
- 'No folders are approved yet. Choose one, and Desktop asks your permission before it reads anything inside.' (LocalFolderAttachDialog.tsx:26-27).
- Refusal text for a banned location (workspaceStore.ts:153-155).
- 'That workspace is no longer approved. Choose the folder again.' (dispatcher.ts:632).
- 'Workspace <name> is no longer reachable.' when the folder is gone (pathGuard.ts:119-121).

**Settings**

- Settings > Capabilities > Local access (CapabilitiesSection.tsx:12, :213).
- Worktree location and shell policy are separate features.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Folder pick uses the OS open-directory dialog; cancel returns a message (dispatcher.ts:1387-1411).
- Approved folders are saved to a file in the user data folder and loaded at start; a stored root on a banned path is dropped (workspaceStore.ts:36-90).
- List roots newest first; revoke removes the root, its worktrees and every grant on it (workspaceStore.ts:100-104, :224-236).
- Name search uses a glob and text search scans text files, skipping credential-named files, large and binary files (filesystemService.ts:890-957).
- Reads and edits are resolved inside the root; traversal and outside-root paths are refused (pathGuard.ts:108-135).
- Writes need filesystem.write; reads need filesystem.read, and a write grant implies read (dispatcher.ts:683-694, permissionCore.ts:21-24).
- Replaced files keep a previous copy that goes to the Trash (main.ts:2674, filesystemService.ts:614-650).
- The cloud model's file tools map to the same commands and capabilities (device-steps.ts:131-171).
- Declaration to the cloud lists a file capability only when some folder is not denied (dispatcher.ts:2252-2282).

**Incomplete**

- When an approved folder is deleted on disk, the message is 'no longer reachable', not an instruction to choose again; the 'choose again' text appears only for an unknown root id (pathGuard.ts:119-121, dispatcher.ts:632).
- The brief's claim that folder storage is unconfirmed is out of date: storage is confirmed in desktop-workspaces.json (workspaceStore.ts:36).

**Present but disconnected or switched off**

- Local shell execution in an approved folder (S70.15) is a separate feature; it shares the root list.

**Not available**

- Folder access on web, mobile, CLI, VS Code, Chrome: the doc matrix lists filesystem absent on web, mobile and Chrome and unverified for CLI and VS Code (doc: docs/product/surface-feature-matrix.md:522-531).

## 4. Required behaviour

**Established requirements**

- Choosing files or folders opens the operating system's own file dialog. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S70.11)
- A folder the user approves stays approved across launches and can be reviewed and revoked. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S70.12)
- The user or assistant can search approved local folders by file name or content. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S70.13)
- The assistant can create or change files in an approved folder after a permission prompt. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S70.14)
- Search covers only approved folders; a missing approved folder tells the user to choose it again. (source: task Should list for F070-06)
- An agent never destroys user data on its own; a removed or overwritten file goes to the Trash first. (source: doc: AGENTS.md section 9)
- The desktop provides approved local files and tools. (source: doc: docs/product/requirements.md:80)

**Acceptance criteria**

1. Choose a folder: the OS dialog opens and the folder shows as approved after relaunch.
2. Search a name and a word in the folder: both result lists appear; a file outside the folder never appears.
3. Ask the assistant to edit a file: a permission prompt appears first; after Allow, the file changes and the earlier version is in the Trash.
4. Revoke the folder: it disappears and the assistant gets 'no longer approved' on the next file step.
5. Try to approve the home folder: refused with the explanation.
6. Rename the approved folder on disk and search: the user sees a clear message that the folder is not reachable.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- A 'once' grant is used once and removed (isSingleUse, permissionCore.ts:87-89) [inferred from names].
- Search results are capped by MAX_LIST_ENTRIES and MAX_GREP_MATCHES (filesystemService.ts:896-945).

**Proposed improvements** (suggestions, not requirements)

- [proposed] When a root is unreachable, show the 'choose it again' action with a re-pick button.
- [proposed] Show a count of grants per folder in Local access.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | workspaceStore | `apps/desktop/electron/runtime/workspaceStore.ts` | Approved folder list, grant, revoke (workspaceStore.ts:100-242). |
| service | filesystemService | `apps/desktop/electron/runtime/filesystemService.ts` | List, read, write, edit, delete, glob, grep (filesystemService.ts:261-957). |
| service | pathGuard | `apps/desktop/electron/runtime/pathGuard.ts` | Keeps paths inside the root and refuses credential files (pathGuard.ts:108-202). |
| service | dispatcher file commands | `apps/desktop/electron/runtime/dispatcher.ts` | workspace_*, file_* commands, permission map, folder dialog (dispatcher.ts:628-700, :1387-1411, :2312-2380). |
| service | permissionManager and permissionCore | `apps/desktop/electron/runtime/permissionManager.ts` | Grants per capability and folder; persistence rules (permissionCore.ts:21-89). |
| config | device step definitions | `packages/contracts/local-runtime/src/device-steps.ts` | Cloud-facing tool names for file steps (device-steps.ts:131-171). |
| service | device-steps client | `apps/web/features/desktop-host/lib/device-steps.ts` | Runs file steps from a cloud turn. |
| component | LocalFolderAttachDialog | `apps/web/features/desktop-host/components/LocalFolderAttachDialog.tsx` | Pick, browse, search and attach (LocalFolderAttachDialog.tsx:25-372). |
| component | LocalAccessSection | `apps/web/features/desktop-host/components/LocalAccessSection.tsx` | Folders list, add and revoke, permissions list (LocalAccessSection.tsx:37-65). |
| component | CapabilitiesSection | `apps/web/features/settings/sections/CapabilitiesSection.tsx` | Hosts the Local access section (CapabilitiesSection.tsx:12, :213). |
| component | ChatComposerNew | `apps/web/features/chat/components/Composer/ChatComposerNew.tsx` | Opens the attach dialog (ChatComposerNew.tsx:7024). |
| store | desktop-workspaces.json | `apps/desktop/electron/runtime/workspaceStore.ts` | File in the user data folder holding approved folders (workspaceStore.ts:36-38). |
| store | desktop-permissions.json | `apps/desktop/electron/runtime/permissionManager.ts` | File holding persistent grants (permissionManager.ts:46-48). |
| service | previous version keeper | `apps/desktop/electron/main.ts` | Sends replaced file copies to the Trash (main.ts:2674). |
| service | request-processor device tools | `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts` | Offers file tools to the cloud model (request-processor.ts:6359-6362). |
| test | workspaceStore test | apps/desktop/electron/runtime/__tests__/workspaceStore.test.ts (not found) (not found) | Grant, persistence, revoke. |
| test | filesystemService test | apps/desktop/electron/runtime/__tests__/filesystemService.test.ts (not found) (not found) | File operations. |
| test | pathGuard test | apps/desktop/electron/runtime/__tests__/pathGuard.test.ts (not found) (not found) | Root escape refusal. |
| test | LocalFolderAttachDialog test | `apps/web/features/desktop-host/__tests__/LocalFolderAttachDialog.test.tsx` | Dialog behaviour. |
| test | LocalAccessSection test | `apps/web/features/desktop-host/__tests__/LocalAccessSection.test.tsx` | Folders and permissions section. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The page calls workspace_pick_root over the bridge; main opens the OS folder dialog. | device | dispatcher.ts:1387-1411 |
| The chosen path is resolved, checked against banned locations, saved with a new id and returned. | device | workspaceStore.ts:145-172 |
| A file step first checks the capability for that folder and shows a native prompt when no answer exists. | device | dispatcher.ts:668-700, permissionManager.ts |
| The file step runs inside the root and returns text or entries. | device | dispatcher.ts:2335-2375, filesystemService.ts |
| For a cloud turn the model asks for device_find_files or device_write_file; the page runs it locally and returns the result to the cloud model. | our servers | device-steps.ts:131-171, request-processor.ts:6359-6362 |
| A file attached from a folder is read locally and uploaded like any attachment when sent. | our servers | LocalAccessSection.tsx:47-48 intro text; upload code not opened |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Approved folder list (id, path, name, times) | desktop-workspaces.json in the user data folder (workspaceStore.ts:36-38) | no sync found | Kept until revoked; revoke rewrites the file and drops grants (workspaceStore.ts:224-236). |
| Permission grants and refusals | desktop-permissions.json (permissionManager.ts:46-48) | no sync found | Persistent 'always' decisions kept; session grants lost on quit; revoke on folder removes them. |
| Earlier versions of replaced files | temporary copy then the operating system Trash (filesystemService.ts:632-650) | no | In the Trash until the user empties it. |
| File contents sent to the model | cloud conversation storage when the model reads a file and the result goes back | yes through the account [inferred] | unknown |

**Models and providers.** File steps are model-neutral device tools offered to a cloud model through the chat route. Which models and providers support tool calls is outside this feature (SYS-model-catalog-and-routing). The folder dialog and local search involve no model.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | The attach dialog and Local access sit in the signed-in app; the file code itself needs no account. |
| Permissions | Per folder: filesystem.read, filesystem.write (write implies read); first use prompts; 'always' can be saved (permissionCore.ts:21-24, :57-63). No OS permission needed for user-chosen folders [inferred]; macOS may prompt for protected folders, not established. |
| Subscription | none found in the desktop code. Cloud side offers device tools without a plan check seen in request-processor.ts:3708-3716 (workspace controls only); full entitlement rule unknown. |
| Limits and metering | Search result caps and text read cap exist (filesystemService.ts constants not opened for values). Chat usage for model-driven steps is metered by the pipeline. |
| Feature flags | Chat composer toggle deviceStepsEnabled turns file tools off per conversation (host-headers.ts:28-32). |
| Model compatibility | Needs tool calling for model-driven steps; direct attach and search work with no model. |
| Provider restrictions | none found in the desktop code. |
| Local mode | Choosing, searching, attaching and revoking folders run fully on the device and need no plan. Model-driven file work reaches the model through a cloud chat request in the code found; on-device model use of file steps is not established. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Empty | Copy says no folders are approved and offers 'Choose a folder'. | LocalFolderAttachDialog.tsx:26-27, :366-372 |
| Empty folder | 'Nothing here that can be attached.' | LocalFolderAttachDialog.tsx:28 |
| Cancelled dialog | A cancel message is returned and no folder is added. | dispatcher.ts:1405-1408 |
| Banned location | Refused with a plain explanation. | workspaceStore.ts:151-157 |
| Folder missing on disk | 'Workspace <name> is no longer reachable.' | pathGuard.ts:119-121 |
| Root revoked while in use | Next step fails with 'no longer approved'. | dispatcher.ts:628-635 |
| Corrupt store | Treated as empty; grants nothing. | workspaceStore.ts:84-86 |
| Save failure | 'Could not save approved folders. Try again.' | workspaceStore.ts:93-97 |
| Search cancelled or superseded | Older search result is ignored. | LocalFolderAttachDialog.tsx:199-213 |
| Unsupported file type | Message that the chat does not accept that type. | LocalFolderAttachDialog.tsx:232-236 |
| Offline | File steps run locally; the chat upload needs the network [inferred]. | filesystemService.ts uses local disk only |
| Credential files | Skipped in text search and refused by the file commands. | filesystemService.ts:938, pathGuard.ts:136-145 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- apps/desktop/electron/runtime/__tests__/workspaceStore.test.ts (not found) (not found): Grant, persistence and revoke of approved folders.
- apps/desktop/electron/runtime/__tests__/filesystemService.test.ts (not found) (not found): List, read, write, edit, search.
- apps/desktop/electron/runtime/__tests__/pathGuard.test.ts (not found) (not found): Path containment and denied files.
- apps/desktop/electron/runtime/__tests__/permissionManager.test.ts (not found) (not found): Grant storage and withdrawal.
- apps/desktop/electron/runtime/__tests__/permissionCore.test.ts (not found) (not found): Evaluation and high-risk rules.
- `apps/desktop/electron/__tests__/workspacePicker.test.ts`: Folder picker behaviour.
- `apps/web/features/desktop-host/__tests__/LocalFolderAttachDialog.test.tsx`: Attach dialog.
- `apps/web/features/desktop-host/__tests__/LocalAccessSection.test.tsx`: Local access section.
- `packages/contracts/local-runtime/src/__tests__/device-steps.test.ts`: Device step contract.

**Test scenarios**

- **Approve and persist**
  1. Open the attach picker and choose a project folder.
  2. Quit and relaunch.
  3. Open Settings > Capabilities > Local access.
  - Expected: The folder is still listed.
- **Search**
  1. Choose a folder with known files.
  2. Search for a file name and for a word inside a file.
  - Expected: 'Matching names' and 'Matching text' lists show the right entries; nothing from other folders.
- **Edit with prompt**
  1. Ask the assistant to change a line in a file.
  2. Observe the prompt, choose Allow.
  - Expected: Prompt precedes the change; the file changes; the earlier version is in the Trash.
- **Revoke**
  1. Revoke the folder in Local access.
  2. Ask the assistant to read a file in it.
  - Expected: The step is refused as no longer approved; asking to attach asks to choose again.
- **Banned folder**
  1. Try to approve the home folder.
  - Expected: Refusal text appears; nothing is saved.
- **Missing folder**
  1. Approve a folder, rename it in Finder, search it.
  - Expected: A clear message that the folder is not reachable.

**Where to look when it fails**

- Error classes PathRefused (reason traversal, outside-workspace, denied-file, shared-file, io-error) (pathGuard.ts:13-24).
- WorkspaceGrantRefused and StoreWriteError messages (workspaceStore.ts:93-97, :151-155).
- Files desktop-workspaces.json and desktop-permissions.json in the user data folder.
- No run results recorded in files read.

**Hands-on test plans**

- Desktop: [70-qa/test-plans/desktop/070-desktop-application.md](../../70-qa/test-plans/desktop/070-desktop-application.md)

## 10. Gaps and dependencies

- **A deleted or renamed approved folder says 'no longer reachable', not 'choose it again', and the root stays listed.** Affects: Desktop users with moved folders. Evidence: pathGuard.ts:119-121 vs task Should line. Work needed: Add re-pick or remove action on unreachable roots.
- **Brief says storage is not confirmed; code confirms it, so the brief and docs are out of date.** Affects: Docs. Evidence: workspaceStore.ts:36-38. Work needed: Update the brief.
- **Brief cites device-steps.ts:225-233 in web lib for search, which is screen-step code; the search tools are defined in the contract at device-steps.ts:158-171.** Affects: Docs. Evidence: apps/web/features/desktop-host/lib/device-steps.ts:140-160. Work needed: Correct the references.
- **Entitlement and plan rule for model-driven file tools is not established.** Affects: Billing and access. Evidence: no plan check found in desktop code. Work needed: Read cloud entitlement code.

**Depends on**

- surface:desktop
- file:apps/desktop/electron/runtime/workspaceStore.ts
- file:apps/desktop/electron/runtime/filesystemService.ts
- store:desktop-workspaces.json
- store:desktop-permissions.json
- api:POST /api/llm/v1/chat/completions
- SYS-files-artifacts-and-storage
- SYS-execution-boundaries
- SYS-security-and-privacy
- SYS-agents-tools-and-automation
- SYS-authorization-and-workspaces

## Unknown

- Numeric values of the search and read caps (constants not opened).
- Whether macOS asks its own permission for protected folders chosen by the user.
- How a sent file is stored and for how long.
- Whether on-device model turns can call file tools.
- Whether the Local access list shows unreachable folders differently.
- Subscription rule for model-driven file edits.

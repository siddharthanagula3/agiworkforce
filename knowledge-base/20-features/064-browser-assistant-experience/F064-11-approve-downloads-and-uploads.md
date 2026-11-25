---
id: "F064-11"
type: "feature"
title: "Approve downloads and uploads"
aliases: ["Download review", "Upload review", "download_file", "upload_file", "browser_download", "Download a file", "Approve file upload", "Open Downloads folder", "Allow sends the selected files to AGI Cloud for inspection"]
area: "64 Browser-assistant experience"
available_on: ["desktop", "chrome"]
implementation: {web: "missing", desktop: "partial", mobile: "missing", cli: "missing", vscode: "n/a", chrome: "built"}
verification: {web: "n/a", desktop: "not seen by a person", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "not seen by a person"}
requirement_items: ["S64.26", "S64.27"]
depends_on: ["surface:chrome", "surface:desktop", "mode:cloud", "SYS-files-artifacts-and-storage", "SYS-security-and-privacy", "SYS-execution-boundaries", "SYS-subscriptions-entitlements-and-usage", "F064-08", "F064-12", "file:apps/extension/src/features/computer-use/approvalPolicy.ts", "file:apps/extension/src/features/browser-tools/downloads.ts", "file:apps/extension/src/features/computer-use/userFileUpload.ts"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F064-11 Approve downloads and uploads

Before the assistant downloads or uploads a file the person must approve it. In Chrome a card asks for each download, and an upload card makes the person choose the files, which are sent to AGI Cloud for inspection before they go to the site. Desktop asks before a download in the paired Chrome and lists it. CLI has neither.

Area: [64. Browser-assistant experience](README.md). Requirement items: [S64.26](../../10-requirements/capabilities/064-browser-assistant-experience.md#s6426), [S64.27](../../10-requirements/capabilities/064-browser-assistant-experience.md#s6427).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | not built | not built | n/a |
| Desktop | partly built | partly built | not seen by a person |
| Mobile | not built | not built | n/a |
| CLI | not built | not built | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | partly built (this page lists unfinished parts) | built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Puts the person between the assistant and any file leaving or entering their computer through a website: downloads are approved and listed; uploads need the person to pick the files and approve them.

**Why it exists.** A downloaded file lands on the person's computer and an upload sends their data to a site. Both are hard to undo, so the product asks every time.

**Who uses it.** Chrome extension users and Desktop users whose assistant works on websites.

**Problems it solves**

- A page or model silently saving files to the computer.
- A model choosing which local file to send to a site.
- Not knowing which files were downloaded.

**Use cases**

- Ask Chrome to download an invoice PDF; approve the card; read the completed result.
- Ask the assistant to attach a resume on a form; choose the file in the card and press Allow.
- In Desktop chat the model downloads a file through the paired Chrome; a 'Check this step' prompt names the address.
- In the Desktop dialog the person runs 'Download a file' and opens the Downloads folder afterwards.

## 2. User experience

**Where to find it**

- Chrome side panel: approval card titled 'Approve action: download_file' or 'Approve file upload' with buttons Allow, 'Allow for this task' (not for these two), 'Skip' and a file picker 'Choose files to upload' (apps/extension/src/features/side-panel/computerUsePanel.ts:879-1000).
- Desktop web dialog: action 'Download a file' with field 'Address', section 'Downloads' and button 'Open Downloads folder' (apps/web/features/desktop-host/components/BrowserToolsDialog.tsx:83, 40-41, 451-476).
- Desktop prompt 'Check this step' with 'Deny' and 'Allow once' for a cloud-chat download (apps/desktop/electron/browser/browserSteps.ts:119-132).
- Chrome: site permission capabilities automation, upload and download for org policy (packages/contracts/types/src/site-policy.ts:5).

**Before you start**

- Chrome: signed-in account, site approved for browser control, the site allowed for the download or upload capability.
- Desktop: AGI Desktop running with Chrome paired.
- Uploads: the person must choose the files themselves in the card.

**Screens and controls**

- Chrome card with description, buttons and, for uploads, a file chooser and a list of 'name · N bytes'.
- Desktop dialog result 'Downloading <filename>.' and a list of completed download addresses.
- Desktop native prompt buttons Deny and 'Allow once'.

**Journey**

1. Download in Chrome: the model calls download_file with a url; the action always asks (apps/extension/src/features/computer-use/approvalPolicy.ts:358); the person presses Allow; Chrome downloads; the loop waits for completion and reports state and bytes (agentLoop.ts:939-963).
2. Upload in Chrome: the model calls upload_file with the index of a file input; the card appears; the person chooses files; Allow sends them to AGI Cloud for inspection, then the approved contents are put into the page's file input (computerUsePanel.ts:925-935, 1004-1040; agentLoop.ts:900-937).
3. A click or typing on a file input is also treated as an upload and asks (approvalPolicy.ts:376-378).
4. Desktop chat: the model calls device_browser_download; Desktop shows 'Check this step' with 'Download <address>'; on Allow once the paired Chrome starts the download (browserSteps.ts:49-55, 161-167).
5. Desktop dialog: choose 'Download a file', type an address, Run, answer the prompt, read 'Downloading <filename>.'

**What the person sees and gets**

- Chrome download result 'Chrome download state: complete; received N bytes' or in progress or interrupted (agentLoop.ts:953-960).
- Chrome upload result 'Selected N approved file(s)... The selected bytes were verified. This does not verify website receipt' (agentLoop.ts:928-930).
- Upload card text 'Allow sends the selected files to AGI Cloud for inspection, then sends their approved contents to <origin>. Choosing files sends nothing.' (computerUsePanel.ts:929).
- After a skip with inspection started: 'No file was sent to the website. Files may already have reached AGI Cloud for inspection.' (computerUsePanel.ts:978-985).
- Desktop activity row with target address and a Downloads list (BrowserToolsDialog.tsx:451-464).

**Settings**

- Chrome admin and user site policy has separate 'download' and 'upload' capabilities (packages/contracts/types/src/site-policy.ts:5).
- Chrome option 'Browser control' mode: downloads and uploads ask in every mode that can ask; unattended runs refuse them (apps/extension/src/features/computer-use/askBeforeActing.ts:40-52; background.ts:6506).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Chrome: download_file and upload_file are defined; both are always-ask and crucial, so they ask even in Auto mode (apps/extension/src/features/computer-use/approvalPolicy.ts:358-359; apps/extension/src/features/computer-use/crucialActions.ts:20-24).
- Chrome: Allow for this task is withheld for always-ask actions (background.ts:6552 canAllowForTask: !alwaysAsk).
- Chrome: a download needs the download capability on the page and on the file address, and only http or https (apps/extension/src/features/browser-tools/downloads.ts:245-260).
- Chrome: completion is read from Chrome with bytes, interrupted or in-progress states, bounded to 5 s (downloads.ts:5-8; agentLoop.ts:939-963; apps/extension/__tests__/browser-download-completion.test.ts).
- Chrome: uploads need the upload capability and check the site policy again before setting the file (apps/extension/src/features/computer-use/cdpDriver.ts:1032, 1067; agentLoop.ts:1457-1466).
- Chrome: upload binds the approval to run, tab, URL, target signature and account owner, and rejects a mismatched binding (apps/extension/src/features/computer-use/userFileUpload.ts:27-35; agentLoop.ts:910-917; apps/extension/__tests__/browser-upload-approval-binding.test.ts).
- Chrome: the model never supplies a path or bytes; only the file input index (browserToolDefinitions.ts:451-470).
- Desktop: browser_download is planned with a labelled address and always raises a review prompt in cloud chat (apps/desktop/electron/browser/commandGate.ts:279-288; browserSteps.ts:52, 161-167) and the paired Chrome downloads it, honouring workspace rules (apps/extension/src/features/native-bridge/desktopCommands.ts:217-225).
- Desktop dialog lists successful downloads and opens the Downloads folder (BrowserToolsDialog.tsx:448-476; dispatcher.ts:2637-2640).

**Incomplete**

- Desktop: the prompt appears for cloud-chat downloads and the manual dialog, but a local client such as the CLI would not get a second dialog because the client is said to have asked already (dispatcher.ts:2203-2207) [CLI has no download tool anyway].
- Download list in Desktop shows only the address from the activity entry, not file names or paths (BrowserToolsDialog.tsx:454-463).
- The Chrome download ledger holds 50 records in session storage and is not shown as a list to the person (downloads.ts:5-6); the brief says 'listed so the user can review them'.

**Present but disconnected or switched off**

- Chrome file-input interaction via click or type is routed to the upload path and not performed directly (approvalPolicy.ts:376-378; browser-control-contract.test.ts:86-95).

**Not available**

- Web (ordinary tab), Mobile: no browser downloads or uploads.
- CLI and VS Code: no download or upload browser tool (apps/cli/src/platform/runtime/tool_catalog.rs:46-57).
- Desktop upload to a website: none found.
- Desktop pane downloads: not examined; the pane session handles permissions but no download handler was found in browserPane.ts [unknown].

## 4. Required behaviour

**Established requirements**

- Files the assistant downloads are approved and listed so the user can review them. (source: brief S64.26)
- Before the assistant uploads a file to a website the user reviews and approves it. (source: brief S64.27)
- No sensitive action without user approval; high-impact actions confirm. (source: doc: docs/product/requirements.md (section 21.4))
- Downloads always need approval (Chrome). (source: code: apps/extension/src/features/computer-use/approvalPolicy.ts:358)

**Acceptance criteria**

1. In Chrome, a download asks in Auto, Ask first and Full access modes.
2. In unattended mode a download is refused, not run.
3. The upload card's Allow button stays disabled until a file is chosen.
4. Choosing files in the upload card sends nothing.
5. Skipping an upload after inspection began says files may already have reached AGI Cloud.
6. A page with a denied download capability cannot receive a download even if approved.
7. In Desktop, a cloud-chat download shows a prompt that names the address and stops on Deny.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The Chrome ledger is the basis for 'listed' downloads but no UI that lists it was found [inferred].
- The wording that uploads go to AGI Cloud for inspection means file contents leave the device before the site gets them; that is a privacy point the person must see [inferred from computerUsePanel.ts:929].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Show a download list in the Chrome panel from the ledger.
- [proposed] Add download and upload tools to the CLI path with the same approvals.
- [proposed] Say in the card which model route inspects the files.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | Approval policy | `apps/extension/src/features/computer-use/approvalPolicy.ts` | download and upload always-ask; file input detection. |
| config | Crucial actions | `apps/extension/src/features/computer-use/crucialActions.ts` | Marks download and upload as crucial. |
| service | Ask before acting | `apps/extension/src/features/computer-use/askBeforeActing.ts` | Mode logic. |
| service | Agent loop | `apps/extension/src/features/computer-use/agentLoop.ts` | download_file (939), upload_file (900), upload policy check (1457). |
| service | Downloads | `apps/extension/src/features/browser-tools/downloads.ts` | Start, track and complete downloads; ledger of 50. |
| service | User file upload | `apps/extension/src/features/computer-use/userFileUpload.ts` | Upload binding, inspection through managed attachments, resolved files. |
| service | CDP driver | `apps/extension/src/features/computer-use/cdpDriver.ts` | uploadUserFiles with policy checks (1032, 1067) and download-link handling (1369-1380). |
| component | Approval card | `apps/extension/src/features/side-panel/computerUsePanel.ts` | buildBrowserApprovalCard with file chooser. |
| service | Background approval | `apps/extension/src/background.ts` | onBeforeAction (6490-6600) and approval timeout. |
| schema | Site policy | `packages/contracts/types/src/site-policy.ts` | Capabilities automation, upload, download. |
| service | Desktop commands in Chrome | `apps/extension/src/features/native-bridge/desktopCommands.ts` | browser_download via START_DOWNLOAD with site rules (217). |
| service | Command planner | `apps/desktop/electron/browser/commandGate.ts` | browser_download plan (279-288). |
| service | Browser step runner | `apps/desktop/electron/browser/browserSteps.ts` | Forces a review prompt for downloads (52). |
| schema | Device step definitions | `packages/contracts/local-runtime/src/device-steps.ts` | device_browser_download (285). |
| component | BrowserToolsDialog | `apps/web/features/desktop-host/components/BrowserToolsDialog.tsx` | Download a file action and Downloads list. |
| service | Desktop dispatcher | `apps/desktop/electron/runtime/dispatcher.ts` | browser_downloads_open opens the Downloads folder (2637). |
| test | Upload approval tests | `apps/extension/__tests__/side-panel-upload-approval.test.ts` | Upload card behaviour (name only). |
| test | Upload binding test | `apps/extension/__tests__/browser-upload-approval-binding.test.ts` | Binding of an approval to one action (name only). |
| test | Download completion test | `apps/extension/__tests__/browser-download-completion.test.ts` | Completion states. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The model calls download_file or upload_file. | our servers | apps/extension/src/features/computer-use/cloudAgentClient.ts:306-320 |
| The background decides approval is needed and broadcasts an approve request to the panel; for uploads it binds the request to run, tab, URL and target. | device | apps/extension/src/background.ts:6490-6560 |
| The person presses Allow (and for uploads chooses files). | device | apps/extension/src/features/side-panel/computerUsePanel.ts:1004-1040 |
| For uploads, the chosen files are sent to AGI Cloud for inspection through the managed attachments client. | our servers | apps/extension/src/features/computer-use/userFileUpload.ts:1-14; computerUsePanel.ts:929 |
| The approved bytes are verified and set into the page's file input through the debugger. | device | agentLoop.ts:918-936 |
| A download starts through Chrome's downloads API after site policy allows both the page and the file address; Chrome writes the file. | device | apps/extension/src/features/browser-tools/downloads.ts:245-260 |
| The loop waits for completion for a bounded time and reports the state. | device | downloads.ts:7; agentLoop.ts:945-960 |
| Desktop: cloud-chat download goes browser_step, grant check, review prompt, bridge to Chrome. | device | browserSteps.ts:134-187 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Files the person chooses for upload | read into memory in the side panel, sent to AGI Cloud for inspection, then to the site | yes, to AGI Cloud (inspection) and the website | retention on the server was not traced |
| Downloaded file | the person's Downloads folder chosen by Chrome | no | stays until the person deletes it |
| Download ledger records (id, url, filename, origin, state, bytes) | chrome.storage.session agi_session_downloads | no | 50 records; session storage clears with the browser session (downloads.ts:5-6) |
| Desktop activity entry for the download | Desktop memory | no | lost on close |

**Models and providers.** The model only decides to request a download or upload. Inspection of uploaded files happens on AGI Cloud (the managed attachments service); which model or service inspects them was not traced. The approval, binding and policy checks are model independent.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Chrome requires a signed-in account; uploads use the managed Cloud owner of the run and refuse a different owner (userFileUpload.ts:27-35, 62). |
| Permissions | Site policy capabilities download and upload (site-policy.ts:5); an admin can withhold uploads even on an approved site (agentLoop.ts:1449-1456 comment). Desktop: browser.site capability granted once. |
| Subscription | Upload inspection uses managed chat attachment limits (MAX_CHAT_ATTACHMENT_BYTES and MAX_CHAT_ATTACHMENT_COUNT from the cloud contracts, userFileUpload.ts:1-12). Plan-specific limits: not established. |
| Limits and metering | Attachment size and count limits come from cloud-contracts; download completion wait 5 s; ledger 50; approval timeout applies (computerUsePanel.ts:949). |
| Feature flags | none found in the code |
| Model compatibility | none found |
| Provider restrictions | none found |
| Local mode | Chrome upload inspection requires AGI Cloud, so no Local mode for uploads. Desktop downloads through the paired Chrome run on the device; the cloud-chat trigger depends on the chat's mode. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Approval unanswered | Card becomes 'Skipped (no response)'; for uploads says no file was sent to the site. | computerUsePanel.ts:949-962 |
| Inspection fails | Card shows the error and 'No file was sent to the website.' | computerUsePanel.ts:1034 |
| Download interrupted | Result reports interrupted, not complete; verification fails. | agentLoop.ts:953-960; browser-download-completion.test.ts:162 |
| Download slow | Honest 'in progress' at the 5 s deadline. | browser-download-completion.test.ts:138 |
| Policy denies | Refused with the org's wording or 'This site is not approved for file uploads. Add it in the extension options first.' | agentLoop.ts:1448-1466 |
| Account swapped mid-wait | No further read starts after an account swap. | browser-download-completion.test.ts:198 |
| Desktop deny | Step does not run; message says the user did not allow it. | browserSteps.ts:162-167 |
| Unattended | Refused because always-ask actions have no one to ask. | background.ts:6506; approvalPolicy.ts:488-491 |
| Accessibility | Card is an alertdialog with title and description ids; file input has aria-label 'Choose files to upload'; preview list is aria-live polite. | computerUsePanel.ts:884-888, 925-927 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/extension/__tests__/browser-download-completion.test.ts`: Download completion: reads Chrome state and bytes; polls the ledger; in-progress at deadline; interrupted; Stop and ownership during waits; refuses a record not from this action.
- `apps/extension/__tests__/browser-upload-approval-binding.test.ts`: Upload approval binding (name only; contents not opened).
- `apps/extension/__tests__/side-panel-upload-approval.test.ts`: Upload approval card (name only).
- `apps/extension/__tests__/computer-use-approval-policy.test.ts`: Approval policy (name only).
- `apps/extension/__tests__/browser-control-contract.test.ts`: No driver command can set a file input; click or type on a file input is something to ask about.
- `apps/extension/__tests__/site-policy-engine.test.ts`: Site policy patterns and precedence.
- `apps/desktop/electron/__tests__/browserCommandGate.test.ts`: Approval wording for browser commands.

**Test scenarios**

- **Approve a download**
  1. Ask Chrome to download a known PDF link on an approved site.
  2. Press Allow.
  - Expected: Result reports 'complete' with bytes; the file is in Downloads.
- **Deny a download**
  1. Repeat and press Skip.
  - Expected: No download starts; step shown as Skipped.
- **Upload with a file**
  1. Open a page with a file input.
  2. Ask the assistant to attach a file.
  3. Choose a file in the card, press Allow.
  - Expected: Result says N approved file(s) selected and bytes verified; page confirmation must be read separately.
- **Upload skipped after inspection**
  1. Choose a file and press Allow, then cancel while inspecting.
  - Expected: Card says no file was sent to the site and may have reached AGI Cloud.
- **Org blocks upload**
  1. Set an admin policy that blocks upload on the site.
  2. Ask for an upload.
  - Expected: Refused with the org's wording before any card can grant it.
- **Desktop chat download**
  1. Pair Chrome.
  2. Ask Desktop chat to download a file at an address.
  - Expected: 'Check this step' prompt 'Download <address>'; Allow once starts the download; the dialog lists it.

**Where to look when it fails**

- Download states in_progress, complete, interrupted (downloads.ts:10).
- Refusal messages from site policy (sitePolicyDenialMessage).
- chrome.storage.session agi_session_downloads.
- Desktop BrowserStepRefused with reason cancelled.

**Hands-on test plans**

- Desktop: [70-qa/test-plans/desktop/064-browser-assistant-experience.md](../../70-qa/test-plans/desktop/064-browser-assistant-experience.md)
- Chrome: [70-qa/test-plans/chrome/064-browser-assistant-experience.md](../../70-qa/test-plans/chrome/064-browser-assistant-experience.md)

## 10. Gaps and dependencies

- **No visible download list in Chrome; only the model's result text and an internal ledger.** Affects: Chrome users. Evidence: downloads.ts:5-6; no panel code reading the ledger found. Work needed: Add a list from the ledger.
- **Desktop download list shows addresses only and is lost on close.** Affects: Desktop. Evidence: BrowserToolsDialog.tsx:454-463; bridgeServer.ts:1142. Work needed: Record file names and persist.
- **No upload on Desktop, CLI, VS Code; no downloads in CLI, VS Code, Web, Mobile.** Affects: those apps. Evidence: tool_catalog.rs:46-57; device-steps.ts:52-59. Work needed: Product decision and build.
- **Where uploaded files are inspected and how long they are kept is not documented in code read.** Affects: Chrome privacy review. Evidence: userFileUpload.ts uses managed attachments client. Work needed: Trace the server path and document retention.
- **Brief cites approvalPolicy.ts:221 and side_panel.ts:11620 for upload; those lines are not upload approval.** Affects: Knowledge base accuracy. Evidence: approvalPolicy.ts:195-205 (host helpers); upload logic is at 358-378. Work needed: Correct the brief citations.
- Not built on: Web, Mobile, CLI (from the capability ledger).

**Depends on**

- surface:chrome
- surface:desktop
- mode:cloud
- SYS-files-artifacts-and-storage
- SYS-security-and-privacy
- SYS-execution-boundaries
- SYS-subscriptions-entitlements-and-usage
- F064-08
- F064-12
- file:apps/extension/src/features/computer-use/approvalPolicy.ts
- file:apps/extension/src/features/browser-tools/downloads.ts
- file:apps/extension/src/features/computer-use/userFileUpload.ts

## Unknown

- Retention of inspected upload files on the server.
- Which service and model inspect uploaded files.
- Whether the Desktop browser pane handles downloads at all (no handler found in browserPane.ts).
- Contents of the upload test files were not opened.
- Whether Chrome's own download prompt also shows to the person was not examined.

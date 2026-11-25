---
id: "F056-04"
type: "feature"
title: "Cloud files (search, download, create, edit, folders and sharing)"
aliases: ["Cloud files", "Google Drive connector", "OneDrive connector", "Dropbox", "Box", "search_files", "read_file_content", "create_file", "S56.13 to S56.17"]
area: "56 Concrete integration families"
available_on: ["web", "desktop", "mobile", "cli", "vscode", "chrome"]
implementation: {web: "partial", desktop: "partial", mobile: "partial", cli: "partial", vscode: "built", chrome: "partial"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S56.13", "S56.14", "S56.15", "S56.16", "S56.17"]
depends_on: ["SYS-connectors-plugins-and-skills", "SYS-files-artifacts-and-storage", "SYS-security-and-privacy", "SYS-subscriptions-entitlements-and-usage", "SYS-execution-boundaries", "mode:cloud", "surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:vscode", "surface:chrome", "table:connector_oauth_grants", "table:project_knowledge_files"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F056-04 Cloud files (search, download, create, edit, folders and sharing)

Lets the assistant search a connected cloud drive, read files and create a file. Google Drive offers search, read, download, create and copy; it has no tool to edit a file, make a folder or change sharing. Not released, and all Drive calls currently ask for approval.

Area: [56. Concrete integration families](README.md). Requirement items: [S56.13](../../10-requirements/capabilities/056-concrete-integration-families.md#s5613), [S56.14](../../10-requirements/capabilities/056-concrete-integration-families.md#s5614), [S56.15](../../10-requirements/capabilities/056-concrete-integration-families.md#s5615), [S56.16](../../10-requirements/capabilities/056-concrete-integration-families.md#s5616), [S56.17](../../10-requirements/capabilities/056-concrete-integration-families.md#s5617).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built | partly built | not seen by a person |
| Desktop | partly built | partly built | not seen by a person |
| Mobile | partly built | partly built | not seen by a person |
| CLI | partly built | partly built | not seen by a person |
| VS Code | partly built (this page lists unfinished parts) | built | not seen by a person |
| Chrome | partly built | partly built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Offers Google Drive tools search_files, list_recent_files, get_file_metadata, get_file_permissions, read_file_content, download_file_content, create_file and copy_file; OneDrive and SharePoint offer search_files and read_file through Microsoft Graph; Dropbox and Box connect through their own servers when configured. [code] (apps/web/lib/connectors/directory/sources/first-party.json:3-15; apps/web/lib/connectors/catalog.ts:187-188; apps/web/lib/connectors/mcp-endpoints.ts:118-126)

**Why it exists.** The leaders let the assistant find and read the user's Drive files. [doc: docs/runbooks/connector-oauth-apps.md]

**Who uses it.** Paid-plan users with files in a cloud drive.

**Problems it solves**

- Finding a file by name or content
- Answering questions about a file's content
- Saving a new file to Drive

**Use cases**

- Find the Q3 plan in my drive
- Summarise the file I name
- Create a notes file in Drive after approval
- Save a chat artifact to Drive

## 2. User experience

**Where to find it**

- Web: Settings 'Connectors'; also the project source picker for Google Drive and artifact 'save to Drive' and 'export to Google Docs' endpoints. [code] (apps/web/app/api/connectors/google-drive/picker/route.ts; apps/web/app/api/artifacts/save-to-drive/route.ts; apps/web/app/api/artifacts/export/google-docs/route.ts)
- Desktop: the hosted web app. [doc: AGENTS.md section 5]
- Mobile: Settings 'Connectors'. [code] (index.tsx:832)
- CLI/VS Code: account connector list; tools come from the account. [code] (cloud/connectors.rs:176)
- Chrome: 'Connectors' attach menu item. [code] (side_panel.ts:14811)

**Before you start**

- Signed-in, paid plan, Cloud mode.
- google-drive released (not today), descriptor and client pair added by the operator. [doc: docs/runbooks/connector-oauth-apps.md]
- Scopes drive.file, drive.readonly (drive.metadata.readonly allowed for older grants). [code] (connector-scopes.ts:46-49)

**Screens and controls**

- Connect button, chat step rows, approval prompt (Allow once / Allow for this chat / Always allow / Deny). [code] (tool-approval-policy.ts:26-37)
- Google Drive picker for project sources. [code] (app/api/connectors/google-drive/picker/route.ts)

**Journey**

1. Connect Google Drive.
2. Ask 'find the Q3 plan'.
3. Assistant calls search_files; today an approval prompt appears because the tools are undeclared. [code] (tool-metadata.ts:863-883)
4. Ask to read the file; read_file_content returns text.
5. Ask to create a file; review the prompt; Allow.
6. The new file appears in Drive (drive.file only sees files this app created or the user opened with it). [code] (scope-description in connector-scopes.ts:'drive.file')

**What the person sees and gets**

- Step sentences; file text in the answer; error text in failed steps.

**Settings**

- Approval policy and per-tool permissions. [code] (connector-tool-permissions.ts)
- Per-chat connector switch.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Drive tool list and scope ceiling exist; drive.file is the only write scope admitted and the full Drive scope is forbidden. [code] (first-party.json:3-15; connector-scopes.ts:46-49, 250-262)
- Artifact save and Google Docs export use drive.file via uploadDriveFile. [code] (apps/web/lib/connectors/google-docs-export.ts:22-60)
- Export of Google Docs, Sheets and Slides to Office formats when a picked file is imported. [code] (apps/web/lib/connectors/google-drive-files.ts:8-22)
- OneDrive and SharePoint read-only adapters with a 10 MB limit and PDF, Word, Excel, PowerPoint and text support. [doc: docs/development/connectors-setup.md]

**Incomplete**

- No Google Drive tool edits an existing file, creates a folder or changes sharing; get_file_permissions only reads. The brief's 'done' for editing and folders/sharing is not supported by the tool list. [code] (first-party.json:3-15)
- Drive tools have no declared metadata: search and read ask for approval like writes. [code] (tool-metadata.ts:863-883)
- Box folders and shared links need root_readwrite, which the ceiling refuses. [doc: docs/development/connectors-setup.md]

**Present but disconnected or switched off**

- google-drive, onedrive, sharepoint, dropbox and box are not released. [code] (connector-release.ts:14-30)
- Artifact save, picker and project import routes call assertConnectorsReleased, which needs the full-launch switch, so they refuse today. [code] (app/api/artifacts/save-to-drive/route.ts:43; app/api/connectors/google-drive/picker/route.ts:22; apps/web/lib/connectors/connector-capability.ts:27-29)
- Drive creation is available only when the operator adds the google-drive entry (brief S56.15). [doc: knowledge-base/data/area-briefs/056-concrete-integration-families.md]

**Not available**

- Local and own-key modes; free plan. [code] (claude_parity.rs:2775-2779; billing-catalog.ts:332-351)

## 4. Required behaviour

**Established requirements**

- The assistant can search files in a connected cloud drive. (source: S56.13)
- The assistant can download or read file content. (source: S56.14)
- The assistant can create a new file, after approval. (source: S56.15)
- The assistant can modify an existing file. (source: S56.16)
- The assistant can create folders and manage sharing. (source: S56.17)
- Drive searches the whole Drive using drive.readonly with drive.file, as Claude and ChatGPT do. (source: doc: docs/runbooks/connector-oauth-apps.md)
- drive.file is the only write scope the Drive ceiling admits. (source: packages/contracts/cloud-contracts/src/connector-scopes.ts:46-49)

**Acceptance criteria**

1. Search returns files by name or text from the real Drive.
2. Reading a Google Doc returns its text.
3. Creating a file shows an approval prompt with the proposed content; Deny creates nothing.
4. A grant missing drive.readonly asks for re-consent before reading file contents.
5. No sharing or folder change happens without a tool that declares it.
6. On a no-training model rule, Drive tools are withheld on a training-capable model.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Edit, folder and sharing requirements need new tools or a wider scope. [inferred]

**Proposed improvements** (suggestions, not requirements)

- [proposed] Declare metadata: reads for search, list, metadata, permissions, read and download; write for create and copy.
- [proposed] Decide whether edit and sharing are in scope and which scope they need.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| config | Directory entry | `apps/web/lib/connectors/directory/sources/first-party.json` | Drive MCP url and eight tools. |
| config | Scope ceiling | `packages/contracts/cloud-contracts/src/connector-scopes.ts` | Drive, OneDrive, Dropbox, Box scopes. |
| service | Drive file import | `apps/web/lib/connectors/google-drive-files.ts` | Downloads a picked file and exports Google formats to Office formats. |
| service | Drive upload | `apps/web/lib/connectors/google-docs-export.ts` | Uploads or converts a file into Drive with drive.file. |
| endpoint | Drive picker | `apps/web/app/api/connectors/google-drive/picker/route.ts` | Picker token endpoint. |
| endpoint | Save to Drive | `apps/web/app/api/artifacts/save-to-drive/route.ts` | Saves an artifact to Drive. |
| endpoint | Export to Google Docs | `apps/web/app/api/artifacts/export/google-docs/route.ts` | Converts an artifact into a Google Doc. |
| service | Graph adapter | `apps/web/lib/connectors/microsoft-graph.ts` | OneDrive and SharePoint search and read. |
| config | MCP endpoints | `apps/web/lib/connectors/mcp-endpoints.ts` | Dropbox and Box server addresses (pre-registered). |
| config | Release gate | `packages/contracts/types/src/connector-release.ts` | Drive not released. |
| config | Tool metadata | `apps/web/app/api/llm/v1/chat/completions/lib/tool-metadata.ts` | No Drive entry; OneDrive and SharePoint reads declared. |
| service | Tool catalog builder | `apps/web/lib/user-connector-tools.ts` | Offers Drive tools for a connected grant. |
| service | Google data rules | `apps/web/lib/connectors/google-user-data.ts` | Drive and Drive-imported project sources mark Google data. |
| screen | Mobile Connectors | `apps/mobile/src/features/settings/cloud-connectors/index.tsx` | Mobile list. |
| component | Chrome menu | `apps/extension/src/side_panel.ts` | Connectors item. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person asks in chat; turn goes to our servers. | device | route.ts:792-800 |
| Server checks release, plan, kill switch and the Google data rule. | our servers | connector-capability.ts:44-67; user-connector-tools.ts:2500-2515 |
| Gate asks (undeclared tools); person approves in the app. | device and our servers | tool-metadata.ts:876-883 |
| Our server calls Google's Drive MCP server with the token. | outside service | first-party.json:3-15 |
| Content returns to the model; created files live in the user's Drive. | outside service | google-docs-export.ts:22-60 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Drive grant | table:connector_oauth_grants | Account-wide | Deleted on disconnect |
| Imported project sources from Drive | table:project_knowledge_files | Account-wide | Marks the project as Google data. [code] (google-user-data.ts:190-200) |
| Created files | User's Google Drive | By Google | Owned by the user |

**Models and providers.** Tool-capable model on a no-training provider. [code] (google-user-data.ts:41-49)

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in account. |
| Permissions | drive.file, drive.readonly, drive.metadata.readonly. [code] (connector-scopes.ts:46-49) |
| Subscription | Paid plans; artifact connectors need pro or higher. [code] (billing-catalog.ts:351, 361) |
| Limits and metering | OneDrive read limit 10 MB; artifact cloud save size limit ARTIFACT_CLOUD_SAVE_MAX_BYTES. [code] (app/api/artifacts/save-to-drive/route.ts:51; doc: docs/development/connectors-setup.md) |
| Feature flags | Release state, kill switch, workspace policy, per-chat switch. |
| Model compatibility | Tool support; no-training provider. |
| Provider restrictions | Google data only to no-training providers. |
| Local mode | Not offered in Local or own-key sessions. [code] (claude_parity.rs:2775-2779) |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Not released | Routes throw 'Connectors are coming soon.' | connector-capability.ts:27-29 |
| File not accessible | 'Google Drive did not allow access to that file. Pick it again.' | google-drive-files.ts:38-47 |
| Drive unreachable | Save to Drive answers service unavailable with the connector unreachable message. | save-to-drive/route.ts:58-60 |
| Scope missing | canCreateDriveFiles check before upload; re-consent flow for older grants. | google-docs-export.ts:22-26; oauth-scope-allowlist.test.ts:78 |
| Timeout | Drive requests time out at 30 seconds. | google-drive-files.ts:5; google-docs-export.ts:8 |
| Offline, retry | not handled in the code beyond an error result. | not found |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/lib/connectors/__tests__/oauth-scope-allowlist.test.ts`: Drive re-consent before reading file contents.
- `apps/web/lib/connectors/__tests__/google-user-data.test.ts`: Drive projects marked as Google data.
- `apps/web/lib/__tests__/user-connector-tools.google-hosted.test.ts`: Google-hosted tool withholding.
- `apps/web/lib/connectors/__tests__/connector-release.test.ts`: Release gates.
- `apps/web/lib/connectors/__tests__/oauth-registry.scope-allowlist.test.ts`: Ceiling on descriptor scopes.

**Test scenarios**

- **Search and read**
  1. Connect a test Drive with a known file.
  2. Ask to find and summarise it.
  - Expected: Correct file and a faithful summary.
- **Create with approval**
  1. Ask to create a notes file.
  2. Deny, then Allow.
  - Expected: Deny creates nothing; Allow creates one file visible in Drive.
- **Edit request**
  1. Ask to change an existing file.
  - Expected: Records what happens; the tool list predicts no edit tool exists.
- **Old grant**
  1. Use a grant made before drive.readonly joined the descriptor.
  2. Ask to read a file.
  - Expected: Asked to reconnect with more permission.
- **Unreleased**
  1. Try artifact 'save to Drive'.
  - Expected: 'Connectors are coming soon.'

**Where to look when it fails**

- connector_call_events
- '[connector-oauth] dropped operator-requested scopes above the documented ceiling'. [code] (oauth-registry.ts:152-156)
- Error names GoogleDriveFileError and GoogleDocsExportError.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/056-concrete-integration-families.md](../../70-qa/test-plans/web/056-concrete-integration-families.md)
- Desktop: [70-qa/test-plans/desktop/056-concrete-integration-families.md](../../70-qa/test-plans/desktop/056-concrete-integration-families.md)
- Mobile: [70-qa/test-plans/mobile/056-concrete-integration-families.md](../../70-qa/test-plans/mobile/056-concrete-integration-families.md)
- CLI: [70-qa/test-plans/cli/056-concrete-integration-families.md](../../70-qa/test-plans/cli/056-concrete-integration-families.md)
- VS Code: [70-qa/test-plans/vscode/056-concrete-integration-families.md](../../70-qa/test-plans/vscode/056-concrete-integration-families.md)
- Chrome: [70-qa/test-plans/chrome/056-concrete-integration-families.md](../../70-qa/test-plans/chrome/056-concrete-integration-families.md)

## 10. Gaps and dependencies

- **Drive is not released and routes refuse.** Affects: All apps. Evidence: connector-capability.ts:27-29; connector-release.ts:14-30. Work needed: Release decision.
- **No tool edits files, creates folders or manages sharing on Google Drive.** Affects: All apps (brief S56.16, S56.17 'done'). Evidence: first-party.json:3-15. Work needed: Add tools or accept scope limits; fix brief.
- **Drive search and read ask for approval since no metadata is declared.** Affects: All apps. Evidence: tool-metadata.ts:863-883. Work needed: Declare metadata.
- **Dropbox and Box need pre-registered clients and are not released; Box folders and sharing need a scope that is refused.** Affects: Dropbox and Box users. Evidence: mcp-endpoints.ts:118-126; docs/development/connectors-setup.md. Work needed: Owner setup and decisions.
- **OneDrive and SharePoint are read-only.** Affects: Microsoft users. Evidence: catalog.ts:187-188. Work needed: New adapter tools.
- **No live run recorded.** Affects: All. Evidence: none found. Work needed: Run on a review build.

**Depends on**

- SYS-connectors-plugins-and-skills
- SYS-files-artifacts-and-storage
- SYS-security-and-privacy
- SYS-subscriptions-entitlements-and-usage
- SYS-execution-boundaries
- mode:cloud
- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:vscode
- surface:chrome
- table:connector_oauth_grants
- table:project_knowledge_files

## Unknown

- Whether the Drive MCP server exposes tools beyond the eight listed.
- Whether production has the Drive descriptor.
- HTTP method of the export route.
- Dropbox and Box live behaviour.
- Whether CLI create works the way the brief says.

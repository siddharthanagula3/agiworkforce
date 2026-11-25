---
id: "F037-06"
type: "feature"
title: "Website, video, audio and connected documents"
aliases: ["Google Drive source", "Connected document", "Add website", "Add video transcript", "Add audio", "Source refresh", "S37.07 Add website", "S37.08 Add video transcript", "S37.09 Add audio", "S37.10 Add connected document"]
area: "37 Notebook and knowledge-workspace product"
available_on: ["web", "desktop"]
implementation: {web: "partial", desktop: "partial", mobile: "missing", cli: "missing", vscode: "missing", chrome: "missing"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S37.07", "S37.08", "S37.09", "S37.10"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:vscode", "surface:chrome", "mode:cloud", "api:GET /api/connectors/google-drive/picker", "api:POST /api/projects/{id}/knowledge-files/google-drive", "api:POST /api/projects/{id}/knowledge-files/{fileId}/refresh", "table:project_knowledge_files", "table:external_resource_references", "SYS-connectors-plugins-and-skills", "SYS-files-artifacts-and-storage", "SYS-voice-and-media", "SYS-security-and-privacy", "SYS-execution-boundaries", "F037-05"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F037-06 Website, video, audio and connected documents

This area covers sources that come from somewhere other than a local file: a website, a video transcript, an audio file and a Google Drive document. Only Google Drive has code, and it is switched off by a release constant, so the web button reads 'Coming soon'. Website, video and audio have no code.

Area: [37. Notebook and knowledge-workspace product](README.md). Requirement items: [S37.07](../../10-requirements/capabilities/037-notebook-and-knowledge-workspace-product.md#s3707), [S37.08](../../10-requirements/capabilities/037-notebook-and-knowledge-workspace-product.md#s3708), [S37.09](../../10-requirements/capabilities/037-notebook-and-knowledge-workspace-product.md#s3709), [S37.10](../../10-requirements/capabilities/037-notebook-and-knowledge-workspace-product.md#s3710).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built | partly built | not seen by a person |
| Desktop | partly built | partly built | not seen by a person |
| Mobile | not built | not built | n/a |
| CLI | not built | not built | n/a |
| VS Code | not built | not built | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Would let a person add a Drive document as a source, refresh it when it changes, and (in the brief) add a web page, a video transcript or a transcribed audio file. Today only Drive has a picker, an import route and a refresh route, all blocked while connectors are 'coming soon' (apps/web/app/api/projects/[id]/knowledge-files/google-drive/route.ts:39; packages/contracts/types/src/connector-release.ts:14).

**Why it exists.** People keep material in cloud drives, web pages and recordings, and copying it by hand is slow. [inferred]

**Who uses it.** Project owners and editors with a connected Google account.

**Problems it solves**

- Bringing Drive documents into a project without downloading them first.
- Refreshing a Drive source when the original changes.

**Use cases**

- Pick three Google Docs from Drive into a project.
- Press 'Refresh from Google Drive' on a changed doc.
- (Not built) paste a URL to add a web page.
- (Not built) paste a video link to add its transcript.

## 2. User experience

**Where to find it**

- Web: '+ Add sources' then the 'Google Drive' tile, which is disabled and reads 'Coming soon' with the text 'Connecting Gmail, Google Drive, Calendar and other apps is coming soon.' (AddSourcesModal.tsx:298-312, 357-373; connector-release.ts:50-52).
- Desktop: the same hosted web page (doc: AGENTS.md section 5).
- Mobile, CLI, VS Code, Chrome: nothing found.

**Before you start**

- Connectors released (not true today) and the Google Drive connector connected.
- Two server environment values, GOOGLE_PICKER_API_KEY and GOOGLE_PICKER_APP_ID (names only) (apps/web/app/api/connectors/google-drive/picker/route.ts:23-29).
- A project the person can edit and that is not archived.

**Screens and controls**

- Web: Drive tile (enabled only when released), note 'Google Drive needs its connector.' with link 'Set up connectors' (AddSourcesModal.tsx:325-355).
- Row button 'Refresh from Google Drive' shown only for Drive-origin sources the person may edit (SourcesPanel.tsx:757-775).
- Google Picker loaded from a Google script (features/projects/lib/google-drive-picker.ts:9, 75-80).

**Journey**

1. (When released) Press the Drive tile.
2. If the connector is not connected the app sends the person to /connectors; if the picker is not configured it says 'Adding files from Google Drive is not available yet.'
3. Pick files in the Google Picker.
4. The app posts the chosen file ids; each is imported and reported as added or failed.
5. Later press 'Refresh from Google Drive' to update a source.

**What the person sees and gets**

- Today: a disabled tile with a lock and 'Coming soon' (AddSourcesModal.tsx:527-565).
- When enabled: toasts for partial failure ('<n> of <m> files were added. ...'), notices, '<file> was updated from Google Drive' or '<file> is already up to date' (SourcesPanel.tsx:176-182, 273-286).
- Server answers 403 'Connectors are coming soon.' while the constant is 'coming_soon' (connector-capability.ts:19-29).

**Settings**

- Release state constant CONNECTOR_RELEASE_STATE = 'coming_soon' (connector-release.ts:14).
- Env names GOOGLE_PICKER_API_KEY and GOOGLE_PICKER_APP_ID.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Server import route: validates 1 to the maximum number of file ids, checks the project, resolves Drive access, imports each file through the same registration path as an upload and returns per-file results (apps/web/app/api/projects/[id]/knowledge-files/google-drive/route.ts:27-85; lib/server/project-drive-import.ts:121).
- Server refresh route re-imports a Drive source when its version changed and answers 'unchanged' otherwise (knowledge-files/[fileId]/refresh/route.ts:31-92).
- Origins route lists which sources can be refreshed (knowledge-files/origins/route.ts).
- Registration keeps Drive-origin data from being used for scan reading by passing forceNoTraining (project-knowledge-files.ts:325, 33-36).

**Incomplete**

- Picker route needs two env values; without them it returns status 'not-configured' (picker/route.ts:25-29). The brief lists live checks as owner work, including inside Electron.
- The brief says source refresh is missing; a refresh route and web button exist, limited to Drive sources (SourcesPanel.tsx:173-188, 757).

**Present but disconnected or switched off**

- All three Drive routes and the picker call assertConnectorsReleased and answer 403 while released state is 'coming_soon' (google-drive/route.ts:39; refresh/route.ts:41; picker/route.ts:22).
- The web Drive tile is replaced by a disabled 'Coming soon' tile (AddSourcesModal.tsx:299-312).

**Not available**

- Website URL source: no fetch or URL input code found in web projects, mobile projects or the project API (search for url, website, youtube, transcript returned nothing relevant).
- Video transcript source: none found.
- Audio source and transcription: audio is not in the allowed attachment types (attachment-policy.json:3-9) and no transcription path is wired to project sources.
- Mobile, CLI, VS Code, Chrome: no connected-document source.

## 4. Required behaviour

**Established requirements**

- The user can add a website URL as a source; its text is fetched and indexed. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S37.07)
- The user can add a video (for example a YouTube link) whose transcript becomes a source. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S37.08)
- The user can add an audio file that is transcribed into a source. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S37.09)
- The user can add a document from a connected service such as Google Drive as a source. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S37.10)
- A source added from a live location can be refreshed to pick up changes. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S37.36)
- Connectors are coming soon; the UI must not offer them as available. (source: packages/contracts/types/src/connector-release.ts:46-52, 56-62)

**Acceptance criteria**

1. While released state is 'coming_soon', the web Drive tile is disabled and reads 'Coming soon'; POST to the Drive import route returns 403 'Connectors are coming soon.'
2. With release on and env set, picking two Drive files adds two rows with Drive origin and a refresh button.
3. If one of two files fails, the response is 201 with one 'added' and one 'failed' and the toast names the count.
4. Refreshing an unchanged Drive source shows 'already up to date'; a changed one creates a new version.
5. Refreshing a source that did not come from Drive is refused with 'Only sources added from Google Drive can be refreshed.'
6. No website, video or audio control appears anywhere until built.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Drive sources ride the same limits as uploads (40 files, plan size and storage) because they register through registerProjectKnowledgeFile [inferred from project-knowledge-files.ts:299-305 and the import route].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Define website, video and audio requirements: fetch rules, size limits, transcription provider route, consent, and where each runs (device or our servers) before building.
- [proposed] Decide whether audio transcription can run on the device in Local mode on mobile.
- [proposed] Add a failing-link message set (unreachable URL, private video, no transcript).

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| config | CONNECTOR_RELEASE_STATE | `packages/contracts/types/src/connector-release.ts` | Release constant 'coming_soon' and connectorsReleased() (lines 14, 46-49). |
| service | connector-capability | `apps/web/lib/connectors/connector-capability.ts` | assertConnectorsReleased and the coming-soon error. |
| component | AddSourcesModal | `apps/web/features/projects/components/AddSourcesModal.tsx` | Drive tile and 'Coming soon' tile. |
| component | SourcesPanel Drive handlers | `apps/web/features/projects/components/SourcesPanel.tsx` | handleAddFromGoogleDrive (243), handleRefresh (173), refresh button (757). |
| service | google-drive-picker | `apps/web/features/projects/lib/google-drive-picker.ts` | Loads the Google script and opens the Picker. |
| service | project-source-origins | `apps/web/features/projects/services/project-source-origins.ts` | listRefreshableSources and refreshProjectSource. |
| endpoint | GET /api/connectors/google-drive/picker | `apps/web/app/api/connectors/google-drive/picker/route.ts` | Returns picker settings and an access token when ready. |
| endpoint | POST /api/projects/[id]/knowledge-files/google-drive | `apps/web/app/api/projects/[id]/knowledge-files/google-drive/route.ts` | Imports chosen Drive files. |
| endpoint | POST .../knowledge-files/[fileId]/refresh | `apps/web/app/api/projects/[id]/knowledge-files/[fileId]/refresh/route.ts` | Refreshes a Drive source. |
| endpoint | GET .../knowledge-files/origins | `apps/web/app/api/projects/[id]/knowledge-files/origins/route.ts` | Lists sources that can be refreshed. |
| service | project-drive-import | `apps/web/lib/server/project-drive-import.ts` | Drive access, limits and per-file import. |
| service | google-drive-files | `apps/web/lib/connectors/google-drive-files.ts` | Drive connector id and file errors. |
| service | oauth-access | `apps/web/lib/connectors/oauth-access.ts` | Connector access token resolution. |
| table | external_resource_references | `apps/web/app/api/projects/[id]/knowledge-files/[fileId]/refresh/route.ts` | Origin record joined to a file (select at lines 47-58). |
| service | google-user-data-runs | `apps/web/lib/connectors/google-user-data-runs.ts` | Marks Drive-origin content so scan reading is withheld (used in project-knowledge-files.ts:33-36). |
| test | AddSourcesModal connectors test | `apps/web/features/projects/components/__tests__/AddSourcesModal.connectors.test.tsx` | Coming-soon behaviour of the modal (file name). |
| test | google-drive route test | `apps/web/app/api/projects/[id]/knowledge-files/google-drive/__tests__/route.test.ts` | Import route (file name). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Web checks connectorsReleased(); today it is false, so the Drive tile is disabled and nothing else runs. | device | AddSourcesModal.tsx:34, 299-312; connector-release.ts:14, 46-49 |
| (Released) The app asks GET /api/connectors/google-drive/picker; the server returns not-configured, not-connected, reconnect-required, or ready with an access token and the picker settings. | our servers | picker/route.ts:17-54 |
| (Released) The browser loads the Google script and shows the Picker to choose files. | outside service | google-drive-picker.ts:9, 75-80 |
| (Released) The app posts the chosen ids to the import route; the server fetches each file from Drive with the person's connector token and registers it like an upload. | our servers | google-drive/route.ts:27-85; project-drive-import.ts:121 |
| (Released) Indexing runs as for any file; scan reading is withheld for Google user data. | our servers | project-knowledge-files.ts:325, 482 |
| (Released) Refresh calls the refresh route, which re-imports if the Drive version changed. | our servers | refresh/route.ts:64-84 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Imported Drive file and its origin reference (provider, external id, version) | tables project_knowledge_files and external_resource_references | Server-held | As a normal source; deleting the source retires the row |
| Connector access token | Connector token store read by resolveConnectorAccessToken; a short-lived token is sent to the browser for the Picker | Server-held | Not established in the files read |

**Models and providers.** No model is used to fetch a Drive file. Indexing and scan reading follow F037-05. For website, video and audio there is no code, so no provider route exists.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Required, plus a connected Google account (picker/route.ts:31-43). |
| Permissions | Owner or editor of the project (assertDriveImportableProject, route line 51); workspace connector policy not read. |
| Subscription | Connectors have a plan capability check (planIncludesConnectors, connector-capability.ts:23-25); the release constant overrides it today. |
| Limits and metering | Maximum files per import call GOOGLE_DRIVE_KNOWLEDGE_IMPORT_MAX_FILES; the usual 40 file and storage limits apply [inferred]. |
| Feature flags | CONNECTOR_RELEASE_STATE is a code constant, not an environment value. A kill switch 'canUseConnectors' is read for connector tools (connector-capability.ts:31-40). |
| Model compatibility | None found for Drive import. |
| Provider restrictions | Google user data is kept away from training and scan reading (project-knowledge-files.ts:33-36, 325). |
| Local mode | No Drive or other connected source in Local mode on any app: the routes need the account and the connector, and mobile has no Drive source code. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Connectors not released | Tile disabled with 'Coming soon'; routes answer 403 'Connectors are coming soon.' | AddSourcesModal.tsx:307-312; connector-capability.ts:19-29 |
| Picker not configured | Picker returns status not-configured; the UI throws 'Adding files from Google Drive is not available yet.' | picker/route.ts:25-29; SourcesPanel.tsx:244-247 |
| Not connected | UI routes the person to /connectors. | SourcesPanel.tsx:248; AddSourcesModal.tsx:137 |
| Partial failure | Per-file results; 201 if at least one added, else 422. | google-drive/route.ts:83-84 |
| Refresh unchanged | Returns 'unchanged'. | refresh/route.ts:75-79 |
| Not a Drive source | Conflict 'Only sources added from Google Drive can be refreshed.' | refresh/route.ts:60-62 |
| Scan text withheld | A notice tells the person pages were not read. | project-knowledge-files.ts:157-162, 488-490 |
| Connector service unreachable | Picker answers service unavailable with a user-safe message. | picker/route.ts:32-34 |
| Website, video, audio | Not handled in the code: no control and no route. | search of web, mobile and API project code |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/projects/components/__tests__/AddSourcesModal.connectors.test.tsx`: Modal while connectors are coming soon (file name).
- `apps/web/features/projects/components/AddSourcesModal.test.tsx`: Add sources modal (file name).
- `apps/web/app/api/projects/[id]/knowledge-files/google-drive/__tests__/route.test.ts`: Drive import route (file name).
- `apps/web/app/api/projects/[id]/knowledge-files/origins/route.test.ts`: Origins route (file name).
- `apps/web/app/api/projects/[id]/knowledge-files/[fileId]/__tests__/route.test.ts`: Per-file route (file name).

**Test scenarios**

- **Coming soon state**
  1. Open '+ Add sources' on web.
  - Expected: Google Drive tile is disabled, reads 'Coming soon'; the lock text appears; no network call to the picker.
- **Server refusal**
  1. Send POST to the Drive import route with a valid id.
  - Expected: 403 'Connectors are coming soon.'
- **Released and unconfigured**
  1. In a test build set the release state to released with no picker env values.
  2. Press Google Drive.
  - Expected: 'Adding files from Google Drive is not available yet.'
- **Released and configured**
  1. Set both env values, connect Drive, pick two files.
  - Expected: Two rows with Drive origin; refresh button visible.
- **Absence check**
  1. Search the Add sources dialog on every app for website, video, audio.
  - Expected: None present.

**Where to look when it fails**

- Log '[knowledge-files] Google Drive import failed' and 'Google Drive refresh failed' (google-drive/route.ts:74; refresh/route.ts:88).
- Picker response status values not-configured, not-connected, reconnect-required.
- Kill-switch log 'Kill-switch gate unreadable; connector tools withheld' (connector-capability.ts:35).

**Hands-on test plans**

- Web: [70-qa/test-plans/web/037-notebook-and-knowledge-workspace-product.md](../../70-qa/test-plans/web/037-notebook-and-knowledge-workspace-product.md)
- Desktop: [70-qa/test-plans/desktop/037-notebook-and-knowledge-workspace-product.md](../../70-qa/test-plans/desktop/037-notebook-and-knowledge-workspace-product.md)

## 10. Gaps and dependencies

- **Google Drive is switched off by a code constant on the UI and three routes; the two picker env values are only needed after that.** Affects: Web and Desktop. Evidence: connector-release.ts:14; google-drive/route.ts:39; picker/route.ts:22-29. Work needed: Owner decision to release; set the two env values; live-check the Picker including inside Electron (brief).
- **Website URL source does not exist.** Affects: All apps. Evidence: No code found in web projects, mobile projects, API project routes. Work needed: Specify fetch, safety and size rules, build, add a route and a UI entry.
- **Video transcript source does not exist.** Affects: All apps. Evidence: No code found. Work needed: Specify transcript retrieval and provider route; add UI and route.
- **Audio source does not exist; audio is not an allowed upload type.** Affects: All apps. Evidence: attachment-policy.json:3-9. Work needed: Add audio types to policy, a transcription route (device or server), metering and UI.
- **Connected documents on mobile, CLI, VS Code and Chrome do not exist.** Affects: Those apps. Evidence: No code found. Work needed: Decide per app; extensions are scoped out by decisions D-2026-09-28-23 and -25.
- **Refresh works only for Drive sources, and not at all while connectors are off; brief says missing.** Affects: Web and Desktop. Evidence: refresh/route.ts:41, 60-62; SourcesPanel.tsx:757. Work needed: Update the brief; test refresh when released.
- **A short-lived Drive access token is sent to the browser for the Picker.** Affects: Security review. Evidence: picker/route.ts:45-52. Work needed: Confirm the token scope and lifetime in review before release.
- Not built on: Mobile, CLI, VS Code, Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:vscode
- surface:chrome
- mode:cloud
- api:GET /api/connectors/google-drive/picker
- api:POST /api/projects/{id}/knowledge-files/google-drive
- api:POST /api/projects/{id}/knowledge-files/{fileId}/refresh
- table:project_knowledge_files
- table:external_resource_references
- SYS-connectors-plugins-and-skills
- SYS-files-artifacts-and-storage
- SYS-voice-and-media
- SYS-security-and-privacy
- SYS-execution-boundaries
- F037-05

## Unknown

- Whether the Google Picker works inside the Electron window (owner check listed in the brief).
- Which connector scopes the Drive token carries and its lifetime.
- The value of GOOGLE_DRIVE_KNOWLEDGE_IMPORT_MAX_FILES.
- Workspace policy effect on Drive import.
- Planned design for website, video and audio sources (no document found in docs/product).
- Whether the Electron app changes the picker flow.

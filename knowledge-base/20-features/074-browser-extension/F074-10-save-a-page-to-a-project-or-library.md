---
id: "F074-10"
type: "feature"
title: "Save a page to a Project or Library"
aliases: ["Save page to a Project", "Save page to Library", "Page-to-Project saving", "Page-to-Library saving", "S74.22", "S74.23"]
area: "74 Browser extension"
available_on: []
implementation: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "missing"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S74.22", "S74.23"]
depends_on: ["surface:chrome", "mode:cloud", "SYS-memory-projects-and-context", "SYS-files-artifacts-and-storage", "SYS-subscriptions-entitlements-and-usage", "SYS-api-and-contracts", "api:GET /api/projects", "api:POST /api/projects", "api:GET /api/library", "api:POST /api/library", "file:apps/extension/src/features/cloud-bridge/projectsClient.ts"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F074-10 Save a page to a Project or Library

Not built. The Chrome extension has no way to save the current page into a Project or the Library. The side panel can only choose a Project to chat in, and the web app already has Project and Library routes that the extension does not call.

Area: [74. Browser extension](README.md). Requirement items: [S74.22](../../10-requirements/capabilities/074-browser-extension.md#s7422), [S74.23](../../10-requirements/capabilities/074-browser-extension.md#s7423).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | does not apply | does not apply | n/a |
| Desktop | does not apply | does not apply | n/a |
| Mobile | does not apply | does not apply | n/a |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Would let a person in the Chrome extension save the page they are on into a Project (as knowledge) or into their Library. Today nothing does this.

**Why it exists.** The brief lists both as expected: the user saves the current page into a Project, and into their Library (doc: knowledge-base/data/area-briefs/074-browser-extension.md:106-113). Competitors' browser extensions let people capture pages into their workspace [inferred from docs/product/requirements.md:185-191, not checked page by page].

**Who uses it.** Chrome extension users who research on the web and want pages kept with a Project or in their Library.

**Problems it solves**

- Copying page text into a Project by hand
- Losing useful pages after a chat ends

**Use cases**

- Save an article to a research Project
- Save a product page to the Library
- Save the page before asking questions about it later

## 2. User experience

**Where to find it**

- surface:chrome: not available. No menu, button or command named Save to Project or Save to Library was found (search of apps/extension/src and apps/extension/_locales for 'save to project', 'save this page', 'add to project', 'saveToLibrary', '/api/library' returned nothing).
- The nearest controls: the '@' menu in the composer can choose a Project to chat in (apps/extension/src/side_panel.ts:14508-14513), and the context button attaches the page to the next message (side_panel.ts:9870 region, tooltip locale key spContextBtnAttach). Neither saves the page.

**Before you start**

- Not applicable: not built.

**Screens and controls**

- Not available.

**Journey**

1. Not available. Today a person can attach a page to a chat message or switch the chat into a Project; the page is not saved to the Project or Library.

**What the person sees and gets**

- None.

**Settings**

- None.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Project listing exists: listChromeProjects reads the account's Projects for the '@' menu (apps/extension/src/features/cloud-bridge/projectsClient.ts:154).
- Choosing a Project sets the active project for the chat (side_panel.ts:13673, 14508-14513).

**Incomplete**

- Server routes that could receive a saved page exist but are not called from the extension: POST /api/projects, project knowledge-files folder, GET and POST /api/library (apps/web/app/api/projects/route.ts:255-256; apps/web/app/api/library/route.ts:276-277). Whether they accept a web page, and whether they accept calls from the extension origin, was not checked.

**Present but disconnected or switched off**

- none found in the code.

**Not available**

- Saving a page to a Project on surface:chrome.
- Saving a page to the Library on surface:chrome. docs/product/surface-feature-matrix.md:196-199 records the Library as absent on chrome (doc).

## 4. Required behaviour

**Established requirements**

- The user saves the current page into a Project. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S74.22)
- The user saves the current page into their Library. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S74.23)
- The Library is absent on the Chrome extension today. (source: doc: docs/product/surface-feature-matrix.md:196-199)

**Acceptance criteria**

1. When built: a visible 'Save' control is available on an ordinary web page and is disabled with a reason on restricted pages.
2. When built: choosing a Project saves the page text and address into that Project and the Project shows it.
3. When built: choosing the Library saves the page to the Library and the Library on web and desktop shows it.
4. When built: sites the person blocked or did not approve are not read.
5. When built: a failure shows a message and keeps nothing half saved.
6. Today: no save control exists (test the absence).

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Saving must reuse the page-reading permission model (approved sites, blocked sites) used by page context [inferred from F074 page access rules].
- The save should go through the same AGI Subscription rules as Projects and Library on other apps [inferred from the product context].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add a 'Save page' action to the context button menu and the right-click menu, with targets Project and Library.
- [proposed] Reuse apps/web/app/api/projects knowledge routes and apps/web/app/api/library POST, after checking cross-origin access and the page content shape.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | projectsClient (list only) | `apps/extension/src/features/cloud-bridge/projectsClient.ts` | Exists; lists Projects. No create or save function (exports: dependencies, error types, list result, describeProjectsFailure, listChromeProjects). |
| service | activeProject | `apps/extension/src/features/side-panel/activeProject.ts` | Exists; holds the active project choice for the chat. Not read in detail. |
| screen | Composer @ menu project choice | `apps/extension/src/side_panel.ts` | Lines 14508-14513 switch the chat into a Project; does not save a page. |
| component | Context button (attach page) | `apps/extension/src/side_panel.ts` | Attaches the page to the next message (updateContextButton); does not store it in a Project or the Library. |
| component | Artifact panel | `apps/extension/src/features/side-panel/artifactPanel.ts` | Shows artifacts of the open conversation; not the Library (doc: docs/product/surface-feature-matrix.md:196-199). |
| endpoint | POST /api/projects | `apps/web/app/api/projects/route.ts` | Server creates a Project; exists, not called for page saving. |
| endpoint | Project knowledge files | `apps/web/app/api/projects/[id]/knowledge-files` | Folder exists beside the project route; contents not read. |
| endpoint | GET and POST /api/library | `apps/web/app/api/library/route.ts` | Lists the Library and saves an artifact (handleSaveArtifact); exists, not called by the extension. |
| other | Surface feature matrix | `docs/product/surface-feature-matrix.md` | Records Library absent on chrome and Projects present. |
| other | Area brief | `knowledge-base/data/area-briefs/074-browser-extension.md` | Items S74.22 and S74.23 marked chrome missing. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Nothing runs: no save action exists. When a Project is chosen from the '@' menu, the chat switches to it and Projects are listed from AGI Cloud. | device and our servers | projectsClient.ts:154; side_panel.ts:14508-14513 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Saved page | not created | not applicable | not applicable |

**Models and providers.** Not applicable; no model takes part.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | none found in the code (no save feature). |
| Permissions | none found in the code. |
| Subscription | none found in the code. |
| Limits and metering | none found in the code. |
| Feature flags | none found in the code. |
| Model compatibility | Not applicable. |
| Provider restrictions | Not applicable. |
| Local mode | Not applicable; not built. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| All states (loading, empty, error, cancel, offline) | not handled in the code; the feature does not exist. | Search described under where_to_find_it found no save code. |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/extension/__tests__/active-project.test.ts`: Active project choice; name only, contents not opened. Does not cover page saving.

**Test scenarios**

- **Confirm the feature is absent**
  1. Open the side panel on an ordinary page.
  2. Look in the composer menus, the context button and the right-click menu for a save action.
  - Expected: No 'Save to Project' or 'Save to Library' action exists.
- **Project switch is not a save**
  1. Type @ in the composer and choose a Project.
  2. Open the Project in the web app.
  - Expected: The chat uses the Project; the page does not appear in the Project's files.
- **Future: save to Project**
  1. Open an approved page.
  2. Choose Save, then a Project.
  3. Open the Project on web.
  - Expected: [proposed] The page appears as Project knowledge.
- **Future: save to Library**
  1. Choose Save, then Library.
  2. Open the Library on desktop or mobile.
  - Expected: [proposed] The page appears in the Library.

**Where to look when it fails**

- Search apps/extension/src for 'api/library' and 'knowledge-files'; no hit means still unbuilt.

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **No way to save the current page to a Project.** Affects: surface:chrome users.. Evidence: S74.22 marked chrome missing; no code found.. Work needed: Design the control, add a client for the Project knowledge route, check permissions and size limits, add tests.
- **No way to save the current page to the Library.** Affects: surface:chrome users; the Library already exists on desktop and mobile.. Evidence: S74.23 marked missing; docs/product/surface-feature-matrix.md:196-199.. Work needed: Add a client for the Library POST route, confirm cross-origin access for the extension, add tests.
- **Unknown fit of server routes for page content.** Affects: Design of the save.. Evidence: Routes exist (library/route.ts:276-277) but request shape not read.. Work needed: Read the route schemas and decide the payload.
- Not built on: Chrome (from the capability ledger).

**Depends on**

- surface:chrome
- mode:cloud
- SYS-memory-projects-and-context
- SYS-files-artifacts-and-storage
- SYS-subscriptions-entitlements-and-usage
- SYS-api-and-contracts
- api:GET /api/projects
- api:POST /api/projects
- api:GET /api/library
- api:POST /api/library
- file:apps/extension/src/features/cloud-bridge/projectsClient.ts

## Unknown

- Whether the Project and Library routes accept an extension origin and a web page payload.
- Whether the product owner wants Library saving on the extension at all (matrix says absent without a decision).
- Contents of the active-project test.

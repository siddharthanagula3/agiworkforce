---
id: "F079-05"
type: "feature"
title: "Project default model"
aliases: ["project default model", "Default model (project)", "defaultModelId", "default_model_id", "ProjectDefaultModelField", "Choose the model (VS Code button)"]
area: "79 Routing and model-neutral orchestration"
available_on: ["web", "desktop", "mobile", "vscode"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "missing", vscode: "built", chrome: "missing"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "n/a", vscode: "not seen by a person", chrome: "n/a"}
requirement_items: ["S79.03"]
depends_on: ["F079-04", "SYS-memory-projects-and-context", "SYS-data-model-and-migrations", "SYS-api-and-contracts", "SYS-subscriptions-entitlements-and-usage", "surface:web", "surface:desktop", "surface:mobile", "surface:vscode", "mode:cloud", "table:user_projects", "api:PUT /api/projects/[id]", "api:POST /api/projects"]
basis: "code inspection"
second_reader: "6 of 11 sampled statements were correct; the others were corrected on this page"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F079-05 Project default model

A Managed Cloud project can store a default model. On Web a new chat in that project starts on it once; Mobile shows and applies it for Cloud chats; VS Code shows it and offers a button that opens the picker, but does not switch by itself. The CLI and Chrome have no project default.

Area: [79. Routing and model-neutral orchestration](README.md). Requirement items: [S79.03](../../10-requirements/capabilities/079-routing-and-model-neutral-orchestration.md#s7903).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | partly built (this page lists unfinished parts) | built | not seen by a person |
| CLI | not built | not built | n/a |
| VS Code | partly built (this page lists unfinished parts) | built | not seen by a person |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Stores one model id on the project and uses it as the starting model of new chats in that project. [inferred from ProjectDefaultModelField.tsx and WebChatPage.tsx:2125-2140]

**Why it exists.** Teams and individuals keep a project on the model that suits its work without choosing each time (brief S79.03).

**Who uses it.** People with Managed Cloud projects on Web, Desktop, Mobile and VS Code.

**Problems it solves**

- Forgetting to change model for a project's chats.
- Starting a project chat on whatever model was last used.

**Use cases**

- A coding project defaults to a strong code model.
- A notes project defaults to an economy choice.
- A project keeps the Auto model as its default.

## 2. User experience

**Where to find it**

- Web and Desktop: project settings dialog, field 'Default model' (apps/web/features/projects/components/ProjectDefaultModelField.tsx:46-50; used at ProjectSettingsDialog.tsx:336).
- Mobile: project overview line 'Default model: <name>' (apps/mobile/src/features/projects/components/CloudProjectOverview.tsx:70-71); applies in new Cloud chats (apps/mobile/app/(app)/(tabs)/chat.tsx:339-348).
- VS Code: project list shows the model; 'Project default model' quick pick offers 'Use <your model>' or 'No default model'; applying a project shows 'Its default model is <name>.' with a 'Choose the model' button (apps/extension-vscode/src/features/projects/projectActions.ts:320-342, 405-416).

**Before you start**

- A Managed Cloud project; Local and own-key projects are device-owned and not stored in the table (apps/web/db/neon/0053_projects_managed_cloud_contract.sql:1-3).
- Signed in. The plan limit is a Web UI filter only (skipped while billing policy is not ready), not enforced on the server; an API client can store any id. [ProjectDefaultModelField.tsx:27; apps/web/app/api/projects/[id]/route.ts:212]

**Screens and controls**

- Web: select with first option 'No default, use the model you last picked'; help text 'New chats in this project start on this model. You can still switch in any chat.' A saved value that is no longer allowed appears as '<name> (not available on your plan)' (ProjectDefaultModelField.tsx:55-78).

**Journey**

1. Open project settings and choose a default model, then save.
2. Start a new chat inside the project.
3. The picker shows the project's model.
4. Send; you can still change the model in that chat.

**What the person sees and gets**

- The picker shows the project's model on a new chat.
- VS Code notification text and button.

**Settings**

- Project field defaultModelId; set through the projects API.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web field lists every non-coming-soon model until billing policy is ready (tier null); after that it lists only plan-allowed models, with Auto rows only for non-free tiers that allow them (ProjectDefaultModelField.tsx:21-38; `if (tier === null) return true` at line 27).
- Save writes default_model_id through PUT /api/projects/[id] (apps/web/app/api/projects/[id]/route.ts:212); POST /api/projects inserts default_model_id (apps/web/app/api/projects/route.ts:198-200) and the list query selects it (route.ts:99).
- On Web, a new chat with no displayed conversation applies the project default once per project and model, only if the model is selectable in the model store; the plan tier is not checked (apps/web/features/chat/pages/WebChatPage.tsx:2123-2140).
- Mobile reads defaultModelId into project details (apps/mobile/stores/projects/cloudProjectStore.ts:140-152) and shows it as the conversation model when in Cloud mode, no model shown yet, and the account may use it (chat.tsx:339-348).
- Mobile applies the default with an entitlement check (isSelectableModelIdForAccess with cloudUnlocked and subscriptionTier) and requires cloud execution mode, while Web checks only selectability: apps/mobile/app/(app)/(tabs)/chat.tsx:339-348 vs apps/web/features/chat/pages/WebChatPage.tsx:2136.
- VS Code stores and shows the default and offers the picker (projectActions.ts:157, 320-342, 405-416).

**Incomplete**

- VS Code does not switch the model; it opens the picker on a button press (projectActions.ts:405-416).
- VS Code can only set the project default to the person's own configured model, and refuses a Local one (projectActions.ts:320-342).
- Mobile reads and applies the default but no control to set it was found.

**Present but disconnected or switched off**

- none found.

**Not available**

- CLI: no project default model.
- Chrome: no project default model.
- Own-key and Local projects: not stored in the cloud table.
- Desktop has no own implementation: grep found no defaultModelId in apps/desktop/src, apps/cli or apps/extension, so Desktop depends wholly on the hosted web UI.

## 4. Required behaviour

**Established requirements**

- A project can set a default model that new chats in the project use. (source: brief S79.03)
- Project default privacy mode was cut because it was never read; Cloud projects keep their managed label. (source: doc: docs/decisions/wire-or-cut.md:777)

**Acceptance criteria**

1. Setting a default in a Web project and starting a new chat in it selects that model.
2. The field does not list models the plan cannot use, and shows a stale value with '(not available on your plan)'.
3. Choosing 'No default' stores null and new chats use the last model picked.
4. The default applies once per project and does not override a model the person changes mid-chat.
5. On Mobile a Cloud new chat in the project shows the project model if the account may use it.
6. VS Code shows the default model name when a project is applied and offers the picker.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- A downgrade that makes the saved default unavailable should fall back without an error. The Web code simply skips an unselectable model. [inferred from WebChatPage.tsx:2136]

**Proposed improvements** (suggestions, not requirements)

- [proposed] Let VS Code switch directly when the default is allowed.
- [proposed] Add a Mobile control to set the default.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | ProjectDefaultModelField | `apps/web/features/projects/components/ProjectDefaultModelField.tsx` | Web select. |
| component | ProjectSettingsDialog | `apps/web/features/projects/components/ProjectSettingsDialog.tsx` | Holds defaultModelId state and saves it (83, 182, 336). |
| screen | WebChatPage new-chat apply | `apps/web/features/chat/pages/WebChatPage.tsx` | Applies the default once (2123-2140). |
| endpoint | PUT /api/projects/[id] | `apps/web/app/api/projects/[id]/route.ts` | Updates default_model_id (line 212). |
| endpoint | POST and GET /api/projects | `apps/web/app/api/projects/route.ts` | Create inserts default_model_id (198-200); list selects it (99, 255-256). |
| table | user_projects.default_model_id | `apps/web/db/neon/0053_projects_managed_cloud_contract.sql` | Column that stores the default. |
| schema | project contract | `packages/contracts/cloud-contracts/src/projects.ts` | defaultModelId in project shapes (52, 95). |
| other | project mapping | `apps/web/lib/projects.ts` | Maps default_model_id to defaultModelId (159). |
| store | cloudProjectStore | `apps/mobile/stores/projects/cloudProjectStore.ts` | Mobile project details with defaultModelId. |
| screen | mobile chat tab | `apps/mobile/app/(app)/(tabs)/chat.tsx` | Applies the default to a new Cloud chat (314-348). |
| component | CloudProjectOverview | `apps/mobile/src/features/projects/components/CloudProjectOverview.tsx` | Shows 'Default model: ...'. |
| service | projectActions | `apps/extension-vscode/src/features/projects/projectActions.ts` | VS Code apply, set and notify (157, 320-420). |
| other | projectPresentation | `apps/extension-vscode/src/features/projects/projectPresentation.ts` | Shows the default model in project rows (line 45). |
| hook | useNewChatDefaultModel | `apps/web/features/chat/pages/WebChatPage.tsx` | Related hook that applies the account default to new chats (used at line 2124). |
| store | useModelStore | `apps/web/shared/stores/model-store.ts` | Receives setSelectedModelId from the apply effect. |
| test | projectsView tests | `apps/extension-vscode/src/__tests__/projectsView.test.ts` | VS Code default model flows. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person saves a default in project settings; client calls PUT /api/projects/[id] with defaultModelId. | device and our servers | ProjectSettingsDialog.tsx:182; route.ts:212 |
| Server stores the id in user_projects.default_model_id. | our servers | 0053_projects_managed_cloud_contract.sql:9 |
| On opening a new chat in the project the Web page reads the id from the project store and selects it if selectable. | device | WebChatPage.tsx:2125-2140 |
| The first message sends the selected model through the normal chat route (see F079-04). | our servers | request-processor.ts:714 |
| Mobile and VS Code read the same project data and apply or offer it locally. | device | chat.tsx:339-348; projectActions.ts:405-416 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Project default model id | table:user_projects column default_model_id | Yes, to every app that reads projects | Kept with the project; goes with the project when deleted [inferred] |

**Models and providers.** Any chat model the plan allows, including Auto rows on paid plans. The server was not seen validating the id against the plan on save: unknown.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed in with Managed Cloud projects. |
| Permissions | Project edit permission; shared-project rules not examined. |
| Subscription | Field options follow tier (isModelAllowedForTier, getAllowedAutoModesForTier) (ProjectDefaultModelField.tsx:26-36). |
| Limits and metering | none found for the setting itself. |
| Feature flags | none found. |
| Model compatibility | Coming-soon models are removed from the list. While billing policy is not ready (tier null) the field lists all non-coming-soon models (ProjectDefaultModelField.tsx:27). |
| Provider restrictions | none specific. |
| Local mode | Local projects are device-owned and not stored in the cloud table; VS Code refuses a Local model as the project default (projectActions.ts:320-342). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| No default | First option 'No default, use the model you last picked'; stores null. | ProjectDefaultModelField.tsx:66-67 |
| Saved default no longer allowed | Field shows '<name> (not available on your plan)'; Web apply skips only models that are not selectable in the model store and does not check the plan tier, unlike Mobile, which checks isSelectableModelIdForAccess. | ProjectDefaultModelField.tsx:60-63; WebChatPage.tsx:2136 |
| Existing conversation open | The apply effect resets and does nothing. | WebChatPage.tsx:2129-2132 |
| Mobile: project details not loaded | Loads details when in Cloud mode and signed in. | chat.tsx:330-336 |
| VS Code default equals current model | Shows the plain message with no button. | projectActions.ts:406-409 |
| Save failure, offline, loading | not examined in the field itself. | not examined |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/extension-vscode/src/__tests__/projectsView.test.ts`: describe 'project default model with a Local default' (line 176): quick pick shows 'No default model', apply message says 'Its default model is'.
- `apps/web/lib/__tests__/projects.test.ts`: Project mapping; matched on defaultModelId (details not read).
- `packages/contracts/cloud-contracts/src/__tests__/managed-cloud-projects-client.test.ts`: Projects client; matched on defaultModelId (details not read).
- `apps/mobile/__tests__/NewChatProjectRoundTrip.test.tsx`: New chat started in a project keeps the project across trips; default model not confirmed.

**Test scenarios**

- **Set and apply on Web**
  1. Open project settings, set a default model, save.
  2. Start a new chat in that project.
  - Expected: Picker shows the project's model.
- **Stale default**
  1. Set a default, then use an account on a lower plan.
  - Expected: Field shows '(not available on your plan)'; the new-chat apply skips the default only if the model is not selectable in the model store (no plan check), otherwise the last picked model is used.
- **Clear default**
  1. Choose 'No default...' and save.
  - Expected: default_model_id is null; new chats use the last model.
- **VS Code apply**
  1. Apply a project that has a default different from the current model.
  - Expected: Notice with 'Choose the model'; pressing it opens the model picker; model does not change by itself.
- **Mobile**
  1. Pick a cloud project with a default; start a new Cloud chat.
  - Expected: Model shown is the default when the account may use it.

**Where to look when it fails**

- Table user_projects column default_model_id.
- Project API responses (GET /api/projects).
- Mobile cloud project store details.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/079-routing-and-model-neutral-orchestration.md](../../70-qa/test-plans/web/079-routing-and-model-neutral-orchestration.md)
- Desktop: [70-qa/test-plans/desktop/079-routing-and-model-neutral-orchestration.md](../../70-qa/test-plans/desktop/079-routing-and-model-neutral-orchestration.md)
- Mobile: [70-qa/test-plans/mobile/079-routing-and-model-neutral-orchestration.md](../../70-qa/test-plans/mobile/079-routing-and-model-neutral-orchestration.md)
- VS Code: [70-qa/test-plans/vscode/079-routing-and-model-neutral-orchestration.md](../../70-qa/test-plans/vscode/079-routing-and-model-neutral-orchestration.md)

## 10. Gaps and dependencies

- **No default model on CLI or Chrome.** Affects: CLI, Chrome. Evidence: brief S79.03 status; no references in apps/cli or apps/extension.. Work needed: Decide whether those surfaces read project defaults; Chrome has no projects in this scope.
- **VS Code does not switch to the default, only offers the picker, and can only set the user's own model.** Affects: VS Code. Evidence: projectActions.ts:320-342, 405-416. Work needed: Wire a direct switch and a model choice list.
- **Mobile has no control to set the default.** Affects: Mobile. Evidence: only read paths in cloudProjectStore.ts and chat.tsx. Work needed: Add a control or record that Web owns it.
- **No direct test found for ProjectDefaultModelField or the new-chat apply effect.** Affects: Web. Evidence: search of web tests for the field name found none. Work needed: Add component and page tests.
- **Server validation of defaultModelId against plan was not found.** Affects: Web, API. Evidence: route.ts:212 writes the value as given. Work needed: Check and add validation if missing.
- Not built on: CLI, Chrome (from the capability ledger).

**Depends on**

- F079-04
- SYS-memory-projects-and-context
- SYS-data-model-and-migrations
- SYS-api-and-contracts
- SYS-subscriptions-entitlements-and-usage
- surface:web
- surface:desktop
- surface:mobile
- surface:vscode
- mode:cloud
- table:user_projects
- api:PUT /api/projects/[id]
- api:POST /api/projects

## Unknown

- Whether the server rejects a default model the plan cannot use.
- Whether shared (workspace) projects let members change the default.
- How Desktop Electron differs; it loads the hosted web app.
- Whether a test covers the Web apply effect.
- What a Mobile user sees for a default they cannot access.

## Second reader's check

A second reader checked 11 statements of this page against the code: 6 correct, 4 wrong or partly wrong, 1 could not be checked. The statements found wrong were corrected on this page; they are listed here for the record.

- **Partly wrong (section 3):** "Web field lists only models the plan allows and drops coming-soon models; Auto rows appear only for non-free tiers (ProjectDefaultModelField.tsx:21-38)" The code shows: The plan filter applies only when billing policy is ready; when tier is null every non-coming-soon model is listed. managed_cloud rows need a non-free tier and membership in getAllowedAutoModesForTier. (ProjectDefaultModelField.tsx:21-33 (`if (tier === null) return true`)). **Corrected:** The field lists every non-coming-soon model until billing policy is ready; after that it lists only plan-allowed models, with Auto rows only for non-free tiers that allow them.
- **Partly wrong (section 3):** "Save writes default_model_id through PUT /api/projects/[id] (route.ts:212) and creation reads it back (projects/route.ts:99)" The code shows: PUT line 212 is correct and writes the value as given. route.ts:99 is a SELECT in the list query, not creation. Creation writes it as an INSERT column at lines 198-200. (apps/web/app/api/projects/[id]/route.ts:212; apps/web/app/api/projects/route.ts:99, 198-200). **Corrected:** POST /api/projects inserts default_model_id (route.ts:198-200); the list query selects it (route.ts:99).
- **Partly wrong (section 7/2):** "Signed in; the model must be allowed by the plan (Web field filters options)" The code shows: Plan filtering is client-side only and skipped while billing is not ready. The PUT route adds the value with no plan check. (ProjectDefaultModelField.tsx:27; [id]/route.ts:212). **Corrected:** The plan limit is a Web UI filter, not enforced on the server; an API client can store any id.
- **Partly wrong (section 8):** "Saved default no longer allowed: field shows '<name> (not available on your plan)'; Web apply skips an unselectable model (ProjectDefaultModelField.tsx:68-70; WebChatPage.tsx:2136)" The code shows: Label is correct, but at lines 60-63, not 68-70. The apply effect checks isSelectableModelId, not plan entitlement, so a plan-disallowed but selectable model is still applied. (WebChatPage.tsx:2136; ProjectDefaultModelField.tsx:60-63). **Corrected:** Web apply skips only models that are not selectable in the model store; it does not check the plan tier, unlike Mobile, which checks isSelectableModelIdForAccess.

**Facts the page missed**

- Mobile applies the default with an entitlement check (isSelectableModelIdForAccess with cloudUnlocked and subscriptionTier) and requires cloud execution mode, while Web checks only selectability: apps/mobile/app/(app)/(tabs)/chat.tsx:339-348 vs apps/web/features/chat/pages/WebChatPage.tsx:2136.
- Web field lists all non-coming-soon models while billing policy is not ready (tier null): apps/web/features/projects/components/ProjectDefaultModelField.tsx:27.
- Desktop has no own implementation: grep found no defaultModelId in apps/desktop/src, apps/cli or apps/extension, so Desktop depends wholly on the hosted web UI. The page marks it 'built' without saying so in section 3.

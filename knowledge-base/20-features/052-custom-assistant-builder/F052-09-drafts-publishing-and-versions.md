---
id: "F052-09"
type: "feature"
title: "Drafts, publishing and versions"
aliases: ["Drafts, publishing and versions", "Draft save", "Publish", "Version history", "Revert published version", "Restore version", "S52.27", "S52.28", "S52.29", "S52.30", "Publish changes", "Save draft", "user_agent_versions", "published_version"]
area: "52 Custom-assistant builder"
available_on: ["web", "mobile"]
implementation: {web: "built", desktop: "missing", mobile: "built", cli: "missing", vscode: "missing", chrome: "missing"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S52.27", "S52.28", "S52.29", "S52.30"]
depends_on: ["surface:web", "surface:mobile", "mode:cloud", "table:user_agents", "table:user_agent_versions", "api:POST /api/custom-agents/[id]/publish", "api:GET /api/custom-agents/[id]/versions", "api:POST /api/custom-agents/[id]/restore", "api:PATCH /api/custom-agents/[id]", "SYS-data-model-and-migrations", "SYS-api-and-contracts", "SYS-authorization-and-workspaces", "F052-10"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F052-09 Drafts, publishing and versions

A builder edits an agent as a working draft, then publishes it to freeze a numbered version that shared people run. The builder can browse past versions and restore one back into the draft. Web and Mobile have this against our servers. The CLI and desktop have only a single file, with no versions.

Area: [52. Custom-assistant builder](README.md). Requirement items: [S52.27](../../10-requirements/capabilities/052-custom-assistant-builder.md#s5227), [S52.28](../../10-requirements/capabilities/052-custom-assistant-builder.md#s5228), [S52.29](../../10-requirements/capabilities/052-custom-assistant-builder.md#s5229), [S52.30](../../10-requirements/capabilities/052-custom-assistant-builder.md#s5230).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| Desktop | not built | not built | n/a |
| Mobile | built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| CLI | not built | not built | n/a |
| VS Code | not built | not built | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** The agent's row in user_agents is the working copy, saved in place. Publish copies it into user_agent_versions as the next number and points published_version at it. Teammates run the published copy; the owner's own chats run the draft. Restore copies an old version's settings into the draft without publishing (apps/web/lib/services/custom-agent-service.ts:146-149, 449-551).

**Why it exists.** Builders need to try changes without breaking an assistant others rely on, and to roll back a bad edit (brief S52.27 to S52.30; migration comment 'Publishing freezes the copy into user_agent_versions' at apps/web/db/neon/0370_user_agents.sql:11-17).

**Who uses it.** The owner of an agent. Teammates are affected only through what is published.

**Problems it solves**

- Edits do not reach teammates until published.
- Mistakes can be undone from the history.
- Each publish carries a short note on what changed.

**Use cases**

- Tweak instructions, chat with the draft yourself, then publish when happy.
- Publish a new version for the team with the note 'tighter tone'.
- Restore version 2 after version 3 behaved badly, check it, then publish again.
- Notice 'Unpublished changes' on the list and decide to publish.

## 2. User experience

**Where to find it**

- Web: Agents, open an agent with Edit; the Agent tab shows the form footer 'Save draft', then the 'Publish', 'Sharing' and 'Version history' sections (apps/web/features/agents/components/AgentEditorPage.tsx:287-345, 438-450; AgentPublishPanel.tsx:150-343).
- Mobile: Agents, open an agent; section 'Publish' with 'What changed' and the 'Publish' or 'Publish update' button, then 'Version history' with Restore (apps/mobile/src/features/agents/components/AgentManageSections.tsx:226-300).
- CLI, desktop, VS Code, Chrome: no draft, publish or version commands found; CLI /agents history shows what agents did (runs and spend), not versions (apps/cli/src/agents.rs:1349-1389).

**Before you start**

- Signed in; Mobile in Cloud mode.
- Agent saved first: Publish is disabled while the form has unsaved changes and shows 'Save your draft before you publish it.' (AgentPublishPanel.tsx:166-168, 182).
- Not retired (AgentPublishPanel.tsx:65, 182).

**Screens and controls**

- Web footer button 'Create agent' (new) or 'Save draft' (existing), disabled until something changed (AgentEditorPage.tsx:297-314).
- Web 'What changed (optional)' text box, up to 300 characters, and 'Publish' or 'Publish changes' button (AgentPublishPanel.tsx:171-188).
- Web 'Version history' list: 'Version N', ' · Published' on the live one, date, publisher name and note, and a 'Restore' button per row (AgentPublishPanel.tsx:301-343).
- Web restore confirmation 'Restore version N?' with button 'Restore version' (AgentPublishPanel.tsx:108-123).
- Web state text under the title such as 'Draft', 'Only you · Unpublished changes' (apps/web/features/agents/lib/agent-display.ts:14-31).
- Mobile 'Save' or 'Create' in the header, Publish section, history list with 'Live' marker and 'Restore' (AgentEditorScreen.tsx:97-107; AgentManageSections.tsx:226-300).

**Journey**

1. Open Agents and press 'New agent' or Edit.
2. Change fields; footer shows 'Unsaved changes'.
3. Press 'Save draft' (toast 'Draft saved.').
4. In the Publish section type an optional note and press 'Publish' (first time) or 'Publish changes'.
5. A toast says 'Published version N.' and the history refreshes.
6. To go back, press 'Restore' on an older version and confirm; the form fills with that version and a toast says 'Restored version N into your draft.'
7. Press 'Publish changes' to make the restored settings live.

**What the person sees and gets**

- Toasts: 'Draft saved.', 'Created <name>.', 'Published version N.', 'Restored version N into your draft.' (AgentEditorPage.tsx:225-229; AgentPublishPanel.tsx:93, 119).
- Errors: 'The agent could not be published.', 'Version history could not be refreshed.', 'That version could not be restored.' (AgentPublishPanel.tsx:95, 102, 120).
- Server refusals: 'There are no changes to publish.', 'Another publish of this agent just finished. Try again.' (custom-agent-service.ts:461, 481).
- Publish panel line: 'Version N is what people you share with use.' and 'Your draft has changes they do not have yet.' or 'Not published yet. Only you can chat with the draft.' (AgentPublishPanel.tsx:159-163).

**Settings**

- Note length limit 300 characters (packages/contracts/cloud-contracts/src/agents.ts:27, 155-157).
- Sharing choices apply to the published version only (see F052-10).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Draft save: PATCH /api/custom-agents/[id] writes the fields to the working row (apps/web/app/api/custom-agents/[id]/route.ts:37-47; service:386-416).
- Publish: POST /api/custom-agents/[id]/publish inside a database transaction; refuses an unchanged copy, takes the next version number, inserts the row, sets published_version (apps/web/app/api/custom-agents/[id]/publish/route.ts:20-30; service:449-491).
- A duplicate version number from two simultaneous publishes is caught and reported as a conflict (service:471-484; table unique constraint 0370_user_agents.sql:103).
- Versions: GET /api/custom-agents/[id]/versions lists up to 200 versions newest first, owner only, with publisher names (versions route:16-28; service:493-531).
- Restore: POST /api/custom-agents/[id]/restore copies the stored config into the draft through the normal update path and does not publish (restore route:20-30; service:533-551).
- Owner sees the working copy and a hasUnpublishedChanges flag; a teammate sees only the published copy and no flag (service:146-178).
- Versions cannot be changed or deleted by the app role: only select and insert are granted on user_agent_versions (0370_user_agents.sql:208-226).
- Mobile has publish, version history and restore against the same routes (apps/mobile/src/features/agents/service.ts:79-99; AgentManageSections.tsx:177-300).

**Incomplete**

- Restore goes through updateAgentDraft, so it validates the stored model again; a version that pinned a model no longer in the catalog would fail with 'Pick a model from the list.' [inferred from service:214, 550].
- No diff view between versions; the list shows date, publisher and note only (AgentPublishPanel.tsx:317-336).
- There is no way to publish an older version directly or to unpublish; restore then publish is the only path [inferred from routes].
- No test chat that uses unsaved form edits (brief S52.05 neighbour); the owner can chat only with the saved draft.

**Present but disconnected or switched off**

- Brief marks draft save, publish, version history and revert 'missing' on all apps; Web and Mobile code exist and tests cover them, so the brief is out of date.

**Not available**

- CLI, VS Code and Chrome: no publish or version code found.
- Desktop (Tauri): the editor overwrites one markdown file (apps/desktop/src-tauri/src/sys/commands/custom_agents.rs:260-282); no version history.
- Version note editing after publish.

## 4. Required behaviour

**Established requirements**

- A builder can save an assistant as a draft without publishing it. (source: brief S52.27)
- A builder can publish an assistant so others (or they) can use the published version. (source: brief S52.28)
- An assistant keeps a version history the builder can browse. (source: brief S52.29)
- A builder can revert an assistant to an earlier published version. (source: brief S52.30)
- An action a user cannot undo asks first and the question names the consequence; restore uses the shared confirm surface. (source: doc: AGENTS.md section 9)
- Migrations are append-only; version rows are never edited by the app. (source: doc: AGENTS.md section 5)

**Acceptance criteria**

1. Save draft with a change: the saved agent shows 'Unpublished changes' only after it has been published once.
2. Publish with no changes: refused with 'There are no changes to publish.' and no new version appears.
3. Publish twice with edits between: versions 1 and 2 exist, version 2 is marked Published.
4. A teammate chatting with the agent uses the published version, not the draft.
5. Restore version 1 after publishing version 2: the form shows version 1's settings, the live version stays 2 until you publish.
6. A note longer than 300 characters is refused by the server.
7. A retired agent cannot publish or restore.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Every surface that lets a person edit an agent should let them publish and restore, or say that it cannot [inferred].
- Restore should work even if the pinned model has left the catalog, by clearing the model with a notice [inferred from the failure path at service:214].
- Local file agents on CLI and desktop could use git history as their version history, which the product does not state [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Show a diff between a version and the draft before Restore.
- [proposed] Offer 'Chat with draft' using unsaved edits as a preview pane.
- [proposed] Let the owner see which version each teammate chat used.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | publishAgent | `apps/web/lib/services/custom-agent-service.ts` | Transactional publish: unchanged check, next version number, insert, set published_version (lines 449-491). |
| service | listAgentVersions | `apps/web/lib/services/custom-agent-service.ts` | Reads up to 200 versions with publisher names (lines 493-531). |
| service | restoreAgentVersion | `apps/web/lib/services/custom-agent-service.ts` | Copies a stored config into the draft (lines 533-551). |
| service | updateAgentDraft | `apps/web/lib/services/custom-agent-service.ts` | Draft save and the write path restore uses (lines 386-416). |
| service | sameAgentConfig / effectiveAgentConfig / toManagedCloudAgent | `apps/web/lib/services/custom-agent-service.ts` | Decides unpublished changes and which copy a viewer sees (lines 131-178). |
| endpoint | api:POST /api/custom-agents/[id]/publish | `apps/web/app/api/custom-agents/[id]/publish/route.ts` | Publish route (line 32 exports POST). |
| endpoint | api:GET /api/custom-agents/[id]/versions | `apps/web/app/api/custom-agents/[id]/versions/route.ts` | Version list route (line 30). |
| endpoint | api:POST /api/custom-agents/[id]/restore | `apps/web/app/api/custom-agents/[id]/restore/route.ts` | Restore route. |
| endpoint | api:PATCH /api/custom-agents/[id] | `apps/web/app/api/custom-agents/[id]/route.ts` | Draft save (line 59 exports PATCH). |
| schema | AgentPublishRequestSchema / AgentVersionSchema / AgentRestoreRequestSchema | `packages/contracts/cloud-contracts/src/agents.ts` | Wire shapes for note, version row and restore (lines 155-173). |
| table | table:user_agent_versions | `apps/web/db/neon/0370_user_agents.sql` | One row per publish, unique per (agent, version), config JSON, note, publisher (lines 95-104). |
| table | table:user_agents | `apps/web/db/neon/0370_user_agents.sql` | Working copy and published_version pointer (lines 44-76). |
| component | AgentPublishPanel | `apps/web/features/agents/components/AgentPublishPanel.tsx` | Web Publish, Sharing and Version history sections. |
| screen | AgentEditorPage | `apps/web/features/agents/components/AgentEditorPage.tsx` | Draft save, dirty tracking and the unsaved-changes guard (lines 183-249). |
| service | agentsApi (Web client) | `apps/web/features/agents/services/agents-client.ts` | publish, versions and restore calls (lines 138-152). |
| component | AgentPublishSection (Mobile) | `apps/mobile/src/features/agents/components/AgentManageSections.tsx` | Mobile publish, history and restore (lines 177-300). |
| service | publishAgent / restoreAgentVersion (Mobile) | `apps/mobile/src/features/agents/service.ts` | Mobile calls to the same routes (lines 79-99). |
| hook | useAgentEditor | `apps/mobile/src/features/agents/useAgentEditor.ts` | Mobile draft and dirty state. |
| schema | agentDraftsEqual / agentStateLabel | `packages/contracts/cloud-contracts/src/agent-drafts.ts` | Shared draft comparison and the state label text (lines 37-67). |
| command | save_custom_agent | `apps/desktop/src-tauri/src/sys/commands/custom_agents.rs` | Desktop overwrites one file; shows there is no version concept (lines 260-282). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The person edits the form in the browser or app; the draft is held in memory with a dirty flag and an unsaved-changes guard. | device | apps/web/features/agents/components/AgentEditorPage.tsx:183-191 |
| Save sends PATCH; the server updates the owner's row only (where id and user_id match). | our servers | custom-agent-service.ts:386-416 |
| Publish sends POST with the note; inside one transaction the server compares the draft to the published copy, picks max(version)+1, inserts the version with the config JSON, and sets published_version. | our servers | custom-agent-service.ts:449-491 |
| Version list reads user_agent_versions for the owner; Restore reads one version's JSON, parses it against the schema, and runs the draft update. | our servers | custom-agent-service.ts:493-551 |
| A teammate's chat loads the row with the joined published config and runs that copy. | our servers | custom-agent-service.ts:146-149, 281-297; agent-turn-config.ts:63-64 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Working copy | table:user_agents | Same database for Web and Mobile | Until the owner deletes the agent |
| Published versions with note and publisher | table:user_agent_versions | Same database | Kept for the life of the agent; removed on agent delete (cascade, 0370_user_agents.sql:97). Only the latest 200 are listed (service:511). |

**Models and providers.** A version stores the model id (or Auto) in its config JSON (service:103-124). No provider is involved in drafting or publishing. Each version is parsed with the current schema when read; unreadable versions are skipped from the list (service:518-521).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed in. Mobile needs Cloud mode. |
| Permissions | Only the owner publishes, lists versions or restores (requireOwnedAgent used in service:321-331, 456, 539; versions route:21). |
| Subscription | No plan gate found on draft, publish or restore in the routes read. |
| Limits and metering | Note up to 300 characters; versions list capped at 200; rate limit class 'chat-conversation' on all agent routes (agent-route.ts:35). |
| Feature flags | none found in the code |
| Model compatibility | Restore re-validates the stored model (service:214, 550). |
| Provider restrictions | none found in the code |
| Local mode | Not available in Local mode on Mobile (Cloud gate). CLI and desktop have no draft or publish; the file is the only copy and runs on the device. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Unsaved edits | Publish button disabled with 'Save your draft before you publish it.'; leaving the page asks to discard. | AgentPublishPanel.tsx:166-168, 182; AgentEditorPage.tsx:186-191 |
| No changes since last publish | Button disabled in the UI; the server also refuses with 'There are no changes to publish.' | AgentPublishPanel.tsx:182; service:459-462 |
| Two publishes at once | Second fails with 'Another publish of this agent just finished. Try again.' | service:479-482 |
| Publish succeeds but history refresh fails | Reported separately: success toast, then 'Version history could not be refreshed.' | AgentPublishPanel.tsx:87-106; AgentPublishPanel.test.tsx |
| Publish fails | Toast 'The agent could not be published.' and no version is claimed. | AgentPublishPanel.tsx:94-98 |
| History or sharing load fails | Red message with 'Try again'. | AgentPublishPanel.tsx:196-204 |
| Restore | Confirmation explains the draft is replaced and unpublished edits are lost; teammates keep the published version. | AgentPublishPanel.tsx:108-123 |
| Version missing | 404 'That version no longer exists.' | service:548-549 |
| Retired agent | Save, publish and restore refused until it is brought back. | service:333-337 |
| Offline or cancel mid-request | not handled in the code beyond the generic error toast; no queue or retry found. | agents-client.ts:61-71 |
| Accessibility | Sections have labelled headings; buttons have aria-busy and touch-size classes. | AgentPublishPanel.tsx:153-190 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/custom-agents/[id]/publish/route.test.ts`: Publish with and without a note, refusal when writes are not allowed, 404 for a bad id.
- `apps/web/app/api/custom-agents/[id]/versions/route.test.ts`: Owner check before listing, refusal paths.
- `apps/web/app/api/custom-agents/[id]/restore/route.test.ts`: Restore, bad version number, refusal.
- `apps/web/app/api/custom-agents/[id]/route.test.ts`: GET and PATCH draft save, invalid patch refused.
- `apps/web/lib/agents/__tests__/custom-agent-service.test.ts`: Owner sees working copy with unpublished flag; teammate sees published copy; config comparison ignores list order.
- `apps/web/features/agents/__tests__/AgentPublishPanel.test.tsx`: Published-but-history-failed and failed-publish reporting.
- `apps/web/features/agents/__tests__/AgentEditorPage.test.tsx`: Publishing closed until draft saved; draft retained after failed save.
- `apps/web/db/neon/user-agents-migration.test.ts`: Only the owner can publish; schema limits.
- `apps/mobile/src/features/agents/__tests__/AgentsScreens.test.tsx`: Publishing a saved draft, restore replacing the draft, declining restore keeps edits.
- `apps/mobile/src/features/agents/__tests__/service.test.ts`: Publish with trimmed note, restore.

**Test scenarios**

- **Publish and refuse unchanged**
  1. Create and save an agent.
  2. Press Publish.
  3. Press Publish changes again without editing.
  - Expected: Version 1 exists; second attempt is blocked in the UI and refused by the server.
- **Teammate sees only published**
  1. Owner shares with a teammate (workspace agent, published).
  2. Owner edits instructions and saves but does not publish.
  3. Teammate opens a chat.
  - Expected: Teammate's chat uses the old instructions.
- **Restore does not publish**
  1. Publish v1, change, publish v2.
  2. Press Restore on v1 and confirm.
  3. Check the live version.
  - Expected: Form shows v1 settings; live stays v2; 'Publish changes' becomes available.
- **Note limit**
  1. POST publish with a 301 character note using a test session.
  - Expected: Validation error; no version added.
- **Concurrent publish**
  1. Send two publish requests at the same moment with edits between.
  - Expected: One succeeds, the other gets the conflict message; version numbers have no gaps or duplicates.
- **Retired agent**
  1. Retire an agent.
  2. Try Save draft and Publish.
  - Expected: Refused with 'This agent is retired. Bring it back before changing it.'

**Where to look when it fails**

- Tables user_agent_versions (unique agent_id + version) and user_agents.published_version.
- HTTP 409 conflict from publish; 404 'That version no longer exists.'
- Client toasts listed above.

**Hands-on test plans**

- none: not built on any app
- No hands-on plan yet for Web, Mobile: the ledger marks this area as not built there, so the plan builder made none. Use the scenarios above.

## 10. Gaps and dependencies

- **No CLI, VS Code or Chrome draft, publish or version features; CLI and desktop edit one file.** Affects: CLI, desktop file, VS Code and Chrome users. Evidence: apps/cli/src/agents.rs command list (lines 565-570); custom_agents.rs:260-282. Work needed: Decide whether file agents get versions (git) or cloud agents become selectable in those apps.
- **No live test pane that uses unsaved edits.** Affects: Web and Mobile builders. Evidence: AgentEditorPage.tsx:405 disables Chat while dirty. Work needed: A preview chat that carries the draft in the request.
- **Restore can fail on a model no longer in the catalog.** Affects: Web and Mobile builders. Evidence: custom-agent-service.ts:214, 550. Work needed: Clear the model on restore with a notice.
- **No diff between versions.** Affects: Builders. Evidence: AgentPublishPanel.tsx:317-336. Work needed: Add a comparison view.
- **Brief says missing on all apps.** Affects: Planning. Evidence: area brief S52.27-S52.30. Work needed: Update the brief.
- Not built on: Desktop, CLI, VS Code, Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:mobile
- mode:cloud
- table:user_agents
- table:user_agent_versions
- api:POST /api/custom-agents/[id]/publish
- api:GET /api/custom-agents/[id]/versions
- api:POST /api/custom-agents/[id]/restore
- api:PATCH /api/custom-agents/[id]
- SYS-data-model-and-migrations
- SYS-api-and-contracts
- SYS-authorization-and-workspaces
- F052-10

## Unknown

- Whether a conversation records which version it ran on; no column found in the migration.
- How the Electron desktop shows these pages; Electron code was not opened.
- Whether e2e tests cover publish; only the list page e2e (apps/web/e2e/agents-pages.spec.ts) was seen.

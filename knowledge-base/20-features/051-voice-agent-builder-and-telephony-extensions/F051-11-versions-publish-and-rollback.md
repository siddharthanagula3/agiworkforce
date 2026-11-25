---
id: "F051-11"
type: "feature"
title: "Versions, publish and rollback"
aliases: ["Versions, publish and rollback", "S51.22 Agent versioning", "S51.23 Publish and rollback", "version history", "Restore version"]
area: "51 Voice-agent builder and telephony extensions"
available_on: []
implementation: {web: "missing", desktop: "missing", mobile: "missing", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S51.22", "S51.23"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "table:user_agent_versions", "table:user_agents", "api:POST /api/custom-agents/[id]/publish", "api:GET /api/custom-agents/[id]/versions", "api:POST /api/custom-agents/[id]/restore", "F051-07", "SYS-data-model-and-migrations", "SYS-authorization-and-workspaces", "SYS-api-and-contracts", "mode:cloud"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F051-11 Versions, publish and rollback

A planned feature to version a voice agent's configuration, publish a version live and roll back. Not built for voice agents. A working version history, publish and restore flow exists for ordinary custom agents on web and could be the model for it.

Area: [51. Voice-agent builder and telephony extensions](README.md). Requirement items: [S51.22](../../10-requirements/capabilities/051-voice-agent-builder-and-telephony-extensions.md#s5122), [S51.23](../../10-requirements/capabilities/051-voice-agent-builder-and-telephony-extensions.md#s5123).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | not built | not built | n/a |
| Desktop | not built | not built | n/a |
| Mobile | not built | not built | n/a |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Would keep each saved voice-agent configuration, let the owner inspect earlier ones, publish one so live calls use it, and roll back to an earlier one. For voice agents none of it exists (audit/ledger/ecosystem-capability-ledger.jsonl:1682-1683). For ordinary custom agents (text assistants) it does exist and is described below.

**Why it exists.** Changing a live phone agent can break calls, so owners need a safe way to try a change and undo it (S51.22, S51.23 in data/area-briefs/051-voice-agent-builder-and-telephony-extensions.md) [inferred reason].

**Who uses it.** Owners and editors of voice agents. For custom agents today: the agent owner on web (apps/web/app/api/custom-agents routes use requireOwnedAgent). Not CLI, VS Code, Chrome for voice (ledger n/a).

**Problems it solves**

- A bad edit goes live at once [inferred].
- No record of who changed what [inferred].
- No quick way back [inferred].

**Use cases**

- An owner edits instructions in a draft, publishes version 4, then rolls back to 3 when callers complain [proposed].
- A teammate reviews the version list and notes before publishing [proposed].
- An owner compares two versions before choosing [proposed].

## 2. User experience

**Where to find it**

- Voice agents: not present on web, desktop or mobile (audit/ledger/ecosystem-capability-ledger.jsonl:1682-1683).
- Custom agents on web (reference, not voice): the Agents page at the /chat/agents route (apps/web/app/chat/agents/page.tsx:4-12), editor panel AgentPublishPanel, sections 'Publish' and 'Version history' (apps/web/features/agents/components/AgentPublishPanel.tsx:153-156, 301-303).
- Mobile has an agents feature calling the same /api/custom-agents routes (apps/mobile/src/features/agents/__tests__/service.test.ts:65-74); whether it has publish and restore screens is unknown.

**Before you start**

- Voice agents: none can be met.
- Custom agents: signed in, owner of the agent, agent not paused or retired (assertEditable in apps/web/lib/services/custom-agent-service.ts:455).

**Screens and controls**

- Custom agent Publish panel: a 'Publish' button, or 'Publish changes' once published (AgentPublishPanel.tsx:187); sharing choices 'Only you', 'Specific people', 'Everyone in the workspace' (lines 19-28); a 'Version history' list showing 'Version N' and '· Published'; a 'Restore' button per row with aria-label 'Restore version N' (lines 320-337); a confirm titled 'Restore version N?' with button 'Restore version' (lines 110-113).
- Voice agents: none exist.

**Journey**

1. Custom agent, reference: 1 edit the draft; 2 press Publish and optionally add a note; 3 see toast 'Published version N.' (line 93); 4 open Version history; 5 press Restore on an older version and confirm; 6 see toast 'Restored version N into your draft.' (line 118); 7 press Publish changes to make that restored draft live.
2. Voice agent: not possible today.

**What the person sees and gets**

- Toasts for publish and restore; a conflict error 'There are no changes to publish.' when the draft equals the published copy (custom-agent-service.ts:461); 'That version no longer exists.' for a missing version (line 549); load error 'Publishing and sharing could not be loaded.' (AgentPublishPanel.tsx:81).

**Settings**

- Custom agent visibility: private, people, workspace (apps/web/db/neon/0370_user_agents.sql:12-24 comment).
- Voice agent version settings: none found in the code.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Custom agents: publish freezes the working copy into a numbered row in user_agent_versions and sets published_version (apps/web/lib/services/custom-agent-service.ts:449-490).
- Custom agents: version list returns up to 200 versions newest first (custom-agent-service.ts:493-531).
- Custom agents: restore copies an older config back into the draft; it does not change what is live (custom-agent-service.ts:533-551).
- Routes exist: publish, versions, restore under apps/web/app/api/custom-agents/[id] (publish/route.ts, versions/route.ts, restore/route.ts).
- Table user_agent_versions with unique (agent_id, version) and row-level security (apps/web/db/neon/0370_user_agents.sql:95-103, 208-225).
- Concurrent publishes: a unique violation becomes a conflict 'Another publish of this agent just finished. Try again.' (custom-agent-service.ts:478-484).

**Incomplete**

- Custom agent rollback is two steps: Restore into the draft, then Publish changes. There is no single 'roll back live' action in the code opened [inferred from restoreAgentVersion calling updateAgentDraft].

**Present but disconnected or switched off**

- none found in the code.

**Not available**

- Versioning (S51.22) and publish and rollback (S51.23) for voice agents are missing on web, desktop, mobile and the API (audit/ledger/ecosystem-capability-ledger.jsonl:1682-1683).
- CLI, VS Code, Chrome: not applicable for voice agents.

## 4. Required behaviour

**Established requirements**

- Voice-agent configurations are versioned so earlier versions can be inspected. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S51.22)
- A voice-agent version can be published live and rolled back to a previous version. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S51.23)
- The migration chain is append-only; add the next numbered file rather than editing an applied one. (source: AGENTS.md section 5)
- Restore of a custom agent version asks for confirmation naming the effect. (source: apps/web/features/agents/components/AgentPublishPanel.tsx:108-118)

**Acceptance criteria**

1. Every publish of a voice agent creates a new numbered version that cannot be edited.
2. The owner can list versions with time, author and note.
3. Publishing a version makes it the one new calls use.
4. Rolling back makes an earlier version live again and records who did it.
5. A publish with no changes is refused with a clear message.
6. Two simultaneous publishes cannot create the same number.
7. Calls already in progress finish on the version they started with, or the behaviour is documented (the brief does not say).

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The custom-agent flow is the closest owned pattern, and AGENTS.md section 3 says to search for the canonical owner before building a second one [inferred]; a voice agent version table could reuse its shape.
- Voice versions must hold the number, routing and voice choice as well as instructions, otherwise rollback is partial [inferred].

**Proposed improvements** (suggestions, not requirements)

- Add a one-step 'Roll back to this version' that sets the live version directly [proposed].
- Decide the in-progress call rule before building: finish on the old version [proposed].
- Record the reason note for each publish, as custom agents do (max 300 characters per 0370_user_agents.sql:99) [proposed].

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| other | Area brief | `knowledge-base/data/area-briefs/051-voice-agent-builder-and-telephony-extensions.md` | S51.22 and S51.23 with status missing. |
| other | Capability ledger rows | `audit/ledger/ecosystem-capability-ledger.jsonl` | Lines 1682-1683. |
| schema | user_agent_versions table | `apps/web/db/neon/0370_user_agents.sql` | Lines 95-103: numbered config copies; reference pattern. |
| service | Custom agent service | `apps/web/lib/services/custom-agent-service.ts` | publishAgent (449), listAgentVersions (493), restoreAgentVersion (533). |
| endpoint | Publish route | `apps/web/app/api/custom-agents/[id]/publish/route.ts` | POST publishes with an optional note. |
| endpoint | Versions route | `apps/web/app/api/custom-agents/[id]/versions/route.ts` | Lists versions. |
| endpoint | Restore route | `apps/web/app/api/custom-agents/[id]/restore/route.ts` | Restores a version into the draft. |
| schema | Agent contracts | `packages/contracts/cloud-contracts/src/agents.ts` | AgentVersionSchema (line 160) and AgentVersionListResponseSchema (169). |
| component | AgentPublishPanel | `apps/web/features/agents/components/AgentPublishPanel.tsx` | Publish, share and Version history UI. |
| component | AgentEditorPage | `apps/web/features/agents/components/AgentEditorPage.tsx` | Hosts the publish panel (line 442). |
| service | agents-client | `apps/web/features/agents/services/agents-client.ts` | publish, versions and restore client calls (lines 94-96, 138-149). |
| screen | Agents route | `apps/web/app/chat/agents/page.tsx` | Entry page titled 'Agents'. |
| test | AgentPublishPanel test | `apps/web/features/agents/__tests__/AgentPublishPanel.test.tsx` | Covers the panel. |
| test | Publish route test | `apps/web/app/api/custom-agents/[id]/publish/route.test.ts` | Covers the publish route. |
| service | Mobile agents service test | `apps/mobile/src/features/agents/__tests__/service.test.ts` | Shows mobile calls /api/custom-agents. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| No voice-agent version step exists. | our servers | audit/ledger/ecosystem-capability-ledger.jsonl:1682-1683 |
| Reference, custom agents: the browser sends POST publish; the server opens a transaction, requires the owner, compares draft with the published copy, picks the next version number, inserts the version row and sets published_version. | our servers | apps/web/lib/services/custom-agent-service.ts:449-490 |
| Reference: restore reads the stored config and writes it into the draft. | our servers | apps/web/lib/services/custom-agent-service.ts:533-551 |
| Reference: the web panel calls the routes through the agents client and shows toasts. | device | apps/web/features/agents/services/agents-client.ts:138-149 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Custom agent version rows (config JSON, note, publisher, time) | table public.user_agent_versions | unknown; the migration says shared people run the published version | rows deleted with their agent (on delete cascade, 0370_user_agents.sql:97); publisher set null if the user is removed |
| Voice agent versions | none found in the code | not applicable | not applicable |

**Models and providers.** A custom agent version stores a model choice in its config, validated against the catalog (validateAgentModel, custom-agent-service.ts:180). No model or provider takes part in publish itself. Voice agents: not applicable today.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Custom agents: signed in; the owner opens write routes through openAgentWrite (apps/web/app/api/custom-agents/[id]/publish/route.ts:21-23). Voice agents: none found in the code. |
| Permissions | Custom agents: only the owner publishes or restores (requireOwnedAgent, custom-agent-service.ts:321); the version insert policy requires published_by to be the current user (0370_user_agents.sql:220-225). Sharing needs a workspace. |
| Subscription | none found in the code for publish or rollback. Whether the custom agents feature itself is plan-gated was not established. |
| Limits and metering | List capped at 200 versions (custom-agent-service.ts:507). Note up to 300 characters. Write routes pass a rate-limit check via openAgentWrite (route.ts:22-23; limits not opened). |
| Feature flags | none found in the code. |
| Model compatibility | Custom agent model must be valid in the catalog; otherwise rejected. |
| Provider restrictions | none found in the code for versioning. |
| Local mode | Custom agent publish needs our servers and a database, so it does not run in Local mode; whether mobile or desktop keeps a local copy is unknown. Voice agents: nothing exists in any mode. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Nothing changed since last publish | Conflict error 'There are no changes to publish.' | apps/web/lib/services/custom-agent-service.ts:461 |
| Two publishes at once | Unique violation becomes a conflict asking to try again. | apps/web/lib/services/custom-agent-service.ts:478-484 |
| Version deleted or unreadable | Not found 'That version no longer exists.' | apps/web/lib/services/custom-agent-service.ts:549 |
| Agent paused or retired | assertEditable blocks publish and restore. | apps/web/lib/services/custom-agent-service.ts:455, 538 |
| Load failure of panel | Message 'Publishing and sharing could not be loaded.' | apps/web/features/agents/components/AgentPublishPanel.tsx:81 |
| Publishing is in progress | A publishing flag is set while the request runs. | apps/web/features/agents/components/AgentPublishPanel.tsx:58, 88 |
| Calls in progress during publish or rollback (voice) | not handled in the code; no voice agent exists. The brief does not specify it. | S51.23 in area brief |
| Offline | not handled in the code beyond a generic error toast. | AgentPublishPanel.tsx:100-104 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/agents/__tests__/AgentPublishPanel.test.tsx`: The custom agent Publish and Version history panel.
- `apps/web/app/api/custom-agents/[id]/publish/route.test.ts`: Custom agent publish route.
- `apps/web/app/api/custom-agents/[id]/restore/route.test.ts`: Custom agent restore route.
- `apps/web/app/api/custom-agents/[id]/versions/route.test.ts`: Custom agent versions route.
- `apps/web/db/neon/user-agents-migration.test.ts`: The user agents migration shape (file exists; its exact assertions were not opened).

**Test scenarios**

- **Reference: publish and list**
  1. On web open Agents and edit a custom agent.
  2. Press Publish and add a note.
  3. Open Version history.
  - Expected: Toast 'Published version 1.'; list shows Version 1 with the Published marker.
- **Reference: no change refusal**
  1. Press Publish again without editing.
  - Expected: Error 'There are no changes to publish.'
- **Reference: restore**
  1. Publish a second version after an edit.
  2. Press Restore on Version 1 and confirm.
  - Expected: Draft shows Version 1 settings; live version unchanged until Publish changes.
- **Voice agent absence**
  1. Look for a voice agent type in the builder.
  - Expected: None exists.
- **When built: rollback during a call**
  1. Start a test call.
  2. Roll back mid-call.
  - Expected: Call finishes on its original version; the next call uses the rolled-back version.

**Where to look when it fails**

- Check table user_agent_versions and column user_agents.published_version.
- Error texts above come from custom-agent-service.ts.
- Nothing was run for this page; no result is claimed.

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **No voice-agent configuration, versions, publish or rollback.** Affects: Owners on web, desktop, mobile and API. Evidence: audit/ledger/ecosystem-capability-ledger.jsonl:1682-1683. Work needed: Define the voice agent record, then reuse the version and publish pattern with its own table and routes.
- **Rollback is Restore plus Publish, not one step.** Affects: Custom agent owners on web. Evidence: apps/web/lib/services/custom-agent-service.ts:533-551. Work needed: Add a direct set-live action if voice rollback must be instant.
- **In-progress call handling on publish or rollback is not specified.** Affects: Voice callers. Evidence: S51.23 gives no rule. Work needed: Decide and document.
- **Mobile and desktop screens for version history are unverified.** Affects: Mobile and desktop users of custom agents. Evidence: only mobile service test seen (apps/mobile/src/features/agents/__tests__/service.test.ts:65-74). Work needed: Inspect the mobile and Tauri code.
- Not built on: Web, Desktop, Mobile (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- table:user_agent_versions
- table:user_agents
- api:POST /api/custom-agents/[id]/publish
- api:GET /api/custom-agents/[id]/versions
- api:POST /api/custom-agents/[id]/restore
- F051-07
- SYS-data-model-and-migrations
- SYS-authorization-and-workspaces
- SYS-api-and-contracts
- mode:cloud

## Unknown

- What a voice agent record would contain; no schema exists.
- How calls in progress behave during publish or rollback.
- Whether mobile and Tauri desktop have version history screens for custom agents.
- Whether custom agents are plan-gated.
- Rate limit values on the write routes.
- Exact assertions in user-agents-migration.test.ts.

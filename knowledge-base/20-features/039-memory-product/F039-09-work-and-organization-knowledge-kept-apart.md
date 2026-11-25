---
id: "F039-09"
type: "feature"
title: "Work and organization knowledge kept apart"
aliases: ["Workspace memory", "Organization knowledge vs personal memory", "Work and personal memory kept apart", "Allow memory (workspace policy)", "S39.26"]
area: "39 Memory product"
available_on: ["web", "desktop", "mobile", "cli", "vscode", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "built", vscode: "built", chrome: "built"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S39.26"]
depends_on: ["SYS-authorization-and-workspaces", "SYS-memory-projects-and-context", "SYS-data-model-and-migrations", "SYS-authentication-and-identity", "SYS-security-and-privacy", "surface:web", "surface:mobile", "surface:cli", "surface:vscode", "surface:chrome", "surface:desktop", "table:user_memories", "table:organization_admin_policies", "table:organization_members", "api:GET /api/memory", "api:POST /api/memory/sync", "F039-12"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F039-09 Work and organization knowledge kept apart

Memories belong either to a person or to a workspace. Every read, write, import, export and chat lookup filters on the active workspace, so work facts never show in personal chats and the reverse. Web, mobile, CLI and VS Code say which scope is active; desktop Tauri and Chrome show no label.

Area: [39. Memory product](README.md). Requirement items: [S39.26](../../10-requirements/capabilities/039-memory-product.md#s3926).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | built | built | not seen by a person |
| CLI | built | built | not seen by a person |
| VS Code | built | built | not seen by a person |
| Chrome | partly built (this page lists unfinished parts) | built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Keeps memories saved in a workspace (an organization) apart from personal memories. The server stamps each memory with the workspace and filters by it on every query. A workspace owner or admin can turn memory off for all members.

**Why it exists.** Work facts must not leak into personal chats or the reverse, and a company must be able to control memory for its members. Brief S39.26 and docs/product/experience-contract.md:28 require separately scoped memory.

**Who uses it.** People who belong to a workspace and also use AGI personally; workspace owners and admins who set policy.

**Problems it solves**

- A client name saved at work appearing in a personal chat.
- A member's personal facts being read in a company chat.
- A company wanting memory off until it has reviewed it.

**Use cases**

- Switch to a workspace on web, save a memory, switch back to personal and see it is not listed.
- An admin opens Workspace, Policy and turns Allow memory off; members see a notice in Settings, Memory.
- In the CLI run agi memory list and read which workspace the memories belong to.
- In VS Code open the memory tree and see 'Personal memory' or '<workspace> memory'.

## 2. User experience

**Where to find it**

- Web: Settings, Memory; description 'Facts saved in your selected Cloud workspace.' and a scope explanation list (Account, Workspace, Project) (apps/web/features/settings/sections/MemorySection.tsx:41); notice when workspace memory is off (MemorySection.tsx:38).
- Web admin: Workspace policy section, Memory group, switch 'Allow memory' (apps/web/features/settings/sections/WorkspacePolicySection.tsx:484).
- Mobile: Settings, Memory screen shows a scope line, for example '<name> workspace memories, never used in personal chats.' (apps/mobile/app/(app)/settings/memory.tsx:72). It is a line of text, not a tab.
- CLI: agi memory list prints '<N> memories in <workspace>' (apps/cli/src/lib.rs:4114).
- VS Code: memory tree header 'Personal memory' or '<workspace> memory' with the text that work and personal memory are kept apart (apps/extension-vscode/src/memory/memoryTreeProvider.ts:103).
- Desktop Tauri Memory tab and Chrome memory sheet: no workspace or personal label found (grep of apps/desktop/src/features/settings/tabs/Memory.tsx, apps/desktop/src/api/cloudMemory.ts and apps/extension/src/features/side-panel/memorySheet.ts returned zero matches). Electron desktop shows the web app (doc: AGENTS.md section 5) [inferred].

**Before you start**

- Signed in.
- Membership of a workspace, with it selected as the active workspace (apps/web/lib/services/active-workspace-service.ts:63).
- For admin control: owner or admin role in the workspace.

**Screens and controls**

- Workspace switcher (outside this feature) decides the scope.
- Web memory scope explanation: Account, Workspace, Project rows.
- Workspace policy switch Allow memory.
- Notice 'Your workspace has memory off. An owner or admin can turn it on in Workspace → Policy.' (MemorySection.tsx:38).

**Journey**

1. 1. Pick the active workspace (or Personal).
2. 2. Open Settings, Memory; the heading says which scope's facts are listed.
3. 3. Add or import memories; they are saved to the active scope.
4. 4. Chat in that scope; only that scope's memories are used.
5. 5. Switch scope; the list and the chats now show the other pool.

**What the person sees and gets**

- Heading and scope lines naming the workspace (web, mobile, CLI, VS Code).
- Refusal 'This workspace has memory turned off for its members.' on a write when the policy is off (managed-memory-context-service.ts:640 area, reason organization_memory_disabled).
- Toggles are disabled when the workspace has memory off (MemorySection.tsx:173).

**Settings**

- Workspace: Allow memory (organization_admin_policies.allow_memory).
- Per person: Memory switches, unchanged by workspace except that the workspace can close memory.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- user_memories has an organization_id column that defaults to the request's workspace (apps/web/db/neon/0110_active_workspace_content_scope.sql:53) and a unique import key that includes it (apps/web/db/neon/0409_memory_import_workspace_unique_key.sql).
- One predicate, workspaceMemoryPredicate, compares organization_id with the active workspace and treats null as personal (apps/web/lib/services/managed-memory-context-service.ts:383).
- List, create, delete-all, export, summary and sync all use it (apps/web/app/api/memory/route.ts:41,192; apps/web/app/api/memory/export/route.ts; apps/web/app/api/memory/sync/route.ts:73,112,153).
- Chat retrieval adds the same workspace filter to its query (managed-memory-context-service.ts:1128 region).
- Active workspace comes from the X workspace header when sent, else from the saved choice in user settings (active-workspace-service.ts:63-110); a header naming a workspace the person is not in is refused.
- Memory stays closed in a workspace until an owner or admin enables it; an absent policy row or a read failure keeps it closed (managed-memory-context-service.ts:115).
- Web, mobile, CLI and VS Code say which scope is active (see where to find it).

**Incomplete**

- Desktop Tauri Memory tab and Chrome memory sheet show no scope label, so a person there cannot tell which pool they edit (grep results above).
- CLI memory cache has no workspace field of its own; whether a workspace switch can show stale entries is unknown (apps/cli/src/cloud/memory.rs has no organization reference).
- Imports rely on the database default to set organization_id; the insert does not name it (apps/web/lib/memory/import-store.ts:63).

**Present but disconnected or switched off**

- apps/web/app/workspace/sharing/page.tsx is cited by the brief but it shows sharing of projects, conversations, artifacts and connectors and contains no memory code (page file; apps/web/features/settings/sections/OrganizationSharingSection.tsx has no 'memory' text).

**Not available**

- Per-memory workspace badge in lists: none found; scope is stated once per screen.
- Organization knowledge separate from memory (a knowledge base of company documents): not part of this feature's code.

## 4. Required behaviour

**Established requirements**

- Organization or workspace knowledge is kept apart from personal memory: work memories never appear in personal chats and vice versa, and the user can tell which is which. (source: brief S39.26 Should)
- Saved memories, project memory, work memory and local workspace memory are separately scoped. (source: docs/product/experience-contract.md:28)
- Memory must never silently absorb Local-only sensitive data into synced or global memory. (source: docs/product/requirements.md:1524)
- Local and BYOK trust boundaries are separate from Managed Cloud and nothing routes between them silently. (source: doc: AGENTS.md section 6)

**Acceptance criteria**

1. A memory saved in workspace W is returned by GET /api/memory only while W is active.
2. A memory saved in Personal is not returned or used while a workspace is active.
3. A chat in workspace W uses only W's memories.
4. Export and import act only on the active scope; an import into W deduplicates only against W.
5. With Allow memory off, writes are refused with the workspace reason and the toggles are disabled.
6. Web, mobile, CLI and VS Code tell the person which scope is active.
7. A request naming a workspace the person is not a member of is refused.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Desktop Tauri and Chrome should show a scope label like the other apps [inferred from the requirement 'the user can tell which is which'].
- Chrome and desktop rely on the server's saved active workspace because they send no workspace header [inferred from no organization reference in their memory clients].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add the scope heading to the desktop Tauri Memory tab and the Chrome memory sheet.
- [proposed] Name organization_id explicitly in the import insert so a database default change cannot send imports to the wrong pool.
- [proposed] Add a test that the CLI cache is reset on workspace change.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | workspaceMemoryPredicate | `apps/web/lib/services/managed-memory-context-service.ts` | The single workspace filter used by memory queries |
| service | loadOrganizationMemoryPolicy | `apps/web/lib/services/managed-memory-context-service.ts` | Reads allow_memory; closed by default |
| table | organization_admin_policies | `apps/web/lib/services/managed-memory-context-service.ts` | Holds allow_memory, retention_days, retention_enforced |
| schema | user_memories.organization_id default | `apps/web/db/neon/0110_active_workspace_content_scope.sql` | Stamps new rows with the request workspace |
| schema | workspace import unique key | `apps/web/db/neon/0409_memory_import_workspace_unique_key.sql` | Dedupe imports per workspace |
| service | resolveActiveOrganizationId | `apps/web/lib/services/active-workspace-service.ts` | Chooses the workspace from header or saved setting |
| service | getUserScopedDb | `apps/web/lib/server/rls-db.ts` | Gives each request a database scoped to user and workspace |
| endpoint | /api/memory | `apps/web/app/api/memory/route.ts` | Workspace-filtered list, create, delete-all |
| endpoint | /api/memory/sync | `apps/web/app/api/memory/sync/route.ts` | Workspace-filtered delta sync used by mobile, CLI and VS Code |
| component | MemorySection scope copy | `apps/web/features/settings/sections/MemorySection.tsx` | Scope explanation and workspace-off notice |
| component | WorkspacePolicySection | `apps/web/features/settings/sections/WorkspacePolicySection.tsx` | Allow memory switch |
| endpoint | /api/settings/organization/policy | `apps/web/app/api/settings/organization/policy/route.ts` | Saves allowMemory |
| screen | Mobile Memory screen scope line | `apps/mobile/app/(app)/settings/memory.tsx` | describeMemoryScope text |
| command | agi memory list | `apps/cli/src/lib.rs` | Names the workspace in output |
| service | active_workspace_label | `apps/cli/src/cloud/mod.rs` | Reads active workspace name |
| component | memoryTreeProvider | `apps/extension-vscode/src/memory/memoryTreeProvider.ts` | Tree header for personal or workspace memory |
| service | accountMemoryClient readScope | `apps/extension-vscode/src/memory/accountMemoryClient.ts` | Reads active workspace for the tree and cache |
| service | Chrome memoryClient | `apps/extension/src/features/cloud-bridge/memoryClient.ts` | Calls /api/memory with no workspace header |
| service | cloudMemory (desktop) | `apps/desktop/src/api/cloudMemory.ts` | Desktop Tauri cloud memory calls |
| test | workspace-lifecycle | `apps/web/app/api/memory/__tests__/workspace-lifecycle.test.ts` | Workspace scoping of memory API |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Client sends a request with a bearer token and optionally the workspace header. | device | apps/web/features/memory/cloud-memory-controller.ts:451-455 (export call sends the header) |
| Server resolves the active workspace: header value, personal marker, or the saved setting; non-members are refused. | our servers | apps/web/lib/services/active-workspace-service.ts:63-110 |
| A database handle bound to user and workspace is created. | our servers | apps/web/lib/server/rls-db.ts:81 |
| Memory write checks the workspace policy then stores organization_id from the request default. | our servers | managed-memory-context-service.ts:640 area; 0110_active_workspace_content_scope.sql:53 |
| Memory read for a chat filters by organization_id (null means personal). | our servers | managed-memory-context-service.ts:383,1128 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Memory rows with organization_id | table user_memories | Yes, per workspace, to clients on that workspace | Delete-all removes only the active scope's rows (route.ts:192); workspace retention window recorded in organization_admin_policies but only applied when enforced (managed-memory-context-service.ts:674 area) |
| Workspace memory policy | table organization_admin_policies | Server only | Until an admin changes it |
| Active workspace choice | user_settings.settings.workspace.activeOrganizationId | Server side; read by clients without a header | Until changed |

**Models and providers.** Scope filtering happens before any model is called, so it is the same on every model, provider and mode where account memory is used (managed-memory-context-service.ts:1128). No model takes part in the separation.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in account; membership of the workspace for workspace memory. |
| Permissions | Only members can name a workspace (active-workspace-service.ts:85); only owner or admin can change Allow memory (policy route; WorkspacePolicySection.tsx:484). |
| Subscription | none found in the code for the separation itself. |
| Limits and metering | none found in the code specific to scope. |
| Feature flags | Workspace policy allow_memory (default closed). |
| Model compatibility | Same for every model. |
| Provider restrictions | none found in the code. |
| Local mode | Local mode has no workspace: on mobile the screen says 'Stored on this device only.' (memory.tsx:72) and the decision record says Local and Cloud memory are never copied into each other (docs/decisions/2026-09-27-founder-decisions.md:159). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Workspace memory off | Writes refused with a clear reason; toggles disabled; notice shown | MemorySection.tsx:38,173; managed-memory-context-service.ts:115 |
| Policy read failure | Treated as closed, not open | managed-memory-context-service.ts:115 comment and CLOSED_ORGANIZATION_MEMORY_POLICY |
| Workspace lookup failure | Request refused as service unavailable rather than falling back | apps/web/lib/server/rls-db.ts:62-72 |
| Non-member header | 403 You are not a member of that workspace | active-workspace-service.ts:85 |
| Workspace switched while a screen is open | Web memory controller retires its stale requests; mobile resets scope state | apps/web/features/memory/cloud-memory-controller.ts:477; apps/mobile/app/(app)/settings/memory.tsx:234-246 |
| VS Code account or workspace change | Discards another workspace's cached memory | apps/extension-vscode/src/memory/accountMemoryStore.ts:375 |
| CLI cache after workspace switch | unknown; not handled in the code searched | apps/cli/src/cloud/memory.rs has no workspace field |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/memory/__tests__/workspace-lifecycle.test.ts`: Lists only active rows of the active workspace; personal context binds to rows with no workspace; scoped read and delete; sync status; writes into the active workspace; 403 when workspace memory is off; expiry
- `apps/web/db/neon/memory-import-workspace-unique-key-migration.test.ts`: The workspace-aware import key migration
- `apps/web/lib/services/__tests__/memory-eligibility-gate.test.ts`: The write eligibility gate including workspace policy (file exists; titles not read)
- `apps/extension-vscode/src/__tests__/accountMemoryStore.test.ts`: VS Code account memory store (file exists; contents not read)
- `apps/web/app/api/memory/__tests__/export.test.ts`: Export reads only the caller, active rows and the current workspace

**Test scenarios**

- **Work and personal stay apart**
  1. Select workspace W; add memory 'Client code is X9'.
  2. Switch to Personal; open Settings, Memory.
  3. Ask in a personal chat 'what is the client code'.
  - Expected: The fact is not listed and not used; switching back to W shows it.
- **Admin closes memory**
  1. As admin turn Allow memory off in Workspace policy.
  2. As a member open Settings, Memory in W and try to add a fact.
  - Expected: Notice about workspace memory off, toggles disabled, write refused.
- **CLI names the scope**
  1. Run agi memory list while a workspace is active.
  - Expected: Output says '<N> memories in the <name> workspace' or 'your personal workspace'.
- **Desktop and Chrome label check**
  1. Open Memory in desktop Tauri and in the Chrome memory sheet while a workspace is active.
  - Expected: Today no scope label is shown; record as a gap if still true.
- **Import stays in scope**
  1. In workspace W import a file with a fact that also exists in Personal.
  - Expected: The fact imports into W; it is not marked duplicate by the Personal copy.

**Where to look when it fails**

- Rejection record kind workspace_switch with reasons malformed_selector, not_a_member, resource_in_other_workspace (active-workspace-service.ts).
- Log 'workspace scope lookup failed; denying request' (rls-db.ts:66).
- Tables user_memories.organization_id, organization_members, organization_admin_policies.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/039-memory-product.md](../../70-qa/test-plans/web/039-memory-product.md)
- Desktop: [70-qa/test-plans/desktop/039-memory-product.md](../../70-qa/test-plans/desktop/039-memory-product.md)
- Mobile: [70-qa/test-plans/mobile/039-memory-product.md](../../70-qa/test-plans/mobile/039-memory-product.md)
- CLI: [70-qa/test-plans/cli/039-memory-product.md](../../70-qa/test-plans/cli/039-memory-product.md)
- VS Code: [70-qa/test-plans/vscode/039-memory-product.md](../../70-qa/test-plans/vscode/039-memory-product.md)
- Chrome: [70-qa/test-plans/chrome/039-memory-product.md](../../70-qa/test-plans/chrome/039-memory-product.md)

## 10. Gaps and dependencies

- **No scope label in desktop Tauri Memory tab or Chrome memory sheet** Affects: Desktop Tauri and Chrome users in a workspace. Evidence: Zero matches for workspace, organization, personal in the three files named above. Work needed: Read the active workspace and show it, as VS Code does
- **Brief cites the workspace sharing page and a mobile workspace tab, neither of which holds memory scoping** Affects: Brief readers and testers. Evidence: apps/web/app/workspace/sharing/page.tsx; memory.tsx:72. Work needed: Correct the brief
- **CLI memory cache workspace isolation unknown** Affects: CLI users who switch workspace. Evidence: apps/cli/src/cloud/memory.rs. Work needed: Read the cache logic and add a test
- **Import relies on a database default for organization_id** Affects: All importers. Evidence: apps/web/lib/memory/import-store.ts:63. Work needed: Name the column or test the default under import
- **Brief marks desktop, CLI, VS Code and Chrome done; labels exist only on web, mobile, CLI and VS Code** Affects: Status reporting. Evidence: see above. Work needed: Re-grade after label work

**Depends on**

- SYS-authorization-and-workspaces
- SYS-memory-projects-and-context
- SYS-data-model-and-migrations
- SYS-authentication-and-identity
- SYS-security-and-privacy
- surface:web
- surface:mobile
- surface:cli
- surface:vscode
- surface:chrome
- surface:desktop
- table:user_memories
- table:organization_admin_policies
- table:organization_members
- api:GET /api/memory
- api:POST /api/memory/sync
- F039-12

## Unknown

- Whether Electron desktop shows the web scope copy (inferred only).
- How the CLI cache behaves on a workspace switch.
- Whether the Chrome extension ever sends the workspace header from elsewhere in its code (only memoryClient.ts and platformHeaders.ts were checked).
- Contents of memory-eligibility-gate.test.ts and accountMemoryStore.test.ts.
- No tests were run.

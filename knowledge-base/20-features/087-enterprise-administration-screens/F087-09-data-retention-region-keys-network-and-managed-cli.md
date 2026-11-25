---
id: "F087-09"
type: "feature"
title: "Data retention, region, keys, network and managed client settings"
aliases: ["Data controls", "Retention", "Data region", "Customer-managed key", "IP allow list", "Managed client settings", "MDM", "S87.23", "S87.24", "S87.25", "S87.26", "S87.27", "S87.38"]
area: "87 Enterprise administration screens"
available_on: ["web", "desktop", "cli", "chrome"]
implementation: {web: "partial", desktop: "partial", mobile: "missing", cli: "partial", vscode: "n/a", chrome: "built"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "n/a", cli: "not seen by a person", vscode: "n/a", chrome: "not seen by a person"}
requirement_items: ["S87.23", "S87.24", "S87.25", "S87.26", "S87.27", "S87.38"]
depends_on: ["surface:web", "surface:desktop", "surface:cli", "surface:chrome", "mode:cloud", "plan:enterprise", "plan:team", "plan:team_premium", "table:organization_admin_policies", "table:organization_retention_sweeps", "table:organizations", "api:GET /api/cron/enforce-workspace-retention", "api:POST /api/settings/organization/data-region", "api:POST /api/settings/organization/keys", "api:POST /api/admin/data-region", "SYS-security-and-privacy", "SYS-data-model-and-migrations", "SYS-observability-and-operations", "F087-12"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F087-09 Data retention, region, keys, network and managed client settings

Admins set a retention window and a nightly sweep deletes older chats (except held ones), request a data-region move, connect a customer encryption key, and restrict access by IP range. IT can push managed settings to the Chrome extension and CLI. The key currently seals only audit-stream secrets. Rollout channels do not exist.

Area: [87. Enterprise administration screens](README.md). Requirement items: [S87.23](../../10-requirements/capabilities/087-enterprise-administration-screens.md#s8723), [S87.24](../../10-requirements/capabilities/087-enterprise-administration-screens.md#s8724), [S87.25](../../10-requirements/capabilities/087-enterprise-administration-screens.md#s8725), [S87.26](../../10-requirements/capabilities/087-enterprise-administration-screens.md#s8726), [S87.27](../../10-requirements/capabilities/087-enterprise-administration-screens.md#s8727), [S87.38](../../10-requirements/capabilities/087-enterprise-administration-screens.md#s8738).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built | partly built | not seen by a person |
| Desktop | partly built | partly built | not seen by a person |
| Mobile | not built | not built | n/a |
| CLI | partly built | partly built | not seen by a person |
| VS Code | does not apply | does not apply | n/a |
| Chrome | partly built (this page lists unfinished parts) | built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Sets how long workspace conversations are kept and deletes older ones when enforced; records a request to move workspace data to another region; lets an Enterprise workspace enroll, rotate, replace and revoke its own KMS key; refuses requests from outside listed IP ranges; and lets a device-management file configure the extension and CLI (WorkspacePolicySection.tsx:521-560, 694; WorkspaceDataRegion.tsx:123; WorkspaceEncryptionKey.tsx:257-334; managed-schema.json).

**Why it exists.** Companies must meet retention, residency, key-control and network rules and must deploy tools centrally.

**Who uses it.** Workspace owners and admins; the owner only may revoke a key (keys-access.ts:58); platform operators complete region cutovers (admin/data-region/route.ts:38); IT teams deploy device files.

**Problems it solves**

- Chats kept forever.
- No control over network origin of requests.
- Customer wants its own key control.
- IT cannot configure extension or CLI per device.

**Use cases**

- Set 90 days and enforce, with a dry run first.
- Request a move to another region once it is provisioned.
- Enter office CIDR blocks so only that network reaches the workspace.
- IT pushes a site allow and block policy to the Chrome extension.

## 2. User experience

**Where to find it**

- Web: Workspace > 'Data' (/workspace/data) shows 'Data region', legal holds, domain retention and the encryption key; Workspace > 'Policy' holds 'Retention window', 'Enforce retention' and 'IP allow list' (data/page.tsx:18-30, WorkspacePolicySection.tsx:521,547,694).
- Desktop: [inferred] same hosted screens (doc: AGENTS.md section 5).
- Chrome extension: managed storage schema agi_admin_site_policy (manifest.json:37, managed-schema.json).
- CLI: device file managed-settings.json and managed policy file (managed.rs:156, platform/policy/managed.rs:105).
- Mobile: nothing.

**Before you start**

- Owner or admin; for data region and key plan:enterprise (keys-access.ts:31, data-region/route.ts:51).
- Region target must be provisioned by the operator (data-region.ts:112).
- For MDM: a device-management system able to write the file or Chrome policy.

**Screens and controls**

- Retention window number input (1 to 3650 days, aria 'Retention window in days'); 'Enforce retention' toggle with permanent-deletion warning (WorkspacePolicySection.tsx:521-560).
- IP allow list chip input 'Add an IP address or CIDR block' (693-705).
- Data region: 'Move to' select, 'Request move', 'Cancel the move' (WorkspaceDataRegion.tsx:160-201).
- Key: provider choice AWS KMS, Google Cloud KMS, Azure Key Vault; 'Rotate key', 'Replace with a different key', 'Revoke key' (WorkspaceEncryptionKey.tsx:43,257,275,334).

**Journey**

1. Open Policy; set the window; leave enforcement off to record only.
2. Turn on 'Enforce retention' after reading the warning; the sweep runs nightly.
3. Open Data; request a region move and confirm; an operator completes it later.
4. Open Data > key; validate and enroll a key, later rotate or revoke.
5. On Policy add IP ranges and save; the screen refuses a list that would lock out your own address (policy/route.ts:133-153).
6. IT deploys the managed file to devices.

**What the person sees and gets**

- Sweep record table with columns When, Outcome, Deleted, Held, Note (WorkspaceDataControls.tsx:505-509).
- Region text 'Stored in X', pending request date and 'Data stays in X until the copy is verified' (WorkspaceDataRegion.tsx).
- Error 'X is not available yet, so data cannot be moved there.' (data-region/route.ts:128).
- IP refusal message: 'Your workspace has restricted access to a specific set of networks...' (ip-allow-list-gate.ts:15).

**Settings**

- Plan: retention window and sweep are policy fields; 'Zero data retention only' is a separate provider setting (WorkspacePolicySection.tsx:664).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Retention: nightly cron 04:05 sweeps organizations with a window and enforcement on, 50 per run, sequentially; batches of 500 up to 10 batches; skips rows under legal holds in the same statement; aborts when holds cannot be read; writes organization_retention_sweeps; audit row retention_sweep_completed; dryRun=1 mode (vercel.json:138; enforce-workspace-retention/route.ts:20,45; retention-service.ts:71,82,182,204).
- Region: move recorded as a request, never applied in place; requires Enterprise, refused 409-style when target not provisioned; platform admin completes the cutover; audited (data-region.ts:112-142,221; data-region/route.ts:83-136; admin/data-region/route.ts:38).
- Region is read for search: retrieval refuses when the stored region is unknown or unprovisioned (retrieval-search-service.ts:130).
- Key: provision, rotate, replace, revoke, validate first, rewrap and retire old versions, EU-pinned workspace refuses a non-matching KMS region (organization-encryption-keys.ts:446-640,753,862; keys/route.ts:138-305).
- IP allow list: enforced on authenticated requests including admin API keys; refusal audited as ip_not_allowed; save is refused if it would lock the admin out (api-auth.ts:452,476,519; ip-allow-list-gate.ts:56-80; compliance-caller.ts:68; policy/route.ts:133).
- Chrome extension reads a managed site policy first, denies everything if unreadable or invalid (store.ts:27-60; background.ts:4217).
- CLI reads a managed hooks, plugin and sandbox file, a managed policy file (permission mode, privacy mode, trust grant) and a server effective policy (managed.rs:12,29,156; platform/policy/managed.rs:43,105; workspace_policy.rs:14).

**Incomplete**

- Region: only the first region exists; EU target needs operator setup of AGI_DATA_REGION_EU_* variables (data-residency.ts:100-111). Residency is enforced in retrieval search only among callers found; other stores not shown.
- Key: the registered sealed store is only audit destination signing secrets (connector-secret-reseal.ts:109-118; audit-streaming-service.ts:151-156). Conversations and files are not sealed under the key as far as found.
- Customer KMS clients are absent without deployment credentials; provisioning refuses (organization-encryption-keys.test.ts:189).
- Retention covers conversations and workflow run outputs; other stores not read (retention-service.ts:347-352).

**Present but disconnected or switched off**

- Docs say keys have no screen (doc: docs/compliance/enterprise-operations.md, 2026-10-18) but WorkspaceEncryptionKey renders on Data (data/page.tsx:28); code wins.
- Decision doc says no region column or UI (doc: docs/decisions/2026-09-04-region-neutral-data-residency.md) but organizations.data_region exists and a UI is built (data-region.ts:34); doc is stale.
- Server effective policy publishes feature:hooks for clients to honour (doc: docs/compliance/enterprise-operations.md line ~57).

**Not available**

- S87.38 managed rollout and release channels: no admin control found anywhere in console or API (searched app/workspace, features/workspace-console, app/api/settings/organization).
- Mobile and VS Code: nothing.
- Web, desktop, mobile read no MDM file (brief S87.27 missing).

## 4. Required behaviour

**Established requirements**

- A scheduled sweep deletes conversations older than the period when enforced, withholding legal holds. (source: brief S87.23 Should)
- Administrator chooses the region and the product keeps data there. (source: brief S87.24 Should)
- Where offered, customer key connect, rotate or revoke from the console and workspace data sealed under it. (source: brief S87.25 Should)
- Requests from other networks are refused. (source: brief S87.26 Should)
- Product configurable through device management and honours it. (source: brief S87.27 Should)
- Admin controls client versions or release channels. (source: brief S87.38 Should)
- US-only today; add a second region only for a signed customer. (source: doc: docs/decisions/2026-09-04-region-neutral-data-residency.md)

**Acceptance criteria**

1. With a 30-day window and enforcement on, a chat idle 31 days is deleted in the next sweep and a chat under a legal hold survives.
2. Dry run (?dryRun=1) reports counts and deletes nothing.
3. If hold lists cannot be read, the sweep deletes nothing and records outcome aborted.
4. A region move to an unprovisioned region returns the 'not available yet' conflict and writes no request.
5. A request from an IP outside the allow list returns 403 and an ip_not_allowed audit row.
6. Saving an allow list that excludes the admin's own IP is refused.
7. The extension denies all site actions when its managed policy document is invalid.
8. CLI with an invalid managed file treats restrictions as in force (managed policy Invalid).

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Sealing under the customer key should cover workspace content, not only audit secrets, to meet S87.25 'workspace data is sealed' [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Document the key's real coverage in the console.
- [proposed] Add release-channel settings or remove S87.38 from the area.
- [proposed] Add IP restriction note that it covers API requests, not static pages.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| screen | Data page | `apps/web/app/workspace/data/page.tsx` | Hosts legal holds, domain retention, region, key |
| component | WorkspacePolicySection | `apps/web/features/settings/sections/WorkspacePolicySection.tsx` | Retention window, enforcement, IP list |
| component | WorkspaceDataRegion | `apps/web/features/workspace-console/components/WorkspaceDataRegion.tsx` | Region move UI |
| component | WorkspaceEncryptionKey | `apps/web/features/workspace-console/components/WorkspaceEncryptionKey.tsx` | Key lifecycle UI |
| hook | use-encryption-key | `apps/web/features/workspace-console/hooks/use-encryption-key.ts` | Key API client |
| endpoint | /api/settings/organization/policy | `apps/web/app/api/settings/organization/policy/route.ts` | Saves retention and IP list, lockout guard |
| endpoint | /api/settings/organization/data-region | `apps/web/app/api/settings/organization/data-region/route.ts` | Move request and cancel |
| endpoint | /api/admin/data-region | `apps/web/app/api/admin/data-region/route.ts` | Platform operator completes cutover |
| endpoint | /api/settings/organization/keys | `apps/web/app/api/settings/organization/keys/route.ts` | Key provision, change, revoke, status |
| service | organization-encryption-keys | `apps/web/lib/server/organization-encryption-keys.ts` | Key ring, rotation, rewrap, retire |
| service | data-region | `apps/web/lib/server/data-region.ts` | Region state and move records |
| job | enforce-workspace-retention cron | `apps/web/app/api/cron/enforce-workspace-retention/route.ts` | Nightly sweep, dry run |
| service | retention-service | `apps/web/lib/services/retention-service.ts` | Sweep logic and records |
| service | ip-allow-list-gate | `apps/web/lib/ip-allow-list-gate.ts` | Refuses and audits |
| service | api-auth | `apps/web/lib/api-auth.ts` | Calls the gate on authenticated requests |
| table | organization_retention_sweeps | `apps/web/db/neon/0138_retention_enforcement_and_legal_hold.sql` | Evidence of what ran |
| config | AGI_DATA_REGION_<REGION>_* variables | `packages/contracts/compliance/src/data-residency.ts` | Names of region provisioning settings (DATABASE_URL, OBJECT_STORAGE_*, LOG_DESTINATION, KMS_REGION, INFERENCE_TRANSPORTS) |
| config | extension managed schema | `apps/extension/managed-schema.json` | Chrome managed storage schema for site policy |
| service | extension site policy store | `apps/extension/src/features/site-policy/store.ts` | Reads managed then local policy |
| command | CLI managed settings and policy | `apps/cli/src/platform/policy/managed.rs` | Managed permission, privacy, trust layer |
| command | CLI effective workspace policy | `apps/cli/src/cloud/workspace_policy.rs` | Server effective policy cache |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Admin saves retention and IP settings; server validates and refuses a self-lockout. | our servers | policy/route.ts:133-153 |
| Cron calls the sweep; server lists enforced orgs, reads holds, deletes in batches of 500 excluding holds, records the sweep and an audit row. | our servers | enforce-workspace-retention/route.ts:39-110; retention-service.ts:204-370 |
| Admin requests a region move; server checks Enterprise and provisioning, stores the request, audits it. | our servers | data-region/route.ts:83-130; data-region.ts:112-142 |
| Platform operator performs the data copy outside this code and calls the completion endpoint, which switches the region. | our servers | data-region.ts:211-221; admin/data-region/route.ts:38 |
| Every authenticated request passes the IP check against stored CIDRs using the client IP. | our servers | api-auth.ts:452,476,519 |
| Key calls go to the customer's KMS service to validate, wrap and unwrap; data keys cached and dropped on revoke. | outside service | organization-encryption-keys.ts:231-290,645 |
| Chrome and CLI read their managed files from the device on start and on change. | device | store.ts:27-60; background.ts:4217; managed.rs:156 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Retention window and enforcement flag | table organization_admin_policies | Read by the sweep | Conversations older than window permanently deleted when enforced; holds excluded |
| Sweep records | table organization_retention_sweeps (written on privileged connection) | Shown on the Data page | Kept as evidence; deletion rule unknown |
| Region and pending request | organizations.data_region, data_region_requested, data_region_requested_at | Read per request | Request cleared on cancel or completion |
| Wrapped key association | workspace key tables (name not confirmed) | Server only | Revocation is recorded, not deleted (organization-encryption-keys.ts:600-604) |
| Managed device files | device storage under OS locations | Not synced | Owned by IT |

**Models and providers.** Zero-data-retention provider routing is a separate policy row on the Policy page (WorkspacePolicySection.tsx:664). Region setting names inference transports in its config (data-residency.ts:100) but the effect on model routing was not traced (unknown). Customer KMS is an outside service.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in workspace admin; IP check applies to every member. |
| Permissions | Policy edits admin.policy.manage or policy.manage; key revoke owner only (keys-access.ts:58); region completion platform admin (admin/data-region/route.ts:7). |
| Subscription | Region and keys need plan:enterprise (billing-catalog.ts:363; keys-access.ts:31; data-region/route.ts:51). Console routes need team_admin tiers. Plan gate on retention not confirmed. |
| Limits and metering | Sweep cap 50 orgs and 5,000 conversations per org per run (enforce-workspace-retention/route.ts:20; retention-service.ts:71-82). Retention window 1 to 3650 days (WorkspacePolicySection.tsx:524). |
| Feature flags | Region availability from AGI_DATA_REGION_* settings; KMS clients available only if credentials exist (organization-encryption-keys.ts:231). |
| Model compatibility | none found in the code |
| Provider restrictions | none found in the code |
| Local mode | Retention, region, key and IP rules govern server data only. Local chats stored on a device are not touched by the sweep (inferred from table-based sweep). CLI managed files apply in every mode (managed.rs); the Chrome policy applies locally. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading, error | Spinner 'Loading the data region' and error text 'The data region could not be loaded.' | WorkspaceDataRegion.tsx:130-140 |
| Not Enterprise | Text 'Choosing the data region requires an active Enterprise plan.' | WorkspaceDataRegion.tsx:201 |
| Target already current | Validation 'already stored in X'. | data-region/route.ts:105 |
| Target not provisioned | Conflict 'not available yet'. | data-region/route.ts:128 |
| Legal hold unreadable | Sweep aborts, deletes nothing. | retention-service.ts:200-203; retention-service.test.ts:200 |
| Org-wide hold active | Outcome held, nothing deleted. | retention-service.ts:272 |
| Per-run ceiling reached | Remainder deleted next run; note recorded. | retention-service.ts:363 |
| Customer key revoked or unreachable | Ring resolution throws; the platform key is never substituted. | organization-encryption-keys.ts:301-305 |
| Extension policy unreadable | All capabilities denied everywhere. | store.ts:13-20,45 |
| CLI policy unread | MCP servers stay off. | workspace_policy.rs:392 |
| Offline admin screens | not handled in the code. | WorkspaceDataRegion.tsx |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/lib/services/__tests__/retention-service.test.ts`: Sweep only when enforced, deletes nothing when holds unreadable, routine runs kept under hold
- `apps/web/app/api/cron/enforce-workspace-retention/__tests__/route.test.ts`: Auth, enforced vs not, dry run, abort reporting
- `apps/web/lib/services/__tests__/ip-allow-list.test.ts`: CIDR validation and matching
- `apps/web/lib/server/data-region.test.ts`: Provisioned regions, unknown stored region
- `apps/web/app/api/settings/organization/data-region/__tests__/route.test.ts`: Permissions, Enterprise gate, same-region refusal
- `apps/web/app/api/settings/organization/keys/__tests__/route.test.ts`: Who may reach keys, enrol validation, owner-only revoke
- `apps/web/lib/server/organization-encryption-keys.test.ts`: Key records, provider registry, status
- `apps/extension/__tests__/site-policy-engine.test.ts`: Extension site policy engine
- `apps/cli/src/features/hooks/managed.rs`: In-file tests for managed hooks, plugin and sandbox policy (11 tests)
- `apps/cli/src/cloud/workspace_policy.rs`: In-file tests for sealed policy cache and MCP refusal (20 tests)

**Test scenarios**

- **Retention dry run**
  1. Set 30 days, enforcement on.
  2. Call the cron with dryRun=1 using the cron secret.
  3. Inspect counts.
  - Expected: Counts reported, conversations unchanged, sweep record dry_run true.
- **Hold survives**
  1. Place a hold on a member.
  2. Run a real sweep.
  - Expected: Held conversations remain; Held count shown.
- **Region request**
  1. As Enterprise admin choose an unprovisioned region.
  - Expected: Refusal 'not available yet'; no request row.
- **IP lockout**
  1. Add an IP list without your own address and save.
  - Expected: Save refused naming your IP; add yours then it saves; request from another IP gets 403.
- **Managed extension policy**
  1. Write an invalid document into the extension managed storage.
  - Expected: Extension refuses site actions everywhere.
- **Key coverage**
  1. Enroll a key in a test deployment with a KMS double.
  2. Inspect which columns are sealed under it.
  - Expected: Only audit destination secret_ciphertext found (confirm).

**Where to look when it fails**

- Log 'Workspace retention sweep completed', 'Retention sweep deferred organizations'.
- Table organization_retention_sweeps; audit retention_sweep_completed, data_region_change_requested, data_region_changed, ip_not_allowed.
- Error IpNotAllowedError code ip_not_allowed.
- CmekProviderUnconfiguredError when no KMS client.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/087-enterprise-administration-screens.md](../../70-qa/test-plans/web/087-enterprise-administration-screens.md)
- Desktop: [70-qa/test-plans/desktop/087-enterprise-administration-screens.md](../../70-qa/test-plans/desktop/087-enterprise-administration-screens.md)
- CLI: [70-qa/test-plans/cli/087-enterprise-administration-screens.md](../../70-qa/test-plans/cli/087-enterprise-administration-screens.md)
- Chrome: [70-qa/test-plans/chrome/087-enterprise-administration-screens.md](../../70-qa/test-plans/chrome/087-enterprise-administration-screens.md)

## 10. Gaps and dependencies

- **Customer key seals only audit-stream signing secrets, not workspace chats or files** Affects: Enterprise buyers relying on S87.25. Evidence: connector-secret-reseal.ts:109-118; organizationKeyRing caller audit-streaming-service.ts:156. Work needed: Register more sealed stores or restate the claim
- **Region move needs manual operator cutover and a provisioned EU stack** Affects: Enterprise workspaces. Evidence: data-region.ts:211-221; data-residency.ts:100-111. Work needed: Owner stands up region resources and runbook
- **S87.38 rollout and release channels do not exist** Affects: Admins on all apps. Evidence: No code found in console or API. Work needed: Design and build, or drop
- **Web, desktop and mobile read no managed configuration** Affects: IT on those surfaces. Evidence: Brief S87.27; only extension and CLI files found. Work needed: Decide scope per surface
- **Docs contradict code on keys screen and region column** Affects: Readers of docs. Evidence: enterprise-operations.md vs data/page.tsx:28; decision doc vs data-region.ts:34. Work needed: Update docs
- **CLI managed MDM file and server policy are separate mechanisms** Affects: IT admins. Evidence: managed.rs:156 vs workspace_policy.rs:14. Work needed: Document precedence
- Not built on: Mobile (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- surface:cli
- surface:chrome
- mode:cloud
- plan:enterprise
- plan:team
- plan:team_premium
- table:organization_admin_policies
- table:organization_retention_sweeps
- table:organizations
- api:GET /api/cron/enforce-workspace-retention
- api:POST /api/settings/organization/data-region
- api:POST /api/settings/organization/keys
- api:POST /api/admin/data-region
- SYS-security-and-privacy
- SYS-data-model-and-migrations
- SYS-observability-and-operations
- F087-12

## Unknown

- Which tables besides conversations and routine runs the retention sweep deletes.
- Whether retention has an additional plan gate beyond opt-in.
- Where the key association tables are named and how data keys wrap content.
- How region affects model inference routing.
- Whether the IP check covers browser page loads or only API calls.
- Who writes managed-policy.toml to the CLI config directory (only read in code found).
- Whether the extension's 'workspace copy' of site policy is synced by a surface (store.ts:5-9 comment); sync code not read.
- No admin rollout code was found; maybe it lives outside the searched folders.

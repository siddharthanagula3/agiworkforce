---
id: "GAPS-AREA-103"
type: "gap-list"
title: "Gaps: Data and persistence categories"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Gaps: 103. Data and persistence categories

45 open gaps that touch this area. Area page: [20-features/103-data-and-persistence-categories](../../20-features/103-data-and-persistence-categories/README.md).

## GAP-AREA103-LW02

**S103.13 'Folders and Library entries' cites media-assets.ts, which has no folder concept. The Library query is the only Library code seen. Chat folders exist only as a chat feature.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-103
- Detail: Area 103. Data and persistence categories
- Evidence: apps/web/lib/server/media-assets.ts:4 and :60; apps/web/db/neon/0036_media_assets.sql:28; apps/web/db/neon/0022_chat_features.sql (chat_folders)

## GAP-AREA103-LW03

**Migrations cited as 'done' carry a header that says NOT YET APPLIED. 143 of 425 migrations carry this header. Application state could not be checked in this pass.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-103
- Detail: Area 103. Data and persistence categories
- Evidence: apps/web/db/neon/0252_context_manifests_and_source_policy.sql:5 (S103.09); apps/web/db/neon/0202_retrieval_index.sql:4 (S103.15, S103.16); apps/web/db/neon/0226_durable_image_generation_jobs.sql (S103.20); apps/web/db/neon/0281_managed_usage_overage_classification.sql (S103.32); apps/web/db/neon/0257_file_versions_and_lineage.sql:4 (versions and lineage, S103.12, S103.19)

## GAP-AREA103-LW04

**S103.12 'derivation lineage' is cited to 0036, but the lineage table (file_lineage) is in 0257, which is marked draft.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-103
- Detail: Area 103. Data and persistence categories
- Evidence: apps/web/db/neon/0257_file_versions_and_lineage.sql:1-4; apps/web/db/neon/0036_media_assets.sql

## GAP-AREA103-LW05

**Unknown tables fall back silently to 'operational_record' instead of failing. The guard that would catch them, unclassifiedStores, is only exercised by a test.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-103
- Detail: Area 103. Data and persistence categories
- Evidence: apps/web/lib/services/deletion-manifest.ts:504 and :544-552; apps/web/__tests__/security/data-classification-reach.test.ts:19-24

## GAP-CAP-editing-regeneration-and-branching-03

**Versions of an edited message, with a pager: Ledger lists an unfinished ui item for web and desktop. A build flag can switch versions off. No pager outside Web, Desktop, Mobile.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F016-03](../../20-features/016-user-message-components/F016-03-timestamp-and-edited-marker.md), [F016-05](../../20-features/016-user-message-components/F016-05-edit-in-place-and-version-paging.md), [F090-02](../../20-features/090-conversation-and-synchronization-components/F090-02-versions-branches-and-forks.md), [F103-03](../../20-features/103-data-and-persistence-categories/F103-03-chats-branches-and-memory.md)
- Requirement items: S103.07, S16.06, S16.11, S90.03
- Detail: Claude partly, ChatGPT unknown; AGI partly built

## GAP-F103-01-01

**Visible device management exists on web only.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F103-01](../../20-features/103-data-and-persistence-categories/F103-01-account-and-sign-in-identity.md)
- Detail: Affects: Desktop, Mobile, CLI, VS Code, Chrome users. Work needed: Confirm and, if absent, add device list and sign-out to each app.
- Evidence: Only apps/web/features/settings/components/LinkedDevicesPanel.tsx found

## GAP-F103-01-02

**Draft migrations 0174, 0207 and 0412 are marked not applied.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F103-01](../../20-features/103-data-and-persistence-categories/F103-01-account-and-sign-in-identity.md)
- Detail: Affects: All apps if the database lacks them. Work needed: Confirm applied state against the live migration ledger.
- Evidence: Headers at line 4 of each file

## GAP-F103-01-03

**Empty, loading and error wording of the device list not confirmed.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F103-01](../../20-features/103-data-and-persistence-categories/F103-01-account-and-sign-in-identity.md)
- Detail: Affects: Web. Work needed: Read the panel and add tests.
- Evidence: Not opened

## GAP-F103-02-01

**Revisions record that a change happened, not the old values.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F103-02](../../20-features/103-data-and-persistence-categories/F103-02-workspaces-members-and-policy.md)
- Detail: Affects: Admins on web. Work needed: Decide whether history of values is required and add it.
- Evidence: apps/web/db/neon/0201_workspace_policy_layers_and_revisions.sql:103-109

## GAP-F103-02-02

**Migration 0201 marked not applied.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F103-02](../../20-features/103-data-and-persistence-categories/F103-02-workspaces-members-and-policy.md)
- Detail: Affects: All apps. Work needed: Confirm the ledger.
- Evidence: apps/web/db/neon/0201_workspace_policy_layers_and_revisions.sql:4

## GAP-F103-02-03

**Per-app display of workspace policy not verified.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F103-02](../../20-features/103-data-and-persistence-categories/F103-02-workspaces-members-and-policy.md)
- Detail: Affects: Desktop, Mobile, CLI, VS Code, Chrome. Work needed: Trace each app's policy reads.
- Evidence: Brief status 'platform' only

## GAP-F103-03-01

**Memory pushed from an app has no source conversation or turn.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F103-03](../../20-features/103-data-and-persistence-categories/F103-03-chats-branches-and-memory.md)
- Detail: Affects: Mobile, CLI, VS Code and any sync client. Work needed: Add provenance to the sync contract and SQL.
- Evidence: apps/web/app/api/memory/sync/route.ts:211 insert list vs apps/web/lib/services/managed-memory-context-service.ts:820

## GAP-F103-03-02

**Migrations 0252 and 0285 marked not applied.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F103-03](../../20-features/103-data-and-persistence-categories/F103-03-chats-branches-and-memory.md)
- Detail: Affects: All apps. Work needed: Confirm ledger; fix the 0284/0285 title mismatch.
- Evidence: headers line 4 of each file

## GAP-F103-03-03

**Manifest writes are not write-once: same-user rewrites replace the row.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F103-03](../../20-features/103-data-and-persistence-categories/F103-03-chats-branches-and-memory.md)
- Detail: Affects: Audit use of manifests. Work needed: Decide whether turns need immutable manifests.
- Evidence: packages/platform/context-engine/src/manifest-store.ts:55

## GAP-F103-03-04

**Local mode behaviour on desktop, CLI, VS Code and Chrome not established.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F103-03](../../20-features/103-data-and-persistence-categories/F103-03-chats-branches-and-memory.md)
- Detail: Affects: Those apps. Work needed: Trace each app's sync gate.
- Evidence: Only mobile gate found (apps/mobile/services/cloudSyncEngine.ts:101)

## GAP-F103-04-01

**No Library folder store found although brief S103.13 says folders are stored.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F103-04](../../20-features/103-data-and-persistence-categories/F103-04-projects-files-and-library.md)
- Detail: Affects: All apps. Work needed: Clarify requirement; add folders or correct the brief.
- Evidence: apps/web/app/api/library/route.ts has no folder handling; no folder table in apps/web/db/neon/0036_media_assets.sql

## GAP-F103-04-02

**Draft migrations 0202 and 0257 not marked applied.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F103-04](../../20-features/103-data-and-persistence-categories/F103-04-projects-files-and-library.md)
- Detail: Affects: All apps. Work needed: Confirm ledger.
- Evidence: header line 4 of each file

## GAP-F103-04-03

**Library not found in VS Code and Chrome.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F103-04](../../20-features/103-data-and-persistence-categories/F103-04-projects-files-and-library.md)
- Detail: Affects: VS Code, Chrome. Work needed: Decide whether parity is required.
- Evidence: search for api/library clients found only desktop, mobile, CLI

## GAP-F103-05-01

**Revoked shares leave no row.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F103-05](../../20-features/103-data-and-persistence-categories/F103-05-generated-content-sharing-and-publishing.md)
- Detail: Affects: Audit and viewer messages. Work needed: Decide on tombstone rows.
- Evidence: apps/web/app/api/share/route.ts:817

## GAP-F103-05-02

**Draft migrations 0226 and 0257 not marked applied.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F103-05](../../20-features/103-data-and-persistence-categories/F103-05-generated-content-sharing-and-publishing.md)
- Detail: Affects: Image jobs and page version history on all apps. Work needed: Confirm ledger.
- Evidence: headers line 4 of each file

## GAP-F103-05-03

**Per-app share and publish surfaces not traced.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F103-05](../../20-features/103-data-and-persistence-categories/F103-05-generated-content-sharing-and-publishing.md)
- Detail: Affects: Desktop, Mobile, CLI, VS Code, Chrome. Work needed: Trace each app.
- Evidence: Brief status 'platform'

## GAP-F103-05-04

**Citations are stored inside research reports; citation storage for ordinary answers not confirmed.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F103-05](../../20-features/103-data-and-persistence-categories/F103-05-generated-content-sharing-and-publishing.md)
- Detail: Affects: Web chat. Work needed: Trace message-level citations.
- Evidence: apps/web/lib/services/research-report-service.ts:238 only

## GAP-F103-06-01

**Approval decisions are not stored on a table of their own.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F103-06](../../20-features/103-data-and-persistence-categories/F103-06-agent-runs-tasks-and-automation.md)
- Detail: Affects: Admins reviewing approvals. Work needed: Add a durable decision record or document the audit trail as the owner.
- Evidence: apps/web/lib/services/cloud-agent-run-service.ts:2000; apps/web/app/api/llm/v1/chat/completions/approve/route.ts:638

## GAP-F103-06-02

**Tool receipts are split: outcome log without arguments, results in operations.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F103-06](../../20-features/103-data-and-persistence-categories/F103-06-agent-runs-tasks-and-automation.md)
- Detail: Affects: Audit and support. Work needed: Define the receipt and join it.
- Evidence: apps/web/lib/services/connector-call-log-service.ts:52; apps/web/db/neon/0063_cloud_agent_execution_operations.sql:20

## GAP-F103-06-03

**CLI runs are not an accepted run origin.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F103-06](../../20-features/103-data-and-persistence-categories/F103-06-agent-runs-tasks-and-automation.md)
- Detail: Affects: CLI. Work needed: Confirm how CLI agent work is recorded.
- Evidence: apps/web/db/neon/0061_cloud_agent_runs.sql:9

## GAP-F103-06-04

**Draft migrations 0223 and 0235 not marked applied.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F103-06](../../20-features/103-data-and-persistence-categories/F103-06-agent-runs-tasks-and-automation.md)
- Detail: Affects: All apps. Work needed: Confirm ledger.
- Evidence: apps/web/db/neon/0223_connector_call_events.sql:4

## GAP-F103-06-05

**Per-app screens for runs, sessions, skills and schedules not traced.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F103-06](../../20-features/103-data-and-persistence-categories/F103-06-agent-runs-tasks-and-automation.md)
- Detail: Affects: Desktop, Mobile, CLI, VS Code, Chrome. Work needed: Trace each app.
- Evidence: Brief status 'platform'

## GAP-F103-07-01

**No maximum age or sweep for revoked grants of personal (non-workspace) accounts is visible.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F103-07](../../20-features/103-data-and-persistence-categories/F103-07-connectors-and-credentials.md)
- Detail: Affects: All users on the server; revoked rows hold no secret but stay until the account is erased.. Work needed: Decide a maximum age for revoked grants and add a sweep, or record why none is needed.
- Evidence: apps/web/lib/services/domain-retention-service.ts:452-465 only sweeps workspace members; manifest entry has no age.

## GAP-F103-07-02

**API key verification pattern accepts sk_test_ keys but the key-id regex only matches sk_live_, so a test-prefixed key can never verify.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F103-07](../../20-features/103-data-and-persistence-categories/F103-07-connectors-and-credentials.md)
- Detail: Affects: Developers using API keys.. Work needed: Confirm whether sk_test_ keys are issued anywhere; align or simplify the pattern.
- Evidence: apps/web/lib/services/api-key-service.ts:21,257-263 [inferred]

## GAP-F103-07-03

**CLI cannot create an API key; desktop, mobile, VS Code, Chrome behaviour for connectors not verified end to end.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F103-07](../../20-features/103-data-and-persistence-categories/F103-07-connectors-and-credentials.md)
- Detail: Affects: CLI, desktop, mobile, VS Code, Chrome users.. Work needed: Trace each app against the endpoints and record status per app.
- Evidence: apps/cli/src/cloud/api_keys.rs lists and revokes only.

## GAP-F103-07-04

**Brief marks revoke as 'not established'; the code does establish it, but the brief status is per platform, not per app.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F103-07](../../20-features/103-data-and-persistence-categories/F103-07-connectors-and-credentials.md)
- Detail: Affects: Documentation.. Work needed: Update the area brief.
- Evidence: apps/web/db/neon/0097_connector_oauth_broker.sql:120-124

## GAP-F103-08-01

**No maximum age is found for feedback, notifications or tickets outside account erasure and workspace domain retention.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F103-08](../../20-features/103-data-and-persistence-categories/F103-08-notifications-and-feedback.md)
- Detail: Affects: All users; data stays until erasure.. Work needed: Decide retention windows and add rules.
- Evidence: apps/web/lib/services/deletion-manifest.ts retention matrix has maximumAgeDays null unless a financial rule exists (lines 421-433).

## GAP-F103-08-02

**Push is web-only; mobile uses another table; other apps have no browser-style push.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F103-08](../../20-features/103-data-and-persistence-categories/F103-08-notifications-and-feedback.md)
- Detail: Affects: Desktop, CLI, VS Code, Chrome users.. Work needed: State per-app notification behaviour.
- Evidence: apps/web/lib/services/push-notification-service.ts:113-139

## GAP-F103-08-03

**Migration 0151 header says not applied; production state unknown.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F103-08](../../20-features/103-data-and-persistence-categories/F103-08-notifications-and-feedback.md)
- Detail: Affects: Web users.. Work needed: Record applied status from the migration runner.
- Evidence: apps/web/db/neon/0151_web_push_subscriptions.sql:3

## GAP-F103-08-04

**Brief says limits and empty states are not established; limits found here, empty-state wording not read.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F103-08](../../20-features/103-data-and-persistence-categories/F103-08-notifications-and-feedback.md)
- Detail: Affects: Testers.. Work needed: Read bell and ticket UI empty states.
- Evidence: see states

## GAP-F103-09-01

**Applied state of overage migrations is unknown; headers say draft.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F103-09](../../20-features/103-data-and-persistence-categories/F103-09-billing-plans-and-usage.md)
- Detail: Affects: All Cloud users if not applied.. Work needed: Read the migration status for each environment.
- Evidence: apps/web/db/neon/0281_managed_usage_overage_classification.sql:3; 0305 and 0420 headers

## GAP-F103-09-02

**Stale header in 0281 contradicts its body, and the file names itself 0279.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F103-09](../../20-features/103-data-and-persistence-categories/F103-09-billing-plans-and-usage.md)
- Detail: Affects: Engineers reading the migration.. Work needed: Correct the header in a new documentation change; do not edit an applied migration.
- Evidence: apps/web/db/neon/0281_managed_usage_overage_classification.sql:1,16-26

## GAP-F103-09-03

**Workspace invoices have no stated retention age.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F103-09](../../20-features/103-data-and-persistence-categories/F103-09-billing-plans-and-usage.md)
- Detail: Affects: Workspace admins and compliance.. Work needed: Add a rule or documented reason.
- Evidence: apps/web/lib/billing/financial-record-retention.ts:38-160

## GAP-F103-09-04

**App-by-app use of plans and usage on desktop, mobile, CLI, VS Code, Chrome not traced.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F103-09](../../20-features/103-data-and-persistence-categories/F103-09-billing-plans-and-usage.md)
- Detail: Affects: Those apps.. Work needed: Trace each app to the billing and usage endpoints.
- Evidence: not examined

## GAP-F103-10-01

**No code moves a rights request out of 'received'; resolution and resolution_note have no writer found.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F103-10](../../20-features/103-data-and-persistence-categories/F103-10-audit-consent-data-rights-and-erasure.md)
- Detail: Affects: Requesters and operators; the statutory clock has no closing step in code.. Work needed: Add an operator action to change status with a note and an audit event, or document the manual process.
- Evidence: apps/web/app/api/admin/privacy/requests/route.ts exposes only GET; no update statement found in apps/web app or lib.

## GAP-F103-10-02

**The table comment says writing a row notifies nobody, but the route now emails operators.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F103-10](../../20-features/103-data-and-persistence-categories/F103-10-audit-consent-data-rights-and-erasure.md)
- Detail: Affects: Engineers.. Work needed: Correct the comment in a new migration only if the chain allows; otherwise record in docs.
- Evidence: apps/web/db/neon/0114_data_rights_requests.sql comment vs apps/web/app/api/privacy/requests/route.ts:58

## GAP-F103-10-03

**The brief says erasure is driven by the deletion manifest; in code the manifest is derived from the erasure lists, which drive deletion.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F103-10](../../20-features/103-data-and-persistence-categories/F103-10-audit-consent-data-rights-and-erasure.md)
- Detail: Affects: Engineers.. Work needed: Correct the brief.
- Evidence: apps/web/lib/services/deletion-manifest.ts:1-22,395-440

## GAP-F103-10-04

**Consent and rights records are erased with the account, so they do not remain as evidence of what was agreed.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F103-10](../../20-features/103-data-and-persistence-categories/F103-10-audit-consent-data-rights-and-erasure.md)
- Detail: Affects: Compliance.. Work needed: Decide whether a minimal tombstone should be kept.
- Evidence: apps/web/lib/server/account-erasure.ts:152-153

## GAP-F103-10-05

**Audit write failures are swallowed by default.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F103-10](../../20-features/103-data-and-persistence-categories/F103-10-audit-consent-data-rights-and-erasure.md)
- Detail: Affects: Auditors.. Work needed: List actions that must use required mode.
- Evidence: apps/web/lib/security-audit.ts:102-108

## GAP-F103-10-06

**Only web routes were examined; consent surfaces for desktop, CLI, VS Code and Chrome are not in the surface list.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F103-10](../../20-features/103-data-and-persistence-categories/F103-10-audit-consent-data-rights-and-erasure.md)
- Detail: Affects: Those apps.. Work needed: Check how each app records consent.
- Evidence: apps/web/lib/consent-purposes.ts:112-120

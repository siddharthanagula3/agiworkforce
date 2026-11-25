---
id: "AREA-103"
type: "area"
title: "Data and persistence categories"
features: ["F103-01", "F103-02", "F103-03", "F103-04", "F103-05", "F103-06", "F103-07", "F103-08", "F103-09", "F103-10"]
basis: "code inspection"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# 103. Data and persistence categories

This area is the set of records the product keeps for a person: accounts, devices, chats, memory, projects, files, generated apps, agent runs, connector grants, billing, audit trail, consent and erasure records. It makes sure each kind of record is stored durably, is marked with a data class (for example customer content or audit trail), and is known to the erasure and retention code, so an account or workspace can be exported or deleted correctly. Without it, a deleted account could leave chats, files or credentials behind, and an audit could not show what happened.

**Who uses it.** Every signed-in user has records in this area (chats, memory, files, devices). Workspace admins act on the workspace-level records (organization, roles, policy, retention). Paid plans affect billing and credit records (not yet confirmed in code, see not_sure). Developers and the operations team use the classification guard and the retention matrix. The brief gives one status for the whole area ("platform"), so there is no per-app status.

## Features in this area

| ID | Feature | Web | Desktop | Mobile | CLI | VS Code | Chrome |
|---|---|---|---|---|---|---|---|
| [F103-01](F103-01-account-and-sign-in-identity.md) | Account and sign-in identity | n/a | n/a | n/a | n/a | n/a | n/a |
| [F103-02](F103-02-workspaces-members-and-policy.md) | Workspaces, members and policy | n/a | n/a | n/a | n/a | n/a | n/a |
| [F103-03](F103-03-chats-branches-and-memory.md) | Chats, branches and memory | n/a | n/a | n/a | n/a | n/a | n/a |
| [F103-04](F103-04-projects-files-and-library.md) | Projects, files and Library | n/a | n/a | n/a | n/a | n/a | n/a |
| [F103-05](F103-05-generated-content-sharing-and-publishing.md) | Generated content, sharing and publishing | n/a | n/a | n/a | n/a | n/a | n/a |
| [F103-06](F103-06-agent-runs-tasks-and-automation.md) | Agent runs, tasks and automation | n/a | n/a | n/a | n/a | n/a | n/a |
| [F103-07](F103-07-connectors-and-credentials.md) | Connectors and credentials | n/a | n/a | n/a | n/a | n/a | n/a |
| [F103-08](F103-08-notifications-and-feedback.md) | Notifications and feedback | n/a | n/a | n/a | n/a | n/a | n/a |
| [F103-09](F103-09-billing-plans-and-usage.md) | Billing, plans and usage | n/a | n/a | n/a | n/a | n/a | n/a |
| [F103-10](F103-10-audit-consent-data-rights-and-erasure.md) | Audit, consent, data rights and erasure | n/a | n/a | n/a | n/a | n/a | n/a |

Requirement items for this area: [10-requirements/capabilities/103-data-and-persistence-categories.md](../../10-requirements/capabilities/103-data-and-persistence-categories.md).

## How this area works in the code

1. **Person acts in a surface, call reaches an API route.** A request such as starting a conversation enters a Next.js route. The conversations route checks that any project belongs to the user, is not archived and is not deleted, before inserting the conversation. (`apps/web/app/api/chat/conversations/route.ts:232-244`)
2. **Memory sync with conflict check.** The memory sync route admits eligible memory items, then writes them in one query that returns applied rows or conflicts against the current server version, so a stale device cannot overwrite newer memory. (`apps/web/app/api/memory/sync/route.ts:205-225`)
3. **Secrets are encrypted or hashed.** Connector OAuth state is stored as a hash and the code verifier as encrypted text. Access and refresh tokens go to encrypted columns. API keys are hashed with argon2; lookup uses a short prefix and the hash is checked on use. (`apps/web/lib/connectors/oauth-store.ts:68-77`, `apps/web/lib/connectors/oauth-store.ts:303-304`, `apps/web/lib/services/api-key-service.ts:53-60`, `apps/web/lib/services/api-key-service.ts:214-216`, `apps/web/lib/services/api-key-service.ts:261-263`, `apps/web/lib/services/api-key-service.ts:281`)
4. **Sharing and publishing expire or revoke.** A share link gets an expires_at computed from the requested days; a link that is revoked or expired is treated as gone. Published pages have no expiry and end only by unpublish. (`apps/web/app/api/share/route.ts:572-608`, `apps/web/app/api/share/route.ts:394-401`, `apps/web/lib/services/published-artifact-service.ts:45`, `apps/web/lib/services/published-artifact-service.ts:563`)
5. **Consent and data-rights records.** A consent row is inserted with purpose, granted flag, notice version and surface. A data-rights request gets a reference derived from a hash of its submission token, so a retried submission maps to the same reference. (`apps/web/lib/server/consent-records.ts:97-99`, `apps/web/lib/server/data-rights-requests.ts:100-112`)
6. **Audit events are written and protected.** Security events are inserted into the audit table. A later migration adds a trigger that blocks update and delete for the app role, and allows only the table owner for retention and erasure purges. (`apps/web/lib/security-audit.ts:95`, `apps/web/db/neon/0123_audit_log_immutability_trigger.sql:39-65`)
7. **Each store is classified in the deletion manifest.** A map assigns each table a data class (customer content, derived, operational, audit trail or telemetry). The retention matrix combines this with the account and workspace erasure lists and maximum ages. A table not in the map falls back to operational record. (`apps/web/lib/services/deletion-manifest.ts:281-288`, `apps/web/lib/services/deletion-manifest.ts:504`, `apps/web/lib/services/deletion-manifest.ts:544-552`)
8. **Context manifests per turn.** Each turn writes a context manifest row (versions, token counts, entries). The upsert only updates a row whose user matches, so one user cannot overwrite another user's manifest. (`packages/platform/context-engine/src/manifest-store.ts:55-80`)
9. **Retention sweeps and holds.** Per-workspace retention sweeps run, are recorded, and respect legal holds created and released by admins. (`apps/web/lib/services/retention-service.ts:90`, `apps/web/lib/services/retention-service.ts:153`, `apps/web/lib/services/retention-service.ts:182`, `apps/web/lib/services/retention-service.ts:204`)
10. **Profile read assembles the account.** The account endpoint reads the identity, profile, subscription and entitlement and returns one response with the visible name and billing owner. (`apps/web/app/api/me/route.ts:320-332`)

## Files to know

| File | Role |
|---|---|
| `apps/web/lib/services/deletion-manifest.ts` | Classifies every store with a data class and builds the retention matrix that erasure and retention rely on. |
| `apps/web/lib/security-audit.ts` | Writes security audit events to the audit table. |
| `apps/web/db/neon/0123_audit_log_immutability_trigger.sql` | Trigger that makes the audit table append-only. |
| `apps/web/lib/services/retention-service.ts` | Per-workspace retention sweeps and legal holds. |
| `apps/web/lib/server/data-rights-requests.ts` | Creates data-rights requests and their DPDP references. |
| `apps/web/lib/server/consent-records.ts` | Stores consent with purpose, notice version and surface. |
| `apps/web/lib/connectors/oauth-store.ts` | Stores connector OAuth state and encrypted tokens. |
| `apps/web/lib/services/api-key-service.ts` | Creates and verifies API keys stored as hashes. |
| `apps/web/app/api/share/route.ts` | Creates, updates and revokes share links with expiry. |
| `apps/web/app/api/memory/sync/route.ts` | Syncs memory items with server-version conflict checks. |
| `packages/platform/context-engine/src/manifest-store.ts` | Writes per-turn context manifests with an owner check. |

## What is stored

- Conversations and messages (web_conversations, web_messages), chat folders, message bookmarks, branches: Postgres, apps/web/db/neon/0001_mvp_chat.sql and 0022_chat_features.sql
- Memory items (user_memories): Postgres, apps/web/db/neon/0010_memory.sql
- Projects (user_projects) and knowledge files: Postgres, apps/web/db/neon/0006_projects.sql
- Library files (media_assets): Postgres, apps/web/db/neon/0036_media_assets.sql; object storage for bytes (manifest NON_TABLE_STORES)
- File versions and lineage (published_artifact_versions, file_lineage): Postgres, apps/web/db/neon/0257_file_versions_and_lineage.sql (header says not yet applied)
- Published artifacts (published_artifacts): Postgres, apps/web/db/neon/0095_published_artifacts.sql
- Context manifests per turn: Postgres, apps/web/db/neon/0252_context_manifests_and_source_policy.sql
- Agent runs, events, approval checkpoints: Postgres, apps/web/db/neon/0061_cloud_agent_runs.sql, 0062_cloud_agent_approval_checkpoints.sql
- Connector OAuth authorizations and grants (encrypted tokens): Postgres, apps/web/db/neon/0097_connector_oauth_broker.sql
- API keys (argon2 hash and prefix only): Postgres table api_keys, written in apps/web/lib/services/api-key-service.ts:214-216
- Device registrations: Postgres, apps/web/db/neon/0207_device_registrations.sql
- Token credits and credit transactions: Postgres, apps/web/db/neon/0004_token_credits.sql
- Organization billing invoices: Postgres, apps/web/db/neon/0163_enterprise_billing_contracts.sql
- Security audit log (append-only): Postgres security_audit_logs, apps/web/db/neon/0014_security.sql and 0123 trigger
- Consent records with notice version: Postgres, apps/web/db/neon/0113_dpdp_consent_records.sql
- Data-rights requests: Postgres, apps/web/db/neon/0114_data_rights_requests.sql
- Share links (shared_sessions): Postgres, apps/web/db/neon/0051_shared_sessions.sql
- Web push subscriptions: Postgres (named in deletion manifest), apps/web/lib/services/deletion-manifest.ts:251
- Legal holds and organization policy revisions: Postgres (named in deletion manifest lines 176 and 207-208); migrations not opened

## Switches

Plan gates, flags and settings that turn parts of this area on or off.

- **Security audit log retention days and cron path**: Sets how long audit rows are kept and which cron purges them. (apps/web/lib/services/deletion-manifest.ts:18-21 imports SECURITY_AUDIT_LOG_RETENTION_DAYS and SECURITY_LOG_RETENTION_CRON_PATH from apps/web/lib/server/security-log-retention (file not opened))
- **Financial record retention rules**: Sets maximum ages for financial tables; some financial tables have no maximum age. (apps/web/lib/services/deletion-manifest.ts:14-17, from apps/web/lib/billing/financial-record-retention (file not opened))
- **Signaling session maximum age**: Expiry for signaling sessions, 8 days. (apps/web/lib/services/deletion-manifest.ts:431)
- **Share link expiry in days**: Sets expires_at on a new share link. (apps/web/app/api/share/route.ts:80 (schema) and 572-608)
- **Legal hold**: Stops retention sweeps for the held workspace data. (apps/web/lib/services/retention-service.ts:90 and 153)
- **Plan gates for storage, memory, files and billing**: Not established in this pass. (not established)

## Shared between apps

[{"what":"Database schema, migrations and the deletion manifest are shared by all server-side features and used by every app's data.","where":"apps/web/db/neon/, apps/web/lib/services/deletion-manifest.ts"},{"what":"The context manifest store is a shared package used by the chat engine.","where":"packages/platform/context-engine/src/manifest-store.ts"},{"what":"Contract types for external resource references are shared.","where":"packages/contracts/types/src/external-resource-reference.ts"},{"what":"Resource metadata contract is shared.","where":"packages/contracts/types/src/resource-metadata-contract.json"},{"what":"Per-app code (desktop, mobile, extension, CLI, web UI) is not opened in this pass; the brief gives platform status only.","where":"not established"}]

## Looks wrong in the code

From reading only; not confirmed in the running app. Each line is also in the gap register.

- Three cited locations are past the end of the file, so the brief's citations are wrong. (apps/web/app/api/projects/[id]/duplicate/route.ts:158 (file has 154 lines); apps/web/app/api/projects/[id]/knowledge-files/google-drive/route.ts:157 (file has 94 lines); apps/web/lib/services/work-plan-service.ts:436 (file has 432 lines))
- S103.13 'Folders and Library entries' cites media-assets.ts, which has no folder concept. The Library query is the only Library code seen. Chat folders exist only as a chat feature. (apps/web/lib/server/media-assets.ts:4 and :60; apps/web/db/neon/0036_media_assets.sql:28; apps/web/db/neon/0022_chat_features.sql (chat_folders))
- Migrations cited as 'done' carry a header that says NOT YET APPLIED. 143 of 425 migrations carry this header. Application state could not be checked in this pass. (apps/web/db/neon/0252_context_manifests_and_source_policy.sql:5 (S103.09); apps/web/db/neon/0202_retrieval_index.sql:4 (S103.15, S103.16); apps/web/db/neon/0226_durable_image_generation_jobs.sql (S103.20); apps/web/db/neon/0281_managed_usage_overage_classification.sql (S103.32); apps/web/db/neon/0257_file_versions_and_lineage.sql:4 (versions and lineage, S103.12, S103.19))
- S103.12 'derivation lineage' is cited to 0036, but the lineage table (file_lineage) is in 0257, which is marked draft. (apps/web/db/neon/0257_file_versions_and_lineage.sql:1-4; apps/web/db/neon/0036_media_assets.sql)
- Unknown tables fall back silently to 'operational_record' instead of failing. The guard that would catch them, unclassifiedStores, is only exercised by a test. (apps/web/lib/services/deletion-manifest.ts:504 and :544-552; apps/web/__tests__/security/data-classification-reach.test.ts:19-24)
- Memory items in the brief (S103.10) cite the memory sync route. The memory table has source text and no separate turn column in the migration header seen, so turn-level provenance is not confirmed. (apps/web/db/neon/0010_memory.sql:6)

## Not established

- Whether the migrations with the NOT YET APPLIED header are applied in production or any environment. The deployment ledger was not checked (apps/web/db/neon/CORRECTIONS.md says a ledger exists).
- Per-app status: the brief gives only 'platform' for every item, so Web, Desktop, Mobile, CLI, VS Code and Chrome behaviour is not established.
- Plan gates and limits (for example storage or memory caps by plan): not traced.
- Whether the erasure and retention cron jobs are wired to run on a schedule: apps/web/lib/server/account-erasure.ts and the security-log-retention module were not opened.
- The user interface steps: the brief names no screens, and UI code was not opened, so how_people_use_it steps are from routes and names only.
- Behaviour of the device sign-out and revoke path, and of the connector disconnect path, was not traced.
- Only the files listed were opened. Nothing was built, tested or run, as required for this read-only task. The test-coverage claims are limited to test file names seen.

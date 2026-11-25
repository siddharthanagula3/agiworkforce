# Area 103. Data and persistence categories

38 items. Status words: done, partial, missing, unverified, n/a (does not apply to that app).

## S103.01 Accounts and authentication identities.
- Should: User accounts and their linked authentication identities are durably stored, owned by one canonical record, and classified for export and erasure.
- Status: platform done
- Code: apps/web/app/api/me/route.ts:325; apps/web/lib/server/identity-account.ts:54; apps/web/db/neon/0002_profiles.sql:1; apps/web/lib/services/deletion-manifest.ts:173

## S103.02 Sessions and devices.
- Should: Sessions and devices (registrations, refresh tokens, revocations) are durably stored and classified.
- Status: platform done
- Code: apps/web/app/api/devices/heartbeat/route.ts:22; apps/web/app/api/auth/device/refresh/route.ts:153; apps/web/lib/server/developer-token.ts:127; apps/web/db/neon/0207_device_registrations.sql:23; apps/web/lib/services/deletion-manifest.ts:122

## S103.03 Organizations and workspaces.
- Should: Organizations/workspaces are durably stored and classified.
- Status: platform done
- Code: apps/web/app/api/settings/organization/route.ts:302; apps/web/db/neon/0015_organizations.sql:1; apps/web/lib/services/deletion-manifest.ts:169

## S103.04 Memberships and roles.
- Should: Memberships and role grants are durably stored and classified.
- Status: platform done
- Code: apps/web/app/api/settings/organization/route.ts:321; apps/web/lib/services/organization-role-service.ts:277; apps/web/lib/services/organization-role-service.ts:144; apps/web/db/neon/0015_organizations.sql:10; apps/web/lib/services/deletion-manifest.ts:157

## S103.05 Preferences and policy versions.
- Should: User preferences and workspace policy (with revision history) are durably stored and classified.
- Status: platform done
- Code: apps/web/app/api/settings/preferences/route.ts:160; apps/web/lib/services/organization-policy-service.ts:382; apps/web/db/neon/0028_user_settings.sql:7; apps/web/lib/services/deletion-manifest.ts:189

## S103.06 Conversations and turns.
- Should: Conversations and their turns are durably stored and classified.
- Status: platform done
- Code: apps/web/app/api/chat/conversations/route.ts:238; apps/web/app/api/chat/conversations/[id]/messages/lib/message-thread.ts:29; apps/web/db/neon/0001_mvp_chat.sql:3; apps/web/lib/services/deletion-manifest.ts:78

## S103.07 Message versions and branches.
- Should: Message versions and conversation branches are durably stored and classified with their conversation.
- Status: platform done
- Code: apps/web/lib/services/conversation-branch-service.ts:291; apps/web/lib/services/conversation-branch-service.ts:372; apps/web/db/neon/0022_chat_features.sql:30; apps/web/lib/services/deletion-manifest.ts:41

## S103.08 Execution attempts.
- Should: Each execution attempt (operation, run, retry count) is durably recorded and classified.
- Status: platform done
- Code: apps/web/lib/services/cloud-agent-execution-service.ts:237; apps/web/lib/services/schedule-service.ts:1063; apps/web/db/neon/0063_cloud_agent_execution_operations.sql:20; apps/web/lib/services/deletion-manifest.ts:34

## S103.09 Context manifests.
- Should: Context manifests (what went into each turn's context) are durably recorded and classified.
- Status: platform done
- Code: packages/platform/context-engine/src/manifest-store.ts:55; apps/web/db/neon/0252_context_manifests_and_source_policy.sql:30; apps/web/lib/services/deletion-manifest.ts:86

## S103.10 Memory items and provenance.
- Should: Memory items and their provenance (source conversation and turn) are durably stored and classified.
- Status: platform done
- Code: apps/web/app/api/memory/sync/route.ts:211; apps/web/lib/services/managed-memory-context-service.ts:721; apps/web/db/neon/0010_memory.sql:1; apps/web/lib/services/deletion-manifest.ts:71

## S103.11 Projects and notes.
- Should: Projects with their instructions and knowledge are durably stored and classified.
- Status: platform done
- Code: apps/web/app/api/projects/[id]/duplicate/route.ts:114; apps/web/app/api/projects/[id]/duplicate/route.ts:158; apps/web/db/neon/0006_projects.sql:1; apps/web/lib/services/deletion-manifest.ts:72

## S103.12 Files and versions.
- Should: Files, their versions and derivation lineage are durably stored and classified.
- Status: platform done
- Code: apps/web/lib/server/media-assets.ts:182; apps/web/app/api/artifacts/publish/route.ts:136; apps/web/lib/server/generated-file-persist.ts:68; apps/web/db/neon/0036_media_assets.sql:9; apps/web/lib/services/deletion-manifest.ts:48

## S103.13 Folders and Library entries.
- Should: Library entries and folders are durably stored and classified.
- Status: platform done
- Code: apps/web/lib/server/media-assets.ts:182; apps/web/app/api/projects/[id]/duplicate/route.ts:114; apps/web/db/neon/0036_media_assets.sql:9; apps/web/lib/services/deletion-manifest.ts:48

## S103.14 External resource references.
- Should: References to external resources (repositories, URLs, connector items) are stored as canonical, classified references.
- Status: platform done
- Code: apps/web/db/neon/0322_external_resource_references.sql:28; packages/contracts/types/src/external-resource-reference.ts:170; apps/web/lib/server/external-resource-references.ts:76; apps/web/app/api/projects/[id]/knowledge-files/google-drive/route.ts:157; apps/web/lib/services/cloud-code-session-service.ts:1244; apps/web/app/api/llm/v1/chat/completions/lib/assistant-turn-persistence.ts:386; apps/web/app/api/connectors/custom/route.ts:125; apps/web/lib/server/project-knowledge-files.ts:416

## S103.15 Extracted source content.
- Should: Text extracted from sources is durably stored for reuse and classified.
- Status: platform done
- Code: apps/web/lib/services/retrieval-index-service.ts:650; apps/web/lib/services/retrieval-index-service.ts:359; apps/web/db/neon/0202_retrieval_index.sql:48; apps/web/lib/services/deletion-manifest.ts:89

## S103.16 Search and vector indexes.
- Should: Search and vector indexes are durably stored and classified with the content they index.
- Status: platform done
- Code: apps/web/lib/services/retrieval-index-service.ts:359; apps/web/app/api/chat/conversations/[id]/messages/lib/index-artifacts.ts:82; apps/web/db/neon/0202_retrieval_index.sql:116; apps/web/lib/services/deletion-manifest.ts:88

## S103.17 Citations and source locators.
- Should: Citations and source locators are persisted with the answers that use them and classified.
- Status: platform done
- Code: apps/web/lib/services/research-report-service.ts:238; apps/web/db/neon/0094_research_reports.sql:28; apps/web/lib/services/deletion-manifest.ts:59

## S103.18 Artifacts and revisions.
- Should: Artifacts and their revision history are durably stored and classified.
- Status: platform done
- Code: apps/web/app/api/chat/sync/route.ts:302; apps/web/app/api/chat/sync/route.ts:764; apps/web/db/neon/0049_artifact_force_rls.sql:11; packages/contracts/types/src/resource-metadata-contract.json:296; apps/web/lib/resources/deletion-policies.ts:153

## S103.19 Generated applications and deployments.
- Should: Generated applications/published artifacts and their deployed versions are durably stored and classified.
- Status: platform done
- Code: apps/web/lib/services/published-artifact-service.ts:325; apps/web/app/api/artifacts/publish/route.ts:136; apps/web/db/neon/0095_published_artifacts.sql:47; apps/web/lib/services/deletion-manifest.ts:58

## S103.20 Media jobs and assets.
- Should: Media generation jobs and their assets are durably stored and classified.
- Status: platform done
- Code: apps/web/lib/server/image-generation-jobs.ts:251; apps/web/lib/server/video-generation-jobs.ts:396; apps/web/lib/server/media-assets.ts:182; apps/web/db/neon/0226_durable_image_generation_jobs.sql:32; apps/web/lib/services/deletion-manifest.ts:46

## S103.21 Agents and task plans.
- Should: Agent runs and task plans (with revisions) are durably stored and classified.
- Status: platform done
- Code: apps/web/lib/services/cloud-agent-run-service.ts:650; apps/web/lib/services/work-plan-service.ts:436; apps/web/lib/services/work-plan-service.ts:378; apps/web/db/neon/0061_cloud_agent_runs.sql:9; apps/web/lib/services/deletion-manifest.ts:36

## S103.22 Tool invocations and receipts.
- Should: Tool invocations and their receipts are durably recorded and classified.
- Status: platform done
- Code: apps/web/lib/services/connector-call-log-service.ts:67; apps/web/lib/services/cloud-agent-execution-service.ts:237; apps/web/db/neon/0223_connector_call_events.sql:32; apps/web/lib/services/deletion-manifest.ts:214

## S103.23 Approval requests and decisions.
- Should: Approval requests and the decisions made on them are durably recorded and classified.
- Status: platform done
- Code: apps/web/lib/services/cloud-agent-run-service.ts:1342; apps/web/db/neon/0062_cloud_agent_approval_checkpoints.sql:8; apps/web/lib/services/deletion-manifest.ts:32

## S103.24 Checkpoints.
- Should: Resumable checkpoints of long-running work are durably stored and classified.
- Status: platform done
- Code: apps/web/lib/services/cloud-agent-run-service.ts:1342; apps/web/lib/services/cloud-agent-run-service.ts:650; apps/web/db/neon/0062_cloud_agent_approval_checkpoints.sql:8; apps/web/lib/services/deletion-manifest.ts:32

## S103.25 Coding sessions and repository bindings.
- Should: Coding sessions and their repository bindings are durably stored and classified.
- Status: platform done
- Code: apps/web/lib/services/cloud-code-session-service.ts:1196; apps/web/app/api/github/oauth/callback/route.ts:106; apps/web/db/neon/0075_cloud_code_sessions.sql:7; apps/web/lib/services/deletion-manifest.ts:38

## S103.26 Connectors and connected accounts.
- Should: Connectors and connected accounts are durably stored and classified.
- Status: platform done
- Code: apps/web/app/api/connectors/route.ts:576; apps/web/lib/connectors/oauth-store.ts:311; apps/web/db/neon/0048_user_connectors.sql:12; apps/web/lib/services/deletion-manifest.ts:187

## S103.27 Encrypted credential references.
- Should: Credentials are stored only encrypted or hashed (access_token_enc, key hashes) and classified.
- Status: platform done
- Code: apps/web/lib/connectors/oauth-store.ts:311; apps/web/lib/services/api-key-service.ts:95; apps/web/db/neon/0097_connector_oauth_broker.sql:92; apps/web/lib/services/deletion-manifest.ts:110

## S103.28 Skills and Plugins.
- Should: Skills and plugin installations are durably stored and classified.
- Status: platform done
- Code: apps/web/lib/services/user-skill-service.ts:163; apps/web/lib/services/plugin-installation-service.ts:186; apps/web/db/neon/0157_user_skills.sql:19; apps/web/lib/services/deletion-manifest.ts:74

## S103.29 Schedules and trigger definitions.
- Should: Schedules and trigger definitions are durably stored and classified.
- Status: platform done
- Code: apps/web/lib/services/schedule-service.ts:715; apps/web/lib/triggers/trigger-service.ts:270; apps/web/db/neon/0009_scheduling.sql:1; apps/web/lib/services/deletion-manifest.ts:60

## S103.30 Notifications.
- Should: Notifications and delivery subscriptions are durably stored and classified.
- Status: platform done
- Code: apps/web/lib/services/notification-service.ts:65; apps/web/app/api/web-push/route.ts:100; apps/web/db/neon/0016_misc.sql:1; apps/web/lib/services/deletion-manifest.ts:52

## S103.31 Plans and subscriptions.
- Should: Plans and subscriptions are durably stored and classified (financial retention).
- Status: platform done
- Code: apps/web/app/api/stripe-webhook/lib/db.ts:730; apps/web/db/neon/0003_subscriptions.sql:1; apps/web/lib/services/deletion-manifest.ts:182

## S103.32 Usage and credit ledger entries.
- Should: Usage and credit ledger entries are durably recorded, classified, and correctly attributed to plan or overage.
- Status: platform done
- Code: apps/web/lib/services/credit-service.ts:545; apps/web/db/neon/0004_token_credits.sql:20; apps/web/lib/services/deletion-manifest.ts:115; apps/web/db/neon/0281_managed_usage_overage_classification.sql:1

## S103.33 Invoices and payment references.
- Should: Invoices and payment references are durably stored and classified.
- Status: platform done
- Code: apps/web/lib/services/enterprise-billing-service.ts:908; apps/web/db/neon/0163_enterprise_billing_contracts.sql:66; apps/web/lib/services/deletion-manifest.ts:146; apps/web/lib/services/enterprise-contracts/invoicing.ts:177

## S103.34 Audit events.
- Should: Audit events are durably and append-only recorded and classified as audit trail.
- Status: platform done
- Code: apps/web/lib/security-audit.ts:87; apps/web/lib/security-audit.ts:679; apps/web/db/neon/0014_security.sql:1; apps/web/lib/services/deletion-manifest.ts:205

## S103.35 Feedback and support cases.
- Should: Feedback and support cases are durably stored and classified.
- Status: platform done
- Code: apps/web/app/api/feedback/route.ts:140; apps/web/lib/support/tickets/store.ts:93; apps/web/lib/support/tickets/store.ts:266; apps/web/db/neon/0016_misc.sql:16; apps/web/lib/services/deletion-manifest.ts:44

## S103.36 Retention/deletion records.
- Should: Retention sweeps, deletion requests, holds and erasure records are durably stored and classified.
- Status: platform done
- Code: apps/web/lib/server/data-rights-requests.ts:104; apps/web/lib/services/retention-service.ts:178; apps/web/lib/services/retention-service.ts:109; apps/web/db/neon/0114_data_rights_requests.sql:36; apps/web/lib/services/deletion-manifest.ts:116

## S103.37 Consent and policy acceptance.
- Should: Consent and policy acceptance (with version) are durably recorded and classified.
- Status: platform done
- Code: apps/web/lib/server/consent-records.ts:88; apps/web/db/neon/0113_dpdp_consent_records.sql:38; apps/web/lib/services/deletion-manifest.ts:112

## S103.38 Published-content access rules.
- Should: Access rules for shared and published content (visibility, expiry, revocation) are durably stored and classified.
- Status: platform done
- Code: apps/web/app/api/share/route.ts:217; apps/web/lib/services/published-artifact-service.ts:325; apps/web/db/neon/0051_shared_sessions.sql:1; apps/web/lib/services/deletion-manifest.ts:63

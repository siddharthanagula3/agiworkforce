# Area 87. Enterprise administration screens

40 items. Status words: done, partial, missing, unverified, n/a (does not apply to that app).

## S87.01 Organization overview.
- Should: An administrator opens an organization overview that summarises the workspace (name, plan, members/seats, security posture) from live data.
- Status: web done, desktop done, mobile done, cli missing
- Code: apps/web/app/workspace/page.tsx:9; apps/web/features/workspace-console/components/WorkspaceConsoleNav.tsx:41; apps/web/features/workspace-console/components/WorkspacePostureOverview.tsx:224; apps/web/app/api/settings/organization/posture/route.ts:30; apps/web/features/settings/sections/TeamSection.tsx:555; apps/mobile/src/features/team/WorkspaceAdministration.tsx:292; apps/mobile/src/features/team/WorkspaceAdministration.tsx:316; apps/mobile/src/features/team/administration.ts:143

## S87.02 Member directory.
- Should: An administrator can list the workspace members with name, email and role.
- Status: web done, desktop done, mobile done, cli missing
- Code: apps/web/features/settings/sections/TeamSection.tsx:922; apps/web/app/workspace/people/page.tsx:11; apps/web/app/api/settings/team/route.ts:55; apps/mobile/app/(app)/settings/workspace.tsx:491; apps/mobile/src/features/team/service.ts:122; apps/mobile/src/features/settings/index.tsx:450

## S87.03 Invitations.
- Should: An administrator can invite people by email with a role, see pending invitations, renew and revoke them, and the invitee can accept.
- Status: web done, desktop done, mobile done, cli missing
- Code: apps/web/features/settings/sections/TeamSection.tsx:685; apps/web/features/settings/sections/TeamSection.tsx:827; apps/web/app/api/settings/team/invitations/route.ts:92; apps/web/app/api/settings/team/invitations/[invitationId]/route.ts:129; apps/mobile/src/features/team/WorkspaceAdministration.tsx:75; apps/mobile/src/features/team/WorkspaceAdministration.tsx:216; apps/mobile/src/features/team/administration.ts:116; apps/mobile/src/features/team/administration.ts:134

## S87.04 Groups.
- Should: An administrator can see workspace groups with their members, create or sync groups, and grant roles or permissions to a group.
- Status: web done, desktop done, cli missing, api done
- Code: apps/web/features/workspace-console/components/WorkspaceRoles.tsx:673; apps/web/features/workspace-console/components/WorkspaceRoles.tsx:586; apps/web/features/workspace-console/components/WorkspaceRoles.tsx:487; apps/web/lib/services/organization-role-service.ts:511; apps/web/lib/services/organization-role-service.ts:581; apps/web/lib/services/organization-policy-override-service.ts:76; apps/web/db/neon/0314_workspace_managed_groups.sql:141; apps/web/app/api/scim/v2/Groups/route.ts:41

## S87.05 Roles.
- Should: An administrator sees the workspace roles with their permissions and can change a member's role, enforced by the server.
- Status: web done, desktop done, mobile done, cli missing
- Code: apps/web/features/workspace-console/components/WorkspaceRoles.tsx:261; apps/web/features/settings/sections/TeamSection.tsx:1315; apps/web/app/api/settings/team/[memberId]/route.ts:27; apps/web/app/api/settings/team/[memberId]/route.ts:236; apps/mobile/src/features/team/RolePickerModal.tsx:45; apps/mobile/app/(app)/settings/workspace.tsx:180; apps/mobile/app/(app)/settings/workspace.tsx:160

## S87.06 Custom roles.
- Should: An administrator can create, edit and delete a custom role from a permission set and assign it to members or groups, and the permissions take effect.
- Status: web done, desktop done, cli missing
- Code: apps/web/features/workspace-console/components/WorkspaceRoles.tsx:330; apps/web/features/workspace-console/components/WorkspaceRoles.tsx:41; apps/web/features/workspace-console/components/WorkspaceRoles.tsx:417; apps/web/app/api/settings/organization/roles/route.ts:74

## S87.07 Seat assignment.
- Should: An administrator sees licensed, used and available seats, members consume and release seats, and seats can be added.
- Status: web done, desktop done, cli missing
- Code: apps/web/features/settings/sections/TeamSection.tsx:610; apps/web/features/settings/sections/TeamSection.tsx:680; apps/web/features/settings/sections/TeamSection.tsx:749; apps/web/app/api/settings/team/invitations/route.ts:81

## S87.08 Owner transfer.
- Should: The owner can hand ownership to another member after confirmation, with the server moving the owner role atomically.
- Status: web done, desktop done, mobile done, cli missing
- Code: apps/web/features/settings/sections/TeamSection.tsx:1079; apps/web/features/settings/sections/TeamSection.tsx:1149; apps/web/app/api/settings/organization/transfer-ownership/route.ts:29; apps/mobile/app/(app)/settings/workspace.tsx:203

## S87.09 Domain verification.
- Should: An administrator claims a company domain, publishes a DNS TXT challenge, and the product verifies ownership before routing sign-in for that domain.
- Status: web done, desktop done, cli missing
- Code: apps/web/features/workspace-console/components/WorkspaceIdentityPanels.tsx:73; apps/web/features/settings/sections/team/SSOPanel.tsx:405; apps/web/features/settings/sections/team/SSOPanel.tsx:464; apps/web/app/api/admin/sso/verify-domain/route.ts:120; apps/web/lib/server/sso/domain-verification.ts:101

## S87.10 SSO setup.
- Should: A workspace owner configures a SAML or OIDC connection for a verified domain, and members on that domain sign in through the identity provider.
- Status: web done, desktop done, cli missing
- Code: apps/web/app/workspace/identity/page.tsx:13; apps/web/features/settings/sections/team/SSOPanel.tsx:277; apps/web/app/api/admin/sso/route.ts:181; apps/web/features/workspace-console/components/WorkspaceIdentityPanels.tsx:99

## S87.11 Directory provisioning.
- Should: An administrator connects an identity provider over SCIM (connection and bearer token), and the provider creates, updates and deprovisions members.
- Status: web done, desktop done, cli missing, api done
- Code: apps/web/features/workspace-console/components/WorkspaceIdentityPanels.tsx:75; apps/web/features/admin/pages/DirectorySyncAdminPage.tsx:299; apps/web/features/admin/pages/DirectorySyncAdminPage.tsx:222; apps/web/app/api/admin/directory-sync/tokens/route.ts:52; apps/web/app/api/scim/v2/Users/route.ts:40; apps/web/app/api/scim/v2/Users/[userId]/route.ts:59; apps/web/lib/server/scim/scim-route.ts:12

## S87.12 Service accounts.
- Should: An administrator creates non-human service accounts with bounded permissions and keys that outlive their creator, and can disable them or revoke their keys.
- Status: web done, desktop done, cli missing, api done
- Code: apps/web/features/workspace-console/components/WorkspaceIdentityPanels.tsx:77; apps/web/features/workspace-console/components/WorkspaceServicePrincipals.tsx:168; apps/web/features/workspace-console/components/WorkspaceApiKeys.tsx:205; apps/web/app/api/settings/organization/admin-api-keys/route.ts:198; apps/web/lib/server/admin-api-keys.ts:185; apps/web/lib/server/service-principals/route-access.ts:14; apps/web/lib/server/compliance-caller.ts:48

## S87.13 Model-access policy.
- Should: An administrator allows or blocks providers and models for the workspace, and requests for a blocked model are refused.
- Status: web done, desktop done, cli missing
- Code: apps/web/app/workspace/models/page.tsx:12; apps/web/features/workspace-console/components/WorkspaceModelPolicy.tsx:179; apps/web/features/workspace-console/components/WorkspaceModelPolicy.tsx:394; apps/web/app/api/settings/organization/model-policy/route.ts:202; apps/web/lib/managed-compute-gate.ts:320

## S87.14 Feature-access policy.
- Should: An administrator switches product features on or off for the workspace (with exceptions) and each switched-off feature is refused wherever it runs.
- Status: web done, desktop done, cli done
- Code: apps/cli/src/cloud/workspace_policy.rs:13; apps/cli/src/cloud/workspace_policy.rs:92; apps/cli/src/features/hooks/hooks.rs:1234; apps/cli/src/agent/mod.rs:523; apps/cli/src/agent/chat.rs:722; apps/desktop/electron/runtime/developerSessionService.ts:725; apps/cli/src/agent/chat.rs:824

## S87.15 Tool policy.
- Should: An administrator decides which individual tools members and agents may use (allow, block or require approval) and the tool loop enforces it.
- Status: web done, desktop done, cli done
- Code: apps/web/app/api/llm/v1/chat/completions/lib/connector-tool-permissions.ts:177; apps/web/app/api/llm/v1/chat/completions/lib/connector-tool-permissions.ts:290; apps/web/app/api/llm/v1/chat/completions/route.ts:842; apps/web/app/api/settings/organization/connector-policy/route.ts:133; apps/web/features/workspace-console/components/WorkspaceConnectorPolicy.tsx:454; apps/cli/src/cloud/workspace_policy.rs:103; apps/cli/src/mcp/mod.rs:635

## S87.16 Connector policy.
- Should: An administrator allows or blocks connectors (and custom connectors) for the workspace, and blocked connectors are not offered or connectable.
- Status: web done, desktop done, cli done
- Code: apps/web/app/workspace/connectors/page.tsx:12; apps/web/features/workspace-console/components/WorkspaceConnectorPolicy.tsx:558; apps/web/app/api/settings/organization/connector-policy/route.ts:153; apps/web/lib/user-connector-tools.ts:1790; apps/cli/src/agent/mod.rs:525

## S87.17 Skill and Plugin policy.
- Should: An administrator controls which skills and plugins members may install or use, per item, and the product enforces it.
- Status: web done, desktop done, cli done
- Code: apps/web/features/workspace-console/components/WorkspaceConnectorPolicy.tsx:155; apps/web/features/workspace-console/components/WorkspaceFeatureControls.tsx:51; apps/web/lib/services/connector-policy-gate.ts:123; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:3740; apps/cli/src/features/hooks/managed.rs:27; apps/cli/src/features/plugins/plugins.rs:235

## S87.18 Private marketplace.
- Should: A workspace curates its own private catalogue of plugins, skills or servers that members browse and install, separate from the public directory.
- Status: web done, desktop done, cli missing
- Code: apps/web/app/api/settings/organization/plugins/route.ts:62; apps/web/features/workspace-console/components/WorkspaceConsoleNav.tsx:107; apps/web/app/workspace/plugins/page.tsx:16; apps/web/features/plugins/server/directory/installed-skills.ts:105

## S87.19 Shared Project administration.
- Should: An administrator sees every project shared with the workspace, sets per-member access, and can stop sharing a project.
- Status: web done, desktop done, cli missing
- Code: apps/web/app/workspace/sharing/page.tsx:12; apps/web/features/settings/sections/OrganizationSharingSection.tsx:179; apps/web/features/settings/sections/OrganizationSharingSection.tsx:277; apps/web/app/api/settings/organization/shared/projects/[projectId]/route.ts:178

## S87.20 External-sharing controls.
- Should: An administrator turns sharing outside the workspace on or off, and members cannot create new external share links while it is off.
- Status: web done, desktop done, cli missing
- Code: apps/web/app/workspace/policy/page.tsx:14; apps/web/features/settings/sections/WorkspacePolicySection.tsx:440; apps/web/lib/managed-compute-gate.ts:361; apps/web/app/api/share/route.ts:141

## S87.21 Public-publishing controls.
- Should: An administrator controls whether members may publish chats or artifacts publicly, and publishing is refused when it is off.
- Status: web done, desktop done, cli missing
- Code: apps/web/features/settings/sections/WorkspacePolicySection.tsx:440; apps/web/app/api/artifacts/publish/route.ts:202; apps/web/lib/services/organization-policy-evaluator.ts:355

## S87.22 Memory policy.
- Should: An administrator allows or disallows account memory for the workspace, and members get no memory while it is off.
- Status: web done, desktop done, cli missing
- Code: apps/web/features/settings/sections/WorkspacePolicySection.tsx:457; apps/web/lib/services/managed-memory-context-service.ts:106; apps/web/lib/services/managed-memory-context-service.ts:535

## S87.23 Data-retention settings.
- Should: An administrator sets how long workspace conversations are kept and, when enforced, a scheduled sweep deletes older ones (withholding legal holds).
- Status: web done, desktop done, cli missing
- Code: apps/web/features/settings/sections/WorkspacePolicySection.tsx:487; apps/web/features/settings/sections/WorkspacePolicySection.tsx:513; apps/web/app/api/cron/enforce-workspace-retention/route.ts:62; vercel.json:98

## S87.24 Data-residency settings.
- Should: An administrator chooses or requests the region where workspace data is stored and processed, and the product keeps data there.
- Status: web partial, desktop partial
- Code: apps/web/app/workspace/data/page.tsx:24; apps/web/features/workspace-console/components/WorkspaceDataRegion.tsx:196; apps/web/app/api/settings/organization/data-region/route.ts:117; apps/web/app/api/settings/organization/data-region/route.ts:148; apps/web/app/api/admin/data-region/route.ts:49
- Unfinished: web: owner: stand up the EU database, bucket, log sink and KMS, then set the AGI_DATA_REGION_EU_* variables (apps/web/lib/server/data-region.ts) | desktop: owner: stand up the EU database, bucket, log sink and KMS, then set the AGI_DATA_REGION_EU_* variables (apps/web/lib/server/data-region.ts)

## S87.25 Customer-managed-key setup where offered.
- Should: Where offered, an administrator connects a customer-managed encryption key, rotates or revokes it from the console, and workspace data is sealed under it.
- Status: web done, desktop done, cli missing, api done
- Code: apps/web/app/workspace/data/page.tsx:23; apps/web/features/workspace-console/components/WorkspaceEncryptionKey.tsx:403; apps/web/features/workspace-console/components/WorkspaceEncryptionKey.tsx:261; apps/web/features/workspace-console/components/WorkspaceEncryptionKey.tsx:341; apps/web/features/workspace-console/components/WorkspaceEncryptionKey.tsx:199; apps/web/features/workspace-console/hooks/use-encryption-key.ts:154; apps/web/app/api/settings/organization/keys/route.ts:140; apps/web/lib/server/organization-encryption-keys.ts:622

## S87.26 Network/IP restrictions.
- Should: An administrator restricts workspace access to listed IP ranges, and requests from other networks are refused.
- Status: web done, desktop done, cli missing
- Code: apps/web/features/settings/sections/WorkspacePolicySection.tsx:634; apps/web/features/settings/sections/WorkspacePolicySection.tsx:681; apps/web/lib/ip-allow-list-gate.ts:30; apps/web/lib/api-auth.ts:329

## S87.27 Device-management integration.
- Should: An organisation can deploy and configure the product through its device-management system (MDM or managed policy), and the app honours that managed configuration.
- Status: web missing, desktop missing, mobile missing, cli done, chrome done
- Code: apps/cli/src/features/hooks/managed.rs:137; apps/cli/src/platform/policy/managed.rs:100; apps/cli/src/onboarding.rs:189; apps/cli/src/features/exec/tools/mod.rs:432; apps/extension/manifest.json:35; apps/extension/managed-schema.json:5; apps/extension/src/features/site-policy/store.ts:15; apps/extension/src/background.ts:2636

## S87.28 Audit-log viewer.
- Should: An administrator browses the workspace audit trail with filters (action, outcome, severity, time range) from live data.
- Status: web done, desktop done, cli missing, api done
- Code: apps/web/app/workspace/audit/page.tsx:18; apps/web/features/settings/sections/WorkspaceAuditSection.tsx:163; apps/web/app/api/settings/organization/audit/route.ts:60; apps/web/lib/server/service-principals/route-access.ts:21; apps/web/app/api/settings/organization/audit/route.ts:58

## S87.29 Audit export.
- Should: An administrator exports the audit trail for a range (and can stream it to a SIEM), with the export itself recorded.
- Status: web done, desktop done, cli missing, api done
- Code: apps/web/features/settings/sections/WorkspaceAuditSection.tsx:153; apps/web/features/settings/sections/WorkspacePolicySection.tsx:513; apps/web/app/api/settings/organization/audit/export/route.ts:83; apps/web/app/workspace/audit/page.tsx:22; vercel.json:130; apps/web/lib/services/audit-streaming-service.ts:43; apps/web/lib/services/__tests__/audit-streaming-service.test.ts:337; apps/web/app/api/cron/drain-audit-streams/route.test.ts:54

## S87.30 Usage analytics.
- Should: An administrator sees workspace usage and spend broken down by member, model, product area and provider over a period, and can export it.
- Status: web done, desktop done, cli missing
- Code: apps/web/app/workspace/usage/page.tsx:12; apps/web/features/workspace-console/components/WorkspaceUsageAnalytics.tsx:319; apps/web/features/workspace-console/components/WorkspaceUsageAnalytics.tsx:255; apps/web/app/api/settings/organization/usage-analytics/route.ts:39; apps/web/lib/services/organization-usage-service.ts:92

## S87.31 Group spending limits.
- Should: An administrator sets a spending limit for a group of members and usage by that group is capped.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing

## S87.32 User spending limits.
- Should: An administrator sets a spending limit for an individual member and that member's usage is capped.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing

## S87.33 Organization budget.
- Should: An administrator sets a monthly workspace budget with an alert threshold, sees spend against it, and managed usage is refused once it is exhausted (when enforced).
- Status: web done, desktop done, cli missing
- Code: apps/web/features/workspace-console/components/WorkspaceUsageAnalytics.tsx:344; apps/web/features/workspace-console/components/WorkspaceSpendLimit.tsx:62; apps/web/features/workspace-console/components/WorkspaceSpendLimit.tsx:163; apps/web/app/api/settings/organization/spend-limit/route.ts:81; apps/web/lib/services/managed-compute-access.ts:112

## S87.34 Billing administration.
- Should: An administrator manages the workspace plan, seats, payment method, invoices and (for enterprise) contract terms from the console.
- Status: web done, desktop done, cli missing
- Code: apps/web/app/workspace/billing/page.tsx:12; apps/web/features/workspace-console/components/WorkspaceBillingSummary.tsx:136; apps/web/features/workspace-console/components/WorkspaceBillingSummary.tsx:156; apps/web/app/api/settings/organization/billing-contract/route.ts:111; apps/web/lib/services/enterprise-contracts/agreement-store.ts:31

## S87.35 Support-access controls.
- Should: A workspace administrator decides whether platform support may access workspace data (approve, deny, revoke, time-limit) and can review support access to the workspace.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing

## S87.36 Compliance export.
- Should: An administrator exports workspace content (conversations, messages, files, artifacts) in a machine-readable format for compliance review, with the export recorded.
- Status: web done, desktop done, cli missing, api done
- Code: apps/web/features/workspace-console/components/WorkspaceDataControls.tsx:139; apps/web/app/api/settings/organization/legal-holds/[holdId]/export/route.ts:75; apps/web/lib/services/ediscovery-export-service.ts:52; apps/web/lib/server/service-principals/route-access.ts:35; apps/web/app/api/settings/organization/legal-holds/[holdId]/export/route.ts:69

## S87.37 Legal-hold administration where offered.
- Should: Where offered, an administrator places a legal hold on the workspace or named members, sees active and released holds, releases them after confirmation, and held data survives retention and deletion.
- Status: web done, desktop done, cli missing
- Code: apps/web/app/workspace/data/page.tsx:16; apps/web/features/workspace-console/components/WorkspaceDataControls.tsx:308; apps/web/features/workspace-console/components/WorkspaceDataControls.tsx:365; apps/web/features/workspace-console/components/WorkspaceDataControls.tsx:228; apps/web/app/api/settings/organization/legal-holds/route.ts:113

## S87.38 Managed rollout and update settings.
- Should: An administrator controls which client versions or release channels members get and when updates roll out.
- Status: web missing, desktop missing, cli missing

## S87.39 Policy diagnostics.
- Should: An administrator can see the effective policy for a member or request and why an action was allowed or refused.
- Status: web done, desktop done, cli missing
- Code: apps/web/features/workspace-console/components/WorkspaceFeatureControls.tsx:493; apps/web/features/workspace-console/components/WorkspacePolicyDiagnostics.tsx:228; apps/web/features/workspace-console/components/WorkspacePolicyDiagnostics.tsx:212; apps/web/app/api/settings/organization/policy/diagnose/route.ts:67; apps/web/lib/services/organization-policy-gate.ts:365

## S87.40 Administrative API access.
- Should: An administrator issues scoped, expiring API keys that let automations perform administrative tasks through a documented API, and can revoke them.
- Status: web done, desktop done, cli missing, api done
- Code: apps/web/app/workspace/audit/page.tsx:20; apps/web/features/workspace-console/components/WorkspaceApiKeys.tsx:205; apps/web/features/workspace-console/components/WorkspaceApiKeys.tsx:301; apps/web/app/api/settings/organization/admin-api-keys/route.ts:102; apps/web/lib/server/service-principals/route-access.ts:47; apps/web/lib/services/organization-member-admin-service.ts:244; apps/web/lib/services/organization-member-admin-service.ts:295; apps/web/lib/services/workspace-usage-report-service.ts:136

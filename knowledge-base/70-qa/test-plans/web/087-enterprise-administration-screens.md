---
id: "PLAN-web-087"
type: "test-plan"
title: "Web · 87. Enterprise administration screens"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "web"
area: "87"
---
# Web · 87. Enterprise administration screens

35 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/web/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S87.01 Organization overview.

- **Expected:** An administrator opens an organization overview that summarises the workspace (name, plan, members/seats, security posture) from live data.
- **Code:** done. Evidence present: apps/web/app/workspace/page.tsx:10; apps/web/features/workspace-console/components/WorkspaceConsoleNav.tsx:44; apps/web/features/workspace-console/components/WorkspacePostureOverview.tsx:227; apps/web/app/api/settings/organization/posture/route.ts:50; apps/web/features/settings/sections/TeamSection.tsx:811
- **Where to find it:** Settings > Workspace > Workspace administration > Overview (labels found in the code)
- **Needs:** an owner or admin account on a Team or Enterprise workspace
- **Steps:**
  1. Sign in as an owner or admin of a Team or Enterprise workspace.
  2. Open Settings, then the Workspace tab, then click Workspace administration.
  3. The page opens on Overview. Read the workspace name shown as the large heading.
  4. Read the line under it that gives the time of the live read and the count of items needing attention.
  5. Scroll the signal cards: Identity, Provisioning, Access (Members, Pending invitations, Seats), AI controls, Data, Residency and keys, Audit, Usage and spend.
  6. Compare with Expected: name, members/seats and security posture should match the live workspace.

## S87.02 Member directory.

- **Expected:** An administrator can list the workspace members with name, email and role.
- **Code:** done. Evidence present: apps/web/features/settings/sections/TeamSection.tsx:1222; apps/web/app/workspace/people/page.tsx:17; apps/web/app/api/settings/team/route.ts:68
- **Where to find it:** Settings > Workspace > Workspace administration > Members (labels found in the code)
- **Needs:** an owner or admin account on a Team or Enterprise workspace
- **Steps:**
  1. Sign in as an owner or admin.
  2. Open Settings > Workspace, then click Workspace administration.
  3. Click Members in the left menu.
  4. Find the card titled Members and read each row: the name, the email under it, and the role.
  5. Compare with Expected: every workspace member should appear with name, email and role.

## S87.03 Invitations.

- **Expected:** An administrator can invite people by email with a role, see pending invitations, renew and revoke them, and the invitee can accept.
- **Code:** done. Evidence present: apps/web/features/settings/sections/TeamSection.tsx:976; apps/web/features/settings/sections/TeamSection.tsx:1119; apps/web/app/api/settings/team/invitations/route.ts:92; apps/web/app/api/settings/team/invitations/[invitationId]/route.ts:130
- **Where to find it:** Settings > Workspace > Workspace administration > Members > Invite teammate (labels found in the code)
- **Needs:** an owner or admin account, and a second account with the invited email address
- **Steps:**
  1. Sign in as an owner or admin, open Members, and find the Invite teammate card.
  2. Type an email in Email address, pick a role in Role, then click Create invitation.
  3. Check that a private invitation link appears and the seat count goes down.
  4. Find Pending invitations. Click New link to renew one, or Revoke to cancel one, and confirm the dialog.
  5. Open the invitation link as the invitee (the Accept invitation button) and check the invitee joins with the chosen role.

## S87.04 Groups.

- **Expected:** An administrator can see workspace groups with their members, create or sync groups, and grant roles or permissions to a group.
- **Code:** done. Evidence present: apps/web/features/workspace-console/components/WorkspaceRoles.tsx:787; apps/web/features/workspace-console/components/WorkspaceRoles.tsx:687; apps/web/features/workspace-console/components/WorkspaceRoles.tsx:584; apps/web/lib/services/organization-role-service.ts:546; apps/web/lib/services/organization-role-service.ts:621; apps/web/lib/services/organization-policy-override-service.ts:76; apps/web/db/neon/0314_workspace_managed_groups.sql:141
- **Where to find it:** Settings > Workspace > Workspace administration > Roles > Groups (labels found in the code)
- **Needs:** an owner or admin account; a directory-synced group for the synced case
- **Steps:**
  1. Sign in as an owner or admin, then click Roles in Workspace administration.
  2. Scroll to the Groups card and read each group name and its member count.
  3. To create one, type a name in New group name and click Create group.
  4. Tick roles for a group and click Save group.
  5. Compare with Expected: groups show members, and roles on a group are saved. A synced group says it is managed by its source and is read-only for its name and members.

## S87.05 Roles.

- **Expected:** An administrator sees the workspace roles with their permissions and can change a member's role, enforced by the server.
- **Code:** done. Evidence moved: apps/web/features/workspace-console/components/WorkspaceRoles.tsx:239; apps/web/features/settings/sections/TeamSection.tsx:1651; apps/web/app/api/settings/team/[memberId]/route.ts:22; apps/web/app/api/settings/team/[memberId]/route.ts:236 (quoted code not found in the file now)
- **Where to find it:** Settings > Workspace > Workspace administration > Roles (labels found in the code)
- **Needs:** an owner or admin account and a second member account
- **Steps:**
  1. Sign in as an owner or admin, then click Roles.
  2. Read the Roles card: each role and its permissions.
  3. Read the Additional roles card to see which extra roles each member holds.
  4. Go to Members, open a member's role select, choose another role, then click Change role in the confirm dialog.
  5. Compare with Expected: the member's role changes. Then sign in as that member and check that the server now allows or refuses the matching actions.

## S87.06 Custom roles.

- **Expected:** An administrator can create, edit and delete a custom role from a permission set and assign it to members or groups, and the permissions take effect.
- **Code:** done. Evidence moved: apps/web/features/workspace-console/components/WorkspaceRoles.tsx:324; apps/web/features/workspace-console/components/WorkspaceRoles.tsx:41 (quoted code not found in the file now); apps/web/features/workspace-console/components/WorkspaceRoles.tsx:484; apps/web/app/api/settings/organization/roles/route.ts:86
- **Where to find it:** Settings > Workspace > Workspace administration > Roles > New role (labels found in the code)
- **Needs:** an owner or admin account and a second member account
- **Steps:**
  1. Sign in as an owner or admin, then click Roles.
  2. Click New role, type a name, tick permissions, then click Create role.
  3. Click Edit on the role to change it, or Delete and confirm Delete role to remove it.
  4. In Additional roles, tick the custom role for a member, then click Save roles.
  5. Compare with Expected: the role appears with its permissions. Sign in as the member and check the permission takes effect.

## S87.07 Seat assignment.

- **Expected:** An administrator sees licensed, used and available seats, members consume and release seats, and seats can be added.
- **Code:** done. Evidence present: apps/web/features/settings/sections/TeamSection.tsx:866; apps/web/features/settings/sections/TeamSection.tsx:945; apps/web/features/settings/sections/TeamSection.tsx:1044; apps/web/app/api/settings/team/invitations/route.ts:83
- **Where to find it:** Settings > Workspace > Workspace administration > Members > Seats & billing (labels found in the code)
- **Needs:** an owner or admin account on a paid Team or Enterprise workspace
- **Steps:**
  1. Sign in as an owner or admin, then click Members.
  2. In the Seats & billing card read Licensed, In use and Available.
  3. Invite a member or remove one and see whether In use goes up or down.
  4. Click Change seats (or Review contract for contract-priced workspaces) to see how seats are added.
  5. Compare with Expected: the three numbers match the seats and members, and seats change as members come and go.

## S87.08 Owner transfer.

- **Expected:** The owner can hand ownership to another member after confirmation, with the server moving the owner role atomically.
- **Code:** done. Evidence present: apps/web/features/settings/sections/TeamSection.tsx:1407; apps/web/features/settings/sections/TeamSection.tsx:1495; apps/web/app/api/settings/organization/transfer-ownership/route.ts:43
- **Where to find it:** Settings > Workspace > Workspace administration > Members > Workspace ownership (labels found in the code)
- **Needs:** the owner account and a second member account
- **Steps:**
  1. Sign in as the current owner and open Members.
  2. In the Workspace ownership card, choose a member in Member to receive ownership.
  3. Click Transfer ownership, then read the Transfer ownership? dialog and confirm.
  4. Read the Ownership transferred message that follows.
  5. Compare with Expected: the new owner holds the owner role and the old owner gets the chosen role. Check the change from the other account.

## S87.09 Domain verification.

- **Expected:** An administrator claims a company domain, publishes a DNS TXT challenge, and the product verifies ownership before routing sign-in for that domain.
- **Code:** done. Evidence moved: apps/web/features/workspace-console/components/WorkspaceIdentityPanels.tsx:71; apps/web/features/settings/sections/team/SSOPanel.tsx:410; apps/web/features/settings/sections/team/SSOPanel.tsx:474; apps/web/app/api/admin/sso/verify-domain/route.ts:120 (quoted code not found in the file now); apps/web/lib/server/sso/domain-verification.ts:104
- **Where to find it:** Workspace administration > Identity > Single sign-on (SAML / OIDC) > Email domain (labels found in the code)
- **Needs:** an owner or admin account, a company domain they control, and access to its DNS
- **Steps:**
  1. Sign in as an owner or admin, open Identity in Workspace administration.
  2. In Single sign-on (SAML / OIDC), type a company domain in Email domain and click Add connection.
  3. Copy the TXT record shown (Record type, Record name, Record value) and publish it in the domain's DNS.
  4. Click Verify domain.
  5. Compare with Expected: the status changes from Domain not verified to Domain verified, and only then is sign-in routed for that domain.

## S87.10 SSO setup.

- **Expected:** A workspace owner configures a SAML or OIDC connection for a verified domain, and members on that domain sign in through the identity provider.
- **Code:** done. Evidence present: apps/web/app/workspace/identity/page.tsx:17; apps/web/features/settings/sections/team/SSOPanel.tsx:285; apps/web/app/api/admin/sso/route.ts:216; apps/web/features/workspace-console/components/WorkspaceIdentityPanels.tsx:92
- **Where to find it:** Workspace administration > Identity > Single sign-on (SAML / OIDC) > Add connection (labels found in the code)
- **Needs:** an owner account, a verified domain, and a test SAML or OIDC identity provider
- **Steps:**
  1. Sign in as the workspace owner, open Identity, and find Single sign-on (SAML / OIDC).
  2. After the domain is verified, choose a Protocol: SAML 2.0 or OIDC.
  3. Fill the provider fields (IdP metadata URL for SAML; OIDC discovery URL, client ID and client secret for OIDC), then click Add connection.
  4. Check the connection appears with its provider type and domain.
  5. Sign in as a member on that domain through the identity provider and check it works.

## S87.11 Directory provisioning.

- **Expected:** An administrator connects an identity provider over SCIM (connection and bearer token), and the provider creates, updates and deprovisions members.
- **Code:** done. Evidence present: apps/web/features/workspace-console/components/WorkspaceIdentityPanels.tsx:72; apps/web/features/admin/pages/DirectorySyncAdminPage.tsx:348; apps/web/features/admin/pages/DirectorySyncAdminPage.tsx:270; apps/web/app/api/admin/directory-sync/tokens/route.ts:70
- **Where to find it:** Workspace administration > Identity > Directory sync (SCIM 2.0) (labels found in the code)
- **Needs:** an owner or admin account and a test identity provider that supports SCIM 2.0
- **Steps:**
  1. Sign in as an owner or admin, open Identity, and find Directory sync (SCIM 2.0).
  2. Under Connections, fill the form and click Add connection.
  3. Under SCIM tokens, choose a Connection, type a Token name and click Mint token. Copy the token shown.
  4. Set up the identity provider with the token; create, change and remove a test user there.
  5. Compare with Expected: the member is created, updated and removed (deprovisioned) in the workspace, and Recent IdP activity lists the events.

## S87.12 Service accounts.

- **Expected:** An administrator creates non-human service accounts with bounded permissions and keys that outlive their creator, and can disable them or revoke their keys.
- **Code:** done. Evidence present: apps/web/features/workspace-console/components/WorkspaceIdentityPanels.tsx:73; apps/web/features/workspace-console/components/WorkspaceServicePrincipals.tsx:173; apps/web/features/workspace-console/components/WorkspaceApiKeys.tsx:207; apps/web/app/api/settings/organization/admin-api-keys/route.ts:226; apps/web/lib/server/admin-api-keys.ts:216
- **Where to find it:** Workspace administration > Identity > Service principals (disable); Workspace administration > Audit > Workspace API keys (keys) (labels found in the code)
- **Needs:** an owner or admin account; an automation or test client that uses a key
- **Steps:**
  1. Open Identity and find the Service principals card; read each name, its permissions and its created date.
  2. Click Disable on a principal, then confirm Disable principal. Check that the button now says Enable.
  3. Open Audit, find Workspace API keys, and click Create key with scopes and an expiry (the No expiry option is there).
  4. Click Revoke on a key and confirm Revoke key.
  5. Compare with Expected: a disabled principal and a revoked key stop working for automations, and keys keep working after their creator leaves.

## S87.13 Model-access policy.

- **Expected:** An administrator allows or blocks providers and models for the workspace, and requests for a blocked model are refused.
- **Code:** done. Evidence moved: apps/web/app/workspace/models/page.tsx:17; apps/web/features/workspace-console/components/WorkspaceModelPolicy.tsx:179 (quoted code not found in the file now); apps/web/features/workspace-console/components/WorkspaceModelPolicy.tsx:401; apps/web/app/api/settings/organization/model-policy/route.ts:215; apps/web/lib/managed-compute-gate.ts:417
- **Where to find it:** Workspace administration > Models (labels found in the code)
- **Needs:** an owner or admin account and a member account
- **Steps:**
  1. Sign in as an owner or admin, then click Models.
  2. In Providers, click Block on a provider (or Approve on one to allow it).
  3. In Models, use Filter models, click Approve or Block on a model, then click Save model policy.
  4. Sign in as a member, open chat, and try to pick the blocked model.
  5. Compare with Expected: the blocked model is refused; the page says Auto never reaches a blocked model.

## S87.14 Feature-access policy.

- **Expected:** An administrator switches product features on or off for the workspace (with exceptions) and each switched-off feature is refused wherever it runs.
- **Code:** done. Evidence moved: apps/cli/src/cloud/workspace_policy.rs:14; apps/cli/src/cloud/workspace_policy.rs:752; apps/cli/src/features/hooks/hooks.rs:1408; apps/cli/src/agent/mod.rs:711; apps/cli/src/agent/chat.rs:1160; apps/desktop/electron/runtime/developerSessionService.ts:725 (quoted code not found in the file now)
- **Where to find it:** Workspace administration > Policy > Allow (feature) switches > Save features and defaults (labels found in the code)
- **Needs:** an owner or admin account and a member account
- **Steps:**
  1. Sign in as an owner or admin, then click Policy.
  2. Find the Allow switches (for example Allow Skills or Allow Plugins) and turn one off.
  3. Click Save features and defaults.
  4. Under Exceptions, add an exception for a person or group and click Save exception if needed.
  5. Compare with Expected: the switched-off feature is refused for members in the product (for example in chat or the desktop app).

## S87.15 Tool policy.

- **Expected:** An administrator decides which individual tools members and agents may use (allow, block or require approval) and the tool loop enforces it.
- **Code:** done. Evidence present: apps/web/app/api/llm/v1/chat/completions/lib/connector-tool-permissions.ts:503; apps/web/app/api/llm/v1/chat/completions/lib/connector-tool-permissions.ts:705; apps/web/app/api/llm/v1/chat/completions/route.ts:852; apps/web/app/api/settings/organization/connector-policy/route.ts:140; apps/web/features/workspace-console/components/WorkspaceConnectorPolicy.tsx:451
- **Where to find it:** Workspace administration > Connectors > Catalog connectors (labels found in the code)
- **Needs:** an owner or admin account, a member account, and a connected connector
- **Steps:**
  1. Sign in as an owner or admin, then click Connectors.
  2. Under Catalog connectors, open a connector and set Read-only tools and Write tools to Always allow, Needs approval or Blocked.
  3. Click Save policy.
  4. Sign in as a member and use that connector's read and write tools in chat.
  5. Compare with Expected: an allowed tool runs, a tool set to Needs approval asks first, and a blocked tool is refused.

## S87.16 Connector policy.

- **Expected:** An administrator allows or blocks connectors (and custom connectors) for the workspace, and blocked connectors are not offered or connectable.
- **Code:** done. Evidence moved: apps/web/app/workspace/connectors/page.tsx:17; apps/web/features/workspace-console/components/WorkspaceConnectorPolicy.tsx:797; apps/web/app/api/settings/organization/connector-policy/route.ts:164; apps/web/lib/user-connector-tools.ts:1790 (quoted code not found in the file now)
- **Where to find it:** Workspace administration > Connectors > Catalog connectors > Block (labels found in the code)
- **Needs:** an owner or admin account and a member account
- **Steps:**
  1. Sign in as an owner or admin, then click Connectors.
  2. Under Catalog connectors, click Block on a connector, then click Save policy.
  3. Sign in as a member and look for that connector in the connectors list.
  4. Try to connect it.
  5. Compare with Expected: the blocked connector is not offered and cannot be connected. Repeat for Custom connectors (Allow custom connectors switch).

## S87.17 Skill and Plugin policy.

- **Expected:** An administrator controls which skills and plugins members may install or use, per item, and the product enforces it.
- **Code:** done. Evidence moved: apps/web/features/workspace-console/components/WorkspaceConnectorPolicy.tsx:155 (quoted code not found in the file now); apps/web/features/workspace-console/components/WorkspaceFeatureControls.tsx:62; apps/web/lib/services/connector-policy-gate.ts:216; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:5440
- **Where to find it:** Workspace administration > Connectors > Plugins > Approve (labels found in the code)
- **Needs:** an owner or admin account and a member account
- **Steps:**
  1. Sign in as an owner or admin, then click Connectors.
  2. In the Plugins card, type a plugin name and click Approve (or Block), then click Save policy.
  3. Optionally, on Policy, turn the Skills or Plugins switch off and click Save features and defaults.
  4. Sign in as a member and look at the plugins and skills they can install or use.
  5. Compare with Expected: an approved plugin can be used, a blocked one cannot, and a switched-off feature is refused.

## S87.18 Private marketplace.

- **Expected:** A workspace curates its own private catalogue of plugins, skills or servers that members browse and install, separate from the public directory.
- **Code:** done. Evidence present: apps/web/app/api/settings/organization/plugins/route.ts:62; apps/web/features/workspace-console/components/WorkspaceConsoleNav.tsx:107; apps/web/app/workspace/plugins/page.tsx:16; apps/web/features/plugins/server/directory/installed-skills.ts:115
- **Where to find it:** Workspace administration > Plugins > Publish a plugin or a skill (labels found in the code)
- **Needs:** an owner or admin account, a member account, and a plugin or skill .zip file
- **Steps:**
  1. Sign in as an owner or admin, then click Plugins.
  2. In Publish a plugin or a skill, click Upload a plugin or skill and choose a plugin .zip (or a skill .zip with SKILL.md).
  3. Wait for the scan to finish; accept any findings if asked, then check the plugin is listed in Workspace plugins.
  4. Sign in as a member and look for the plugin under Plugins.
  5. Compare with Expected: the member can browse and install the workspace's own plugin; Retire for everyone removes it.

## S87.19 Shared Project administration.

- **Expected:** An administrator sees every project shared with the workspace, sets per-member access, and can stop sharing a project.
- **Code:** done. Evidence present: apps/web/app/workspace/sharing/page.tsx:17; apps/web/features/settings/sections/OrganizationSharingSection.tsx:195; apps/web/features/settings/sections/OrganizationSharingSection.tsx:306; apps/web/app/api/settings/organization/shared/projects/[projectId]/route.ts:200
- **Where to find it:** Workspace administration > Sharing > Shared projects (labels found in the code)
- **Needs:** an owner or admin account, a shared project, and a member account
- **Steps:**
  1. Sign in as an owner or admin, then click Sharing.
  2. Under Shared projects, read each shared project and who has access.
  3. Open the project's sharing controls to see each member's access: Can view, Can edit or No access.
  4. Click Stop sharing on a project and confirm it.
  5. Compare with Expected: the project leaves Shared projects, and the members lose access to it.

## S87.20 External-sharing controls.

- **Expected:** An administrator turns sharing outside the workspace on or off, and members cannot create new external share links while it is off.
- **Code:** done. Evidence moved: apps/web/app/workspace/policy/page.tsx:19; apps/web/features/settings/sections/WorkspacePolicySection.tsx:457; apps/web/lib/managed-compute-gate.ts:478; apps/web/app/api/share/route.ts:141 (quoted code not found in the file now)
- **Where to find it:** Workspace administration > Policy > Public sharing (labels found in the code)
- **Needs:** an owner or admin account and a member account
- **Steps:**
  1. Sign in as an owner or admin, then click Policy.
  2. In the Public sharing card, turn Allow public sharing off, then click Save policy.
  3. Sign in as a member and try to create a new public share link for a chat.
  4. Compare with Expected: the share is refused and no new external link is created while the switch is off.

## S87.21 Public-publishing controls.

- **Expected:** An administrator controls whether members may publish chats or artifacts publicly, and publishing is refused when it is off.
- **Code:** done. Evidence moved: apps/web/features/settings/sections/WorkspacePolicySection.tsx:460; apps/web/app/api/artifacts/publish/route.ts:202 (quoted code not found in the file now); apps/web/lib/services/organization-policy-evaluator.ts:382
- **Where to find it:** Workspace administration > Policy > Public sharing (labels found in the code)
- **Needs:** an owner or admin account and a member account with a chat or artifact
- **Steps:**
  1. Sign in as an owner or admin, then click Policy.
  2. In the Public sharing card, turn Allow public sharing off, then click Save policy.
  3. Sign in as a member and try to publish a chat or an artifact publicly.
  4. Compare with Expected: publishing is refused while the switch is off.

## S87.22 Memory policy.

- **Expected:** An administrator allows or disallows account memory for the workspace, and members get no memory while it is off.
- **Code:** done. Evidence present: apps/web/features/settings/sections/WorkspacePolicySection.tsx:474; apps/web/lib/services/managed-memory-context-service.ts:134; apps/web/lib/services/managed-memory-context-service.ts:610
- **Where to find it:** Workspace administration > Policy > Memory (labels found in the code)
- **Needs:** an owner or admin account and a member account
- **Steps:**
  1. Sign in as an owner or admin, then click Policy.
  2. In the Memory card, turn Allow memory off, then click Save policy.
  3. Sign in as a member and open Settings > Memory.
  4. Compare with Expected: the member sees memory turned off and no memory is used in chats.

## S87.23 Data-retention settings.

- **Expected:** An administrator sets how long workspace conversations are kept and, when enforced, a scheduled sweep deletes older ones (withholding legal holds).
- **Code:** done. Evidence present: apps/web/features/settings/sections/WorkspacePolicySection.tsx:521; apps/web/features/settings/sections/WorkspacePolicySection.tsx:547; apps/web/app/api/cron/enforce-workspace-retention/route.ts:65; vercel.json:138
- **Where to find it:** Workspace administration > Policy > Retention window (labels found in the code)
- **Needs:** an owner or admin account and test conversations older than the window
- **Steps:**
  1. Sign in as an owner or admin, then click Policy.
  2. In Retention window, set the days in Retention window in days.
  3. Turn on Enforce the retention window (in the Enforce retention card) and confirm if asked.
  4. Read the card text: chats idle for that many days are deleted each night, except under legal hold.
  5. Check the Data page sweeps table (Retention by data type) after a run.
  6. Compare with Expected: the setting is saved and the nightly sweep follows it. Deletion is permanent, so use only test data.

## S87.24 Data-residency settings.

- **Expected:** An administrator chooses or requests the region where workspace data is stored and processed, and the product keeps data there.
- **Code:** partial. Evidence present: apps/web/app/workspace/data/page.tsx:24; apps/web/features/workspace-console/components/WorkspaceDataRegion.tsx:191; apps/web/app/api/settings/organization/data-region/route.ts:117; apps/web/app/api/settings/organization/data-region/route.ts:148; apps/web/app/api/admin/data-region/route.ts:53
- **Known to be unfinished:** owner: stand up the EU database, bucket, log sink and KMS, then set the AGI_DATA_REGION_EU_* variables (apps/web/lib/server/data-region.ts)
- **Owner decision is open on this item.**
- **Where to find it:** Workspace administration > Data > Data region (labels found in the code)
- **Needs:** an Enterprise workspace (choosing a region needs an active Enterprise plan) and an owner or admin account
- **Steps:**
  1. Sign in as an owner or admin, then click Data.
  2. In Data region, read the line Stored in <region>.
  3. Choose a region in Move to, then click Request move and confirm.
  4. Check the line that says a move was requested and that data stays in the current region until the move completes.
  5. Compare with Expected: the request is recorded; a Cancel the move button is shown while it is pending.

## S87.25 Customer-managed-key setup where offered.

- **Expected:** Where offered, an administrator connects a customer-managed encryption key, rotates or revokes it from the console, and workspace data is sealed under it.
- **Code:** done. Evidence present: apps/web/app/workspace/data/page.tsx:23; apps/web/features/workspace-console/components/WorkspaceEncryptionKey.tsx:403; apps/web/features/workspace-console/components/WorkspaceEncryptionKey.tsx:261; apps/web/features/workspace-console/components/WorkspaceEncryptionKey.tsx:341; apps/web/features/workspace-console/components/WorkspaceEncryptionKey.tsx:199; apps/web/features/workspace-console/hooks/use-encryption-key.ts:155
- **Where to find it:** Workspace administration > Data > Encryption key (labels found in the code)
- **Needs:** an owner or admin account and a customer-managed key in AWS KMS, Google Cloud KMS or Azure Key Vault
- **Steps:**
  1. Sign in as an owner or admin, then click Data.
  2. In Encryption key, choose a provider (AWS KMS, Google Cloud KMS or Azure Key Vault), paste the key identifier and click Connect key.
  3. Click Rotate and confirm Rotate key, then check Last rotated changes.
  4. Click Revoke, enter a reason, then confirm Revoke key.
  5. Compare with Expected: rotation and revocation are recorded and the status text changes; a refused state shows the server message instead of the controls.

## S87.26 Network/IP restrictions.

- **Expected:** An administrator restricts workspace access to listed IP ranges, and requests from other networks are refused.
- **Code:** done. Evidence moved: apps/web/features/settings/sections/WorkspacePolicySection.tsx:677; apps/web/features/settings/sections/WorkspacePolicySection.tsx:681 (quoted code not found in the file now); apps/web/lib/ip-allow-list-gate.ts:56; apps/web/lib/api-auth.ts:476
- **Where to find it:** Settings > Workspace > Workspace administration > Controls > Policy, then the row IP allow list (labels found in the code)
- **Needs:** an owner or admin account (the console is limited to owners and admins); a second network to test a refused sign-in
- **Steps:**
  1. Sign in as an owner or admin. Open Settings, then the Workspace pane, then click Workspace administration.
  2. Under Controls, click Policy.
  3. Scroll to the row IP allow list. Click the field Add an IP address or CIDR block, type a test range you can reach (for example 203.0.113.0/24) and press Enter. A range that leaves out your own address can lock you out.
  4. Look at the text under IP allow list: it should say Members may only sign in to this workspace from one of these addresses or blocks.
  5. Compare with Expected. A sign-in from an address outside the list should be refused, which needs a second network to check.

## S87.28 Audit-log viewer.

- **Expected:** An administrator browses the workspace audit trail with filters (action, outcome, severity, time range) from live data.
- **Code:** done. Evidence present: apps/web/app/workspace/audit/page.tsx:21; apps/web/features/settings/sections/WorkspaceAuditSection.tsx:167; apps/web/app/api/settings/organization/audit/route.ts:53
- **Where to find it:** Settings > Workspace > Workspace administration > Records > Audit, then the card Audit trail (labels found in the code)
- **Needs:** an owner or admin account; some audit events already in the workspace
- **Steps:**
  1. Open Records > Audit. Find the card titled Audit trail.
  2. Open the All actions list and pick one action.
  3. Open the Outcome and severity filters and pick a value in each.
  4. Look at the table columns When, Actor, Action, Resource, Surface and Outcome. Only matching rows should stay and the count line should change.
  5. Compare with Expected: filters should work on live data.

## S87.29 Audit export.

- **Expected:** An administrator exports the audit trail for a range (and can stream it to a SIEM), with the export itself recorded.
- **Code:** done. Evidence present: apps/web/features/settings/sections/WorkspaceAuditSection.tsx:153; apps/web/features/settings/sections/WorkspacePolicySection.tsx:508; apps/web/app/api/settings/organization/audit/export/route.ts:69; apps/web/app/workspace/audit/page.tsx:22; vercel.json:146; apps/web/lib/services/audit-streaming-service.ts:40; apps/web/lib/services/__tests__/audit-streaming-service.test.ts:398; apps/web/app/api/cron/drain-audit-streams/route.test.ts:56
- **Where to find it:** Settings > Workspace > Workspace administration > Records > Audit, button Export JSONL (switch: Controls > Policy, row Audit export) (labels found in the code)
- **Needs:** an owner or admin account; a browser that saves downloads
- **Steps:**
  1. Open Controls > Policy and find the row Audit export. Check that the switch Allow audit export is on.
  2. Open Records > Audit. Set filters if you want a smaller export.
  3. Click Export JSONL. The browser downloads a file.
  4. Open the file. Each line should be one audit event.
  5. Compare with Expected: the export should be recorded. Check the Audit trail for a new event. The SIEM streaming card on the same page needs an HTTPS endpoint to test.

## S87.30 Usage analytics.

- **Expected:** An administrator sees workspace usage and spend broken down by member, model, product area and provider over a period, and can export it.
- **Code:** done. Evidence moved: apps/web/app/workspace/usage/page.tsx:17; apps/web/features/workspace-console/components/WorkspaceUsageAnalytics.tsx:349; apps/web/features/workspace-console/components/WorkspaceUsageAnalytics.tsx:276; apps/web/app/api/settings/organization/usage-analytics/route.ts:39 (quoted code not found in the file now); apps/web/lib/services/organization-usage-service.ts:119
- **Where to find it:** Settings > Workspace > Workspace administration > Records > Usage (labels found in the code)
- **Needs:** an owner or admin account; some Cloud usage in the chosen period
- **Steps:**
  1. Open Records > Usage. Click 7 days, 30 days or 90 days at the top to change the period.
  2. Read the card Managed cloud usage: Credits used, Active members, Turns, Tokens in and Tokens out.
  3. Scroll to the tables By member, By product area, By model and By provider. Check that each lists rows.
  4. Click Export daily CSV and open the downloaded file.
  5. Compare with Expected. The page says only settled Cloud usage is counted; Local and BYOK activity is not included.

## S87.33 Organization budget.

- **Expected:** An administrator sets a monthly workspace budget with an alert threshold, sees spend against it, and managed usage is refused once it is exhausted (when enforced).
- **Code:** done. Evidence moved: apps/web/features/workspace-console/components/WorkspaceUsageAnalytics.tsx:377; apps/web/features/workspace-console/components/WorkspaceSpendLimit.tsx:62 (quoted code not found in the file now); apps/web/features/workspace-console/components/WorkspaceSpendLimit.tsx:190; apps/web/app/api/settings/organization/spend-limit/route.ts:81 (quoted code not found in the file now); apps/web/lib/services/managed-compute-access.ts:112 (quoted code not found in the file now)
- **Where to find it:** Settings > Workspace > Workspace administration > Records > Usage, then scroll to the card Monthly spend limit (labels found in the code)
- **Needs:** an owner or admin account; managed usage near the cap to see a refusal
- **Steps:**
  1. Open Records > Usage and scroll to the bottom card Monthly spend limit.
  2. Type a monthly amount in credits in the cap field and set the percent next to Alert at.
  3. Pick a value in Spend limit enforcement (Off, Notify or Block) and read the line under it.
  4. Click Set limit (or Update limit if a limit exists).
  5. Compare with Expected: the limit should show against spend. With Block, a managed turn past the cap should be refused, which needs spend close to the cap to test.

## S87.34 Billing administration.

- **Expected:** An administrator manages the workspace plan, seats, payment method, invoices and (for enterprise) contract terms from the console.
- **Code:** done. Evidence moved: apps/web/app/workspace/billing/page.tsx:17; apps/web/features/workspace-console/components/WorkspaceBillingSummary.tsx:139; apps/web/features/workspace-console/components/WorkspaceBillingSummary.tsx:156 (quoted code not found in the file now); apps/web/app/api/settings/organization/billing-contract/route.ts:122; apps/web/lib/services/enterprise-contracts/agreement-store.ts:30
- **Where to find it:** Settings > Workspace > Workspace administration > Records > Billing (labels found in the code)
- **Needs:** an owner or admin account; a contract-priced plan to see the contract panel
- **Steps:**
  1. Open Records > Billing.
  2. Read the card Plan and seats: the plan, the Seats used count and the seat note.
  3. Read the card Manage billing. It says payment, invoices and plan changes are in billing settings. Click Billing settings to go there.
  4. Compare with Expected. The page shows plan and seats, and a contract panel for contract-priced plans; payment, invoices and plan changes are not made on this page.

## S87.36 Compliance export.

- **Expected:** An administrator exports workspace content (conversations, messages, files, artifacts) in a machine-readable format for compliance review, with the export recorded.
- **Code:** done. Evidence present: apps/web/features/workspace-console/components/WorkspaceDataControls.tsx:153; apps/web/app/api/settings/organization/legal-holds/[holdId]/export/route.ts:111; apps/web/lib/services/ediscovery-export-service.ts:58
- **Where to find it:** Settings > Workspace > Workspace administration > Records > Data, then the card Legal holds, then Export records on a hold row (labels found in the code)
- **Needs:** an owner or admin account; an existing legal hold
- **Steps:**
  1. Open Records > Data and find the card Legal holds.
  2. Pick a hold in the list. If none exists, create one first with Place a hold (see S87.37).
  3. Click Export records on that hold. The browser downloads the records held for it.
  4. Open the file and check it holds conversations, messages, files or artifacts in a machine-readable format.
  5. Compare with Expected. Export is offered per legal hold only; a whole-workspace export was not found.

## S87.37 Legal-hold administration where offered.

- **Expected:** Where offered, an administrator places a legal hold on the workspace or named members, sees active and released holds, releases them after confirmation, and held data survives retention and deletion.
- **Code:** done. Evidence present: apps/web/app/workspace/data/page.tsx:22; apps/web/features/workspace-console/components/WorkspaceDataControls.tsx:326; apps/web/features/workspace-console/components/WorkspaceDataControls.tsx:383; apps/web/features/workspace-console/components/WorkspaceDataControls.tsx:248; apps/web/app/api/settings/organization/legal-holds/route.ts:138
- **Where to find it:** Settings > Workspace > Workspace administration > Records > Data, then the card Legal holds (labels found in the code)
- **Needs:** an owner or admin account (placing and releasing is limited to owners and admins); a member account for the member scope
- **Steps:**
  1. Open Records > Data and find the card Legal holds.
  2. Click Place a hold. Pick a scope in Legal hold scope (whole workspace or one member), type a name and reason, then click Place hold.
  3. Check that the new row shows Placed with a date and either Whole workspace or Member.
  4. Click Release hold, read the confirmation, then choose Keep hold to cancel or Release hold to confirm.
  5. Compare with Expected: a released hold shows Released. Look at the Retention sweeps card to check that held records were not deleted while the hold was active.

## S87.39 Policy diagnostics.

- **Expected:** An administrator can see the effective policy for a member or request and why an action was allowed or refused.
- **Code:** done. Evidence present: apps/web/features/workspace-console/components/WorkspaceFeatureControls.tsx:564; apps/web/features/workspace-console/components/WorkspacePolicyDiagnostics.tsx:233; apps/web/features/workspace-console/components/WorkspacePolicyDiagnostics.tsx:217; apps/web/app/api/settings/organization/policy/diagnose/route.ts:67; apps/web/lib/services/organization-policy-gate.ts:382
- **Where to find it:** Settings > Workspace > Workspace administration > Controls > Policy, then scroll to Explain a member&rsquo;s policy (labels found in the code)
- **Needs:** an owner or admin account; a member with at least one restriction to see a refusal
- **Steps:**
  1. Open Controls > Policy and scroll past the policy sections to Explain a member&rsquo;s policy.
  2. Pick a member.
  3. Pick a request in the request list, or keep No request, show the policy only. For a country check, type a two-letter code such as US in the country field.
  4. Click Explain.
  5. Compare with Expected. The result starts with Allowed. or Refused. and lists the allowed countries and surfaces, with the reason when refused.

## S87.40 Administrative API access.

- **Expected:** An administrator issues scoped, expiring API keys that let automations perform administrative tasks through a documented API, and can revoke them.
- **Code:** done. Evidence present: apps/web/app/workspace/audit/page.tsx:23; apps/web/features/workspace-console/components/WorkspaceApiKeys.tsx:207; apps/web/features/workspace-console/components/WorkspaceApiKeys.tsx:323; apps/web/app/api/settings/organization/admin-api-keys/route.ts:106
- **Where to find it:** Settings > Workspace > Workspace administration > Records > Audit, then the card Workspace API keys (labels found in the code)
- **Needs:** an owner or admin account; an integration to try the key (optional)
- **Steps:**
  1. Open Records > Audit and scroll to Workspace API keys.
  2. Type a name in the key name field, pick an expiry (30 days, 90 days, 1 year or No expiry), and tick at least one scope.
  3. Click Create key. Copy the key shown under Copy the key now.
  4. Find the key in the list. It shows its scopes, Last used and Expires.
  5. Click Revoke, read the confirmation, and confirm. Compare with Expected: the key should show scopes and an expiry, and after Revoke it should show Revoked.

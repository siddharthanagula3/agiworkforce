---
id: "PLAN-desktop-087"
type: "test-plan"
title: "Desktop · 87. Enterprise administration screens"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "desktop"
area: "87"
---
# Desktop · 87. Enterprise administration screens

35 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/desktop/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S87.01 Organization overview.

- **Expected:** An administrator opens an organization overview that summarises the workspace (name, plan, members/seats, security posture) from live data.
- **Code:** done. Evidence present: apps/web/app/workspace/page.tsx:10; apps/web/features/workspace-console/components/WorkspaceConsoleNav.tsx:44; apps/web/features/workspace-console/components/WorkspacePostureOverview.tsx:227; apps/web/app/api/settings/organization/posture/route.ts:50; apps/web/features/settings/sections/TeamSection.tsx:811
- **Where to find it:** Account menu > Settings > Workspace > Workspace administration > Overview (labels found in the code)
- **Needs:** an owner or admin account in a workspace
- **Steps:**
  1. Click your account menu and choose Settings.
  2. Click Workspace, then click Workspace administration.
  3. In the left column under Workspace, click Overview.
  4. Read the workspace name at the top and the groups Identity, Provisioning, Access, AI controls, Data, Residency and keys, Audit.
  5. Compare with Expected: name and security posture are shown here; check whether plan and seat counts are shown on this page (they are on Members, under Workspace details).

## S87.02 Member directory.

- **Expected:** An administrator can list the workspace members with name, email and role.
- **Code:** done. Evidence present: apps/web/features/settings/sections/TeamSection.tsx:1222; apps/web/app/workspace/people/page.tsx:17; apps/web/app/api/settings/team/route.ts:68
- **Where to find it:** Account menu > Settings > Workspace > Workspace administration > Members (labels found in the code)
- **Needs:** an owner or admin account
- **Steps:**
  1. Click your account menu and choose Settings.
  2. Click Workspace, then click Workspace administration.
  3. In the left column click Members.
  4. Find the Members card and read each row.
  5. Compare with Expected: each row shows a name, an email and a role line such as Member role or Admin role.

## S87.03 Invitations.

- **Expected:** An administrator can invite people by email with a role, see pending invitations, renew and revoke them, and the invitee can accept.
- **Code:** done. Evidence present: apps/web/features/settings/sections/TeamSection.tsx:976; apps/web/features/settings/sections/TeamSection.tsx:1119; apps/web/app/api/settings/team/invitations/route.ts:92; apps/web/app/api/settings/team/invitations/[invitationId]/route.ts:130
- **Where to find it:** Account menu > Settings > Workspace > Workspace administration > Members > Invite teammate (labels found in the code)
- **Needs:** an owner or admin account, and a second account that uses the invited email address
- **Steps:**
  1. In Members, find the Invite teammate card and type an address in Invitee email.
  2. Pick Member role, Viewer role or Admin role in Invitation role, then click Create invitation.
  3. Copy the private link with Copy link and open it in another browser that is signed in with the invited email.
  4. Open the invited link, read Join the workspace, and click Accept invitation.
  5. Back in Members, check Pending invitations: New link renews an invitation and Revoke removes it.
  6. Compare with Expected: the invitee can join, and the pending list shows the invitation with its expiry.

## S87.04 Groups.

- **Expected:** An administrator can see workspace groups with their members, create or sync groups, and grant roles or permissions to a group.
- **Code:** done. Evidence present: apps/web/features/workspace-console/components/WorkspaceRoles.tsx:787; apps/web/features/workspace-console/components/WorkspaceRoles.tsx:687; apps/web/features/workspace-console/components/WorkspaceRoles.tsx:584; apps/web/lib/services/organization-role-service.ts:546; apps/web/lib/services/organization-role-service.ts:621; apps/web/lib/services/organization-policy-override-service.ts:76; apps/web/db/neon/0314_workspace_managed_groups.sql:141
- **Where to find it:** Account menu > Settings > Workspace > Workspace administration > Roles > Groups (labels found in the code)
- **Needs:** an owner or admin account
- **Steps:**
  1. Click Roles in the Workspace administration left column.
  2. Scroll to the Groups card and read each group row with its member count.
  3. To add a group, type a name in New group name and click Create group.
  4. Open a group, tick roles in its role list and click Save group.
  5. Compare with Expected: groups show members, can be created, and roles can be granted to a group.

## S87.05 Roles.

- **Expected:** An administrator sees the workspace roles with their permissions and can change a member's role, enforced by the server.
- **Code:** done. Evidence moved: apps/web/features/workspace-console/components/WorkspaceRoles.tsx:239; apps/web/features/settings/sections/TeamSection.tsx:1651; apps/web/app/api/settings/team/[memberId]/route.ts:22; apps/web/app/api/settings/team/[memberId]/route.ts:236 (quoted code not found in the file now)
- **Where to find it:** Account menu > Settings > Workspace > Workspace administration > Roles, then Members > Role for <member name> (labels found in the code)
- **Needs:** an owner or admin account, and a member account to change
- **Steps:**
  1. Click Roles in the Workspace administration left column.
  2. Read the Roles card and click Edit on a role to see its permission boxes.
  3. Click Members in the left column.
  4. Open the Role for <member name> drop-down on a member row and choose another role.
  5. Confirm in the dialog and check the row shows the new role line.

## S87.06 Custom roles.

- **Expected:** An administrator can create, edit and delete a custom role from a permission set and assign it to members or groups, and the permissions take effect.
- **Code:** done. Evidence moved: apps/web/features/workspace-console/components/WorkspaceRoles.tsx:324; apps/web/features/workspace-console/components/WorkspaceRoles.tsx:41 (quoted code not found in the file now); apps/web/features/workspace-console/components/WorkspaceRoles.tsx:484; apps/web/app/api/settings/organization/roles/route.ts:86
- **Where to find it:** Account menu > Settings > Workspace > Workspace administration > Roles > New role (labels found in the code)
- **Needs:** an owner or admin account
- **Steps:**
  1. On Roles, click New role.
  2. Type a Role name and an optional Description.
  3. Tick permissions under Permissions. You can only grant what your own role holds, then click Create role.
  4. To give the role to a member, go to Members, find Additional roles, tick the role and click Save roles.
  5. To give it to a group, open the group under Groups, tick the role and click Save group.
  6. Compare with Expected: the role's permissions apply to the member or group. Edit and Delete are on each role row.

## S87.07 Seat assignment.

- **Expected:** An administrator sees licensed, used and available seats, members consume and release seats, and seats can be added.
- **Code:** done. Evidence present: apps/web/features/settings/sections/TeamSection.tsx:866; apps/web/features/settings/sections/TeamSection.tsx:945; apps/web/features/settings/sections/TeamSection.tsx:1044; apps/web/app/api/settings/team/invitations/route.ts:83
- **Where to find it:** Account menu > Settings > Workspace > Workspace administration > Members > Seats & billing (labels found in the code)
- **Needs:** an owner or admin account in a paid workspace with seats
- **Steps:**
  1. Click Members in the Workspace administration left column.
  2. Find the Seats & billing card and read the Licensed, In use and Available figures.
  3. In a member row, open the drop-down Seat type for <member name> and choose Standard seat or Premium seat.
  4. Click Change seats to add seats (it opens the pricing page) or Manage billing.
  5. Compare with Expected: the three seat figures change when a seat is taken or released, and seats can be added through Change seats.

## S87.08 Owner transfer.

- **Expected:** The owner can hand ownership to another member after confirmation, with the server moving the owner role atomically.
- **Code:** done. Evidence present: apps/web/features/settings/sections/TeamSection.tsx:1407; apps/web/features/settings/sections/TeamSection.tsx:1495; apps/web/app/api/settings/organization/transfer-ownership/route.ts:43
- **Where to find it:** Account menu > Settings > Workspace > Workspace administration > Members > Workspace ownership (labels found in the code)
- **Needs:** an owner account and a second member account in the same workspace
- **Steps:**
  1. Sign in as the workspace owner and go to Members.
  2. Scroll to the Workspace ownership card (only the owner sees it).
  3. Choose a name in Member to receive ownership and a role in Your role after the transfer.
  4. Click Transfer ownership, then click the confirm button in the Transfer ownership? dialog.
  5. Read the result line Ownership was transferred. Your role is now ..., then check your role on the Members list.
  6. Compare with Expected: the new owner holds the owner role and you hold the role you chose.

## S87.09 Domain verification.

- **Expected:** An administrator claims a company domain, publishes a DNS TXT challenge, and the product verifies ownership before routing sign-in for that domain.
- **Code:** done. Evidence moved: apps/web/features/workspace-console/components/WorkspaceIdentityPanels.tsx:71; apps/web/features/settings/sections/team/SSOPanel.tsx:410; apps/web/features/settings/sections/team/SSOPanel.tsx:474; apps/web/app/api/admin/sso/verify-domain/route.ts:120 (quoted code not found in the file now); apps/web/lib/server/sso/domain-verification.ts:104
- **Where to find it:** Account menu > Settings > Workspace > Workspace administration > Identity > Single sign-on (SAML / OIDC) > Add connection (labels found in the code)
- **Needs:** an owner account and a domain you control with DNS editing access
- **Steps:**
  1. Click Identity in the Workspace administration left column.
  2. In Single sign-on (SAML / OIDC), type a company domain in Email domain and click Add connection.
  3. On the new connection card, read Domain not verified and the values Record type, Record name and Record value.
  4. Publish that TXT record in your DNS host (this step is outside the app), then click Verify domain.
  5. Compare with Expected: the status changes to Domain verified, and sign-in for that domain is not routed until verification succeeds.

## S87.10 SSO setup.

- **Expected:** A workspace owner configures a SAML or OIDC connection for a verified domain, and members on that domain sign in through the identity provider.
- **Code:** done. Evidence present: apps/web/app/workspace/identity/page.tsx:17; apps/web/features/settings/sections/team/SSOPanel.tsx:285; apps/web/app/api/admin/sso/route.ts:216; apps/web/features/workspace-console/components/WorkspaceIdentityPanels.tsx:92
- **Where to find it:** Account menu > Settings > Workspace > Workspace administration > Identity > Single sign-on (SAML / OIDC) (labels found in the code)
- **Needs:** an owner account, a verified domain, and an identity-provider test account (SAML or OIDC)
- **Steps:**
  1. On Identity, open the connection card for a verified domain.
  2. Pick SAML 2.0 or OIDC when you add it, with IdP metadata URL or OIDC discovery URL filled in.
  3. Copy the values under Paste these into your identity provider: (ACS URL, SP entity ID) into your identity provider.
  4. Click Activate on the card.
  5. Compare with Expected: the status reads Active with the text Users with an email address on this domain sign in through your identity provider.
  6. Optionally sign in with a test identity-provider user on that domain to check.

## S87.11 Directory provisioning.

- **Expected:** An administrator connects an identity provider over SCIM (connection and bearer token), and the provider creates, updates and deprovisions members.
- **Code:** done. Evidence present: apps/web/features/workspace-console/components/WorkspaceIdentityPanels.tsx:72; apps/web/features/admin/pages/DirectorySyncAdminPage.tsx:348; apps/web/features/admin/pages/DirectorySyncAdminPage.tsx:270; apps/web/app/api/admin/directory-sync/tokens/route.ts:70
- **Where to find it:** Account menu > Settings > Workspace > Workspace administration > Identity > Directory sync (SCIM 2.0) (labels found in the code)
- **Needs:** an Enterprise plan (the page says it requires an active Enterprise subscription) and an identity-provider test tenant
- **Steps:**
  1. On Identity, scroll to the Directory sync (SCIM 2.0) heading.
  2. Under Connections, choose a Provider (Okta, Microsoft Entra ID, Google Workspace, OneLogin or Generic SCIM 2.0) and click Add connection.
  3. Under SCIM tokens, choose a connection, type a Token name and click Mint token.
  4. Copy the token shown with the note Copy this now, it will not be shown again, and enter it with the SCIM base URL in your identity provider.
  5. Compare with Expected: users created, changed or removed in the identity provider appear, updated or removed here, and Recent IdP activity lists the sync events.

## S87.12 Service accounts.

- **Expected:** An administrator creates non-human service accounts with bounded permissions and keys that outlive their creator, and can disable them or revoke their keys.
- **Code:** done. Evidence present: apps/web/features/workspace-console/components/WorkspaceIdentityPanels.tsx:73; apps/web/features/workspace-console/components/WorkspaceServicePrincipals.tsx:173; apps/web/features/workspace-console/components/WorkspaceApiKeys.tsx:207; apps/web/app/api/settings/organization/admin-api-keys/route.ts:226; apps/web/lib/server/admin-api-keys.ts:216
- **Where to find it:** Account menu > Settings > Workspace > Workspace administration > Audit > Workspace API keys > Create key; then Identity > Service principals (labels found in the code)
- **Needs:** an owner or admin account
- **Steps:**
  1. Click Audit in the Workspace administration left column.
  2. Scroll to Workspace API keys, type a name in Workspace API key name, pick an expiry, tick scopes and click Create key.
  3. Copy the new key shown once.
  4. Click Identity and find the Service principals card, which lists the principal created with the key.
  5. Click Disable on that principal, then Enable to restore it; use Revoke on the key row under Audit to revoke the key.
  6. Compare with Expected: the key keeps working after its creator leaves, and disabling or revoking stops it.

## S87.13 Model-access policy.

- **Expected:** An administrator allows or blocks providers and models for the workspace, and requests for a blocked model are refused.
- **Code:** done. Evidence moved: apps/web/app/workspace/models/page.tsx:17; apps/web/features/workspace-console/components/WorkspaceModelPolicy.tsx:179 (quoted code not found in the file now); apps/web/features/workspace-console/components/WorkspaceModelPolicy.tsx:401; apps/web/app/api/settings/organization/model-policy/route.ts:215; apps/web/lib/managed-compute-gate.ts:417
- **Where to find it:** Account menu > Settings > Workspace > Workspace administration > Models (labels found in the code)
- **Needs:** an owner or admin account, and a chat model to test
- **Steps:**
  1. Click Models in the Workspace administration left column.
  2. Under Providers, click Block beside a provider, or Approve on another.
  3. Under Models, type in Filter models and click Block beside a model, or Approve.
  4. Click Save model policy and read the Blocked badge beside the model.
  5. Compare with Expected: then try that blocked model in chat and check that the request is refused.

## S87.14 Feature-access policy.

- **Expected:** An administrator switches product features on or off for the workspace (with exceptions) and each switched-off feature is refused wherever it runs.
- **Code:** done. Evidence moved: apps/cli/src/cloud/workspace_policy.rs:14; apps/cli/src/cloud/workspace_policy.rs:752; apps/cli/src/features/hooks/hooks.rs:1408; apps/cli/src/agent/mod.rs:711; apps/cli/src/agent/chat.rs:1160; apps/desktop/electron/runtime/developerSessionService.ts:725 (quoted code not found in the file now)
- **Where to find it:** Account menu > Settings > Workspace > Workspace administration > Policy > Features and defaults (labels found in the code)
- **Needs:** an owner or admin account, and a member account to test
- **Steps:**
  1. Click Policy in the Workspace administration left column.
  2. Under Features and defaults, switch off a feature such as Work or Skills, then click Save features and defaults.
  3. Under Exceptions, choose Exception applies to (A person, A directory group or A role), pick the subject, set the feature to Off and click Save exception.
  4. Sign in as a member who is affected and try that feature.
  5. Compare with Expected: the switched-off feature is refused for everyone without an exception, and the exception member is treated as set.

## S87.15 Tool policy.

- **Expected:** An administrator decides which individual tools members and agents may use (allow, block or require approval) and the tool loop enforces it.
- **Code:** done. Evidence present: apps/web/app/api/llm/v1/chat/completions/lib/connector-tool-permissions.ts:503; apps/web/app/api/llm/v1/chat/completions/lib/connector-tool-permissions.ts:705; apps/web/app/api/llm/v1/chat/completions/route.ts:852; apps/web/app/api/settings/organization/connector-policy/route.ts:140; apps/web/features/workspace-console/components/WorkspaceConnectorPolicy.tsx:451
- **Where to find it:** Account menu > Settings > Workspace > Workspace administration > Connectors > Catalog connectors (labels found in the code)
- **Needs:** an owner or admin account, and a deployment that has catalog connectors
- **Steps:**
  1. Click Connectors in the Workspace administration left column.
  2. Under Catalog connectors, find a connector row.
  3. Set Read-only tools and Write tools for that connector to Always allow, Needs approval or Blocked.
  4. Click Save policy.
  5. Compare with Expected: the connector's read-only and write tools follow the chosen level; try a write tool in chat to check the approval step.

## S87.16 Connector policy.

- **Expected:** An administrator allows or blocks connectors (and custom connectors) for the workspace, and blocked connectors are not offered or connectable.
- **Code:** done. Evidence moved: apps/web/app/workspace/connectors/page.tsx:17; apps/web/features/workspace-console/components/WorkspaceConnectorPolicy.tsx:797; apps/web/app/api/settings/organization/connector-policy/route.ts:164; apps/web/lib/user-connector-tools.ts:1790 (quoted code not found in the file now)
- **Where to find it:** Account menu > Settings > Workspace > Workspace administration > Connectors (labels found in the code)
- **Needs:** an owner or admin account, and a deployment that has catalog connectors
- **Steps:**
  1. Click Connectors in the Workspace administration left column.
  2. Under Catalog connectors, click Block beside a connector, or Approve to allow it.
  3. Turn the Allow custom connectors switch off if you want custom connectors blocked.
  4. Click Save policy.
  5. Compare with Expected: a blocked connector shows as Blocked and is not offered in chat, schedules or agent runs.

## S87.17 Skill and Plugin policy.

- **Expected:** An administrator controls which skills and plugins members may install or use, per item, and the product enforces it.
- **Code:** done. Evidence moved: apps/web/features/workspace-console/components/WorkspaceConnectorPolicy.tsx:155 (quoted code not found in the file now); apps/web/features/workspace-console/components/WorkspaceFeatureControls.tsx:62; apps/web/lib/services/connector-policy-gate.ts:216; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:5440
- **Where to find it:** Account menu > Settings > Workspace > Workspace administration > Policy > Features and defaults (Skills and Plugins switches); and Connectors > Plugins (labels found in the code)
- **Needs:** an owner or admin account, and a member account to test
- **Steps:**
  1. On Policy, under Features and defaults, switch off Skills or Plugins and click Save features and defaults.
  2. Sign in as a member and try to use or install a skill or plugin.
  3. On Connectors, under Plugins, type a plugin key in Plugin key and click Approve or Block.
  4. Read the lists Approved plugins and Blocked plugins.
  5. Compare with Expected: the switched-off feature is refused, and a blocked plugin cannot be installed.

## S87.18 Private marketplace.

- **Expected:** A workspace curates its own private catalogue of plugins, skills or servers that members browse and install, separate from the public directory.
- **Code:** done. Evidence present: apps/web/app/api/settings/organization/plugins/route.ts:62; apps/web/features/workspace-console/components/WorkspaceConsoleNav.tsx:107; apps/web/app/workspace/plugins/page.tsx:16; apps/web/features/plugins/server/directory/installed-skills.ts:115
- **Where to find it:** Account menu > Settings > Workspace > Workspace administration > Plugins (labels found in the code)
- **Needs:** a plugin or skill .zip file, and an owner or admin account
- **Steps:**
  1. Click Plugins in the Workspace administration left column.
  2. Under Publish a plugin or a skill, click Upload a plugin or skill and choose a .zip file.
  3. Wait for Scanning and publishing to finish, then read the Workspace plugins list.
  4. Set the install option for a plugin (Required, Installed by default, Available to install or Not available), then check it.
  5. Compare with Expected: members find the published plugin under Plugins; it is kept apart from the public directory.

## S87.19 Shared Project administration.

- **Expected:** An administrator sees every project shared with the workspace, sets per-member access, and can stop sharing a project.
- **Code:** done. Evidence present: apps/web/app/workspace/sharing/page.tsx:17; apps/web/features/settings/sections/OrganizationSharingSection.tsx:195; apps/web/features/settings/sections/OrganizationSharingSection.tsx:306; apps/web/app/api/settings/organization/shared/projects/[projectId]/route.ts:200
- **Where to find it:** Account menu > Settings > Workspace > Workspace administration > Sharing (labels found in the code)
- **Needs:** an owner or admin account, and a project already shared with the workspace
- **Steps:**
  1. Click Sharing in the Workspace administration left column.
  2. Read the Shared projects card to see which projects are shared with the workspace.
  3. Open a project's member list to set access per member (Can view, Can edit or No access).
  4. Click Stop sharing on a project and confirm in the dialog.
  5. Compare with Expected: every shared project is listed, per-member access changes, and a stopped project no longer appears to members.

## S87.20 External-sharing controls.

- **Expected:** An administrator turns sharing outside the workspace on or off, and members cannot create new external share links while it is off.
- **Code:** done. Evidence moved: apps/web/app/workspace/policy/page.tsx:19; apps/web/features/settings/sections/WorkspacePolicySection.tsx:457; apps/web/lib/managed-compute-gate.ts:478; apps/web/app/api/share/route.ts:141 (quoted code not found in the file now)
- **Where to find it:** Account menu > Settings > Workspace > Workspace administration > Policy > Public sharing (labels found in the code)
- **Needs:** an owner or admin account, and a member account to test
- **Steps:**
  1. Click Policy in the Workspace administration left column.
  2. Find the Public sharing card and its switch labelled Allow public sharing.
  3. Switch it off and click Save policy.
  4. Sign in as a member and try to create a new public or outside share link.
  5. Compare with Expected: new share links are refused while the switch is off; existing links stay up until revoked.

## S87.21 Public-publishing controls.

- **Expected:** An administrator controls whether members may publish chats or artifacts publicly, and publishing is refused when it is off.
- **Code:** done. Evidence moved: apps/web/features/settings/sections/WorkspacePolicySection.tsx:460; apps/web/app/api/artifacts/publish/route.ts:202 (quoted code not found in the file now); apps/web/lib/services/organization-policy-evaluator.ts:382
- **Where to find it:** Account menu > Settings > Workspace > Workspace administration > Policy > Public sharing (labels found in the code)
- **Needs:** an owner or admin account, and a member account to test
- **Steps:**
  1. Click Policy in the Workspace administration left column.
  2. In the Public sharing card, switch off Allow public sharing and click Save policy.
  3. Sign in as a member and try to publish a chat or an artifact to a public link.
  4. Compare with Expected: publishing is refused while the switch is off.
  5. Switch it on again and check that publishing works.

## S87.22 Memory policy.

- **Expected:** An administrator allows or disallows account memory for the workspace, and members get no memory while it is off.
- **Code:** done. Evidence present: apps/web/features/settings/sections/WorkspacePolicySection.tsx:474; apps/web/lib/services/managed-memory-context-service.ts:134; apps/web/lib/services/managed-memory-context-service.ts:610
- **Where to find it:** Account menu > Settings > Workspace > Workspace administration > Policy > Memory (labels found in the code)
- **Needs:** an owner or admin account, and a member account with memory
- **Steps:**
  1. Click Policy in the Workspace administration left column.
  2. Find the Memory card and switch off Allow memory.
  3. Click Save policy.
  4. Sign in as a member whose personal setting has memory on, and check that memory is not used.
  5. Compare with Expected: the card says Off for every member, whatever their personal setting.

## S87.23 Data-retention settings.

- **Expected:** An administrator sets how long workspace conversations are kept and, when enforced, a scheduled sweep deletes older ones (withholding legal holds).
- **Code:** done. Evidence present: apps/web/features/settings/sections/WorkspacePolicySection.tsx:521; apps/web/features/settings/sections/WorkspacePolicySection.tsx:547; apps/web/app/api/cron/enforce-workspace-retention/route.ts:65; vercel.json:138
- **Where to find it:** Account menu > Settings > Workspace > Workspace administration > Policy > Retention window (labels found in the code)
- **Needs:** an owner or admin account; use a test workspace only, because enforcement deletes chats
- **Steps:**
  1. Click Policy in the Workspace administration left column.
  2. In the Retention window card, change Retention window in days and click Save policy.
  3. Switch on Enforce the retention window in the Enforce retention card and confirm the dialog.
  4. Read the line that says chats idle for N days are permanently deleted, except under legal hold.
  5. Compare with Expected: the window is saved; after enforcement a nightly sweep deletes older chats, but chats under legal hold stay.

## S87.24 Data-residency settings.

- **Expected:** An administrator chooses or requests the region where workspace data is stored and processed, and the product keeps data there.
- **Code:** partial. Evidence present: apps/web/app/workspace/data/page.tsx:24; apps/web/features/workspace-console/components/WorkspaceDataRegion.tsx:191; apps/web/app/api/settings/organization/data-region/route.ts:117; apps/web/app/api/settings/organization/data-region/route.ts:148; apps/web/app/api/admin/data-region/route.ts:53
- **Known to be unfinished:** owner: stand up the EU database, bucket, log sink and KMS, then set the AGI_DATA_REGION_EU_* variables (apps/web/lib/server/data-region.ts)
- **Owner decision is open on this item.**
- **Where to find it:** Account menu > Settings > Workspace > Workspace administration > Data > Data region (labels found in the code)
- **Needs:** an Enterprise plan (the card says choosing a region requires an active Enterprise plan)
- **Steps:**
  1. Click Data in the Workspace administration left column.
  2. Find the Data region card and read Stored in <region>.
  3. Open the drop-down with Choose a region… and pick another region, then click Request move and confirm.
  4. Read the note that says data stays in the current region until the copy is verified.
  5. Compare with Expected: the region is requested and data is kept in the chosen region once the move completes.

## S87.25 Customer-managed-key setup where offered.

- **Expected:** Where offered, an administrator connects a customer-managed encryption key, rotates or revokes it from the console, and workspace data is sealed under it.
- **Code:** done. Evidence present: apps/web/app/workspace/data/page.tsx:23; apps/web/features/workspace-console/components/WorkspaceEncryptionKey.tsx:403; apps/web/features/workspace-console/components/WorkspaceEncryptionKey.tsx:261; apps/web/features/workspace-console/components/WorkspaceEncryptionKey.tsx:341; apps/web/features/workspace-console/components/WorkspaceEncryptionKey.tsx:199; apps/web/features/workspace-console/hooks/use-encryption-key.ts:155
- **Where to find it:** Account menu > Settings > Workspace > Workspace administration > Data > Encryption key (labels found in the code)
- **Needs:** an owner or admin account, and a cloud key (AWS KMS, Google Cloud KMS or Azure Key Vault) for a real connection
- **Steps:**
  1. Click Data in the Workspace administration left column.
  2. In the Encryption key card, choose a Provider (AWS KMS, Google Cloud KMS or Azure Key Vault), type the Key identifier and Region, then click Connect key.
  3. Read the status sentence that says workspace data is sealed with your key.
  4. Click Rotate and confirm Rotate key, or click Revoke, enter a reason and confirm Revoke key.
  5. Compare with Expected: the key is connected, rotates or revokes from this card, and data follows the key status.

## S87.26 Network/IP restrictions.

- **Expected:** An administrator restricts workspace access to listed IP ranges, and requests from other networks are refused.
- **Code:** done. Evidence moved: apps/web/features/settings/sections/WorkspacePolicySection.tsx:677; apps/web/features/settings/sections/WorkspacePolicySection.tsx:681 (quoted code not found in the file now); apps/web/lib/ip-allow-list-gate.ts:56; apps/web/lib/api-auth.ts:476
- **Where to find it:** Settings > Workspace > Workspace administration > Policy > IP allow list (labels found in the code)
- **Needs:** An owner or admin account, and a second network (for example a phone hotspot) to test refusal
- **Steps:**
  1. Sign in as a workspace owner or admin, open Settings, choose Workspace, then click Workspace administration.
  2. Click Policy in the left list and scroll down to the IP allow list row.
  3. Type your own address, or a block such as 203.0.113.0/24, in the box and press Enter. Add your own address first so you do not lock yourself out.
  4. Click Save policy.
  5. From a network outside the listed addresses, try to sign in to the workspace and check that the sign-in is refused, as Expected says.

## S87.28 Audit-log viewer.

- **Expected:** An administrator browses the workspace audit trail with filters (action, outcome, severity, time range) from live data.
- **Code:** done. Evidence present: apps/web/app/workspace/audit/page.tsx:21; apps/web/features/settings/sections/WorkspaceAuditSection.tsx:167; apps/web/app/api/settings/organization/audit/route.ts:53
- **Where to find it:** Settings > Workspace > Workspace administration > Audit > Audit trail (labels found in the code)
- **Needs:** An owner or admin account, and some audit events in the workspace (for example a role change or an invitation)
- **Steps:**
  1. Sign in as an owner or admin, open Settings, choose Workspace, then click Workspace administration.
  2. Click Audit in the left list.
  3. In the Audit trail card, open the Filter by action dropdown (it starts at All actions), then the Filter by outcome and Filter by severity dropdowns, and pick a value in each.
  4. Look at the table with the headings When, Actor, Action, Resource, Surface and Outcome; the rows should match the filters. If nothing matches you see No events match these filters.

## S87.29 Audit export.

- **Expected:** An administrator exports the audit trail for a range (and can stream it to a SIEM), with the export itself recorded.
- **Code:** done. Evidence present: apps/web/features/settings/sections/WorkspaceAuditSection.tsx:153; apps/web/features/settings/sections/WorkspacePolicySection.tsx:508; apps/web/app/api/settings/organization/audit/export/route.ts:69; apps/web/app/workspace/audit/page.tsx:22; vercel.json:146
- **Where to find it:** Settings > Workspace > Workspace administration > Audit > Audit trail > Export JSONL (labels found in the code)
- **Needs:** An owner or admin account, and a place to save a downloaded file
- **Steps:**
  1. Open Settings, choose Workspace, click Workspace administration, then click Audit.
  2. Optionally set the filters in the Audit trail card first, because the export follows them.
  3. Click Export JSONL and wait for the file to download; open it and compare its lines with the rows on screen.
  4. Go back to the Audit trail table and check that a new event for the export now appears, as Expected says it is recorded.

## S87.30 Usage analytics.

- **Expected:** An administrator sees workspace usage and spend broken down by member, model, product area and provider over a period, and can export it.
- **Code:** done. Evidence moved: apps/web/app/workspace/usage/page.tsx:17; apps/web/features/workspace-console/components/WorkspaceUsageAnalytics.tsx:349; apps/web/features/workspace-console/components/WorkspaceUsageAnalytics.tsx:276; apps/web/app/api/settings/organization/usage-analytics/route.ts:39 (quoted code not found in the file now); apps/web/lib/services/organization-usage-service.ts:119
- **Where to find it:** Settings > Workspace > Workspace administration > Usage (labels found in the code)
- **Needs:** An owner or admin account, and some managed Cloud usage in the chosen period
- **Steps:**
  1. Open Settings, choose Workspace, click Workspace administration, then click Usage.
  2. Click 7 days, 30 days or 90 days (30 days is selected first).
  3. Read the Managed cloud usage totals, then the tables By member, By product area, By model and By provider.
  4. Click Export daily CSV to download the file.
  5. Compare the totals, the tables and the CSV, as Expected says.

## S87.33 Organization budget.

- **Expected:** An administrator sets a monthly workspace budget with an alert threshold, sees spend against it, and managed usage is refused once it is exhausted (when enforced).
- **Code:** done. Evidence moved: apps/web/features/workspace-console/components/WorkspaceUsageAnalytics.tsx:377; apps/web/features/workspace-console/components/WorkspaceSpendLimit.tsx:62 (quoted code not found in the file now); apps/web/features/workspace-console/components/WorkspaceSpendLimit.tsx:190; apps/web/app/api/settings/organization/spend-limit/route.ts:81 (quoted code not found in the file now); apps/web/lib/services/managed-compute-access.ts:112 (quoted code not found in the file now)
- **Where to find it:** Settings > Workspace > Workspace administration > Usage > Monthly spend limit (labels found in the code)
- **Needs:** An owner or admin account, and Cloud usage to reach a small test cap
- **Steps:**
  1. Open Settings, choose Workspace, click Workspace administration, then click Usage.
  2. Scroll to Monthly spend limit. Type a number in Cap (credits) and a percentage in Alert at.
  3. Choose Off, Notify or Block in the enforcement dropdown, then click Set limit.
  4. Read the bar and the line that says the credits used this month, which shows past the alert once the threshold is crossed.
  5. With Block set, use Cloud turns until the cap is reached and check that new turns are refused, as Expected says.

## S87.34 Billing administration.

- **Expected:** An administrator manages the workspace plan, seats, payment method, invoices and (for enterprise) contract terms from the console.
- **Code:** done. Evidence moved: apps/web/app/workspace/billing/page.tsx:17; apps/web/features/workspace-console/components/WorkspaceBillingSummary.tsx:139; apps/web/features/workspace-console/components/WorkspaceBillingSummary.tsx:156 (quoted code not found in the file now); apps/web/app/api/settings/organization/billing-contract/route.ts:122; apps/web/lib/services/enterprise-contracts/agreement-store.ts:30
- **Where to find it:** Settings > Workspace > Workspace administration > Billing (labels found in the code)
- **Needs:** An owner or admin account; an enterprise contract is needed to see the contract and invoice parts
- **Steps:**
  1. Open Settings, choose Workspace, then click Workspace administration and Billing.
  2. Read the Plan and seats card: Plan, Seats used and Members.
  3. If the workspace has an enterprise contract, scroll to Enterprise contract and its Invoices section.
  4. Click Billing settings to reach payment, invoices and plan changes, and compare what you find with Expected.

## S87.36 Compliance export.

- **Expected:** An administrator exports workspace content (conversations, messages, files, artifacts) in a machine-readable format for compliance review, with the export recorded.
- **Code:** done. Evidence present: apps/web/features/workspace-console/components/WorkspaceDataControls.tsx:153; apps/web/app/api/settings/organization/legal-holds/[holdId]/export/route.ts:111; apps/web/lib/services/ediscovery-export-service.ts:58
- **Where to find it:** Settings > Workspace > Workspace administration > Data > Legal holds > Export records (labels found in the code)
- **Needs:** An owner or admin account and at least one legal hold
- **Steps:**
  1. Open Settings, choose Workspace, click Workspace administration, then click Data.
  2. If no legal hold exists, place one as in S87.37 first.
  3. On the hold row, click Export records and wait for the download.
  4. Open the file and check that it holds the workspace conversations and messages, and compare with Expected.

## S87.37 Legal-hold administration where offered.

- **Expected:** Where offered, an administrator places a legal hold on the workspace or named members, sees active and released holds, releases them after confirmation, and held data survives retention and deletion.
- **Code:** done. Evidence present: apps/web/app/workspace/data/page.tsx:22; apps/web/features/workspace-console/components/WorkspaceDataControls.tsx:326; apps/web/features/workspace-console/components/WorkspaceDataControls.tsx:383; apps/web/features/workspace-console/components/WorkspaceDataControls.tsx:248; apps/web/app/api/settings/organization/legal-holds/route.ts:138
- **Where to find it:** Settings > Workspace > Workspace administration > Data > Legal holds > Place hold (labels found in the code)
- **Needs:** An owner or admin account; a second member account to test the One member scope
- **Steps:**
  1. Open Settings, choose Workspace, click Workspace administration, then click Data.
  2. Under Legal holds, fill in the Legal hold name and Legal hold scope (Whole workspace or One member), pick the person in Held member if needed, type a Legal hold reason, then click Place hold.
  3. Check that the hold appears under active holds with a Placed date.
  4. Click Release hold on that hold, then click Release hold in the confirmation box.
  5. Check that the hold now shows Released and that the deletion figures under the backlog (Held from deletion) reflect it.

## S87.39 Policy diagnostics.

- **Expected:** An administrator can see the effective policy for a member or request and why an action was allowed or refused.
- **Code:** done. Evidence present: apps/web/features/workspace-console/components/WorkspaceFeatureControls.tsx:564; apps/web/features/workspace-console/components/WorkspacePolicyDiagnostics.tsx:233; apps/web/features/workspace-console/components/WorkspacePolicyDiagnostics.tsx:217; apps/web/app/api/settings/organization/policy/diagnose/route.ts:67; apps/web/lib/services/organization-policy-gate.ts:382
- **Where to find it:** Settings > Workspace > Workspace administration > Policy > Explain a member’s policy (labels found in the code)
- **Needs:** An owner or admin account, and at least one member with a restricted policy to see a refusal
- **Steps:**
  1. Open Settings, choose Workspace, click Workspace administration, then click Policy.
  2. Scroll to the section that asks Explain a member’s policy (shown to admins only).
  3. Choose a person in Member, optionally a feature in Feature to check (optional), choose a surface in From, and optionally a Country code (optional).
  4. Click Explain.
  5. Read the result: what this person may not use, which rule turned it off, and whether the request passes; compare with Expected.

## S87.40 Administrative API access.

- **Expected:** An administrator issues scoped, expiring API keys that let automations perform administrative tasks through a documented API, and can revoke them.
- **Code:** done. Evidence present: apps/web/app/workspace/audit/page.tsx:23; apps/web/features/workspace-console/components/WorkspaceApiKeys.tsx:207; apps/web/features/workspace-console/components/WorkspaceApiKeys.tsx:323; apps/web/app/api/settings/organization/admin-api-keys/route.ts:106
- **Where to find it:** Settings > Workspace > Workspace administration > Audit > Workspace API keys > Create key (labels found in the code)
- **Needs:** An owner or admin account; Create key stays off until a name and at least one scope are set
- **Steps:**
  1. Open Settings, choose Workspace, click Workspace administration, then click Audit, and scroll to Workspace API keys.
  2. Type a name in Workspace API key name, tick one or more scopes, and choose an expiry in Workspace API key expiry (30 days, 90 days, 1 year or No expiry).
  3. Click Create key and check the new row shows its scopes and an Expires date.
  4. Click Revoke on that row, then click Revoke key in the confirmation box.
  5. Check that the row now shows Revoked with a date, as Expected says.

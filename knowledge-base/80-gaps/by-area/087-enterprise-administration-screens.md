---
id: "GAPS-AREA-087"
type: "gap-list"
title: "Gaps: Enterprise administration screens"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Gaps: 87. Enterprise administration screens

187 open gaps that touch this area. Area page: [20-features/087-enterprise-administration-screens](../../20-features/087-enterprise-administration-screens/README.md).

## CMP-CP342

**Admin audit trail and SIEM events**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: CLI
- Features: [F087-10](../../20-features/087-enterprise-administration-screens/F087-10-audit-trail-and-exports.md)
- Detail: Nothing is shipped to a SIEM and settings changes are not audited A local approval audit lists recent tool approvals and denials, but nothing is shipped to a SIEM and settings changes are not audited.
- Evidence: apps/cli/src/approval_audit.rs; apps/cli/src/lib.rs:5504-5510

## CMP-CP343

**Admin toggles for CLI access, cloud sessions, remote control and fast mode**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: CLI
- Features: [F087-01](../../20-features/087-enterprise-administration-screens/F087-01-overview-and-policy-diagnostics.md), [F087-06](../../20-features/087-enterprise-administration-screens/F087-06-model-feature-and-tool-access.md)
- Detail: The CLI reads only the hooks switch The workspace policy has a feature switch map but the CLI reads only the hooks switch; remote control and cloud runs have no admin toggle.
- Evidence: apps/cli/src/cloud/workspace_policy.rs:359-366; searched: feature_enabled in apps/cli/src

## CMP-CP347

**Managed policy delivered by MDM, cached, fails closed**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: CLI
- Features: [F087-09](../../20-features/087-enterprise-administration-screens/F087-09-data-retention-region-keys-network-and-managed-cli.md)
- Detail: No cloud fetch or expiry Ours reads an MDM file, an env pointer or a cached file and refuses to start on an invalid policy; no cloud fetch or expiry.
- Evidence: apps/cli/src/platform/policy/managed.rs:99-125; apps/cli/src/config.rs:848-860

## CMP-CP350

**Organization-managed settings for the CLI**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: CLI
- Features: [F087-09](../../20-features/087-enterprise-administration-screens/F087-09-data-retention-region-keys-network-and-managed-cli.md)
- Detail: The device file pins only three config keys plus rules and trust (apps/cli/src/platform/policy/managed.rs:36-58) and th… Contradicts the row Organization-managed settings (Partial) in the same file. The layer exists, but the device file pins only three config keys plus rules and trust (apps/cli/src/platform/policy/managed.rs:36-58) and the server policy carries only MCP and hooks switches (apps/cli/src/cloud/workspace
- Evidence: apps/cli/src/platform/policy/managed.rs:1-36

## CMP-CP351

**OS-level policy delivery (MDM plist, Windows registry)**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: CLI
- Features: [F087-09](../../20-features/087-enterprise-administration-screens/F087-09-data-retention-region-keys-network-and-managed-cli.md)
- Detail: No plist, registry or MDM templates Reads a managed file at a fixed system path on macOS, Windows and Linux, plus an env pointer; no plist, registry or MDM templates.
- Evidence: apps/cli/src/features/hooks/managed.rs:160-180; apps/cli/src/platform/policy/managed.rs:100-120

## CMP-CP360

**Fail-closed startup when the policy cannot be fetched**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: CLI
- Features: [F087-09](../../20-features/087-enterprise-administration-screens/F087-09-data-retention-region-keys-network-and-managed-cli.md)
- Detail: Startup itself is never blocked by a missed fetch An unreadable server policy turns MCP and hooks off and an invalid local policy blocks config load, but startup itself is never blocked by a missed fetch.
- Evidence: apps/cli/src/cloud/workspace_policy.rs:359-392; apps/cli/src/config.rs:849-851

## CMP-CP364

**Minimum and maximum client version by policy**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: CLI
- Features: [F087-09](../../20-features/087-enterprise-administration-screens/F087-09-data-retention-region-keys-network-and-managed-cli.md)
- Detail: No admin-set version range in managed settings The server can reject an outdated client with a message to run `agi update`; no admin-set version range in managed settings.
- Evidence: apps/cli/src/cloud/client.rs:1504; apps/cli/src/errors.rs:513,596

## CMP-D138

**Admin pushes policy to the desktop app through MDM or a managed file**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Desktop
- Features: [F087-09](../../20-features/087-enterprise-administration-screens/F087-09-data-retention-region-keys-network-and-managed-cli.md)
- Detail: The Electron app reads no MDM, managed file or device policy; the signed org-policy contract exists but its own header says it is not wired into any surface.
- Evidence: packages/contracts/licensing/src/org-policy.ts:21; searched: mdm, managed settings, managedPolicy in apps/desktop/electron

## CMP-D140

**Device management policies (MDM) for the desktop app**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Desktop
- Features: [F087-09](../../20-features/087-enterprise-administration-screens/F087-09-data-retention-region-keys-network-and-managed-cli.md)
- Detail: No MDM keys, managed configuration or enforced login method; sign-in stays in the browser.
- Evidence: searched: managed policy, mdm, plist, Jamf, loginSso in apps/desktop, apps/web/features, docs

## CMP-D148

**Admin switches for dictation, voice, chat screens and local scheduled tasks in the desktop app**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Desktop
- Features: [F087-01](../../20-features/087-enterprise-administration-screens/F087-01-overview-and-policy-diagnostics.md), [F087-06](../../20-features/087-enterprise-administration-screens/F087-06-model-feature-and-tool-access.md)
- Detail: The governed feature list has work, code, research, skills, plugins, hooks, browser, computer use, Remote Control, schedules, event triggers, projects, artifact connectors and fast mode; there is no switch for voice or dictation.
- Evidence: packages/contracts/types/src/enterprise/workspace-controls.ts:3-18; apps/web/features/workspace-console/components/WorkspaceFeatureControls.tsx:35-50; searched: voice, dictation in workspace-controls.ts

## CMP-DP127

**Stream organization activity to a SIEM or OpenTelemetry collector**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Desktop
- Features: [F087-10](../../20-features/087-enterprise-administration-screens/F087-10-audit-trail-and-exports.md)
- Detail: It is not OpenTelemetry and carries no per-action desktop agent events Owners can send the audit log to an HTTPS endpoint and export it, but it is not OpenTelemetry and carries no per-action desktop agent events.
- Evidence: apps/web/app/api/settings/organization/audit/destination/route.ts:34

## CMP-M207

**Admin enables or disables each model per org and role; Haiku always on**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Mobile
- Features: [F087-06](../../20-features/087-enterprise-administration-screens/F087-06-model-feature-and-tool-access.md)
- Detail: No code reads an organization model allow list; any enforcement is on the server and unknown.
- Evidence: searched: modelAccess, disabledModels, allowedModels in src/features/model-picker, lib

## CMP-M209

**Effort level caps per model at org and role level**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Mobile
- Features: [F087-06](../../20-features/087-enterprise-administration-screens/F087-06-model-feature-and-tool-access.md)
- Detail: Effort picker has no cap from organization or role.
- Evidence: apps/mobile/src/features/chat/components/ComposerEffort.tsx; searched: effortCap in apps/mobile

## CMP-M211

**Managed deployment through Intune with app-protection policy**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Mobile
- Features: [F087-09](../../20-features/087-enterprise-administration-screens/F087-09-data-retention-region-keys-network-and-managed-cli.md)
- Detail: No managed app configuration or Intune policy support in the iOS or Android app.
- Evidence: searched: Intune, MDM, AppConfig in apps/mobile/native, app.config.js

## CMP-M213

**Request more usage when a team budget runs out**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Mobile
- Features: [F087-11](../../20-features/087-enterprise-administration-screens/F087-11-usage-budgets-and-spend-limits.md)
- Detail: No request-more action exists on the limit banner or in the team screens.
- Evidence: searched: request more, requestMore, ask your admin, budget in apps/mobile/src/features/chat/components/UsageLimitBanner.tsx, src/features/team

## CMP-MP105

**Admin invites by email, seats and member roles on mobile**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Mobile
- Features: [F087-01](../../20-features/087-enterprise-administration-screens/F087-01-overview-and-policy-diagnostics.md), [F087-02](../../20-features/087-enterprise-administration-screens/F087-02-members-invitations-seats-and-ownership.md)
- Detail: No domain capture, JIT or SCIM controls Admins can invite with member, admin or viewer role, copy the link and see seats, but no domain capture, JIT or SCIM controls.
- Evidence: apps/mobile/src/features/team/WorkspaceAdministration.tsx:371-386; administration.ts:5

## CMP-V93

**Admin-forced login method and organisation**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: VS Code
- Features: [F087-09](../../20-features/087-enterprise-administration-screens/F087-09-data-retention-region-keys-network-and-managed-cli.md)
- Detail: No managed login policy in the extension.
- Evidence: searched: forceLogin, allowedProviders, managed settings in apps/extension-vscode

## CMP-V94

**Company configuration server or gateway with corporate sign-in**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: VS Code
- Features: [F087-09](../../20-features/087-enterprise-administration-screens/F087-09-data-retention-region-keys-network-and-managed-cli.md)
- Detail: No company gateway or configuration server; the extension signs in to the AGI account only.
- Evidence: searched: gateway, config server, enroll, SSO in apps/cli/src, apps/extension-vscode/src

## CMP-V97

**Admin-pinned default model, effort, fast mode and required review**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: VS Code
- Features: [F087-06](../../20-features/087-enterprise-administration-screens/F087-06-model-feature-and-tool-access.md)
- Detail: Managed config pins only permission mode, privacy mode and project-config use.
- Evidence: apps/cli/src/platform/policy/managed.rs:42-57

## CMP-W360

**Bulk invite members by list or file**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F087-01](../../20-features/087-enterprise-administration-screens/F087-01-overview-and-policy-diagnostics.md), [F087-02](../../20-features/087-enterprise-administration-screens/F087-02-members-invitations-seats-and-ownership.md)
- Detail: Invitations are created one at a time.
- Evidence: apps/web/features/settings/sections/TeamSection.tsx; searched: bulk invite, csv invite

## CMP-W364

**Domain capture and claiming personal accounts**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F087-04](../../20-features/087-enterprise-administration-screens/F087-04-sign-in-domains-and-directory-sync.md)
- Detail: No flow lists or claims personal accounts on a verified domain or moves a personal workspace into a managed one.
- Evidence: searched: domain capture, claim personal, migrate personal in apps/web/app, features, lib

## CMP-W367

**Invite members in bulk by CSV (email, role, seat type)**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F087-01](../../20-features/087-enterprise-administration-screens/F087-01-overview-and-policy-diagnostics.md), [F087-02](../../20-features/087-enterprise-administration-screens/F087-02-members-invitations-seats-and-ownership.md)
- Detail: Invite form takes one address at a time; no CSV import.
- Evidence: searched: csv, bulkInvit in apps/web/app/api/settings, features/settings, features/workspace-console

## CMP-W368

**Members request a connector or app from admins**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F087-06](../../20-features/087-enterprise-administration-screens/F087-06-model-feature-and-tool-access.md), [F087-07](../../20-features/087-enterprise-administration-screens/F087-07-connectors-skills-and-private-marketplace.md)
- Detail: Members cannot request a connector; admins set the allowed list.
- Evidence: searched: connector request, requestConnector in apps/web/features/connectors, app/api/connectors

## CMP-W369

**Members request more usage credits or extra usage when they hit limits**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F087-11](../../20-features/087-enterprise-administration-screens/F087-11-usage-budgets-and-spend-limits.md)
- Detail: A member who hits the workspace cap is told why, but cannot ask an admin for more.
- Evidence: apps/web/app/api/settings/organization/spend-limit/route.ts:55 (read-only state); searched: usageCreditRequest, request credits

## CMP-W372

**Restrict connected accounts to approved or company domains**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F087-06](../../20-features/087-enterprise-administration-screens/F087-06-model-feature-and-tool-access.md), [F087-07](../../20-features/087-enterprise-administration-screens/F087-07-connectors-skills-and-private-marketplace.md)
- Detail: No domain limit on which account a member connects.
- Evidence: searched: approved domains, connected account domain in apps/web/lib/services/connector-policy-service.ts

## CMP-W374

**SCIM sync preview before applying and manual Sync now**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F087-04](../../20-features/087-enterprise-administration-screens/F087-04-sign-in-domains-and-directory-sync.md)
- Detail: SCIM is push-based from the identity provider with an activity log; there is no preview of removals or manual sync.
- Evidence: apps/web/features/admin/pages/DirectorySyncAdminPage.tsx:661

## CMP-W377

**Usage or spend limit increase requests from members**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F087-11](../../20-features/087-enterprise-administration-screens/F087-11-usage-budgets-and-spend-limits.md)
- Detail: A member who hits the cap cannot ask an admin for more from the product.
- Evidence: searched: limit increase, increase request, usage request in apps/web

## CMP-W380

**Admin analytics by synced group**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F087-11](../../20-features/087-enterprise-administration-screens/F087-11-usage-budgets-and-spend-limits.md)
- Detail: Usage analytics have no group filter.
- Evidence: apps/web/features/workspace-console/components/WorkspaceUsageAnalytics.tsx:363

## CMP-W386

**Admin Insights: use cases and tasks**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F087-11](../../20-features/087-enterprise-administration-screens/F087-11-usage-budgets-and-spend-limits.md)
- Detail: Usage analytics group by model and provider, not by use case.
- Evidence: apps/web/features/workspace-console/components/WorkspaceUsageAnalytics.tsx:363

## CMP-W391

**Agentic work and estimated time saved metrics**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F087-11](../../20-features/087-enterprise-administration-screens/F087-11-usage-budgets-and-spend-limits.md)
- Detail: No workspace metric estimates time saved or how agentic work is.
- Evidence: searched: timeSaved, agentic work in apps/web/features/workspace-console

## CMP-W394

**Allowed email domains for joining the workspace**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F087-04](../../20-features/087-enterprise-administration-screens/F087-04-sign-in-domains-and-directory-sync.md)
- Detail: The organization route accepts an allowedDomains setting but rejects the whole settings patch as unsupported, so no domain list limits invites or joins.
- Evidence: apps/web/app/api/settings/organization/route.ts:69,80-83

## CMP-W395

**Analytics chat: ask plain-language questions about org usage**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F087-11](../../20-features/087-enterprise-administration-screens/F087-11-usage-budgets-and-spend-limits.md)
- Detail: No assistant answers admin questions about workspace usage; admins read fixed charts only.
- Evidence: searched: analyticsChat, AnalyticsChat, ask your org in apps/web, packages/ui

## CMP-W396

**App action policy: read, write and new actions**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F087-06](../../20-features/087-enterprise-administration-screens/F087-06-model-feature-and-tool-access.md), [F087-07](../../20-features/087-enterprise-administration-screens/F087-07-connectors-skills-and-private-marketplace.md)
- Detail: No workspace read or write action setting or guided templates; per-tool levels are the member's.
- Evidence: searched: readActions, new actions policy in apps/web/features/workspace-console

## CMP-W401

**Bulk plugin availability up to 25 at once**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F087-07](../../20-features/087-enterprise-administration-screens/F087-07-connectors-skills-and-private-marketplace.md)
- Detail: Plugin state is set one plugin at a time.
- Evidence: apps/web/features/workspace-console/components/WorkspacePlugins.tsx

## CMP-W406

**Disable sharing of chats that use connectors**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F087-08](../../20-features/087-enterprise-administration-screens/F087-08-sharing-publishing-and-memory.md)
- Detail: No such switch; sharing rules do not look at whether a chat used connectors.
- Evidence: searched: shareChatsThatUse, connector in apps/web/lib/services/org-sharing-service.ts, app/workspace/sharing

## CMP-W407

**Distribute plugins by syncing a GitHub or GitLab marketplace**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F087-07](../../20-features/087-enterprise-administration-screens/F087-07-connectors-skills-and-private-marketplace.md)
- Detail: Admins pick from plugins already in our catalog; no repository sync.
- Evidence: searched: marketplace sync, gitlab in apps/web/features/workspace-console, app/api/plugins

## CMP-W409

**Dynamic groups built from directory attributes**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F087-03](../../20-features/087-enterprise-administration-screens/F087-03-roles-custom-roles-and-groups.md)
- Detail: Group membership is manual or SCIM-pushed; no rule-based groups.
- Evidence: searched: dynamic group, membershipRule in apps/web, packages/contracts

## CMP-W411

**Export member list as CSV**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F087-01](../../20-features/087-enterprise-administration-screens/F087-01-overview-and-policy-diagnostics.md), [F087-02](../../20-features/087-enterprise-administration-screens/F087-02-members-invitations-seats-and-ownership.md)
- Detail: No member list export; only usage and audit exports exist.
- Evidence: searched: members.csv, exportMembers in apps/web/app/api/settings, features

## CMP-W418

**Group visibility settings (who can find, share with, see members)**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F087-03](../../20-features/087-enterprise-administration-screens/F087-03-roles-custom-roles-and-groups.md)
- Detail: Groups have no visibility toggles.
- Evidence: searched: visib, discover in apps/web/app/api/settings/organization/groups

## CMP-W424

**List employees with personal accounts on the company domain and invite them**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F087-04](../../20-features/087-enterprise-administration-screens/F087-04-sign-in-domains-and-directory-sync.md)
- Detail: No view of personal accounts on the verified domain, and no required merge.
- Evidence: searched: personalWorkspaces, verified-domain personal in apps/web

## CMP-W425

**Manage admin policy by API or Terraform**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F087-05](../../20-features/087-enterprise-administration-screens/F087-05-service-accounts-and-admin-api-keys.md)
- Detail: Policy is changed in the console; no policy API for admin keys or Terraform provider was found.
- Evidence: searched: terraform, policy api in apps/web/app, features, lib and packages/contracts (only a connector category word and local file-protection rules matched); admin-key callers (resolveComplianceCaller) exist only on audit and legal-hold routes

## CMP-W427

**Member requests a Premium seat; owner approves**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F087-02](../../20-features/087-enterprise-administration-screens/F087-02-members-invitations-seats-and-ownership.md)
- Detail: Seat changes are made only by an admin; members have no request button.
- Evidence: apps/web/app/api/settings/team/[memberId]/seat/route.ts; searched: requestSeat, seat request in features/settings

## CMP-W428

**Members blocked by a spend limit view**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F087-11](../../20-features/087-enterprise-administration-screens/F087-11-usage-budgets-and-spend-limits.md)
- Detail: Admins cannot see who is blocked or near a limit.
- Evidence: searched: blocked members, nearLimit in apps/web/features/workspace-console

## CMP-W429

**Members can invite teammates (member-to-member invites)**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F087-01](../../20-features/087-enterprise-administration-screens/F087-01-overview-and-policy-diagnostics.md), [F087-02](../../20-features/087-enterprise-administration-screens/F087-02-members-invitations-seats-and-ownership.md)
- Detail: Only owners and admins invite; the allowMemberInvites setting is refused as not available yet.
- Evidence: apps/web/app/api/settings/organization/route.ts:66,375-383

## CMP-W433

**No seat assigned: park a member without removing**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F087-02](../../20-features/087-enterprise-administration-screens/F087-02-members-invitations-seats-and-ownership.md)
- Detail: Seat type is Standard or Premium only; no unassigned state that keeps the member but removes access.
- Evidence: apps/web/app/api/settings/team/[memberId]/seat/route.ts:29

## CMP-W437

**Org-authorized connectors for all members and Entra consent**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F087-06](../../20-features/087-enterprise-administration-screens/F087-06-model-feature-and-tool-access.md), [F087-07](../../20-features/087-enterprise-administration-screens/F087-07-connectors-skills-and-private-marketplace.md)
- Detail: Each member connects their own account; there is no one-time organization authorization or tenant consent step.
- Evidence: searched: org-authorized connector, admin consent, tenant in apps/web/lib/connectors, features/workspace-console

## CMP-W440

**Organization AI policy shown to members periodically**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F087-08](../../20-features/087-enterprise-administration-screens/F087-08-sharing-publishing-and-memory.md)
- Detail: No workspace policy notice shown to members.
- Evidence: searched: aiPolicy, policy reminder, usage policy in apps/web,features

## CMP-W442

**Organization instructions applied to every conversation**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F087-08](../../20-features/087-enterprise-administration-screens/F087-08-sharing-publishing-and-memory.md)
- Detail: No workspace-wide instructions field.
- Evidence: searched: organization instructions, orgInstructions in apps/web, packages/ui/unified-chat

## CMP-W448

**Ranked group configurations**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F087-03](../../20-features/087-enterprise-administration-screens/F087-03-roles-custom-roles-and-groups.md)
- Detail: Exceptions can only narrow and combine; no ranking exists.
- Evidence: packages/contracts/types/src/enterprise/workspace-controls.ts:40; searched: rank, priority in app/api/settings/organization/policy/overrides

## CMP-W450

**Restrict organization creation on verified domains**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F087-04](../../20-features/087-enterprise-administration-screens/F087-04-sign-in-domains-and-directory-sync.md)
- Detail: Domain verification exists for SSO only; nothing stops people on the domain from creating other accounts.
- Evidence: searched: restrictOrganizationCreation, orgCreation in apps/web; apps/web/app/api/admin/sso/verify-domain/route.ts

## CMP-W463

**Tenant restrictions via network proxy header**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F087-01](../../20-features/087-enterprise-administration-screens/F087-01-overview-and-policy-diagnostics.md), [F087-03](../../20-features/087-enterprise-administration-screens/F087-03-roles-custom-roles-and-groups.md), [F087-06](../../20-features/087-enterprise-administration-screens/F087-06-model-feature-and-tool-access.md)
- Detail: No tenant restriction header support.
- Evidence: searched: tenantRestriction, allowed org ids in apps/web

## CMP-W465

**Workspace cap on access token lifetime**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F087-05](../../20-features/087-enterprise-administration-screens/F087-05-service-accounts-and-admin-api-keys.md)
- Detail: The expiry is chosen per key; no workspace maximum.
- Evidence: searched: maxTokenLifetime, token expiration limit in apps/web/features/workspace-console, lib

## CMP-W466

**Workspace discovery and auto-join for company email**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F087-04](../../20-features/087-enterprise-administration-screens/F087-04-sign-in-domains-and-directory-sync.md)
- Detail: Verified domains exist but no discover-and-request-to-join flow.
- Evidence: searched: autoJoin, discoverable, joinRequest in apps/web; apps/web/lib/services/organization-verified-domains.ts

## CMP-WP271

**Admin API to manage members, invitations and groups with an admin key**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F087-05](../../20-features/087-enterprise-administration-screens/F087-05-service-accounts-and-admin-api-keys.md)
- Detail: Key-authenticated routes were found only for the audit trail and legal-hold exports Workspace admin keys with expiry exist, but key-authenticated routes were found only for the audit trail and legal-hold exports; members, invitations and groups are managed in the console.
- Evidence: apps/web/features/workspace-console/components/WorkspaceApiKeys.tsx:37-42; resolveComplianceCaller used only in app/api/settings/organization/audit and legal-holds routes

## CMP-WP272

**Analytics and usage API with admin key**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F087-11](../../20-features/087-enterprise-administration-screens/F087-11-usage-budgets-and-spend-limits.md)
- Detail: There is no engagement or per-user skill, connector and cost API Admin API keys can read one usage report route, but there is no engagement or per-user skill, connector and cost API.
- Evidence: apps/web/lib/server/service-principals/route-access.ts:96; searched: read:analytics in apps/web

## CMP-WP274

**Compliance API and analytics API for the workspace**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F087-12](../../20-features/087-enterprise-administration-screens/F087-12-billing-compliance-legal-holds-and-support-access.md)
- Detail: No separate compliance API Audit export, audit streaming and usage report endpoints with workspace admin API keys; no separate compliance API.
- Evidence: apps/web/app/api/settings/organization/usage-report/route.ts; audit/export/route.ts

## CMP-WP275

**Compliance API and third-party DLP, SIEM, eDiscovery integrations**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F087-12](../../20-features/087-enterprise-administration-screens/F087-12-billing-compliance-legal-holds-and-support-access.md)
- Detail: No Compliance API for conversations and files Audit streaming and export reach a SIEM, but no Compliance API for conversations and files.
- Evidence: apps/web/app/api/cron/drain-audit-streams/route.ts; searched: compliance api in apps/web/app,lib

## CMP-WP276

**Compliance API for chat and file content**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F087-12](../../20-features/087-enterprise-administration-screens/F087-12-billing-compliance-legal-holds-and-support-access.md)
- Detail: An API does return content for compliance: the legal-hold eDiscovery export streams held messages with their text, proj… An API does return content for compliance: the legal-hold eDiscovery export streams held messages with their text, projects, files and artifacts (lib/services/ediscovery-export-service.ts:56-57,117; app/api/settings/organization/legal-holds/[holdId]/export/route.ts), callable by an admin key or serv
- Evidence: searched: compliance api, eDiscovery in apps/web/app/api; apps/web/features/workspace-console/components/WorkspaceAuditStreaming.tsx

## CMP-WP277

**Connector permission levels set by role**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F087-06](../../20-features/087-enterprise-administration-screens/F087-06-model-feature-and-tool-access.md), [F087-07](../../20-features/087-enterprise-administration-screens/F087-07-connectors-skills-and-private-marketplace.md)
- Detail: Admins cannot set a tool-level level per role Members set Always allow, Needs approval or Blocked per tool, and admins allow or block connectors and plugins, but admins cannot set a tool-level level per role.
- Evidence: apps/web/app/api/llm/v1/chat/completions/lib/connector-tool-permissions.ts:30-40; features/workspace-console/components/WorkspaceConnectorPolicy.tsx

## CMP-WP278

**Default model and effort ceiling per role**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F087-06](../../20-features/087-enterprise-administration-screens/F087-06-model-feature-and-tool-access.md)
- Detail: No per-model caps or efficient mode preset A workspace default model and one effort ceiling exist, with group and person exceptions and a Fast mode switch, but no per-model caps or efficient mode preset.
- Evidence: apps/web/app/api/settings/organization/policy/controls-schema.ts:46-58

## CMP-WP280

**IdP group to role and seat mapping**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F087-04](../../20-features/087-enterprise-administration-screens/F087-04-sign-in-domains-and-directory-sync.md)
- Detail: Groups do not map to seat tiers IdP groups map to a role and the strongest role wins; groups do not map to seat tiers.
- Evidence: apps/web/features/admin/pages/DirectorySyncAdminPage.tsx:601-640

## CMP-WP282

**Just-in-time provisioning at first SSO sign-in**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F087-04](../../20-features/087-enterprise-administration-screens/F087-04-sign-in-domains-and-directory-sync.md)
- Detail: Ours is on by default (db/neon/0204_sso_jit_provisioning.sql:16) and the on/off and default role can only be changed th… Not Better. Both leaders have JIT with an admin control (catalog ch02:207, ch02:212, oh01:101). Ours is on by default (db/neon/0204_sso_jit_provisioning.sql:16) and the on/off and default role can only be changed through the API (app/api/admin/sso/[id]/route.ts:46-47); no file under apps/web/feature
- Evidence: apps/web/app/api/admin/sso/[id]/route.ts:46-47; apps/web/lib/server/sso/jit-provisioning.ts

## CMP-WP283

**Maximum reasoning level per model and role**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F087-06](../../20-features/087-enterprise-administration-screens/F087-06-model-feature-and-tool-access.md)
- Detail: Not per model One workspace-wide max reasoning cap (also per role via overrides); not per model; no speed control.
- Evidence: apps/web/app/api/settings/organization/policy/controls-schema.ts:36

## CMP-WP285

**Org spend limit with enforcement and alert**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F087-11](../../20-features/087-enterprise-administration-screens/F087-11-usage-budgets-and-spend-limits.md)
- Detail: Per-user, per-group and seat-type limits and alerts do not One workspace limit that records or stops managed turns exists; per-user, per-group and seat-type limits and alerts do not.
- Evidence: apps/web/features/workspace-console/components/WorkspaceSpendLimit.tsx; app/api/settings/organization/spend-limit/route.ts

## CMP-WP286

**Organization default model and default effort**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F087-06](../../20-features/087-enterprise-administration-screens/F087-06-model-feature-and-tool-access.md)
- Detail: Workspace default model and a maximum effort cap, no separate default effort Workspace default model and a maximum effort cap, no separate default effort; per-role through overrides.
- Evidence: apps/web/app/api/settings/organization/policy/controls-schema.ts:34-38

## CMP-WP288

**Plugin marketplace allow and block lists**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F087-07](../../20-features/087-enterprise-administration-screens/F087-07-connectors-skills-and-private-marketplace.md)
- Detail: No marketplace-level lists or GitHub sync Admins approve or block plugins by name; no marketplace-level lists or GitHub sync.
- Evidence: apps/web/features/workspace-console/components/WorkspaceConnectorPolicy.tsx:221,230

## CMP-WP289

**Roles with per-feature capability toggles (code, research, plugins, browser, etc.)**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F087-03](../../20-features/087-enterprise-administration-screens/F087-03-roles-custom-roles-and-groups.md)
- Detail: Overrides only narrow Feature switches and overrides can target a role, group, project, device or user, but overrides only narrow; roles never grant extra.
- Evidence: packages/contracts/types/src/enterprise/workspace-controls.ts:3-18,186-192

## CMP-WP290

**Seat types, default seat type and seat changes**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F087-02](../../20-features/087-enterprise-administration-screens/F087-02-members-invitations-seats-and-ownership.md)
- Detail: No default seat type, bulk change or reduction schedule exists Standard and Premium seats move by owner only, but no default seat type, bulk change or reduction schedule exists. Sales are off before 2027-01-01.
- Evidence: apps/web/app/api/settings/team/seat-types/route.ts; features/settings/sections/TeamSection.tsx

## CMP-WP292

**Share projects and Public projects toggles**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F023-07](../../20-features/023-project-workspace/F023-07-sharing-members-and-roles.md), [F087-08](../../20-features/087-enterprise-administration-screens/F087-08-sharing-publishing-and-memory.md)
- Detail: No separate public-projects toggle One external-sharing switch plus per-role content-share permissions; no separate public-projects toggle.
- Evidence: apps/web/features/settings/sections/WorkspacePolicySection.tsx:457-467

## CMP-WP295

**Spend limits at organization, group or member level**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F087-11](../../20-features/087-enterprise-administration-screens/F087-11-usage-budgets-and-spend-limits.md)
- Detail: No group or member caps One monthly spend cap with alert threshold for the whole workspace; no group or member caps.
- Evidence: apps/web/app/api/settings/organization/spend-limit/route.ts:41-48

## CMP-WP296

**Spend limits per user, seat tier or group, with pooled group budgets and alerts**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F087-11](../../20-features/087-enterprise-administration-screens/F087-11-usage-budgets-and-spend-limits.md)
- Detail: No per-member, per-group or pooled budget One workspace monthly cap with a single alert threshold; no per-member, per-group or pooled budget.
- Evidence: apps/web/app/api/settings/organization/spend-limit/route.ts:42-44

## CMP-WP298

**Usage analytics broken down by model, product, member and reasoning**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F087-11](../../20-features/087-enterprise-administration-screens/F087-11-usage-budgets-and-spend-limits.md)
- Detail: No reasoning, speed, plugin or skill breakdowns Daily credits and breakdowns by member, product area, model and provider with export; no reasoning, speed, plugin or skill breakdowns.
- Evidence: apps/web/features/workspace-console/components/WorkspaceUsageAnalytics.tsx:349-369

## CMP-WP299

**Workspace adoption analytics: active users, seat use, top tools, CSV**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F087-11](../../20-features/087-enterprise-administration-screens/F087-11-usage-budgets-and-spend-limits.md)
- Detail: No active-user trends or top connector, skill or project views Ours shows credits, tokens, turns, active members and daily credits by member, model, provider and product area with CSV export, but no active-user trends or top connector, skill or project views.
- Evidence: apps/web/features/workspace-console/components/WorkspaceUsageAnalytics.tsx

## CMP-WP300

**Workspace cancellation, deactivation and reactivation**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F087-09](../../20-features/087-enterprise-administration-screens/F087-09-data-retention-region-keys-network-and-managed-cli.md), [F087-12](../../20-features/087-enterprise-administration-screens/F087-12-billing-compliance-legal-holds-and-support-access.md)
- Detail: No kept-data deactivated state or reactivation Owners schedule deletion with a cancellation window; no kept-data deactivated state or reactivation.
- Evidence: apps/web/app/api/settings/organization/route.ts:500-567; app/api/settings/organization/deletion/cancel

## CMP-WP301

**Workspace name, logo and workspace-wide instructions**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F087-08](../../20-features/087-enterprise-administration-screens/F087-08-sharing-publishing-and-memory.md)
- Detail: No logo and no workspace-wide instructions Owners can rename the workspace and its slug; no logo and no workspace-wide instructions.
- Evidence: apps/web/app/api/settings/organization/route.ts:384-421

## CMP-WP302

**Zero data retention on request**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F087-09](../../20-features/087-enterprise-administration-screens/F087-09-data-retention-region-keys-network-and-managed-cli.md), [F087-12](../../20-features/087-enterprise-administration-screens/F087-12-billing-compliance-legal-holds-and-support-access.md)
- Detail: Our own service still stores the chats, files and memory, so it is not the leaders' zero data retention, where the vend… The switch only restricts routing to upstream model providers with zero retention (WorkspacePolicySection.tsx:664-670; request-processor.ts:4702-4725). Our own service still stores the chats, files and memory, so it is not the leaders' zero data retention, where the vendor keeps no prompts or output
- Evidence: apps/web/features/settings/sections/WorkspacePolicySection.tsx:664-670

## CMP-WP311

**Admin-set maximum session length (forced re-login)**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F087-09](../../20-features/087-enterprise-administration-screens/F087-09-data-retention-region-keys-network-and-managed-cli.md)
- Detail: It is one deployment setting, not an admin choice per workspace Sessions end after an absolute lifetime, but it is one deployment setting, not an admin choice per workspace.
- Evidence: apps/web/lib/auth/session-policy.ts:1-30

## CMP-WP314

**Analytics viewer role that sees usage but cannot administer**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F087-03](../../20-features/087-enterprise-administration-screens/F087-03-roles-custom-roles-and-groups.md)
- Detail: No role is scoped to usage analytics alone Custom roles grant view or manage per admin area (audit, billing), but no role is scoped to usage analytics alone.
- Evidence: packages/contracts/types/src/enterprise/permissions.ts:8-22; searched: analyticsViewer, analytics_viewer in apps/web

## CMP-WP317

**Artifact events in audit and compliance feed**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F087-10](../../20-features/087-enterprise-administration-screens/F087-10-audit-trail-and-exports.md)
- Detail: No artifact publish or delete feed and no list, read or delete API Audit has share grant and revoke events; no artifact publish or delete feed and no list, read or delete API.
- Evidence: apps/web/lib/security-audit.ts:343-344; searched: artifact_published in apps/web/lib

## CMP-WP319

**Automatic account creation for verified domains and join auto-approval**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F087-04](../../20-features/087-enterprise-administration-screens/F087-04-sign-in-domains-and-directory-sync.md)
- Detail: Verified-domain sign-in without SSO does not add members and no auto-approve setting exists Single sign-on can create accounts just in time, but verified-domain sign-in without SSO does not add members and no auto-approve setting exists.
- Evidence: apps/web/lib/server/sso/jit-provisioning.ts

## CMP-WP321

**Customer-managed encryption keys**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F087-09](../../20-features/087-enterprise-administration-screens/F087-09-data-retention-region-keys-network-and-managed-cli.md)
- Detail: OrganizationKeyRing is called only from lib/services/audit-streaming-service.ts:156,165) A workspace key seals one store only: the audit-stream destination secret (apps/web/lib/crypto/connector-secret-reseal.ts:109-118 WORKSPACE_SEALED_STORES; organizationKeyRing is called only from lib/services/audit-streaming-service.ts:156,165). Chats, projects and files are not encrypted with it, wh
- Evidence: apps/web/features/workspace-console/components/WorkspaceEncryptionKey.tsx:42

## CMP-WP322

**Data region and inference region shown to admins**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F087-09](../../20-features/087-enterprise-administration-screens/F087-09-data-retention-region-keys-network-and-managed-cli.md)
- Detail: No inference region is shown Enterprise admins choose a data region; no inference region is shown.
- Evidence: apps/web/features/workspace-console/components/WorkspaceDataRegion.tsx

## CMP-WP323

**Data residency region for the workspace**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F087-09](../../20-features/087-enterprise-administration-screens/F087-09-data-retention-region-keys-network-and-managed-cli.md)
- Detail: The console panel only records a requested region (lib/se Our own public text says this is not built: apps/web/app/faq/page.tsx:94 lists data-region pinning under 'What is NOT built', and app/enterprise/__tests__/enterprise-claims.test.ts:172 holds the enterprise page to promising no data residency. The console panel only records a requested region (lib/se
- Evidence: apps/web/app/api/settings/organization/data-region/route.ts

## CMP-WP325

**External sharing and single-artifact allow switches**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F087-08](../../20-features/087-enterprise-administration-screens/F087-08-sharing-publishing-and-memory.md)
- Detail: No separate switches per link kind or per artifact One workspace external-sharing switch exists; no separate switches per link kind or per artifact.
- Evidence: apps/web/app/api/settings/organization/policy/route.ts:70

## CMP-WP333

**Provision skills to the whole org or to groups**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F087-07](../../20-features/087-enterprise-administration-screens/F087-07-connectors-skills-and-private-marketplace.md)
- Detail: No standalone org skill upload Skills ship inside workspace plugins pushed by install preference or group; no standalone org skill upload.
- Evidence: apps/web/lib/services/organization-plugin-service.ts

## CMP-WP334

**Publishing policy for members: review, open or off, with a review queue**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F087-07](../../20-features/087-enterprise-administration-screens/F087-07-connectors-skills-and-private-marketplace.md)
- Detail: The workspace owner has no publishing policy Member submissions go to a platform-side review queue; the workspace owner has no publishing policy.
- Evidence: apps/web/app/api/plugins/submissions/route.ts; app/admin/plugins/page.tsx

## CMP-WP338

**Review a member's direct roles and effective permissions**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F087-03](../../20-features/087-enterprise-administration-screens/F087-03-roles-custom-roles-and-groups.md)
- Detail: No combined effective-permissions view on the member Roles page lists additional roles per member; no combined effective-permissions view on the member.
- Evidence: apps/web/features/workspace-console/components/WorkspaceRoles.tsx

## CMP-WP340

**Revoke a group's access to shared projects, skills and plugins**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F023-07](../../20-features/023-project-workspace/F023-07-sharing-members-and-roles.md), [F087-03](../../20-features/087-enterprise-administration-screens/F087-03-roles-custom-roles-and-groups.md)
- Detail: No group-wide revoke Shared items can be withdrawn one at a time; no group-wide revoke.
- Evidence: apps/web/app/api/settings/organization/shared/projects/[projectId]/route.ts

## CMP-WP342

**Sign a member out everywhere**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F087-09](../../20-features/087-enterprise-administration-screens/F087-09-data-retention-region-keys-network-and-managed-cli.md)
- Detail: There is no sign-out-and-keep-member action Removing a member revokes their sessions, device tokens and API keys, but there is no sign-out-and-keep-member action.
- Evidence: apps/web/app/api/settings/organization/members/[userId]/route.ts:153-165

## CMP-X29

**Managed install through Chrome management**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Chrome
- Features: [F087-09](../../20-features/087-enterprise-administration-screens/F087-09-data-retention-region-keys-network-and-managed-cli.md)
- Detail: The cited manifest lines only register a schema for managed settings (apps/extension/manifest.json:36-38). A managed install needs a Web Store listing or a self-hosted update URL. Repo docs say the release workflow has never run and store availability is unverified (docs/product/competitive-guidance
- Evidence: apps/extension/manifest.json:36-38

## GAP-AREA087-LW02

**Seat totals fall back to the plan's member maximum when the invitations response has no seat data, so the screen can show a seat count that the server did not return.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-087
- Detail: Area 87. Enterprise administration screens
- Evidence: apps/web/features/settings/sections/TeamSection.tsx:433-435

## GAP-AREA087-LW03

**Data region: a move to EU is refused until the EU variables are set, so the console can show a region choice that cannot be used yet. Status is partial on web and desktop.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-087
- Detail: Area 87. Enterprise administration screens
- Evidence: apps/web/app/api/settings/organization/data-region/route.ts:148-160; apps/web/lib/server/data-region.ts:20-25

## GAP-AREA087-LW04

**Group and per-user spend limits (S87.31, S87.32) have no code; the only spend limit is per workspace.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-087
- Detail: Area 87. Enterprise administration screens
- Evidence: apps/web/app/api/settings/organization/spend-limit/route.ts:75-100 (single workspace limit)

## GAP-CAP-teams-and-admin-01

**Workspace with members and invitations: Missing: bulk invite by CSV, member-to-member invites, member list CSV export, mobile gaps (MP105 partial).**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F087-01](../../20-features/087-enterprise-administration-screens/F087-01-overview-and-policy-diagnostics.md), [F087-02](../../20-features/087-enterprise-administration-screens/F087-02-members-invitations-seats-and-ownership.md)
- Requirement items: S87.01, S87.02, S87.03
- Detail: Claude yes, ChatGPT yes; AGI built

## GAP-CAP-teams-and-admin-02

**Built-in roles and role changes: Analytics-viewer role and direct-role review are partial (WP314, WP338).**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F087-03](../../20-features/087-enterprise-administration-screens/F087-03-roles-custom-roles-and-groups.md)
- Requirement items: S87.05
- Detail: Claude yes, ChatGPT yes; AGI built

## GAP-CAP-teams-and-admin-04

**Custom roles and delegated admin areas: Per-feature toggles for code, research, browser are partial (WP289).**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F087-03](../../20-features/087-enterprise-administration-screens/F087-03-roles-custom-roles-and-groups.md)
- Requirement items: S87.06
- Detail: Claude yes, ChatGPT yes; AGI built

## GAP-CAP-teams-and-admin-05

**Groups: manual, directory-synced, dynamic: No dynamic groups, ranked group configs or group visibility settings.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F087-03](../../20-features/087-enterprise-administration-screens/F087-03-roles-custom-roles-and-groups.md)
- Requirement items: S87.04
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-teams-and-admin-06

**Seat types and seat management: No park-a-member without a seat, no member request for a Premium seat; seat changes partial.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F087-02](../../20-features/087-enterprise-administration-screens/F087-02-members-invitations-seats-and-ownership.md)
- Requirement items: S87.07
- Detail: Claude yes, ChatGPT yes; AGI built

## GAP-CAP-teams-and-admin-07

**Domain verification, domain capture and join rules: No domain capture, allowed-domain joining, discovery, or restrict-org-creation.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F087-04](../../20-features/087-enterprise-administration-screens/F087-04-sign-in-domains-and-directory-sync.md)
- Requirement items: S87.09
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-teams-and-admin-08

**Single sign-on (SAML and OIDC): Mobile sign-in chooser is partial (MP109).**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F087-04](../../20-features/087-enterprise-administration-screens/F087-04-sign-in-domains-and-directory-sync.md)
- Requirement items: S87.10
- Detail: Claude yes, ChatGPT yes; AGI built

## GAP-CAP-teams-and-admin-10

**Directory provisioning: SCIM and just-in-time: Group-to-role and seat mapping partial; no sync preview or manual Sync now.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F087-04](../../20-features/087-enterprise-administration-screens/F087-04-sign-in-domains-and-directory-sync.md)
- Requirement items: S87.11
- Detail: Claude yes, ChatGPT yes; AGI built

## GAP-CAP-teams-and-admin-11

**Network and session security: IP allowlist, MFA, session length: Max session length and sign out everywhere are partial.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F087-09](../../20-features/087-enterprise-administration-screens/F087-09-data-retention-region-keys-network-and-managed-cli.md)
- Requirement items: S87.26
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-teams-and-admin-12

**Model and provider access policy: Mobile and VS Code do not read the policy; effort caps partial.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F087-06](../../20-features/087-enterprise-administration-screens/F087-06-model-feature-and-tool-access.md)
- Requirement items: S87.13, S87.14
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-teams-and-admin-13

**Feature switches with role and group exceptions: CLI reads only the hooks switch map; no desktop switches for dictation or voice (D148).**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F087-01](../../20-features/087-enterprise-administration-screens/F087-01-overview-and-policy-diagnostics.md), [F087-06](../../20-features/087-enterprise-administration-screens/F087-06-model-feature-and-tool-access.md)
- Requirement items: S87.14, S87.39
- Detail: Claude yes, ChatGPT yes; AGI built

## GAP-CAP-teams-and-admin-14

**Connector, app, MCP and per-tool policy: No org-authorised connectors for all members, no company-domain account limits, no member request flow.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F087-06](../../20-features/087-enterprise-administration-screens/F087-06-model-feature-and-tool-access.md), [F087-07](../../20-features/087-enterprise-administration-screens/F087-07-connectors-skills-and-private-marketplace.md)
- Requirement items: S87.15, S87.16
- Detail: Claude yes, ChatGPT yes; AGI built

## GAP-CAP-teams-and-admin-15

**Skills, plugins and private marketplace: No bulk plugin availability, no GitHub marketplace sync (W407); review queue partial.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F087-07](../../20-features/087-enterprise-administration-screens/F087-07-connectors-skills-and-private-marketplace.md)
- Requirement items: S87.17, S87.18
- Detail: Claude yes, ChatGPT yes; AGI built

## GAP-CAP-teams-and-admin-16

**Sharing and publishing controls: Disable sharing of connector chats missing (W406).**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F087-08](../../20-features/087-enterprise-administration-screens/F087-08-sharing-publishing-and-memory.md)
- Requirement items: S87.19, S87.20, S87.21
- Detail: Claude yes, ChatGPT yes; AGI built

## GAP-CAP-teams-and-admin-17

**Retention, legal holds and deletion: Zero data retention on request partial.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F087-09](../../20-features/087-enterprise-administration-screens/F087-09-data-retention-region-keys-network-and-managed-cli.md), [F087-12](../../20-features/087-enterprise-administration-screens/F087-12-billing-compliance-legal-holds-and-support-access.md)
- Requirement items: S87.23, S87.37
- Detail: Claude yes, ChatGPT yes; AGI built

## GAP-CAP-teams-and-admin-18

**Data residency and customer-managed keys: Region screen exists although the 2026-09-04 decision said no region UI before a second region; EU stack is owner-pending. The key seals one store only (WP321).**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F087-09](../../20-features/087-enterprise-administration-screens/F087-09-data-retention-region-keys-network-and-managed-cli.md)
- Requirement items: S87.24, S87.25
- Detail: Claude partly, ChatGPT yes; AGI partly built

## GAP-CAP-teams-and-admin-19

**Audit log viewer, export and streaming: Streaming to an OpenTelemetry collector partial.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F087-10](../../20-features/087-enterprise-administration-screens/F087-10-audit-trail-and-exports.md)
- Requirement items: S87.28, S87.29
- Detail: Claude yes, ChatGPT yes; AGI built

## GAP-CAP-teams-and-admin-20

**Compliance API and eDiscovery export: No vendor integrations (DLP, SIEM, archive) and no general content API (WP275-276 partial).**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F087-12](../../20-features/087-enterprise-administration-screens/F087-12-billing-compliance-legal-holds-and-support-access.md)
- Requirement items: S87.36
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-teams-and-admin-21

**Usage analytics and cost visibility: No group analytics, insights, surveys or analytics chat.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F087-11](../../20-features/087-enterprise-administration-screens/F087-11-usage-budgets-and-spend-limits.md)
- Requirement items: S87.30
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-teams-and-admin-22

**Spend limits and budgets: Ledger says group and user limits missing; comparison rows say partial. Request-more flow missing.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F087-11](../../20-features/087-enterprise-administration-screens/F087-11-usage-budgets-and-spend-limits.md)
- Requirement items: S87.31, S87.32, S87.33
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-teams-and-admin-23

**Billing administration: Cancel, deactivate, reactivate partial.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F087-12](../../20-features/087-enterprise-administration-screens/F087-12-billing-compliance-legal-holds-and-support-access.md)
- Requirement items: S87.34
- Detail: Claude yes, ChatGPT yes; AGI built

## GAP-CAP-teams-and-admin-24

**Admin API keys and service accounts: No token lifetime cap, no Terraform management, member and invitation admin API partial.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F087-05](../../20-features/087-enterprise-administration-screens/F087-05-service-accounts-and-admin-api-keys.md)
- Requirement items: S87.12, S87.40
- Detail: Claude yes, ChatGPT yes; AGI built

## GAP-CAP-teams-and-admin-25

**Managed configuration for apps and coding tools: No MDM for Desktop or Mobile, no forced login method, no rollout controls (S87.38 missing), no company gateway.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F087-09](../../20-features/087-enterprise-administration-screens/F087-09-data-retention-region-keys-network-and-managed-cli.md)
- Requirement items: S87.27, S87.38
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-teams-and-admin-26

**Organization memory and workspace-wide instructions: No org instructions, no AI policy reminder.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F087-08](../../20-features/087-enterprise-administration-screens/F087-08-sharing-publishing-and-memory.md)
- Requirement items: S87.22
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-F087-01-01

**Diagnostics cannot explain model, connector, sharing or export refusals.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F087-01](../../20-features/087-enterprise-administration-screens/F087-01-overview-and-policy-diagnostics.md)
- Detail: Affects: Admins on web and desktop. Work needed: Add asks for model access and connector policy, or link to those pages' own explanations.
- Evidence: diagnose/route.ts:61-65 builds only feature and managed_compute asks

## GAP-F087-01-02

**Plan name is not in the overview.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F087-01](../../20-features/087-enterprise-administration-screens/F087-01-overview-and-policy-diagnostics.md)
- Detail: Affects: Admins. Work needed: Add a plan row or confirm the brief wording.
- Evidence: workspace-posture-service.ts groups list has no plan row; brief S87.01 names plan

## GAP-F087-01-03

**Mobile admin section can show an error to non-admin members.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F087-01](../../20-features/087-enterprise-administration-screens/F087-01-overview-and-policy-diagnostics.md)
- Detail: Affects: Mobile members on a Team plan. Work needed: Gate by role as well as plan.
- Evidence: settings/workspace.tsx:340,664; administration.ts:185

## GAP-F087-01-04

**No CLI equivalent.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F087-01](../../20-features/087-enterprise-administration-screens/F087-01-overview-and-policy-diagnostics.md)
- Detail: Affects: CLI users. Work needed: Decide whether the CLI needs one; the web console may be enough.
- Evidence: no CLI file references the endpoints

## GAP-F087-01-05

**Plan refusal shows the generic 'not an administrator' card.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F087-01](../../20-features/087-enterprise-administration-screens/F087-01-overview-and-policy-diagnostics.md)
- Detail: Affects: Admins on a lower plan. Work needed: Read the refusal code and show an upgrade message.
- Evidence: use-workspace-posture.ts:64

## GAP-F087-01-NOTBUILT

**Overview and policy diagnostics: not built on CLI**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: CLI
- Features: [F087-01](../../20-features/087-enterprise-administration-screens/F087-01-overview-and-policy-diagnostics.md)
- Requirement items: S87.01, S87.39
- Detail: CLI: S87.01, S87.39

## GAP-F087-02-01

**Seat hint says revoking an invitation frees a seat, but invitations seem not to hold seats.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F087-02](../../20-features/087-enterprise-administration-screens/F087-02-members-invitations-seats-and-ownership.md)
- Detail: Affects: Admins on web. Work needed: Verify in the database and align text or behaviour.
- Evidence: TeamSection.tsx:1044 versus seats_consumed counting members at 0085:139-143

## GAP-F087-02-02

**No CLI support for any of these actions.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F087-02](../../20-features/087-enterprise-administration-screens/F087-02-members-invitations-seats-and-ownership.md)
- Detail: Affects: CLI users. Work needed: Product decision.
- Evidence: no CLI references found

## GAP-F087-02-03

**Mobile removal cannot show which credentials were not cleaned.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F087-02](../../20-features/087-enterprise-administration-screens/F087-02-members-invitations-seats-and-ownership.md)
- Detail: Affects: Mobile admins. Work needed: Surface warning detail.
- Evidence: team/service.ts:179-187 returns only cleanupComplete

## GAP-F087-02-04

**Seat purchase is not in-page on web and not found on mobile.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F087-02](../../20-features/087-enterprise-administration-screens/F087-02-members-invitations-seats-and-ownership.md)
- Detail: Affects: Admins. Work needed: Confirm the intended path for 'seats can be added'.
- Evidence: TeamSection.tsx:915-925 links to pricing

## GAP-F087-02-NOTBUILT

**Members, invitations, seats and ownership: not built on CLI**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: CLI
- Features: [F087-02](../../20-features/087-enterprise-administration-screens/F087-02-members-invitations-seats-and-ownership.md)
- Requirement items: S87.02, S87.03, S87.07, S87.08
- Detail: CLI: S87.02, S87.03, S87.07, S87.08

## GAP-F087-03-01

**Mobile has no custom role or group management.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F087-03](../../20-features/087-enterprise-administration-screens/F087-03-roles-custom-roles-and-groups.md)
- Detail: Affects: Mobile admins. Work needed: Product decision.
- Evidence: mobile team files only call PATCH role (team/service.ts:155-160)

## GAP-F087-03-02

**CLI has none.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F087-03](../../20-features/087-enterprise-administration-screens/F087-03-roles-custom-roles-and-groups.md)
- Detail: Affects: CLI. Work needed: Product decision.
- Evidence: no references

## GAP-F087-03-03

**Empty and failure states for groups not confirmed.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F087-03](../../20-features/087-enterprise-administration-screens/F087-03-roles-custom-roles-and-groups.md)
- Detail: Affects: Web. Work needed: Check WorkspaceRoles groups section.
- Evidence: not read

## GAP-F087-03-04

**The brief names 'sync groups'; sync is only through the SCIM endpoint, with no console sync button found.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F087-03](../../20-features/087-enterprise-administration-screens/F087-03-roles-custom-roles-and-groups.md)
- Detail: Affects: Admins. Work needed: Clarify brief wording.
- Evidence: groups/route.ts has create; sync via scim/v2/Groups/route.ts

## GAP-F087-03-NOTBUILT

**Roles, custom roles and groups: not built on CLI**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: CLI
- Features: [F087-03](../../20-features/087-enterprise-administration-screens/F087-03-roles-custom-roles-and-groups.md)
- Requirement items: S87.04, S87.05, S87.06
- Detail: CLI: S87.04, S87.05, S87.06

## GAP-F087-04-01

**Requiring SSO is not available.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F087-04](../../20-features/087-enterprise-administration-screens/F087-04-sign-in-domains-and-directory-sync.md)
- Detail: Affects: Enterprise admins. Work needed: Server rule that refuses non-SSO sign-in for verified domains.
- Evidence: WorkspaceIdentityPanels.tsx:92-95

## GAP-F087-04-02

**Sign-in routing by domain not read in repository code; relies on outside service.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F087-04](../../20-features/087-enterprise-administration-screens/F087-04-sign-in-domains-and-directory-sync.md)
- Detail: Affects: SSO members. Work needed: Confirm routing behaviour by a live test.
- Evidence: sso/[id]/route.ts:300-345 only registers the connection

## GAP-F087-04-03

**No CLI or mobile surface.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F087-04](../../20-features/087-enterprise-administration-screens/F087-04-sign-in-domains-and-directory-sync.md)
- Detail: Affects: CLI, mobile. Work needed: Product decision.
- Evidence: no references

## GAP-F087-04-04

**JIT role setting editing not located.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F087-04](../../20-features/087-enterprise-administration-screens/F087-04-sign-in-domains-and-directory-sync.md)
- Detail: Affects: Admins. Work needed: Locate or add the control.
- Evidence: jit-provisioning.ts:11 field exists; UI not found

## GAP-F087-04-NOTBUILT

**Sign-in, domains and directory sync: not built on CLI**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: CLI
- Features: [F087-04](../../20-features/087-enterprise-administration-screens/F087-04-sign-in-domains-and-directory-sync.md)
- Requirement items: S87.09, S87.10, S87.11
- Detail: CLI: S87.09, S87.10, S87.11

## GAP-F087-05-01

**'No expiry' allowed, though the brief says expiring keys.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F087-05](../../20-features/087-enterprise-administration-screens/F087-05-service-accounts-and-admin-api-keys.md)
- Detail: Affects: Admins, security reviewers. Work needed: Decide policy: require expiry or flag.
- Evidence: admin-api-keys/route.ts:50; WorkspaceApiKeys.tsx:41

## GAP-F087-05-02

**Principals cannot be created without a key.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F087-05](../../20-features/087-enterprise-administration-screens/F087-05-service-accounts-and-admin-api-keys.md)
- Detail: Affects: Admins. Work needed: Optional.
- Evidence: WorkspaceServicePrincipals.tsx:187

## GAP-F087-05-03

**API reference location for the scopes not verified.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F087-05](../../20-features/087-enterprise-administration-screens/F087-05-service-accounts-and-admin-api-keys.md)
- Detail: Affects: Integrators. Work needed: Verify the doc exists.
- Evidence: WorkspaceApiKeys.tsx text links to an API reference; target not opened

## GAP-F087-05-04

**No CLI, mobile support.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F087-05](../../20-features/087-enterprise-administration-screens/F087-05-service-accounts-and-admin-api-keys.md)
- Detail: Affects: CLI. Work needed: Product decision.
- Evidence: no references

## GAP-F087-05-NOTBUILT

**Service accounts and admin API keys: not built on CLI**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: CLI
- Features: [F087-05](../../20-features/087-enterprise-administration-screens/F087-05-service-accounts-and-admin-api-keys.md)
- Requirement items: S87.12, S87.40
- Detail: CLI: S87.12, S87.40

## GAP-F087-06-01

**CLI enforces only hooks and MCP code controls from workspace features.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F087-06](../../20-features/087-enterprise-administration-screens/F087-06-model-feature-and-tool-access.md)
- Detail: Affects: CLI users. Work needed: Decide which switches the CLI must honour and wire them.
- Evidence: feature_enabled callers: hooks only (hooks.rs:1910; hooks_allowed)

## GAP-F087-06-02

**Brief cites a desktop feature gate in developerSessionService.ts that is not there.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F087-06](../../20-features/087-enterprise-administration-screens/F087-06-model-feature-and-tool-access.md)
- Detail: Affects: Desktop. Work needed: Correct the brief; confirm desktop enforcement is server side.
- Evidence: no workspace policy in electron/runtime/developerSessionService.ts (grep)

## GAP-F087-06-03

**No on-device model policy for Local or own-key turns.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F087-06](../../20-features/087-enterprise-administration-screens/F087-06-model-feature-and-tool-access.md)
- Detail: Affects: Desktop and mobile local users in governed workspaces. Work needed: Decide whether Local/BYOK should be governed by workspace policy; if so consent and boundary rules apply.
- Evidence: no policy reads in mobile, extension or electron

## GAP-F087-06-04

**Mobile and Chrome do not explain refusals.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F087-06](../../20-features/087-enterprise-administration-screens/F087-06-model-feature-and-tool-access.md)
- Detail: Affects: Mobile, Chrome. Work needed: Show server refusal text.
- Evidence: no policy reads found

## GAP-F087-06-05

**CLI tool rule enforcement for connector tools not found.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F087-06](../../20-features/087-enterprise-administration-screens/F087-06-model-feature-and-tool-access.md)
- Detail: Affects: CLI. Work needed: Verify server handles managed CLI turns.
- Evidence: claude_parity.rs only describes tool rules

## GAP-F087-06-NOTBUILT

**Model, feature and tool access: not built on CLI**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: CLI
- Features: [F087-06](../../20-features/087-enterprise-administration-screens/F087-06-model-feature-and-tool-access.md)
- Requirement items: S87.13
- Detail: CLI: S87.13

## GAP-F087-07-01

**CLI does not enforce workspace plugin allow/block lists or connector lists at install**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F087-07](../../20-features/087-enterprise-administration-screens/F087-07-connectors-skills-and-private-marketplace.md)
- Detail: Affects: CLI users in managed mode. Work needed: Call the evaluator in the plugin install and load path
- Evidence: claude_parity.rs:2412 callers only in tests; claude_parity.rs:753 only GitHub install text

## GAP-F087-07-02

**CLI has no private marketplace**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F087-07](../../20-features/087-enterprise-administration-screens/F087-07-connectors-skills-and-private-marketplace.md)
- Detail: Affects: CLI. Work needed: Add a catalogue client and install flow
- Evidence: No CLI file reads /api/plugins/organization

## GAP-F087-07-03

**No per-skill allow or block list**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F087-07](../../20-features/087-enterprise-administration-screens/F087-07-connectors-skills-and-private-marketplace.md)
- Detail: Affects: Admins wanting item-level skill control. Work needed: Decide scope and add lists or document plugin-level control
- Evidence: connector-policy/route.ts:119-129 lists only plugins

## GAP-F087-07-04

**Mobile has no enforcement path found**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F087-07](../../20-features/087-enterprise-administration-screens/F087-07-connectors-skills-and-private-marketplace.md)
- Detail: Affects: Mobile users in a governed workspace. Work needed: Confirm mobile connector availability and apply policy server side
- Evidence: No mobile reference to connector-policy

## GAP-F087-07-NOTBUILT

**Connectors, skills and private marketplace: not built on CLI**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: CLI
- Features: [F087-07](../../20-features/087-enterprise-administration-screens/F087-07-connectors-skills-and-private-marketplace.md)
- Requirement items: S87.18
- Detail: CLI: S87.18

## GAP-F087-08-01

**One switch covers share links and publishing; brief lists them as two controls**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F087-08](../../20-features/087-enterprise-administration-screens/F087-08-sharing-publishing-and-memory.md)
- Detail: Affects: Admins on web and desktop. Work needed: Decide whether to split or rewrite the requirement
- Evidence: WorkspacePolicySection.tsx:457; evaluator.ts:382

## GAP-F087-08-02

**No way to revoke existing public links from the console when sharing is turned off**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F087-08](../../20-features/087-enterprise-administration-screens/F087-08-sharing-publishing-and-memory.md)
- Detail: Affects: Admins. Work needed: Add an explicit revoke-all action if wanted
- Evidence: evaluator.ts:386 'Links already created are unaffected'

## GAP-F087-08-03

**CLI has no equivalent**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F087-08](../../20-features/087-enterprise-administration-screens/F087-08-sharing-publishing-and-memory.md)
- Detail: Affects: CLI users. Work needed: Decide whether the CLI exposes sharing at all
- Evidence: No CLI file for share/memory policy

## GAP-F087-08-04

**Memory policy behaviour on Local device memory unknown**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F087-08](../../20-features/087-enterprise-administration-screens/F087-08-sharing-publishing-and-memory.md)
- Detail: Affects: Desktop and mobile Local users. Work needed: Read local memory code and confirm
- Evidence: Only server memory service read

## GAP-F087-08-NOTBUILT

**Sharing, publishing and memory: not built on CLI**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: CLI
- Features: [F087-08](../../20-features/087-enterprise-administration-screens/F087-08-sharing-publishing-and-memory.md)
- Requirement items: S87.19, S87.20, S87.21, S87.22
- Detail: CLI: S87.19, S87.20, S87.21, S87.22

## GAP-F087-09-01

**Customer key seals only audit-stream signing secrets, not workspace chats or files**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F087-09](../../20-features/087-enterprise-administration-screens/F087-09-data-retention-region-keys-network-and-managed-cli.md)
- Detail: Affects: Enterprise buyers relying on S87.25. Work needed: Register more sealed stores or restate the claim
- Evidence: connector-secret-reseal.ts:109-118; organizationKeyRing caller audit-streaming-service.ts:156

## GAP-F087-09-02

**Region move needs manual operator cutover and a provisioned EU stack**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F087-09](../../20-features/087-enterprise-administration-screens/F087-09-data-retention-region-keys-network-and-managed-cli.md)
- Detail: Affects: Enterprise workspaces. Work needed: Owner stands up region resources and runbook
- Evidence: data-region.ts:211-221; data-residency.ts:100-111

## GAP-F087-09-03

**S87.38 rollout and release channels do not exist**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F087-09](../../20-features/087-enterprise-administration-screens/F087-09-data-retention-region-keys-network-and-managed-cli.md)
- Detail: Affects: Admins on all apps. Work needed: Design and build, or drop
- Evidence: No code found in console or API

## GAP-F087-09-04

**Web, desktop and mobile read no managed configuration**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F087-09](../../20-features/087-enterprise-administration-screens/F087-09-data-retention-region-keys-network-and-managed-cli.md)
- Detail: Affects: IT on those surfaces. Work needed: Decide scope per surface
- Evidence: Brief S87.27; only extension and CLI files found

## GAP-F087-09-05

**Docs contradict code on keys screen and region column**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F087-09](../../20-features/087-enterprise-administration-screens/F087-09-data-retention-region-keys-network-and-managed-cli.md)
- Detail: Affects: Readers of docs. Work needed: Update docs
- Evidence: enterprise-operations.md vs data/page.tsx:28; decision doc vs data-region.ts:34

## GAP-F087-09-06

**CLI managed MDM file and server policy are separate mechanisms**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F087-09](../../20-features/087-enterprise-administration-screens/F087-09-data-retention-region-keys-network-and-managed-cli.md)
- Detail: Affects: IT admins. Work needed: Document precedence
- Evidence: managed.rs:156 vs workspace_policy.rs:14

## GAP-F087-09-NOTBUILT

**Data retention, region, keys, network and managed client settings: not built on Web, Desktop, Mobile, CLI**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile, CLI
- Features: [F087-09](../../20-features/087-enterprise-administration-screens/F087-09-data-retention-region-keys-network-and-managed-cli.md)
- Requirement items: S87.23, S87.25, S87.26, S87.27, S87.38
- Detail: Web: S87.27, S87.38; Desktop: S87.27, S87.38; Mobile: S87.27; CLI: S87.23, S87.25, S87.26, S87.38

## GAP-F087-09-PARTLY

**Data retention, region, keys, network and managed client settings: partly built on Web, Desktop**

- Kind: partly built (read in the code; source: capability ledger)
- Apps: Web, Desktop
- Features: [F087-09](../../20-features/087-enterprise-administration-screens/F087-09-data-retention-region-keys-network-and-managed-cli.md)
- Requirement items: S87.24
- Detail: Web S87.24: owner: stand up the EU database, bucket, log sink and KMS, then set the AGI_DATA_REGION_EU_* variables (apps/web/lib/server/data-region.ts) | Desktop S87.24: owner: stand up the EU database, bucket, log sink and KMS, then set the AGI_DATA_REGION_EU_* variables (apps/web/lib/server/data-region.ts)

## GAP-F087-10-01

**No date range control on the Audit screen**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F087-10](../../20-features/087-enterprise-administration-screens/F087-10-audit-trail-and-exports.md)
- Detail: Affects: Admins on web and desktop. Work needed: Add date inputs
- Evidence: use-settings-queries.ts:2040-2046; WorkspaceAuditSection.tsx:167-215

## GAP-F087-10-02

**No paging in the table**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F087-10](../../20-features/087-enterprise-administration-screens/F087-10-audit-trail-and-exports.md)
- Detail: Affects: Admins reviewing history in the UI. Work needed: Add load more using nextCursor
- Evidence: WorkspaceAuditSection.tsx:330

## GAP-F087-10-03

**Export link shown when export is off**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F087-10](../../20-features/087-enterprise-administration-screens/F087-10-audit-trail-and-exports.md)
- Detail: Affects: Admins. Work needed: Reflect policy state
- Evidence: WorkspaceAuditSection.tsx:141; export route refuses

## GAP-F087-10-04

**CLI cannot read or export audit**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F087-10](../../20-features/087-enterprise-administration-screens/F087-10-audit-trail-and-exports.md)
- Detail: Affects: CLI admins. Work needed: Decide if needed
- Evidence: No CLI audit code

## GAP-F087-10-NOTBUILT

**Audit trail and exports: not built on CLI**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: CLI
- Features: [F087-10](../../20-features/087-enterprise-administration-screens/F087-10-audit-trail-and-exports.md)
- Requirement items: S87.28, S87.29
- Detail: CLI: S87.28, S87.29

## GAP-F087-11-01

**Group spending limits not implemented**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F087-11](../../20-features/087-enterprise-administration-screens/F087-11-usage-budgets-and-spend-limits.md)
- Detail: Affects: All apps. Work needed: Design group limits and enforcement
- Evidence: No code; brief S87.31

## GAP-F087-11-02

**Admin-set user spending limits not implemented**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F087-11](../../20-features/087-enterprise-administration-screens/F087-11-usage-budgets-and-spend-limits.md)
- Detail: Affects: All apps. Work needed: Admin-set per-member limits
- Evidence: Only self-set personal limits (spend-limit-service.ts:290-360)

## GAP-F087-11-03

**Two workspace caps with opposite failure behaviour**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F087-11](../../20-features/087-enterprise-administration-screens/F087-11-usage-budgets-and-spend-limits.md)
- Detail: Affects: Admins and finance. Work needed: Choose one model or align failure handling
- Evidence: spend-limit-service.ts:177 vs managed-usage-request-service.ts:300

## GAP-F087-11-04

**Brief says managed usage fails closed when the budget cannot be read; the Usage-page limit fails open**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F087-11](../../20-features/087-enterprise-administration-screens/F087-11-usage-budgets-and-spend-limits.md)
- Detail: Affects: Cloud workspaces using Usage limit. Work needed: Align code and requirement
- Evidence: spend-limit-service.ts:150-180

## GAP-F087-11-05

**Non-admins see no workspace total**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F087-11](../../20-features/087-enterprise-administration-screens/F087-11-usage-budgets-and-spend-limits.md)
- Detail: Affects: Members. Work needed: Optional total-only view
- Evidence: WorkspaceUsageAnalytics.tsx:240

## GAP-F087-11-06

**No CLI, mobile or VS Code surface**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F087-11](../../20-features/087-enterprise-administration-screens/F087-11-usage-budgets-and-spend-limits.md)
- Detail: Affects: Those apps. Work needed: Decide scope
- Evidence: No code found

## GAP-F087-11-NOTBUILT

**Usage, budgets and spend limits: not built on Web, Desktop, Mobile, CLI, VS Code**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile, CLI, VS Code
- Features: [F087-11](../../20-features/087-enterprise-administration-screens/F087-11-usage-budgets-and-spend-limits.md)
- Requirement items: S87.30, S87.31, S87.32, S87.33
- Detail: Web: S87.31, S87.32; Desktop: S87.31, S87.32; Mobile: S87.31, S87.32; CLI: S87.30, S87.31, S87.32, S87.33; VS Code: S87.31, S87.32

## GAP-F087-12-01

**Workspace admins cannot approve, deny, revoke or review support access**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F087-12](../../20-features/087-enterprise-administration-screens/F087-12-billing-compliance-legal-holds-and-support-access.md)
- Detail: Affects: Enterprise admins on all apps. Work needed: Add a workspace panel and, if required, an approval step
- Evidence: No workspace route or screen; DB read policy exists at 0229_support_access_grants.sql:163

## GAP-F087-12-02

**Billing page does not manage payment method or plan change itself**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F087-12](../../20-features/087-enterprise-administration-screens/F087-12-billing-compliance-legal-holds-and-support-access.md)
- Detail: Affects: Admins. Work needed: Read Billing settings and confirm or move controls
- Evidence: WorkspaceBillingSummary.tsx:149-165 links to Billing settings

## GAP-F087-12-03

**Hold form lacks custodian scope**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F087-12](../../20-features/087-enterprise-administration-screens/F087-12-billing-compliance-legal-holds-and-support-access.md)
- Detail: Affects: Admins with multi-person matters. Work needed: Add custodian picker
- Evidence: WorkspaceDataControls.tsx:386-387 vs legal-holds/route.ts:25

## GAP-F087-12-04

**No general workspace content export; export is per hold**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F087-12](../../20-features/087-enterprise-administration-screens/F087-12-billing-compliance-legal-holds-and-support-access.md)
- Detail: Affects: Compliance reviewers. Work needed: Clarify or add a workspace export
- Evidence: export route is under legal-holds/[holdId]

## GAP-F087-12-05

**seat_purchase billing hold has no caller**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F087-12](../../20-features/087-enterprise-administration-screens/F087-12-billing-compliance-legal-holds-and-support-access.md)
- Detail: Affects: Seat additions while past due. Work needed: Wire the ask into the seat purchase path
- Evidence: organization-policy-evaluator.ts:110 only

## GAP-F087-12-06

**Holds do not preserve connector or mailbox data**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F087-12](../../20-features/087-enterprise-administration-screens/F087-12-billing-compliance-legal-holds-and-support-access.md)
- Detail: Affects: Legal teams. Work needed: State clearly in product copy
- Evidence: doc: docs/compliance/legal-hold-and-ediscovery.md section 'What a hold can name'

## GAP-F087-12-NOTBUILT

**Billing, compliance, legal holds and support access: not built on Web, Desktop, Mobile, CLI, VS Code**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile, CLI, VS Code
- Features: [F087-12](../../20-features/087-enterprise-administration-screens/F087-12-billing-compliance-legal-holds-and-support-access.md)
- Requirement items: S87.34, S87.35, S87.36, S87.37
- Detail: Web: S87.35; Desktop: S87.35; Mobile: S87.35; CLI: S87.34, S87.35, S87.36, S87.37; VS Code: S87.35

## GAP-F087-99-NOTBUILT

**Other items in Enterprise administration screens: not built on CLI**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: CLI
- Features: [F087-99](../../20-features/087-enterprise-administration-screens/F087-99-other-items.md)
- Requirement items: S87.41, S87.42
- Detail: CLI: S87.41, S87.42

---
id: "REQ-AREA-087"
type: "requirements"
title: "Requirement items: Enterprise administration screens"
basis: "established: acceptance criteria recorded in the project's capability ledger"
source: "audit/ledger/ecosystem-capability-ledger.jsonl"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Requirement items: 87. Enterprise administration screens

40 items. Each is an established requirement: the acceptance criterion recorded for it in the project's capability ledger (`audit/ledger/ecosystem-capability-ledger.jsonl`). The status per app is what reading the code found; a result from a real run is given where one exists.

## S87.01

**Organization overview.** An administrator opens an organization overview that summarises the workspace (name, plan, members/seats, security posture) from live data.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing
- Feature: [F087-01 Overview and policy diagnostics](../../20-features/087-enterprise-administration-screens/F087-01-overview-and-policy-diagnostics.md)
- Competitor trace: CAP-teams-and-admin-01

## S87.02

**Member directory.** An administrator can list the workspace members with name, email and role.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing
- Feature: [F087-02 Members, invitations, seats and ownership](../../20-features/087-enterprise-administration-screens/F087-02-members-invitations-seats-and-ownership.md)
- Competitor trace: CAP-teams-and-admin-01

## S87.03

**Invitations.** An administrator can invite people by email with a role, see pending invitations, renew and revoke them, and the invitee can accept.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing
- Feature: [F087-02 Members, invitations, seats and ownership](../../20-features/087-enterprise-administration-screens/F087-02-members-invitations-seats-and-ownership.md)
- Competitor trace: CAP-teams-and-admin-01

## S87.04

**Groups.** An administrator can see workspace groups with their members, create or sync groups, and grant roles or permissions to a group.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, CLI missing
- Feature: [F087-03 Roles, custom roles and groups](../../20-features/087-enterprise-administration-screens/F087-03-roles-custom-roles-and-groups.md)
- Competitor trace: CAP-teams-and-admin-05

## S87.05

**Roles.** An administrator sees the workspace roles with their permissions and can change a member's role, enforced by the server.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing
- Feature: [F087-03 Roles, custom roles and groups](../../20-features/087-enterprise-administration-screens/F087-03-roles-custom-roles-and-groups.md)
- Competitor trace: CAP-teams-and-admin-02

## S87.06

**Custom roles.** An administrator can create, edit and delete a custom role from a permission set and assign it to members or groups, and the permissions take effect.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, CLI missing
- Feature: [F087-03 Roles, custom roles and groups](../../20-features/087-enterprise-administration-screens/F087-03-roles-custom-roles-and-groups.md)
- Competitor trace: CAP-teams-and-admin-04

## S87.07

**Seat assignment.** An administrator sees licensed, used and available seats, members consume and release seats, and seats can be added.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, CLI missing
- Feature: [F087-02 Members, invitations, seats and ownership](../../20-features/087-enterprise-administration-screens/F087-02-members-invitations-seats-and-ownership.md)
- Competitor trace: CAP-teams-and-admin-06

## S87.08

**Owner transfer.** The owner can hand ownership to another member after confirmation, with the server moving the owner role atomically.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing
- Feature: [F087-02 Members, invitations, seats and ownership](../../20-features/087-enterprise-administration-screens/F087-02-members-invitations-seats-and-ownership.md)
- Competitor trace: CAP-teams-and-admin-03

## S87.09

**Domain verification.** An administrator claims a company domain, publishes a DNS TXT challenge, and the product verifies ownership before routing sign-in for that domain.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, CLI missing
- Feature: [F087-04 Sign-in, domains and directory sync](../../20-features/087-enterprise-administration-screens/F087-04-sign-in-domains-and-directory-sync.md)
- Competitor trace: CAP-teams-and-admin-07

## S87.10

**SSO setup.** A workspace owner configures a SAML or OIDC connection for a verified domain, and members on that domain sign in through the identity provider.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, CLI missing
- Feature: [F087-04 Sign-in, domains and directory sync](../../20-features/087-enterprise-administration-screens/F087-04-sign-in-domains-and-directory-sync.md)
- Competitor trace: CAP-teams-and-admin-08

## S87.11

**Directory provisioning.** An administrator connects an identity provider over SCIM (connection and bearer token), and the provider creates, updates and deprovisions members.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, CLI missing
- Feature: [F087-04 Sign-in, domains and directory sync](../../20-features/087-enterprise-administration-screens/F087-04-sign-in-domains-and-directory-sync.md)
- Competitor trace: CAP-teams-and-admin-10

## S87.12

**Service accounts.** An administrator creates non-human service accounts with bounded permissions and keys that outlive their creator, and can disable them or revoke their keys.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, CLI missing
- Feature: [F087-05 Service accounts and admin API keys](../../20-features/087-enterprise-administration-screens/F087-05-service-accounts-and-admin-api-keys.md)
- Competitor trace: CAP-teams-and-admin-24

## S87.13

**Model-access policy.** An administrator allows or blocks providers and models for the workspace, and requests for a blocked model are refused.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, CLI missing
- Feature: [F087-06 Model, feature and tool access](../../20-features/087-enterprise-administration-screens/F087-06-model-feature-and-tool-access.md)
- Competitor trace: CAP-teams-and-admin-12

## S87.14

**Feature-access policy.** An administrator switches product features on or off for the workspace (with exceptions) and each switched-off feature is refused wherever it runs.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, CLI done
- Feature: [F087-06 Model, feature and tool access](../../20-features/087-enterprise-administration-screens/F087-06-model-feature-and-tool-access.md)
- Competitor trace: CAP-teams-and-admin-12, CAP-teams-and-admin-13

## S87.15

**Tool policy.** An administrator decides which individual tools members and agents may use (allow, block or require approval) and the tool loop enforces it.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, CLI done
- Feature: [F087-06 Model, feature and tool access](../../20-features/087-enterprise-administration-screens/F087-06-model-feature-and-tool-access.md)
- Competitor trace: CAP-teams-and-admin-14

## S87.16

**Connector policy.** An administrator allows or blocks connectors (and custom connectors) for the workspace, and blocked connectors are not offered or connectable.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, CLI done
- Feature: [F087-07 Connectors, skills and private marketplace](../../20-features/087-enterprise-administration-screens/F087-07-connectors-skills-and-private-marketplace.md)
- Competitor trace: CAP-teams-and-admin-14

## S87.17

**Skill and Plugin policy.** An administrator controls which skills and plugins members may install or use, per item, and the product enforces it.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, CLI done
- Feature: [F087-07 Connectors, skills and private marketplace](../../20-features/087-enterprise-administration-screens/F087-07-connectors-skills-and-private-marketplace.md)
- Competitor trace: CAP-teams-and-admin-15

## S87.18

**Private marketplace.** A workspace curates its own private catalogue of plugins, skills or servers that members browse and install, separate from the public directory.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, CLI missing
- Feature: [F087-07 Connectors, skills and private marketplace](../../20-features/087-enterprise-administration-screens/F087-07-connectors-skills-and-private-marketplace.md)
- Competitor trace: CAP-teams-and-admin-15

## S87.19

**Shared Project administration.** An administrator sees every project shared with the workspace, sets per-member access, and can stop sharing a project.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, CLI missing
- Feature: [F087-08 Sharing, publishing and memory](../../20-features/087-enterprise-administration-screens/F087-08-sharing-publishing-and-memory.md)
- Competitor trace: CAP-teams-and-admin-16

## S87.20

**External-sharing controls.** An administrator turns sharing outside the workspace on or off, and members cannot create new external share links while it is off.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, CLI missing
- Feature: [F087-08 Sharing, publishing and memory](../../20-features/087-enterprise-administration-screens/F087-08-sharing-publishing-and-memory.md)
- Competitor trace: CAP-teams-and-admin-16

## S87.21

**Public-publishing controls.** An administrator controls whether members may publish chats or artifacts publicly, and publishing is refused when it is off.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, CLI missing
- Feature: [F087-08 Sharing, publishing and memory](../../20-features/087-enterprise-administration-screens/F087-08-sharing-publishing-and-memory.md)
- Competitor trace: CAP-teams-and-admin-16

## S87.22

**Memory policy.** An administrator allows or disallows account memory for the workspace, and members get no memory while it is off.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, CLI missing
- Feature: [F087-08 Sharing, publishing and memory](../../20-features/087-enterprise-administration-screens/F087-08-sharing-publishing-and-memory.md)
- Competitor trace: CAP-teams-and-admin-26

## S87.23

**Data-retention settings.** An administrator sets how long workspace conversations are kept and, when enforced, a scheduled sweep deletes older ones (withholding legal holds).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, CLI missing
- Feature: [F087-09 Data retention, region, keys, network and managed client settings](../../20-features/087-enterprise-administration-screens/F087-09-data-retention-region-keys-network-and-managed-cli.md)
- Competitor trace: CAP-teams-and-admin-17

## S87.24

**Data-residency settings.** An administrator chooses or requests the region where workspace data is stored and processed, and the product keeps data there.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web partial, Desktop partial
- Feature: [F087-09 Data retention, region, keys, network and managed client settings](../../20-features/087-enterprise-administration-screens/F087-09-data-retention-region-keys-network-and-managed-cli.md)
- Competitor trace: CAP-teams-and-admin-18
- An owner decision is open on this item.

## S87.25

**Customer-managed-key setup where offered.** Where offered, an administrator connects a customer-managed encryption key, rotates or revokes it from the console, and workspace data is sealed under it.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, CLI missing
- Feature: [F087-09 Data retention, region, keys, network and managed client settings](../../20-features/087-enterprise-administration-screens/F087-09-data-retention-region-keys-network-and-managed-cli.md)
- Competitor trace: CAP-teams-and-admin-18

## S87.26

**Network/IP restrictions.** An administrator restricts workspace access to listed IP ranges, and requests from other networks are refused.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, CLI missing
- Feature: [F087-09 Data retention, region, keys, network and managed client settings](../../20-features/087-enterprise-administration-screens/F087-09-data-retention-region-keys-network-and-managed-cli.md)
- Competitor trace: CAP-teams-and-admin-11

## S87.27

**Device-management integration.** An organisation can deploy and configure the product through its device-management system (MDM or managed policy), and the app honours that managed configuration.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI done, Chrome done
- Feature: [F087-09 Data retention, region, keys, network and managed client settings](../../20-features/087-enterprise-administration-screens/F087-09-data-retention-region-keys-network-and-managed-cli.md)
- Competitor trace: CAP-teams-and-admin-25

## S87.28

**Audit-log viewer.** An administrator browses the workspace audit trail with filters (action, outcome, severity, time range) from live data.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, CLI missing
- Feature: [F087-10 Audit trail and exports](../../20-features/087-enterprise-administration-screens/F087-10-audit-trail-and-exports.md)
- Competitor trace: CAP-teams-and-admin-19

## S87.29

**Audit export.** An administrator exports the audit trail for a range (and can stream it to a SIEM), with the export itself recorded.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, CLI missing
- Feature: [F087-10 Audit trail and exports](../../20-features/087-enterprise-administration-screens/F087-10-audit-trail-and-exports.md)
- Competitor trace: CAP-teams-and-admin-19

## S87.30

**Usage analytics.** An administrator sees workspace usage and spend broken down by member, model, product area and provider over a period, and can export it.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, CLI missing
- Feature: [F087-11 Usage, budgets and spend limits](../../20-features/087-enterprise-administration-screens/F087-11-usage-budgets-and-spend-limits.md)
- Competitor trace: CAP-teams-and-admin-21

## S87.31

**Group spending limits.** An administrator sets a spending limit for a group of members and usage by that group is capped.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing
- Feature: [F087-11 Usage, budgets and spend limits](../../20-features/087-enterprise-administration-screens/F087-11-usage-budgets-and-spend-limits.md)
- Competitor trace: CAP-teams-and-admin-22

## S87.32

**User spending limits.** An administrator sets a spending limit for an individual member and that member's usage is capped.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing
- Feature: [F087-11 Usage, budgets and spend limits](../../20-features/087-enterprise-administration-screens/F087-11-usage-budgets-and-spend-limits.md)
- Competitor trace: CAP-teams-and-admin-22

## S87.33

**Organization budget.** An administrator sets a monthly workspace budget with an alert threshold, sees spend against it, and managed usage is refused once it is exhausted (when enforced).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, CLI missing
- Feature: [F087-11 Usage, budgets and spend limits](../../20-features/087-enterprise-administration-screens/F087-11-usage-budgets-and-spend-limits.md)
- Competitor trace: CAP-teams-and-admin-22

## S87.34

**Billing administration.** An administrator manages the workspace plan, seats, payment method, invoices and (for enterprise) contract terms from the console.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, CLI missing
- Feature: [F087-12 Billing, compliance, legal holds and support access](../../20-features/087-enterprise-administration-screens/F087-12-billing-compliance-legal-holds-and-support-access.md)
- Competitor trace: CAP-teams-and-admin-23

## S87.35

**Support-access controls.** A workspace administrator decides whether platform support may access workspace data (approve, deny, revoke, time-limit) and can review support access to the workspace.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing
- Feature: [F087-12 Billing, compliance, legal holds and support access](../../20-features/087-enterprise-administration-screens/F087-12-billing-compliance-legal-holds-and-support-access.md)

## S87.36

**Compliance export.** An administrator exports workspace content (conversations, messages, files, artifacts) in a machine-readable format for compliance review, with the export recorded.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, CLI missing
- Feature: [F087-12 Billing, compliance, legal holds and support access](../../20-features/087-enterprise-administration-screens/F087-12-billing-compliance-legal-holds-and-support-access.md)
- Competitor trace: CAP-teams-and-admin-20

## S87.37

**Legal-hold administration where offered.** Where offered, an administrator places a legal hold on the workspace or named members, sees active and released holds, releases them after confirmation, and held data survives retention and deletion.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, CLI missing
- Feature: [F087-12 Billing, compliance, legal holds and support access](../../20-features/087-enterprise-administration-screens/F087-12-billing-compliance-legal-holds-and-support-access.md)
- Competitor trace: CAP-teams-and-admin-17

## S87.38

**Managed rollout and update settings.** An administrator controls which client versions or release channels members get and when updates roll out.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, CLI missing
- Feature: [F087-09 Data retention, region, keys, network and managed client settings](../../20-features/087-enterprise-administration-screens/F087-09-data-retention-region-keys-network-and-managed-cli.md)
- Competitor trace: CAP-teams-and-admin-25

## S87.39

**Policy diagnostics.** An administrator can see the effective policy for a member or request and why an action was allowed or refused.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, CLI missing
- Feature: [F087-01 Overview and policy diagnostics](../../20-features/087-enterprise-administration-screens/F087-01-overview-and-policy-diagnostics.md)
- Competitor trace: CAP-teams-and-admin-13

## S87.40

**Administrative API access.** An administrator issues scoped, expiring API keys that let automations perform administrative tasks through a documented API, and can revoke them.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, CLI missing
- Feature: [F087-05 Service accounts and admin API keys](../../20-features/087-enterprise-administration-screens/F087-05-service-accounts-and-admin-api-keys.md)
- Competitor trace: CAP-teams-and-admin-24

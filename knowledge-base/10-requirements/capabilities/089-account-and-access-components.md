---
id: "REQ-AREA-089"
type: "requirements"
title: "Requirement items: Account and access components"
basis: "established: acceptance criteria recorded in the project's capability ledger"
source: "audit/ledger/ecosystem-capability-ledger.jsonl"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Requirement items: 89. Account and access components

24 items. Each is an established requirement: the acceptance criterion recorded for it in the project's capability ledger (`audit/ledger/ecosystem-capability-ledger.jsonl`). The status per app is what reading the code found; a result from a real run is given where one exists.

## S89.01

**Account service.** A server-side account service maps every authenticated identity to one AGI account record and enforces account state (active, locked, pending deletion) on each request.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F089-01 Sign-in and account standing](../../20-features/089-account-and-access-components/F089-01-sign-in-and-account-standing.md)

## S89.02

**Authentication-provider adapters.** Authentication is delegated to identity-provider adapters (password, social, passkey, SSO) behind one server interface that verifies sessions and fetches users.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F089-01 Sign-in and account standing](../../20-features/089-account-and-access-components/F089-01-sign-in-and-account-standing.md)

## S89.03

**Session service.** A session service lists a user's active sessions and revokes one, all others, or all.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F089-02 Sessions and device sign-in credentials](../../20-features/089-account-and-access-components/F089-02-sessions-and-device-sign-in-credentials.md)

## S89.04

**Token refresh and revocation service.** Device credentials use rotating refresh tokens with reuse detection, and can be revoked per device or all at once.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F089-02 Sessions and device sign-in credentials](../../20-features/089-account-and-access-components/F089-02-sessions-and-device-sign-in-credentials.md)

## S89.05

**Device registry.** A device registry records each signed-in client (surface, OS, version, capabilities, last seen) and lets the user rename or unlink it.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F089-02 Sessions and device sign-in credentials](../../20-features/089-account-and-access-components/F089-02-sessions-and-device-sign-in-credentials.md)

## S89.06

**Recovery service.** A recovery service lets a locked-out user regain access when password, email or second factor is lost, with verification and audit.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F089-03 Account recovery through support](../../20-features/089-account-and-access-components/F089-03-account-recovery-through-support.md)

## S89.07

**Profile service.** A profile service reads and updates the account profile (name, photo, preferred name, work description) for every client.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F089-04 Profile, preferences, terms and consent](../../20-features/089-account-and-access-components/F089-04-profile-preferences-terms-and-consent.md)

## S89.08

**User-preference service.** A user-preference service stores per-namespace settings for the account with versioned writes that every client can read and sync.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F089-04 Profile, preferences, terms and consent](../../20-features/089-account-and-access-components/F089-04-profile-preferences-terms-and-consent.md)

## S89.09

**Consent and terms-version store.** A consent and terms store records which Terms version each user accepted and their consents, and blocks use until current Terms are accepted.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F089-04 Profile, preferences, terms and consent](../../20-features/089-account-and-access-components/F089-04-profile-preferences-terms-and-consent.md)

## S89.10

**Organization service.** An organization service creates, updates, transfers and deletes organizations (workspaces for teams) with owners and seats.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F089-05 Workspaces (personal and team)](../../20-features/089-account-and-access-components/F089-05-workspaces-personal-and-team.md)

## S89.11

**Workspace service.** A workspace service lists a user's workspaces (personal and team) and switches the active one, scoping data to it.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F089-05 Workspaces (personal and team)](../../20-features/089-account-and-access-components/F089-05-workspaces-personal-and-team.md)

## S89.12

**Membership service.** A membership service adds, changes and removes members, and removal revokes that member's workspace access and credentials.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F089-06 Members, invitations, groups and roles](../../20-features/089-account-and-access-components/F089-06-members-invitations-groups-and-roles.md)

## S89.13

**Invitation service.** An invitation service creates, lists, expires, revokes and accepts invitations with hashed tokens.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F089-06 Members, invitations, groups and roles](../../20-features/089-account-and-access-components/F089-06-members-invitations-groups-and-roles.md)

## S89.14

**Group service.** A group service manages groups of members and maps groups to roles.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F089-06 Members, invitations, groups and roles](../../20-features/089-account-and-access-components/F089-06-members-invitations-groups-and-roles.md)

## S89.15

**Role/permission service.** A role/permission service defines built-in and custom roles, checks member permissions, and prevents escalation beyond the actor's own rights.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F089-06 Members, invitations, groups and roles](../../20-features/089-account-and-access-components/F089-06-members-invitations-groups-and-roles.md)

## S89.16

**Resource-authorization layer.** A resource-authorization layer scopes every data access to the caller and active workspace and applies workspace policy (feature access, MFA, IP allow-list, retention).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F089-07 Workspace policy enforcement](../../20-features/089-account-and-access-components/F089-07-workspace-policy-enforcement.md)

## S89.17

**SSO configuration.** Admins can configure SSO connections (SAML/OIDC) with domain verification and just-in-time provisioning.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F089-08 Enterprise sign-in and directory sync](../../20-features/089-account-and-access-components/F089-08-enterprise-sign-in-and-directory-sync.md)

## S89.18

**Directory-provisioning adapter.** A SCIM directory-provisioning adapter creates, updates, deactivates users and groups from the customer's IdP.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F089-08 Enterprise sign-in and directory sync](../../20-features/089-account-and-access-components/F089-08-enterprise-sign-in-and-directory-sync.md)

## S89.19

**Service-account management.** Admins can create service accounts (non-human principals) with bounded scopes and credentials.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F089-09 Service accounts and API keys](../../20-features/089-account-and-access-components/F089-09-service-accounts-and-api-keys.md)

## S89.20

**API-key management.** An API-key service issues hashed, expiring keys scoped to user and workspace, lists them and revokes them.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F089-09 Service accounts and API keys](../../20-features/089-account-and-access-components/F089-09-service-accounts-and-api-keys.md)

## S89.21

**Personal-access-token management.** A personal-access-token service issues and revokes tokens distinct from API keys.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F089-09 Service accounts and API keys](../../20-features/089-account-and-access-components/F089-09-service-accounts-and-api-keys.md)

## S89.22

**Remote-device pairing service.** A pairing service links a second device (phone, browser) to a signed-in desktop or account with a short code and binds it to the account.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F089-10 Pairing a second device](../../20-features/089-account-and-access-components/F089-10-pairing-a-second-device.md)

## S89.23

**Account export/deletion coordinator.** An export/deletion coordinator produces the user's data export and erases the account and organization data across every store, honouring legal holds and recording what is retained.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F089-11 Deleting and exporting account data](../../20-features/089-account-and-access-components/F089-11-deleting-and-exporting-account-data.md)

## S89.24

**Administrative access service.** Administrative access to customer data requires a recorded reason, a second operator's approval, a time limit, and is logged.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F089-12 Support staff access to customer data](../../20-features/089-account-and-access-components/F089-12-support-staff-access-to-customer-data.md)

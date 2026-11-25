---
id: "REQ-AREA-055"
type: "requirements"
title: "Requirement items: Connector setup and account management"
basis: "established: acceptance criteria recorded in the project's capability ledger"
source: "audit/ledger/ecosystem-capability-ledger.jsonl"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Requirement items: 55. Connector setup and account management

32 items. Each is an established requirement: the acceptance criterion recorded for it in the project's capability ledger (`audit/ledger/ecosystem-capability-ledger.jsonl`). The status per app is what reading the code found; a result from a real run is given where one exists.

## S55.01

**Connector directory.** A signed-in user can browse a catalogue of connectors they could add, with each entry's name, publisher and state.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing
- Seen in a real run: Web UI_ONLY
- Feature: [F055-01 Browse the connector catalogue](../../20-features/055-connector-setup-and-account-management/F055-01-browse-the-connector-catalogue.md)
- Competitor trace: CAP-connectors-apps-and-extensions-01

## S55.02

**Connector search.** Typing in a connector search box narrows the catalogue by name, publisher, tools or description.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing
- Seen in a real run: Web PASS
- Feature: [F055-01 Browse the connector catalogue](../../20-features/055-connector-setup-and-account-management/F055-01-browse-the-connector-catalogue.md)
- Competitor trace: CAP-connectors-apps-and-extensions-01

## S55.03

**Connector categories.** The catalogue can be filtered by category (e.g. Productivity, Developer, Communication).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing
- Feature: [F055-01 Browse the connector catalogue](../../20-features/055-connector-setup-and-account-management/F055-01-browse-the-connector-catalogue.md)
- Competitor trace: CAP-connectors-apps-and-extensions-01

## S55.04

**Connector detail page.** Selecting a connector opens a detail page with its description, publisher, sign-in requirement, tools and links.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done
- Seen in a real run: Web PASS
- Feature: [F055-02 Connector detail page](../../20-features/055-connector-setup-and-account-management/F055-02-connector-detail-page.md)
- Competitor trace: CAP-connectors-apps-and-extensions-01

## S55.05

**Supported-operation list.** The connector page lists the operations/tools the connector exposes (before or after connecting).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI done
- Seen in a real run: Web PASS
- Feature: [F055-02 Connector detail page](../../20-features/055-connector-setup-and-account-management/F055-02-connector-detail-page.md)
- Competitor trace: CAP-connectors-apps-and-extensions-01

## S55.06

**Read/write capability explanation.** Before connecting, the user sees in plain language what the connector can read and what it can change.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI missing, VS Code done
- Seen in a real run: Web PASS
- Feature: [F055-02 Connector detail page](../../20-features/055-connector-setup-and-account-management/F055-02-connector-detail-page.md)

## S55.07

**Connect action.** A Connect action on a connector starts its real authorization or credential flow.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done
- Seen in a real run: Web BLOCKED
- Feature: [F055-03 Connect with sign-in or API key](../../20-features/055-connector-setup-and-account-management/F055-03-connect-with-sign-in-or-api-key.md)
- Competitor trace: CAP-connectors-apps-and-extensions-03

## S55.08

**OAuth authorization.** Connecting an OAuth provider opens the provider consent page and stores the returned grant.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done
- Seen in a real run: Web BLOCKED
- Feature: [F055-03 Connect with sign-in or API key](../../20-features/055-connector-setup-and-account-management/F055-03-connect-with-sign-in-or-api-key.md)
- Competitor trace: CAP-connectors-apps-and-extensions-03

## S55.09

**API-key authorization.** A connector that needs an API key offers a form to enter it, stores it encrypted, and connects.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done
- Feature: [F055-03 Connect with sign-in or API key](../../20-features/055-connector-setup-and-account-management/F055-03-connect-with-sign-in-or-api-key.md)
- Competitor trace: CAP-connectors-apps-and-extensions-03, CAP-connectors-apps-and-extensions-08

## S55.10

**Service-account authorization.** A connector can be authorized with a service account (a non-personal credential) and it is shown as such.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F055-12 Not built or not applicable](../../20-features/055-connector-setup-and-account-management/F055-12-not-built-or-not-applicable.md)

## S55.11

**Organization-managed authorization.** An organization admin authorizes a connector once and members use it without holding the credential.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done
- Feature: [F055-04 Organization-shared connectors](../../20-features/055-connector-setup-and-account-management/F055-04-organization-shared-connectors.md)
- Competitor trace: CAP-connectors-apps-and-extensions-12

## S55.12

**Multiple accounts per connector.** The user can connect more than one account for the same connector and keep both.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F055-12 Not built or not applicable](../../20-features/055-connector-setup-and-account-management/F055-12-not-built-or-not-applicable.md)
- Competitor trace: CAP-connectors-apps-and-extensions-13

## S55.13

**Account display name.** Each connected account shows a human-readable name.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI missing, VS Code missing
- Feature: [F055-05 Account name, identity and granted permissions](../../20-features/055-connector-setup-and-account-management/F055-05-account-name-identity-and-granted-permissions.md)

## S55.14

**Account identity and domain.** A connected account shows which identity (email/login) and domain/workspace it belongs to.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI missing, VS Code missing
- Feature: [F055-05 Account name, identity and granted permissions](../../20-features/055-connector-setup-and-account-management/F055-05-account-name-identity-and-granted-permissions.md)

## S55.15

**Default-account selection.** With several accounts for one connector, the user picks which is used by default.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F055-12 Not built or not applicable](../../20-features/055-connector-setup-and-account-management/F055-12-not-built-or-not-applicable.md)
- Competitor trace: CAP-connectors-apps-and-extensions-13

## S55.16

**Per-task account selection.** For a given task or message the user (or agent) can choose which connected account to use.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F055-12 Not built or not applicable](../../20-features/055-connector-setup-and-account-management/F055-12-not-built-or-not-applicable.md)
- Competitor trace: CAP-connectors-apps-and-extensions-13

## S55.17

**Granted-scope display.** After connecting, the user can see which scopes/permissions were actually granted.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, VS Code done
- Feature: [F055-05 Account name, identity and granted permissions](../../20-features/055-connector-setup-and-account-management/F055-05-account-name-identity-and-granted-permissions.md)
- Competitor trace: CAP-connectors-apps-and-extensions-03

## S55.18

**Connection health.** Each connector shows whether it is healthy, needs reauthorization or is not responding.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done
- Seen in a real run: Web UI_ONLY
- Feature: [F055-06 Connection health, test and reconnect](../../20-features/055-connector-setup-and-account-management/F055-06-connection-health-test-and-reconnect.md)
- Competitor trace: CAP-connectors-apps-and-extensions-03

## S55.19

**Last synchronization time.** Each connection shows when it last synchronized or was last used.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F055-12 Not built or not applicable](../../20-features/055-connector-setup-and-account-management/F055-12-not-built-or-not-applicable.md)

## S55.20

**Reconnect/reauthorize.** An expired or revoked connection offers a Reconnect action that re-runs authorization.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web partial, Desktop partial, Mobile done, CLI done
- Feature: [F055-06 Connection health, test and reconnect](../../20-features/055-connector-setup-and-account-management/F055-06-connection-health-test-and-reconnect.md)
- Competitor trace: CAP-connectors-apps-and-extensions-03

## S55.21

**Test connection.** The user can run an on-demand check that a connection works and see the result.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI done, VS Code missing
- Seen in a real run: Web BLOCKED
- Feature: [F055-06 Connection health, test and reconnect](../../20-features/055-connector-setup-and-account-management/F055-06-connection-health-test-and-reconnect.md)

## S55.22

**Disconnect.** The user can disconnect a connector and it stops being available to the assistant.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done
- Feature: [F055-07 Disconnect and revoke](../../20-features/055-connector-setup-and-account-management/F055-07-disconnect-and-revoke.md)
- Competitor trace: CAP-connectors-apps-and-extensions-03

## S55.23

**Revoke permission.** Revoking removes the stored grant and asks the provider to revoke the token.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done
- Feature: [F055-07 Disconnect and revoke](../../20-features/055-connector-setup-and-account-management/F055-07-disconnect-and-revoke.md)
- Competitor trace: CAP-connectors-apps-and-extensions-03

## S55.24

**Sync-source selection.** For a syncing connector, the user chooses which sources (mailboxes, drives, channels) are synced/indexed.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F055-12 Not built or not applicable](../../20-features/055-connector-setup-and-account-management/F055-12-not-built-or-not-applicable.md)

## S55.25

**Folder or repository selection.** The user limits a connector to chosen folders or repositories.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing
- Feature: [F055-09 Folder or repository limits](../../20-features/055-connector-setup-and-account-management/F055-09-folder-or-repository-limits.md)

## S55.26

**Read-only mode.** A connector can be set to read-only so its write operations are blocked.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, CLI missing
- Feature: [F055-08 Tool permissions and write approval](../../20-features/055-connector-setup-and-account-management/F055-08-tool-permissions-and-write-approval.md)

## S55.27

**Write-action settings.** The user controls whether a connector's write actions run automatically, need approval, or are blocked.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done
- Feature: [F055-08 Tool permissions and write approval](../../20-features/055-connector-setup-and-account-management/F055-08-tool-permissions-and-write-approval.md)
- Competitor trace: CAP-connectors-apps-and-extensions-11

## S55.28

**Data-retention explanation.** At connect time the product explains what connector data it stores and for how long.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI missing, VS Code missing
- Feature: [F055-02 Connector detail page](../../20-features/055-connector-setup-and-account-management/F055-02-connector-detail-page.md)

## S55.29

**Source-provider attribution.** Answers or steps that used a connector name the provider that supplied the data.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, CLI done, Chrome done
- Feature: [F055-10 Missing-permission request and source attribution](../../20-features/055-connector-setup-and-account-management/F055-10-missing-permission-request-and-source-attribution.md)

## S55.30

**Missing-scope request.** When a task needs a scope the grant lacks, the product asks the user to grant that permission.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, CLI done
- Feature: [F055-10 Missing-permission request and source attribution](../../20-features/055-connector-setup-and-account-management/F055-10-missing-permission-request-and-source-attribution.md)

## S55.31

**Organization approval flow.** A member can request a connector and an organization admin approves or denies it.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F055-12 Not built or not applicable](../../20-features/055-connector-setup-and-account-management/F055-12-not-built-or-not-applicable.md)

## S55.32

**Private-network setup where offered.** Where offered, a connector can reach services on a private network through a supported setup.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI done, Chrome missing
- Feature: [F055-11 Private-network connectors](../../20-features/055-connector-setup-and-account-management/F055-11-private-network-connectors.md)
- Competitor trace: CAP-connectors-apps-and-extensions-09

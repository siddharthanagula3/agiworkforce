---
id: "REQ-AREA-103"
type: "requirements"
title: "Requirement items: Data and persistence categories"
basis: "established: acceptance criteria recorded in the project's capability ledger"
source: "audit/ledger/ecosystem-capability-ledger.jsonl"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Requirement items: 103. Data and persistence categories

38 items. Each is an established requirement: the acceptance criterion recorded for it in the project's capability ledger (`audit/ledger/ecosystem-capability-ledger.jsonl`). The status per app is what reading the code found; a result from a real run is given where one exists.

## S103.01

**Accounts and authentication identities.** User accounts and their linked authentication identities are durably stored, owned by one canonical record, and classified for export and erasure.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F103-01 Account and sign-in identity](../../20-features/103-data-and-persistence-categories/F103-01-account-and-sign-in-identity.md)

## S103.02

**Sessions and devices.** Sessions and devices (registrations, refresh tokens, revocations) are durably stored and classified.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F103-01 Account and sign-in identity](../../20-features/103-data-and-persistence-categories/F103-01-account-and-sign-in-identity.md)

## S103.03

**Organizations and workspaces.** Organizations/workspaces are durably stored and classified.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F103-02 Workspaces, members and policy](../../20-features/103-data-and-persistence-categories/F103-02-workspaces-members-and-policy.md)

## S103.04

**Memberships and roles.** Memberships and role grants are durably stored and classified.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F103-02 Workspaces, members and policy](../../20-features/103-data-and-persistence-categories/F103-02-workspaces-members-and-policy.md)

## S103.05

**Preferences and policy versions.** User preferences and workspace policy (with revision history) are durably stored and classified.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F103-02 Workspaces, members and policy](../../20-features/103-data-and-persistence-categories/F103-02-workspaces-members-and-policy.md)

## S103.06

**Conversations and turns.** Conversations and their turns are durably stored and classified.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F103-03 Chats, branches and memory](../../20-features/103-data-and-persistence-categories/F103-03-chats-branches-and-memory.md)

## S103.07

**Message versions and branches.** Message versions and conversation branches are durably stored and classified with their conversation.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F103-03 Chats, branches and memory](../../20-features/103-data-and-persistence-categories/F103-03-chats-branches-and-memory.md)
- Competitor trace: CAP-editing-regeneration-and-branching-03

## S103.08

**Execution attempts.** Each execution attempt (operation, run, retry count) is durably recorded and classified.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F103-06 Agent runs, tasks and automation](../../20-features/103-data-and-persistence-categories/F103-06-agent-runs-tasks-and-automation.md)

## S103.09

**Context manifests.** Context manifests (what went into each turn's context) are durably recorded and classified.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F103-03 Chats, branches and memory](../../20-features/103-data-and-persistence-categories/F103-03-chats-branches-and-memory.md)

## S103.10

**Memory items and provenance.** Memory items and their provenance (source conversation and turn) are durably stored and classified.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F103-03 Chats, branches and memory](../../20-features/103-data-and-persistence-categories/F103-03-chats-branches-and-memory.md)

## S103.11

**Projects and notes.** Projects with their instructions and knowledge are durably stored and classified.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F103-04 Projects, files and Library](../../20-features/103-data-and-persistence-categories/F103-04-projects-files-and-library.md)

## S103.12

**Files and versions.** Files, their versions and derivation lineage are durably stored and classified.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F103-04 Projects, files and Library](../../20-features/103-data-and-persistence-categories/F103-04-projects-files-and-library.md)

## S103.13

**Folders and Library entries.** Library entries and folders are durably stored and classified.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F103-04 Projects, files and Library](../../20-features/103-data-and-persistence-categories/F103-04-projects-files-and-library.md)

## S103.14

**External resource references.** References to external resources (repositories, URLs, connector items) are stored as canonical, classified references.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F103-04 Projects, files and Library](../../20-features/103-data-and-persistence-categories/F103-04-projects-files-and-library.md)

## S103.15

**Extracted source content.** Text extracted from sources is durably stored for reuse and classified.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F103-04 Projects, files and Library](../../20-features/103-data-and-persistence-categories/F103-04-projects-files-and-library.md)

## S103.16

**Search and vector indexes.** Search and vector indexes are durably stored and classified with the content they index.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F103-04 Projects, files and Library](../../20-features/103-data-and-persistence-categories/F103-04-projects-files-and-library.md)

## S103.17

**Citations and source locators.** Citations and source locators are persisted with the answers that use them and classified.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F103-05 Generated content, sharing and publishing](../../20-features/103-data-and-persistence-categories/F103-05-generated-content-sharing-and-publishing.md)

## S103.18

**Artifacts and revisions.** Artifacts and their revision history are durably stored and classified.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F103-05 Generated content, sharing and publishing](../../20-features/103-data-and-persistence-categories/F103-05-generated-content-sharing-and-publishing.md)

## S103.19

**Generated applications and deployments.** Generated applications/published artifacts and their deployed versions are durably stored and classified.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F103-05 Generated content, sharing and publishing](../../20-features/103-data-and-persistence-categories/F103-05-generated-content-sharing-and-publishing.md)

## S103.20

**Media jobs and assets.** Media generation jobs and their assets are durably stored and classified.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F103-05 Generated content, sharing and publishing](../../20-features/103-data-and-persistence-categories/F103-05-generated-content-sharing-and-publishing.md)

## S103.21

**Agents and task plans.** Agent runs and task plans (with revisions) are durably stored and classified.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F103-06 Agent runs, tasks and automation](../../20-features/103-data-and-persistence-categories/F103-06-agent-runs-tasks-and-automation.md)

## S103.22

**Tool invocations and receipts.** Tool invocations and their receipts are durably recorded and classified.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F103-06 Agent runs, tasks and automation](../../20-features/103-data-and-persistence-categories/F103-06-agent-runs-tasks-and-automation.md)

## S103.23

**Approval requests and decisions.** Approval requests and the decisions made on them are durably recorded and classified.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F103-06 Agent runs, tasks and automation](../../20-features/103-data-and-persistence-categories/F103-06-agent-runs-tasks-and-automation.md)

## S103.24

**Checkpoints.** Resumable checkpoints of long-running work are durably stored and classified.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F103-06 Agent runs, tasks and automation](../../20-features/103-data-and-persistence-categories/F103-06-agent-runs-tasks-and-automation.md)

## S103.25

**Coding sessions and repository bindings.** Coding sessions and their repository bindings are durably stored and classified.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F103-06 Agent runs, tasks and automation](../../20-features/103-data-and-persistence-categories/F103-06-agent-runs-tasks-and-automation.md)

## S103.26

**Connectors and connected accounts.** Connectors and connected accounts are durably stored and classified.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F103-07 Connectors and credentials](../../20-features/103-data-and-persistence-categories/F103-07-connectors-and-credentials.md)

## S103.27

**Encrypted credential references.** Credentials are stored only encrypted or hashed (access_token_enc, key hashes) and classified.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F103-07 Connectors and credentials](../../20-features/103-data-and-persistence-categories/F103-07-connectors-and-credentials.md)

## S103.28

**Skills and Plugins.** Skills and plugin installations are durably stored and classified.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F103-06 Agent runs, tasks and automation](../../20-features/103-data-and-persistence-categories/F103-06-agent-runs-tasks-and-automation.md)

## S103.29

**Schedules and trigger definitions.** Schedules and trigger definitions are durably stored and classified.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F103-06 Agent runs, tasks and automation](../../20-features/103-data-and-persistence-categories/F103-06-agent-runs-tasks-and-automation.md)

## S103.30

**Notifications.** Notifications and delivery subscriptions are durably stored and classified.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F103-08 Notifications and feedback](../../20-features/103-data-and-persistence-categories/F103-08-notifications-and-feedback.md)

## S103.31

**Plans and subscriptions.** Plans and subscriptions are durably stored and classified (financial retention).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F103-09 Billing, plans and usage](../../20-features/103-data-and-persistence-categories/F103-09-billing-plans-and-usage.md)

## S103.32

**Usage and credit ledger entries.** Usage and credit ledger entries are durably recorded, classified, and correctly attributed to plan or overage.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F103-09 Billing, plans and usage](../../20-features/103-data-and-persistence-categories/F103-09-billing-plans-and-usage.md)

## S103.33

**Invoices and payment references.** Invoices and payment references are durably stored and classified.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F103-09 Billing, plans and usage](../../20-features/103-data-and-persistence-categories/F103-09-billing-plans-and-usage.md)

## S103.34

**Audit events.** Audit events are durably and append-only recorded and classified as audit trail.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F103-10 Audit, consent, data rights and erasure](../../20-features/103-data-and-persistence-categories/F103-10-audit-consent-data-rights-and-erasure.md)

## S103.35

**Feedback and support cases.** Feedback and support cases are durably stored and classified.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F103-08 Notifications and feedback](../../20-features/103-data-and-persistence-categories/F103-08-notifications-and-feedback.md)

## S103.36

**Retention/deletion records.** Retention sweeps, deletion requests, holds and erasure records are durably stored and classified.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F103-10 Audit, consent, data rights and erasure](../../20-features/103-data-and-persistence-categories/F103-10-audit-consent-data-rights-and-erasure.md)

## S103.37

**Consent and policy acceptance.** Consent and policy acceptance (with version) are durably recorded and classified.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F103-10 Audit, consent, data rights and erasure](../../20-features/103-data-and-persistence-categories/F103-10-audit-consent-data-rights-and-erasure.md)

## S103.38

**Published-content access rules.** Access rules for shared and published content (visibility, expiry, revocation) are durably stored and classified.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F103-05 Generated content, sharing and publishing](../../20-features/103-data-and-persistence-categories/F103-05-generated-content-sharing-and-publishing.md)

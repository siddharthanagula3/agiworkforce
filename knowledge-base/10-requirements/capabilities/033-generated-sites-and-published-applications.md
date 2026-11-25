---
id: "REQ-AREA-033"
type: "requirements"
title: "Requirement items: Generated Sites and published applications"
basis: "established: acceptance criteria recorded in the project's capability ledger"
source: "audit/ledger/ecosystem-capability-ledger.jsonl"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Requirement items: 33. Generated Sites and published applications

30 items. Each is an established requirement: the acceptance criterion recorded for it in the project's capability ledger (`audit/ledger/ecosystem-capability-ledger.jsonl`). The status per app is what reading the code found; a result from a real run is given where one exists.

## S33.01

**Generated-site dashboard.** A dashboard lists the user's generated/published sites with their state and actions.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI done, Chrome missing
- Feature: [F033-04 Your published apps list](../../20-features/033-generated-sites-and-published-applications/F033-04-your-published-apps-list.md)
- Competitor trace: CAP-artifacts-and-documents-16

## S33.02

**Application name and description.** The user can set a name and description for a published app.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): VS Code missing, Chrome unverified
- Feature: [F033-04 Your published apps list](../../20-features/033-generated-sites-and-published-applications/F033-04-your-published-apps-list.md)

## S33.03

**Template-based creation.** The user can start a site from a template.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F033-10 Not yet built](../../20-features/033-generated-sites-and-published-applications/F033-10-not-yet-built.md)

## S33.04

**Prompt-based creation.** The user creates a site by prompting the assistant, then hosts the result.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, VS Code missing, Chrome unverified
- Feature: [F033-01 Publish an artifact from chat](../../20-features/033-generated-sites-and-published-applications/F033-01-publish-an-artifact-from-chat.md)
- Competitor trace: CAP-artifacts-and-documents-16

## S33.05

**Source-code workspace.** The site's source code can be browsed and edited in a workspace.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Chrome unverified
- Feature: [F033-10 Not yet built](../../20-features/033-generated-sites-and-published-applications/F033-10-not-yet-built.md)

## S33.06

**Build status.** The user sees the build/deploy status of the site.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F033-10 Not yet built](../../20-features/033-generated-sites-and-published-applications/F033-10-not-yet-built.md)

## S33.07

**Preview deployment.** The site can be deployed to a shareable preview URL.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code missing, Chrome unverified
- Feature: [F033-02 Share link and public page](../../20-features/033-generated-sites-and-published-applications/F033-02-share-link-and-public-page.md)
- Competitor trace: CAP-artifacts-and-documents-16

## S33.08

**Production deployment.** The site can be deployed to a separate production URL/stage.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): VS Code missing, Chrome unverified
- Feature: [F033-10 Not yet built](../../20-features/033-generated-sites-and-published-applications/F033-10-not-yet-built.md)

## S33.09

**Deployment history.** The user can see the history of deployments.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): CLI missing, VS Code missing, Chrome missing
- Feature: [F033-06 Version history and rollback](../../20-features/033-generated-sites-and-published-applications/F033-06-version-history-and-rollback.md)

## S33.10

**Public URL.** The published site is reachable at a public URL.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, Chrome unverified
- Feature: [F033-02 Share link and public page](../../20-features/033-generated-sites-and-published-applications/F033-02-share-link-and-public-page.md)
- Competitor trace: CAP-artifacts-and-documents-15, CAP-artifacts-and-documents-16

## S33.11

**Named-viewer access.** The owner can restrict a site to specific named viewers.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F033-03 Who can open a published app](../../20-features/033-generated-sites-and-published-applications/F033-03-who-can-open-a-published-app.md)

## S33.12

**Workspace-only access.** The owner can restrict a site to members of their workspace.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI done, VS Code missing, Chrome unverified
- Feature: [F033-03 Who can open a published app](../../20-features/033-generated-sites-and-published-applications/F033-03-who-can-open-a-published-app.md)
- Competitor trace: CAP-artifacts-and-documents-15

## S33.13

**Password or authentication options where offered.** The owner can require a password or sign-in to view the site.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): CLI missing, VS Code missing, Chrome unverified
- Feature: [F033-03 Who can open a published app](../../20-features/033-generated-sites-and-published-applications/F033-03-who-can-open-a-published-app.md)

## S33.14

**Custom domain setup.** The owner can attach a custom domain.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F033-10 Not yet built](../../20-features/033-generated-sites-and-published-applications/F033-10-not-yet-built.md)
- Competitor trace: CAP-artifacts-and-documents-16

## S33.15

**Domain verification.** The product verifies ownership of a custom domain (DNS).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F033-10 Not yet built](../../20-features/033-generated-sites-and-published-applications/F033-10-not-yet-built.md)

## S33.16

**Environment-variable management.** The owner can manage environment variables/secrets for the app.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F033-10 Not yet built](../../20-features/033-generated-sites-and-published-applications/F033-10-not-yet-built.md)

## S33.17

**Connected-service configuration.** The owner can configure connected services the app uses.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F033-10 Not yet built](../../20-features/033-generated-sites-and-published-applications/F033-10-not-yet-built.md)

## S33.18

**Application database setup.** The owner can set up a database for the app.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F033-10 Not yet built](../../20-features/033-generated-sites-and-published-applications/F033-10-not-yet-built.md)

## S33.19

**Usage and hosting limits.** Usage and hosting limits are enforced and shown to the owner.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): VS Code missing, Chrome unverified
- Feature: [F033-08 AI calls from inside an app](../../20-features/033-generated-sites-and-published-applications/F033-08-ai-calls-from-inside-an-app.md)
- Competitor trace: CAP-artifacts-and-documents-16, CAP-artifacts-and-documents-26

## S33.20

**Model-call allowance for generated apps.** Generated apps get an allowance of model calls through the product.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F033-08 AI calls from inside an app](../../20-features/033-generated-sites-and-published-applications/F033-08-ai-calls-from-inside-an-app.md)
- Competitor trace: CAP-artifacts-and-documents-17

## S33.21

**Logs and error inspection.** The owner can inspect logs and runtime errors of the hosted app.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F033-10 Not yet built](../../20-features/033-generated-sites-and-published-applications/F033-10-not-yet-built.md)

## S33.22

**Preview-to-production promotion.** A preview deployment can be promoted to production.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F033-10 Not yet built](../../20-features/033-generated-sites-and-published-applications/F033-10-not-yet-built.md)

## S33.23

**Rollback.** The owner can roll the live site back to an earlier version.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, VS Code missing, Chrome unverified
- Feature: [F033-06 Version history and rollback](../../20-features/033-generated-sites-and-published-applications/F033-06-version-history-and-rollback.md)
- Competitor trace: CAP-artifacts-and-documents-16

## S33.24

**Unpublish.** The owner can take the site offline (unpublish).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI done, VS Code missing, Chrome missing
- Feature: [F033-05 Unpublish and delete](../../20-features/033-generated-sites-and-published-applications/F033-05-unpublish-and-delete.md)
- Competitor trace: CAP-artifacts-and-documents-15

## S33.25

**Duplicate/fork.** The owner can duplicate/fork an app to keep working on a copy.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI missing, VS Code missing, Chrome unverified
- Feature: [F033-07 Copy, duplicate and download source](../../20-features/033-generated-sites-and-published-applications/F033-07-copy-duplicate-and-download-source.md)
- Competitor trace: CAP-artifacts-and-documents-16

## S33.26

**Download source.** The owner can download the app's source.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome unverified
- Feature: [F033-07 Copy, duplicate and download source](../../20-features/033-generated-sites-and-published-applications/F033-07-copy-duplicate-and-download-source.md)
- Competitor trace: CAP-artifacts-and-documents-16

## S33.27

**App analytics.** The owner sees analytics (views/visitors) for the app.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F033-10 Not yet built](../../20-features/033-generated-sites-and-published-applications/F033-10-not-yet-built.md)
- Competitor trace: CAP-artifacts-and-documents-16

## S33.28

**Abuse reporting.** A visitor can report an abusive published site.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done
- Feature: [F033-09 Report and moderation](../../20-features/033-generated-sites-and-published-applications/F033-09-report-and-moderation.md)

## S33.29

**Content moderation.** Published sites are subject to content moderation (review/takedown).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done
- Feature: [F033-09 Report and moderation](../../20-features/033-generated-sites-and-published-applications/F033-09-report-and-moderation.md)

## S33.30

**Deletion of app and associated data.** Deleting an app removes it and its associated data.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI done, VS Code missing, Chrome missing
- Feature: [F033-05 Unpublish and delete](../../20-features/033-generated-sites-and-published-applications/F033-05-unpublish-and-delete.md)
- Competitor trace: CAP-artifacts-and-documents-16

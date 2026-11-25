---
id: "REQ-AREA-096"
type: "requirements"
title: "Requirement items: Artifact and generated-application components"
basis: "established: acceptance criteria recorded in the project's capability ledger"
source: "audit/ledger/ecosystem-capability-ledger.jsonl"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Requirement items: 96. Artifact and generated-application components

28 items. Each is an established requirement: the acceptance criterion recorded for it in the project's capability ledger (`audit/ledger/ecosystem-capability-ledger.jsonl`). The status per app is what reading the code found; a result from a real run is given where one exists.

## S96.01

**Artifact registry.** A server-side registry records every artifact (id, type, title, source conversation/message) for the account.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F096-01 Account-wide artifact index](../../20-features/096-artifact-and-generated-application-components/F096-01-account-wide-artifact-index.md)

## S96.02

**Artifact-version store.** A server store keeps each artifact's successive versions so any version can be read back or restored.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F096-02 Artifact version store](../../20-features/096-artifact-and-generated-application-components/F096-02-artifact-version-store.md)
- Competitor trace: CAP-artifacts-and-documents-03

## S96.03

**Structured-document storage.** Documents are stored server-side as structured content (not only as text inside chat messages).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F096-03 Collaboration, comments and edit suggestions](../../20-features/096-artifact-and-generated-application-components/F096-03-collaboration-comments-and-edit-suggestions.md)

## S96.04

**Collaborative editing backend.** A backend lets several people edit one document at once (OT/CRDT sync and presence).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F096-03 Collaboration, comments and edit suggestions](../../20-features/096-artifact-and-generated-application-components/F096-03-collaboration-comments-and-edit-suggestions.md)

## S96.05

**Comment and suggestion service.** A service stores comments and edit suggestions on artifacts/documents.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F096-03 Collaboration, comments and edit suggestions](../../20-features/096-artifact-and-generated-application-components/F096-03-collaboration-comments-and-edit-suggestions.md)
- Competitor trace: CAP-artifacts-and-documents-05

## S96.06

**Selection-to-edit translation.** A service turns a selected range plus an instruction into a targeted edit of the artifact.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F096-03 Collaboration, comments and edit suggestions](../../20-features/096-artifact-and-generated-application-components/F096-03-collaboration-comments-and-edit-suggestions.md)
- Competitor trace: CAP-artifacts-and-documents-04

## S96.07

**Document-generation worker.** A server component generates Word documents on request.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F096-04 Office and PDF file generation](../../20-features/096-artifact-and-generated-application-components/F096-04-office-and-pdf-file-generation.md)
- Competitor trace: CAP-artifacts-and-documents-08

## S96.08

**Spreadsheet-generation worker.** A server component generates spreadsheets on request.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F096-04 Office and PDF file generation](../../20-features/096-artifact-and-generated-application-components/F096-04-office-and-pdf-file-generation.md)
- Competitor trace: CAP-artifacts-and-documents-08

## S96.09

**Presentation-generation worker.** A server component generates presentations on request.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F096-04 Office and PDF file generation](../../20-features/096-artifact-and-generated-application-components/F096-04-office-and-pdf-file-generation.md)
- Competitor trace: CAP-artifacts-and-documents-08

## S96.10

**PDF-generation worker.** A server component generates PDFs on request.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F096-04 Office and PDF file generation](../../20-features/096-artifact-and-generated-application-components/F096-04-office-and-pdf-file-generation.md)
- Competitor trace: CAP-artifacts-and-documents-08

## S96.11

**Export-format adapters.** Adapters convert artifact/document content into export formats (Markdown, PDF, DOCX, HTML, CSV).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F096-05 Export to Markdown, PDF and Word in the browser](../../20-features/096-artifact-and-generated-application-components/F096-05-export-to-markdown-pdf-and-word-in-the-browser.md)
- Competitor trace: CAP-artifacts-and-documents-07

## S96.12

**Artifact preview renderer.** A renderer turns artifact source into a live preview for each supported kind.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F096-06 Live preview in an isolated sandbox](../../20-features/096-artifact-and-generated-application-components/F096-06-live-preview-in-an-isolated-sandbox.md)
- Competitor trace: CAP-artifacts-and-documents-02

## S96.13

**Generated-code build service.** A build service compiles generated code (bundling, transpiling) before preview.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F096-06 Live preview in an isolated sandbox](../../20-features/096-artifact-and-generated-application-components/F096-06-live-preview-in-an-isolated-sandbox.md)

## S96.14

**Dependency resolver.** A resolver installs or maps the packages generated code imports.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F096-06 Live preview in an isolated sandbox](../../20-features/096-artifact-and-generated-application-components/F096-06-live-preview-in-an-isolated-sandbox.md)

## S96.15

**Preview sandbox.** Previews run in an isolated sandbox that cannot reach the user's session or data.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F096-06 Live preview in an isolated sandbox](../../20-features/096-artifact-and-generated-application-components/F096-06-live-preview-in-an-isolated-sandbox.md)
- Competitor trace: CAP-artifacts-and-documents-02

## S96.16

**Preview-origin management.** Preview frames are served from a dedicated, managed origin separate from the app.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F096-06 Live preview in an isolated sandbox](../../20-features/096-artifact-and-generated-application-components/F096-06-live-preview-in-an-isolated-sandbox.md)

## S96.17

**Artifact data store.** Generated apps can persist data in a backend store provided by the platform.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F096-07 App data storage](../../20-features/096-artifact-and-generated-application-components/F096-07-app-data-storage.md)
- Competitor trace: CAP-artifacts-and-documents-17

## S96.18

**Connected-data proxy.** A proxy lets artifacts read connected-service data without exposing credentials.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F096-08 Connected data for apps (services and viewer sign-in)](../../20-features/096-artifact-and-generated-application-components/F096-08-connected-data-for-apps-services-and-viewer-sign-i.md)
- Competitor trace: CAP-artifacts-and-documents-13

## S96.19

**Viewer-authentication bridge.** A bridge lets a viewer of a shared app sign in to that app's connected services.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F096-08 Connected data for apps (services and viewer sign-in)](../../20-features/096-artifact-and-generated-application-components/F096-08-connected-data-for-apps-services-and-viewer-sign-i.md)
- Competitor trace: CAP-artifacts-and-documents-18

## S96.20

**Generated-site deployment service.** A service deploys generated sites/apps to a hosted URL.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F096-09 Publishing to a hosted link](../../20-features/096-artifact-and-generated-application-components/F096-09-publishing-to-a-hosted-link.md)
- Competitor trace: CAP-artifacts-and-documents-15

## S96.21

**Deployment history.** Each publication keeps a deployment history the owner can inspect.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F096-09 Publishing to a hosted link](../../20-features/096-artifact-and-generated-application-components/F096-09-publishing-to-a-hosted-link.md)

## S96.22

**Custom-domain management.** Owners can attach and manage custom domains for published apps.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F096-09 Publishing to a hosted link](../../20-features/096-artifact-and-generated-application-components/F096-09-publishing-to-a-hosted-link.md)

## S96.23

**Published-app authorization.** Access to a published app is authorized per its audience (public vs workspace).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F096-09 Publishing to a hosted link](../../20-features/096-artifact-and-generated-application-components/F096-09-publishing-to-a-hosted-link.md)
- Competitor trace: CAP-artifacts-and-documents-15

## S96.24

**App-level metering.** Usage by each published app (views, compute, AI calls) is metered.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F096-09 Publishing to a hosted link](../../20-features/096-artifact-and-generated-application-components/F096-09-publishing-to-a-hosted-link.md)
- Competitor trace: CAP-artifacts-and-documents-17, CAP-artifacts-and-documents-26

## S96.25

**Publication moderation.** Published content is screened and can be reported and taken down by moderators.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F096-09 Publishing to a hosted link](../../20-features/096-artifact-and-generated-application-components/F096-09-publishing-to-a-hosted-link.md)

## S96.26

**Unpublish/rollback controller.** A controller unpublishes a publication and restores earlier versions.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F096-09 Publishing to a hosted link](../../20-features/096-artifact-and-generated-application-components/F096-09-publishing-to-a-hosted-link.md)
- Competitor trace: CAP-artifacts-and-documents-15

## S96.27

**Template registry.** A registry serves artifact/app templates users can start from.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F096-10 Templates and design-system assets](../../20-features/096-artifact-and-generated-application-components/F096-10-templates-and-design-system-assets.md)
- Competitor trace: CAP-artifacts-and-documents-22

## S96.28

**Design-system asset registry.** A registry stores design-system assets (brand colours, fonts, logos) artifacts can use.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F096-10 Templates and design-system assets](../../20-features/096-artifact-and-generated-application-components/F096-10-templates-and-design-system-assets.md)
- Competitor trace: CAP-artifacts-and-documents-11

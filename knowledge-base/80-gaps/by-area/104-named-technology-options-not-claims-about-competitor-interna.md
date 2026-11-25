---
id: "GAPS-AREA-104"
type: "gap-list"
title: "Gaps: Named technology options-not claims about competitor internals"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Gaps: 104. Named technology options-not claims about competitor internals

45 open gaps that touch this area. Area page: [20-features/104-named-technology-options-not-claims-about-competitor-interna](../../20-features/104-named-technology-options-not-claims-about-competitor-interna/README.md).

## GAP-F104-01-01

**Brief marks S104.02 and S104.03 'platform done' with one status; no per-app status exists. Chrome and VS Code lack Mermaid in answers; mobile cannot run app cards.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F104-01](../../20-features/104-named-technology-options-not-claims-about-competitor-interna/F104-01-chat-answers-formatting-code-math-diagrams-and-emb.md)
- Detail: Affects: Chrome, VS Code, mobile. Work needed: Record per-app status; decide whether to add Mermaid and app support or label them unsupported.
- Evidence: extension and vscode source grep; apps/mobile/.../McpAppCard.tsx:1-30

## GAP-F104-01-02

**Failed-formula and empty-answer states are not specified or tested.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F104-01](../../20-features/104-named-technology-options-not-claims-about-competitor-interna/F104-01-chat-answers-formatting-code-math-diagrams-and-emb.md)
- Detail: Affects: All apps. Work needed: Define visible behaviour; add a test.
- Evidence: MarkdownContent.tsx:748 handles only streaming

## GAP-F104-01-03

**The brief cites tool-loop.ts:2146 for the app card; that line is stream parsing. The card code is at 2969-3000.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F104-01](../../20-features/104-named-technology-options-not-claims-about-competitor-interna/F104-01-chat-answers-formatting-code-math-diagrams-and-emb.md)
- Detail: Affects: Documentation accuracy. Work needed: Correct the brief's references.
- Evidence: tool-loop.ts:2130-2160 vs 2969-3000

## GAP-F104-01-04

**No retry control on a failed app card.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F104-01](../../20-features/104-named-technology-options-not-claims-about-competitor-interna/F104-01-chat-answers-formatting-code-math-diagrams-and-emb.md)
- Detail: Affects: Web. Work needed: Add retry or explain.
- Evidence: McpAppCard.tsx:~404-445

## GAP-F104-02-01

**S104.05 recorded as not applicable but a read-only grid ships; editing and formulas are missing.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F104-02](../../20-features/104-named-technology-options-not-claims-about-competitor-interna/F104-02-artifacts-documents-code-charts-slides-images-and.md)
- Detail: Affects: Web, desktop (hosted web), mobile has its own TabularGridView. Work needed: Correct the brief; decide on editing and formulas.
- Evidence: SpreadsheetArtifact.tsx:25-26,73-140; mobile TabularGridView.tsx

## GAP-F104-02-02

**S104.07 says mask, crop and annotate; only mask and reframe exist.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F104-02](../../20-features/104-named-technology-options-not-claims-about-competitor-interna/F104-02-artifacts-documents-code-charts-slides-images-and.md)
- Detail: Affects: Web. Work needed: Add crop and annotate or reword the requirement.
- Evidence: ImageMaskDialog.tsx; ImageGenerationCard.tsx:~729

## GAP-F104-02-03

**No .pptx item in the deck download menu.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F104-02](../../20-features/104-named-technology-options-not-claims-about-competitor-interna/F104-02-artifacts-documents-code-charts-slides-images-and.md)
- Detail: Affects: Web. Work needed: Wire the pptx generator to the menu.
- Evidence: ArtifactPreview.tsx:2398-2411

## GAP-F104-02-04

**No video playback and edit engine for artifacts.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F104-02](../../20-features/104-named-technology-options-not-claims-about-competitor-interna/F104-02-artifacts-documents-code-charts-slides-images-and.md)
- Detail: Affects: All. Work needed: Decide scope.
- Evidence: no trim code found

## GAP-F104-02-05

**Failure and empty states per editor not verified.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F104-02](../../20-features/104-named-technology-options-not-claims-about-competitor-interna/F104-02-artifacts-documents-code-charts-slides-images-and.md)
- Detail: Affects: Web. Work needed: Add tests.
- Evidence: brief 'Not verified'

## GAP-F104-03-01

**T08 says an in-product PDF engine viewer; web uses the browser's viewer, only mobile bundles PDF.js.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F104-03](../../20-features/104-named-technology-options-not-claims-about-competitor-interna/F104-03-files-and-pdfs-reading-pdfs-and-storing-uploads.md)
- Detail: Affects: Web, desktop. Work needed: Reword requirement or add a client viewer.
- Evidence: ArtifactPreview.tsx:2011-2018

## GAP-F104-03-02

**No PDF reading in Local mode.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F104-03](../../20-features/104-named-technology-options-not-claims-about-competitor-interna/F104-03-files-and-pdfs-reading-pdfs-and-storing-uploads.md)
- Detail: Affects: Mobile Local. Work needed: Decide and build or state Local limits.
- Evidence: extraction file is server-only (line 1)

## GAP-F104-03-03

**Upload failure messages and plan limits are not verified.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F104-03](../../20-features/104-named-technology-options-not-claims-about-competitor-interna/F104-03-files-and-pdfs-reading-pdfs-and-storing-uploads.md)
- Detail: Affects: Web, mobile. Work needed: Test and document.
- Evidence: brief 'Not verified'

## GAP-F104-03-04

**Brief line cites pdf-attachment-content.ts:196-204 for the legacy build; code at those lines matches (loadPdfjs 199-205).**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F104-03](../../20-features/104-named-technology-options-not-claims-about-competitor-interna/F104-03-files-and-pdfs-reading-pdfs-and-storing-uploads.md)
- Detail: Affects: none. Work needed: none
- Evidence: lines checked

## GAP-F104-04-01

**Co-editing not built.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F104-04](../../20-features/104-named-technology-options-not-claims-about-competitor-interna/F104-04-live-updates-live-voice-and-co-editing-not-built.md)
- Detail: Affects: All apps. Work needed: Decide scope, choose engine, add server relay.
- Evidence: no CRDT import; brief T05 missing

## GAP-F104-04-02

**Brief says pair/claim returns a WebSocket address; the route returns the relay's payload (shape in signalingClaimSchema) and the WebSocket service is outside the files read.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F104-04](../../20-features/104-named-technology-options-not-claims-about-competitor-interna/F104-04-live-updates-live-voice-and-co-editing-not-built.md)
- Detail: Affects: Remote control. Work needed: Read the relay service and update the brief.
- Evidence: claim/route.ts:140-165

## GAP-F104-04-03

**Voice failure and permission messages beyond the named ones not verified.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F104-04](../../20-features/104-named-technology-options-not-claims-about-competitor-interna/F104-04-live-updates-live-voice-and-co-editing-not-built.md)
- Detail: Affects: Web, mobile. Work needed: Test.
- Evidence: brief

## GAP-F104-04-04

**Desktop, Chrome, VS Code live voice not read.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F104-04](../../20-features/104-named-technology-options-not-claims-about-competitor-interna/F104-04-live-updates-live-voice-and-co-editing-not-built.md)
- Detail: Affects: Those apps. Work needed: Read and record.
- Evidence: not opened

## GAP-F104-05-01

**Brief gives platform status only; per-app depth for desktop, mobile and CLI is unknown.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F104-05](../../20-features/104-named-technology-options-not-claims-about-competitor-interna/F104-05-native-apps-and-cli-shells.md)
- Detail: Affects: All native apps. Work needed: Per-app rows.
- Evidence: brief S104.09, S104.10

## GAP-F104-05-02

**Requirement that on-device inference be free on desktop does not match the Electron decision to refuse it.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F104-05](../../20-features/104-named-technology-options-not-claims-about-competitor-interna/F104-05-native-apps-and-cli-shells.md)
- Detail: Affects: Desktop. Work needed: Owner decision; either amend the requirement or enable a path.
- Evidence: dispatcher.ts:3234-3244

## GAP-F104-05-03

**Brief cites main.ts:1345 and mobile _layout.tsx:196/package.json:121; those lines do not show a shell definition (1345 is session activity reporting).**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F104-05](../../20-features/104-named-technology-options-not-claims-about-competitor-interna/F104-05-native-apps-and-cli-shells.md)
- Detail: Affects: Documentation. Work needed: Update references.
- Evidence: main.ts:1335-1345; package.json:119-123

## GAP-F104-06-01

**Desktop (Electron) refuses on-device inference although the product requirement says local inference on desktop is free of any subscription.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F104-06](../../20-features/104-named-technology-options-not-claims-about-competitor-interna/F104-06-on-device-data-and-on-device-models.md)
- Detail: Affects: Desktop. Work needed: Owner decision; update requirement or build path.
- Evidence: dispatcher.ts:3234-3244; D-2026-09-15-04

## GAP-F104-06-02

**No evidence on what a person sees when a device cannot run a model mid-chat.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F104-06](../../20-features/104-named-technology-options-not-claims-about-competitor-interna/F104-06-on-device-data-and-on-device-models.md)
- Detail: Affects: Mobile. Work needed: Test and document.
- Evidence: brief 'Not verified'

## GAP-F104-06-03

**Web, Chrome, VS Code and CLI storage of chats not read.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F104-06](../../20-features/104-named-technology-options-not-claims-about-competitor-interna/F104-06-on-device-data-and-on-device-models.md)
- Detail: Affects: Those apps. Work needed: Read.
- Evidence: not opened

## GAP-F104-06-04

**Brief cites tier3.ts:30 for loading at runtime; at that range the code is the dynamic module loader at lines 25-36, which matches.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F104-06](../../20-features/104-named-technology-options-not-claims-about-competitor-interna/F104-06-on-device-data-and-on-device-models.md)
- Detail: Affects: none. Work needed: none
- Evidence: tier3.ts:25-36

## GAP-F104-07-01

**Chat messages are matched by substring, not by meaning; the brief calls for an indexed search engine for conversations and messages.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F104-07](../../20-features/104-named-technology-options-not-claims-about-competitor-interna/F104-07-search-and-stored-knowledge.md)
- Detail: Affects: Web and mobile Cloud users searching old chats.. Work needed: Decide whether messages should be chunked into the retrieval index, or adjust the brief to say substring search.
- Evidence: route.ts:372; 0101_sync_and_search_indexes.sql:80-100

## GAP-F104-07-02

**Filters switch off document and meaning search silently.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F104-07](../../20-features/104-named-technology-options-not-claims-about-competitor-interna/F104-07-search-and-stored-knowledge.md)
- Detail: Affects: Web users using role or date filters.. Work needed: Support filters in the retrieval query or tell the person.
- Evidence: route.ts:398-401

## GAP-F104-07-03

**Mobile ignores indexed documents in search results.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F104-07](../../20-features/104-named-technology-options-not-claims-about-competitor-interna/F104-07-search-and-stored-knowledge.md)
- Detail: Affects: Mobile Cloud users.. Work needed: Render the documents array.
- Evidence: chatViewStore.ts:250-262

## GAP-F104-07-04

**No search on desktop, CLI, VS Code or Chrome found.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F104-07](../../20-features/104-named-technology-options-not-claims-about-competitor-interna/F104-07-search-and-stored-knowledge.md)
- Detail: Affects: Those apps.. Work needed: Confirm per app whether parity is required; Rust CLI not searched.
- Evidence: No /api/search caller in .ts/.tsx outside web and mobile

## GAP-F104-07-05

**Meaning search is always managed-cloud; no own-key or local embedding path.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F104-07](../../20-features/104-named-technology-options-not-claims-about-competitor-interna/F104-07-search-and-stored-knowledge.md)
- Detail: Affects: Own-key and Local users.. Work needed: Decide the trust-boundary rule for embeddings in own-key mode.
- Evidence: retrieval-embedding-service.ts:68-110

## GAP-F104-08-01

**No user-visible failure state for queue jobs.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F104-08](../../20-features/104-named-technology-options-not-claims-about-competitor-interna/F104-08-background-jobs-and-durable-agent-runs.md)
- Detail: Affects: Web users whose export or notification job dies.. Work needed: Decide which job kinds need a person-facing status.
- Evidence: Only admin route found: app/api/admin/background-jobs

## GAP-F104-08-02

**Durable path can silently degrade to inline, where closing the tab ends the run.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F104-08](../../20-features/104-named-technology-options-not-claims-about-competitor-interna/F104-08-background-jobs-and-durable-agent-runs.md)
- Detail: Affects: Web, desktop, mobile cloud users.. Work needed: Tell the person when a turn is not detachable.
- Evidence: start-cloud-agent-workflow.ts:196-262

## GAP-F104-08-03

**Retrieval indexing is on a separate cron plus workflow, not the job queue, so there are three background mechanisms.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F104-08](../../20-features/104-named-technology-options-not-claims-about-competitor-interna/F104-08-background-jobs-and-durable-agent-runs.md)
- Detail: Affects: Operators.. Work needed: Document or consolidate.
- Evidence: index-retrieval-documents/route.ts:15-37

## GAP-F104-08-04

**Desktop and mobile run handling was not verified in this read.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F104-08](../../20-features/104-named-technology-options-not-claims-about-competitor-interna/F104-08-background-jobs-and-durable-agent-runs.md)
- Detail: Affects: Desktop, mobile.. Work needed: Read run clients and record reconnect behaviour.
- Evidence: Only file names located

## GAP-F104-09-01

**Gate functions disagree on what 'on' means.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F104-09](../../20-features/104-named-technology-options-not-claims-about-competitor-interna/F104-09-cloud-code-sandbox-and-browser-automation.md)
- Detail: Affects: Web deployments with a key but flag 0.. Work needed: Align callers on the strict gate or document the difference.
- Evidence: gate.ts:9-28; runtime.ts:796; tool-loop.ts:2802

## GAP-F104-09-02

**Sandbox is off by default and the brief says to turn it on in production.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F104-09](../../20-features/104-named-technology-options-not-claims-about-competitor-interna/F104-09-cloud-code-sandbox-and-browser-automation.md)
- Detail: Affects: All web users wanting Cloud Code.. Work needed: Owner decision and production configuration (not done by this page).
- Evidence: .env.example:382-386; brief S104.24

## GAP-F104-09-03

**Browser automation has no own-key or Local model route.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F104-09](../../20-features/104-named-technology-options-not-claims-about-competitor-interna/F104-09-cloud-code-sandbox-and-browser-automation.md)
- Detail: Affects: Own-key and Local Chrome users.. Work needed: Decide the policy; extend the model resolver.
- Evidence: cloudAgentClient.ts:84-92

## GAP-F104-09-04

**Desktop, CLI and VS Code equivalents not documented here.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F104-09](../../20-features/104-named-technology-options-not-claims-about-competitor-interna/F104-09-cloud-code-sandbox-and-browser-automation.md)
- Detail: Affects: Those apps.. Work needed: Read and record.
- Evidence: not read

## GAP-F104-10-01

**Mobile and extension have no error-tracking client found.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F104-10](../../20-features/104-named-technology-options-not-claims-about-competitor-interna/F104-10-accounts-payments-encryption-keys-monitoring-and-r.md)
- Detail: Affects: Mobile, Chrome.. Work needed: Decide if required and add.
- Evidence: apps/mobile and apps/extension package.json show no @sentry package; desktop has one (apps/desktop/package.json:93)

## GAP-F104-10-02

**Checkout ships disabled in the example environment.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F104-10](../../20-features/104-named-technology-options-not-claims-about-competitor-interna/F104-10-accounts-payments-encryption-keys-monitoring-and-r.md)
- Detail: Affects: Web purchasers where the gate is false.. Work needed: Owner decision per environment.
- Evidence: .env.example:232; checkout/route.ts:58-62

## GAP-F104-10-03

**Sign-in providers of CLI, VS Code and Chrome not read.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F104-10](../../20-features/104-named-technology-options-not-claims-about-competitor-interna/F104-10-accounts-payments-encryption-keys-monitoring-and-r.md)
- Detail: Affects: Those apps.. Work needed: Read and record.
- Evidence: not read

## GAP-F104-10-04

**No end-to-end verification record that a release is signed on every platform in this read.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F104-10](../../20-features/104-named-technology-options-not-claims-about-competitor-interna/F104-10-accounts-payments-encryption-keys-monitoring-and-r.md)
- Detail: Affects: Release engineers.. Work needed: Run the release verification script and store its result.
- Evidence: workflow files only

## GAP-F104-99-01

**S104.T05 live co-editing with a CRDT is not built.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F104-99](../../20-features/104-named-technology-options-not-claims-about-competitor-interna/F104-99-other-items.md)
- Detail: Affects: All apps with documents.. Work needed: Product decision, then a CRDT engine plus transport and persistence.
- Evidence: no yjs import or dependency found

## GAP-F104-99-02

**S104.T09 brief status contradicts the code (xterm used).**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F104-99](../../20-features/104-named-technology-options-not-claims-about-competitor-interna/F104-99-other-items.md)
- Detail: Affects: Brief accuracy; web inside desktop host.. Work needed: Correct the brief.
- Evidence: apps/web/package.json:121-123; LocalPtyTerminal.tsx:4,96

## GAP-F104-99-03

**S104.T08 viewer is an iframe, not an in-product PDF.js viewer.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F104-99](../../20-features/104-named-technology-options-not-claims-about-competitor-interna/F104-99-other-items.md)
- Detail: Affects: Web PDF artifacts.. Work needed: Either adopt a PDF.js viewer or reword the requirement.
- Evidence: ArtifactPreview.tsx:2002-2014

## GAP-F104-99-04

**Brief code references for several items no longer hit the stated symbols.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F104-99](../../20-features/104-named-technology-options-not-claims-about-competitor-interna/F104-99-other-items.md)
- Detail: Affects: Auditors.. Work needed: Refresh the references.
- Evidence: lines checked on 2026-11-24

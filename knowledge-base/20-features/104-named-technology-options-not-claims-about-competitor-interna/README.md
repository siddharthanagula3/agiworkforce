---
id: "AREA-104"
type: "area"
title: "Named technology options-not claims about competitor internals"
features: ["F104-01", "F104-02", "F104-03", "F104-04", "F104-05", "F104-06", "F104-07", "F104-08", "F104-09", "F104-10", "F104-99"]
basis: "code inspection"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# 104. Named technology options-not claims about competitor internals

This area is the set of named technology choices under the product: the web framework, the chat answer renderer, the document, code and slide editors, the PDF text reader, the terminal, the on-device data store and model runtime, the search and vector store, the job queue, the cloud sandbox, sign-in, payments, key management and monitoring. A person does not see this as one screen. They meet it as answers that render math and diagrams, artifacts they can edit, files they can read, and background work that keeps running. The brief records whether each named technology is in the code, missing, or not applicable.

**Who uses it.** Every end user meets parts of it through chat and artifact screens. Cloud parts are gated by plan or beta: the cloud sandbox is checked against a managed-compute private beta gate (apps/web/lib/e2b/gate.ts:3 imports it; apps/web/lib/services/cloud-code-github-task.ts:221 checks it). Workspace admins choose a key provider for customer-managed keys (apps/web/lib/crypto/kms-providers.ts:38-44). Developers maintain the libraries and guard tests. Which plans get which other parts was not established.

## Features in this area

| ID | Feature | Web | Desktop | Mobile | CLI | VS Code | Chrome |
|---|---|---|---|---|---|---|---|
| [F104-01](F104-01-chat-answers-formatting-code-math-diagrams-and-emb.md) | Chat answers: formatting, code, math, diagrams and embedded app cards | n/a | n/a | n/a | n/a | n/a | n/a |
| [F104-02](F104-02-artifacts-documents-code-charts-slides-images-and.md) | Artifacts: documents, code, charts, slides, images, and two items not built | n/a | n/a | n/a | n/a | n/a | n/a |
| [F104-03](F104-03-files-and-pdfs-reading-pdfs-and-storing-uploads.md) | Files and PDFs: reading PDFs and storing uploads | n/a | n/a | n/a | n/a | n/a | n/a |
| [F104-04](F104-04-live-updates-live-voice-and-co-editing-not-built.md) | Live updates, live voice and co-editing (not built) | n/a | n/a | n/a | n/a | n/a | n/a |
| [F104-05](F104-05-native-apps-and-cli-shells.md) | Native apps and CLI shells | n/a | n/a | n/a | n/a | n/a | n/a |
| [F104-06](F104-06-on-device-data-and-on-device-models.md) | On-device data and on-device models | n/a | n/a | n/a | n/a | n/a | n/a |
| [F104-07](F104-07-search-and-stored-knowledge.md) | Search and stored knowledge | n/a | n/a | n/a | n/a | n/a | n/a |
| [F104-08](F104-08-background-jobs-and-durable-agent-runs.md) | Background jobs and durable agent runs | n/a | n/a | n/a | n/a | n/a | n/a |
| [F104-09](F104-09-cloud-code-sandbox-and-browser-automation.md) | Cloud code sandbox and browser automation | n/a | n/a | n/a | n/a | n/a | n/a |
| [F104-10](F104-10-accounts-payments-encryption-keys-monitoring-and-r.md) | Accounts, payments, encryption keys, monitoring and release builds | n/a | n/a | n/a | n/a | n/a | n/a |
| [F104-99](F104-99-other-items.md) | Other items in Named technology options-not claims about competitor internals | n/a | n/a | n/a | n/a | n/a | n/a |

Requirement items for this area: [10-requirements/capabilities/104-named-technology-options-not-claims-about-competitor-interna.md](../../10-requirements/capabilities/104-named-technology-options-not-claims-about-competitor-interna.md).

## How this area works in the code

1. **1. Person sends a question.** The chat screen renders the answer through the shared Markdown renderer. Math, code and diagrams are handled inside the renderer. (`packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx:2-5`, `apps/web/features/chat/components/messages/MessageBubble.tsx:111`)
2. **2. Answer is sanitized and typeset.** Markdown is parsed, math is typeset with KaTeX, and HTML is sanitized before it is shown. (`packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx:3,5,15`)
3. **3. Code and diagrams load on demand.** Code highlighting uses Shiki; Mermaid is loaded only when a diagram appears. (`packages/ui/unified-chat/src/components/markdown/shikiHighlighter.ts:1`, `packages/ui/unified-chat/src/components/markdown/MermaidDiagram.tsx:135-137`)
4. **4. Artifact opens in side panel.** The artifact viewer mounts the document editor, code editor, chart or slide viewer for the artifact type. (`apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1977-1979`, `apps/web/features/chat/components/artifacts/ArtifactDocumentEditor.tsx:26`, `apps/web/features/chat/components/artifacts/ArtifactCodeEditor.tsx:142`)
5. **5. Attached PDF is read on the server.** The server extracts PDF text with the pdfjs legacy build and caps its length before it goes to the model. (`apps/web/lib/server/pdf-attachment-content.ts:144`, `apps/web/lib/server/pdf-attachment-content.ts:196-204`)
6. **6. Data is saved.** Conversations and search data go to Neon Postgres through the data adapter; files go to S3-compatible storage. (`packages/platform/data-layer/src/adapters/neon.ts:65`, `packages/platform/object-storage/src/adapters/s3.ts`)
7. **7. Search runs in the database.** Keyword search uses full-text search; meaning search uses a vector distance query, scoped to the user. (`apps/web/lib/services/retrieval-search-service.ts:204`, `apps/web/lib/services/retrieval-search-service.ts:220-239`, `apps/web/db/neon/0202_retrieval_index.sql:142`)
8. **8. Background work drains on a schedule.** A cron route runs queued jobs within a time budget; cloud agent runs use a durable workflow. (`apps/web/app/api/cron/drain-background-jobs/route.ts:20-26`, `vercel.json:150`, `apps/web/lib/workflows/cloud-agent-workflow.ts:34`)
9. **9. Cloud sandbox is checked before use.** Before any cloud code run, the sandbox gate checks the switch and key. If off, the run is refused. (`apps/web/lib/e2b/gate.ts:9-13`, `apps/web/lib/e2b/runtime.ts:796`)
10. **10. Feature flags and monitoring.** Flags are read from the database per subject; errors and traces are exported when configured. (`apps/web/lib/feature-flags/flag-store.ts:115`, `apps/web/app/api/me/route.ts:197`, `apps/web/instrumentation.ts:98-101`)

## Files to know

| File | Role |
|---|---|
| `packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx` | Renders chat answers: Markdown, sanitizing, math, code and image handling. Shared by several apps. |
| `packages/ui/unified-chat/src/components/markdown/MermaidDiagram.tsx` | Loads Mermaid on demand and draws diagrams inside answers. |
| `apps/web/features/chat/components/artifacts/ArtifactPreview.tsx` | Host for artifact viewers and editors on the web (about 3,750 lines). |
| `apps/web/lib/e2b/gate.ts` | Cloud sandbox switch: reads AGI_E2B_EXECUTION and E2B_API_KEY. |
| `apps/web/lib/feature-flags/flag-store.ts` | Reads feature flag definitions from the database and caches them. |
| `apps/web/app/api/cron/drain-background-jobs/route.ts` | Scheduled route that drains queued background jobs. |
| `apps/web/lib/services/retrieval-search-service.ts` | Keyword and meaning (vector) search queries against the database. |
| `apps/mobile/storage/db.ts` | Opens the encrypted on-device database and handles unreadable files. |
| `packages/platform/local-llm/src/tier3.ts` | Loads the on-device model runtime on capable devices. |
| `apps/web/lib/server/pdf-attachment-content.ts` | Server-side PDF text extraction for attachments. |
| `apps/web/features/chat/lib/live-voice-session.ts` | Web live voice session over a WebRTC peer connection. |
| `apps/extension/src/features/computer-use/cdpDriver.ts` | Chrome extension driver that sends browser debugger commands per tab. |

## What is stored

- Chat, artifacts, conversations, search data: Neon Postgres, through the data adapter (packages/platform/data-layer/src/adapters/neon.ts:65; apps/web/app/api/chat/conversations/route.ts:236)
- Embeddings for knowledge chunks, search vector: Neon Postgres, columns queried in apps/web/lib/services/retrieval-search-service.ts:220-239; index in apps/web/db/neon/0202_retrieval_index.sql:142
- Uploaded and generated files: S3-compatible object storage (packages/platform/object-storage/src/adapters/s3.ts)
- On-device chat database (encrypted SQLite file agi_mobile.db): Phone storage, opened in apps/mobile/storage/db.ts:23
- Database encryption key (256-bit): Device secure storage, under the id in apps/mobile/storage/db.ts:25
- Feature flag definitions: Neon Postgres, read in apps/web/lib/feature-flags/flag-store.ts:115
- Organization encryption keys, customer-managed keys: Key ring and external key providers (apps/web/lib/crypto/platform-keys.ts:67; apps/web/lib/server/organization-encryption-keys.ts:127); exact storage not read
- Background job queue: Neon Postgres via getNeonDb (apps/web/lib/jobs/job-service.ts); table names not read

## Switches

Plan gates, flags and settings that turn parts of this area on or off.

- **AGI_E2B_EXECUTION**: Turns the cloud code sandbox on when set to 1. Shipped as 0 in the web env example. (apps/web/lib/e2b/gate.ts:6, :16-18; apps/web/.env.example:384)
- **E2B_API_KEY**: Sandbox key. Alone it turns on the looser execution check, see things_that_look_wrong. (apps/web/lib/e2b/gate.ts:7, :9-13)
- **AGI_E2B_COMPUTE_MICROUSD_PER_SECOND**: Sandbox price used for metering; without it the sandbox is not priceable. (apps/web/.env.example:386; apps/web/lib/e2b/gate.ts:20-24 (provisioning check))
- **Managed compute private beta gate**: Extra check before cloud code tasks run. (apps/web/lib/services/cloud-code-github-task.ts:221; apps/web/lib/e2b/gate.ts:3)
- **AGI_DB_LOW_POWER**: Skips cron background work in low-power mode. (apps/web/lib/server/cron-low-power.ts:9-11; apps/web/app/api/cron/drain-background-jobs/route.ts:26)
- **Feature flags and entitlement bundle**: Turns features on per user and reports plan entitlements to the client. (apps/web/lib/feature-flags/flag-store.ts:115; apps/web/app/api/me/route.ts:197)
- **AGI_KMS_AWS_* and GOOGLE_APPLICATION_CREDENTIALS**: Credentials for the AWS and GCP key providers. A provider without credentials is not built. (apps/web/lib/crypto/kms-providers.ts:38-44)
- **OpenTelemetry export and Sentry**: Export of traces and errors when configured. (apps/web/instrumentation.ts:98, :101)
- **Encrypted local database**: Turns on the SQLCipher-encrypted database in the mobile build. (apps/mobile/app.config.js:454)

## Shared between apps

Shared across apps: packages/ui/unified-chat (answer renderer, artifact components, Mermaid, KaTeX, Shiki), used by desktop, web, Chrome and VS Code (AGENTS.md section 5). packages/ui/ui (dialogs, popovers and other primitives). packages/platform/data-layer (database adapter), packages/platform/object-storage (file adapter), packages/platform/local-llm (on-device model runtime, imported by mobile onboarding and settings: apps/mobile/app/(public)/onboarding.tsx:48, apps/mobile/app/(app)/settings/performance.tsx:33). Separate per app: the web server routes and workflows (apps/web), the Electron main process (apps/desktop/electron), the Expo app and its encrypted database (apps/mobile), the Rust CLI (apps/cli), the Chrome debugger driver (apps/extension).

## Looks wrong in the code

From reading only; not confirmed in the running app. Each line is also in the gap register.

- Brief says xterm is not applicable anywhere, but the terminal library is a dependency and is imported in product code. (apps/web/package.json:123; apps/desktop/src/features/terminal/Terminal.tsx (six @xterm lines); apps/web/features/code/components/LocalPtyTerminal.tsx)
- Cloud sandbox gate contradicts the brief and the env example. The brief and env example say the switch and the key are both needed. The helper e2bExecutionEnabled returns true when the key alone is set, and runtime, reclaim and templates use it. (apps/web/lib/e2b/gate.ts:9-13 (OR logic) vs gate.ts:16-18 (switch only) and apps/web/.env.example:382-384; callers apps/web/lib/e2b/runtime.ts:796, apps/web/lib/e2b/reclaim.ts:66, apps/web/lib/e2b/templates.ts:379)
- Brief says the web has an in-product PDF viewer, but the cited line is undo logic. PDF library use found on the web is server-side text extraction only. (apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1075; apps/web/lib/server/pdf-attachment-content.ts:156-204)
- Brief cites the mobile on-device model to a theme import line; the real use is at onboarding.tsx:48. Brief cites a desktop local-inference anchor that is an unrelated developer action; the desktop code checks a local model server instead. (apps/mobile/app/(public)/onboarding.tsx:19; apps/desktop/electron/runtime/dispatcher.ts:799; apps/desktop/src/services/ollamaHealthService.ts:1)
- Several brief anchors point to lines that show no named technology (a brace, a blank line, a comment, or unrelated code). The named file exists but the anchor does not show the claim. (apps/web/app/layout.tsx:114; apps/cli/src/lib.rs:4609; apps/mobile/app.config.js:283; apps/mobile/storage/db.ts:89; apps/web/lib/services/managed-office-file-service.ts:514 (pptx is at :23); vercel.json:134 (drain job is at :150); apps/extension/src/features/computer-use/debuggerSession.ts:31; apps/web/lib/jobs/job-service.ts:503; apps/mobile/app/_layout.tsx:710; apps/web/app/api/search/route.ts:308; apps/web/app/api/stripe-webhook/lib/verify.ts:27)
- Brief says a search engine sits behind a search API. In code, search is full-text and vector queries inside Neon Postgres, with no separate search engine found. (apps/web/lib/services/retrieval-search-service.ts:220-239)

## Not established

- Per-app status: the brief gives one status (platform) per item, not per app. The on_each_app entries are based on which code was found, not on the brief's Status lines.
- Plan limits and which plans see each feature, beyond the sandbox beta gate.
- Empty, waiting and failure states for diagrams, formulas, PDF reading, live voice, uploads and cloud jobs. Not read.
- Whether a web PDF viewer exists outside ArtifactPreview.tsx. A broader search of apps/web found no client-side viewer, but the search was not exhaustive.
- Whether the cloud sandbox is on in production. The code default is off (.env.example:384); production configuration was not read.
- The brief's search route anchor (apps/web/app/api/search/route.ts:308) reads a role parameter; the rest of the route was not read.
- Data stored for the background job queue and organization encryption keys: table names and storage were not read.
- Chrome extension, VS Code and CLI rendering paths for answers and artifacts were not read in depth.
- No builds, tests, installs or servers were run, because this was a read-only code reading. So the localhost and one-surface-at-a-time testing instruction in the request was not applied to this pass.

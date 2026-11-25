# Area 104. Named technology options-not claims about competitor internals

39 items. Status words: done, partial, missing, unverified, n/a (does not apply to that app).

## S104.T01 React with Next.js (Web application framework)
- Should: The web product is built with React on Next.js (server and client components).
- Status: platform done
- Code: apps/web/package.json:123; apps/web/app/layout.tsx:114; apps/web/app/Providers.tsx:1

## S104.T02 shadcn/ui and its underlying component primitives (Reusable web components)
- Should: Web UI is built from a shared shadcn-style primitive library over Radix primitives, used by mounted screens.
- Status: platform done
- Code: packages/ui/ui/src/primitives/Dialog.tsx:1; packages/ui/ui/src/primitives/Popover.tsx:1; apps/web/features/chat/pages/WebChatPage.tsx:134

## S104.T03 Tiptap (Rich document editor)
- Should: Rich documents are edited in an embedded rich-text editor engine (Tiptap or equivalent).
- Status: platform done
- Code: apps/web/features/chat/components/artifacts/ArtifactDocumentEditor.tsx:26; apps/web/features/chat/components/artifacts/document-editor-markdown.ts:81; apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:2201

## S104.T04 TanStack Query (Server-state fetching and caching)
- Should: Web server state is fetched and cached through TanStack Query with a mounted QueryClientProvider.
- Status: platform done
- Code: apps/web/shared/stores/query-client.ts:119; apps/web/app/ProductRuntimeProviders.tsx:12; apps/web/features/workspace-console/hooks/use-workspace-roles.ts:101

## S104.T05 Yjs (Collaborative editing)
- Should: Documents can be co-edited live by several people through a CRDT engine (Yjs or equivalent).
- Status: platform missing

## S104.T06 Mermaid (Diagrams)
- Should: Mermaid code blocks in answers render as diagrams through the Mermaid engine in the mounted chat renderer.
- Status: platform done
- Code: packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx:59; packages/ui/unified-chat/src/components/markdown/MermaidDiagram.tsx:123; apps/web/features/chat/components/messages/MessageBubble.tsx:111

## S104.T07 KaTeX (Mathematical typesetting)
- Should: Math in answers is typeset with KaTeX in the mounted chat markdown renderer.
- Status: platform done
- Code: packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx:3; packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx:475; apps/web/features/chat/components/messages/MessageBubble.tsx:111

## S104.T08 PDF.js (PDF viewing)
- Should: PDFs open in an in-product viewer backed by a PDF rendering engine, and PDF text is parsed by a PDF engine.
- Status: platform done
- Code: apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1075; apps/web/lib/server/pdf-attachment-content.ts:144

## S104.T09 xterm.js (Browser/desktop terminal UI)
- Should: A terminal UI (xterm.js or equivalent) is shown inside the browser or desktop product.
- Status: not applicable anywhere

## S104.T10 Rust TUI/runtime separation, or TypeScript/React/Ink-style composition (Terminal application architecture)
- Should: The CLI separates a Rust TUI front end from its agent runtime, which also serves other clients as an app-server.
- Status: platform done
- Code: apps/cli/src/lib.rs:4609; apps/cli/Cargo.toml:78; apps/cli/src/app_server.rs:1

## S104.T11 PostgreSQL (Relational application storage)
- Should: Application data lives in PostgreSQL (Neon) reached through the data-layer adapter.
- Status: platform done
- Code: packages/platform/data-layer/src/adapters/neon.ts:65; apps/web/app/api/chat/conversations/route.ts:236; scripts/config/production-migrations-applied.json:2

## S104.T12 MCP server plus isolated UI bridge (Embedded conversational apps)
- Should: Connector tools that return an MCP App render it inline in an isolated sandbox iframe driven by the MCP Apps JSON-RPC bridge.
- Status: platform done
- Code: apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:2146; apps/web/features/chat/components/messages/cards/McpAppCard.tsx:139; apps/web/features/chat/components/messages/cards/McpAppCard.tsx:245; apps/web/app/api/mcp-apps/sandbox/route.ts:4

## S104.01 Code editor engine.
- Should: Users edit code in the product through a code editor engine.
- Status: platform done
- Code: apps/web/features/chat/components/artifacts/ArtifactCodeEditor.tsx:142; apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:2243

## S104.02 Syntax highlighter.
- Should: Code blocks in answers are syntax-highlighted by a highlighter engine in the mounted renderer.
- Status: platform done
- Code: packages/ui/unified-chat/src/components/markdown/shikiHighlighter.ts:1; packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx:13; apps/web/features/chat/components/messages/MessageBubble.tsx:111

## S104.03 Markdown parser and sanitizer.
- Should: Answers are parsed as Markdown and sanitized before rendering.
- Status: platform done
- Code: packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx:2; packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx:475; apps/web/features/chat/components/messages/MessageBubble.tsx:111

## S104.04 Charting engine.
- Should: Chart artifacts are drawn by a charting engine in the mounted artifact viewer.
- Status: platform done
- Code: packages/ui/unified-chat/src/components/artifact-components/ChartCanvas.tsx:1; packages/ui/unified-chat/src/components/artifact-components/ChartArtifact.tsx:193; apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1049

## S104.05 Spreadsheet grid engine.
- Should: Tabular data opens in an interactive spreadsheet grid that supports editing and formulas.
- Status: not applicable anywhere

## S104.06 Presentation editor/renderer.
- Should: Presentations are rendered as navigable slides in-product and generated as real .pptx files.
- Status: platform done
- Code: packages/ui/unified-chat/src/components/artifact-components/PresentationArtifact.tsx:40; apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1047; apps/web/lib/services/managed-office-file-service.ts:514

## S104.07 Image editor/canvas engine.
- Should: Users edit images in an in-product canvas editor (mask, crop, annotate) as well as by prompt.
- Status: platform done
- Code: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:5437; apps/web/features/chat/components/Composer/ImageMaskDialog.tsx:91; apps/web/features/chat/components/ImageGenerationCard.tsx:731

## S104.08 Video playback and editing engine.
- Should: Videos play in-product and can be edited (trim, cut, combine) by a video engine.
- Status: not applicable anywhere

## S104.09 Native desktop shell.
- Should: The desktop app runs as a native Electron shell with a privileged main process.
- Status: platform done
- Code: apps/desktop/electron/config.ts:39; apps/desktop/electron/main.ts:884; apps/desktop/electron/main.ts:1345

## S104.10 Native mobile implementation strategy.
- Should: The mobile app is a native Expo React Native app with native modules.
- Status: platform done
- Code: apps/mobile/app/_layout.tsx:196; apps/mobile/package.json:121

## S104.11 Local database.
- Should: A client keeps data in an encrypted local database on the device.
- Status: platform done
- Code: apps/mobile/storage/db.ts:89; apps/mobile/app.config.js:283; apps/mobile/storage/conversations.ts:21

## S104.12 Object storage.
- Should: Uploaded and generated files are stored in S3-compatible object storage.
- Status: platform done
- Code: packages/platform/object-storage/src/adapters/s3.ts:62; apps/web/app/api/files/uploads/resumable-upload.ts:50

## S104.13 Search engine.
- Should: Conversations and messages are searched through an indexed search engine behind a search API.
- Status: platform done
- Code: apps/web/db/neon/0101_sync_and_search_indexes.sql:84; apps/web/app/api/search/route.ts:308; apps/web/db/neon/0202_retrieval_index.sql:139

## S104.14 Vector index.
- Should: Knowledge chunks carry embeddings in a vector index queried by cosine distance.
- Status: platform done
- Code: apps/web/db/neon/0202_retrieval_index.sql:142; apps/web/lib/services/retrieval-search-service.ts:204

## S104.15 Queue/job system.
- Should: Background jobs are queued and drained by a scheduled worker.
- Status: platform done
- Code: apps/web/lib/jobs/job-handlers.ts:261; apps/web/app/api/cron/drain-background-jobs/route.ts:26; vercel.json:134; apps/web/lib/jobs/job-service.ts:503; apps/web/lib/jobs/job-service.ts:542; apps/web/lib/jobs/__tests__/job-service.test.ts:275; apps/web/lib/jobs/__tests__/job-service.test.ts:299; apps/web/lib/jobs/__tests__/job-service.test.ts:331

## S104.16 Durable workflow engine.
- Should: Long agent and indexing runs execute on a durable workflow engine.
- Status: platform done
- Code: apps/web/lib/workflows/cloud-agent-workflow.ts:34; apps/web/lib/workflows/start-cloud-agent-workflow.ts:127; apps/web/package.json:146

## S104.17 Realtime transport.
- Should: Live updates reach clients over a realtime transport (SSE streams and a WebSocket signaling server).
- Status: platform done
- Code: apps/web/app/api/llm/v1/chat/completions/lib/sse-heartbeat.ts:29; apps/web/app/api/pair/claim/route.ts:71

## S104.18 WebRTC/media infrastructure.
- Should: Live voice uses WebRTC media with a server-created realtime session.
- Status: platform done
- Code: apps/web/features/chat/lib/live-voice-session.ts:277; apps/mobile/src/features/voice/services/liveVoiceSession.ts:187; apps/web/app/api/voice/live/sessions/route.ts:331

## S104.19 Secrets/KMS provider.
- Should: Encryption keys are held in a key ring and can be wrapped by a cloud KMS (AWS, GCP, Azure).
- Status: platform done
- Code: apps/web/lib/crypto/platform-keys.ts:67; apps/web/lib/crypto/kms-providers.ts:114; apps/web/lib/server/organization-encryption-keys.ts:127

## S104.20 Authentication provider.
- Should: Sign-in on web and mobile goes through a hosted authentication provider (Clerk) behind an identity port.
- Status: platform done
- Code: apps/web/proxy.ts:25; apps/web/lib/identity/Provider.tsx:27; apps/mobile/app/_layout.tsx:710

## S104.21 Payment provider.
- Should: Payments run through a payment provider: checkout sessions and verified webhooks.
- Status: platform done
- Code: apps/web/app/api/checkout/route.ts:391; apps/web/app/api/stripe-webhook/lib/verify.ts:27

## S104.22 Observability platform.
- Should: Errors and traces are exported to an observability platform (Sentry, OpenTelemetry).
- Status: platform done
- Code: apps/web/instrumentation.ts:98; apps/web/package.json:92

## S104.23 Feature-flag system.
- Should: Features are gated by a server-side flag system with stored definitions and per-subject evaluation.
- Status: platform done
- Code: apps/web/lib/feature-flags/flag-store.ts:115; apps/web/app/api/me/route.ts:197

## S104.24 Sandbox provider.
- Should: Cloud code runs in a hosted sandbox provider.
- Status: platform partial
- Code: apps/web/lib/e2b/gate.ts:16; apps/web/lib/e2b/runtime.ts:889
- Unfinished: platform: E2B sandboxes are built but off unless AGI_E2B_EXECUTION=1 (.env.example ships 0); otherwise code runs on the provider-native interpreter. Turn it on in production.

## S104.25 Browser automation engine.
- Should: The agent drives a real browser through an automation engine (CDP).
- Status: platform done
- Code: apps/extension/src/features/computer-use/debuggerSession.ts:31; apps/extension/src/features/computer-use/cdpDriver.ts:329; apps/extension/src/background.ts:4148

## S104.26 Local inference engine.
- Should: A local inference engine runs models on the device.
- Status: platform done
- Code: packages/platform/local-llm/src/tier3.ts:30; apps/desktop/electron/runtime/dispatcher.ts:799; apps/mobile/app/(public)/onboarding.tsx:19

## S104.27 CI/build/signing pipeline.
- Should: CI builds and tests every change, and release pipelines sign and notarize installers.
- Status: platform done
- Code: .github/workflows/release-desktop-cloud.yml:217; .github/workflows/release-desktop-cloud.yml:272; .github/workflows/ci.yml:1

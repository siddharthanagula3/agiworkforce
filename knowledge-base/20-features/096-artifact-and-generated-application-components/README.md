---
id: "AREA-096"
type: "area"
title: "Artifact and generated-application components"
features: ["F096-01", "F096-02", "F096-03", "F096-04", "F096-05", "F096-06", "F096-07", "F096-08", "F096-09", "F096-10"]
basis: "code inspection"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# 96. Artifact and generated-application components

An artifact is a piece of output a chat produces: a code page, a document, a spreadsheet, a presentation, or a small app. This area keeps those pieces findable across the account, lets the user preview them safely, generates Office and PDF files on request, and lets the user publish an artifact as a link that others can open. It matters because without it, artifacts are lost when a device cache is cleared, and published pages would run with no isolation from the user's session.

**Who uses it.** Every signed-in user sees the artifact index and previews in chat (code shows no plan gate on the index route). Publishing, the published-app storage and connected-data runs need a signed-in user; the publisher alone can unpublish or restore versions. Viewers of a public link need no account. Workspace (organization) members can open apps shared to their organization (apps/web/db/neon/0184_organization_shared_artifacts.sql). Moderators use the takedown and content-report admin routes. Voice-session users trigger office file generation (apps/web/lib/voice/live-voice-tools.ts). Developers change this area through the server routes and services listed below.

## Features in this area

| ID | Feature | Web | Desktop | Mobile | CLI | VS Code | Chrome |
|---|---|---|---|---|---|---|---|
| [F096-01](F096-01-account-wide-artifact-index.md) | Account-wide artifact index | n/a | n/a | n/a | n/a | n/a | n/a |
| [F096-02](F096-02-artifact-version-store.md) | Artifact version store | n/a | n/a | n/a | n/a | n/a | n/a |
| [F096-03](F096-03-collaboration-comments-and-edit-suggestions.md) | Collaboration, comments and edit suggestions | n/a | n/a | n/a | n/a | n/a | n/a |
| [F096-04](F096-04-office-and-pdf-file-generation.md) | Office and PDF file generation | n/a | n/a | n/a | n/a | n/a | n/a |
| [F096-05](F096-05-export-to-markdown-pdf-and-word-in-the-browser.md) | Export to Markdown, PDF and Word in the browser | n/a | n/a | n/a | n/a | n/a | n/a |
| [F096-06](F096-06-live-preview-in-an-isolated-sandbox.md) | Live preview in an isolated sandbox | n/a | n/a | n/a | n/a | n/a | n/a |
| [F096-07](F096-07-app-data-storage.md) | App data storage | n/a | n/a | n/a | n/a | n/a | n/a |
| [F096-08](F096-08-connected-data-for-apps-services-and-viewer-sign-i.md) | Connected data for apps (services and viewer sign-in) | n/a | n/a | n/a | n/a | n/a | n/a |
| [F096-09](F096-09-publishing-to-a-hosted-link.md) | Publishing to a hosted link | n/a | n/a | n/a | n/a | n/a | n/a |
| [F096-10](F096-10-templates-and-design-system-assets.md) | Templates and design-system assets | n/a | n/a | n/a | n/a | n/a | n/a |

Requirement items for this area: [10-requirements/capabilities/096-artifact-and-generated-application-components.md](../../10-requirements/capabilities/096-artifact-and-generated-application-components.md).

## How this area works in the code

1. **Save an assistant message and index its artifacts.** When a chat sync saves an assistant message, the server schedules indexing for it. Indexing deletes the message's old index rows and inserts one row per artifact found, using the derived artifact id. Failure is only logged. (`apps/web/app/api/chat/sync/route.ts:750-790`, `apps/web/app/api/chat/conversations/[id]/messages/lib/index-artifacts.ts:60-100`, `apps/web/db/neon/0121_artifact_index.sql`)
2. **Show the gallery.** The gallery asks the index route. The route checks the rate limit, validates the limit and projectId query, runs a join to conversations that are not deleted, and returns metadata only. (`apps/web/app/api/artifacts/index/route.ts:1-110`)
3. **Preview an artifact in the sandbox frame.** The preview frame loads from the sandbox origin read from an environment value. Code refuses an origin that is the app's own origin. The frame sends a render message; the sandbox replies with ready, render-complete or render-error. A timeout switches to the fallback frame. (`apps/web/features/chat/components/SandboxedIframe.tsx:150-240`, `apps/web/lib/artifact-sandbox.ts:1-214`, `infrastructure/sandbox/index.html:40-75`)
4. **Generate an Office or PDF file from a voice request.** The voice tool list includes the office file tool. The tool runner checks the tool name, calls the generator, and persists the bytes with origin 'managed-office-tool'. The generator validates the request, builds a docx, pptx, xlsx or pdf file and checks the output. (`apps/web/lib/voice/live-voice-tools.ts:399`, `apps/web/lib/voice/live-voice-tool-runner.ts:115-155`, `apps/web/lib/services/managed-office-file-service.ts:930-960`, `apps/web/lib/services/managed-office-file-service.ts:556-661`)
5. **Export a document in the browser.** The user's export choice calls one of three functions. Markdown is a text download. PDF and Word are built from the markdown in the browser and downloaded through a temporary link. (`apps/web/features/chat/services/document-export-service.ts:1-94`)
6. **Publish an artifact.** The publish route checks CSRF and the rate limit, validates the body (kind, content up to the size cap), runs the publication policy, then stores the row with a new random token. The admission step takes a per-user lock so the quota check is safe. It writes an audit event and returns the share URL. (`apps/web/app/api/artifacts/publish/route.ts:1-173`, `apps/web/lib/services/published-artifact-service.ts:59`, `apps/web/lib/services/published-artifact-service.ts:261-300`, `apps/web/lib/services/published-artifact-service.ts:386-400`, `apps/web/db/neon/0095_published_artifacts.sql:1-141`)
7. **Open a published link.** The viewer page first looks for a public row by token. If none, it checks the viewer's signed-in access: organization sharing first, then invited viewers. If nothing matches, it shows an unavailable or invite-only page. Public row content is rendered by kind; HTML and React go through the sandbox frame. (`apps/web/app/shared-artifact/[token]/page.tsx:1-98`, `apps/web/db/neon/0184_organization_shared_artifacts.sql:60-100`)
8. **Save and read app data.** A published app calls the storage route with an operation (get, set, delete, list). The route checks the token, CSRF, account status and rate limit, then reads the runnable artifact and applies the scope and size rules. (`apps/web/app/api/artifacts/runtime/[token]/storage/route.ts:1-147`, `apps/web/db/neon/0325_published_artifact_storage.sql:1-136`)
9. **Unpublish or restore a version.** Unpublish deletes the publication for the caller by token and returns success. Restore is a separate versioned route that restores the server's stored snapshot. Moderators' takedown removes publications by token and logs the action. (`apps/web/app/api/artifacts/publish/[token]/route.ts:60-80`, `apps/web/app/api/artifacts/publish/[token]/versions/[version]/route.ts`, `apps/web/app/api/admin/takedown/route.ts:85-120`, `apps/web/app/api/admin/content-reports/route.ts:120-133`)

## Files to know

| File | Role |
|---|---|
| `apps/web/app/api/artifacts/index/route.ts` | Read-only gallery index: account-scoped, metadata only, joins conversations for project. |
| `apps/web/app/api/chat/conversations/[id]/messages/lib/index-artifacts.ts` | Writes index rows per message (delete then insert); fire-and-forget wrapper. |
| `apps/web/app/api/artifacts/publish/route.ts` | Publish and list published artifacts; CSRF, rate limit, quota error mapping, audit event. |
| `apps/web/lib/services/published-artifact-service.ts` | Publication rules: token minting, per-user cap, admission lock, summaries, visibility. |
| `apps/web/lib/artifact-sandbox.ts` | Sandbox origin rules, message types, picker and runtime request parsing for the preview frame. |
| `infrastructure/sandbox/index.html` | Static sandbox page with the strict content security policy and element picker. |
| `apps/web/features/chat/components/SandboxedIframe.tsx` | Preview frame component: handshake, timeouts, fallback, picker. |
| `apps/web/lib/services/managed-office-file-service.ts` | Office and PDF generator: request schemas and per-format builders. |
| `apps/web/lib/voice/live-voice-tool-runner.ts` | Runs the office file tool for voice sessions and persists the result. |
| `apps/web/app/shared-artifact/[token]/page.tsx` | Public viewer page for a published link, with organization and invite fallbacks. |
| `apps/web/app/api/artifacts/runtime/[token]/storage/route.ts` | App data storage API: personal and shared scopes, size and connector rules. |
| `apps/web/db/neon/0325_published_artifact_storage.sql` | Storage table, row-level security for viewers, and runnable-app functions. |

## What is stored

- Index rows: id, user, conversation, message, ordinal, title, type, language, time (no content): Postgres table web_artifact_index (apps/web/db/neon/0121_artifact_index.sql)
- Managed artifacts (current content, title, type, pin flag, tags, soft delete) and append-only version rows: Postgres tables web_artifacts and web_artifact_versions (apps/web/db/neon/0039_artifact_cloud_sync.sql)
- Published pages: token, owner, artifact id, title, kind, language, content (up to 1,000,000 characters), timestamps: Postgres table published_artifacts (apps/web/db/neon/0095_published_artifacts.sql)
- Visibility (public or organization) and organization share rows: published_artifacts.visibility and table organization_shared_artifacts (apps/web/db/neon/0184_organization_shared_artifacts.sql)
- App key-value data, personal or shared, per published app: Postgres table published_artifact_storage (apps/web/db/neon/0325_published_artifact_storage.sql)
- Audit events for publish and takedown actions: Written through recordAuditEvent in apps/web/app/api/artifacts/publish/route.ts and apps/web/app/api/admin/takedown/route.ts
- Generated office files: Stored by persistGeneratedFileBytes (called from apps/web/lib/voice/live-voice-tool-runner.ts); the storage location was not traced
- Local artifact cache on each device: Browser storage key agi-artifacts-store, named only in a comment in apps/web/db/neon/0121_artifact_index.sql; not traced in code

## Switches

Plan gates, flags and settings that turn parts of this area on or off.

- **NEXT_PUBLIC_SANDBOX_ORIGIN**: Sets the preview sandbox origin. Empty, invalid, non-https (except localhost), or equal to the app origin means no sandbox frame. (apps/web/lib/artifact-sandbox.ts (getSandboxOrigin); apps/web/proxy.ts:42; apps/web/.env.example:676)
- **artifactAiEnabled**: Turns AI on or off for artifact apps; passed to the public viewer and checked in the runtime completion route. (apps/web/lib/server/artifact-ai-switch (imported by apps/web/app/shared-artifact/[token]/page.tsx and apps/web/app/api/artifacts/runtime/artifact-completion.ts))
- **connectorsReleased**: Gates connected-data runs; when off, the coming-soon message is returned. (apps/web/app/api/artifacts/runtime/artifact-completion.ts (imports from @agiworkforce/types))
- **MAX_PUBLISHED_PER_USER**: Maximum number of live publications per user; going over returns a conflict error. (apps/web/lib/services/published-artifact-service.ts:59)
- **Rate limit keys share-create, share-view and artifact-storage, and chat-conversation**: Throttle publish, list, storage and index calls per user. (apps/web/app/api/artifacts/publish/route.ts; apps/web/app/api/artifacts/runtime/[token]/storage/route.ts; apps/web/app/api/artifacts/index/route.ts)
- **ARTIFACT_STORAGE_VALUE_LIMIT_BYTES and ARTIFACT_STORAGE_SCOPE_LIMIT_BYTES**: Size of one saved value and total per app per scope (the migration comment says 20 MB total). (@agiworkforce/cloud-contracts, imported in apps/web/app/api/artifacts/runtime/[token]/storage/route.ts)
- **Managed compute access, entitlement and content-safety checks**: Decide whether an app's AI call may run, based on plan and policy. (apps/web/app/api/artifacts/runtime/live/[artifactId]/complete/route.ts; apps/web/app/api/artifacts/runtime/artifact-completion.ts (imports evaluateManagedComputeAccess and resolveEntitlementBundle))
- **MAX_GENERATED_FILE_BYTES**: Size limit on generated office and PDF files. (apps/web/lib/services/managed-office-file-service.ts (imported from @/lib/server/generated-file-persist))
- **Visibility check public or organization**: Whether a publication is public or limited to its organization. (apps/web/db/neon/0184_organization_shared_artifacts.sql)

## Shared between apps

Shared across apps: the contract package @agiworkforce/cloud-contracts (storage and publish types and limits), @agiworkforce/types (connector gate, privacy labels, routing slots), @agiworkforce/artifacts (origin privacy mode), and @agiworkforce/unified-chat/markdown-document (document blocks used by the browser exports). The platform publisher seam is described in packages/platform/artifacts (per the publish migration comment). Web-only: all routes under apps/web/app/api/artifacts, the services in apps/web/lib/services, the preview component, the static sandbox page in infrastructure/sandbox, and the shared-artifact page. Desktop, mobile, CLI, VS Code and Chrome code was not read for this area, so the shared/separate split for them is unknown.

## Looks wrong in the code

From reading only; not confirmed in the running app. Each line is also in the gap register.

- Brief cites apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:1868 for the office generators. That range is web search citation code. Office generation is wired through the voice tool list and runner. (apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:1855-1885 vs apps/web/lib/voice/live-voice-tools.ts:399 and apps/web/lib/voice/live-voice-tool-runner.ts:115-155)
- Brief cites apps/web/app/api/artifacts/publish/route.ts lines 182, 206 and 318. That file has 173 lines. Unpublish is in publish/[token]/route.ts and restore in versions/[version]/route.ts. (apps/web/app/api/artifacts/publish/route.ts (173 lines); apps/web/app/api/artifacts/publish/[token]/route.ts:60-80)
- Brief cites published-artifact-service.ts:386 as the unpublish/rollback controller. Line 386 is the admission lock for the per-user quota. (apps/web/lib/services/published-artifact-service.ts:386-400)
- Brief cites ArtifactPreview.tsx:745 for export. That code is the in-browser Word preview (mammoth), not an export. Exports are in document-export-service.ts. (apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:735-760; apps/web/features/chat/services/document-export-service.ts:1-94)
- Brief says S96.05 comments are missing, but a comments route and service exist for artifacts. (apps/web/app/api/artifacts/[artifactId]/comments/route.ts:1-60)
- Brief says connected data (S96.18) and viewer sign-in for it (S96.19) are missing, but a live completion route that takes connector IDs and a connector plan builder exist. (apps/web/app/api/artifacts/runtime/live/[artifactId]/complete/route.ts:1-40; apps/web/app/api/artifacts/runtime/artifact-completion.ts:1-40)
- Brief lists CSV and HTML export (S96.11). The browser export file has only Markdown, PDF and Word. (apps/web/features/chat/services/document-export-service.ts:1-94)
- Storage limit mismatch: migration comment says 20 MB per app per scope; the row check allows 5 MB per value; the total limit is a contract constant that was not read. (apps/web/db/neon/0325_published_artifact_storage.sql (check and comment lines))
- Brief lists S96.24 (per-app metering) missing, but the publish and storage routes record audit events only; no usage counter was found in the code read. (apps/web/app/api/artifacts/publish/route.ts:88-101 (audit event))

## Not established

- Per-app status for desktop, mobile, CLI, VS Code and Chrome. The brief gives one platform status only.
- Whether the preview sandbox origin is set in production (S96.16 is unverified in the brief).
- Where generated office files are stored and how long they last (persistGeneratedFileBytes was not traced).
- Plan limits and quotas for office file generation, and which plans may publish.
- Whether moderators act on content reports beyond the review route (the review route was only partly read).
- Whether a template registry or design-asset registry exists under another name (search found none).
- The exact value of the total app storage limit (contract constant not read).
- Whether the local device cache key agi-artifacts-store is used in the web app (named only in a migration comment).
- Collaboration and comment status in the other apps.
- No tests were run and no builds were run, as the task required read-only work; nothing was tested on localhost in this pass.

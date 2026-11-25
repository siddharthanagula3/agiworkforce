# Area 96. Artifact and generated-application components

28 items. Status words: done, partial, missing, unverified, n/a (does not apply to that app).

## S96.01 Artifact registry.
- Should: A server-side registry records every artifact (id, type, title, source conversation/message) for the account.
- Status: platform done
- Code: apps/web/db/neon/0121_artifact_index.sql:37; apps/web/app/api/chat/conversations/[id]/messages/lib/index-artifacts.ts:75; apps/web/app/api/artifacts/index/route.ts:78

## S96.02 Artifact-version store.
- Should: A server store keeps each artifact's successive versions so any version can be read back or restored.
- Status: platform done
- Code: apps/web/app/api/chat/sync/route.ts:302; apps/web/app/api/chat/sync/route.ts:764; apps/web/db/neon/0039_artifact_cloud_sync.sql:59; apps/web/app/api/user/export/route.ts:2292

## S96.03 Structured-document storage.
- Should: Documents are stored server-side as structured content (not only as text inside chat messages).
- Status: not applicable anywhere

## S96.04 Collaborative editing backend.
- Should: A backend lets several people edit one document at once (OT/CRDT sync and presence).
- Status: platform missing

## S96.05 Comment and suggestion service.
- Should: A service stores comments and edit suggestions on artifacts/documents.
- Status: platform missing

## S96.06 Selection-to-edit translation.
- Should: A service turns a selected range plus an instruction into a targeted edit of the artifact.
- Status: platform missing

## S96.07 Document-generation worker.
- Should: A server component generates Word documents on request.
- Status: platform done
- Code: apps/web/lib/services/managed-office-file-service.ts:408; apps/web/lib/services/managed-office-file-service.ts:150; apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:1868

## S96.08 Spreadsheet-generation worker.
- Should: A server component generates spreadsheets on request.
- Status: platform done
- Code: apps/web/lib/services/managed-office-file-service.ts:620; apps/web/lib/services/managed-office-file-service.ts:150; apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:1868

## S96.09 Presentation-generation worker.
- Should: A server component generates presentations on request.
- Status: platform done
- Code: apps/web/lib/services/managed-office-file-service.ts:23; apps/web/lib/services/managed-office-file-service.ts:150; apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:1868

## S96.10 PDF-generation worker.
- Should: A server component generates PDFs on request.
- Status: platform done
- Code: apps/web/lib/services/managed-office-file-service.ts:644; apps/web/lib/services/managed-office-file-service.ts:150; apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:1868

## S96.11 Export-format adapters.
- Should: Adapters convert artifact/document content into export formats (Markdown, PDF, DOCX, HTML, CSV).
- Status: platform done
- Code: apps/web/features/chat/services/document-export-service.ts:467; apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:745

## S96.12 Artifact preview renderer.
- Should: A renderer turns artifact source into a live preview for each supported kind.
- Status: platform done
- Code: infrastructure/sandbox/index.html:455; apps/web/features/chat/components/SandboxedIframe.tsx:160

## S96.13 Generated-code build service.
- Should: A build service compiles generated code (bundling, transpiling) before preview.
- Status: not applicable anywhere

## S96.14 Dependency resolver.
- Should: A resolver installs or maps the packages generated code imports.
- Status: platform missing

## S96.15 Preview sandbox.
- Should: Previews run in an isolated sandbox that cannot reach the user's session or data.
- Status: platform done
- Code: infrastructure/sandbox/index.html:56; apps/web/features/chat/components/SandboxedIframe.tsx:217; apps/web/lib/artifact-sandbox.ts:24

## S96.16 Preview-origin management.
- Should: Preview frames are served from a dedicated, managed origin separate from the app.
- Status: platform unverified

## S96.17 Artifact data store.
- Should: Generated apps can persist data in a backend store provided by the platform.
- Status: platform done
- Code: apps/web/db/neon/0325_published_artifact_storage.sql:3; apps/web/db/neon/0325_published_artifact_storage.sql:56; apps/web/lib/services/artifact-runtime-service.ts:26; apps/web/app/api/artifacts/runtime/[token]/storage/route.ts:94

## S96.18 Connected-data proxy.
- Should: A proxy lets artifacts read connected-service data without exposing credentials.
- Status: platform missing

## S96.19 Viewer-authentication bridge.
- Should: A bridge lets a viewer of a shared app sign in to that app's connected services.
- Status: platform missing

## S96.20 Generated-site deployment service.
- Should: A service deploys generated sites/apps to a hosted URL.
- Status: platform done
- Code: apps/web/lib/services/published-artifact-service.ts:261; apps/web/app/api/artifacts/publish/route.ts:182; apps/web/db/neon/0095_published_artifacts.sql:47

## S96.21 Deployment history.
- Should: Each publication keeps a deployment history the owner can inspect.
- Status: not applicable anywhere

## S96.22 Custom-domain management.
- Should: Owners can attach and manage custom domains for published apps.
- Status: platform missing

## S96.23 Published-app authorization.
- Should: Access to a published app is authorized per its audience (public vs workspace).
- Status: platform done
- Code: apps/web/app/shared-artifact/[token]/page.tsx:30; apps/web/db/neon/0184_organization_shared_artifacts.sql:76

## S96.24 App-level metering.
- Should: Usage by each published app (views, compute, AI calls) is metered.
- Status: platform missing

## S96.25 Publication moderation.
- Should: Published content is screened and can be reported and taken down by moderators.
- Status: platform done
- Code: apps/web/app/api/artifacts/publish/route.ts:206; apps/web/app/api/admin/takedown/route.ts:90; apps/web/app/api/admin/content-reports/route.ts:132

## S96.26 Unpublish/rollback controller.
- Should: A controller unpublishes a publication and restores earlier versions.
- Status: platform done
- Code: apps/web/lib/services/published-artifact-service.ts:368; apps/web/lib/services/published-artifact-service.ts:386; apps/web/app/api/artifacts/publish/route.ts:318

## S96.27 Template registry.
- Should: A registry serves artifact/app templates users can start from.
- Status: platform missing

## S96.28 Design-system asset registry.
- Should: A registry stores design-system assets (brand colours, fonts, logos) artifacts can use.
- Status: platform missing

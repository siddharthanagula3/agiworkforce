---
id: "AREA-033"
type: "area"
title: "Generated Sites and published applications"
features: ["F033-01", "F033-02", "F033-03", "F033-04", "F033-05", "F033-06", "F033-07", "F033-08", "F033-09", "F033-10"]
basis: "code inspection"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# 33. Generated Sites and published applications

A person builds a page or small app in the assistant (HTML, React, SVG, diagram, Markdown, text or code), then publishes it to a link that other people can open. The owner can change who may open it, roll it back to an earlier version, unpublish it, copy it, or download its source. This is how a finished result becomes something others can use or see.

**Who uses it.** Any signed-in user who has an artifact in chat can publish it on the web, desktop (through the web feature), mobile and the CLI. Viewers are anyone with a public link, or signed-in people when the audience is invited people or the workspace. Workspace admins are not special here: the code checks the publisher's workspace only for the workspace audience. AI calls from inside a published app depend on the person's plan and on a server switch. Developers use the CLI and the shared contract package.

## Features in this area

| ID | Feature | Web | Desktop | Mobile | CLI | VS Code | Chrome |
|---|---|---|---|---|---|---|---|
| [F033-01](F033-01-publish-an-artifact-from-chat.md) | Publish an artifact from chat | built | built | built | n/a | no | no |
| [F033-02](F033-02-share-link-and-public-page.md) | Share link and public page | built | built | built | built | no | no |
| [F033-03](F033-03-who-can-open-a-published-app.md) | Who can open a published app | partly | partly | partly | partly | no | no |
| [F033-04](F033-04-your-published-apps-list.md) | Your published apps list | built | built | built | built | no | no |
| [F033-05](F033-05-unpublish-and-delete.md) | Unpublish and delete | built | built | built | built | no | no |
| [F033-06](F033-06-version-history-and-rollback.md) | Version history and rollback | built | built | built | no | no | no |
| [F033-07](F033-07-copy-duplicate-and-download-source.md) | Copy, duplicate and download source | built | built | partly | partly | partly | partly |
| [F033-08](F033-08-ai-calls-from-inside-an-app.md) | AI calls from inside an app | built | no | no | no | no | no |
| [F033-09](F033-09-report-and-moderation.md) | Report and moderation | built | built | n/a | n/a | n/a | n/a |
| [F033-10](F033-10-not-yet-built.md) | Not yet built | no | no | no | no | no | no |

Requirement items for this area: [10-requirements/capabilities/033-generated-sites-and-published-applications.md](../../10-requirements/capabilities/033-generated-sites-and-published-applications.md).

## How this area works in the code

1. **Publish request from the app.** The person taps Publish. The web menu item calls handlePublish, which sends the artifact to the publish client. The client posts JSON to the publish route with artifact id, kind, title and content. (`apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1221-1245`, `apps/web/features/chat/components/artifacts/publishArtifactClient.ts:74-92`)
2. **Route checks and validates.** The route checks the CSRF token, applies the share-create rate limit, parses the JSON and checks the schema. Failure returns a validation error. (`apps/web/app/api/artifacts/publish/route.ts:33-59`)
3. **Policy check.** The publication policy checks the title with the content moderation rules and runs the outbound sharing gate. A refused sharing gate returns a response to the caller. (`apps/web/lib/services/published-artifact-publication-policy.ts:12-18`, `apps/web/lib/services/published-artifact-publication-policy.ts:55-72`)
4. **Write in one transaction.** The service checks the conversation belongs to the person, takes a per-user lock, counts published apps against the 200 limit, and inserts or updates the row. A linked live artifact makes the audience invited. A new version is added only when the content changed. (`apps/web/lib/services/published-artifact-service.ts:341-362`, `apps/web/lib/services/published-artifact-service.ts:364-419`, `apps/web/lib/services/published-artifact-service.ts:421-498`, `apps/web/lib/services/published-artifact-service.ts:871-943`)
5. **Visitor opens the link.** The shared page first looks for a public row. If none, it checks the signed-in organization grant and the invited list. If none fits, the page shows invite-only or unavailable. Scripted kinds render in a sandbox. (`apps/web/app/shared-artifact/[token]/page.tsx:32`, `apps/web/app/shared-artifact/[token]/page.tsx:51-55`, `apps/web/lib/services/published-artifact-service.ts:824-841`, `apps/web/lib/services/published-artifact-service.ts:92-105`)
6. **App calls the assistant.** The app's prompt goes to the runtime. The server first checks the AI switch and estimates cost, then refuses connector tools on public pages and Google user-data tools on the wrong model, then reserves usage through the managed usage request. (`apps/web/lib/services/artifact-runtime-service.ts:629-670`, `apps/web/lib/services/artifact-runtime-service.ts:687`, `apps/web/lib/services/managed-usage-request-service.ts:804`)
7. **Owner lists and unpublishes.** The settings section loads the published sites page by page. Unpublish opens a confirm dialog; on confirm the client calls the publish token route, which deletes the row for that owner. Cascades remove storage, viewers and versions. (`apps/web/features/settings/sections/PublishedArtifactsSection.tsx:105-166`, `apps/web/features/settings/sections/PublishedArtifactsSection.tsx:82-103`, `apps/web/app/api/artifacts/publish/[token]/route.ts (handleUnpublish)`, `apps/web/lib/services/published-artifact-service.ts:563-579`, `apps/web/db/neon/0325_published_artifact_storage.sql:5`)
8. **Rollback.** Restore reads the chosen version for the owner and writes it into the live row, then records it as a new version and moves the live pointer. (`apps/web/app/api/artifacts/publish/[token]/versions/[version]/route.ts:133`, `apps/web/lib/services/published-artifact-service.ts:500-561`, `apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1008-1036`)

## Files to know

| File | Role |
|---|---|
| `apps/web/app/api/artifacts/publish/route.ts` | Publish (POST) and list (GET) of an owner's published apps. |
| `apps/web/app/api/artifacts/publish/[token]/route.ts` | Detail, unpublish and rename of one published app by its token. |
| `apps/web/lib/services/published-artifact-service.ts` | Storage rules: row writes, 200 limit, versions, public read, invited check, unpublish. |
| `apps/web/lib/services/published-artifact-publication-policy.ts` | Moderation of the title and the external sharing gate run before a publish is saved. |
| `apps/web/app/shared-artifact/[token]/page.tsx` | Public page entry: finds the artifact for a visitor, or shows invite-only or unavailable. |
| `apps/web/features/chat/components/artifacts/ArtifactPreview.tsx` | Web artifact menu: Publish, audience change, restore, download, fork. |
| `apps/web/features/settings/sections/PublishedArtifactsSection.tsx` | Settings list of published apps with copy, history and unpublish. |
| `apps/web/lib/services/artifact-runtime-service.ts` | AI calls from inside an app: switch, cost estimate, connector and training rules, app storage. |
| `apps/mobile/src/features/chat/services/artifactPublishing.ts` | Mobile client calls for publish, audience, viewers, lookup and unpublish. |
| `apps/cli/src/cloud/artifacts.rs` | CLI client for list, content, publish, audience and unpublish, and the audience mapping. |
| `packages/contracts/cloud-contracts/src/artifact-index.ts` | Shared contract: audiences and the 200-item page limit. |
| `apps/web/db/neon/0391_artifact_runtime_usage_cap.sql` | Draft migration for per-app AI call caps; marked not applied in its header. |

## What is stored

- Published app row: token, owner, artifact id, conversation id, title, kind, language, content, visibility, version, timestamps: Database table public.published_artifacts (migration 0095, named in published-artifact-service.ts:27; visibility from 0184, service.ts:38-42)
- Version history: each changed publish, with title, kind, language and content: Database table public.published_artifact_versions (apps/web/db/neon/0257_file_versions_and_lineage.sql around lines 50-56)
- Per-app key-value storage for visitor data, with a size limit per owner or shared scope: Database table public.published_artifact_storage (apps/web/db/neon/0325_published_artifact_storage.sql)
- Invited viewers list for a published app: Database table in apps/web/db/neon/0372_published_site_viewers.sql
- Workspace grants for workspace-only apps: Table organization_shared_artifacts, named in published-artifact-service.ts:40-42; migration not read
- Live artifact link used to mark invited audience: Table public.live_artifacts (published-artifact-service.ts:437-441; migration 0380 not read)
- Usage per app (planned artifact_subject column on managed usage rows): Draft migration apps/web/db/neon/0391_artifact_runtime_usage_cap.sql; not applied per its header
- Mobile publication state and audience cache: Zustand stores in apps/mobile/src/features/chat/services/artifactPublishing.ts; persistence not checked

## Switches

Plan gates, flags and settings that turn parts of this area on or off.

- **AGI_ARTIFACT_AI_ENABLED**: Turns AI calls from inside apps on or off. When off, calls are refused with a 403. (apps/web/lib/server/artifact-ai-switch.ts:6)
- **Plan tier and allowance for app AI calls**: The plan tier and its ceilings decide how much an app can spend; the per-app ceiling comes from a draft migration. (apps/web/lib/services/artifact-runtime-service.ts:636 (planTier input); apps/web/lib/services/managed-usage-request-service.ts:790-806; apps/web/db/neon/0391_artifact_runtime_usage_cap.sql)
- **MAX_CONTENT_CHARS**: Largest publishable content, 1,000,000 characters. (apps/web/lib/services/published-artifact-service.ts:50)
- **MAX_PUBLISHED_PER_USER / list page size**: 200 published apps per person; list pages of 200. (apps/web/lib/services/published-artifact-service.ts:59; packages/contracts/cloud-contracts/src/artifact-index.ts:132)
- **ARTIFACT_STORAGE_SCOPE_LIMIT_BYTES**: 20 MB limit on each app storage scope. (packages/contracts/cloud-contracts/src/artifact-runtime.ts:11)
- **Rate limits share-create and share-view**: Limit publish, update and list calls. (apps/web/app/api/artifacts/publish/route.ts:46, 130; apps/web/app/api/artifacts/publish/[token]/route.ts (handleUpdate))
- **Connectors on public pages**: Apps using connected apps cannot be public; the message asks for workspace or invited sharing. (apps/web/lib/services/published-artifact-service.ts:109-110; artifact-runtime-service.ts:655-662)
- **Google user-data tools**: Only run on a model that keeps inputs out of training. (apps/web/lib/services/artifact-runtime-service.ts:665-670)
- **Sharing gate and secret-handling policy**: Can refuse a publish or a title. (apps/web/lib/services/published-artifact-publication-policy.ts:67-72; apps/web/app/api/artifacts/publish/[token]/route.ts (inspectedTitle, resolveSecretHandlingPolicy))

## Shared between apps

Web server logic is in apps/web/lib/services and apps/web/app/api/artifacts/publish; the public page is web-only. Shared contract types and limits are in packages/contracts/cloud-contracts, used by web and mobile. The CLI (Rust) keeps its own copy of the publishable kinds and audience mapping (apps/cli/src/cloud/artifacts.rs:42-43, 552-566). Desktop hosted publishing uses the web adapter; its own adapter writes local files (apps/desktop/src/features/artifacts/publishAdapter.ts). Mobile has its own client and UI (apps/mobile/src/features/chat/...). VS Code and Chrome have no publish code found.

## Looks wrong in the code

From reading only; not confirmed in the running app. Each line is also in the gap register.

- Brief marks named-viewer access missing on web, mobile and CLI, but the code has an invited-viewers API (GET, POST, DELETE), a viewers editor and a mobile viewers component. (apps/web/app/api/artifacts/publish/[token]/viewers/route.ts:112-114; apps/web/features/sites/components/SiteViewersEditor.tsx; apps/mobile/src/features/chat/components/PublishedArtifactViewers.tsx; apps/mobile/src/features/chat/services/artifactPublishing.ts:307-347)
- Brief cites the VS Code download-source command at commandSetup.ts:2297, but that line shows plan usage text, not a download. (apps/extension-vscode/src/core/commandSetup.ts:2294-2300)
- Brief cites apps/web/app/api/chat/conversations/[id]/route.ts:474 for deleting a published app's data. The line there is a conversation version check. The real unpublish-on-delete calls are in the bulk and sync routes. (apps/web/app/api/chat/conversations/[id]/route.ts:470-478; apps/web/app/api/chat/conversations/bulk/route.ts:94; apps/web/app/api/chat/sync/route.ts:696)
- Brief cites PublishedArtifactView.tsx:124 for the model-call allowance. That line is a hook dependency list with no allowance text. Brief cites artifact-runtime-service.ts:204 and 228, which are app storage code. (apps/web/app/shared-artifact/[token]/PublishedArtifactView.tsx:118-130; apps/web/lib/services/artifact-runtime-service.ts:188-260)
- The per-app AI call cap is in a migration whose header says NOT YET APPLIED, but the code already calls the function it defines. If the migration is not applied, that call path fails for any app run with an app subject. (apps/web/db/neon/0391_artifact_runtime_usage_cap.sql:4; apps/web/lib/services/managed-usage-request-service.ts:804)
- Brief says description is part of S33.02, but no description field exists in the stored row or the publish request. Only a title exists and the rename is marked on web only in the brief. (apps/web/lib/services/published-artifact-service.ts:154-167; apps/web/app/api/artifacts/publish/route.ts:33-40)
- Brief marks production stage (S33.08) and promotion (S33.22) missing, but the brief's status lines for web, desktop, mobile and CLI are not listed for these items, so it is unclear whether they are done. No production stage exists in the publish code: one live row per artifact id, and versions are history only. (apps/web/lib/services/published-artifact-service.ts:154-167 (one row per user and artifact id, see the insert conflict target at 442); apps/web/lib/services/published-artifact-service.ts:871-943)
- Brief says mobile has no unpublish (S33.24) but the mobile client has an unpublish function. I did not find a mobile control that calls it. (apps/mobile/src/features/chat/services/artifactPublishing.ts:292)
- Brief says the app database (S33.18) is missing, but an app key-value store exists with read and clear routes. It is not a database setup flow. (apps/web/app/api/artifacts/publish/[token]/data/route.ts:62-63; apps/web/lib/services/artifact-runtime-service.ts:192-260)
- The service comment says views are not counted, and there is no time limit on published pages. This matches analytics being missing, but it is a deliberate gap noted by the authors, not a fix. (apps/web/lib/services/published-artifact-service.ts:44-48)
- Brief item line numbers are stale in several places (for example the publish route cited at lines 65, 220 and 372 has no moderation at those lines). (apps/web/app/api/artifacts/publish/route.ts:60-70)

## Not established

- Whether migration 0391 has been applied in any database. The file header says not applied, and I could not check the database (read-only).
- Whether the desktop app renders the same ArtifactPreview component (not confirmed).
- The fork handler body in ArtifactPreview.tsx (only the menu wiring and store hook were seen at lines 40 and 582).
- Plan-based ceilings for app AI calls: the policy file apps/web/lib/server/managed-usage-policy.ts was referenced by the migration but not opened.
- Whether the shared page shows the abuse report link (ReportContentLink exists; placement not checked).
- Usage and hosting limits shown to the owner (S33.19): no owner-facing usage display was found in the files opened.
- The web and mobile status for items the brief lists only for some apps (for example S33.02, S33.08, S33.09): the brief does not say whether the omitted apps are done or n/a.
- Whether the mobile list and history screens persist their state on the device.
- The version-history view in the web UI (only the API and restore call were read).
- Chrome extension: no publish code was found by search, but it was not read in full.
- Line numbers marked as unverified in this output: unpublish handler, rename handler and the viewers helper bodies were located by name, not by line.
- Nothing was built, run, or tested; the localhost and one-surface-at-a-time rule in the user request applies to testing, and this task was read-only, so no test was run.

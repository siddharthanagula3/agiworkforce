---
id: "F033-01"
type: "feature"
title: "Publish an artifact from chat"
aliases: ["Publish artifact", "Publish to a public link", "Publish artifact to a public link", "Republish artifact link", "agi artifacts publish", "Cloud publisher", "CAP-015 publish", "Prompt-based creation then host (S33.04)"]
area: "33 Generated Sites and published applications"
available_on: ["web", "desktop", "mobile"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "n/a", vscode: "missing", chrome: "missing"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "n/a", vscode: "n/a", chrome: "not seen by a person"}
requirement_items: ["S33.04"]
depends_on: ["surface:web", "surface:mobile", "surface:cli", "surface:desktop", "mode:cloud", "table:published_artifacts", "table:published_artifact_versions", "api:POST /api/artifacts/publish", "SYS-files-artifacts-and-storage", "SYS-authentication-and-identity", "SYS-security-and-privacy", "SYS-execution-boundaries", "F033-02", "F033-06"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F033-01 Publish an artifact from chat

Turns a finished chat artifact (page, app, diagram, document or code) into a hosted page with a link. Works from web (and the Electron desktop, which shows the web app), mobile and the CLI. Only Cloud-mode artifacts can be published. Publishing again updates the same link. There is no publish on VS Code or Chrome.

Area: [33. Generated Sites and published applications](README.md). Requirement items: [S33.04](../../10-requirements/capabilities/033-generated-sites-and-published-applications.md#s3304).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | built | built | not seen by a person |
| CLI | does not apply | does not apply | n/a |
| VS Code | not built | not built | n/a |
| Chrome | not built **(disagrees with the ledger on whether it exists)** | partly built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Copies the content of a chat artifact to AGI Cloud storage as a published page and returns a share link. The page is stored in the published_artifacts table and each changed publish adds a version (apps/web/lib/services/published-artifact-service.ts:421-498; :871-955).

**Why it exists.** A chat can build a small site or app, but the result lives only in the conversation. Publishing gives it a link that can be opened without the chat. The platform package says the publish seam existed with no backing before this adapter (published-artifact-service.ts:15-21).

**Who uses it.** A signed-in person who made an artifact in an AGI Cloud chat and wants to share it. Mostly web and mobile users; CLI users for scripted use.

**Problems it solves**

- No way to share a generated page outside the chat.
- Sharing by copy and paste loses the running page.
- Republishing after a fix should not change the link people already hold.

**Use cases**

- Ask the assistant for a landing page, press Publish, send the link.
- Fix a bug in a published HTML tool and publish again; the same link now shows the fix.
- Publish a diagram or markdown document for a colleague.
- Run agi artifacts publish <id> from a script to get a link.

## 2. User experience

**Where to find it**

- Web: the artifact panel header button labelled Publish (aria-label 'Publish artifact to a public link'), and an item named Publish in the artifact's overflow menu on narrow screens (apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:2305-2311; :2917-2929).
- Desktop (Electron): the public desktop shows the hosted web app, so the web control is what appears (AGENTS.md section 5; doc: docs/product/surface-feature-matrix.md). Tauri desktop code writes local files only (apps/desktop/src/features/artifacts/publishAdapter.ts:1-17).
- Mobile: a globe icon in the full-screen artifact header, labelled 'Publish artifact to a public link', or 'Republish artifact link' once published (apps/mobile/src/features/chat/components/ArtifactFullScreen.tsx:1319-1334).
- CLI: agi artifacts publish <id> [--audience public|workspace] [--json] (apps/cli/src/lib.rs:1399-1408).
- VS Code and Chrome: none found; founder decision says VS Code does not publish (doc: docs/decisions/2026-09-27-founder-decisions.md lines 116-118).

**Before you start**

- Signed in to AGI Cloud on the app used.
- Web: the artifact was created in Cloud (managed) mode; otherwise Publish returns unavailable with a message to download instead (packages/platform/artifacts/src/artifacts.ts:256-275).
- Mobile: app mode must be Cloud; signed-out users get 'Sign in to AGI Cloud to publish', Local mode gets 'Switch to AGI Cloud to publish' (ArtifactFullScreen.tsx:731-745).
- CLI: managed account mode and a stored sign-in token (apps/cli/src/cloud/client.rs:361-379).
- Artifact kind is one of html, react, svg, mermaid, markdown, text, code and has content (published-artifact-service.ts:61-69).

**Screens and controls**

- Web: Publish button/menu item; after success a link bar with the URL, a Copy link button, a 'Who can open this' selector (ArtifactPreview.tsx:3007-3062).
- Mobile: confirm alert 'Publish to a public link?' with Cancel/Publish (ArtifactFullScreen.tsx:285-296); alerts 'Artifact published', 'Publish not confirmed', 'Publish failed'.
- CLI: prints "Published '<title>' at <url> (opens for <audience>)." (apps/cli/src/lib.rs:4005-4016).

**Journey**

1. Build an artifact in a Cloud chat.
2. Open it in the artifact panel (web) or full screen (mobile), or note its id (CLI).
3. Choose Publish (mobile asks to confirm that anyone with the link can open it).
4. The app sends the content to the server and waits.
5. The server checks policy, stores the page and returns the link.
6. The app shows or copies the link; the first publish is public unless the artifact uses connected apps.

**What the person sees and gets**

- Web toast 'Published · link copied to clipboard' or 'Published. Copy the link from the bar below.' (ArtifactPreview.tsx:1243-1245); error toast with the server message or 'Failed to publish artifact' (:1265).
- Mobile copies the link and shows an alert if the copy cannot be confirmed (ArtifactFullScreen.tsx:773-780).
- CLI prints the link, or JSON with --json.
- The returned receipt carries token, shareUrl, version, kind, title, sandboxed flag, visibility and workspace member count (apps/web/app/api/artifacts/publish/route.ts:100-118).

**Settings**

- None found that change publishing. The audience can be changed afterwards (see the audience feature F033-03).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web publish end to end: client publisher posts to /api/artifacts/publish and validates the receipt (apps/web/features/chat/components/artifacts/publishArtifactClient.ts:74-130).
- Server validates body (kind enum, content 1 to 1,000,000 characters, title up to 300), checks CSRF and rate limit, applies workspace sharing policy, moderation and secret redaction, then upserts and versions (apps/web/app/api/artifacts/publish/route.ts:33-60; apps/web/lib/services/published-artifact-publication-policy.ts:55-85).
- Per-person cap of 200 publications with a 409 conflict message 'Unpublish one before publishing another' (published-artifact-service.ts:59; :414-416). Republishing an existing artifact is exempt (:395-412 of the loop; admitPublishedArtifact returns the existing id).
- Mobile publish with cloud-mode and sign-in guards and uncertain-outcome recovery (ArtifactFullScreen.tsx:731-800; apps/mobile/src/features/chat/services/artifactPublishing.ts:60-100).
- CLI publish with kind check, optional workspace audience and rollback of a fresh publication if narrowing fails (apps/cli/src/cloud/artifacts.rs:451-538).
- Artifact created from connected apps is published as 'invited' on first publish (published-artifact-service.ts:436-441).

**Incomplete**

- Web only maps the artifact types html, react, svg, mermaid, code and document (markdown or text); other types such as images or PDFs throw 'cannot be published to a public page yet' (publishArtifactClient.ts:22-52).
- The module comment in packages/platform/artifacts/src/artifacts.ts:66-72 says desktop and mobile inject no publisher, but mobile has its own publish function (apps/mobile/src/features/chat/services/artifactPublishing.ts:60); the comment is stale.
- The brief lists CLI as n/a for S33.04 but the CLI has a publish command (apps/cli/src/lib.rs:1399-1408).

**Present but disconnected or switched off**

- Tauri desktop adapter publishAdapter.ts writes files under the app data folder and injects no cloud publisher (apps/desktop/src/features/artifacts/publishAdapter.ts:1-17); it is retained internal code per AGENTS.md section 5.

**Not available**

- VS Code: no publish code found in apps/extension-vscode/src; founder decision confirms (doc: docs/decisions/2026-09-27-founder-decisions.md).
- Chrome: no publish code found in apps/extension.
- Publishing Local or own-key (BYOK) artifacts: refused on web by the trust-boundary check (packages/platform/artifacts/src/artifacts.ts:256-275).
- No description field on a published page (published-artifact-service.ts:154-167; route.ts:33-40).

## 4. Required behaviour

**Established requirements**

- Prompt-based creation then hosting must work: the user prompts, then hosts the result (brief S33.04). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S33.04)
- Only kinds with a safe renderer can publish: html, react, svg, mermaid, markdown, text, code. (source: apps/web/lib/services/published-artifact-service.ts:61-69)
- Content is capped at 1,000,000 characters and empty content is refused. (source: apps/web/lib/services/published-artifact-service.ts:50; :320-331 (validation in preparePublishArtifactRecord))
- Title is capped at 300 characters on the route. (source: apps/web/app/api/artifacts/publish/route.ts:35)
- A person may hold at most 200 publications; over the cap returns a conflict telling them to unpublish one. (source: apps/web/lib/services/published-artifact-service.ts:59; :414-416)
- A Local or own-key artifact must never reach the managed-cloud publisher. (source: packages/platform/artifacts/src/artifacts.ts:256-275 and AGENTS.md section 6)
- VS Code does not preview, export or publish artifacts (decision). (source: doc: docs/decisions/2026-09-27-founder-decisions.md)

**Acceptance criteria**

1. Publishing an html artifact from a Cloud chat on web returns 201 with a 24-character token and a /shared-artifact/<token> link.
2. Publishing the same artifact again returns the same token and does not create a second row or, if content is unchanged, a new version.
3. Publishing an empty artifact, or one over 1,000,000 characters, is refused with a validation error and nothing is stored.
4. The 201st distinct publication returns a 409 whose text tells the person to unpublish one first.
5. On mobile in Local mode no request is sent and the alert 'Switch to AGI Cloud to publish' appears.
6. A web artifact made in Local or own-key mode shows an unavailable message and sends nothing.
7. Content with a detected secret is stored redacted or the publish is refused, per workspace policy.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Publish should be refused for a signed-out visitor on every app; the server uses getUserScopedDb and the route test says a 401 propagates (apps/web/app/api/artifacts/publish/route.test.ts: 'propagates a 401'). [inferred]
- The brief marks desktop built; for Electron this holds only because the desktop shows the web app. [inferred]

**Proposed improvements** (suggestions, not requirements)

- [proposed] Extend publishable kinds to images and PDFs only with a safe renderer.
- [proposed] Add a description field so S33.02 is met.
- [proposed] Correct the stale module comment in packages/platform/artifacts/src/artifacts.ts.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | published-artifact-service | `apps/web/lib/services/published-artifact-service.ts` | Validation, quota admission, upsert, versioning, token minting, listing, unpublish. |
| endpoint | POST /api/artifacts/publish | `apps/web/app/api/artifacts/publish/route.ts` | Publish route with CSRF, rate limit, schema, policy, audit event. |
| service | published-artifact-publication-policy | `apps/web/lib/services/published-artifact-publication-policy.ts` | External-sharing policy gate, moderation, secret redaction before storing. |
| endpoint | GET /api/artifacts/publish/lookup | `apps/web/app/api/artifacts/publish/lookup/route.ts` | Finds the publication of one artifact id so the panel can show its link. |
| schema | cloud-contracts artifact-index | `packages/contracts/cloud-contracts/src/artifact-index.ts` | Shared publish receipt, title and id limits, page size 200. |
| table | published_artifacts | `apps/web/db/neon/0095_published_artifacts.sql` | The published page row, unique per owner and artifact id, token check of 24 characters. |
| table | published_artifact_versions | `apps/web/db/neon/0257_file_versions_and_lineage.sql` | Append-only version snapshots written on each changed publish. |
| service | createWebCloudPublisher | `apps/web/features/chat/components/artifacts/publishArtifactClient.ts` | Web client: maps artifact type to kind, posts, validates the receipt. |
| component | ArtifactPreview | `apps/web/features/chat/components/artifacts/ArtifactPreview.tsx` | Publish button, menu item, toasts and link bar. |
| component | ArtifactsPanel | `apps/web/features/chat/components/artifacts/ArtifactsPanel.tsx` | Builds the publish handler with privacyMode managed and origin check. |
| service | publishArtifact (platform) | `packages/platform/artifacts/src/artifacts.ts` | Trust-boundary cross-check and cloud versus local routing. |
| screen | ArtifactFullScreen | `apps/mobile/src/features/chat/components/ArtifactFullScreen.tsx` | Mobile publish button, confirm alert, sign-in and Cloud-mode guards. |
| service | mobile artifactPublishing | `apps/mobile/src/features/chat/services/artifactPublishing.ts` | Mobile publish request, receipt validation, failure copy, local-mode messages. |
| command | agi artifacts publish | `apps/cli/src/lib.rs` | CLI subcommand definition (1399-1408) and handler (3996-4019). |
| service | cli cloud artifacts | `apps/cli/src/cloud/artifacts.rs` | CLI publish request, kind list, audience-aware publish with rollback. |
| service | desktop publishAdapter | `apps/desktop/src/features/artifacts/publishAdapter.ts` | Tauri local-file writer; no cloud path. |
| config | share-create rate limit | `apps/web/lib/rate-limit.ts` | 5 requests per minute for publish, unpublish, audience and restore writes (424-428). |
| test | publish route tests | `apps/web/app/api/artifacts/publish/route.test.ts` | Route behaviour: kinds, cap, redaction, 401, ownership. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person presses Publish; the web panel locks the view and calls the publish handler with the current content. | device | apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1221-1270 |
| The platform publisher checks the artifact was created in managed mode and the requested mode matches; otherwise it returns unavailable without any network call. | device | packages/platform/artifacts/src/artifacts.ts:256-312 |
| The web client maps the artifact type to a kind and POSTs JSON with a CSRF header to /api/artifacts/publish. | device | apps/web/features/chat/components/artifacts/publishArtifactClient.ts:74-120 |
| Server checks CSRF, rate limit (5 per minute), parses the body, resolves the user-scoped database connection. | our servers | apps/web/app/api/artifacts/publish/route.ts:42-64 |
| Server applies the workspace external-sharing policy, content moderation, and secret redaction or refusal. | our servers | apps/web/lib/services/published-artifact-publication-policy.ts:55-85 |
| In one transaction: confirm the conversation is the caller's, take an advisory lock, enforce the 200 cap, upsert the row, record a version if anything changed. | our servers | apps/web/lib/services/published-artifact-service.ts:341-498 |
| Server writes an audit event named share_link_updated and returns 201 with the receipt. | our servers | apps/web/app/api/artifacts/publish/route.ts:86-118 |
| Client validates the receipt matches the artifact id, shows the link and copies it. | device | publishArtifactClient.ts:100-128; ArtifactPreview.tsx:1233-1250 |
| Mobile and CLI follow the same server path; the CLI first fetches the artifact's message text from the conversation, then posts. | device and our servers | apps/mobile/src/features/chat/services/artifactPublishing.ts:60-100; apps/cli/src/cloud/artifacts.rs:451-490 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Published page row: token, owner, artifact id, conversation id, title, kind, language, content, visibility, version | table published_artifacts on our servers | Server is the source; clients re-read through list and lookup routes | No expiry (published-artifact-service.ts:44-47 says no TTL). Deleted on unpublish or when its source conversation is deleted. |
| Version snapshot (title, kind, language, content) | table published_artifact_versions on our servers | Server only | Removed with the publication by database cascade (apps/web/db/neon/0257_file_versions_and_lineage.sql:53-56). No pruning found. |
| Audit event share_link_updated | security audit log on our servers | No | Retention not established from the files read. |
| Local copy of the artifact and its audience (mobile in-memory audience map) | web artifacts store and mobile usePublishedArtifactAudiences store on the device | Audience map is refreshed from the server list | Device-side only; not found to be persisted. |

**Models and providers.** No model or provider is called when publishing. The artifact was produced by a chat turn on any model; publishing only copies its text. Only artifacts created in Cloud (managed) mode may be published from web (packages/platform/artifacts/src/artifacts.ts:256-275).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Required. Web uses a user-scoped database connection and the route returns 401 when not signed in. Mobile needs a signed-in Cloud account (ArtifactFullScreen.tsx:733-740). CLI needs a stored token (client.rs:375-379). |
| Permissions | Only the owner publishes their own artifact; the conversation must be the caller's or the server returns 403 (published-artifact-service.ts:350-359). A workspace policy can refuse external sharing (published-artifact-publication-policy.ts:55-70). |
| Subscription | No plan check on publishing itself was found in the files read; only workspace-audience sharing is tied to a plan capability (see F033-03). Entitlements for publishing are unknown beyond that. |
| Limits and metering | 200 publications per person (published-artifact-service.ts:59), 1,000,000 characters, title 300 characters, 5 publish writes per minute (apps/web/lib/rate-limit.ts:424-428). No usage metering of publishes found. |
| Feature flags | None found for publish. |
| Model compatibility | Independent of model; any model that produced a supported artifact kind. |
| Provider restrictions | None found; publishing does not call a provider. |
| Local mode | Not allowed. Web refuses Local and own-key origin artifacts; mobile alerts to switch to AGI Cloud; CLI refuses any non-managed mode (apps/cli/src/cloud/client.rs:361-373). Nothing is uploaded. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading | Button label becomes 'Publishing…' and is disabled; mobile dims the globe icon. | ArtifactPreview.tsx:2308; ArtifactFullScreen.tsx:1322 |
| Success | Link shown and copied; toast or alert confirms. | ArtifactPreview.tsx:1243-1245 |
| Error | Validation, forbidden (not your conversation) and conflict (over 200) errors come back as messages; web shows an error toast. | apps/web/app/api/artifacts/publish/route.ts:87-98 (error mapping); ArtifactPreview.tsx:1265 |
| Uncertain outcome (network failure after send) | Mobile alerts 'Publish not confirmed' and re-reads the publication; the web client rejects a bad receipt with 'Publication could not be confirmed'. | ArtifactFullScreen.tsx:781-795; publishArtifactClient.ts:100-110 |
| Retry | Pressing Publish again is safe; it upserts the same row. | published-artifact-service.ts:442-448 |
| Cancel | Mobile Cancel in the confirm alert sends nothing. | ArtifactFullScreen.tsx:285-296 |
| Offline | not handled in the code beyond the generic request failure paths seen; no offline queue found. | searched artifactPublishing.ts and publishArtifactClient.ts |
| Conversation deleted or not owned | 403 with a message that the artifact belongs to a deleted or foreign conversation. | published-artifact-service.ts:350-359 |
| Account switched during publish | Mobile discards the result when the cloud account changed. | artifactPublishing.ts:60-100 (account epoch checks); ArtifactFullScreen.tsx:755-757 |
| Accessibility | Web and mobile buttons carry aria or accessibility labels; the web audience control is a labelled select. | ArtifactPreview.tsx:2924; ArtifactFullScreen.tsx:1324-1326 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/artifacts/publish/route.test.ts`: Route: public URL on success, secret redaction and refusal, audit event, cross-site refusal, rate limit, rejected kinds, non-JSON body, bad conversation id, 403 for a foreign conversation, 409 over the cap, republish over the cap, 401, commit handling.
- `apps/web/lib/services/published-artifact-service.test.ts`: Service logic for publishing (file name; contents not read).
- `apps/web/lib/services/__tests__/published-artifact-service.quota-admission.test.ts`: Quota admission under the owner lock (by file name).
- `apps/web/lib/services/__tests__/published-artifact-service.transactions.test.ts`: Transaction behaviour of publish (by file name).
- `apps/web/features/chat/components/artifacts/publishArtifactClient.publish.test.ts`: Web client publish and receipt validation (by file name).
- `apps/web/features/chat/components/artifacts/ArtifactPreview.publish.test.tsx`: Publish control in the preview (by file name).
- `apps/web/features/chat/components/artifacts/ArtifactsPanel.publish.test.tsx`: Panel publish wiring (by file name).
- `apps/mobile/src/features/chat/components/__tests__/ArtifactFullScreen.publish.test.tsx`: Mobile publish flow (by file name).
- `apps/mobile/src/features/chat/components/__tests__/ArtifactFullScreen.publishAccount.test.tsx`: Mobile publish with account states (by file name).
- `apps/mobile/src/features/chat/services/__tests__/artifactPublishing.test.ts`: Mobile publish service (by file name).
- `apps/cli/src/cloud/artifacts.rs`: Inline Rust tests: publish request carries only accepted fields; only the seven kinds publish; workspace audience refused before publish; new publication withdrawn when narrowing fails.
- `apps/web/db/neon/published-artifacts-migration.test.ts`: Shape of the published_artifacts migration (by file name).

**Test scenarios**

- **Publish from web Cloud chat**
  1. Sign in on web, ask for a one-page html site in a Cloud chat.
  2. Open the artifact, press Publish.
  - Expected: Toast says published and link copied; the link bar shows /shared-artifact/<24 characters>; opening it renders the page.
- **Republish after a change**
  1. Edit the artifact (or ask for a change).
  2. Press Publish again.
  - Expected: Same token and URL; the version number in the list increases only if the content changed.
- **Cap**
  1. Hold 200 publications (seed in a test account).
  2. Publish a new artifact.
  - Expected: 409 with 'You already have 200 published artifacts. Unpublish one before publishing another.'; republishing an existing one still works.
- **Local mode on mobile**
  1. Sign in, switch the app to Local mode.
  2. Open an artifact and tap the globe icon.
  - Expected: Alert 'Switch to AGI Cloud to publish'; no request is sent.
- **Unsupported kind**
  1. Make an image or PDF artifact on web.
  2. Look for Publish or try it.
  - Expected: Not publishable; message says download or copy instead.
- **CLI publish**
  1. Sign in the CLI in managed mode.
  2. Run agi artifacts publish <id> --json.
  - Expected: JSON with shareUrl and visibility public; a kind outside the seven returns a 400-style error before any request.

**Where to look when it fails**

- Server error classes PublishedArtifactValidationError, PublishedArtifactOwnershipError, PublishedArtifactQuotaError map to 400, 403, 409 (route.ts:87-98).
- Audit events with eventType share_link_updated and resourceType published_artifact.
- Table published_artifacts (row per artifact) and published_artifact_versions.
- Warn log '[external-sharing] refused by workspace policy' from apps/web/lib/managed-compute-gate.ts.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/033-generated-sites-and-published-applications.md](../../70-qa/test-plans/web/033-generated-sites-and-published-applications.md)
- Desktop: [70-qa/test-plans/desktop/033-generated-sites-and-published-applications.md](../../70-qa/test-plans/desktop/033-generated-sites-and-published-applications.md)
- Mobile: [70-qa/test-plans/mobile/033-generated-sites-and-published-applications.md](../../70-qa/test-plans/mobile/033-generated-sites-and-published-applications.md)

## 10. Gaps and dependencies

- **No description field for a published app** Affects: All apps. Evidence: published-artifact-service.ts:154-167; route.ts:33-40. Work needed: Add a description column, schema field and UI if the product wants S33.02.
- **Brief status table disagrees with code on CLI (n/a versus a working publish command) and chrome/vscode wording** Affects: Documentation. Evidence: apps/cli/src/lib.rs:1399-1408; brief S33.04. Work needed: Update the brief.
- **Image, PDF and other artifact types cannot be published** Affects: Web, mobile, CLI. Evidence: publishArtifactClient.ts:22-52; artifacts.rs:44. Work needed: Add safe renderers before widening the kind list.
- **Stale module comment says mobile injects no publisher** Affects: Engineers. Evidence: packages/platform/artifacts/src/artifacts.ts:66-72 versus artifactPublishing.ts:60. Work needed: Correct the comment.
- **No publish on VS Code or Chrome** Affects: VS Code, Chrome users. Evidence: No code found; decision doc for VS Code. Work needed: None for VS Code (decided); Chrome needs a product decision.
- **No TTL or view accounting** Affects: All. Evidence: published-artifact-service.ts:44-47. Work needed: Founder-approved expiry and analytics.
- Not built on: VS Code, Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:mobile
- surface:cli
- surface:desktop
- mode:cloud
- table:published_artifacts
- table:published_artifact_versions
- api:POST /api/artifacts/publish
- SYS-files-artifacts-and-storage
- SYS-authentication-and-identity
- SYS-security-and-privacy
- SYS-execution-boundaries
- F033-02
- F033-06

## Unknown

- Whether any plan or entitlement should limit publishing (none found).
- Retention of audit events.
- Whether the CLI non-interactive publish path behaves the same in CI (not read).
- Whether Electron desktop adds any publish-specific code beyond the web app (none found in apps/desktop/src).

---
id: "F010-04"
type: "feature"
title: "Sharing links"
aliases: ["Share conversation", "Share link", "Shared links", "Publish artifact", "Publish generated app", "Manage link access", "Revoke link", "S10.08", "S10.09", "S10.10", "S10.11", "S10.12"]
area: "10 Modal and dialog inventory"
available_on: ["web", "desktop", "mobile", "cli", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "partial", vscode: "missing", chrome: "partial"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "n/a", chrome: "not seen by a person"}
requirement_items: ["S10.08", "S10.09", "S10.10", "S10.11", "S10.12"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:chrome", "mode:cloud", "mode:local", "api:POST /api/share", "api:DELETE /api/share/[token]", "api:POST /api/artifacts/publish", "api:DELETE /api/artifacts/publish/[token]", "table:shared_sessions", "table:published_artifacts", "SYS-security-and-privacy", "SYS-files-artifacts-and-storage", "SYS-authorization-and-workspaces", "SYS-execution-boundaries"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F010-04 Sharing links

Creates a link to a chat snapshot, a file (system share sheet on mobile) or a published artifact page; shows who can open it; and revokes or takes it down. Web chat links last 1, 7 or 30 days and can be public or workspace-only. Mobile manages links in Settings; CLI lists and revokes; Chrome shares from history.

Area: [10. Modal and dialog inventory](README.md). Requirement items: [S10.08](../../10-requirements/capabilities/010-modal-and-dialog-inventory.md#s1008), [S10.09](../../10-requirements/capabilities/010-modal-and-dialog-inventory.md#s1009), [S10.10](../../10-requirements/capabilities/010-modal-and-dialog-inventory.md#s1010), [S10.11](../../10-requirements/capabilities/010-modal-and-dialog-inventory.md#s1011), [S10.12](../../10-requirements/capabilities/010-modal-and-dialog-inventory.md#s1012).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | built | built | not seen by a person |
| CLI | partly built | partly built | not seen by a person |
| VS Code | not built | not built | n/a |
| Chrome | partly built | partly built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Chat share publishes a read-only snapshot at a link. Publish puts an artifact (page, app, code, diagram, text) on a live URL. Access controls choose who can open it and when it expires. Revoke or Unpublish makes the link stop working.

**Why it exists.** People need to show a chat or generated page to others and to take it back. The brief requires the dialog to state who can open the link, allow revoke with confirmation, and fail without a half link (doc: knowledge-base/data/area-briefs/010-modal-and-dialog-inventory.md, S10.08 to S10.12).

**Who uses it.** Signed-in users on web, Electron desktop, mobile, CLI and Chrome. Workspace members use the workspace audience.

**Problems it solves**

- Sending a conversation to someone without an account copy.
- Publishing a generated page.
- Withdrawing access that was granted by link.

**Use cases**

- Web: share a chat, choose 7 days and Anyone with the link, copy.
- Web: change audience to Everyone in your workspace.
- Mobile: Settings, Shared Links, Revoke.
- CLI: agi artifacts publish <id> --audience workspace; agi shares revoke <token>.

## 2. User experience

**Where to find it**

- Web chat: title menu 'Share…' or header share button; dialog titles 'Share conversation', 'Public link ready', 'Shared with your workspace', 'Conversation links' (apps/web/features/chat/components/share/ShareConversationDialog.tsx:262-290; ConversationTitleMenu.tsx:166-172).
- Web artifact: preview toolbar 'Publish' (aria-label 'Publish artifact to a public link'), then 'Copy link' and an audience select with 'Anyone with the link', workspace and 'Only people you invite' (apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:2921-2929,3007-3045).
- Web take-down: Settings published artifacts section, confirm 'Unpublish this artifact?' with button 'Unpublish artifact' (apps/web/features/settings/sections/PublishedArtifactsSection.tsx:93-100).
- Mobile chat: action sheet 'Share', alert 'Share a link to this chat?' (apps/mobile/src/features/shared-links/shareConversation.ts:17-30).
- Mobile links: Settings screen 'Shared Links' with Revoke per row (apps/mobile/app/(app)/settings/shared-links.tsx:217-240; apps/mobile/src/features/settings/screenTitles.ts:3).
- Mobile file: Library action menu 'Share' and a selection 'Share' button, which downloads the file and opens the system share sheet (apps/mobile/src/features/library/index.tsx:440-455,644,1082-1089).
- Mobile artifact: full-screen viewer alerts 'Publish to a public link?', controls 'Anyone with the link', workspace and 'Only people you invite', 'Unpublish this artifact?' (apps/mobile/src/features/chat/components/ArtifactFullScreen.tsx:285-300; PublishedArtifactControls.tsx:90-170).
- CLI: agi shares, agi shares revoke <token>, agi artifacts publish|published|audience|unpublish (apps/cli/src/lib.rs:1023,7349-7378,1399-1431).
- Chrome: recent chats menu 'Share' with the prompt 'Create a link that anyone who has it can use to read this chat?' and 'Create link' (apps/extension/src/side_panel.ts:12560-12610; _locales spHistoryShareConfirm, spHistoryShareCreate).
- Desktop: the Electron window shows the hosted web app, so web dialogs apply (doc: AGENTS.md section 5).

**Before you start**

- Signed in and in Cloud mode; mobile Local mode refuses share and publish (apps/mobile/app/(app)/settings/shared-links.tsx:62-70; apps/mobile/src/features/chat/services/artifactPublishing.ts:357-360).
- The chat has messages; mobile reports 'This chat has no messages to share yet.' (useConversationActions.ts:160-176).
- Temporary chats cannot be shared: web refuses with a policy message and mobile hides Share (apps/web/features/chat/hooks/use-share-conversation.ts:23; useConversationActions.ts:262-266).
- Artifact kind must be publishable: html, react, svg, mermaid, code, markdown or text (apps/web/features/chat/components/artifacts/publishArtifactClient.ts:22-40).

**Screens and controls**

- Web share dialog: read-only 'Conversation link' input, 'Copy' button, audience select 'Anyone with the link' or workspace, 'Link expires after' radio group (1, 7, 30 days), 'Create public link', 'Update link', 'Revoke share' and 'Revoke every link' (ShareConversationDialog.tsx:300-460).
- Mobile Shared Links: list with title, date and Revoke, with a note when older links may be missing (shared-links.tsx:40-60).

**Journey**

1. 1. Person opens Share on a chat or Publish on an artifact.
2. 2. Dialog states who can open it (for example 'Anyone with the link can read this snapshot without signing in').
3. 3. Person picks expiry and audience, then creates.
4. 4. The link is shown; Copy puts it on the clipboard; mobile opens the share sheet.
5. 5. Later the person opens the link list or the dialog and revokes after a confirmation naming the effect.

**What the person sees and gets**

- Web toasts 'Link copied', 'Link updated', 'Published · link copied to clipboard' (ShareConversationDialog.tsx:235-245; ArtifactPreview.tsx:1241-1247).
- Web dialog text with the message count and expiry date (ShareConversationDialog.tsx:270-285).
- Mobile share sheet with the URL; alert 'Could not create the link' on failure (shareConversation.ts:35-50).
- CLI line 'Published <title> at <url> (opens for <audience>).' and 'Revoked shared link <token>.' (apps/cli/src/lib.rs:4000-4015,7372).
- Chrome status 'Link copied until <date>' strings (side_panel.ts:12485-12500).

**Settings**

- Expiry choice 1, 7 or 30 days (apps/web/app/api/share/route.ts:80-86).
- Audience: public, workspace or invited (ShareConversationDialog.tsx; ArtifactPreview.tsx:3040-3070).
- Workspace policy on external sharing and secret handling (apps/web/app/api/share/route.ts:25; published-artifact-publication-policy.ts:5-8).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web chat share posts to POST /api/share with a 1, 7 or 30 day expiry, lists with GET, refreshes with PUT, revokes with DELETE and changes audience with PATCH on a token (apps/web/app/api/share/route.ts:80-86,839-842; apps/web/app/api/share/[token]/route.ts:263-265).
- Web dialog explains the audience before copying and confirms before revoke with text such as 'Anyone holding the link loses access immediately... the old one stays dead' (ShareConversationDialog.tsx:200-230).
- Server strips local paths and redacts secrets from shared messages and checks the secret-handling policy (apps/web/app/api/share/route.ts:20-48,100-130; published-safety test apps/web/app/__tests__/published-safety-claims.test.ts:545-553).
- Web artifact publish: client posts to /api/artifacts/publish; the server checks CSRF, rate limit, moderation and sharing policy, records an audit event 'share_link_updated', and returns shareUrl and visibility (apps/web/app/api/artifacts/publish/route.ts:42-125; apps/web/lib/services/published-artifact-publication-policy.ts:1-30). Publication copies the link to the clipboard (ArtifactPreview.tsx:1235-1245).
- Artifact audience change and unpublish use PATCH and DELETE on /api/artifacts/publish/[token] (apps/web/app/api/artifacts/publish/[token]/route.ts:212-213).
- Per-user published artifact count is capped and returns a quota conflict (apps/web/lib/services/published-artifact-service.ts:405-420).
- Mobile chat share confirms with 'Anyone with the link can read this chat until it expires or you revoke it.' then opens the share sheet (shareConversation.ts:17-40).
- Mobile Shared Links screen lists, revokes with confirmation and handles the Local mode block (shared-links.tsx:40-270).
- Mobile library file share downloads the original file, then opens the share sheet (library/index.tsx:440-455).
- CLI shares list and revoke with confirmation, artifacts publish/unpublish with a confirm saying the link cannot be restored (apps/cli/src/lib.rs:7349-7378,4020-4045).
- Chrome history Share creates a link with a confirm row, handles unsaved changes and copy status (side_panel.ts:12480-12610).

**Incomplete**

- Web artifact take-down is not in the preview bar; it is in Settings (PublishedArtifactsSection.tsx:93-100). The preview offers audience change.
- The mobile Library offers a system share of a file, not a link with access settings (library/index.tsx:440-455).
- Mobile chat share creates a link with no expiry choice in the alert (shareConversation.ts:17-30).
- Chat share has no CLI create command; CLI only lists and revokes (apps/cli/src/lib.rs:7349-7378).

**Present but disconnected or switched off**

- nothing found

**Not available**

- VS Code: chat share and artifact publish commands were not found (searched package.json and commandSetup.ts for publish and share); VS Code opens already-published artifacts (commandSetup.ts:2661-2663).
- Share of a folder from mobile Library: files only were found.
- Chrome artifact publish: not found.

## 4. Required behaviour

**Established requirements**

- A share dialog creates a link to the conversation, shows it for copying, and states who can open it. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S10.08)
- The user can share a file or folder from the library by link or the system share sheet. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S10.09)
- An artifact share dialog publishes to a link, lets the user copy it, choose who can open it and take it down. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S10.10)
- A publish dialog puts a generated app or page on a live URL and hands back the link. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S10.11)
- For a shared link the user can see its access (who, expiry) and change or revoke it. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S10.12)
- Public sharing: preview what will be exposed; verify link access signed-out; revocation and expiry stop access; workspace restrictions are enforced on the server. (source: (doc: docs/product/experience-contract.md, row W10))

**Acceptance criteria**

1. The dialog states who can open the link before it is copied.
2. A created chat link opens in a signed-out browser until expiry.
3. Revoke asks first and, once done, the link no longer opens.
4. A failed create leaves no link in the list.
5. Changing audience to workspace-only stops signed-out access to the same URL.
6. Publish returns a URL and Unpublish makes it stop resolving.
7. Local-mode mobile cannot create a link and says why.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- A temporary chat cannot be shared [inferred from TEMPORARY_CHAT_SHARE_REFUSAL import in use-share-conversation.ts:23].
- Share and publish are cloud-only features, because the server stores the snapshot [inferred from /api/share and /api/artifacts/publish].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add a take-down control in the artifact preview next to Copy link.
- [proposed] Offer an expiry choice on mobile chat share to match web.
- [proposed] Add VS Code share and publish commands or record them as out of scope.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | ShareConversationDialog | `apps/web/features/chat/components/share/ShareConversationDialog.tsx` | Web share dialog with audience, expiry, copy and revoke |
| hook | use-share-conversation | `apps/web/features/chat/hooks/use-share-conversation.ts` | Create, list, refresh, set audience and revoke shares with request authority |
| endpoint | /api/share | `apps/web/app/api/share/route.ts` | POST create, PUT refresh, GET list, DELETE revoke for a conversation |
| endpoint | /api/share/[token] | `apps/web/app/api/share/[token]/route.ts` | GET view, DELETE revoke, PATCH audience |
| table | shared_sessions | `apps/web/app/api/share/route.ts` | Stores chat share rows with visibility and expiry |
| table | organization_shared_sessions | `apps/web/app/api/share/route.ts` | Workspace grants for shares |
| table | published_artifacts | `apps/web/lib/services/published-artifact-service.ts` | Published artifact rows |
| table | organization_shared_artifacts | `apps/web/lib/services/published-artifact-publication-policy.ts` | Workspace grants for artifacts |
| component | ArtifactPreview | `apps/web/features/chat/components/artifacts/ArtifactPreview.tsx` | Publish button, Copy link bar and audience control |
| service | publishArtifactClient | `apps/web/features/chat/components/artifacts/publishArtifactClient.ts` | Web publisher: kind resolution, POST, receipt checks |
| endpoint | /api/artifacts/publish | `apps/web/app/api/artifacts/publish/route.ts` | Publish (POST) and list (GET) |
| endpoint | /api/artifacts/publish/[token] | `apps/web/app/api/artifacts/publish/[token]/route.ts` | Unpublish (DELETE), update audience (PATCH), detail (GET) |
| component | PublishedArtifactsSection | `apps/web/features/settings/sections/PublishedArtifactsSection.tsx` | List and unpublish with confirm |
| service | shareConversation (mobile) | `apps/mobile/src/features/shared-links/shareConversation.ts` | Confirm alert, create link and open share sheet |
| screen | Shared Links screen | `apps/mobile/app/(app)/settings/shared-links.tsx` | List and revoke links |
| screen | Library | `apps/mobile/src/features/library/index.tsx` | File share through the system share sheet |
| component | PublishedArtifactControls | `apps/mobile/src/features/chat/components/PublishedArtifactControls.tsx` | Mobile audience and unpublish |
| service | artifactPublishing (mobile) | `apps/mobile/src/features/chat/services/artifactPublishing.ts` | Mobile publish client and Local-mode prompts |
| command | agi shares / agi artifacts | `apps/cli/src/lib.rs` | CLI list and revoke shares, publish and unpublish artifacts |
| integration | cloud-contracts conversation-shares | `packages/contracts/cloud-contracts/src/conversation-shares.ts` | Shared schemas and paths for share endpoints |
| component | Chrome history Share row | `apps/extension/src/side_panel.ts` | Chrome link creation with confirm |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Web builds a snapshot of the visible messages and artifacts and posts it with the chosen expiry. | device | apps/web/features/chat/hooks/use-share-conversation.ts:100-135 |
| The server rate-limits, redacts secrets and local paths, checks the workspace policy, stores the snapshot and returns the token and URL. | our servers | apps/web/app/api/share/route.ts:550-640 |
| A visitor opens the share page; GET /api/share/[token] returns the snapshot if not expired and the audience allows. | our servers | apps/web/app/api/share/[token]/route.ts:55-100 |
| Revoke sends DELETE; the old URL stays dead and a new share gets a new URL. | our servers | ShareConversationDialog.tsx:200-225; apps/web/app/api/share/[token]/route.ts:100 |
| Artifact publish posts the content to /api/artifacts/publish; moderation and outbound-content checks run before storage. | our servers | apps/web/app/api/artifacts/publish/route.ts:42-90; published-artifact-publication-policy.ts:9-22 |
| Mobile library share downloads the file then hands it to the operating system share sheet. | device | apps/mobile/src/features/library/index.tsx:440-455 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Chat snapshot (messages, artifacts, title, expiry, visibility) | tables shared_sessions and organization_shared_sessions | Server-side, opened by token | Expires after 1, 7 or 30 days or on revoke (apps/web/app/api/share/route.ts:80-86) |
| Published artifact content and token | table published_artifacts | Server-side | Until unpublished; per-user count is capped (published-artifact-service.ts:405-420) |
| Audit event share_link_updated | security audit log | Server-side | unknown |

**Models and providers.** No model or provider takes part in sharing or publishing.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Sign-in required for create, list, revoke; viewers of public links need no account (apps/web/app/api/share/route.ts; ShareConversationDialog.tsx text 'without signing in'). |
| Permissions | Owner scoped; workspace sharing is limited by organization policy and the external sharing gate (published-artifact-publication-policy.ts:5-8; apps/web/app/api/share/route.ts:25). |
| Subscription | none found in the code for chat share. Artifact publish is capped per user by count and quota (published-artifact-service.ts:134-140,405-420). A website free-plan usage ceiling is mentioned in settings (PublishedArtifactsSection.tsx:545), details unknown. |
| Limits and metering | Rate buckets share-create and share-view (apps/web/app/api/share/route.ts:554; apps/web/app/api/artifacts/publish/route.ts:46,130); size limit on shared messages (route.ts:70-72). |
| Feature flags | none found in the code |
| Model compatibility | none found in the code |
| Provider restrictions | none found in the code |
| Local mode | Mobile Local mode: shared links screen shows a blocked state (EGRESS_BLOCKED_LOCAL_MODE) and publishing says 'This device is in Local mode... switch to AGI Cloud mode first. Nothing has been uploaded.' (apps/mobile/app/(app)/settings/shared-links.tsx:31-38; artifactPublishing.ts:357-358). CLI account commands refuse Local and BYOK (apps/cli/src/lib.rs:2611-2614). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Creating | Button reads 'Creating…' and is disabled. | ShareConversationDialog.tsx:445-455 |
| Lookup failed | Message 'Could not check whether this chat already has a shared link.' | use-share-conversation.ts:86 |
| Transcript still loading | 'This chat is still loading. Try again in a moment.' | use-share-conversation.ts:87 |
| Inventory incomplete | Notice that older links may not be shown, and a 'Revoke every link' button. | ShareConversationDialog.tsx:270-290 |
| Copy fails | Toast to copy manually. | ShareConversationDialog.tsx:235-245 |
| Revoke unconfirmed (mobile) | Alert 'Could not revoke' says refresh the list before trying again. | shared-links.tsx:44-46,267 |
| Request timeout (web) | A client deadline aborts create (SHARE_CONVERSATION_CLIENT_DEADLINE_MS). | use-share-conversation.ts:25,55-62 |
| Account switch (mobile) | Pending list and revoke are retired and ignored. | shared-links.tsx:68-100 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/chat/components/share/ShareConversationDialog.test.tsx`: Web share dialog (inferred from file name)
- `apps/web/app/api/share/route.test.ts`: Create/list/revoke route (inferred)
- `apps/web/app/api/share/[token]/route.visibility.test.ts`: Audience visibility on a token (inferred)
- `apps/web/features/chat/components/artifacts/ArtifactPreview.publish.test.tsx`: Publish from preview (inferred)
- `apps/web/features/chat/components/artifacts/publishArtifactClient.publish.test.ts`: Publish client (inferred)
- `apps/mobile/src/features/shared-links/__tests__/shareConversation.test.ts`: Mobile share confirm and create (inferred)
- `apps/mobile/__tests__/SharedLinksScreen.test.tsx`: Mobile Shared Links screen (inferred)
- `apps/web/app/__tests__/published-safety-claims.test.ts`: Checks the share expiry options 1, 7, 30 and secret redaction named in privacy copy (read)

**Test scenarios**

- **Public chat link**
  1. Share a chat, 7 days, Anyone with the link.
  2. Open the URL in a private window.
  - Expected: Snapshot opens without sign-in; page not indexed.
- **Revoke**
  1. Open the dialog on a shared chat.
  2. Choose Revoke share and confirm.
  3. Reload the URL.
  - Expected: Link no longer opens.
- **Workspace-only audience**
  1. Change audience to Everyone in your workspace.
  2. Open the URL signed out, then as a member.
  - Expected: Signed-out denied, member allowed.
- **Publish and unpublish an artifact**
  1. Publish an HTML artifact.
  2. Open the link.
  3. Unpublish from Settings.
  - Expected: Link works, then stops resolving.
- **Local mode on mobile**
  1. Switch to Local mode.
  2. Open Shared Links or publish.
  - Expected: Blocked message; nothing uploaded.
- **CLI revoke**
  1. agi shares.
  2. agi shares revoke <token>, answer yes.
  - Expected: Token revoked and gone from the list.

**Where to look when it fails**

- API errors from /api/share and /api/artifacts/publish; audit event share_link_updated.
- Tables shared_sessions, published_artifacts.
- Web messages 'Invalid share response' and 'Publication could not be confirmed...' (publishArtifactClient.ts:100-110).

**Hands-on test plans**

- Web: [70-qa/test-plans/web/010-modal-and-dialog-inventory.md](../../70-qa/test-plans/web/010-modal-and-dialog-inventory.md)
- Desktop: [70-qa/test-plans/desktop/010-modal-and-dialog-inventory.md](../../70-qa/test-plans/desktop/010-modal-and-dialog-inventory.md)
- Mobile: [70-qa/test-plans/mobile/010-modal-and-dialog-inventory.md](../../70-qa/test-plans/mobile/010-modal-and-dialog-inventory.md)
- CLI: [70-qa/test-plans/cli/010-modal-and-dialog-inventory.md](../../70-qa/test-plans/cli/010-modal-and-dialog-inventory.md)
- Chrome: [70-qa/test-plans/chrome/010-modal-and-dialog-inventory.md](../../70-qa/test-plans/chrome/010-modal-and-dialog-inventory.md)

## 10. Gaps and dependencies

- **No take-down control in the web artifact preview; it is in Settings.** Affects: Web and desktop (Electron). Evidence: ArtifactPreview.tsx:3007-3045; PublishedArtifactsSection.tsx:93-100. Work needed: Add Unpublish beside Copy link or point to it.
- **VS Code has no share or publish command found; the brief marks Chrome chat share missing though a Share row exists.** Affects: VS Code, brief. Evidence: apps/extension/src/side_panel.ts:12560-12610; apps/extension-vscode/src/core/commandSetup.ts. Work needed: Update brief; decide VS Code scope.
- **CLI cannot create a chat share link, only list and revoke.** Affects: CLI. Evidence: apps/cli/src/lib.rs:7349-7378. Work needed: Add create or record as out of scope.
- **Mobile chat share has no expiry choice.** Affects: Mobile. Evidence: apps/mobile/src/features/shared-links/shareConversation.ts:17-30. Work needed: Add expiry options if parity is required.
- Not built on: VS Code (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:chrome
- mode:cloud
- mode:local
- api:POST /api/share
- api:DELETE /api/share/[token]
- api:POST /api/artifacts/publish
- api:DELETE /api/artifacts/publish/[token]
- table:shared_sessions
- table:published_artifacts
- SYS-security-and-privacy
- SYS-files-artifacts-and-storage
- SYS-authorization-and-workspaces
- SYS-execution-boundaries

## Unknown

- Whether the Chrome artifact publish path exists outside the files searched.
- Whether VS Code has any share path in files not searched.
- Retention of audit events.
- What the website free-plan unpublished usage ceiling in PublishedArtifactsSection.tsx:545 enforces.
- Test contents (only names seen).
- Whether mobile Library folder share exists.

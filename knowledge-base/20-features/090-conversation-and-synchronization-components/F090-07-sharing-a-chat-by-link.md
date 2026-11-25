---
id: "F090-07"
type: "feature"
title: "Sharing a chat by link"
aliases: ["Share conversation", "Shared Session", "Shared links", "Share link", "Create public link", "Update link", "Revoke share", "Shared Links screen", "agi shares", "/share/<token>", "shared_sessions", "S90.11"]
area: "90 Conversation and synchronization components"
available_on: []
implementation: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S90.11"]
depends_on: ["surface:web", "surface:mobile", "surface:cli", "surface:chrome", "surface:desktop", "mode:cloud", "table:shared_sessions", "table:organization_shared_sessions", "table:web_conversations", "table:web_messages", "api:POST /api/share", "api:PATCH /api/share/[token]", "SYS-authentication-and-identity", "SYS-authorization-and-workspaces", "SYS-security-and-privacy", "SYS-data-model-and-migrations", "F090-10"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F090-07 Sharing a chat by link

A signed-in person turns a saved Cloud chat into a read-only copy with a random link. The server checks the copy against the stored chat, strips local paths and secrets, and sets an expiry of 1, 7 or 30 days. The owner can refresh, limit to the workspace, or revoke it. (apps/web/app/api/share/route.ts:77-83)

Area: [90. Conversation and synchronization components](README.md). Requirement items: [S90.11](../../10-requirements/capabilities/090-conversation-and-synchronization-components.md#s9011).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | does not apply | does not apply | n/a |
| Desktop | does not apply | does not apply | n/a |
| Mobile | does not apply | does not apply | n/a |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Creates a frozen, cleaned copy of a saved chat under a 24-character random token. Anyone with the link can open /share/<token> and read it until it expires or is revoked, unless the owner limited it to their workspace. The owner can list, refresh, change audience, and revoke links. (apps/web/app/api/share/route.ts:553-612; apps/web/app/share/[token]/page.tsx:100-123)

**Why it exists.** People need to show an answer to someone else without giving access to their account. The copy is a snapshot, so later edits do not leak. The brief states the rule: sharing freezes a sanitized snapshot under a token that can be viewed, listed, changed in visibility and revoked (brief S90.11). Competitor guidance asks the product to explain snapshot versus live sharing, recipient access, revocation and sensitive-content review (doc: docs/product/competitive-guidance.md:276).

**Who uses it.** A signed-in person with a saved Cloud chat (Web, Mobile, Chrome, and the internal Tauri desktop shell call the create endpoint). Readers need no account for a public link. Workspace admins gate external sharing by policy. (apps/web/app/api/share/route.ts:578; apps/mobile/src/features/shared-links/service.ts:105; apps/extension/src/features/cloud-bridge/shareClient.ts:70)

**Problems it solves**

- Showing a chat to a colleague or client without screenshots.
- Stopping a link that was sent to the wrong person (revoke).
- Keeping private data out of a shared copy (local paths and credentials are removed or the share is refused). (apps/web/app/api/share/route.ts:127-135,334-372)
- Keeping an old link from outliving the chat: deleting a chat through sync removes its share rows. (apps/web/app/api/chat/sync/route.ts:696-697)

**Use cases**

- Share an answer with a teammate for 7 days, then let it expire.
- Limit a link to everyone in the workspace instead of anyone with the link.
- Update an existing link after the chat grew, so the same URL shows the new messages.
- Revoke every live link to a chat from the phone's Shared Links screen.

## 2. User experience

**Where to find it**

- Web: Share dialog in the chat page, titled 'Share conversation'; opened from apps/web/features/chat/pages/WebChatPage.tsx (imports ShareConversationDialog at line 205). (apps/web/features/chat/components/share/ShareConversationDialog.tsx:268)
- Web reader page: /share/<token>. (apps/web/app/share/[token]/page.tsx:100)
- Mobile: chat share action shows 'Share a link to this chat?' with 'Create link'; list and revoke on the 'Shared Links' settings screen. (apps/mobile/src/features/shared-links/shareConversation.ts:23-31; apps/mobile/src/features/settings/screenTitles.ts:3)
- CLI: 'agi shares' lists links; 'agi shares revoke <token>' revokes. No create command found. (apps/cli/src/lib.rs:7349-7375)
- Chrome: side panel history share (createHistoryShareLink with createChromeShareLink). (apps/extension/src/side_panel.ts:12473-12479)
- Desktop: the internal Tauri shell calls createDesktopCloudShare from DesktopShellV3. The public Electron Desktop shows the hosted web app, so it uses the Web dialog. (apps/desktop/src/features/v3/DesktopShellV3.tsx:542; doc: AGENTS.md section 5)
- VS Code: no share control found.

**Before you start**

- Signed in. (apps/web/app/api/share/route.ts:556)
- The chat must be saved to the account and not temporary. (apps/web/app/api/share/route.ts:186,574)
- Workspace policy must allow external sharing for a public link. (apps/web/app/api/share/route.ts:578-581)

**Screens and controls**

- Web dialog: read-only 'Conversation link' field and 'Copy' button (shows 'Copied'). (ShareConversationDialog.tsx:303-306)
- Web dialog: 'Link expires after' radio group: 1 day, 7 days (Recommended), 30 days. (ShareConversationDialog.tsx:27-31,366-387)
- Web dialog: 'Who can open this' select with 'Anyone with the link' and 'Everyone in this workspace (N)', shown only when the owner has a workspace. (ShareConversationDialog.tsx:310-335)
- Web dialog buttons: 'Create public link · <expiry>', 'Update link', 'Revoke share' or 'Revoke every link'. (ShareConversationDialog.tsx:424-449)
- Confirm dialogs name the effect, for example 'Revoke this share?' and 'Revoke all N links?'. (ShareConversationDialog.tsx:206-223)
- Mobile Shared Links screen: per-link share and 'Revoke' buttons with accessibility labels 'Share link to <title>' and 'Revoke link to <title>'. (apps/mobile/app/(app)/settings/shared-links.tsx:451-475)

**Journey**

1. Open a saved chat and choose Share.
2. Pick 1, 7 or 30 days (default 7).
3. Choose 'Create public link'. The app sends the chat's messages and its id to the server.
4. The server checks that the chat is saved and the messages match the stored copy, removes paths and credentials, and stores the snapshot.
5. Copy the link from the dialog (web) or the system share sheet (mobile).
6. Later: change 'Who can open this', choose 'Update link' to refresh the snapshot, or revoke.

**What the person sees and gets**

- Created: link URL, expiry, message count, visibility. (apps/web/app/api/share/route.ts:621-629)
- Refusal copy: 'Only a chat saved to your account can be shared. Turn on sync for this chat, then share it again.' (apps/web/app/api/share/route.ts:203-204)
- Refusal copy: 'This chat has changes that are not saved to your account yet. Wait for them to save, then share again.' (apps/web/app/api/share/route.ts:205-206)
- Reader of an expired or revoked link sees the not-found page (web page). The JSON API returns 410 'SHARE_EXPIRED'. (apps/web/app/share/[token]/page.tsx:109; apps/web/app/api/share/[token]/route.ts:71-82)
- Mobile failure alert 'Could not create the link'. (apps/mobile/src/features/shared-links/shareConversation.ts:48-51)

**Settings**

- Workspace external-sharing policy (buildExternalSharingGateResponse). (apps/web/app/api/share/route.ts:578)
- Workspace permission 'content.share' for workspace-only links. (apps/web/app/api/share/[token]/route.ts:217-223)
- Org secret-handling policy used by the outbound-content check. (apps/web/app/api/share/route.ts:312-318)

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- POST /api/share creates a share; PUT refreshes live links; GET lists up to 200 (reports complete flag); DELETE ?conversation_id= revokes every live link of a chat. (apps/web/app/api/share/route.ts:839-842,215,804-836)
- GET/DELETE/PATCH /api/share/[token] read, revoke one link, and move it between 'public' and 'organization'. (apps/web/app/api/share/[token]/route.ts:263-265)
- Server verifies the submitted messages against the stored messages and refuses a mismatch with 409. (apps/web/app/api/share/route.ts:331-372)
- Local-path pattern and tool-call fields are sanitised, then secrets are redacted; if a credential cannot be removed the share is refused. (apps/web/app/api/share/route.ts:96-135,288-310)
- Every create, update and revoke writes an audit event. (apps/web/app/api/share/route.ts:496-530; apps/web/app/api/share/[token]/route.ts:142-153)
- Expired link: page shows not found; JSON gives 410. (apps/web/app/share/[token]/page.tsx:78-80,109; apps/web/app/api/share/[token]/route.ts:71-82)
- Mobile and CLI list and revoke. (apps/mobile/src/features/shared-links/service.ts:66-103; apps/cli/src/cloud/shares.rs:31-46)

**Incomplete**

- The brief says 'the expiry is set in days'; code accepts only 1, 7 or 30 (apps/web/app/api/share/route.ts:77-83). Mobile and Chrome clients send no expiry, so they always get the 7-day default. (apps/mobile/src/features/shared-links/service.ts:107-118; apps/extension/src/features/cloud-bridge/shareClient.ts:78-84)
- Mobile and CLI cannot change visibility or refresh a link; only list, create (mobile) and revoke were found. [inferred from the files read]

**Present but disconnected or switched off**

- Tauri desktop client createDesktopCloudShare builds a payload with no conversation_id (apps/desktop/src/services/desktopCloudShares.ts:14-19,50-60) while the server throws a validation error when conversation_id is missing (apps/web/app/api/share/route.ts:574). [inferred] A create from that shell would be refused; not run.

**Not available**

- VS Code: no share code found (not searched beyond apps/extension-vscode references; unknown).
- CLI: no create-share command found. (apps/cli/src/lib.rs:7349-7375)
- Local mode: no path creates a link from a Local-only chat; the route reads web_conversations rows only. (apps/web/app/api/share/route.ts:171-181)

## 4. Required behaviour

**Established requirements**

- Sharing freezes a sanitized snapshot of the conversation under a token that can be viewed publicly, listed, changed in visibility and revoked. (source: brief S90.11)
- Only a chat saved to the account can be shared; otherwise the person is told to turn on sync. (source: apps/web/app/api/share/route.ts:203-204,574)
- A share is refused when the chat has unsaved changes. (source: apps/web/app/api/share/route.ts:205-206,363)
- A temporary chat can never be shared. (source: apps/web/app/api/share/route.ts:185-187)
- Visibility change is PATCH on the token; revoke is DELETE; both are audited. (source: apps/web/app/api/share/[token]/route.ts:142-153,168-261)
- Competitor guidance: explain snapshot versus live sharing, recipient access, exposed artifacts, revocation and sensitive-content review. (source: doc: docs/product/competitive-guidance.md:276)
- An action a user cannot undo asks first and names the consequence. (source: doc: AGENTS.md section 9)

**Acceptance criteria**

1. A saved chat shared for 7 days returns 201 with a /share/<token> URL and an expiry 7 days ahead.
2. Sharing an unsaved or temporary chat is refused with the message naming sync or temporary chats.
3. Sharing after an unsynced local edit is refused with 409 and no share row is created.
4. A message containing a local path like ~/b shows '[local-path]' in the shared copy.
5. After revoke, the same URL shows not found and GET /api/share/<token> returns 404.
6. After an expiry time passes, /share/<token> shows not found and the API returns 410.
7. Switching to 'Everyone in this workspace' makes a signed-out visitor unable to read the link; switching back restores the same URL.
8. Deleting the chat from another device removes its links.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Mobile and Chrome should be able to choose an expiry and audience like Web, so one share rule set applies on every app (SYS-subscriptions-entitlements-and-usage and parity program). [inferred]
- Share creation counts in the daily account rate limit, not in plan quota. [inferred from share-create-account-day]

**Proposed improvements** (suggestions, not requirements)

- [proposed] Send conversation_id from the Tauri desktop client or remove that client path.
- [proposed] Add expiry and audience controls to mobile and Chrome.
- [proposed] Show to the owner which artifacts are exposed before creating the link.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| endpoint | POST/PUT/GET/DELETE /api/share | `apps/web/app/api/share/route.ts` | Create, refresh, list and revoke-all links for a chat. |
| endpoint | GET/DELETE/PATCH /api/share/[token] | `apps/web/app/api/share/[token]/route.ts` | Read one share, revoke one, change audience. |
| screen | Shared page | `apps/web/app/share/[token]/page.tsx` | Public reader page; not found when expired. |
| component | ShareConversationDialog | `apps/web/features/chat/components/share/ShareConversationDialog.tsx` | Web dialog with expiry, audience, copy, update, revoke. |
| hook | useShareConversation | `apps/web/features/chat/hooks/use-share-conversation.ts` | Calls the share endpoints, blocks temporary chats. |
| component | SharedSessionViewer | `apps/web/features/chat/components/share/SharedSessionViewer.tsx` | Renders the shared transcript. |
| service | org-shared-session-service | `apps/web/lib/services/org-shared-session-service.ts` | Reads public/organization sessions by token, updates audience, SHARE_TOKEN_REGEX. |
| service | shared-session-revocation | `apps/web/lib/services/shared-session-revocation.ts` | Deletes shares of deleted conversations. |
| schema | conversation-shares contracts | `packages/contracts/cloud-contracts/src/conversation-shares.ts` | Shared request and response schemas. |
| table | shared_sessions | `apps/web/db/neon/0051_shared_sessions.sql` | Stores token, owner, messages JSON, expiry, visibility. |
| table | organization_shared_sessions | `apps/web/db/neon/0186_organization_shared_sessions.sql` | Workspace grant row for workspace-only links. |
| service | createMobileSharedLink / service | `apps/mobile/src/features/shared-links/service.ts` | Mobile create, list, revoke. |
| screen | Shared Links settings | `apps/mobile/app/(app)/settings/shared-links.tsx` | Mobile list and revoke UI. |
| command | agi shares | `apps/cli/src/cloud/shares.rs` | CLI list and revoke. |
| service | createChromeShareLink | `apps/extension/src/features/cloud-bridge/shareClient.ts` | Chrome create call. |
| service | createDesktopCloudShare | `apps/desktop/src/services/desktopCloudShares.ts` | Tauri desktop create call (no conversation id). |
| service | sync delete cleanup | `apps/web/app/api/chat/sync/route.ts` | Revokes shares when a synced delete arrives (lines 696-697). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person chooses Share; the app sends conversation id and messages, plus expiry on Web. | device | apps/web/features/chat/hooks/use-share-conversation.ts:497-504; apps/mobile/src/features/shared-links/shareConversation.ts:31-36 |
| Server checks CSRF, two rate limits (per request and per account per day) and sign-in. | our servers | apps/web/app/api/share/route.ts:551-563 |
| Server loads the conversation (owned, not deleted, not temporary) and enforces the selected workspace. | our servers | apps/web/app/api/share/route.ts:165-200 |
| Workspace external-sharing policy is checked. | our servers | apps/web/app/api/share/route.ts:578-581 |
| Submitted messages are matched to stored rows; the title and answering model come from the stored chat. | our servers | apps/web/app/api/share/route.ts:331-372 |
| Outbound content check and secret redaction run; local paths replaced. | our servers | apps/web/app/api/share/route.ts:96-135,288-310 |
| Row inserted in shared_sessions with a random token and expiry; audit event written; URL built from the site address. | our servers | apps/web/app/api/share/route.ts:598-629 |
| A reader opens /share/<token>: public rows first, then a workspace-scoped read for workspace-only links; expired rows give not found. | our servers | apps/web/app/share/[token]/page.tsx:28-48,107-111 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Snapshot (title, model id, provider label, sanitized messages, count, expiry, visibility) | table shared_sessions (apps/web/app/api/share/route.ts:598-612) | No sync to devices; fetched through the share API only. | Deleted on revoke (delete statement) and when the chat is deleted through sync; expired rows are hidden by the reader but a purge job was not found. (apps/web/app/api/share/[token]/route.ts:126; apps/web/lib/services/shared-session-revocation.ts:12-22) |
| Workspace grant | table organization_shared_sessions | No | Dropped when audience returns to public (apps/web/app/api/share/[token]/route.ts:159-166). |
| Audit events share_link_created, share_link_updated, share_link_revoked, secret_detected | security audit log (recordAuditEvent) | No | Retention not established in the files read (unknown). |

**Models and providers.** No model is called to share. The copy records the last assistant row's model id and provider label from stored messages, which the reader page shows. (apps/web/app/api/share/route.ts:365-372; apps/web/app/share/[token]/page.tsx:66-75)

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed in with a cloud account for create, list, refresh, revoke. Readers of public links need no account; workspace-only links need a signed-in workspace member. (apps/web/app/api/share/route.ts:556; apps/web/app/share/[token]/page.tsx:28-48) |
| Permissions | Owner only for refresh, list, revoke (owner_id filters). Workspace-only needs 'content.share'. Public links obey the workspace external-sharing policy. (apps/web/app/api/share/[token]/route.ts:126,217-230) |
| Subscription | No plan entitlement check found in the share routes (none found in the code). Limited by rate limits 'share-create' and 'share-create-account-day'. (apps/web/app/api/share/route.ts:554-563) |
| Limits and metering | Up to 2000 messages and 1,000,000 serialized characters per share; list returns up to 200; expiry 1, 7 or 30 days. Not metered against plan usage. (apps/web/app/api/share/route.ts:60-61,77-83) |
| Feature flags | None found in the share routes. |
| Model compatibility | Model independent; any model's answers can be shared. [inferred] |
| Provider restrictions | None found; the provider label is copied as text. |
| Local mode | Not available: only saved Cloud conversations in web_conversations can be shared; Local-only chats have no server copy. (apps/web/app/api/share/route.ts:171-181) |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Unsaved chat | Validation error telling the person to turn on sync. | apps/web/app/api/share/route.ts:203-204,574 |
| Temporary chat | Conflict refusal; the web hook also blocks it first. | apps/web/app/api/share/route.ts:185-187; apps/web/features/chat/hooks/use-share-conversation.ts:504 |
| Snapshot differs from stored chat | 409 conflict, logged as warning, no row. | apps/web/app/api/share/route.ts:355-364 |
| Credential cannot be removed | Share refused with a message to remove it. | apps/web/app/api/share/route.ts:299-309 |
| Expired | Page not found; API 410; refresh says link expired, create a new link. | apps/web/app/share/[token]/page.tsx:109; apps/web/app/api/share/[token]/route.ts:71-82; apps/web/app/api/share/route.ts:384-390 |
| Revoke by someone who only holds the link | 404; the caller is not told it worked. | apps/web/app/api/share/[token]/route.ts:134-138 |
| List too long | complete=false and a notice that older links may be missing (CLI and mobile show it). | apps/web/app/api/share/route.ts:790-795; apps/cli/src/cloud/shares.rs:46 |
| Offline | Not handled in the code for creating a share; it is a server call. Offline handling not searched in the clients (unknown). | none |
| Accessibility | Link field has aria-label 'Conversation link'; mobile buttons have accessibility labels. | ShareConversationDialog.tsx:303; apps/mobile/app/(app)/settings/shared-links.tsx:451-464 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/share/route.test.ts`: Create, list and revoke-all route behaviour.
- `apps/web/app/api/share/archive-policy.test.ts`: Share route with archive policy (file exists; exact cases not read).
- `apps/web/app/api/share/[token]/route.test.ts`: Token read and revoke.
- `apps/web/app/api/share/[token]/route.visibility.test.ts`: Audience change.
- `apps/web/__tests__/single-conversation-share-backend.test.ts`: Share backend for one conversation.
- `apps/web/__tests__/security/public-token-entropy.test.ts`: Token randomness.
- `apps/web/lib/services/__tests__/external-sharing-gate.test.ts`: External sharing policy gate.
- `apps/web/features/chat/components/share/ShareConversationDialog.test.tsx`: Dialog behaviour.
- `apps/web/features/chat/hooks/use-share-conversation.test.ts`: Hook behaviour.
- `apps/mobile/__tests__/SharedLinksScreen.test.tsx`: Mobile Shared Links screen.
- `apps/desktop/src/services/__tests__/desktopCloudShares.test.ts`: Tauri desktop share client.
- `apps/desktop/wdio/specs/cloud-share-revoke.spec.ts`: Desktop share revoke end-to-end spec (file exists; not run here).

**Test scenarios**

- **Create and read**
  1. Sign in on Web, open a saved chat, choose Share, keep 7 days, Create public link.
  2. Open the URL in a private window.
  - Expected: Transcript is readable without sign-in; the dialog states the expiry date.
- **Unsynced edit**
  1. Make a new message while offline or before it is saved, then try to share.
  - Expected: Refusal copy about unsaved changes; no link appears in Shared Links.
- **Workspace-only**
  1. In a workspace chat, set 'Who can open this' to 'Everyone in this workspace'.
  2. Open the link signed out and as a member.
  - Expected: Signed out sees not found; member reads it; the URL is unchanged after switching back to public.
- **Revoke**
  1. Create two links to one chat.
  2. Choose 'Revoke all 2 links'.
  3. Open both URLs.
  - Expected: Both show not found.
- **Path and secret removal**
  1. Share a chat whose tool call shows ~/project/file.ts and a fake API key pattern.
  - Expected: Shared copy shows [local-path] and redacted secret, or the share is refused.
- **Tauri desktop create**
  1. In the internal Tauri shell in Managed Cloud mode choose share.
  - Expected: Unknown; static reading predicts a refusal because conversation_id is not sent. Run to confirm.

**Where to look when it fails**

- Log '[share] snapshot does not match the stored conversation; refusing to publish'.
- Log 'Failed to create shared session'.
- Audit events share_link_created/updated/revoked and secret_detected.
- Table shared_sessions (expires_at, visibility) and organization_shared_sessions.
- Rate-limit buckets 'share-create', 'share-create-account-day', 'share-view'.

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **Tauri desktop share client omits conversation_id and the server requires it** Affects: Internal Tauri desktop shell users in Managed Cloud mode. Evidence: apps/desktop/src/services/desktopCloudShares.ts:14-19 vs apps/web/app/api/share/route.ts:574. Work needed: Pass the saved conversation id, or route the shell to the Web dialog; verify by running.
- **Mobile and Chrome cannot choose expiry or audience, cannot update a link** Affects: Mobile and Chrome users. Evidence: apps/mobile/src/features/shared-links/service.ts:105-122; apps/extension/src/features/cloud-bridge/shareClient.ts:70-84. Work needed: Add controls that call the same contract fields.
- **No purge of expired shared_sessions rows found** Affects: Data retention. Evidence: readers only hide expired rows (apps/web/app/share/[token]/page.tsx:78-80). Work needed: Confirm whether a cron job exists; if not, add one.
- **Brief says 'expiry is set in days'; code limits the choice to 1/7/30** Affects: Anyone wanting a custom expiry. Evidence: apps/web/app/api/share/route.ts:77-83. Work needed: Decide if fixed options are the requirement; update the brief if so.
- **CLI and VS Code have no create or visibility control** Affects: CLI and VS Code users. Evidence: apps/cli/src/cloud/shares.rs:31-46. Work needed: Parity decision per the product parity program.

**Depends on**

- surface:web
- surface:mobile
- surface:cli
- surface:chrome
- surface:desktop
- mode:cloud
- table:shared_sessions
- table:organization_shared_sessions
- table:web_conversations
- table:web_messages
- api:POST /api/share
- api:PATCH /api/share/[token]
- SYS-authentication-and-identity
- SYS-authorization-and-workspaces
- SYS-security-and-privacy
- SYS-data-model-and-migrations
- F090-10

## Unknown

- Whether any job purges expired shared_sessions rows.
- Whether Local-only chats on Mobile or Desktop can reach any share path (none found).
- Audit event retention period.
- Which app screens offer Share on VS Code (none found, not searched exhaustively).
- Whether the Tauri desktop create call is refused in practice (not run).

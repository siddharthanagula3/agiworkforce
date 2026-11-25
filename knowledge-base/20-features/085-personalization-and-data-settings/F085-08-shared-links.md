---
id: "F085-08"
type: "feature"
title: "Shared links"
aliases: ["Shared links", "Shared Links (mobile screen title)", "Published pages", "agi shares", "Revoke link", "S85.19"]
area: "85 Personalization and data settings"
available_on: ["web", "desktop", "mobile", "cli"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "built", vscode: "missing", chrome: "missing"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S85.19"]
depends_on: ["SYS-api-and-contracts", "SYS-authentication-and-identity", "SYS-security-and-privacy", "SYS-files-artifacts-and-storage", "table:shared_sessions", "api:GET /api/share", "api:DELETE /api/share/[token]", "surface:web", "surface:desktop", "surface:mobile", "surface:cli", "mode:cloud", "F085-07"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F085-08 Shared links

A person can list the public or workspace-only links they created for chats, see when each expires, copy or open them, and revoke any of them. Web, Desktop, Mobile and the CLI have this. VS Code and Chrome do not. Revoking deletes the share record so the link stops working.

Area: [85. Personalization and data settings](README.md). Requirement items: [S85.19](../../10-requirements/capabilities/085-personalization-and-data-settings.md#s8519).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | built | built | not seen by a person |
| CLI | built | built | not seen by a person |
| VS Code | not built | not built | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Lists the account's chat share links (title, audience, expiry) and lets the person turn a link off. On Web it also lists published pages and lets the person unpublish them (apps/web/features/settings/sections/SharedLinksSection.tsx:173; PublishedArtifactsSection.tsx).

**Why it exists.** A share link is public to anyone who has it, so the owner needs one place to see and withdraw them. The product definition lists 'shared chats' under privacy settings (doc: docs/product/definition.md:283).

**Who uses it.** Any signed-in person who has shared a chat, on Web, Desktop (hosted web), Mobile and CLI.

**Problems it solves**

- Forgetting which chats were shared.
- Needing to cut off access after sharing by mistake.
- Seeing which links have expired.

**Use cases**

- Web: open Settings > Shared links and press Revoke on an old link.
- Mobile: open Settings > Shared Links and revoke a link, with a confirmation alert.
- CLI: run `agi shares` to list and `agi shares revoke <token>`.
- Deleting a chat also removes its links, so the list stays accurate.

## 2. User experience

**Where to find it**

- Web and Desktop: Settings > Shared links (page heading 'Shared links', subtitle 'Links and pages you have shared.') (apps/web/features/settings/sections/SharedLinksSection.tsx:306-310).
- Mobile: Settings > Shared Links (screen title constant 'Shared Links') (apps/mobile/src/features/settings/screenTitles.ts:3; apps/mobile/app/(app)/settings/shared-links.tsx:303).
- CLI: `agi shares` and `agi shares revoke <token> [--yes]` (apps/cli/src/lib.rs:1023-1027, :1263-1273, :7349-7378).
- VS Code and Chrome: not available. Chrome can create a share link but has no list or revoke (apps/extension/src/features/cloud-bridge/shareClient.ts:11).

**Before you start**

- Signed in to a Cloud account on every app.
- CLI uses account privacy mode and needs a connection to the account (apps/cli/src/lib.rs:7350-7352).

**Screens and controls**

- Web rows show title, audience, 'Expires <date>' or 'Expired', with Open, Copy and Revoke buttons (SharedLinksSection.tsx:421, :105-132 relative; handleCopy at :190).
- Web revoke dialog 'Revoke this public link?' with text 'Anyone using the link for “<title>” will immediately lose access. This cannot be undone.' and button 'Revoke link' (SharedLinksSection.tsx:479-497).
- Mobile alert 'Revoke this link?' with button 'Revoke' (apps/mobile/app/(app)/settings/shared-links.tsx:217-236).
- CLI confirmation text 'Revoke shared link <token>? Anyone who has it can no longer open the conversation. A new share gets a new link.' (apps/cli/src/lib.rs:7361-7366).

**Journey**

1. Open the list; the app fetches GET /api/share.
2. Read each link; expired ones are marked.
3. Press Revoke; confirm in the dialog or alert.
4. The app sends DELETE /api/share/<token>.
5. On success the row disappears and a notice says 'Revoked the link for “<title>”.' (SharedLinksSection.tsx:261).

**What the person sees and gets**

- Web notices 'Copied the link for “<title>”.' and 'Revoked the link for “<title>”.' (SharedLinksSection.tsx:211, :261).
- Web error 'Could not confirm whether the link was revoked. Reload the list to check.' (SharedLinksSection.tsx:271).
- Incomplete list note: 'This list may be incomplete. Links not shown may still work.' (SharedLinksSection.tsx:~350).
- CLI prints 'Revoked shared link <token>.' or 'Left the link on.' (apps/cli/src/lib.rs:7367-7373).

**Settings**

- Link audience (public or organization) is changed from the share dialog, not from this list; the server supports PATCH on the token (apps/web/app/api/share/[token]/route.ts:168-258).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- GET /api/share lists the owner's links, newest first, up to 200, with a 'complete' flag (apps/web/app/api/share/route.ts:64, :753-785).
- DELETE /api/share/<token> deletes the row where token and owner match, returns 404 for anyone else, and records a share_link_revoked audit event (apps/web/app/api/share/[token]/route.ts:100-146).
- Web list, copy, open, revoke with identity and workspace safety (apps/web/features/settings/sections/SharedLinksSection.tsx).
- Mobile fetch and revoke (apps/mobile/src/features/shared-links/service.ts:68-97).
- CLI list and revoke with sanitised terminal output and an 'incomplete' notice (apps/cli/src/cloud/shares.rs:29-80).
- Deleting a chat deletes its shares (apps/web/lib/services/shared-session-revocation.ts:11-23).
- Web also lists published pages with unpublish and version history (apps/web/features/settings/sections/PublishedArtifactsSection.tsx:1-60).

**Incomplete**

- The list is capped at 200 links; beyond that the page says the list may be incomplete (apps/web/app/api/share/route.ts:64, :780).
- The CLI list does not show the model or provider fields the server returns (apps/cli/src/cloud/shares.rs:7-20).

**Present but disconnected or switched off**

- none found in the code.

**Not available**

- VS Code: no list or revoke (no code found; brief says missing).
- Chrome: no list or revoke; only creating a link exists (apps/extension/src/features/cloud-bridge/shareClient.ts).

## 4. Required behaviour

**Established requirements**

- The user can list the chat links and published pages they shared and revoke any of them. (source: S85.19 (brief))
- The list comes from the account's shares through the conversation data service. (source: S85.19 (brief); apps/web/features/settings/services/conversation-data-service.ts:265-281)
- Revoking a link stops the link working: the share row is deleted and a caller who only holds the link cannot revoke it. (source: apps/web/app/api/share/[token]/route.ts:122-137)
- Shared chats are named in the privacy settings requirements. (source: docs/product/definition.md:283)

**Acceptance criteria**

1. The list shows every link owned by the account (up to 200) with title, audience and expiry.
2. Expired links are labelled Expired.
3. Revoke asks first and the text says anyone with the link loses access.
4. After revoke, opening the old URL does not show the chat.
5. Revoking a token owned by someone else returns not found and changes nothing.
6. If the list may be incomplete, the app says so and an empty list is not shown as proof that nothing is shared.
7. Deleting a shared chat makes its link stop working.
8. CLI `agi shares revoke <token>` without --yes asks first.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Desktop uses the hosted web page [inferred from AGENTS.md section 5].
- The revoke route has CSRF protection but no rate limit call was seen in the file portion read [inferred; see unknowns].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add a Shared links list to VS Code and Chrome, or link them to the web page.
- [proposed] Page the list past 200 links.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| endpoint | GET /api/share | `apps/web/app/api/share/route.ts` | Lists the owner's share links (handleListShares). |
| endpoint | DELETE /api/share/[token] | `apps/web/app/api/share/[token]/route.ts` | Revokes one link and records an audit event. |
| endpoint | DELETE /api/share?conversation_id= | `apps/web/app/api/share/route.ts` | Revokes all live links of one chat (handleRevokeConversationShares, lines 805-835). |
| schema | conversation-shares contract | `packages/contracts/cloud-contracts/src/conversation-shares.ts` | Zod schemas and path helpers shared by Web, Mobile and CLI. |
| service | conversation-data-service (shares) | `apps/web/features/settings/services/conversation-data-service.ts` | listSharedLinks and revokeSharedLink (lines 265-303). |
| component | SharedLinksSection | `apps/web/features/settings/sections/SharedLinksSection.tsx` | Web list, copy, open, revoke. |
| component | PublishedArtifactsSection | `apps/web/features/settings/sections/PublishedArtifactsSection.tsx` | Published pages list with unpublish. |
| service | shared-session-revocation | `apps/web/lib/services/shared-session-revocation.ts` | Removes shares of deleted chats. |
| table | shared_sessions | `apps/web/app/api/share/[token]/route.ts` | Share rows with token, owner_id, expires_at, visibility. |
| service | mobile shared-links service | `apps/mobile/src/features/shared-links/service.ts` | fetchSharedLinks, revokeSharedLink, createSharedLink. |
| screen | Mobile Shared Links | `apps/mobile/app/(app)/settings/shared-links.tsx` | Mobile list and revoke alert. |
| service | CLI shares client | `apps/cli/src/cloud/shares.rs` | list, revoke, render. |
| command | agi shares | `apps/cli/src/lib.rs` | Command wiring (lines 1023-1027, 7349-7378). |
| service | Chrome shareClient | `apps/extension/src/features/cloud-bridge/shareClient.ts` | Creates share links only. |
| test | SharedLinksSection identity test | `apps/web/features/settings/sections/SharedLinksSection.identity.test.tsx` | Ownership safety. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| App requests the list from GET /api/share with the user's session. | our servers | apps/web/app/api/share/route.ts:753-785 |
| Person confirms revoke; the app sends DELETE /api/share/<token> with a CSRF token (Web) or bearer token (Mobile, CLI). | device and our servers | conversation-data-service.ts:283-303; apps/cli/src/cloud/shares.rs:33-42 |
| Server deletes the shared_sessions row where token and owner match; 404 if none. | our servers | apps/web/app/api/share/[token]/route.ts:122-137 |
| Server writes an audit event share_link_revoked (failure only logged). | our servers | [token]/route.ts:139-152 |
| The anonymous page for the token no longer finds the row and shows not found. | our servers | [token]/route.ts:55-98 (GET reads the row) [inferred] |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Share row (token, title, model, provider, message count, visibility, expiry) | table shared_sessions | Server only; every app reads it from the server | Deleted on revoke or when the chat is deleted; links also expire (expires_at) |
| Audit event share_link_revoked | security audit log | Server only | Per audit retention (purge-security-audit-logs cron exists); exact period unknown |

**Models and providers.** The row records the model and provider used by the chat for display only; no model call happens.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in account required on all apps (getClerkAuthUser in apps/web/app/api/share/route.ts:753-760). |
| Permissions | Only the owner (owner_id) can list or revoke a link (route.ts:770; [token]/route.ts:126). |
| Subscription | none found in the code for listing or revoking. Creating organization-audience links may depend on workspace membership (route.ts:535-548). |
| Limits and metering | List uses rate bucket 'share-view' (route.ts:754). Revoke by token has CSRF but no rate-limit call seen in handleDeleteShare. List cap 200. |
| Feature flags | none found in the code. |
| Model compatibility | Not model dependent. |
| Provider restrictions | none found in the code. |
| Local mode | Local chats are not shared through the server, so there is nothing to list; Mobile Local mode needs Cloud sign-in to see Shared Links [inferred]. No payment needed to revoke. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading | Spinner or loading state while the list is read. | SharedLinksSection.tsx:118-126 |
| Empty and complete | 'No shared links'. | SharedLinksSection.tsx:370-376 |
| Empty but incomplete | 'No shared links shown' with 'An empty list does not confirm that all shared links have been revoked.' | SharedLinksSection.tsx:370-376 |
| Load failure | Error text and Retry button. | SharedLinksSection.tsx:316-329 |
| Expired link | Shown as 'Expired'; can still be revoked. | SharedLinksSection.tsx:421; apps/web/app/api/share/route.ts:788 |
| Revoke dispatched but result unknown | Message asks the person to reload the list. | SharedLinksSection.tsx:270-272 |
| Clipboard blocked | Error says to open the link and copy from the address bar. | SharedLinksSection.tsx:193-198 |
| Session or account switch | Lane is retired; results dropped. | SharedLinksSection.tsx:150-173 |
| CLI incomplete list | Prints the incomplete notice. | apps/cli/src/cloud/shares.rs:40-70 |
| Offline | not handled in the code beyond a generic load error. | SharedLinksSection.tsx:132-141 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/settings/sections/SharedLinksSection.identity.test.tsx`: Web list identity and ownership.
- `apps/web/app/api/share/route.test.ts`: Share list and create route.
- `apps/web/app/api/share/[token]/route.test.ts`: Token read and revoke.
- `apps/web/app/api/share/[token]/route.visibility.test.ts`: Audience changes.
- `apps/mobile/__tests__/SharedLinksScreen.test.tsx`: Mobile screen.
- `apps/mobile/__tests__/SharedLinks.test.tsx`: Mobile service.
- `apps/mobile/__tests__/SharedLinksHonesty.test.tsx`: Honest incomplete and empty copy.
- `apps/cli/src/cloud/shares.rs`: Inline Rust tests for render of complete and incomplete lists.

**Test scenarios**

- **Revoke on Web**
  1. Share a chat and copy the URL.
  2. Open Settings > Shared links, Revoke, confirm.
  3. Open the URL in a private window.
  - Expected: Row removed, notice shown, URL no longer shows the chat.
- **Foreign token**
  1. Call DELETE /api/share/<token> as another account.
  - Expected: 404 and the link still works.
- **Incomplete list**
  1. Create more than 200 links in a test account.
  2. Open the list.
  - Expected: Note that the list may be incomplete; empty-state wording is cautious.
- **CLI revoke**
  1. Run `agi shares`.
  2. Run `agi shares revoke <token>` and answer no, then yes.
  - Expected: 'Left the link on.' then 'Revoked shared link <token>.'
- **Chat deletion**
  1. Share a chat, delete the chat.
  2. List shares.
  - Expected: The link is gone.

**Where to look when it fails**

- Log 'Failed to revoke shared session' (apps/web/app/api/share/[token]/route.ts:131).
- Audit events share_link_revoked.
- Table shared_sessions.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/085-personalization-and-data-settings.md](../../70-qa/test-plans/web/085-personalization-and-data-settings.md)
- Desktop: [70-qa/test-plans/desktop/085-personalization-and-data-settings.md](../../70-qa/test-plans/desktop/085-personalization-and-data-settings.md)
- Mobile: [70-qa/test-plans/mobile/085-personalization-and-data-settings.md](../../70-qa/test-plans/mobile/085-personalization-and-data-settings.md)
- CLI: [70-qa/test-plans/cli/085-personalization-and-data-settings.md](../../70-qa/test-plans/cli/085-personalization-and-data-settings.md)

## 10. Gaps and dependencies

- **VS Code has no way to see or revoke links.** Affects: VS Code users who share chats.. Evidence: Brief S85.19 status missing.. Work needed: Add a command that lists links or opens the web page.
- **Chrome can create links but cannot list or revoke them.** Affects: Chrome users.. Evidence: apps/extension/src/features/cloud-bridge/shareClient.ts:11 (create only).. Work needed: Add list and revoke or link to web settings.
- **Link list is capped at 200 with no paging.** Affects: Heavy sharers on every app.. Evidence: apps/web/app/api/share/route.ts:64, :780. Work needed: Add cursor paging.
- **No rate limit seen on the revoke-by-token route.** Affects: Server abuse protection.. Evidence: apps/web/app/api/share/[token]/route.ts:100-137. Work needed: Check the gateway policy; add withRateLimit if absent.
- Not built on: VS Code, Chrome (from the capability ledger).

**Depends on**

- SYS-api-and-contracts
- SYS-authentication-and-identity
- SYS-security-and-privacy
- SYS-files-artifacts-and-storage
- table:shared_sessions
- api:GET /api/share
- api:DELETE /api/share/[token]
- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- mode:cloud
- F085-07

## Unknown

- Whether the gateway applies a rate limit to DELETE /api/share/[token].
- How long audit events are kept.
- Whether the Desktop window adds any behaviour beyond the hosted web page.
- Mobile Shared Links screen behaviour in Local mode was not read in detail.

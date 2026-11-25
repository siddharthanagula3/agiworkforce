---
id: "F090-12"
type: "feature"
title: "Opening a link to a chat or item"
aliases: ["Product link", "/open/<type>/<id>", "Deep link", "ProductLinkUnavailable", "resolveProductLink", "S90.20"]
area: "90 Conversation and synchronization components"
available_on: []
implementation: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S90.20"]
depends_on: ["surface:web", "surface:mobile", "surface:desktop", "surface:chrome", "table:web_conversations", "table:cloud_agent_runs", "table:research_reports", "table:scheduled_tasks", "table:media_assets", "SYS-authentication-and-identity", "SYS-authorization-and-workspaces", "SYS-api-and-contracts", "F090-11"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F090-12 Opening a link to a chat or item

A link of the form /open/<type>/<id> opens a chat, run, research report, schedule, file or artifact. A signed-out visitor goes to sign-in and comes back. The server checks ownership and answers ready, not found, deleted, expired or unauthorized. Notifications and Slack use these links.

Area: [90. Conversation and synchronization components](README.md). Requirement items: [S90.20](../../10-requirements/capabilities/090-conversation-and-synchronization-components.md#s9020).

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

**What it does.** Resolves a stable web link for seven target types (chat, file, artifact, work, research, schedule, browser-task) into the real screen address, or shows a clear message when it cannot. (packages/contracts/types/src/product-links.ts:1-9; apps/web/lib/services/product-link-resolver.ts:188-209)

**Why it exists.** Notifications, emails and other apps need one address that works on any device and tells the person why it fails. The brief requires login redirect and not-found, deleted and unauthorized states (brief S90.20).

**Who uses it.** Anyone who follows a link from a notification, Slack message, phone or desktop. (apps/web/features/notifications/lib/notification-target.ts:28-41; apps/web/lib/slack/slack-tasks.ts; apps/mobile/src/features/notifications/productLinks.ts)

**Problems it solves**

- Dead links with no explanation.
- Opening the wrong account's item silently.
- Different link formats per app.

**Use cases**

- Tap a push on the phone and land on the run.
- Open an emailed link on a laptop that is signed out; sign in, then arrive at the item.
- Follow a link to a deleted chat and read 'This chat was deleted'.
- Desktop opens the same link on the web for target types it cannot show.

## 2. User experience

**Where to find it**

- Web: route /open/<target>/<id>, title 'Opening link'. (apps/web/app/open/[target]/[id]/page.tsx:11-14)
- Mobile: Android intent filter for https agiworkforce.com /open/ paths and iOS associated domains. (apps/mobile/app.config.js:132-133,351)
- Desktop (Tauri shell): opens unknown targets on the web via productLinkUrl. (apps/desktop/src/lib/desktopDeepLinkRouter.ts:42-45)
- Chrome side panel builds chat links with productLinkPath. (apps/extension/src/side_panel.ts:12762)

**Before you start**

- A well-formed target and id (letters, digits, dot, underscore, colon, hyphen; up to 128 characters). (packages/contracts/types/src/product-links.ts:29-43)
- Signed in to the account that owns the item.

**Screens and controls**

- Unavailable screen with a title, a sentence and one button: 'Back to chats', 'Open Library', 'Open Work history' or 'Open Scheduled'. (apps/web/features/notifications/components/ProductLinkUnavailable.tsx:14-22,56-80)

**Journey**

1. Person opens /open/chat/<uuid>.
2. If signed out, they go to /login with redirectTo set to the link.
3. After sign-in the server looks up the item for their account in their personal scope.
4. If ready, they are redirected to the real page, for example /chat/<id> or /tasks?run=<id>.
5. Otherwise the unavailable screen explains the state.

**What the person sees and gets**

- Titles: 'This <thing> was deleted', 'This <thing> has ended', 'You don’t have access to this', 'This <thing> isn’t available'. (ProductLinkUnavailable.tsx:30-52)

**Settings**

- None found.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Malformed target or id returns the not-found page. (apps/web/app/open/[target]/[id]/page.tsx:28-31)
- Signed out: redirect to /login?redirectTo=<link>. (page.tsx:33-36)
- Resolver by target: chat (temporary is not found, deleted is deleted), work and browser-task (runs; browser-task must be from Chrome), research (via its conversation), schedule (expired state), file and artifact (media assets, deleted state). (apps/web/lib/services/product-link-resolver.ts:50-186)
- A link to an item owned by someone else, or in another workspace, reads as unauthorized; otherwise not found. (product-link-resolver.ts:33-44)
- Ready results redirect to /chat/<id>, /tasks?run=<id>, /chat/schedules?schedule=<id>, or /chat/library?item=<id>. (product-link-resolver.ts:46-48,90,148,185)
- Mobile maps links to native routes behind feature flags, and the Desktop shell opens others on the web. (apps/mobile/src/features/notifications/productLinks.ts:12-47; apps/desktop/src/lib/desktopDeepLinkRouter.ts:42-45)

**Incomplete**

- The page reads only the Personal workspace (organizationId null), so a workspace-owned item may show 'unauthorized' for a member. (apps/web/app/open/[target]/[id]/page.tsx:38-43; product-link-resolver.ts:33-44) [inferred]
- The 'expired' state is only produced by schedules; no other target yields it. (product-link-resolver.ts:140-145)

**Present but disconnected or switched off**

- Mobile ignores a link whose feature flag is off. (apps/mobile/src/features/notifications/productLinks.ts:49-53)

**Not available**

- CLI and VS Code: no product-link handling found.
- Local mode items (Local chats) have no server record, so a link cannot resolve them. [inferred]

## 4. Required behaviour

**Established requirements**

- A stable link resolves to the right screen with login redirect and not-found, deleted and unauthorized states. (source: brief S90.20)
- A temporary chat is reported as not found. (source: apps/web/lib/services/product-link-resolver.ts:88)
- A deleted chat is reported as deleted. (source: apps/web/lib/services/product-link-resolver.ts:89)
- A link to an item of another account is unauthorized rather than not found. (source: apps/web/lib/services/product-link-resolver.ts:41-43)
- The link format is shared from one contract file. (source: packages/contracts/types/src/product-links.ts:45-66)

**Acceptance criteria**

1. A well-formed chat link of the signed-in owner redirects to /chat/<id>.
2. The same link signed out goes to /login with the link as redirectTo, and after sign-in arrives at the chat.
3. A link with an unknown type or an id with spaces shows the not-found page.
4. A temporary chat link shows 'isn’t available'.
5. A deleted chat link shows 'was deleted'.
6. A link to another account's run shows 'You don’t have access to this'.
7. An expired schedule link shows 'has ended'.
8. A browser-task link to a run that did not start in Chrome shows not available.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Workspace members following a link to a workspace chat should reach it; the page's personal-scope read may block this. [inferred]
- The link should work from every app that can show the item or fall back to the web. [inferred]

**Proposed improvements** (suggestions, not requirements)

- [proposed] Resolve in the workspace named by the link or the member's active workspace.
- [proposed] Add handlers in CLI and VS Code that open the web link.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| screen | /open/[target]/[id] | `apps/web/app/open/[target]/[id]/page.tsx` | Validate, redirect to sign-in, resolve, redirect or show message. |
| service | resolveProductLink | `apps/web/lib/services/product-link-resolver.ts` | Ownership and state decision per target. |
| component | ProductLinkUnavailable | `apps/web/features/notifications/components/ProductLinkUnavailable.tsx` | Messages and return buttons. |
| schema | product-links | `packages/contracts/types/src/product-links.ts` | Targets, id rule, path builders, parser. |
| config | notification-target | `apps/web/features/notifications/lib/notification-target.ts` | Feed targets to links. |
| service | desktop deep links (web) | `apps/web/features/desktop-host/lib/deep-links.ts` | Maps desktop deep links to product link paths. |
| service | desktopDeepLinkRouter | `apps/desktop/src/lib/desktopDeepLinkRouter.ts` | Tauri desktop routing and web fallback. |
| service | mobile productLinks | `apps/mobile/src/features/notifications/productLinks.ts` | Map links to native routes. |
| service | mobile productLinkHistory | `apps/mobile/src/features/notifications/productLinkHistory.ts` | History sync for chat links. |
| config | mobile app config | `apps/mobile/app.config.js` | Android intent filter and iOS associated domain. |
| service | Slack task links | `apps/web/lib/slack/slack-tasks.ts` | Builds product links in Slack messages. |
| table | web_conversations | `apps/web/lib/services/product-link-resolver.ts` | Chat lookup. |
| table | cloud_agent_runs | `apps/web/lib/services/product-link-resolver.ts` | Work and browser-task lookup. |
| table | research_reports | `apps/web/lib/services/product-link-resolver.ts` | Research lookup. |
| table | scheduled_tasks | `apps/web/lib/services/product-link-resolver.ts` | Schedule lookup. |
| table | media_assets | `apps/web/lib/services/product-link-resolver.ts` | File and artifact lookup. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Page validates target and id. | our servers | apps/web/app/open/[target]/[id]/page.tsx:28-31 |
| Signed-out visitor is redirected to sign-in with a return address. | our servers | page.tsx:33-36 |
| Resolver reads the item scoped to the user. | our servers | product-link-resolver.ts:188-209 |
| If the item is missing for the user, a second unscoped read decides unauthorized or not found. | our servers | product-link-resolver.ts:33-44 |
| Ready: redirect; other states: render message. | our servers | page.tsx:44-50 |
| On the phone, an installed app takes the link by intent filter or associated domain. | device | apps/mobile/app.config.js:132-133,351 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| No data is created; reads only. | Existing tables listed above | n/a | n/a |

**Models and providers.** None.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in account required for any result besides the sign-in redirect. (page.tsx:33-36) |
| Permissions | Owner within the personal scope only (user id and organization null). (page.tsx:38-43; product-link-resolver.ts:55-62) |
| Subscription | No entitlement check (none found in the code). |
| Limits and metering | None found. |
| Feature flags | Mobile native routing uses FEATURES flags per target. (apps/mobile/src/features/notifications/productLinks.ts:13-33) |
| Model compatibility | Not applicable. |
| Provider restrictions | Not applicable. |
| Local mode | A Local chat has no server row and cannot be opened by link. [inferred] Opening the link needs an account and network. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Malformed id or type | Not found page. | page.tsx:31 |
| Signed out | Redirect to sign-in with return. | page.tsx:33-36 |
| Id is not a UUID | not_found. | product-link-resolver.ts:194 |
| Other account's item | unauthorized. | product-link-resolver.ts:41-43 |
| Temporary chat | not_found. | product-link-resolver.ts:88 |
| Deleted chat, file or research conversation | deleted; file copy mentions Recently deleted in Library. | product-link-resolver.ts:89,116,175; ProductLinkUnavailable.tsx:30-37 |
| Expired schedule | expired. | product-link-resolver.ts:140-145 |
| Database error | Not handled in the page code reviewed (no catch around the resolver). | page.tsx:39-43 |
| Accessibility | Button uses focus ring and a 44 px touch size on coarse pointers; section carries data-state for tests. | ProductLinkUnavailable.tsx:66-76 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/lib/services/__tests__/product-link-resolver.test.ts`: Resolver outcomes.
- `apps/web/features/notifications/components/ProductLinkUnavailable.test.tsx`: Unavailable messages.
- `packages/contracts/types/src/__tests__/product-links.test.ts`: Link parsing and building.
- `apps/mobile/__tests__/product-links.test.ts`: Mobile native mapping.

**Test scenarios**

- **Owner opens chat link**
  1. Sign in, open /open/chat/<own chat id>.
  - Expected: Redirect to /chat/<id>.
- **Signed-out return**
  1. In a private window open the link, sign in.
  - Expected: After sign-in, the item opens.
- **Other account**
  1. Sign in as user B and open user A's run link.
  - Expected: 'You don’t have access to this'.
- **Deleted**
  1. Delete a chat, open its link.
  - Expected: 'This chat was deleted'.
- **Bad id**
  1. Open /open/chat/abc def.
  - Expected: Not found page.
- **Phone**
  1. Tap an agiworkforce.com /open/ link on a phone with the app.
  - Expected: App opens the matching native screen when its feature is on.

**Where to look when it fails**

- The unavailable section has data-testid 'product-link-unavailable' and data-state.
- Tables web_conversations, cloud_agent_runs, research_reports, scheduled_tasks, media_assets for the id.

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **Resolver reads Personal scope only; workspace items may read as unauthorized** Affects: Workspace members on Web. Evidence: apps/web/app/open/[target]/[id]/page.tsx:38. Work needed: Resolve against the member's workspaces; test.
- **No handler in CLI or VS Code** Affects: Those apps. Evidence: no usage of parseProductLinkPath there. Work needed: Open the web link.
- **Unauthorized vs not found leaks that an id exists** Affects: Privacy of ids. Evidence: product-link-resolver.ts:41-43 (accepted by the brief). Work needed: Confirm that this is wanted.

**Depends on**

- surface:web
- surface:mobile
- surface:desktop
- surface:chrome
- table:web_conversations
- table:cloud_agent_runs
- table:research_reports
- table:scheduled_tasks
- table:media_assets
- SYS-authentication-and-identity
- SYS-authorization-and-workspaces
- SYS-api-and-contracts
- F090-11

## Unknown

- Whether a signed-in workspace member can open a workspace chat link.
- Whether iOS universal links list the /open/ path in the site association file (not read).
- How Chrome side panel uses /open links beyond building chat links.
- Whether Electron Desktop handles /open links natively or only through the hosted page.
